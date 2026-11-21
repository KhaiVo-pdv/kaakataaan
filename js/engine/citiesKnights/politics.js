// Cities & Knights politics progress cards: what each one may target. The moves live in game.js
// (H.playProgress and the answers of the rivals), which checks everything here first.
//   s.bishopSteal  true while the Bishop's robber move is pending (steal from everyone there)
//   s.deserter     { from, victim, level?, active? }  victim picks a knight, then `from` places one
//   s.wedding      { to, pending: { [pid]: n } }      rivals choosing the cards they give
//   s.sabotage     true while the Saboteur's discards are pending (they don't wake the robber)
// Only present when the expansion is on: the base game never has any of these.
import { knightsOf, ownRoadAt, emptyAt } from './knights.js';
import { cardsOf } from './commodities.js';

export const WEDDING_GIFT = 2;

const rivals = (s, pid) => s.players.filter(p => p.id !== pid && !p.retired);
export const handCount = (s, pid) => cardsOf(s).reduce((n, r) => n + s.players[pid].res[r], 0);

// Warlord: your knights that are not active yet
export const warlordKnights = (s, pid) => knightsOf(s, pid).filter(v => !s.knights[v].active);

// Intrigue: rival knights on a corner one of your roads touches
export const intrigueTargets = (s, pid) => Object.keys(s.knights || {}).map(Number).filter(v => s.knights[v].owner !== pid && ownRoadAt(s, pid, v));

// Spy: rivals holding progress cards
export const spyTargets = (s, pid) => rivals(s, pid).filter(p => p.progress.length).map(p => p.id);

// Deserter: rivals with knights on the board
export const deserterTargets = (s, pid) => rivals(s, pid).filter(p => knightsOf(s, p.id).length).map(p => p.id);
// the level you get back: the same, else the strongest weaker one you still have in the box
export function deserterLevel(s, pid, level) {
  for (let l = level; l >= 1; l--) if (s.players[pid].knightsLeft[l] > 0) return l;
  return 0;
}
// where the deserter may go: like recruiting (a free corner next to your road), any level
export const deserterSpots = (s, pid) => s.board.vertices.filter(V => V.hexes.length && emptyAt(s, V.id) && ownRoadAt(s, pid, V.id)).map(V => V.id);

// Saboteur / Wedding: who is hit (public points)
export const saboteurTargets = (s, pid, vp) => rivals(s, pid).filter(p => vp(p.id) >= vp(pid) && handCount(s, p.id) >= 2).map(p => p.id);
export const weddingTargets = (s, pid, vp) => rivals(s, pid).filter(p => vp(p.id) > vp(pid) && handCount(s, p.id) > 0).map(p => p.id);

// Diplomat: an open road has an end with nothing else of its owner (no road, ship, building or knight)
export function openRoads(s) {
  const out = [];
  for (const k in s.roads) {
    const e = +k, owner = s.roads[k], E = s.board.edges[e];
    const loose = v => {
      const b = s.buildings[v], kn = s.knights && s.knights[v];
      if ((b && b.owner === owner) || (kn && kn.owner === owner)) return false;
      return !s.board.vertices[v].edges.some(x => x !== e && (s.roads[x] === owner || (s.ships && s.ships[x] === owner)));
    };
    if (loose(E.a) || loose(E.b)) out.push(e);
  }
  return out;
}
