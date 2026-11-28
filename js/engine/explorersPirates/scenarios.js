// Explorers & Pirates: five scenarios played one at a time (config.expansions.epScenario).
// Each adds a mission and its rules on top of the previous one. Scenarios with
// `ready: false` are listed in the lobby as "coming soon" and can't be picked yet.

export const EP_SCENARIOS = {
  landHo: {
    icon: '🧭', name: '¡Tierra a la vista!', vp: 8, players: [2, 4], ready: true, startGold: 0,
    desc: 'Explora el mar con tus barcos, descubre dos tierras nuevas y lleva colonos para fundar poblados. Se juega a 8 puntos.',
  },
  pirateLairs: {
    icon: '🏴‍☠️', name: 'Guaridas piratas', vp: 12, players: [2, 4], ready: true,
    startGold: 2, crews: true, lairs: true, // crews: crews + pirate ship (basic rules part 2); lairs: the Pirate Lairs mission
    desc: 'Descubre los campos de oro, construye tripulaciones y llévalas en barco para conquistar las guaridas piratas. Se juega a 12 puntos.',
  },
  fishForCatan: {
    icon: '🐟', name: 'Pescado para Catán', vp: 15, players: [2, 4], ready: false,
    desc: 'Pesca en los bancos de peces y lleva el pescado al consejo de Catán.',
  },
  spicesForCatan: {
    icon: '🌶️', name: 'Especias para Catán', vp: 15, players: [2, 4], ready: false,
    desc: 'Haz amistad con las aldeas de las islas de las especias y lleva sus sacos al consejo.',
  },
  explorersPirates: {
    icon: '⚓', name: 'Exploradores y piratas', vp: 17, players: [2, 4], ready: false,
    desc: 'Todas las misiones a la vez: tierras nuevas, guaridas piratas, pescado y especias.',
  },
};

export const DEFAULT_EP_SCENARIO = 'landHo';
// unknown or not-yet-playable ids fall back to the default scenario
export const epScenarioId = id => (EP_SCENARIOS[id] && EP_SCENARIOS[id].ready ? id : DEFAULT_EP_SCENARIO);
export const epScenarioOf = id => EP_SCENARIOS[epScenarioId(id)];

// true when an Explorers & Pirates game's scenario has the given flag (startGold, crews, lairs...)
export const epFlag = (s, name) => !!(s && s.explorers && EP_SCENARIOS[s.explorers.scenario] && EP_SCENARIOS[s.explorers.scenario][name]);
