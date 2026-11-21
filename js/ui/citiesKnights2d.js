// Cities & Knights pieces on the flat SVG board (boardView.js): knights, city walls, metropolises.
// U is the svg units per hex radius; S makes svg elements.
import { TRACKS, TRACK_INFO } from '../engine/citiesKnights/improvements.js';

const SHIELD = 'M-11,-12 L11,-12 L11,1 Q11,11 0,15 Q-11,11 -11,1 Z';

export function drawKnights(S, U, st) {
  const g = S('g', { class: 'knights' });
  for (const k in st.knights || {}) {
    const kn = st.knights[k];
    const V = st.board.vertices[k];
    const color = st.players[kn.owner].color;
    const piece = S('g', { class: 'piece knight' + (kn.active ? ' active' : ''), transform: `translate(${V.x * U},${V.y * U}) scale(1.25)`, filter: 'url(#shadow)' });
    if (kn.active) piece.append(S('circle', { r: 19, fill: 'none', stroke: '#ffcd75', 'stroke-width': 4 }));
    else piece.append(S('circle', { r: 19, fill: 'none', stroke: '#8a93a8', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    piece.append(S('path', { d: SHIELD, fill: color, stroke: '#1a1c2c', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    for (let i = 0; i < kn.level; i++) piece.append(S('circle', { cx: (i - (kn.level - 1) / 2) * 7, cy: 0, r: 2.8, fill: '#fff', stroke: '#1a1c2c', 'stroke-width': 1 }));
    g.append(piece);
  }
  return g;
}

// a stone ring around walled cities and a small coloured banner on metropolises
export function drawWallsAndMetros(S, U, st) {
  const g = S('g', { class: 'ck-marks' });
  for (const k in st.walls || {}) {
    const V = st.board.vertices[k];
    g.append(S('circle', { cx: V.x * U, cy: V.y * U, r: U * 0.34, fill: 'none', stroke: '#8d8d99', 'stroke-width': 6, 'stroke-dasharray': '7 3' }));
  }
  for (const tr of TRACKS) {
    const m = st.metropolis && st.metropolis[tr];
    if (!m) continue;
    const V = st.board.vertices[m.at];
    g.append(S('text', { x: V.x * U + U * 0.28, y: V.y * U - U * 0.3, 'font-size': 20, 'text-anchor': 'middle' }, TRACK_INFO[tr].icon));
  }
  return g;
}

// the merchant piece on its tile (trade progress card)
export function drawMerchant(S, U, st) {
  const m = st.merchant;
  if (!m) return null;
  const t = st.board.tiles[m.tile];
  const g = S('g', { class: 'piece merchant', transform: `translate(${t.x * U + U * 0.38},${t.y * U - U * 0.28})`, filter: 'url(#shadow)' });
  g.append(S('circle', { r: 15, fill: st.players[m.owner].color, stroke: '#1a1c2c', 'stroke-width': 2.5 }));
  // a gold coin on the owner's token (emoji fonts are not reliable inside the svg)
  g.append(S('circle', { r: 7, fill: '#ffcd75', stroke: '#8a5a1c', 'stroke-width': 2 }));
  g.append(S('rect', { x: -1.5, y: -4, width: 3, height: 8, fill: '#8a5a1c' }));
  return g;
}
