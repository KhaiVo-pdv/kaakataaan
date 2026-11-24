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

// ---------------- knights, cards and expelling barbarians ----------------

// The scenario's own card deck (official counts unknown: proposal, balanced with bot games).
// Cards are revealed and resolved on purchase; when the deck runs out it is reshuffled.
export const CARD_DECK = { knight: 16, blackKnight: 4, treason: 3, intrigue: 3 };
export const KNIGHT_STEPS = 3; // free paths per knight per turn
export const KNIGHT_MAX_STEPS = 5; // each path beyond 3 costs 1 grain
export const TREASON_GOLD = 2;
export const TREASON_MOVES = 2;
export const LOST_KNIGHT_GOLD = 3; // a knight lost after a battle, or a prisoner lost on the die
export const PRISONERS_PER_VP = 2;

export function newCardDeck(rng) {
  const deck = [];
  for (const [type, n] of Object.entries(CARD_DECK)) for (let i = 0; i < n; i++) deck.push(type);
  return shuffle(rng, deck);
}
export function drawCard(s) {
  const B = s.barbAttack;
  if (!B.deck || !B.deck.length) B.deck = newCardDeck(s.rng);
  return B.deck.pop();
}

// the 6 paths of a hex in order around it (path i and path i + 3 are opposite)
export function hexPaths(s, hex) {
  const bd = s.board, vs = bd.tiles[hex].verts, out = [];
  for (let i = 0; i < 6; i++) {
    const a = vs[i], b = vs[(i + 1) % 6];
    const e = bd.vertices[a].edges.find(id => bd.edges[id].a === Math.min(a, b) && bd.edges[id].b === Math.max(a, b));
    out.push(e);
  }
  return out;
}
export const knightAt = (s, e) => (s.barbAttack.knights[e] ?? null);
export const knightsOf = (s, pid) => Object.keys(s.barbAttack.knights).filter(e => s.barbAttack.knights[e] === pid).map(Number);
export const isCastlePath = (s, e) => s.board.castlePaths.includes(e);
export const freeCastlePaths = (s) => s.board.castlePaths.filter(e => knightAt(s, e) == null);
export const freePaths = (s) => s.board.edges.filter(e => knightAt(s, e.id) == null).map(e => e.id);
export const prisonerVP = p => Math.floor((p.prisoners || 0) / PRISONERS_PER_VP);

// paths a knight may reach from `from` in up to KNIGHT_MAX_STEPS steps (it may pass through
// anything): Map edge -> distance. Ending paths must be free and not around the castle.
export function knightReach(s, from) {
  const bd = s.board, dist = new Map([[from, 0]]);
  let frontier = [from];
  for (let d = 1; d <= KNIGHT_MAX_STEPS && frontier.length; d++) {
    const next = [];
    for (const e of frontier) for (const v of [bd.edges[e].a, bd.edges[e].b]) for (const n of bd.vertices[v].edges) {
      if (dist.has(n)) continue;
      dist.set(n, d);
      next.push(n);
    }
    frontier = next;
  }
  const out = new Map();
  for (const [e, d] of dist) if (d > 0 && knightAt(s, e) == null && !isCastlePath(s, e)) out.set(e, d);
  return out;
}
export const moveCost = d => Math.max(0, d - KNIGHT_STEPS); // grain

// hexes in the order they are checked at the end of a turn: around the board clockwise, starting
// just after the castle
export function battleOrder(s) {
  const bd = s.board, c = bd.tiles[bd.castle];
  const cx = bd.tiles.reduce((a, t) => a + t.x, 0) / bd.tiles.length, cy = bd.tiles.reduce((a, t) => a + t.y, 0) / bd.tiles.length;
  const ang = t => Math.atan2(t.y - cy, t.x - cx);
  const a0 = ang(c);
  const rel = t => { let d = ang(t) - a0; while (d <= 0) d += 2 * Math.PI; return d; };
  return [...bd.coast].sort((a, b) => rel(bd.tiles[a]) - rel(bd.tiles[b]));
}

