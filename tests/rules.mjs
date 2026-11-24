// Targeted rule tests. Usage: node tests/rules.mjs
import * as G from '../js/engine/game.js';
import { defaultConfig, MODES } from '../js/engine/config.js';
import { botAct } from '../js/engine/bot.js';
import { seafarersOn, citiesKnightsOn, tradersBarbariansOn, tbScenarioOn, EXPANSIONS } from '../js/engine/expansions.js';
import { SCENARIOS } from '../js/engine/seafarers/scenarios.js';
import * as Fish from '../js/engine/tradersBarbarians/fishermen.js';
import * as Rivers from '../js/engine/tradersBarbarians/rivers.js';
import * as Caravans from '../js/engine/tradersBarbarians/caravans.js';
import * as Traders from '../js/engine/tradersBarbarians/traders.js';
import * as EvCards from '../js/engine/eventCards.js';
import * as BarbAttack from '../js/engine/tradersBarbarians/barbarianAttack.js';
import { TB_SCENARIOS } from '../js/engine/tradersBarbarians/scenarios.js';
import * as Ships from '../js/engine/seafarers/ships.js';
import * as Islands from '../js/engine/seafarers/islands.js';
import * as Improve from '../js/engine/citiesKnights/improvements.js';
import * as Knights from '../js/engine/citiesKnights/knights.js';
import * as Progress from '../js/engine/citiesKnights/progress.js';
import * as Science from '../js/engine/citiesKnights/science.js';
import * as Politics from '../js/engine/citiesKnights/politics.js';
import { seaTileEdges } from '../js/engine/seafarers/pirate.js';

let pass = 0, failN = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
  } catch (e) {
    failN++;
    console.log('❌', name, '\n   ', e.message);
  }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
};
const ok = (c, m) => {
  if (!c) throw new Error(m || 'falló');
};

function fresh(mut) {
  const c = defaultConfig();
  c.seed = 99;
  c.rules.randomStart = false;
  c.players.forEach(p => (p.kind = 'bot'));
  if (mut) mut(c);
  const s = G.createGame(c);
  // skip setup: jump straight into main phase with empty board
  s.phase = 'main';
  s.turn = 1;
  s.round = 1;
  s.current = 0;
  s.setup.blindActive = false;
  return s;
}
const give = (s, pid, res) => {
  for (const [r, n] of Object.entries(res)) {
    s.players[pid].res[r] += n;
    s.bank[r] -= n;
  }
};
const act = (s, a) => G.applyAction(s, a);

// a path of edges: walk vertex -> neighbor greedily avoiding revisits
function path(s, len, start = 0) {
  const bd = s.board;
  const edges = [];
  const seen = new Set([start]);
  let v = start;
  for (let i = 0; i < len; i++) {
    const e = bd.vertices[v].edges.find(e => {
      const E = bd.edges[e];
      const u = E.a === v ? E.b : E.a;
      return !seen.has(u) && !edges.includes(e);
    });
    if (e === undefined) break;
    const E = bd.edges[e];
    v = E.a === v ? E.b : E.a;
    seen.add(v);
    edges.push(e);
  }
  return { edges, verts: [...seen] };
}

t('camino más largo: 5 tramos otorgan +2 y cortar con poblado lo quita', () => {
  const s = fresh();
  const { edges, verts } = path(s, 6);
  s.buildings[verts[0]] = { owner: 0, type: 'settlement' };
  s.players[0].settlementsLeft--;
  for (let i = 0; i < 5; i++) {
    give(s, 0, { wood: 1, brick: 1 });
    const r = act(s, { type: 'build', pid: 0, what: 'road', at: edges[i] });
    ok(r.ok, r.error);
  }
  eq(s.longestRoad.owner, 0, 'dueño');
  eq(s.players[0].roadLen, 5, 'largo');
  eq(G.victoryPoints(s, 0), 3, 'PV');
  // opponent settles in the middle of the road (vertex 3), via own road from outside
  const mid = [verts[2], verts[3], verts[1], verts[4]].find(v => s.board.vertices[v].edges.some(e => s.roads[e] === undefined));
  s.buildings[mid] = { owner: 1, type: 'settlement' };
  s.current = 1;
  // trigger recompute through a legal action: build a road for player 1 next to mid
  const e1 = s.board.vertices[mid].edges.find(e => s.roads[e] === undefined);
  give(s, 1, { wood: 1, brick: 1 });
  const r = act(s, { type: 'build', pid: 1, what: 'road', at: e1 });
  ok(r.ok, r.error);
  ok(s.players[0].roadLen < 5, 'debería romperse: ' + s.players[0].roadLen);
  eq(s.longestRoad.owner, -1, 'nadie');
});

t('regla de distancia y conexión de poblados', () => {
  const s = fresh();
  const v = 10;
  s.buildings[v] = { owner: 1, type: 'settlement' };
  const nb = s.board.vertices[v].adj[0];
  ok(!G.canSetupSettlement({ ...s, setup: { ...s.setup, blindActive: false } }, 0, nb), 'adyacente no permitido');
  give(s, 0, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  const r = act(s, { type: 'build', pid: 0, what: 'settlement', at: 30 });
  ok(!r.ok, 'sin camino no se puede');
});

t('producción: poblado 1, ciudad 2, ladrón bloquea', () => {
  const s = fresh();
  const tile = s.board.tiles.find(x => x.num === 8);
  const [v1, , v3] = tile.verts;
  s.buildings[v1] = { owner: 0, type: 'settlement' };
  s.buildings[v3] = { owner: 1, type: 'city' };
  s.phase = 'roll';
  s.config.rules.diceMode = 'balanced';
  s.diceDeck = [[3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 4]];
  const b0 = s.players[0].res[tile.res], b1 = s.players[1].res[tile.res];
  act(s, { type: 'roll', pid: 0 });
  eq(s.players[0].res[tile.res] - b0, 1, 'poblado');
  eq(s.players[1].res[tile.res] - b1, 2, 'ciudad');
  s.board.robber = tile.id;
  s.phase = 'roll';
  act(s, { type: 'roll', pid: 0 });
  eq(s.players[0].res[tile.res] - b0, 1, 'bloqueado por ladrón');
});

t('7: descarta la mitad quien supera el límite', () => {
  const s = fresh();
  give(s, 1, { wood: 5, ore: 4 });
  give(s, 2, { wheat: 7 });
  s.phase = 'roll';
  s.config.rules.diceMode = 'balanced';
  s.diceDeck = Array(7).fill([3, 4]);
  act(s, { type: 'roll', pid: 0 });
  eq(s.phase, 'discard');
  eq(s.pendingDiscards, { 1: 4 });
  ok(!act(s, { type: 'discard', pid: 1, res: { wood: 3 } }).ok, 'cantidad incorrecta');
  ok(act(s, { type: 'discard', pid: 1, res: { wood: 2, ore: 2 } }).ok);
  eq(s.phase, 'robber');
});

t('ladrón: roba a una víctima adyacente', () => {
  const s = fresh();
  const tile = s.board.tiles.find(x => x.id !== s.board.robber);
  s.buildings[tile.verts[0]] = { owner: 2, type: 'settlement' };
  give(s, 2, { brick: 1 });
  s.phase = 'robber';
  const r = act(s, { type: 'moveRobber', pid: 0, tile: tile.id });
  ok(r.ok, r.error);
  eq(s.players[0].res.brick, 1);
  eq(s.players[2].res.brick, 0);
  eq(s.phase, 'main');
});

t('puertos: 3:1 y 2:1', () => {
  const s = fresh();
  const p2 = s.board.ports.find(p => p.type !== 'any');
  const v = s.board.edges[p2.edge].a;
  s.buildings[v] = { owner: 0, type: 'settlement' };
  eq(G.tradeRatio(s, 0, p2.type), 2);
  eq(G.tradeRatio(s, 1, p2.type), 4);
  give(s, 0, { [p2.type]: 2 });
  const other = ['wood', 'brick', 'sheep', 'wheat', 'ore'].find(r => r !== p2.type);
  ok(act(s, { type: 'bankTrade', pid: 0, give: p2.type, get: other }).ok);
  eq(s.players[0].res[other], 1);
});

t('cartas de desarrollo: no se juegan el turno en que se compran', () => {
  const s = fresh();
  s.devDeck.push('knight');
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  ok(act(s, { type: 'buyDev', pid: 0 }).ok);
  ok(!act(s, { type: 'playDev', pid: 0, card: 'knight' }).ok, 'no debería poder');
  s.turn = 5;
  ok(act(s, { type: 'playDev', pid: 0, card: 'knight' }).ok);
  eq(s.phase, 'robber');
  s.phase = 'main';
  s.players[0].dev.push({ type: 'monopoly', turn: 0 });
  ok(!act(s, { type: 'playDev', pid: 0, card: 'monopoly', res: 'ore' }).ok, 'solo una por turno');
});

t('monopolio y año de abundancia', () => {
  const s = fresh();
  give(s, 1, { ore: 3 });
  give(s, 2, { ore: 2 });
  s.players[0].dev.push({ type: 'monopoly', turn: 0 });
  ok(act(s, { type: 'playDev', pid: 0, card: 'monopoly', res: 'ore' }).ok);
  eq(s.players[0].res.ore, 5);
  const s2 = fresh();
  s2.players[0].dev.push({ type: 'yearOfPlenty', turn: 0 });
  ok(act(s2, { type: 'playDev', pid: 0, card: 'yearOfPlenty', res: ['wood', 'wood'] }).ok);
  eq(s2.players[0].res.wood, 2);
});

t('ejército más grande con 3 caballeros', () => {
  const s = fresh(c => (c.rules.noRobber = true));
  for (let i = 0; i < 3; i++) {
    s.players[0].dev.push({ type: 'knight', turn: 0 });
    s.devPlayed = false;
    ok(act(s, { type: 'playDev', pid: 0, card: 'knight' }).ok);
  }
  eq(s.largestArmy.owner, 0);
  eq(G.victoryPoints(s, 0), 2);
});

t('escasez del banco: nadie cobra si no alcanza para todos', () => {
  const s = fresh();
  const tile = s.board.tiles.find(x => x.num === 6);
  s.buildings[tile.verts[0]] = { owner: 0, type: 'city' };
  s.buildings[tile.verts[3]] = { owner: 1, type: 'city' };
  const r = tile.res;
  const extra = s.bank[r] - 3;
  s.players[2].res[r] += extra;
  s.bank[r] = 3;
  s.phase = 'roll';
  s.config.rules.diceMode = 'balanced';
  s.diceDeck = Array(7).fill([3, 3]);
  act(s, { type: 'roll', pid: 0 });
  eq(s.players[0].res[r], 0);
  eq(s.bank[r], 3);
});

t('victoria solo en tu turno', () => {
  const s = fresh(c => (c.rules.vpTarget = 3));
  for (const v of [0, 20, 40]) s.buildings[v] = { owner: 1, type: 'settlement' };
  give(s, 0, { wood: 4 });
  ok(act(s, { type: 'bankTrade', pid: 0, give: 'wood', get: 'ore' }).ok);
  eq(s.phase, 'main', 'P1 no gana en el turno de P0');
  act(s, { type: 'endTurn', pid: 0 });
  eq(s.winner, 1, 'gana al empezar su turno');
  eq(s.phase, 'gameOver');
});

t('intercambio entre jugadores', () => {
  const s = fresh();
  give(s, 0, { wood: 2 });
  give(s, 1, { ore: 1 });
  ok(act(s, { type: 'proposeTrade', pid: 0, give: { wood: 2 }, get: { ore: 1 }, to: [1, 2] }).ok);
  ok(!act(s, { type: 'respondTrade', pid: 2, accept: true }).ok, 'P2 no tiene mineral');
  ok(act(s, { type: 'respondTrade', pid: 1, accept: true }).ok);
  ok(act(s, { type: 'confirmTrade', pid: 0, with: 1 }).ok);
  eq(s.players[0].res.ore, 1);
  eq(s.players[1].res.wood, 2);
});

t('blindfold: choque en el mismo vértice obliga a reubicar', () => {
  const c = defaultConfig();
  c.seed = 5;
  c.rules.randomStart = false;
  c.modes.blindfold = true;
  c.players = c.players.slice(0, 2);
  const s = G.createGame(c);
  const v = 12;
  const e0 = s.board.vertices[v].edges[0];
  ok(act(s, { type: 'placeSettlement', pid: 0, vid: v }).ok);
  ok(act(s, { type: 'placeRoad', pid: 0, eid: e0 }).ok);
  ok(act(s, { type: 'placeSettlement', pid: 1, vid: v }).ok, 'P1 no ve la casa de P0');
  ok(act(s, { type: 'placeRoad', pid: 1, eid: s.board.vertices[v].edges[1] }).ok);
  eq(Object.keys(s.buildings).length, 0, 'nada visible todavía');
  const far = s.board.vertices.filter(x => x.id !== v && !x.adj.includes(v) && !s.board.vertices[v].adj.some(u => x.adj.includes(u)));
  const a1 = far[5].id, a2 = far.find(x => x.id !== a1 && !x.adj.includes(a1) && !x.adj.some(u => far[5].adj.includes(u))).id;
  ok(act(s, { type: 'placeSettlement', pid: 1, vid: a1 }).ok, 'P1 ronda 2');
  ok(act(s, { type: 'placeRoad', pid: 1, eid: s.board.vertices[a1].edges[0] }).ok);
  ok(act(s, { type: 'placeSettlement', pid: 0, vid: a2 }).ok, 'P0 ronda 2');
  ok(act(s, { type: 'placeRoad', pid: 0, eid: s.board.vertices[a2].edges[0] }).ok);
  eq(s.phase, 'setup', 'fase de reubicación');
  ok(s.setup.fixing, 'reubicando');
  eq(s.current, 1, 'P1 reubica');
  eq(s.buildings[v].owner, 0, 'P0 llegó primero');
});

t('volteado: casillas boca abajo durante la colocación, casas visibles, y se voltea todo al terminar', () => {
  const c = defaultConfig();
  c.seed = 8;
  c.rules.randomStart = false;
  c.modes.flipped = true;
  c.players = c.players.slice(0, 2).map(p => ({ ...p, kind: 'bot' }));
  const s = G.createGame(c);
  ok(s.board.tiles.every(t => !t.revealed), 'todo boca abajo');
  ok(act(s, { type: 'placeSettlement', pid: 0, vid: 12 }).ok);
  eq(s.buildings[12].owner, 0, 'la casa es visible para todos');
  ok(s.board.tiles.every(t => !t.revealed), 'poner casa no revela');
  ok(act(s, { type: 'placeRoad', pid: 0, eid: G.legalSetupRoads(s, 0)[0] }).ok);
  for (const pid of [1, 1, 0]) {
    const v = G.legalSetupSettlements(s, pid)[5];
    ok(act(s, { type: 'placeSettlement', pid, vid: v }).ok);
    ok(act(s, { type: 'placeRoad', pid, eid: G.legalSetupRoads(s, pid)[0] }).ok);
  }
  eq(s.phase, 'roll');
  ok(s.board.tiles.every(t => t.revealed && t.numRevealed), 'todo volteado');
  ok(s.fx.some(f => f.kind === 'flipAll'), 'animación de volteo');
});

t('niebla: solo ves lo tuyo; construir sobre alguien oculto te desvía al hueco más cercano', () => {
  const c = defaultConfig();
  c.seed = 3;
  c.rules.randomStart = false;
  c.modes.fog = true;
  c.players = c.players.slice(0, 2).map(p => ({ ...p, kind: 'bot' }));
  const s = G.createGame(c);
  const v0 = s.board.vertices.find(x => x.hexes.length === 3).id;
  ok(act(s, { type: 'placeSettlement', pid: 0, vid: v0 }).ok);
  ok(act(s, { type: 'placeRoad', pid: 0, eid: G.legalSetupRoads(s, 0)[0] }).ok);
  const v1 = G.viewFor(s, 1);
  eq(Object.keys(v1.buildings).length, 0, 'P1 no ve la casa de P0');
  ok(v1.board.tiles.every(t => !t.numRevealed), 'P1 lo ve todo oscuro');
  eq(G.viewFor(s, 0).board.tiles.filter(t => t.numRevealed).length, 3, 'P0 ve sus 3 casillas');
  const target = s.board.vertices[v0].adj[0];
  const r = act(s, { type: 'placeSettlement', pid: 1, vid: target });
  ok(r.ok, r.error);
  ok(s.fx.some(f => f.kind === 'relocated'), 'se desvió');
  const placed = Object.keys(s.buildings).map(Number).find(v => s.buildings[v].owner === 1);
  ok(placed !== target, 'no quedó donde apuntó');
  ok(!s.board.vertices[placed].adj.some(u => s.buildings[u]), 'respeta la distancia');
  ok(G.viewFor(s, 1).buildings[v0], 'P1 descubrió la casa de P0');
});

t('retirarse en su turno: pasa al siguiente, devuelve su mano y pierde premios', () => {
  const s = fresh();
  give(s, 0, { wood: 3, ore: 2 });
  s.largestArmy = { owner: 0, count: 3 };
  s.players[0].knights = 3;
  s.players[2].knights = 4;
  const bankWood = s.bank.wood;
  ok(act(s, { type: 'retirePlayer', pid: 0 }).ok);
  ok(s.players[0].retired);
  eq(s.current, 1, 'turno del siguiente');
  eq(s.phase, 'roll');
  eq(s.bank.wood, bankWood + 3, 'mano al banco');
  eq(s.largestArmy.owner, 2, 'el ejército pasa al que más tiene');
  // turn order skips the retired seat
  s.phase = 'main';
  s.current = 3;
  ok(act(s, { type: 'endTurn', pid: 3 }).ok);
  eq(s.current, 1, 'salta al retirado');
  eq(s.round, 2, 'nueva ronda al dar la vuelta');
});

t('retirarse durante la colocación inicial y relevo por bot', () => {
  const c = defaultConfig();
  c.seed = 11;
  c.rules.randomStart = false;
  c.players = c.players.map(p => ({ ...p, kind: 'bot' }));
  const s = G.createGame(c);
  ok(act(s, { type: 'retirePlayer', pid: 0 }).ok, 'retira al que coloca');
  eq(s.current, 1);
  ok(s.setup.queue.every((e, i) => i < s.setup.idx || e.pid !== 0), 'sin turnos pendientes del retirado');
  ok(act(s, { type: 'setController', pid: 1, kind: 'human' }).ok);
  eq(s.players[1].kind, 'human');
  ok(act(s, { type: 'retirePlayer', pid: 2 }).ok);
  ok(!act(s, { type: 'retirePlayer', pid: 3 }).ok, 'deben quedar 2');
});

t('ADHD: la victoria cuenta para cualquiera, en cualquier momento, y no corta el trato', () => {
  const s = fresh();
  give(s, 0, { wood: 1 });
  ok(act(s, { type: 'proposeTrade', pid: 0, give: { wood: 1 }, get: { brick: 1 } }).ok, 'oferta');
  ok(act(s, { type: 'adhdWin', pid: 0 }).ok);
  ok(act(s, { type: 'adhdWin', pid: 2 }).ok, 'fuera de turno también');
  ok(act(s, { type: 'adhdWin', pid: 0 }).ok);
  eq(s.players.map(p => p.adhdWins), [2, 0, 1, 0]);
  ok(s.trade, 'el trato sigue en la mesa');
  eq(s.fx, [{ kind: 'cheer', pid: 0, n: 2 }]);
});

t('6 jugadores humanos en mapa extendido: colocación inicial y primer turno', () => {
  const c = defaultConfig();
  c.seed = 7;
  c.rules.randomStart = false;
  c.map.shape = 'extended';
  const colors = ['#e53935', '#1e88e5', '#ff9800', '#f5f5f5', '#43a047', '#8e24aa'];
  c.players = colors.map((color, i) => ({ name: 'P' + (i + 1), kind: 'human', color }));
  const s = G.createGame(c);
  eq(s.players.length, 6, 'asientos');
  eq(s.board.tiles.length, 30, 'hexágonos del extendido');
  eq(s.phase, 'setup');
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 80) {
    const pid = G.pendingActors(s)[0];
    if (s.setup.step === 'settlement') {
      const vids = G.legalSetupSettlements(s, pid);
      ok(vids.length, 'sitios de poblado para ' + pid);
      ok(act(s, { type: 'placeSettlement', pid, vid: vids[0] }).ok, 'poblado');
    } else {
      const eids = G.legalSetupRoads(s, pid);
      ok(eids.length, 'sitios de camino para ' + pid);
      ok(act(s, { type: 'placeRoad', pid, eid: eids[0] }).ok, 'camino');
    }
  }
  ok(s.phase !== 'setup', 'terminó la colocación');
  eq(Object.keys(s.buildings).length, 12, '12 poblados');
  eq(Object.keys(s.roads).length, 12, '12 caminos');
  eq(s.phase, 'roll');
  eq(s.current, 0, 'empieza el asiento 0');
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'primera tirada');
  if (s.phase === 'main') ok(act(s, { type: 'endTurn', pid: 0 }).ok, 'cierra el turno');
  ok(['main', 'discard', 'robber', 'roll'].includes(s.phase), 'la partida avanza: ' + s.phase);
});

