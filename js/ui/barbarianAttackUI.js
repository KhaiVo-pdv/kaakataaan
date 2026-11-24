// Traders & Barbarians, Barbarian Attack: board picks, action bar and banner texts (gameView.js).
// Knights are placed and moved by tapping paths; Treason and Intrigue by tapping hexes.
import * as BA from '../engine/tradersBarbarians/barbarianAttack.js';
import { baCardChoice } from '../engine/bot.js';
import { t, tk } from '../i18n.js';

export const CARD_INFO = {
  knight: { icon: '🛡️', name: tk('Caballería'), text: tk('Un caballero nuevo sale del castillo: colócalo en un camino libre junto a él.') },
  blackKnight: { icon: '🖤', name: tk('Caballero negro'), text: tk('Un caballero nuevo en cualquier camino libre.') },
  treason: { icon: '🗡️', name: tk('Traición'), text: tk('Recibes 2 de oro y puedes mover hasta 2 bárbaros de una casilla costera a otra.') },
  intrigue: { icon: '🕵️', name: tk('Intriga'), text: tk('Un bárbaro de la casilla que elijas se convierte en tu prisionero.') },
};

// the barbarians as they would stand after the Treason moves picked so far
function treasonView(st, moves) {
  const B = st.barbAttack;
  const view = { ...st, barbAttack: { ...B, on: { ...B.on }, conquered: [...B.conquered] } };
  for (const m of moves) BA.moveBarbarian(view, m.from, m.to);
  return view;
}
const treasonKey = st => st.turn + ':' + st.log.length;

export function movableKnights(st, v) {
  const B = st.barbAttack, moved = B.moved && B.moved.turn === st.turn ? B.moved.at : [];
  return BA.knightsOf(st, v).filter(e => !moved.includes(e) && BA.knightReach(st, e).size > 0);
}

// undefined when it isn't a Barbarian Attack moment
export function baInteraction(st, v, ui, { mk, dispatch, rerender, liveRes }) {
  if (!st.barbAttack || st.current !== v) return undefined;
  const B = st.barbAttack;
  if (st.phase === 'baCard') {
    const type = B.card;
    if (type === 'knight' || type === 'blackKnight') return mk('road', BA.knightSpots(st, type), at => dispatch({ type: 'baCard', pid: v, at }));
    if (type === 'intrigue') return mk('robber', Object.keys(B.on).map(Number), hex => dispatch({ type: 'baCard', pid: v, hex }));
    if (type === 'treason') {
      if (ui.baTreason?.key !== treasonKey(st)) ui.baTreason = { key: treasonKey(st), moves: [], from: null };
      const T = ui.baTreason, view = treasonView(st, T.moves);
      const coast = st.board.coast;
      if (T.from == null) return mk('robber', coast.filter(f => coast.some(to => BA.treasonMoveOk(view, f, to))), hex => { T.from = hex; rerender(); });
      return mk('robber', coast.filter(to => BA.treasonMoveOk(view, T.from, to)), hex => {
        T.moves.push({ from: T.from, to: hex });
        T.from = null;
        if (T.moves.length >= BA.TREASON_MOVES) dispatch({ type: 'baCard', pid: v, moves: T.moves });
        else rerender();
      });
    }
    return undefined;
  }
  if (st.phase !== 'main') return undefined;
  if (ui.pick !== 'baKnight') { ui.baFrom = null; return undefined; }
  if (ui.baFrom == null) return mk('road', movableKnights(st, v), e => { ui.baFrom = e; rerender(); });
  const from = ui.baFrom, reach = BA.knightReach(st, from), wheat = liveRes().wheat;
  const list = [...reach].filter(([, d]) => BA.moveCost(d) <= wheat).map(([e]) => e);
  const labels = {};
  for (const e of list) { const c = BA.moveCost(reach.get(e)); if (c) labels[e] = '🌾' + c; }
  const inter = mk('road', list, to => {
    ui.baFrom = null;
    if (!movableKnights(st, v).filter(e => e !== from).length) ui.pick = null;
    dispatch({ type: 'baMoveKnight', pid: v, from, to });
  });
  inter.labels = labels;
  return inter;
}

// the action bar while a card is being resolved
export function baCardActions(st, v, ui, { h, dispatch, rerender }) {
  const B = st.barbAttack, mine = st.current === v;
  if (!mine) return [h('div', { class: 'waiting' }, t('🃏 {name} resuelve su carta...', { name: st.players[st.current].name }))];
  const info = CARD_INFO[B.card];
  const out = [h('div', { class: 'waiting your-turn', 'data-testid': 'ba-card' }, `${info.icon} ${t(info.name)}`, h('small', null, t(info.text)))];
  if (B.card === 'treason') {
    const T = ui.baTreason && ui.baTreason.key === treasonKey(st) ? ui.baTreason : { moves: [], from: null };
    out.push(h('button', { class: 'btn green', 'data-testid': 'ba-card-done', onclick: () => dispatch({ type: 'baCard', pid: v, moves: T.moves }) },
      T.moves.length ? t('✅ Listo ({n} movido)', { n: T.moves.length }) : t('No mover nada')));
    if (T.moves.length || T.from != null) out.push(h('button', { class: 'btn ghost', onclick: () => { ui.baTreason = null; rerender(); } }, t('↩️ Deshacer')));
  }
  out.push(h('button', { class: 'btn ghost', 'data-testid': 'ba-card-auto', title: t('Elige por ti lo que haría un bot'), onclick: () => dispatch(baCardChoice(st, v)) }, t('🎲 Que elija el juego')));
  return out;
}

// the action-bar button in the main phase
export function baKnightButtons(st, v, ui, { h, rerender }) {
  if (!st.barbAttack) return [];
  const mine = BA.knightsOf(st, v).length;
  if (!mine) return [];
  const can = movableKnights(st, v).length > 0;
  return [h('button', { class: 'btn' + (ui.pick === 'baKnight' ? ' active' : ''), 'data-testid': 'ba-knight-move', disabled: !can,
    title: t('Mueve un caballero: hasta 3 caminos gratis, 1 cereal por cada camino de más (5 como mucho). Cada caballero, una vez por turno.'),
    onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'baKnight' ? null : 'baKnight'; ui.baFrom = null; rerender(); } },
  h('span', { class: 'bicon' }, '🛡️'), h('span', null, t('Mover caballero'), h('span', { class: 'cost' }, `${mine}/${BA.KNIGHTS}`)))];
}

export function baBanner(st, v, ui) {
  if (!st.barbAttack) return '';
  if (st.phase === 'baCard') {
    if (st.current !== v) return t('🃏 {name} resuelve su carta...', { name: st.players[st.current].name });
    const c = st.barbAttack.card;
    if (c === 'knight' || c === 'blackKnight') return t('🛡️ Toca un camino resaltado para colocar tu caballero');
    if (c === 'intrigue') return t('🕵️ Toca una casilla con bárbaros para hacer un prisionero');
    if (c === 'treason') return ui.baTreason && ui.baTreason.from != null ? t('🗡️ ¿Adónde va ese bárbaro? Toca otra casilla de la costa') : t('🗡️ Toca una casilla de la costa con bárbaros para moverlos');
  }
  if (st.phase === 'main' && ui.pick === 'baKnight') return ui.baFrom == null ? t('🛡️ Elige qué caballero se mueve (Esc para cancelar)') : t('🛡️ Elige adónde va (🌾 = cereal que cuesta)');
  return '';
}
