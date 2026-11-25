// Explorers & Pirates: fixed start positions. Instead of the placement rounds every player
// gets a settlement + road, a harbor settlement and a ship carrying a settler.
import { EP_MAPS } from './maps.js';
import { PIECES } from './rules.js';

function vertexAt(bd, { x, y }) {
  const v = bd.vertices.find(V => Math.abs(V.x - x) < 0.05 && Math.abs(V.y - y) < 0.05);
  if (!v) throw new Error(`E&P start: no vertex at ${x},${y}`);
  return v.id;
}
const edgeBetween = (bd, a, b) => bd.vertices[a].edges.find(e => bd.edges[e].a === b || bd.edges[e].b === b);

// Places every player's start pieces and pays the resources around the settlement.
// `give(pid, res, n)` takes cards from the bank (the engine's giveFromBank).
export function placeStarts(s, give) {
  const bd = s.board;
  const map = EP_MAPS[s.explorers.scenario] || EP_MAPS.landHo;
  const n = s.players.length;
  const seats = map.seatsFor[Math.min(Math.max(n, 2), 4)].concat([...Array(Math.max(0, n - 4)).keys()].map(() => null));
  s.epShips = [];
  s.players.forEach((p, i) => {
    p.settlementsLeft = PIECES.settlements;
    p.roadsLeft = PIECES.roads;
    p.harborsLeft = PIECES.harbors;
    p.shipsLeft = PIECES.ships;
    p.settlersLeft = PIECES.settlers;
    p.citiesLeft = 0;
    const seat = seats[i] == null ? null : map.starts[seats[i]];
    if (!seat) return; // more players than seats: they start with nothing (the lobby warns)
    const sv = vertexAt(bd, seat.settlement), rv = vertexAt(bd, seat.road), hv = vertexAt(bd, seat.harbor);
    s.buildings[sv] = { owner: p.id, type: 'settlement' };
    s.buildings[hv] = { owner: p.id, type: 'harbor' };
    s.roads[edgeBetween(bd, sv, rv)] = p.id;
    p.settlementsLeft--;
    p.harborsLeft--;
    p.roadsLeft--;
    const taken = new Set(s.epShips.map(x => x.edge));
    const edge = bd.vertices[hv].edges.filter(e => (bd.edges[e].kind === 'coast' || bd.edges[e].kind === 'sea') && !taken.has(e)).sort((a, b) => a - b)[0];
    s.epShips.push({ id: s.epShips.length, owner: p.id, edge, cargo: ['settler'] });
    p.shipsLeft--;
    p.settlersLeft--;
    for (const h of bd.vertices[sv].hexes) {
      const r = bd.tiles[h].res;
      if (r !== 'desert') give(p.id, r, 1);
    }
  });
}
