// Traders & Barbarians, main scenario: 3D quarry, glassworks and wagon from simple shapes (the castle
// and the barbarian come from barbarianAttack3d.js). Everything sits on y = 0; board3d.js places them.
import * as THREE from 'three';
export { makeCastle, makeBarbarian } from './barbarianAttack3d.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const ROCK = new THREE.DodecahedronGeometry(1, 0);
const mats = new Map();
function mat(color, rough = 0.85) {
  const k = color + rough;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true }));
  return mats.get(k);
}
const part = (g, geo, m, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const p = new THREE.Mesh(geo, m);
  p.scale.set(sx, sy, sz);
  p.position.set(x, y, z);
  p.rotation.set(rx, ry, rz);
  p.castShadow = true;
  p.receiveShadow = true;
  g.add(p);
  return p;
};

// A quarry: grey rock faces with a cut marble block and a pick.
export function makeQuarry() {
  const g = new THREE.Group();
  const rock = mat('#8b8d93'), dark = mat('#6f7177'), marble = mat('#f2efe6', 0.4), wood = mat('#5b3e2b');
  part(g, ROCK, rock, 0.22, 0.18, 0.2, -0.08, 0.12, -0.06, 0.3, 0.4, 0);
  part(g, ROCK, dark, 0.16, 0.22, 0.15, 0.14, 0.15, -0.1, 0.1, 1.1, 0.2);
  part(g, ROCK, rock, 0.12, 0.1, 0.12, 0.2, 0.06, 0.12, 0, 0.7, 0);
  part(g, BOX, marble, 0.14, 0.09, 0.1, -0.05, 0.045, 0.16);
  part(g, CYL, wood, 0.008, 0.2, 0.008, 0.06, 0.1, 0.2, 0, 0, 0.5);
  part(g, BOX, mat('#8a8f99', 0.4), 0.09, 0.02, 0.02, 0.012, 0.19, 0.2, 0, 0, 0.5);
  return g;
}

// A glassworks: a timber workshop with a tall chimney and blue windows.
export function makeGlassworks() {
  const g = new THREE.Group();
  const wall = mat('#d9b48a'), roof = mat('#a0522d'), brick = mat('#9c8a7a'), glass = mat('#7fd3f0', 0.2);
  part(g, BOX, wall, 0.34, 0.2, 0.24, 0, 0.1, 0);
  const r = part(g, new THREE.ConeGeometry(1, 1, 4), roof, 0.27, 0.14, 0.2, 0, 0.27, 0, 0, Math.PI / 4, 0);
  r.scale.set(0.27, 0.14, 0.2);
  part(g, BOX, brick, 0.07, 0.42, 0.07, 0.12, 0.21, -0.06);
  for (const x of [-0.08, 0.02]) part(g, BOX, glass, 0.06, 0.06, 0.01, x, 0.11, 0.122);
  return g;
}

// A wagon: a cart in the owner's colour on two wheels with a shaft; `good` adds a crate on top.
export const GOOD_COLORS = { marble: '#f2efe6', glass: '#7fd3f0', tools: '#8a8f99', sand: '#e9c46a' };
export function makeWagon(color, good) {
  const g = new THREE.Group();
  const own = mat(color, 0.6), wood = mat('#6b4a2a');
  part(g, BOX, own, 0.2, 0.06, 0.11, 0, 0.07, 0);
  part(g, BOX, own, 0.2, 0.04, 0.01, 0, 0.11, 0.05);
  part(g, BOX, own, 0.2, 0.04, 0.01, 0, 0.11, -0.05);
  for (const x of [-0.06, 0.06]) for (const z of [-0.065, 0.065]) part(g, CYL, wood, 0.035, 0.015, 0.035, x, 0.035, z, Math.PI / 2, 0, 0);
  part(g, BOX, wood, 0.12, 0.012, 0.012, 0.15, 0.05, 0);
  if (good) part(g, BOX, mat(GOOD_COLORS[good] || '#bbbbbb', 0.5), 0.08, 0.07, 0.08, 0, 0.14, 0);
  return g;
}
