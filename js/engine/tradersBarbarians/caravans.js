// Traders & Barbarians — "The Caravans": board data and camel state.
// Only used when config.expansions.tbScenario === 'caravans' (see expansions.js).
//
// Board:
//   - the desert moves to the most central hex (swapping resource + number) and becomes the oasis
//     (`tile.oasis = true`, `board.oasis`). It keeps res 'desert'. The robber starts off the board.
//   - three caravan starts (`board.caravanStarts`) on alternating corners of the oasis: the first
//     camel of each route goes on the edge leading away from that corner (`{ vertex, edge }`).
// State (`s.caravans`): camels in the supply, camels placed (edge -> route) and each route's tip.

import { rand } from '../rng.js';

export const CAMELS = 22;
export const CARAVAN_ROUTES = 3;

// a camel walks beside a path between two land hexes
export const camelEdge = (bd, e) => bd.edges[e].hexes.length === 2;

// Moves the desert to the centre as the oasis and finds the three starts.
export function addCaravans(board, rng) {
  const { tiles, edges, vertices } = board;
  const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
  const cy = tiles.reduce((a, t) => a + t.y, 0) / tiles.length;
  // how many corners of t have a path leading inland (a caravan needs 3)
  const ways = t => Math.min(CARAVAN_ROUTES, t.verts.filter(v => vertices[v].edges.some(e => !edges[e].hexes.includes(t.id) && edges[e].hexes.length === 2)).length);
  // the most central hex among those with the most ways out (ties broken at random)
  const centre = [...tiles].sort((a, b) => (ways(b) - ways(a)) || (Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)) || rand(rng) - 0.5)[0];
  const desert = tiles.find(t => t.res === 'desert');
  if (desert && desert !== centre) {
    [centre.res, desert.res] = [desert.res, centre.res];
    [centre.num, desert.num] = [desert.num, centre.num];
  }
  centre.oasis = true;

  // from each corner, the one edge that leaves the oasis
  const outward = v => vertices[v].edges.find(e => !edges[e].hexes.includes(centre.id));
  const starts = k => [0, 2, 4].map(i => centre.verts[(i + k) % 6]).map(v => ({ vertex: v, edge: outward(v) })).filter(x => x.edge !== undefined && camelEdge(board, x.edge));
  const a = starts(0), b = starts(1);
  let pick = a.length !== b.length ? (a.length > b.length ? a : b) : rand(rng) < 0.5 ? a : b;
  if (pick.length < CARAVAN_ROUTES) {
    // odd maps (an oasis on the coast): any corner with a way inland, spread out as far as possible
    const all = [0, 1, 2, 3, 4, 5].map(i => ({ i, vertex: centre.verts[i], edge: outward(centre.verts[i]) })).filter(x => x.edge !== undefined && camelEdge(board, x.edge));
    pick = [];
    const apart = x => pick.every(y => Math.min(Math.abs(y.i - x.i), 6 - Math.abs(y.i - x.i)) > 1);
    for (const x of all) if (pick.length < CARAVAN_ROUTES && apart(x)) pick.push(x); // not on neighbouring corners...
    for (const x of all) if (pick.length < CARAVAN_ROUTES && !pick.includes(x)) pick.push(x); // ...unless there is no other way
    pick = pick.map(({ vertex, edge }) => ({ vertex, edge }));
  }
  return { oasis: centre.id, caravanStarts: pick, robber: -1 };
}

// Adds the Caravans fields to a new game state. Base games never get these keys.
//   s.caravans.camels  edge id -> route id
//   s.caravans.routes  [{ id, start: edge, tip: vertex the next camel walks from (null before the first), ended }]
export function initCaravans(s) {
  s.caravans = {
    left: CAMELS,
    camels: {},
    routes: s.board.caravanStarts.map((st, id) => ({ id, start: st.edge, from: st.vertex, tip: null, ended: false })),
  };
}

// ---------------- rules ----------------

export const VOTE_RES = ['sheep', 'wheat']; // votes are wool and grain cards
export const CAMEL_VP = 1; // a building with camels on 2 of its paths

const otherEnd = (bd, e, v) => (bd.edges[e].a === v ? bd.edges[e].b : bd.edges[e].a);
const oasisEdge = (bd, e) => bd.edges[e].hexes.includes(bd.oasis);

// Where the next camel may go: [{ edge, route, from }] (one entry per edge; merging routes share it).
// A route's first camel takes its start path; later ones continue from the far end of its last camel.
export function camelOptions(s) {
  const bd = s.board, C = s.caravans;
  if (!C || C.left <= 0) return [];
  const out = [], seen = new Set();
  for (const r of C.routes) {
    if (r.ended) continue;
    const from = r.tip === null ? r.from : r.tip;
    const edges = r.tip === null ? [r.start] : bd.vertices[from].edges;
    for (const e of edges) {
      if (C.camels[e] !== undefined || seen.has(e) || !camelEdge(bd, e) || oasisEdge(bd, e)) continue;
      seen.add(e);
      out.push({ edge: e, route: r.id, from });
    }
  }
  return out;
}

// Puts a camel on one of the options; routes left with no way on are marked ended.
export function placeCamel(s, edge) {
  const C = s.caravans;
  const opt = camelOptions(s).find(o => o.edge === edge);
  if (!opt) return false;
  C.camels[edge] = opt.route;
  C.routes[opt.route].tip = otherEnd(s.board, edge, opt.from);
  C.left--;
  for (const r of C.routes) if (!r.ended && !camelOptions(s).some(o => o.route === r.id)) r.ended = true;
  return true;
}

// edges of vertex v that carry a camel
export const camelsAt = (s, v) => s.board.vertices[v].edges.filter(e => s.caravans.camels[e] !== undefined).length;
// +1 VP for each of pid's buildings with camels on 2 (or 3) of its paths
export function camelVP(s, pid) {
  if (!s.caravans) return 0;
  let vp = 0;
  for (const k in s.buildings) if (s.buildings[k].owner === pid && camelsAt(s, +k) >= 2) vp += CAMEL_VP;
  return vp;
}
// a road on a camel path counts as 2 for the Longest Road
export const roadWeight = (s, e) => (s.caravans && s.caravans.camels[e] !== undefined ? 2 : 1);

// The vote result. bids: { pid: { n, spot } }, current: whose turn it is.
// The spot with the most votes wins. A tie between spots goes to the one player who laid the most
// cards (or, if no single one did, to the current player): their own spot if it is among the tied
// ones, otherwise they must pick ({ decider, tied }).
export function voteResult(bids, current, options) {
  const tally = new Map(options.map(e => [e, 0]));
  for (const b of Object.values(bids)) if (b.n > 0 && tally.has(b.spot)) tally.set(b.spot, tally.get(b.spot) + b.n);
  const top = Math.max(...tally.values());
  const tied = [...tally].filter(([, n]) => n === top).map(([e]) => e);
  if (tied.length === 1) return { edge: tied[0] };
  const ns = Object.entries(bids).map(([pid, b]) => [+pid, b.n]);
  const most = Math.max(0, ...ns.map(([, n]) => n));
  const leaders = ns.filter(([, n]) => n === most && n > 0);
  const decider = leaders.length === 1 ? leaders[0][0] : current;
  const own = bids[decider] && bids[decider].spot;
  if (tied.includes(own)) return { edge: own };
  return { decider, tied };
}
