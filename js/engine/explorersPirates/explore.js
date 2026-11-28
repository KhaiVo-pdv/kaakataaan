import { DISCOVER_SEA_GOLD } from './rules.js';
import { EP_SCENARIOS, epFlag } from './scenarios.js';

// Explorers & Pirates: the unexplored areas. Their hexes start face down and are turned
// over by ships (discovery comes with the ship rules). Only used when the expansion is on.

// Sets up s.explorers and hides every face-down hex (land and sea).
export function initExplorers(s) {
  s.explorers = { scenario: s.board.explorers.scenario, buys: null, waiting: {} }; // buys: gold purchases this turn (Rivers.goldBox); waiting: harbor vertex -> pid of a settler waiting there
  for (const p of s.players) p.gold = EP_SCENARIOS[s.explorers.scenario].startGold || 0;
  if (epFlag(s, 'lairs')) s.explorers.lairs = {}; // Pirate Lairs: tile id -> { crews, captured }
  for (const t of s.board.tiles) if (t.fog) t.revealed = t.numRevealed = false;
  for (const t of s.board.sea) if (t.fog) t.revealed = false;
}

// A ship arrived on edge e: every face-down hex touching it turns over. Land shows its number
// and pays 1 card of its type (if the bank has one); sea pays 2 gold. Returns what was found.
export function discover(s, pid, e, give) {
  const bd = s.board, E = bd.edges[e], p = s.players[pid];
  const found = [];
  for (const h of E.hexes) {
    const t = bd.tiles[h];
    if (!t.fog || t.revealed) continue;
    t.revealed = t.numRevealed = true;
    const got = t.res !== 'desert' && s.bank[t.res] > 0;
    if (got) give(pid, t.res, 1);
    found.push({ tile: h, res: t.res, got });
  }
  for (const id of E.sea || []) {
    const t = bd.sea[id];
    if (!t.fog || t.revealed) continue;
    t.revealed = true;
    p.gold += DISCOVER_SEA_GOLD;
    found.push({ sea: id, gold: DISCOVER_SEA_GOLD });
  }
  return found;
}