t('historial de tiradas: quién y cuánto, como mucho 30', () => {
  const s = fresh();
  for (let i = 0; i < 35; i++) {
    s.phase = 'roll';
    s.current = i % 4;
    ok(act(s, { type: 'roll', pid: s.current }).ok);
    s.pendingDiscards = {};
  }
  eq(s.rollLog.length, 30);
  const last = s.rollLog[29];
  eq(last.pid, 34 % 4);
  eq(last.sum, s.dice[0] + s.dice[1]);
});

// ---------- expansions: with everything off the base game must not change ----------
// plays a whole bot-only game (bots are deterministic: the RNG lives in the state)
function botGame(mut) {
  const c = defaultConfig();
  c.seed = 2024;
  c.players.forEach(p => (p.kind = 'bot'));
  if (mut) mut(c);
  const s = G.createGame(c);
  for (let n = 0; n < 4000 && s.winner == null; n++) {
    const a = botAct(s, G.pendingActors(s)[0]);
    if (!a) break;
    G.applyAction(s, a);
  }
  const { config, ...rest } = s;
  return rest;
}

t('expansiones: todas apagadas por defecto', () => {
  eq(defaultConfig().expansions, { seafarers: false, citiesKnights: false, tradersBarbarians: false, scenario: 'newShores', tbScenario: 'fishermen' });
  ok(!seafarersOn(G.createGame(defaultConfig())), 'Navegantes apagado');
});

t('expansiones: config antigua (sin bloque) = expansiones apagadas, partida idéntica', () => {
  const legacy = botGame(c => delete c.expansions);
  const off = botGame(c => (c.expansions = { seafarers: false }));
  eq(off, legacy, 'misma partida');
  const s = G.createGame((() => { const c = defaultConfig(); delete c.expansions; return c; })());
  eq(s.config.expansions, { seafarers: false, citiesKnights: false, tradersBarbarians: false, scenario: 'newShores', tbScenario: 'fishermen' }, 'se rellena el bloque');
});

t('Navegantes: el interruptor llega al estado', () => {
  const c = defaultConfig();
  c.expansions.seafarers = true;
  const s = G.createGame(c);
  ok(seafarersOn(s), 'activado en el estado');
  ok(s.log.some(l => JSON.stringify(l).includes('Navegantes')), 'aviso en el historial');
});

// ---------- Seafarers: board data ----------
function seaGame(scenario, seed = 7) {
  const c = defaultConfig();
  c.seed = seed;
  c.expansions = { seafarers: true, scenario };
  c.players.forEach(p => (p.kind = 'bot'));
  return G.createGame(c);
}

t('Navegantes: el tablero base no tiene datos de mar', () => {
  const b = G.createGame(defaultConfig()).board;
  ok(b.islands === undefined && b.pirate === undefined && b.scenario === undefined, 'sin campos nuevos');
  ok(b.edges.every(e => e.kind === undefined && e.hexes.length > 0), 'todas las aristas con tierra');
});

for (const id of Object.keys(SCENARIOS))
  t(`Navegantes: escenario ${id} genera mar, islas y pirata`, () => {
    const s = seaGame(id);
    const b = s.board;
    eq(b.scenario, id);
    ok(b.sea.length > 0 && b.sea.every((t, i) => t.id === i && t.kind === 'sea' && t.verts.length === 6), 'casillas de mar con id y vértices');
    const kinds = new Set(b.edges.map(e => e.kind));
    for (const k of ['land', 'coast', 'sea', 'frame']) ok(kinds.has(k), 'hay aristas ' + k);
    ok(b.edges.every(e => e.hexes.length + e.sea.length >= 1 && e.hexes.length + e.sea.length <= 2), 'cada arista toca 1-2 casillas');
    ok(b.islands.length >= 2, 'varias islas: ' + b.islands.length);
    ok(b.islands.some(i => i.home), 'al menos una isla de salida');
    ok(b.pirate >= 0 && b.sea[b.pirate], 'pirata en el mar');
    // nothing can be built on open sea
    const seaV = b.vertices.filter(v => !v.hexes.length).map(v => v.id);
    ok(seaV.length > 0, 'hay vértices de mar');
    ok(G.legalSetupSettlements(s, s.current).every(v => b.vertices[v].hexes.length > 0), 'colocación inicial solo en tierra');
    // same seed, same board
    eq(JSON.stringify(seaGame(id).board), JSON.stringify(b), 'determinista');
  });

t('Navegantes: islas de la niebla reparte la niebla según el escenario', () => {
  const b = seaGame('fogIslands').board;
  const pool = SCENARIOS.fogIslands.fogPool;
  eq(b.tiles.filter(t => t.fog).length, pool.land + pool.gold, 'tierra bajo la niebla');
  eq(b.sea.filter(t => t.fog).length, pool.sea, 'mar bajo la niebla');
});

t('Navegantes: el desierto parte el continente', () => {
  const b = seaGame('desert').board;
  ok(b.tiles.filter(t => t.res === 'desert').every(t => t.island === -1), 'el desierto no es de ninguna isla');
  ok(b.islands.filter(i => !i.home).length >= 2, 'tierras al otro lado + islas');
});

// ---------- Seafarers: ships ----------
// main phase on a Seafarers board, empty
function seaMain(scenario = 'newShores') {
  const s = seaGame(scenario);
  s.phase = 'main';
  s.turn = 1;
  s.round = 1;
  s.current = 0;
  s.setup.blindActive = false;
  return s;
}
// a coastal corner v with a coast edge e1 = v-u and a further water edge e2 from u
function coastSpot(s) {
  const bd = s.board;
  for (const V of bd.vertices) {
    if (!V.hexes.some(h => bd.tiles[h].home)) continue; // home land: initial placement allowed
    for (const e1 of V.edges) {
      if (bd.edges[e1].kind !== 'coast') continue;
      const E = bd.edges[e1], u = E.a === V.id ? E.b : E.a;
      const e2 = bd.vertices[u].edges.find(x => x !== e1 && ['coast', 'sea'].includes(bd.edges[x].kind));
      const land = V.edges.find(x => bd.edges[x].kind === 'land');
      if (e2 !== undefined && land !== undefined) return { v: V.id, u, e1, e2, land };
    }
  }
  throw new Error('no coast spot');
}

t('Navegantes: sin la expansión no hay barcos', () => {
  const s = fresh();
  ok(s.ships === undefined && s.players[0].shipsLeft === undefined, 'sin estado de barcos');
  ok(!act(s, { type: 'build', pid: 0, what: 'ship', at: 0 }).ok, 'construir barco falla');
  ok(!act(s, { type: 'moveShip', pid: 0, from: 0, to: 1 }).ok, 'mover barco falla');
});

t('Navegantes: construir un barco cuesta madera + lana y sale de tu poblado por el agua', () => {
  const s = seaMain();
  const { v, e1, e2, land } = coastSpot(s);
  eq(s.players[0].shipsLeft, 15);
  ok(!Ships.canBuildShip(s, 0, e1), 'sin poblado no conecta');
  s.buildings[v] = { owner: 0, type: 'settlement' };
  ok(!Ships.canBuildShip(s, 0, land), 'no en arista de tierra');
  ok(Ships.canBuildShip(s, 0, e1), 'arista de costa junto al poblado');
  ok(!act(s, { type: 'build', pid: 0, what: 'ship', at: e1 }).ok, 'sin recursos falla');
  give(s, 0, { wood: 1, sheep: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: e1 }).ok, 'construye');
  eq(s.ships[e1], 0);
  eq(s.players[0].shipsLeft, 14);
  eq(s.players[0].res.wood + s.players[0].res.sheep, 0, 'pagó');
  ok(Ships.canBuildShip(s, 0, e2), 'el siguiente barco sigue la ruta');
  ok(!G.canBuildRoad(s, 0, e1), 'no hay camino donde hay barco');
});

t('Navegantes: se puede fundar un poblado donde llega un barco', () => {
  const s = seaMain();
  const { v, e1 } = coastSpot(s);
  ok(!G.canBuildSettlement(s, 0, v), 'sin conexión no');
  s.ships[e1] = 0;
  ok(G.canBuildSettlement(s, 0, v), 'con barco sí');
});

t('Navegantes: caminos y barcos solo se enlazan en un poblado', () => {
  const s = seaMain();
  const { v, u, e1, land } = coastSpot(s);
  // a road ends at v without a building: a ship can't continue from it
  s.roads[land] = 0;
  ok(!Ships.canBuildShip(s, 0, e1), 'del final de un camino no sale un barco');
  s.buildings[v] = { owner: 0, type: 'settlement' };
  ok(Ships.canBuildShip(s, 0, e1), 'con poblado sí');
  // and a road can't continue from a ship end
  s.ships[e1] = 0;
  const roadAtU = s.board.vertices[u].edges.find(x => x !== e1 && s.board.edges[x].hexes.length);
  if (roadAtU !== undefined) ok(!G.canBuildRoad(s, 0, roadAtU), 'del final de un barco no sale un camino');
});

t('Navegantes: colocación inicial con barco en vez de camino', () => {
  const s = seaGame('newShores');
  const pid = s.current;
  const { v, e1, land } = coastSpot(s);
  ok(act(s, { type: 'placeSettlement', pid, vid: v }).ok, 'poblado');
  ok(!act(s, { type: 'placeShip', pid, eid: land }).ok, 'barco en tierra no');
  ok(act(s, { type: 'placeShip', pid, eid: e1 }).ok, 'barco en la costa');
  eq(s.ships[e1], pid);
  eq(s.players[pid].shipsLeft, 14);
  ok(s.current !== pid || s.setup.idx === 1, 'pasa al siguiente');
});

t('Navegantes: mover un barco del extremo abierto, una vez por turno', () => {
  const s = seaMain();
  const { v, e1, e2 } = coastSpot(s);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  give(s, 0, { wood: 2, sheep: 2 });
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: e1 }).ok);
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: e2 }).ok);
  eq(Ships.movableShips(s, 0), [], 'recién construidos no se mueven');
  act(s, { type: 'endTurn', pid: 0 });
  // next turn of player 0
  s.phase = 'main';
  s.current = 0;
  eq(Ships.movableShips(s, 0), [e2], 'solo el del extremo abierto');
  const to = Ships.shipDestinations(s, 0, e2).find(x => x !== e2);
  ok(to !== undefined, 'tiene destinos');
  ok(act(s, { type: 'moveShip', pid: 0, from: e2, to }).ok, 'mueve');
  ok(s.ships[e2] === undefined && s.ships[to] === 0, 'el barco cambió de sitio');
  eq(Ships.movableShips(s, 0), [], 'uno por turno');
  ok(!act(s, { type: 'moveShip', pid: 0, from: to, to: e2 }).ok, 'el segundo movimiento falla');
});

t('Navegantes: una ruta cerrada entre dos poblados no se mueve', () => {
  const s = seaMain();
  const { v, u, e1 } = coastSpot(s);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  s.buildings[u] = { owner: 0, type: 'settlement' };
  s.ships[e1] = 0;
  s.players[0].shipsLeft--;
  eq(Ships.movableShips(s, 0), [], 'cerrada');
});

t('Navegantes: la ruta más larga suma caminos y barcos (cambio solo en poblado)', () => {
  const s = seaMain();
  const bd = s.board;
  // a chain of 3 roads ending at a coastal corner, then 3 ships
  const { v } = coastSpot(s);
  const roads = [], used = new Set([v]);
  let at = v;
  for (let i = 0; i < 3; i++) {
    const e = bd.vertices[at].edges.find(x => bd.edges[x].kind === 'land' && !roads.includes(x) && !used.has(bd.edges[x].a === at ? bd.edges[x].b : bd.edges[x].a));
    if (e === undefined) break;
    roads.push(e);
    at = bd.edges[e].a === at ? bd.edges[e].b : bd.edges[e].a;
    used.add(at);
  }
  const ships = [];
  at = v;
  for (let i = 0; i < 3; i++) {
    const e = bd.vertices[at].edges.find(x => ['coast', 'sea'].includes(bd.edges[x].kind) && !ships.includes(x) && !used.has(bd.edges[x].a === at ? bd.edges[x].b : bd.edges[x].a));
    if (e === undefined) break;
    ships.push(e);
    at = bd.edges[e].a === at ? bd.edges[e].b : bd.edges[e].a;
    used.add(at);
  }
  ok(roads.length === 3 && ships.length === 3, 'cadena montada');
  for (const e of roads) s.roads[e] = 0;
  for (const e of ships) s.ships[e] = 0;
  give(s, 0, { wood: 1, brick: 1 });
  // without a settlement at the junction they don't add up
  const extra = bd.vertices[at].edges.find(x => ['coast', 'sea'].includes(bd.edges[x].kind) && !ships.includes(x));
  s.ships[extra] = 0; // one more ship so the longest-road update runs with 4 ships
  ok(act(s, { type: 'build', pid: 0, what: 'road', at: G.legalRoads(s, 0)[0] }).ok);
  ok(s.players[0].roadLen <= 4 + 1, 'sin poblado no se suman: ' + s.players[0].roadLen);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  give(s, 0, { wood: 1, sheep: 1 });
  const sh = Ships.legalShips(s, 0)[0];
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: sh }).ok);
  ok(s.players[0].roadLen >= 7, 'con poblado se suman: ' + s.players[0].roadLen);
});

t('Navegantes: construcción de caminos permite barcos gratis', () => {
  const s = seaMain();
  const { v, e1 } = coastSpot(s);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  s.players[0].dev.push({ type: 'roadBuilding', turn: 0 });
  ok(act(s, { type: 'playDev', pid: 0, card: 'roadBuilding' }).ok);
  eq(s.phase, 'roadBuilding');
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: e1 }).ok, 'barco gratis');
  eq(s.ships[e1], 0);
  eq(s.freeRoads, 1);
});

// ---------- Seafarers: pirate ----------
t('Navegantes: sin la expansión no hay pirata', () => {
  const s = fresh();
  s.phase = 'robber';
  ok(!act(s, { type: 'movePirate', pid: 0, tile: 0 }).ok, 'mover pirata falla');
  eq(G.legalPirateTiles(s), []);
});

t('Navegantes: con un 7 se puede mover el pirata y robar a quien tenga barcos al lado', () => {
  const s = seaMain();
  const { v, e1 } = coastSpot(s);
  const tile = s.board.edges[e1].sea[0];
  // player 1 owns a ship next to that sea tile and has a card
  s.buildings[v] = { owner: 1, type: 'settlement' };
  s.ships[e1] = 1;
  give(s, 1, { ore: 1 });
  s.phase = 'robber';
  s.robberReturn = 'main';
  ok(G.legalPirateTiles(s).includes(tile), 'casilla legal');
  ok(!G.legalPirateTiles(s).includes(s.board.pirate), 'no se queda donde está');
  eq(G.pirateTargets(s, 0, tile), [1]);
  ok(act(s, { type: 'movePirate', pid: 0, tile }).ok, 'mueve');
  eq(s.board.pirate, tile);
  eq(s.players[0].res.ore, 1, 'robó el mineral');
  eq(s.phase, 'main');
});

t('Navegantes: el caballero también puede mover el pirata', () => {
  const s = seaMain();
  s.players[0].dev.push({ type: 'knight', turn: 0 });
  ok(act(s, { type: 'playDev', pid: 0, card: 'knight' }).ok);
  eq(s.phase, 'robber');
  ok(act(s, { type: 'movePirate', pid: 0, tile: G.legalPirateTiles(s)[0] }).ok, 'pirata');
  eq(s.phase, 'main');
});

t('Navegantes: junto al pirata no se construyen ni se mueven barcos', () => {
  const s = seaMain();
  const { v, e1, e2 } = coastSpot(s);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  ok(Ships.canBuildShip(s, 0, e1), 'antes se puede');
  s.board.pirate = s.board.edges[e1].sea[0];
  ok(!Ships.canBuildShip(s, 0, e1), 'con el pirata al lado no');
  ok(seaTileEdges(s, s.board.pirate).includes(e1), 'la arista rodea la casilla del pirata');
  // a ship already there can't move away while the pirate guards it
  s.ships[e1] = 0;
  s.players[0].shipsLeft--;
  eq(Ships.movableShips(s, 0), [], 'bloqueado');
  // pirate leaves: it can move again
  s.board.pirate = G.legalPirateTiles(s).find(id => !s.board.edges[e1].sea.includes(id) && !s.board.edges[e2].sea.includes(id));
  eq(Ships.movableShips(s, 0), [e1], 'libre otra vez');
});

// ---------- Seafarers: islands, bonus, fog ----------
t('Navegantes: la colocación inicial solo en la isla de salida', () => {
  const s = seaGame('newShores');
  const bd = s.board;
  const legal = G.legalSetupSettlements(s, s.current);
  ok(legal.length > 0, 'hay sitios');
  ok(legal.every(v => bd.vertices[v].hexes.some(h => bd.tiles[h].home)), 'todos tocan tierra de salida');
  const foreign = bd.vertices.find(V => V.hexes.length && V.hexes.every(h => !bd.tiles[h].home));
  ok(!act(s, { type: 'placeSettlement', pid: s.current, vid: foreign.id }).ok, 'en otra isla no');
});

t('Navegantes: en las cuatro islas se puede empezar en cualquiera', () => {
  const s = seaGame('fourIslands');
  const bd = s.board;
  const islands = new Set(G.legalSetupSettlements(s, s.current).flatMap(v => bd.vertices[v].hexes.map(h => bd.tiles[h].island)));
  eq(islands.size, 4, 'las cuatro');
});

