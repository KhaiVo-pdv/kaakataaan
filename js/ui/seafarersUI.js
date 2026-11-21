// Seafarers controls for the game screen (gameView.js): building, placing and moving ships.
// Everything here only runs when the state has ships (st.ships).
// UI state it uses on gameView's `ui` object:
//   ui.pick      'ship' (build a ship) or 'moveShip' (move one), next to the base 'road'/'settlement'/'city'
//   ui.moveFrom  the ship picked to move (edge id), while ui.pick === 'moveShip'
//   ui.seaMode   initial placement / Road Building: true = place a ship instead of a road
import * as G from '../engine/game.js';
import * as Ships from '../engine/seafarers/ships.js';
import { t } from '../i18n.js';

export const hasShips = st => !!st.ships;
export const SHIP_COST = Ships.SHIP_COST;

// The board interaction for Seafarers moments, or undefined to let gameView handle it.
// `mk(kind, list, onPick)` builds the interaction; `dispatch` sends an action; `rerender` redraws;
// `liveRes()` is the player's hand in the latest state.
export function seaInteraction(st, v, ui, { mk, dispatch, rerender, canAfford, liveRes }) {
  if (!hasShips(st)) return undefined;
  if (ui.pick !== 'moveShip') ui.moveFrom = null;
  // initial placement: road or ship (a corner with no free road edge only takes a ship)
  if (st.phase === 'setup' && st.setup.step === 'road' && G.pendingActors(st)[0] === v) {
    const ships = Ships.legalSetupShips(st, v);
    const roads = G.legalSetupRoads(st, v);
    if (ships.length && (ui.seaMode || !roads.length))
      return mk('ship', ships, eid => {
        ui.seaMode = false;
        dispatch({ type: 'placeShip', pid: v, eid });
      });
    return undefined;
  }
  if (st.current !== v) return undefined;
  if (st.phase === 'roadBuilding' && ui.seaMode)
    return mk('ship', Ships.legalShips(st, v), at => dispatch({ type: 'build', pid: v, what: 'ship', at }));
  if (st.phase !== 'main') return undefined;
  if (ui.pick === 'ship')
    return mk('ship', Ships.legalShips(st, v), at => {
      if (dispatch({ type: 'build', pid: v, what: 'ship', at })) {
        if (!canAfford(liveRes(), SHIP_COST)) ui.pick = null; // the hand after paying
        rerender();
      }
    });
  if (ui.pick === 'moveShip') {
    if (ui.moveFrom == null)
      return mk('ship', Ships.movableShips(st, v), e => {
        ui.moveFrom = e;
        rerender();
      });
    const from = ui.moveFrom;
    return mk('ship', Ships.shipDestinations(st, v, from), to => {
      ui.pick = null;
      ui.moveFrom = null;
      dispatch({ type: 'moveShip', pid: v, from, to });
    });
  }
  return undefined;
}

// banner text for those moments ('' = none of ours)
export function seaBanner(st, v, ui, inter) {
  if (!hasShips(st) || !inter || inter.kind !== 'ship') return '';
  if (st.phase === 'setup') return t('⛵ Coloca tu barco');
  if (st.phase === 'roadBuilding') return t('⛵ Coloca tu barco gratis');
  if (ui.pick === 'moveShip') return ui.moveFrom == null ? t('⛵ Elige qué barco mover (Esc para cancelar)') : t('⛵ Elige adónde va el barco (Esc para cancelar)');
  return t('⛵ Elige dónde construir el barco (Esc para cancelar)');
}

// "road or ship" switch for the initial placement and Road Building
export function seaModeSwitch(st, v, ui, { h, rerender }) {
  if (!hasShips(st)) return null;
  const roads = st.phase === 'setup' ? G.legalSetupRoads(st, v) : G.legalRoads(st, v);
  const ships = st.phase === 'setup' ? Ships.legalSetupShips(st, v) : Ships.legalShips(st, v);
  if (!ships.length) return null;
  const sea = ui.seaMode || !roads.length;
  const chip = (on, label, val, disabled) => h('button', {
    class: 'chip' + (on ? ' on' : ''), disabled, 'data-testid': val ? 'mode-ship' : 'mode-road',
    onclick: e => { e.stopPropagation(); ui.seaMode = val; rerender(); },
  }, label);
  return h('div', { class: 'chips' }, chip(!sea, t('🛤️ Camino'), false, !roads.length), chip(sea, t('⛵ Barco'), true, false));
}

