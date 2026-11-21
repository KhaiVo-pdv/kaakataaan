// Cities & Knights pieces of the game screen (gameView.js). Everything here only shows something
// when the game has the expansion on.
import { RES } from '../engine/constants.js';
import { COMMODITIES, GATE_INFO, cardsOf } from '../engine/citiesKnights/commodities.js';
import { t } from '../i18n.js';

// every card kind that can appear in any hand (to read offers and fly cards without a state)
export const ANY_CARD = [...RES, ...COMMODITIES];
// the cards of this game: base game = the 5 resources; Cities & Knights adds the commodities
export const cardList = st => (st ? cardsOf(st) : RES);
// an empty hand with a slot for each card of this game (trade and discard drafts)
export const blankHand = st => Object.fromEntries(cardList(st).map(r => [r, 0]));

// the event die next to the number dice (red die = the second number die)
export function eventDieBadge(st, h) {
  if (!st.eventDie) return null;
  const g = GATE_INFO[st.eventDie];
  return h('div', { class: 'event-die face-' + st.eventDie, title: t(g.name), 'data-testid': 'event-die' }, g.icon);
}
