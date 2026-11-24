// Traders & Barbarians, Rivers of Catan: 3D bridge and bridge-spot markers, built from simple shapes.
// Both are laid out along the local x axis (the board edge, one hex side long: -0.5..0.5);
// board3d.js puts them on the edge midpoint and turns them along the edge.
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const mats = new Map();
function mat(color, rough = 0.8) {
  const k = color + rough;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true }));
  return mats.get(k);
}
const part = (g, geo, m, sx, sy, sz, x, y, z, rz = 0) => {
  const p = new THREE.Mesh(geo, m);
  p.scale.set(sx, sy, sz);
  p.position.set(x, y, z);
  p.rotation.z = rz;
  p.castShadow = p.receiveShadow = true;
  g.add(p);
  return p;
};

const SPAN = 0.42; // half length of the deck
const RISE = 0.1; // height of the arch at the middle
const arch = x => RISE * (1 - (x / SPAN) ** 2);

// A wooden arched bridge: stone footings, curved plank deck, rails in the owner's colour.
export function makeBridge(color) {
  const g = new THREE.Group();
  const plank = mat('#9a6a3e'), dark = mat('#5b3e2b'), stone = mat('#9c9a92', 0.95), rail = mat(color, 0.6);
  for (const s of [-1, 1]) part(g, BOX, stone, 0.12, 0.09, 0.22, s * (SPAN - 0.02), 0.02, 0);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -SPAN + (i + 0.5) * ((2 * SPAN) / n);
    const slope = Math.atan(-2 * RISE * x / (SPAN * SPAN));
    part(g, BOX, i % 2 ? plank : dark, (2 * SPAN) / n + 0.006, 0.025, 0.2, x, 0.06 + arch(x), 0, slope);
  }
  // rails: posts and a coloured handrail on both sides
  for (const z of [-0.095, 0.095]) {
    for (const x of [-0.36, -0.12, 0.12, 0.36]) part(g, CYL, dark, 0.012, 0.09, 0.012, x, 0.1 + arch(x) + 0.03, z);
    const m = 6;
    for (let i = 0; i < m; i++) {
      const x0 = -0.36 + (i * 0.72) / m, x1 = x0 + 0.72 / m, xm = (x0 + x1) / 2;
      part(g, BOX, rail, 0.72 / m + 0.004, 0.022, 0.022, xm, 0.13 + arch(xm) + 0.03, z, Math.atan((arch(x1) - arch(x0)) / (x1 - x0)));
    }
  }
  return g;
}

// A free bridge spot: a short wooden post on each bank (heights ya / yb of the ground there).
export function makeBridgeSpot(ya = 0.25, yb = 0.25) {
  const g = new THREE.Group();
  const wood = mat('#7a5232'), tip = mat('#ffcd75', 0.5);
  for (const [x, y] of [[-0.24, ya], [0.24, yb]]) {
    part(g, CYL, wood, 0.022, 0.16, 0.022, x, y + 0.06, 0);
    part(g, CYL, tip, 0.026, 0.025, 0.026, x, y + 0.15, 0);
  }
  return g;
}
