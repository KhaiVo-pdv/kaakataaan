// Heuristic AI. botAct(state, pid) returns the next action for that bot, or null
// when it is waiting for someone else (e.g. answers to its trade offer).
import { RES, COSTS, pips } from './constants.js';
import {
  canAfford, handSize, victoryPoints, tradeRatio, playableDev, pendingActors,
  legalSetupSettlements, legalSetupRoads, legalRoads, legalSettlements, legalCities,
  legalRobberTiles, stealTargets, zeroRes, viewFor, legalPirateTiles, pirateTargets,
} from './game.js';
import { seafarersOn } from './expansions.js';
import { SHIP_COST, legalShips, legalSetupShips } from './seafarers/ships.js';
import { seaTileEdges } from './seafarers/pirate.js';

const LEVELS = {
  easy: { noise: 1.6, trade: 0.2, dev: 0.4 },
  normal: { noise: 0.35, trade: 0.7, dev: 0.8 },
  hard: { noise: 0.05, trade: 1, dev: 1 },
};

// Deterministic per-state noise so simulations are reproducible.
function noise(s, salt) {
  let h = (s.actions + 1) * 374761393 + salt * 668265263 + (s.rng.s | 0);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 10000) / 10000;
}

const RES_W = { wood: 1, brick: 1, sheep: 0.85, wheat: 1.1, ore: 1.05, gold: 1.3, desert: 0 };

function tileValue(s, t) {
  if (!t.revealed) return 2.2;
  if (t.res === 'desert') return 0;
  const p = t.numRevealed ? pips(t.num) : 2.8;
  return p * RES_W[t.res] * (t.id === s.board.robber ? 0.5 : 1);
}

function production(s, pid) {
  const prod = zeroRes();
  for (const k in s.buildings) {
    const b = s.buildings[k];
    if (b.owner !== pid) continue;
    for (const h of s.board.vertices[k].hexes) {
      const t = s.board.tiles[h];
      if (t.revealed && RES.includes(t.res) && t.numRevealed) prod[t.res] += pips(t.num) * (b.type === 'city' ? 2 : 1);
    }
  }
  return prod;
}

function vertexScore(s, pid, v, prod) {
  const V = s.board.vertices[v];
  let score = 0;
  const kinds = new Set();
  for (const h of V.hexes) {
    const t = s.board.tiles[h];
    score += tileValue(s, t);
    if (t.revealed && RES.includes(t.res)) kinds.add(t.res);
  }
  for (const k of kinds) if (!prod[k]) score += 1.3;
  if (V.port !== null && V.port !== undefined) {
    const port = s.board.ports[V.port];
    score += port.type === 'any' ? 1 : prod[port.type] >= 4 ? 2.2 : 0.4;
  }
  return score;
}

function best(items, score) {
  let bi = null, bs = -Infinity;
  for (const it of items) {
    const sc = score(it);
    if (sc > bs) {
      bs = sc;
      bi = it;
    }
  }
  return bi;
}

function lvl(s, pid) {
  return LEVELS[s.players[pid].level] || LEVELS.normal;
}

// ---------- setup ----------
function setupSettlement(s, pid) {
  const L = lvl(s, pid);
  const prod = production(s, pid);
  const cands = legalSetupSettlements(s, pid);
  // blind: nobody sees the others, so spread out instead of all rushing the same top spot
  const spread = s.setup.blindActive ? 3.5 + L.noise * 3 : L.noise * 3;
  return best(cands, v => vertexScore(s, pid, v, prod) + noise(s, v + pid * 7919) * spread);
}

function openFor(s, v) {
  return !s.buildings[v] && !s.board.vertices[v].adj.some(u => s.buildings[u]);
}

function roadTargetScore(s, pid, e, from, prod) {
  const E = s.board.edges[e];
  const u = E.a === from ? E.b : E.a;
  let sc = 0;
  for (const w of s.board.vertices[u].adj) if (w !== from && openFor(s, w)) sc = Math.max(sc, vertexScore(s, pid, w, prod));
  if (openFor(s, u)) sc = Math.max(sc, vertexScore(s, pid, u, prod) * 0.4);
  return sc;
}

