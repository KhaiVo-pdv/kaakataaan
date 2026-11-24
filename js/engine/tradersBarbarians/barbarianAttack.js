// Traders & Barbarians — "Barbarian Attack": board data and state.
// Only used when config.expansions.tbScenario === 'barbarianAttack' (see expansions.js).
//
// Board (the map is drawn with 2 deserts, see board.js):
//   - one desert moves to a coastal hex and becomes the castle (`tile.castle`, `board.castle`); the
//     other moves to the coastal hex farthest from it (as in the printed layout). Both keep res
//     'desert': no number, no production, and they can never be conquered.
//   - `board.coast`: the coastal hexes barbarians land on (the castle and that desert excluded).
//   - `board.castlePaths`: the 6 paths around the castle (new knights start there).
//   - `board.barbStart`: the coastal hexes with the 2 and the 12 (or the nearest numbers) that
//     start with one barbarian each.
// State (`s.barbAttack`): barbarians per hex, the supply, conquered hexes and knights on paths.
// Players get `p.gold`, `p.prisoners` and `p.knightsLeft`. There is no robber.

import { rand, shuffle } from '../rng.js';

export const BARBARIANS = 36;
export const KNIGHTS = 6;
export const CONQUER_AT = 3;
export const BA_DESERTS = 2;

export function addBarbarianAttack(board, rng) {
  const { tiles, edges } = board;
  const coastal = t => edges.some(e => e.hexes.length === 1 && e.hexes[0] === t.id);
  const coast = tiles.filter(coastal);
  if (!coast.length) return {};
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // the castle on a random coastal hex, the desert on the coastal hex farthest from it
  const castle = coast[Math.floor(rand(rng) * coast.length)];
  const far = coast.filter(t => t !== castle).sort((a, b) => dist(b, castle) - dist(a, castle) || rand(rng) - 0.5)[0];
  const swap = (a, b) => {
    [a.res, b.res] = [b.res, a.res];
    [a.num, b.num] = [b.num, a.num];
  };
  const targets = [castle, far].filter(Boolean);
  for (const t of targets) {
    if (t.res === 'desert') continue;
    const d = tiles.find(x => x.res === 'desert' && !targets.includes(x));
    if (d) swap(t, d);
  }
  castle.castle = true;
  const land = coast.filter(t => t !== castle && t.res !== 'desert');
  // the two starting barbarians: the coastal 2 and 12, or the closest numbers on the coast
  const start = [];
  for (const want of [2, 12]) {
    const pool = land.filter(t => !start.includes(t.id));
    if (!pool.length) break;
    const best = shuffle(rng, pool).sort((a, b) => Math.abs(a.num - want) - Math.abs(b.num - want))[0];
    start.push(best.id);
  }
  return {
    castle: castle.id,
    coast: land.map(t => t.id),
    castlePaths: edges.filter(e => e.hexes.includes(castle.id)).map(e => e.id),
    barbStart: start,
    robber: -1, // no robber in this scenario
  };
}

// Adds the Barbarian Attack fields to a new game state. Base games never get these keys.
//   s.barbAttack.on        hex id -> barbarians on it
//   s.barbAttack.pool      barbarians left in the supply
//   s.barbAttack.conquered hex ids with 3 barbarians (number face down, no production)
//   s.barbAttack.knights   edge id -> owner
export function initBarbarianAttack(s) {
  const on = {};
  for (const id of s.board.barbStart) on[id] = 1;
  s.barbAttack = { on, pool: BARBARIANS - s.board.barbStart.length, conquered: [], knights: {} };
  for (const p of s.players) {
    p.gold = 0;
    p.prisoners = 0;
    p.knightsLeft = KNIGHTS;
  }
}
