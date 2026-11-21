// Cities & Knights rules screen: short sections, each with a small picture drawn in code (SVG),
// in the same style as the Seafarers rules (it reuses that screen's layout classes).
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import { CK_VP } from '../engine/expansions.js';
import { COMMODITY_OF } from '../engine/citiesKnights/commodities.js';
import { TRACKS, TRACK_INFO, TRACK_COMMODITY, MAX_LEVEL, ABILITY_LEVEL, METRO_LEVEL, WALL_COST, MAX_WALLS } from '../engine/citiesKnights/improvements.js';
import { KNIGHT_COST, ACTIVATE_COST, KNIGHT_NAMES } from '../engine/citiesKnights/knights.js';
import { BARBARIAN_TRACK } from '../engine/citiesKnights/barbarians.js';
import { PROGRESS_CARDS, PROGRESS_TRACKS, PROGRESS_HAND } from '../engine/citiesKnights/progress.js';
import './seafarersHelp.js'; // the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935', RIVAL = '#1e88e5';
const TRACK_COLOR = { trade: '#e8c547', politics: '#4a8fe0', science: '#4fb36a' };
const cost = c => Object.entries(c).map(([r, n]) => TILE_INFO[r].icon.repeat(n)).join(' + ');
const svgBox = (w, h0, width) => S('svg', { viewBox: `0 0 ${w} ${h0}`, width: width || w, class: 'sf-diagram', role: 'img' });
const label = (x, y, text, o = {}) => S('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 16, 'font-weight': 700, fill: o.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, text);
const hex = (cx, cy, r, fill) => S('polygon', {
  points: Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' '),
  fill, stroke: '#1a1c2c', 'stroke-width': 2,
});
const city = (x, y, color, k = 1) => S('path', { d: 'M-12,8 L-12,-4 L-6,-10 L0,-4 L0,-12 L6,-18 L12,-12 L12,8 Z', transform: `translate(${x},${y}) scale(${k})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' });
const card = (x, y, res) => {
  const g = S('g', { transform: `translate(${x},${y})` });
  g.append(S('rect', { x: -14, y: -19, width: 28, height: 38, rx: 3, fill: TILE_INFO[res].color, stroke: '#1a1c2c', 'stroke-width': 2 }));
  return g;
};
const shield = (x, y, color, level, active) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(1.4)` });
  g.append(S('circle', { r: 19, fill: 'none', stroke: active ? '#ffcd75' : '#8a93a8', 'stroke-width': active ? 4 : 2, 'stroke-dasharray': active ? null : '4 3' }));
  g.append(S('path', { d: 'M-11,-12 L11,-12 L11,1 Q11,11 0,15 Q-11,11 -11,1 Z', fill: color, stroke: '#1a1c2c', 'stroke-width': 2.5 }));
  for (let i = 0; i < level; i++) g.append(S('circle', { cx: (i - (level - 1) / 2) * 7, cy: 0, r: 2.8, fill: '#fff', stroke: '#1a1c2c', 'stroke-width': 1 }));
  return g;
};

const shipShape = (x, y, k = 1) => {
  const g = S('g', { transform: `translate(${x},${y}) scale(${k})` });
  g.append(S('path', { d: 'M-18,4 L18,4 L12,12 L-12,12 Z', fill: '#4a2c1a', stroke: '#1a1c2c', 'stroke-width': 2 }));
  g.append(S('rect', { x: -1.5, y: -16, width: 3, height: 20, fill: '#2b1a10' }));
  g.append(S('path', { d: 'M1,-15 L15,-6 L1,2 Z', fill: '#8e1b1b', stroke: '#1a1c2c', 'stroke-width': 1.5 }));
  return g;
};
const tower = (x, y, color) => S('path', { d: 'M-5,9 L-5,-6 L-7,-6 L-7,-10 L7,-10 L7,-6 L5,-6 L5,9 Z', transform: `translate(${x},${y})`, fill: color, stroke: '#1a1c2c', 'stroke-width': 1.5 });

