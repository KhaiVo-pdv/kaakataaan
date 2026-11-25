// Explorers & Pirates: the unexplored areas. Their hexes start face down and are turned
// over by ships (discovery comes with the ship rules). Only used when the expansion is on.

// Sets up s.explorers and hides every face-down hex (land and sea).
export function initExplorers(s) {
  s.explorers = { scenario: s.board.explorers.scenario, buys: null }; // buys: gold purchases this turn (Rivers.goldBox)
  for (const p of s.players) p.gold = 0;
  for (const t of s.board.tiles) if (t.fog) t.revealed = t.numRevealed = false;
  for (const t of s.board.sea) if (t.fog) t.revealed = false;
}