function setupRoad(s, pid) {
  const prod = production(s, pid);
  const from = s.setup.lastVid;
  return best(legalSetupRoads(s, pid), e => roadTargetScore(s, pid, e, from, prod) + noise(s, e) * 0.5);
}

// ---------- Seafarers: ships ----------
// Sail toward the nearest open land corner on an island where this bot has nothing yet,
// or toward fog that nobody has uncovered.
// Distances come from a BFS over water edges that nobody occupies.
function bestShip(s, pid) {
  const cands = legalShips(s, pid);
  if (!cands.length) return null;
  const bd = s.board;
  const mine = new Set();
  for (const k in s.buildings) if (s.buildings[k].owner === pid) for (const h of bd.vertices[k].hexes) mine.add(bd.tiles[h].island);
  const dist = new Map();
  let queue = [];
  // worth sailing to: an island this bot isn't on that isn't someone's starting island
  // (The Four Islands: every island is a starting one, and settling any new one pays)
  const homeAny = bd.islands.every(i => i.home);
  const newIsland = i => i >= 0 && !mine.has(i) && (homeAny || !bd.islands[i].home);
  const fogAt = V => V.hexes.some(h => bd.tiles[h].fog && !bd.tiles[h].revealed) || (V.sea || []).some(id => bd.sea[id].fog && !bd.sea[id].revealed);
  for (const V of bd.vertices)
    if ((V.hexes.length && openFor(s, V.id) && V.hexes.some(h => newIsland(bd.tiles[h].island))) || fogAt(V)) {
      dist.set(V.id, 0);
      queue.push(V.id);
    }
  const water = e => (bd.edges[e].kind === 'coast' || bd.edges[e].kind === 'sea') && s.roads[e] === undefined && s.ships[e] === undefined;
  for (let d = 1; queue.length && d < 40; d++) {
    const next = [];
    for (const v of queue)
      for (const e of bd.vertices[v].edges) {
        if (!water(e)) continue;
        const E = bd.edges[e], u = E.a === v ? E.b : E.a;
        if (dist.has(u)) continue;
        dist.set(u, d);
        next.push(u);
      }
    queue = next;
  }
  let bi = null, bd2 = Infinity;
  for (const e of cands) {
    const E = bd.edges[e];
    const d = Math.min(dist.get(E.a) ?? Infinity, dist.get(E.b) ?? Infinity) + noise(s, e) * 0.5;
    if (d < bd2) {
      bd2 = d;
      bi = e;
    }
  }
  return bd2 < Infinity ? bi : null;
}

// ---------- main helpers ----------
function missing(res, cost) {
  const m = {};
  let n = 0;
  for (const [r, k] of Object.entries(cost)) {
    const d = k - (res[r] || 0);
    if (d > 0) {
      m[r] = d;
      n += d;
    }
  }
  return { m, n };
}

function bestRoad(s, pid) {
  const prod = production(s, pid);
  const roads = legalRoads(s, pid);
  if (!roads.length) return null;
  let bi = null, bs = 0;
  const rival = v => s.buildings[v] && s.buildings[v].owner !== pid;
  for (const e of roads) {
    const E = s.board.edges[e];
    // a road into a rival's house is a dead end that looks like it runs through it
    if (rival(E.a) || rival(E.b)) continue;
    const linked = v => (s.buildings[v] && s.buildings[v].owner === pid) || s.board.vertices[v].edges.some(x => x !== e && s.roads[x] === pid);
    // extend toward good open spots (only from the end the road grows out of)
    let sc = 0;
    for (const [from, to] of [[E.a, E.b], [E.b, E.a]]) {
      if (!linked(from)) continue;
      if (openFor(s, to)) sc = Math.max(sc, vertexScore(s, pid, to, prod));
      for (const w of s.board.vertices[to].adj) if (w !== from && openFor(s, w)) sc = Math.max(sc, vertexScore(s, pid, w, prod) * 0.55);
    }
    sc += noise(s, e) * 0.3;
    if (sc > bs) {
      bs = sc;
      bi = e;
    }
  }
  return bi;
}

