// Traders & Barbarians — "The Rivers of Catan": board data and gold / bridge state.
// Only used when config.expansions.tbScenario === 'rivers' (see expansions.js).
//
// Board:
//   - the map is drawn with 2 deserts (board.js); they move to the river sources and become marshes
//     (`tile.marsh = true`, `board.marsh = [ids]`). They keep res 'desert': no number, no production,
//     the robber starts there.
//   - two rivers, 3 and 4 hexes long (`board.rivers`). Each flows from a marsh (its source) to the
//     coast. `crossings` are the edges the water cuts through: between two river hexes and the mouth
//     on the coast. Roads can never be built on them; bridges only there (`board.bridgeSpots`, 7).
// State (`s.rivers`): the bridges built (edge id -> owner). Each player gets `p.gold` and `p.bridgesLeft`.

import { rand, shuffle } from '../rng.js';

export const RIVER_LENGTHS = [4, 3]; // the longer one first: it is harder to fit
export const MARSHES = 2;
export const MAX_BRIDGES = 3;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Adds the marshes, the rivers and the bridge spots to a freshly generated board.
// The rivers are laid first; then the two deserts swap places (resource + number) with the river
// sources, so each river springs from a marsh. The resource and number mix stays the same.
export function addRivers(board, rng) {
  const { tiles, edges } = board;
  const index = new Map(tiles.map(t => [t.q + ',' + t.r, t.id]));
  const nbrs = t => DIRS.map(([dq, dr]) => index.get(t.q + dq + ',' + (t.r + dr))).filter(x => x !== undefined);
  const coastal = t => nbrs(t).length < 6;
  // edge shared by two tiles / a tile's coastal edges (edges list the tiles they border)
  const shared = (a, b) => edges.find(e => e.hexes.length === 2 && e.hexes.includes(a) && e.hexes.includes(b));
  const coastEdges = id => edges.filter(e => e.hexes.length === 1 && e.hexes[0] === id);
  const red = t => t.num === 6 || t.num === 8;

  const taken = new Set(); // river hexes so far
  const near = new Set(); // their neighbours: on roomy maps rivers don't touch
  const rivers = [];
  for (const len of RIVER_LENGTHS) {
    let path = null;
    // strict first (inland until the mouth, not touching the other river), then looser on small maps
    for (const level of [0, 1, 2]) {
      const blocked = id => taken.has(id) || (level === 0 && near.has(id));
      // sources: inland hexes, the ones without a 6/8 first (a desert will take their place)
      const srcs = shuffle(rng, tiles.filter(t => !blocked(t.id) && (level === 2 || !coastal(t)))).sort((a, b) => red(a) - red(b)).map(t => t.id);
      for (const src of srcs) {
        path = growRiver(src, len, blocked, nbrs, coastal, tiles, rng, level === 2);
        if (path) break;
      }
      if (path) break;
    }
    if (!path) continue;
    const prev = tiles[path[path.length - 2] ?? path[0]], last = tiles[path[path.length - 1]];
    // the mouth: the coastal edge pointing furthest away from the previous river hex
    const away = e => {
      const va = board.vertices[e.a], vb = board.vertices[e.b];
      const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
      return (mx - last.x) * (last.x - prev.x) + (my - last.y) * (last.y - prev.y) + rand(rng) * 1e-3;
    };
    const mouth = coastEdges(last.id).sort((a, b) => away(b) - away(a))[0];
    const crossings = [];
    for (let i = 0; i + 1 < path.length; i++) crossings.push(shared(path[i], path[i + 1]).id);
    if (mouth) crossings.push(mouth.id);
    rivers.push({ id: rivers.length, hexes: path, crossings, mouth: mouth ? mouth.id : -1 });
    for (const id of path) {
      taken.add(id);
      for (const n of nbrs(tiles[id])) near.add(n);
    }
  }

  // the marshes: move the deserts to the river sources
  const deserts = tiles.filter(t => t.res === 'desert');
  const sources = new Set(rivers.map(r => r.hexes[0]));
  const marsh = [];
  for (const r of rivers) {
    if (marsh.length >= MARSHES) break;
    const src = tiles[r.hexes[0]];
    if (src.res !== 'desert') {
      // any desert that isn't a river source (one in the middle of a river moves out of it too)
      const d = deserts.find(t => t.res === 'desert' && !marsh.includes(t.id) && !sources.has(t.id));
      if (!d) continue;
      [src.res, d.res] = [d.res, src.res];
      [src.num, d.num] = [d.num, src.num];
    }
    marsh.push(src.id);
  }
  // maps with more than two deserts: a leftover desert never sits in a river (swap it with dry land)
  for (const id of taken) {
    const t = tiles[id];
    if (t.res !== 'desert' || marsh.includes(id)) continue;
    const dry = tiles.find(o => !taken.has(o.id) && o.res !== 'desert');
    if (!dry) continue;
    [t.res, dry.res] = [dry.res, t.res];
    [t.num, dry.num] = [dry.num, t.num];
  }
  // spare deserts (no river found for them) are marshes too, up to two
  for (const d of tiles) if (marsh.length < MARSHES && d.res === 'desert' && !marsh.includes(d.id)) marsh.push(d.id);
  for (const id of marsh) tiles[id].marsh = true;
  for (const r of rivers) for (const id of r.hexes) tiles[id].river = r.id;
  // the robber starts on a marsh
  return { marsh, rivers, bridgeSpots: rivers.flatMap(r => r.crossings), ...(marsh.length ? { robber: marsh[0] } : {}) };
}

