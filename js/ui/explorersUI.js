// Explorers & Pirates: action bar buttons, board picks and player stats (called from gameView.js).
import * as G from '../engine/game.js';
import { HARBOR_COST, SHIP_COST, BOOST_COST, BOOST_MP } from '../engine/explorersPirates/rules.js';
import * as Ships from '../engine/explorersPirates/ships.js';
import { t } from '../i18n.js';

export const hasEP = st => !!st.explorers;

// harbor settlement + gold buttons (empty outside Explorers & Pirates)
export function epButtons(st, v, ui, { h, rerender, costIcons, canAfford, openGold, dispatch }) {
  if (!hasEP(st)) return [];
  const p = st.players[v];
  const ok = p.harborsLeft > 0 && canAfford(p.res, HARBOR_COST) && G.legalHarbors(st, v).length > 0;
  return [
    h('button', {
      class: 'btn' + (ui.pick === 'harbor' ? ' active' : ''), disabled: !ok, 'data-testid': 'ep-harbor',
      title: t('{label} — cuesta {cost} (quedan {left})', { label: t('Poblado portuario'), cost: costIcons(HARBOR_COST), left: p.harborsLeft }),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'harbor' ? null : 'harbor'; rerender(); },
    }, h('span', { class: 'bicon' }, '⚓'), h('span', null, t('Poblado portuario'), h('span', { class: 'cost' }, costIcons(HARBOR_COST)))),
    h('button', {
      class: 'btn' + (ui.pick === 'epShip' ? ' active' : ''), 'data-testid': 'ep-ship',
      disabled: !(p.shipsLeft > 0 && canAfford(p.res, SHIP_COST) && Ships.shipBuildEdges(st, v).length > 0),
      title: t('{label} — cuesta {cost} (quedan {left})', { label: t('Barco'), cost: costIcons(SHIP_COST), left: p.shipsLeft }),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'epShip' ? null : 'epShip'; rerender(); },
    }, h('span', { class: 'bicon' }, '⛵'), h('span', null, t('Barco'), h('span', { class: 'cost' }, costIcons(SHIP_COST)))),
    h('button', {
      class: 'btn', 'data-testid': 'ep-sail', disabled: !st.epShips.some(x => x.owner === v),
      title: t('Pasa a mover tus barcos (después ya no puedes construir ni comerciar)'),
      onclick: () => { ui.pick = null; ui.epShip = null; dispatch({ type: 'epSail', pid: v }); },
    }, h('span', { class: 'bicon' }, '🧭'), h('span', null, t('Mover barcos'))),
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
  if (!hasEP(st) || st.current !== v) return undefined;
  if (st.phase === 'epMove') {
    // tap one of your ships, then a highlighted edge
    const mine = st.epShips.filter(x => x.owner === v && Ships.shipMp(st, x) > 0);
    const sel = mine.find(x => x.id === ui.epShip);
    if (!sel) return mk('road', mine.map(x => x.edge), e => { ui.epShip = (mine.find(x => x.edge === e) || {}).id; rerender(); });
    const R = Ships.reachable(st, sel);
    const others = mine.filter(x => x !== sel).map(x => x.edge);
    return mk('road', [...R.keys(), ...others], e => {
      if (R.has(e)) { dispatch({ type: 'epMove', pid: v, ship: sel.id, to: e }); return; }
      ui.epShip = (mine.find(x => x.edge === e) || {}).id;
      rerender();
    });
  }
  if (st.phase !== 'main') return undefined;
  if (ui.pick === 'epShip') return mk('road', Ships.shipBuildEdges(st, v), at => {
    if (dispatch({ type: 'build', pid: v, what: 'epShip', at })) { ui.pick = null; rerender(); }
  });
  if (ui.pick !== 'harbor') return undefined;
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

export function epDescribe(a) {
  if (!a) return null;
  if (a.type === 'build' && a.what === 'harbor') return t('⚓ Mejora un poblado de la costa a poblado portuario.');
  if (a.type === 'build' && a.what === 'epShip') return t('⛵ Construye un barco junto a tu poblado portuario.');
  if (a.type === 'epSail') return t('🧭 Pasa a mover tus barcos.');
  if (a.type === 'epMove') return t('⛵ Navega hacia las casillas boca abajo.');
  if (a.type === 'epBoost') return t('🐑 Paga 1 lana: el barco navega 2 aristas más.');
  return null;
}

// the action bar while sailing: pick a ship, +2 for a wool, finish the turn
export function epMoveBar(st, v, ui, { h, dispatch, canAfford }) {
  const mine = st.epShips.filter(x => x.owner === v);
  const sel = mine.find(x => x.id === ui.epShip);
  const out = [h('div', { class: 'waiting' }, sel
    ? t('⛵ Barco: {n} pasos. Toca una arista resaltada.', { n: Ships.shipMp(st, sel) })
    : t('⛵ Toca uno de tus barcos'))];
  if (sel) out.push(h('button', {
    class: 'btn', 'data-testid': 'ep-boost', disabled: sel.boosted || !canAfford(st.players[v].res, BOOST_COST),
    title: t('🐑 Paga 1 lana: el barco navega 2 aristas más.'),
    onclick: () => dispatch({ type: 'epBoost', pid: v, ship: sel.id }),
  }, `🐑 +${BOOST_MP}`));
  out.push(h('button', { class: 'btn green', 'data-testid': 'end-turn', onclick: () => { ui.epShip = null; dispatch({ type: 'endTurn', pid: v }); } }, t('✅ Terminar')));
  return out;
}

export function epBanner(st, v) {
  if (!hasEP(st) || st.phase !== 'epMove') return null;
  return st.current === v ? t('⛵ Mueve tus barcos') : t('⛵ {name} mueve sus barcos...', { name: st.players[st.current].name });
}

// discoveries: a toast for the player who found them
export function epFx(st, f, v, { toast }) {
  if (f.kind !== 'epDiscover') return false;
  if (f.pid === v && f.sea === undefined) toast(f.got ? t('🧭 ¡Tierra nueva! +1 recurso') : t('🧭 ¡Tierra nueva!'), 'good');
  return true;
}
