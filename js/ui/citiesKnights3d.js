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

// ---- city walls, metropolises, barbarians ----
const stone = () => mat('#8d8d99');
const stoneDark = () => mat('#5f5f6b');

// a ring of stone wall segments with little crenels around the foot of a city
export function makeWall() {
  const g = new THREE.Group();
  const N = 10, R = 0.3;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const seg = part(g, new THREE.BoxGeometry(0.17, 0.09, 0.05), i % 2 ? stone() : stoneDark(), 0.045);
    seg.position.x = Math.cos(a) * R;
    seg.position.z = Math.sin(a) * R;
    seg.rotation.y = -a + Math.PI / 2;
    const cren = part(g, new THREE.BoxGeometry(0.05, 0.04, 0.05), stone(), 0.11);
    cren.position.x = Math.cos(a) * R;
    cren.position.z = Math.sin(a) * R;
  }
  return g;
}

// the metropolis: a tall stone tower beside the city with a flag in the track's colour
export const TRACK_COLOR = { trade: '#e8c547', politics: '#4a8fe0', science: '#4fb36a' };
export function makeMetro(track, owner) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.09, 0.11, 0.62, 8), stone(), 0.31);
  part(g, new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), stoneDark(), 0.64);
  part(g, new THREE.ConeGeometry(0.12, 0.2, 8), mat(owner), 0.77);
  part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), mat('#3a2a1a'), 1.0);
  const flag = part(g, new THREE.BoxGeometry(0.16, 0.1, 0.01), mat(TRACK_COLOR[track], { glow: true }), 1.08);
  flag.position.x = 0.08;
  g.scale.setScalar(1.25);
  return g;
}

// the barbarian ship: dark red sails, a dragon-ish prow, a row of shields
export function makeBarbarianShip() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.62, 0.1, 0.2), mat('#4a2c1a'), 0.05);
  const prow = part(g, new THREE.ConeGeometry(0.06, 0.26, 6), mat('#4a2c1a'), 0.14);
  prow.position.x = 0.36;
  prow.rotation.z = -0.9;
  part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), mat('#2b1a10'), 0.35);
  const sail = part(g, new THREE.BoxGeometry(0.02, 0.3, 0.34), mat('#8e1b1b'), 0.38);
  sail.position.x = 0.02;
  for (let i = 0; i < 4; i++)
    for (const side of [-1, 1]) {
      const sh = part(g, new THREE.CylinderGeometry(0.045, 0.045, 0.015, 8), mat(i % 2 ? '#c9a227' : '#7a7f8c', { metal: 0.5 }), 0.1);
      sh.rotation.x = Math.PI / 2;
      sh.position.set(-0.2 + i * 0.13, 0.1, side * 0.105);
    }
  g.scale.setScalar(2);
  return g;
}

// a buoy marking one step of the barbarians' way (red once passed, gold where they land)
export function makeBuoy(done, land) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.05, 0.07, 0.1, 8), mat(done ? '#e0533a' : land ? '#ffd36a' : '#d9d4c7'), 0.05);
  if (land) part(g, new THREE.ConeGeometry(0.05, 0.12, 6), mat('#ffd36a', { glow: true }), 0.16);
  g.scale.setScalar(1.8);
  return g;
}

// where the barbarians sail: an arc across the sea east of the island, step 0 .. track (landing)
export function barbarianPath(bd, track) {
  const R = Math.max(...bd.tiles.map(t => Math.hypot(t.x, t.y))) + 1.05;
  const out = [];
  for (let i = 0; i <= track; i++) {
    const a = (-60 + (120 * i) / track) * (Math.PI / 180);
    out.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, rotY: -(a + Math.PI / 2) });
  }
  return out;
}