// main-phase buttons: build a ship, move a ship
export function seaButtons(st, v, ui, { h, rerender, costIcons, canAfford }) {
  if (!hasShips(st)) return [];
  const p = st.players[v];
  const canBuild = p.shipsLeft > 0 && canAfford(p.res, SHIP_COST) && Ships.legalShips(st, v).length > 0;
  const canMove = Ships.movableShips(st, v).some(e => Ships.shipDestinations(st, v, e).length);
  const toggle = what => e => {
    e.stopPropagation();
    ui.pick = ui.pick === what ? null : what;
    ui.moveFrom = null;
    rerender();
  };
  return [
    h('button', {
      class: 'btn' + (ui.pick === 'ship' ? ' active' : ''), disabled: !canBuild, 'data-testid': 'build-ship',
      title: t('{label} — cuesta {cost} (quedan {left})', { label: t('Barco'), cost: costIcons(SHIP_COST), left: p.shipsLeft }),
      onclick: toggle('ship'),
    }, h('span', { class: 'bicon' }, '⛵'), h('span', null, t('Barco'), h('span', { class: 'cost' }, costIcons(SHIP_COST)))),
    h('button', {
      class: 'btn' + (ui.pick === 'moveShip' ? ' active' : ''), disabled: !canMove, 'data-testid': 'move-ship',
      title: st.shipTurn.moved ? t('Ya moviste un barco este turno.') : t('Mueve un barco del extremo de una ruta (uno por turno)'),
      onclick: toggle('moveShip'),
    }, h('span', { class: 'bicon' }, '🧭'), h('span', null, t('Mover barco'))),
  ];
}

// the ship line of the out-of-turn "what can I pay for" preview
export function seaAfford(st, v) {
  if (!hasShips(st)) return [];
  const p = st.players[v];
  return [['ship', '⛵', t('Barco'), p.shipsLeft > 0 && Ships.legalShips(st, v).length > 0, SHIP_COST]];
}

// hint button wording for Seafarers moves (undefined = not ours)
export function seaDescribe(a) {
  if (!a) return undefined;
  if (a.type === 'build' && a.what === 'ship') return t('⛵ Construye un barco (resaltado).');
  if (a.type === 'placeShip') return t('⛵ Coloca un barco en la costa.');
  if (a.type === 'moveShip') return t('🧭 Mueve un barco.');
  if (a.type === 'movePirate') return t('🏴‍☠️ Mueve el pirata (resaltado).');
  return undefined;
}

// ---- pirate: on a 7 / knight the player may move the pirate instead of the robber ----
// ui.pirateMode: true = the robber phase picks a sea tile for the pirate
export const hasPirate = st => st.board.pirate !== undefined;

export function pirateInteraction(st, v, ui, { mk, pick }) {
  if (!hasPirate(st) || st.phase !== 'robber' || st.current !== v || !ui.pirateMode) return undefined;
  return mk('pirate', G.legalPirateTiles(st), tile => pick(tile));
}

// rob someone next to the pirate's new tile (asks who when there are several)
export function piratePick(st, v, tile, { dispatch, chooseVictim }) {
  const victims = G.pirateTargets(st, v, tile);
  if (victims.length <= 1) return dispatch({ type: 'movePirate', pid: v, tile, victim: victims[0] });
  chooseVictim(victims, victim => dispatch({ type: 'movePirate', pid: v, tile, victim }));
}

// "robber or pirate" switch for the robber phase
export function pirateSwitch(st, v, ui, { h, rerender }) {
  if (!hasPirate(st)) return null;
  const chip = (on, label, val, id) => h('button', {
    class: 'chip' + (on ? ' on' : ''), 'data-testid': id,
    onclick: e => { e.stopPropagation(); ui.pirateMode = val; rerender(); },
  }, label);
  return h('div', { class: 'chips' }, chip(!ui.pirateMode, t('🦹 Ladrón'), false, 'mode-robber'), chip(!!ui.pirateMode, t('🏴‍☠️ Pirata'), true, 'mode-pirate'));
}

export const pirateBanner = (st, inter) => (hasPirate(st) && inter && inter.kind === 'pirate' ? t('🏴‍☠️ Elige dónde poner el pirata') : '');

// extra stats on a player card: ships left and island bonus points
export function seaStats(st, p, { h }) {
  const out = [];
  if (hasShips(st)) out.push(h('span', { title: t('Barcos que quedan') }, `⛵ ${p.shipsLeft}`));
  if (p.islandVP) out.push(h('span', { class: 'award', title: t('Puntos por islas nuevas') }, `🏝️ +${p.islandVP}`));
  return out;
}

// toast for Seafarers effects (returns true when the effect was ours)
export function seaFx(st, f, { toast, rich }) {
  if (f.kind === 'islandBonus') {
    toast(rich(t('🏝️ @{pid} llega a una isla nueva: +{n} puntos', { pid: f.pid, n: f.n }), st.players), 'good');
    return true;
  }
  if (f.kind === 'revealSea') return true; // the cloud fading away on the board says it all
  return false;
}
