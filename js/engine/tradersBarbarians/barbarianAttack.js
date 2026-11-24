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
  s.devDeck = []; // the base development cards are not used (the scenario's own deck comes later)
  s.config.rules.setupCity = true; // the second starting settlement is a city
  for (const p of s.players) {
    p.gold = 0;
    p.prisoners = 0;
    p.knightsLeft = KNIGHTS;
  }
}

// ---------------- rules ----------------

export const LANDINGS = 3; // barbarians per attack (each on a different hex)
const MAX_ROLLS = 40; // safety net for odd maps (a number missing on the coast is simply re-rolled)

export const isConquered = (s, hex) => !!s.barbAttack && s.barbAttack.conquered.includes(hex);
// a building is conquered when every land hex around it is (the sea frame counts as conquered)
export function buildingConquered(s, v) {
  if (!s.barbAttack) return false;
  const hexes = s.board.vertices[v].hexes;
  return hexes.length > 0 && hexes.every(h => s.barbAttack.conquered.includes(h));
}
// no new settlement next to a conquered hex, no road along one
export const vertexBlocked = (s, v) => !!s.barbAttack && s.board.vertices[v].hexes.some(h => s.barbAttack.conquered.includes(h));
export const edgeBlocked = (s, e) => !!s.barbAttack && s.board.edges[e].hexes.some(h => s.barbAttack.conquered.includes(h));

// One barbarian onto a coastal hex; 3 conquer it. Returns true if this one conquered it.
export function placeBarbarian(s, hex) {
  const B = s.barbAttack;
  if (B.pool <= 0 || isConquered(s, hex)) return false;
  B.on[hex] = (B.on[hex] || 0) + 1;
  B.pool--;
  if (B.on[hex] >= CONQUER_AT) {
    B.conquered.push(hex);
    return true;
  }
  return false;
}

// An attack after a settlement / city: up to 3 rolls, each lands on a different coastal hex with
// that number. 7s, hexes already hit in this attack and conquered hexes are re-rolled; when the
// number sits on several coastal hexes one of them is picked at random.
// Returns [{ hex, roll, conquered }].
export function landBarbarians(s) {
  const B = s.barbAttack, bd = s.board, out = [];
  const d6 = () => 1 + Math.floor(rand(s.rng) * 6);
  const free = bd.coast.filter(h => !isConquered(s, h));
  for (let n = 0, tries = 0; n < LANDINGS && B.pool > 0 && tries < MAX_ROLLS; tries++) {
    if (!free.some(h => !out.some(o => o.hex === h))) break; // nowhere left to land
    const roll = d6() + d6();
    if (roll === 7) continue;
    const spots = free.filter(h => bd.tiles[h].num === roll && !out.some(o => o.hex === h));
    if (!spots.length) continue;
    const hex = spots[Math.floor(rand(s.rng) * spots.length)];
    out.push({ hex, roll, conquered: placeBarbarian(s, hex) });
    n++;
  }
  return out;
}

// who the current player may steal from on a 7 (no robber: anyone with cards)
export const stealVictims = (s, pid) => s.players.filter(o => o.id !== pid && !o.retired && Object.values(o.res).some(n => n > 0)).map(o => o.id);
