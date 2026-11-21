// Cities & Knights pieces of the game screen (gameView.js). Everything here only shows something
// when the game has the expansion on.
import { RES, TILE_INFO } from '../engine/constants.js';
import * as Improve from '../engine/citiesKnights/improvements.js';
import * as Knights from '../engine/citiesKnights/knights.js';
import * as Barb from '../engine/citiesKnights/barbarians.js';
import * as Progress from '../engine/citiesKnights/progress.js';
import * as Science from '../engine/citiesKnights/science.js';
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
  // the barbarians won: pick which of our cities falls back to a settlement
  if (hasCK(st) && st.phase === 'pillage') return st.pillage && st.pillage[v] ? mk('city', st.pillage[v], at => dispatch({ type: 'pillageCity', pid: v, at })) : undefined;
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
  if (hasCK(st) && st.phase === 'pillage' && inter && inter.kind === 'city') return t('🔥 Los bárbaros ganaron: elige la ciudad que vuelve a ser poblado');
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
  if (p.defenderVP) out.push(h('span', { class: 'award', title: t('Defensor de Catan (+1 cada uno)') }, `🛡️×${p.defenderVP}`));
  return out;
}

export function ckDescribe(a) {
  if (!a) return undefined;
  if (a.type === 'improve') return t('🏛️ Mejora {track}.', { track: t(Improve.TRACK_INFO[a.track].name) });
  if (a.type === 'buildWall') return t('🧱 Construye una muralla.');
  if (a.type === 'aqueductPick') return t('🟩 Elige un recurso con el acueducto.');
  if (a.type === 'pillageCity') return t('🏚️ Entrega la ciudad que menos produce.');
  return undefined;
}

// ---------- knights ----------
// ui.pick: 'knight' (recruit) | 'promote' | 'activate' | 'knightAct' (then ui.knightFrom = the knight)
export function knightInteraction(st, v, ui, { mk, dispatch, rerender, canAfford, liveRes }) {
  if (!hasCK(st)) return undefined;
  // a knight of ours was pushed away: put it back
  if (st.phase === 'displace') return st.displaced && st.displaced.pid === v ? mk('settlement', st.displaced.options, at => dispatch({ type: 'placeDisplaced', pid: v, at })) : undefined;
  if (st.current !== v || st.phase !== 'main' || !ui.pick) return undefined;
  if (ui.pick !== 'knightAct') ui.knightFrom = null;
  const again = (cost, a) => {
    if (dispatch(a) && !canAfford(liveRes(), cost)) ui.pick = null;
    rerender();
  };
  if (ui.pick === 'knight') return mk('settlement', Knights.legalRecruits(st, v), at => again(Knights.KNIGHT_COST, { type: 'recruitKnight', pid: v, at }));
  if (ui.pick === 'promote') return mk('settlement', Knights.legalPromotions(st, v), at => again(Knights.KNIGHT_COST, { type: 'promoteKnight', pid: v, at }));
  if (ui.pick === 'activate') return mk('settlement', Knights.legalActivations(st, v), at => again(Knights.ACTIVATE_COST, { type: 'activateKnight', pid: v, at }));
  if (ui.pick === 'knightAct') {
    if (ui.knightFrom == null)
      return mk('settlement', Knights.actors(st, v), k => {
        ui.knightFrom = k;
        rerender();
      });
    const from = ui.knightFrom;
    const tg = Knights.knightTargets(st, v, from);
    return mk('settlement', [...tg.move, ...tg.displace], to => {
      ui.pick = null;
      ui.knightFrom = null;
      dispatch({ type: tg.displace.includes(to) ? 'knightDisplace' : 'knightMove', pid: v, from, to });
    });
  }
  return undefined;
}

export function knightBanner(st, v, ui, inter) {
  if (!hasCK(st) || !inter || inter.kind !== 'settlement') return '';
  if (st.phase === 'displace') return t('🐎 Tu caballero fue expulsado: elige adónde va');
  const txt = {
    knight: t('⚔️ Elige dónde reclutar el caballero (Esc para cancelar)'),
    promote: t('⬆️ Elige qué caballero asciende (Esc para cancelar)'),
    activate: t('🔥 Elige qué caballero activas (Esc para cancelar)'),
    knightAct: ui.knightFrom == null ? t('🐎 Elige qué caballero actúa (Esc para cancelar)') : t('🐎 Elige adónde va (resaltado) o expulsa al ladrón'),
  }[ui.pick];
  return txt || '';
}

