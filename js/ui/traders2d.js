// Traders & Barbarians, main scenario, on the flat SVG board (boardView.js): the three trade hexes
// (castle, quarry, glassworks) with their plaza, inner paths, closed sea side and commodity stack;
// the barbarians on their paths; the players' wagons. U is the svg units per hex radius. Shapes
// only (no emoji inside the SVG).
import { NEEDED_AT } from '../engine/tradersBarbarians/traders.js';

export const GOOD_COLORS = { marble: '#f2efe6', glass: '#7fd3f0', tools: '#8a8f99', sand: '#e9c46a' };
const TRADE_FILL = { castle: '#8e9a7a', quarry: '#9b8f80', glassworks: '#c9b98f' };
const INK = { stroke: '#1a1c2c', 'stroke-width': 3, 'stroke-linejoin': 'round' };

// a small building for each trade hex, about 80 units wide, standing on 0,0
function building(S, kind) {
  const g = S('g', { class: 'tb-building tb-' + kind });
  if (kind === 'castle') {
    g.append(S('rect', { x: -26, y: -30, width: 52, height: 34, fill: '#a7aab3', ...INK }));
    for (const x of [-38, 24]) g.append(S('rect', { x, y: -46, width: 14, height: 50, fill: '#b9bcc4', ...INK }));
    for (let i = 0; i < 4; i++) g.append(S('rect', { x: -26 + i * 14, y: -38, width: 8, height: 8, fill: '#b9bcc4', ...INK }));
    g.append(S('path', { d: 'M-8,4 L-8,-10 Q0,-18 8,-10 L8,4 Z', fill: '#4a3424', ...INK }));
    g.append(S('path', { d: 'M-31,-46 L-31,-64 L-15,-58 L-31,-53', fill: '#c0392b', ...INK }));
  } else if (kind === 'quarry') {
    g.append(S('path', { d: 'M-40,4 L-28,-26 L-10,-34 L6,-20 L22,-38 L40,-10 L40,4 Z', fill: '#8b8d93', ...INK }));
    g.append(S('path', { d: 'M-18,-8 L-6,-14 L4,-6 M14,-22 L24,-14', stroke: '#5b5d63', 'stroke-width': 3, fill: 'none' }));
    g.append(S('rect', { x: -14, y: -6, width: 22, height: 12, fill: '#f2efe6', ...INK }));
    g.append(S('line', { x1: 20, y1: 4, x2: 34, y2: -22, stroke: '#5b3e2b', 'stroke-width': 4 }));
    g.append(S('path', { d: 'M28,-26 L40,-18 L36,-14 Z', fill: '#8a8f99', ...INK }));
  } else {
    g.append(S('rect', { x: -30, y: -26, width: 46, height: 30, fill: '#d9b48a', ...INK }));
    g.append(S('path', { d: 'M-36,-24 L-7,-44 L22,-24 Z', fill: '#a0522d', ...INK }));
    g.append(S('rect', { x: 18, y: -50, width: 12, height: 40, fill: '#9c8a7a', ...INK }));
    g.append(S('circle', { cx: 24, cy: -60, r: 7, fill: '#d8d8d8', opacity: 0.8 }));
    g.append(S('rect', { x: -20, y: -16, width: 12, height: 12, fill: '#7fd3f0', ...INK }));
    g.append(S('rect', { x: -2, y: -16, width: 12, height: 12, fill: '#7fd3f0', ...INK }));
  }
  return g;
}

