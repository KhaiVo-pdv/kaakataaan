// Traders & Barbarians, "The Fishermen of Catan" rules screen: short sections, each with a small
// picture drawn in code (SVG, shapes only), reusing the Seafarers rules layout classes.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import { LAKE_NUMS, FISHING_NUMS, FISH_TOKENS, FISH_PERKS } from '../engine/tradersBarbarians/fishermen.js';
import { TB_SCENARIOS } from '../engine/tradersBarbarians/scenarios.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5';
const SEA = '#2f7fc0', LAKE = '#4fa8e2';
const svgBox = (w, h0) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 16, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
const hex = (cx, cy, r, fill) => S('polygon', { points: hexPts(cx, cy, r), fill, stroke: '#1a1c2c', 'stroke-width': 2 });
const house = (x, y, color) => S('path', { d: 'M-9,7 L-9,-3 L0,-11 L9,-3 L9,7 Z', transform: `translate(${x},${y})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' });
const city = (x, y, color) => S('path', { d: 'M-12,8 L-12,-4 L-6,-10 L0,-4 L0,-12 L6,-18 L12,-12 L12,8 Z', transform: `translate(${x},${y})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' });
const fish = (x, y, k = 1, fill = '#ffb86b') => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  g.append(S('path', { d: 'M-14,0 Q-4,-9 8,-4 L15,-9 L13,0 L15,9 L8,4 Q-4,9 -14,0 Z', fill, stroke: '#1a1c2c', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  g.append(S('circle', { cx: -7, cy: -1.5, r: 1.6, fill: '#1a1c2c' }));
  return g;
};
const token = (x, y, text, r = 16) => {
  const g = S('g');
  g.append(S('circle', { cx: x, cy: y, r, fill: '#f7ecd0', stroke: '#1a1c2c', 'stroke-width': 2 }));
  g.append(S('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#1a1c2c' }, text));
  return g;
};
// a round fish token: k fish on it (0 = the old boot)
const fishToken = (x, y, k) => {
  const g = S('g');
  g.append(S('circle', { cx: x, cy: y, r: 22, fill: k ? '#cfe9f7' : '#d8c9a8', stroke: '#1a1c2c', 'stroke-width': 2 }));
  if (!k) g.append(S('path', { d: 'M-6,-14 L4,-14 L4,4 L13,6 Q15,12 9,13 L-6,13 Z', transform: `translate(${x},${y})`, fill: '#6b4a2e', stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  for (let i = 0; i < k; i++) g.append(fish(x, y - (k - 1) * 6 + i * 12, 0.55));
  return g;
};

// 1. the board: lake in the middle, fishing grounds on the coast
function picBoard() {
  const svg = svgBox(320, 182);
  const R = 30, W = R * Math.sqrt(3);
  const land = [[160, 85], [160 - W, 85], [160 + W, 85], [160 - W / 2, 40], [160 + W / 2, 40], [160 - W / 2, 130], [160 + W / 2, 130]];
  const colors = [LAKE, TILE_INFO.wood.color, TILE_INFO.wheat.color, TILE_INFO.ore.color, TILE_INFO.sheep.color, TILE_INFO.brick.color, TILE_INFO.wheat.color];
  land.forEach(([x, y], i) => svg.append(hex(x, y, R, colors[i])));
  svg.append(fish(152, 76, 0.8), fish(170, 84, 0.6, '#ffe08a'));
  svg.append(S('rect', { x: 130, y: 92, width: 60, height: 16, rx: 4, fill: '#f7ecd0', stroke: '#1a1c2c', 'stroke-width': 1.5 }));
  svg.append(S('text', { x: 160, y: 104, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: '#1a1c2c' }, LAKE_NUMS.join('·')));
  for (const [x, y, n] of [[160 - W * 1.5, 40, 5], [160 + W * 1.5, 130, 9]]) {
    svg.append(S('circle', { cx: x, cy: y, r: 24, fill: 'rgba(120,205,255,.35)', stroke: '#d9f3ff', 'stroke-width': 2.5, 'stroke-dasharray': '7 4' }));
    svg.append(token(x, y + 4, String(n), 13));
  }
  svg.append(label(4, 14, t('caladero'), { size: 12, anchor: 'start' }), label(160, 176, t('lago'), { size: 12 }));
  return svg;
}

// 2. fishing: a settlement draws 1 token, a city 2
function picCatch() {
  const svg = svgBox(320, 120);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 120, fill: SEA, rx: 8 }));
  svg.append(S('circle', { cx: 70, cy: 60, r: 34, fill: 'rgba(120,205,255,.35)', stroke: '#d9f3ff', 'stroke-width': 2.5, 'stroke-dasharray': '7 4' }));
  svg.append(token(70, 64, '6', 14));
  svg.append(house(130, 34, ME), city(130, 92, RIVAL));
  svg.append(label(160, 40, '→', { size: 20 }), label(160, 98, '→', { size: 20 }));
  svg.append(fishToken(200, 34, 2), label(240, 40, '×1', { size: 16, anchor: 'start' }));
  svg.append(fishToken(200, 92, 1), fishToken(250, 92, 3), label(282, 98, '×2', { size: 16, anchor: 'start' }));
  return svg;
}

// 3. the tokens in the bag
function picTokens() {
  const svg = svgBox(320, 90);
  [[1, 50], [2, 125], [3, 200], [0, 275]].forEach(([k, x]) => {
    svg.append(fishToken(x, 36, k));
    svg.append(label(x, 82, k ? `×${FISH_TOKENS[k]}` : '×1', { size: 14 }));
  });
  return svg;
}

// 4. what fish buy
function perkTable() {
  const rows = [
    ['robber', '🦹', t('Sacar al ladrón del tablero (vuelve con el próximo 7 o caballero)')],
    ['steal', '🫳', t('Robar 1 carta al azar a un rival que elijas')],
    ['resource', '🏦', t('Tomar 1 recurso del banco, el que quieras')],
    ['road', '🛤️', t('Construir 1 camino gratis')],
    ['dev', '🃏', t('Tomar 1 carta de desarrollo')],
  ];
  return h('table', { class: 'fish-help-table' }, rows.map(([id, icon, text]) =>
    h('tr', null, h('td', { class: 'fish-help-cost' }, `${FISH_PERKS[id]} 🐟`), h('td', null, icon), h('td', null, text))));
}

// 5. the old boot
function picBoot() {
  const svg = svgBox(320, 90);
  svg.append(fishToken(60, 45, 0));
  svg.append(label(150, 40, '10 → 11', { size: 22 }));
  svg.append(label(150, 66, t('puntos para ganar'), { size: 12, color: '#c2c3c7' }));
  svg.append(house(240, 50, ME), label(262, 56, '→', { size: 18 }), house(290, 50, RIVAL));
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

export function showFishermenHelp() {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'fishermen-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🐟 Reglas de Los pescadores de Catán')),
      h('p', null, t('Un escenario de Mercaderes y Bárbaros. Las reglas básicas siguen igual; se gana con {vp} puntos. Esto es lo que cambia:', { vp: TB_SCENARIOS.fishermen.vp })),
      section(t('1. El lago y los caladeros'), li(
        t('El desierto se convierte en un lago: da pescado cuando sale {nums}.', { nums: LAKE_NUMS.join(', ') }),
        t('Seis caladeros rodean la isla, con los números {nums}. Cada uno toca los cruces de la costa unidos a él por líneas.', { nums: FISHING_NUMS.join(', ') }),
        t('El ladrón puede ir al lago y lo bloquea, como cualquier casilla.')), picBoard()),
      section(t('2. Pescar'), li(
        t('Cuando sale el número de un caladero (o del lago), cada poblado que lo toca roba 1 ficha de pescado de la bolsa y cada ciudad 2.'),
        t('Las fichas valen 1, 2 o 3 peces. No son cartas: no cuentan para el 7 y el ladrón no las roba.'),
        t('Cuando la bolsa se vacía, las fichas gastadas se barajan y vuelven a la bolsa.')), picCatch()),
      section(t('3. La bolsa'), li(
        t('{a} fichas de 1 pez, {b} de 2 y {c} de 3.', { a: FISH_TOKENS[1], b: FISH_TOKENS[2], c: FISH_TOKENS[3] }),
        t('Y una bota vieja (ver la sección 5).')), picTokens()),
      section(t('4. Gastar pescado'), [li(
        t('En tu turno, después de tirar, con el botón 🎣 Pescado. Puedes gastar varias veces por turno.'),
        t('No se devuelve el cambio: si pagas 4 con una ficha de 3 y otra de 2, pierdes un pez. El juego elige las fichas que menos sobran.')), perkTable()], []),
      section(t('5. La bota vieja 👢'), li(
        t('Quien la pesca la deja delante: necesita 1 punto más para ganar.'),
        t('En tu turno puedes pasársela a un jugador con tantos puntos visibles como tú o más (botón 🎣 Pescado).')), picBoot()),
      section(t('6. Consejos rápidos'), li(
        t('Un poblado junto a un caladero con 6 u 8 pesca a menudo.'),
        t('7 peces = una carta de desarrollo sin gastar recursos: ¡caballeros y puntos ocultos!'),
        t('Quitar al ladrón por 2 peces libera tu mejor casilla.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}

const CSS = `
.sf-help .fish-help-table { border-collapse: collapse; margin-top: 6px; }
.sf-help .fish-help-table td { padding: 4px 8px; border-bottom: 1px dashed rgba(0,0,0,.2); vertical-align: middle; }
.sf-help .fish-help-cost { font-weight: 700; white-space: nowrap; }
`;
if (globalThis.document && !document.getElementById('fish-help-css')) {
  const st = document.createElement('style');
  st.id = 'fish-help-css';
  st.textContent = CSS;
  document.head.append(st);
}
