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
