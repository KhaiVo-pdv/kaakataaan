// Traders & Barbarians — the main "Traders & Barbarians" scenario: board data and state.
// Only used when config.expansions.tbScenario === 'tradersBarbarians' (see expansions.js).
//
// Board (the map is drawn with 3 deserts, see board.js; the 2 and 12 number tokens are not used):
//   - the deserts move to 3 coastal hexes spread round the island and become the trade hexes
//     (`tile.trade` = 'castle' | 'quarry' | 'glassworks'). They keep res 'desert': no number,
//     no production.
//   - each trade hex gets a plaza: a new intersection in its middle (`vertex.plaza` = trade hex
//     id, no hexes, so nobody can build there) joined by "inner" paths (`edge.inner`) to its land
//     corners. Roads may be built on inner paths; the hex's sea-side paths are closed (`edge.noRoad`).
//   - `board.trade`: [{ hex, kind, plaza, inner: [edge ids], closed: [edge ids] }]
//   - `board.tbBarbPaths`: the 3 paths the barbarians start on (one between each pair of trade hexes)
// State (`s.traders`): the barbarians' paths, the 3 commodity stacks and each player's wagon.
// Players get `p.gold` (5 to start). No robber, no Longest Road.

import { rand, shuffle } from '../rng.js';

export const TRADE_HEXES = 3;
export const START_GOLD = 5;
export const TRADE_KINDS = ['castle', 'quarry', 'glassworks'];
// what each trade hex supplies (6 tokens of each) and where each commodity must go
export const SUPPLIES = { castle: ['tools', 'sand'], quarry: ['marble', 'sand'], glassworks: ['glass', 'tools'] };
export const NEEDED_AT = { marble: 'castle', glass: 'castle', tools: 'quarry', sand: 'glassworks' };
export const TOKENS_EACH = 6;
// the 2 and 12 tokens are removed: these stand in for them (keeps the token count)
export const NO_2_12 = [3, 11, 4, 10, 5, 9];

// the wagon (baggage train) levels: proposal (official values unknown), balanced with bot games.
// cost = resources to reach this level; mp = movement points; gold = per delivery; drive = die
// results that drive a barbarian off (none at level 1); vp = the last level is worth 1 point.
export const WAGON_LEVELS = [
  { level: 1, cost: null, mp: 4, gold: 1, drive: [] },
  { level: 2, cost: { wood: 1, sheep: 1, ore: 1 }, mp: 5, gold: 2, drive: [6] },
  { level: 3, cost: { sheep: 2, wheat: 1, ore: 1 }, mp: 5, gold: 3, drive: [5, 6] },
  { level: 4, cost: { wheat: 2, ore: 2 }, mp: 6, gold: 4, drive: [4, 5, 6] },
  { level: 5, cost: { sheep: 2, wheat: 2, ore: 2 }, mp: 7, gold: 5, drive: [3, 4, 5, 6], vp: 1 },
];

// paths of tile t in order round it
function tilePaths(t, vertices, edges) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = t.verts[i], b = t.verts[(i + 1) % 6];
    out.push(vertices[a].edges.find(id => edges[id].a === Math.min(a, b) && edges[id].b === Math.max(a, b)));
  }
  return out;
}

