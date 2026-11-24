// Traders & Barbarians, main scenario: action-bar buttons, player-card stats and history lines
// (gameView.js). Until the board graphics arrive the wagon is driven with one button that follows
// the cheapest route to its goal.
import * as TR from '../engine/tradersBarbarians/traders.js';
import { t } from '../i18n.js';
import { tbBarbarianChoice } from '../engine/bot.js';

export const hasTraders = st => !!(st && st.traders);
export const GOOD_ICONS = { marble: '🏛️', glass: '🔷', tools: '🔨', sand: '⏳' };
export const TRADE_ICONS = { castle: '🏰', quarry: '⛏️', glassworks: '🏺' };

// drive the wagon as far as this turn allows along the suggested route
function drive(st, v, dispatch) {
  const plan = TR.wagonPlan(st, v);
  for (const step of plan.steps) if (!dispatch({ type: 'tbMove', pid: v, to: step.to })) break;
}

export function tradersButtons(st, v, { h, dispatch, costIcons, openGold, ui, rerender }) {
  if (!hasTraders(st)) return [];
  const p = st.players[v], next = TR.nextLevel(st, v);
  const mine = st.current === v && st.phase === 'main';
  const plan = mine && TR.wagonAt(st, v) != null && !TR.stopped(st, v) ? TR.wagonPlan(st, v) : { steps: [] };
  const goal = TR.cargoDest(st, v);
  const out = [
    h('button', { class: 'btn' + (ui.pick === 'tbWagon' ? ' active' : ''), 'data-testid': 'tb-wagon', disabled: !destinations(st, v).size,
      title: t('Mueve el carromato: toca en el tablero el cruce adonde quieres ir'),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'tbWagon' ? null : 'tbWagon'; rerender(); } },
    h('span', { class: 'bicon' }, '🛒'), h('span', null, goal ? t('Llevar a {k}', { k: TRADE_ICONS[goal] }) : t('Ir a cargar'), h('span', { class: 'cost' }, t('{n} mov.', { n: TR.mpLeft(st, v) })))),
    ...(ui.pick === 'tbWagon' && plan.steps.length ? [h('button', { class: 'btn ghost', 'data-testid': 'tb-drive', title: t('Sigue la ruta más barata hacia el destino'),
      onclick: () => { ui.pick = null; drive(st, v, dispatch); } }, '⏩')] : []),
    h('button', { class: 'btn', 'data-testid': 'tb-boost', disabled: !mine || TR.boostUsed(st, v) || p.res.wheat < 1, title: t('1 cereal: +2 de movimiento este turno (una vez por turno)'),
      onclick: () => dispatch({ type: 'tbBoost', pid: v }) }, h('span', { class: 'bicon' }, '🌾'), h('span', null, '+2', h('span', { class: 'cost' }, costIcons(TR.BOOST_COST)))),
  ];
  if (next) out.push(h('button', { class: 'btn', 'data-testid': 'tb-upgrade', disabled: !mine || !Object.entries(next.cost).every(([r, n]) => p.res[r] >= n),
    title: t('Nivel {n}: {mp} de movimiento, {g} de oro por entrega', { n: next.level, mp: next.mp, g: next.gold }) + (next.vp ? ' · ' + t('+1 punto') : ''),
    onclick: () => dispatch({ type: 'tbUpgrade', pid: v }) }, h('span', { class: 'bicon' }, '⬆️'), h('span', null, t('Carromato {n}', { n: next.level }), h('span', { class: 'cost' }, costIcons(next.cost)))));
  const offs = mine ? TR.driveTargets(st, v) : [];
  if (TR.wagonLevel(st, v).drive.length) out.push(h('button', { class: 'btn', 'data-testid': 'tb-drive-off', disabled: !offs.length,
    title: t('Tu carromato está junto a un bárbaro: tira un dado; con {n} lo espantas y lo mueves a otro camino', { n: TR.wagonLevel(st, v).drive.join(', ') }),
    onclick: () => dispatch({ type: 'tbDrive', pid: v, edge: offs[0] }) }, h('span', { class: 'bicon' }, '🪓'), h('span', null, t('Espantar'), h('span', { class: 'cost' }, '🎲' + TR.wagonLevel(st, v).drive.join('')))));
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

// a barbarian must be moved (7 / Knight / driven off): the old panel (kept for reference, unused)
function barbarianModal(st, v, { h, dispatch }) {
  const R = st.traders.relocate || { from: null, steal: true };
  const sug = tbBarbarianChoice(st, v);
  const victim = R.steal ? TR.roadVictim(st, v, sug.to) : null;
  const why = R.from != null ? t('Tu carromato espantó al bárbaro: ¿adónde lo mandas?') : t('Mueve un bárbaro a otro camino. Si lo pones sobre el camino de otro jugador, le robas 1 recurso.');
  return { kind: 'tbbarb' + v + '-' + st.turn + '-' + st.log.length, body: h('div', { 'data-testid': 'tb-barbarian' },
    h('h2', null, t('🪓 Mover un bárbaro')), h('p', null, why),
    h('p', null, victim != null ? t('Sugerencia: sobre un camino de {name} (le robas una carta).', { name: st.players[victim].name }) : t('Sugerencia: donde más estorba a tus rivales.')),
    h('div', { class: 'row' }, h('button', { class: 'btn green', 'data-testid': 'tb-barbarian-ok', onclick: () => dispatch(sug) }, t('🎲 Que elija el juego')))) };
}

