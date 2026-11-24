// Headless self-play: runs many bot-only games over every map/mode combination and
// checks rule invariants after every single action.  Usage: node tests/sim.mjs [games]
import { createGame, applyAction, pendingActors, victoryPoints, handSize, canBuildRoad } from '../js/engine/game.js';
import { botAct } from '../js/engine/bot.js';
import { defaultConfig, MODES, PLAYER_COLORS } from '../js/engine/config.js';
import { SHAPES } from '../js/engine/board.js';
import { RES } from '../js/engine/constants.js';
import { SCENARIOS } from '../js/engine/seafarers/scenarios.js';
import { MAX_SHIPS } from '../js/engine/seafarers/ships.js';
import { COMMODITIES, COMMODITY_BANK } from '../js/engine/citiesKnights/commodities.js';

const GAMES = +process.argv[2] || 200;
const shapes = Object.keys(SHAPES).filter(k => k !== 'custom');
// after the base games, one extra Seafarers game per 5 base games (scenarios are for 2-4 players)
const SF_GAMES = Math.ceil(GAMES / 5);
const scenarios = Object.keys(SCENARIOS);
// and one Cities & Knights game per 5 base games, on the normal maps
const CK_GAMES = Math.ceil(GAMES / 5);
// and one Traders & Barbarians (Fishermen) game per 5 base games, on the normal maps
const TB_GAMES = Math.ceil(GAMES / 5);
function makeFishermenConfig(i) {
  const c = makeConfig(i);
  c.players = c.players.slice(0, 3 + (i % 2));
  if (!['classic', 'big', 'extended', 'pangea', 'ring'].includes(c.map.shape)) c.map.shape = 'classic';
  c.expansions = { tradersBarbarians: true, tbScenario: i % 2 ? 'rivers' : 'fishermen' };
  c.rules.vpTarget = 10;
  c.map.shape = 'tb:' + c.map.shape; // a label for the summary; stripped below
  return c;
}
function makeCitiesKnightsConfig(i) {
  const c = makeConfig(i);
  c.expansions = { seafarers: false, citiesKnights: true, scenario: 'newShores' };
  c.rules.vpTarget = 13;
  c.map.shape = 'ck:' + c.map.shape; // a label for the summary; stripped below
  return c;
}
function makeSeafarersConfig(i) {
  const c = makeConfig(i);
  c.players = c.players.slice(0, 2 + (i % 3));
  c.expansions = { seafarers: true, scenario: scenarios[i % scenarios.length] };
  c.map.shape = 'sf:' + c.expansions.scenario; // only a label for the summary: the scenario draws the map
  c.rules.vpTarget = SCENARIOS[c.expansions.scenario].vp;
  return c;
}

function makeConfig(i) {
  const c = defaultConfig();
  c.seed = 1000 + i * 7919;
  const np = 2 + (i % 7);
  c.players = Array.from({ length: np }, (_, k) => ({ name: 'B' + k, kind: 'bot', level: ['easy', 'normal', 'hard'][(i + k) % 3], color: PLAYER_COLORS[k] }));
  c.map.shape = shapes[i % shapes.length];
  if (np > 4 && ['classic', 'mini'].includes(c.map.shape)) c.map.shape = 'extended';
  if (np > 6) {
    c.map.shape = ['big', 'huge', 'kingdoms', 'pangea'][i % 4];
    c.map.size = 40;
  }
  c.map.size = 18 + (i % 20);
  c.map.gold = i % 4 === 0 ? 2 : 0;
  c.map.resources = i % 3 === 0 ? 'chaos' : 'balanced';
  c.map.numbers = i % 5 === 0 ? 'random' : 'balanced';
  c.map.ports = ['normal', 'many', 'few', 'none'][i % 4];
  // toggle modes pseudo-randomly
  MODES.forEach((m, k) => m.set(c, ((i * 2654435761) >>> (k + 3)) % 3 === 0));
  if (i % 7 === 0) c.rules.vpTarget = 6 + (i % 9);
  if (i % 6 === 0) c.rules.startBonus = 1;
  if (i % 8 === 0) c.rules.setupRounds = 3;
  if (i % 9 === 0) c.rules.devDeck = ['war', 'progress', 'none'][i % 3];
  c.rules.robberGrace = i % 10 === 0 ? 2 : 0;
  return c;
}

