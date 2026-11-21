// Seafarers pieces for the flat SVG board (boardView.js): ships, the pirate and their pick spots.
// U is the SVG units per hex radius; S creates SVG elements.
import { shipPose } from './seafarersPose.js';

const HULL = 'M-17,2 L17,2 L11,9 L-12,9 Z';
const SAIL = 'M-1,-17 L-1,0 L12,0 Z';

function shipShape(S, color, stroke) {
  const g = S('g', null);
  g.append(S('path', { d: HULL, fill: '#7a4a26', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  g.append(S('line', { x1: -2, y1: 2, x2: -2, y2: -19, stroke: '#5a3519', 'stroke-width': 2.5 }));
  g.append(S('path', { d: SAIL, fill: color, stroke, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
  return g;
}

// ships; returns the piece keys so new ones can pop in like roads do
export function drawShips(S, U, st, prevPieces) {
  const g = S('g', { class: 'ships' });
  const keys = [];
  for (const k in st.ships || {}) {
    const p = shipPose(st.board, +k);
    const color = st.players[st.ships[k]].color;
    const key = 's' + k;
    keys.push(key);
    const isNew = prevPieces.size && !prevPieces.has(key);
    const sh = shipShape(S, color, '#1a1c2c');
    sh.setAttribute('class', 'piece ship' + (isNew ? ' new' : ''));
    sh.setAttribute('transform', `translate(${p.x * U},${p.z * U}) scale(1.5)`);
    sh.setAttribute('filter', 'url(#shadow)');
    g.append(sh);
  }
  return { g, keys };
}

export function drawPirate(S, U, bd) {
  const t = bd.pirate !== undefined && bd.pirate >= 0 ? bd.sea[bd.pirate] : null;
  if (!t) return null;
  const g = shipShape(S, '#15151a', '#000');
  g.setAttribute('class', 'pirate');
  g.setAttribute('transform', `translate(${t.x * U},${t.y * U}) scale(2)`);
  g.setAttribute('filter', 'url(#shadow)');
  g.append(S('rect', { x: -3, y: -25, width: 9, height: 5, fill: '#d62f2f' }));
  return g;
}

// pick spots: 'ship' -> water edges, 'pirate' -> sea tiles
export function drawSeaHotspots(S, U, bd, inter, legal, pick, hexPoints) {
  const g = S('g', { class: 'hot' });
  if (inter.kind === 'ship')
    for (const e of legal) {
      // a glowing line along the edge, like road spots, plus a round spot where the ship floats
      const E = bd.edges[e], a = bd.vertices[E.a], c = bd.vertices[E.b];
      const x1 = (a.x + (c.x - a.x) * 0.24) * U, y1 = (a.y + (c.y - a.y) * 0.24) * U;
      const x2 = (c.x + (a.x - c.x) * 0.24) * U, y2 = (c.y + (a.y - c.y) * 0.24) * U;
      g.append(S('line', { x1, y1, x2, y2, class: 'hot-e-bg' }));
      g.append(S('line', { x1, y1, x2, y2, class: 'hot-e', style: `--pc:${inter.color || '#fff'}` }));
      const p = shipPose(bd, e);
      g.append(S('circle', { cx: p.x * U, cy: p.z * U, r: 14, class: 'hot-v', style: `--pc:${inter.color || '#fff'}` }));
      g.append(S('circle', { cx: p.x * U, cy: p.z * U, r: 26, class: 'hit', 'data-testid': 'spot', 'data-spot': 'e' + e, onclick: ev => pick(e, ev) }));
    }
  if (inter.kind === 'pirate')
    for (const id of legal) {
      const t = bd.sea[id];
      g.append(S('polygon', { points: hexPoints(t.x * U, t.y * U, U * 0.9), class: 'hot-tile', 'data-testid': 'spot', 'data-spot': 's' + id, onclick: ev => pick(id, ev) }));
    }
  return g;
}

// face-down fog sea tiles look exactly like face-down fog land, so the sea doesn't give them away
export function drawSeaFog(S, U, bd, hexPoints) {
  const g = S('g', { class: 'land' });
  for (const t of bd.sea) {
    if (!t.fog || t.revealed) continue;
    const cx = t.x * U, cy = t.y * U;
    const tile = S('g', { class: 'tile fog' });
    tile.append(S('polygon', { points: hexPoints(cx, cy, U * 0.97), fill: 'url(#fogP)', stroke: '#3e465a', 'stroke-width': 5, class: 'hex' }));
    tile.append(S('polygon', { points: hexPoints(cx, cy, U * 0.8), fill: 'none', stroke: '#6d7894', 'stroke-width': 3, opacity: 0.55 }));
    tile.append(S('text', { x: cx, y: cy + 16, class: 'tile-icon fog-icon', 'font-size': 58 }, '☁️'));
    tile.append(S('text', { x: cx, y: cy + 8, class: 'fog-q' }, '?'));
    g.append(tile);
  }
  return g;
}
