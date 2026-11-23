// Traders & Barbarians — "The Fishermen of Catan": board data and fish tokens.
// Only used when config.expansions.tbScenario === 'fishermen' (see expansions.js).
//
// Board:
//   - the desert becomes a lake (`tile.lake = true`, `board.lake = tileId`). The tile keeps
//     res 'desert' so the robber and the renderers keep working; it yields fish on LAKE_NUMS.
//   - six fishing grounds (`board.fishing`) on coastal sea hexes, numbers 4,5,6,8,9,10. Each one
//     touches 3 coastal intersections (`verts`), like the boxed sea-frame pieces.
// State (`s.fishermen`): the face-down token bag, the spent pile and who holds the old boot.
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
  s.fishermen = { bag: buildFishBag(rng), spent: [], boot: -1 };
  for (const p of s.players) p.fish = [];
}

// Total fish a player holds.
export const fishCount = p => (p.fish || []).reduce((a, v) => a + v, 0);

// ---------------- rules ----------------

// What fish buy (cost in fish). Change is never given back.
export const FISH_PERKS = { robber: 2, steal: 3, resource: 4, road: 5, dev: 7 };

// The tokens (indices into p.fish) to pay `cost` with: least overpaid fish first, then fewest tokens.
// null when the player can't pay.
export function pickTokens(fish, cost) {
  // best[sum] = indices reaching exactly that sum with fewest tokens (sums capped at cost + 2)
  const cap = cost + 2;
  let best = new Map([[0, []]]);
  fish.forEach((v, i) => {
    const next = new Map(best);
    for (const [sum, idx] of best) {
      const t = Math.min(cap, sum + v);
      const cand = [...idx, i];
      const cur = next.get(t);
      if (!cur || cand.length < cur.length) next.set(t, cand);
    }
    best = next;
  });
  for (let sum = cost; sum <= cap; sum++) if (best.has(sum)) return best.get(sum);
  return null;
}

// Draws one token from the bag; the spent pile is reshuffled into the bag when it runs out.
function drawToken(s) {
  const F = s.fishermen;
  if (!F.bag.length && F.spent.length) {
    F.bag = shuffle(s.rng, F.spent);
    F.spent = [];
  }
  return F.bag.length ? F.bag.pop() : null;
}

// Who fishes on this roll: [{ pid, n }] in turn order from the current player.
// Fishing grounds whose number came up, and the lake on 2/3/11/12 (unless the robber sits on it).
// Settlements draw 1 token per place, cities 2.
export function fishYield(s, sum) {
  const bd = s.board;
  const per = s.players.map(() => 0);
  const places = bd.fishing.filter(f => f.num === sum).map(f => f.verts);
  if (bd.lake >= 0 && LAKE_NUMS.includes(sum) && bd.robber !== bd.lake) places.push(bd.tiles[bd.lake].verts);
  for (const verts of places)
    for (const v of verts) {
      const b = s.buildings[v];
      if (b && !s.players[b.owner].retired) per[b.owner] += b.type === 'city' ? 2 : 1;
    }
  const n = s.players.length;
  const out = [];
  for (let k = 0; k < n; k++) {
    const pid = (s.current + k) % n;
    if (per[pid]) out.push({ pid, n: per[pid] });
  }
  return out;
}

// Gives `n` tokens to `pid`. Returns { fish: [values], boot: true if the old boot was drawn }.
export function drawFish(s, pid, n) {
  const got = { fish: [], boot: false };
  for (let i = 0; i < n; i++) {
    const tok = drawToken(s);
    if (tok === null) break;
    if (tok === BOOT) {
      s.fishermen.boot = pid;
      got.boot = true;
    } else {
      s.players[pid].fish.push(tok);
      got.fish.push(tok);
    }
  }
  return got;
}

// Removes the paid tokens from the hand into the spent pile; returns how many fish were paid.
export function payFish(s, pid, cost) {
  const p = s.players[pid];
  const idx = pickTokens(p.fish, cost);
  if (!idx) return 0;
  const set = new Set(idx);
  const paid = p.fish.filter((_, i) => set.has(i));
  p.fish = p.fish.filter((_, i) => !set.has(i));
  s.fishermen.spent.push(...paid);
  return paid.reduce((a, v) => a + v, 0);
}

// The old boot: its holder needs one more victory point to win.
export const bootPenalty = (s, pid) => (s.fishermen && s.fishermen.boot === pid ? 1 : 0);