// ---------- the pictures ----------
// 1. a city next to forest / pasture / mountains gives a resource and a commodity
function picCommodities() {
  const svg = svgBox(330, 120);
  Object.entries(COMMODITY_OF).forEach(([res, com], i) => {
    const x = 55 + i * 110;
    svg.append(hex(x, 40, 30, TILE_INFO[res].color), city(x + 26, 62, ME, 0.9));
    svg.append(card(x - 16, 98, res), card(x + 16, 98, com));
  });
  return svg;
}
// 2. the three improvement tracks: 5 levels, ability at 3, metropolis from 4
function picTracks() {
  const svg = svgBox(320, 130);
  TRACKS.forEach((tr, i) => {
    const y = 26 + i * 40;
    svg.append(S('rect', { x: 18, y: y - 9, width: 18, height: 18, fill: TILE_INFO[TRACK_COMMODITY[tr]].color, stroke: '#1a1c2c', 'stroke-width': 2 }));
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const x = 40 + l * 44, on = l <= 3 - i;
      svg.append(S('rect', { x: x - 16, y: y - 12, width: 32, height: 24, fill: on ? TRACK_COLOR[tr] : '#2a2f45', stroke: '#1a1c2c', 'stroke-width': 2 }));
      if (l >= METRO_LEVEL) svg.append(tower(x, y, '#c9ccd6'));
      else svg.append(label(x, y + 6, l === ABILITY_LEVEL ? '★' : String(l), { size: 15 }));
    }
  });
  return svg;
}
// 3. knights: three strengths, inactive (dashed) and active (gold ring)
function picKnights() {
  const svg = svgBox(330, 110);
  [1, 2, 3].forEach((lvl, i) => {
    const x = 55 + i * 75;
    svg.append(shield(x, 42, ME, lvl, i > 0), label(x, 100, String(lvl), { size: 14 }));
  });
  svg.append(shield(280, 42, RIVAL, 1, false), label(280, 100, '✗', { size: 16, color: '#ef7d57' }));
  return svg;
}
// 4. the event die faces
function picEventDie() {
  const svg = svgBox(330, 70);
  const faces = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];
  faces.forEach((f, i) => {
    const x = 32 + i * 53;
    svg.append(S('rect', { x: x - 22, y: 12, width: 44, height: 44, rx: 6, fill: f === 'ship' ? '#3b2a1a' : TRACK_COLOR[f], stroke: '#1a1c2c', 'stroke-width': 2.5 }));
    if (f === 'ship') svg.append(shipShape(x, 34, 0.9));
  });
  return svg;
}
// 5. the barbarians' way and the fight
function picBarbarians() {
  const svg = svgBox(330, 130);
  for (let i = 0; i <= BARBARIAN_TRACK; i++) {
    const x = 26 + i * 38;
    svg.append(S('circle', { cx: x, cy: 34, r: i === BARBARIAN_TRACK ? 11 : 8, fill: i > 0 && i <= 4 ? '#e0533a' : i === BARBARIAN_TRACK ? '#ffd36a' : '#d9d4c7', stroke: '#1a1c2c', 'stroke-width': 2 }));
  }
  svg.append(shipShape(178, 14));
  svg.append(city(60, 92, ME), city(90, 92, RIVAL), city(120, 92, '#fb8c00'), label(150, 98, '=', { size: 20 }), shipShape(185, 94, 0.8), label(205, 98, '3', { size: 16, anchor: 'start' }));
  svg.append(label(165, 124, t('contra'), { size: 12, color: '#c2c3c7' }));
  svg.append(shield(255, 92, ME, 2, true), shield(300, 92, RIVAL, 1, true));
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

function progressList() {
  return h('div', { class: 'ck-help-cards' }, PROGRESS_TRACKS.map(tr => h('div', { class: 'ck-help-col' },
    h('b', { style: { color: TRACK_COLOR[tr] } }, `${TRACK_INFO[tr].icon} ${t(TRACK_INFO[tr].name)}`),
    h('ul', null, Object.entries(PROGRESS_CARDS).filter(([, c]) => c.track === tr).map(([, c]) =>
      h('li', { title: t(c.desc) }, `${c.icon} ${t(c.name)}${c.n > 1 ? ` ×${c.n}` : ''}`))))));
}

export function showCitiesKnightsHelp() {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'ck-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🏰 Reglas de Ciudades y Caballeros')),
      h('p', null, t('Ciudades y Caballeros añade mercancías, mejoras de ciudad, caballeros que defienden la isla de los bárbaros y cartas de progreso. Las reglas básicas siguen igual, salvo lo que se cuenta aquí.')),
      section(t('1. Lo que cambia'), li(
        t('Se gana con {vp} puntos.', { vp: CK_VP }),
        t('No hay cartas de desarrollo: las sustituyen las cartas de progreso (sección 6).'),
        t('Una ciudad junto al bosque, el pasto o la montaña da 1 recurso + 1 mercancía (📜 papel, 🧵 tela, 🪙 moneda). Junto a las otras casillas da 2 recursos, como siempre.'),
        t('Las mercancías cuentan como cartas para el 7 y se pueden comerciar (4:1 con el banco).')), picCommodities()),
      section(t('2. Mejoras de ciudad'), li(
        t('Botón 🏛️ Mejoras. Tres ramas: comercio (paga 🧵), política (paga 🪙) y ciencia (paga 📜). Cada nivel cuesta tantas mercancías como su número. Necesitas al menos una ciudad.'),
        t('★ Nivel {n}: una habilidad para siempre. Comercio: mercancías 2:1 con el banco. Política: caballeros poderosos. Ciencia: el acueducto te da 1 recurso a elegir si una tirada no te da nada.', { n: ABILITY_LEVEL }),
        t('🏙️ Nivel {n}: el primero levanta la metrópolis de esa rama sobre una ciudad (+2 puntos). Si alguien llega al nivel 5 antes que tú, te la quita.', { n: METRO_LEVEL }),
        t('🧱 Muralla ({cost}, hasta {n}): bajo una ciudad, +2 cartas al límite del 7. Está en el mismo panel.', { cost: cost(WALL_COST), n: MAX_WALLS })), picTracks()),
      section(t('3. Caballeros'), li(
        t('Botón ⚔️ Caballeros. Reclutar cuesta {cost}: un {name} en un cruce libre junto a tu camino, inactivo.', { cost: cost(KNIGHT_COST), name: t(KNIGHT_NAMES[1]) }),
        t('Activar cuesta {cost}. Solo los activos (anillo dorado) cuentan contra los bárbaros.', { cost: cost(ACTIVATE_COST) }),
        t('Ascender cuesta {cost}: básico → fuerte → poderoso (poderoso: política nivel 3).', { cost: cost(KNIGHT_COST) }),
        t('Un caballero activo puede actuar desde el turno siguiente: moverse por tus caminos, expulsar a un caballero rival más débil o echar al ladrón de una casilla vecina. Después queda inactivo.'),
        t('Un caballero rival corta tus caminos y tu Camino más largo.')), picKnights()),
      section(t('4. El dado de evento'), li(
        t('Se tira con los dos dados de números (el rojo es el que cuenta para las cartas).'),
        t('⛵ Barco (3 caras): los bárbaros avanzan una casilla.'),
        t('Puerta de color: roba una carta de progreso de ese color quien tenga en esa rama un nivel igual o mayor que el dado rojo menos 1. Toca el dado para ver quién roba.')), picEventDie()),
      section(t('5. Los bárbaros 🏴‍☠️'), li(
        t('Cuando el barco completa las {n} casillas, atacan. Fuerza bárbara: una por cada ciudad en el tablero. Fuerza de Catan: la suma de los caballeros activos de todos.', { n: BARBARIAN_TRACK }),
        t('Si Catan iguala o supera: quien aportó más fuerza es 🛡️ Defensor de Catan (+1 punto). Si hay empate, cada uno roba una carta de progreso.'),
        t('Si pierde: quien aportó menos (entre los que tienen ciudad sin metrópolis) ve una ciudad volver a poblado; si tenía muralla, la pierde.'),
        t('Tras el ataque todos los caballeros quedan inactivos y el barco vuelve a empezar.'),
        t('😴 El ladrón no se mueve hasta el primer ataque (el 7 sí obliga a descartar).')), picBarbarians()),
      section(t('6. Cartas de progreso'), [li(
        t('Hay 54 cartas, 18 de cada color. Se roban con el dado de evento (sección 4).'),
        t('Puedes tener {n} en la mano (sin contar las de punto). Si robas una quinta, descartas una.', { n: PROGRESS_HAND }),
        t('Imprenta y Constitución se revelan al robarlas: 1 punto cada una.'),
        t('Se juegan en tu turno después de tirar, todas las que quieras (el Alquimista, antes de tirar). Toca una carta de tu mano para ver qué hace y si puedes jugarla.')), progressList()], []),
      section(t('7. Consejos rápidos'), li(
        t('Sube pronto una ciudad: sin ciudades no hay mercancías ni mejoras.'),
        t('Mira el panel 🏴‍☠️ de la esquina: si dice «Catan perdería», activa caballeros antes de que llegue el barco.'),
        t('Una metrópolis vale 2 puntos y no la pueden saquear los bárbaros.'),
        t('Las cartas de progreso de ciencia son buenas para crecer; las de política, para frenar a quien va primero.')), []),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}

const CSS = `
.sf-help .ck-help-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 8px; font-size: .9em; }
.sf-help .ck-help-col ul { margin: 4px 0 0; padding-left: 16px; }
@media (max-width: 600px) { .sf-help .ck-help-cards { grid-template-columns: 1fr; } }
`;
if (globalThis.document && !document.getElementById('ck-help-css')) {
  const st = document.createElement('style');
  st.id = 'ck-help-css';
  st.textContent = CSS;
  document.head.append(st);
}
