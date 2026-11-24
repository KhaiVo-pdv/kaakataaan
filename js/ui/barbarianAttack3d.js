// Traders & Barbarians, Barbarian Attack: 3D castle, barbarian and knight, built from simple shapes.
// Everything sits on y = 0 (the ground); board3d.js places them.
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const BALL = new THREE.SphereGeometry(1, 10, 8);
const CONE = new THREE.ConeGeometry(1, 1, 8);
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

// A stone keep with four round towers, merlons and a red banner (about one hex across).
export function makeCastle() {
  const g = new THREE.Group();
  const stone = mat('#a7aab3'), light = mat('#c4c7ce'), roof = mat('#6b4a3a'), flag = mat('#c0392b', 0.6), door = mat('#4a3424');
  part(g, BOX, stone, 0.42, 0.22, 0.42, 0, 0.11, 0); // walls
  for (let i = 0; i < 12; i++) { // merlons along the walls
    const side = Math.floor(i / 3), k = (i % 3) - 1;
    const [x, z] = [[k * 0.14, -0.2], [0.2, k * 0.14], [k * 0.14, 0.2], [-0.2, k * 0.14]][side];
    part(g, BOX, light, 0.05, 0.05, 0.05, x, 0.245, z);
  }
  for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) {
    part(g, CYL, light, 0.07, 0.32, 0.07, x, 0.16, z);
    part(g, CONE, roof, 0.085, 0.12, 0.085, x, 0.38, z);
  }
  part(g, BOX, stone, 0.18, 0.18, 0.18, 0, 0.31, 0); // keep
  part(g, CONE, roof, 0.15, 0.14, 0.15, 0, 0.47, 0, 0, Math.PI / 4, 0);
  part(g, BOX, door, 0.09, 0.12, 0.02, 0, 0.06, 0.212);
  part(g, CYL, mat('#3a3a40'), 0.006, 0.18, 0.006, 0, 0.62, 0);
  part(g, BOX, flag, 0.1, 0.055, 0.008, 0.05, 0.68, 0);
  return g;
}

// A barbarian: dark cloak, face and a horned grey helmet (about 0.18 tall).
export function makeBarbarian() {
  const g = new THREE.Group();
  const cloak = mat('#5a2e1c'), skin = mat('#e2b48a'), steel = mat('#8d8f96', 0.5), horn = mat('#efe6cf');
  part(g, CONE, cloak, 0.05, 0.12, 0.05, 0, 0.06, 0);
  part(g, BALL, skin, 0.03, 0.03, 0.03, 0, 0.135, 0);
  part(g, BALL, steel, 0.033, 0.02, 0.033, 0, 0.152, 0);
  for (const s of [-1, 1]) part(g, CONE, horn, 0.009, 0.045, 0.009, s * 0.035, 0.175, 0, 0, 0, -s * 0.7);
  return g;
}

// A knight: a body and helmet in grey steel with a shield and pennant in the owner's colour.
export function makeKnight(color) {
  const g = new THREE.Group();
  const steel = mat('#b8bcc6', 0.4), own = mat(color, 0.6), white = mat('#ffffff', 0.6);
  part(g, CYL, steel, 0.035, 0.11, 0.035, 0, 0.055, 0);
  part(g, BALL, steel, 0.032, 0.035, 0.032, 0, 0.13, 0);
  part(g, BOX, own, 0.012, 0.09, 0.07, 0.045, 0.07, 0); // shield
  part(g, BOX, white, 0.014, 0.06, 0.012, 0.047, 0.07, 0);
  part(g, BOX, white, 0.014, 0.012, 0.045, 0.047, 0.08, 0);
  part(g, CYL, mat('#5b3e2b'), 0.005, 0.24, 0.005, -0.04, 0.12, 0); // lance
  part(g, BOX, own, 0.004, 0.035, 0.06, -0.04, 0.215, 0.03); // pennant
  return g;
}
