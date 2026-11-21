// Cities & Knights: city improvements, metropolises and city walls.
// Only used when config.expansions.citiesKnights is on. State (created by initImprovements):
//   p.improve      { trade, politics, science }  level 0-5 of each track
//   p.wallsLeft    city walls still in the box (3)
//   s.walls        { [vertex]: pid }              a wall sits under a city
//   s.metropolis   { trade|politics|science: { owner, at } | null }
//   s.pendingAqueduct { [pid]: true }            players choosing their Aqueduct resource
//
// Rules (official):
//   - level k of a track costs k commodities of that track; you need at least one city
//   - level 3 abilities: trade -> commodities trade 2:1 with the bank; politics -> knights can be
//     promoted to mighty (knights step); science -> Aqueduct: a production roll (not a 7) that
//     gives you nothing lets you take 1 resource of your choice
//   - the first to reach level 4 of a track puts that track's metropolis on one of their cities
//     (+2 points); reaching level 5 while the holder is still on 4 takes it away
//   - levels 4-5 need a city free of metropolises (or already holding that track's metropolis)
//   - a city wall costs 2 brick, one per city, 3 per player; each one lets you keep 2 more cards on a 7
import { RES } from '../constants.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

export const TRACKS = ['trade', 'politics', 'science'];
export const TRACK_COMMODITY = { trade: 'cloth', politics: 'coin', science: 'paper' };
export const TRACK_INFO = {
  trade: { icon: '🟨', name: tk('Comercio'), ability: tk('Casa de comercio: cambias mercancías 2:1 con el banco.') },
  politics: { icon: '🟦', name: tk('Política'), ability: tk('Fortaleza: puedes ascender caballeros a poderosos.') },
  science: { icon: '🟩', name: tk('Ciencia'), ability: tk('Acueducto: si una tirada no te da nada, eliges 1 recurso.') },
};
export const MAX_LEVEL = 5;
export const ABILITY_LEVEL = 3;
export const METRO_LEVEL = 4;
export const METRO_VP = 2;
export const WALL_COST = { brick: 2 };
export const MAX_WALLS = 3;
export const WALL_HAND_BONUS = 2;

export function initImprovements(s) {
  for (const p of s.players) {
    p.improve = { trade: 0, politics: 0, science: 0 };
    p.wallsLeft = MAX_WALLS;
  }
  s.walls = {};
  s.metropolis = { trade: null, politics: null, science: null };
  s.pendingAqueduct = {};
}

const citiesOf = (s, pid) => Object.keys(s.buildings).map(Number).filter(v => s.buildings[v].owner === pid && s.buildings[v].type === 'city');
const metroAt = (s, v) => TRACKS.some(t => s.metropolis[t] && s.metropolis[t].at === v);
export const freeCities = (s, pid) => citiesOf(s, pid).filter(v => !metroAt(s, v));
export const hasAbility = (s, pid, track) => !!(s.players[pid].improve && s.players[pid].improve[track] >= ABILITY_LEVEL);
export const improveCost = (s, pid, track) => ({ [TRACK_COMMODITY[track]]: s.players[pid].improve[track] + 1 });

// Why `pid` can't buy the next level of `track` ('' = they can, apart from paying)
export function improveBlock(s, pid, track) {
  const p = s.players[pid];
  if (!p.improve || !TRACKS.includes(track)) return tk('Mejora desconocida.');
  const next = p.improve[track] + 1;
  if (next > MAX_LEVEL) return tk('Esa mejora ya está al máximo.');
  if (!citiesOf(s, pid).length) return tk('Necesitas una ciudad para mejorar.');
  if (next >= METRO_LEVEL) {
    const m = s.metropolis[track];
    if (!(m && m.owner === pid) && !freeCities(s, pid).length) return tk('Necesitas una ciudad sin metrópolis.');
  }
  return '';
}

// Does buying the next level hand `pid` this track's metropolis?
export function winsMetropolis(s, pid, track) {
  const next = s.players[pid].improve[track] + 1;
  const m = s.metropolis[track];
  if (m && m.owner === pid) return false;
  if (next === METRO_LEVEL) return !m;
  if (next === MAX_LEVEL) return !m || s.players[m.owner].improve[track] < MAX_LEVEL;
  return false;
}

// Buys the next level (the caller checks phase/turn). `at` is the city for a metropolis won now
// (default: the first free city). Returns { level, metro: at | null, from: previous owner | null }.
export function improve(s, pid, track, at, { fail, pay, canAfford }) {
  const block = improveBlock(s, pid, track);
  if (block) fail(block);
  const cost = improveCost(s, pid, track);
  if (!canAfford(s.players[pid].res, cost)) fail('Te faltan mercancías.');
  const metro = winsMetropolis(s, pid, track);
  if (metro) {
    const free = freeCities(s, pid);
    if (at == null) at = free[0];
    if (!free.includes(at)) fail('La metrópolis va en una de tus ciudades sin metrópolis.');
  }
  pay(cost);
  const p = s.players[pid];
  p.improve[track]++;
  let from = null;
  if (metro) {
    from = s.metropolis[track] ? s.metropolis[track].owner : null;
    s.metropolis[track] = { owner: pid, at };
  }
  return { level: p.improve[track], metro: metro ? at : null, from };
}

export const metropolisVP = (s, pid) => (s.metropolis ? TRACKS.filter(t => s.metropolis[t] && s.metropolis[t].owner === pid).length * METRO_VP : 0);

// ---- city walls ----
export function canBuildWall(s, pid, v) {
  const b = s.buildings[v];
  return !!(s.walls && b && b.owner === pid && b.type === 'city' && s.walls[v] === undefined && s.players[pid].wallsLeft > 0);
}
export const legalWalls = (s, pid) => (s.walls ? citiesOf(s, pid).filter(v => canBuildWall(s, pid, v)) : []);
export const wallBonus = (s, pid) => (s.walls ? Object.values(s.walls).filter(o => o === pid).length * WALL_HAND_BONUS : 0);

// ---- trading house: commodities 2:1 ----
export const commodityRatio = (s, pid) => (hasAbility(s, pid, 'trade') ? 2 : null);

// ---- aqueduct ----
// after a production roll: everyone with the Aqueduct who got nothing picks a resource
export function aqueductAfterRoll(s, gains) {
  s.pendingAqueduct = {};
  s.players.forEach((p, i) => {
    if (p.retired || !hasAbility(s, i, 'science')) return;
    const got = Object.values(gains[i] || {}).reduce((a, n) => a + n, 0);
    if (!got) s.pendingAqueduct[i] = true;
  });
  return Object.keys(s.pendingAqueduct).length > 0;
}
export const AQUEDUCT_RES = RES;
