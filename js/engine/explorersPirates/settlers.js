// Explorers & Pirates: settlers. A settler boards one of your ships lying next to one of your
// harbor settlements (or waits on that harbor, 1 per harbor), and founds a free settlement at
// either end of the coast edge its ship is on.
import { SHIP_CAPACITY, nearHidden } from './rules.js';
import { lairBlocks } from './lairs.js';

const harborsOf = (s, pid) => Object.keys(s.buildings).map(Number).filter(v => s.buildings[v].owner === pid && s.buildings[v].type === 'harbor');
const touches = (s, ship, v) => s.board.edges[ship.edge].a === v || s.board.edges[ship.edge].b === v;

// where a newly built settler goes: a ship next to your harbor with room, else a free harbor
export function settlerHome(s, pid) {
  const harbors = harborsOf(s, pid);
  const ship = s.epShips.filter(x => x.owner === pid && x.cargo.length < SHIP_CAPACITY).find(x => harbors.some(v => touches(s, x, v)));
  if (ship) return { ship };
  const harbor = harbors.find(v => s.explorers.waiting[v] === undefined);
  return harbor !== undefined ? { harbor } : null;
}

// the harbor whose waiting settler this ship can pick up (null if none)
export function loadable(s, ship) {
  if (ship.cargo.length >= SHIP_CAPACITY) return null;
  const v = harborsOf(s, ship.owner).find(h => s.explorers.waiting[h] === ship.owner && touches(s, ship, h));
  return v === undefined ? null : v;
}

// a settlement may be founded here: land corner, distance rule, nothing face down next to it
export function canFound(s, pid, v) {
  const V = s.board.vertices[v];
  if (!V || !V.hexes.length || s.buildings[v] || s.players[pid].settlementsLeft <= 0) return false;
  if (V.adj.some(w => s.buildings[w])) return false;
  return !nearHidden(s, 'vertex', v) && !lairBlocks(s, 'vertex', v);
}

// the corners this ship's settler can found a settlement on
export function foundSpots(s, ship) {
  if (!ship.cargo.includes('settler') || s.board.edges[ship.edge].kind !== 'coast') return [];
  const E = s.board.edges[ship.edge];
  return [E.a, E.b].filter(v => canFound(s, ship.owner, v));
}
