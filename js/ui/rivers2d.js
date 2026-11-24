// Traders & Barbarians, Rivers of Catan on the flat SVG board (boardView.js): marshes, the rivers,
// free bridge spots and built bridges. U is the svg units per hex radius; shapes only (no emoji).

const mid = (bd, e) => {
  const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
  return { a, b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

// drawn right after the land tiles (under roads and buildings)
export function drawRivers(S, U, st, hexPoints) {
  const bd = st.board;
  const g = S('g', { class: 'rivers' });
  // marshes: olive ground, two puddles and reed strokes
  for (const id of bd.marsh || []) {
    const t = bd.tiles[id];
    if (!t.revealed) continue;
    const cx = t.x * U, cy = t.y * U;
    g.append(S('polygon', { points: hexPoints(cx, cy, U * 0.97), fill: '#8fa35a', stroke: '#4f5f2a', 'stroke-width': 4 }));
    for (const [px, py, rx, ry] of [[-0.28, 0.12, 0.26, 0.13], [0.3, -0.22, 0.2, 0.1]]) g.append(S('ellipse', { cx: cx + px * U, cy: cy + py * U, rx: rx * U, ry: ry * U, fill: '#4f9fd6', stroke: '#2b6c9c', 'stroke-width': 2 }));
    for (const [px, py] of [[-0.55, -0.2], [-0.05, -0.45], [0.45, 0.25], [0.05, 0.45], [-0.5, 0.42], [0.6, -0.5]]) {
      const x = cx + px * U, y = cy + py * U;
      for (const dx of [-5, 0, 5]) g.append(S('line', { x1: x + dx, y1: y, x2: x + dx * 1.6, y2: y - 16 - Math.abs(dx), stroke: '#3e4d1f', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    }
  }
  // rivers: a wide blue band through the hex centres to the mouth, a lighter streak on top
  for (const rv of bd.rivers || []) {
    const pts = rv.hexes.map(id => [bd.tiles[id].x * U, bd.tiles[id].y * U]);
    if (rv.mouth >= 0) {
      const m = mid(bd, rv.mouth), last = pts[pts.length - 1];
      const mx = m.x * U, my = m.y * U;
      pts.push([mx, my], [mx + (mx - last[0]) * 0.35, my + (my - last[1]) * 0.35]);
    }
    const d = 'M' + pts.map(p => p.join(',')).join(' L');
    g.append(S('path', { d, fill: 'none', stroke: '#1f5f8f', 'stroke-width': U * 0.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    g.append(S('path', { d, fill: 'none', stroke: '#4fa3e0', 'stroke-width': U * 0.22, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    g.append(S('path', { d, fill: 'none', stroke: '#bfe6ff', 'stroke-width': 3, 'stroke-dasharray': '10 14', opacity: 0.8 }));
  }
  // free bridge spots: a short post on each bank
  for (const e of bd.bridgeSpots || []) {
    if (st.roads[e] !== undefined) continue;
    const m = mid(bd, e);
    for (const k of [-0.24, 0.24]) {
      const x = (m.x + (m.b.x - m.a.x) * k) * U, y = (m.y + (m.b.y - m.a.y) * k) * U;
      g.append(S('circle', { cx: x, cy: y, r: 6, fill: '#7a5232', stroke: '#2a1d14', 'stroke-width': 2, class: 'bridge-spot', 'data-edge': e }));
      g.append(S('circle', { cx: x, cy: y, r: 2.5, fill: '#ffcd75' }));
    }
  }
  return g;
}

// a built bridge on edge e: planks across, rails in the owner's colour (drawn with the roads)
export function drawBridge(S, U, st, e, color) {
  const bd = st.board, m = mid(bd, e);
  const ang = (Math.atan2(m.b.y - m.a.y, m.b.x - m.a.x) * 180) / Math.PI;
  const len = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) * U * 0.78;
  const g = S('g', { class: 'bridge', transform: `translate(${m.x * U},${m.y * U}) rotate(${ang})`, 'data-edge': e });
  g.append(S('rect', { x: -len / 2, y: -11, width: len, height: 22, rx: 5, fill: '#9a6a3e', stroke: '#2a1d14', 'stroke-width': 3 }));
  for (let i = 1; i < 6; i++) g.append(S('line', { x1: -len / 2 + (len * i) / 6, y1: -9, x2: -len / 2 + (len * i) / 6, y2: 9, stroke: '#5b3e2b', 'stroke-width': 2 }));
  for (const y of [-12, 12]) g.append(S('line', { x1: -len / 2 + 4, y1: y, x2: len / 2 - 4, y2: y, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }));
  return g;
}