export function addTraders(board, rng) {
  const { tiles, vertices, edges } = board;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // candidates: coastal hexes with at least 2 sea-side paths and 2 land corners (more sea is better)
  const cands = tiles.map(t => {
    const sea = tilePaths(t, vertices, edges).filter(e => edges[e].hexes.length === 1).length;
    const land = t.verts.filter(v => vertices[v].hexes.length > 1).length;
    return { t, sea, land };
  }).filter(c => c.sea >= 2 && c.land >= 2);
  if (cands.length < TRADE_HEXES) return {};
  // the 3 spread furthest apart (largest smallest gap), more sea paths breaking ties
  let best = null, bestScore = -1;
  const n = cands.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const A = cands[i], B = cands[j], C = cands[k];
    const score = Math.min(dist(A.t, B.t), dist(A.t, C.t), dist(B.t, C.t)) + (A.sea + B.sea + C.sea) * 0.05 + rand(rng) * 0.01;
    if (score > bestScore) { bestScore = score; best = [A.t, B.t, C.t]; }
  }
  // the deserts (board.js forces 3) swap into those spots
  const swap = (a, b) => {
    [a.res, b.res] = [b.res, a.res];
    [a.num, b.num] = [b.num, a.num];
  };
  for (const t of best) {
    if (t.res === 'desert') continue;
    const d = tiles.find(x => x.res === 'desert' && !best.includes(x));
    if (d) swap(t, d);
  }
  const kinds = shuffle(rng, [...TRADE_KINDS]);
  const trade = best.map((t, i) => {
    t.trade = kinds[i];
    // the plaza: a new intersection in the middle, inner paths to the land corners
    const plaza = vertices.length;
    vertices.push({ id: plaza, x: t.x, y: t.y, hexes: [], adj: [], edges: [], port: null, plaza: t.id });
    const inner = [];
    for (const v of t.verts) {
      if (vertices[v].hexes.length < 2) continue; // a sea corner
      const e = edges.length;
      edges.push({ id: e, a: Math.min(v, plaza), b: Math.max(v, plaza), hexes: [t.id, t.id], inner: true });
      vertices[v].edges.push(e);
      vertices[plaza].edges.push(e);
      vertices[v].adj.push(plaza);
      vertices[plaza].adj.push(v);
      inner.push(e);
    }
    const closed = tilePaths(t, vertices, edges).filter(e => edges[e].hexes.length === 1);
    for (const e of closed) edges[e].noRoad = true;
    return { hex: t.id, kind: kinds[i], plaza, inner, closed };
  });
  // harbours on a closed sea side would be useless: move them along the coast to a free spot
  if (board.ports) {
    const closedSet = new Set(trade.flatMap(T => T.closed));
    const used = new Set(board.ports.filter(p => !closedSet.has(p.edge)).flatMap(p => [edges[p.edge].a, edges[p.edge].b]));
    for (const p of board.ports) {
      if (!closedSet.has(p.edge)) continue;
      const old = edges[p.edge];
      const om = { x: (vertices[old.a].x + vertices[old.b].x) / 2, y: (vertices[old.a].y + vertices[old.b].y) / 2 };
      const midOf = e => ({ x: (vertices[e.a].x + vertices[e.b].x) / 2, y: (vertices[e.a].y + vertices[e.b].y) / 2 });
      const spot = edges.filter(e => e.hexes.length === 1 && !e.noRoad && !tiles[e.hexes[0]].trade && !used.has(e.a) && !used.has(e.b))
        .sort((x, y) => dist(midOf(x), om) - dist(midOf(y), om))[0];
      for (const v of [old.a, old.b]) if (vertices[v].port === p.id) vertices[v].port = null;
      if (!spot) { p.drop = true; continue; } // nowhere to go: the harbour is left out
      used.add(spot.a); used.add(spot.b);
      const land = tiles[spot.hexes[0]];
      const mx = (vertices[spot.a].x + vertices[spot.b].x) / 2, my = (vertices[spot.a].y + vertices[spot.b].y) / 2;
      let nx = mx - land.x, ny = my - land.y;
      const len = Math.hypot(nx, ny);
      nx /= len; ny /= len;
      Object.assign(p, { edge: spot.id, x: mx + nx * 0.62, y: my + ny * 0.62, nx, ny });
      vertices[spot.a].port = p.id;
      vertices[spot.b].port = p.id;
    }
  }
  if (board.ports && board.ports.some(p => p.drop)) {
    const kept = board.ports.filter(p => !p.drop);
    board.ports.length = 0;
    for (const v of vertices) v.port = null;
    kept.forEach((p, i) => {
      p.id = i;
      board.ports.push(p);
      vertices[edges[p.edge].a].port = i;
      vertices[edges[p.edge].b].port = i;
    });
  }
  // a barbarian on the land path closest to the middle between each pair of trade hexes
  const free = edges.filter(e => !e.inner && !e.noRoad && e.hexes.length === 2 && e.hexes.every(h => !tiles[h].trade));
  const mid = e => ({ x: (vertices[e.a].x + vertices[e.b].x) / 2, y: (vertices[e.a].y + vertices[e.b].y) / 2 });
  const barbs = [];
  for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
    const m = { x: (best[i].x + best[j].x) / 2, y: (best[i].y + best[j].y) / 2 };
    const e = free.filter(x => !barbs.includes(x.id)).sort((a, b) => dist(mid(a), m) - dist(mid(b), m))[0];
    if (e) barbs.push(e.id);
  }
  return { trade, tbBarbPaths: barbs, robber: -1 };
}

