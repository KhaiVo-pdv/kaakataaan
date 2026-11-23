// Traders & Barbarians — "The Fishermen of Catan": board data and fish tokens.
// Only used when config.expansions.tbScenario === 'fishermen' (see expansions.js).
//
// Board:
//   - the desert becomes a lake (`tile.lake = true`, `board.lake = tileId`). The tile keeps
//     res 'desert' so the robber and the renderers keep working; it yields fish on LAKE_NUMS.
//   - six fishing grounds (`board.fishing`) on coastal sea hexes, numbers 4,5,6,8,9,10. Each one
//     touches 3 coastal intersections (`verts`), like the boxed sea-frame pieces.
// State (`s.fishermen`): the face-down token bag and who holds the old boot.
// Each player gets `p.fish`: the values of the fish tokens in hand (1, 2 or 3).

import { rand, shuffle } from '../rng.js';

export const LAKE_NUMS = [2, 3, 11, 12];
export const FISHING_NUMS = [4, 5, 6, 8, 9, 10];
export const FISHING_COUNT = 6;
export const BOOT = 0; // the old boot in the bag: worth no fish
// 11 one-fish, 10 two-fish, 8 three-fish tokens + the old boot = 30
export const FISH_TOKENS = { 1: 11, 2: 10, 3: 8 };

// Adds the lake and the fishing grounds to a freshly generated board.
// `geo` = { corner, pkey, hexCenter, dirs } from board.js (passed in to avoid a circular import).
export function addFishermen(board, rng, geo) {
  const { tiles, sea, vertices } = board;
  const out = { lake: -1, fishing: [] };

  // the lake: the most central desert (custom maps can have several)
  const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
  const cy = tiles.reduce((a, t) => a + t.y, 0) / tiles.length;
  const deserts = tiles.filter(t => t.res === 'desert').sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  if (deserts.length) {
    const lake = deserts[0];
    lake.lake = true;
    out.lake = lake.id;
  }

  // fishing ground candidates: sea hexes of the ring that touch exactly 3 land intersections
  const vByKey = new Map(vertices.map(v => [geo.pkey(v), v.id]));
  const cands = sea.map(h => {
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const v = vByKey.get(geo.pkey(geo.corner(h.q, h.r, i)));
      if (v !== undefined) verts.push(v);
    }
    return { h, verts, port: verts.some(v => vertices[v].port !== null), ang: Math.atan2(h.y - cy, h.x - cx) };
  }).filter(c => c.verts.length >= 2);
  // best first: 3 intersections and no harbour; then 3 with a harbour; then 2 (tiny or odd maps)
  const grade = c => (c.verts.length === 3 ? 0 : 2) + (c.port ? 1 : 0);
  let pool = [];
  for (let g = 0; g < 4 && pool.length < FISHING_COUNT; g++) pool = cands.filter(c => grade(c) <= g);
  pool.sort((a, b) => a.ang - b.ang);

  // spread them evenly around the island, never two sharing an intersection
  const want = Math.min(FISHING_COUNT, pool.length);
  const nums = shuffle(rng, [...FISHING_NUMS]);
  const used = new Set(), taken = new Set();
  const step = pool.length / Math.max(1, want);
  const start = rand(rng) * step;
  for (let i = 0; i < want; i++) {
    const base = Math.floor(start + i * step);
    for (let d = 0; d < pool.length; d++) {
      const k = (base + (d % 2 ? -((d + 1) >> 1) : d >> 1) + pool.length * 2) % pool.length;
      const c = pool[k];
      if (taken.has(k) || c.verts.some(v => used.has(v))) continue;
      taken.add(k);
      c.verts.forEach(v => used.add(v));
      out.fishing.push({ id: out.fishing.length, q: c.h.q, r: c.h.r, x: c.h.x, y: c.h.y, num: nums[out.fishing.length], verts: c.verts });
      break;
    }
  }
  return out;
}

// The shuffled bag of face-down fish tokens (values; BOOT = the old boot).
export function buildFishBag(rng) {
  const bag = [BOOT];
  for (const [val, n] of Object.entries(FISH_TOKENS)) for (let i = 0; i < n; i++) bag.push(+val);
  return shuffle(rng, bag);
}

// Adds the Fishermen fields to a new game state. Base games never get these keys.
export function initFishermen(s, rng) {
  s.fishermen = { bag: buildFishBag(rng), boot: -1 };
  for (const p of s.players) p.fish = [];
}

// Total fish a player holds.
export const fishCount = p => (p.fish || []).reduce((a, v) => a + v, 0);
