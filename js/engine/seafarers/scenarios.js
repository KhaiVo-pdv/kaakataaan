// Seafarers scenarios: hand-drawn maps plus the scenario's own numbers (victory points,
// island bonus...). Only used when config.expansions.seafarers is on.
//
// Layout legend (one character per hex, "odd-r" rows: odd rows sit half a hex to the right):
//   .  sea                      P  sea where the pirate starts
//   L  home land, random res    l  foreign land (other islands), random res
//   W B S H O  home wood / brick / sheep / wheat / ore   (lowercase w b s h o = foreign)
//   D  home desert              d  foreign desert
//   G  home gold                g  foreign gold
//   ?  fog: hidden hex drawn from the scenario's fogPool (land, gold or sea)
//   (space) nothing: the engine adds one ring of sea around the whole map anyway
// "Home" land is where the initial settlements may go (rule added in a later step);
// settling a foreign island for the first time earns `islandBonus` points.
import { shuffle } from '../rng.js';

export const SCENARIOS = {
  newShores: {
    icon: '🏝️', name: 'Rumbo a nuevas costas',
    desc: 'Una isla grande para empezar y varias islas pequeñas por descubrir. Primer poblado en cada isla nueva: +2 puntos.',
    players: [3, 4], vp: 14, islandBonus: 2,
    layout: [
      '...........',
      '...........',
      '..LLL....g.',
      '.LLLL...ho.',
      '.LLDLL.....',
      '.LLLL...sb.',
      '..LLL.P....',
      '........wg.',
      '..lh.....l.',
      '...........',
    ],
  },
  fourIslands: {
    icon: '🗺️', name: 'Las cuatro islas',
    desc: 'Cuatro islas medianas: empieza en una o dos y conquista las demás. Primer poblado en una isla donde no empezaste: +1 punto.',
    players: [3, 4], vp: 13, islandBonus: 1, homeAny: true,
    layout: [
      '.............',
      '..LLL...LLL..',
      '.LLDL...LLLL.',
      '..LL.....LL..',
      '......P......',
      '..LLL...LLL..',
      '.LLLL...LDLL.',
      '..LL.....LL..',
      '.............',
    ],
  },
  desert: {
    icon: '🐫', name: 'A través del desierto',
    desc: 'Un desierto parte el continente en dos. Las tierras del otro lado y las islas cuentan como nuevas: +2 puntos.',
    players: [3, 4], vp: 14, islandBonus: 2, desertSplits: true,
    layout: [
      '...............',
      '..LLLLDsso.....',
      '.LLLLLDwhb..g..',
      '..LLLLDlll.....',
      '.LLLLLDhob..l..',
      '..LLLLD...P....',
      '...............',
      '...lll....ll...',
      '...............',
    ],
  },
  fogIslands: {
    icon: '🌫️', name: 'Islas de la niebla',
    desc: 'Dos islas de partida y, entre ellas, un mar cubierto de niebla. Navega para descubrir qué esconde.',
    players: [3, 4], vp: 12, islandBonus: 0,
    fogPool: { land: 7, gold: 2, sea: 6 },
    layout: [
      '.............',
      '..LL.???.LL..',
      '.LLD.???.DLL.',
      '..LL.???.LL..',
      '.LLL.???.LLL.',
      '..LL.???.LL..',
      '.....P.......',
      '.............',
    ],
  },
};

export const DEFAULT_SCENARIO = 'newShores';
export const scenarioOf = id => SCENARIOS[id] || SCENARIOS[DEFAULT_SCENARIO];

const FIXED = { w: 'wood', b: 'brick', s: 'sheep', h: 'wheat', o: 'ore', d: 'desert', g: 'gold' };

// Turns a scenario layout into tiles. Land comes in the same shape as a custom map
// ({ q, r, res } with res 'random' for random land) plus `home` / `fog` flags;
// sea hexes come apart. Uses the game RNG only to resolve fog hexes.
export function buildScenario(id, rng) {
  const sc = scenarioOf(id);
  const rows = sc.layout;
  const r0 = Math.floor(rows.length / 2);
  const q0 = Math.floor(Math.max(...rows.map(x => x.length)) / 2) - Math.floor(r0 / 2);
  // fog stack: what each "?" turns out to be
  const fog = [];
  const pool = sc.fogPool || {};
  for (const [kind, n] of Object.entries(pool)) for (let i = 0; i < n; i++) fog.push(kind);
  shuffle(rng, fog);
  const land = [], sea = [];
  rows.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === ' ') return;
      const q = col - Math.floor(row / 2) - q0, r = row - r0; // odd-r offset -> axial, centred
      if (ch === '.' || ch === 'P') return sea.push({ q, r, pirate: ch === 'P' });
      if (ch === '?') {
        const kind = fog.pop() || 'sea';
        if (kind === 'sea') sea.push({ q, r, fog: true });
        else land.push({ q, r, res: kind === 'gold' ? 'gold' : 'random', home: false, fog: true });
        return;
      }
      const low = ch.toLowerCase();
      const home = ch !== low || !!sc.homeAny;
      land.push({ q, r, res: low === 'l' ? 'random' : FIXED[low], home, fog: false });
    });
  });
  return { sc, land, sea };
}
