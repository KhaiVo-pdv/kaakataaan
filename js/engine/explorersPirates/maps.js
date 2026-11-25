// Explorers & Pirates maps (Claude's own designs, balanced by bot games — not the boxed maps).
// Only used when config.expansions.explorersPirates is on.
//
// Layout legend (one character per hex, "odd-r" rows like the Seafarers layouts):
//   .            open sea
//   W B S H O D  starting island: wood / brick / sheep / wheat / ore / desert (fixed)
//   1 / 2        a face-down slot of the north / south unexplored area, filled from that
//                area's shuffled stack (land or sea); land also draws from the area's number stack
import { shuffle } from '../rng.js';
import { layoutToAxial } from '../seafarers/scenarios.js';

export const EP_MAPS = {
  landHo: {
    layout: [
      '.............',
      '..WS....111..',
      '.HOBW...1111.',
      '..SDWH...111.',
      '.BHOS........',
      '.........222.',
      '........2222.',
      '.........222.',
      '.............',
    ],
    // reading order over the starting island's non-desert hexes (no 6/8 neighbours)
    startNums: [9, 4, 10, 5, 8, 3, 11, 6, 9, 3, 12, 5, 10],
    areas: {
      north: {
        slot: '1',
        tiles: ['wood', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'wheat', 'ore', 'sea', 'sea'],
        nums: [3, 4, 5, 6, 8, 9, 10, 11],
      },
      south: {
        slot: '2',
        tiles: ['wood', 'brick', 'brick', 'sheep', 'wheat', 'wheat', 'ore', 'ore', 'sea', 'sea'],
        nums: [2, 4, 5, 6, 8, 9, 10, 12],
      },
    },
  },
};

const FIXED = { W: 'wood', B: 'brick', S: 'sheep', H: 'wheat', O: 'ore', D: 'desert' };

// Turns a map into tiles: land { q, r, res, num, area, fog } and sea { q, r, fog, area }
// (area null for open sea). RNG draws: per area (north, then south) its contents, then its numbers.
export function buildEpMap(id, rng) {
  const map = EP_MAPS[id] || EP_MAPS.landHo;
  const toAxial = layoutToAxial(map.layout);
  const stacks = {};
  for (const [area, a] of Object.entries(map.areas))
    stacks[a.slot] = { area, tiles: shuffle(rng, [...a.tiles]), nums: shuffle(rng, [...a.nums]) };
  const startNums = [...map.startNums];
  const land = [], sea = [];
  map.layout.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === ' ') return;
      const { q, r } = toAxial(row, col);
      if (ch === '.') return sea.push({ q, r, fog: false, area: null });
      if (FIXED[ch]) {
        const res = FIXED[ch];
        return land.push({ q, r, res, num: res === 'desert' ? null : startNums.shift(), area: 'start', fog: false });
      }
      const st = stacks[ch];
      const kind = st.tiles.shift();
      if (kind === 'sea') sea.push({ q, r, fog: true, area: st.area });
      else land.push({ q, r, res: kind, num: st.nums.shift(), area: st.area, fog: true });
    });
  });
  return { land, sea };
}
