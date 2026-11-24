// Traders & Barbarians, The Caravans: controls for the game screen (gameView.js).
// Everything here only shows when the state has caravans (st.caravans).
// UI state it uses on gameView's `ui` object:
//   ui.camelBid  { key, sheep, wheat, spot } — your vote being prepared (key = which vote it belongs to)
import * as Caravans from '../engine/tradersBarbarians/caravans.js';
import { TILE_INFO } from '../engine/constants.js';
import { spotLetter } from './caravans2d.js';
import { t } from '../i18n.js';

export const hasCaravans = st => !!(st && st.caravans);

// who gains what if the camel goes on edge e: "+1 VP" for a building getting its 2nd camel,
// "road ×2" for a road on that path
function spotEffects(st, e) {
  const bd = st.board, E = bd.edges[e], out = [];
  for (const v of [E.a, E.b]) {
    const b = st.buildings[v];
    if (b && Caravans.camelsAt(st, v) === 1) out.push({ pid: b.owner, what: 'vp' });
  }
  if (st.roads[e] !== undefined) out.push({ pid: st.roads[e], what: 'road' });
  return out;
}

// the vote panel (forced modal while it is your turn to vote)
export function voteModal(st, v, ui, { h, dispatch, rerender }) {
  const V = st.caravans.vote, p = st.players[v];
  const key = `${st.turn}-${V.options.join(',')}`;
  if (!ui.camelBid || ui.camelBid.key !== key) ui.camelBid = { key, sheep: 0, wheat: 0, spot: V.options[0] };
  const B = ui.camelBid;
  const n = B.sheep + B.wheat;
  const name = pid => (pid === v ? t('tú') : st.players[pid].name);
  const stepper = r => h('span', { class: 'camel-step' },
    `${TILE_INFO[r].icon} ${t(TILE_INFO[r].name)} `,
    h('button', { class: 'btn sm', disabled: B[r] <= 0, 'data-testid': `camel-${r}-minus`, onclick: () => { B[r]--; rerender(); } }, '−'),
    h('b', null, ` ${B[r]} `),
    h('button', { class: 'btn sm', disabled: B[r] >= p.res[r], 'data-testid': `camel-${r}-plus`, onclick: () => { B[r]++; rerender(); } }, '+'),
    h('small', null, ` / ${p.res[r]}`));
  const done = Object.entries(V.bids);
  return h('div', { class: 'camel-panel', 'data-testid': 'camel-vote' },
    h('h2', null, t('🐪 ¿Dónde va el próximo camello?')),
    h('p', null, t('Los sitios con letra brillan en el tablero. Cada lana o trigo es un voto y vuelve al banco.')),
    h('div', { class: 'camel-spots' }, V.options.map(e => {
      const eff = spotEffects(st, e);
      return h('button', { class: 'btn camel-spot-btn' + (B.spot === e ? ' primary' : ''), 'data-testid': 'camel-spot-' + spotLetter(st, e), onclick: () => { B.spot = e; rerender(); } },
        h('b', null, spotLetter(st, e)),
        h('small', null, eff.length ? eff.map(x => (x.what === 'vp' ? t('+1 punto: {who}', { who: name(x.pid) }) : t('camino ×2: {who}', { who: name(x.pid) }))).join(' · ') : t('sin efecto')));
    })),
    h('div', { class: 'camel-steps' }, stepper('sheep'), stepper('wheat'), h('b', null, t('→ {n} votos', { n }))),
    done.length ? h('p', null, h('small', null, t('Ya votaron:') + ' ' + done.map(([pid, b]) => t('{who} {n} → {spot}', { who: name(+pid), n: b.n, spot: b.n ? spotLetter(st, b.spot) : '—' })).join(' · '))) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-testid': 'camel-bid', onclick: () => dispatch({ type: 'caravanBid', pid: v, sheep: B.sheep, wheat: B.wheat, spot: B.spot }) },
      n ? t('🐪 Votar ({n})', { n }) : t('🐪 No votar'))));
}

// after a tie, the decider picks one of the tied spots
export function pickModal(st, v, { h, dispatch }) {
  const V = st.caravans.vote;
  return h('div', { class: 'camel-panel', 'data-testid': 'camel-pick' },
    h('h2', null, t('🐪 Empate: tú eliges')),
    h('p', null, t('Elige uno de los sitios empatados.')),
    h('div', { class: 'camel-spots' }, V.tied.map(e => h('button', { class: 'btn camel-spot-btn', 'data-testid': 'camel-pick-' + spotLetter(st, e), onclick: () => dispatch({ type: 'caravanPick', pid: v, spot: e }) }, h('b', null, spotLetter(st, e))))));
}

// top banner during a vote ('' when not voting)
export function voteBanner(st, v) {
  if (!hasCaravans(st) || (st.phase !== 'caravanVote' && st.phase !== 'caravanPick')) return '';
  const V = st.caravans.vote;
  const who = st.phase === 'caravanVote' ? V.order[V.idx] : V.decider;
  if (who === v) return st.phase === 'caravanVote' ? t('🐪 ¡Te toca votar dónde va el camello!') : t('🐪 Empate: elige el sitio del camello');
  return st.phase === 'caravanVote' ? t('🐪 Votación de la caravana: vota {name}...', { name: st.players[who].name }) : t('🐪 Empate: {name} elige el sitio...', { name: st.players[who].name });
}

// player card: points from camels
export function caravanStats(st, p, { h }) {
  if (!hasCaravans(st)) return [];
  const vp = Caravans.camelVP(st, p.id);
  return vp ? [h('span', { class: 'award', title: t('Edificios entre dos camellos: +1 punto cada uno') }, `🐪 +${vp}`)] : [];
}

// toasts when a camel lands next to your buildings or roads
export function caravanFx(st, f, v, { toast }) {
  if (f.kind !== 'camel') return f.kind === 'camelVote' || f.kind === 'camelBid';
  const bd = st.board, E = bd.edges[f.at];
  const gained = [E.a, E.b].filter(x => st.buildings[x] && st.buildings[x].owner === v && Caravans.camelsAt(st, x) === 2).length;
  if (gained) toast(t('🐪 ¡Un camello junto a tu poblado! +{n} punto', { n: gained }), 'good');
  else if (st.roads[f.at] === v) toast(t('🐪 Un camello junto a tu camino: ahora cuenta doble'), 'good');
  else toast(t('🐪 Un camello se une a la caravana'), 'info', 1800);
  return true;
}

// the 💡 hint text for a caravan move (undefined for other moves)
export function caravanDescribe(a, st) {
  if (a.type === 'caravanBid') {
    const n = (a.sheep || 0) + (a.wheat || 0);
    return n ? t('🐪 Da {n} votos al sitio {L}.', { n, L: spotLetter(st, a.spot) }) : t('🐪 No votes; el sitio {L} te va bien.', { L: spotLetter(st, a.spot) });
  }
  if (a.type === 'caravanPick') return t('🐪 Elige el sitio {L}.', { L: spotLetter(st, a.spot) });
  return undefined;
}
