// "Catan for Two" (Traders & Barbarians variant, config.rules.catanForTwo): two real players and two
// neutral players. The neutrals are extra entries in s.players flagged `neutral` (and `retired`, so
// they never take a turn, roll, produce, discard, trade or win — the engine already skips retired
// seats); their pieces are built for free by the real players. Only for 2-player base games.
import { pips } from './constants.js';

export const NEUTRALS = 2;
export const NEUTRAL_NAMES = ['Neutral 1', 'Neutral 2'];
export const NEUTRAL_COLORS = ['#9e9e9e', '#6d4c41']; // grey and brown: clearly nobody's colour

export const isNeutral = (s, pid) => !!(s.players[pid] && s.players[pid].neutral);
export const neutrals = s => s.players.filter(p => p.neutral).map(p => p.id);

// the two starting settlements: good (not the best) corners on three land hexes, far apart
export function neutralStarts(board) {
  const { tiles, vertices } = board;
  const score = v => v.hexes.reduce((a, h) => a + (tiles[h].num ? pips(tiles[h].num) : 0), 0);
  const land = vertices.filter(v => v.hexes.length === 3 && v.hexes.every(h => tiles[h].res !== 'desert' && tiles[h].num));
  const ranked = [...land].sort((a, b) => score(b) - score(a) || a.id - b.id);
  const pool = ranked.slice(Math.floor(ranked.length * 0.15), Math.max(4, Math.ceil(ranked.length * 0.5)));
  let bestPair = null, bestD = -1;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i], b = pool[j];
    if (a.adj.includes(b.id)) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > bestD) { bestD = d; bestPair = [a.id, b.id]; }
  }
  return bestPair || [];
}

// adds the neutral seats and their settlements (call after the real players exist)
export function initCatanForTwo(s, colors, R) {
  const used = new Set(s.players.map(p => p.color));
  const free = [...NEUTRAL_COLORS.filter(c => !used.has(c)), ...colors.filter(c => !used.has(c))];
  const starts = neutralStarts(s.board);
  for (let k = 0; k < NEUTRALS; k++) {
    const id = s.players.length;
    s.players.push({
      id, name: NEUTRAL_NAMES[k], color: free[k] || '#9e9e9e', kind: 'neutral', level: 'normal', flag: null, style: null,
      retired: true, neutral: true,
      res: Object.fromEntries(Object.keys(s.players[0].res).map(r => [r, 0])), dev: [], knights: 0, roadLen: 0,
      roadsLeft: R.maxRoads, settlementsLeft: R.maxSettlements, citiesLeft: R.maxCities,
      stats: { gained: 0, stolen: 0, lost: 0 }, adhdWins: 0,
    });
    if (starts[k] != null) {
      s.buildings[starts[k]] = { owner: id, type: 'settlement' };
      s.players[id].settlementsLeft--;
    }
  }
  s.two = { roll: null }; // { turn, n } — the second production roll of a turn
}
