// Cities & Knights pieces of the game screen (gameView.js). Everything here only shows something
// when the game has the expansion on.
import { RES, TILE_INFO } from '../engine/constants.js';
import * as Improve from '../engine/citiesKnights/improvements.js';
import { COMMODITIES, GATE_INFO, cardsOf } from '../engine/citiesKnights/commodities.js';
import { t } from '../i18n.js';

// every card kind that can appear in any hand (to read offers and fly cards without a state)
export const ANY_CARD = [...RES, ...COMMODITIES];
// the cards of this game: base game = the 5 resources; Cities & Knights adds the commodities
export const cardList = st => (st ? cardsOf(st) : RES);
// an empty hand with a slot for each card of this game (trade and discard drafts)
export const blankHand = st => Object.fromEntries(cardList(st).map(r => [r, 0]));

// the event die next to the number dice (red die = the second number die)
export function eventDieBadge(st, h) {
  if (!st.eventDie) return null;
  const g = GATE_INFO[st.eventDie];
  return h('div', { class: 'event-die face-' + st.eventDie, title: t(g.name), 'data-testid': 'event-die' }, g.icon);
}

// ---------- improvements, metropolis, walls, aqueduct ----------

export const hasCK = st => !!(st && st.metropolis);

// board interaction: 'wall' -> pick a city for a wall; 'metro:<track>' -> pick the metropolis city
export function ckInteraction(st, v, ui, { mk, dispatch }) {
  if (!hasCK(st) || st.current !== v || st.phase !== 'main' || !ui.pick) return undefined;
  if (ui.pick === 'wall')
    return mk('city', Improve.legalWalls(st, v), at => {
      ui.pick = null;
      dispatch({ type: 'buildWall', pid: v, at });
    });
  if (ui.pick.startsWith('metro:')) {
    const track = ui.pick.slice(6);
    return mk('city', Improve.freeCities(st, v), at => {
      ui.pick = null;
      dispatch({ type: 'improve', pid: v, track, at });
    });
  }
  return undefined;
}

export function ckBanner(st, ui, inter) {
  if (!hasCK(st) || !inter || inter.kind !== 'city' || !ui.pick) return '';
  if (ui.pick === 'wall') return t('🧱 Elige la ciudad de la muralla (Esc para cancelar)');
  if (ui.pick.startsWith('metro:')) return t('🏙️ Elige la ciudad de tu metrópolis');
  return '';
}

// main-phase buttons: improvements (opens the panel) and city walls
export function ckButtons(st, v, ui, { h, rerender, costIcons, canAfford, openImprove }) {
  if (!hasCK(st)) return [];
  const p = st.players[v];
  const canWall = Improve.legalWalls(st, v).length > 0 && canAfford(p.res, Improve.WALL_COST);
  return [
    h('button', { class: 'btn', 'data-testid': 'improve', onclick: e => { e.stopPropagation(); openImprove(); } },
      h('span', { class: 'bicon' }, '🏛️'), h('span', null, t('Mejoras'))),
    h('button', {
      class: 'btn' + (ui.pick === 'wall' ? ' active' : ''), disabled: !canWall, 'data-testid': 'build-wall',
      title: t('Muralla — cuesta {cost} (quedan {left}): +2 cartas al límite del 7', { cost: costIcons(Improve.WALL_COST), left: p.wallsLeft }),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'wall' ? null : 'wall'; rerender(); },
    }, h('span', { class: 'bicon' }, '🧱'), h('span', null, t('Muralla'), h('span', { class: 'cost' }, costIcons(Improve.WALL_COST)))),
  ];
}

