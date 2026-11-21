// Cities & Knights 3D pieces, built from simple shapes (no extra model file). Only used by
// board3d.js when the state has knights. A knight: a round base in the player's colour, a body
// that gets taller with its strength (1-3 rings) and a helmet; an active knight wears a glowing ring.
import * as THREE from 'three';

const geo = {
  base: new THREE.CylinderGeometry(0.13, 0.15, 0.06, 16),
  body: new THREE.CylinderGeometry(0.07, 0.1, 0.2, 10),
  ring: new THREE.TorusGeometry(0.095, 0.022, 6, 16).rotateX(Math.PI / 2),
  helm: new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6),
  plume: new THREE.ConeGeometry(0.03, 0.12, 6),
  glow: new THREE.TorusGeometry(0.17, 0.025, 8, 24).rotateX(Math.PI / 2),
};
const mats = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: opts.metal || 0, flatShading: true, emissive: opts.glow ? color : '#000000', emissiveIntensity: opts.glow ? 0.9 : 0 }));
  return mats.get(k);
}
const part = (g, geometry, material, y) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.y = y;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
};

export function makeKnight(color, level, active) {
  const g = new THREE.Group();
  part(g, geo.base, mat(color), 0.03);
  const h = 0.12 + level * 0.06;
  const body = part(g, geo.body, mat('#c9ccd6', { metal: 0.6 }), 0.06 + h / 2);
  body.scale.y = h / 0.2;
  for (let i = 0; i < level; i++) part(g, geo.ring, mat(color), 0.1 + i * 0.06);
  part(g, geo.helm, mat('#9aa0ad', { metal: 0.7 }), 0.06 + h);
  part(g, geo.plume, mat(color), 0.06 + h + 0.1);
  if (active) part(g, geo.glow, mat('#ffcd75', { glow: true }), 0.02);
  g.scale.setScalar(1.3);
  return g;
}

// the merchant piece (trade progress card): a little figure with a coin on top, in its owner's colour
export function makeMerchant(color) {
  const g = new THREE.Group();
  part(g, geo.base, mat(color), 0.03);
  const body = part(g, new THREE.ConeGeometry(0.11, 0.3, 10), mat(color), 0.21);
  body.scale.set(1, 1, 1);
  part(g, new THREE.SphereGeometry(0.07, 10, 8), mat('#f2d0a4'), 0.41);
  const coin = part(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14), mat('#ffcd75', { metal: 0.8 }), 0.55);
  coin.rotation.x = Math.PI / 2;
  g.scale.setScalar(1.4);
  return g;
}
