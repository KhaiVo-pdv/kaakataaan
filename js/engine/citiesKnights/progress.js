// Cities & Knights progress cards: they replace the development cards. Three decks (one per
// improvement track); you draw when the event die shows that track's gate and the red die is at
// most your level + 1 there. Victory point cards are revealed at once; you hold at most 4 others.
//   s.progress        { trade: [ids], politics: [ids], science: [ids] }   top of a deck = last item
//   p.progress        [ids]   cards in hand (secret to the others)
//   p.progressVP      victory points from revealed cards
//   s.progressPick    [pids]  tied Defenders of Catan choosing a deck
//   s.progressDiscard { [pid]: n }  players over the hand limit
// Only present when the expansion is on: the base game never has any of these.
import { shuffle } from '../rng.js';

// marks a text for the translation extractor (tools/i18n.mjs); translated where it is shown
const tk = x => x;

export const PROGRESS_HAND = 4;

// the full official set: 18 cards per track. `vp` cards are revealed when drawn.
export const PROGRESS_CARDS = {
  // science (green)
  alchemist: { track: 'science', n: 2, icon: '⚗️', name: tk('Alquimista'), desc: tk('Juega antes de tirar: eliges qué sale en los dos dados de números.') },
  inventor: { track: 'science', n: 2, icon: '💡', name: tk('Inventor'), desc: tk('Intercambia dos fichas de número (ni 2, 12, 6 ni 8).') },
  crane: { track: 'science', n: 2, icon: '🏗️', name: tk('Grúa'), desc: tk('Tu próxima mejora de ciudad cuesta 1 mercancía menos.') },
  engineer: { track: 'science', n: 1, icon: '📐', name: tk('Ingeniero'), desc: tk('Construye gratis una muralla.') },
  irrigation: { track: 'science', n: 2, icon: '💧', name: tk('Irrigación'), desc: tk('Recibe 2 cereales por cada campo junto a tus poblados y ciudades.') },
  medicine: { track: 'science', n: 2, icon: '💊', name: tk('Medicina'), desc: tk('Mejora un poblado a ciudad por 2 minerales y 1 cereal.') },
  mining: { track: 'science', n: 2, icon: '⛏️', name: tk('Minería'), desc: tk('Recibe 2 minerales por cada montaña junto a tus poblados y ciudades.') },
  printer: { track: 'science', n: 1, icon: '🖨️', name: tk('Imprenta'), desc: tk('1 punto de victoria. Se revela al robarla.'), vp: 1 },
  roadBuilding: { track: 'science', n: 2, icon: '🛤️', name: tk('Construcción de caminos'), desc: tk('Construye 2 caminos gratis.') },
  smith: { track: 'science', n: 2, icon: '🔨', name: tk('Herrero'), desc: tk('Asciende gratis hasta 2 caballeros.') },
  // trade (yellow)
  commercialHarbor: { track: 'trade', n: 2, icon: '⚓', name: tk('Puerto comercial'), desc: tk('Ofrece a cada rival 1 recurso; quien tenga mercancías te da 1 a cambio.') },
  masterMerchant: { track: 'trade', n: 2, icon: '🧐', name: tk('Maestro mercader'), desc: tk('Mira la mano de un rival con más puntos que tú y toma 2 cartas.') },
  merchant: { track: 'trade', n: 6, icon: '💼', name: tk('Mercader'), desc: tk('Pon el mercader junto a tu poblado o ciudad: 2:1 con ese recurso y 1 punto mientras lo tengas.') },
  merchantFleet: { track: 'trade', n: 2, icon: '🚢', name: tk('Flota mercante'), desc: tk('Este turno comercias 2:1 con el banco un recurso o mercancía a tu elección.') },
  resourceMonopoly: { track: 'trade', n: 4, icon: '🌾', name: tk('Monopolio de recursos'), desc: tk('Elige un recurso: cada rival te da hasta 2.') },
  tradeMonopoly: { track: 'trade', n: 2, icon: '🪙', name: tk('Monopolio comercial'), desc: tk('Elige una mercancía: cada rival te da 1.') },
  // politics (blue)
  bishop: { track: 'politics', n: 2, icon: '⛪', name: tk('Obispo'), desc: tk('Mueve el ladrón y roba 1 carta a cada jugador junto a esa casilla.') },
  constitution: { track: 'politics', n: 1, icon: '📜', name: tk('Constitución'), desc: tk('1 punto de victoria. Se revela al robarla.'), vp: 1 },
  deserter: { track: 'politics', n: 2, icon: '🏃', name: tk('Desertor'), desc: tk('Un rival retira un caballero suyo y tú pones uno de la misma fuerza.') },
  diplomat: { track: 'politics', n: 2, icon: '🤝', name: tk('Diplomático'), desc: tk('Quita un camino suelto; si es tuyo, puedes ponerlo en otro sitio.') },
  intrigue: { track: 'politics', n: 2, icon: '🗡️', name: tk('Intriga'), desc: tk('Expulsa un caballero rival que toque tus caminos.') },
  saboteur: { track: 'politics', n: 2, icon: '💣', name: tk('Saboteador'), desc: tk('Cada rival con tantos puntos como tú o más descarta la mitad de su mano.') },
  spy: { track: 'politics', n: 3, icon: '🕵️', name: tk('Espía'), desc: tk('Mira las cartas de progreso de un rival y quédate con una.') },
  warlord: { track: 'politics', n: 2, icon: '🎖️', name: tk('Señor de la guerra'), desc: tk('Activa gratis todos tus caballeros.') },
  wedding: { track: 'politics', n: 2, icon: '💍', name: tk('Boda'), desc: tk('Cada rival con más puntos que tú te da 2 cartas a su elección.') },
};

