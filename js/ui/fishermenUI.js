// Traders & Barbarians, Fishermen: controls for the game screen (gameView.js).
// Everything here only shows when the state has fish (st.fishermen).
// UI state it uses on gameView's `ui` object:
//   ui.fishStep  null, 'steal' (pick a rival) or 'resource' (pick a resource) inside the fish panel
import * as G from '../engine/game.js';
import { RES, TILE_INFO } from '../engine/constants.js';
import { FISH_PERKS, fishCount } from '../engine/tradersBarbarians/fishermen.js';
import { t, tk } from '../i18n.js';

export const hasFish = st => !!(st && st.fishermen);

const PERKS = [
  { id: 'robber', icon: '🦹', name: tk('Sacar al ladrón del tablero'), desc: tk('Vuelve con el próximo 7 o caballero.') },
  { id: 'steal', icon: '🫳', name: tk('Robar 1 carta'), desc: tk('Al azar, a un rival que elijas.') },
  { id: 'resource', icon: '🏦', name: tk('Tomar 1 recurso del banco'), desc: tk('El que tú elijas.') },
  { id: 'road', icon: '🛤️', name: tk('Construir 1 camino gratis'), desc: tk('Sin pagar madera ni ladrillo.') },
  { id: 'dev', icon: '🃏', name: tk('Tomar 1 carta de desarrollo'), desc: tk('No se puede jugar este turno.') },
];

// the fish button in the action bar (own turn, after rolling)
export function fishButtons(st, v, { h, open }) {
  if (!hasFish(st)) return [];
  const p = st.players[v];
  const n = fishCount(p);
  const boot = st.fishermen.boot === v && G.bootReceivers(st, v).length > 0;
  return [h('button', {
    class: 'btn' + (n >= 2 || boot ? ' primary' : ''), 'data-testid': 'fish-open',
    title: t('Gasta tu pescado: 2 ladrón · 3 robar · 4 recurso · 5 camino · 7 carta'), onclick: open,
  }, h('span', { class: 'bicon' }, '🎣'), h('span', null, t('Pescado'), h('span', { class: 'cost' }, `🐟${n}`)))];
}

