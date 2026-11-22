// Main menu as a game table: a light wooden table with a game in progress around the edges (board
// corners, pieces, dice, coins, cards) and the menu choices laid on it as big playing cards.
// Pure drawing helpers: the menu logic stays in main.js.
import { h } from './dom.js';
import { t } from '../i18n.js';

// ---------- the props around the table (SVG strings) ----------
const TILE = { wood: '#3d8b37', brick: '#c7672c', sheep: '#8cc63f', wheat: '#e8c547', ore: '#9aa0ad', desert: '#e3c98f', sea: '#3b7dd8' };
const INK = '#1a1c2c', SHADOW = 'rgba(40,20,8,.35)';
const R = 46, W = R * Math.sqrt(3);
const hexAt = (q, r) => ({ x: W * (q + r / 2), y: R * 1.5 * r });
const corner = (x, y, i) => { const a = (Math.PI / 180) * (60 * i - 30); return [x + R * Math.cos(a), y + R * Math.sin(a)]; };
const hexPts = (x, y, k = 0.97) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return `${(x + R * k * Math.cos(a)).toFixed(1)},${(y + R * k * Math.sin(a)).toFixed(1)}`;
}).join(' ');

const token = (x, y, n) => `<circle cx="${x}" cy="${y}" r="15" fill="#f6ead0" stroke="${INK}" stroke-width="2.5"/>`
  + `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="16" font-weight="700" font-family="monospace" fill="${n === 6 || n === 8 ? '#b13e53' : '#2a1d14'}">${n}</text>`;
const road = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>`
  + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
const piece = (d, x, y, c) => `<g transform="translate(${x},${y})"><path d="${d}" fill="${SHADOW}" transform="translate(3,4)"/><path d="${d}" fill="${c}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
const house = (x, y, c) => piece('M-10,9 L-10,-2 L0,-12 L10,-2 L10,9 Z', x, y, c);
const city = (x, y, c) => piece('M-14,10 L-14,-2 L-7,-9 L0,-2 L0,-12 L7,-19 L14,-12 L14,10 Z', x, y, c);
const robber = (x, y) => `<g transform="translate(${x},${y})"><ellipse cx="0" cy="12" rx="10" ry="4" fill="${SHADOW}"/>`
  + `<path d="M-7,12 L-5,-4 Q0,-16 5,-4 L7,12 Z" fill="#3a3a44" stroke="${INK}" stroke-width="2.5"/><circle cx="0" cy="-10" r="6" fill="#3a3a44" stroke="${INK}" stroke-width="2.5"/></g>`;
const die = (x, y, rot, pips, c = '#fbf1dc') => `<g transform="translate(${x},${y}) rotate(${rot})">`
  + `<rect x="-15" y="-15" width="30" height="30" rx="5" fill="${SHADOW}" transform="translate(3,4)"/><rect x="-15" y="-15" width="30" height="30" rx="5" fill="${c}" stroke="${INK}" stroke-width="2.5"/>`
  + pips.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3" fill="${c === '#fbf1dc' ? INK : '#fff'}"/>`).join('') + '</g>';
const coin = (x, y) => `<circle cx="${x + 2}" cy="${y + 3}" r="11" fill="${SHADOW}"/><circle cx="${x}" cy="${y}" r="11" fill="#e8c547" stroke="#8a5a1c" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#8a5a1c" stroke-width="2"/>`;
const card = (x, y, rot, res) => `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="-20" y="-28" width="40" height="56" rx="3" fill="${SHADOW}" transform="translate(3,4)"/>`
  + `<rect x="-20" y="-28" width="40" height="56" rx="3" fill="${res ? '#fbf1dc' : '#29366f'}" stroke="${INK}" stroke-width="2.5"/>`
  + (res ? `<rect x="-14" y="-20" width="28" height="30" fill="${TILE[res]}" stroke="${INK}" stroke-width="2"/><rect x="-14" y="14" width="28" height="6" fill="${TILE[res]}" opacity=".5"/>`
    : `<polygon points="0,-14 12,-7 12,7 0,14 -12,7 -12,-7" fill="#e8c547" stroke="${INK}" stroke-width="2"/>`) + '</g>';
