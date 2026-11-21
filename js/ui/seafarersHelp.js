// Seafarers rules screen: short sections, each with a small diagram drawn in code (SVG), in the
// flat board's style. No image files: the diagrams stay sharp and their captions follow the language.
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import { hexCenter, corner, generateBoard } from '../engine/board.js';
import { defaultConfig } from '../engine/config.js';
import { SCENARIOS } from '../engine/seafarers/scenarios.js';
import { SHIP_COST, MAX_SHIPS } from '../engine/seafarers/ships.js';
import { t } from '../i18n.js';

const U = 40; // svg units per hex radius
const SEA = '#3b7dd8', FOG = '#8a93a8';
const ME = '#e53935', RIVAL = '#1e88e5';
const fillOf = kind => (kind === 'sea' ? SEA : kind === 'fog' ? FOG : (TILE_INFO[kind] || TILE_INFO.desert).color);
const cost = c => Object.entries(c).map(([r, n]) => TILE_INFO[r].icon.repeat(n)).join(' + ');

// ---------- a tiny diagram language ----------
// hexes: [q, r, kind]   corners: [q, r, i] (i = 0 upper-right, 1 lower-right, 2 bottom, 3 lower-left,
// 4 upper-left, 5 top)   edges: [q, r, side] (side s joins corners s and s+1)
const pt = ([q, r, i]) => {
  const p = corner(q, r, i);
  return { x: p.x * U, y: p.y * U };
};
const edgePts = ([q, r, s]) => [pt([q, r, s]), pt([q, r, (s + 1) % 6])];
const hexPts = (q, r, k = 0.97) => {
  const c = hexCenter(q, r);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(c.x * U + U * k * Math.cos(a)).toFixed(1)},${(c.y * U + U * k * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
};

function shipAt(g, edge, color, extra = {}) {
  const [a, b] = edgePts(edge);
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const flip = Math.abs(ang) > 90 ? ang + 180 : ang; // keep the sail on top
  const sh = S('g', { transform: `translate(${x},${y}) rotate(${flip}) scale(1)`, opacity: extra.ghost ? 0.45 : 1 });
  sh.append(S('path', { d: 'M-17,2 L17,2 L11,9 L-12,9 Z', fill: extra.black ? '#1e1e24' : '#7a4a26', stroke: '#1a1c2c', 'stroke-width': 2 }));
  sh.append(S('line', { x1: -2, y1: 2, x2: -2, y2: -19, stroke: '#3a2412', 'stroke-width': 2.5 }));
  sh.append(S('path', { d: 'M-1,-17 L-1,0 L12,0 Z', fill: extra.black ? '#15151a' : color, stroke: '#1a1c2c', 'stroke-width': 1.8 }));
  if (extra.black) sh.append(S('rect', { x: -3, y: -25, width: 9, height: 5, fill: '#d62f2f' }));
  g.append(sh);
  return { x, y };
}

function diagram({ hexes, roads = [], ships = [], houses = [], pirate = null, blocked = [], spots = [], marks = [], arrows = [], width = 260 }) {
  const cs = hexes.map(([q, r]) => hexCenter(q, r));
  const minX = Math.min(...cs.map(c => c.x)) * U - U - 8, maxX = Math.max(...cs.map(c => c.x)) * U + U + 8;
  const minY = Math.min(...cs.map(c => c.y)) * U - U - 14, maxY = Math.max(...cs.map(c => c.y)) * U + U + 8;
  const svg = S('svg', { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, width, class: 'sf-diagram', role: 'img' });
  svg.append(S('defs', null, S('marker', { id: 'sfArrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, S('path', { d: 'M0,0 L10,5 L0,10 Z', fill: '#ffcd75' }))));
  for (const [q, r, kind] of hexes) {
    svg.append(S('polygon', { points: hexPts(q, r), fill: fillOf(kind), stroke: kind === 'sea' ? '#2a5fa8' : '#1a1c2c', 'stroke-width': 2 }));
    const c = hexCenter(q, r);
    if (kind === 'fog') svg.append(S('text', { x: c.x * U, y: c.y * U + 8, 'text-anchor': 'middle', 'font-size': 24 }, '☁️'));
    else if (kind !== 'sea') svg.append(S('text', { x: c.x * U, y: c.y * U + 7, 'text-anchor': 'middle', 'font-size': 18 }, (TILE_INFO[kind] || {}).icon || ''));
  }
  for (const e of blocked) {
    const [a, b] = edgePts(e);
    svg.append(S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#d62f2f', 'stroke-width': 4, 'stroke-dasharray': '5 4' }));
  }
  for (const e of spots) {
    const [a, b] = edgePts(e);
    svg.append(S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#ffcd75', 'stroke-width': 5, 'stroke-dasharray': '3 4', 'stroke-linecap': 'round' }));
  }
  for (const [e, color] of roads) {
    const [a, b] = edgePts(e);
    svg.append(S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#1a1c2c', 'stroke-width': 9, 'stroke-linecap': 'round' }));
    svg.append(S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }));
  }
  if (pirate) {
    const c = hexCenter(pirate[0], pirate[1]);
    const g = S('g', { transform: `translate(${c.x * U},${c.y * U}) scale(1.25)` });
    g.append(S('path', { d: 'M-17,2 L17,2 L11,9 L-12,9 Z', fill: '#1e1e24', stroke: '#000', 'stroke-width': 2 }));
    g.append(S('line', { x1: -2, y1: 2, x2: -2, y2: -19, stroke: '#000', 'stroke-width': 2.5 }));
    g.append(S('path', { d: 'M-1,-17 L-1,0 L12,0 Z', fill: '#15151a', stroke: '#000', 'stroke-width': 1.8 }));
    g.append(S('rect', { x: -3, y: -25, width: 9, height: 5, fill: '#d62f2f' }));
    svg.append(g);
  }
  for (const [e, color, extra] of ships) shipAt(svg, e, color, extra);
  for (const [c, color] of houses) {
    const p = pt(c);
    svg.append(S('path', { d: 'M-8,6 L-8,-2 L0,-9 L8,-2 L8,6 Z', transform: `translate(${p.x},${p.y}) scale(1.3)`, fill: color, stroke: '#1a1c2c', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  for (const [from, to] of arrows) svg.append(S('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#ffcd75', 'stroke-width': 3, 'marker-end': 'url(#sfArrow)' }));
  for (const m of marks) {
    const p = m.at ? pt(m.at) : m;
    svg.append(S('text', { x: p.x + (m.dx || 0), y: p.y + (m.dy || 0), 'text-anchor': 'middle', 'font-size': m.size || 20, 'font-weight': 700, fill: m.color || '#f4f4f4', stroke: '#1a1c2c', 'stroke-width': 3, 'paint-order': 'stroke' }, m.text));
  }
  return svg;
}
const mid = e => {
  const [a, b] = edgePts(e);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

// ---------- the scenario thumbnails ----------
function scenarioThumb(id) {
  const cfg = defaultConfig();
  cfg.expansions = { seafarers: true, scenario: id };
  const bd = generateBoard(cfg, { s: 7 });
  const b = bd.bounds;
  const svg = S('svg', { viewBox: `${b.minX * 10} ${b.minY * 10} ${(b.maxX - b.minX) * 10} ${(b.maxY - b.minY) * 10}`, width: 130 });
  const hex = (tl, fill) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${tl.x * 10 + 9.6 * Math.cos(a)},${tl.y * 10 + 9.6 * Math.sin(a)}`;
    }).join(' ');
    svg.append(S('polygon', { points: pts, fill }));
  };
  for (const tl of bd.sea) hex(tl, tl.fog ? FOG : SEA);
  for (const tl of bd.tiles) hex(tl, tl.fog ? FOG : (TILE_INFO[tl.res] || TILE_INFO.desert).color);
  return svg;
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' },
    h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.map(x => h('li', null, x)));
const panel = (art, caption, ok) => h('figure', { class: 'sf-panel' }, art, h('figcaption', { class: ok === false ? 'bad' : ok ? 'good' : '' }, caption));

export function showSeafarersHelp() {
  const close = () => ov.remove();
  // 1. scenarios
  const scen = h('div', { class: 'sf-scen' }, Object.entries(SCENARIOS).map(([id, sc]) => h('figure', { class: 'sf-panel' }, scenarioThumb(id),
    h('figcaption', null, h('b', null, `${sc.icon} ${t(sc.name)}`), h('br'), t('{vp} puntos para ganar', { vp: sc.vp }), sc.islandBonus ? ` · 🏝️ +${sc.islandBonus}` : ''))));
  // 2. build a ship: settlement on the coast, a route of ships out to sea
  const build = diagram({
    hexes: [[0, 0, 'wood'], [-1, 0, 'sheep'], [0, 1, 'wheat'], [1, -1, 'sea'], [1, 0, 'sea'], [1, 1, 'sea']],
    houses: [[[0, 0, 0], ME]],
    ships: [[[0, 0, 0], ME], [[1, 0, 2], ME]],
    spots: [[1, 0, 1]],
    marks: [{ ...mid([1, 0, 1]), text: '?', color: '#ffcd75', dx: 14, dy: 4 }],
  });
  // 3. roads and ships only join at a settlement
  const linkHexes = [[0, 0, 'brick'], [1, -1, 'ore'], [1, 0, 'sea'], [0, 1, 'sea']];
  const linkOk = diagram({ hexes: linkHexes, width: 190, roads: [[[0, 0, 5], ME]], houses: [[[0, 0, 0], ME]], ships: [[[0, 0, 0], ME]], marks: [{ x: 20, y: 70, text: '✓', color: '#a7f070', size: 30 }] });
  const linkBad = diagram({ hexes: linkHexes, width: 190, roads: [[[0, 0, 5], ME]], ships: [[[0, 0, 0], ME]], marks: [{ at: [0, 0, 0], text: '✗', color: '#ef7d57', size: 30, dx: 16 }] });
  // 4. move a ship from the open end of the route
  const move = diagram({
    hexes: [[0, 0, 'wood'], [1, -1, 'sea'], [1, 0, 'sea'], [0, 1, 'sea'], [1, 1, 'sea']],
    houses: [[[0, 0, 0], ME]],
    ships: [[[0, 0, 0], ME], [[1, 0, 2], ME], [[1, 0, 1], ME, { ghost: true }]],
    spots: [[0, 1, 0]],
    arrows: [[mid([1, 0, 1]), mid([0, 1, 0])]],
    marks: [{ ...mid([1, 0, 2]), text: '🔒', size: 14, dy: 22 }],
  });
  // 5. the pirate blocks the edges around it and robs a ship's owner
  const pir = diagram({
    hexes: [[0, 0, 'wheat'], [1, 0, 'sea'], [1, -1, 'sea'], [2, -1, 'sea'], [2, 0, 'sea'], [1, 1, 'sea'], [0, 1, 'sea']],
    pirate: [1, 0],
    blocked: [0, 1, 2, 4, 5].map(s => [1, 0, s]),
    houses: [[[0, 0, 0], RIVAL]],
    ships: [[[0, 0, 0], RIVAL]],
    marks: [{ ...mid([0, 0, 0]), text: '🫳', size: 18, dx: -22 }],
  });
  // 6. a new island pays a bonus; fog turns face up when a ship reaches it
  const isle = diagram({
    hexes: [[0, 0, 'wood'], [1, 0, 'sea'], [1, -1, 'sea'], [2, 0, 'wheat'], [2, -1, 'sea'], [1, 1, 'sea']],
    houses: [[[0, 0, 0], ME], [[2, 0, 4], ME]],
    ships: [[[1, 0, 4], ME], [[1, 0, 5], ME]],
    marks: [{ at: [2, 0, 4], text: '🏝️ +2', size: 16, dx: 30, dy: -10, color: '#ffcd75' }],
  });
  const fogBefore = diagram({ hexes: [[0, 0, 'sheep'], [1, 0, 'sea'], [1, -1, 'fog'], [2, -1, 'fog']], width: 170, houses: [[[0, 0, 0], ME]], ships: [[[0, 0, 0], ME]], spots: [[1, 0, 4]] });
  const fogAfter = diagram({ hexes: [[0, 0, 'sheep'], [1, 0, 'sea'], [1, -1, 'ore'], [2, -1, 'fog']], width: 170, houses: [[[0, 0, 0], ME]], ships: [[[0, 0, 0], ME], [[1, 0, 4], ME]], marks: [{ x: 90, y: -50, text: '+⛰️', size: 18, color: '#a7f070' }] });

  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('⛵ Reglas de Navegantes')),
      h('p', null, t('Navegantes añade mar e islas al tablero. Construyes barcos para cruzar el mar, fundas poblados en islas nuevas y exploras la niebla. Todas las reglas básicas siguen igual.')),
      section(t('1. Escenarios'), [t('Cada escenario es un mapa fijo con sus propios puntos para ganar y su bonus (🏝️ = puntos por el primer poblado en una isla nueva).'), scen], []),
      section(t('2. Construir barcos'), li(
        t('Cuesta {cost}. Cada jugador tiene {n} barcos.', { cost: cost(SHIP_COST), n: MAX_SHIPS }),
        t('Los barcos van en aristas junto al mar (costa o mar abierto), nunca tierra adentro.'),
        t('Un barco debe tocar tu poblado/ciudad o otro barco tuyo: los barcos forman una ruta.'),
        t('Colocación inicial: si el poblado está en la costa, puedes poner un barco en vez del camino.'),
        t('Donde llega un barco puedes fundar un poblado (como con un camino).')), build),
      section(t('3. Caminos y barcos'), li(
        t('Caminos y barcos solo se enlazan en un poblado/ciudad tuyo.'),
        t('Desde el final de un camino no puedes seguir con un barco (ni al revés) si ahí no hay casa.'),
        t('El Camino más largo cuenta caminos y barcos juntos.')),
        h('div', { class: 'sf-pair' }, panel(linkOk, t('Con poblado en medio: se enlazan'), true), panel(linkBad, t('Sin poblado: no se enlazan'), false))),
      section(t('4. Mover barcos'), li(
        t('Cada turno puedes mover 1 barco con el botón 🧭 Mover barco.'),
        t('Solo se mueve el barco del extremo abierto de una ruta. No se mueven los del medio, los de una ruta cerrada entre dos casas ni el construido este turno.'),
        t('El nuevo sitio debe ser válido como al construir.')), move),
      section(t('5. El pirata 🏴‍☠️'), li(
        t('Con un 7 o un Caballero eliges mover el Ladrón (en tierra) o el Pirata (en el mar).'),
        t('Nadie puede construir ni mover barcos en las aristas alrededor del Pirata (línea roja).'),
        t('Quien mueve el Pirata roba 1 carta a alguien con un barco junto a esa casilla.')), pir),
      section(t('6. Islas nuevas y niebla'), li(
        t('La colocación inicial solo va en las islas de salida.'),
        t('Tu primer poblado en cada isla nueva da puntos de bonus 🏝️ (una vez por isla).'),
        t('Las casillas de niebla ☁️ están boca abajo y no producen. Cuando un camino o barco llega a ellas se voltean; si es tierra, quien la descubre recibe 1 carta de ese recurso.')),
        [isle, h('div', { class: 'sf-pair' }, panel(fogBefore, t('Antes: el barco llega junto a la niebla')), panel(fogAfter, t('Después: la casilla se voltea, recibes 1 carta'), true))]),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}

// small styles for the screen, added once
const CSS = `
.sf-help .sf-section { margin: 14px 0 6px; padding-top: 10px; border-top: 2px dashed var(--line); }
.sf-help .sf-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.sf-help .sf-text { flex: 1 1 260px; min-width: 0; }
.sf-help .sf-art { flex: 0 1 auto; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.sf-help .sf-art:empty { display: none; }
.sf-help .sf-diagram { max-width: 100%; height: auto; display: block; }
.sf-help .sf-scen, .sf-help .sf-pair { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.sf-help .sf-panel { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: .85em; text-align: center; max-width: 200px; }
.sf-help figcaption.good { color: #a7f070; }
.sf-help figcaption.bad { color: #ef7d57; }
`;
if (globalThis.document && !document.getElementById('sf-help-css')) {
  const st = document.createElement('style');
  st.id = 'sf-help-css';
  st.textContent = CSS;
  document.head.append(st);
}