// Adds the scenario's fields to a new game state. Base games never get these keys.
//   s.traders.barbarians  the paths (edge ids) the 3 barbarians stand on
//   s.traders.stacks      trade kind -> commodity tokens still face down beside that hex
//   s.traders.wagons      pid -> { at: vertex (null = still on the player's city), cargo, level }
export function initTraders(s) {
  const stacks = {};
  for (const kind of TRADE_KINDS) {
    const st = [];
    for (const good of SUPPLIES[kind]) for (let i = 0; i < TOKENS_EACH; i++) st.push(good);
    stacks[kind] = shuffle(s.rng, st);
  }
  const wagons = {};
  for (const p of s.players) {
    p.gold = START_GOLD;
    wagons[p.id] = { at: null, cargo: null, level: 1, delivered: 0 };
  }
  s.traders = { barbarians: [...(s.board.tbBarbPaths || [])], stacks, wagons };
  s.config.rules.setupCity = true; // the second starting settlement is a city (the wagon starts there)
}

// ---------------- helpers ----------------
export const tradeAt = (s, hex) => s.board.trade.find(t => t.hex === hex) || null;
export const tradeOfKind = (s, kind) => s.board.trade.find(t => t.kind === kind) || null;
export const isPlaza = (s, v) => s.board.vertices[v] && s.board.vertices[v].plaza != null;
// no building on a corner that only touches trade hexes (and the sea)
export const vertexBlocked = (s, v) => {
  const hs = s.board.vertices[v].hexes;
  return hs.length > 0 && hs.every(h => s.board.tiles[h].trade);
};
// no road on a trade hex's sea side, nor on a path with a barbarian
export const edgeBlocked = (s, e) => !!s.board.edges[e].noRoad || s.traders.barbarians.includes(e);
// where a player's wagon stands: its own spot, or the player's (first) city before it moves
export function wagonAt(s, pid) {
  const w = s.traders.wagons[pid];
  if (w && w.at != null) return w.at;
  const k = Object.keys(s.buildings).find(v => s.buildings[v].owner === pid && s.buildings[v].type === 'city');
  return k != null ? +k : null;
}
export const wagonLevel = (s, pid) => WAGON_LEVELS[s.traders.wagons[pid].level - 1];

// ---------------- the wagon: moving, commodities, upgrades ----------------
export const BOOST_MP = 2; // 1 grain, once per turn
export const BOOST_COST = { wheat: 1 };
export const TOLL = 1; // gold to the owner of a rival road
export const BARBARIAN_MP = 2;
export const deliveryVP = p => (p.delivered || 0);
export const wagonVP = (s, pid) => (s.traders.wagons[pid].delivered || 0) + (WAGON_LEVELS[s.traders.wagons[pid].level - 1].vp || 0);
export const nextLevel = (s, pid) => WAGON_LEVELS[s.traders.wagons[pid].level] || null;

