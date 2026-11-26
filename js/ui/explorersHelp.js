// Explorers & Pirates rules screen: short sections, each with a small picture drawn in code (SVG),
// reusing the Seafarers rules layout and diagram helpers. One block of sections per scenario;
// only the playable scenarios get one (Land Ho! for now).
import { h, s as S } from './dom.js';
import { TILE_INFO } from '../engine/constants.js';
import { generateBoard } from '../engine/board.js';
import { defaultConfig } from '../engine/config.js';
import { EP_SCENARIOS } from '../engine/explorersPirates/scenarios.js';
import * as R from '../engine/explorersPirates/rules.js';
import { GOLD_PER_RESOURCE, GOLD_BUYS_PER_TURN } from '../engine/tradersBarbarians/rivers.js';
import { diagram, mid, panel } from './seafarersHelp.js'; // also brings the .sf-help layout styles
import { t } from '../i18n.js';

const ME = '#e53935';
const SEA = '#3b7dd8', FOG = '#8a93a8';
const cost = c => Object.entries(c).map(([r, n]) => TILE_INFO[r].icon.repeat(n)).join(' + ');

// ---------- pictures ----------

// the Land Ho! map: start island, two face-down lands (grey)
function mapThumb(id) {
  const cfg = defaultConfig();
  cfg.expansions = { explorersPirates: true, epScenario: id };
  const bd = generateBoard(cfg, { s: 7 });
  const b = bd.bounds;
  const svg = S('svg', { viewBox: `${b.minX * 10} ${b.minY * 10} ${(b.maxX - b.minX) * 10} ${(b.maxY - b.minY) * 10}`, width: 200, class: 'sf-diagram', role: 'img' });
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

// the three steps of a turn
function picTurn() {
  const steps = [['🎲', t('tirar')], ['🏗️', t('construir y comerciar')], ['🧭', t('mover barcos')]];
  return h('div', { class: 'ep-steps' }, steps.flatMap(([icon, name], i) => [
    h('div', { class: 'ep-step' }, h('div', { class: 'ep-step-icon' }, icon), h('div', null, name)),
    i < 2 ? h('b', null, '➜') : null]).filter(Boolean));
}

// a harbor settlement with a ship next to it, and where the ship can sail
function picShips() {
  return diagram({
    hexes: [[0, 0, 'wood'], [-1, 0, 'wheat'], [0, 1, 'sheep'], [1, -1, 'sea'], [1, 0, 'sea'], [2, -1, 'sea'], [2, 0, 'sea']],
    houses: [[[0, 0, 0], ME]],
    ships: [[[0, 0, 0], ME], [[1, 0, 0], ME, { ghost: true }]],
    arrows: [[mid([0, 0, 0]), mid([1, 0, 0])]],
    marks: [{ at: [0, 0, 0], text: '⚓', size: 14, dx: -2, dy: -16 }, { ...mid([1, 0, 0]), text: `${R.SHIP_MP} 🦶`, size: 14, dx: 26, color: '#ffcd75' }],
  });
}

// before / after a ship reaches the face-down hexes
function picDiscover() {
  const base = [[0, 0, 'sheep'], [1, 0, 'sea'], [2, -1, 'fog']];
  const before = diagram({ hexes: [...base, [1, -1, 'fog']], width: 150, houses: [[[0, 0, 0], ME]], ships: [[[0, 0, 0], ME]], spots: [[1, 0, 4]] });
  const land = diagram({ hexes: [...base, [1, -1, 'ore']], width: 150, houses: [[[0, 0, 0], ME]], ships: [[[1, 0, 4], ME]], marks: [{ x: 90, y: -50, text: '+⛰️', size: 18, color: '#a7f070' }] });
  const sea = diagram({ hexes: [...base, [1, -1, 'sea']], width: 150, houses: [[[0, 0, 0], ME]], ships: [[[1, 0, 4], ME]], marks: [{ x: 90, y: -50, text: `+${R.DISCOVER_SEA_GOLD}🪙`, size: 18, color: '#ffcd75' }] });
  return h('div', { class: 'sf-pair' },
    panel(before, t('Antes: el barco llega junto a lo desconocido')),
    panel(land, t('Tierra: se voltea con su número, recibes 1 carta'), true),
    panel(sea, t('Mar: recibes {n} de oro', { n: R.DISCOVER_SEA_GOLD }), true));
}

// a ship with a settler on a coast edge: found a settlement on one of its corners
function picSettlers() {
  const hexes = [[0, 0, 'wheat'], [-1, 0, 'ore'], [1, -1, 'sea'], [1, 0, 'sea'], [0, 1, 'sea']];
  const before = diagram({ hexes, width: 170, ships: [[[0, 0, 0], ME]], marks: [{ ...mid([0, 0, 0]), text: '👤', size: 14, dx: 18, dy: -14 }, { at: [0, 0, 0], text: '?', color: '#ffcd75', size: 18, dx: -10, dy: -6 }, { at: [0, 0, 1], text: '?', color: '#ffcd75', size: 18, dx: -10, dy: 14 }] });
  const after = diagram({ hexes, width: 170, ships: [[[0, 0, 0], ME]], houses: [[[0, 0, 1], ME]], marks: [{ at: [0, 0, 1], text: '+1', color: '#a7f070', size: 16, dx: -30, dy: 6 }] });
  return h('div', { class: 'sf-pair' },
    panel(before, t('El barco con colono llega a la costa')),
    panel(after, t('🏠 Fundar: poblado gratis, el barco se detiene'), true));
}

// settlement -> harbor settlement
function picHarbor() {
  const hexes = [[0, 0, 'brick'], [-1, 0, 'wheat'], [1, -1, 'sea'], [1, 0, 'sea']];
  const before = diagram({ hexes, width: 150, houses: [[[0, 0, 0], ME]] });
  const after = diagram({ hexes, width: 150, houses: [[[0, 0, 0], ME]], ships: [[[0, 0, 0], ME, { ghost: true }]], marks: [{ at: [0, 0, 0], text: '⚓', size: 14, dx: -2, dy: -16 }, { at: [0, 0, 0], text: `${R.HARBOR_VP}★`, size: 14, dx: -26, dy: 4, color: '#ffcd75' }] });
  return h('div', { class: 'sf-pair' }, panel(before, t('Poblado en la costa')), panel(after, `${cost(R.HARBOR_COST)} ➜ ⚓`, true));
}

// the gold exchanges (HTML rows: they wrap with longer translations)
function picGold() {
  const rows = [
    [t('🎲 sin nada'), `+${R.NO_PRODUCTION_GOLD} 🪙`],
    ['🪙'.repeat(GOLD_PER_RESOURCE), t('1 recurso ({n}× por turno)', { n: GOLD_BUYS_PER_TURN })],
    [`🃏×${R.EP_TRADE_RATIO}`, '1 🪙'],
  ];
  return h('div', { class: 'ep-gold' }, rows.map(([a, b]) => h('div', { class: 'ep-gold-row' }, h('span', null, a), h('b', null, '➜'), h('span', null, b))));
}

// ---------- the screen ----------
function section(title, text, art) {
  return h('div', { class: 'sf-section' }, h('h3', null, title),
    h('div', { class: 'sf-row' }, h('div', { class: 'sf-art' }, ...[].concat(art)), h('div', { class: 'sf-text' }, ...[].concat(text))));
}
const li = (...xs) => h('ul', null, xs.filter(Boolean).map(x => h('li', null, x)));

// the sections of each playable scenario
function landHoSections() {
  const sc = EP_SCENARIOS.landHo;
  return [
    section(t('1. El mapa y el comienzo'), li(
      t('Gana quien llega primero a {vp} puntos.', { vp: sc.vp }),
      t('Todos empiezan en la isla grande. Al otro lado del mar hay dos tierras desconocidas, boca abajo (gris).'),
      t('No hay colocación inicial: cada uno empieza con un poblado y un camino, un poblado portuario ⚓ y un barco con un colono 👤.'),
      t('Para {a}-{b} jugadores.', { a: sc.players[0], b: sc.players[1] })), mapThumb('landHo')),
    section(t('2. El turno en tres pasos'), li(
      t('Tira los dados y cobra como siempre.'),
      t('Construye y comercia. El banco cambia {n}:1 (no hay puertos).', { n: R.EP_TRADE_RATIO }),
      t('Pulsa 🧭 Mover barcos para pasar al último paso: ya no puedes construir ni comerciar, solo navegar. Luego termina el turno.')), picTurn()),
    section(t('3. Barcos'), li(
      t('Cuesta {cost}. Cada jugador tiene {n} barcos.', { cost: cost(R.SHIP_COST), n: R.PIECES.ships }),
      t('Un barco nuevo se pone en el mar junto a tu poblado portuario ⚓.'),
      t('En el paso de navegar, cada barco avanza hasta {n} aristas por turno. Con {w} avanza {b} más (una vez por barco y turno).', { n: R.SHIP_MP, w: cost(R.BOOST_COST), b: R.BOOST_MP }),
      t('Caben como mucho {n} barcos en una arista: puedes pasar por una llena, pero no quedarte en ella.', { n: R.MAX_SHIPS_PER_EDGE })), picShips()),
    section(t('4. Descubrir'), li(
      t('Cuando un barco llega a una arista junto a casillas boca abajo, todas se voltean y el barco se detiene.'),
      t('Una tierra muestra su número y te da 1 carta de su recurso; una casilla de mar te da {n} de oro.', { n: R.DISCOVER_SEA_GOLD }),
      t('No se puede construir poblados ni caminos junto a una casilla boca abajo.')), picDiscover()),
    section(t('5. Colonos'), li(
      t('Un colono 👤 cuesta {cost}, como un poblado. Cada jugador tiene {n}.', { cost: cost(R.SETTLER_COST), n: R.PIECES.settlers }),
      t('Sube a un barco tuyo que esté junto a tu poblado portuario; si no hay, espera en el puerto. Un barco lleva hasta {n} colonos.', { n: R.SHIP_CAPACITY }),
      t('Con 👤 Recoger colono, un barco junto al puerto lo sube gratis.'),
      t('Con el barco en una arista de costa, pulsa 🏠 Fundar poblado y toca una esquina: el colono se convierte en un poblado gratis (+1 punto). Se cumple la regla de distancia y el barco se detiene.')), picSettlers()),
    section(t('6. Poblado portuario'), li(
      t('Mejora un poblado de la costa por {cost}. Vale {vp} puntos. Hay {n} por jugador.', { cost: cost(R.HARBOR_COST), vp: R.HARBOR_VP, n: R.PIECES.harbors }),
      t('Produce 1 carta, como un poblado.'),
      t('Los barcos nuevos salen de aquí y los colonos esperan aquí.')), picHarbor()),
    section(t('7. Oro'), li(
      t('Si una tirada (que no sea 7) no te da nada, recibes {n} de oro.', { n: R.NO_PRODUCTION_GOLD }),
      t('Con {g} de oro compras 1 recurso, hasta {n} veces por turno.', { g: GOLD_PER_RESOURCE, n: GOLD_BUYS_PER_TURN }),
      t('Puedes cambiar {n} cartas iguales por 1 de oro.', { n: R.EP_TRADE_RATIO })), picGold()),
    section(t('8. Lo que cambia respecto a Catán'), li(
      t('No hay ladrón: con un 7 solo se descarta (quien tenga más cartas del límite).'),
      t('No hay cartas de desarrollo, ni ciudades, ni Camino más largo, ni puertos.'),
      t('Consejo: lleva colonos pronto a las tierras nuevas; los poblados portuarios dan {vp} puntos.', { vp: R.HARBOR_VP })), []),
  ];
}
const SECTIONS = { landHo: landHoSections };

export function showExplorersHelp() {
  const close = () => ov.remove();
  const blocks = Object.entries(EP_SCENARIOS).filter(([id]) => SECTIONS[id]).map(([id, sc]) =>
    h('div', { 'data-testid': 'ep-help-' + id }, h('h3', { class: 'ep-help-scen' }, `${sc.icon} ${t(sc.name)}`), ...SECTIONS[id]()));
  const ov = h('div', { class: 'overlay', onclick: e => e.target === ov && close() },
    h('div', { class: 'modal help-body sf-help', 'data-testid': 'ep-help', style: { width: 'min(820px,100%)' } },
      h('h2', null, t('🧭 Reglas de Exploradores y piratas')),
      h('p', null, t('Exploradores y piratas se juega en cinco escenarios, uno detrás de otro. Cada escenario trae su propio mapa y sus misiones. Aquí están las reglas de los escenarios que ya se pueden jugar.')),
      ...blocks,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, t('¡Entendido!')))));
  document.body.append(ov);
}

// small styles for the step boxes and gold rows, added once (the rest comes from the Seafarers rules screen)
const CSS = `
.sf-help .ep-gold { display: flex; flex-direction: column; gap: 6px; width: min(300px, 100%); }
.sf-help .ep-gold-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; text-align: center; padding: 6px 8px; border-radius: 6px; background: #2b2f45; border: 2px solid #1a1c2c; font-size: .9em; }
.sf-help .ep-gold-row b { color: #ffcd75; }
.sf-help .ep-steps { display: flex; gap: 6px; align-items: center; }
.sf-help .ep-steps > b { color: #ffcd75; }
.sf-help .ep-step { width: 88px; min-height: 64px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; text-align: center; font-size: .8em; padding: 4px; border-radius: 8px; background: #2b2f45; border: 2px solid #ffcd75; }
.sf-help .ep-step-icon { font-size: 1.6em; }
.sf-help .ep-help-scen { margin: 14px 0 0; color: var(--accent, #ffcd75); }
`;
if (globalThis.document && !document.getElementById('ep-help-css')) {
  const st = document.createElement('style');
  st.id = 'ep-help-css';
  st.textContent = CSS;
  document.head.append(st);
}
