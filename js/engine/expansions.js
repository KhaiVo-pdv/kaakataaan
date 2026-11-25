// Expansion switches. Every expansion is OFF by default and lives in config.expansions.
// Golden rule: with every expansion off, the engine must behave exactly like the base game
// (same board, same RNG draws, same state), so expansion code only runs behind these checks.

import { DEFAULT_SCENARIO, scenarioOf } from './seafarers/scenarios.js';
import { DEFAULT_TB_SCENARIO, tbScenarioOf, tbScenarioId } from './tradersBarbarians/scenarios.js';
import { DEFAULT_EP_SCENARIO, epScenarioOf, epScenarioId } from './explorersPirates/scenarios.js';

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
      if (v) ex.citiesKnights = ex.tradersBarbarians = ex.explorersPirates = false;
      c.rules.vpTarget = v ? scenarioOf(ex.scenario).vp : 10;
    },
  },
  {
    id: 'citiesKnights', icon: '🏰', name: 'Ciudades y Caballeros',
    desc: 'Mercancías, mejoras de ciudad, caballeros, bárbaros y cartas de progreso. Se juega a 13 puntos.',
    get: c => !!(c.expansions && c.expansions.citiesKnights),
    set: (c, v) => {
      const ex = normalizeExpansions(c);
      ex.citiesKnights = v;
      if (v) ex.seafarers = ex.tradersBarbarians = ex.explorersPirates = false;
      c.rules.vpTarget = v ? CK_VP : 10;
    },
  },
  {
    id: 'tradersBarbarians', icon: '🐟', name: 'Mercaderes y Bárbaros',
    desc: 'Escenarios sobre el mapa normal: pescadores, ríos, caravanas, ataque bárbaro y mercaderes. Se juega uno cada vez.',
    get: c => !!(c.expansions && c.expansions.tradersBarbarians),
    // switching it on also proposes the chosen scenario's victory points
    set: (c, v) => {
      const ex = normalizeExpansions(c);
      ex.tradersBarbarians = v;
      if (v) ex.seafarers = ex.citiesKnights = ex.explorersPirates = false;
      c.rules.vpTarget = v ? tbScenarioOf(ex.tbScenario).vp : 10;
    },
  },
  {
    id: 'explorersPirates', icon: '🧭', name: 'Exploradores y Piratas',
    desc: 'Barcos que transportan colonos, tierras por descubrir, piratas y misiones. Cinco escenarios que se juegan uno a uno.',
    get: c => !!(c.expansions && c.expansions.explorersPirates),
    // switching it on also proposes the chosen scenario's victory points
    set: (c, v) => {
      const ex = normalizeExpansions(c);
      ex.explorersPirates = v;
      if (v) ex.seafarers = ex.citiesKnights = ex.tradersBarbarians = false;
      c.rules.vpTarget = v ? epScenarioOf(ex.epScenario).vp : 10;
    },
  },
];

// `scenario` is the Seafarers map (see seafarers/scenarios.js); it only matters when seafarers is on.
// `tbScenario` is the Traders & Barbarians scenario (see tradersBarbarians/scenarios.js).
// `epScenario` is the Explorers & Pirates scenario (see explorersPirates/scenarios.js).
export const defaultExpansions = () => ({ seafarers: false, citiesKnights: false, tradersBarbarians: false, scenario: DEFAULT_SCENARIO, tbScenario: DEFAULT_TB_SCENARIO, explorersPirates: false, epScenario: DEFAULT_EP_SCENARIO });

// Fills in missing switches (old saves, old lobby configs, online hosts on an older version)
// and returns config.expansions.
export function normalizeExpansions(config) {
  config.expansions = { ...defaultExpansions(), ...(config.expansions || {}) };
  const ex = config.expansions;
  // one expansion at a time: Seafarers wins, then Cities & Knights, Traders & Barbarians, Explorers & Pirates
  if (ex.seafarers) ex.citiesKnights = ex.tradersBarbarians = false;
  else if (ex.citiesKnights) ex.tradersBarbarians = false;
  if (ex.seafarers || ex.citiesKnights || ex.tradersBarbarians) ex.explorersPirates = false;
  ex.tbScenario = tbScenarioId(ex.tbScenario); // scenarios not playable yet fall back to the default
  ex.epScenario = epScenarioId(ex.epScenario);
  return ex;
}

// Accepts either a game state or a config.
const cfgOf = x => (x && x.config) || x || {};
export const seafarersOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.seafarers);
export const citiesKnightsOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.citiesKnights);
export const tradersBarbariansOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.tradersBarbarians);
// the Traders & Barbarians scenario id being played ('' when the expansion is off)
export const tbScenarioOn = x => (tradersBarbariansOn(x) ? tbScenarioId(cfgOf(x).expansions.tbScenario) : '');
export const explorersPiratesOn = x => !!(cfgOf(x).expansions && cfgOf(x).expansions.explorersPirates);
// the Explorers & Pirates scenario id being played ('' when the expansion is off)
export const epScenarioOn = x => (explorersPiratesOn(x) ? epScenarioId(cfgOf(x).expansions.epScenario) : '');
