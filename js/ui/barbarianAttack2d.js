// Traders & Barbarians, Barbarian Attack on the flat SVG board (boardView.js): the castle, the
// barbarians on the coast, conquered hexes (number turned face down, the hex darkened) and the
// knights on their paths. U is the svg units per hex radius; shapes only (no emoji inside the SVG).
import { hexPaths } from '../engine/tradersBarbarians/barbarianAttack.js';

// a stone keep with two towers, about 90 units wide, standing on 0,0
function castle(S) {
  const g = S('g', { class: 'ba-castle' });
  const ink = { stroke: '#2b2b33', 'stroke-width': 3, 'stroke-linejoin': 'round' };
  const merlons = (x, y, w, n) => {
    const step = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) g.append(S('rect', { x: x + i * step * 2, y: y - 9, width: step, height: 10, fill: '#b9bcc4', ...ink }));
  };
  g.append(S('rect', { x: -32, y: -34, width: 64, height: 44, fill: '#a7aab3', ...ink }));
  merlons(-32, -34, 64, 5);
  for (const x of [-48, 30]) {
    g.append(S('rect', { x, y: -54, width: 18, height: 64, fill: '#b9bcc4', ...ink }));
    merlons(x, -54, 18, 2);
  }
  g.append(S('path', { d: 'M-11,10 L-11,-8 Q0,-20 11,-8 L11,10 Z', fill: '#4a3424', ...ink }));
  g.append(S('line', { x1: -39, y1: -63, x2: -39, y2: -88, stroke: '#2b2b33', 'stroke-width': 3 }));
  g.append(S('path', { d: 'M-39,-88 L-17,-81 L-39,-74 Z', fill: '#c0392b', ...ink }));
  return g;
}

// a barbarian: a horned helmet over a dark cloak, about 26 units tall, standing on 0,0
function barbarian(S) {
  const g = S('g', { class: 'ba-barbarian' });
  const ink = { stroke: '#1a1410', 'stroke-width': 2.5, 'stroke-linejoin': 'round' };
  g.append(S('path', { d: 'M-10,0 L-8,-14 Q0,-18 8,-14 L10,0 Z', fill: '#5a2e1c', ...ink }));
  g.append(S('circle', { cx: 0, cy: -19, r: 6, fill: '#e2b48a', ...ink }));
  g.append(S('path', { d: 'M-7,-21 Q0,-30 7,-21 Z', fill: '#8d8f96', ...ink }));
  g.append(S('path', { d: 'M-7,-23 Q-13,-26 -12,-33 Q-9,-27 -5,-25 Z M7,-23 Q13,-26 12,-33 Q9,-27 5,-25 Z', fill: '#efe6cf', ...ink }));
  return g;
}

// drawn after the land tiles and the number tokens (under roads and buildings)
export function drawBarbarianAttack(S, U, st, hexPoints) {
  const bd = st.board, B = st.barbAttack;
  const g = S('g', { class: 'barbarian-attack' });
  const c = bd.tiles[bd.castle];
  if (c && c.revealed) {
    g.append(S('polygon', { points: hexPoints(c.x * U, c.y * U, U * 0.97), fill: '#8e9a7a', stroke: '#545b49', 'stroke-width': 5 }));
    const k = castle(S);
    k.setAttribute('transform', `translate(${c.x * U},${c.y * U + 22})`);
    g.append(k);
  }
  if (!B) return g;
  // conquered: the hex darkens and its number token is turned face down
  for (const h of B.conquered) {
    const t = bd.tiles[h];
    g.append(S('polygon', { points: hexPoints(t.x * U, t.y * U, U * 0.97), class: 'ba-conquered', fill: '#2a0e0a', opacity: 0.55 }));
    g.append(S('circle', { cx: t.x * U, cy: t.y * U + 18, r: 28, fill: '#6b3d2a', stroke: '#2a1a12', 'stroke-width': 3 }));
    g.append(S('path', { d: `M${t.x * U - 10},${t.y * U + 8} L${t.x * U + 10},${t.y * U + 28} M${t.x * U + 10},${t.y * U + 8} L${t.x * U - 10},${t.y * U + 28}`, stroke: '#e0b07a', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  }
  // barbarians: 1–3 figures on the hex, towards its sea side
  for (const h in B.on) {
    const t = bd.tiles[h], n = B.on[h];
    for (let i = 0; i < n; i++) {
      const f = barbarian(S);
      f.setAttribute('transform', `translate(${t.x * U + (i - (n - 1) / 2) * 30},${t.y * U - 14}) scale(1.5)`);
      f.setAttribute('data-hex', h);
      g.append(f);
    }
  }
  return g;
}

// where a knight stands on path e (its middle)
export function knightSpot(bd, e) {
  const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// a knight: a shield in the owner's colour with a white cross, about 30 units tall
function knight(S, color) {
  const g = S('g', { class: 'ba-knight' });
  g.append(S('path', { d: 'M-12,-15 L12,-15 L12,0 Q12,11 0,17 Q-12,11 -12,0 Z', fill: color, stroke: '#1a1c2c', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  g.append(S('path', { d: 'M0,-11 L0,11 M-8,-3 L8,-3', stroke: '#fff', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
  return g;
}

// drawn above the roads
export function drawBaKnights(S, U, st) {
  const bd = st.board, B = st.barbAttack;
  const g = S('g', { class: 'ba-knights' });
  // knights that will fight at the end of this turn get a glow on their hex's paths
  for (const h in B.on) {
    const paths = hexPaths(st, +h), ks = paths.filter(e => B.knights[e] != null).length;
    if (ks > B.on[h]) {
      const t = bd.tiles[h];
      g.append(S('polygon', { points: paths.map(e => knightSpot(bd, e)).map(p => `${p.x * U},${p.y * U}`).join(' '), class: 'ba-battle', fill: 'none', stroke: '#ffd166', 'stroke-width': 6, 'stroke-dasharray': '12 8', opacity: 0.9, 'data-hex': t.id }));
    }
  }
  for (const e in B.knights) {
    const P = knightSpot(bd, +e);
    const k = knight(S, st.players[B.knights[e]].color);
    k.setAttribute('transform', `translate(${P.x * U},${P.y * U}) scale(1.25)`);
    k.setAttribute('data-edge', e);
    g.append(k);
  }
  return g;
}
