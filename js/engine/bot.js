// Heuristic AI. botAct(state, pid) returns the next action for that bot, or null
// when it is waiting for someone else (e.g. answers to its trade offer).
import { RES, COSTS, pips } from './constants.js';
import {
  canAfford, handSize, victoryPoints, tradeRatio, playableDev, pendingActors,
  legalSetupSettlements, legalSetupRoads, legalRoads, legalSettlements, legalCities, legalHarbors,
  legalRobberTiles, stealTargets, zeroRes, viewFor, legalPirateTiles, pirateTargets, playableProgress,
  fishPerkReason, bootReceivers, legalBridges, damagedRoadsOf, REPAIR_COST, neutralSpots, tokenCost, tokenActionUsed,
} from './game.js';
import * as Rivers from './tradersBarbarians/rivers.js';
import * as Caravans from './tradersBarbarians/caravans.js';
import * as BarbAttack from './tradersBarbarians/barbarianAttack.js';
import * as Traders from './tradersBarbarians/traders.js';
import { fishCount, FISH_PERKS } from './tradersBarbarians/fishermen.js';
import { seafarersOn } from './expansions.js';
import { HARBOR_COST } from './explorersPirates/rules.js';
import { SHIP_COST, legalShips, legalSetupShips } from './seafarers/ships.js';
import { seaTileEdges } from './seafarers/pirate.js';
import { cardsOf } from './citiesKnights/commodities.js';
import * as Improve from './citiesKnights/improvements.js';
import { PROGRESS_TRACKS } from './citiesKnights/progress.js';
import * as Knights from './citiesKnights/knights.js';
import * as Science from './citiesKnights/science.js';
import * as TradeCards from './citiesKnights/tradeCards.js';
import * as Politics from './citiesKnights/politics.js';
import { COMMODITIES } from './citiesKnights/commodities.js';

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
  const coast = s.barbAttack ? (BarbAttack.isConquered(s, t.id) ? 0 : 1 - (s.barbAttack.on[t.id] || 0) * 0.2) : 1; // Barbarian Attack: threatened coast is worth less
  return p * RES_W[t.res] * (t.id === s.board.robber ? 0.5 : 1) * coast;
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
    if (s.harbormaster) score += 0.8; // Harbormaster variant: harbour points are worth chasing
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

