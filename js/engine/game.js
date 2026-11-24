// Pure rules engine. The whole game is one JSON-serializable state object that is
// mutated only through applyAction(). No DOM access here: it runs in Node for tests.
import { RES, COSTS, DEV_DECKS, EVENTS, TILE_INFO, DEV_INFO } from './constants.js';
import { rand, randInt, shuffle, pick } from './rng.js';
import { generateBoard } from './board.js';
import { normalizeExpansions, seafarersOn, citiesKnightsOn, tradersBarbariansOn, tbScenarioOn } from './expansions.js';
import { TB_SCENARIOS } from './tradersBarbarians/scenarios.js';
import * as Fish from './tradersBarbarians/fishermen.js';
import * as Rivers from './tradersBarbarians/rivers.js';
import * as Caravans from './tradersBarbarians/caravans.js';
import * as BarbAttack from './tradersBarbarians/barbarianAttack.js';
import * as Traders from './tradersBarbarians/traders.js';
import * as Ships from './seafarers/ships.js';
import { legalPirateTiles, pirateVictims } from './seafarers/pirate.js';
import * as Islands from './seafarers/islands.js';
import { COMMODITIES, EVENT_FACES, cardsOf, initCommodities, cityYield } from './citiesKnights/commodities.js';
import * as Improve from './citiesKnights/improvements.js';
import * as Knights from './citiesKnights/knights.js';
import * as Barb from './citiesKnights/barbarians.js';
import * as Progress from './citiesKnights/progress.js';
import * as Science from './citiesKnights/science.js';
import * as TradeCards from './citiesKnights/tradeCards.js';
import * as Politics from './citiesKnights/politics.js';

export const zeroRes = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
// every card in a hand: resources, plus Cities & Knights commodities (absent in the base game)
const ALL_CARDS = [...RES, ...COMMODITIES];
export const handSize = h => ALL_CARDS.reduce((a, r) => a + (h[r] || 0), 0);
// an empty hand with a slot for every card of this game (base game: the 5 resources)
const blankHand = s => Object.fromEntries(cardsOf(s).map(r => [r, 0]));
export const canAfford = (h, cost) => Object.entries(cost).every(([r, n]) => (h[r] || 0) >= n);
const resName = r => `:${r}:`;

// messages (history and errors) travel as a Spanish template plus its values, and every client
// translates them into its own language (see js/i18n.js)
const msg = (t, p) => ({ t, p });

class GameError extends Error {
  constructor(m) {
    super(typeof m === 'string' ? m : m.t);
    this.m = m;
  }
}
class Blocked extends Error {}
const fail = m => {
  throw new GameError(m);
};

