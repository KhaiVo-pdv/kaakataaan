// Seafarers ships: pure rules (queries + state changes) for building, placing and moving ships.
// State used (only created when Seafarers is on, see initShips):
//   s.ships       { [edgeId]: pid }       like s.roads
//   p.shipsLeft   ships still in the box
//   s.shipTurn    { moved: bool, built: [edgeIds] }   reset every turn
// Ships sail on 'coast' and 'sea' edges, never next to the pirate (see pirate.js). A shipping route links to a road network only through
// one of your own settlements/cities, never directly road-to-ship.

import { pirateBlocks } from './pirate.js';

export const SHIP_COST = { wood: 1, sheep: 1 };
export const MAX_SHIPS = 15;

export function initShips(s) {
  s.ships = {};
  s.shipTurn = { moved: false, built: [] };
  for (const p of s.players) p.shipsLeft = MAX_SHIPS;
}

export function resetShipTurn(s) {
  if (s.shipTurn) s.shipTurn = { moved: false, built: [] };
}

const own = (s, v, pid) => s.buildings[v] && s.buildings[v].owner === pid;
const rival = (s, v, pid) => s.buildings[v] && s.buildings[v].owner !== pid;
export const waterEdge = (s, e) => {
  const E = s.board.edges[e];
  return !!E && (E.kind === 'coast' || E.kind === 'sea');
};
const free = (s, e) => s.roads[e] === undefined && s.ships[e] === undefined;

// One end of edge `e` links it to pid's shipping network: an own building there, or
// (with no rival building in the way) another own ship. `skip` ignores one ship (moving it).
function linkedAt(s, pid, e, v, skip) {
  if (own(s, v, pid)) return true;
  if (rival(s, v, pid)) return false;
  return s.board.vertices[v].edges.some(x => x !== e && x !== skip && s.ships[x] === pid);
}

export function canBuildShip(s, pid, e, skip = -1) {
  if (!s.ships || !waterEdge(s, e) || !free(s, e) || pirateBlocks(s, e)) return false;
  const E = s.board.edges[e];
  return linkedAt(s, pid, e, E.a, skip) || linkedAt(s, pid, e, E.b, skip);
}

export const legalShips = (s, pid) => (s.ships ? s.board.edges.filter(E => canBuildShip(s, pid, E.id)).map(E => E.id) : []);

// initial placement: a ship instead of the road, next to the settlement just placed
export function canSetupShip(s, pid, e) {
  if (!s.ships || s.setup.blindActive) return false; // secret placements only take roads
  const E = s.board.edges[e];
  return waterEdge(s, e) && free(s, e) && (E.a === s.setup.lastVid || E.b === s.setup.lastVid);
}
export function legalSetupShips(s, pid) {
  const v = s.board.vertices[s.setup.lastVid];
  return v && s.ships ? v.edges.filter(e => canSetupShip(s, pid, e)) : [];
}

// A ship can move if it sits at the open end of a route: one of its ends touches neither
// an own building nor another own ship. Ships built this turn stay put; one move per turn.
export function movableShips(s, pid) {
  if (!s.ships || s.shipTurn.moved) return [];
  const out = [];
  for (const k in s.ships) {
    const e = +k;
    if (s.ships[k] !== pid || s.shipTurn.built.includes(e) || pirateBlocks(s, e)) continue;
    const E = s.board.edges[e];
    const openEnd = v => !own(s, v, pid) && !s.board.vertices[v].edges.some(x => x !== e && s.ships[x] === pid);
    if (openEnd(E.a) || openEnd(E.b)) out.push(e);
  }
  return out;
}

export function shipDestinations(s, pid, from) {
  if (!movableShips(s, pid).includes(from)) return [];
  return s.board.edges.filter(E => E.id !== from && canBuildShip(s, pid, E.id, from)).map(E => E.id);
}

// ---- state changes (callers check phase/turn; these throw through `fail`) ----
export function buildShip(s, pid, e, { fail, pay, isFree }) {
  const p = s.players[pid];
  if (p.shipsLeft <= 0) fail('No te quedan barcos.');
  if (!canBuildShip(s, pid, e)) fail('El barco debe ir en el agua y conectar con tu poblado o tus barcos.');
  if (!isFree) pay(SHIP_COST);
  p.shipsLeft--;
  s.ships[e] = pid;
  s.shipTurn.built.push(e);
}

export function placeSetupShip(s, pid, e, { fail }) {
  const p = s.players[pid];
  if (p.shipsLeft <= 0) fail('No te quedan barcos.');
  if (!canSetupShip(s, pid, e)) fail('El barco debe salir de tu nuevo poblado, en el agua.');
  p.shipsLeft--;
  s.ships[e] = pid;
}

export function moveShip(s, pid, from, to, { fail }) {
  if (!s.ships) fail('No hay barcos en esta partida.');
  if (s.shipTurn.moved) fail('Ya moviste un barco este turno.');
  if (!movableShips(s, pid).includes(from)) fail('Ese barco no se puede mover.');
  if (!shipDestinations(s, pid, from).includes(to)) fail('El barco no puede ir ahí.');
  delete s.ships[from];
  s.ships[to] = pid;
  s.shipTurn.moved = true;
}
