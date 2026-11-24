// Traders & Barbarians, "Barbarian Attack" rules screen: short sections, each with a small picture
// drawn in code (SVG, shapes only), reusing the Seafarers rules layout classes.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import * as BA from '../engine/tradersBarbarians/barbarianAttack.js';
import { TB_SCENARIOS } from '../engine/tradersBarbarians/scenarios.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5', SEA = '#2f6fa8';
const svgBox = (w, h0) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 16, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
const hex = (cx, cy, r, fill, o = {}) => S('polygon', { points: hexPts(cx, cy, r), fill, stroke: '#1a1c2c', 'stroke-width': 2, ...o });
const corner = (cx, cy, r, i) => { const a = (Math.PI / 180) * (60 * i - 30); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const token = (x, y, n) => {
  const g = S('g');
  g.append(S('circle', { cx: x, cy: y, r: 11, fill: '#f7ecd0', stroke: '#9c8a60', 'stroke-width': 1.5 }));
  g.append(S('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: n === 6 || n === 8 ? '#c0392b' : '#1a1c2c' }, n));
  return g;
};
const faceDown = (x, y) => S('circle', { cx: x, cy: y, r: 11, fill: '#6b3d2a', stroke: '#2a1a12', 'stroke-width': 1.5 });
const barbarian = (x, y, k = 1) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  const ink = { stroke: '#1a1410', 'stroke-width': 2, 'stroke-linejoin': 'round' };
  g.append(S('path', { d: 'M-8,0 L-6,-11 Q0,-14 6,-11 L8,0 Z', fill: '#5a2e1c', ...ink }));
  g.append(S('circle', { cx: 0, cy: -15, r: 5, fill: '#e2b48a', ...ink }));
  g.append(S('path', { d: 'M-6,-17 Q0,-24 6,-17 Z', fill: '#8d8f96', ...ink }));
  g.append(S('path', { d: 'M-6,-18 Q-10,-20 -10,-26 Q-7,-21 -4,-20 Z M6,-18 Q10,-20 10,-26 Q7,-21 4,-20 Z', fill: '#efe6cf', ...ink }));
  return g;
};
const shield = (x, y, color, k = 1) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  g.append(S('path', { d: 'M-9,-11 L9,-11 L9,0 Q9,8 0,12 Q-9,8 -9,0 Z', fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  g.append(S('path', { d: 'M0,-8 L0,8 M-6,-2 L6,-2', stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  return g;
};
const castle = (x, y, k = 1) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  const ink = { stroke: '#2b2b33', 'stroke-width': 2, 'stroke-linejoin': 'round' };
  g.append(S('rect', { x: -16, y: -16, width: 32, height: 22, fill: '#a7aab3', ...ink }));
  for (const xx of [-24, 15]) g.append(S('rect', { x: xx, y: -26, width: 9, height: 32, fill: '#b9bcc4', ...ink }));
  g.append(S('path', { d: 'M-5,6 L-5,-3 Q0,-9 5,-3 L5,6 Z', fill: '#4a3424', ...ink }));
  g.append(S('path', { d: 'M-20,-26 L-20,-38 L-9,-34 L-20,-31', fill: '#c0392b', ...ink }));
  return g;
};

// 1. the board: castle on the coast, barbarians on the coastal 2 and 12
function picBoard() {
  const svg = svgBox(320, 170);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 170, fill: SEA, rx: 8 }));
  const R = 34, cells = [[90, 60, 'wood', 2], [149, 60, 'wheat', 9], [208, 60, 'ore', 12], [120, 111, 'sheep', 5], [179, 111, 'castle']];
  for (const [x, y, res, n] of cells) {
    svg.append(hex(x, y, R, res === 'castle' ? '#8e9a7a' : TILE_INFO[res].color));
    if (res === 'castle') svg.append(castle(x, y + 8, 0.9));
    else svg.append(token(x, y + 10, n));
  }
  svg.append(barbarian(84, 42, 0.9), barbarian(202, 42, 0.9));
  svg.append(label(262, 140, t('castillo'), { size: 12, anchor: 'start' }));
  svg.append(label(60, 158, t('1 bárbaro en el 2 y en el 12'), { size: 12, anchor: 'start' }));
  return svg;
}

// 2. landing and conquest: 3 barbarians turn the number face down
function picConquer() {
  const svg = svgBox(320, 130);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 130, fill: SEA, rx: 8 }));
  svg.append(hex(80, 62, 40, TILE_INFO.brick.color), token(80, 76, 8), barbarian(70, 48, 0.9), barbarian(90, 48, 0.9));
  svg.append(label(160, 62, '+ ⚔️ →', { size: 18 }));
  svg.append(hex(240, 62, 40, TILE_INFO.brick.color), hex(240, 62, 40, '#2a0e0a', { opacity: 0.55 }), faceDown(240, 76));
  for (const dx of [-16, 0, 16]) svg.append(barbarian(240 + dx, 48, 0.9));
  svg.append(label(160, 120, t('3 bárbaros = casilla conquistada'), { size: 13 }));
  return svg;
}

// 3. the four cards
function picCards() {
  const svg = svgBox(320, 110);
  const cards = [['🛡️', BA.CARD_DECK.knight], ['🖤', BA.CARD_DECK.blackKnight], ['🗡️', BA.CARD_DECK.treason], ['🕵️', BA.CARD_DECK.intrigue]];
  cards.forEach(([icon, n], i) => {
    const x = 20 + i * 76;
    svg.append(S('rect', { x, y: 10, width: 60, height: 80, rx: 6, fill: '#f7ecd0', stroke: '#1a1c2c', 'stroke-width': 2 }));
    svg.append(S('text', { x: x + 30, y: 52, 'text-anchor': 'middle', 'font-size': 26 }, icon));
    svg.append(label(x + 30, 82, '×' + n, { size: 13 }));
  });
  return svg;
}

