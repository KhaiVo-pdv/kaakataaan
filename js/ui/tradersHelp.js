// Traders & Barbarians, main scenario rules screen: short sections, each with a small picture drawn
// in code (SVG, shapes only), reusing the Seafarers rules layout classes.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import * as TR from '../engine/tradersBarbarians/traders.js';
import { TB_SCENARIOS } from '../engine/tradersBarbarians/scenarios.js';
import { GOOD_COLORS } from './traders2d.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5', SEA = '#2f6fa8';
const svgBox = (w, h0) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 14, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
const hex = (cx, cy, r, fill) => S('polygon', { points: hexPts(cx, cy, r), fill, stroke: '#1a1c2c', 'stroke-width': 2 });
const crate = (x, y, good, k = 1) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  g.append(S('rect', { x: -8, y: -8, width: 16, height: 16, rx: 2, fill: GOOD_COLORS[good], stroke: '#1a1c2c', 'stroke-width': 2 }));
  return g;
};
const wagon = (x, y, color, good) => {
  const g = S('g', { transform: `translate(${x},${y})` });
  if (good) g.append(crate(0, -20, good, 0.8));
  g.append(S('path', { d: 'M-15,-12 L15,-12 L12,0 L-12,0 Z', fill: color, stroke: '#1a1c2c', 'stroke-width': 2 }));
  for (const wx of [-8, 8]) g.append(S('circle', { cx: wx, cy: 2, r: 5, fill: '#6b4a2a', stroke: '#1a1c2c', 'stroke-width': 2 }));
  return g;
};
const barbarian = (x, y) => {
  const g = S('g', { transform: `translate(${x},${y})` });
  const ink = { stroke: '#1a1410', 'stroke-width': 2, 'stroke-linejoin': 'round' };
  g.append(S('path', { d: 'M-8,0 L-6,-11 Q0,-14 6,-11 L8,0 Z', fill: '#5a2e1c', ...ink }));
  g.append(S('circle', { cx: 0, cy: -15, r: 5, fill: '#e2b48a', ...ink }));
  g.append(S('path', { d: 'M-6,-18 Q-10,-20 -10,-26 Q-7,-21 -4,-20 Z M6,-18 Q10,-20 10,-26 Q7,-21 4,-20 Z', fill: '#efe6cf', ...ink }));
  return g;
};
const TRADE_FILL = { castle: '#8e9a7a', quarry: '#9b8f80', glassworks: '#c9b98f' };
const TRADE_ICON = { castle: '🏰', quarry: '⛏️', glassworks: '🏺' };

// 1. a trade hex: plaza, inner paths, closed sea side
function picTradeHex() {
  const svg = svgBox(320, 150);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 150, fill: SEA, rx: 8 }));
  const cx = 160, cy = 80, R = 56;
  svg.append(hex(cx - 97, cy, R, TILE_INFO.wheat.color), hex(cx + 97, cy, R, TILE_INFO.wood.color), hex(cx, cy, R, TRADE_FILL.castle));
  const corner = i => { const a = (Math.PI / 180) * (60 * i - 30); return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  for (const i of [0, 1, 3, 4]) { const [x, y] = corner(i); svg.append(S('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#5b4a36', 'stroke-width': 5, 'stroke-dasharray': '7 6' })); }
  svg.append(S('circle', { cx, cy, r: 11, fill: '#cdb892', stroke: '#5b4a36', 'stroke-width': 2 }));
  for (const i of [1, 2, 4, 5]) { const [ax, ay] = corner(i), [bx, by] = corner((i + 1) % 6); const mx = (ax + bx) / 2, my = (ay + by) / 2; svg.append(S('path', { d: `M${mx - 6},${my - 6} L${mx + 6},${my + 6} M${mx + 6},${my - 6} L${mx - 6},${my + 6}`, stroke: '#c0392b', 'stroke-width': 3 })); }
  svg.append(label(cx, cy - 22, t('plaza'), { size: 12 }), label(cx, 146, t('✕ = sin caminos junto al mar'), { size: 12 }));
  return svg;
}

// 2. movement costs
function picMoves() {
  const svg = svgBox(320, 120);
  const rows = [[t('tu camino'), ME, '1'], [t('camino rival'), RIVAL, '1 +   '], [t('sin camino'), null, '2'], [t('con bárbaro'), null, '+2']];
  rows.forEach(([name, color, cost], i) => {
    const y = 18 + i * 27;
    svg.append(S('circle', { cx: 20, cy: y, r: 5, fill: '#f4f4f4' }), S('circle', { cx: 90, cy: y, r: 5, fill: '#f4f4f4' }));
    svg.append(S('line', { x1: 24, y1: y, x2: 86, y2: y, stroke: color || '#9c8a60', 'stroke-width': color ? 7 : 3, 'stroke-dasharray': color ? '' : '4 4' }));
    if (i === 3) svg.append(barbarian(55, y + 9));
    if (i === 1) svg.append(S('circle', { cx: 294, cy: y, r: 7, fill: '#f1c40f', stroke: '#1a1c2c', 'stroke-width': 2 })); // the toll: 1 gold to the owner
    svg.append(label(105, y + 5, name, { anchor: 'start', size: 13 }), label(300, y + 5, cost, { anchor: 'end', size: 14, color: '#ffe7a3' }));
  });
  return svg;
}

