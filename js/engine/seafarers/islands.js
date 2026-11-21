// Seafarers islands: where the initial settlements may go, the bonus for settling new islands,
// and fog exploration. Only used when Seafarers is on (board.islands exists).
//
// State (created by initIslands):
//   p.homeIslands   islands where the player placed an initial settlement
//   p.bonusIslands  islands that already paid this player their bonus
//   p.islandVP      victory points earned from island bonuses
// Fog: fog tiles start face down (revealed = false) and don't produce. Placing a road or a ship
// that touches one turns it face up; land pays its discoverer one card of its resource.
import { RES } from '../constants.js';
import { scenarioOf } from './scenarios.js';

export const hasIslands = s => !!s.board.islands;
const scenario = s => scenarioOf(s.board.scenario);

export function initIslands(s) {
  for (const p of s.players) {
    p.homeIslands = [];
    p.bonusIslands = [];
    p.islandVP = 0;
  }
  for (const t of s.board.tiles) if (t.fog) t.revealed = t.numRevealed = false;
  for (const t of s.board.sea) if (t.fog) t.revealed = false;
}

// islands touching vertex v (splitting deserts belong to none)
export function islandsAt(s, v) {
  const out = new Set();
  for (const h of s.board.vertices[v].hexes) {
    const i = s.board.tiles[h].island;
    if (i >= 0) out.add(i);
  }
  return [...out];
}

// initial settlements: only next to home land (The Four Islands marks every island as home)
export function setupAllowed(s, v) {
  if (!hasIslands(s)) return true;
  return s.board.vertices[v].hexes.some(h => s.board.tiles[h].home);
}

// is island i "new" for this player (worth the bonus)?
function isForeign(s, p, i) {
  const sc = scenario(s);
  return sc.homeAny ? !p.homeIslands.includes(i) : !s.board.islands[i].home;
}

// call after a settlement is placed. Initial ones mark home islands; later ones may pay the
// bonus. Returns the points earned (0 if none) so the caller can log it.
export function settledAt(s, pid, v, initial) {
  if (!hasIslands(s)) return 0;
  const p = s.players[pid];
  let gained = 0;
  for (const i of islandsAt(s, v)) {
    if (initial) {
      if (!p.homeIslands.includes(i)) p.homeIslands.push(i);
      continue;
    }
    const bonus = scenario(s).islandBonus || 0;
    if (!bonus || p.bonusIslands.includes(i) || !isForeign(s, p, i)) continue;
    p.bonusIslands.push(i);
    p.islandVP += bonus;
    gained += bonus;
  }
  return gained;
}

// Reveal fog around the corners of edge e. Returns what was found:
// [{ kind: 'land', tile, res } | { kind: 'sea', sea }]. Land pays `pid` one card (gold:
// the resource they have least of) through `give(res)`.
export function explore(s, pid, e, give) {
  if (!hasIslands(s)) return [];
  const bd = s.board;
  const found = [];
  const E = bd.edges[e];
  for (const v of [E.a, E.b]) {
    for (const h of bd.vertices[v].hexes) {
      const t = bd.tiles[h];
      if (!t.fog || t.revealed) continue;
      t.revealed = t.numRevealed = true;
      let res = t.res;
      if (res === 'gold') {
        const p = s.players[pid];
        res = RES.reduce((b, x) => (p.res[x] < p.res[b] ? x : b), RES[0]);
      }
      if (RES.includes(res)) give(res);
      found.push({ kind: 'land', tile: t.id, res: RES.includes(res) ? res : null });
    }
    for (const id of bd.vertices[v].sea || []) {
      const t = bd.sea[id];
      if (!t.fog || t.revealed) continue;
      t.revealed = true;
      found.push({ kind: 'sea', sea: id });
    }
  }
  return found;
}