// a commodity token: a small crate in the commodity's colour
function crate(S, good, x, y, k = 1) {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})`, class: 'tb-good' });
  g.append(S('rect', { x: -9, y: -9, width: 18, height: 18, rx: 2, fill: GOOD_COLORS[good] || '#bbb', ...INK, 'stroke-width': 2.5 }));
  g.append(S('path', { d: 'M-9,-9 L9,9 M9,-9 L-9,9', stroke: '#1a1c2c', 'stroke-width': 1.2, opacity: 0.5 }));
  return g;
}

// drawn after the land tiles (under roads and buildings)
export function drawTradeHexes(S, U, st, hexPoints) {
  const bd = st.board;
  const g = S('g', { class: 'traders' });
  for (const T of bd.trade) {
    const t = bd.tiles[T.hex];
    if (!t.revealed) continue;
    g.append(S('polygon', { points: hexPoints(t.x * U, t.y * U, U * 0.97), fill: TRADE_FILL[T.kind], stroke: '#54493d', 'stroke-width': 5, class: 'tb-hex', 'data-kind': T.kind }));
    // inner paths: dashed tracks to the plaza
    const P = bd.vertices[T.plaza];
    for (const e of T.inner) {
      const E = bd.edges[e], c = bd.vertices[E.a === T.plaza ? E.b : E.a];
      g.append(S('line', { x1: P.x * U, y1: P.y * U, x2: c.x * U, y2: c.y * U, stroke: '#5b4a36', 'stroke-width': 7, 'stroke-dasharray': '10 8', 'stroke-linecap': 'round', opacity: 0.8 }));
    }
    // closed sea side: a small cross on each path
    for (const e of T.closed) {
      const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
      const mx = (a.x + b.x) / 2 * U, my = (a.y + b.y) / 2 * U;
      g.append(S('path', { d: `M${mx - 8},${my - 8} L${mx + 8},${my + 8} M${mx + 8},${my - 8} L${mx - 8},${my + 8}`, stroke: '#c0392b', 'stroke-width': 4, 'stroke-linecap': 'round', class: 'tb-closed' }));
    }
    const b = building(S, T.kind);
    b.setAttribute('transform', `translate(${t.x * U},${t.y * U - 40})`);
    g.append(b);
    // the plaza
    g.append(S('circle', { cx: P.x * U, cy: P.y * U, r: 15, fill: '#cdb892', stroke: '#5b4a36', 'stroke-width': 3, class: 'tb-plaza' }));
    // the stack: top crate in the colour of a commodity it supplies, the number left, and what it needs
    const n = st.traders ? st.traders.stacks[T.kind].length : 0;
    const sx = t.x * U - 34, sy = t.y * U + 50;
    if (n) { // a wooden box with the number of commodities left
      g.append(S('rect', { x: sx - 14, y: sy - 14, width: 28, height: 28, rx: 3, fill: '#8b5a2b', ...INK, 'stroke-width': 2.5, class: 'tb-stack' }));
      g.append(S('text', { x: sx, y: sy + 7, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff' }, n));
    }
    // what this hex needs: small crates on the right
    const needs = Object.keys(NEEDED_AT).filter(k => NEEDED_AT[k] === T.kind);
    needs.forEach((good, i) => g.append(crate(S, good, t.x * U + 30 + i * 22, t.y * U + 50, 0.9)));
  }
  return g;
}

// a barbarian standing on a path: horned helmet over a dark cloak, about 28 units tall
function barbarian(S) {
  const g = S('g', { class: 'tb-barbarian' });
  const ink = { stroke: '#1a1410', 'stroke-width': 2.5, 'stroke-linejoin': 'round' };
  g.append(S('path', { d: 'M-10,0 L-8,-14 Q0,-18 8,-14 L10,0 Z', fill: '#5a2e1c', ...ink }));
  g.append(S('circle', { cx: 0, cy: -19, r: 6, fill: '#e2b48a', ...ink }));
  g.append(S('path', { d: 'M-7,-21 Q0,-30 7,-21 Z', fill: '#8d8f96', ...ink }));
  g.append(S('path', { d: 'M-7,-23 Q-13,-26 -12,-33 Q-9,-27 -5,-25 Z M7,-23 Q13,-26 12,-33 Q9,-27 5,-25 Z', fill: '#efe6cf', ...ink }));
  g.append(S('line', { x1: 11, y1: -4, x2: 11, y2: -24, stroke: '#5b3e2b', 'stroke-width': 3 }));
  g.append(S('path', { d: 'M11,-24 Q19,-22 17,-14 L11,-16 Z', fill: '#9aa0a8', ...ink }));
  return g;
}

// a wagon: a cart in the owner's colour on two wheels, about 40 units wide; the cargo on top
function wagon(S, color, good) {
  const g = S('g', { class: 'tb-wagon' });
  if (good) g.append(crate(S, good, 0, -24, 0.9));
  g.append(S('path', { d: 'M-18,-14 L18,-14 L15,0 L-15,0 Z', fill: color, ...INK }));
  g.append(S('line', { x1: 18, y1: -8, x2: 30, y2: -4, stroke: '#5b3e2b', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
  for (const x of [-10, 10]) {
    g.append(S('circle', { cx: x, cy: 2, r: 7, fill: '#6b4a2a', ...INK, 'stroke-width': 2.5 }));
    g.append(S('circle', { cx: x, cy: 2, r: 2, fill: '#1a1c2c' }));
  }
  return g;
}

// drawn above roads and buildings
export function drawTradersPieces(S, U, st, wagonAt) {
  const bd = st.board, T = st.traders;
  const g = S('g', { class: 'traders-pieces' });
  for (const e of T.barbarians) {
    const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
    const f = barbarian(S);
    f.setAttribute('transform', `translate(${(a.x + b.x) / 2 * U},${(a.y + b.y) / 2 * U + 12}) scale(1.4)`);
    f.setAttribute('data-edge', e);
    g.append(f);
  }
  // wagons: several on one intersection stand side by side
  const at = {};
  for (const p of st.players) {
    const v = wagonAt(st, p.id);
    if (v != null) (at[v] ||= []).push(p.id);
  }
  for (const [v, pids] of Object.entries(at)) {
    const V = bd.vertices[v];
    pids.forEach((pid, i) => {
      const w = wagon(S, st.players[pid].color, T.wagons[pid].cargo);
      w.setAttribute('transform', `translate(${V.x * U + (i - (pids.length - 1) / 2) * 34},${V.y * U - 16}) scale(1.1)`);
      w.setAttribute('data-pid', pid);
      g.append(w);
    });
  }
  return g;
}