// where the wagon can go this turn (within its movement points and the gold for tolls): Map v -> { mp, gold, path }
export function destinations(st, v) {
  const out = new Map();
  if (!hasTraders(st) || st.phase !== 'main' || st.current !== v) return out;
  const from = TR.wagonAt(st, v);
  if (from == null || TR.stopped(st, v)) return out;
  const R = TR.wagonRoutes(st, v), mp = TR.mpLeft(st, v), gold = st.players[v].gold;
  for (const [u, c] of R.cost) {
    if (u === from || c > mp || R.gold.get(u) > gold) continue;
    const path = [];
    for (let x = u; R.prev.has(x) && x !== from; x = R.prev.get(x)[0]) path.unshift(x);
    out.set(u, { mp: c, gold: R.gold.get(u), path });
  }
  return out;
}

// board picks: the wagon's destinations; barbarians to move
export function tradersInteraction(st, v, ui, { mk, dispatch, rerender }) {
  if (!hasTraders(st) || st.current !== v) return undefined;
  const T = st.traders;
  if (st.phase === 'tbBarbarian') {
    const R = T.relocate || { from: null, steal: true };
    const from = R.from != null ? R.from : ui.tbFrom;
    if (from == null || !T.barbarians.includes(from)) {
      ui.tbFrom = null;
      return mk('road', T.barbarians, e => { ui.tbFrom = e; rerender(); });
    }
    const spots = TR.freeBarbPaths(st);
    const inter = mk('road', spots, to => { ui.tbFrom = null; dispatch({ type: 'tbMoveBarbarian', pid: v, from, to }); });
    if (R.steal) {
      const labels = {};
      for (const e of spots) if (TR.roadVictim(st, v, e) != null) labels[e] = '🫳';
      inter.labels = labels;
    }
    return inter;
  }
  if (st.phase !== 'main' || ui.pick !== 'tbWagon') return undefined;
  const D = destinations(st, v);
  const labels = {};
  for (const [u, d] of D) labels[u] = d.gold ? `${d.mp}·🪙${d.gold}` : String(d.mp);
  const inter = mk('wagon', [...D.keys()], u => {
    ui.pick = null;
    for (const to of D.get(u).path) if (!dispatch({ type: 'tbMove', pid: v, to })) break;
  });
  inter.labels = labels;
  return inter;
}

// the action bar while a barbarian is being moved
export function barbarianActions(st, v, ui, { h, dispatch, rerender }) {
  if (st.current !== v) return [h('div', { class: 'waiting' }, t('🪓 {name} mueve un bárbaro...', { name: st.players[st.current].name }))];
  const R = st.traders.relocate || { from: null, steal: true };
  const out = [h('div', { class: 'waiting your-turn', 'data-testid': 'tb-barbarian' }, t('🪓 Mover un bárbaro'),
    h('small', null, R.from != null ? t('Tu carromato espantó al bárbaro: ¿adónde lo mandas?') : t('Mueve un bárbaro a otro camino. Si lo pones sobre el camino de otro jugador, le robas 1 recurso.')))];
  if (R.from == null && ui.tbFrom != null) out.push(h('button', { class: 'btn ghost', onclick: () => { ui.tbFrom = null; rerender(); } }, t('↩️ Deshacer')));
  out.push(h('button', { class: 'btn ghost', 'data-testid': 'tb-barbarian-ok', title: t('Elige por ti lo que haría un bot'), onclick: () => { ui.tbFrom = null; dispatch(tbBarbarianChoice(st, v)); } }, t('🎲 Que elija el juego')));
  return out;
}

export function tradersBanner(st, v, ui) {
  if (!hasTraders(st)) return '';
  if (st.phase === 'tbBarbarian') {
    if (st.current !== v) return t('🪓 {name} mueve un bárbaro...', { name: st.players[st.current].name });
    const R = st.traders.relocate || {};
    return R.from == null && ui.tbFrom == null ? t('🪓 Toca el bárbaro que quieres mover') : t('🪓 Toca un camino libre para el bárbaro (🫳 = robas una carta)');
  }
  if (st.phase === 'main' && ui.pick === 'tbWagon' && st.current === v) return t('🛒 Toca el cruce adonde va el carromato (número = movimiento, 🪙 = peaje; Esc para cancelar)');
  return '';
}