function chooseTarget(s, pid) {
  const p = s.players[pid];
  const opts = [];
  const hasSett = Object.values(s.buildings).some(b => b.owner === pid && b.type === 'settlement');
  const spots = p.settlementsLeft > 0 ? legalSettlements(s, pid) : [];
  if (p.citiesLeft > 0 && hasSett) opts.push({ what: 'city', cost: COSTS.city, w: 0.1 });
  if (spots.length) opts.push({ what: 'settlement', cost: COSTS.settlement, w: 0 });
  else if (seafarersOn(s) && p.shipsLeft > 0 && p.settlementsLeft > 0 && bestShip(s, pid) !== null) opts.push({ what: 'ship', cost: SHIP_COST, w: 0.25 });
  else if (p.roadsLeft > 0 && p.settlementsLeft > 0 && bestRoad(s, pid) !== null) opts.push({ what: 'road', cost: COSTS.road, w: 0.3 });
  if (s.devDeck.length) opts.push({ what: 'dev', cost: COSTS.dev, w: 1.2 });
  if (!opts.length) return null;
  return best(opts, o => -(missing(p.res, o.cost).n + o.w));
}

function surplus(res, cost) {
  const out = {};
  for (const r of RES) out[r] = res[r] - ((cost && cost[r]) || 0);
  return out;
}

function tryDevPlay(s, pid) {
  const L = lvl(s, pid);
  const playable = playableDev(s, pid);
  if (!playable.length || noise(s, 7) > L.dev) return null;
  const p = s.players[pid];
  if (playable.includes('knight')) {
    const robberOnMe = s.board.robber >= 0 && s.board.tiles[s.board.robber].verts.some(v => s.buildings[v] && s.buildings[v].owner === pid);
    const la = s.largestArmy;
    const armyGrab = la.owner !== pid && p.knights + 1 >= 3 && p.knights + 1 > la.count;
    if (robberOnMe || armyGrab || (s.phase === 'main' && p.dev.filter(c => c.type === 'knight').length >= 2))
      return { type: 'playDev', pid, card: 'knight' };
  }
  if (s.phase !== 'main') return null;
  if (playable.includes('monopoly')) {
    const r = best(RES, r => s.players.reduce((a, o) => a + (o.id === pid ? 0 : o.res[r]), 0));
    const tot = s.players.reduce((a, o) => a + (o.id === pid ? 0 : o.res[r]), 0);
    if (tot >= 3) return { type: 'playDev', pid, card: 'monopoly', res: r };
  }
  if (playable.includes('yearOfPlenty')) {
    const t = chooseTarget(s, pid);
    const want = [];
    if (t) for (const [r, k] of Object.entries(missing(p.res, t.cost).m)) for (let i = 0; i < k; i++) want.push(r);
    while (want.length < 2) want.push(best(RES, r => s.bank[r] - p.res[r]));
    const pickTwo = want.slice(0, 2);
    const need = {};
    pickTwo.forEach(r => (need[r] = (need[r] || 0) + 1));
    if (Object.entries(need).every(([r, k]) => s.bank[r] >= k)) return { type: 'playDev', pid, card: 'yearOfPlenty', res: pickTwo };
  }
  if (playable.includes('roadBuilding') && p.roadsLeft > 0 && bestRoad(s, pid) !== null) return { type: 'playDev', pid, card: 'roadBuilding' };
  if (playable.includes('knight') && noise(s, 11) < 0.3) return { type: 'playDev', pid, card: 'knight' };
  return null;
}