// a settlement spot on a foreign island, linked by an own ship
function foreignSpot(s) {
  const bd = s.board;
  for (const V of bd.vertices) {
    if (!V.hexes.length || V.hexes.some(h => bd.tiles[h].home || bd.tiles[h].island < 0 || bd.tiles[h].fog)) continue;
    const e = V.edges.find(x => bd.edges[x].kind === 'coast');
    if (e !== undefined) return { v: V.id, e };
  }
  throw new Error('no foreign spot');
}

t('Navegantes: primer poblado en una isla nueva da +2 puntos (una vez por isla)', () => {
  const s = seaMain('newShores');
  const { v, e } = foreignSpot(s);
  const before = G.victoryPoints(s, 0);
  s.ships[e] = 0;
  give(s, 0, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'settlement', at: v }).ok, 'construye en la isla');
  eq(s.players[0].islandVP, 2);
  eq(G.victoryPoints(s, 0), before + 3, 'poblado + bonus');
  // the same island never pays twice
  eq(Islands.settledAt(s, 0, v, false), 0, 'sin bonus repetido');
});

t('Navegantes: en las cuatro islas el bonus es +1 y solo en islas donde no empezaste', () => {
  const s = seaMain('fourIslands');
  const bd = s.board;
  const p = s.players[0];
  p.homeIslands = [0];
  const onIsland = i => bd.vertices.find(V => V.hexes.length && V.hexes.every(h => bd.tiles[h].island === i)).id;
  eq(Islands.settledAt(s, 0, onIsland(0), false), 0, 'isla de salida: nada');
  eq(Islands.settledAt(s, 0, onIsland(1), false), 1, 'isla nueva: +1');
  eq(p.islandVP, 1);
});

t('Navegantes: sin la expansión no hay islas ni bonus', () => {
  const s = fresh();
  ok(s.players[0].islandVP === undefined, 'sin estado de islas');
  eq(Islands.settledAt(s, 0, 0, false), 0);
});

t('Navegantes: la niebla empieza boca abajo, no produce y se descubre navegando', () => {
  const s = seaMain('fogIslands');
  const bd = s.board;
  const fogLand = bd.tiles.filter(t => t.fog);
  ok(fogLand.length && fogLand.every(t => !t.revealed), 'tierra de niebla boca abajo');
  ok(bd.sea.filter(t => t.fog).every(t => t.revealed === false), 'mar de niebla boca abajo');
  // an undiscovered tile with a settlement next to it produces nothing
  const t0 = fogLand.find(t => t.res !== 'desert');
  s.buildings[t0.verts[0]] = { owner: 1, type: 'settlement' };
  const hand = JSON.stringify(s.players[1].res);
  s.phase = 'roll';
  s.diceDeck = [];
  // force the roll: swap the number so whatever comes out is t0's number is not needed; call produce via roll loop
  for (let i = 0; i < 40; i++) {
    s.phase = 'roll';
    s.current = 0;
    act(s, { type: 'roll', pid: 0 });
    s.pendingDiscards = {};
    if (s.dice[0] + s.dice[1] === t0.num) break;
  }
  if (s.dice[0] + s.dice[1] === t0.num) eq(JSON.stringify(s.players[1].res), hand, 'no produjo');
  delete s.buildings[t0.verts[0]];
  // a ship touching the fog tile uncovers it and pays the discoverer
  s.phase = 'main';
  s.current = 0;
  const e = bd.edges.find(E => E.kind === 'coast' && E.hexes.includes(t0.id));
  const resBefore = s.players[0].res[t0.res === 'gold' ? 'wood' : t0.res];
  s.buildings[e.a] = { owner: 0, type: 'settlement' };
  give(s, 0, { wood: 1, sheep: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'ship', at: e.id }).ok, 'barco junto a la niebla');
  ok(t0.revealed && t0.numRevealed, 'descubierta');
  if (t0.res !== 'gold') ok(s.players[0].res[t0.res] >= 1 && s.players[0].res[t0.res] > resBefore - (t0.res === 'wood' || t0.res === 'sheep' ? 1 : 0), 'cobra una carta');
  ok(s.log.some(l => JSON.stringify(l).includes('descubre')), 'aviso en el historial');
});

t('Navegantes: Blindfold no levanta la niebla al voltear el tablero', () => {
  const c = defaultConfig();
  c.seed = 5;
  c.expansions = { seafarers: true, scenario: 'fogIslands' };
  c.modes.flipped = true;
  c.players.forEach(p => (p.kind = 'bot'));
  const s = G.createGame(c);
  for (let n = 0; n < 200 && s.phase === 'setup'; n++) G.applyAction(s, botAct(s, G.pendingActors(s)[0]));
  ok(s.phase !== 'setup', 'terminó la colocación');
  ok(s.board.tiles.filter(t => !t.fog).every(t => t.revealed), 'el resto se volteó');
  ok(s.board.tiles.some(t => t.fog && !t.revealed), 'la niebla sigue');
});

// ---------- Cities & Knights: switch ----------
t('Ciudades y Caballeros: el interruptor llega al estado y propone 13 puntos', () => {
  const c = defaultConfig();
  EXPANSIONS.find(x => x.id === 'citiesKnights').set(c, true);
  eq(c.rules.vpTarget, 13);
  const s = G.createGame(c);
  ok(citiesKnightsOn(s) && !seafarersOn(s), 'solo Ciudades y Caballeros');
  ok(s.log.some(l => JSON.stringify(l).includes('Ciudades y Caballeros')), 'aviso en el historial');
  EXPANSIONS.find(x => x.id === 'citiesKnights').set(c, false);
  eq(c.rules.vpTarget, 10, 'apagado vuelve a 10');
});

t('expansiones: solo una a la vez', () => {
  const c = defaultConfig();
  const sf = EXPANSIONS.find(x => x.id === 'seafarers'), ck = EXPANSIONS.find(x => x.id === 'citiesKnights');
  sf.set(c, true);
  ck.set(c, true);
  ok(c.expansions.citiesKnights && !c.expansions.seafarers, 'encender una apaga la otra');
  sf.set(c, true);
  ok(c.expansions.seafarers && !c.expansions.citiesKnights, 'y al revés');
  const both = defaultConfig();
  both.expansions = { seafarers: true, citiesKnights: true, scenario: 'newShores' };
  const s = G.createGame(both);
  ok(seafarersOn(s) && !citiesKnightsOn(s), 'una config con las dos se queda con Navegantes');
});

t('Mercaderes y Bárbaros: interruptor, escenario y una expansión a la vez', () => {
  const c = defaultConfig();
  const tb = EXPANSIONS.find(x => x.id === 'tradersBarbarians');
  ok(tb && !tb.get(c), 'apagada por defecto');
  EXPANSIONS.find(x => x.id === 'citiesKnights').set(c, true);
  tb.set(c, true);
  ok(c.expansions.tradersBarbarians && !c.expansions.citiesKnights && !c.expansions.seafarers, 'encenderla apaga las otras');
  eq(c.rules.vpTarget, 10, 'pescadores: 10 puntos');
  EXPANSIONS.find(x => x.id === 'seafarers').set(c, true);
  ok(!c.expansions.tradersBarbarians, 'Navegantes la apaga');
  tb.set(c, true);
  tb.set(c, false);
  eq(c.rules.vpTarget, 10, 'apagada vuelve a 10');
  // an unknown scenario falls back to the fishermen
  const c2 = defaultConfig();
  c2.expansions = { tradersBarbarians: true, tbScenario: 'nope' };
  const s = G.createGame(c2);
  ok(tradersBarbariansOn(s) && !seafarersOn(s) && !citiesKnightsOn(s), 'solo Mercaderes y Bárbaros');
  eq(tbScenarioOn(s), 'fishermen', 'escenario desconocido -> pescadores');
  ok(s.log.some(l => JSON.stringify(l).includes('Mercaderes y Bárbaros')), 'aviso en el historial');
  const all = defaultConfig();
  all.expansions = { seafarers: false, citiesKnights: true, tradersBarbarians: true };
  ok(citiesKnightsOn(G.createGame(all)) && !tradersBarbariansOn(G.createGame(all)), 'con C&K y T&B se queda C&K');
});

t('Pescadores: lago, 6 caladeros y bolsa de 30 fichas', () => {
  for (const [shape, np, seed] of [['classic', 4, 3], ['classic', 3, 77], ['big', 4, 5], ['extended', 4, 9], ['mini', 3, 21], ['pangea', 4, 42]]) {
    const c = defaultConfig();
    c.seed = seed; c.map.shape = shape; c.players = c.players.slice(0, np);
    c.expansions = { tradersBarbarians: true, tbScenario: 'fishermen' };
    const s = G.createGame(c), b = s.board;
    const lake = b.tiles[b.lake];
    ok(lake && lake.lake && lake.res === 'desert' && !lake.num, shape + ': el desierto es el lago (sin número)');
    eq(b.tiles.filter(t => t.lake).length, 1, shape + ': un solo lago');
    eq(b.fishing.length, 6, shape + ': 6 caladeros');
    eq(b.fishing.map(f => f.num).sort((x, y) => x - y), Fish.FISHING_NUMS, shape + ': números 4,5,6,8,9,10');
    const vs = b.fishing.flatMap(f => f.verts);
    ok(new Set(vs).size === vs.length, shape + ': ningún cruce en dos caladeros');
    ok(b.fishing.every(f => f.verts.length >= 2 && f.verts.every(v => b.vertices[v].hexes.length < 3)), shape + ': caladeros en la costa');
    ok(!b.fishing.some(f => b.ports.some(p => f.verts.includes(b.edges[p.edge].a) && f.verts.includes(b.edges[p.edge].b))), shape + ': ningún caladero bajo el cartel de un puerto');
    eq(s.fishermen.bag.length, 30, shape + ': 30 fichas');
    eq(s.fishermen.bag.filter(x => x === Fish.BOOT).length, 1, shape + ': una bota vieja');
    eq(s.fishermen.bag.reduce((a, x) => a + x, 0), 11 + 20 + 24, shape + ': 11×1 + 10×2 + 8×3');
    ok(s.players.every(p => Array.isArray(p.fish) && !p.fish.length) && s.fishermen.boot === -1, shape + ': nadie tiene pescado al empezar');
  }
  const base = G.createGame(defaultConfig());
  ok(!('fishermen' in base) && !('fishing' in base.board) && !('lake' in base.board) && base.players.every(p => !('fish' in p)), 'el juego base no tiene datos de pescadores');
});

// ---------- Traders & Barbarians: Fishermen rules ----------
const fishGame = () => fresh(c => { c.expansions = { tradersBarbarians: true, tbScenario: 'fishermen' }; });
// rig the bag: the next tokens drawn are `vals` (last element is drawn first)
const rigBag = (s, vals) => { s.fishermen.bag = s.fishermen.bag.filter(x => x !== Fish.BOOT || !vals.includes(Fish.BOOT)).slice(0, 30 - vals.length).concat(vals); };

t('Pescadores: caladero da 1 ficha al poblado y 2 a la ciudad; el lago con 2/3/11/12', () => {
  const s = fishGame(), b = s.board;
  const f = b.fishing.find(x => x.num === 6);
  s.buildings[f.verts[0]] = { owner: 1, type: 'settlement' };
  s.buildings[f.verts[2]] = { owner: 2, type: 'city' };
  rigBag(s, [1, 1, 1]);
  eq(Fish.fishYield(s, 6).map(x => [x.pid, x.n]), [[1, 1], [2, 2]], 'quién pesca con un 6');
  eq(Fish.fishYield(s, 8).filter(x => x.pid === 1 || x.pid === 2).length, 0, 'otro número: nada');
  const lake = b.tiles[b.lake];
  s.buildings[lake.verts[0]] = { owner: 3, type: 'settlement' };
  b.robber = -1;
  eq(Fish.fishYield(s, 11).find(x => x.pid === 3)?.n, 1, 'el lago da pescado con 11');
  b.robber = b.lake;
  ok(!Fish.fishYield(s, 11).some(x => x.pid === 3), 'el ladrón en el lago lo bloquea');
  const got = Fish.drawFish(s, 1, 2);
  eq(got.fish.length, 2, 'roba 2 fichas de la bolsa');
  eq(s.players[1].fish.length, 2, 'y van a su mano');
});

t('Pescadores: la bota vieja se queda aparte y exige 1 punto más', () => {
  const s = fishGame();
  rigBag(s, [Fish.BOOT]);
  const got = Fish.drawFish(s, 0, 1);
  ok(got.boot && s.fishermen.boot === 0 && !s.players[0].fish.length, 'la bota no es pescado');
  // exactly 10 points: 5 cities on separate tiles, then build a road to trigger the win check
  const tenVP = boot => {
    const g = fishGame();
    let n = 0;
    for (const t of g.board.tiles) {
      if (n === 5) break;
      const v = t.verts.find(x => g.board.vertices[x].adj.every(u => !g.buildings[u]) && !g.buildings[x]);
      if (v === undefined) continue;
      g.buildings[v] = { owner: 0, type: 'city' };
      n++;
    }
    eq(G.victoryPoints(g, 0), 10, '10 puntos');
    g.fishermen.boot = boot;
    give(g, 0, { wood: 1, brick: 1 });
    ok(act(g, { type: 'build', pid: 0, what: 'road', at: G.legalRoads(g, 0)[0] }).ok, 'construye');
    return g.phase === 'gameOver';
  };
  ok(tenVP(-1), 'sin la bota 10 puntos ganan');
  ok(!tenVP(0), 'con la bota 10 puntos no bastan');
  ok(tenVP(1), 'la bota de otro no te afecta');
});

t('Pescadores: gastar pescado (sin cambio) en cada ventaja', () => {
  const s = fishGame();
  const p = s.players[0];
  // robber: 2 fish
  p.fish = [3];
  ok(act(s, { type: 'spendFish', pid: 0, perk: 'robber' }).ok, 'quitar el ladrón');
  eq(s.board.robber, -1, 'ladrón fuera del tablero');
  eq(p.fish, [], 'pagó la ficha de 3 (sin cambio)');
  eq(s.fishermen.spent, [3], 'la ficha va al montón de gastadas');
  ok(!act(s, { type: 'spendFish', pid: 0, perk: 'robber' }).ok, 'no se puede quitar dos veces');
  // steal: 3 fish
  p.fish = [1, 2];
  give(s, 1, { ore: 1 });
  ok(act(s, { type: 'spendFish', pid: 0, perk: 'steal', target: 1 }).ok, 'robar');
  eq(p.res.ore, 1, 'robó el mineral');
  p.fish = [2, 2];
  ok(!act(s, { type: 'spendFish', pid: 0, perk: 'steal', target: 1 }).ok, 'no se roba a quien no tiene cartas');
  // resource: 4 fish, pays the cheapest exact combo
  p.fish = [3, 1, 2, 2];
  ok(act(s, { type: 'spendFish', pid: 0, perk: 'resource', res: 'wheat' }).ok, 'recurso del banco');
  eq(p.res.wheat, 1, 'recibió trigo');
  eq(p.fish.reduce((a, v) => a + v, 0), 4, 'pagó exactamente 4 de 8');
  ok(!act(s, { type: 'spendFish', pid: 0, perk: 'resource', res: 'gold' }).ok, 'recurso inválido');
  // dev card: 7 fish
  p.fish = [3, 3, 1];
  const deck = s.devDeck.length;
  ok(act(s, { type: 'spendFish', pid: 0, perk: 'dev' }).ok, 'carta de desarrollo');
  eq(s.devDeck.length, deck - 1, 'sale del mazo');
  eq(p.dev.length, 1, 'a su mano');
  // not enough fish
  p.fish = [3, 3];
  ok(!act(s, { type: 'spendFish', pid: 0, perk: 'dev' }).ok, '6 peces no bastan para 7');
  ok(!act(s, { type: 'spendFish', pid: 1, perk: 'robber' }).ok, 'solo en tu turno');
});

t('Pescadores: camino gratis por 5 peces', () => {
  const s = fishGame();
  const v = s.board.tiles[0].verts[0];
  s.buildings[v] = { owner: 0, type: 'settlement' };
  s.players[0].fish = [3, 2];
  ok(act(s, { type: 'spendFish', pid: 0, perk: 'road' }).ok, 'pagar 5');
  eq(s.phase, 'roadBuilding', 'construye un camino gratis');
  const e = G.legalRoads(s, 0)[0];
  const left = s.players[0].roadsLeft;
  ok(act(s, { type: 'build', pid: 0, what: 'road', at: e }).ok, 'coloca el camino');
  eq(s.players[0].roadsLeft, left - 1, 'un camino menos');
  eq(s.phase, 'main', 'solo uno');
});

t('Pescadores: el pescado no cuenta para el 7 ni se puede robar', () => {
  const s = fishGame();
  s.players[1].fish = [3, 3, 3, 3, 3, 3, 3, 3];
  give(s, 1, { wood: 2 });
  eq(G.handSize(s.players[1].res), 2, 'solo cartas en la mano');
});

t('Pescadores: pasar la bota a quien tenga tantos puntos o más', () => {
  const s = fishGame();
  s.fishermen.boot = 0;
  s.buildings[s.board.tiles[0].verts[0]] = { owner: 0, type: 'settlement' };
  s.buildings[s.board.tiles[5].verts[0]] = { owner: 1, type: 'city' };
  eq(G.bootReceivers(s, 0), [1], 'solo el jugador 1 tiene puntos >= 1');
  ok(!act(s, { type: 'giveBoot', pid: 0, to: 2 }).ok, 'no a alguien con menos puntos');
  ok(act(s, { type: 'giveBoot', pid: 0, to: 1 }).ok, 'sí al de la ciudad');
  eq(s.fishermen.boot, 1, 'la bota cambia de manos');
  ok(!act(s, { type: 'giveBoot', pid: 0, to: 1 }).ok, 'ya no la tiene');
});

t('Pescadores: no hay acciones de pescado en el juego base', () => {
  const s = fresh();
  ok(!act(s, { type: 'spendFish', pid: 0, perk: 'robber' }).ok, 'spendFish falla');
  ok(!act(s, { type: 'giveBoot', pid: 0, to: 1 }).ok, 'giveBoot falla');
});