function check(s, where) {
  const errs = [];
  const bankEach = s.bankTotal;
  for (const r of RES) {
    const tot = s.bank[r] + s.players.reduce((a, p) => a + p.res[r], 0);
    if (tot !== bankEach * RES.length / RES.length && tot !== bankEach) errs.push(`conservación ${r}: ${tot} != ${bankEach}`);
    if (s.bank[r] < 0) errs.push(`banco negativo ${r}`);
    for (const p of s.players) if (p.res[r] < 0) errs.push(`mano negativa ${p.id} ${r}`);
  }
  const R = s.config.rules;
  for (const p of s.players) {
    const setts = Object.values(s.buildings).filter(b => b.owner === p.id && b.type === 'settlement').length;
    const cities = Object.values(s.buildings).filter(b => b.owner === p.id && b.type === 'city').length;
    const roads = Object.values(s.roads).filter(o => o === p.id).length;
    const blindS = s.blind.filter(b => b.pid === p.id && b.type === 'settlement').length;
    const blindC = s.blind.filter(b => b.pid === p.id && b.type === 'city').length;
    const blindR = s.blind.filter(b => b.pid === p.id && b.eid != null).length;
    if (setts + blindS + p.settlementsLeft !== R.maxSettlements) errs.push(`poblados ${p.id}: ${setts}+${blindS}+${p.settlementsLeft}`);
    if (cities + blindC + p.citiesLeft !== R.maxCities) errs.push(`ciudades ${p.id}`);
    if (roads + blindR + p.roadsLeft !== R.maxRoads) errs.push(`caminos ${p.id}: ${roads}+${blindR}+${p.roadsLeft}`);
  }
  // buildings and roads only on land (Seafarers boards also have open-sea vertices and edges)
  for (const k in s.buildings) if (!s.board.vertices[k].hexes.length) errs.push(`edificio en el mar ${k}`);
  for (const k in s.roads) if (!s.board.edges[k].hexes.length) errs.push(`camino en el mar ${k}`);
  // distance rule
  for (const k in s.buildings) for (const u of s.board.vertices[k].adj) if (s.buildings[u]) errs.push(`distancia violada ${k}-${u}`);
  // road connectivity: every road must touch own building or own road
  if (s.phase !== 'setup' || !s.setup.blindActive)
    for (const k in s.roads) {
      const pid = s.roads[k];
      const E = s.board.edges[k];
      const ok = [E.a, E.b].some(v => (s.buildings[v] && s.buildings[v].owner === pid) || s.board.vertices[v].edges.some(e => e != k && s.roads[e] === pid));
      if (!ok) errs.push(`camino suelto ${k}`);
    }
  // Cities & Knights commodities: never created or lost
  if (s.config.expansions && s.config.expansions.citiesKnights)
    for (const c of COMMODITIES) {
      const tot = s.bank[c] + s.players.reduce((a, p) => a + p.res[c], 0);
      if (tot !== COMMODITY_BANK) errs.push(`conservación ${c}: ${tot}`);
      if (s.bank[c] < 0 || s.players.some(p => p.res[c] < 0)) errs.push(`${c} negativo`);
    }
  // Fishermen: the 30 tokens (29 fish + the boot) are never created or lost
  if (s.fishermen) {
    const F = s.fishermen;
    const toks = F.bag.length + F.spent.length + s.players.reduce((a, p) => a + p.fish.length, 0) + (F.boot >= 0 ? 1 : 0);
    if (toks !== 30) errs.push(`fichas de pescado: ${toks} != 30`);
    if (F.bag.includes(0) === (F.boot >= 0)) errs.push('la bota vieja está a la vez en la bolsa y en una mano (o en ninguna)');
    if (s.players.some(p => p.fish.some(v => v < 1 || v > 3))) errs.push('ficha de pescado inválida en una mano');
  }
  // Cities & Knights improvements: levels 0-5, metropolises and walls on their owners' cities
  if (s.metropolis) {
    for (const p of s.players) for (const tr in p.improve) if (p.improve[tr] < 0 || p.improve[tr] > 5) errs.push(`nivel ${tr} ${p.id}`);
    for (const tr in s.metropolis) {
      const m = s.metropolis[tr];
      if (!m) continue;
      const b = s.buildings[m.at];
      if (!b || b.owner !== m.owner || b.type !== 'city') errs.push(`metrópolis ${tr} fuera de una ciudad suya`);
      if (s.players[m.owner].improve[tr] < 4) errs.push(`metrópolis ${tr} sin nivel 4`);
    }
    for (const k in s.walls) {
      const b = s.buildings[k];
      if (!b || b.owner !== s.walls[k] || b.type !== 'city') errs.push(`muralla ${k} fuera de una ciudad suya`);
    }
    for (const p of s.players) if (Object.values(s.walls).filter(o => o === p.id).length + p.wallsLeft !== 3) errs.push(`murallas ${p.id}`);
    // knights: 2 pieces per level (on the board, in the box or waiting to be put back), never on a building
    for (const p of s.players)
      for (const lvl of [1, 2, 3]) {
        const onBoard = Object.values(s.knights).filter(k => k.owner === p.id && k.level === lvl).length;
        const waiting = s.displaced && s.displaced.pid === p.id && s.displaced.level === lvl ? 1 : 0;
        if (onBoard + waiting + p.knightsLeft[lvl] !== 2) errs.push(`caballeros ${p.id} nivel ${lvl}`);
      }
    for (const k in s.knights) if (s.buildings[k]) errs.push(`caballero bajo un edificio ${k}`);
    // barbarians: the ship stays on its track; pieces add up after cities fall; robber asleep until the first attack
    const b = s.barbarians;
    if (b.pos < 0 || b.pos >= b.track) errs.push(`bárbaros fuera del recorrido ${b.pos}`);
    if (s.phase === 'pillage' && !s.pillage) errs.push('fase de saqueo sin saqueo');
    // progress cards: all 54 are in a deck, in a hand or revealed (VP); at most 4 in hand outside the discard step
    const inDecks = Object.values(s.progress).reduce((n, d) => n + d.length, 0);
    const inHands = s.players.reduce((n, p) => n + p.progress.length + p.progressVP, 0);
    if (inDecks + inHands !== 54) errs.push(`cartas de progreso ${inDecks}+${inHands}`);
    for (const p of s.players) if (!p.retired && p.progress.length > 4 && !(s.progressDiscard && s.progressDiscard[p.id])) errs.push(`mano de progreso ${p.id}: ${p.progress.length}`);
    if (s.devDeck.length) errs.push('cartas de desarrollo en Ciudades y Caballeros');
    if (!b.attacks && s.phase === 'robber' && !s.robberReturn) errs.push('ladrón despierto antes del primer ataque');
    if (s.phase !== 'setup') for (const p of s.players) { // (blind setup hides pieces until it ends)
      const cities = Object.values(s.buildings).filter(x => x.owner === p.id && x.type === 'city').length;
      if (cities + p.citiesLeft !== s.config.rules.maxCities) errs.push(`ciudades ${p.id}: ${cities}+${p.citiesLeft}`);
    }
  }
  // Seafarers ships: counted, on water, never sharing an edge with a road, linked to the network
  if (s.ships)
    for (const p of s.players) {
      const mine = Object.keys(s.ships).filter(k => s.ships[k] === p.id);
      if (mine.length + p.shipsLeft !== MAX_SHIPS) errs.push(`barcos ${p.id}: ${mine.length}+${p.shipsLeft}`);
      for (const k of mine) {
        const E = s.board.edges[k];
        if (E.kind !== 'coast' && E.kind !== 'sea') errs.push(`barco fuera del agua ${k}`);
        if (s.roads[k] !== undefined) errs.push(`barco y camino en ${k}`);
        const linked = [E.a, E.b].some(v => (s.buildings[v] && s.buildings[v].owner === p.id) || s.board.vertices[v].edges.some(e => e != k && s.ships[e] === p.id));
        if (!linked) errs.push(`barco suelto ${k}`);
      }
    }
  // dev cards conservation
  const devHeld = s.players.reduce((a, p) => a + p.dev.length, 0);
  if (devHeld + s.devDeck.length > s.devTotal) errs.push('cartas de desarrollo duplicadas');
  if (s.phase !== 'gameOver' && s.phase !== 'setup' && victoryPoints(s, s.current) >= R.vpTarget + (s.fishermen && s.fishermen.boot === s.current ? 1 : 0)) errs.push('ganador no detectado');
  if (s.phase === 'discard' && !Object.keys(s.pendingDiscards).length) errs.push('fase descarte vacía');
  if (errs.length) throw new Error(`[${where}] ` + errs.join('; '));
}