// ---------- Cities & Knights ----------
// the improvement worth buying now: a metropolis first, then the level-3 abilities, then the cheapest
function bestImprovement(s, pid) {
  if (!s.metropolis) return null;
  const p = s.players[pid];
  const opts = Improve.TRACKS.filter(tr => !Improve.improveBlock(s, pid, tr) && canAfford(p.res, Improve.improveCost(s, pid, tr)));
  return best(opts, tr => (Improve.winsMetropolis(s, pid, tr) ? 10 : 0) + (p.improve[tr] + 1 === Improve.ABILITY_LEVEL ? 3 : 0) - p.improve[tr] + noise(s, tr.length) * 0.3);
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
  if (s.explorers && legalHarbors(s, pid).length) opts.push({ what: 'harbor', cost: HARBOR_COST, w: 0.1 }); // Explorers & Pirates
  if (spots.length) opts.push({ what: 'settlement', cost: COSTS.settlement, w: 0 });
  else if (seafarersOn(s) && p.shipsLeft > 0 && p.settlementsLeft > 0 && bestShip(s, pid) !== null) opts.push({ what: 'ship', cost: SHIP_COST, w: 0.25 });
  else if (p.roadsLeft > 0 && p.settlementsLeft > 0 && bestRoad(s, pid) !== null) opts.push({ what: 'road', cost: COSTS.road, w: 0.3 });
  if (s.traders && Traders.nextLevel(s, pid)) opts.push({ what: 'wagon', cost: Traders.nextLevel(s, pid).cost, w: 0.2 + s.traders.wagons[pid].level * 0.25 }); // Traders & Barbarians: a better wagon
  if (s.devDeck.length || s.barbAttack) opts.push({ what: 'dev', cost: COSTS.dev, w: s.barbAttack ? baCardWeight(s, pid) : 1.2 });
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
  if (s.traders) return tbDevPlay(s, pid, playable); // Traders & Barbarians: knights move barbarians, Swift Journey
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

// ---- Cities & Knights science progress cards ----
// how much a roll of `sum` gives us (cities count double)
function sumValue(s, pid, sum) {
  let v = 0;
  for (const k in s.buildings) {
    const b = s.buildings[k];
    if (b.owner !== pid) continue;
    for (const h of s.board.vertices[k].hexes) {
      const t = s.board.tiles[h];
      if (t.num === sum && t.id !== s.board.robber) v += (b.type === 'city' ? 2 : 1) * (RES_W[t.res] || 1);
    }
  }
  return v;
}

function alchemist(s, pid) {
  const p = s.players[pid];
  if (!p.progress || !p.progress.includes('alchemist')) return null;
  const sums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  const sum = best(sums, n => sumValue(s, pid, n) + noise(s, n) * 0.1);
  if (!sum || sumValue(s, pid, sum) < 2) return null;
  const red = Math.max(1, Math.min(6, sum - 1)); // a high red die gives the rivals fewer progress cards
  return { type: 'playProgress', pid, card: 'alchemist', dice: [sum - red, red] };
}

function tryProgressPlay(s, pid) {
  const p = s.players[pid];
  if (!p.progress || !p.progress.length) return null;
  const can = new Set(playableProgress(s, pid));
  const play = (card, extra = {}) => ({ type: 'playProgress', pid, card, ...extra });
  for (const card of ['irrigation', 'mining']) if (can.has(card) && Science.harvestGain(s, pid, card) >= 2) return play(card);
  if (can.has('engineer')) return play('engineer', { at: Science.engineerSpots(s, pid)[0] });
  if (can.has('medicine')) {
    const prod = production(s, pid);
    return play('medicine', { at: best(legalCities(s, pid), v => vertexScore(s, pid, v, prod)) });
  }
  if (can.has('smith')) {
    const list = Knights.legalPromotions(s, pid).slice(0, 2);
    const two = list.length === 2 && !Science.smithBlock(s, pid, list);
    return play('smith', { knights: two ? list : list.slice(0, 1) });
  }
  if (can.has('roadBuilding') && p.roadsLeft >= 2) return play('roadBuilding');
  if (can.has('crane') && !Improve.craneOn(s, pid)) {
    // only when the discount makes an improvement affordable now
    const helps = Improve.TRACKS.some(tr => !Improve.improveBlock(s, pid, tr) && !canAfford(p.res, Improve.improveCost(s, pid, tr)) && (p.res[Improve.TRACK_COMMODITY[tr]] || 0) >= p.improve[tr]);
    if (helps) return play('crane');
  }
  // trade cards
  if (can.has('merchant')) {
    const prod = production(s, pid);
    const tiles = TradeCards.merchantTiles(s, pid);
    const mine = s.merchant && s.merchant.owner === pid;
    if (!mine) return play('merchant', { tile: best(tiles, t => (prod[s.board.tiles[t].res] || 0) + p.res[s.board.tiles[t].res] + noise(s, t) * 0.1) });
  }
  const rivalsHave = r => s.players.filter(q => q.id !== pid && !q.retired).reduce((n, q) => n + Math.min(2, q.res[r] || 0), 0);
  if (can.has('resourceMonopoly')) {
    const r = best(RES, x => rivalsHave(x) * RES_W[x]);
    if (rivalsHave(r) >= 3) return play('resourceMonopoly', { res: r });
  }
  if (can.has('tradeMonopoly')) {
    const r = best(COMMODITIES, x => rivalsHave(x));
    if (rivalsHave(r) >= 2) return play('tradeMonopoly', { res: r });
  }
  if (can.has('masterMerchant')) {
    const vp = q => victoryPoints(s, q, false);
    const tg = best(TradeCards.masterTargets(s, pid, vp), q => vp(q) * 10 + handSize(s.players[q].res));
    const hand = Object.entries(s.players[tg].res).flatMap(([r, n]) => Array(n).fill(r));
    hand.sort((a, b) => (COMMODITIES.includes(b) ? 1.5 : RES_W[b] || 1) - (COMMODITIES.includes(a) ? 1.5 : RES_W[a] || 1));
    return play('masterMerchant', { target: tg, cards: hand.slice(0, TradeCards.MASTER_TAKE) });
  }
  if (can.has('commercialHarbor')) {
    const offers = {};
    const left = { ...p.res };
    for (const q of TradeCards.harborTargets(s, pid)) {
      const r = best(RES.filter(x => left[x] > 0), x => left[x]);
      if (r == null || left[r] < 2) break; // keep at least one of each thing we give
      offers[q] = r;
      left[r]--;
    }
    if (Object.keys(offers).length) return play('commercialHarbor', { offers });
  }
  // politics cards
  const vp = q => victoryPoints(s, q, false);
  if (can.has('wedding')) return play('wedding');
  if (can.has('saboteur')) return play('saboteur');
  if (can.has('warlord') && Politics.warlordKnights(s, pid).length >= 2) return play('warlord');
  if (can.has('spy')) {
    const tg = best(Politics.spyTargets(s, pid), q => s.players[q].progress.length + vp(q));
    if (p.progress.length < 4) return play('spy', { target: tg, take: s.players[tg].progress[0] });
  }
  if (can.has('deserter')) {
    const tg = best(Politics.deserterTargets(s, pid), q => vp(q));
    if (Politics.deserterSpots(s, pid).length) return play('deserter', { target: tg });
  }
  if (can.has('intrigue') && !s.config.modes.fog) return play('intrigue', { at: best(Politics.intrigueTargets(s, pid), v => s.knights[v].level) });
  if (can.has('bishop')) {
    // the tile that hurts the leaders most, with the most neighbours to rob
    const tiles = legalRobberTiles(s, pid);
    const score = t => stealTargets(s, pid, t).reduce((n, q) => n + 1 + vp(q) * 0.2, 0);
    const t = best(tiles, score);
    if (t != null && score(t) >= 2) return play('bishop');
  }
  // (in the fog our view may miss pieces that make a road not loose: we leave the Diplomat then)
  if (can.has('diplomat') && !s.config.modes.fog) {
    // pull a rival's loose road off the longest-road race
    const e = best(Politics.openRoads(s).filter(x => s.roads[x] !== pid), x => s.players[s.roads[x]].roadLen || 0);
    if (e != null) return play('diplomat', { edge: e });
  }
  if (can.has('merchantFleet')) {
    // only when we hold 4+ of something: two 2:1 trades this turn
    const r = best(cardsOf(s), x => p.res[x]);
    if (p.res[r] >= 4 && tradeRatio(s, pid, r) > 2) return play('merchantFleet', { res: r });
  }
  if (can.has('inventor')) {
    // give our best spot a better number: swap our weakest swappable token with the best one nobody of us has
    const ok = Science.inventorTiles(s);
    const ours = t => s.board.tiles[t].verts.some(v => s.buildings[v] && s.buildings[v].owner === pid);
    const mine = ok.filter(ours), other = ok.filter(t => !ours(t));
    const lo = best(mine, t => -pips(s.board.tiles[t].num)), hi = best(other, t => pips(s.board.tiles[t].num));
    if (lo != null && hi != null && pips(s.board.tiles[hi].num) > pips(s.board.tiles[lo].num)) return play('inventor', { tiles: [lo, hi] });
  }
  return null;
}

// Rivers: a bridge when the far bank has a good spot (or we are a Poor Settler: 3 gold),
// gold for the one card we miss (never dropping to the fewest gold), resources for gold when poor
function tryRivers(s, pid) {
  if (!s.rivers) return null;
  const p = s.players[pid];
  const others = s.players.filter(o => o.id !== pid && !o.retired).map(o => o.gold);
  const minOther = others.length ? Math.min(...others) : 0;
  const poor = p.gold <= minOther;
  if (p.bridgesLeft > 0 && canAfford(p.res, Rivers.BRIDGE_COST)) {
    const prod = production(s, pid);
    const linked = (e, v) => (s.buildings[v] && s.buildings[v].owner === pid) || s.board.vertices[v].edges.some(x => x !== e && s.roads[x] === pid);
    const score = e => {
      const E = s.board.edges[e];
      const from = linked(e, E.a) ? E.a : E.b;
      return roadTargetScore(s, pid, e, from, prod) + noise(s, e) * 0.2;
    };
    const spots = legalBridges(s, pid);
    const e = best(spots, score);
    if (e !== null && (score(e) > 3 || poor)) return { type: 'buildBridge', pid, at: e };
  }
  if (p.gold >= Rivers.GOLD_PER_RESOURCE && Rivers.goldBuysLeft(s) > 0 && p.gold - Rivers.GOLD_PER_RESOURCE > minOther) {
    const t = chooseTarget(s, pid);
    const need = t && missing(p.res, t.cost);
    if (need && need.n === 1) {
      const r = Object.keys(need.m)[0];
      if (s.bank[r] > 0) return { type: 'goldBuy', pid, res: r };
    }
  }
  if (poor) {
    // sell a surplus resource (one not needed for what we are saving for)
    const t = chooseTarget(s, pid);
    const spare = RES.filter(r => p.res[r] - ((t && t.cost[r]) || 0) >= tradeRatio(s, pid, r));
    if (spare.length) return { type: 'goldSell', pid, give: best(spare, r => p.res[r]) };
  }
  return null;
}

// Caravans: what a camel on edge e is worth to `me`: points for my buildings that would sit between
// two camels and my roads beside it, minus what it hands the strongest rival
function camelSpotValue(s, me, e) {
  const gain = pid => {
    const E = s.board.edges[e];
    let g = 0;
    for (const v of [E.a, E.b]) {
      const b = s.buildings[v];
      if (b && b.owner === pid && Caravans.camelsAt(s, v) === 1) g += 3; // the second camel: +1 VP
    }
    if (s.roads[e] === pid) g += 1; // the road now counts double
    return g;
  };
  const rivals = s.players.filter(o => o.id !== me && !o.retired);
  const leader = rivals.length ? best(rivals.map(o => o.id), o => victoryPoints(s, o, false)) : null;
  return gain(me) - (leader === null ? 0 : gain(leader) * 0.7) + noise(s, e) * 0.05;
}
// one vote: our favourite spot, and 0-2 wool/grain we can spare when it matters to us
function camelBid(s, pid) {
  const V = s.caravans.vote;
  const spot = best(V.options, e => camelSpotValue(s, pid, e));
  const value = camelSpotValue(s, pid, spot);
  const p = s.players[pid];
  const t = chooseTarget(s, pid);
  const spare = r => Math.max(0, p.res[r] - ((t && t.cost[r]) || 0));
  let want = value >= 3 ? 2 : value >= 1 ? 1 : 0;
  const bid = { type: 'caravanBid', pid, spot, sheep: 0, wheat: 0 };
  for (const r of Caravans.VOTE_RES) {
    const n = Math.min(want, spare(r));
    bid[r] = n;
    want -= n;
  }
  return bid;
}

// Fishermen: pass the old boot on, then spend fish on the most useful perk we can afford
function tryFish(s, pid) {
  if (!s.fishermen) return null;
  const p = s.players[pid];
  const takers = bootReceivers(s, pid);
  if (takers.length) return { type: 'giveBoot', pid, to: best(takers, o => victoryPoints(s, o, false) + noise(s, o) * 0.1) };
  const f = fishCount(p);
  const can = perk => f >= FISH_PERKS[perk] && !fishPerkReason(s, pid, perk);
  const robberOnMe = s.board.robber >= 0 && s.board.tiles[s.board.robber].verts.some(v => s.buildings[v] && s.buildings[v].owner === pid);
  if (robberOnMe && can('robber')) return { type: 'spendFish', pid, perk: 'robber' };
  if (can('dev')) return { type: 'spendFish', pid, perk: 'dev' };
  if (can('road') && p.settlementsLeft > 0 && !legalSettlements(s, pid).length && bestRoad(s, pid) !== null) return { type: 'spendFish', pid, perk: 'road' };
  if (can('resource')) {
    // only when one card completes what we are saving for
    const t = chooseTarget(s, pid);
    const need = t && missing(p.res, t.cost);
    if (need && need.n === 1) {
      const r = Object.keys(need.m)[0];
      if (s.bank[r] > 0) return { type: 'spendFish', pid, perk: 'resource', res: r };
    }
  }
  if (f === 3 && can('steal')) {
    const rivals = s.players.filter(o => o.id !== pid && !o.retired && handSize(o.res) > 0).map(o => o.id);
    return { type: 'spendFish', pid, perk: 'steal', target: best(rivals, o => handSize(s.players[o].res) + victoryPoints(s, o, false) + noise(s, o) * 0.1) };
  }
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
  const prog = tryProgressPlay(s, pid); // Cities & Knights
  if (prog) return prog;
  const fish = tryFish(s, pid); // Traders & Barbarians: Fishermen
  if (fish) return fish;
  const river = tryRivers(s, pid); // Traders & Barbarians: Rivers of Catan
  if (river) return river;
  const knight = s.barbAttack && baKnightMove(s, pid); // Barbarian Attack: knights march on the barbarians
  if (knight) return knight;
  if (s.damagedRoads && damagedRoadsOf(s, pid).length && canAfford(s.players[pid].res, REPAIR_COST)) return { type: 'evRepair', pid }; // Event Cards earthquake
  const two = s.two && twoTokenAction(REAL && REAL.two ? REAL : s, pid); // Catan for Two: trade tokens
  if (two) return two;
  const wagon = s.traders && tbWagonAction(s, pid); // Traders & Barbarians: upgrade, boost and drive the wagon
  if (wagon) return wagon;
  if ((s.barbAttack || s.traders || s.explorers) && s.players[pid].gold >= Rivers.GOLD_PER_RESOURCE && Rivers.goldBuysLeft(s) > 0) { // Barbarian Attack: gold for the missing card
    const t = chooseTarget(s, pid), need = t && missing(s.players[pid].res, t.cost);
    if (need && need.n === 1) {
      const r = Object.keys(need.m)[0];
      if (s.bank[r] > 0) return { type: 'goldBuy', pid, res: r };
    }
  }

  // Explorers & Pirates: a harbor settlement (2 VP) on the coast; cards about to be lost to a 7 become gold
  if (s.explorers && canAfford(p.res, HARBOR_COST)) {
    const prod = production(s, pid);
    const hv = best(legalHarbors(s, pid), v => vertexScore(s, pid, v, prod));
    if (hv !== null) return { type: 'build', pid, what: 'harbor', at: hv };
  }
  if (s.explorers && handSize(p.res) > s.config.rules.handLimit) {
    const t = chooseTarget(s, pid);
    const spare = RES.filter(r => p.res[r] - ((t && t.cost[r]) || 0) >= tradeRatio(s, pid, r));
    if (spare.length) return { type: 'goldSell', pid, give: best(spare, r => p.res[r]) };
  }
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
  // Cities & Knights: spend commodities on improvements; a wall when the hand gets big
  if (s.metropolis) {
    const tr = bestImprovement(s, pid);
    if (tr) return { type: 'improve', pid, track: tr };
    // knights: chase the robber off our tiles, recruit near our buildings, activate, promote
    const robberHurtsUs = s.board.robber >= 0 && s.board.tiles[s.board.robber].verts.some(v => s.buildings[v] && s.buildings[v].owner === pid);
    if (robberHurtsUs) {
      const k = Knights.actors(s, pid).find(v => Knights.canChase(s, pid, v));
      if (k !== undefined) return { type: 'knightChase', pid, from: k };
    }
    const mine = Knights.knightsOf(s, pid);
    const cities = Object.values(s.buildings).filter(b => b.owner === pid && b.type === 'city').length;
    if (mine.length < cities + 1 && canAfford(p.res, Knights.KNIGHT_COST)) {
      const spotsK = Knights.legalRecruits(s, pid);
      if (spotsK.length) {
        const near = v => s.board.vertices[v].adj.filter(u => s.buildings[u] && s.buildings[u].owner === pid).length;
        return { type: 'recruitKnight', pid, at: best(spotsK, v => near(v) + noise(s, v) * 0.5) };
      }
    }
    const idle = Knights.legalActivations(s, pid);
    // with the barbarians close, any wheat goes into waking knights up
    const close = s.barbarians && s.barbarians.track - s.barbarians.pos <= 2;
    if (idle.length && p.res.wheat >= (close ? 1 : 2)) return { type: 'activateKnight', pid, at: idle[0] };
    const promo = Knights.legalPromotions(s, pid);
    if (promo.length && p.res.sheep >= 2 && p.res.ore >= 2) return { type: 'promoteKnight', pid, at: promo[0] };
    const walls = Improve.legalWalls(s, pid);
    if (walls.length && canAfford(p.res, Improve.WALL_COST) && handSize(p.res) >= s.config.rules.handLimit + Improve.wallBonus(s, pid) - 1)
      return { type: 'buildWall', pid, at: walls[0] };
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
  if ((s.devDeck.length || s.barbAttack) && canAfford(p.res, COSTS.dev)) {
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
  const out = Object.fromEntries(cardsOf(s).map(r => [r, 0])); // Cities & Knights: commodities too
  while (need > 0) {
    const r = best(cardsOf(s).filter(x => hand[x] > 0), x => hand[x] - ((tgt && tgt.cost[x]) || 0) * 1.5);
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

let REAL = null; // the full state: the wagon pays real tolls even on roads fog hides
export function botAct(real, pid) {
  if (real.phase === 'gameOver') return null;
  REAL = real;
  const s = viewFor(real, pid); // in fog mode bots only know what they can see
  if (!pendingActors(s).includes(pid)) return null;
  if (s.phase === 'discard') return s.pendingDiscards[pid] ? discard(s, pid) : null;
  if (s.phase === 'caravanVote') return camelBid(s, pid); // Caravans
  if (s.phase === 'baSteal') { // Barbarian Attack 7: rob the leader who has cards
    const vs = BarbAttack.stealVictims(s, pid);
    return { type: 'baSteal', pid, target: best(vs, o => victoryPoints(s, o, false) * 2 + handSize(s.players[o].res) + noise(s, o) * 0.1) };
  }
  if (s.phase === 'baCard') return baCardChoice(s, pid); // Barbarian Attack
  if (s.phase === 'evChoice') return evChoiceAction(s, pid); // Event Cards
  if (s.phase === 'neutralBuild') return neutralBuildAction(s, pid); // Catan for Two
  if (s.phase === 'twoGive') return twoGiveAction(s, pid);
  if (s.phase === 'tbBarbarian') return tbBarbarianChoice(real && real.traders ? real : s, pid); // Traders & Barbarians
  if (s.phase === 'caravanPick') return { type: 'caravanPick', pid, spot: best(s.caravans.vote.tied, e => camelSpotValue(s, pid, e)) };
  if (s.phase === 'displace') {
    // Cities & Knights: our knight was pushed away: put it back next to our buildings if we can
    if (!s.displaced || s.displaced.pid !== pid) return null;
    const near = v => s.board.vertices[v].adj.filter(u => s.buildings[u] && s.buildings[u].owner === pid).length;
    return { type: 'placeDisplaced', pid, at: best(s.displaced.options, near) };
  }
  if (s.phase === 'progressPick') {
    // tied Defender of Catan: draw from the track we improved most
    if (!s.progressPick || !s.progressPick.includes(pid)) return null;
    const open = PROGRESS_TRACKS.filter(tr => s.progress[tr].length);
    return { type: 'progressPick', pid, track: best(open, tr => s.players[pid].improve[tr] + noise(s, tr.length) * 0.1) };
  }
  if (s.phase === 'progressDiscard') {
    // over the hand limit: drop the oldest card (cards can't be played yet)
    if (!s.progressDiscard || !s.progressDiscard[pid]) return null;
    return { type: 'progressDiscard', pid, card: s.players[pid].progress[0] };
  }
  if (s.phase === 'deserter') {
    // a rival's Deserter: let our weakest knight go
    if (!s.deserter || s.deserter.victim !== pid) return null;
    return { type: 'desertKnight', pid, at: best(Knights.knightsOf(s, pid), v => -s.knights[v].level - (s.knights[v].active ? 0.5 : 0)) };
  }
  if (s.phase === 'deserterPlace') {
    if (!s.deserter || s.deserter.from !== pid) return null;
    const near = v => s.board.vertices[v].adj.filter(u => s.buildings[u] && s.buildings[u].owner === pid).length;
    return { type: 'placeDeserter', pid, at: best(Politics.deserterSpots(s, pid), v => near(v) + noise(s, v) * 0.1) };
  }
  if (s.phase === 'wedding') {
    // a wedding gift: the cards we need least
    if (!s.wedding || !(pid in s.wedding.pending)) return null;
    const p = s.players[pid];
    const hand = cardsOf(s).flatMap(r => Array(p.res[r]).fill(r));
    hand.sort((a, b) => (COMMODITIES.includes(a) ? 1.5 : RES_W[a] || 1) - (COMMODITIES.includes(b) ? 1.5 : RES_W[b] || 1));
    return { type: 'weddingGive', pid, cards: hand.slice(0, s.wedding.pending[pid]) };
  }
  if (s.phase === 'harbor') {
    // Commercial Harbor: give back the commodity we have most of
    if (!s.harbor || !(pid in s.harbor.pending)) return null;
    const p = s.players[pid];
    return { type: 'harborReturn', pid, card: best(COMMODITIES.filter(c => p.res[c] > 0), c => p.res[c]) };
  }
  if (s.phase === 'pillage') {
    // Cities & Knights barbarians: give up the city that produces least
    if (!s.pillage || !s.pillage[pid]) return null;
    const value = v => s.board.vertices[v].hexes.reduce((n, h) => n + tileValue(s, s.board.tiles[h]), 0);
    return { type: 'pillageCity', pid, at: best(s.pillage[pid], v => -value(v)) };
  }
  if (s.phase === 'aqueduct') {
    // Cities & Knights Aqueduct: take the resource it has least of
    if (!s.pendingAqueduct[pid]) return null;
    const p = s.players[pid];
    return { type: 'aqueductPick', pid, res: best(RES.filter(r => s.bank[r] > 0), r => -p.res[r] + noise(s, r.length) * 0.1) || RES[0] };
  }
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
      const alch = alchemist(s, pid); // C&K: choose our best number
      if (alch) return alch;
      const dev = tryDevPlay(s, pid);
      return dev && dev.card === 'knight' ? dev : { type: 'roll', pid };
    }
    case 'robber':
      return robber(s, pid);
    case 'roadBuilding': {
      const roadsLeft = s.players[pid].roadsLeft > 0; // out of roads: ships only (Seafarers), else stop
      const e = roadsLeft ? bestRoad(s, pid) : null;
      if (e !== null) return { type: 'build', pid, what: 'road', at: e };
      const any = roadsLeft ? legalRoads(s, pid) : [];
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

// ---------------- Traders & Barbarians: Barbarian Attack ----------------
// what a hex's barbarians cost us: our buildings around it (cities count double)
function baStake(s, pid, hex) {
  let k = 0;
  for (const v of s.board.tiles[hex].verts) {
    const b = s.buildings[v];
    if (b && b.owner === pid) k += b.type === 'city' ? 2 : 1;
  }
  return k;
}
// worth of one more of our knights beside a hex with barbarians (`delta` knights added)
function baHexValue(s, pid, hex, delta = 0) {
  const B = s.barbAttack, n = B.on[hex] || 0;
  if (!n) return 0;
  const ks = BarbAttack.hexPaths(s, hex).filter(e => B.knights[e] != null).length + delta;
  const base = 1 + n * 0.5 + baStake(s, pid, hex) * (BarbAttack.isConquered(s, hex) ? 1.5 : 1);
  return ks > n ? base * 2 : base / (n + 2 - ks);
}
function baCardWeight(s, pid) {
  const B = s.barbAttack;
  const threat = Object.keys(B.on).reduce((a, h) => a + (baStake(s, pid, +h) ? B.on[h] : 0), 0);
  return threat >= 2 ? 0.4 : 0.9;
}
// best place for a knight: beside the hex where it helps most
function baBestPath(s, pid, spots) {
  const B = s.barbAttack;
  const score = e => {
    const hs = s.board.edges[e].hexes.filter(h => B.on[h]);
    return Math.max(0, ...hs.map(h => baHexValue(s, pid, h, 1))) + noise(s, e) * 0.05;
  };
  if (spots.some(e => score(e) > 0.1)) return best(spots, score);
  // nothing in reach of the spots (castle paths): the one closest to the barbarians
  const hot = Object.keys(B.on).map(Number);
  const near = e => -Math.min(...hot.map(h => Math.hypot(s.board.tiles[h].x - s.board.vertices[s.board.edges[e].a].x, s.board.tiles[h].y - s.board.vertices[s.board.edges[e].a].y)));
  return hot.length ? best(spots, near) : spots[0];
}
export function baCardChoice(s, pid) {
  const B = s.barbAttack, type = B.card;
  if (type === 'knight' || type === 'blackKnight') return { type: 'baCard', pid, at: baBestPath(s, pid, BarbAttack.knightSpots(s, type)) };
  if (type === 'intrigue') {
    const hexes = Object.keys(B.on).map(Number);
    return { type: 'baCard', pid, hex: best(hexes, h => baStake(s, pid, h) * (BarbAttack.isConquered(s, h) ? 3 : 1) + B.on[h] * 0.2) };
  }
  // treason: barbarians away from our buildings, towards the leader's
  const leader = best(s.players.filter(o => o.id !== pid && !o.retired).map(o => o.id), o => victoryPoints(s, o, false)) ?? pid;
  const moves = [];
  const sim = { ...B, on: { ...B.on }, conquered: [...B.conquered] };
  const view = { ...s, barbAttack: sim };
  for (let i = 0; i < BarbAttack.TREASON_MOVES; i++) {
    let bestMove = null, bestGain = 0.5;
    for (const f of s.board.coast) for (const t of s.board.coast) {
      if (!BarbAttack.treasonMoveOk(view, f, t)) continue;
      const gain = baStake(s, pid, f) - baStake(s, pid, t) + baStake(s, leader, t) * 0.7 - baStake(s, leader, f) * 0.7;
      if (gain > bestGain) { bestGain = gain; bestMove = { from: f, to: t }; }
    }
    if (!bestMove) break;
    moves.push(bestMove);
    BarbAttack.moveBarbarian(view, bestMove.from, bestMove.to);
  }
  return { type: 'baCard', pid, moves };
}
// one knight move per call (each knight once per turn); grain only when we have it to spare
export function baKnightMove(s, pid) {
  const B = s.barbAttack, p = s.players[pid];
  const moved = B.moved && B.moved.turn === s.turn ? B.moved.at : [];
  const here = e => BarbAttack.isCastlePath(s, e) ? -0.5 : Math.max(0, ...s.board.edges[e].hexes.filter(h => B.on[h]).map(h => baHexValue(s, pid, h)));
  let bestMove = null, bestGain = 0.3;
  for (const from of BarbAttack.knightsOf(s, pid)) {
    if (moved.includes(from)) continue;
    const cur = here(from);
    const view = { ...s, barbAttack: { ...B, knights: { ...B.knights } } };
    delete view.barbAttack.knights[from];
    for (const [to, d] of BarbAttack.knightReach(s, from)) {
      const grain = BarbAttack.moveCost(d);
      if (grain && p.res.wheat - grain < 1) continue;
      const hs = s.board.edges[to].hexes.filter(h => B.on[h]);
      if (!hs.length) continue;
      const val = Math.max(...hs.map(h => baHexValue(view, pid, h, 1))) - grain * 0.6;
      if (val - cur > bestGain) { bestGain = val - cur; bestMove = { type: 'baMoveKnight', pid, from, to }; }
    }
  }
  return bestMove;
}

// ---------------- Traders & Barbarians: the wagon ----------------
function tbWagonAction(view, pid) {
  const s = REAL && REAL.traders ? REAL : view;
  const p = s.players[pid], next = Traders.nextLevel(s, pid);
  if (next && canAfford(p.res, next.cost)) {
    const tgt = chooseTarget(s, pid);
    if (!tgt || tgt.what === 'wagon' || s.traders.wagons[pid].level < 2) return { type: 'tbUpgrade', pid };
  }
  if (Traders.wagonAt(s, pid) == null || Traders.stopped(s, pid)) return null;
  const plan = Traders.wagonPlan(s, pid);
  if (plan.goal == null) return null;
  const reaches = pl => pl.steps.length && pl.steps[pl.steps.length - 1].to === pl.goal;
  if (!reaches(plan) && !Traders.boostUsed(s, pid) && p.res.wheat >= 1 && reaches(Traders.wagonPlan(s, pid, Traders.mpLeft(s, pid) + Traders.BOOST_MP)))
    return { type: 'tbBoost', pid };
  if (plan.steps.length) return { type: 'tbMove', pid, to: plan.steps[0].to };
  return tbDriveAction(s, pid);
}

// barbarians the wagon would like gone: on its route, on our roads
function tbRouteEdges(s, pid, mp = 99) {
  return new Set(Traders.wagonPlan(s, pid, mp).steps.map(x => x.e));
}
function tbDriveAction(s, pid) {
  const targets = Traders.driveTargets(s, pid);
  if (!targets.length) return null;
  const route = tbRouteEdges(s, pid);
  return { type: 'tbDrive', pid, edge: best(targets, e => (route.has(e) ? 2 : 0) + (s.roads[e] === pid ? 3 : 0) + noise(s, e) * 0.1) };
}
function tbLeader(s, pid) {
  return best(s.players.filter(o => o.id !== pid && !o.retired).map(o => o.id), o => victoryPoints(s, o, false) + noise(s, o) * 0.1);
}
export function tbBarbarianChoice(s, pid) {
  const T = s.traders, R = T.relocate || { from: null, steal: true };
  const mine = tbRouteEdges(s, pid);
  const leader = tbLeader(s, pid);
  const theirs = leader != null ? tbRouteEdges(s, leader) : new Set();
  const from = R.from != null ? R.from : best(T.barbarians, e => (s.roads[e] === pid ? 3 : 0) + (mine.has(e) ? 2 : 0) - (s.roads[e] === leader ? 2 : 0) - (theirs.has(e) ? 1 : 0) + noise(s, e) * 0.1);
  const to = best(Traders.freeBarbPaths(s).filter(e => e !== from), e => {
    let v = 0;
    const victim = R.steal ? Traders.roadVictim(s, pid, e) : null;
    if (victim != null) v += victim === leader ? 3 : 1.5;
    if (s.roads[e] === pid) v -= 4;
    if (mine.has(e)) v -= 3;
    if (theirs.has(e)) v += 1.5;
    return v + noise(s, e) * 0.2;
  });
  return { type: 'tbMoveBarbarian', pid, from, to };
}
function tbDevPlay(s, pid, playable) {
  const p = s.players[pid];
  if (playable.includes('knight')) {
    const T = s.traders, route = tbRouteEdges(s, pid);
    const inMyWay = T.barbarians.some(e => s.roads[e] === pid || route.has(e));
    if (inMyWay || (s.phase === 'main' && p.dev.filter(c => c.type === 'knight').length >= 2) || noise(s, 13) < 0.15) return { type: 'playDev', pid, card: 'knight' };
  }
  if (s.phase !== 'main') return null;
  if (playable.includes('swiftJourney') && Traders.wagonAt(s, pid) != null) {
    const plan = Traders.wagonPlan(s, pid);
    const blocked = Traders.stopped(s, pid) || !plan.steps.length;
    if (blocked && Traders.wagonPlan(s, pid, Traders.mpLeft(s, pid) + Traders.wagonLevel(s, pid).mp).steps.length) return { type: 'playDev', pid, card: 'swiftJourney' };
  }
  if (playable.includes('roadBuilding') && p.roadsLeft > 0 && bestRoad(s, pid) !== null) return { type: 'playDev', pid, card: 'roadBuilding' };
  return null;
}

// ---------------- Catan Event Cards: choices ----------------
function evChoiceAction(s, pid) {
  const task = s.evChoice.pending[pid], p = s.players[pid];
  if (task.type === 'take') {
    const tgt = chooseTarget(s, pid);
    const need = tgt ? Object.keys(missing(p.res, tgt.cost).m).filter(r => s.bank[r] > 0) : [];
    return { type: 'evChoose', pid, res: need[0] || best(RES.filter(r => s.bank[r] > 0), r => -p.res[r] + noise(s, r.length) * 0.1) };
  }
  if (task.type === 'give') {
    const tgt = chooseTarget(s, pid);
    const keep = tgt ? tgt.cost : {};
    const res = best(cardsOf(s).filter(r => p.res[r] > 0), r => p.res[r] - (keep[r] || 0) * 2);
    const to = task.to != null ? task.to : best(task.options, o => -victoryPoints(s, o, false) + noise(s, o) * 0.1);
    return { type: 'evChoose', pid, res, to };
  }
  return { type: 'evChoose', pid, target: best(task.options, o => victoryPoints(s, o, false) * 2 + handSize(s.players[o].res) + noise(s, o) * 0.1) };
}

// ---------------- Catan for Two: where the free neutral piece goes ----------------
// a neutral settlement takes the spot the opponent would like most; a neutral road heads for the
// opponent's pieces (to get in their way)
export function neutralBuildAction(view, pid) {
  const s = REAL && REAL.neutralBuild ? REAL : view; // fog hides pieces: where the neutral may build is decided on the real board
  const N = s.neutralBuild, spots = neutralSpots(s, N.what);
  const opp = s.players.find(o => o.id !== pid && !o.retired);
  if (N.what === 'settlement') {
    const prod = opp ? production(s, opp.id) : null;
    const sp = best(spots, x => (opp ? vertexScore(s, opp.id, x.at, prod) : 0) + noise(s, x.at) * 0.1);
    return { type: 'neutralBuild', pid, at: sp.at, nid: sp.nid };
  }
  const theirs = opp ? Object.keys(s.buildings).filter(v => s.buildings[v].owner === opp.id).map(Number) : [];
  const mid = e => { const E = s.board.edges[e]; const a = s.board.vertices[E.a], b = s.board.vertices[E.b]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const near = e => { const m = mid(e); return theirs.length ? -Math.min(...theirs.map(v => Math.hypot(s.board.vertices[v].x - m.x, s.board.vertices[v].y - m.y))) : 0; };
  const sp = best(spots, x => near(x.at) + noise(s, x.at) * 0.05);
  return { type: 'neutralBuild', pid, at: sp.at, nid: sp.nid };
}

// ---------------- Catan for Two: trade tokens ----------------
function twoTokenAction(s, pid) {
  const p = s.players[pid];
  if (p.knights > 0 && s.largestArmy.owner !== pid && p.tokens < 2 && !(s.two.swapped && s.two.swapped.turn === s.turn) && s.two.supply > 0) return { type: 'twoKnight', pid };
  if (tokenActionUsed(s) || p.tokens < tokenCost(s, pid)) return null;
  const rob = s.board.robber;
  if (!s.config.rules.noRobber && rob >= 0 && s.board.tiles[rob].res !== 'desert' && s.board.tiles[rob].verts.some(v => s.buildings[v] && s.buildings[v].owner === pid)) return { type: 'twoAction', pid, kind: 'robber' };
  const opp = s.players.find(o => o.id !== pid && !o.neutral);
  const tgt = chooseTarget(s, pid);
  if (opp && handSize(opp.res) >= 3 && tgt && missing(p.res, tgt.cost).n >= 1 && handSize(p.res) >= 1 && noise(s, 17) < 0.5) return { type: 'twoAction', pid, kind: 'forcedTrade' };
  return null;
}
function twoGiveAction(s, pid) {
  const G2 = s.two.give, p = s.players[pid];
  const tgt = chooseTarget(s, pid), keep = tgt ? tgt.cost : {};
  const hand = { ...p.res }, res = [];
  for (let i = 0; i < G2.n; i++) {
    const r = best(Object.keys(hand).filter(k => hand[k] > 0), k => hand[k] - (keep[k] || 0) * 3);
    res.push(r);
    hand[r]--;
  }
  return { type: 'twoGive', pid, res };
}
