// Traders & Barbarians, "The Caravans" rules screen: short sections, each with a small picture
// drawn in code (SVG, shapes only), reusing the Seafarers rules layout classes.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import * as Caravans from '../engine/tradersBarbarians/caravans.js';
import { TB_SCENARIOS } from '../engine/tradersBarbarians/scenarios.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5', SAND = '#f1d58e';
const svgBox = (w, h0) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 16, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
const hex = (cx, cy, r, fill) => S('polygon', { points: hexPts(cx, cy, r), fill, stroke: '#1a1c2c', 'stroke-width': 2 });
const corner = (cx, cy, r, i) => { const a = (Math.PI / 180) * (60 * i - 30); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const house = (x, y, color) => S('path', { d: 'M-9,7 L-9,-3 L0,-11 L9,-3 L9,7 Z', transform: `translate(${x},${y})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' });
const road = (x1, y1, x2, y2, color) => {
  const g = S('g');
  g.append(S('line', { x1, y1, x2, y2, stroke: '#1a1c2c', 'stroke-width': 9, 'stroke-linecap': 'round' }));
  g.append(S('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }));
  return g;
};
// a small camel at x,y facing +x (k = scale)
const camel = (x, y, k = 1, fill = '#c8925a') => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  const ink = { stroke: '#2a1d14', 'stroke-width': 2, 'stroke-linejoin': 'round' };
  for (const xx of [-9, -4, 6, 11]) g.append(S('line', { x1: xx, y1: 4, x2: xx, y2: 13, stroke: '#2a1d14', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  g.append(S('path', { d: 'M-14,5 Q-15,-3 -8,-5 Q-2,-15 5,-5 Q10,-4 12,2 Q8,7 -14,5 Z', fill, ...ink }));
  g.append(S('path', { d: 'M10,-1 L14,-12 Q16,-15 20,-13 L20,-9 L16,-9 L14,2 Z', fill, ...ink }));
  return g;
};
const card = (x, y, res) => {
  const g = S('g');
  g.append(S('rect', { x: x - 12, y: y - 16, width: 24, height: 32, rx: 4, fill: TILE_INFO[res].color, stroke: '#1a1c2c', 'stroke-width': 2 }));
  return g;
};

// 1. the oasis and the three starts
function picOasis() {
  const svg = svgBox(320, 170);
  const R = 42, cx = 160, cy = 78;
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 170, fill: TILE_INFO.sheep.color, rx: 8 }));
  svg.append(hex(cx, cy, R, SAND));
  svg.append(S('ellipse', { cx, cy: cy + 4, rx: 18, ry: 11, fill: '#4fa3e0', stroke: '#1f5f8f', 'stroke-width': 2 }));
  for (const i of [0, 2, 4]) {
    const [x, y] = corner(cx, cy, R, i), [ox, oy] = corner(cx, cy, R * 1.75, i);
    svg.append(S('line', { x1: x, y1: y, x2: ox, y2: oy, stroke: '#7a5232', 'stroke-width': 4, 'stroke-dasharray': '6 5' }));
    svg.append(camel(x + (ox - x) * 0.6, y + (oy - y) * 0.6 - 6, 0.8));
    svg.append(S('circle', { cx: x, cy: y, r: 5, fill: '#e0b45a', stroke: '#1a1c2c', 'stroke-width': 1.5 }));
  }
  svg.append(label(70, 160, t('oasis: 3 salidas'), { size: 12 }));
  return svg;
}

// 2. how a caravan grows: two ways on at the far end of the last camel
function picGrow() {
  const svg = svgBox(320, 130);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 130, fill: TILE_INFO.wheat.color, rx: 8 }));
  const pts = [[40, 90], [100, 60], [160, 90]];
  svg.append(S('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#e8c27a', 'stroke-width': 4, 'stroke-dasharray': '3 7' }));
  svg.append(camel(70, 68, 1), camel(130, 68, 1));
  for (const [x, y, L] of [[200, 60, 'A'], [190, 115, 'B']]) {
    svg.append(S('line', { x1: 160, y1: 90, x2: x, y2: y, stroke: '#ffcd75', 'stroke-width': 3, 'stroke-dasharray': '6 4' }));
    svg.append(S('circle', { cx: (160 + x) / 2 + 8, cy: (90 + y) / 2, r: 11, fill: '#1a1c2c', stroke: '#ffcd75', 'stroke-width': 2 }));
    svg.append(S('text', { x: (160 + x) / 2 + 8, y: (90 + y) / 2 + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#ffcd75' }, L));
  }
  svg.append(label(262, 70, t('2 caminos'), { size: 12 }), label(262, 88, t('por caravana'), { size: 12 }));
  return svg;
}

// 3. voting with wool and grain
function picVote() {
  const svg = svgBox(320, 100);
  svg.append(house(30, 30, ME), card(65, 34, 'sheep'), card(93, 34, 'sheep'), label(125, 40, '→ A', { size: 16, anchor: 'start' }));
  svg.append(house(190, 30, RIVAL), card(225, 34, 'wheat'), label(255, 40, '→ B', { size: 16, anchor: 'start' }));
  svg.append(label(160, 88, t('2 votos para A: el camello va a A'), { size: 13 }));
  return svg;
}

// 4. the rewards: +1 VP between two camels, roads beside camels count double
function picRewards() {
  const svg = svgBox(320, 120);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 120, fill: TILE_INFO.sheep.color, rx: 8 }));
  svg.append(camel(45, 50, 0.9), camel(105, 50, 0.9), house(75, 60, ME), label(75, 30, '+1', { size: 18, color: '#ffe08a' }));
  svg.append(road(180, 70, 240, 70, RIVAL), camel(210, 50, 0.9), road(240, 70, 290, 95, RIVAL));
  svg.append(label(235, 112, t('camino junto a un camello = 2'), { size: 12 }));
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

export function showCaravansHelp() {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'caravans-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🐪 Reglas de Las caravanas')),
      h('p', null, t('Un escenario de Mercaderes y Bárbaros. Las reglas básicas siguen igual; se gana con {vp} puntos. Esto es lo que cambia:', { vp: TB_SCENARIOS.caravans.vp })),
      section(t('1. El oasis'), li(
        t('El oasis sustituye al desierto, en el centro de la isla. No produce y el ladrón nunca puede ir allí; empieza fuera del tablero.'),
        t('Tres flechas marcan dónde salen las tres caravanas. Hay {n} camellos en total.', { n: Caravans.CAMELS })), picOasis()),
      section(t('2. Cómo avanzan las caravanas'), li(
        t('Los camellos van junto a los caminos entre dos casillas de tierra (no en la costa ni junto al oasis).'),
        t('Cada camello nuevo sigue desde el extremo lejano del último de su caravana: 2 caminos posibles, sin ramas. Dos caravanas pueden unirse.'),
        t('Una caravana sin salida se detiene; cuando se acaban los camellos, se detienen todas.')), picGrow()),
      section(t('3. La votación'), li(
        t('Al final de un turno en el que alguien construyó un poblado o una ciudad, se vota dónde va un camello.'),
        t('Desde quien construyó, cada jugador vota una vez: da cartas de lana y/o trigo (1 carta = 1 voto, vuelven al banco) y elige un sitio (A, B, C…, marcados en el tablero).'),
        t('Gana el sitio con más votos. Si hay empate, decide quien dio más cartas él solo; si nadie, el jugador del turno.')), picVote()),
      section(t('4. Las ventajas'), li(
        t('Un poblado o ciudad con camellos en 2 de sus 3 caminos vale +1 punto.'),
        t('Un camino junto a un camello cuenta como 2 para el Camino más largo.')), picRewards()),
      section(t('5. Consejos rápidos'), li(
        t('Construye cerca del oasis: por ahí pasan las primeras caravanas.'),
        t('Guarda alguna lana o trigo para las votaciones que te importan.'),
        t('Mira las letras: el panel te dice a quién beneficia cada sitio.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}