// A river of `len` hexes from `src` ending on the coast (`loose`: it may touch the coast earlier).
// Random depth-first search; null if none.
function growRiver(src, len, blocked, nbrs, coastal, tiles, rng, loose) {
  const path = [src];
  const inPath = new Set(path);
  const ok = (id, step) => !blocked(id) && !inPath.has(id) && (step === len - 1 ? coastal(tiles[id]) : loose || !coastal(tiles[id]));
  if (len === 1) return coastal(tiles[src]) ? path : null;
  const dfs = () => {
    if (path.length === len) return true;
    const here = path[path.length - 1];
    for (const n of shuffle(rng, nbrs(tiles[here]))) {
      if (!ok(n, path.length)) continue;
      // keep the river a single line: the new hex touches only the previous river hex
      if (nbrs(tiles[n]).some(x => inPath.has(x) && x !== here)) continue;
      path.push(n);
      inPath.add(n);
      if (dfs()) return true;
      path.pop();
      inPath.delete(n);
    }
    return false;
  };
  return dfs() ? path : null;
}

// Adds the Rivers fields to a new game state. Base games never get these keys.
export function initRivers(s) {
  s.rivers = { bridges: {} };
  for (const p of s.players) {
    p.gold = 0;
    p.bridgesLeft = MAX_BRIDGES;
  }
}

// ---------------- rules ----------------

export const BRIDGE_COST = { brick: 2, wood: 1 };
export const GOLD = { settlement: 1, road: 1, bridge: 3 }; // gold for building at a river (cities: none)
export const GOLD_PER_RESOURCE = 2; // 2 gold buy 1 resource...
export const GOLD_BUYS_PER_TURN = 2; // ...at most twice a turn
export const WEALTHY_VP = 1, POOR_VP = -2;

// the 7 edges the water cuts through: roads never go there, bridges only there
export const isCrossing = (bd, e) => !!bd.bridgeSpots && bd.bridgeSpots.includes(+e);
// a corner of a river hex: a settlement here earns gold
export const riverVertex = (bd, v) => bd.vertices[v].hexes.some(h => bd.tiles[h].river !== undefined);
// an edge along a river hex (not across the water): a road here earns gold
export const riverEdge = (bd, e) => !isCrossing(bd, e) && bd.edges[e].hexes.some(h => bd.tiles[h].river !== undefined);

// gold a new piece earns: 'settlement' at vertex v / 'road' on edge e / 'bridge'
export function goldFor(bd, what, at) {
  if (what === 'settlement') return riverVertex(bd, at) ? GOLD.settlement : 0;
  if (what === 'road') return riverEdge(bd, at) ? GOLD.road : 0;
  if (what === 'bridge') return GOLD.bridge;
  return 0;
}

// Wealthiest Settler (+1): the one player who alone has the most gold.
// Poor Settler (-2): every player tied for the fewest gold (no gold included). Retired seats don't count.
export function wealthVP(s, pid) {
  if (!s.rivers) return 0;
  const live = s.players.filter(p => !p.retired);
  if (!live.some(p => p.id === pid) || live.length < 2) return 0;
  const golds = live.map(p => p.gold);
  const max = Math.max(...golds), min = Math.min(...golds);
  const me = s.players[pid].gold;
  let vp = 0;
  if (me === max && golds.filter(g => g === max).length === 1) vp += WEALTHY_VP;
  if (me === min) vp += POOR_VP;
  return vp;
}

// title holders, for the UI and the log: { wealthy: pid or -1, poor: [pids] }
export function wealthTitles(s) {
  if (!s.rivers) return { wealthy: -1, poor: [] };
  const live = s.players.filter(p => !p.retired);
  if (live.length < 2) return { wealthy: -1, poor: [] };
  const golds = live.map(p => p.gold);
  const max = Math.max(...golds), min = Math.min(...golds);
  const top = live.filter(p => p.gold === max);
  return { wealthy: top.length === 1 ? top[0].id : -1, poor: live.filter(p => p.gold === min).map(p => p.id) };
}

// gold buys left this turn
// (Barbarian Attack uses the same gold rules: the counter lives in s.barbAttack there)
export const goldBox = s => s.rivers || s.barbAttack || s.traders; // the scenarios with gold
export const goldBuysLeft = s => {
  const box = goldBox(s);
  return box.buys && box.buys.turn === s.turn ? GOLD_BUYS_PER_TURN - box.buys.n : GOLD_BUYS_PER_TURN;
};
