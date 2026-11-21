// Cities & Knights trade progress cards: what each one may target, plus the merchant piece.
//   s.merchant     { owner, tile } | null   the one merchant piece: 2:1 in that tile's resource, +1 point
//   p.fleet        { turn, res }            Merchant Fleet: 2:1 in `res` for this turn
//   s.harbor       { from, pending: { [pid]: res } }   Commercial Harbor: rivals choosing a commodity to return
// Only present when the expansion is on: the base game never has any of these.
import { RES } from '../constants.js';
import { COMMODITIES } from './commodities.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

export const MERCHANT_VP = 1;
export const MONOPOLY_RES = 2; // Resource Monopoly: up to 2 from each rival
export const MONOPOLY_COM = 1; // Trade Monopoly: 1 from each rival
export const MASTER_TAKE = 2;

export function initTradeCards(s) {
  s.merchant = null;
  s.harbor = null;
}

// Merchant: a land tile with a resource next to one of your settlements or cities
export function merchantTiles(s, pid) {
  const out = new Set();
  for (const k in s.buildings) {
    if (s.buildings[k].owner !== pid) continue;
    for (const h of s.board.vertices[k].hexes) {
      const t = s.board.tiles[h];
      if (t && RES.includes(t.res)) out.add(h);
    }
  }
  return [...out];
}
export const merchantVP = (s, pid) => (s.merchant && s.merchant.owner === pid ? MERCHANT_VP : 0);
export const merchantRes = (s, pid) => (s.merchant && s.merchant.owner === pid ? s.board.tiles[s.merchant.tile].res : null);
export const fleetRes = (s, pid) => (s.players[pid].fleet && s.players[pid].fleet.turn === s.turn ? s.players[pid].fleet.res : null);

// 2:1 from the merchant or a merchant fleet (null = no such deal)
export const cardRatio = (s, pid, res) => (merchantRes(s, pid) === res || fleetRes(s, pid) === res ? 2 : null);

const rivals = (s, pid) => s.players.filter(p => p.id !== pid && !p.retired);
const commoditiesOf = p => COMMODITIES.reduce((n, c) => n + p.res[c], 0);
const handOf = p => Object.values(p.res).reduce((a, b) => a + b, 0);

// Master Merchant: rivals with more (public) points than you and at least one card
export const masterTargets = (s, pid, vp) => rivals(s, pid).filter(p => vp(p.id) > vp(pid) && handOf(p) > 0).map(p => p.id);

// Commercial Harbor: rivals that have a commodity to give back
export const harborTargets = (s, pid) => rivals(s, pid).filter(p => commoditiesOf(p) > 0).map(p => p.id);

// check a Commercial Harbor offer { [rival]: resource } against your hand ('' = fine)
export function harborBlock(s, pid, offers) {
  if (!offers || typeof offers !== 'object') return tk('Elige qué recurso ofreces a cada rival.');
  const ok = harborTargets(s, pid);
  const ids = Object.keys(offers).map(Number);
  if (!ids.length) return tk('Ofrece al menos un recurso.');
  const need = {};
  for (const q of ids) {
    if (!ok.includes(q)) return tk('Ese rival no tiene mercancías.');
    const r = offers[q];
    if (!RES.includes(r)) return tk('Solo puedes ofrecer recursos.');
    need[r] = (need[r] || 0) + 1;
  }
  for (const r in need) if (s.players[pid].res[r] < need[r]) return tk('No tienes esos recursos.');
  return '';
}

// check the 2 cards taken with the Master Merchant ('' = fine)
export function masterBlock(s, pid, target, cards, vp) {
  if (!masterTargets(s, pid, vp).includes(target)) return tk('Elige un rival con más puntos que tú.');
  const p = s.players[target];
  const want = Math.min(MASTER_TAKE, handOf(p));
  if (!Array.isArray(cards) || cards.length !== want) return tk('Elige 2 cartas de su mano.');
  const n = {};
  for (const c of cards) n[c] = (n[c] || 0) + 1;
  for (const c in n) if (!(p.res[c] >= n[c])) return tk('Esa carta no está en su mano.');
  return '';
}