// the fish panel: perks with their price, then the target/resource choice, then the old boot
export function fishModal(st, v, ui, { h, dispatch, close, refresh }) {
  const p = st.players[v];
  const n = fishCount(p);
  const mine = st.current === v && st.phase === 'main';
  const done = a => { ui.fishStep = null; close(); dispatch(a); };
  const back = h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { ui.fishStep = null; close(); } }, t('Cerrar')));

  if (ui.fishStep === 'steal') {
    const rivals = st.players.filter(o => o.id !== v && !o.retired && G.handSize(o.res) > 0);
    return h('div', { class: 'fish-panel' },
      h('h2', null, t('🫳 ¿A quién le robas? (3 🐟)')),
      h('div', { class: 'chips' }, rivals.map(o => h('button', { class: 'btn', style: { borderColor: o.color }, 'data-testid': 'fish-steal-' + o.id, onclick: () => done({ type: 'spendFish', pid: v, perk: 'steal', target: o.id }) },
        h('span', { class: 'turn-dot', style: { background: o.color } }), t('{name} ({n} cartas)', { name: o.name, n: G.handSize(o.res) })))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { ui.fishStep = null; refresh(); } }, t('← Volver'))));
  }
  if (ui.fishStep === 'resource') {
    return h('div', { class: 'fish-panel' },
      h('h2', null, t('🏦 ¿Qué recurso tomas? (4 🐟)')),
      h('div', { class: 'chips' }, RES.map(r => h('button', { class: 'btn', disabled: st.bank[r] <= 0, 'data-testid': 'fish-res-' + r, onclick: () => done({ type: 'spendFish', pid: v, perk: 'resource', res: r }) },
        `${TILE_INFO[r].icon} ${t(TILE_INFO[r].name)}`))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { ui.fishStep = null; refresh(); } }, t('← Volver'))));
  }

  const row = perk => {
    const cost = FISH_PERKS[perk.id];
    const why = !mine ? tk('Solo en tu turno, después de tirar.') : n < cost ? tk('No tienes suficiente pescado.') : G.fishPerkReason(st, v, perk.id);
    const pick = () => {
      if (perk.id === 'steal' || perk.id === 'resource') {
        ui.fishStep = perk.id; // same panel, now asking who / which resource
        refresh();
        return;
      }
      done({ type: 'spendFish', pid: v, perk: perk.id });
    };
    return h('div', { class: 'fish-perk' + (why ? ' off' : '') },
      h('span', { class: 'fish-cost' }, `${cost}🐟`),
      h('span', { class: 'bicon' }, perk.icon),
      h('span', { class: 'fish-txt' }, h('b', null, t(perk.name)), h('small', null, why ? t(why) : t(perk.desc))),
      h('button', { class: 'btn sm' + (why ? '' : ' primary'), disabled: !!why, 'data-testid': 'fish-' + perk.id, onclick: pick }, t('Pagar')));
  };

  const boot = st.fishermen.boot === v;
  const takers = boot ? G.bootReceivers(st, v) : [];
  return h('div', { class: 'fish-panel' },
    h('h2', null, t('🎣 Tu pescado')),
    h('p', null, t('Tienes {n} peces en {k} fichas. No se devuelve el cambio.', { n, k: p.fish.length })),
    h('div', { class: 'fish-tokens' }, p.fish.length ? [...p.fish].sort((a, b) => b - a).map(x => h('span', { class: 'fish-token f' + x }, '🐟'.repeat(x))) : h('small', null, t('Aún no has pescado nada.'))),
    h('div', { class: 'fish-perks' }, PERKS.map(row)),
    boot ? h('div', { class: 'fish-boot' },
      h('p', null, h('b', null, t('👢 Tienes la bota vieja')), ' ', t('Necesitas 1 punto más para ganar. Puedes pasársela a alguien con tantos puntos como tú o más.')),
      h('div', { class: 'chips' }, takers.length ? takers.map(o => {
        const op = st.players[o];
        return h('button', { class: 'btn', disabled: !mine, style: { borderColor: op.color }, 'data-testid': 'boot-to-' + o, onclick: () => done({ type: 'giveBoot', pid: v, to: o }) },
          h('span', { class: 'turn-dot', style: { background: op.color } }), t('Dar a {name}', { name: op.name }));
      }) : h('small', null, t('Ahora nadie tiene tantos puntos como tú.')))) : null,
    back);
}

// player card: fish tokens (everyone sees how many, you also see your total) and the old boot
export function fishStats(st, p, v, { h }) {
  if (!hasFish(st)) return [];
  const out = [h('span', { title: p.id === v ? t('Fichas de pescado: {n} peces', { n: fishCount(p) }) : t('Fichas de pescado') }, p.id === v ? `🐟 ${p.fish.length}·${fishCount(p)}` : `🐟 ${p.fish.length}`)];
  if (st.fishermen.boot === p.id) out.push(h('span', { class: 'award', title: t('Bota vieja: necesita 1 punto más para ganar') }, '👢 +1'));
  return out;
}

// toasts for fish effects (returns true when the effect is a fish one)
export function fishFx(st, f, v, { toast, rich }) {
  if (f.kind === 'fish') {
    if (f.pid === v) toast(t('🎣 Pescas {n} fichas de pescado', { n: f.n }), 'good');
    return true;
  }
  if (f.kind === 'boot') {
    if (f.pid === v) toast(f.from != null ? rich(t('👢 @{p} te pasó la bota vieja: necesitas 1 punto más', { p: f.from }), st.players) : t('👢 ¡Has pescado la bota vieja! Necesitas 1 punto más para ganar'), 'error');
    else if (f.from === v) toast(rich(t('👢 Le pasaste la bota a @{p}', { p: f.pid }), st.players), 'good');
    return true;
  }
  if (f.kind === 'fishSpent') return true; // the log says it
  return false;
}

// the 💡 hint text for a fish move (undefined for other moves)
export function fishDescribe(a) {
  if (a.type === 'giveBoot') return t('👢 Pasa la bota vieja.');
  if (a.type !== 'spendFish') return undefined;
  const perk = PERKS.find(x => x.id === a.perk);
  return perk ? t('🎣 Gasta {n} peces: {what}.', { n: FISH_PERKS[a.perk], what: t(perk.name) }) : undefined;
}
