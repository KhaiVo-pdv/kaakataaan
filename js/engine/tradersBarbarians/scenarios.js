// Traders & Barbarians: the box is a set of separate scenarios played on the normal base maps.
// Only one is played at a time (config.expansions.tbScenario). Scenarios with `ready: false`
// are listed in the lobby as "coming soon" and can't be picked yet.

export const TB_SCENARIOS = {
  fishermen: {
    icon: '🐟', name: 'Los pescadores de Catán', vp: 10, players: [3, 4], ready: true,
    desc: 'Un lago sustituye al desierto y seis caladeros rodean la isla. Pesca fichas de pescado y gástalas en ventajas. ¡Cuidado con la bota vieja!',
  },
  rivers: {
    icon: '🏞️', name: 'Los ríos de Catán', vp: 10, players: [3, 4], ready: true,
    desc: 'Dos ríos cruzan la isla: puentes, monedas de oro y el título de colono más rico.',
  },
  caravans: {
    icon: '🐪', name: 'Las caravanas', vp: 10, players: [3, 4], ready: false,
    desc: 'Los jugadores votan con lana y trigo dónde avanzan las caravanas de camellos.',
  },
  barbarianAttack: {
    icon: '⚔️', name: 'El ataque de los bárbaros', vp: 12, players: [3, 4], ready: false,
    desc: 'Los bárbaros desembarcan en la costa y conquistan casillas. Defiéndete con caballeros.',
  },
  tradersBarbarians: {
    icon: '🛒', name: 'Mercaderes y bárbaros', vp: 13, players: [3, 4], ready: false,
    desc: 'Lleva mercancías en carromato entre castillos, cantera y vidriería mientras los bárbaros acechan.',
  },
};

export const DEFAULT_TB_SCENARIO = 'fishermen';
// unknown or not-yet-playable ids fall back to the default scenario
export const tbScenarioOf = id => (TB_SCENARIOS[id] && TB_SCENARIOS[id].ready ? TB_SCENARIOS[id] : TB_SCENARIOS[DEFAULT_TB_SCENARIO]);
export const tbScenarioId = id => (TB_SCENARIOS[id] && TB_SCENARIOS[id].ready ? id : DEFAULT_TB_SCENARIO);
