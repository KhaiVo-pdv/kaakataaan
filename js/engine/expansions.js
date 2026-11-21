// Expansion switches. Every expansion is OFF by default and lives in config.expansions.
// Golden rule: with every expansion off, the engine must behave exactly like the base game
// (same board, same RNG draws, same state), so expansion code only runs behind these checks.

import { DEFAULT_SCENARIO, scenarioOf } from './seafarers/scenarios.js';

// Only one expansion at a time for now: switching one on switches the others off.
// Each also proposes its own victory points (all off: back to the classic 10).
export const CK_VP = 13; // Cities & Knights plays to 13

// Expansions shown in the lobby. `get`/`set` work on a config, like MODES in config.js.
export const EXPANSIONS = [
  {
    id: 'seafarers', icon: '⛵', name: 'Navegantes',
    desc: 'Mar, islas y barcos: navega para descubrir nuevas tierras.',
    get: c => !!(c.expansions && c.expansions.seafarers),
    // switching it on also proposes the scenario's victory points (off: back to the classic 10)
    set: (c, v) => {
      const ex = normalizeExpansions(c);
      ex.seafarers = v;
      if (v) ex.citiesKnights = false;
      c.rules.vpTarget = v ? scenarioOf(ex.scenario).vp : 10;
    },
  },
  {
    id: 'citiesKnights', icon: '🏰', name: 'Ciudades y Caballeros',
    desc: 'Mercancías, mejoras de ciudad, caballeros, bárbaros y cartas de progreso. Se juega a 13 puntos. (En construcción)',
    get: c => !!(c.expansions && c.expansions.citiesKnights),
    set: (c, v) => {
      const ex = normalizeExpansions(c);
      ex.citiesKnights = v;
      if (v) ex.seafarers = false;
      c.rules.vpTarget = v ? CK_VP : 10;
    },
  },
];

// `scenario` is the Seafarers map (see seafarers/scenarios.js); it only matters when seafarers is on
export const defaultExpansions = () => ({ seafarers: false, citiesKnights: false, scenario: DEFAULT_SCENARIO });

// Fills in missing switches (old saves, old lobby configs, online hosts on an older version)
// and returns config.expansions.
export function normalizeExpansions(config) {
  config.expansions = { ...defaultExpansions(), ...(config.expansions || {}) };
  // one expansion at a time: a config with both on keeps Seafarers
  if (config.expansions.seafarers && config.expansions.citiesKnights) config.expansions.citiesKnights = false;
  return config.expansions;
}

// Accepts either a game state or a config.
const cfgOf = x => (x && x.config) || x || {};
export const seafarersOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.seafarers);
export const citiesKnightsOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.citiesKnights);