// End of a turn: every hex with barbarians where knights outnumber them is freed. Barbarians become
// prisoners of the knights' owners; then a die removes the knights on one pair of opposite paths.
// Returns [{ hex, freed: n, prisoners: { pid: n }, gold: { pid: n }, lost: [{ pid, at }] }].
export function expelBarbarians(s) {
  const B = s.barbAttack, out = [];
  const d6 = () => 1 + Math.floor(rand(s.rng) * 6);
  for (const hex of battleOrder(s)) {
    const n = B.on[hex] || 0;
    if (!n) continue;
    const paths = hexPaths(s, hex);
    const ks = paths.filter(e => knightAt(s, e) != null);
    if (ks.length <= n) continue;
    const count = {};
    for (const e of ks) count[B.knights[e]] = (count[B.knights[e]] || 0) + 1;
    const involved = Object.keys(count).map(Number).sort((a, b) => count[b] - count[a] || rand(s.rng) - 0.5);
    const prisoners = {}, gold = {};
    if (involved.length === 1) prisoners[involved[0]] = n;
    else {
      // one each while they last (a die decides who misses out; they get gold instead), the rest
      // to whoever has the most knights there
      let left = n;
      const order = n >= involved.length ? involved : shuffle(s.rng, [...involved]);
      for (const pid of order) {
        if (left > 0) { prisoners[pid] = 1; left--; } else gold[pid] = LOST_KNIGHT_GOLD;
      }
      if (left > 0) prisoners[involved[0]] += left;
    }
    for (const [pid, k] of Object.entries(prisoners)) s.players[pid].prisoners += k;
    for (const [pid, g] of Object.entries(gold)) s.players[pid].gold += g;
    delete B.on[hex];
    B.conquered = B.conquered.filter(h => h !== hex);
    // the die: the knights on one pair of opposite paths fall
    const k = (d6() - 1) % 3, lost = [];
    for (const e of [paths[k], paths[k + 3]]) {
      const pid = knightAt(s, e);
      if (pid == null) continue;
      delete B.knights[e];
      s.players[pid].knightsLeft++;
      s.players[pid].gold += LOST_KNIGHT_GOLD;
      lost.push({ pid, at: e });
    }
    out.push({ hex, freed: n, prisoners, gold, lost });
  }
  return out;
}

// Treason: move up to 2 barbarians between free coastal hexes (none from or onto a conquered hex)
export function treasonMoveOk(s, from, to) {
  const B = s.barbAttack, bd = s.board;
  return from !== to && bd.coast.includes(from) && bd.coast.includes(to) && (B.on[from] || 0) > 0 && !isConquered(s, from) && !isConquered(s, to);
}
export function moveBarbarian(s, from, to) {
  const B = s.barbAttack;
  if (!--B.on[from]) delete B.on[from];
  B.on[to] = (B.on[to] || 0) + 1;
  if (B.on[to] >= CONQUER_AT && !B.conquered.includes(to)) { B.conquered.push(to); return true; }
  return false;
}
// Intrigue: one barbarian from any hex becomes your prisoner (a conquered hex is freed)
export function takePrisoner(s, pid, hex) {
  const B = s.barbAttack;
  if (!--B.on[hex]) delete B.on[hex];
  B.conquered = B.conquered.filter(h => h !== hex || (B.on[h] || 0) >= CONQUER_AT);
  s.players[pid].prisoners++;
}
// can this card do anything right now?
export function cardPlayable(s, pid, type) {
  const B = s.barbAttack;
  if (type === 'knight') return s.players[pid].knightsLeft > 0 && (freeCastlePaths(s).length > 0 || freePaths(s).length > 0);
  if (type === 'blackKnight') return s.players[pid].knightsLeft > 0 && freePaths(s).length > 0;
  if (type === 'intrigue') return Object.keys(B.on).length > 0;
  return true; // treason always gives gold
}
// where a new knight may go: Knighthood → a free castle path (if all are taken, any free path)
export function knightSpots(s, type) {
  if (type === 'knight') { const c = freeCastlePaths(s); return c.length ? c : freePaths(s); }
  return freePaths(s);
}
