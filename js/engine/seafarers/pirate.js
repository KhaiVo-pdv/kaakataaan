// Seafarers pirate: the robber's twin on the sea. On a 7 or a knight the player moves either
// the robber or the pirate. The pirate sits on a sea tile (board.pirate = sea id):
//   - no ship may be built on, moved onto or moved away from the edges around it
//   - whoever moves it steals one card from a rival with a ship on those edges
// Only used when Seafarers is on (board.pirate exists).

export const hasPirate = s => s.board.pirate !== undefined;

// edges around a sea tile
export function seaTileEdges(s, id) {
  const t = s.board.sea[id];
  if (!t) return [];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = t.verts[i], b = t.verts[(i + 1) % 6];
    const e = s.board.vertices[a].edges.find(x => {
      const E = s.board.edges[x];
      return (E.a === a && E.b === b) || (E.a === b && E.b === a);
    });
    if (e !== undefined) out.push(e);
  }
  return out;
}

// true when the pirate guards edge e
export function pirateBlocks(s, e) {
  const p = s.board.pirate;
  return p !== undefined && p >= 0 && s.board.edges[e].sea.includes(p);
}

export function legalPirateTiles(s) {
  if (!hasPirate(s)) return [];
  return s.board.sea.filter(t => t.id !== s.board.pirate).map(t => t.id);
}

// rivals with a ship next to sea tile `id` and at least one card
export function pirateVictims(s, pid, id, handSize) {
  const out = new Set();
  for (const e of seaTileEdges(s, id)) {
    const o = s.ships && s.ships[e];
    if (o !== undefined && o !== pid && handSize(s.players[o].res) > 0) out.add(o);
  }
  return [...out];
}
