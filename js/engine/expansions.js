// Expansion switches. Every expansion is OFF by default and lives in config.expansions.
// Golden rule: with every expansion off, the engine must behave exactly like the base game
// (same board, same RNG draws, same state), so expansion code only runs behind these checks.

import { DEFAULT_SCENARIO, scenarioOf } from './seafarers/scenarios.js';

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
      c.rules.vpTarget = v ? scenarioOf(ex.scenario).vp : 10;
    },
  },
];

// `scenario` is the Seafarers map (see seafarers/scenarios.js); it only matters when seafarers is on
export const defaultExpansions = () => ({ seafarers: false, scenario: DEFAULT_SCENARIO });

// Fills in missing switches (old saves, old lobby configs, online hosts on an older version)
// and returns config.expansions.
export function normalizeExpansions(config) {
  config.expansions = { ...defaultExpansions(), ...(config.expansions || {}) };
  return config.expansions;
}

// Accepts either a game state or a config.
const cfgOf = x => (x && x.config) || x || {};
export const seafarersOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.seafarers);
