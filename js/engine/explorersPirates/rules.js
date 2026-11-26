// Explorers & Pirates: costs, pieces and small rule helpers shared by the engine, bots and UI.
// Only used when config.expansions.explorersPirates is on.

export const HARBOR_COST = { wheat: 2, ore: 2 }; // upgrade a coastal settlement
export const HARBOR_VP = 2;
export const SHIP_COST = { wood: 1, sheep: 1 };
export const SETTLER_COST = { wood: 1, brick: 1, sheep: 1, wheat: 1 }; // same as a settlement
export const PIECES = { settlements: 5, roads: 15, harbors: 4, ships: 3, settlers: 2 };
export const SHIP_MP = 4; // edges a ship sails per turn
export const BOOST_MP = 2; // +2 for 1 wool, once per ship per turn
export const BOOST_COST = { sheep: 1 };
export const MAX_SHIPS_PER_EDGE = 2;
export const DISCOVER_SEA_GOLD = 2; // turning over a sea hex
export const NO_PRODUCTION_GOLD = 1; // a roll (not a 7) that gives you nothing
export const EP_TRADE_RATIO = 3; // no harbours: every bank trade is 3:1

const hidden = t => !!t && t.fog && !t.revealed;

// true when a vertex / edge touches a face-down hex (land or sea): nothing may be built there
export function nearHidden(s, kind, id) {
  const bd = s.board;
  const x = kind === 'vertex' ? bd.vertices[id] : bd.edges[id];
  if (!x) return false;
  return x.hexes.some(h => hidden(bd.tiles[h])) || (x.sea || []).some(t => hidden(bd.sea[t]));
}

// a harbor settlement replaces one of your own settlements on the coast
export function canBuildHarbor(s, pid, v) {
  const b = s.buildings[v], V = s.board.vertices[v];
  return !!b && !!V && b.owner === pid && b.type === 'settlement' && (V.sea || []).length > 0 && s.players[pid].harborsLeft > 0;
}