// 3. supplies and needs
function picGoods() {
  const svg = svgBox(320, 130);
  TR.TRADE_KINDS.forEach((kind, i) => {
    const y = 22 + i * 40;
    svg.append(S('rect', { x: 8, y: y - 16, width: 304, height: 32, rx: 6, fill: TRADE_FILL[kind], stroke: '#1a1c2c', 'stroke-width': 2 }));
    svg.append(label(30, y + 6, TRADE_ICON[kind], { size: 16 }));
    TR.SUPPLIES[kind].forEach((g, k) => svg.append(crate(70 + k * 22, y, g)));
    svg.append(label(150, y + 5, t('da · pide'), { size: 12 }));
    Object.keys(TR.NEEDED_AT).filter(g => TR.NEEDED_AT[g] === kind).forEach((g, k) => svg.append(crate(210 + k * 22, y, g)));
  });
  return svg;
}

// 4. upgrades
function picLevels() {
  const svg = svgBox(320, 110);
  TR.WAGON_LEVELS.forEach((L, i) => {
    const x = 34 + i * 62;
    svg.append(wagon(x, 34, ME));
    svg.append(label(x, 60, `${L.mp} 🦶`, { size: 12 }), label(x, 78, `🪙${L.gold}`, { size: 12 }), label(x, 96, L.drive.length ? '🎲' + L.drive.join('') : '—', { size: 11 }));
  });
  return svg;
}

// 5. a barbarian on a road: 7 / Knight steal, drive off
function picBarbarians() {
  const svg = svgBox(320, 100);
  svg.append(S('line', { x1: 30, y1: 60, x2: 130, y2: 60, stroke: RIVAL, 'stroke-width': 8 }), barbarian(80, 56));
  svg.append(label(80, 90, t('7 / caballero: 🫳 1 carta'), { size: 12 }));
  svg.append(wagon(200, 60, ME), S('line', { x1: 215, y1: 60, x2: 300, y2: 60, stroke: '#9c8a60', 'stroke-width': 3, 'stroke-dasharray': '4 4' }), barbarian(258, 56));
  svg.append(label(250, 90, t('🎲 espantar (nivel 2+)'), { size: 12 }));
  return svg;
}

function section(title, text, art) {
  return h('div', { class: 'sf-section' }, h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

export function showTradersHelp() {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'tb-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🛒 Reglas de Mercaderes y bárbaros')),
      h('p', null, t('El escenario principal de Mercaderes y Bárbaros. Las reglas básicas siguen igual; se gana con {vp} puntos. Esto es lo que cambia:', { vp: TB_SCENARIOS.tradersBarbarians.vp })),
      section(t('1. Castillo, cantera y vidriería'), li(
        t('Tres casillas de comercio en la costa: no tienen número ni producen. No hay fichas 2 ni 12 (si salen, se vuelve a tirar).'),
        t('Cada una tiene una plaza en el centro con caminos interiores: puedes construir caminos en ellos, pero no junto al mar ni en la plaza.'),
        t('Empiezas con un poblado, una ciudad (con tu carromato) y {g} de oro. No hay ladrón ni camino más largo.', { g: TR.START_GOLD })), picTradeHex()),
      section(t('2. El carromato'), li(
        t('Cada turno tu carromato tiene puntos de movimiento (4 al principio). Toca 🛒 y luego el cruce adonde quieres ir.'),
        t('Por tu camino cuesta 1, por el de otro 1 y le pagas 1 de oro, sin camino 2; con un bárbaro, 2 más.'),
        t('Una vez por turno, 1 cereal da 2 puntos más. En una plaza el carromato se detiene.')), picMoves()),
      section(t('3. Mercancías'), li(
        t('Con el carromato vacío, en una plaza cargas la mercancía de arriba de su montón.'),
        t('Llévala a la casilla que la pide: ganas 1 punto y oro (según tu carromato) y cargas la siguiente allí.'),
        t('El castillo pide mármol y vidrio; la cantera, herramientas; la vidriería, arena.')), picGoods()),
      section(t('4. Mejorar el carromato'), li(
        t('Hay 5 niveles: más movimiento, más oro por entrega y números para espantar bárbaros.'),
        t('El nivel 5 vale 1 punto.'),
        t('Con 2 de oro compras 1 recurso (2 veces por turno), y puedes cambiar recursos por oro.')), picLevels()),
      section(t('5. Bárbaros, el 7 y las cartas'), li(
        t('Tres bárbaros cortan caminos: no se construye allí y el carromato paga 2 más para pasar.'),
        t('Con un 7 (tras descartar) o una carta de caballero mueves un bárbaro; si lo dejas sobre el camino de otro, le robas 1 recurso.'),
        t('Desde el nivel 2, junto a un bárbaro, tira un dado: con los números de tu carromato lo espantas y lo mueves.'),
        t('Cartas: 16 caballeros, 3 construir caminos, 3 viaje rápido (el carromato vuelve a moverse), 3 puntos.')), picBarbarians()),
      section(t('6. Consejos rápidos'), li(
        t('Construye caminos hacia las plazas: el carromato va el doble de rápido.'),
        t('Mejora el carromato pronto: cada entrega da más oro.'),
        t('Pon bárbaros en las rutas de quien va ganando.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}