// the knights button and, while a knight is chosen next to the robber, the "chase the robber" button
export function knightButtons(st, v, ui, { h, openKnights, dispatch }) {
  if (!hasCK(st)) return [];
  const out = [h('button', { class: 'btn' + (['knight', 'promote', 'activate', 'knightAct'].includes(ui.pick) ? ' active' : ''), 'data-testid': 'knights', onclick: e => { e.stopPropagation(); openKnights(); } },
    h('span', { class: 'bicon' }, '⚔️'), h('span', null, t('Caballeros')))];
  if (ui.pick === 'knightAct' && ui.knightFrom != null && Knights.canChase(st, v, ui.knightFrom))
    out.push(h('button', { class: 'btn pink', 'data-testid': 'knight-chase', onclick: e => {
      e.stopPropagation();
      const from = ui.knightFrom;
      ui.pick = null;
      ui.knightFrom = null;
      dispatch({ type: 'knightChase', pid: v, from });
    } }, t('🛡️ Expulsar al ladrón')));
  return out;
}

// the knights panel: what you can do, with costs and how many pieces are left
export function knightsModal(st, v, ui, { h, close, rerender, costIcons, canAfford }) {
  const p = st.players[v];
  const mine = st.current === v && st.phase === 'main';
  const opt = (pick, icon, label, desc, cost, list) => {
    const can = mine && list.length > 0 && (!cost || canAfford(p.res, cost));
    return h('button', { class: 'btn ck-kopt', disabled: !can, 'data-testid': 'k-' + pick, onclick: () => { ui.pick = pick; ui.knightFrom = null; close(); rerender(); } },
      h('span', { class: 'bicon' }, icon), h('span', null, h('b', null, label), cost ? h('span', { class: 'cost' }, costIcons(cost)) : null, h('small', null, desc)));
  };
  const left = p.knightsLeft;
  return h('div', null,
    h('h2', null, t('⚔️ Caballeros')),
    h('p', null, t('Reserva: básicos {a} · fuertes {b} · poderosos {c} · fuerza activa {f}', { a: left[1], b: left[2], c: left[3], f: Knights.activeStrength(st, v) })),
    h('div', { class: 'ck-kopts' },
      opt('knight', '⚔️', t('Reclutar'), t('Un caballero básico, inactivo, en un cruce libre junto a tu camino.'), Knights.KNIGHT_COST, Knights.legalRecruits(st, v)),
      opt('promote', '⬆️', t('Ascender'), t('Básico → fuerte → poderoso (poderoso: política nivel 3). Uno por caballero y turno.'), Knights.KNIGHT_COST, Knights.legalPromotions(st, v)),
      opt('activate', '🔥', t('Activar'), t('Un caballero activo defiende de los bárbaros y puede actuar desde el turno siguiente.'), Knights.ACTIVATE_COST, Knights.legalActivations(st, v)),
      opt('knightAct', '🐎', t('Actuar'), t('Mover por tus caminos, expulsar a un caballero más débil o al ladrón. Después queda inactivo.'), null, Knights.actors(st, v))),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: close }, t('Cerrar'))));
}

export function knightDescribe(a) {
  if (!a) return undefined;
  return {
    recruitKnight: t('⚔️ Recluta un caballero (resaltado).'),
    promoteKnight: t('⬆️ Asciende un caballero.'),
    activateKnight: t('🔥 Activa un caballero.'),
    knightMove: t('🐎 Mueve un caballero.'),
    knightDisplace: t('🤺 Expulsa a un caballero rival.'),
    knightChase: t('🛡️ Expulsa al ladrón con un caballero.'),
    placeDisplaced: t('🐎 Recoloca tu caballero.'),
  }[a.type];
}

export function knightStats(st, p, { h }) {
  if (!hasCK(st)) return [];
  const n = Knights.knightsOf(st, p.id).length;
  if (!n) return [];
  return [h('span', { title: t('Caballeros (fuerza activa)') }, `⚔️${n} (${Knights.activeStrength(st, p.id)})`)];
}