function board(cells, extra) {
  let out = '';
  for (const [q, r, k] of cells) {
    const { x, y } = hexAt(q, r);
    out += `<polygon points="${hexPts(x + 4, y + 6)}" fill="${SHADOW}"/><polygon points="${hexPts(x, y)}" fill="${TILE[k]}" stroke="${INK}" stroke-width="3"/>`;
  }
  for (const [q, r, , n] of cells) if (n) { const { x, y } = hexAt(q, r); out += token(x, y, n); }
  return out + extra;
}
const svg = (cls, viewBox, body) => `<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;

// the game in progress around the edges; the middle of the table stays clear for the menu
export function tableDecor() {
  const a = hexAt(1, 1), b = hexAt(2, 1);
  const tl = board([[0, 0, 'sea'], [1, 0, 'wood', 9], [2, 0, 'sea'], [0, 1, 'wheat', 6], [1, 1, 'ore', 4], [2, 1, 'sheep', 10], [-1, 2, 'sea'], [0, 2, 'brick', 8], [1, 2, 'sea']],
    road(...corner(a.x, a.y, 1), ...corner(a.x, a.y, 2), '#e53935') + house(...corner(a.x, a.y, 1), '#e53935') + city(...corner(b.x, b.y, 4), '#1e88e5'));
  const br = board([[1, 0, 'sea'], [2, 0, 'sheep', 5], [0, 1, 'wood', 11], [1, 1, 'desert'], [2, 1, 'brick', 3], [0, 2, 'sea'], [1, 2, 'wheat', 8], [2, 2, 'sea']],
    road(...corner(a.x, a.y, 4), ...corner(a.x, a.y, 5), '#1e88e5') + house(...corner(a.x, a.y, 5), '#1e88e5') + robber(a.x, a.y + 4) + house(...corner(b.x, b.y, 2), '#ff9800'));
  const left = road(20, 40, 60, 30, '#ff9800') + road(30, 62, 72, 60, '#ff9800') + road(18, 84, 56, 92, '#ff9800')
    + house(98, 46, '#ff9800') + house(124, 58, '#ff9800') + house(108, 82, '#ff9800')
    + die(70, 140, -12, [[-7, -7], [0, 0], [7, 7]]) + die(112, 150, 18, [[-7, -7], [7, -7], [-7, 7], [7, 7]], '#b13e53')
    + coin(170, 120) + coin(186, 140) + coin(162, 150);
  const right = card(150, 60, 14) + card(154, 64, 18) + card(158, 68, 22)
    + card(50, 150, -24, 'wood') + card(76, 140, -10, 'wheat') + card(102, 138, 4, 'brick') + card(128, 144, 18, 'ore')
    + city(60, 40, '#43a047') + house(96, 36, '#43a047');
  const box = h('div', { class: 'table-decor' });
  box.innerHTML = svg('d-board-tl', '-60 -60 360 330', tl) + svg('d-board-br', '20 -50 360 330', br)
    + svg('d-left', '0 0 230 190', left) + svg('d-right', '0 0 210 220', right);
  return box;
}

// ---------- the menu cards ----------
const hx = (x, y, f, r = 22) => `<polygon points="${x},${y - r} ${x + r * 0.87},${y - r / 2} ${x + r * 0.87},${y + r / 2} ${x},${y + r} ${x - r * 0.87},${y + r / 2} ${x - r * 0.87},${y - r / 2}" fill="${f}" stroke="${INK}" stroke-width="3"/>`;
const hut = (x, y, c) => `<path d="M${x - 9},${y + 7} L${x - 9},${y - 2} L${x},${y - 10} L${x + 9},${y - 2} L${x + 9},${y + 7} Z" fill="${c}" stroke="${INK}" stroke-width="2.5"/>`;
const ART = {
  local: `${hx(56, 50, TILE.wood)}${hx(94, 50, TILE.wheat)}${hx(75, 83, TILE.brick)}${hut(75, 64, '#e53935')}`
    + `<rect x="104" y="78" width="24" height="24" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="111" cy="85" r="2.5" fill="${INK}"/><circle cx="116" cy="90" r="2.5" fill="${INK}"/><circle cx="121" cy="95" r="2.5" fill="${INK}"/>`,
  online: `<path d="M40,40 L80,85 L122,40 Z" fill="none" stroke="#ffcd75" stroke-width="3" stroke-dasharray="6 5"/>`
    + `${hx(40, 40, TILE.sea, 18)}${hut(40, 40, '#e53935')}${hx(122, 40, TILE.sea, 18)}${hut(122, 40, '#1e88e5')}${hx(80, 85, TILE.sea, 18)}${hut(80, 85, '#ff9800')}`,
};

// a big playing card that is a button: coloured band, picture, title and one line
export function modeCard({ id, color, paper, band, corner: mark, title, text, tilt, onclick }) {
  const art = h('div', { class: 'mc-art', style: { background: paper } });
  art.innerHTML = `<svg viewBox="0 0 160 120" width="100%" height="100%" aria-hidden="true">${ART[id]}</svg>`;
  return h('button', { class: 'menu-card mode', 'data-testid': 'play-' + id, style: { '--c': color, '--r': tilt + 'deg' }, onclick },
    h('span', { class: 'mc-band' }, h('span', null, band), h('span', null, mark)),
    art,
    h('span', { class: 'mc-title' }, title),
    h('span', { class: 'mc-text' }, text));
}

// the eight faction colours shown on the kingdom card
export function colourSwatches(colours, current, onPick) {
  return h('div', { class: 'mc-swatches', role: 'radiogroup', 'aria-label': t('Color de tu reino') }, colours.map(c => h('button', {
    class: 'mc-sw' + (c.toLowerCase() === (current || '').toLowerCase() ? ' on' : ''), role: 'radio', 'aria-checked': String(c.toLowerCase() === (current || '').toLowerCase()),
    style: { '--c': c }, title: c, onclick: () => onPick(c),
  })));
}
