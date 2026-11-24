// Traders & Barbarians, main scenario: action-bar buttons, player-card stats and history lines
// (gameView.js). Until the board graphics arrive the wagon is driven with one button that follows
// the cheapest route to its goal.
import * as TR from '../engine/tradersBarbarians/traders.js';
import { t } from '../i18n.js';

export const hasTraders = st => !!(st && st.traders);
export const GOOD_ICONS = { marble: '🏛️', glass: '🔷', tools: '🔨', sand: '⏳' };
export const TRADE_ICONS = { castle: '🏰', quarry: '⛏️', glassworks: '🏺' };

// drive the wagon as far as this turn allows along the suggested route
function drive(st, v, dispatch) {
  const plan = TR.wagonPlan(st, v);
  for (const step of plan.steps) if (!dispatch({ type: 'tbMove', pid: v, to: step.to })) break;
}

export function tradersButtons(st, v, { h, dispatch, costIcons, openGold }) {
  if (!hasTraders(st)) return [];
  const p = st.players[v], next = TR.nextLevel(st, v);
  const mine = st.current === v && st.phase === 'main';
  const plan = mine && TR.wagonAt(st, v) != null && !TR.stopped(st, v) ? TR.wagonPlan(st, v) : { steps: [] };
  const goal = TR.cargoDest(st, v);
  const out = [
    h('button', { class: 'btn', 'data-testid': 'tb-drive', disabled: !plan.steps.length,
      title: t('Mueve el carromato por la ruta más barata hacia su destino (temporal: pronto podrás elegir el camino en el tablero)'),
      onclick: () => drive(st, v, dispatch) },
    h('span', { class: 'bicon' }, '🛒'), h('span', null, goal ? t('Llevar a {k}', { k: TRADE_ICONS[goal] }) : t('Ir a cargar'), h('span', { class: 'cost' }, t('{n} mov.', { n: TR.mpLeft(st, v) })))),
    h('button', { class: 'btn', 'data-testid': 'tb-boost', disabled: !mine || TR.boostUsed(st, v) || p.res.wheat < 1, title: t('1 cereal: +2 de movimiento este turno (una vez por turno)'),
      onclick: () => dispatch({ type: 'tbBoost', pid: v }) }, h('span', { class: 'bicon' }, '🌾'), h('span', null, '+2', h('span', { class: 'cost' }, costIcons(TR.BOOST_COST)))),
  ];
  if (next) out.push(h('button', { class: 'btn', 'data-testid': 'tb-upgrade', disabled: !mine || !Object.entries(next.cost).every(([r, n]) => p.res[r] >= n),
    title: t('Nivel {n}: {mp} de movimiento, {g} de oro por entrega', { n: next.level, mp: next.mp, g: next.gold }) + (next.vp ? ' · ' + t('+1 punto') : ''),
    onclick: () => dispatch({ type: 'tbUpgrade', pid: v }) }, h('span', { class: 'bicon' }, '⬆️'), h('span', null, t('Carromato {n}', { n: next.level }), h('span', { class: 'cost' }, costIcons(next.cost)))));
  out.push(h('button', { class: 'btn', 'data-testid': 'gold-open', title: t('Compra recursos con oro o cambia recursos por oro'), onclick: openGold },
    h('span', { class: 'bicon' }, '🪙'), h('span', null, t('Oro'), h('span', { class: 'cost' }, String(p.gold)))));
  return out;
}

// player card: wagon level, cargo (and where it goes), deliveries, gold
export function tradersStats(st, p, { h }) {
  if (!hasTraders(st)) return [];
  const W = st.traders.wagons[p.id];
  const out = [h('span', { title: t('Oro') }, `🪙 ${p.gold}`), h('span', { title: t('Nivel del carromato') }, `🛒 ${W.level}`)];
  if (W.cargo) out.push(h('span', { title: t('Mercancía que lleva y su destino') }, `${GOOD_ICONS[W.cargo]}→${TRADE_ICONS[TR.NEEDED_AT[W.cargo]]}`));
  if (W.delivered) out.push(h('span', { class: 'award', title: t('Entregas: 1 punto cada una') }, `📦 +${W.delivered}`));
  if (W.level === TR.WAGON_LEVELS.length) out.push(h('span', { class: 'award', title: t('Carromato al máximo: +1 punto') }, '🛒 +1'));
  return out;
}

export function tradersDescribe(a) {
  if (a.type === 'tbMove') return t('🛒 Mueve el carromato.');
  if (a.type === 'tbBoost') return t('🌾 Da cereal a los bueyes (+2).');
  if (a.type === 'tbUpgrade') return t('⬆️ Mejora el carromato.');
  return undefined;
}
