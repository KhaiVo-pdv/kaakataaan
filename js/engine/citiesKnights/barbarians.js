// Cities & Knights barbarians: a ship sails towards Catan one step every time the event die shows
// the ship face. When it lands, all cities together (barbarian strength) fight all active knights
// together (Catan's strength).
//   s.barbarians   { pos, track, attacks, last }   pos 0..track; last = summary of the latest attack
//   p.defenderVP   "Defender of Catan" points (+1 each)
//   s.pillage      { [pid]: [city vertices] }      losers still choosing which city falls
// Only present when the expansion is on: the base game never has any of these.
import { activeStrength, knightsOf } from './knights.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

export const BARBARIAN_TRACK = 7;
export const DEFENDER_VP = 1;
export const BARBARIAN_NAME = tk('Bárbaros');

export function initBarbarians(s) {
  s.barbarians = { pos: 0, track: BARBARIAN_TRACK, attacks: 0, last: null };
  for (const p of s.players) p.defenderVP = 0;
  s.pillage = null;
}

const cityVerts = (s, pid) => Object.keys(s.buildings).map(Number).filter(v => s.buildings[v].owner === pid && s.buildings[v].type === 'city');
// a metropolis sits on a city and protects it from the barbarians
const isMetro = (s, v) => !!s.metropolis && Object.values(s.metropolis).some(m => m && m.at === v);
export const pillageable = (s, pid) => cityVerts(s, pid).filter(v => !isMetro(s, v));

// barbarian strength: every city on the board (metropolises included)
export const barbarianStrength = s => s.players.filter(p => !p.retired).reduce((n, p) => n + cityVerts(s, p.id).length, 0);
export const catanStrength = s => s.players.filter(p => !p.retired).reduce((n, p) => n + activeStrength(s, p.id), 0);

// before the first attack the robber stays put (7s still make people discard)
export const robberAsleep = s => !!s.barbarians && s.barbarians.attacks === 0;

// the event die rolled the ship: one step closer. Returns the attack result when it lands, else null.
export function advance(s) {
  const b = s.barbarians;
  b.pos++;
  if (b.pos < b.track) return null;
  return attack(s);
}

// resolve the attack. Returns { barb, catan, won, defender, tied, losers }.
export function attack(s) {
  const b = s.barbarians;
  const live = s.players.filter(p => !p.retired);
  const barb = barbarianStrength(s);
  const catan = catanStrength(s);
  const str = Object.fromEntries(live.map(p => [p.id, activeStrength(s, p.id)]));
  const res = { barb, catan, won: catan >= barb, defender: -1, tied: [], losers: [] };
  if (res.won) {
    // the strongest defender is rewarded: alone -> Defender of Catan; tied -> each one (progress card, later)
    const max = Math.max(0, ...live.map(p => str[p.id]));
    const top = max > 0 ? live.filter(p => str[p.id] === max).map(p => p.id) : [];
    if (top.length === 1) {
      res.defender = top[0];
      s.players[top[0]].defenderVP += DEFENDER_VP;
    } else res.tied = top;
  } else {
    // the weakest among those who still have a city the barbarians can take each lose one
    const exposed = live.filter(p => pillageable(s, p.id).length);
    const min = Math.min(...exposed.map(p => str[p.id]));
    res.losers = exposed.filter(p => str[p.id] === min).map(p => p.id);
    s.pillage = {};
    for (const pid of res.losers) {
      const opts = pillageable(s, pid);
      if (opts.length === 1) pillageCity(s, pid, opts[0]);
      else s.pillage[pid] = opts;
    }
    if (!Object.keys(s.pillage).length) s.pillage = null;
  }
  // after every attack the knights go home tired and the ship sails back
  for (const p of live) for (const v of knightsOf(s, p.id)) s.knights[v].active = false;
  b.pos = 0;
  b.attacks++;
  b.last = res;
  return res;
}

// a city falls back to a settlement; its wall is torn down
export function pillageCity(s, pid, v) {
  const p = s.players[pid];
  s.buildings[v] = { owner: pid, type: 'settlement' };
  p.citiesLeft++;
  p.settlementsLeft--; // may go below 0 when the box is empty: it heals when a settlement becomes a city again
  if (s.walls && s.walls[v] !== undefined) {
    delete s.walls[v];
    p.wallsLeft++;
  }
  if (s.pillage) delete s.pillage[pid];
}
