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

// ---------------- Catan for Two: placing the free neutral piece ----------------
import { neutralSpots } from '../engine/game.js';
export function neutralInteraction(st, v, { mk, dispatch }) {
  if (st.phase !== 'neutralBuild' || !st.neutralBuild || st.neutralBuild.pid !== v) return undefined;
  const N = st.neutralBuild, spots = neutralSpots(st, N.what);
  const inter = mk(N.what === 'road' ? 'road' : 'settlement', [...new Set(spots.map(x => x.at))], at => dispatch({ type: 'neutralBuild', pid: v, at, nid: spots.find(x => x.at === at).nid }));
  if (spots.length) inter.color = st.players[spots[0].nid].color;
  return inter;
}
export function neutralActions(st, v, { h, dispatch, suggest }) {
  const N = st.neutralBuild;
  if (N.pid !== v) return [h('div', { class: 'waiting' }, t('⚪ {name} coloca una pieza neutral...', { name: st.players[N.pid].name }))];
  return [h('div', { class: 'waiting your-turn', 'data-testid': 'neutral-build' }, N.what === 'road' ? t('⚪ Pon un camino neutral') : t('⚪ Pon un poblado neutral'),
    h('small', null, t('Toca un sitio resaltado: la pieza es de un jugador neutral (puedes usarla para cortarle el paso a tu rival).'))),
  h('button', { class: 'btn ghost', 'data-testid': 'neutral-auto', title: t('Elige por ti lo que haría un bot'), onclick: () => dispatch(suggest(st, v)) }, t('🎲 Que elija el juego'))];
}
export function neutralBanner(st, v) {
  if (st.phase !== 'neutralBuild' || !st.neutralBuild) return '';
  if (st.neutralBuild.pid !== v) return t('⚪ {name} coloca una pieza neutral...', { name: st.players[st.neutralBuild.pid].name });
  return st.neutralBuild.what === 'road' ? t('⚪ Pon un camino neutral: toca un camino resaltado') : t('⚪ Pon un poblado neutral: toca un cruce resaltado');
}

// ---------------- Catan for Two: trade tokens ----------------
import { tokenCost, tokenActionUsed } from '../engine/game.js';
export function tokenStats(st, p, { h }) {
  if (!st.two || p.neutral) return [];
  return [h('span', { title: t('Fichas de comercio') }, `🎟️ ${p.tokens}`)];
}
export function tokenButtons(st, v, { h, dispatch }) {
  if (!st.two || st.players[v].neutral) return [];
  const p = st.players[v], mine = st.current === v && (st.phase === 'main' || st.phase === 'roll');
  const cost = tokenCost(st, v), can = mine && !tokenActionUsed(st) && p.tokens >= cost;
  const opp = st.players.find(o => o.id !== v && !o.neutral);
  const out = [
    h('button', { class: 'btn', 'data-testid': 'two-forced', disabled: !can || handSize(opp.res) < 1, title: t('Tomas 2 cartas al azar de tu rival y le devuelves 2 a tu elección'),
      onclick: () => dispatch({ type: 'twoAction', pid: v, kind: 'forcedTrade' }) }, h('span', { class: 'bicon' }, '🤝'), h('span', null, t('Forzar'), h('span', { class: 'cost' }, '🎟️' + cost))),
  ];
  if (!st.config.rules.noRobber) out.push(h('button', { class: 'btn', 'data-testid': 'two-robber', disabled: !can, title: t('El ladrón vuelve al desierto (sin robar)'),
    onclick: () => dispatch({ type: 'twoAction', pid: v, kind: 'robber' }) }, h('span', { class: 'bicon' }, '🏜️'), h('span', null, t('Ladrón'), h('span', { class: 'cost' }, '🎟️' + cost))));
  if (p.knights > 0) out.push(h('button', { class: 'btn', 'data-testid': 'two-knight', disabled: !(st.current === v && st.phase === 'main') || (st.two.swapped && st.two.swapped.turn === st.turn), title: t('Devuelve un caballero jugado y ganas 2 fichas (puedes perder el mayor ejército)'),
    onclick: () => dispatch({ type: 'twoKnight', pid: v }) }, h('span', { class: 'bicon' }, '⚔️'), h('span', null, '→🎟️2')));
  return out;
}
// forced panel: choose the cards you give back after a forced trade
export function twoGiveModal(st, v, ui, { h, dispatch, rerender }) {
  const G2 = st.two && st.two.give;
  if (st.phase !== 'twoGive' || !G2 || G2.pid !== v) return null;
  if (!ui.twoGive || ui.twoGive.key !== st.turn + ':' + st.log.length) ui.twoGive = { key: st.turn + ':' + st.log.length, res: [] };
  const sel = ui.twoGive.res, p = st.players[v];
  const left = r => p.res[r] - sel.filter(x => x === r).length;
  return { kind: 'twogive' + v + '-' + st.turn, body: h('div', { 'data-testid': 'two-give' },
    h('h2', null, t('🤝 Devuelve {n} cartas', { n: G2.n })),
    h('p', null, t('Tomaste: {cards}. Elige las que le das a {name}.', { cards: G2.took.map(r => TILE_INFO[r].icon).join(' '), name: st.players[G2.to].name })),
    h('div', { class: 'respick' }, cardsOf(st).filter(r => p.res[r] > 0).map(r => h('button', { class: 'btn', 'data-testid': 'two-give-' + r, disabled: left(r) <= 0 || sel.length >= G2.n, onclick: () => { sel.push(r); rerender(); } },
      TILE_INFO[r].icon, h('small', null, `${t(TILE_INFO[r].name)} (${left(r)})`)))),
    h('p', null, sel.length ? sel.map(r => TILE_INFO[r].icon).join(' ') : '—'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => { ui.twoGive.res = []; rerender(); } }, t('↩️ Deshacer')),
      h('button', { class: 'btn green', 'data-testid': 'two-give-ok', disabled: sel.length !== G2.n, onclick: () => dispatch({ type: 'twoGive', pid: v, res: [...sel] }) }, t('Dar')))) };
}
