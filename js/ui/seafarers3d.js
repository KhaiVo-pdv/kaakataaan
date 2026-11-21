// Seafarers 3D pieces: ships and the pirate, built from simple shapes (no extra model file).
// Only used by board3d.js when the state has ships / a pirate.
import * as THREE from 'three';
import { shipPose, piratePose } from './seafarersPose.js';

export { shipPose, piratePose };

const geo = {
  hull: new THREE.BoxGeometry(0.46, 0.1, 0.17),
  bow: new THREE.CylinderGeometry(0, 0.085, 0.16, 4, 1).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4),
  deck: new THREE.BoxGeometry(0.4, 0.025, 0.13),
  stripe: new THREE.BoxGeometry(0.47, 0.03, 0.18),
  mast: new THREE.CylinderGeometry(0.014, 0.018, 0.42, 6),
  sail: new THREE.BoxGeometry(0.02, 0.24, 0.26),
  flag: new THREE.BoxGeometry(0.01, 0.05, 0.08),
};
const mats = new Map();
function mat(color, rough = 0.75) {
  const k = color + rough;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true }));
  return mats.get(k);
}

function part(g, geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

// a small sailing ship along +x: wooden hull, a stripe and a sail in the player's colour
export function makeShip(color) {
  const g = new THREE.Group();
  part(g, geo.hull, mat('#7a4a26'), 0, 0.05, 0);
  part(g, geo.bow, mat('#7a4a26'), 0.3, 0.05, 0);
  part(g, geo.stripe, mat(color, 0.6), 0, 0.09, 0);
  part(g, geo.deck, mat('#b07a45'), 0, 0.11, 0);
  part(g, geo.mast, mat('#5a3519'), 0.02, 0.32, 0);
  part(g, geo.sail, mat(color, 0.9), 0.05, 0.33, 0).rotation.y = 0.25;
  return g;
}

// the pirate: a bigger, all-black ship with a red flag
export function makePirate() {
  const g = new THREE.Group();
  part(g, geo.hull, mat('#1e1e24'), 0, 0.05, 0);
  part(g, geo.bow, mat('#1e1e24'), 0.3, 0.05, 0);
  part(g, geo.stripe, mat('#b3261e', 0.6), 0, 0.09, 0);
  part(g, geo.deck, mat('#3a3a42'), 0, 0.11, 0);
  part(g, geo.mast, mat('#2b2b30'), 0.02, 0.32, 0);
  part(g, geo.sail, mat('#15151a', 0.95), 0.05, 0.33, 0).rotation.y = -0.2;
  part(g, geo.flag, mat('#d62f2f', 0.6), 0.02, 0.56, 0.04);
  g.scale.setScalar(1.35);
  return g;
}

// ---- fog clouds: one puffy cloud per face-down fog tile (land or sea) ----
const PUFF = new THREE.IcosahedronGeometry(1, 1);
// a small deterministic random so a tile always gets the same cloud
function rnd(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

// Each cloud gets its own material so it can fade out alone when its tile is discovered.
export function makeCloud(seed) {
  const r = rnd(seed + 1);
  const m = new THREE.MeshStandardMaterial({ color: '#e9edf5', roughness: 1, flatShading: true, transparent: true, opacity: 0.96 });
  const g = new THREE.Group();
  const puffs = 7;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + r() * 0.5;
    const d = i === 0 ? 0 : 0.42 + r() * 0.2;
    const s = i === 0 ? 0.48 : 0.3 + r() * 0.14;
    const p = new THREE.Mesh(PUFF, m);
    p.position.set(Math.cos(a) * d, 0.08 + r() * 0.12, Math.sin(a) * d);
    p.scale.set(s, s * 0.72, s);
    g.add(p);
  }
  g.userData.mat = m;
  return g;
}