function log(s, msg, pid = -1) {
  s.log.push({ turn: s.turn, pid, msg });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function buildDevDeck(config, n, rng) {
  const d = DEV_DECKS[config.rules.devDeck] || DEV_DECKS.normal;
  const extra = n > 6 ? 2 : n > 4 ? 1 : 0; // 5-6 and 7-8 player expansions
  const deck = [];
  const add = (type, k) => { for (let i = 0; i < k; i++) deck.push(type); };
  add('knight', d.knight + (d.knight ? 6 * extra : 0));
  add('vp', d.vp + (d.vp && extra > 1 ? 1 : 0));
  add('roadBuilding', d.roadBuilding + (d.roadBuilding ? extra : 0));
  add('yearOfPlenty', d.yearOfPlenty + (d.yearOfPlenty ? extra : 0));
  add('monopoly', d.monopoly + (d.monopoly ? extra : 0));
  return shuffle(rng, deck);
}

export function createGame(configIn) {
  const config = JSON.parse(JSON.stringify(configIn));
  normalizeExpansions(config); // older configs have no expansions block: all off
  const R = config.rules, M = config.modes;
  const rng = { s: (config.seed >>> 0) || 12345 };
  const n = config.players.length;
  const board = generateBoard(config, rng);
  const bankEach = n > 6 ? 30 : n > 4 ? 24 : 19;
  const s = {
    v: 1,
    config,
    rng,
    board,
    players: config.players.map((p, i) => ({
      id: i, name: p.name, color: p.color, kind: p.kind, level: p.level || 'normal', flag: p.flag || null, style: p.style || null, retired: false,
      res: zeroRes(), dev: [], knights: 0, roadLen: 0,
      roadsLeft: R.maxRoads, settlementsLeft: R.maxSettlements, citiesLeft: R.maxCities,
      stats: { gained: 0, stolen: 0, lost: 0 },
      adhdWins: 0,
    })),
    buildings: {},
    roads: {},
    blind: [],
    bank: Object.fromEntries(RES.map(r => [r, bankEach])),
    bankTotal: bankEach,
    devDeck: [],
    devTotal: 0,
    phase: 'setup',
    current: 0,
    first: 0,
    turn: 0,
    round: 0,
    setup: null,
    dice: null,
    diceDeck: [],
    pendingDiscards: {},
    robberReturn: 'main',
    freeRoads: 0,
    devPlayed: false,
    trade: null,
    tradeSeq: 0,
    longestRoad: { owner: -1, len: 0 },
    largestArmy: { owner: -1, count: 0 },
    event: null,
    winner: null,
    log: [],
    fx: [],
    stats: { rolls: Array(13).fill(0) },
    rollLog: [],
    actions: 0,
  };
  s.devDeck = buildDevDeck(config, n, rng);
  s.devTotal = s.devDeck.length;
  if (config.rules.harbormaster) s.harbormaster = { owner: -1, count: 0 }; // Harbormaster variant (base games never get this key)
  if (seafarersOn(s)) {
    Ships.initShips(s);
    Islands.initIslands(s);
  }
  if (citiesKnightsOn(s)) {
    initCommodities(s);
    Improve.initImprovements(s);
    Knights.initKnights(s);
    Barb.initBarbarians(s);
    Progress.initProgress(s);
    TradeCards.initTradeCards(s);
    s.devDeck = []; // progress cards replace the development cards
    s.devTotal = 0;
  }
  if (tbScenarioOn(s) === 'fishermen') Fish.initFishermen(s, rng);
  if (tbScenarioOn(s) === 'rivers') Rivers.initRivers(s);
  if (tbScenarioOn(s) === 'caravans') Caravans.initCaravans(s);
  if (tbScenarioOn(s) === 'barbarianAttack') BarbAttack.initBarbarianAttack(s);
  if (tbScenarioOn(s) === 'tradersBarbarians') Traders.initTraders(s);

  if (M.flipped) {
    // Volteado: every tile starts face down until the initial placement ends
    for (const t of board.tiles) t.revealed = t.numRevealed = false;
  } else if (M.hiddenNumbers) {
    for (const t of board.tiles) t.numRevealed = false;
  }

  if (R.startBonus > 0)
    for (const p of s.players)
      for (const r of RES) {
        const k = Math.min(R.startBonus, s.bank[r]);
        p.res[r] += k;
        s.bank[r] -= k;
      }

  s.first = R.randomStart ? randInt(rng, n) : 0;
  const order = [...Array(n).keys()].map(i => (i + s.first) % n);
  const queue = [];
  for (let round = 0; round < R.setupRounds; round++) {
    const o = round % 2 === 0 ? order : [...order].reverse();
    for (const pid of o) queue.push({ pid, round });
  }
  s.setup = { queue, idx: 0, step: 'settlement', lastVid: null, blindActive: !!M.blindfold, lastRound: R.setupRounds - 1, fixing: false };
  s.current = queue[0].pid;
  log(s, msg('¡Empieza la partida! Mapa: {n} hexágonos.', { n: board.tiles.length }));
  if (M.flipped) log(s, '🔄 Tablero volteado: coloca tus casas sin saber qué hay debajo.');
  if (M.blindfold) log(s, '🤫 Casas secretas: nadie ve dónde pones hasta la revelación.');
  if (M.fog) log(s, '🌑 Niebla de guerra: solo ves lo que rodea a tus piezas.');
  if (seafarersOn(s)) log(s, '⛵ Expansión Navegantes activada.');
  if (citiesKnightsOn(s)) log(s, '🏰 Expansión Ciudades y Caballeros activada.');
  if (tradersBarbariansOn(s)) log(s, msg('🐟 Expansión Mercaderes y Bárbaros activada: {n}.', { n: TB_SCENARIOS[tbScenarioOn(s)].name }));
  if (s.barbAttack) {
    log(s, msg('🏰 Un castillo en la costa; {n} casillas costeras vigilan el mar. {k} bárbaros acechan.', { n: board.coast.length, k: BarbAttack.BARBARIANS }));
    log(s, '🛡️ Compra cartas para armar caballeros: rodea a los bárbaros para expulsarlos y hacerlos prisioneros.');
  }
  if (s.traders) {
    log(s, msg('🛒 Castillo, cantera y vidriería esperan mercancías; {n} bárbaros cortan los caminos. Cada jugador empieza con {g} de oro.', { n: s.traders.barbarians.length, g: Traders.START_GOLD }));
    log(s, '🛒 Lleva mercancías con tu carromato entre las plazas: cada entrega da 1 punto y oro.');
  }
  if (s.caravans) log(s, msg('🐪 Un oasis en el centro: {n} caravanas y {k} camellos esperan.', { n: board.caravanStarts.length, k: Caravans.CAMELS }));
  if (s.rivers) {
    log(s, msg('🏞️ {n} ríos y {m} pantanos; {k} sitios para puentes.', { n: board.rivers.length, m: board.marsh.length, k: board.bridgeSpots.length }));
  }
  if (s.fishermen) {
    if (board.lake >= 0) log(s, '🏞️ Un lago sustituye al desierto: da pescado con 2, 3, 11 y 12.');
    else log(s, '🏞️ Sin desierto en este mapa: no hay lago.');
    log(s, msg('🎣 {n} caladeros en la costa: {nums}.', { n: board.fishing.length, nums: board.fishing.map(f => f.num).sort((a, b) => a - b).join(', ') }));
  }
  return s;
}

// ---------------- queries ----------------
export const B = s => s.board;

// ---- Fog of war: per-player vision ----
// Houses light a circle that covers the three surrounding tiles; roads light a
// half-tile band on each side (you see the terrain but not the number token).
export const VISION = { house: 1.25, road: 0.55 };

export function visionOf(s, pid) {
  const bd = s.board;
  const circles = [], caps = [];
  const house = v => circles.push([bd.vertices[v].x, bd.vertices[v].y, VISION.house]);
  const road = e => {
    const E = bd.edges[e], a = bd.vertices[E.a], b = bd.vertices[E.b];
    caps.push([a.x, a.y, b.x, b.y, VISION.road]);
  };
  for (const k in s.buildings) if (s.buildings[k].owner === pid) house(+k);
  for (const k in s.roads) if (s.roads[k] === pid) road(+k);
  for (const b of s.blind || []) if (b.pid === pid) {
    house(b.vid);
    if (b.eid != null) road(b.eid);
  }
  return { circles, caps };
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// how deep (x,y) lies inside the lit area (> 0 means visible)
export function visibility(vis, x, y) {
  let best = -Infinity;
  for (const [cx, cy, r] of vis.circles) best = Math.max(best, r - Math.hypot(x - cx, y - cy));
  for (const [x1, y1, x2, y2, r] of vis.caps) best = Math.max(best, r - segDist(x, y, x1, y1, x2, y2));
  return best;
}

// What `pid` knows: other players' pieces outside their vision are removed and
// unseen tiles are marked hidden. Used by the UI and by bots (so they don't cheat).
export function viewFor(s, pid) {
  if (!s.config.modes.fog || pid == null || pid < 0 || s.phase === 'gameOver') return s;
  const vis = visionOf(s, pid);
  const bd = s.board;
  const buildings = {}, roads = {};
  const disc = (s.discovered && s.discovered[pid]) || { v: [], e: [] };
  for (const k in s.buildings) {
    const b = s.buildings[k], V = bd.vertices[k];
    if (b.owner === pid || visibility(vis, V.x, V.y) > 0 || disc.v.includes(+k)) buildings[k] = b;
  }
  for (const k in s.roads) {
    const E = bd.edges[k], a = bd.vertices[E.a], c = bd.vertices[E.b];
    if (s.roads[k] === pid || visibility(vis, (a.x + c.x) / 2, (a.y + c.y) / 2) > 0 || disc.e.includes(+k)) roads[k] = s.roads[k];
  }
  const tiles = bd.tiles.map(t => {
    const lit = visibility(vis, t.x, t.y);
    return { ...t, revealed: t.revealed && lit > -0.86, numRevealed: t.numRevealed && lit > 0 };
  });
  const robberSeen = bd.robber >= 0 && tiles[bd.robber].numRevealed;
  return { ...s, buildings, roads, board: { ...bd, tiles, robberHidden: !robberSeen }, vision: vis };
}

export function victoryPoints(s, pid, hidden = true) {
  let vp = 0;
  for (const k in s.buildings) {
    const b = s.buildings[k];
    if (b.owner === pid && !(s.barbAttack && BarbAttack.buildingConquered(s, +k))) vp += b.type === 'city' ? 2 : 1; // Barbarian Attack: conquered buildings score nothing
  }
  if (s.longestRoad.owner === pid) vp += 2;
  if (s.largestArmy.owner === pid) vp += 2;
  if (hidden) vp += s.players[pid].dev.filter(c => c.type === 'vp').length;
  vp += s.players[pid].islandVP || 0; // Seafarers island bonus (absent in the base game)
  vp += Improve.metropolisVP(s, pid); // Cities & Knights metropolises (none in the base game)
  vp += s.players[pid].defenderVP || 0; // Cities & Knights Defender of Catan (absent in the base game)
  vp += s.players[pid].progressVP || 0; // Cities & Knights printer / constitution
  if (s.merchant) vp += TradeCards.merchantVP(s, pid); // Cities & Knights merchant piece
  if (s.rivers) vp += Rivers.wealthVP(s, pid); // Rivers: Wealthiest Settler +1 / Poor Settler -2
  if (s.barbAttack) vp += BarbAttack.prisonerVP(s.players[pid]); // Barbarian Attack: 2 prisoners = 1 VP
  if (s.traders) vp += Traders.wagonVP(s, pid); // Traders & Barbarians: deliveries + the last wagon upgrade
  if (s.harbormaster && s.harbormaster.owner === pid) vp += HARBORMASTER_VP; // Harbormaster variant
  if (s.caravans) vp += Caravans.camelVP(s, pid); // Caravans: buildings between two camels +1
  return vp;
}

export function tradeRatio(s, pid, res) {
  let best = 4;
  // Cities & Knights trading house (trade level 3): commodities 2:1
  if (COMMODITIES.includes(res) && Improve.commodityRatio(s, pid)) best = Improve.commodityRatio(s, pid);
  if (s.progress && TradeCards.cardRatio(s, pid, res)) best = Math.min(best, TradeCards.cardRatio(s, pid, res)); // merchant / merchant fleet
  if (s.event && s.event.id === 'fairTrade') best = 3;
  if (s.event && s.event.id === 'blackMarket' && s.event.res === res) best = 2;
  for (const k in s.buildings) {
    if (s.buildings[k].owner !== pid) continue;
    if (s.barbAttack && BarbAttack.buildingConquered(s, +k)) continue; // Barbarian Attack: no harbour for a conquered building
    const port = s.board.vertices[k].port;
    if (port === null || port === undefined) continue;
    const p = s.board.ports[port];
    if (p.type === 'any') best = Math.min(best, 3);
    else if (p.type === res) best = Math.min(best, 2);
  }
  return best;
}

function ownBlind(s, pid) {
  const own = s.blind.filter(b => b.pid === pid);
  return { verts: new Set(own.map(b => b.vid)), edges: new Set(own.filter(b => b.eid != null).map(b => b.eid)) };
}

// Settlements and roads need land. Base boards only have land vertices and edges, so these
// checks never fail there; with Seafarers they keep buildings off the open sea.
const onLand = (s, v) => s.board.vertices[v].hexes.length > 0;
const landEdge = (s, e) => s.board.edges[e].hexes.length > 0;
const hasShip = (s, e) => !!s.ships && s.ships[e] !== undefined; // Seafarers only

function vertexOpen(s, v) {
  if (s.buildings[v] || !onLand(s, v) || (s.knights && s.knights[v])) return false; // C&K: no building on a knight
  if (s.barbAttack && BarbAttack.vertexBlocked(s, v)) return false; // Barbarian Attack: not next to a conquered hex
  if (s.traders && Traders.vertexBlocked(s, v)) return false; // Traders & Barbarians: not on a trade hex's sea corner
  return !s.board.vertices[v].adj.some(u => s.buildings[u]);
}

export function canSetupSettlement(s, pid, v) {
  if (!s.board.vertices[v] || !onLand(s, v) || !Islands.setupAllowed(s, v)) return false;
  if (s.setup.blindActive) {
    const { verts } = ownBlind(s, pid);
    if (verts.has(v)) return false;
    return !s.board.vertices[v].adj.some(u => verts.has(u));
  }
  return vertexOpen(s, v) && s.board.vertices[v].edges.some(e => s.roads[e] === undefined);
}

export function canSetupRoad(s, pid, e) {
  const E = s.board.edges[e];
  if (!E || !landEdge(s, e) || hasShip(s, e) || (E.a !== s.setup.lastVid && E.b !== s.setup.lastVid)) return false;
  if (s.rivers && Rivers.isCrossing(s.board, e)) return false; // Rivers: never across the water
  if (s.barbAttack && BarbAttack.edgeBlocked(s, e)) return false; // Barbarian Attack: not along a conquered hex
  if (s.traders && Traders.edgeBlocked(s, e)) return false; // Traders & Barbarians: closed sea side / barbarian
  if (s.setup.blindActive) return !ownBlind(s, pid).edges.has(e);
  return s.roads[e] === undefined;
}

export function canBuildRoad(s, pid, e) {
  const E = s.board.edges[e];
  if (!E || s.roads[e] !== undefined || !landEdge(s, e) || hasShip(s, e)) return false;
  if (s.rivers && Rivers.isCrossing(s.board, e)) return false; // Rivers: only bridges cross the water
  if (s.barbAttack && BarbAttack.edgeBlocked(s, e)) return false; // Barbarian Attack: not along a conquered hex
  if (s.traders && Traders.edgeBlocked(s, e)) return false; // Traders & Barbarians: closed sea side / barbarian
  for (const v of [E.a, E.b]) {
    const b = s.buildings[v];
    if (b && b.owner === pid) return true;
    if (b) continue; // opponent building blocks continuing through this vertex
    if (s.knights && s.knights[v] && s.knights[v].owner !== pid) continue; // C&K: so does a rival knight
    if (s.board.vertices[v].edges.some(x => x !== e && s.roads[x] === pid)) return true;
  }
  return false;
}

export function canBuildSettlement(s, pid, v) {
  if (!s.board.vertices[v] || !vertexOpen(s, v)) return false;
  // a road reaches it, or (Seafarers) a ship lands there
  return s.board.vertices[v].edges.some(e => s.roads[e] === pid || (!!s.ships && s.ships[e] === pid));
}

export const canBuildCity = (s, pid, v) => {
  const b = s.buildings[v];
  return !!b && b.owner === pid && b.type === 'settlement';
};

export function legalSetupSettlements(s, pid) {
  return s.board.vertices.filter(v => canSetupSettlement(s, pid, v.id)).map(v => v.id);
}
export function legalSetupRoads(s, pid) {
  const v = s.board.vertices[s.setup.lastVid];
  return v ? v.edges.filter(e => canSetupRoad(s, pid, e)) : [];
}
export function legalRoads(s, pid) {
  return s.board.edges.filter(e => canBuildRoad(s, pid, e.id)).map(e => e.id);
}
export function legalSettlements(s, pid) {
  return s.board.vertices.filter(v => canBuildSettlement(s, pid, v.id)).map(v => v.id);
}
export function legalCities(s, pid) {
  return Object.keys(s.buildings).map(Number).filter(v => canBuildCity(s, pid, v));
}

function friendlyProtected(s, pid) {
  return s.config.rules.friendlyRobber && victoryPoints(s, pid, false) <= 2;
}

export function robberVictims(s, pid, tile) {
  const t = s.board.tiles[tile];
  if (!t) return [];
  const out = new Set();
  for (const v of t.verts) {
    const b = s.buildings[v];
    if (b && b.owner !== pid && handSize(s.players[b.owner].res) > 0) out.add(b.owner);
  }
  return [...out];
}

export const stealTargets = (s, pid, tile) => robberVictims(s, pid, tile).filter(v => !friendlyProtected(s, v));

// Seafarers: who the pirate can rob from a sea tile (same friendly-robber protection)
export const pirateTargets = (s, pid, tile) => pirateVictims(s, pid, tile, handSize).filter(v => !friendlyProtected(s, v));
export { legalPirateTiles };

export function legalRobberTiles(s, pid) {
  const all = s.board.tiles.filter(t => t.id !== s.board.robber && !(s.caravans && t.oasis)).map(t => t.id); // Caravans: never on the oasis
  if (!s.config.rules.friendlyRobber) return all;
  const ok = all.filter(id =>
    !s.board.tiles[id].verts.some(v => {
      const b = s.buildings[v];
      return b && b.owner !== pid && friendlyProtected(s, b.owner);
    })
  );
  return ok.length ? ok : all;
}

export function playableDev(s, pid) {
  if (s.devPlayed) return [];
  const p = s.players[pid];
  const types = new Set();
  for (const c of p.dev) {
    if (c.type === 'vp' || c.turn >= s.turn) continue;
    if (s.phase === 'main' || (s.phase === 'roll' && c.type === 'knight')) types.add(c.type);
  }
  return [...types];
}

// Which players must act right now.
export function pendingActors(s) {
  if (s.phase === 'gameOver') return [];
  if (s.phase === 'setup') return [s.setup.queue[s.setup.idx].pid];
  if (s.phase === 'discard') return Object.keys(s.pendingDiscards).map(Number).filter(pid => !s.players[pid].retired);
  if (s.phase === 'aqueduct') return Object.keys(s.pendingAqueduct).map(Number).filter(pid => !s.players[pid].retired);
  if (s.phase === 'displace') return s.displaced ? [s.displaced.pid] : [];
  if (s.phase === 'progressPick') return (s.progressPick || []).filter(pid => !s.players[pid].retired);
  if (s.phase === 'progressDiscard') return s.progressDiscard ? Object.keys(s.progressDiscard).map(Number).filter(pid => !s.players[pid].retired) : [];
  if (s.phase === 'deserter') return s.deserter ? [s.deserter.victim] : [];
  if (s.phase === 'deserterPlace') return s.deserter ? [s.deserter.from] : [];
  if (s.phase === 'wedding') return s.wedding ? Object.keys(s.wedding.pending).map(Number).filter(pid => !s.players[pid].retired) : [];
  if (s.phase === 'harbor') return s.harbor ? Object.keys(s.harbor.pending).map(Number).filter(pid => !s.players[pid].retired) : [];
  if (s.phase === 'pillage') return s.pillage ? Object.keys(s.pillage).map(Number).filter(pid => !s.players[pid].retired) : [];
  if (s.phase === 'caravanVote') return [s.caravans.vote.order[s.caravans.vote.idx]]; // Caravans: one voter at a time
  if (s.phase === 'caravanPick') return [s.caravans.vote.decider];
  if (s.phase === 'baCard') return [s.current]; // Barbarian Attack: resolve the card just bought
  if (s.phase === 'tbBarbarian') return [s.current]; // Traders & Barbarians: move a barbarian
  const out = [s.current];
  if (s.trade) for (const pid of s.trade.to) if (s.trade.responses[pid] == null && !s.players[pid].retired) out.push(pid);
  return out;
}

// ---------------- internal helpers ----------------
function pay(s, pid, cost) {
  const p = s.players[pid];
  for (const [r, k] of Object.entries(cost)) {
    p.res[r] -= k;
    s.bank[r] += k;
  }
}

function giveFromBank(s, pid, r, k) {
  const g = Math.min(k, s.bank[r]);
  s.bank[r] -= g;
  s.players[pid].res[r] += g;
  s.players[pid].stats.gained += g;
  return g;
}

function revealAround(s, v) {
  if (s.config.modes.flipped && s.phase === 'setup') return;
  for (const h of s.board.vertices[v].hexes) {
    const t = s.board.tiles[h];
    if (t.fog && !t.revealed) continue; // Seafarers fog lifts by exploring (Islands.explore), not by building near it
    if (!t.revealed || !t.numRevealed) {
      t.revealed = t.numRevealed = true;
      s.fx.push({ kind: 'revealTile', tile: h });
    }
  }
}

// Longest road. With Seafarers roads and ships make one trade route, but switching between
// road and ship needs one of your own buildings at that corner (base game: no ships, no switch).
// Seafarers fog: a road or ship on edge e uncovers the fog around it (land pays one card)
function exploreFrom(s, pid, e) {
  for (const f of Islands.explore(s, pid, e, r => giveFromBank(s, pid, r, 1))) {
    if (f.kind === 'land') {
      s.fx.push({ kind: 'revealTile', tile: f.tile });
      log(s, f.res ? msg('🌫️ @{p} descubre tierra y se lleva {r}.', { p: pid, r: resName(f.res) }) : msg('🌫️ @{p} descubre un desierto.', { p: pid }), pid);
    } else {
      s.fx.push({ kind: 'revealSea', sea: f.sea });
      log(s, msg('🌫️ @{p} descubre mar abierto.', { p: pid }), pid);
    }
  }
}

function roadLength(s, pid) {
  const bd = s.board;
  const ships = s.ships || {};
  const isShip = e => ships[e] === pid;
  const mine = e => s.roads[e] === pid || isShip(e);
  const starts = new Set();
  for (const k of [...Object.keys(s.roads), ...Object.keys(ships)]) if (mine(k)) {
    starts.add(bd.edges[k].a);
    starts.add(bd.edges[k].b);
  }
  if (!starts.size) return 0;
  let best = 0;
  const used = new Set();
  const blocked = v => {
    const b = s.buildings[v];
    if (s.knights && s.knights[v] && s.knights[v].owner !== pid) return true; // C&K: rival knights cut it too
    return b && b.owner !== pid;
  };
  const ownHere = v => s.buildings[v] && s.buildings[v].owner === pid;
  const dfs = (v, len, lastShip) => {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return;
    for (const e of bd.vertices[v].edges) {
      if (!mine(e) || used.has(e)) continue;
      if (len > 0 && isShip(e) !== lastShip && !ownHere(v)) continue;
      used.add(e);
      const E = bd.edges[e];
      dfs(E.a === v ? E.b : E.a, len + Caravans.roadWeight(s, e), isShip(e)); // Caravans: a camel path counts 2 (1 otherwise)
      used.delete(e);
    }
  };
  for (const v of starts) dfs(v, 0, false);
  return best;
}

function updateLongestRoad(s) {
  if (s.traders) { for (const p of s.players) p.roadLen = p.retired ? 0 : roadLength(s, p.id); return; } // Traders & Barbarians: no Longest Road card
  const lens = s.players.map(p => (p.roadLen = p.retired ? 0 : roadLength(s, p.id)));
  const cur = s.longestRoad.owner;
  const max = Math.max(...lens);
  let owner;
  if (cur >= 0 && lens[cur] >= 5 && lens[cur] === max) owner = cur;
  else {
    const top = lens.map((l, i) => i).filter(i => lens[i] === max);
    owner = max >= 5 && top.length === 1 ? top[0] : -1;
  }
  if (owner !== cur) {
    if (owner >= 0) {
      log(s, msg('🛣️ @{p} consigue el Camino más largo ({n}).', { p: owner, n: max }), owner);
      s.fx.push({ kind: 'award', what: 'road', pid: owner });
    } else log(s, '🛣️ Nadie tiene el Camino más largo ahora.');
  }
  s.longestRoad = { owner, len: owner >= 0 ? lens[owner] : 0 };
}

// ---- Harbormaster variant (config.rules.harbormaster): settlement at a harbour = 1 harbour point,
// city = 2; the most points (3 or more) hold the Harbormaster card (2 VP). The holder keeps it on a
// tie; when someone else leads alone it moves, and a tie for the lead without the holder sets it aside.
export const HARBORMASTER_VP = 2;
export const HARBORMASTER_MIN = 3;
export function harborPoints(s, pid) {
  let n = 0;
  for (const v in s.buildings) {
    const b = s.buildings[v];
    if (b.owner !== pid || s.board.vertices[v].port == null) continue;
    if (s.barbAttack && BarbAttack.buildingConquered(s, +v)) continue; // Barbarian Attack: a conquered harbour doesn't count
    n += b.type === 'settlement' ? 1 : 2;
  }
  return n;
}
function updateHarbormaster(s) {
  const H0 = s.harbormaster, pts = s.players.map(p => (p.retired ? 0 : harborPoints(s, p.id)));
  const max = Math.max(...pts);
  let owner;
  if (H0.owner >= 0 && pts[H0.owner] >= HARBORMASTER_MIN && pts[H0.owner] === max) owner = H0.owner;
  else {
    const top = s.players.filter(p => pts[p.id] === max && max >= HARBORMASTER_MIN);
    owner = top.length === 1 ? top[0].id : -1;
  }
  if (owner !== H0.owner) {
    if (owner >= 0) {
      log(s, msg('⚓ @{p} es el Capitán del puerto ({n} puntos de puerto): +2 puntos.', { p: owner, n: pts[owner] }), owner);
      s.fx.push({ kind: 'harbormaster', pid: owner });
    } else log(s, '⚓ Nadie es Capitán del puerto por ahora.');
  }
  s.harbormaster = { owner, count: owner >= 0 ? pts[owner] : 0 };
}

function updateLargestArmy(s, pid) {
  const p = s.players[pid];
  const la = s.largestArmy;
  if (p.knights >= 3 && la.owner !== pid && p.knights > la.count) {
    s.largestArmy = { owner: pid, count: p.knights };
    log(s, msg('⚔️ @{p} consigue el Ejército más grande ({n}).', { p: pid, n: p.knights }), pid);
    s.fx.push({ kind: 'award', what: 'army', pid });
  } else if (la.owner === pid) la.count = p.knights;
}

function checkWin(s) {
  if (s.phase === 'setup' || s.phase === 'gameOver') return;
  const vp = victoryPoints(s, s.current);
  // Fishermen: the holder of the old boot needs one more point
  if (vp >= s.config.rules.vpTarget + Fish.bootPenalty(s, s.current)) {
    s.winner = s.current;
    s.phase = 'gameOver';
    s.trade = null;
    log(s, msg('🏆 ¡@{p} gana la partida con {n} puntos!', { p: s.current, n: vp }), s.current);
    s.fx.push({ kind: 'win', pid: s.current });
  }
}

function stealRandom(s, from, to) {
  const p = s.players[from];
  const bag = [];
  for (const r of cardsOf(s)) for (let i = 0; i < p.res[r]; i++) bag.push(r);
  if (!bag.length) return null;
  const r = pick(s.rng, bag);
  p.res[r]--;
  s.players[to].res[r]++;
  s.players[to].stats.stolen++;
  p.stats.lost++;
  return r;
}

function produce(s, sum) {
  const bd = s.board;
  const mult = (s.config.rules.productionMult || 1) * (s.event && s.event.id === 'bonanza' ? 2 : 1);
  const gains = s.players.map(() => blankHand(s));
  const from = s.players.map(() => ({})); // tiles each gain came from (the UI flies the cards from there)
  const ck = citiesKnightsOn(s);
  for (const t of bd.tiles) {
    if (t.num !== sum || t.id === bd.robber) continue;
    if (t.fog && !t.revealed) continue; // Seafarers: undiscovered fog land doesn't produce
    if (s.event && s.event.id === 'drought' && s.event.res === t.res) continue;
    if (t.res === 'desert') continue;
    if (s.barbAttack && BarbAttack.isConquered(s, t.id)) continue; // Barbarian Attack: a conquered hex produces nothing
    let produced = false;
    for (const v of t.verts) {
      const b = s.buildings[v];
      if (!b || s.players[b.owner].retired) continue;
      const amt = (b.type === 'city' ? 2 : 1) * mult;
      let r = t.res;
      if (r === 'gold') {
        // gold gives the resource the player has least of (hand + pending gains)
        const p = s.players[b.owner];
        r = RES.reduce((best, x) => (p.res[x] + gains[b.owner][x] < p.res[best] + gains[b.owner][best] ? x : best), RES[0]);
      }
      // Cities & Knights: a city by forest / pasture / mountains takes 1 resource + 1 commodity
      const got = ck && b.type === 'city' && t.res !== 'gold' ? cityYield(r, mult) : { [r]: amt };
      for (const [c, n] of Object.entries(got)) {
        gains[b.owner][c] += n;
        (from[b.owner][c] ||= []).push(t.id);
      }
      produced = true;
    }
    if (produced && t.revealed && !t.numRevealed) {
      t.numRevealed = true;
      s.fx.push({ kind: 'revealTile', tile: t.id });
    }
  }
  for (const r of cardsOf(s)) {
    const receivers = gains.map((g, i) => i).filter(i => gains[i][r] > 0);
    const total = receivers.reduce((a, i) => a + gains[i][r], 0);
    if (!total) continue;
    if (total > s.bank[r] && receivers.length > 1) {
      log(s, msg('🏦 El banco no tiene suficiente {r}: nadie lo recibe.', { r: resName(r) }));
      continue;
    }
    for (const i of receivers) {
      const g = giveFromBank(s, i, r, gains[i][r]);
      if (g) s.fx.push({ kind: 'gain', pid: i, res: r, n: g, tiles: from[i][r] });
    }
  }
  const summary = gains
    .map((g, i) => {
      const parts = cardsOf(s).filter(r => g[r]).map(r => `${g[r]}${resName(r)}`);
      return parts.length ? `@${i} ${parts.join(' ')}` : null;
    })
    .filter(Boolean);
  if (summary.length) log(s, '📦 ' + summary.join(' · ')); // only icons and numbers: nothing to translate
  return gains;
}

function rollDice(s) {
  if (s.config.rules.diceMode === 'balanced') {
    if (s.diceDeck.length < 6) {
      s.diceDeck = [];
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) s.diceDeck.push([a, b]);
      shuffle(s.rng, s.diceDeck);
    }
    return s.diceDeck.pop();
  }
  return [1 + randInt(s.rng, 6), 1 + randInt(s.rng, 6)];
}

function randomLandTile(s, exclude) {
  const ids = s.board.tiles.map(t => t.id).filter(id => id !== exclude && !(s.caravans && s.board.tiles[id].oasis)); // Caravans: never the oasis
  return pick(s.rng, ids);
}

function startRound(s) {
  const M = s.config.modes;
  // Tierra viva: reshuffle numbers/resources every N rounds
  if (M.chaosEvery > 0 && s.round > 1 && (s.round - 1) % M.chaosEvery === 0) {
    const tiles = s.board.tiles.filter(t => t.res !== 'desert');
    if (M.chaosWhat !== 'resources') {
      const nums = shuffle(s.rng, tiles.map(t => t.num));
      tiles.forEach((t, i) => (t.num = nums[i]));
    }
    if (M.chaosWhat !== 'numbers') {
      const res = shuffle(s.rng, tiles.map(t => t.res));
      tiles.forEach((t, i) => (t.res = res[i]));
    }
    log(s, '🌀 ¡Tierra viva! El mapa se ha reordenado.');
    s.fx.push({ kind: 'chaos' });
  }
  if (!M.events) return;
  const ev = { ...pick(s.rng, EVENTS) };
  delete ev.desc;
  s.event = { id: ev.id, name: ev.name, icon: ev.icon };
  const E = s.event;
  const active = () => s.players.filter(p => !p.retired).map(p => p.id);
  const leader = () => active().sort((a, b) => victoryPoints(s, b, false) - victoryPoints(s, a, false))[0];
  switch (E.id) {
    case 'drought':
    case 'blackMarket':
      E.res = pick(s.rng, RES);
      break;
    case 'earthquake': {
      const tiles = s.board.tiles.filter(t => t.num);
      if (tiles.length >= 2) {
        const a = pick(s.rng, tiles);
        const b = pick(s.rng, tiles.filter(t => t !== a));
        [a.num, b.num] = [b.num, a.num];
        E.tiles = [a.id, b.id];
      }
      break;
    }
    case 'storm':
      if (!s.config.rules.noRobber) {
        s.board.robberFrom = s.board.robber;
        s.board.robber = randomLandTile(s, s.board.robber);
        E.tile = s.board.robber;
      }
      break;
    case 'gift':
      for (const p of s.players) {
        if (p.retired) continue;
        const r = pick(s.rng, RES);
        giveFromBank(s, p.id, r, 1);
      }
      break;
    case 'plague':
      for (const p of s.players) {
        if (handSize(p.res) < 6) continue;
        const bag = RES.flatMap(r => Array(p.res[r]).fill(r));
        const r = pick(s.rng, bag);
        p.res[r]--;
        s.bank[r]++;
      }
      break;
    case 'tax': {
      const l = leader();
      const p = s.players[l];
      const bag = RES.flatMap(r => Array(p.res[r]).fill(r));
      if (bag.length) {
        const r = pick(s.rng, bag);
        p.res[r]--;
        s.bank[r]++;
      }
      E.pid = l;
      break;
    }
    case 'rebellion': {
      const last = active().sort((a, b) => victoryPoints(s, a, false) - victoryPoints(s, b, false))[0];
      for (let i = 0; i < 2; i++) giveFromBank(s, last, pick(s.rng, RES), 1);
      E.pid = last;
      break;
    }
  }
  const extra = E.res ? ` (${resName(E.res)})` : E.pid != null ? ` (@${E.pid})` : '';
  log(s, msg('{icon} Evento de la ronda {n}: {name}{extra}.', { icon: E.icon, n: s.round, name: E.name, extra }));
  s.fx.push({ kind: 'event', event: E });
}

function beginTurns(s) {
  if (s.config.modes.flipped) {
    const hideNums = s.config.modes.hiddenNumbers;
    for (const t of s.board.tiles) {
      if (t.fog) continue; // Seafarers fog stays until explored
      t.revealed = true;
      t.numRevealed = !hideNums;
    }
    if (hideNums) for (const k in s.buildings) for (const h of s.board.vertices[k].hexes) s.board.tiles[h].numRevealed = true;
    for (const [pid, vid] of s.setup.pendingRes || []) setupResources(s, pid, vid);
    s.setup.pendingRes = [];
    s.fx.push({ kind: 'flipAll' });
    log(s, '🔄 ¡Se voltea el tablero! Ahora todos ven qué hay debajo.');
  }
  s.phase = 'roll';
  s.current = s.players[s.first].retired ? nextActive(s, s.first).pid : s.first;
  s.turn = 1;
  s.round = 1;
  s.setup.blindActive = false;
  updateLongestRoad(s);
  log(s, msg('🎲 Turno de @{p}.', { p: s.current }), s.current);
  startRound(s);
}

function setupResources(s, pid, v) {
  for (const h of s.board.vertices[v].hexes) {
    const t = s.board.tiles[h];
    if (RES.includes(t.res)) giveFromBank(s, pid, t.res, 1);
    else if (t.res === 'gold') giveFromBank(s, pid, pick(s.rng, RES), 1);
  }
}

function advanceSetup(s) {
  const st = s.setup;
  st.idx++;
  st.step = 'settlement';
  st.lastVid = null;
  if (st.idx < st.queue.length) {
    s.current = st.queue[st.idx].pid;
    return;
  }
  if (st.blindActive) {
    resolveBlind(s);
    if (s.phase === 'setup') return;
  }
  beginTurns(s);
}

// Reveal blindfold placements; conflicting ones must be placed again.
function resolveBlind(s) {
  const st = s.setup;
  st.blindActive = false;
  const fix = [];
  const accepted = [];
  for (const b of s.blind) {
    if (vertexOpen(s, b.vid)) {
      const p = s.players[b.pid];
      const isCity = b.type === 'city';
      s.buildings[b.vid] = { owner: b.pid, type: b.type };
      riverGold(s, b.pid, 'settlement', b.vid);
      if (b.eid != null && s.roads[b.eid] === undefined) {
        s.roads[b.eid] = b.pid;
        riverGold(s, b.pid, 'road', b.eid);
      } else if (b.eid != null) {
        p.roadsLeft++;
        fix.push({ pid: b.pid, round: b.round, roadOnly: true, vid: b.vid });
      }
      accepted.push(b);
      void isCity;
    } else {
      const p = s.players[b.pid];
      if (b.type === 'city') p.citiesLeft++;
      else p.settlementsLeft++;
      if (b.eid != null) p.roadsLeft++;
      fix.push({ pid: b.pid, round: b.round });
      log(s, msg('💥 ¡Choque! La casa secreta de @{p} coincidía con otra. Debe reubicarla.', { p: b.pid }), b.pid);
    }
  }
  s.fx.push({ kind: 'blindReveal', placements: s.blind.map(b => ({ pid: b.pid, vid: b.vid, eid: b.eid, ok: accepted.includes(b) })) });
  for (const b of accepted) {
    revealAround(s, b.vid);
    Islands.settledAt(s, b.pid, b.vid, true);
    if (b.round === st.lastRound) {
      if (s.config.modes.flipped) (st.pendingRes = st.pendingRes || []).push([b.pid, b.vid]);
      else setupResources(s, b.pid, b.vid);
    }
  }
  log(s, '🙈 ¡Revelación! Todas las casas iniciales ya son visibles.');
  s.blind = [];
  if (fix.length) {
    st.queue = fix;
    st.idx = 0;
    st.fixing = true;
    st.step = fix[0].roadOnly ? 'road' : 'settlement';
    st.lastVid = fix[0].roadOnly ? fix[0].vid : null;
    s.current = fix[0].pid;
    s.phase = 'setup';
  } else {
    s.phase = 'roll';
  }
}

function nextFixOrBegin(s) {
  const st = s.setup;
  st.idx++;
  if (st.idx < st.queue.length) {
    const f = st.queue[st.idx];
    s.current = f.pid;
    st.step = f.roadOnly ? 'road' : 'settlement';
    st.lastVid = f.roadOnly ? f.vid : null;
    return;
  }
  beginTurns(s);
}

// ---- fog relocation ----
// In fog mode a move that looks legal to the player (given what they can see) but
// collides with an unseen piece is moved to a random nearest legal spot.
function nearest(s, kind, from, ok) {
  const bd = s.board;
  const seen = new Set([from]);
  let level = [from];
  while (level.length) {
    const hits = level.filter(x => x !== from && ok(x));
    if (hits.length) return pick(s.rng, hits);
    const next = [];
    for (const x of level) {
      const nbs = kind === 'vertex' ? bd.vertices[x].adj : [bd.edges[x].a, bd.edges[x].b].flatMap(v => bd.vertices[v].edges);
      for (const y of nbs) if (!seen.has(y)) {
        seen.add(y);
        next.push(y);
      }
    }
    level = next;
  }
  return null;
}

// remember the hidden pieces you bumped into
function discover(s, pid, kind, id) {
  const bd = s.board;
  s.discovered = s.discovered || {};
  const d = (s.discovered[pid] = s.discovered[pid] || { v: [], e: [] });
  const addV = v => { const b = s.buildings[v]; if (b && b.owner !== pid && !d.v.includes(v)) d.v.push(v); };
  const addE = e => { if (s.roads[e] !== undefined && s.roads[e] !== pid && !d.e.includes(e)) d.e.push(e); };
  if (kind === 'vertex') {
    addV(id);
    bd.vertices[id].adj.forEach(addV);
    bd.vertices[id].edges.forEach(addE);
  } else {
    addE(id);
    addV(bd.edges[id].a);
    addV(bd.edges[id].b);
  }
}

function fogResolve(s, a, kind, okReal, okKnown, key) {
  if (!s.config.modes.fog || (s.phase === 'setup' && s.setup.blindActive)) return a;
  if (okReal(a[key])) return a;
  if (!okKnown(viewFor(s, a.pid))) return a; // plainly illegal even with what you see: normal error
  discover(s, a.pid, kind, a[key]);
  const to = nearest(s, kind, a[key], okReal);
  if (to === null) {
    s.fx.push({ kind: 'blocked', pid: a.pid, what: kind, at: a[key] });
    log(s, msg('🌑 @{p} tropezó con alguien en la niebla y no pudo construir.', { p: a.pid }), a.pid);
    throw new Blocked();
  }
  s.fx.push({ kind: 'relocated', pid: a.pid, what: kind, from: a[key], to });
  log(s, msg('🌑 ¡Había alguien en la niebla! La pieza de @{p} se desvió.', { p: a.pid }), a.pid);
  return { ...a, [key]: to };
}

// ---------------- action handlers ----------------
const H = {};

H.placeSettlement = (s, a) => {
  if (s.phase !== 'setup' || s.setup.step !== 'settlement') fail('No es momento de colocar un poblado.');
  const st = s.setup;
  const entry = st.queue[st.idx];
  if (entry.pid !== a.pid) fail('No es tu turno.');
  a = fogResolve(s, a, 'vertex', v => canSetupSettlement(s, a.pid, v), kv => canSetupSettlement(kv, a.pid, a.vid), 'vid');
  if (!canSetupSettlement(s, a.pid, a.vid)) fail('No puedes colocar ahí (regla de distancia).');
  const p = s.players[a.pid];
  const isCity = s.config.rules.setupCity && entry.round === st.lastRound && p.citiesLeft > 0;
  const type = isCity ? 'city' : 'settlement';
  if (isCity) p.citiesLeft--;
  else {
    if (p.settlementsLeft <= 0) fail('No te quedan poblados.');
    p.settlementsLeft--;
  }
  st.lastVid = a.vid;
  st.step = 'road';
  if (st.blindActive) {
    s.blind.push({ pid: a.pid, vid: a.vid, eid: null, round: entry.round, type });
    log(s, isCity ? msg('🙈 @{p} colocó su ciudad en secreto.', { p: a.pid }) : msg('🙈 @{p} colocó su poblado en secreto.', { p: a.pid }), a.pid);
  } else {
    s.buildings[a.vid] = { owner: a.pid, type };
    revealAround(s, a.vid);
    Islands.settledAt(s, a.pid, a.vid, true);
    riverGold(s, a.pid, 'settlement', a.vid);
    if (entry.round === st.lastRound) {
      // face-down board: resources would give away what's underneath, pay them on the flip
      if (s.config.modes.flipped) (st.pendingRes = st.pendingRes || []).push([a.pid, a.vid]);
      else setupResources(s, a.pid, a.vid);
    }
    log(s, isCity ? msg('🏠 @{p} coloca una ciudad.', { p: a.pid }) : msg('🏠 @{p} coloca un poblado.', { p: a.pid }), a.pid);
  }
  s.fx.push({ kind: 'build', what: type, pid: a.pid, at: a.vid, hidden: st.blindActive });
};

H.placeRoad = (s, a) => {
  if (s.phase !== 'setup' || s.setup.step !== 'road') fail('No es momento de colocar un camino.');
  const st = s.setup;
  if (st.queue[st.idx].pid !== a.pid) fail('No es tu turno.');
  a = fogResolve(s, a, 'edge', e => canSetupRoad(s, a.pid, e), kv => canSetupRoad(kv, a.pid, a.eid), 'eid');
  if (!canSetupRoad(s, a.pid, a.eid)) fail('El camino debe salir de tu nuevo poblado.');
  const p = s.players[a.pid];
  if (p.roadsLeft <= 0) fail('No te quedan caminos.');
  p.roadsLeft--;
  if (st.blindActive) {
    const b = s.blind.find(x => x.pid === a.pid && x.vid === st.lastVid && x.eid == null);
    b.eid = a.eid;
  } else {
    s.roads[a.eid] = a.pid;
    const E = s.board.edges[a.eid];
    revealAround(s, E.a);
    revealAround(s, E.b);
    exploreFrom(s, a.pid, a.eid);
    riverGold(s, a.pid, 'road', a.eid);
  }
  s.fx.push({ kind: 'build', what: 'road', pid: a.pid, at: a.eid, hidden: st.blindActive });
  if (st.fixing) nextFixOrBegin(s);
  else advanceSetup(s);
};

// Seafarers: a ship instead of the initial road (coast next to the settlement just placed)
H.placeShip = (s, a) => {
  if (!s.ships) fail('No hay barcos en esta partida.');
  if (s.phase !== 'setup' || s.setup.step !== 'road') fail('No es momento de colocar un barco.');
  const st = s.setup;
  if (st.queue[st.idx].pid !== a.pid) fail('No es tu turno.');
  a = fogResolve(s, a, 'edge', e => Ships.canSetupShip(s, a.pid, e), kv => Ships.canSetupShip(kv, a.pid, a.eid), 'eid');
  Ships.placeSetupShip(s, a.pid, a.eid, { fail });
  log(s, msg('⛵ @{p} coloca un barco.', { p: a.pid }), a.pid);
  exploreFrom(s, a.pid, a.eid);
  s.fx.push({ kind: 'build', what: 'ship', pid: a.pid, at: a.eid });
  if (st.fixing) nextFixOrBegin(s);
  else advanceSetup(s);
};

// Seafarers: move one ship from the open end of a route, once per turn
H.moveShip = (s, a) => {
  assertMain(s, a);
  a = fogResolve(s, a, 'edge', e => Ships.shipDestinations(s, a.pid, a.from).includes(e), kv => Ships.shipDestinations(kv, a.pid, a.from).includes(a.to), 'to');
  Ships.moveShip(s, a.pid, a.from, a.to, { fail });
  log(s, msg('⛵ @{p} mueve un barco.', { p: a.pid }), a.pid);
  exploreFrom(s, a.pid, a.to);
  s.fx.push({ kind: 'moveShip', pid: a.pid, from: a.from, to: a.to });
  updateLongestRoad(s);
};

H.roll = (s, a) => {
  if (s.phase !== 'roll') fail('Ahora no se tiran dados.');
  if (a.pid !== s.current) fail('No es tu turno.');
  let d = s.alchemy || rollDice(s); // C&K Alchemist: the player chose the number dice
  delete s.alchemy;
  if (s.traders) while (d[0] + d[1] === 2 || d[0] + d[1] === 12) { // Traders & Barbarians: 2 and 12 are rolled again
    log(s, msg('🎲 Sale {n}: se vuelve a tirar.', { n: d[0] + d[1] }), a.pid);
    d = rollDice(s);
  }
  const sum = d[0] + d[1];
  s.dice = d;
  // Cities & Knights: the event die rolls along (its effects come with barbarians / progress cards)
  if (citiesKnightsOn(s)) {
    s.eventDie = EVENT_FACES[randInt(s.rng, 6)];
    s.fx.push({ kind: 'eventDie', face: s.eventDie });
  }
  s.stats.rolls[sum]++;
  (s.rollLog ||= []).push({ pid: a.pid, sum });
  if (s.rollLog.length > 30) s.rollLog.shift();
  // how hard the dice were thrown (hold the button to charge it): only changes the animation
  const power = Math.round(Math.min(1, Math.max(0, +a.power || 0)) * 100) / 100;
  s.fx.push({ kind: 'dice', dice: d, power });
  log(s, msg('🎲 @{p} saca {n}.', { p: a.pid, n: sum }), a.pid);
  // Cities & Knights: the event die is resolved before production. The ship moves the barbarians
  // (an attack may need choices); a gate lets players draw progress cards.
  if (s.barbarians) {
    if (s.eventDie === 'ship') barbariansSail(s);
    else gateDraws(s, s.eventDie, d[1]);
    s.heldRoll = sum;
    resumeRoll(s);
    return;
  }
  afterRoll(s, sum);
};

// C&K: wait for every choice the event die left pending, then finish the roll
function resumeRoll(s) {
  if (s.progressBack && !s.progressDiscard) {
    s.phase = s.progressBack;
    delete s.progressBack;
    return;
  }
  if (s.pillage) s.phase = 'pillage';
  else if (s.progressPick && s.progressPick.length) s.phase = 'progressPick';
  else if (s.progressDiscard) s.phase = 'progressDiscard';
  else {
    s.progressPick = null;
    const sum = s.heldRoll;
    s.heldRoll = null;
    afterRoll(s, sum);
  }
}

function gateDraws(s, track, red) {
  for (const { pid, id } of Progress.drawForGate(s, track, red)) progressDrawn(s, pid, id);
}

function progressDrawn(s, pid, id) {
  const c = Progress.PROGRESS_CARDS[id];
  s.fx.push({ kind: 'progressDraw', pid, track: c.track, id });
  if (c.vp) log(s, msg('🏆 @{p} revela {card}: +1 punto.', { p: pid, card: c.name }), pid);
  else log(s, msg('📜 @{p} roba una carta de progreso ({track}).', { p: pid, track: Improve.TRACK_INFO[c.track].name }), pid);
}

function afterRoll(s, sum) {
  if (sum !== 7) {
    const gains = produce(s, sum);
    if (s.fishermen) fishProduction(s, sum);
    s.phase = 'main';
    // Cities & Knights Aqueduct: whoever got nothing picks a resource first
    if (s.pendingAqueduct && Improve.aqueductAfterRoll(s, gains)) s.phase = 'aqueduct';
    return;
  }
  const R = s.config.rules;
  if (s.round <= R.robberGrace) {
    log(s, '😴 El ladrón duerme durante las primeras rondas.');
    s.phase = 'main';
    return;
  }
  s.pendingDiscards = {};
  for (const p of s.players) {
    const n = handSize(p.res);
    if (n > R.handLimit + Improve.wallBonus(s, p.id) && !p.retired) s.pendingDiscards[p.id] = Math.floor(n / 2); // C&K walls: +2 each
  }
  s.robberReturn = 'main';
  if (Object.keys(s.pendingDiscards).length) s.phase = 'discard';
  else s.phase = afterSeven(s);
};

// where a 7 goes once discards are done: no robber (rule, or C&K before the first barbarian attack) -> main
const afterSeven = s => {
  if (s.sabotage) { // C&K Saboteur: those discards were not a 7
    delete s.sabotage;
    return 'main';
  }
  if (s.barbAttack) return BarbAttack.stealVictims(s, s.current).length ? 'baSteal' : 'main'; // Barbarian Attack: no robber, steal from anyone
  if (s.traders) { s.traders.relocate = { from: null, steal: true }; return 'tbBarbarian'; } // Traders & Barbarians: move a barbarian
  return s.config.rules.noRobber || Barb.robberAsleep(s) ? 'main' : 'robber';
};

// ---- Traders & Barbarians: Fishermen ----
function fishProduction(s, sum) {
  for (const { pid, n } of Fish.fishYield(s, sum)) {
    const got = Fish.drawFish(s, pid, n);
    if (got.fish.length) {
      log(s, msg('🎣 @{p} pesca {n} fichas de pescado.', { p: pid, n: got.fish.length }), pid);
      s.fx.push({ kind: 'fish', pid, n: got.fish.length });
    }
    if (got.boot) {
      log(s, msg('👢 @{p} saca la bota vieja: necesita 1 punto más para ganar.', { p: pid }), pid);
      s.fx.push({ kind: 'boot', pid });
    }
  }
}

// Why `pid` can't buy a fish perk right now ('' = allowed). Checks the board, not the fish in hand.
export function fishPerkReason(s, pid, perk) {
  const p = s.players[pid];
  switch (perk) {
    case 'robber': return s.board.robber >= 0 && !s.config.rules.noRobber ? '' : tk('El ladrón no está en el tablero.');
    case 'steal': return s.players.some(o => o.id !== pid && !o.retired && handSize(o.res) > 0) ? '' : tk('Nadie tiene cartas que robar.');
    case 'resource': return RES.some(r => s.bank[r] > 0) ? '' : tk('El banco está vacío.');
    case 'road': return p.roadsLeft > 0 && legalRoads(s, pid).length ? '' : tk('No puedes construir caminos.');
    case 'dev': return s.devDeck.length ? '' : tk('No quedan cartas de desarrollo.');
  }
  return tk('Ventaja desconocida.');
}

H.spendFish = (s, a) => {
  if (!s.fishermen) fail('No hay pescado en esta partida.');
  assertMain(s, a);
  const cost = Fish.FISH_PERKS[a.perk];
  if (!cost) fail('Ventaja desconocida.');
  const why = fishPerkReason(s, a.pid, a.perk);
  if (why) fail(why);
  const p = s.players[a.pid];
  if (a.perk === 'steal') {
    const v = s.players[a.target];
    if (!v || v.id === a.pid || v.retired || handSize(v.res) <= 0) fail('Elige a un rival con cartas.');
  }
  if (a.perk === 'resource' && (!RES.includes(a.res) || s.bank[a.res] <= 0)) fail('Elige un recurso que tenga el banco.');
  if (!Fish.pickTokens(p.fish, cost)) fail('No tienes suficiente pescado.');
  const paid = Fish.payFish(s, a.pid, cost);
  s.fx.push({ kind: 'fishSpent', pid: a.pid, perk: a.perk, n: paid });
  switch (a.perk) {
    case 'robber':
      s.board.robber = -1; // it comes back with the next 7 or knight
      log(s, msg('🎣 @{p} paga {n} peces y saca al ladrón del tablero.', { p: a.pid, n: paid }), a.pid);
      break;
    case 'steal': {
      const r = stealRandom(s, a.target, a.pid);
      s.fx.push({ kind: 'steal', from: a.target, to: a.pid, res: r });
      log(s, msg('🎣 @{p} paga {n} peces y roba una carta a @{v}.', { p: a.pid, n: paid, v: a.target }), a.pid);
      break;
    }
    case 'resource':
      giveFromBank(s, a.pid, a.res, 1);
      s.fx.push({ kind: 'fromBank', pid: a.pid, res: [a.res] });
      log(s, msg('🎣 @{p} paga {n} peces y toma {r} del banco.', { p: a.pid, n: paid, r: resName(a.res) }), a.pid);
      break;
    case 'road':
      s.freeRoads = 1;
      s.phase = 'roadBuilding';
      log(s, msg('🎣 @{p} paga {n} peces por un camino gratis.', { p: a.pid, n: paid }), a.pid);
      break;
    case 'dev': {
      const type = s.devDeck.pop();
      p.dev.push({ type, turn: s.turn });
      s.fx.push({ kind: 'devBought', pid: a.pid, type });
      log(s, msg('🎣 @{p} paga {n} peces por una carta de desarrollo.', { p: a.pid, n: paid }), a.pid);
      break;
    }
  }
};

// The old boot's holder may pass it to a player with as many or more (visible) points
export function bootReceivers(s, pid) {
  if (!s.fishermen || s.fishermen.boot !== pid) return [];
  const mine = victoryPoints(s, pid, false);
  return s.players.filter(o => o.id !== pid && !o.retired && victoryPoints(s, o.id, false) >= mine).map(o => o.id);
}

H.giveBoot = (s, a) => {
  if (!s.fishermen) fail('No hay pescado en esta partida.');
  assertMain(s, a);
  if (s.fishermen.boot !== a.pid) fail('No tienes la bota vieja.');
  if (!bootReceivers(s, a.pid).includes(a.to)) fail('Solo puedes dársela a alguien con tantos puntos como tú o más.');
  s.fishermen.boot = a.to;
  s.fx.push({ kind: 'boot', pid: a.to, from: a.pid });
  log(s, msg('👢 @{p} le pasa la bota vieja a @{v}.', { p: a.pid, v: a.to }), a.pid);
};

// ---- Traders & Barbarians: Rivers of Catan ----
function riverGold(s, pid, what, at) {
  if (!s.rivers) return;
  const n = Rivers.goldFor(s.board, what, at);
  if (!n) return;
  s.players[pid].gold += n;
  s.fx.push({ kind: 'gold', pid, n, what });
  log(s, msg('🪙 @{p} gana {n} de oro junto al río.', { p: pid, n }), pid);
}

// a bridge: on a free bridge spot, joined to the player's road or building (like a road)
export function canBuildBridge(s, pid, e) {
  if (!s.rivers || !Rivers.isCrossing(s.board, e) || s.roads[e] !== undefined) return false;
  const E = s.board.edges[e];
  for (const v of [E.a, E.b]) {
    const b = s.buildings[v];
    if (b && b.owner === pid) return true;
    if (b) continue;
    if (s.board.vertices[v].edges.some(x => x !== e && s.roads[x] === pid)) return true;
  }
  return false;
}
export const legalBridges = (s, pid) => (s.rivers ? s.board.bridgeSpots.filter(e => canBuildBridge(s, pid, e)) : []);

H.buildBridge = (s, a) => {
  if (!s.rivers) fail('No hay ríos en esta partida.');
  assertMain(s, a);
  const p = s.players[a.pid];
  if (p.bridgesLeft <= 0) fail('No te quedan puentes.');
  if (!canBuildBridge(s, a.pid, a.at)) fail('El puente va sobre el río, junto a tu camino o tu poblado.');
  if (!canAfford(p.res, Rivers.BRIDGE_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Rivers.BRIDGE_COST);
  p.bridgesLeft--;
  s.roads[a.at] = a.pid; // a bridge is a road piece: it links the network and counts for Longest Road
  s.rivers.bridges[a.at] = a.pid;
  s.fx.push({ kind: 'build', what: 'bridge', pid: a.pid, at: a.at });
  log(s, msg('🌉 @{p} construye un puente.', { p: a.pid }), a.pid);
  riverGold(s, a.pid, 'bridge', a.at);
  updateLongestRoad(s);
};

H.goldBuy = (s, a) => {
  if (!Rivers.goldBox(s)) fail('No hay oro en esta partida.');
  assertMain(s, a);
  const p = s.players[a.pid];
  if (!RES.includes(a.res)) fail('Elige un recurso.');
  if (Rivers.goldBuysLeft(s) <= 0) fail('Solo puedes comprar con oro 2 veces por turno.');
  if (p.gold < Rivers.GOLD_PER_RESOURCE) fail('Te falta oro.');
  if (s.bank[a.res] < 1) fail('El banco no tiene ese recurso.');
  p.gold -= Rivers.GOLD_PER_RESOURCE;
  const box = Rivers.goldBox(s); // Rivers or Barbarian Attack
  const used = box.buys && box.buys.turn === s.turn ? box.buys.n : 0;
  box.buys = { turn: s.turn, n: used + 1 };
  giveFromBank(s, a.pid, a.res, 1);
  s.fx.push({ kind: 'fromBank', pid: a.pid, res: [a.res] });
  log(s, msg('🪙 @{p} paga {n} de oro por {r}.', { p: a.pid, n: Rivers.GOLD_PER_RESOURCE, r: resName(a.res) }), a.pid);
};

H.goldSell = (s, a) => {
  if (!Rivers.goldBox(s)) fail('No hay oro en esta partida.');
  assertMain(s, a);
  const p = s.players[a.pid];
  if (!RES.includes(a.give)) fail('Elige un recurso.');
  const ratio = tradeRatio(s, a.pid, a.give); // the same rate as a bank trade (4:1, or your harbour)
  if (p.res[a.give] < ratio) fail(msg('Necesitas {n} de ese recurso.', { n: ratio }));
  pay(s, a.pid, { [a.give]: ratio });
  p.gold += 1;
  s.fx.push({ kind: 'gold', pid: a.pid, n: 1, what: 'trade' });
  log(s, msg('🪙 @{p} cambia {n}{give} por 1 de oro.', { p: a.pid, n: ratio, give: resName(a.give) }), a.pid);
};

// ---- Traders & Barbarians: The Caravans ----
// After a turn with a new settlement or city: everyone, from the builder on, votes once for where
// the next camel goes, paying wool and/or grain (1 card = 1 vote, back to the bank).
function startCamelVote(s) {
  const C = s.caravans;
  const built = C.built;
  C.built = false;
  if (!built) return false;
  const options = Caravans.camelOptions(s).map(o => o.edge);
  if (!options.length) return false;
  const order = [];
  for (let k = 0; k < s.players.length; k++) {
    const pid = (s.current + k) % s.players.length;
    if (!s.players[pid].retired) order.push(pid);
  }
  C.vote = { order, idx: 0, bids: {}, options, decider: null, tied: null };
  s.phase = 'caravanVote';
  log(s, '🐪 Votación de la caravana: ¿dónde va el próximo camello? (lana y trigo = votos)');
  s.fx.push({ kind: 'camelVote', options });
  return true;
}

H.caravanBid = (s, a) => {
  if (!s.caravans || s.phase !== 'caravanVote') fail('No hay votación ahora.');
  const V = s.caravans.vote;
  if (V.order[V.idx] !== a.pid) fail('No es tu turno de votar.');
  const p = s.players[a.pid];
  const give = {};
  for (const r of Caravans.VOTE_RES) {
    const n = a[r] || 0;
    if (!Number.isInteger(n) || n < 0 || n > p.res[r]) fail('No tienes esas cartas.');
    if (n) give[r] = n;
  }
  if (!V.options.includes(a.spot)) fail('Elige un sitio para el camello.');
  const n = Object.values(give).reduce((x, y) => x + y, 0);
  pay(s, a.pid, give);
  V.bids[a.pid] = { n, spot: a.spot };
  s.fx.push({ kind: 'camelBid', pid: a.pid, n, spot: a.spot });
  log(s, n ? msg('🐪 @{p} da {n} votos.', { p: a.pid, n }) : msg('🐪 @{p} no vota.', { p: a.pid }), a.pid);
  V.idx++;
  if (V.idx < V.order.length) return;
  const res = Caravans.voteResult(V.bids, s.current, V.options);
  if (res.edge !== undefined) return finishCamelVote(s, res.edge);
  V.decider = res.decider;
  V.tied = res.tied;
  s.phase = 'caravanPick';
  log(s, msg('🐪 Empate: @{p} elige el sitio.', { p: res.decider }), res.decider);
};

H.caravanPick = (s, a) => {
  if (!s.caravans || s.phase !== 'caravanPick') fail('No hay que elegir ahora.');
  const V = s.caravans.vote;
  if (V.decider !== a.pid) fail('No te toca elegir.');
  if (!V.tied.includes(a.spot)) fail('Elige uno de los sitios empatados.');
  finishCamelVote(s, a.spot);
};

function finishCamelVote(s, edge) {
  Caravans.placeCamel(s, edge);
  s.caravans.vote = null;
  s.fx.push({ kind: 'camel', at: edge });
  log(s, msg('🐪 Un camello se une a la caravana ({n} en reserva).', { n: s.caravans.left }));
  updateLongestRoad(s); // a road beside the new camel now counts double
  s.phase = 'main';
  checkWin(s); // still the builder's turn: the camel may have given them the win
  if (s.phase !== 'gameOver') advanceTurn(s);
}

// ---- Traders & Barbarians: Barbarian Attack ----
function barbariansLand(s, pid) {
  const landed = BarbAttack.landBarbarians(s);
  for (const l of landed) {
    log(s, msg('⚔️ ¡Desembarco! Sale {n}: un bárbaro llega a la costa.', { n: l.roll }), pid);
    if (l.conquered) log(s, msg('🔥 ¡Los bárbaros conquistan la casilla del {n}! Ya no produce.', { n: s.board.tiles[l.hex].num }), pid);
  }
  if (landed.length) s.fx.push({ kind: 'barbLand', hexes: landed.map(l => l.hex), conquered: landed.filter(l => l.conquered).map(l => l.hex) });
  else if (s.barbAttack.pool <= 0) log(s, '⚔️ No quedan bárbaros: ya no hay más desembarcos.');
}

H.baSteal = (s, a) => {
  if (!s.barbAttack || s.phase !== 'baSteal') fail('No toca robar.');
  if (a.pid !== s.current) fail('No es tu turno.');
  if (!BarbAttack.stealVictims(s, a.pid).includes(a.target)) fail('Elige a un rival con cartas.');
  const r = stealRandom(s, a.target, a.pid);
  s.fx.push({ kind: 'steal', from: a.target, to: a.pid, res: r });
  log(s, msg('🫳 @{p} le roba una carta a @{v}.', { p: a.pid, v: a.target }), a.pid);
  s.phase = 'main';
};

// Barbarian Attack cards: revealed on purchase, then resolved (phase 'baCard') if they need a choice
const BA_CARD_NAMES = { knight: '🛡️ Caballería', blackKnight: '🖤 Caballero negro', treason: '🗡️ Traición', intrigue: '🕵️ Intriga' }; // translated as log params (vi.js / en.js)
function baBuyCard(s, a) {
  const p = s.players[a.pid];
  if (!canAfford(p.res, COSTS.dev)) fail('Te faltan recursos.');
  pay(s, a.pid, COSTS.dev);
  const type = BarbAttack.drawCard(s);
  s.fx.push({ kind: 'baCard', pid: a.pid, type });
  log(s, msg('🃏 @{p} compra una carta: {c}.', { p: a.pid, c: BA_CARD_NAMES[type] }), a.pid);
  if (type === 'treason') {
    p.gold += BarbAttack.TREASON_GOLD;
    log(s, msg('💰 @{p} recibe {n} de oro.', { p: a.pid, n: BarbAttack.TREASON_GOLD }), a.pid);
  }
  if (!BarbAttack.cardPlayable(s, a.pid, type) || (type === 'treason' && !s.board.coast.some(f => s.board.coast.some(t => BarbAttack.treasonMoveOk(s, f, t))))) {
    if (type !== 'treason') log(s, msg('🃏 La carta no tiene efecto ahora.'), a.pid);
    return;
  }
  s.barbAttack.card = type;
  s.phase = 'baCard';
}

// a.at (edge) for knights, a.moves [{ from, to }] for Treason (0–2), a.hex for Intrigue
H.baCard = (s, a) => {
  if (!s.barbAttack || s.phase !== 'baCard') fail('No hay carta que resolver.');
  if (a.pid !== s.current) fail('No es tu turno.');
  const B = s.barbAttack, p = s.players[a.pid], type = B.card;
  if (type === 'knight' || type === 'blackKnight') {
    if (!BarbAttack.knightSpots(s, type).includes(a.at)) fail(type === 'knight' ? 'Coloca el caballero en un camino libre junto al castillo.' : 'Coloca el caballero en un camino libre.');
    B.knights[a.at] = a.pid;
    p.knightsLeft--;
    s.fx.push({ kind: 'baKnight', pid: a.pid, at: a.at });
    log(s, msg('🛡️ @{p} arma un caballero.', { p: a.pid }), a.pid);
  } else if (type === 'treason') {
    const moves = a.moves || [];
    if (moves.length > BarbAttack.TREASON_MOVES) fail('Como mucho 2 bárbaros.');
    for (const m of moves) {
      if (!BarbAttack.treasonMoveOk(s, m.from, m.to)) fail('Ese bárbaro no puede moverse ahí.');
      if (BarbAttack.moveBarbarian(s, m.from, m.to)) log(s, msg('🔥 ¡Los bárbaros conquistan la casilla del {n}! Ya no produce.', { n: s.board.tiles[m.to].num }), a.pid);
    }
    if (moves.length) log(s, msg('🗡️ @{p} mueve {n} bárbaro(s).', { p: a.pid, n: moves.length }), a.pid);
    s.fx.push({ kind: 'baTreason', moves });
  } else if (type === 'intrigue') {
    if (!(B.on[a.hex] > 0)) fail('Elige una casilla con bárbaros.');
    BarbAttack.takePrisoner(s, a.pid, a.hex);
    s.fx.push({ kind: 'baPrisoner', pid: a.pid, hex: a.hex });
    log(s, msg('🕵️ @{p} hace prisionero a un bárbaro.', { p: a.pid }), a.pid);
  }
  B.card = null;
  s.phase = 'main';
  checkWin(s);
};

// a knight moves: up to 3 paths free, 1 grain for each path beyond (5 at most); once per turn
H.baMoveKnight = (s, a) => {
  assertMain(s, a);
  if (!s.barbAttack) fail('No hay caballeros en esta partida.');
  const B = s.barbAttack, p = s.players[a.pid];
  if (B.knights[a.from] !== a.pid) fail('Ese caballero no es tuyo.');
  if (!B.moved || B.moved.turn !== s.turn) B.moved = { turn: s.turn, at: [] };
  if (B.moved.at.includes(a.from)) fail('Ese caballero ya se movió este turno.');
  const d = BarbAttack.knightReach(s, a.from).get(a.to);
  if (d == null) fail('El caballero no llega ahí.');
  const grain = BarbAttack.moveCost(d);
  if (p.res.wheat < grain) fail('Te faltan recursos.');
  if (grain) pay(s, a.pid, { wheat: grain });
  delete B.knights[a.from];
  B.knights[a.to] = a.pid;
  B.moved.at.push(a.to);
  s.fx.push({ kind: 'baKnightMove', pid: a.pid, from: a.from, to: a.to });
};

function baBattles(s) {
  for (const r of BarbAttack.expelBarbarians(s)) {
    const n = s.board.tiles[r.hex].num;
    log(s, msg('⚔️ ¡Los caballeros expulsan {k} bárbaro(s) de la casilla del {n}!', { k: r.freed, n }));
    for (const [pid, k] of Object.entries(r.prisoners)) log(s, msg('⛓️ @{p} se lleva {n} prisionero(s).', { p: +pid, n: k }), +pid);
    for (const pid of Object.keys(r.gold)) log(s, msg('💰 @{p} se queda sin prisionero y recibe {n} de oro.', { p: +pid, n: r.gold[pid] }), +pid);
    for (const l of r.lost) log(s, msg('💀 @{p} pierde un caballero en la batalla (+{n} de oro).', { p: l.pid, n: BarbAttack.LOST_KNIGHT_GOLD }), l.pid);
    s.fx.push({ kind: 'baBattle', ...r });
  }
}

// ---- Traders & Barbarians: the wagon ----
const GOODS = { marble: '🏛️ mármol', glass: '🔷 vidrio', tools: '🔨 herramientas', sand: '⏳ arena' };
const TRADE_NAMES = { castle: '🏰 castillo', quarry: '⛏️ cantera', glassworks: '🏺 vidriería' };

// one step along a path to the next intersection
H.tbMove = (s, a) => {
  assertMain(s, a);
  if (!s.traders) fail('No hay carromatos en esta partida.');
  const p = s.players[a.pid], from = Traders.wagonAt(s, a.pid);
  if (from == null) fail('Tu carromato aún no está en el tablero.');
  const M = Traders.turnMove(s, a.pid);
  if (M.stopped) fail('Tu carromato ya se detuvo en una plaza este turno.');
  const e = s.board.vertices[from].edges.find(x => Traders.otherEnd(s, x, from) === a.to);
  if (e === undefined) fail('El carromato solo avanza a un cruce vecino.');
  const c = Traders.pathCost(s, a.pid, e);
  if (c.mp > M.mp) fail('No te quedan puntos de movimiento.');
  if (c.toll > p.gold) fail('Te falta oro para el peaje.');
  M.mp -= c.mp;
  if (c.toll) {
    p.gold -= c.toll;
    s.players[c.owner].gold += c.toll;
    log(s, msg('🪙 @{p} paga {n} de oro de peaje a @{o}.', { p: a.pid, n: c.toll, o: c.owner }), a.pid);
  }
  const W = s.traders.wagons[a.pid];
  W.at = a.to;
  s.fx.push({ kind: 'tbWagon', pid: a.pid, from, to: a.to });
  if (Traders.isPlaza(s, a.to)) {
    M.stopped = true; // the wagon must stop at a plaza
    tbArrive(s, a.pid, s.board.vertices[a.to].plaza);
  }
};

// at a trade hex's plaza: deliver what it needs, then take the next commodity there
function tbArrive(s, pid, hex) {
  const T = s.traders, W = T.wagons[pid], kind = Traders.tradeAt(s, hex).kind, p = s.players[pid];
  if (W.cargo && Traders.NEEDED_AT[W.cargo] === kind) {
    const lv = Traders.wagonLevel(s, pid);
    W.delivered++;
    p.gold += lv.gold;
    log(s, msg('📦 @{p} entrega {g} en el {k}: +1 punto y {n} de oro.', { p: pid, g: GOODS[W.cargo], k: TRADE_NAMES[kind], n: lv.gold }), pid);
    s.fx.push({ kind: 'tbDeliver', pid, good: W.cargo, at: hex, gold: lv.gold });
    W.cargo = null;
  }
  if (!W.cargo && T.stacks[kind].length) {
    W.cargo = T.stacks[kind].pop();
    log(s, msg('📦 @{p} carga {g} en el {k}: hay que llevarlo al {d}.', { p: pid, g: GOODS[W.cargo], k: TRADE_NAMES[kind], d: TRADE_NAMES[Traders.NEEDED_AT[W.cargo]] }), pid);
    s.fx.push({ kind: 'tbLoad', pid, good: W.cargo, at: hex });
  }
  checkWin(s);
}

// 1 grain: +2 movement points this turn (once per turn)
H.tbBoost = (s, a) => {
  assertMain(s, a);
  if (!s.traders) fail('No hay carromatos en esta partida.');
  if (Traders.boostUsed(s, a.pid)) fail('Solo una vez por turno.');
  if (!canAfford(s.players[a.pid].res, Traders.BOOST_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Traders.BOOST_COST);
  const M = Traders.turnMove(s, a.pid);
  M.boost = true;
  M.mp += Traders.BOOST_MP;
  log(s, msg('🌾 @{p} da cereal a los bueyes: +{n} de movimiento.', { p: a.pid, n: Traders.BOOST_MP }), a.pid);
};

// upgrade the baggage train to the next level
H.tbUpgrade = (s, a) => {
  assertMain(s, a);
  if (!s.traders) fail('No hay carromatos en esta partida.');
  const next = Traders.nextLevel(s, a.pid);
  if (!next) fail('Tu carromato ya está al máximo.');
  if (!canAfford(s.players[a.pid].res, next.cost)) fail('Te faltan recursos.');
  pay(s, a.pid, next.cost);
  const W = s.traders.wagons[a.pid], M = s.traders.move;
  W.level = next.level;
  if (M && M.turn === s.turn && M.pid === a.pid) M.mp += next.mp - Traders.WAGON_LEVELS[next.level - 2].mp; // the extra MP count at once
  s.fx.push({ kind: 'tbUpgrade', pid: a.pid, level: next.level });
  log(s, msg('🛒 @{p} mejora su carromato al nivel {n}.', { p: a.pid, n: next.level }) , a.pid);
  checkWin(s);
};

// Traders & Barbarians: move a barbarian (7, Knight, or one the wagon drove off) to a free path;
// after a 7 / Knight, a barbarian put on a rival road robs its owner of 1 resource
H.tbMoveBarbarian = (s, a) => {
  if (!s.traders || s.phase !== 'tbBarbarian') fail('Ahora no se mueve ningún bárbaro.');
  if (a.pid !== s.current) fail('No es tu turno.');
  const T = s.traders, R = T.relocate || { from: null, steal: true };
  const from = R.from != null ? R.from : a.from;
  if (!T.barbarians.includes(from)) fail('Elige un bárbaro.');
  if (!Traders.freeBarbPaths(s).includes(a.to)) fail('Ese camino no está libre.');
  T.barbarians[T.barbarians.indexOf(from)] = a.to;
  if (T.tried && T.tried.turn === s.turn) T.tried.edges.push(a.to); // the same barbarian is not tried twice
  s.fx.push({ kind: 'tbBarbarian', from, to: a.to });
  log(s, msg('🪓 @{p} mueve un bárbaro.', { p: a.pid }), a.pid);
  const victim = R.steal ? Traders.roadVictim(s, a.pid, a.to) : null;
  if (victim != null) {
    const r = stealRandom(s, victim, a.pid);
    if (r) {
      s.fx.push({ kind: 'steal', from: victim, to: a.pid, res: r });
      log(s, msg('🫳 @{p} roba una carta a @{o}.', { p: a.pid, o: victim }), a.pid);
    }
  }
  T.relocate = null;
  s.phase = s.robberReturn || 'main';
  s.robberReturn = null;
};

// the wagon next to a barbarian: roll a die; the wagon's numbers drive it off (then it is moved)
H.tbDrive = (s, a) => {
  assertMain(s, a);
  if (!s.traders) fail('No hay bárbaros que espantar.');
  if (!Traders.driveTargets(s, a.pid).includes(a.edge)) fail('Tu carromato no puede espantar ese bárbaro ahora.');
  const T = s.traders;
  if (!T.tried || T.tried.turn !== s.turn) T.tried = { turn: s.turn, edges: [] };
  T.tried.edges.push(a.edge);
  const die = 1 + randInt(s.rng, 6), ok = Traders.wagonLevel(s, a.pid).drive.includes(die);
  s.fx.push({ kind: 'tbDrive', pid: a.pid, edge: a.edge, die, ok });
  if (!ok) {
    log(s, msg('🎲 @{p} intenta espantar un bárbaro: sale {n}, no se mueve.', { p: a.pid, n: die }), a.pid);
    return;
  }
  log(s, msg('🎲 @{p} espanta un bárbaro con un {n}.', { p: a.pid, n: die }), a.pid);
  T.relocate = { from: a.edge, steal: false };
  s.robberReturn = 'main';
  s.phase = 'tbBarbarian';
};

// ---- Cities & Knights barbarians ----
// the ship moves one step; on landing the attack is fought. True while losers must still pick a city.
function barbariansSail(s) {
  const r = Barb.advance(s);
  s.fx.push({ kind: 'barbarians', pos: s.barbarians.pos, attack: !!r });
  if (!r) {
    log(s, msg('🏴‍☠️ Los bárbaros se acercan ({n}/{t}).', { n: s.barbarians.pos, t: s.barbarians.track }));
    return false;
  }
  log(s, msg('🏴‍☠️ ¡Atacan los bárbaros! Bárbaros {b} contra caballeros {c}.', { b: r.barb, c: r.catan }));
  if (r.won) {
    if (r.defender >= 0) log(s, msg('🛡️ ¡Catan resiste! @{p} es Defensor de Catan (+1 punto).', { p: r.defender }), r.defender);
    else if (r.tied.length) {
      log(s, msg('🛡️ ¡Catan resiste! Empate entre los mejores defensores: cada uno roba una carta de progreso.'));
      s.progressPick = Progress.openDecks(s).length ? [...r.tied] : null;
    }
    else log(s, msg('🛡️ ¡Catan resiste!'));
  } else {
    for (const pid of r.losers) log(s, msg('🔥 Los bárbaros saquean una ciudad de @{p}.', { p: pid }), pid);
    if (!r.losers.length) log(s, msg('🔥 Catan pierde, pero no hay ciudades que saquear.'));
  }
  log(s, msg('🦹 El ladrón ya puede moverse y los caballeros quedan inactivos.'));
  return !!s.pillage;
}

H.pillageCity = (s, a) => {
  if (s.phase !== 'pillage' || !s.pillage || !s.pillage[a.pid]) fail('No tienes que perder ninguna ciudad.');
  if (!s.pillage[a.pid].includes(a.at)) fail('Elige una de tus ciudades sin metrópolis.');
  Barb.pillageCity(s, a.pid, a.at);
  s.fx.push({ kind: 'pillage', pid: a.pid, at: a.at });
  log(s, msg('🏚️ La ciudad de @{p} vuelve a ser un poblado.', { p: a.pid }), a.pid);
  if (Object.keys(s.pillage).some(pid => !s.players[pid].retired)) return;
  s.pillage = null;
  resumeRoll(s);
};

H.progressPick = (s, a) => {
  if (s.phase !== 'progressPick' || !s.progressPick || !s.progressPick.includes(a.pid)) fail('No tienes que elegir carta de progreso.');
  if (!Progress.openDecks(s).includes(a.track)) fail('Ese mazo de progreso está vacío.');
  s.progressPick = s.progressPick.filter(pid => pid !== a.pid);
  const id = Progress.draw(s, a.pid, a.track);
  progressDrawn(s, a.pid, id);
  if (!Progress.openDecks(s).length) s.progressPick = [];
  if (s.progressPick.some(pid => !s.players[pid].retired)) return;
  resumeRoll(s);
};

H.progressDiscard = (s, a) => {
  if (s.phase !== 'progressDiscard' || !s.progressDiscard || !s.progressDiscard[a.pid]) fail('No tienes que descartar cartas de progreso.');
  if (!Progress.discard(s, a.pid, a.card)) fail('No tienes esa carta.');
  log(s, msg('🗑️ @{p} descarta una carta de progreso.', { p: a.pid }), a.pid);
  if (s.progressDiscard && Object.keys(s.progressDiscard).some(pid => !s.players[pid].retired)) return;
  s.progressDiscard = null;
  resumeRoll(s);
};


// ---- Cities & Knights progress cards: playing them ----
// marks a text for the translation extractor (tools/i18n.mjs); fail() translates it where it is shown
const tk = x => x;
// which cards in a hand can be played right now (each needs a legal target)
export function playableProgress(s, pid) {
  const p = s.players[pid];
  if (!p.progress || pid !== s.current) return [];
  return [...new Set(p.progress)].filter(id => !progressBlock(s, pid, id));
}

// why a card can't be played now ('' = it can, given a target)
export const progressReason = (s, pid, id) => progressBlock(s, pid, id);
function progressBlock(s, pid, id) {
  const p = s.players[pid];
  const when = id === 'alchemist' ? 'roll' : 'main';
  if (s.phase !== when) return id === 'alchemist' ? tk('El alquimista se juega antes de tirar.') : tk('Las cartas de progreso se juegan después de tirar.');
  switch (id) {
    case 'alchemist': case 'crane': return '';
    case 'inventor': return Science.inventorTiles(s).length >= 2 ? '' : tk('No hay fichas que intercambiar.');
    case 'engineer': return Science.engineerSpots(s, pid).length ? '' : tk('No tienes ciudades sin muralla.');
    case 'irrigation': case 'mining': return Science.harvestGain(s, pid, id) ? '' : tk('No ganarías nada.');
    case 'medicine': return p.citiesLeft > 0 && legalCities(s, pid).length && canAfford(p.res, Science.MEDICINE_COST) ? '' : tk('Necesitas un poblado, una ciudad libre, 2 minerales y 1 cereal.');
    case 'roadBuilding': return p.roadsLeft > 0 && legalRoads(s, pid).length ? '' : tk('No puedes construir caminos.');
    case 'smith': return Knights.legalPromotions(s, pid).length ? '' : tk('No tienes caballeros que ascender.');
    // trade
    case 'merchant': return TradeCards.merchantTiles(s, pid).length ? '' : tk('No tienes casillas donde poner el mercader.');
    case 'merchantFleet': case 'resourceMonopoly': case 'tradeMonopoly': return '';
    case 'masterMerchant': return TradeCards.masterTargets(s, pid, publicVP(s)).length ? '' : tk('Nadie tiene más puntos que tú.');
    // politics
    case 'bishop': return !Barb.robberAsleep(s) && legalRobberTiles(s, pid).length ? '' : tk('El ladrón duerme hasta el primer ataque bárbaro.');
    case 'warlord': return Politics.warlordKnights(s, pid).length ? '' : tk('No tienes caballeros inactivos.');
    case 'intrigue': return Politics.intrigueTargets(s, pid).length ? '' : tk('Ningún caballero rival toca tus caminos.');
    case 'spy': return Politics.spyTargets(s, pid).length ? '' : tk('Ningún rival tiene cartas de progreso.');
    case 'diplomat': return Politics.openRoads(s).length ? '' : tk('No hay caminos sueltos.');
    case 'deserter': return Politics.deserterTargets(s, pid).length ? '' : tk('Ningún rival tiene caballeros.');
    case 'saboteur': return Politics.saboteurTargets(s, pid, publicVP(s)).length ? '' : tk('Nadie con tus puntos o más tiene cartas que perder.');
    case 'wedding': return Politics.weddingTargets(s, pid, publicVP(s)).length ? '' : tk('Nadie con más puntos que tú tiene cartas.');
    case 'commercialHarbor': return TradeCards.harborTargets(s, pid).length && RES.some(r => p.res[r] > 0) ? '' : tk('Ningún rival tiene mercancías (o no tienes recursos).');
    default: return tk('Esta carta aún no se puede jugar.');
  }
}

H.playProgress = (s, a) => {
  if (!s.progress) fail('Esta partida no usa cartas de progreso.');
  if (a.pid !== s.current) fail('No es tu turno.');
  const p = s.players[a.pid];
  const id = a.card;
  if (!p.progress.includes(id)) fail('No tienes esa carta.');
  const block = progressBlock(s, a.pid, id);
  if (block) fail(block);
  const c = Progress.PROGRESS_CARDS[id];
  // 1) check the targets (nothing changes until everything is valid)
  const dice = id === 'alchemist' ? (a.dice || []).map(Number) : null;
  if (dice && (dice.length !== 2 || !dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6))) fail('Elige dos dados del 1 al 6.');
  if (id === 'inventor') {
    const ok = Science.inventorTiles(s);
    if (!Array.isArray(a.tiles) || a.tiles.length !== 2 || a.tiles[0] === a.tiles[1] || !a.tiles.every(t => ok.includes(t))) fail('Elige dos fichas distintas (ni 2, 12, 6 ni 8).');
  }
  if (id === 'engineer' && !Science.engineerSpots(s, a.pid).includes(a.at)) fail('La muralla va bajo una de tus ciudades sin muralla.');
  if (id === 'medicine' && !canBuildCity(s, a.pid, a.at)) fail('Solo puedes mejorar tus poblados.');
  if (id === 'smith') {
    const why = Science.smithBlock(s, a.pid, a.knights);
    if (why) fail(why);
  }
  if (id === 'merchant' && !TradeCards.merchantTiles(s, a.pid).includes(a.tile)) fail('El mercader va en una casilla junto a tu poblado o ciudad.');
  if (id === 'merchantFleet' && !cardsOf(s).includes(a.res)) fail('Elige un recurso o una mercancía.');
  if (id === 'resourceMonopoly' && !RES.includes(a.res)) fail('Elige un recurso.');
  if (id === 'tradeMonopoly' && !COMMODITIES.includes(a.res)) fail('Elige una mercancía.');
  if (id === 'masterMerchant') {
    const why = TradeCards.masterBlock(s, a.pid, a.target, a.cards, publicVP(s));
    if (why) fail(why);
  }
  if (id === 'commercialHarbor') {
    const why = TradeCards.harborBlock(s, a.pid, a.offers);
    if (why) fail(why);
  }
  if (id === 'intrigue' && !Politics.intrigueTargets(s, a.pid).includes(a.at)) fail('Elige un caballero rival que toque tus caminos.');
  if (id === 'spy' && (!Politics.spyTargets(s, a.pid).includes(a.target) || !s.players[a.target].progress.includes(a.take))) fail('Elige una carta de progreso de ese rival.');
  if (id === 'deserter' && !Politics.deserterTargets(s, a.pid).includes(a.target)) fail('Elige un rival con caballeros.');
  if (id === 'diplomat') {
    if (!Politics.openRoads(s).includes(a.edge)) fail('Elige un camino suelto.');
    if (a.to != null) {
      if (s.roads[a.edge] !== a.pid) fail('Solo puedes recolocar tus propios caminos.');
      delete s.roads[a.edge]; // try the new spot without the old road
      const ok = a.to !== a.edge && canBuildRoad(s, a.pid, a.to);
      s.roads[a.edge] = a.pid;
      if (!ok) fail('El camino debe conectar con tu red.');
    }
  }
  // 2) the card leaves the hand and goes under its deck
  p.progress.splice(p.progress.indexOf(id), 1);
  s.progress[c.track].unshift(id);
  log(s, msg('{icon} @{p} juega {card}.', { icon: c.icon, p: a.pid, card: c.name }), a.pid);
  s.fx.push({ kind: 'progressPlay', pid: a.pid, id });
  s.progressPlayed = (s.progressPlayed || 0) + 1;
  // 3) the effect
  switch (id) {
    case 'alchemist':
      s.alchemy = dice;
      H.roll(s, { type: 'roll', pid: a.pid });
      break;
    case 'inventor': {
      const [x, y] = a.tiles.map(t => s.board.tiles[t]);
      [x.num, y.num] = [y.num, x.num];
      [x.numRevealed, y.numRevealed] = [y.numRevealed, x.numRevealed];
      log(s, msg('💡 Se intercambian el {a} y el {b}.', { a: y.num, b: x.num }));
      s.fx.push({ kind: 'inventor', tiles: a.tiles });
      break;
    }
    case 'crane':
      p.craneTurn = s.turn;
      break;
    case 'engineer':
      s.walls[a.at] = a.pid;
      p.wallsLeft--;
      s.fx.push({ kind: 'build', what: 'wall', pid: a.pid, at: a.at });
      break;
    case 'irrigation':
    case 'mining': {
      const res = Science.HARVEST[id];
      const n = Science.harvestGain(s, a.pid, id);
      giveFromBank(s, a.pid, res, n);
      s.fx.push({ kind: 'fromBank', pid: a.pid, res: Array(n).fill(res) });
      log(s, msg('{icon} @{p} recibe {n} {res}.', { icon: c.icon, p: a.pid, n, res: TILE_INFO[res].name }), a.pid);
      break;
    }
    case 'medicine':
      pay(s, a.pid, Science.MEDICINE_COST);
      p.citiesLeft--;
      p.settlementsLeft++;
      s.buildings[a.at].type = 'city';
      s.fx.push({ kind: 'build', what: 'city', pid: a.pid, at: a.at });
      break;
    case 'roadBuilding':
      s.freeRoads = Math.min(2, p.roadsLeft);
      s.phase = 'roadBuilding';
      break;
    case 'smith':
      for (const v of a.knights) {
        Knights.promote(s, a.pid, v);
        s.fx.push({ kind: 'knight', pid: a.pid, at: v });
      }
      break;
    // ---- trade ----
    case 'merchant': {
      const from = s.merchant ? s.merchant.owner : null;
      s.merchant = { owner: a.pid, tile: a.tile };
      s.fx.push({ kind: 'merchant', pid: a.pid, tile: a.tile, from });
      log(s, from != null && from !== a.pid ? msg('💼 @{p} le quita el mercader a @{q}.', { p: a.pid, q: from }) : msg('💼 @{p} pone el mercader: 2:1 en {res}.', { p: a.pid, res: TILE_INFO[s.board.tiles[a.tile].res].name }), a.pid);
      break;
    }
    case 'merchantFleet':
      p.fleet = { turn: s.turn, res: a.res };
      log(s, msg('🚢 @{p} comercia {res} 2:1 este turno.', { p: a.pid, res: TILE_INFO[a.res].name }), a.pid);
      break;
    case 'resourceMonopoly':
    case 'tradeMonopoly': {
      const most = id === 'resourceMonopoly' ? TradeCards.MONOPOLY_RES : TradeCards.MONOPOLY_COM;
      const from = [];
      let got = 0;
      for (const q of s.players) {
        if (q.id === a.pid || q.retired) continue;
        const n = Math.min(most, q.res[a.res]);
        if (!n) continue;
        q.res[a.res] -= n;
        p.res[a.res] += n;
        got += n;
        from.push([q.id, n]);
      }
      s.fx.push({ kind: 'monopoly', pid: a.pid, res: a.res, from });
      log(s, msg('{icon} @{p} se lleva {n} {res}.', { icon: c.icon, p: a.pid, n: got, res: TILE_INFO[a.res].name }), a.pid);
      break;
    }
    case 'masterMerchant': {
      const q = s.players[a.target];
      for (const r of a.cards) {
        q.res[r]--;
        p.res[r]++;
      }
      s.fx.push({ kind: 'steal', from: a.target, to: a.pid, res: a.cards[0] });
      log(s, msg('🧐 @{p} mira la mano de @{q} y se lleva {n} cartas.', { p: a.pid, q: a.target, n: a.cards.length }), a.pid);
      break;
    }
    // ---- politics ----
    case 'bishop':
      s.bishopSteal = true;
      s.robberReturn = 'main';
      s.phase = 'robber';
      break;
    case 'warlord':
      for (const v of Politics.warlordKnights(s, a.pid)) {
        Knights.activate(s, v);
        s.fx.push({ kind: 'knight', pid: a.pid, at: v });
      }
      break;
    case 'intrigue': {
      const r = Knights.expel(s, a.at);
      log(s, msg('🗡️ @{p} expulsa al caballero de @{q}.', { p: a.pid, q: r.victim.owner }), a.pid);
      if (r.removed) log(s, msg('🏳️ El caballero de @{q} no tiene adónde ir y vuelve a su reserva.', { q: r.victim.owner }));
      else {
        s.displacedReturn = 'main';
        s.phase = 'displace';
      }
      updateLongestRoad(s);
      break;
    }
    case 'spy': {
      const q = s.players[a.target];
      q.progress.splice(q.progress.indexOf(a.take), 1);
      p.progress.push(a.take);
      if (p.progress.length > Progress.PROGRESS_HAND) (s.progressDiscard ||= {})[a.pid] = p.progress.length - Progress.PROGRESS_HAND;
      log(s, msg('🕵️ @{p} espía a @{q} y se lleva una carta de progreso.', { p: a.pid, q: a.target }), a.pid);
      if (s.progressDiscard) {
        s.progressBack = 'main';
        s.phase = 'progressDiscard';
      }
      break;
    }
    case 'diplomat': {
      const owner = s.roads[a.edge];
      delete s.roads[a.edge];
      s.players[owner].roadsLeft++;
      log(s, msg('🤝 @{p} retira un camino de @{q}.', { p: a.pid, q: owner }), a.pid);
      if (a.to != null) {
        s.roads[a.to] = a.pid;
        p.roadsLeft--;
        s.fx.push({ kind: 'build', what: 'road', pid: a.pid, at: a.to });
        log(s, msg('🛤️ @{p} construye un camino gratis.', { p: a.pid }), a.pid);
      }
      updateLongestRoad(s);
      break;
    }
    case 'deserter':
      s.deserter = { from: a.pid, victim: a.target };
      s.phase = 'deserter';
      log(s, msg('🏃 @{p} convence a un caballero de @{q} para desertar.', { p: a.pid, q: a.target }), a.pid);
      break;
    case 'saboteur': {
      s.pendingDiscards = {};
      for (const q of Politics.saboteurTargets(s, a.pid, publicVP(s))) s.pendingDiscards[q] = Math.floor(Politics.handCount(s, q) / 2);
      s.sabotage = true;
      s.phase = 'discard';
      log(s, msg('💣 ¡Sabotaje! Los rivales con tus puntos o más descartan la mitad.'), a.pid);
      break;
    }
    case 'wedding': {
      const pending = {};
      for (const q of Politics.weddingTargets(s, a.pid, publicVP(s))) pending[q] = Math.min(Politics.WEDDING_GIFT, Politics.handCount(s, q));
      s.wedding = { to: a.pid, pending };
      s.phase = 'wedding';
      log(s, msg('💍 ¡Boda de @{p}! Los rivales con más puntos le hacen un regalo.', { p: a.pid }), a.pid);
      break;
    }
    case 'commercialHarbor': {
      // the resources go out now; each rival then picks the commodity they give back
      const pending = {};
      for (const [qs, r] of Object.entries(a.offers)) {
        const q = +qs;
        p.res[r]--;
        s.players[q].res[r]++;
        pending[q] = r;
      }
      s.harbor = { from: a.pid, pending, back: s.phase };
      s.phase = 'harbor';
      log(s, msg('⚓ @{p} ofrece recursos a cambio de mercancías.', { p: a.pid }), a.pid);
      break;
    }
  }
};

// public points (no hidden cards): who counts as "having more points" for the trade cards
const publicVP = s => pid => victoryPoints(s, pid, false);

// Deserter: the rival chooses which of their knights leaves...
H.desertKnight = (s, a) => {
  if (s.phase !== 'deserter' || !s.deserter || s.deserter.victim !== a.pid) fail('No tienes que retirar ningún caballero.');
  const k = s.knights[a.at];
  if (!k || k.owner !== a.pid) fail('Elige uno de tus caballeros.');
  delete s.knights[a.at];
  s.players[a.pid].knightsLeft[k.level]++;
  log(s, msg('🏃 Un caballero de @{q} deserta.', { q: a.pid }), a.pid);
  updateLongestRoad(s);
  const d = s.deserter;
  d.level = Politics.deserterLevel(s, d.from, k.level);
  if (d.level && Politics.deserterSpots(s, d.from).length) s.phase = 'deserterPlace';
  else {
    s.deserter = null;
    s.phase = 'main';
  }
};

// ...and the player who played the card puts one of theirs on the board
H.placeDeserter = (s, a) => {
  if (s.phase !== 'deserterPlace' || !s.deserter || s.deserter.from !== a.pid) fail('No tienes que colocar ningún caballero.');
  if (!Politics.deserterSpots(s, a.pid).includes(a.at)) fail('El caballero va en un cruce libre junto a tu camino.');
  const lvl = s.deserter.level;
  s.knights[a.at] = { owner: a.pid, level: lvl, active: false, activatedTurn: -1, promotedTurn: -1, usedTurn: -1 };
  s.players[a.pid].knightsLeft[lvl]--;
  s.fx.push({ kind: 'build', what: 'knight', pid: a.pid, at: a.at });
  log(s, msg('🏃 El desertor se une a @{p}: {name}.', { p: a.pid, name: Knights.KNIGHT_NAMES[lvl] }), a.pid);
  s.deserter = null;
  s.phase = 'main';
  updateLongestRoad(s);
};

// Wedding: each rival with more points gives 2 cards of their choice
H.weddingGive = (s, a) => {
  if (s.phase !== 'wedding' || !s.wedding || !(a.pid in s.wedding.pending)) fail('No tienes que hacer ningún regalo.');
  const need = s.wedding.pending[a.pid];
  const cards = Array.isArray(a.cards) ? a.cards : [];
  if (cards.length !== need) fail(msg('Debes dar exactamente {n} cartas.', { n: need }));
  const q = s.players[a.pid], to = s.players[s.wedding.to];
  const n = {};
  for (const c of cards) n[c] = (n[c] || 0) + 1;
  for (const c in n) if (!cardsOf(s).includes(c) || !(q.res[c] >= n[c])) fail('No tienes esas cartas.');
  for (const c of cards) {
    q.res[c]--;
    to.res[c]++;
  }
  s.fx.push({ kind: 'steal', from: a.pid, to: s.wedding.to, res: cards[0] });
  log(s, msg('🎁 @{q} regala {n} cartas a @{p}.', { q: a.pid, p: s.wedding.to, n: need }), a.pid);
  delete s.wedding.pending[a.pid];
  weddingDone(s);
};

function weddingDone(s) {
  if (Object.keys(s.wedding.pending).some(pid => !s.players[pid].retired)) return;
  s.wedding = null;
  s.phase = 'main';
}

H.harborReturn = (s, a) => {
  if (s.phase !== 'harbor' || !s.harbor || !(a.pid in s.harbor.pending)) fail('No tienes que devolver ninguna mercancía.');
  const q = s.players[a.pid];
  if (!COMMODITIES.includes(a.card) || !(q.res[a.card] > 0)) fail('Elige una mercancía que tengas.');
  q.res[a.card]--;
  s.players[s.harbor.from].res[a.card]++;
  s.fx.push({ kind: 'steal', from: a.pid, to: s.harbor.from, res: a.card });
  log(s, msg('⚓ @{q} devuelve una mercancía a @{p}.', { q: a.pid, p: s.harbor.from }), a.pid);
  delete s.harbor.pending[a.pid];
  harborDone(s);
};

function harborDone(s) {
  if (Object.keys(s.harbor.pending).some(pid => !s.players[pid].retired)) return;
  s.phase = s.harbor.back || 'main';
  s.harbor = null;
}

function bishopMove(s, a, victims) {
  delete s.bishopSteal;
  s.board.robberFrom = s.board.robber;
  s.board.robber = a.tile;
  s.fx.push({ kind: 'robber', tile: a.tile });
  log(s, msg('⛪ @{p} mueve el ladrón y roba a todos los vecinos.', { p: a.pid }), a.pid);
  for (const v of victims) {
    const r = stealRandom(s, v, a.pid);
    if (r) s.fx.push({ kind: 'steal', from: v, to: a.pid, res: r });
  }
  s.phase = s.robberReturn;
}

H.discard = (s, a) => {
  if (s.phase !== 'discard') fail('No hay descartes pendientes.');
  const need = s.pendingDiscards[a.pid];
  if (!need) fail('No tienes que descartar.');
  const res = a.res || {};
  const total = cardsOf(s).reduce((t, r) => t + (res[r] || 0), 0);
  if (total !== need) fail(msg('Debes descartar exactamente {n} cartas.', { n: need }));
  const p = s.players[a.pid];
  for (const r of cardsOf(s)) if ((res[r] || 0) < 0 || (res[r] || 0) > p.res[r]) fail('No tienes esas cartas.');
  for (const r of cardsOf(s)) {
    p.res[r] -= res[r] || 0;
    s.bank[r] += res[r] || 0;
  }
  p.stats.lost += need;
  s.fx.push({ kind: 'discard', pid: a.pid, res: Object.fromEntries(cardsOf(s).map(r => [r, res[r] || 0])) });
  delete s.pendingDiscards[a.pid];
  log(s, msg('🗑️ @{p} descarta {n} cartas.', { p: a.pid, n: need }), a.pid);
  if (!Object.keys(s.pendingDiscards).length) s.phase = afterSeven(s);
};

H.moveRobber = (s, a) => {
  if (s.phase !== 'robber') fail('No toca mover el ladrón.');
  if (a.pid !== s.current) fail('No es tu turno.');
  const known = s.config.modes.fog ? viewFor(s, a.pid) : s;
  if (!legalRobberTiles(known, a.pid).includes(a.tile)) fail('No puedes poner el ladrón ahí.');
  const victims = stealTargets(s, a.pid, a.tile);
  if (s.bishopSteal) return bishopMove(s, a, victims); // C&K Bishop: one card from everyone there
  let victim = a.victim;
  if (victims.length === 1 && victim == null) victim = victims[0];
  // in the fog you may not see who is there: steal from a random neighbour
  if (s.config.modes.fog && victims.length && !victims.includes(victim)) victim = pick(s.rng, victims);
  if (victims.length && !victims.includes(victim)) fail('Elige a quién robar.');
  if (!victims.length) victim = null;
  s.board.robberFrom = s.board.robber; // bots use it so they don't just send it back
  s.board.robber = a.tile;
  s.fx.push({ kind: 'robber', tile: a.tile });
  log(s, msg('🦹 @{p} mueve el ladrón.', { p: a.pid }), a.pid);
  if (victim != null) {
    const r = stealRandom(s, victim, a.pid);
    s.fx.push({ kind: 'steal', from: victim, to: a.pid, res: r });
    log(s, msg('🫳 @{p} le roba una carta a @{v}.', { p: a.pid, v: victim }), a.pid);
  }
  s.phase = s.robberReturn;
};

// Seafarers: instead of the robber, move the pirate to a sea tile (same phase, same steal)
H.movePirate = (s, a) => {
  if (s.board.pirate === undefined) fail('No hay pirata en esta partida.');
  if (s.phase !== 'robber') fail('No toca mover el ladrón.');
  if (a.pid !== s.current) fail('No es tu turno.');
  if (!legalPirateTiles(s).includes(a.tile)) fail('No puedes poner el pirata ahí.');
  const victims = pirateTargets(s, a.pid, a.tile);
  let victim = a.victim;
  if (victims.length === 1 && victim == null) victim = victims[0];
  if (victims.length && !victims.includes(victim)) fail('Elige a quién robar.');
  if (!victims.length) victim = null;
  s.board.pirate = a.tile;
  s.fx.push({ kind: 'pirate', tile: a.tile });
  log(s, msg('🏴‍☠️ @{p} mueve el pirata.', { p: a.pid }), a.pid);
  if (victim != null) {
    const r = stealRandom(s, victim, a.pid);
    s.fx.push({ kind: 'steal', from: victim, to: a.pid, res: r });
    log(s, msg('🫳 @{p} le roba una carta a @{v}.', { p: a.pid, v: victim }), a.pid);
  }
  s.phase = s.robberReturn;
};

// ---- Cities & Knights: improvements, city walls, Aqueduct ----
const ckOnly = s => {
  if (!s.metropolis) fail('Esta partida no usa Ciudades y Caballeros.');
};

H.improve = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  const r = Improve.improve(s, a.pid, a.track, a.at, { fail, pay: cost => pay(s, a.pid, cost), canAfford });
  if (Improve.craneOn(s, a.pid)) s.players[a.pid].craneTurn = -1; // the crane discount is used up
  const info = Improve.TRACK_INFO[a.track];
  log(s, msg('{icon} @{p} mejora {track} a nivel {n}.', { icon: info.icon, p: a.pid, track: info.name, n: r.level }), a.pid);
  s.fx.push({ kind: 'improve', pid: a.pid, track: a.track, level: r.level });
  if (r.metro != null) {
    log(s, r.from != null ? msg('🏙️ @{p} le quita la metrópolis de {track} a @{q}.', { p: a.pid, q: r.from, track: info.name }) : msg('🏙️ @{p} levanta la metrópolis de {track}.', { p: a.pid, track: info.name }), a.pid);
    s.fx.push({ kind: 'metropolis', pid: a.pid, track: a.track, at: r.metro, from: r.from });
  }
};

H.buildWall = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  if (!Improve.canBuildWall(s, a.pid, a.at)) fail('La muralla va bajo una de tus ciudades sin muralla.');
  if (!canAfford(s.players[a.pid].res, Improve.WALL_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Improve.WALL_COST);
  s.players[a.pid].wallsLeft--;
  s.walls[a.at] = a.pid;
  log(s, msg('🧱 @{p} construye una muralla.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'build', what: 'wall', pid: a.pid, at: a.at });
};

H.aqueductPick = (s, a) => {
  if (s.phase !== 'aqueduct' || !s.pendingAqueduct[a.pid]) fail('No tienes que elegir recurso.');
  if (!RES.includes(a.res)) fail('Elige un recurso.');
  const g = giveFromBank(s, a.pid, a.res, 1);
  delete s.pendingAqueduct[a.pid];
  if (g) s.fx.push({ kind: 'gain', pid: a.pid, res: a.res, n: g, tiles: [] });
  log(s, msg('🟩 @{p} usa el acueducto: {r}.', { p: a.pid, r: resName(a.res) }), a.pid);
  if (!Object.keys(s.pendingAqueduct).length) s.phase = 'main';
};

// ---- Cities & Knights: knights ----
const ownKnight = (s, a, v) => {
  const k = s.knights && s.knights[v];
  if (!k || k.owner !== a.pid) fail('Ese caballero no es tuyo.');
  return k;
};

H.recruitKnight = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  if (s.players[a.pid].knightsLeft[1] <= 0) fail('No te quedan caballeros básicos.');
  if (!Knights.canRecruit(s, a.pid, a.at)) fail('El caballero va en un cruce libre junto a tu camino.');
  if (!canAfford(s.players[a.pid].res, Knights.KNIGHT_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Knights.KNIGHT_COST);
  Knights.recruit(s, a.pid, a.at);
  log(s, msg('⚔️ @{p} recluta un caballero.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'build', what: 'knight', pid: a.pid, at: a.at });
  updateLongestRoad(s);
};

H.promoteKnight = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  ownKnight(s, a, a.at);
  const block = Knights.promoteBlock(s, a.pid, a.at);
  if (block) fail(block);
  if (!canAfford(s.players[a.pid].res, Knights.KNIGHT_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Knights.KNIGHT_COST);
  Knights.promote(s, a.pid, a.at);
  log(s, msg('⬆️ @{p} asciende un caballero: {name}.', { p: a.pid, name: Knights.KNIGHT_NAMES[s.knights[a.at].level] }), a.pid);
  s.fx.push({ kind: 'knight', pid: a.pid, at: a.at });
};

H.activateKnight = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  const k = ownKnight(s, a, a.at);
  if (k.active) fail('Ese caballero ya está activo.');
  if (!canAfford(s.players[a.pid].res, Knights.ACTIVATE_COST)) fail('Te faltan recursos.');
  pay(s, a.pid, Knights.ACTIVATE_COST);
  Knights.activate(s, a.at);
  log(s, msg('🔥 @{p} activa un caballero.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'knight', pid: a.pid, at: a.at });
};

H.knightMove = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  ownKnight(s, a, a.from);
  if (!Knights.knightTargets(s, a.pid, a.from).move.includes(a.to)) fail('El caballero no puede ir ahí.');
  Knights.move(s, a.pid, a.from, a.to);
  log(s, msg('🐎 @{p} mueve un caballero.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'knightMove', pid: a.pid, from: a.from, to: a.to });
  updateLongestRoad(s);
};

H.knightDisplace = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  ownKnight(s, a, a.from);
  if (!Knights.knightTargets(s, a.pid, a.from).displace.includes(a.to)) fail('Solo puedes expulsar a un caballero más débil que tus caminos alcancen.');
  const r = Knights.displace(s, a.pid, a.from, a.to);
  log(s, msg('🤺 @{p} expulsa al caballero de @{q}.', { p: a.pid, q: r.victim.owner }), a.pid);
  s.fx.push({ kind: 'knightMove', pid: a.pid, from: a.from, to: a.to });
  if (r.removed) log(s, msg('🏳️ El caballero de @{q} no tiene adónde ir y vuelve a su reserva.', { q: r.victim.owner }));
  else {
    s.displacedReturn = s.phase;
    s.phase = 'displace';
  }
  updateLongestRoad(s);
};

H.placeDisplaced = (s, a) => {
  if (s.phase !== 'displace' || !s.displaced || s.displaced.pid !== a.pid) fail('No tienes que recolocar ningún caballero.');
  if (!s.displaced.options.includes(a.at)) fail('El caballero debe ir a un cruce libre por tus caminos.');
  Knights.placeDisplaced(s, a.at);
  log(s, msg('🐎 @{p} recoloca su caballero.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'knightMove', pid: a.pid, to: a.at });
  s.phase = s.displacedReturn || 'main';
  updateLongestRoad(s);
};

H.knightChase = (s, a) => {
  ckOnly(s);
  assertMain(s, a);
  ownKnight(s, a, a.from);
  if (!Knights.canChase(s, a.pid, a.from)) fail('El caballero debe estar activo junto al ladrón.');
  Knights.chase(s, a.from);
  log(s, msg('🛡️ @{p} expulsa al ladrón con un caballero.', { p: a.pid }), a.pid);
  s.robberReturn = s.phase;
  s.phase = 'robber';
};

function assertMain(s, a) {
  if (a.pid !== s.current) fail('No es tu turno.');
  if (s.phase !== 'main') fail(s.phase === 'roll' ? 'Primero tira los dados.' : 'Termina la acción pendiente.');
}

H.build = (s, a) => {
  if (a.pid !== s.current) fail('No es tu turno.');
  const p = s.players[a.pid];
  const free = s.phase === 'roadBuilding' && (a.what === 'road' || (a.what === 'ship' && !!s.ships));
  if (!free) assertMain(s, a);
  if (a.what === 'road') {
    if (p.roadsLeft <= 0) fail('No te quedan caminos.');
    a = fogResolve(s, a, 'edge', e => canBuildRoad(s, a.pid, e), kv => canBuildRoad(kv, a.pid, a.at), 'at');
    if (!canBuildRoad(s, a.pid, a.at)) fail('El camino debe conectar con tu red.');
    if (!free && !canAfford(p.res, COSTS.road)) fail('Te faltan recursos.');
    if (!free) pay(s, a.pid, COSTS.road);
    p.roadsLeft--;
    s.roads[a.at] = a.pid;
    const E = s.board.edges[a.at];
    revealAround(s, E.a);
    revealAround(s, E.b);
    exploreFrom(s, a.pid, a.at);
    log(s, free ? msg('🛤️ @{p} construye un camino gratis.', { p: a.pid }) : msg('🛤️ @{p} construye un camino.', { p: a.pid }), a.pid);
    riverGold(s, a.pid, 'road', a.at);
    if (free) {
      s.freeRoads--;
      if (s.freeRoads <= 0 || noFreeBuildLeft(s, a.pid)) s.phase = 'main';
    }
  } else if (a.what === 'ship') {
    if (!s.ships) fail('No hay barcos en esta partida.');
    // fog of war: a hidden rival piece in the way deflects the ship, like roads
    a = fogResolve(s, a, 'edge', e => Ships.canBuildShip(s, a.pid, e), kv => Ships.canBuildShip(kv, a.pid, a.at), 'at');
    Ships.buildShip(s, a.pid, a.at, { fail, pay: cost => (canAfford(p.res, cost) ? pay(s, a.pid, cost) : fail('Te faltan recursos.')), isFree: free });
    log(s, free ? msg('⛵ @{p} construye un barco gratis.', { p: a.pid }) : msg('⛵ @{p} construye un barco.', { p: a.pid }), a.pid);
    exploreFrom(s, a.pid, a.at);
    if (free) {
      s.freeRoads--;
      if (s.freeRoads <= 0 || noFreeBuildLeft(s, a.pid)) s.phase = 'main';
    }
  } else if (a.what === 'settlement') {
    if (p.settlementsLeft <= 0) fail('No te quedan poblados.');
    a = fogResolve(s, a, 'vertex', v => canBuildSettlement(s, a.pid, v), kv => canBuildSettlement(kv, a.pid, a.at), 'at');
    if (!canBuildSettlement(s, a.pid, a.at)) fail('Ahí no se puede construir un poblado.');
    if (!canAfford(p.res, COSTS.settlement)) fail('Te faltan recursos.');
    pay(s, a.pid, COSTS.settlement);
    p.settlementsLeft--;
    s.buildings[a.at] = { owner: a.pid, type: 'settlement' };
    revealAround(s, a.at);
    const bonus = Islands.settledAt(s, a.pid, a.at, false);
    if (bonus) {
      log(s, msg('🏝️ @{p} llega a una isla nueva: +{n} puntos.', { p: a.pid, n: bonus }), a.pid);
      s.fx.push({ kind: 'islandBonus', pid: a.pid, at: a.at, n: bonus });
    }
    log(s, msg('🏠 @{p} construye un poblado.', { p: a.pid }), a.pid);
    riverGold(s, a.pid, 'settlement', a.at);
    if (s.caravans) s.caravans.built = true; // Caravans: a camel vote at the end of this turn
    if (s.barbAttack) barbariansLand(s, a.pid); // Barbarian Attack: building draws barbarians to the coast
  } else if (a.what === 'city') {
    if (p.citiesLeft <= 0) fail('No te quedan ciudades.');
    if (!canBuildCity(s, a.pid, a.at)) fail('Solo puedes mejorar tus poblados.');
    if (!canAfford(p.res, COSTS.city)) fail('Te faltan recursos.');
    pay(s, a.pid, COSTS.city);
    p.citiesLeft--;
    p.settlementsLeft++;
    s.buildings[a.at].type = 'city';
    log(s, msg('🏰 @{p} mejora a ciudad.', { p: a.pid }), a.pid);
    if (s.caravans) s.caravans.built = true;
    if (s.barbAttack) barbariansLand(s, a.pid);
  } else fail('Construcción desconocida.');
  s.fx.push({ kind: 'build', what: a.what, pid: a.pid, at: a.at });
  if (a.what !== 'city') updateLongestRoad(s);
};

// Road Building: nothing left to place for free (base game: roads only; Seafarers: roads or ships)
function noFreeBuildLeft(s, pid) {
  const p = s.players[pid];
  const noRoad = p.roadsLeft <= 0 || !legalRoads(s, pid).length;
  const noShip = !s.ships || p.shipsLeft <= 0 || !Ships.legalShips(s, pid).length;
  return noRoad && noShip;
}

H.endRoadBuilding = (s, a) => {
  if (s.phase !== 'roadBuilding' || a.pid !== s.current) fail('No estás construyendo caminos.');
  s.freeRoads = 0;
  s.phase = 'main';
};

H.buyDev = (s, a) => {
  assertMain(s, a);
  if (s.progress) fail('En Ciudades y Caballeros no hay cartas de desarrollo.');
  if (s.barbAttack) return baBuyCard(s, a); // Barbarian Attack: the scenario's own deck
  const p = s.players[a.pid];
  if (!s.devDeck.length) fail('No quedan cartas de desarrollo.');
  if (!canAfford(p.res, COSTS.dev)) fail('Te faltan recursos.');
  pay(s, a.pid, COSTS.dev);
  const type = s.devDeck.pop();
  p.dev.push({ type, turn: s.turn });
  s.fx.push({ kind: 'devBought', pid: a.pid, type });
  log(s, msg('🃏 @{p} compra una carta de desarrollo.', { p: a.pid }), a.pid);
};

H.playDev = (s, a) => {
  if (a.pid !== s.current) fail('No es tu turno.');
  if (!playableDev(s, a.pid).includes(a.card)) fail('No puedes jugar esa carta ahora.');
  const p = s.players[a.pid];
  // validate parameters before mutating
  if (a.card === 'yearOfPlenty') {
    const rs = a.res || [];
    if (rs.length !== 2 || !rs.every(r => RES.includes(r))) fail('Elige 2 recursos.');
    const need = {};
    rs.forEach(r => (need[r] = (need[r] || 0) + 1));
    for (const r in need) if (s.bank[r] < need[r]) fail('El banco no tiene suficientes.');
  }
  if (a.card === 'monopoly' && !RES.includes(a.res)) fail('Elige un recurso.');
  const idx = p.dev.findIndex(c => c.type === a.card && c.turn < s.turn);
  p.dev.splice(idx, 1);
  s.devPlayed = true;
  s.fx.push({ kind: 'devPlayed', pid: a.pid, card: a.card });
  log(s, msg('{icon} @{p} juega {card}.', { icon: DEV_INFO[a.card].icon, p: a.pid, card: DEV_INFO[a.card].name }), a.pid);
  switch (a.card) {
    case 'knight':
      p.knights++;
      if (s.traders) { // Traders & Barbarians: no Largest Army; the knight moves a barbarian (as a 7)
        s.traders.relocate = { from: null, steal: true };
        s.robberReturn = s.phase;
        s.phase = 'tbBarbarian';
        break;
      }
      updateLargestArmy(s, a.pid);
      if (s.config.rules.noRobber) break;
      s.robberReturn = s.phase;
      s.phase = 'robber';
      break;
    case 'roadBuilding':
      s.freeRoads = Math.min(2, p.roadsLeft + (s.ships ? p.shipsLeft : 0));
      if (s.freeRoads > 0 && !noFreeBuildLeft(s, a.pid)) s.phase = 'roadBuilding';
      break;
    case 'swiftJourney': { // Traders & Barbarians: the wagon moves again with all its points
      const M = Traders.turnMove(s, a.pid);
      M.mp += Traders.wagonLevel(s, a.pid).mp;
      M.stopped = false;
      break;
    }
    case 'yearOfPlenty':
      for (const r of a.res) giveFromBank(s, a.pid, r, 1);
      s.fx.push({ kind: 'fromBank', pid: a.pid, res: a.res });
      break;
    case 'monopoly': {
      let got = 0;
      const from = [];
      for (const o of s.players) {
        if (o.id === a.pid) continue;
        if (o.res[a.res]) from.push([o.id, o.res[a.res]]);
        got += o.res[a.res];
        o.stats.lost += o.res[a.res];
        o.res[a.res] = 0;
      }
      p.res[a.res] += got;
      s.fx.push({ kind: 'monopoly', pid: a.pid, res: a.res, from });
      log(s, msg('👑 @{p} se lleva {n} {r}.', { p: a.pid, n: got, r: resName(a.res) }), a.pid);
      break;
    }
  }
};

H.bankTrade = (s, a) => {
  assertMain(s, a);
  if (!cardsOf(s).includes(a.give) || !cardsOf(s).includes(a.get) || a.give === a.get) fail('Intercambio inválido.');
  const ratio = tradeRatio(s, a.pid, a.give);
  const p = s.players[a.pid];
  if (p.res[a.give] < ratio) fail(msg('Necesitas {n} de ese recurso.', { n: ratio }));
  if (s.bank[a.get] < 1) fail('El banco no tiene ese recurso.');
  p.res[a.give] -= ratio;
  s.bank[a.give] += ratio;
  p.res[a.get]++;
  s.bank[a.get]--;
  s.fx.push({ kind: 'bankTrade', pid: a.pid, give: a.give, n: ratio, get: a.get });
  log(s, msg('🏦 @{p} cambia {n}{give} por 1{get}.', { p: a.pid, n: ratio, give: resName(a.give), get: resName(a.get) }), a.pid);
};

const validOffer = (s, o) => o && cardsOf(s).every(r => Number.isInteger(o[r] || 0) && (o[r] || 0) >= 0);

H.proposeTrade = (s, a) => {
  assertMain(s, a);
  if (s.trade) fail('Ya hay una oferta abierta.');
  if (!validOffer(s, a.give) || !validOffer(s, a.get)) fail('Oferta inválida.');
  if (!handSize(a.give) || !handSize(a.get)) fail('La oferta debe dar y pedir algo.');
  if (cardsOf(s).some(r => (a.give[r] || 0) && (a.get[r] || 0))) fail('No puedes dar y pedir el mismo recurso.');
  if (!canAfford(s.players[a.pid].res, a.give)) fail('No tienes lo que ofreces.');
  const to = (a.to && a.to.length ? a.to : s.players.map(p => p.id)).filter(i => i !== a.pid && s.players[i] && !s.players[i].retired);
  if (!to.length) fail('Nadie a quien ofrecer.');
  const give = blankHand(s), get = blankHand(s);
  for (const r of cardsOf(s)) {
    give[r] = a.give[r] || 0;
    get[r] = a.get[r] || 0;
  }
  const p = s.players[a.pid];
  if (p.tradeTurn !== s.turn) p.tradeTurn = s.turn, p.tradeCount = 0;
  p.tradeCount++;
  s.trade = { id: ++s.tradeSeq, from: a.pid, give, get, to, responses: Object.fromEntries(to.map(i => [i, null])) };
  log(s, msg('🤝 @{p} ofrece un intercambio.', { p: a.pid }), a.pid);
};

H.respondTrade = (s, a) => {
  const t = s.trade;
  if (!t || !t.to.includes(a.pid)) fail('No hay oferta para ti.');
  if (a.tradeId != null && a.tradeId !== t.id) fail('Esa oferta ya no existe.');
  if (a.accept && !canAfford(s.players[a.pid].res, t.get)) fail('No tienes lo que te piden.');
  t.responses[a.pid] = a.accept ? 'accept' : 'reject';
};

H.confirmTrade = (s, a) => {
  const t = s.trade;
  if (!t || t.from !== a.pid) fail('No hay oferta tuya.');
  if (t.responses[a.with] !== 'accept') fail('Ese jugador no aceptó.');
  const p = s.players[a.pid], o = s.players[a.with];
  if (!canAfford(p.res, t.give) || !canAfford(o.res, t.get)) {
    s.trade = null;
    fail('Alguien ya no tiene los recursos.');
  }
  for (const r of cardsOf(s)) {
    p.res[r] += t.get[r] - t.give[r];
    o.res[r] += t.give[r] - t.get[r];
  }
  s.trade = null;
  s.fx.push({ kind: 'trade', a: a.pid, b: a.with, give: t.give, get: t.get });
  log(s, msg('🤝 @{p} y @{q} intercambian.', { p: a.pid, q: a.with }), a.pid);
};

H.cancelTrade = (s, a) => {
  if (!s.trade || s.trade.from !== a.pid) fail('No hay oferta tuya.');
  s.trade = null;
};

// next seat still in the game; `wrapped` when we pass the first player (new round)
export function nextActive(s, from) {
  const n = s.players.length;
  const pos = p => (p - s.first + n) % n;
  for (let k = 1; k <= n; k++) {
    const c = (from + k) % n;
    if (!s.players[c].retired) return { pid: c, wrapped: pos(c) <= pos(from) };
  }
  return { pid: from, wrapped: true };
}

function advanceTurn(s) {
  s.trade = null;
  const { pid, wrapped } = nextActive(s, s.current);
  s.current = pid;
  s.turn++;
  s.devPlayed = false;
  s.freeRoads = 0;
  Ships.resetShipTurn(s); // Seafarers only (no-op otherwise)
  s.phase = 'roll';
  if (wrapped) {
    s.round++;
    s.event = null;
    startRound(s);
  }
  log(s, msg('🎲 Turno de @{p}.', { p: s.current }), s.current);
}

H.endTurn = (s, a) => {
  assertMain(s, a);
  if (s.caravans && startCamelVote(s)) return; // Caravans: the vote comes first, then the next turn
  if (s.barbAttack) { baBattles(s); checkWin(s); if (s.phase === 'gameOver') return; } // Barbarian Attack: knights expel barbarians
  advanceTurn(s);
};

// ---- seat management (host only: disconnections, votes) ----
H.setController = (s, a) => {
  const p = s.players[a.pid];
  if (p.retired) fail('Ese jugador ya se retiró.');
  if (a.kind !== 'bot' && a.kind !== 'human') fail('Control inválido.');
  if (p.kind === a.kind) return;
  p.kind = a.kind;
  if (a.kind === 'bot') p.level = p.level || 'normal';
  log(s, a.kind === 'bot' ? msg('🤖 Un bot toma el control de @{p}.', { p: a.pid }) : msg('👋 @{p} vuelve a tomar el control.', { p: a.pid }), a.pid);
  s.fx.push({ kind: 'controller', pid: a.pid, to: a.kind });
};

H.retirePlayer = (s, a) => {
  const pid = a.pid;
  const p = s.players[pid];
  if (p.retired) fail('Ese jugador ya se retiró.');
  if (s.players.filter(x => !x.retired).length <= 2) fail('Tienen que quedar al menos 2 jugadores.');
  p.retired = true;
  // hand back to the bank, development cards leave the game
  for (const r of cardsOf(s)) {
    s.bank[r] += p.res[r];
    p.res[r] = 0;
  }
  p.dev = [];
  // pending secret placements go back to the box
  for (const b of s.blind.filter(x => x.pid === pid)) {
    if (b.type === 'city') p.citiesLeft++;
    else p.settlementsLeft++;
    if (b.eid != null) p.roadsLeft++;
  }
  s.blind = s.blind.filter(x => x.pid !== pid);
  // trades
  if (s.trade) {
    if (s.trade.from === pid) s.trade = null;
    else if (s.trade.to.includes(pid)) {
      s.trade.to = s.trade.to.filter(x => x !== pid);
      delete s.trade.responses[pid];
      if (!s.trade.to.length) s.trade = null;
    }
  }
  // awards
  if (s.largestArmy.owner === pid) {
    const act = s.players.filter(x => !x.retired && x.knights >= 3);
    const max = Math.max(0, ...act.map(x => x.knights));
    const top = act.filter(x => x.knights === max);
    s.largestArmy = top.length === 1 ? { owner: top[0].id, count: max } : { owner: -1, count: 0 };
  }
  updateLongestRoad(s);
  log(s, msg('🚪 @{p} se retira de la partida.', { p: pid }), pid);
  s.fx.push({ kind: 'retired', pid });
  // keep the game flowing
  delete s.pendingDiscards[pid];
  if (s.pillage && s.pillage[pid]) {
    delete s.pillage[pid];
    if (!Object.keys(s.pillage).length) s.pillage = null;
  }
  if (s.progressPick) s.progressPick = s.progressPick.filter(q => q !== pid);
  if (s.harbor && s.harbor.from === pid) s.harbor = null; // their turn ends anyway
  if (s.deserter && (s.deserter.from === pid || s.deserter.victim === pid)) {
    s.deserter = null;
    if (s.phase === 'deserter' || s.phase === 'deserterPlace') s.phase = 'main';
  }
  if (s.wedding && s.wedding.to === pid) s.wedding = null;
  else if (s.wedding && pid in s.wedding.pending) {
    delete s.wedding.pending[pid];
    if (s.phase === 'wedding') weddingDone(s);
  }
  else if (s.harbor && pid in s.harbor.pending) {
    delete s.harbor.pending[pid];
    if (s.phase === 'harbor') harborDone(s);
  }
  if (s.progressDiscard && s.progressDiscard[pid]) {
    delete s.progressDiscard[pid];
    if (!Object.keys(s.progressDiscard).length) s.progressDiscard = null;
  }
  if (['pillage', 'progressPick', 'progressDiscard'].includes(s.phase)) resumeRoll(s);
  if (s.displaced && s.displaced.pid === pid) {
    s.players[pid].knightsLeft[s.displaced.level]++;
    s.displaced = null;
    if (s.phase === 'displace') s.phase = s.displacedReturn || 'main';
  }
  if (s.pendingAqueduct) {
    delete s.pendingAqueduct[pid];
    if (s.phase === 'aqueduct' && !Object.keys(s.pendingAqueduct).length) s.phase = 'main';
  }
  if (s.phase === 'setup') {
    const st = s.setup;
    const cur = st.queue[st.idx];
    st.queue = st.queue.filter((e, i) => i <= st.idx || e.pid !== pid);
    if (cur.pid === pid) {
      st.queue.splice(st.idx, 1);
      if (st.idx < st.queue.length) {
        const nx = st.queue[st.idx];
        s.current = nx.pid;
        st.step = nx.roadOnly ? 'road' : 'settlement';
        st.lastVid = nx.roadOnly ? nx.vid : null;
      } else {
        st.step = 'settlement';
        st.lastVid = null;
        if (!st.fixing && st.blindActive) {
          resolveBlind(s);
          if (s.phase === 'setup') return;
        }
        beginTurns(s);
      }
    }
    return;
  }
  if (s.phase === 'discard' && !Object.keys(s.pendingDiscards).length) s.phase = afterSeven(s);
  if (s.current === pid && s.phase !== 'gameOver') {
    s.pendingDiscards = {};
    advanceTurn(s);
  }
};

// someone beat the ADHD arcade (the minigames for the wait): any seat, any time. It counts the wins
// of this match (their pieces get gold trims) and sets off the fireworks for everyone
H.adhdWin = (s, a) => {
  const p = s.players[a.pid];
  p.adhdWins = (p.adhdWins || 0) + 1;
  s.fx.push({ kind: 'cheer', pid: a.pid, n: p.adhdWins });
};

// actions that leave the trade on the table when the current player makes them
const TRADE_ACTIONS = new Set(['proposeTrade', 'respondTrade', 'confirmTrade', 'cancelTrade', 'adhdWin']);

export function applyAction(s, a) {
  s.fx = [];
  try {
    const h = H[a && a.type];
    if (!h) fail('Acción desconocida.');
    if (typeof a.pid !== 'number' || !s.players[a.pid]) fail('Jugador inválido.');
    if (s.phase === 'gameOver') fail('La partida terminó.');
    if (s.trade && a.pid === s.current && !TRADE_ACTIONS.has(a.type)) s.trade = null;
    h(s, a);
    s.actions++;
    if (s.harbormaster && s.phase !== 'gameOver') updateHarbormaster(s); // Harbormaster variant
    checkWin(s);
    return { ok: true };
  } catch (e) {
    if (e instanceof Blocked) {
      s.actions++;
      return { ok: true, blocked: true };
    }
    if (e instanceof GameError) return { ok: false, error: e.m };
    throw e;
  }
}

export { TILE_INFO };