// 4. a battle: 2 knights around a hex with 1 barbarian → freed, 1 prisoner
function picBattle() {
  const svg = svgBox(320, 140);
  svg.append(S('rect', { x: 0, y: 0, width: 320, height: 140, fill: SEA, rx: 8 }));
  const cx = 100, cy = 70, R = 46;
  svg.append(hex(cx, cy, R, TILE_INFO.wheat.color), token(cx, cy + 14, 10), barbarian(cx, cy - 6, 1));
  const mid = i => { const [ax, ay] = corner(cx, cy, R, i), [bx, by] = corner(cx, cy, R, (i + 1) % 6); return [(ax + bx) / 2, (ay + by) / 2]; };
  svg.append(shield(...mid(4), ME, 1), shield(...mid(0), ME, 1));
  svg.append(label(200, 62, '2 > 1 →', { size: 16 }));
  svg.append(barbarian(262, 78, 1.1), S('path', { d: 'M248,84 L276,84', stroke: '#c9c9c9', 'stroke-width': 3, 'stroke-dasharray': '3 3' }));
  svg.append(label(262, 110, t('prisionero'), { size: 12 }));
  svg.append(label(100, 132, t('al final del turno'), { size: 12 }));
  return svg;
}

// 5. prisoners and gold
function picRewards() {
  const svg = svgBox(320, 90);
  svg.append(barbarian(40, 52, 1), barbarian(70, 52, 1), label(115, 50, '= +1 ⭐', { size: 16, anchor: 'start' }));
  svg.append(shield(220, 44, RIVAL, 1.1), label(240, 50, '💀 → 🪙3', { size: 15, anchor: 'start' }));
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

export function showBarbarianAttackHelp() {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'ba-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('⚔️ Reglas de El ataque de los bárbaros')),
      h('p', null, t('Un escenario de Mercaderes y Bárbaros. Las reglas básicas siguen igual; se gana con {vp} puntos. Esto es lo que cambia:', { vp: TB_SCENARIOS.barbarianAttack.vp })),
      section(t('1. El castillo y la costa'), li(
        t('Un castillo ocupa una casilla de la costa; un desierto, la costa del otro lado. Ninguno produce.'),
        t('Empieza un bárbaro en la casilla costera del 2 y otro en la del 12. Hay {n} bárbaros en total.', { n: BA.BARBARIANS }),
        t('Tu segundo poblado inicial es una ciudad. No hay ladrón ni Ejército más grande.')), picBoard()),
      section(t('2. Desembarcos y conquistas'), li(
        t('Cada vez que alguien construye un poblado o una ciudad, se tiran los dados 3 veces: llega un bárbaro a la casilla de la costa con ese número (los 7 y las casillas repetidas se vuelven a tirar).'),
        t('Con 3 bárbaros la casilla queda conquistada: no produce, su número se pone boca abajo y no se puede construir junto a ella.'),
        t('Un poblado o ciudad rodeado solo de casillas conquistadas no da puntos ni usa su puerto hasta que se libere una.')), picConquer()),
      section(t('3. Las cartas'), li(
        t('En lugar de cartas de desarrollo hay un mazo propio (cuesta lo mismo). La carta se revela y se usa al comprarla.'),
        t('🛡️ Caballería: un caballero nuevo en un camino libre junto al castillo. 🖤 Caballero negro: en cualquier camino libre.'),
        t('🗡️ Traición: 2 de oro y mueves hasta 2 bárbaros entre casillas de la costa. 🕵️ Intriga: un bárbaro de cualquier casilla pasa a ser tu prisionero.')), picCards()),
      section(t('4. Caballeros y batallas'), li(
        t('Cada jugador tiene {n} caballeros. Uno se mueve hasta 3 caminos por turno (1 cereal por cada camino de más, 5 como mucho); pasa por encima de todo, pero no puede acabar en un camino ocupado ni junto al castillo.', { n: BA.KNIGHTS }),
        t('Al final de tu turno, en cada casilla con bárbaros donde haya más caballeros (de cualquiera) en sus 6 caminos que bárbaros, los bárbaros son expulsados: quedan como prisioneros de los dueños de esos caballeros.'),
        t('Después se tira un dado: los caballeros de un par de caminos opuestos de esa casilla caen y vuelven a la reserva.')), picBattle()),
      section(t('5. Prisioneros, oro y el 7'), li(
        t('Cada {n} prisioneros valen 1 punto.', { n: BA.PRISONERS_PER_VP }),
        t('Un caballero caído da 3 de oro a su dueño. Con 2 de oro compras 1 recurso (2 veces por turno), y puedes cambiar recursos por oro.'),
        t('Al sacar un 7 se descarta como siempre y luego robas una carta a quien elijas.')), picRewards()),
      section(t('6. Consejos rápidos'), li(
        t('Compra cartas pronto: sin caballeros los bárbaros se comen la costa.'),
        t('Junta caballeros con otros jugadores: liberar una casilla ayuda a todos los que tienen edificios allí.'),
        t('Construye tierra adentro si puedes: allí los bárbaros nunca llegan.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}