// ---------- Traders & Barbarians: Rivers of Catan (board data) ----------
t('Ríos: 2 pantanos en el nacimiento, ríos de 3 y 4, 7 sitios de puente', () => {
  for (const [shape, np, seed] of [['classic', 4, 3], ['classic', 3, 8], ['mini', 3, 2], ['big', 4, 5], ['huge', 4, 5], ['pangea', 4, 42], ['ring', 4, 1]]) {
    const c = defaultConfig();
    c.seed = seed; c.map.shape = shape; c.players = c.players.slice(0, np);
    c.expansions = { tradersBarbarians: true, tbScenario: 'rivers' };
    const s = G.createGame(c), b = s.board;
    eq(b.rivers.map(r => r.hexes.length), [4, 3], shape + ': un río de 4 y otro de 3');
    eq(b.bridgeSpots.length, 7, shape + ': 7 sitios de puente');
    eq(new Set(b.bridgeSpots).size, 7, shape + ': sin repetir');
    eq(b.marsh.length, 2, shape + ': 2 pantanos');
    ok(b.rivers.every(r => b.tiles[r.hexes[0]].marsh), shape + ': cada río nace en un pantano');
    ok(b.marsh.every(id => b.tiles[id].res === 'desert' && !b.tiles[id].num), shape + ': los pantanos no producen');
    ok(b.tiles[b.robber].marsh, shape + ': el ladrón empieza en un pantano');
    ok(b.rivers.every(r => r.hexes.slice(1).every(id => b.tiles[id].res !== 'desert')), shape + ': ningún desierto dentro de un río');
    ok(b.rivers.every(r => b.edges[r.mouth].hexes.length === 1 && b.edges[r.mouth].hexes[0] === r.hexes[r.hexes.length - 1]), shape + ': desemboca en la costa');
    ok(b.rivers.every(r => r.crossings.slice(0, -1).every((e, i) => b.edges[e].hexes.includes(r.hexes[i]) && b.edges[e].hexes.includes(r.hexes[i + 1]))), shape + ': cruza entre casillas seguidas');
    ok(new Set(b.rivers.flatMap(r => r.hexes)).size === 7, shape + ': los ríos no comparten casillas');
    ok(s.players.every(p => p.gold === 0 && p.bridgesLeft === Rivers.MAX_BRIDGES) && Object.keys(s.rivers.bridges).length === 0, shape + ': sin oro ni puentes al empezar');
    eq(b.tiles.filter(t => t.res !== 'desert').every(t => t.num), true, shape + ': todas las demás casillas tienen número');
  }
  const base = G.createGame(defaultConfig());
  ok(!('rivers' in base) && !('rivers' in base.board) && !('marsh' in base.board) && base.players.every(p => !('gold' in p)), 'el juego base no tiene datos de ríos');
});

// ---------- Traders & Barbarians: Rivers of Catan (rules) ----------
const riverGame = () => fresh(c => { c.expansions = { tradersBarbarians: true, tbScenario: 'rivers' }; });
// a settlement of `pid` at one end of a bridge spot, ready to build there
function atSpot(s, pid, spot) {
  const E = s.board.edges[spot];
  s.buildings[E.a] = { owner: pid, type: 'settlement' };
  return E;
}

t('Ríos: ningún camino cruza el río; el puente sí', () => {
  const s = riverGame();
  const spot = s.board.bridgeSpots[0];
  atSpot(s, 0, spot);
  ok(!G.canBuildRoad(s, 0, spot), 'un camino no puede cruzar el río');
  ok(!G.legalRoads(s, 0).includes(spot), 'ni aparece entre los caminos legales');
  ok(G.legalBridges(s, 0).includes(spot), 'el puente sí');
  ok(!G.legalBridges(s, 1).includes(spot), 'pero no para quien no llega');
  const p = s.players[0];
  give(s, 0, { brick: 2, wood: 1 });
  const gold = p.gold, roadsLeft = p.roadsLeft;
  ok(act(s, { type: 'buildBridge', pid: 0, at: spot }).ok, 'construye el puente');
  eq(p.res.brick + p.res.wood, 0, 'paga 2 ladrillos y 1 madera');
  eq(p.gold - gold, Rivers.GOLD.bridge, '+3 de oro');
  eq(p.bridgesLeft, 2, 'le quedan 2 puentes');
  eq(p.roadsLeft, roadsLeft, 'no gasta caminos');
  eq(s.roads[spot], 0, 'cuenta como camino (red y camino más largo)');
  eq(s.rivers.bridges[spot], 0, 'y queda apuntado como puente');
  ok(!act(s, { type: 'buildBridge', pid: 0, at: spot }).ok, 'no dos veces en el mismo sitio');
  // no more than 3
  p.bridgesLeft = 0;
  give(s, 0, { brick: 2, wood: 1 });
  const other = s.board.bridgeSpots.find(e => e !== spot);
  atSpot(s, 0, other);
  ok(!act(s, { type: 'buildBridge', pid: 0, at: other }).ok, 'máximo 3 puentes');
  // a plain road next to the water elsewhere still works
  ok(!act(s, { type: 'buildBridge', pid: 0, at: s.board.edges.find(e => !Rivers.isCrossing(s.board, e.id)).id }).ok, 'el puente solo va en los sitios del río');
});

t('Ríos: oro por poblado y camino junto al río (no por ciudad)', () => {
  const s = riverGame(), b = s.board;
  const p = s.players[0];
  // a corner of a river hex that is free, then build there
  const v = b.vertices.find(V => Rivers.riverVertex(b, V.id) && V.hexes.length === 3);
  const e = v.edges.find(x => !Rivers.isCrossing(b, x));
  s.roads[e] = 0;
  give(s, 0, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'settlement', at: v.id }).ok, 'poblado junto al río');
  eq(p.gold, 1, '+1 de oro');
  give(s, 0, { wheat: 2, ore: 3 });
  ok(act(s, { type: 'build', pid: 0, what: 'city', at: v.id }).ok, 'ciudad');
  eq(p.gold, 1, 'la ciudad no da oro');
  const re = G.legalRoads(s, 0).find(x => Rivers.riverEdge(b, x));
  if (re !== undefined) {
    give(s, 0, { wood: 1, brick: 1 });
    ok(act(s, { type: 'build', pid: 0, what: 'road', at: re }).ok, 'camino junto al río');
    eq(p.gold, 2, '+1 de oro por el camino');
  }
  const dry = G.legalRoads(s, 0).find(x => !Rivers.riverEdge(b, x));
  if (dry !== undefined) {
    const before = p.gold;
    give(s, 0, { wood: 1, brick: 1 });
    act(s, { type: 'build', pid: 0, what: 'road', at: dry });
    eq(p.gold, before, 'lejos del río no hay oro');
  }
});

