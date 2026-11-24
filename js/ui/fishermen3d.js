// Traders & Barbarians, Fishermen: 3D fishing grounds, built from simple shapes (no model file).
// Only used by board3d.js when the board has fishing grounds. A fishing ground: a floating ring
// of net with cork floats, two marker buoys and a few fish fins breaking the water.
import * as THREE from 'three';

const geo = {
  net: new THREE.TorusGeometry(0.34, 0.018, 6, 28).rotateX(Math.PI / 2),
  float: new THREE.SphereGeometry(0.03, 8, 6),
  buoy: new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8),
  cap: new THREE.ConeGeometry(0.035, 0.07, 8),
  fin: new THREE.ConeGeometry(0.035, 0.08, 3),
  fish: new THREE.ConeGeometry(0.04, 0.16, 5).rotateZ(Math.PI / 2),
  tail: new THREE.ConeGeometry(0.035, 0.06, 3).rotateZ(-Math.PI / 2),
};
const mats = new Map();
function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true }));
  return mats.get(color);
}
const part = (g, geometry, material, x, y, z) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
};

// `seed` varies the fins and the jumping fish so the six grounds don't look identical
export function makeFishingGround(seed = 0) {
  const g = new THREE.Group();
  part(g, geo.net, mat('#a07a4c'), 0, 0.01, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    part(g, geo.float, mat(i % 2 ? '#f2e3c0' : '#e0533a'), Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.34);
  }
  for (const [a, c] of [[0.6, '#e0533a'], [3.7, '#ffd36a']]) {
    part(g, geo.buoy, mat('#f2efe6'), Math.cos(a) * 0.46, 0.04, Math.sin(a) * 0.46);
    part(g, geo.cap, mat(c), Math.cos(a) * 0.46, 0.12, Math.sin(a) * 0.46);
  }
  // fins inside the net
  for (let i = 0; i < 3; i++) {
    const a = seed * 1.7 + i * 2.1, r = 0.12 + ((seed + i) % 3) * 0.06;
    const f = part(g, geo.fin, mat('#3c5a72'), Math.cos(a) * r, 0.03, Math.sin(a) * r);
    f.rotation.y = a;
  }
  // one fish jumping out
  const fish = new THREE.Group();
  part(fish, geo.fish, mat('#ffb86b'), 0, 0, 0);
  part(fish, geo.tail, mat('#ff9a4a'), -0.1, 0, 0);
  fish.position.set(Math.cos(seed) * 0.08, 0.14, Math.sin(seed) * 0.08);
  fish.rotation.set(0, seed * 2.3, 0.55);
  g.add(fish);
  return g;
}
