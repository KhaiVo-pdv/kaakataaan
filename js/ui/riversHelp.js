// Traders & Barbarians, "The Rivers of Catan" rules screen: short sections, each with a small
// picture drawn in code (SVG, shapes only), reusing the Seafarers rules layout classes.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import * as Rivers from '../engine/tradersBarbarians/rivers.js';
import { TB_SCENARIOS } from '../engine/tradersBarbarians/scenarios.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5', WATER = '#4fa3e0', MARSH = '#8fa35a';
const svgBox = (w, h0) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 16, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
const hex = (cx, cy, r, fill) => S('polygon', { points: hexPts(cx, cy, r), fill, stroke: '#1a1c2c', 'stroke-width': 2 });
const house = (x, y, color) => S('path', { d: 'M-9,7 L-9,-3 L0,-11 L9,-3 L9,7 Z', transform: `translate(${x},${y})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' });
const road = (x1, y1, x2, y2, color) => {
  const g = S('g');
  g.append(S('line', { x1, y1, x2, y2, stroke: '#1a1c2c', 'stroke-width': 9, 'stroke-linecap': 'round' }));
  g.append(S('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }));
  return g;
};
const river = (d, w = 14) => {
  const g = S('g');
  g.append(S('path', { d, fill: 'none', stroke: '#1f5f8f', 'stroke-width': w + 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.append(S('path', { d, fill: 'none', stroke: WATER, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return g;
};
const bridge = (x, y, ang, color) => {
  const g = S('g', { transform: `translate(${x},${y}) rotate(${ang})` });
  g.append(S('rect', { x: -22, y: -8, width: 44, height: 16, rx: 4, fill: '#9a6a3e', stroke: '#1a1c2c', 'stroke-width': 2 }));
  for (const yy of [-9, 9]) g.append(S('line', { x1: -19, y1: yy, x2: 19, y2: yy, stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' }));
  return g;
};
const coin = (x, y, n = '') => {
  const g = S('g');
  g.append(S('circle', { cx: x, cy: y, r: 12, fill: '#ffcd4a', stroke: '#8a6a12', 'stroke-width': 2.5 }));
  g.append(S('circle', { cx: x, cy: y, r: 7, fill: 'none', stroke: '#c99a1e', 'stroke-width': 1.5 }));
  if (n) g.append(label(x + 22, y + 5, n, { size: 14, anchor: 'start' }));
  return g;
};

// 1. the board: a marsh, a river out to sea, a bridge spot
function picBoard() {
  const svg = svgBox(320, 150);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 150, fill: '#2f7fc0', rx: 8 }));
  const R = 34, W = R * Math.sqrt(3);
  const cells = [[70, 75, MARSH], [70 + W, 75, TILE_INFO.wood.color], [70 + 2 * W, 75, TILE_INFO.ore.color]];
  cells.forEach(([x, y, c]) => svg.append(hex(x, y, R, c)));
  svg.append(river(`M70,75 L${70 + 2 * W},75 L${70 + 2.6 * W},75`));
  svg.append(S('ellipse', { cx: 58, cy: 92, rx: 12, ry: 6, fill: WATER, stroke: '#1f5f8f', 'stroke-width': 1.5 }));
  // posts on the edge between the two river hexes
  for (const y of [75 - 13, 75 + 13]) svg.append(S('circle', { cx: 70 + W / 2, cy: y, r: 4.5, fill: '#7a5232', stroke: '#1a1c2c', 'stroke-width': 1.5 }));
  svg.append(label(70, 30, t('pantano'), { size: 12 }), label(70 + W, 30, t('río'), { size: 12 }), label(70 + W / 2, 135, t('sitio de puente'), { size: 12 }));
  return svg;
}

// 2. bridges: roads can't cross, a bridge can
function picBridge() {
  const svg = svgBox(320, 120);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 120, fill: TILE_INFO.sheep.color, rx: 8 }));
  svg.append(river('M0,60 L320,60', 18));
  svg.append(road(40, 100, 100, 72, ME), house(40, 100, ME));
  svg.append(label(118, 50, '✕', { size: 22, color: '#ff6b6b' }));
  svg.append(road(190, 100, 215, 76, RIVAL), bridge(222, 60, 90, RIVAL), road(229, 44, 254, 20, RIVAL), house(190, 100, RIVAL));
  svg.append(coin(272, 92, '+3'));
  return svg;
}

// 3. gold: settlement at the river, road along it
function picGold() {
  const svg = svgBox(320, 110);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 110, fill: TILE_INFO.wheat.color, rx: 8 }));
  svg.append(river('M0,70 L320,70', 16));
  svg.append(house(70, 46, ME), coin(105, 40, '+1'));
  svg.append(road(170, 46, 250, 46, ME), coin(270, 22, '+1'));
  return svg;
}

// 4. trading gold
function picTrade() {
  const svg = svgBox(320, 90);
  svg.append(coin(30, 30), coin(56, 30), label(92, 36, '→', { size: 20 }));
  svg.append(S('rect', { x: 112, y: 14, width: 26, height: 34, rx: 4, fill: '#f7ecd0', stroke: '#1a1c2c', 'stroke-width': 2 }));
  svg.append(label(125, 70, `×${Rivers.GOLD_BUYS_PER_TURN}`, { size: 13 }));
  for (let i = 0; i < 4; i++) svg.append(S('rect', { x: 180 + i * 12, y: 14, width: 24, height: 32, rx: 4, fill: '#f7ecd0', stroke: '#1a1c2c', 'stroke-width': 2 }));
  svg.append(label(258, 36, '→', { size: 20 }), coin(290, 30));
  svg.append(label(220, 70, '4:1 / 3:1 / 2:1', { size: 12 }));
  return svg;
}

// 5. titles
function picTitles() {
  const svg = svgBox(320, 100);
  const rows = [[ME, 7, '👑 +1'], [RIVAL, 3, ''], ['#f4f4f4', 1, '😢 −2'], ['#fb8c00', 1, '😢 −2']];
  rows.forEach(([c, n, tag], i) => {
    const x = 40 + i * 76;
    svg.append(house(x, 24, c));
    for (let k = 0; k < Math.min(n, 4); k++) svg.append(coin(x - 10 + (k % 2) * 20, 52 + Math.floor(k / 2) * 14));
    svg.append(label(x, 96, `${n}🪙 ${tag}`, { size: 11 }));
  });
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

export function showRiversHelp() {
  const close = () => ov.remove();
  const cost = Object.entries(Rivers.BRIDGE_COST).map(([r, n]) => `${n} ${t(TILE_INFO[r].name)}`).join(' + ');
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'rivers-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🏞️ Reglas de Los ríos de Catán')),
      h('p', null, t('Un escenario de Mercaderes y Bárbaros. Las reglas básicas siguen igual; se gana con {vp} puntos. Esto es lo que cambia:', { vp: TB_SCENARIOS.rivers.vp })),
      section(t('1. Ríos y pantanos'), li(
        t('Dos ríos (de 3 y 4 casillas) nacen en un pantano y desembocan en el mar.'),
        t('Los pantanos no tienen número ni producen. El ladrón empieza en uno de ellos.'),
        t('Las casillas del río producen con normalidad.')), picBoard()),
      section(t('2. Puentes'), li(
        t('Ningún camino puede cruzar un río, ni siquiera al colocar las primeras piezas.'),
        t('Para cruzarlo construye un puente: {cost}. Solo en los 7 sitios marcados con postes, junto a tu camino o tu poblado.', { cost }),
        t('Máximo {n} puentes por jugador. Un puente cuenta como camino para el Camino más largo, pero no se puede poner con la carta Construcción de carreteras.', { n: Rivers.MAX_BRIDGES }),
        t('Cada puente da {n} de oro.', { n: Rivers.GOLD.bridge })), picBridge()),
      section(t('3. Ganar oro'), li(
        t('{n} de oro por cada poblado en una esquina de una casilla de río (también al empezar).', { n: Rivers.GOLD.settlement }),
        t('{n} de oro por cada camino a lo largo de una casilla de río.', { n: Rivers.GOLD.road }),
        t('Mejorar a ciudad no da oro. El oro no es una carta: no cuenta para el 7 y el ladrón no lo roba.')), picGold()),
      section(t('4. Usar el oro'), li(
        t('Botón 🪙 Oro: {n} de oro compran 1 recurso, como mucho {k} veces por turno.', { n: Rivers.GOLD_PER_RESOURCE, k: Rivers.GOLD_BUYS_PER_TURN }),
        t('También puedes conseguir oro cambiando recursos al cambio del banco o de tu puerto (4:1, 3:1 o 2:1).')), picTrade()),
      section(t('5. El colono más rico y los pobres'), li(
        t('👑 Quien tiene más oro él solo es el colono más rico: +1 punto. Si alguien lo iguala, nadie lo es.'),
        t('😢 Quien tiene menos oro (todos los empatados, también con 0) es colono pobre: −2 puntos.'),
        t('Se recalcula al momento: gastar oro puede costarte puntos.')), picTitles()),
      section(t('6. Consejos rápidos'), li(
        t('Un poblado junto al río al empezar te aleja de ser pobre desde el principio.'),
        t('Un puente vale doble: abre el otro lado y da 3 de oro.'),
        t('Antes de gastar oro, mira cuánto tienen los demás.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}