t('Ríos: 2 de oro = 1 recurso, máximo 2 veces por turno; recursos por oro al cambio del banco', () => {
  const s = riverGame();
  const p = s.players[0];
  p.gold = 7;
  ok(act(s, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'compra 1');
  ok(act(s, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'compra 2');
  ok(!act(s, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'la tercera no');
  eq(p.res.ore, 2, '2 minerales');
  eq(p.gold, 3, '4 de oro gastados');
  act(s, { type: 'endTurn', pid: 0 });
  s.phase = 'main'; s.current = 0; s.turn += 1;
  ok(act(s, { type: 'goldBuy', pid: 0, res: 'wood' }).ok, 'el turno siguiente vuelve a poder');
  p.gold = 1;
  ok(!act(s, { type: 'goldBuy', pid: 0, res: 'wood' }).ok, 'con 1 de oro no llega');
  give(s, 0, { sheep: 4 });
  ok(act(s, { type: 'goldSell', pid: 0, give: 'sheep' }).ok, '4 ovejas por 1 de oro');
  eq(p.gold, 2, '+1 de oro');
  eq(p.res.sheep, 0, 'paga las 4');
  ok(!act(s, { type: 'goldSell', pid: 0, give: 'sheep' }).ok, 'sin ovejas no');
});

t('Ríos: el colono más rico (+1) y los pobres (−2)', () => {
  const s = riverGame();
  const vp = pid => G.victoryPoints(s, pid) - Object.values(s.buildings).filter(b => b.owner === pid).length;
  s.players.forEach(p => (p.gold = 0));
  ok(s.players.every(p => vp(p.id) === -2), 'todos empatados a 0: todos pobres');
  s.players[0].gold = 3; s.players[1].gold = 1; s.players[2].gold = 1; s.players[3].gold = 0;
  eq([0, 1, 2, 3].map(vp), [1, 0, 0, -2], 'el rico +1, el de menos oro −2');
  s.players[1].gold = 3;
  eq([0, 1].map(vp), [0, 0], 'empate arriba: nadie es el más rico');
  s.players[3].gold = 1;
  eq([1, 2, 3].map(vp), [0, -2, -2], 'empatados abajo: todos pobres');
  ok(G.handSize(s.players[0].res) === 0, 'el oro no es carta (no cuenta para el 7)');
});

// ---------- Traders & Barbarians: The Caravans (board data) ----------
t('Caravanas: oasis en el centro, 3 salidas, 22 camellos, 12 puntos', () => {
  for (const [shape, seed] of [['classic', 3], ['classic', 9], ['mini', 2], ['big', 5], ['ring', 1], ['islands', 7], ['kingdoms', 4]]) {
    const c = defaultConfig();
    c.seed = seed; c.map.shape = shape;
    c.expansions = { tradersBarbarians: true, tbScenario: 'caravans' };
    const s = G.createGame(c), b = s.board;
    const o = b.tiles[b.oasis];
    ok(o && o.oasis && o.res === 'desert' && !o.num, shape + ': el oasis no produce');
    eq(b.tiles.filter(t => t.oasis).length, 1, shape + ': un solo oasis');
    eq(b.robber, -1, shape + ': el ladrón empieza fuera del tablero');
    eq(b.caravanStarts.length, 3, shape + ': 3 salidas de caravana');
    ok(b.caravanStarts.every(x => o.verts.includes(x.vertex) && Caravans.camelEdge(b, x.edge) && !b.edges[x.edge].hexes.includes(o.id)), shape + ': cada salida deja el oasis por un camino entre dos casillas');
    eq(new Set(b.caravanStarts.map(x => x.edge)).size, 3, shape + ': salidas distintas');
    eq(s.caravans.left, Caravans.CAMELS, shape + ': 22 camellos en reserva');
    eq(Object.keys(s.caravans.camels).length, 0, shape + ': ningún camello en el tablero');
    eq(s.caravans.routes.length, 3, shape + ': 3 rutas');
    eq(b.tiles.filter(t => t.res !== 'desert').every(t => t.num), true, shape + ': las demás casillas tienen número');
  }
  const c = defaultConfig();
  EXPANSIONS.find(x => x.id === 'tradersBarbarians').set(c, true);
  c.expansions.tbScenario = 'caravans';
  ok(TB_SCENARIOS.caravans.vp === 12, 'se juega a 12 puntos');
  const base = G.createGame(defaultConfig());
  ok(!('caravans' in base) && !('oasis' in base.board) && !('caravanStarts' in base.board), 'el juego base no tiene caravanas');
});

// ---------- Traders & Barbarians: The Caravans (rules) ----------
const caravanGame = () => fresh(c => { c.expansions = { tradersBarbarians: true, tbScenario: 'caravans' }; });

t('Caravanas: sitios para camellos, una ruta sin ramas, fin de la reserva', () => {
  const s = caravanGame(), b = s.board;
  const first = Caravans.camelOptions(s);
  eq(first.map(o => o.edge).sort(), b.caravanStarts.map(x => x.edge).sort(), 'al principio: las 3 salidas del oasis');
  const e0 = first[0].edge;
  ok(Caravans.placeCamel(s, e0), 'pone el primer camello');
  eq(s.caravans.left, 21, 'quedan 21');
  const next = Caravans.camelOptions(s).filter(o => o.route === first[0].route);
  ok(next.length >= 1 && next.length <= 2, 'la ruta sigue por 1 o 2 caminos');
  const tip = s.caravans.routes[first[0].route].tip;
  ok(next.every(o => b.edges[o.edge].a === tip || b.edges[o.edge].b === tip), 'desde el extremo lejano del último camello');
  ok(!Caravans.placeCamel(s, e0), 'no dos camellos en el mismo camino');
  ok(!Caravans.camelOptions(s).some(o => b.edges[o.edge].hexes.includes(b.oasis)), 'nunca junto al oasis');
  s.caravans.left = 0;
  eq(Caravans.camelOptions(s).length, 0, 'sin camellos en reserva no hay sitios');
});

t('Caravanas: resultado de la votación', () => {
  const opts = [10, 20, 30];
  eq(Caravans.voteResult({ 0: { n: 3, spot: 10 }, 1: { n: 1, spot: 20 }, 2: { n: 1, spot: 20 } }, 0, opts), { edge: 10 }, 'gana el sitio con más votos');
  eq(Caravans.voteResult({ 0: { n: 1, spot: 10 }, 1: { n: 2, spot: 20 }, 2: { n: 1, spot: 20 } }, 0, opts), { edge: 20 }, 'los votos al mismo sitio se suman');
  eq(Caravans.voteResult({ 0: { n: 2, spot: 10 }, 1: { n: 1, spot: 20 }, 2: { n: 1, spot: 20 } }, 2, opts), { edge: 10 }, 'empate 2-2: decide quien puso más (y su sitio está empatado)');
  eq(Caravans.voteResult({ 0: { n: 1, spot: 10 }, 1: { n: 1, spot: 20 }, 2: { n: 0, spot: 30 } }, 2, opts), { decider: 2, tied: [10, 20] }, 'empate sin líder: elige el jugador del turno');
  eq(Caravans.voteResult({ 0: { n: 0, spot: 10 }, 1: { n: 0, spot: 20 } }, 1, opts), { edge: 20 }, 'nadie vota: el jugador del turno pone su sitio');
});

t('Caravanas: votación completa al terminar un turno con construcción', () => {
  const s = caravanGame(), b = s.board;
  // a settlement next to a start, built this turn
  const st = b.caravanStarts[0], E = b.edges[st.edge];
  const v = E.a === st.vertex ? E.b : E.a;
  const road = b.vertices[v].edges.find(e => e !== st.edge);
  s.roads[road] = 0;
  give(s, 0, { wood: 1, brick: 1, sheep: 3, wheat: 2 });
  ok(act(s, { type: 'build', pid: 0, what: 'settlement', at: v }).ok, 'poblado');
  ok(act(s, { type: 'endTurn', pid: 0 }).ok, 'termina el turno');
  eq(s.phase, 'caravanVote', 'empieza la votación');
  eq(G.pendingActors(s), [0], 'vota primero quien construyó');
  ok(!act(s, { type: 'caravanBid', pid: 1, sheep: 0, wheat: 0, spot: st.edge }).ok, 'no se vota fuera de turno');
  ok(!act(s, { type: 'caravanBid', pid: 0, sheep: 9, wheat: 0, spot: st.edge }).ok, 'no más cartas de las que tienes');
  const bank = s.bank.sheep;
  ok(act(s, { type: 'caravanBid', pid: 0, sheep: 2, wheat: 1, spot: st.edge }).ok, 'vota 3');
  eq(s.bank.sheep, bank + 2, 'las cartas vuelven al banco');
  for (const pid of [1, 2, 3]) ok(act(s, { type: 'caravanBid', pid, sheep: 0, wheat: 0, spot: b.caravanStarts[pid % 3].edge }).ok, 'vota ' + pid);
  eq(s.caravans.camels[st.edge], 0 in s.caravans.camels ? s.caravans.camels[st.edge] : s.caravans.camels[st.edge], 'camello puesto');
  ok(s.caravans.camels[st.edge] !== undefined, 'el camello va donde votó la mayoría');
  eq(s.current, 1, 'y empieza el turno siguiente');
  eq(s.phase, 'roll', 'que tira los dados');
  // a turn without building: no vote
  s.phase = 'main';
  ok(act(s, { type: 'endTurn', pid: 1 }).ok, 'sin construir');
  eq(s.phase, 'roll', 'no hay votación');
});

t('Caravanas: +1 punto entre dos camellos, camino doble, ladrón fuera del oasis', () => {
  const s = caravanGame(), b = s.board;
  // a vertex with two land paths: put camels on two of its edges directly
  const v = b.vertices.find(V => V.edges.filter(e => Caravans.camelEdge(b, e) && !b.edges[e].hexes.includes(b.oasis)).length >= 2 && V.hexes.length === 3);
  const [e1, e2] = v.edges.filter(e => Caravans.camelEdge(b, e) && !b.edges[e].hexes.includes(b.oasis));
  s.buildings[v.id] = { owner: 0, type: 'settlement' };
  const base = G.victoryPoints(s, 0);
  s.caravans.camels[e1] = 0;
  eq(G.victoryPoints(s, 0), base, 'un camello: nada');
  s.caravans.camels[e2] = 0;
  eq(G.victoryPoints(s, 0), base + 1, 'dos camellos: +1 punto');
  // road length: roads on both camel paths, then one more road built normally -> 2 + 2 + 1 = 5
  s.roads[e1] = 0;
  s.roads[e2] = 0;
  const e3 = G.legalRoads(s, 0)[0];
  give(s, 0, { wood: 1, brick: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'road', at: e3 }).ok, 'un camino más');
  ok(s.players[0].roadLen >= 4, 'los caminos junto a camellos cuentan doble (' + s.players[0].roadLen + ')');
  ok(!G.legalRobberTiles(s, 0).includes(b.oasis), 'el ladrón no va al oasis');
  const plain = fresh();
  plain.roads[e1] = 0; plain.roads[e2] = 0;
  give(plain, 0, { wood: 1, brick: 1 });
  plain.buildings[v.id] = { owner: 0, type: 'settlement' };
  act(plain, { type: 'build', pid: 0, what: 'road', at: G.legalRoads(plain, 0)[0] });
  ok(plain.players[0].roadLen <= 3, 'sin caravanas, cada camino cuenta 1');
});

// ---------- Traders & Barbarians: Barbarian Attack (board data) ----------
t('Ataque bárbaro: castillo en la costa, desierto enfrente, 2 bárbaros iniciales, sin ladrón', () => {
  for (const [shape, seed] of [['classic', 3], ['classic', 8], ['mini', 2], ['big', 5], ['ring', 1], ['islands', 7]]) {
    const c = defaultConfig();
    c.seed = seed; c.map.shape = shape;
    c.expansions = { tradersBarbarians: true, tbScenario: 'barbarianAttack' };
    const s = G.createGame(c), b = s.board;
    const castle = b.tiles[b.castle];
    const coastal = id => b.edges.some(e => e.hexes.length === 1 && e.hexes[0] === id);
    ok(castle && castle.castle && castle.res === 'desert' && !castle.num, shape + ': el castillo no produce');
    ok(coastal(castle.id), shape + ': el castillo está en la costa');
    ok(b.tiles.some(t => t.res === 'desert' && !t.castle && coastal(t.id)), shape + ': un desierto en la costa');
    eq(b.castlePaths.length, 6, shape + ': 6 caminos alrededor del castillo');
    ok(b.coast.length > 3 && b.coast.every(id => coastal(id) && b.tiles[id].res !== 'desert'), shape + ': casillas costeras sin castillo ni desierto');
    eq(b.barbStart.length, 2, shape + ': 2 bárbaros iniciales');
    eq(b.robber, -1, shape + ': sin ladrón');
    eq(Object.values(s.barbAttack.on).reduce((a, n) => a + n, 0) + s.barbAttack.pool, BarbAttack.BARBARIANS, shape + ': 36 bárbaros en total');
    ok(s.players.every(p => p.gold === 0 && p.prisoners === 0 && p.knightsLeft === BarbAttack.KNIGHTS), shape + ': 6 caballeros, sin oro ni prisioneros');
    eq(b.tiles.filter(t => t.res !== 'desert').every(t => t.num), true, shape + ': las demás casillas tienen número');
  }
  const c = defaultConfig(); c.seed = 3;
  c.expansions = { tradersBarbarians: true, tbScenario: 'barbarianAttack' };
  const b = G.createGame(c).board;
  eq(b.barbStart.map(id => b.tiles[id].num).sort((x, y) => x - y)[0] <= 3, true, 'el primero va al 2 (o lo más cerca)');
  ok(TB_SCENARIOS.barbarianAttack.vp === 12, 'se juega a 12 puntos');
  const base = G.createGame(defaultConfig());
  ok(!('barbAttack' in base) && !('castle' in base.board) && base.players.every(p => !('prisoners' in p)), 'el juego base no tiene bárbaros');
});

// ---------- Traders & Barbarians: Barbarian Attack (landings, conquest, 7, gold) ----------
const baGame = () => fresh(c => { c.expansions = { tradersBarbarians: true, tbScenario: 'barbarianAttack' }; });

t('Ataque bárbaro: desembarcos al construir (3 casillas distintas de la costa)', () => {
  const s = baGame(), b = s.board;
  s.buildings = {}; s.roads = {};
  const before = Object.values(s.barbAttack.on).reduce((x, y) => x + y, 0);
  const v = b.vertices.find(V => V.hexes.length === 3 && !V.hexes.some(h => b.tiles[h].res === 'desert'));
  s.roads[v.edges[0]] = 0;
  give(s, 0, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  ok(act(s, { type: 'build', pid: 0, what: 'settlement', at: v.id }).ok, 'poblado');
  const after = Object.values(s.barbAttack.on).reduce((x, y) => x + y, 0);
  ok(after - before >= 1 && after - before <= 3, 'llegan de 1 a 3 bárbaros (' + (after - before) + ')');
  eq(after + s.barbAttack.pool, BarbAttack.BARBARIANS, 'el total no cambia');
  ok(Object.keys(s.barbAttack.on).every(h => b.coast.includes(+h)), 'solo en la costa');
  // landings directly: never twice on the same hex in one attack
  const s2 = baGame();
  for (let i = 0; i < 20; i++) {
    const l = BarbAttack.landBarbarians(s2);
    ok(new Set(l.map(x => x.hex)).size === l.length, 'casillas distintas en un desembarco');
  }
});

t('Ataque bárbaro: 3 bárbaros conquistan; la casilla no produce ni deja construir', () => {
  const s = baGame(), b = s.board;
  s.buildings = {}; s.roads = {};
  const hex = b.coast.find(h => b.tiles[h].num);
  s.barbAttack.on[hex] = 2;
  ok(BarbAttack.placeBarbarian(s, hex), 'el tercero conquista');
  ok(BarbAttack.isConquered(s, hex), 'conquistada');
  ok(!BarbAttack.placeBarbarian(s, hex), 'no llegan más');
  const t0 = b.tiles[hex];
  const v = t0.verts[0];
  ok(!G.canBuildSettlement(s, 0, v), 'no se construye junto a ella');
  ok(!G.canSetupSettlement(s, 0, v), 'ni al colocar al principio');
  const e = b.edges.find(E => E.hexes.includes(hex)).id;
  s.buildings[b.edges[e].a] = { owner: 0, type: 'settlement' };
  ok(!G.canBuildRoad(s, 0, e), 'ni caminos a lo largo');
});

t('Ataque bárbaro: una ciudad rodeada de casillas conquistadas no recibe nada', () => {
  const s = baGame(), b = s.board;
  s.buildings = {}; s.roads = {};
  const v = b.vertices.find(V => V.hexes.length >= 1 && V.hexes.every(h => b.coast.includes(h)));
  for (const h of v.hexes) { s.barbAttack.on[h] = 3; if (!s.barbAttack.conquered.includes(h)) s.barbAttack.conquered.push(h); }
  s.buildings[v.id] = { owner: 1, type: 'city' };
  for (const r of Object.keys(s.players[1].res)) s.players[1].res[r] = 0;
  for (let i = 0; i < 40; i++) {
    s.phase = 'roll'; s.current = 0;
    ok(act(s, { type: 'roll', pid: 0 }).ok, 'tira');
    if (s.phase === 'baSteal') act(s, { type: 'baSteal', pid: 0, target: BarbAttack.stealVictims(s, 0)[0] });
  }
  eq(Object.values(s.players[1].res).reduce((x, y) => x + y, 0), 0, 'sin producción');
});

t('Ataque bárbaro: edificio conquistado sin puntos; el 7 roba sin ladrón; oro', () => {
  const s = baGame(), b = s.board;
  s.buildings = {}; s.roads = {};
  // a corner whose land hexes are all coastal and numbered
  const v = b.vertices.find(V => V.hexes.length >= 1 && V.hexes.every(h => b.coast.includes(h)));
  s.buildings[v.id] = { owner: 1, type: 'city' };
  const vp = G.victoryPoints(s, 1);
  for (const h of v.hexes) { s.barbAttack.on[h] = 3; if (!s.barbAttack.conquered.includes(h)) s.barbAttack.conquered.push(h); }
  ok(BarbAttack.buildingConquered(s, v.id), 'la ciudad está conquistada');
  eq(G.victoryPoints(s, 1), vp - 2, 'y no da puntos');
  // 7: roll until a 7 comes up; no robber, the roller steals from a chosen player
  const s7 = baGame();
  give(s7, 1, { ore: 2 });
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++) {
    s7.phase = 'roll'; s7.current = 0;
    act(s7, { type: 'roll', pid: 0 });
    if (s7.phase === 'discard') for (const pid of G.pendingActors(s7)) { const p = s7.players[pid]; const n = Math.floor(G.handSize(p.res) / 2); const res = {}; let k = n; for (const r of Object.keys(p.res)) { const x = Math.min(k, p.res[r]); if (x) res[r] = x; k -= x; } act(s7, { type: 'discard', pid, res }); }
    if (s7.phase === 'baSteal') seen = true;
  }
  ok(seen, 'un 7 lleva a robar');
  ok(s7.board.robber === -1, 'sin ladrón en el tablero');
  ok(!act(s7, { type: 'moveRobber', pid: 0, tile: 0 }).ok, 'no hay ladrón que mover');
  const t1 = BarbAttack.stealVictims(s7, 0)[0];
  const h1 = G.handSize(s7.players[t1].res);
  ok(act(s7, { type: 'baSteal', pid: 0, target: t1 }).ok, 'roba a quien elige');
  eq(G.handSize(s7.players[t1].res), h1 - 1, 'una carta menos');
  eq(s7.phase, 'main', 'y sigue el turno');
  // gold: 2 gold buy a resource, twice per turn
  const sg = baGame();
  sg.players[0].gold = 6;
  ok(act(sg, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'compra con oro');
  ok(act(sg, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'dos veces');
  ok(!act(sg, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'no tres');
  eq(sg.players[0].gold, 2, 'gastó 4 de oro');
  eq(sg.devDeck.length, 0, 'sin cartas de desarrollo normales');
  ok(sg.config.rules.setupCity, 'el segundo poblado inicial es ciudad');
});

t('Ataque bárbaro: cartas al comprar, caballeros, expulsión y prisioneros', () => {
  const s = baGame(), b = s.board, B = s.barbAttack;
  // a knighthood card: the knight goes to a free path beside the castle
  B.deck = ['knight'];
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  ok(act(s, { type: 'buyDev', pid: 0 }).ok, 'compra');
  eq(s.phase, 'baCard', 'hay que colocarlo');
  const notCastle = b.edges.find(e => !b.castlePaths.includes(e.id)).id;
  ok(!act(s, { type: 'baCard', pid: 0, at: notCastle }).ok, 'no lejos del castillo');
  ok(act(s, { type: 'baCard', pid: 0, at: b.castlePaths[0] }).ok, 'junto al castillo');
  eq(s.players[0].knightsLeft, 5, 'un caballero menos en reserva');
  // move: never onto a castle path; 3 paths free, then 1 grain each
  const reach = BarbAttack.knightReach(s, b.castlePaths[0]);
  ok(![...reach.keys()].some(e => b.castlePaths.includes(e)), 'no termina junto al castillo');
  const [far] = [...reach].find(([, d]) => d === 4) || [];
  if (far != null) {
    for (const r of Object.keys(s.players[0].res)) s.players[0].res[r] = 0;
    ok(!act(s, { type: 'baMoveKnight', pid: 0, from: b.castlePaths[0], to: far }).ok, '4 caminos sin cereal no');
    give(s, 0, { wheat: 1 });
    ok(act(s, { type: 'baMoveKnight', pid: 0, from: b.castlePaths[0], to: far }).ok, 'con 1 cereal sí');
    eq(s.players[0].res.wheat, 0, 'pagó el cereal');
    const next = [...BarbAttack.knightReach(s, far).keys()][0];
    ok(!act(s, { type: 'baMoveKnight', pid: 0, from: far, to: next }).ok, 'una vez por turno');
  }
  // battle: 2 knights beside a hex with 1 barbarian free it; the barbarian becomes a prisoner
  const s2 = baGame(), B2 = s2.barbAttack;
  const hex = s2.board.coast.find(h => !B2.on[h]);
  B2.on[hex] = 1; B2.pool--;
  const paths = BarbAttack.hexPaths(s2, hex);
  B2.knights[paths[0]] = 0; B2.knights[paths[1]] = 0; s2.players[0].knightsLeft -= 2;
  const others = Object.keys(B2.on).filter(h => +h !== hex);
  const r = BarbAttack.expelBarbarians(s2).find(x => x.hex === hex);
  ok(r, 'hay batalla');
  ok(!B2.on[hex], 'casilla liberada');
  eq(s2.players[0].prisoners, 1, 'un prisionero');
  eq(Object.keys(B2.on).length, others.length, 'las demás no cambian');
  const lost = r.lost.length;
  eq(s2.players[0].knightsLeft, 4 + lost, 'los caídos vuelven a la reserva');
  eq(s2.players[0].gold, 3 * lost, '3 de oro por caído');
  // equal numbers are not enough
  const s3 = baGame(), B3 = s3.barbAttack;
  const h3 = s3.board.coast.find(h => !B3.on[h]);
  B3.on[h3] = 2; B3.pool -= 2;
  const p3 = BarbAttack.hexPaths(s3, h3);
  B3.knights[p3[0]] = 0; B3.knights[p3[1]] = 1;
  ok(!BarbAttack.expelBarbarians(s3).some(x => x.hex === h3), '2 contra 2 no basta');
  // shared victory: 2 barbarians, 3 knights of 2 players → 1 prisoner each
  B3.knights[p3[2]] = 1;
  const r3 = BarbAttack.expelBarbarians(s3).find(x => x.hex === h3);
  eq(r3.prisoners, { 0: 1, 1: 1 }, 'uno para cada uno');
  // prisoners score: 2 = 1 VP
  const vp = G.victoryPoints(s3, 0);
  s3.players[0].prisoners = 3;
  eq(G.victoryPoints(s3, 0), vp + 1, '3 prisioneros = 1 punto');
});

t('Ataque bárbaro: traición e intriga', () => {
  const s = baGame(), b = s.board, B = s.barbAttack;
  const [h1] = b.barbStart;
  const to = b.coast.find(h => !B.on[h]);
  B.deck = ['treason'];
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  ok(act(s, { type: 'buyDev', pid: 0 }).ok, 'compra traición');
  eq(s.players[0].gold, 2, '+2 de oro');
  eq(s.phase, 'baCard', 'elige qué mover');
  ok(!act(s, { type: 'baCard', pid: 0, moves: [{ from: to, to: h1 }] }).ok, 'no desde una casilla vacía');
  ok(act(s, { type: 'baCard', pid: 0, moves: [{ from: h1, to }] }).ok, 'mueve un bárbaro');
  eq(B.on[to], 1, 'llegó');
  B.deck = ['intrigue'];
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  ok(act(s, { type: 'buyDev', pid: 0 }).ok, 'compra intriga');
  ok(act(s, { type: 'baCard', pid: 0, hex: to }).ok, 'toma un prisionero');
  eq(s.players[0].prisoners, 1, 'prisionero');
  ok(!B.on[to], 'ya no está en la casilla');
  // intrigue on a conquered hex frees it
  const c = b.coast.find(h => !B.on[h]);
  B.on[c] = 3; B.conquered.push(c); B.pool -= 3;
  B.deck = ['intrigue'];
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  act(s, { type: 'buyDev', pid: 0 });
  ok(act(s, { type: 'baCard', pid: 0, hex: c }).ok, 'de una casilla conquistada');
  ok(!BarbAttack.isConquered(s, c), 'queda liberada');
});

// ---------- Traders & Barbarians: the main scenario (board) ----------
t('Mercaderes y bárbaros: 3 casillas de comercio con plaza, sin 2 ni 12, bárbaros y oro', () => {
  for (const shape of ['classic', 'big', 'pangea', 'extended']) for (let seed = 1; seed <= 12; seed++) {
    const c = defaultConfig(); c.seed = seed * 31; c.map.shape = shape;
    c.expansions = { tradersBarbarians: true, tbScenario: 'tradersBarbarians' };
    const s = G.createGame(c), b = s.board;
    eq(b.trade.length, 3, 'tres casillas de comercio');
    eq(new Set(b.trade.map(t => t.kind)).size, 3, 'castillo, cantera y vidriería');
    for (const T of b.trade) {
      const tile = b.tiles[T.hex];
      ok(tile.trade === T.kind && tile.res === 'desert' && !tile.num, 'sin número ni producción');
      const P = b.vertices[T.plaza];
      ok(P.plaza === T.hex && P.hexes.length === 0, 'plaza en el centro');
      ok(T.inner.length >= 2 && T.inner.every(e => b.edges[e].inner && (b.edges[e].a === T.plaza || b.edges[e].b === T.plaza)), 'caminos interiores a la plaza');
      ok(T.closed.length >= 2 && T.closed.every(e => b.edges[e].noRoad), 'lado del mar cerrado');
      ok(!G.canSetupSettlement(s, 0, T.plaza), 'nadie construye en la plaza');
    }
    ok(b.tiles.every(t => t.num !== 2 && t.num !== 12), 'sin 2 ni 12');
    ok(b.ports.every(p => !b.edges[p.edge].noRoad && b.vertices[b.edges[p.edge].a].port === p.id), 'ningún puerto en el lado cerrado');
    eq(s.traders.barbarians.length, 3, 'tres bárbaros');
    ok(s.traders.barbarians.every(e => !b.edges[e].inner && !b.edges[e].noRoad), 'en caminos de tierra');
    eq(b.robber, -1, 'sin ladrón');
    ok(s.players.every(p => p.gold === 5), '5 de oro');
    for (const k of ['castle', 'quarry', 'glassworks']) eq(s.traders.stacks[k].length, 12, '12 mercancías por montón');
    ok(s.config.rules.setupCity, 'el segundo poblado inicial es ciudad');
  }
  // roads: inner paths yes, sea side and barbarian paths no
  const c = defaultConfig(); c.seed = 5;
  c.expansions = { tradersBarbarians: true, tbScenario: 'tradersBarbarians' };
  const s = G.createGame(c), b = s.board, T = b.trade[0];
  s.buildings = {}; s.roads = {};
  const inner = b.edges[T.inner[0]], corner = inner.a === T.plaza ? inner.b : inner.a;
  s.buildings[corner] = { owner: 0, type: 'settlement' };
  ok(G.canBuildRoad(s, 0, T.inner[0]), 'camino interior');
  const cl = b.edges[T.closed[0]];
  s.buildings[cl.a] = { owner: 0, type: 'settlement' }; s.buildings[cl.b] = { owner: 0, type: 'settlement' };
  ok(!G.canBuildRoad(s, 0, T.closed[0]), 'no por el lado del mar');
  const be = b.edges[s.traders.barbarians[0]];
  s.buildings[be.a] = { owner: 0, type: 'settlement' };
  ok(!G.canBuildRoad(s, 0, be.id), 'no donde hay un bárbaro');
  // base boards are untouched
  const base = G.createGame(defaultConfig());
  ok(!base.board.trade && !base.traders && base.board.vertices.every(v => v.plaza == null), 'el juego base no cambia');
});

t('Mercaderes y bárbaros: el carromato se mueve, paga peajes, carga y entrega', () => {
  const c = defaultConfig(); c.seed = 7;
  c.expansions = { tradersBarbarians: true, tbScenario: 'tradersBarbarians' };
  const s = G.createGame(c), b = s.board, T = s.traders;
  s.phase = 'main'; s.current = 0; s.turn = 5;
  s.buildings = {}; s.roads = {}; T.barbarians = [];
  const tr = b.trade[0], plaza = tr.plaza, inner = b.edges[tr.inner[0]];
  const corner = inner.a === plaza ? inner.b : inner.a;
  // start two steps away: corner's other neighbour -> corner -> plaza
  const e0 = b.vertices[corner].edges.find(e => !b.edges[e].inner);
  const start = b.edges[e0].a === corner ? b.edges[e0].b : b.edges[e0].a;
  T.wagons[0].at = start;
  s.roads[e0] = 1; // a rival road: 1 MP + 1 gold toll
  const g0 = s.players[0].gold, g1 = s.players[1].gold;
  ok(act(s, { type: 'tbMove', pid: 0, to: corner }).ok, 'avanza');
  eq(s.players[0].gold, g0 - 1, 'paga 1 de oro');
  eq(s.players[1].gold, g1 + 1, 'al dueño del camino');
  eq(Traders.mpLeft(s, 0), 3, 'gastó 1 punto');
  ok(!act(s, { type: 'tbMove', pid: 0, to: start + 100000 }).ok, 'solo a un cruce vecino');
  ok(act(s, { type: 'tbMove', pid: 0, to: plaza }).ok, 'llega a la plaza (sin camino: 2 puntos)');
  eq(Traders.mpLeft(s, 0), 1, 'le queda 1');
  ok(T.wagons[0].cargo, 'carga una mercancía');
  eq(T.stacks[tr.kind].length, 11, 'del montón de esa casilla');
  ok(Traders.SUPPLIES[tr.kind].includes(T.wagons[0].cargo), 'una de las dos que ofrece');
  ok(!act(s, { type: 'tbMove', pid: 0, to: corner }).ok, 'en la plaza se detiene hasta el próximo turno');
  // delivery: put the wagon next to the plaza that needs the cargo
  const dest = Traders.tradeOfKind(s, Traders.NEEDED_AT[T.wagons[0].cargo]);
  const de = b.edges[dest.inner[0]], dc = de.a === dest.plaza ? de.b : de.a;
  s.turn = 6; T.wagons[0].at = dc;
  const vp = G.victoryPoints(s, 0), gold = s.players[0].gold;
  ok(act(s, { type: 'tbMove', pid: 0, to: dest.plaza }).ok, 'llega al destino');
  eq(G.victoryPoints(s, 0), vp + 1, '+1 punto');
  eq(s.players[0].gold, gold + 1, '+1 de oro (nivel 1)');
  eq(T.wagons[0].delivered, 1, 'una entrega');
  ok(T.wagons[0].cargo, 'y carga la siguiente allí');
  // barbarian: +2 MP
  s.turn = 7; s.roads = {};
  T.barbarians = [e0]; T.wagons[0].at = start;
  eq(Traders.pathCost(s, 0, e0).mp, 4, 'sin camino y con bárbaro: 4');
  ok(act(s, { type: 'tbMove', pid: 0, to: corner }).ok, 'cuesta 4 de 4');
  ok(!act(s, { type: 'tbMove', pid: 0, to: start }).ok, 'ya no le quedan puntos');
  // grain boost once per turn; upgrades
  give(s, 0, { wheat: 2 });
  ok(act(s, { type: 'tbBoost', pid: 0 }).ok, '1 cereal: +2');
  eq(Traders.mpLeft(s, 0), 2, 'ahora 2');
  ok(!act(s, { type: 'tbBoost', pid: 0 }).ok, 'solo una vez');
  for (let lv = 2; lv <= 5; lv++) {
    give(s, 0, Traders.WAGON_LEVELS[lv - 1].cost);
    ok(act(s, { type: 'tbUpgrade', pid: 0 }).ok, 'mejora a ' + lv);
  }
  eq(T.wagons[0].level, 5, 'nivel 5');
  ok(!act(s, { type: 'tbUpgrade', pid: 0 }).ok, 'no hay más');
  eq(G.victoryPoints(s, 0), vp + 2, 'el nivel 5 da 1 punto');
  // no Longest Road; gold buys resources
  eq(s.longestRoad.owner, -1, 'sin camino más largo');
  s.players[0].gold = 4;
  ok(act(s, { type: 'goldBuy', pid: 0, res: 'ore' }).ok, 'oro → recurso');
});

t('Mercaderes y bárbaros: sin 2 ni 12, el 7 y el caballero mueven bárbaros, espantar, viaje rápido', () => {
  const mk = () => { const c = defaultConfig(); c.seed = 11; c.rules.robberGrace = 0; c.expansions = { tradersBarbarians: true, tbScenario: 'tradersBarbarians' }; return G.createGame(c); };
  const s = mk(), b = s.board, T = s.traders;
  // the deck
  const count = {};
  for (const c of s.devDeck) count[c] = (count[c] || 0) + 1;
  eq([count.knight, count.roadBuilding, count.swiftJourney, count.vp, s.devDeck.length], [16, 3, 3, 3, 25], '25 cartas propias');
  // dice: never 2 or 12
  s.round = 5; s.turn = 5;
  let seven = false;
  for (let i = 0; i < 300; i++) {
    s.phase = 'roll'; s.current = 0;
    ok(act(s, { type: 'roll', pid: 0 }).ok, 'tira');
    const sum = s.dice[0] + s.dice[1];
    ok(sum !== 2 && sum !== 12, 'nunca 2 ni 12');
    if (s.phase === 'discard') for (const pid of G.pendingActors(s)) { const p = s.players[pid]; let k = s.pendingDiscards[pid]; const res = {}; for (const r of Object.keys(p.res)) { const x = Math.min(k, p.res[r]); if (x) res[r] = x; k -= x; } act(s, { type: 'discard', pid, res }); }
    if (s.phase === 'tbBarbarian') { seven = true; break; }
  }
  ok(seven, 'un 7 lleva a mover un bárbaro');
  // the moved barbarian lands on a rival road: steal
  s.buildings = {}; s.roads = {};
  const to = Traders.freeBarbPaths(s)[0];
  s.roads[to] = 1;
  for (const r of Object.keys(s.players[1].res)) s.players[1].res[r] = 0;
  s.players[1].res.ore = 2;
  const from = T.barbarians[0];
  ok(!act(s, { type: 'tbMoveBarbarian', pid: 0, from, to: from }).ok, 'no a un camino ocupado');
  ok(act(s, { type: 'tbMoveBarbarian', pid: 0, from, to }).ok, 'mueve el bárbaro');
  ok(T.barbarians.includes(to) && !T.barbarians.includes(from), 'cambió de camino');
  eq(s.players[1].res.ore, 1, 'roba al dueño del camino');
  eq(s.phase, 'main', 'sigue el turno');
  // knight card: moves a barbarian, no Largest Army
  s.players[0].dev.push({ type: 'knight', turn: 0 }, { type: 'knight', turn: 0 }, { type: 'knight', turn: 0 });
  s.devPlayed = false;
  ok(act(s, { type: 'playDev', pid: 0, card: 'knight' }).ok, 'juega caballero');
  eq(s.phase, 'tbBarbarian', 'mueve un bárbaro');
  ok(act(s, { type: 'tbMoveBarbarian', pid: 0, from: T.barbarians[1], to: Traders.freeBarbPaths(s)[3] }).ok, 'lo mueve');
  eq(s.largestArmy.owner, -1, 'sin ejército más grande');
  // driving off: level 2 needed; once per barbarian per turn; on success the player moves it (no steal)
  const s2 = mk(), T2 = s2.traders;
  s2.phase = 'main'; s2.current = 0; s2.turn = 3;
  const be = s2.board.edges[T2.barbarians[0]];
  T2.wagons[0].at = be.a;
  ok(!Traders.driveTargets(s2, 0).length, 'nivel 1: no puede');
  T2.wagons[0].level = 5; // drives off on 3-6
  let driven = false;
  for (let turn = 3; turn < 60 && !driven; turn++) {
    s2.turn = turn; s2.phase = 'main';
    ok(act(s2, { type: 'tbDrive', pid: 0, edge: be.id }).ok, 'lo intenta');
    ok(!act(s2, { type: 'tbDrive', pid: 0, edge: be.id }).ok, 'una vez por turno');
    if (s2.phase === 'tbBarbarian') driven = true;
  }
  ok(driven, 'acaba espantándolo');
  ok(!act(s2, { type: 'tbMoveBarbarian', pid: 0, from: T2.barbarians[1], to: Traders.freeBarbPaths(s2)[0] }).ok || T2.barbarians.includes(be.id) === false, 'solo se mueve el espantado');
  if (s2.phase === 'tbBarbarian') ok(act(s2, { type: 'tbMoveBarbarian', pid: 0, to: Traders.freeBarbPaths(s2)[0] }).ok, 'lo mueve a otro camino');
  ok(!T2.barbarians.includes(be.id), 'ya no está allí');
  eq(s2.phase, 'main', 'sigue el turno');
  // swift journey: the wagon moves again with all its points
  const s3 = mk(), T3 = s3.traders;
  s3.phase = 'main'; s3.current = 0; s3.turn = 4; T3.barbarians = [];
  T3.move = { turn: 4, pid: 0, mp: 0, boost: false, stopped: true };
  s3.players[0].dev.push({ type: 'swiftJourney', turn: 0 });
  s3.devPlayed = false;
  ok(act(s3, { type: 'playDev', pid: 0, card: 'swiftJourney' }).ok, 'viaje rápido');
  eq(Traders.mpLeft(s3, 0), 4, '4 puntos más');
  ok(!Traders.stopped(s3, 0), 'puede salir de la plaza');
});

t('Capitán del puerto: puntos de puerto, al menos 3, el que lo tiene lo conserva en empate', () => {
  const base = G.createGame(defaultConfig());
  ok(base.harbormaster === undefined, 'el juego base no lo tiene');
  const c = defaultConfig();
  const hm = MODES.find(m => m.id === 'harbormaster');
  hm.set(c, true);
  eq(c.rules.vpTarget, 11, 'se juega a 1 punto más');
  hm.set(c, true);
  eq(c.rules.vpTarget, 11, 'no suma dos veces');
  const s = G.createGame(c), b = s.board;
  s.phase = 'main'; s.current = 0; s.turn = 5;
  s.buildings = {}; s.roads = {};
  const portV = b.vertices.filter(v => v.port != null).map(v => v.id);
  const vp0 = G.victoryPoints(s, 0);
  s.buildings[portV[0]] = { owner: 0, type: 'settlement' };
  s.buildings[portV[2]] = { owner: 0, type: 'settlement' };
  act(s, { type: 'endTurn', pid: 0 }); // any action refreshes the card
  eq(G.harborPoints(s, 0), 2, '2 poblados = 2 puntos');
  eq(s.harbormaster.owner, -1, 'menos de 3: nadie');
  s.current = 0; s.phase = 'main';
  s.buildings[portV[0]].type = 'city';
  act(s, { type: 'endTurn', pid: 0 });
  eq(G.harborPoints(s, 0), 3, 'ciudad = 2');
  eq(s.harbormaster.owner, 0, 'con 3 es Capitán');
  eq(G.victoryPoints(s, 0), vp0 + 3 + 2, 'ciudad + poblado + 2 del Capitán');
  // a rival ties: the holder keeps it; then leads alone: it moves
  s.current = 1; s.phase = 'main';
  s.buildings[portV[4]] = { owner: 1, type: 'city' };
  s.buildings[portV[6]] = { owner: 1, type: 'settlement' };
  act(s, { type: 'endTurn', pid: 1 });
  eq(s.harbormaster.owner, 0, 'empate: lo conserva');
  s.current = 1; s.phase = 'main';
  s.buildings[portV[6]].type = 'city';
  act(s, { type: 'endTurn', pid: 1 });
  eq(s.harbormaster.owner, 1, 'pasa al que tiene más');
});

t('Cartas de evento: 36 cartas como dos dados, año nuevo, epidemia y ladrón que huye', () => {
  eq(G.createGame(defaultConfig()).eventDeck, undefined, 'el juego base no tiene mazo');
  const count = {};
  for (const c of EvCards.EVENT_CARDS) count[c.num] = (count[c.num] || 0) + 1;
  for (let n = 2; n <= 12; n++) eq(count[n], 6 - Math.abs(7 - n), 'el ' + n + ' sale como con dos dados');
  ok(EvCards.EVENT_CARDS.every(c => c.red >= 1 && c.red <= 6 && c.num - c.red >= 1 && c.num - c.red <= 6), 'dados válidos');
  eq(EvCards.EVENT_CARDS.filter(c => !c.event).length, 16, '16 sin evento');
  const c = defaultConfig(); c.rules.diceMode = 'eventCards';
  const s = G.createGame(c);
  eq(s.eventDeck.length, 37, '36 cartas + año nuevo');
  eq(s.eventDeck[EvCards.LEFT_OUT], EvCards.NEW_YEAR, 'el año nuevo encima de 5 cartas');
  // 31 draws, then the New Year reshuffles
  let ny = 0;
  for (let i = 0; i < 31; i++) { const r = EvCards.drawEventCard(s); if (r.newYear) ny++; }
  eq(ny, 0, '31 cartas sin año nuevo');
  ok(EvCards.drawEventCard(s).newYear, 'la 32ª trae el año nuevo');
  // rolling draws a card: the dice follow it
  s.phase = 'roll'; s.current = 0; s.round = 5; s.turn = 5;
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'roba carta');
  ok(s.eventCard && s.dice[0] + s.dice[1] === s.eventCard.num && s.dice[1] === s.eventCard.red, 'los dados son los de la carta');
  // epidemic: a city gives 1
  const s2 = G.createGame(c), b = s2.board;
  const tile = b.tiles.find(t => t.num === 6);
  s2.buildings = { [tile.verts[0]]: { owner: 1, type: 'city' } };
  if (b.robber === tile.id) b.robber = -1;
  for (const r of Object.keys(s2.players[1].res)) s2.players[1].res[r] = 0;
  s2.eventDeck.push(EvCards.EVENT_CARDS.find(x => x.num === 6 && x.event === 'epidemic').id);
  s2.phase = 'roll'; s2.current = 0;
  ok(act(s2, { type: 'roll', pid: 0 }).ok, 'epidemia');
  eq(s2.players[1].res[tile.res], 1, 'la ciudad da solo 1');
  // robber flees to the desert
  const s3 = G.createGame(c), b3 = s3.board;
  const land = b3.tiles.find(t => t.res !== 'desert' && t.num);
  b3.robber = land.id;
  s3.eventDeck.push(EvCards.EVENT_CARDS.find(x => x.event === 'robberFlees').id);
  s3.phase = 'roll'; s3.current = 0;
  ok(act(s3, { type: 'roll', pid: 0 }).ok, 'huye');
  const desert = b3.tiles.find(t => t.res === 'desert');
  eq(b3.robber, desert ? desert.id : -1, 'al desierto');
});

t('Cartas de evento: año abundante, buenos vecinos, vecino solidario, ventaja comercial, terremoto', () => {
  const mk = ev => {
    const c = defaultConfig(); c.rules.diceMode = 'eventCards';
    const s = G.createGame(c);
    s.phase = 'roll'; s.current = 0; s.turn = 6; s.round = 4;
    for (const p of s.players) for (const r of Object.keys(p.res)) p.res[r] = 0;
    s.eventDeck.push(EvCards.EVENT_CARDS.find(x => x.event === ev).id);
    return s;
  };
  // plentiful year: everybody takes 1, then production
  let s = mk('plentifulYear');
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'roba');
  eq(s.phase, 'evChoice', 'todos eligen');
  eq(G.pendingActors(s).length, s.players.length, 'todos');
  for (const pid of G.pendingActors(s)) ok(act(s, { type: 'evChoose', pid, res: 'ore' }).ok, 'toma');
  ok(s.players.every(p => p.res.ore >= 1), 'un mineral cada uno');
  eq(s.phase, 'main', 'y sigue el turno');
  // good neighbors: give to the left
  s = mk('goodNeighbors');
  s.players.forEach((p, i) => { p.res.wood = 1; });
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'roba');
  ok(!act(s, { type: 'evChoose', pid: 0, res: 'brick' }).ok, 'no da lo que no tiene');
  for (const pid of G.pendingActors(s)) ok(act(s, { type: 'evChoose', pid, res: 'wood' }).ok, 'da');
  ok(s.players.every(p => p.res.wood === 1), 'cada uno da una y recibe una');
  // helpful neighbor: the leader gives to someone with fewer points
  s = mk('helpfulNeighbor');
  s.buildings = {}; s.buildings[s.board.vertices.find(v => v.hexes.length === 3).id] = { owner: 2, type: 'city' };
  s.players[2].res.sheep = 2;
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'roba');
  eq(G.pendingActors(s), [2], 'da el que va primero');
  ok(!act(s, { type: 'evChoose', pid: 2, res: 'sheep', to: 2 }).ok, 'no a sí mismo');
  ok(act(s, { type: 'evChoose', pid: 2, res: 'sheep', to: 1 }).ok, 'a otro');
  eq(s.players[1].res.sheep >= 1, true, 'recibió');
  // trade advantage: the longest road steals
  s = mk('tradeAdvantage');
  s.longestRoad = { owner: 3, len: 5 };
  s.players[1].res.wheat = 1;
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'roba');
  eq(G.pendingActors(s), [3], 'roba el del camino más largo');
  ok(act(s, { type: 'evChoose', pid: 3, target: 1 }).ok, 'elige víctima');
  eq(s.players[1].res.wheat, 0, 'perdió la carta');
  // earthquake: a damaged road blocks roads and settlements next to it until repaired
  s = mk('earthquake');
  s.buildings = {}; s.roads = {};
  const v0 = s.board.vertices.find(v => v.hexes.length === 3);
  s.buildings[v0.id] = { owner: 0, type: 'settlement' };
  s.roads[v0.edges[0]] = 0;
  ok(act(s, { type: 'roll', pid: 0 }).ok, 'terremoto');
  const dmg = G.damagedRoadsOf(s, 0);
  eq(dmg.length, 1, 'un camino dañado');
  s.phase = 'main';
  const e = s.board.edges.find(E => G.canBuildRoad({ ...s, damagedRoads: {} }, 0, E.id));
  if (e) ok(!G.canBuildRoad(s, 0, e.id), 'no construye caminos');
  give(s, 0, { wood: 1, brick: 1 });
  ok(act(s, { type: 'evRepair', pid: 0 }).ok, 'repara');
  eq(G.damagedRoadsOf(s, 0).length, 0, 'reparado');
  if (e) ok(G.canBuildRoad(s, 0, e.id), 'ya puede');
});

