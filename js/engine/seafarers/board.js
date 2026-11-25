// Seafarers board data: turns the visual sea into real sea tiles with vertices and edges
// (ships will sail on them) and splits the land into islands. Only called from
// generateBoard() when config.expansions.seafarers is on.
import { hk, hexCenter, DIRS } from '../board.js';

// Every hex next to `keys` that is not already in it.
function ringAround(coords, taken) {
  const out = new Map();
  for (const [q, r] of coords)
    for (const [dq, dr] of DIRS) {
      const k = hk(q + dq, r + dr);
      if (!taken.has(k) && !out.has(k)) out.set(k, [q + dq, r + dr]);
    }
  return [...out.values()];
}

// Sea tiles: the scenario's sea hexes plus one ring around the whole map, so every coast
// has sea on its far side. Each sea tile gets an id (its index in board.sea).
export function makeSea(tiles, scenarioSea) {
  const taken = new Set(tiles.map(t => hk(t.q, t.r)));
  const sea = [];
  for (const h of scenarioSea) {
    const k = hk(h.q, h.r);
    if (taken.has(k)) continue;
    taken.add(k);
    sea.push({ q: h.q, r: h.r, pirate: !!h.pirate, fog: !!h.fog, ...(h.area !== undefined ? { area: h.area } : {}) }); // area: Explorers & Pirates only
  }
  const all = [...tiles.map(t => [t.q, t.r]), ...sea.map(t => [t.q, t.r])];
  for (const [q, r] of ringAround(all, taken)) sea.push({ q, r, pirate: false, fog: false });
  return sea.map((t, id) => ({ id, kind: 'sea', ...t, ...hexCenter(t.q, t.r), verts: [] }));
}

// Adds the sea tiles to the vertex/edge graph built for the land. Land vertices and edges
// keep their ids; new ones are appended. Afterwards every vertex and edge has `sea`
// (ids of the sea tiles around it) and every edge a `kind`:
//   'land'  two land hexes      -> roads only
//   'coast' land on one side    -> roads or ships
//   'sea'   sea on both sides   -> ships only
//   'frame' the outer rim of the map (one sea hex, nothing beyond) -> nothing
export function addSeaGraph(g, sea) {
  const { vertices, edges, vmap, emap, corner, pkey } = g;
  for (const v of vertices) v.sea = [];
  for (const e of edges) e.sea = [];
  for (const t of sea) {
    for (let i = 0; i < 6; i++) {
      const p = corner(t.q, t.r, i);
      const k = pkey(p);
      let v = vmap.get(k);
      if (v === undefined) {
        v = vertices.length;
        vmap.set(k, v);
        vertices.push({ id: v, x: p.x, y: p.y, hexes: [], adj: [], edges: [], port: null, sea: [] });
      }
      vertices[v].sea.push(t.id);
      t.verts.push(v);
    }
    for (let i = 0; i < 6; i++) {
      const a = t.verts[i], b = t.verts[(i + 1) % 6];
      const k = a < b ? a + '-' + b : b + '-' + a;
      let e = emap.get(k);
      if (e === undefined) {
        e = edges.length;
        emap.set(k, e);
        edges.push({ id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [], sea: [] });
        vertices[a].edges.push(e);
        vertices[b].edges.push(e);
        vertices[a].adj.push(b);
        vertices[b].adj.push(a);
      }
      edges[e].sea.push(t.id);
    }
  }
  for (const e of edges) {
    const land = e.hexes.length, water = e.sea.length;
    e.kind = land === 2 ? 'land' : land === 1 ? 'coast' : water === 2 ? 'sea' : 'frame';
  }
}

// Groups the land into islands (connected land hexes). With `desertSplits` deserts belong
// to no island and cut the land, so the far side of a desert counts as a new island.
// Sets tile.island (-1 for a splitting desert) and returns
// [{ id, tiles: [tile ids], home: bool }]. An island is "home" if any of its hexes is.
export function findIslands(tiles, adj, desertSplits) {
  const cut = t => desertSplits && t.res === 'desert';
  for (const t of tiles) t.island = -1;
  const islands = [];
  for (const start of tiles) {
    if (start.island !== -1 || cut(start)) continue;
    const id = islands.length;
    const isl = { id, tiles: [], home: false };
    const stack = [start.id];
    start.island = id;
    while (stack.length) {
      const t = tiles[stack.pop()];
      isl.tiles.push(t.id);
      if (t.home) isl.home = true;
      for (const n of adj[t.id]) {
        const u = tiles[n];
        if (u.island !== -1 || cut(u)) continue;
        u.island = id;
        stack.push(n);
      }
    }
    islands.push(isl);
  }
  return islands;
}