// ---------- barbarians ----------

// the barbarian ship on its way: step track, plus barbarian strength vs. active knights
export function barbarianTrack(st, h) {
  if (!hasCK(st) || !st.barbarians) return null;
  const b = st.barbarians;
  const barb = Barb.barbarianStrength(st), catan = Barb.catanStrength(st);
  const steps = Array.from({ length: b.track }, (_, i) => h('i', { class: 'barb-step' + (i < b.pos ? ' done' : '') + (i === b.track - 1 ? ' land' : '') }));
  return h('div', {
    class: 'barb-track' + (b.track - b.pos <= 2 ? ' near' : ''),
    'data-testid': 'barbarians',
    title: t('Bárbaros {n}/{t} · fuerza bárbara {b} (ciudades) contra caballeros activos {c}', { n: b.pos, t: b.track, b: barb, c: catan }),
  }, h('span', null, '🏴‍☠️'), h('span', { class: 'barb-steps' }, steps), h('span', { class: 'barb-vs' + (catan >= barb ? ' ok' : ' bad') }, `🏰${barb} ⚔️${catan}`),
  b.attacks ? null : h('span', { class: 'barb-sleep', title: t('El ladrón duerme hasta el primer ataque bárbaro') }, '😴🦹'));
}

// phase text while losers choose their city
export function pillageWaiting(st, v, h) {
  if (st.phase !== 'pillage' || !st.pillage) return null;
  if (st.pillage[v]) return h('div', { class: 'waiting your-turn' }, t('🔥 Toca la ciudad que pierdes'));
  const names = Object.keys(st.pillage).map(pid => st.players[pid].name).join(', ');
  return h('div', { class: 'waiting' }, t('🔥 {names} eligen qué ciudad pierden...', { names }));
}

// ---------- progress cards ----------
export const PROGRESS_COLOR = { trade: '#e8c547', politics: '#4a8fe0', science: '#4fb36a' };

export const progressName = id => t(Progress.PROGRESS_CARDS[id].name);
const trackName = tr => t(Improve.TRACK_INFO[tr].name);

// the cards in your hand, next to the resource cards (they can't be played yet: steps 5b-5d)
export function progressHand(st, v, h, { open, playable = [] }) {
  if (!hasCK(st) || !st.progress) return null;
  const p = st.players[v];
  if (!p.progress.length) return null;
  return h('div', { class: 'devcards progress-hand', 'data-testid': 'progress-hand' }, p.progress.map(id => {
    const c = Progress.PROGRESS_CARDS[id];
    return h('div', { class: 'dcard progcard' + (playable.includes(id) ? ' playable' : ''), style: { boxShadow: `inset 0 -6px 0 ${PROGRESS_COLOR[c.track]}` }, title: `${t(c.name)}: ${t(c.desc)}`, onclick: () => open() }, c.icon);
  }));
}

// the list of your progress cards with what each one does
export function progressModal(st, v, { h, close, playable = [], play }) {
  const p = st.players[v];
  const soon = id => Progress.PROGRESS_CARDS[id].track !== 'science';
  return h('div', null,
    h('h2', null, t('📜 Cartas de progreso')),
    h('p', null, t('Máximo {n} en la mano. Las cartas de punto se revelan al robarlas.', { n: Progress.PROGRESS_HAND })),
    h('div', { class: 'ck-kopts' }, p.progress.map((id, i) => progressCard(id, h, {
      disabled: !playable.includes(id), 'data-testid': 'pplay-' + id,
      title: playable.includes(id) ? t('Jugar') : soon(id) ? t('Pronto se podrán jugar.') : id === 'alchemist' ? t('El alquimista se juega antes de tirar.') : t('Ahora no se puede jugar.'),
      onclick: () => play(id),
    }))),
    p.progressVP ? h('p', null, t('🏆 Puntos por cartas reveladas: {n}', { n: p.progressVP })) : null,
    p.progress.some(soon) ? h('p', { class: 'muted' }, t('Las cartas de comercio y política se podrán jugar pronto.')) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: close }, t('Cerrar'))));
}

