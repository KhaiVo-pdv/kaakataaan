// Traders & Barbarians, The Caravans on the flat SVG board (boardView.js): the oasis, the start
// arrows, the camels and — during a vote — the lettered spots the camel can go to.
// U is the svg units per hex radius; shapes only (no emoji inside the SVG).

export const SPOT_LETTERS = 'ABCDEF';
// the letter of a spot (edge) in the current vote, '' when it isn't one
export const spotLetter = (st, e) => {
  const V = st.caravans && st.caravans.vote;
  const i = V ? V.options.indexOf(e) : -1;
  return i >= 0 ? SPOT_LETTERS[i] : '';
};

// where a camel stands on edge e: beside the path (offset from its middle) and which way it faces
// (towards the end further from the oasis)
export function camelPose(bd, e) {
  const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
  const o = bd.tiles[bd.oasis];
  const [near, far] = Math.hypot(a.x - o.x, a.y - o.y) <= Math.hypot(b.x - o.x, b.y - o.y) ? [a, b] : [b, a];
  const dx = far.x - near.x, dy = far.y - near.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // the side it stands on
  return { x: (a.x + b.x) / 2 + nx * 0.13, y: (a.y + b.y) / 2 + ny * 0.13, ang: Math.atan2(dy, dx), dx: dx / len, dy: dy / len };
}

// a one-humped camel facing +x, about 36 units long, centred on 0,0
function camel(S, fill = '#c8925a', opacity = 1) {
  const g = S('g', { opacity });
  const ink = { stroke: '#2a1d14', 'stroke-width': 2, 'stroke-linejoin': 'round' };
  for (const x of [-9, -4, 6, 11]) g.append(S('line', { x1: x, y1: 4, x2: x, y2: 13, stroke: '#2a1d14', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  g.append(S('path', { d: 'M-14,5 Q-15,-3 -8,-5 Q-2,-15 5,-5 Q10,-4 12,2 Q8,7 -14,5 Z', fill, ...ink }));
  g.append(S('path', { d: 'M10,-1 L14,-12 Q16,-15 20,-13 L20,-9 L16,-9 L14,2 Z', fill, ...ink }));
  return g;
}

// drawn after the land tiles (under roads and buildings)
export function drawCaravans(S, U, st, hexPoints) {
  const bd = st.board;
  const g = S('g', { class: 'caravans' });
  const o = bd.tiles[bd.oasis];
  if (o && o.revealed) {
    const cx = o.x * U, cy = o.y * U;
    g.append(S('polygon', { points: hexPoints(cx, cy, U * 0.97), fill: '#f1d58e', stroke: '#a8823a', 'stroke-width': 4 }));
    g.append(S('ellipse', { cx, cy: cy + 6, rx: U * 0.34, ry: U * 0.22, fill: '#4fa3e0', stroke: '#1f5f8f', 'stroke-width': 3 }));
    // palms: a trunk and a fan of leaves
    for (const [px, py] of [[-0.45, -0.25], [0.42, -0.3], [-0.2, 0.45], [0.38, 0.38]]) {
      const x = cx + px * U, y = cy + py * U;
      g.append(S('path', { d: `M${x},${y + 14} Q${x + 3},${y} ${x},${y - 14}`, fill: 'none', stroke: '#7a5232', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      for (const a of [-150, -110, -70, -30, 10]) {
        const r = (a * Math.PI) / 180;
        g.append(S('path', { d: `M${x},${y - 14} Q${x + Math.cos(r) * 10},${y - 22 + Math.sin(r) * 4} ${x + Math.cos(r) * 18},${y - 14 + Math.sin(r) * 12 + 6}`, fill: 'none', stroke: '#3f8a3a', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      }
    }
    // the start arrows on the oasis corners, pointing out along the first path
    for (const stt of bd.caravanStarts || []) {
      const V = bd.vertices[stt.vertex], E = bd.edges[stt.edge];
      const W = bd.vertices[E.a === stt.vertex ? E.b : E.a];
      const ang = (Math.atan2(W.y - V.y, W.x - V.x) * 180) / Math.PI;
      const ar = S('g', { transform: `translate(${(V.x + (W.x - V.x) * 0.22) * U},${(V.y + (W.y - V.y) * 0.22) * U}) rotate(${ang})` });
      ar.append(S('path', { d: 'M-10,-6 L4,-6 L4,-12 L16,0 L4,12 L4,6 L-10,6 Z', fill: '#e0b45a', stroke: '#2a1d14', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      g.append(ar);
    }
  }
  const C = st.caravans;
  if (!C) return g;
  // dotted track joining the camels of each route
  for (const e in C.camels) {
    const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
    g.append(S('line', { x1: a.x * U, y1: a.y * U, x2: b.x * U, y2: b.y * U, stroke: '#e8c27a', 'stroke-width': 4, 'stroke-dasharray': '3 7', 'stroke-linecap': 'round', opacity: 0.9 }));
  }
  for (const e in C.camels) {
    const P = camelPose(bd, +e);
    const flip = Math.cos(P.ang) < 0; // keep the camel upright: mirror instead of turning upside down
    const deg = (P.ang * 180) / Math.PI + (flip ? 180 : 0);
    const cg = S('g', { class: 'camel', transform: `translate(${P.x * U},${P.y * U}) rotate(${deg}) scale(${flip ? -1.35 : 1.35},1.35)`, 'data-edge': e });
    cg.append(camel(S));
    g.append(cg);
  }
  return g;
}

// during a vote, drawn above the roads: the possible spots, lettered (after a tie only the tied ones)
export function drawCamelSpots(S, U, st) {
  const bd = st.board, g = S('g', { class: 'camel-spots' });
  const V = st.caravans && st.caravans.vote;
  if (V) {
    const show = st.phase === 'caravanPick' && V.tied ? V.tied : V.options;
    for (const e of show) {
      const P = camelPose(bd, e), L = spotLetter(st, e);
      const sg = S('g', { class: 'camel-spot', 'data-edge': e, transform: `translate(${P.x * U},${P.y * U})` });
      sg.append(S('circle', { r: 26, fill: 'rgba(255,214,120,.35)', stroke: '#ffcd75', 'stroke-width': 3, 'stroke-dasharray': '6 4' }));
      sg.append(camel(S, '#e8c27a', 0.55));
      sg.append(S('circle', { cx: 22, cy: -22, r: 14, fill: '#1a1c2c', stroke: '#ffcd75', 'stroke-width': 2.5 }));
      sg.append(S('text', { x: 22, y: -16, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#ffcd75' }, L));
      g.append(sg);
    }
  }
  return g;
}