// ---------- Cities & Knights: commodities and event die ----------
function ckMain(seed = 11) {
  const s = fresh(c => {
    c.seed = seed;
    c.expansions = { seafarers: false, citiesKnights: true, scenario: 'newShores' };
    c.rules.vpTarget = 13;
  });
  return s;
}
// a corner touching a tile of `res`, for a city of player 0
const cornerOf = (s, res) => s.board.tiles.find(t => t.res === res && t.num).verts[0];

t('Ciudades y Caballeros: banco y manos con mercancías; sin la expansión no existen', () => {
  const s = ckMain();
  for (const c of ['paper', 'cloth', 'coin']) {
    eq(s.bank[c], 12, 'banco ' + c);
    eq(s.players[0].res[c], 0, 'mano ' + c);
  }
  const b = fresh();
  ok(b.bank.paper === undefined && b.players[0].res.paper === undefined, 'base: sin mercancías');
});

t('Ciudades y Caballeros: una ciudad junto al bosque da madera + papel; junto a la colina, 2 arcillas', () => {
  for (const [res, expect] of [['wood', { wood: 1, paper: 1 }], ['sheep', { sheep: 1, cloth: 1 }], ['ore', { ore: 1, coin: 1 }], ['brick', { brick: 2 }], ['wheat', { wheat: 2 }]]) {
    const s = ckMain();
    s.board.robber = -1;
    const tile = s.board.tiles.find(t => t.res === res && t.num);
    s.buildings[tile.verts[0]] = { owner: 0, type: 'city' };
    const before = { ...s.players[0].res };
    // force the tile's number
    let tries = 0;
    do {
      s.phase = 'roll';
      s.current = 0;
      for (const k in s.players[0].res) s.players[0].res[k] = before[k];
      s.barbarians.pos = 0; // keep the barbarians at sea: this test is about production
      act(s, { type: 'roll', pid: 0 });
      s.pendingDiscards = {};
    } while (s.dice[0] + s.dice[1] !== tile.num && ++tries < 300);
    // only this tile's production counts: other tiles with the same number touch nothing of ours
    const got = {};
    for (const k in s.players[0].res) if (s.players[0].res[k] !== before[k]) got[k] = s.players[0].res[k] - before[k];
    eq(got, expect, 'ciudad en ' + res);
  }
});

t('Ciudades y Caballeros: el dado de evento rueda con los números (solo con la expansión)', () => {
  const s = ckMain();
  s.phase = 'roll';
  act(s, { type: 'roll', pid: 0 });
  ok(['ship', 'trade', 'politics', 'science'].includes(s.eventDie), 'cara del dado: ' + s.eventDie);
  const b = fresh();
  b.phase = 'roll';
  act(b, { type: 'roll', pid: 0 });
  ok(b.eventDie === undefined, 'base: sin dado de evento');
});

t('Ciudades y Caballeros: las mercancías cuentan para el 7 y se descartan', () => {
  const s = ckMain();
  give(s, 0, { paper: 4, coin: 4 });
  s.phase = 'roll';
  let tries = 0;
  do {
    s.phase = 'roll';
    s.current = 0;
    s.pendingDiscards = {};
    act(s, { type: 'roll', pid: 0 });
  } while (s.dice[0] + s.dice[1] !== 7 && ++tries < 300);
  eq(s.pendingDiscards[0], 4, '8 cartas: descarta 4');
  ok(act(s, { type: 'discard', pid: 0, res: { paper: 2, coin: 2 } }).ok, 'descarta mercancías');
  eq(s.players[0].res.paper + s.players[0].res.coin, 4);
  eq(s.bank.paper, 10, 'vuelven al banco');
});

t('Ciudades y Caballeros: el banco cambia mercancías 4:1 y se comercian entre jugadores', () => {
  const s = ckMain();
  give(s, 0, { cloth: 4 });
  ok(act(s, { type: 'bankTrade', pid: 0, give: 'cloth', get: 'ore' }).ok, 'banco 4:1');
  eq(s.players[0].res.cloth, 0);
  eq(s.players[0].res.ore, 1);
  give(s, 0, { paper: 1 });
  give(s, 1, { wood: 1 });
  ok(act(s, { type: 'proposeTrade', pid: 0, give: { paper: 1 }, get: { wood: 1 }, to: [1] }).ok, 'oferta con papel');
  ok(act(s, { type: 'respondTrade', pid: 1, accept: true }).ok);
  ok(act(s, { type: 'confirmTrade', pid: 0, with: 1 }).ok);
  eq(s.players[1].res.paper, 1, 'el papel cambió de manos');
});

