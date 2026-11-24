// Catan Event Cards variant: the choice panel (take / give a resource, rob a player), the repair
// button after an earthquake, banner texts. Used by gameView.js.
import { RES, TILE_INFO } from '../engine/constants.js';
import { eventInfo } from '../engine/eventCards.js';
import { damagedRoadsOf, REPAIR_COST, handSize } from '../engine/game.js';
import { cardsOf } from '../engine/citiesKnights/commodities.js';
import { t } from '../i18n.js';

const costIcons = c => Object.entries(c).map(([r, n]) => TILE_INFO[r].icon.repeat(n)).join('');

// forced panel for a local human who must choose (null when there's nothing to choose)
export function evChoiceModal(st, v, ui, { h, dispatch, rerender }) {
  const E = st.evChoice, task = E && E.pending[v];
  if (st.phase !== 'evChoice' || !task) return null;
  const info = eventInfo(E.event), p = st.players[v];
  const head = [h('h2', null, `${info.icon} ${t(info.name)}`), h('p', null, t(info.desc))];
  const resBtn = (r, onclick, n) => h('button', { class: 'btn', 'data-testid': 'ev-res-' + r, onclick }, TILE_INFO[r].icon, h('small', null, t(TILE_INFO[r].name) + (n != null ? ` (${n})` : '')));
  let body;
  if (task.type === 'take') {
    body = [h('p', null, t('Elige el recurso que tomas del banco:')), h('div', { class: 'respick' }, RES.filter(r => st.bank[r] > 0).map(r => resBtn(r, () => dispatch({ type: 'evChoose', pid: v, res: r }))))];
  } else if (task.type === 'give') {
    let to = task.to;
    if (to == null) {
      if (!task.options.includes(ui.evTo)) ui.evTo = task.options[0];
      to = ui.evTo;
    }
    body = [];
    if (task.options) body.push(h('p', null, t('¿A quién se lo das?')), h('div', { class: 'chips' }, task.options.map(o => h('button', { class: 'btn' + (o === to ? ' active' : ''), 'data-testid': 'ev-to-' + o, style: { borderColor: st.players[o].color }, onclick: () => { ui.evTo = o; rerender(); } },
      h('span', { class: 'turn-dot', style: { background: st.players[o].color } }), st.players[o].name))));
    body.push(h('p', null, t('Elige la carta que das a {name}:', { name: st.players[to].name })),
      h('div', { class: 'respick' }, cardsOf(st).filter(r => p.res[r] > 0).map(r => resBtn(r, () => dispatch({ type: 'evChoose', pid: v, res: r, to }), p.res[r]))));
  } else {
    body = [h('p', null, t('¿A quién le robas una carta?')), h('div', { class: 'chips' }, task.options.map(o => h('button', { class: 'btn', 'data-testid': 'ev-steal-' + o, style: { borderColor: st.players[o].color }, onclick: () => dispatch({ type: 'evChoose', pid: v, target: o }) },
      h('span', { class: 'turn-dot', style: { background: st.players[o].color } }), t('{name} ({n} cartas)', { name: st.players[o].name, n: handSize(st.players[o].res) }))))];
  }
  return { kind: 'evchoice' + v + '-' + st.turn + '-' + E.event, body: h('div', { 'data-testid': 'ev-choice' }, ...head, ...body) };
}

export function evBanner(st, v) {
  if (st.phase !== 'evChoice' || !st.evChoice) return '';
  const info = eventInfo(st.evChoice.event);
  if (st.evChoice.pending[v]) return `${info.icon} ${t('Elige para el evento: {name}', { name: t(info.name) })}`;
  return `${info.icon} ${t('Esperando a que elijan los demás ({name})...', { name: t(info.name) })}`;
}

// the repair button when one of your roads is damaged
export function repairButtons(st, v, { h, dispatch }) {
  if (!st.damagedRoads) return [];
  const mine = damagedRoadsOf(st, v);
  if (!mine.length) return [];
  const can = st.current === v && st.phase === 'main' && Object.entries(REPAIR_COST).every(([r, n]) => st.players[v].res[r] >= n);
  return [h('button', { class: 'btn', 'data-testid': 'ev-repair', disabled: !can, title: t('Tu camino dañado por el terremoto: hasta repararlo no puedes construir caminos'), onclick: () => dispatch({ type: 'evRepair', pid: v }) },
    h('span', { class: 'bicon' }, '🔧'), h('span', null, t('Reparar'), h('span', { class: 'cost' }, costIcons(REPAIR_COST))))];
}

// 2D: a crack across each damaged road
export function drawDamagedRoads(S, U, st) {
  const g = S('g', { class: 'damaged-roads' });
  for (const e in st.damagedRoads || {}) {
    const E = st.board.edges[e], a = st.board.vertices[E.a], b = st.board.vertices[E.b];
    const mx = (a.x + b.x) / 2 * U, my = (a.y + b.y) / 2 * U;
    const dx = (b.x - a.x), dy = (b.y - a.y), len = Math.hypot(dx, dy), nx = -dy / len * 14, ny = dx / len * 14, tx = dx / len * 7, ty = dy / len * 7;
    g.append(S('path', { d: `M${mx - nx - tx},${my - ny - ty} L${mx + tx},${my + ty} L${mx - tx},${my - ty} L${mx + nx + tx},${my + ny + ty}`, fill: 'none', stroke: '#1a1c2c', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    g.append(S('path', { d: `M${mx - nx - tx},${my - ny - ty} L${mx + tx},${my + ty} L${mx - tx},${my - ty} L${mx + nx + tx},${my + ny + ty}`, fill: 'none', stroke: '#ff7043', 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'road-crack', 'data-edge': e }));
  }
  return g;
}