export const PROGRESS_TRACKS = ['trade', 'politics', 'science'];

export function initProgress(s) {
  s.progress = {};
  for (const tr of PROGRESS_TRACKS)
    s.progress[tr] = shuffle(s.rng, Object.entries(PROGRESS_CARDS).filter(([, c]) => c.track === tr).flatMap(([id, c]) => Array(c.n).fill(id)));
  for (const p of s.players) {
    p.progress = [];
    p.progressVP = 0;
  }
  s.progressPick = null;
  s.progressDiscard = null;
}

// does this red die let a player draw from that track? (level 1: red 1-2 ... level 5: red 1-6)
export const drawsOn = (s, pid, track, red) => {
  const lvl = s.players[pid].improve ? s.players[pid].improve[track] : 0;
  return lvl > 0 && red <= lvl + 1;
};

// order of play from the current player
const fromCurrent = s => s.players.map((_, i) => s.players[(s.current + i) % s.players.length]).filter(p => !p.retired);

// draw the top card of a deck. VP cards are revealed at once. Returns the card id or null (empty deck).
export function draw(s, pid, track) {
  const id = s.progress[track].pop();
  if (!id) return null;
  const p = s.players[pid];
  if (PROGRESS_CARDS[id].vp) p.progressVP += PROGRESS_CARDS[id].vp;
  else {
    p.progress.push(id);
    if (p.progress.length > PROGRESS_HAND) (s.progressDiscard ||= {})[pid] = p.progress.length - PROGRESS_HAND;
  }
  return id;
}

// the event die showed a gate: everyone whose level allows it draws, in turn order. Returns [{pid, id}].
export function drawForGate(s, track, red) {
  const out = [];
  for (const p of fromCurrent(s)) if (drawsOn(s, p.id, track, red)) {
    const id = draw(s, p.id, track);
    if (id) out.push({ pid: p.id, id });
  }
  return out;
}

// decks a tied defender may still choose
export const openDecks = s => PROGRESS_TRACKS.filter(tr => s.progress[tr].length);

// throw a card away: it goes under its deck
export function discard(s, pid, id) {
  const p = s.players[pid];
  const i = p.progress.indexOf(id);
  if (i < 0) return false;
  p.progress.splice(i, 1);
  s.progress[PROGRESS_CARDS[id].track].unshift(id);
  if (s.progressDiscard && s.progressDiscard[pid]) {
    if (--s.progressDiscard[pid] <= 0) delete s.progressDiscard[pid];
    if (!Object.keys(s.progressDiscard).length) s.progressDiscard = null;
  }
  return true;
}
