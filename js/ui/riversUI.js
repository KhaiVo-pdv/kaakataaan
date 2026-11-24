// Traders & Barbarians, Rivers of Catan: controls for the game screen (gameView.js).
// Everything here only shows when the state has rivers (st.rivers).
// UI state it uses on gameView's `ui` object:
//   ui.pick === 'bridge'   the board highlights the bridge spots you can build on
//   ui.lastTitles          "wealthy|poor..." last seen, to toast when your title changes
import * as G from '../engine/game.js';
import { RES, TILE_INFO } from '../engine/constants.js';
import * as Rivers from '../engine/tradersBarbarians/rivers.js';
import { t } from '../i18n.js';

export const hasRivers = st => !!(st && st.rivers);
const icons = cost => Object.entries(cost).map(([r, n]) => TILE_INFO[r].icon.repeat(n)).join('');

// the 🌉 bridge and 🪙 gold buttons in the action bar
export function riverButtons(st, v, ui, { h, rerender, openGold }) {
  if (!hasRivers(st)) return [];
  const p = st.players[v];
  const mine = st.current === v && st.phase === 'main';
  const spots = mine ? G.legalBridges(st, v) : [];
  const why = !mine ? t('Solo en tu turno, después de tirar.')
    : p.bridgesLeft <= 0 ? t('No te quedan puentes.')
    : !G.canAfford(p.res, Rivers.BRIDGE_COST) ? t('Te faltan recursos.')
    : !spots.length ? t('Ningún sitio de puente toca tus caminos o poblados.') : '';
  return [
    h('button', {
      class: 'btn' + (ui.pick === 'bridge' ? ' primary' : ''), disabled: !!why, 'data-testid': 'build-bridge',
      title: why || t('Puente: cruza el río y da 3 de oro'),
      onclick: e => { e.stopPropagation(); ui.pick = ui.pick === 'bridge' ? null : 'bridge'; rerender(); },
    }, h('span', { class: 'bicon' }, '🌉'), h('span', null, t('Puente'), h('span', { class: 'cost' }, `${icons(Rivers.BRIDGE_COST)} · ${p.bridgesLeft}/${Rivers.MAX_BRIDGES}`))),
    h('button', { class: 'btn', 'data-testid': 'gold-open', title: t('Compra recursos con oro o cambia recursos por oro'), onclick: openGold },
      h('span', { class: 'bicon' }, '🪙'), h('span', null, t('Oro'), h('span', { class: 'cost' }, String(p.gold)))),
  ];
}

// pick mode: the highlighted bridge spots (undefined when not picking a bridge)
export function bridgeInteraction(st, v, ui, { mk, dispatch, rerender }) {
  if (!hasRivers(st) || ui.pick !== 'bridge') return undefined;
  if (st.current !== v || st.phase !== 'main') return undefined;
  return mk('road', G.legalBridges(st, v), at => {
    if (dispatch({ type: 'buildBridge', pid: v, at })) ui.pick = null;
    rerender();
  });
}

