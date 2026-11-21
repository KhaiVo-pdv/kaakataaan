// The PDV mascot (Khai Vo's mark): a little hexagon tile with a sprout. Drawn as SVG so it stays
// sharp at any size; used next to the title in the main menu (the tab icon is icons/favicon.ico).
export function mascotSvg(cls = 'mascot') {
  const box = document.createElement('span');
  box.className = cls;
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<svg viewBox="-60 -84 120 150" width="100%" height="100%">
    <polygon points="0,-58 50,-29 50,29 0,58 -50,29 -50,-29" fill="#3fae5a" stroke="#1a1a22" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="0,-46 40,-23 40,23 0,46 -40,23 -40,-23" fill="#5fd47a"/>
    <path d="M0,-58 C-2,-73 -13,-79 -21,-75 C-13,-67 -7,-63 0,-58 Z" fill="#3fae5a" stroke="#1a1a22" stroke-width="3"/>
    <path d="M0,-58 C3,-77 17,-83 25,-77 C15,-69 8,-63 0,-58 Z" fill="#6b3fa0" stroke="#1a1a22" stroke-width="3"/>
    <g class="mascot-eyes">
      <ellipse cx="-16" cy="-6" rx="10" ry="13" fill="#fff"/><ellipse cx="16" cy="-6" rx="10" ry="13" fill="#fff"/>
      <circle cx="-14" cy="-3" r="6.5" fill="#1a1a22"/><circle cx="18" cy="-3" r="6.5" fill="#1a1a22"/>
      <circle cx="-12" cy="-6" r="2" fill="#fff"/><circle cx="20" cy="-6" r="2" fill="#fff"/>
    </g>
    <ellipse cx="-29" cy="13" rx="7" ry="4.5" fill="#9a6ad0"/><ellipse cx="29" cy="13" rx="7" ry="4.5" fill="#9a6ad0"/>
    <path d="M-10,17 Q0,27 10,17" fill="none" stroke="#1a1a22" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return box;
}
