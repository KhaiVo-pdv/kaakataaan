// "Catan Event Cards" (Traders & Barbarians variant, config.rules.diceMode === 'eventCards'):
// a deck of 36 cards replaces the two dice. Each card shows a number (same spread as two dice), the
// red die's value (for Cities & Knights) and maybe an event. A "New Year" card sits on top of the
// last 5 cards: when it turns up the whole deck is reshuffled (so 5 cards are never used).
import { shuffle } from './rng.js';

// [number, red die, event] — the 36 cards (16 without an event)
const CARDS = [
  [2, 1, 'plentifulYear'],
  [3, 2, null], [3, 1, 'conflict'],
  [4, 3, 'robberFlees'], [4, 2, 'robberFlees'], [4, 1, null],
  [5, 4, 'tradeAdvantage'], [5, 3, 'tournament'], [5, 2, null], [5, 1, null],
  [6, 5, null], [6, 4, null], [6, 3, 'goodNeighbors'], [6, 2, 'earthquake'], [6, 1, 'epidemic'],
  [7, 6, 'robberAttack'], [7, 5, 'robberAttack'], [7, 4, 'robberAttack'], [7, 3, 'robberAttack'], [7, 2, 'robberAttack'], [7, 1, 'robberAttack'],
  [8, 6, null], [8, 5, null], [8, 4, null], [8, 3, null], [8, 2, 'epidemic'],
  [9, 6, 'calmSeas'], [9, 5, null], [9, 4, null], [9, 3, null],
  [10, 6, null], [10, 5, null], [10, 4, 'helpfulNeighbor'],
  [11, 6, null], [11, 5, 'helpfulNeighbor'],
  [12, 6, 'calmSeas'],
];
export const EVENT_CARDS = CARDS.map(([num, red, event], id) => ({ id, num, red, event }));
export const NEW_YEAR = -1;
export const LEFT_OUT = 5; // cards under the New Year card

// what each event is called and does (Spanish keys, translated in vi.js / en.js)
export const EVENT_INFO = {
  null: { icon: '☀️', name: 'Un día tranquilo', desc: 'Sin evento: se produce con normalidad.' },
  robberAttack: { icon: '🦹', name: 'Ataque del ladrón', desc: 'Como un 7: se descarta y se mueve el ladrón.' },
  robberFlees: { icon: '🏃', name: 'El ladrón huye', desc: 'El ladrón vuelve al desierto sin robar a nadie.' },
  epidemic: { icon: '🤒', name: 'Epidemia', desc: 'Este turno cada ciudad produce solo 1 recurso.' },
  calmSeas: { icon: '🌊', name: 'Mar en calma', desc: 'Quien tenga más edificios en puertos toma 1 recurso a elegir.' },
  helpfulNeighbor: { icon: '🤝', name: 'Vecino solidario', desc: 'Quien tenga más puntos da 1 recurso a elegir a alguien con menos.' },
  plentifulYear: { icon: '🌾', name: 'Año abundante', desc: 'Cada jugador toma 1 recurso a elegir.' },
  goodNeighbors: { icon: '🎁', name: 'Buenos vecinos', desc: 'Cada jugador da 1 recurso a elegir al de su izquierda.' },
  earthquake: { icon: '🌋', name: 'Terremoto', desc: 'Cada jugador daña uno de sus caminos: hasta repararlo (1 madera + 1 arcilla) no construye caminos.' },
  tradeAdvantage: { icon: '📈', name: 'Ventaja comercial', desc: 'Quien tenga el camino más largo roba 1 recurso a quien elija.' },
  tournament: { icon: '🏇', name: 'Torneo', desc: 'Quien haya jugado más caballeros toma 1 recurso a elegir.' },
  conflict: { icon: '⚔️', name: 'Conflicto', desc: 'Quien tenga el mayor ejército roba 1 recurso a quien elija.' },
  newYear: { icon: '🎆', name: 'Año nuevo', desc: 'Se barajan todas las cartas.' },
};
export const eventInfo = ev => EVENT_INFO[ev] || EVENT_INFO.null;

// a fresh deck, drawn with pop(): 5 cards at the bottom, the New Year card, then the other 31
export function newEventDeck(rng) {
  const ids = shuffle(rng, EVENT_CARDS.map(c => c.id));
  return [...ids.slice(0, LEFT_OUT), NEW_YEAR, ...ids.slice(LEFT_OUT)];
}

// the next card; returns { card, newYear } (newYear: the deck was reshuffled first)
export function drawEventCard(s) {
  let newYear = false;
  if (!s.eventDeck.length) s.eventDeck = newEventDeck(s.rng);
  let id = s.eventDeck.pop();
  if (id === NEW_YEAR) {
    newYear = true;
    s.eventDeck = newEventDeck(s.rng);
    id = s.eventDeck.pop();
  }
  return { card: EVENT_CARDS[id], newYear };
}