// the gold panel: buy (2 gold → 1 resource, twice a turn), sell (bank/harbour rate → 1 gold), titles
export function goldModal(st, v, { h, dispatch, close }) {
  const p = st.players[v];
  const mine = st.current === v && st.phase === 'main';
  const left = Rivers.goldBuysLeft(st);
  const titles = Rivers.wealthTitles(st);
  const name = id => (id === v ? t('tú') : st.players[id].name);
  const canBuy = r => mine && left > 0 && p.gold >= Rivers.GOLD_PER_RESOURCE && st.bank[r] > 0;
  const sellRows = RES.map(r => ({ r, n: G.tradeRatio(st, v, r) }));
  return h('div', { class: 'gold-panel' },
    h('h2', null, t('🪙 Tu oro')),
    h('p', null, t('Tienes {n} de oro. Puedes comprar {k} vez/veces más este turno.', { n: p.gold, k: left })),
    h('h3', null, t('Comprar: {n} de oro → 1 recurso', { n: Rivers.GOLD_PER_RESOURCE })),
    h('div', { class: 'chips' }, RES.map(r => h('button', { class: 'btn', disabled: !canBuy(r), 'data-testid': 'gold-buy-' + r, onclick: () => { close(); dispatch({ type: 'goldBuy', pid: v, res: r }); } },
      `${TILE_INFO[r].icon} ${t(TILE_INFO[r].name)}`))),
    h('h3', null, t('Vender: recursos → 1 de oro (al cambio del banco o de tu puerto)')),
    h('div', { class: 'chips' }, sellRows.map(({ r, n }) => h('button', { class: 'btn', disabled: !mine || p.res[r] < n, 'data-testid': 'gold-sell-' + r, onclick: () => { close(); dispatch({ type: 'goldSell', pid: v, give: r }); } },
      `${TILE_INFO[r].icon.repeat(n)} → 🪙`))),
    h('div', { class: 'gold-titles' },
      h('p', null, '👑 ', h('b', null, t('Colono más rico (+1):')), ' ', titles.wealthy >= 0 ? name(titles.wealthy) : t('nadie (empate)')),
      h('p', null, '😢 ', h('b', null, t('Colono pobre (−2):')), ' ', titles.poor.map(name).join(', ') || t('nadie'))),
    !mine ? h('p', null, h('small', null, t('Solo en tu turno, después de tirar.'))) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: close }, t('Cerrar'))));
}

// player card: gold (open, like the coins on the table) and the two titles
export function riverStats(st, p, { h }) {
  if (!hasRivers(st)) return [];
  const titles = Rivers.wealthTitles(st);
  const out = [h('span', { title: t('Oro') }, `🪙 ${p.gold}`)];
  if (p.bridgesLeft < Rivers.MAX_BRIDGES) out.push(h('span', { title: t('Puentes construidos') }, `🌉 ${Rivers.MAX_BRIDGES - p.bridgesLeft}`));
  if (titles.wealthy === p.id) out.push(h('span', { class: 'award', title: t('Colono más rico: +1 punto') }, '👑 +1'));
  if (titles.poor.includes(p.id)) out.push(h('span', { class: 'award', title: t('Colono pobre: −2 puntos') }, '😢 −2'));
  return out;
}

// toasts: gold you earn, and your titles changing (call once per state update)
export function riverFx(st, f, v, { toast }) {
  if (f.kind !== 'gold') return false;
  if (f.pid === v) {
    const why = { settlement: t('poblado junto al río'), road: t('camino junto al río'), bridge: t('puente'), trade: t('cambio') }[f.what] || '';
    toast(t('🪙 +{n} de oro ({why})', { n: f.n, why }), 'good');
  }
  return true;
}
export function riverTitles(st, v, ui, { toast }) {
  if (!hasRivers(st) || st.phase === 'setup') return;
  const tl = Rivers.wealthTitles(st);
  const key = `${tl.wealthy === v}|${tl.poor.includes(v)}`;
  if (ui.lastTitles === undefined) {
    ui.lastTitles = key;
    return;
  }
  if (key === ui.lastTitles) return;
  const [wasRich, wasPoor] = ui.lastTitles.split('|');
  ui.lastTitles = key;
  if (tl.wealthy === v && wasRich !== 'true') toast(t('👑 ¡Eres el colono más rico! +1 punto'), 'good');
  if (tl.poor.includes(v) && wasPoor !== 'true') toast(t('😢 Eres un colono pobre: −2 puntos. ¡Consigue oro!'), 'error');
  if (!tl.poor.includes(v) && wasPoor === 'true') toast(t('🙂 Ya no eres un colono pobre'), 'good');
}

// the 💡 hint text for a river move (undefined for other moves)
export function riverDescribe(a) {
  if (a.type === 'buildBridge') return t('🌉 Construye un puente (resaltado).');
  if (a.type === 'goldBuy') return t('🪙 Compra {r} con 2 de oro.', { r: TILE_INFO[a.res].icon });
  if (a.type === 'goldSell') return t('🪙 Cambia {r} por 1 de oro.', { r: TILE_INFO[a.give].icon });
  return undefined;
}
