// Explorers & Pirates: ships are pieces that sail on the water edges (not Seafarers' ship-roads).
// A ship: { id, owner, edge, cargo[], mpLeft, boosted, turn } — mpLeft/boosted reset lazily
// the first time the ship is looked at in a new turn (`turn` = the s.turn they belong to).
import { SHIP_MP, MAX_SHIPS_PER_EDGE } from './rules.js';

export const sailable = (bd, e) => !!bd.edges[e] && (bd.edges[e].kind === 'sea' || bd.edges[e].kind === 'coast');
export const shipsOn = (s, e) => s.epShips.filter(x => x.edge === e).length;

const hidden = t => !!t && t.fog && !t.revealed;
// an edge touching a face-down hex: arriving there discovers it
export const discoveryEdge = (s, e) => {
  const E = s.board.edges[e];
  return E.hexes.some(h => hidden(s.board.tiles[h])) || (E.sea || []).some(t => hidden(s.board.sea[t]));
};

// water edges at one of your harbor settlements with room for a new ship
export function shipBuildEdges(s, pid) {
  const out = new Set();
  for (const k in s.buildings) {
    const b = s.buildings[k];
    if (b.owner !== pid || b.type !== 'harbor') continue;
    for (const e of s.board.vertices[k].edges) if (sailable(s.board, e) && shipsOn(s, e) < MAX_SHIPS_PER_EDGE) out.add(e);
  }
  return [...out].sort((a, b) => a - b);
}

// movement points left this turn (resets once per turn)
export function shipMp(s, ship) {
  if (ship.turn !== s.turn) {
    ship.turn = s.turn;
    ship.mpLeft = SHIP_MP;
    ship.boosted = false;
  }
  return ship.mpLeft;
}

const neighbours = (bd, e) => {
  const E = bd.edges[e];
  return bd.vertices[E.a].edges.concat(bd.vertices[E.b].edges).filter(x => x !== e);
};

// every edge the ship can stop on this turn, with its cost (BFS, 1 point per edge). Edges with
// 2 other ships can be sailed through but not stopped on; a discovery edge ends the move.
export function reachable(s, ship, mp = shipMp(s, ship)) {
  const bd = s.board;
  const out = new Map();
  const seen = new Map([[ship.edge, 0]]);
  let frontier = [ship.edge];
  for (let cost = 1; cost <= mp && frontier.length; cost++) {
    const next = [];
    for (const e of frontier) {
      if (e !== ship.edge && discoveryEdge(s, e)) continue; // you stop when you discover
      for (const n of neighbours(bd, e)) {
        if (seen.has(n) || !sailable(bd, n)) continue;
        seen.set(n, cost);
        next.push(n);
        const others = s.epShips.filter(x => x.edge === n && x !== ship).length;
        if (others < MAX_SHIPS_PER_EDGE) out.set(n, cost);
      }
    }
    frontier = next;
  }
  return out;
}

// shortest distance (ignoring movement points) from an edge to every sailable edge
export function distances(s, from) {
  const bd = s.board;
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const e = q.shift();
    if (e !== from && discoveryEdge(s, e)) continue;
    for (const n of neighbours(bd, e)) if (!d.has(n) && sailable(bd, n)) { d.set(n, d.get(e) + 1); q.push(n); }
  }
  return d;
}
