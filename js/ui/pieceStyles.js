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
// the same for each style's city
const CITY_ICONS = {
  classic: c => `<rect x="6" y="28" width="28" height="18" fill="#c9c0ae"/><polygon points="3,30 20,14 37,30" fill="${c}"/><rect x="30" y="18" width="14" height="28" fill="#c9c0ae"/><polygon points="28,20 37,8 46,20" fill="${c}"/><rect x="16" y="36" width="7" height="10" fill="#5b3e2b"/>`,
  dinh: c => `<rect x="2" y="43" width="46" height="4" fill="#6a717c"/><rect x="7" y="34" width="36" height="9" fill="#e7d3a8"/><path d="M0 36 L6 26 L44 26 L50 36 Q38 31 25 32 Q12 31 0 36 Z" fill="${c}"/><rect x="17" y="20" width="16" height="6" fill="#e7d3a8"/><path d="M8 22 L13 14 L37 14 L42 22 Q33 18 25 19 Q17 18 8 22 Z" fill="${c}"/><circle cx="25" cy="11" r="2.5" fill="#ffcd75"/>`,
  castle: c => `<rect x="10" y="26" width="30" height="20" fill="#9aa3ad"/><path d="M10 26 v-4 h4 v4 h4 v-4 h4 v4 h6 v-4 h4 v4 h4 v-4 h4 v4" fill="#9aa3ad"/><rect x="2" y="16" width="9" height="30" fill="#9aa3ad"/><polygon points="0,17 6.5,5 13,17" fill="${c}"/><rect x="39" y="16" width="9" height="30" fill="#9aa3ad"/><polygon points="37,17 43.5,5 50,17" fill="${c}"/><path d="M21 46 v-8 a4 4 0 0 1 8 0 v8 Z" fill="#2b3040"/>`,
  eastern: c => `<rect x="8" y="44" width="34" height="3" fill="#6a717c"/><rect x="14" y="36" width="22" height="8" fill="#f1e4c8"/><path d="M4 37 Q11 34 14 30 L36 30 Q39 34 46 37 Z" fill="${c}"/><rect x="18" y="24" width="14" height="6" fill="#f1e4c8"/><path d="M9 25 Q15 22 17 19 L33 19 Q35 22 41 25 Z" fill="${c}"/><rect x="21" y="14" width="8" height="5" fill="#f1e4c8"/><path d="M14 15 Q19 13 20 10 L30 10 Q31 13 36 15 Z" fill="${c}"/><rect x="24" y="3" width="2" height="7" fill="#ffcd75"/>`,
  viking: c => `<rect x="1" y="44" width="48" height="3" fill="#6a717c"/><rect x="3" y="32" width="44" height="12" fill="#6b4426"/><polygon points="0,33 25,10 50,33" fill="${c}"/><path d="M25 10 l-5 -8 M25 10 l5 -8" stroke="#3f2716" stroke-width="3"/><circle cx="14" cy="38" r="4" fill="${c}"/><circle cx="25" cy="38" r="4" fill="${c}"/><circle cx="36" cy="38" r="4" fill="${c}"/>`,
};
// type: 'house' (default) or 'city'
export function styleIcon(style, color, type = 'house') {
  const draw = (type === 'city' ? CITY_ICONS : ICONS)[validStyle(style)];
  return `<svg viewBox="0 0 50 50" width="44" height="44" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">${draw(color)}</svg>`;
}
