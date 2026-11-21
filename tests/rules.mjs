// Targeted rule tests. Usage: node tests/rules.mjs
import * as G from '../js/engine/game.js';
import { defaultConfig } from '../js/engine/config.js';
import { botAct } from '../js/engine/bot.js';
import { seafarersOn, citiesKnightsOn, EXPANSIONS } from '../js/engine/expansions.js';
import { SCENARIOS } from '../js/engine/seafarers/scenarios.js';
import * as Ships from '../js/engine/seafarers/ships.js';
import * as Islands from '../js/engine/seafarers/islands.js';
import * as Improve from '../js/engine/citiesKnights/improvements.js';
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
  eq(defaultConfig().expansions, { seafarers: false, citiesKnights: false, scenario: 'newShores' });
  ok(!seafarersOn(G.createGame(defaultConfig())), 'Navegantes apagado');
});

t('expansiones: config antigua (sin bloque) = expansiones apagadas, partida idéntica', () => {
  const legacy = botGame(c => delete c.expansions);
  const off = botGame(c => (c.expansions = { seafarers: false }));
  eq(off, legacy, 'misma partida');
  const s = G.createGame((() => { const c = defaultConfig(); delete c.expansions; return c; })());
  eq(s.config.expansions, { seafarers: false, citiesKnights: false, scenario: 'newShores' }, 'se rellena el bloque');
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
    act(s, { type: 'roll', pid: 0 });
  } while (s.dice[0] + s.dice[1] !== 7 && ++tries < 300);
  ok(!s.pendingDiscards[0], 'con 9 cartas y muralla no descarta');
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

console.log(`\n${pass} ok, ${failN} fallos`);
process.exit(failN ? 1 : 0);
