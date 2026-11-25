// Explorers & Pirates: action bar buttons, board picks and player stats (called from gameView.js).
import * as G from '../engine/game.js';
import { HARBOR_COST } from '../engine/explorersPirates/rules.js';
import { t } from '../i18n.js';

export const hasEP = st => !!st.explorers;

// harbor settlement + gold buttons (empty outside Explorers & Pirates)
export function epButtons(st, v, ui, { h, rerender, costIcons, canAfford, openGold }) {
  if (!hasEP(st)) return [];
  const p = st.players[v];
  const ok = p.harborsLeft > 0 && canAfford(p.res, HARBOR_COST) && G.legalHarbors(st, v).length > 0;
  return [
    h('button', {
      class: 'btn' + (ui.pick === 'harbor' ? ' active' : ''), disabled: !ok, 'data-testid': 'ep-harbor',
      title: t('{label} — cuesta {cost} (quedan {left})', { label: t('Poblado portuario'), cost: costIcons(HARBOR_COST), left: p.harborsLeft }),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'harbor' ? null : 'harbor'; rerender(); },
    }, h('span', { class: 'bicon' }, '⚓'), h('span', null, t('Poblado portuario'), h('span', { class: 'cost' }, costIcons(HARBOR_COST)))),
    h('button', { class: 'btn', 'data-testid': 'gold-open', title: t('Compra recursos con oro o cambia recursos por oro'), onclick: openGold },
      h('span', { class: 'bicon' }, '🪙'), h('span', null, t('Oro'), h('span', { class: 'cost' }, String(p.gold)))),
  ];
}

// out-of-turn preview entry: [what, icon, label, room, cost]
export function epAfford(st, v) {
  if (!hasEP(st)) return [];
  const p = st.players[v];
  return [['harbor', '⚓', t('Poblado portuario'), p.harborsLeft > 0 && G.legalHarbors(st, v).length > 0, HARBOR_COST]];
}

// tapping one of your coastal settlements upgrades it (undefined = not ours to handle)
export function epInteraction(st, v, ui, { mk, dispatch, rerender }) {
  if (!hasEP(st) || st.phase !== 'main' || st.current !== v || ui.pick !== 'harbor') return undefined;
  return mk('city', G.legalHarbors(st, v), at => {
    if (dispatch({ type: 'build', pid: v, what: 'harbor', at })) {
      ui.pick = null;
      rerender();
    }
  });
}

export function epStats(st, p, { h }) {
  if (!hasEP(st)) return [];
  return [h('span', { title: t('Oro') }, `🪙 ${p.gold}`), h('span', { title: t('Poblados portuarios que quedan') }, `⚓ ${p.harborsLeft}`)];
}

export const epDescribe = a => (a && a.type === 'build' && a.what === 'harbor' ? t('⚓ Mejora un poblado de la costa a poblado portuario.') : null);
