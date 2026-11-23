// Kingdom piece styles: how a player's settlements and cities look on the 3D board.
// Purely cosmetic: chosen in the kingdom editor, saved with name / colour / flag,
// copied into the game state (player.style) and sent to everyone when playing online.
// This file only holds the list; the 3D builders live with the board renderer.
//   'classic' the original Blender models (assets/models/kit.glb), the default
//   'dinh'    Vietnamese village hall: red tiled roof with curved corners, wooden pillars
//   'castle'  grey stone walls, pointed roofs, towers and battlements
//   'eastern' whitewashed walls, curved roofs (two tiers on cities)
//   'viking'  dark wooden longhouse, steep roof with carved horns
export const PIECE_STYLES = ['classic', 'dinh', 'castle', 'eastern', 'viking'];
export const DEFAULT_STYLE = 'classic';

// anything unknown (old saves, older clients, bad input) falls back to the classic look
export const validStyle = s => (PIECE_STYLES.includes(s) ? s : DEFAULT_STYLE);

// bots without a style get a random one when a game starts, so the board shows a mix of styles
// (cosmetic only: Math.random, not the game's seeded rng). A style set in the lobby is kept.
export function giveBotsStyles(players) {
  for (const p of players) if (p.kind === 'bot' && !PIECE_STYLES.includes(p.style)) p.style = PIECE_STYLES[Math.floor(Math.random() * PIECE_STYLES.length)];
}

// small SVG picture of each style's house for the picker (roof in the player's colour);
// a 2D sketch, so the picker does not need to load the 3D engine
const INK = '#1a1c2c';
const ICONS = {
  classic: c => `<rect x="12" y="26" width="26" height="20" fill="#c9c0ae"/><polygon points="8,28 25,12 42,28" fill="${c}"/><rect x="21" y="34" width="8" height="12" fill="#5b3e2b"/>`,
  dinh: c => `<rect x="6" y="42" width="38" height="5" fill="#6a717c"/><rect x="13" y="32" width="24" height="10" fill="#e7d3a8"/><path d="M3 34 L9 22 L41 22 L47 34 Q40 29 25 30 Q10 29 3 34 Z" fill="${c}"/><path d="M3 34 l-2 -6 M47 34 l2 -6" stroke="${c}" stroke-width="3"/><circle cx="25" cy="19" r="2.5" fill="#ffcd75"/>`,
  castle: c => `<rect x="15" y="22" width="20" height="24" fill="#9aa3ad"/><rect x="13" y="44" width="24" height="3" fill="#6a717c"/><polygon points="11,23 25,6 39,23" fill="${c}"/><rect x="22" y="30" width="6" height="8" fill="#2b3040"/>`,
  eastern: c => `<rect x="10" y="44" width="30" height="3" fill="#6a717c"/><rect x="15" y="32" width="20" height="12" fill="#f1e4c8"/><path d="M5 33 Q12 30 15 25 L35 25 Q38 30 45 33 Z" fill="${c}"/><rect x="20" y="18" width="10" height="7" fill="#f1e4c8"/><path d="M12 19 Q17 17 19 13 L31 13 Q33 17 38 19 Z" fill="${c}"/><rect x="24" y="5" width="2" height="8" fill="#ffcd75"/>`,
  viking: c => `<rect x="6" y="44" width="38" height="3" fill="#6a717c"/><rect x="8" y="34" width="34" height="10" fill="#6b4426"/><polygon points="4,35 25,14 46,35" fill="${c}"/><path d="M25 14 l-5 -8 M25 14 l5 -8" stroke="#3f2716" stroke-width="3"/>`,
};
export function styleIcon(style, color) {
  const draw = ICONS[validStyle(style)];
  return `<svg viewBox="0 0 50 50" width="50" height="50" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">${draw(color)}</svg>`;
}
