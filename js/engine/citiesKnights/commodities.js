// Cities & Knights: commodities and the event die. Only used when config.expansions.citiesKnights is on.
//   - three commodities: paper (forest), cloth (pasture), coin (mountains)
//   - a city next to forest / pasture / mountains takes 1 resource + 1 commodity instead of
//     2 resources; hills and fields still give 2 resources; settlements are unchanged
//   - commodities live in the same hand and bank as resources (they count for the 7, can be
//     stolen, discarded and traded; the bank trades them 4:1, a 3:1 harbor works too)
//   - the event die is rolled with the two number dice: 3 ship faces (barbarians), and a yellow,
//     blue and green city gate (progress cards). Its effects come in later steps.
import { RES } from '../constants.js';

export const COMMODITIES = ['paper', 'cloth', 'coin'];
export const COMMODITY_OF = { wood: 'paper', sheep: 'cloth', ore: 'coin' };
export const COMMODITY_BANK = 12;

// event die faces: 1-3 barbarian ship, 4 yellow (trade), 5 blue (politics), 6 green (science)
export const EVENT_FACES = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];
export const GATE_INFO = {
  ship: { icon: '⛵', name: 'Barco bárbaro' },
  trade: { icon: '🟨', name: 'Puerta amarilla (comercio)' },
  politics: { icon: '🟦', name: 'Puerta azul (política)' },
  science: { icon: '🟩', name: 'Puerta verde (ciencia)' },
};

// every kind of card a player can hold in this game
export const cardsOf = s => (s.config.expansions && s.config.expansions.citiesKnights ? [...RES, ...COMMODITIES] : RES);

export function initCommodities(s) {
  for (const c of COMMODITIES) s.bank[c] = COMMODITY_BANK;
  for (const p of s.players) for (const c of COMMODITIES) p.res[c] = 0;
  s.eventDie = null;
}

// what a building on tile resource `res` produces: { card: amount }
export function cityYield(res, amt) {
  const c = COMMODITY_OF[res];
  return c ? { [res]: amt, [c]: amt } : { [res]: 2 * amt };
}