const progressCard = (id, h, attrs = {}) => {
  const c = Progress.PROGRESS_CARDS[id];
  return h('button', { class: 'btn ck-kopt pcard-opt', style: { boxShadow: `inset 6px 0 0 ${PROGRESS_COLOR[c.track]}` }, ...attrs },
    h('span', { class: 'bicon' }, c.icon), h('span', null, h('b', null, t(c.name)), h('small', null, `${trackName(c.track)} · ${t(c.desc)}`)));
};

// forced choices: tied defenders pick a deck; players over the limit drop a card
export function progressPickModal(st, v, { h, dispatch }) {
  return h('div', null,
    h('h2', null, t('🛡️ Defensor empatado')),
    h('p', null, t('Elige de qué mazo robas una carta de progreso.')),
    h('div', { class: 'ck-kopts' }, Progress.PROGRESS_TRACKS.map(tr => h('button', {
      class: 'btn ck-kopt', disabled: !st.progress[tr].length, style: { boxShadow: `inset 6px 0 0 ${PROGRESS_COLOR[tr]}` }, 'data-testid': 'pick-' + tr,
      onclick: () => dispatch({ type: 'progressPick', pid: v, track: tr }),
    }, h('span', { class: 'bicon' }, Improve.TRACK_INFO[tr].icon || '📜'), h('span', null, h('b', null, trackName(tr)), h('small', null, t('{n} cartas', { n: st.progress[tr].length })))))));
}

export function progressDiscardModal(st, v, { h, dispatch }) {
  const p = st.players[v];
  return h('div', null,
    h('h2', null, t('🗑️ Demasiadas cartas de progreso')),
    h('p', null, t('Solo puedes tener {n}: descarta una (vuelve bajo su mazo).', { n: Progress.PROGRESS_HAND })),
    h('div', { class: 'ck-kopts' }, p.progress.map((id, i) => progressCard(id, h, { 'data-testid': 'pdrop-' + i, onclick: () => dispatch({ type: 'progressDiscard', pid: v, card: id }) }))));
}

export function progressWaiting(st, v, h) {
  if (st.phase === 'progressPick') {
    const mine = st.progressPick && st.progressPick.includes(v);
    return h('div', { class: 'waiting' + (mine ? ' your-turn' : '') }, mine ? t('🛡️ Elige un mazo de progreso') : t('🛡️ Los defensores empatados eligen carta...'));
  }
  if (st.phase === 'progressDiscard') {
    const mine = st.progressDiscard && st.progressDiscard[v];
    return h('div', { class: 'waiting' + (mine ? ' your-turn' : '') }, mine ? t('🗑️ Descarta una carta de progreso') : t('🗑️ Esperando descartes de progreso...'));
  }
  return null;
}

// player card: progress cards in hand (count only) and revealed VP
export function progressStats(st, p, { h }) {
  if (!hasCK(st) || !st.progress) return [];
  const out = [h('span', { title: t('Cartas de progreso') }, `📜 ${p.progress.length}`)];
  if (p.progressVP) out.push(h('span', { class: 'award', title: t('Cartas de punto reveladas') }, `🏆×${p.progressVP}`));
  return out;
}

// bank row: what is left in each deck
export function progressDecks(st, h) {
  if (!hasCK(st) || !st.progress) return [];
  return Progress.PROGRESS_TRACKS.map(tr => h('span', { class: 'pdeck', style: { color: PROGRESS_COLOR[tr] }, title: t('Mazo de progreso: {track}', { track: trackName(tr) }) }, `📜${st.progress[tr].length}`));
}

export function progressDescribe(a) {
  if (!a) return undefined;
  if (a.type === 'playProgress') return t('{icon} Juega {card}.', { icon: Progress.PROGRESS_CARDS[a.card].icon, card: progressName(a.card) });
  if (a.type === 'progressPick') return t('📜 Roba del mazo {track}.', { track: trackName(a.track) });
  if (a.type === 'progressDiscard') return t('🗑️ Descarta {card}.', { card: progressName(a.card) });
  return undefined;
}

// ---------- playing progress cards (science) ----------
// ui.pick: 'prog:inventor' | 'prog:engineer' | 'prog:medicine' | 'prog:smith'; ui.progSel = chosen ids
const PICK_CARDS = ['inventor', 'engineer', 'medicine', 'smith'];