function mainAction(s, pid) {
  const p = s.players[pid];
  const L = lvl(s, pid);
  const target = s.config.rules.vpTarget;

  if (s.trade && s.trade.from === pid) {
    const acc = Object.entries(s.trade.responses).filter(([, r]) => r === 'accept').map(([k]) => +k);
    if (acc.length) return { type: 'confirmTrade', pid, with: acc[0] };
    if (Object.values(s.trade.responses).every(r => r !== null)) return { type: 'cancelTrade', pid };
    return null; // waiting for answers
  }

  const dev = tryDevPlay(s, pid);
  if (dev) return dev;

  if (p.citiesLeft > 0 && canAfford(p.res, COSTS.city)) {
    const prod = production(s, pid);
    const c = best(legalCities(s, pid), v => vertexScore(s, pid, v, prod));
    if (c !== null) return { type: 'build', pid, what: 'city', at: c };
  }
  const spots = p.settlementsLeft > 0 ? legalSettlements(s, pid) : [];
  if (spots.length && canAfford(p.res, COSTS.settlement)) {
    const prod = production(s, pid);
    return { type: 'build', pid, what: 'settlement', at: best(spots, v => vertexScore(s, pid, v, prod) + noise(s, v) * L.noise) };
  }
  // Seafarers: nowhere to settle (or wood and wool to spare) -> sail to a new island / into the fog
  const spareShip = p.res.wood >= 2 && p.res.sheep >= 2;
  if (seafarersOn(s) && (!spots.length || spareShip) && p.settlementsLeft > 0 && p.shipsLeft > 0 && canAfford(p.res, SHIP_COST)) {
    const e = bestShip(s, pid);
    if (e !== null) return { type: 'build', pid, what: 'ship', at: e };
  }
  if (p.roadsLeft > 0 && canAfford(p.res, COSTS.road)) {
    const richInRoad = p.res.wood >= 3 && p.res.brick >= 3;
    const raceRoad = p.roadLen >= 4 && s.longestRoad.owner !== pid && p.roadLen + 1 > s.longestRoad.len;
    if ((!spots.length && p.settlementsLeft > 0) || richInRoad || raceRoad) {
      const e = bestRoad(s, pid);
      if (e !== null) return { type: 'build', pid, what: 'road', at: e };
    }
  }
  const tgt = chooseTarget(s, pid);
  if (s.devDeck.length && canAfford(p.res, COSTS.dev)) {
    const keep = tgt && tgt.what !== 'dev' ? surplus(p.res, tgt.cost) : null;
    const spare = !keep || (keep.sheep >= 1 && keep.wheat >= 1 && keep.ore >= 1);
    if (spare || !tgt || tgt.what === 'dev' || victoryPoints(s, pid) >= target - 2) return { type: 'buyDev', pid };
  }

  // trade toward target
  if (tgt) {
    const { m, n } = missing(p.res, tgt.cost);
    if (n > 0) {
      const sp = surplus(p.res, tgt.cost);
      for (const need of Object.keys(m)) {
        if (s.bank[need] < 1) continue;
        const give = best(RES.filter(r => r !== need && sp[r] >= tradeRatio(s, pid, r)), r => sp[r] - tradeRatio(s, pid, r));
        if (give) return { type: 'bankTrade', pid, give, get: need };
      }
      const traded = p.tradeTurn === s.turn ? p.tradeCount : 0;
      if (traded < 1 && n <= 2 && noise(s, 3) < L.trade) {
        const need = Object.keys(m)[0];
        const give = best(RES.filter(r => r !== need && sp[r] >= 1), r => sp[r]);
        if (give) return { type: 'proposeTrade', pid, give: { [give]: 1 }, get: { [need]: 1 } };
      }
    }
  }
  return { type: 'endTurn', pid };
}

function respond(s, pid) {
  const t = s.trade;
  const me = s.players[pid];
  const reject = { type: 'respondTrade', pid, accept: false, tradeId: t.id };
  if (!canAfford(me.res, t.get)) return reject;
  if (victoryPoints(s, t.from, false) >= s.config.rules.vpTarget - 2) return reject;
  const L = lvl(s, pid);
  if (me.level === 'easy') return { ...reject, accept: noise(s, pid + 50) < 0.35 };
  const tgt = chooseTarget(s, pid);
  const cost = tgt ? tgt.cost : {};
  const { m } = missing(me.res, cost);
  const sp = surplus(me.res, cost);
  let gain = 0, loss = 0;
  for (const r of RES) {
    gain += Math.min(t.give[r], m[r] || 0) * 1.5 + Math.max(0, t.give[r] - (m[r] || 0)) * 0.5;
    loss += Math.max(0, t.get[r] - Math.max(0, sp[r])) * 1.6 + Math.min(t.get[r], Math.max(0, sp[r])) * 0.6;
  }
  return { ...reject, accept: gain > loss + (L === LEVELS.hard ? 0.2 : 0) };
}

function discard(s, pid) {
  const p = s.players[pid];
  let need = s.pendingDiscards[pid];
  const tgt = chooseTarget(s, pid);
  const hand = { ...p.res };
  const out = zeroRes();
  while (need > 0) {
    const r = best(RES.filter(x => hand[x] > 0), x => hand[x] - ((tgt && tgt.cost[x]) || 0) * 1.5);
    hand[r]--;
    out[r]++;
    need--;
  }
  return { type: 'discard', pid, res: out };
}