// this turn's movement points (created on the first move / boost of the turn)
export function turnMove(s, pid) {
  const T = s.traders;
  if (!T.move || T.move.turn !== s.turn || T.move.pid !== pid) T.move = { turn: s.turn, pid, mp: wagonLevel(s, pid).mp, boost: false, stopped: false };
  return T.move;
}
export const mpLeft = (s, pid) => (s.traders.move && s.traders.move.turn === s.turn && s.traders.move.pid === pid ? s.traders.move.mp : wagonLevel(s, pid).mp);
export const boostUsed = (s, pid) => !!(s.traders.move && s.traders.move.turn === s.turn && s.traders.move.pid === pid && s.traders.move.boost);
export const stopped = (s, pid) => !!(s.traders.move && s.traders.move.turn === s.turn && s.traders.move.pid === pid && s.traders.move.stopped);

// what moving along path e costs pid: MP, and a toll to the owner of a rival road
export function pathCost(s, pid, e) {
  const owner = s.roads[e];
  let mp = owner === undefined ? 2 : 1;
  if (s.traders.barbarians.includes(e)) mp += BARBARIAN_MP;
  const toll = owner !== undefined && owner !== pid ? TOLL : 0;
  return { mp, toll, owner };
}
// the vertex at the other end of path e
export const otherEnd = (s, e, v) => (s.board.edges[e].a === v ? s.board.edges[e].b : s.board.edges[e].a);

// the commodity's destination (trade kind), or — with an empty wagon — null
export const cargoDest = (s, pid) => { const c = s.traders.wagons[pid].cargo; return c ? NEEDED_AT[c] : null; };
// where the wagon should head: the plaza that needs its cargo, else the nearest plaza with goods left
export function wagonGoals(s, pid) {
  const dest = cargoDest(s, pid);
  if (dest) return [tradeOfKind(s, dest).plaza];
  return s.board.trade.filter(t => s.traders.stacks[t.kind].length > 0).map(t => t.plaza);
}

// cheapest routes from the wagon (Dijkstra on MP, a toll counting as half a point); a plaza ends a
// route (the wagon must stop there). Returns { cost: Map v -> mp, prev: Map v -> [v, e], gold: Map v -> tolls }.
export function wagonRoutes(s, pid, from = wagonAt(s, pid)) {
  const bd = s.board, cost = new Map([[from, 0]]), key = new Map([[from, 0]]), prev = new Map(), gold = new Map([[from, 0]]);
  const open = [from];
  while (open.length) {
    open.sort((a, b) => key.get(a) - key.get(b));
    const v = open.shift();
    if (v !== from && isPlaza(s, v)) continue;
    for (const e of bd.vertices[v].edges) {
      const u = otherEnd(s, e, v), c = pathCost(s, pid, e);
      const k = key.get(v) + c.mp + c.toll * 0.5;
      if (!key.has(u) || k < key.get(u)) {
        key.set(u, k);
        cost.set(u, cost.get(v) + c.mp);
        gold.set(u, gold.get(v) + c.toll);
        prev.set(u, [v, e]);
        if (!open.includes(u)) open.push(u);
      }
    }
  }
  return { cost, prev, gold };
}
// the next steps along the cheapest route to the nearest goal that fit in mp (and the gold in hand)
export function wagonPlan(s, pid, mp = mpLeft(s, pid)) {
  const goals = wagonGoals(s, pid);
  const R = wagonRoutes(s, pid);
  const goal = goals.filter(g => R.cost.has(g)).sort((a, b) => R.cost.get(a) - R.cost.get(b))[0];
  if (goal == null) return { goal: null, steps: [], total: Infinity };
  const path = [];
  for (let v = goal; R.prev.has(v); v = R.prev.get(v)[0]) path.unshift({ to: v, e: R.prev.get(v)[1] });
  const steps = [];
  let left = mp, gold = s.players[pid].gold;
  for (const st of path) {
    const c = pathCost(s, pid, st.e);
    if (c.mp > left || c.toll > gold) break;
    left -= c.mp;
    gold -= c.toll;
    steps.push(st);
  }
  return { goal, steps, total: R.cost.get(goal) };
}