const summary = { games: 0, finished: 0, turns: 0, byShape: {}, winnerVP: [], errors: 0 };
for (let i = 0; i < GAMES + SF_GAMES + CK_GAMES + TB_GAMES; i++) {
  const cfg = i < GAMES ? makeConfig(i) : i < GAMES + SF_GAMES ? makeSeafarersConfig(i) : i < GAMES + SF_GAMES + CK_GAMES ? makeCitiesKnightsConfig(i) : makeFishermenConfig(i);
  const label = cfg.map.shape;
  if (label.startsWith('ck:') || label.startsWith('tb:')) cfg.map.shape = label.slice(3);
  let s;
  try {
    s = createGame(cfg);
    let guard = 0;
    while (s.phase !== 'gameOver' && s.turn < 1500) {
      if (++guard > 200000) throw new Error('bucle infinito');
      const actors = pendingActors(s);
      let acted = false;
      // simulate disconnections: occasionally retire a player or hand a seat to a bot
      if (i % 3 === 0 && s.actions > 0 && s.actions % 97 === 0 && !s.__admin?.[s.actions]) {
        (s.__admin ||= {})[s.actions] = 1;
        const alive = s.players.filter(p => !p.retired);
        const target = alive[(s.actions / 97) % alive.length | 0];
        const act = alive.length > 2 && (s.actions / 97) % 2 < 1 ? { type: 'retirePlayer', pid: target.id } : { type: 'setController', pid: target.id, kind: target.kind === 'bot' ? 'human' : 'bot' };
        if (act.type === 'setController' && act.kind === 'human') act.kind = 'bot';
        const r = applyAction(s, act);
        if (!r.ok) throw new Error(`admin ${JSON.stringify(act)}: ${r.error}`);
        check(s, act.type);
        continue;
      }
      for (const pid of actors) {
        const a = botAct(s, pid);
        if (!a) continue;
        const robberBefore = s.board.robber, roadsBefore = { ...s.roads }, setupBefore = s.phase === 'setup';
        const pirateBefore = s.board.pirate;
        const r = applyAction(s, a);
        if (a.type === 'movePirate') {
          summary.pirate = (summary.pirate || 0) + 1;
          if (s.board.pirate === pirateBefore || !s.board.sea[s.board.pirate]) throw new Error(`[movePirate] el pirata no se movió al mar`);
        }
        if (!r.ok) throw new Error(`acción ilegal del bot ${JSON.stringify(a)} en fase ${s.phase}: ${r.error}`);
        check(s, a.type);
        if (a.type === 'moveRobber' && s.board.robber === robberBefore) throw new Error(`[moveRobber] el ladrón se quedó en la casilla ${robberBefore}`);
        // a new road must connect at an end that isn't a rival's building (checked when it's built:
        // a rival may legally cut it later by settling in between)
        if (!setupBefore)
          for (const k in s.roads) if (roadsBefore[k] === undefined && !canBuildRoad({ ...s, roads: roadsBefore }, s.roads[k], +k))
            throw new Error(`[${a.type}] camino ${k} no conecta (o pasa por un edificio rival)`);
        acted = true;
        break;
      }
      if (!acted) throw new Error(`bloqueo: fase=${s.phase} actores=${actors} trade=${JSON.stringify(s.trade)}`);
    }
    summary.games++;
    if (s.ships) summary.ships = (summary.ships || 0) + Object.keys(s.ships).length;
    if (s.board.islands) {
      summary.islandVP = (summary.islandVP || 0) + s.players.reduce((t, p) => t + p.islandVP, 0);
      summary.fogSeen = (summary.fogSeen || 0) + s.board.tiles.filter(t => t.fog && t.revealed).length + s.board.sea.filter(t => t.fog && t.revealed).length;
      summary.fogAll = (summary.fogAll || 0) + s.board.tiles.filter(t => t.fog).length + s.board.sea.filter(t => t.fog).length;
    }
    summary.turns += s.turn;
    if (s.knights) summary.knights = (summary.knights || 0) + Object.keys(s.knights).length;
    if (s.barbarians) {
      summary.attacks = (summary.attacks || 0) + s.barbarians.attacks;
      summary.defenders = (summary.defenders || 0) + s.players.reduce((t, p) => t + p.defenderVP, 0);
      summary.played = (summary.played || 0) + (s.progressPlayed || 0);
      summary.progress = (summary.progress || 0) + 54 - Object.values(s.progress).reduce((n, d) => n + d.length, 0);
    }
    if (s.config.expansions.citiesKnights) summary.commodities = (summary.commodities || 0) + s.players.reduce((a, p) => a + COMMODITIES.reduce((b, c) => b + p.res[c], 0), 0) + (s.ckProduced || 0);
    if (s.fishermen) {
      summary.fishSpent = (summary.fishSpent || 0) + s.log.filter(l => JSON.stringify(l).includes('paga')).length;
      summary.boots = (summary.boots || 0) + (s.fishermen.boot >= 0 ? 1 : 0);
      summary.bootWins = (summary.bootWins || 0) + (s.winner >= 0 && s.fishermen.boot === s.winner ? 1 : 0);
    }
    const sh = (summary.byShape[label.startsWith('ck:') ? 'ck' : label.startsWith('tb:') ? 'tb' : cfg.map.shape] ||= { n: 0, done: 0, turns: 0 });
    sh.n++;
    sh.turns += s.turn;
    if (s.phase === 'gameOver') {
      summary.finished++;
      sh.done++;
      summary.winnerVP.push(victoryPoints(s, s.winner));
    } else {
      console.log(`⚠️  partida ${i} (${cfg.map.shape}, ${cfg.players.length}p) no terminó en 1500 turnos. VP: ${s.players.map(p => victoryPoints(s, p.id)).join(',')}`);
    }
  } catch (e) {
    summary.errors++;
    console.log(`❌ partida ${i} seed=${cfg.seed} shape=${cfg.map.shape} players=${cfg.players.length} modes=${JSON.stringify(cfg.modes)} rules=${JSON.stringify(cfg.rules)}`);
    console.log('   ', e.stack.split('\n').slice(0, 4).join('\n    '));
    if (summary.errors > 5) break;
  }
}
if (summary.attacks != null) console.log(`🏴‍☠️ ataques bárbaros: ${summary.attacks} · puntos de Defensor de Catan: ${summary.defenders} · cartas de progreso robadas: ${summary.progress} · jugadas: ${summary.played}`);
if (summary.knights != null) console.log(`⚔️ caballeros en el tablero al final de las partidas de Ciudades y Caballeros: ${summary.knights}`);
if (summary.fishSpent != null) console.log(`🎣 pescadores: ${summary.fishSpent} compras con pescado · bota vieja repartida en ${summary.boots} partidas · ganadas con la bota: ${summary.bootWins}`);
if (summary.ships != null) console.log(`\n⛵ barcos en el mar al final de las partidas de Navegantes: ${summary.ships} · 🏴‍☠️ movimientos del pirata: ${summary.pirate || 0} · 🏝️ puntos por islas nuevas: ${summary.islandVP || 0} · 🌫️ niebla descubierta: ${summary.fogSeen || 0}/${summary.fogAll || 0}`);
console.log(`\nPartidas: ${summary.games}, terminadas: ${summary.finished}, errores: ${summary.errors}, turnos medios: ${(summary.turns / Math.max(1, summary.games)).toFixed(1)}`);
for (const [k, v] of Object.entries(summary.byShape)) console.log(`  ${k.padEnd(9)} ${v.done}/${v.n} terminadas, ${(v.turns / v.n).toFixed(0)} turnos`);
process.exit(summary.errors ? 1 : 0);