// start playing a card: direct ones go at once, the others ask for a target first
export function startProgress(st, v, id, ui, { dispatch, rerender, openDice }) {
  if (id === 'alchemist') return openDice();
  if (PICK_CARDS.includes(id)) {
    ui.pick = 'prog:' + id;
    ui.progSel = [];
    return rerender();
  }
  dispatch({ type: 'playProgress', pid: v, card: id });
}

export function progressInteraction(st, v, ui, { mk, dispatch, rerender, legalCities }) {
  if (!hasCK(st) || st.current !== v || st.phase !== 'main' || !ui.pick || !ui.pick.startsWith('prog:')) return undefined;
  const id = ui.pick.slice(5);
  const sel = (ui.progSel ||= []);
  const done = a => {
    ui.pick = null;
    ui.progSel = [];
    dispatch({ type: 'playProgress', pid: v, card: id, ...a });
  };
  if (id === 'inventor')
    return mk('robber', Science.inventorTiles(st).filter(x => !sel.includes(x)), tile => {
      sel.push(tile);
      if (sel.length === 2) done({ tiles: [...sel] });
      else rerender();
    });
  if (id === 'engineer') return mk('city', Science.engineerSpots(st, v), at => done({ at }));
  if (id === 'medicine') return mk('city', legalCities(st, v), at => done({ at }));
  if (id === 'smith')
    return mk('settlement', Knights.legalPromotions(st, v).filter(x => !sel.includes(x) && !Science.smithBlock(st, v, [...sel, x])), k => {
      sel.push(k);
      if (sel.length === Science.SMITH_FREE) done({ knights: [...sel] });
      else rerender();
    });
  return undefined;
}

export function progressBanner(st, ui, inter) {
  if (!hasCK(st) || !inter || !ui.pick || !ui.pick.startsWith('prog:')) return '';
  const n = (ui.progSel || []).length;
  return {
    inventor: n ? t('💡 Elige la segunda ficha (Esc para cancelar)') : t('💡 Elige la primera ficha a intercambiar (ni 2, 12, 6 ni 8)'),
    engineer: t('📐 Elige la ciudad de la muralla gratis (Esc para cancelar)'),
    medicine: t('💊 Elige el poblado que pasa a ciudad (Esc para cancelar)'),
    smith: n ? t('🔨 Elige otro caballero o pulsa Listo') : t('🔨 Elige hasta 2 caballeros para ascender gratis (Esc para cancelar)'),
  }[ui.pick.slice(5)] || '';
}

// smith with one knight chosen: finish without a second one
export function progressButtons(st, v, ui, { h, dispatch }) {
  if (!hasCK(st) || ui.pick !== 'prog:smith' || !(ui.progSel || []).length) return [];
  return [h('button', { class: 'btn green', 'data-testid': 'smith-done', onclick: e => {
    e.stopPropagation();
    const knights = [...ui.progSel];
    ui.pick = null;
    ui.progSel = [];
    dispatch({ type: 'playProgress', pid: v, card: 'smith', knights });
  } }, t('✔️ Listo'))];
}

// Alchemist: pick both number dice (the event die is still rolled)
export function alchemistModal(st, v, ui, { h, dispatch, close, rerender }) {
  const d = (ui.alch ||= [3, 4]);
  const row = (i, label) => h('div', { class: 'alch-row' }, h('b', null, label), [1, 2, 3, 4, 5, 6].map(n => h('button', {
    class: 'btn sm' + (d[i] === n ? ' active' : ''), 'data-testid': `alch-${i}-${n}`, onclick: () => { d[i] = n; rerender(); },
  }, String(n))));
  return h('div', null,
    h('h2', null, t('⚗️ Alquimista')),
    h('p', null, t('Elige qué sale en los dados de números. El dado de evento se tira normal.')),
    row(0, t('Dado blanco')), row(1, t('Dado rojo')),
    h('p', null, t('Total: {n}', { n: d[0] + d[1] })),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: close }, t('Cancelar')),
      h('button', { class: 'btn primary', 'data-testid': 'alch-go', onclick: () => { close(); dispatch({ type: 'playProgress', pid: v, card: 'alchemist', dice: [...d] }); } }, t('⚗️ Tirar así'))));
}
