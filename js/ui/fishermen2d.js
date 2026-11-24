// Traders & Barbarians, Fishermen: the lake and the fishing grounds on the flat SVG board (boardView.js).
// U is the svg units per hex radius; S makes svg elements. Shapes only (no emoji inside the SVG).
import { LAKE_NUMS } from '../engine/tradersBarbarians/fishermen.js';
import { probLook } from '../engine/constants.js';

// a small fish facing right, centred on 0,0 (about 30 units long)
const FISH = 'M-14,0 Q-4,-9 8,-4 L15,-9 L13,0 L15,9 L8,4 Q-4,9 -14,0 Z';

function fish(S, x, y, scale, fill) {
  const g = S('g', { transform: `translate(${x},${y}) scale(${scale})` });
  g.append(S('path', { d: FISH, fill, stroke: '#1a1c2c', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  g.append(S('circle', { cx: -7, cy: -1.5, r: 1.6, fill: '#1a1c2c' }));
  return g;
}

// a number token like the land ones (6 and 8 red, probability bars)
function token(S, cx, cy, num, r = 24) {
  const tk = S('g', { class: 'token' + (num === 6 || num === 8 ? ' red' : '') });
  tk.append(S('circle', { cx, cy, r, fill: 'url(#tokenG)', stroke: '#9c8a60', 'stroke-width': 2, filter: 'url(#shadow)' }));
  tk.append(S('text', { x: cx, y: cy + 6, class: 'token-num' }, num));
  const pl = probLook(num);
  for (let i = 0; i < pl.p; i++)
    tk.append(S('rect', { x: cx + (i - (pl.p - 1) / 2) * 7 - 2.5, y: cy + 16 - pl.h / 2, width: 5, height: pl.h, fill: pl.c, stroke: 'rgba(26,28,44,.6)', 'stroke-width': 1, class: 'pbar' }));
  return tk;
}

// Drawn right after the land tiles. `rolled` = the number just rolled (they light up like tiles).
export function drawFishermen(S, U, st, hexPoints, rolled) {
  const bd = st.board;
  const g = S('g', { class: 'fishermen' });

  // fishing grounds: a ring of nets on the sea hex, dashed lines to the 3 corners it feeds
  for (const f of bd.fishing || []) {
    const cx = f.x * U, cy = f.y * U;
    const fg = S('g', { class: 'fishing' + (rolled === f.num ? ' rolled' : ''), 'data-fishing': f.id });
    for (const v of f.verts) {
      const V = bd.vertices[v];
      fg.append(S('line', { x1: cx, y1: cy, x2: V.x * U, y2: V.y * U, stroke: '#d9f3ff', 'stroke-width': 3, 'stroke-dasharray': '6 5', opacity: 0.75 }));
    }
    fg.append(S('circle', { cx, cy, r: U * 0.62, fill: rolled === f.num ? 'rgba(255,233,140,.45)' : 'rgba(120,205,255,.28)', stroke: '#d9f3ff', 'stroke-width': 3, 'stroke-dasharray': '10 6' }));
    fg.append(fish(S, cx - U * 0.3, cy - U * 0.32, 0.9, '#ffb86b'));
    fg.append(fish(S, cx + U * 0.28, cy - U * 0.36, 0.7, '#8fd3ff'));
    fg.append(token(S, cx, cy + U * 0.12, f.num));
    g.append(fg);
  }

  // the lake: water over the desert tile, two fish and a 2·3·11·12 plate
  if (bd.lake >= 0) {
    const t = bd.tiles[bd.lake];
    if (t.revealed) {
      const cx = t.x * U, cy = t.y * U;
      const lit = LAKE_NUMS.includes(rolled);
      const lg = S('g', { class: 'lake' + (lit ? ' rolled' : '') });
      lg.append(S('polygon', { points: hexPoints(cx, cy, U * 0.97), fill: '#3f9bd8', stroke: '#1c5d8c', 'stroke-width': 5 }));
      lg.append(S('polygon', { points: hexPoints(cx, cy, U * 0.72), fill: lit ? '#9fdcff' : '#5db6ec', stroke: '#c8ecff', 'stroke-width': 3, opacity: 0.9 }));
      lg.append(fish(S, cx - 18, cy - 30, 1.1, '#ffb86b'));
      lg.append(fish(S, cx + 22, cy - 22, 0.85, '#ffe08a'));
      lg.append(S('rect', { x: cx - 50, y: cy + 4, width: 100, height: 30, rx: 8, fill: 'url(#tokenG)', stroke: '#9c8a60', 'stroke-width': 2, filter: 'url(#shadow)' }));
      lg.append(S('text', { x: cx, y: cy + 25, class: 'token-num', style: 'font-size:12px;letter-spacing:-0.5px' }, LAKE_NUMS.join('·')));
      g.append(lg);
    }
  }
  return g;
}
