// Explorers & Pirates: ships on the 2D board (temporary look until the graphics pass).
import { shipShape } from './seafarers2d.js';
import { shipPose } from './seafarersPose.js';

// where a ship sits: the edge's spot, the second ship on the same edge a little aside
export function epShipSpot(bd, ships, ship) {
  const p = shipPose(bd, ship.edge);
  const same = ships.filter(x => x.edge === ship.edge);
  if (same.length > 1 && same[1] === ship) {
    const E = bd.edges[ship.edge], a = bd.vertices[E.a], b = bd.vertices[E.b];
    const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz) || 1;
    return { ...p, x: p.x + (-dz / len) * 0.28, z: p.z + (dx / len) * 0.28 };
  }
  return p;
}

export function drawEpShips(S, U, st, prevPieces) {
  const g = S('g', { class: 'ships ep-ships' });
  const keys = [];
  for (const ship of st.epShips || []) {
    const p = epShipSpot(st.board, st.epShips, ship);
    const color = st.players[ship.owner].color;
    const key = 'eps' + ship.id + ':' + ship.edge;
    keys.push(key);
    const isNew = prevPieces.size && !prevPieces.has(key);
    const sh = shipShape(S, color, '#1a1c2c');
    sh.setAttribute('class', 'piece ship ep-ship' + (isNew ? ' new' : ''));
    sh.setAttribute('transform', `translate(${p.x * U},${p.z * U}) scale(1.5)`);
    sh.setAttribute('filter', 'url(#shadow)');
    sh.setAttribute('data-ship', ship.id);
    g.append(sh);
    if (ship.cargo.includes('settler')) g.append(S('text', { x: p.x * U + 10, y: p.z * U - 8, 'font-size': 11, class: 'ep-cargo' }, '👤'));
  }
  return { g, keys };
}
