// Cities & Knights: knights. Only used when config.expansions.citiesKnights is on.
// State (created by initKnights):
//   s.knights        { [vertex]: { owner, level: 1|2|3, active, activatedTurn, promotedTurn, usedTurn } }
//   p.knightsLeft    { 1: n, 2: n, 3: n }   pieces of each strength still in the box (2 each)
//   s.displaced      { pid, level, active, options: [vertices] } | null  a knight pushed away,
//                    waiting for its owner to put it back (phase 'displace')
//
// Rules (official):
//   - recruit (1 wool + 1 ore): a basic knight, inactive, on an empty intersection touching your road
//   - promote (1 wool + 1 ore): basic -> strong -> mighty, once per turn per knight; mighty needs
//     politics level 3 (fortress)
//   - activate (1 grain). An active knight does one action per turn, then it is inactive again;
//     a knight activated this turn can't act yet:
//       move     along your roads to an empty intersection
//       displace a weaker rival knight on an intersection your roads reach; its owner moves it to an
//                empty intersection along their roads (if there is none, it goes back to the box)
//       chase    the robber off a tile next to the knight (then move it and steal, like a 7)
//   - a rival knight blocks your roads and settlements and cuts your longest road
import { hasAbility } from './improvements.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

export const KNIGHT_COST = { sheep: 1, ore: 1 };
export const ACTIVATE_COST = { wheat: 1 };
export const KNIGHTS_PER_LEVEL = 2;
export const KNIGHT_NAMES = { 1: tk('Caballero básico'), 2: tk('Caballero fuerte'), 3: tk('Caballero poderoso') };

export function initKnights(s) {
  s.knights = {};
  s.displaced = null;
  for (const p of s.players) p.knightsLeft = { 1: KNIGHTS_PER_LEVEL, 2: KNIGHTS_PER_LEVEL, 3: KNIGHTS_PER_LEVEL };
}

export const knightAt = (s, v) => (s.knights ? s.knights[v] : undefined);
const ownRoadAt = (s, pid, v) => s.board.vertices[v].edges.some(e => s.roads[e] === pid);
const emptyAt = (s, v) => !s.buildings[v] && !knightAt(s, v);
export const knightsOf = (s, pid) => (s.knights ? Object.keys(s.knights).map(Number).filter(v => s.knights[v].owner === pid) : []);

// a rival piece (building or knight) on v stops pid's roads there
export function blocksFor(s, pid, v) {
  const b = s.buildings[v], k = knightAt(s, v);
  return !!((b && b.owner !== pid) || (k && k.owner !== pid));
}

// intersections pid's roads reach from v (v excluded), walking only through free or own corners
function reachable(s, pid, from) {
  const seen = new Set([from]);
  const out = [];
  const stack = [from];
  while (stack.length) {
    const v = stack.pop();
    for (const e of s.board.vertices[v].edges) {
      if (s.roads[e] !== pid) continue;
      const E = s.board.edges[e], u = E.a === v ? E.b : E.a;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (!blocksFor(s, pid, u) && !knightAt(s, u)) stack.push(u); // you can't walk through any knight
    }
  }
  return out;
}

// ---- queries ----
export const canRecruit = (s, pid, v) =>
  !!s.knights && s.players[pid].knightsLeft[1] > 0 && s.board.vertices[v].hexes.length > 0 && emptyAt(s, v) && ownRoadAt(s, pid, v);
export const legalRecruits = (s, pid) => (s.knights ? s.board.vertices.filter(V => canRecruit(s, pid, V.id)).map(V => V.id) : []);

export function promoteBlock(s, pid, v) {
  const k = knightAt(s, v);
  if (!k || k.owner !== pid) return tk('Ese caballero no es tuyo.');
  if (k.level >= 3) return tk('Ya es un caballero poderoso.');
  if (k.promotedTurn === s.turn) return tk('Ese caballero ya ascendió este turno.');
  if (k.level === 2 && !hasAbility(s, pid, 'politics')) return tk('Para caballeros poderosos necesitas política nivel 3.');
  if (s.players[pid].knightsLeft[k.level + 1] <= 0) return tk('No te quedan caballeros de ese nivel.');
  return '';
}
export const legalPromotions = (s, pid) => knightsOf(s, pid).filter(v => !promoteBlock(s, pid, v));
export const legalActivations = (s, pid) => knightsOf(s, pid).filter(v => !s.knights[v].active);

// active, not activated this turn, no action yet this turn
export const canAct = (s, pid, v) => {
  const k = knightAt(s, v);
  return !!(k && k.owner === pid && k.active && k.activatedTurn !== s.turn && k.usedTurn !== s.turn);
};
export const actors = (s, pid) => knightsOf(s, pid).filter(v => canAct(s, pid, v));

// where knight v can go: { move: [empty corners], displace: [weaker rival knights] }
export function knightTargets(s, pid, v) {
  if (!canAct(s, pid, v)) return { move: [], displace: [] };
  const lvl = s.knights[v].level;
  const move = [], displace = [];
  for (const u of reachable(s, pid, v)) {
    if (emptyAt(s, u)) move.push(u);
    else if (!s.buildings[u] && knightAt(s, u).owner !== pid && knightAt(s, u).level < lvl) displace.push(u);
  }
  return { move, displace };
}
// the robber can't be chased while it sleeps (before the first barbarian attack)
export const canChase = (s, pid, v) => canAct(s, pid, v) && !(s.barbarians && s.barbarians.attacks === 0) && s.board.robber >= 0 && s.board.vertices[v].hexes.includes(s.board.robber);

export const activeStrength = (s, pid) => knightsOf(s, pid).filter(v => s.knights[v].active).reduce((a, v) => a + s.knights[v].level, 0);

// ---- state changes (the caller checks phase/turn and pays) ----
export function recruit(s, pid, v) {
  s.players[pid].knightsLeft[1]--;
  s.knights[v] = { owner: pid, level: 1, active: false, activatedTurn: -1, promotedTurn: -1, usedTurn: -1 };
}

export function promote(s, pid, v) {
  const k = s.knights[v];
  const p = s.players[pid];
  p.knightsLeft[k.level]++;
  k.level++;
  p.knightsLeft[k.level]--;
  k.promotedTurn = s.turn;
}

export function activate(s, v) {
  const k = s.knights[v];
  k.active = true;
  k.activatedTurn = s.turn;
}

const spent = k => {
  k.active = false;
  k.usedTurn = -1;
};

export function move(s, pid, from, to) {
  const k = s.knights[from];
  delete s.knights[from];
  spent(k);
  s.knights[to] = k;
}

// pushes the rival knight at `to` away: it waits in s.displaced for its owner (or leaves the board)
export function displace(s, pid, from, to) {
  const victim = s.knights[to];
  delete s.knights[to];
  move(s, pid, from, to);
  const options = reachable(s, victim.owner, to).filter(u => emptyAt(s, u));
  if (!options.length) {
    s.players[victim.owner].knightsLeft[victim.level]++;
    return { victim, removed: true };
  }
  s.displaced = { pid: victim.owner, level: victim.level, active: victim.active, options, from: to };
  return { victim, removed: false };
}

export function placeDisplaced(s, at) {
  const d = s.displaced;
  s.knights[at] = { owner: d.pid, level: d.level, active: d.active, activatedTurn: -1, promotedTurn: -1, usedTurn: -1 };
  s.displaced = null;
}

export function chase(s, v) {
  spent(s.knights[v]);
}