t('Ciudades y Caballeros: el ladrón también roba mercancías', () => {
  const s = ckMain();
  const tile = s.board.tiles.find(t => t.res !== 'desert' && t.id !== s.board.robber);
  s.buildings[tile.verts[0]] = { owner: 1, type: 'settlement' };
  give(s, 1, { coin: 1 });
  s.phase = 'robber';
  s.robberReturn = 'main';
  ok(act(s, { type: 'moveRobber', pid: 0, tile: tile.id, victim: 1 }).ok);
  eq(s.players[0].res.coin, 1, 'robó la moneda');
});

// ---------- Cities & Knights: improvements, metropolis, walls, aqueduct ----------
t('Ciudades y Caballeros: mejorar cuesta nivel × mercancía y necesita una ciudad', () => {
  const s = ckMain();
  give(s, 0, { cloth: 6 });
  ok(!act(s, { type: 'improve', pid: 0, track: 'trade' }).ok, 'sin ciudad no');
  s.buildings[cornerOf(s, 'wheat')] = { owner: 0, type: 'city' };
  ok(act(s, { type: 'improve', pid: 0, track: 'trade' }).ok, 'nivel 1');
  ok(act(s, { type: 'improve', pid: 0, track: 'trade' }).ok, 'nivel 2');
  ok(act(s, { type: 'improve', pid: 0, track: 'trade' }).ok, 'nivel 3');
  eq(s.players[0].improve.trade, 3);
  eq(s.players[0].res.cloth, 0, 'pagó 1+2+3 telas');
  ok(!act(s, { type: 'improve', pid: 0, track: 'trade' }).ok, 'sin telas no hay nivel 4');
  ok(!act(s, { type: 'improve', pid: 0, track: 'politics' }).ok, 'política paga con monedas');
  ok(!fresh().metropolis && !act(fresh(), { type: 'improve', pid: 0, track: 'trade' }).ok, 'base: no existe');
});

t('Ciudades y Caballeros: comercio nivel 3 cambia mercancías 2:1', () => {
  const s = ckMain();
  s.buildings[cornerOf(s, 'wheat')] = { owner: 0, type: 'city' };
  eq(G.tradeRatio(s, 0, 'coin'), 4);
  s.players[0].improve.trade = 3;
  eq(G.tradeRatio(s, 0, 'coin'), 2, 'casa de comercio');
  eq(G.tradeRatio(s, 0, 'ore'), 4, 'los recursos no cambian');
});

t('Ciudades y Caballeros: el primero en nivel 4 levanta la metrópolis (+2) y el nivel 5 se la quita', () => {
  const s = ckMain();
  const v0 = cornerOf(s, 'wheat'), v1 = cornerOf(s, 'ore');
  s.buildings[v0] = { owner: 0, type: 'city' };
  s.buildings[v1] = { owner: 1, type: 'city' };
  s.players[0].improve.science = 3;
  s.players[1].improve.science = 4;
  give(s, 0, { paper: 9 });
  const vp = G.victoryPoints(s, 0);
  ok(act(s, { type: 'improve', pid: 0, track: 'science' }).ok, 'nivel 4');
  eq(s.metropolis.science, { owner: 0, at: v0 }, 'metrópolis');
  eq(G.victoryPoints(s, 0), vp + 2, '+2 puntos');
  // player 1 was already on 4 but had no metropolis: reaching 5 takes it
  s.current = 1;
  give(s, 1, { paper: 5 });
  ok(act(s, { type: 'improve', pid: 1, track: 'science' }).ok, 'nivel 5');
  eq(s.metropolis.science, { owner: 1, at: v1 }, 'cambió de dueño');
  eq(G.victoryPoints(s, 0), vp, 'perdió los 2 puntos');
});

t('Ciudades y Caballeros: nivel 4 necesita una ciudad sin metrópolis', () => {
  const s = ckMain();
  const v0 = cornerOf(s, 'wheat');
  s.buildings[v0] = { owner: 0, type: 'city' };
  s.metropolis.trade = { owner: 0, at: v0 };
  s.players[0].improve.trade = 4;
  s.players[0].improve.politics = 3;
  give(s, 0, { coin: 4 });
  ok(!act(s, { type: 'improve', pid: 0, track: 'politics' }).ok, 'su única ciudad ya tiene metrópolis');
});

t('Ciudades y Caballeros: la muralla cuesta 2 arcillas y sube el límite del 7', () => {
  const s = ckMain();
  const v0 = cornerOf(s, 'wheat');
  s.buildings[v0] = { owner: 0, type: 'city' };
  give(s, 0, { brick: 2 });
  ok(act(s, { type: 'buildWall', pid: 0, at: v0 }).ok, 'muralla');
  eq(s.walls[v0], 0);
  eq(s.players[0].wallsLeft, 2);
  ok(!act(s, { type: 'buildWall', pid: 0, at: v0 }).ok, 'una por ciudad');
  // 9 cards with one wall (limit 7 + 2): no discard
  give(s, 0, { wheat: 9 });
  let tries = 0;
  do {
    s.phase = 'roll';
    s.current = 0;
    s.pendingDiscards = {};
    s.barbarians.pos = 0; // no attack (it would take the walled city)
    for (const r in s.players[0].res) s.players[0].res[r] = r === 'wheat' ? 9 : 0; // production must not grow the hand
    act(s, { type: 'roll', pid: 0 });
  } while (s.dice[0] + s.dice[1] !== 7 && ++tries < 300);
  ok(!s.pendingDiscards[0], 'con 9 cartas y muralla no descarta' + JSON.stringify([s.dice, tries, s.phase, s.pendingDiscards, G.handSize(s.players[0].res), s.walls]));
});

t('Ciudades y Caballeros: acueducto: si la tirada no te da nada eliges un recurso', () => {
  const s = ckMain();
  s.buildings[cornerOf(s, 'wheat')] = { owner: 0, type: 'city' };
  s.players[0].improve.science = 3;
  let tries = 0, hit = false;
  while (++tries < 300) {
    s.phase = 'roll';
    s.current = 0;
    s.pendingDiscards = {};
    const before = G.handSize(s.players[0].res);
    act(s, { type: 'roll', pid: 0 });
    if (s.dice[0] + s.dice[1] === 7) continue;
    if (G.handSize(s.players[0].res) === before) {
      hit = true;
      break;
    }
  }
  ok(hit, 'hubo una tirada sin producción');
  eq(s.phase, 'aqueduct');
  eq(G.pendingActors(s), [0]);
  const ore = s.players[0].res.ore;
  ok(act(s, { type: 'aqueductPick', pid: 0, res: 'ore' }).ok);
  eq(s.players[0].res.ore, ore + 1);
  eq(s.phase, 'main');
});

// ---------- Cities & Knights: knights ----------
// a little road network for player 0: settlement at a, roads a-b-c-d (returns the corners)
function ckRoads(s, pid = 0) {
  const bd = s.board;
  const a = bd.tiles.find(t => t.num).verts[0];
  const path = [a];
  const roads = [];
  while (path.length < 4) {
    const v = path[path.length - 1];
    const e = bd.vertices[v].edges.find(x => !roads.includes(x) && !path.includes(bd.edges[x].a === v ? bd.edges[x].b : bd.edges[x].a) && bd.edges[x].hexes.length);
    roads.push(e);
    path.push(bd.edges[e].a === v ? bd.edges[e].b : bd.edges[e].a);
  }
  s.buildings[a] = { owner: pid, type: 'settlement' };
  for (const e of roads) s.roads[e] = pid;
  return { path, roads };
}

t('Ciudades y Caballeros: reclutar cuesta lana + mineral y va junto a tu camino', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  ok(!act(s, { type: 'recruitKnight', pid: 0, at: path[2] }).ok, 'sin recursos no');
  give(s, 0, { sheep: 1, ore: 1 });
  ok(!act(s, { type: 'recruitKnight', pid: 0, at: path[0] }).ok, 'no sobre un edificio');
  ok(act(s, { type: 'recruitKnight', pid: 0, at: path[2] }).ok, 'recluta');
  eq(s.knights[path[2]].level, 1);
  ok(!s.knights[path[2]].active, 'empieza inactivo');
  eq(s.players[0].knightsLeft[1], 1);
  ok(!G.canBuildSettlement(s, 0, path[2]), 'no se construye encima de un caballero');
  ok(!fresh().knights && !act(fresh(), { type: 'recruitKnight', pid: 0, at: 0 }).ok, 'base: no existe');
});

t('Ciudades y Caballeros: ascender; poderoso necesita política 3', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  Knights.recruit(s, 0, path[2]);
  give(s, 0, { sheep: 3, ore: 3 });
  ok(act(s, { type: 'promoteKnight', pid: 0, at: path[2] }).ok, 'a fuerte');
  eq(s.knights[path[2]].level, 2);
  ok(!act(s, { type: 'promoteKnight', pid: 0, at: path[2] }).ok, 'una vez por turno');
  s.turn++;
  ok(!act(s, { type: 'promoteKnight', pid: 0, at: path[2] }).ok, 'sin fortaleza no hay poderoso');
  s.players[0].improve.politics = 3;
  ok(act(s, { type: 'promoteKnight', pid: 0, at: path[2] }).ok, 'con fortaleza sí');
  eq(s.knights[path[2]].level, 3);
  eq(s.players[0].knightsLeft, { 1: 2, 2: 2, 3: 1 }, 'las piezas vuelven a la reserva');
});

t('Ciudades y Caballeros: activar con cereal; actúa a partir del turno siguiente y una vez', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  Knights.recruit(s, 0, path[1]);
  give(s, 0, { wheat: 1 });
  ok(act(s, { type: 'activateKnight', pid: 0, at: path[1] }).ok, 'activa');
  ok(s.knights[path[1]].active);
  eq(Knights.activeStrength(s, 0), 1, 'fuerza activa');
  ok(!act(s, { type: 'knightMove', pid: 0, from: path[1], to: path[3] }).ok, 'recién activado no actúa');
  s.turn++;
  ok(act(s, { type: 'knightMove', pid: 0, from: path[1], to: path[3] }).ok, 'se mueve por tus caminos');
  ok(s.knights[path[3]] && !s.knights[path[1]], 'cambió de sitio');
  ok(!s.knights[path[3]].active, 'tras actuar queda inactivo');
});

t('Ciudades y Caballeros: expulsar a un caballero más débil; su dueño lo recoloca', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  // player 1 has a basic knight at the end of player 0's roads, and a road of its own to retreat along
  Knights.recruit(s, 0, path[1]);
  Knights.promote(s, 0, path[1]);
  Knights.activate(s, path[1]);
  s.turn++;
  Knights.recruit(s, 1, path[3]);
  const bd = s.board;
  const out = bd.vertices[path[3]].edges.find(e => s.roads[e] === undefined && bd.edges[e].hexes.length);
  s.roads[out] = 1;
  ok(act(s, { type: 'knightDisplace', pid: 0, from: path[1], to: path[3] }).ok, 'expulsa');
  eq(s.knights[path[3]].owner, 0, 'ocupa el cruce');
  eq(s.phase, 'displace');
  eq(G.pendingActors(s), [1], 'decide el dueño expulsado');
  const dest = s.displaced.options[0];
  ok(act(s, { type: 'placeDisplaced', pid: 1, at: dest }).ok, 'recoloca');
  eq(s.knights[dest].owner, 1);
  eq(s.phase, 'main');
});

t('Ciudades y Caballeros: el caballero rival corta tus caminos', () => {
  const s = ckMain();
  const { path, roads } = ckRoads(s);
  const bd = s.board;
  const next = bd.vertices[path[3]].edges.find(e => !roads.includes(e) && bd.edges[e].hexes.length && s.roads[e] === undefined);
  ok(G.canBuildRoad(s, 0, next), 'antes se puede seguir');
  Knights.recruit(s, 1, path[3]);
  ok(!G.canBuildRoad(s, 0, next), 'un caballero rival bloquea el cruce');
});

t('Ciudades y Caballeros: un caballero activo junto al ladrón lo expulsa', () => {
  const s = ckMain();
  const tile = s.board.tiles.find(t => t.res !== 'desert' && t.num);
  s.board.robber = tile.id;
  s.barbarians.attacks = 1; // the robber only wakes up after the first barbarian attack
  const v = tile.verts[2];
  s.roads[s.board.vertices[v].edges[0]] = 0;
  Knights.recruit(s, 0, v);
  Knights.activate(s, v);
  s.turn++;
  ok(act(s, { type: 'knightChase', pid: 0, from: v }).ok, 'expulsa al ladrón');
  eq(s.phase, 'robber');
  ok(!s.knights[v].active, 'el caballero queda inactivo');
});

// ---- Cities & Knights barbarians ----
const ckCity = (s, pid, k) => {
  const v = s.board.vertices.filter(V => V.hexes.length && !s.buildings[V.id] && V.adj.every(w => !s.buildings[w]))[k].id;
  s.buildings[v] = { owner: pid, type: 'city' };
  s.players[pid].citiesLeft--;
  return v;
};
const shipRoll = s => {
  // roll until the event die shows the ship (other faces don't move the barbarians)
  for (let i = 0; i < 200; i++) {
    s.phase = 'roll';
    s.pendingDiscards = {};
    const pos = s.barbarians.pos, att = s.barbarians.attacks;
    act(s, { type: 'roll', pid: s.current });
    if (s.eventDie === 'ship') return;
    eq(s.barbarians.pos, pos, 'sin barco no se mueven');
    eq(s.barbarians.attacks, att);
  }
};

t('Bárbaros: el barco del dado de evento los acerca un paso', () => {
  const s = ckMain();
  eq(s.barbarians.pos, 0);
  shipRoll(s);
  eq(s.barbarians.pos, 1);
});

t('Bárbaros: sin la expansión no existen', () => {
  const s = fresh();
  eq(s.barbarians, undefined);
  eq(s.players[0].defenderVP, undefined);
});

t('Bárbaros: antes del primer ataque el 7 no mueve el ladrón', () => {
  const s = ckMain();
  for (let i = 0; i < 400; i++) {
    s.phase = 'roll';
    s.barbarians.pos = 0;
    for (const p of s.players) for (const r in p.res) p.res[r] = 0;
    act(s, { type: 'roll', pid: 0 });
    if (s.dice[0] + s.dice[1] === 7) break;
  }
  eq(s.dice[0] + s.dice[1], 7);
  eq(s.phase, 'main', 'el ladrón duerme');
});

t('Bárbaros: Catan resiste y el más fuerte es Defensor de Catan (+1 punto)', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  ckCity(s, 1, 0);
  Knights.recruit(s, 0, path[2]);
  Knights.promote(s, 0, path[2]);
  Knights.activate(s, path[2]);
  const vp = G.victoryPoints(s, 0);
  s.barbarians.pos = s.barbarians.track - 1;
  shipRoll(s);
  eq(s.barbarians.attacks, 1);
  eq(s.barbarians.pos, 0, 'el barco vuelve a empezar');
  ok(s.barbarians.last.won, 'Catan gana (2 ≥ 1)');
  eq(s.barbarians.last.defender, 0);
  eq(G.victoryPoints(s, 0), vp + 1);
  ok(!s.knights[path[2]].active, 'los caballeros quedan inactivos');
});

t('Bárbaros: si Catan pierde, el más débil con ciudad la pierde (y su muralla)', () => {
  const s = ckMain();
  const { path } = ckRoads(s); // first: it puts a settlement on a fixed corner
  const c0 = ckCity(s, 0, 0);
  const c1 = ckCity(s, 1, 1);
  s.walls[c0] = 0;
  s.players[0].wallsLeft--;
  Knights.recruit(s, 1, path[2]); // player 1's knight (on player 0's road: fine for the test)
  Knights.activate(s, path[2]);
  s.barbarians.pos = s.barbarians.track - 1;
  const left = s.players[0].citiesLeft;
  shipRoll(s);
  ok(!s.barbarians.last.won, 'Catan pierde (1 < 2)');
  eq(s.barbarians.last.losers, [0]);
  eq(s.buildings[c0].type, 'settlement', 'la única ciudad cae sola');
  eq(s.buildings[c1].type, 'city');
  eq(s.walls[c0], undefined, 'la muralla cae');
  eq(s.players[0].citiesLeft, left + 1);
  ok(s.phase !== 'pillage');
});

t('Bárbaros: con varias ciudades el perdedor elige cuál cae; la metrópolis está a salvo', () => {
  const s = ckMain();
  const a = ckCity(s, 0, 0), b = ckCity(s, 0, 1), c = ckCity(s, 0, 2);
  s.metropolis.trade = { owner: 0, at: c };
  s.barbarians.pos = s.barbarians.track - 1;
  shipRoll(s);
  eq(s.phase, 'pillage');
  eq(G.pendingActors(s), [0]);
  eq(s.pillage[0].sort(), [a, b].sort());
  ok(!act(s, { type: 'pillageCity', pid: 0, at: c }).ok, 'la metrópolis no se puede perder');
  ok(act(s, { type: 'pillageCity', pid: 0, at: b }).ok);
  eq(s.buildings[b].type, 'settlement');
  ok(s.phase !== 'pillage', 'la tirada sigue: ' + s.phase);
});

// ---- Cities & Knights progress cards ----
t('Progreso: 54 cartas, 18 por mazo; sin cartas de desarrollo; sin la expansión no existen', () => {
  const s = ckMain();
  eq(Object.values(s.progress).map(d => d.length), [18, 18, 18]);
  eq(Object.values(Progress.PROGRESS_CARDS).reduce((n, c) => n + c.n, 0), 54);
  eq(s.devDeck.length, 0);
  ok(!act(s, { type: 'buyDev', pid: 0 }).ok, 'no se compran cartas de desarrollo');
  const b = fresh();
  eq(b.progress, undefined);
  eq(b.players[0].progress, undefined);
});

t('Progreso: se roba con la puerta del dado de evento si el dado rojo ≤ nivel + 1', () => {
  const s = ckMain();
  s.players[0].improve.science = 1;
  ok(Progress.drawsOn(s, 0, 'science', 2) && !Progress.drawsOn(s, 0, 'science', 3), 'nivel 1: rojo 1-2');
  ok(!Progress.drawsOn(s, 1, 'science', 1), 'sin mejora no se roba');
  s.players[0].improve.science = 5;
  ok(Progress.drawsOn(s, 0, 'science', 6), 'nivel 5: cualquier rojo');
  s.players[0].improve.science = 1;
  // only science gates with red 1-2 draw for us: the cards in our hand all came from those rolls
  let drawn = 0;
  for (let i = 0; i < 400; i++) {
    s.phase = 'roll';
    s.current = 0;
    s.pendingDiscards = {};
    s.barbarians.pos = 0;
    s.players[0].progress = [];
    s.progressDiscard = null;
    const n = s.progress.science.length;
    act(s, { type: 'roll', pid: 0 });
    const expect = s.eventDie === 'science' && s.dice[1] <= 2 ? 1 : 0;
    eq(n - s.progress.science.length, expect, `ciencia ${s.eventDie} rojo ${s.dice[1]}`);
    drawn += expect;
    if (drawn >= 3) break;
  }
  ok(drawn >= 3, 'se robó varias veces');
});