function robber(s, pid) {
  const tiles = legalRobberTiles(s, pid);
  const scoreTile = id => {
    const t = s.board.tiles[id];
    let sc = 0;
    for (const v of t.verts) {
      const b = s.buildings[v];
      if (!b) continue;
      const w = (b.type === 'city' ? 2 : 1) * (t.numRevealed ? pips(t.num) : 2.5);
      if (b.owner === pid) sc -= w * 3;
      else sc += w * (1 + victoryPoints(s, b.owner, false) / 5) + (handSize(s.players[b.owner].res) ? 1 : 0);
    }
    return sc + noise(s, id) * 0.2;
  };
  // sending it straight back to the tile it just left looks like it never moved
  const away = tiles.filter(id => id !== s.board.robberFrom);
  const tile = best(away.length ? away : tiles, scoreTile);
  const pickVictim = vs => (vs.length ? best(vs, v => victoryPoints(s, v, false) * 2 + handSize(s.players[v].res) * 0.3) : undefined);
  // Seafarers: the pirate instead, when rival ships make a juicier target than any land tile
  if (seafarersOn(s)) {
    const scoreSea = id => {
      let sc = 0;
      for (const e of seaTileEdges(s, id)) {
        const o = s.ships[e];
        if (o === undefined) continue;
        if (o === pid) sc -= 2;
        else sc += 1 + victoryPoints(s, o, false) / 5 + (handSize(s.players[o].res) ? 1 : 0);
      }
      return sc + noise(s, id + 977) * 0.2;
    };
    const sea = best(legalPirateTiles(s), scoreSea);
    if (sea !== null && scoreSea(sea) > scoreTile(tile)) return { type: 'movePirate', pid, tile: sea, victim: pickVictim(pirateTargets(s, pid, sea)) };
  }
  return { type: 'moveRobber', pid, tile, victim: pickVictim(stealTargets(s, pid, tile)) };
}

export function botAct(real, pid) {
  if (real.phase === 'gameOver') return null;
  const s = viewFor(real, pid); // in fog mode bots only know what they can see
  if (!pendingActors(s).includes(pid)) return null;
  if (s.phase === 'discard') return s.pendingDiscards[pid] ? discard(s, pid) : null;
  if (s.trade && s.trade.from !== pid && s.trade.responses[pid] == null) return respond(s, pid);
  if (s.phase === 'setup') {
    if (s.setup.queue[s.setup.idx].pid !== pid) return null;
    if (s.setup.step === 'settlement') {
      const v = setupSettlement(s, pid);
      return v === null ? null : { type: 'placeSettlement', pid, vid: v };
    }
    const e = setupRoad(s, pid);
    if (e === null && seafarersOn(s)) {
      const sh = legalSetupShips(s, pid); // a corner with only water around: start with a ship
      return sh.length ? { type: 'placeShip', pid, eid: sh[0] } : null;
    }
    return e === null ? null : { type: 'placeRoad', pid, eid: e };
  }
  if (s.current !== pid) return null;
  switch (s.phase) {
    case 'roll': {
      const dev = tryDevPlay(s, pid);
      return dev && dev.card === 'knight' ? dev : { type: 'roll', pid };
    }
    case 'robber':
      return robber(s, pid);
    case 'roadBuilding': {
      const e = bestRoad(s, pid);
      if (e !== null) return { type: 'build', pid, what: 'road', at: e };
      const any = legalRoads(s, pid);
      if (any.length) return { type: 'build', pid, what: 'road', at: any[0] };
      if (seafarersOn(s) && s.players[pid].shipsLeft > 0) {
        const sh = bestShip(s, pid) ?? legalShips(s, pid)[0];
        if (sh != null) return { type: 'build', pid, what: 'ship', at: sh };
      }
      return { type: 'endRoadBuilding', pid };
    }
    case 'main':
      return mainAction(s, pid);
  }
  return null;
}

// Suggest a sensible move for humans (hint button) using the "hard" brain.
export function hint(s, pid) {
  const lv = s.players[pid].level;
  s.players[pid].level = 'hard';
  const a = botAct(s, pid);
  s.players[pid].level = lv;
  return a;
}
