// Cities & Knights science progress cards: what each one may target. The moves themselves live in
// game.js (H.playProgress), which checks everything here before changing the state.
import { legalPromotions } from './knights.js';
import { legalWalls } from './improvements.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

// Inventor: number tokens that may be swapped (never 2, 12, 6 or 8)
const FIXED = new Set([2, 12, 6, 8]);
export const inventorTiles = s => s.board.tiles.filter(t => t.num && !FIXED.has(t.num)).map(t => t.id);

// Irrigation / Mining: tiles of `res` next to at least one of your settlements or cities
export function tilesNextToYou(s, pid, res) {
  const out = new Set();
  for (const k in s.buildings) {
    if (s.buildings[k].owner !== pid) continue;
    for (const h of s.board.vertices[k].hexes) if (s.board.tiles[h] && s.board.tiles[h].res === res) out.add(h);
  }
  return [...out];
}
export const HARVEST = { irrigation: 'wheat', mining: 'ore' };
export const harvestGain = (s, pid, card) => Math.min(s.bank[HARVEST[card]], 2 * tilesNextToYou(s, pid, HARVEST[card]).length);

export const MEDICINE_COST = { ore: 2, wheat: 1 };
export const SMITH_FREE = 2;

// Smith: up to 2 different knights; the second check runs as if the first was promoted already
export function smithBlock(s, pid, list) {
  if (!Array.isArray(list) || !list.length || list.length > SMITH_FREE || new Set(list).size !== list.length) return tk('Elige uno o dos caballeros distintos.');
  if (!list.every(v => legalPromotions(s, pid).includes(v))) return tk('No puedes ascender ese caballero.');
  if (list.length === 2) {
    const [a, b] = list.map(v => s.knights[v].level);
    if (a === b && s.players[pid].knightsLeft[a + 1] < 2) return tk('No te quedan caballeros de ese nivel.');
  }
  return '';
}

export const engineerSpots = (s, pid) => legalWalls(s, pid);