t('Progreso: las cartas de punto se revelan al robarlas', () => {
  const s = ckMain();
  s.progress.politics.push('constitution');
  const vp = G.victoryPoints(s, 0);
  Progress.draw(s, 0, 'politics');
  eq(s.players[0].progress, []);
  eq(s.players[0].progressVP, 1);
  eq(G.victoryPoints(s, 0), vp + 1);
});

t('Progreso: más de 4 cartas obliga a descartar (la carta vuelve bajo su mazo)', () => {
  const s = ckMain();
  s.players[0].improve.trade = 5;
  s.players[0].progress = ['merchant', 'merchant', 'wedding', 'smith'];
  s.progress.trade.push('tradeMonopoly');
  for (let i = 0; i < 3000 && s.phase !== 'progressDiscard'; i++) {
    s.phase = 'roll';
    s.barbarians.pos = 0;
    s.pendingDiscards = {};
    act(s, { type: 'roll', pid: 0 });
  }
  eq(s.phase, 'progressDiscard');
  eq(G.pendingActors(s), [0]);
  ok(!act(s, { type: 'progressDiscard', pid: 0, card: 'bishop' }).ok, 'solo cartas que tienes');
  ok(act(s, { type: 'progressDiscard', pid: 0, card: 'wedding' }).ok);
  eq(s.players[0].progress.length, 4);
  eq(s.progress.politics[0], 'wedding', 'bajo su mazo');
  ok(s.phase !== 'progressDiscard', 'la tirada sigue: ' + s.phase);
});

t('Progreso: empate de defensores: cada uno elige un mazo y roba', () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  const { path: p1 } = ckRoads(s, 1);
  Knights.recruit(s, 0, path[2]);
  Knights.activate(s, path[2]);
  Knights.recruit(s, 1, p1[3]);
  Knights.activate(s, p1[3]);
  s.barbarians.pos = s.barbarians.track - 1;
  shipRoll(s);
  ok(s.barbarians.last.won, 'Catan gana');
  eq(s.barbarians.last.tied.sort(), [0, 1]);
  eq(s.phase, 'progressPick');
  ok(act(s, { type: 'progressPick', pid: 1, track: 'trade' }).ok);
  eq(s.phase, 'progressPick', 'falta el otro');
  ok(act(s, { type: 'progressPick', pid: 0, track: 'science' }).ok);
  eq(s.players[0].progress.length + s.players[0].progressVP, 1);
  eq(s.players[1].progress.length + s.players[1].progressVP, 1);
  ok(s.phase !== 'progressPick', 'la tirada sigue');
});

// ---- Cities & Knights science progress cards ----
const handSizeOf = (s, pid) => G.handSize(s.players[pid].res);
const withCard = (s, id, pid = 0) => {
  s.players[pid].progress.push(id);
  return s;
};
const played = (s, id, pid = 0) => !s.players[pid].progress.includes(id) && s.progress[Progress.PROGRESS_CARDS[id].track][0] === id;

t('Ciencia: alquimista antes de tirar elige los dados de números', () => {
  const s = withCard(ckMain(), 'alchemist');
  s.phase = 'main';
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'alchemist', dice: [3, 5] }).ok, 'después de tirar no');
  s.phase = 'roll';
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'alchemist', dice: [0, 5] }).ok, 'dados del 1 al 6');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'alchemist', dice: [3, 5] }).ok);
  eq(s.dice, [3, 5]);
  ok(played(s, 'alchemist'), 'vuelve bajo su mazo');
  ok(s.phase !== 'roll', 'la tirada ya está hecha');
});

t('Ciencia: inventor intercambia dos fichas (ni 2, 12, 6 ni 8)', () => {
  const s = withCard(ckMain(), 'inventor');
  const [a, b] = s.board.tiles.filter(t => [3, 4, 5, 9, 10, 11].includes(t.num) && t.num !== 0);
  const six = s.board.tiles.find(t => t.num === 6);
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'inventor', tiles: [a.id, six.id] }).ok, 'el 6 no se mueve');
  eq(s.players[0].progress, ['inventor'], 'un fallo no gasta la carta');
  const na = a.num, nb = b.num;
  ok(act(s, { type: 'playProgress', pid: 0, card: 'inventor', tiles: [a.id, b.id] }).ok);
  eq([a.num, b.num], [nb, na]);
});

t('Ciencia: grúa abarata en 1 mercancía la siguiente mejora de este turno', () => {
  const s = withCard(ckMain(), 'crane');
  const v = cornerOf(s, 'wheat');
  s.buildings[v] = { owner: 0, type: 'city' };
  s.players[0].improve.science = 1;
  eq(Improve.improveCost(s, 0, 'science'), { paper: 2 });
  ok(act(s, { type: 'playProgress', pid: 0, card: 'crane' }).ok);
  eq(Improve.improveCost(s, 0, 'science'), { paper: 1 });
  give(s, 0, { paper: 1 });
  ok(act(s, { type: 'improve', pid: 0, track: 'science' }).ok);
  eq(s.players[0].res.paper, 0);
  eq(Improve.improveCost(s, 0, 'science'), { paper: 3 }, 'solo una vez');
});

t('Ciencia: ingeniero construye una muralla gratis', () => {
  const s = withCard(ckMain(), 'engineer');
  ok(!G.playableProgress(s, 0).includes('engineer'), 'sin ciudad no se puede');
  const v = cornerOf(s, 'wheat');
  s.buildings[v] = { owner: 0, type: 'city' };
  ok(act(s, { type: 'playProgress', pid: 0, card: 'engineer', at: v }).ok);
  eq(s.walls[v], 0);
  eq(s.players[0].wallsLeft, 2);
});

t('Ciencia: irrigación y minería dan 2 por cada casilla junto a ti', () => {
  for (const [card, res] of [['irrigation', 'wheat'], ['mining', 'ore']]) {
    const s = withCard(ckMain(), card);
    const tile = s.board.tiles.find(t => t.res === res);
    s.buildings[tile.verts[0]] = { owner: 0, type: 'settlement' };
    s.buildings[tile.verts[3]] = { owner: 0, type: 'city' }; // same tile twice still counts once
    const n = Science.tilesNextToYou(s, 0, res).length;
    ok(n >= 1);
    const before = s.players[0].res[res];
    ok(act(s, { type: 'playProgress', pid: 0, card }).ok, card);
    eq(s.players[0].res[res] - before, 2 * n, card);
  }
});

t('Ciencia: medicina mejora a ciudad por 2 minerales y 1 cereal', () => {
  const s = withCard(ckMain(), 'medicine');
  const v = cornerOf(s, 'wheat');
  s.buildings[v] = { owner: 0, type: 'settlement' };
  s.players[0].settlementsLeft--;
  give(s, 0, { ore: 2, wheat: 1 });
  ok(act(s, { type: 'playProgress', pid: 0, card: 'medicine', at: v }).ok);
  eq(s.buildings[v].type, 'city');
  eq(s.players[0].res.ore + s.players[0].res.wheat, 0);
});

t('Ciencia: construcción de caminos da 2 caminos gratis', () => {
  const s = withCard(ckMain(), 'roadBuilding');
  ckRoads(s);
  ok(act(s, { type: 'playProgress', pid: 0, card: 'roadBuilding' }).ok);
  eq(s.phase, 'roadBuilding');
  eq(s.freeRoads, 2);
});

t('Ciencia: herrero asciende gratis hasta 2 caballeros', () => {
  const s = withCard(ckMain(), 'smith');
  const { path } = ckRoads(s);
  Knights.recruit(s, 0, path[1]);
  Knights.recruit(s, 0, path[3]);
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'smith', knights: [path[1], path[1]] }).ok, 'distintos');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'smith', knights: [path[1], path[3]] }).ok);
  eq([s.knights[path[1]].level, s.knights[path[3]].level], [2, 2]);
  eq(handSizeOf(s, 0), 0, 'gratis');
});

t('Progreso: no se juega fuera de tu turno ni antes de tirar (salvo el alquimista)', () => {
  const s = withCard(ckMain(), 'crane');
  s.phase = 'roll';
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'crane' }).ok, 'antes de tirar no');
  s.phase = 'main';
  s.players[1].progress.push('crane');
  ok(!act(s, { type: 'playProgress', pid: 1, card: 'crane' }).ok, 'fuera de turno no');
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'bishop' }).ok, 'solo cartas de tu mano');
});

// ---- Cities & Knights trade progress cards ----
t('Comercio: mercader da 2:1 en su recurso y 1 punto; el último que lo juega se lo lleva', () => {
  const s = withCard(ckMain(), 'merchant');
  const tile = s.board.tiles.find(t => t.res === 'sheep');
  s.buildings[tile.verts[0]] = { owner: 0, type: 'settlement' };
  const vp = G.victoryPoints(s, 0);
  const far = s.board.tiles.find(t => t.res && t.res !== 'desert' && !t.verts.includes(tile.verts[0]) && t.res !== 'sea');
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'merchant', tile: far.id }).ok, 'solo junto a tus edificios');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'merchant', tile: tile.id }).ok);
  eq(G.tradeRatio(s, 0, 'sheep'), 2);
  eq(G.victoryPoints(s, 0), vp + 1);
  // player 1 takes it
  s.current = 1;
  const t1 = s.board.tiles.find(t => t.res === 'ore');
  s.buildings[t1.verts[0]] = { owner: 1, type: 'settlement' };
  s.players[1].progress.push('merchant');
  ok(act(s, { type: 'playProgress', pid: 1, card: 'merchant', tile: t1.id }).ok);
  eq(G.victoryPoints(s, 0), vp, 'pierde el punto');
  eq(s.merchant.owner, 1);
  ok(G.tradeRatio(s, 0, 'sheep') > 2);
});

t('Comercio: flota mercante da 2:1 en lo elegido solo este turno', () => {
  const s = withCard(ckMain(), 'merchantFleet');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'merchantFleet', res: 'coin' }).ok);
  eq(G.tradeRatio(s, 0, 'coin'), 2);
  s.turn++;
  ok(G.tradeRatio(s, 0, 'coin') > 2, 'se acaba con el turno');
});

t('Comercio: monopolio de recursos (hasta 2 de cada rival) y comercial (1 mercancía)', () => {
  const s = withCard(withCard(ckMain(), 'resourceMonopoly'), 'tradeMonopoly');
  give(s, 1, { wheat: 5, cloth: 2 });
  give(s, 2, { wheat: 1 });
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'resourceMonopoly', res: 'cloth' }).ok, 'solo recursos');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'resourceMonopoly', res: 'wheat' }).ok);
  eq(s.players[0].res.wheat, 3);
  eq(s.players[1].res.wheat, 3);
  ok(act(s, { type: 'playProgress', pid: 0, card: 'tradeMonopoly', res: 'cloth' }).ok);
  eq(s.players[0].res.cloth, 1);
});

t('Comercio: maestro mercader toma 2 cartas a un rival con más puntos', () => {
  const s = withCard(ckMain(), 'masterMerchant');
  give(s, 1, { ore: 2, paper: 1 });
  give(s, 2, { wood: 3 });
  ok(!G.playableProgress(s, 0).includes('masterMerchant'), 'nadie tiene más puntos');
  s.buildings[s.board.tiles[3].verts[0]] = { owner: 1, type: 'city' };
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'masterMerchant', target: 2, cards: ['wood', 'wood'] }).ok, 'el rival 2 no tiene más puntos');
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'masterMerchant', target: 1, cards: ['ore', 'wood'] }).ok, 'solo cartas de su mano');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'masterMerchant', target: 1, cards: ['ore', 'paper'] }).ok);
  eq([s.players[0].res.ore, s.players[0].res.paper, s.players[1].res.ore], [1, 1, 1]);
});

t('Comercio: puerto comercial: cada rival elige qué mercancía devuelve', () => {
  const s = withCard(ckMain(), 'commercialHarbor');
  give(s, 0, { brick: 2 });
  give(s, 1, { coin: 1, cloth: 1 });
  give(s, 2, { paper: 2 });
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'commercialHarbor', offers: { 1: 'brick', 2: 'brick', 3: 'brick' } }).ok, 'el rival 3 no tiene mercancías');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'commercialHarbor', offers: { 1: 'brick', 2: 'brick' } }).ok);
  eq(s.phase, 'harbor');
  eq(G.pendingActors(s).sort(), [1, 2]);
  eq(s.players[1].res.brick, 1);
  ok(!act(s, { type: 'harborReturn', pid: 1, card: 'paper' }).ok, 'una mercancía que tenga');
  ok(act(s, { type: 'harborReturn', pid: 1, card: 'cloth' }).ok);
  eq(s.phase, 'harbor');
  ok(act(s, { type: 'harborReturn', pid: 2, card: 'paper' }).ok);
  eq(s.phase, 'main');
  eq([s.players[0].res.brick, s.players[0].res.cloth, s.players[0].res.paper], [0, 1, 1]);
});

// ---- Cities & Knights politics progress cards ----
const twoPlayersWithKnights = () => {
  const s = ckMain();
  const { path } = ckRoads(s);
  return { s, path };
};

t('Política: obispo mueve el ladrón y roba 1 carta a cada vecino (no antes del primer ataque)', () => {
  const s = withCard(ckMain(), 'bishop');
  ok(!G.playableProgress(s, 0).includes('bishop'), 'el ladrón duerme');
  s.barbarians.attacks = 1;
  const tile = s.board.tiles.find(t => t.num && t.id !== s.board.robber);
  s.buildings[tile.verts[0]] = { owner: 1, type: 'settlement' };
  s.buildings[tile.verts[3]] = { owner: 2, type: 'settlement' };
  give(s, 1, { wood: 2 });
  give(s, 2, { ore: 1 });
  ok(act(s, { type: 'playProgress', pid: 0, card: 'bishop' }).ok);
  eq(s.phase, 'robber');
  ok(act(s, { type: 'moveRobber', pid: 0, tile: tile.id }).ok);
  eq(s.board.robber, tile.id);
  eq([s.players[0].res.wood, s.players[0].res.ore], [1, 1], 'una de cada vecino');
  eq(s.phase, 'main');
});

t('Política: señor de la guerra activa gratis todos tus caballeros', () => {
  const { s, path } = twoPlayersWithKnights();
  withCard(s, 'warlord');
  Knights.recruit(s, 0, path[1]);
  Knights.recruit(s, 0, path[3]);
  ok(act(s, { type: 'playProgress', pid: 0, card: 'warlord' }).ok);
  ok(s.knights[path[1]].active && s.knights[path[3]].active);
});

t('Política: intriga expulsa a un caballero rival que toca tus caminos', () => {
  const { s, path } = twoPlayersWithKnights();
  withCard(s, 'intrigue');
  Knights.recruit(s, 1, path[2]);
  ok(act(s, { type: 'playProgress', pid: 0, card: 'intrigue', at: path[2] }).ok);
  eq(s.knights[path[2]], undefined);
  eq(s.players[1].knightsLeft[1], 2, 'sin caminos propios vuelve a la reserva');
});

t('Política: espía se queda con una carta de progreso de un rival', () => {
  const s = withCard(ckMain(), 'spy');
  s.players[1].progress = ['smith', 'wedding'];
  ok(!act(s, { type: 'playProgress', pid: 0, card: 'spy', target: 1, take: 'bishop' }).ok, 'una carta que tenga');
  ok(act(s, { type: 'playProgress', pid: 0, card: 'spy', target: 1, take: 'wedding' }).ok);
  eq(s.players[0].progress, ['wedding']);
  eq(s.players[1].progress, ['smith']);
});

t('Política: diplomático quita un camino suelto (el propio se puede recolocar)', () => {
  const { s, path } = twoPlayersWithKnights();
  withCard(withCard(s, 'diplomat'), 'diplomat');
  const open = Politics.openRoads(s);
  ok(open.length >= 1, 'el extremo del camino está suelto');
  const e = open.find(x => s.roads[x] === 0);
  const left = s.players[0].roadsLeft;
  const bd = s.board;
  // a new legal spot once e is gone
  delete s.roads[e];
  const to = G.legalRoads(s, 0).find(x => x !== e);
  s.roads[e] = 0;
  ok(act(s, { type: 'playProgress', pid: 0, card: 'diplomat', edge: e, to }).ok);
  eq(s.roads[e], undefined);
  eq(s.roads[to], 0);
  eq(s.players[0].roadsLeft, left);
});

t('Política: desertor: el rival elige qué caballero se va y tú pones uno igual', () => {
  const { s, path } = twoPlayersWithKnights();
  withCard(s, 'deserter');
  // a strong knight of player 1 far from our roads
  const far = s.board.vertices.find(V => V.hexes.length && !path.includes(V.id) && !s.buildings[V.id] && !V.adj.some(u => path.includes(u))).id;
  s.knights[far] = { owner: 1, level: 2, active: true, activatedTurn: -1, promotedTurn: -1, usedTurn: -1 };
  s.players[1].knightsLeft[2]--;
  const p1 = { 2: far };
  ok(act(s, { type: 'playProgress', pid: 0, card: 'deserter', target: 1 }).ok);
  eq(s.phase, 'deserter');
  eq(G.pendingActors(s), [1]);
  ok(act(s, { type: 'desertKnight', pid: 1, at: p1[2] }).ok);
  eq(s.phase, 'deserterPlace');
  eq(s.deserter.level, 2);
  ok(act(s, { type: 'placeDeserter', pid: 0, at: path[2] }).ok);
  eq(s.knights[path[2]].owner, 0);
  eq(s.knights[path[2]].level, 2);
  eq(s.phase, 'main');
});

t('Política: saboteador: los rivales con tus puntos o más descartan la mitad (sin ladrón)', () => {
  const s = withCard(ckMain(), 'saboteur');
  s.barbarians.attacks = 1;
  give(s, 1, { wood: 5 });
  give(s, 2, { ore: 1 });
  ok(act(s, { type: 'playProgress', pid: 0, card: 'saboteur' }).ok);
  eq(s.phase, 'discard');
  eq(s.pendingDiscards, { 1: 2 }, 'con 1 carta no pierde nada');
  ok(act(s, { type: 'discard', pid: 1, res: { wood: 2 } }).ok);
  eq(s.phase, 'main', 'no despierta al ladrón');
});

t('Política: boda: cada rival con más puntos te regala 2 cartas a su elección', () => {
  const s = withCard(ckMain(), 'wedding');
  s.buildings[s.board.tiles[4].verts[0]] = { owner: 1, type: 'city' };
  give(s, 1, { wood: 1, coin: 3 });
  ok(act(s, { type: 'playProgress', pid: 0, card: 'wedding' }).ok);
  eq(s.phase, 'wedding');
  eq(G.pendingActors(s), [1]);
  ok(!act(s, { type: 'weddingGive', pid: 1, cards: ['wood', 'wood'] }).ok, 'solo cartas que tiene');
  ok(act(s, { type: 'weddingGive', pid: 1, cards: ['coin', 'wood'] }).ok);
  eq([s.players[0].res.coin, s.players[0].res.wood], [1, 1]);
  eq(s.phase, 'main');
});






console.log(`\n${pass} ok, ${failN} fallos`);
process.exit(failN ? 1 : 0);
