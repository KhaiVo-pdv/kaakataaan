// Explorers & Pirates, Pirate Lairs mission: the gold fields of the unexplored areas hide
// pirate lairs. Discovering one puts a lair on it; until crews capture it (step 4) nothing
// may be built on its corners or edges and it produces nothing.
// State: s.explorers.lairs[tileId] = { crews: [pid...], captured }. Only with epFlag(s, 'lairs').

export function addLair(s, tileId) {
  s.explorers.lairs[tileId] = { crews: [], captured: false };
}

const active = (s, h) => {
  const L = s.explorers && s.explorers.lairs && s.explorers.lairs[h];
  return !!L && !L.captured;
};

// true when a tile is, or a vertex / edge touches, a tile with an uncaptured lair
export function lairBlocks(s, kind, id) {
  if (!s.explorers || !s.explorers.lairs) return false;
  if (kind === 'tile') return active(s, id);
  const bd = s.board;
  const x = kind === 'vertex' ? bd.vertices[id] : bd.edges[id];
  return !!x && x.hexes.some(h => active(s, h));
}
