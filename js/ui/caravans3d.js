// Traders & Barbarians, The Caravans: 3D camel, palm tree and start arrow, built from simple shapes.
// The camel faces +x (board3d.js turns it along its path); everything sits on y = 0 (the ground).
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const BALL = new THREE.SphereGeometry(1, 10, 8);
const CONE = new THREE.ConeGeometry(1, 1, 4);
const mats = new Map();
function mat(color, { rough = 0.8, ghost = false } = {}) {
  const k = color + rough + ghost;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true, transparent: ghost, opacity: ghost ? 0.45 : 1, depthWrite: !ghost }));
  return mats.get(k);
}
const part = (g, geo, m, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const p = new THREE.Mesh(geo, m);
  p.scale.set(sx, sy, sz);
  p.position.set(x, y, z);
  p.rotation.set(rx, ry, rz);
  p.castShadow = !m.transparent;
  p.receiveShadow = true;
  g.add(p);
  return p;
};

// A one-humped camel with a red saddle blanket; `ghost` = see-through (a possible spot in a vote).
export function makeCamel(ghost = false) {
  const g = new THREE.Group();
  const hide = mat('#c8925a', { ghost }), dark = mat('#7a5232', { ghost }), cloth = mat('#c0392b', { ghost });
  for (const [x, z] of [[-0.05, -0.025], [-0.05, 0.025], [0.05, -0.025], [0.05, 0.025]]) part(g, CYL, dark, 0.009, 0.075, 0.009, x, 0.037, z);
  part(g, BALL, hide, 0.085, 0.04, 0.04, 0, 0.1, 0); // body
  part(g, BALL, hide, 0.04, 0.035, 0.032, -0.005, 0.135, 0); // hump
  part(g, BOX, cloth, 0.06, 0.012, 0.085, -0.005, 0.118, 0); // blanket
  part(g, CYL, hide, 0.014, 0.075, 0.014, 0.085, 0.14, 0, 0, 0, -0.5); // neck
  part(g, BOX, hide, 0.045, 0.022, 0.024, 0.115, 0.175, 0); // head
  return g;
}

// A palm: a leaning trunk of rings and a crown of drooping leaves.
export function makePalm(seed = 0) {
  const g = new THREE.Group();
  const bark = mat('#8a5a36'), leaf = mat('#3f8a3a', { rough: 0.7 }), nut = mat('#5b3e2b');
  const lean = 0.18 + (seed % 3) * 0.06;
  for (let i = 0; i < 6; i++) part(g, CYL, bark, 0.018 - i * 0.0015, 0.04, 0.018 - i * 0.0015, i * 0.01 * lean * 4, 0.02 + i * 0.038, 0);
  const top = new THREE.Vector3(6 * 0.01 * lean * 4, 0.24, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const l = part(g, CONE, leaf, 0.025, 0.14, 0.006, top.x + Math.cos(a) * 0.05, top.y - 0.01, Math.sin(a) * 0.05);
    l.rotation.set(0, -a, Math.PI / 2 + 0.5);
  }
  for (let i = 0; i < 3; i++) part(g, BALL, nut, 0.012, 0.012, 0.012, top.x + Math.cos(i * 2.1) * 0.015, top.y - 0.02, Math.sin(i * 2.1) * 0.015);
  g.rotation.y = seed * 1.3;
  return g;
}

// A sandstone arrow laid flat on the ground, pointing +x (a caravan start).
export function makeArrow() {
  const g = new THREE.Group();
  const stone = mat('#e0b45a', { rough: 0.95 });
  part(g, BOX, stone, 0.1, 0.02, 0.04, -0.02, 0.01, 0);
  const head = part(g, CONE, stone, 0.045, 0.06, 0.045, 0.055, 0.012, 0, 0, Math.PI / 4, -Math.PI / 2);
  head.scale.set(0.045, 0.07, 0.02);
  return g;
}