// the improvements panel: three tracks, their level, the next cost and the level-3 ability
export function improveModal(st, v, ui, { h, dispatch, close, rerender, canAfford }) {
  const p = st.players[v];
  const mine = st.current === v && st.phase === 'main';
  const row = tr => {
    const info = Improve.TRACK_INFO[tr];
    const lvl = p.improve[tr];
    const com = Improve.TRACK_COMMODITY[tr];
    const cost = lvl < Improve.MAX_LEVEL ? Improve.improveCost(st, v, tr) : null;
    const block = Improve.improveBlock(st, v, tr);
    const afford = cost && canAfford(p.res, cost);
    const metro = st.metropolis[tr];
    const buy = () => {
      // a metropolis won now with a choice of cities: pick it on the board
      if (Improve.winsMetropolis(st, v, tr) && Improve.freeCities(st, v).length > 1) {
        ui.pick = 'metro:' + tr;
        close();
        rerender();
        return;
      }
      dispatch({ type: 'improve', pid: v, track: tr });
    };
    return h('div', { class: 'ck-track ck-' + tr },
      h('div', { class: 'ck-head' }, h('b', null, `${info.icon} ${t(info.name)}`), h('span', { class: 'ck-com' }, `${TILE_INFO[com].icon} ${p.res[com]}`)),
      h('div', { class: 'ck-levels' }, Array.from({ length: Improve.MAX_LEVEL }, (_, i) => h('span', { class: 'ck-pip' + (i < lvl ? ' on' : '') + (i + 1 === Improve.ABILITY_LEVEL ? ' ab' : '') + (i + 1 >= Improve.METRO_LEVEL ? ' mt' : '') }, String(i + 1)))),
      h('small', { class: 'ck-ability' + (lvl >= Improve.ABILITY_LEVEL ? ' got' : '') }, t('Nivel 3 — {a}', { a: t(info.ability) })),
      h('small', null, metro ? t('🏙️ Metrópolis: {name}', { name: st.players[metro.owner].name }) : t('🏙️ Metrópolis libre: la levanta el primero en nivel 4')),
      cost ? h('button', { class: 'btn sm' + (afford && !block ? ' primary' : ''), disabled: !mine || !!block || !afford, 'data-testid': 'improve-' + tr, title: block ? t(block) : '', onclick: buy },
        t('Subir a nivel {n} · {cost}', { n: lvl + 1, cost: `${cost[com]}${TILE_INFO[com].icon}` })) : h('b', null, t('¡Nivel máximo!')));
  };
  return h('div', null,
    h('h2', null, t('🏛️ Mejoras de ciudad')),
    h('p', null, t('Cada nivel cuesta tantas mercancías como su número. Necesitas al menos una ciudad.')),
    h('div', { class: 'ck-tracks' }, Improve.TRACKS.map(row)),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: close }, t('Cerrar'))));
}

// the Aqueduct choice after a roll that gave nothing
export function aqueductModal(st, v, { h, dispatch }) {
  return h('div', null,
    h('h2', null, t('🟩 Acueducto')),
    h('p', null, t('La tirada no te dio nada: elige 1 recurso del banco.')),
    h('div', { class: 'respick' }, Improve.AQUEDUCT_RES.map(r => h('button', { class: 'btn', disabled: st.bank[r] < 1, 'data-testid': 'aqueduct-' + r, onclick: () => dispatch({ type: 'aqueductPick', pid: v, res: r }) },
      TILE_INFO[r].icon, h('small', null, t(TILE_INFO[r].name))))));
}

// player card extras: improvement levels, metropolises, walls
export function ckStats(st, p, { h }) {
  if (!hasCK(st)) return [];
  const out = [h('span', { title: t('Mejoras: comercio · política · ciencia') }, `🟨${p.improve.trade} 🟦${p.improve.politics} 🟩${p.improve.science}`)];
  const metros = Improve.TRACKS.filter(tr => st.metropolis[tr] && st.metropolis[tr].owner === p.id).length;
  if (metros) out.push(h('span', { class: 'award', title: t('Metrópolis (+2 cada una)') }, `🏙️×${metros}`));
  const walls = Improve.MAX_WALLS - p.wallsLeft;
  if (walls) out.push(h('span', { title: t('Murallas: +2 cartas al límite del 7 cada una') }, `🧱${walls}`));
  return out;
}

export function ckDescribe(a) {
  if (!a) return undefined;
  if (a.type === 'improve') return t('🏛️ Mejora {track}.', { track: t(Improve.TRACK_INFO[a.track].name) });
  if (a.type === 'buildWall') return t('🧱 Construye una muralla.');
  if (a.type === 'aqueductPick') return t('🟩 Elige un recurso con el acueducto.');
  return undefined;
}
