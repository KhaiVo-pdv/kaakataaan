// 3D settlements and cities for the kingdom piece styles (see pieceStyles.js), built from simple
// shapes like the Cities & Knights pieces: no extra model file. Only board3d.js uses this.
// Sizes match the Blender kit (assets/models/kit.glb): a house is about 0.25 wide and 0.27 tall,
// a city about 0.47 wide and 0.7 tall, in model units; board3d scales them like the kit models.
// The roof always carries the player's colour, so ownership stays readable in every style.
// Material names follow the kit ('Timber', 'StoneDark', 'Glass') so the ADHD gold trims still apply.
import * as THREE from 'three';
import { TRACK_COLOR } from './citiesKnights3d.js';

const mats = new Map();
function mat(name, color, opts = {}) {
  const k = name + color + JSON.stringify(opts);
  if (!mats.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal || 0, flatShading: true, emissive: opts.glow ? color : '#000000', emissiveIntensity: opts.glow ? 0.9 : 0 });
    m.name = name;
    mats.set(k, m);
  }
  return mats.get(k);
}

const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};

// add a mesh to group g at (x, y, z); y is the bottom of the shape unless the geometry is already based
function put(g, geometry, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (w, h, d) => cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
const cyl = (rt, rb, h, seg = 10) => cached(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0));
const cone = (r, h, seg = 12) => cached(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0));
// four-sided pyramid roof sitting on a w x d top
const pyramid = (w, d, h) => cached(`pyr${w},${d},${h}`, () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0));

// a roof profile (in x/y) extruded along z, centred; `pts` is the outline from left eave over the ridge to right eave
function profileRoof(key, pts, depth) {
  return cached(`roof${key}${depth}`, () => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else s.lineTo(p[0], p[1]);
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -depth / 2);
  });
}
// plain gable: eaves at +-w/2 at height 0, ridge at height h
const gable = (w, h, depth) => profileRoof(`gable${w},${h}`, [[-w / 2, 0], [0, h], [w / 2, 0]], depth);
// curved roof whose eaves turn up at the ends (Vietnamese and East Asian roofs)
const curved = (w, h, depth, lift) => profileRoof(`curve${w},${h},${lift}`, [
  [-w / 2 - 0.02, lift], [-w / 2 + 0.03, 0.01, -w / 4, h * 0.45], [-w * 0.12, h, 0, h],
  [w * 0.12, h, w / 4, h * 0.45], [w / 2 - 0.03, 0.01, w / 2 + 0.02, lift],
  [w / 2 - 0.02, lift - 0.012], [w / 2 - 0.05, -0.01, w / 4, h * 0.38], [0.02, h - 0.03, -w / 4, h * 0.38], [-w / 2 + 0.05, -0.01, -w / 2 + 0.02, lift - 0.012],
], depth);

// ---------------- the styles ----------------
// each builder returns { obj, knob: [x, y, z] (gold knob on top), flag: [x, z, height, size] (banner pole) }
const WOOD = '#6b4426', WOOD_DARK = '#3f2716', STONE = '#9aa3ad', STONE_DARK = '#6a717c', PLASTER = '#f1e4c8', CREAM = '#e7d3a8', GOLD = '#ffcd75';

// Vietnamese village hall (đình làng): low and wide on a stone plinth, wooden pillars, a heavy roof that
// comes down low, with curled-up corners (đầu đao) and a pearl on the ridge; cities stack a second roof (chồng diêm)
function dinh(type, color) {
  const g = new THREE.Group();
  const roof = mat('Player', color), wood = mat('Timber', WOOD), plinth = mat('StoneDark', STONE_DARK), wall = mat('Plaster', CREAM), gold = mat('Ornament', GOLD, { metal: 0.4, rough: 0.4 });
  // a low four-sided roof: the curved profile crossed with itself, plus the curled corners
  const hall = (w, d, h, y) => {
    put(g, curved(w, h, d, 0.04), roof, 0, y);
    put(g, curved(d * 0.8, h, w * 0.8, 0.04), roof, 0, y, 0, Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tip = put(g, cone(0.014, 0.07, 6), roof, sx * (w / 2 + 0.005), y + 0.025, sz * (d / 2 - 0.01));
      tip.rotation.set(sz * 0.6, 0, -sx * 0.9); // curls up and outwards
    }
  };
  const ridge = (len, y) => {
    put(g, box(len, 0.018, 0.022), roof, 0, y);
    put(g, cached('pearl', () => new THREE.SphereGeometry(0.018, 10, 8)), gold, 0, y + 0.03);
    for (const sx of [-1, 1]) {
      const end = put(g, cone(0.012, 0.05, 6), gold, sx * len / 2, y + 0.01);
      end.rotation.z = -sx * 0.5;
    }
  };
  if (type === 'house') {
    put(g, box(0.27, 0.025, 0.2), plinth);
    put(g, box(0.18, 0.06, 0.12), wall, 0, 0.025);
    for (const x of [-0.11, 0, 0.11]) for (const z of [-0.08, 0.08]) put(g, cyl(0.008, 0.008, 0.07, 6), wood, x, 0.025, z);
    hall(0.3, 0.22, 0.11, 0.09);
    ridge(0.13, 0.195);
    return { obj: g, knob: [0, 0.27, 0], flag: [0.12, 0.09, 0.36, 1] };
  }
  put(g, box(0.5, 0.035, 0.34), plinth);
  put(g, box(0.38, 0.1, 0.22), wall, 0, 0.035);
  for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const z of [-0.14, 0.14]) put(g, cyl(0.011, 0.011, 0.11, 6), wood, x, 0.035, z);
  hall(0.54, 0.36, 0.13, 0.14);
  put(g, box(0.2, 0.06, 0.12), wall, 0, 0.24); // the band between the two roofs
  hall(0.32, 0.2, 0.1, 0.29);
  ridge(0.14, 0.385);
  return { obj: g, knob: [0, 0.46, 0], flag: [-0.24, 0.13, 0.7, 1.6] };
}

// stone castle: a tower with a pointed roof; the city is a crenellated wall between two round towers
function castle(type, color) {
  const g = new THREE.Group();
  const roof = mat('Player', color), stone = mat('Stone', STONE), dark = mat('StoneDark', STONE_DARK), win = mat('Glass', '#2b3040', { rough: 0.3 });
  if (type === 'house') {
    put(g, box(0.17, 0.17, 0.15), stone);
    put(g, box(0.19, 0.02, 0.17), dark);
    put(g, box(0.04, 0.06, 0.005), win, 0, 0.07, 0.077);
    put(g, pyramid(0.21, 0.19, 0.12), roof, 0, 0.17);
    return { obj: g, knob: [0, 0.3, 0], flag: [0.1, 0.07, 0.36, 1] };
  }
  put(g, box(0.4, 0.03, 0.26), dark);
  put(g, box(0.32, 0.17, 0.2), stone, 0, 0.03);
  for (let i = -3; i <= 3; i += 2) put(g, box(0.04, 0.035, 0.2), stone, i * 0.045, 0.2); // crenels
  put(g, box(0.14, 0.17, 0.12), stone, 0, 0.2); // keep
  put(g, pyramid(0.17, 0.15, 0.14), roof, 0, 0.37);
  for (const x of [-0.18, 0.18]) {
    put(g, cyl(0.06, 0.065, 0.36, 12), stone, x, 0);
    put(g, cyl(0.07, 0.07, 0.02, 12), dark, x, 0.36);
    put(g, cone(0.075, 0.16, 12), roof, x, 0.38);
  }
  put(g, box(0.05, 0.08, 0.005), win, 0, 0.03, 0.102); // gate
  return { obj: g, knob: [0, 0.53, 0], flag: [-0.18, 0, 0.78, 1.6] };
}

// East Asian pagoda: white walls on a stone base, square curved roofs stacked in tiers (2 on a house,
// 3 on a city tower) with a golden spire; taller and narrower than the đình
function eastern(type, color) {
  const g = new THREE.Group();
  const roof = mat('Player', color), wall = mat('Plaster', PLASTER), base = mat('StoneDark', STONE_DARK), wood = mat('Timber', WOOD_DARK), gold = mat('Ornament', GOLD, { metal: 0.5, rough: 0.35 });
  // one tier: square walls of side w and height h, topped by a square curved roof
  const tier = (w, h, y, rw) => {
    put(g, box(w, h, w), wall, 0, y);
    put(g, box(w * 0.3, h * 0.7, 0.005), wood, 0, y, w / 2 + 0.002); // door / window
    const rh = rw * 0.28;
    put(g, curved(rw, rh, rw * 0.8, rh * 0.45), roof, 0, y + h);
    put(g, curved(rw, rh, rw * 0.8, rh * 0.45), roof, 0, y + h, 0, Math.PI / 2);
    return y + h + rh * 0.75;
  };
  if (type === 'house') {
    put(g, box(0.2, 0.025, 0.2), base);
    let y = tier(0.14, 0.09, 0.025, 0.24);
    y = tier(0.07, 0.04, y, 0.14);
    put(g, cyl(0.004, 0.01, 0.06, 6), gold, 0, y);
    return { obj: g, knob: [0, y + 0.07, 0], flag: [0.11, 0.08, 0.36, 1] };
  }
  put(g, box(0.36, 0.03, 0.36), base);
  let y = tier(0.26, 0.13, 0.03, 0.42);
  y = tier(0.19, 0.09, y, 0.32);
  y = tier(0.12, 0.07, y, 0.22);
  put(g, cyl(0.005, 0.014, 0.11, 6), gold, 0, y);
  return { obj: g, knob: [0, y + 0.12, 0], flag: [-0.2, 0.15, 0.78, 1.6] };
}

// Viking longhouse: dark timber walls, steep roof, crossed carved horns on the gable ends, round shields
function viking(type, color) {
  const g = new THREE.Group();
  const roof = mat('Player', color), wood = mat('Timber', WOOD_DARK), wall = mat('Plaster', WOOD), base = mat('StoneDark', STONE_DARK), shieldRim = mat('Ornament', GOLD, { metal: 0.4, rough: 0.45 });
  // two crossed carved horns standing on the ridge end at (x, y)
  const horns = (x, y, s) => {
    for (const sgn of [-1, 1]) {
      const h = put(g, box(0.012 * s, 0.08 * s, 0.012 * s), wood, x, y, sgn * 0.015 * s);
      h.rotation.x = sgn * 0.5;
    }
  };
  if (type === 'house') {
    put(g, box(0.27, 0.02, 0.15), base);
    put(g, box(0.25, 0.08, 0.12), wall, 0, 0.02);
    put(g, gable(0.17, 0.15, 0.28), roof, 0, 0.1, 0, Math.PI / 2); // turned so the ridge runs along the length
    horns(-0.13, 0.22, 1);
    horns(0.13, 0.22, 1);
    return { obj: g, knob: [0, 0.27, 0], flag: [0.1, 0.07, 0.36, 1] };
  }
  put(g, box(0.48, 0.03, 0.24), base);
  put(g, box(0.44, 0.12, 0.19), wall, 0, 0.03);
  put(g, gable(0.27, 0.24, 0.48), roof, 0, 0.15, 0, Math.PI / 2);
  horns(-0.23, 0.36, 1.3);
  horns(0.23, 0.36, 1.3);
  for (const x of [-0.14, 0, 0.14]) {
    // shields along the front wall: player colour inside a gold rim
    const rim = put(g, cyl(0.04, 0.04, 0.008, 14), shieldRim, x, 0.09, 0.1);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.09;
    const face = put(g, cyl(0.031, 0.031, 0.01, 14), mat('Player', color), x, 0.09, 0.101);
    face.rotation.x = Math.PI / 2;
  }
  return { obj: g, knob: [0, 0.4, 0], flag: [-0.2, 0.06, 0.74, 1.6] };
}

const BUILDERS = { dinh, castle, eastern, viking };

// the styled building, or null for 'classic' / unknown styles (board3d then uses the Blender kit)
export function makeStyledBuilding(style, type, color) {
  const make = BUILDERS[style];
  return make ? make(type, color) : null;
}

// ---------------- Cities & Knights metropolis, per style ----------------
// A tall landmark beside the city. Every style keeps the glowing flag in the improvement track's
// colour (trade / politics / science) on top, so you can still tell which metropolis it is.
// Same size class as the generic tower in citiesKnights3d.js (about 0.9 tall before the flag).

// four-sided curved roof (the curved profile crossed with itself) of size w at height y
function curvedRoof4(g, roof, w, h, y, lift) {
  put(g, curved(w, h, w * 0.8, lift), roof, 0, y);
  put(g, curved(w, h, w * 0.8, lift), roof, 0, y, 0, Math.PI / 2);
}
// flag pole with the track flag, standing at height y
function trackFlag(g, track, y, x = 0) {
  put(g, cyl(0.006, 0.006, 0.26, 5), mat('Pole', '#3a2a1a'), x, y);
  put(g, box(0.15, 0.09, 0.01), mat('TrackFlag', TRACK_COLOR[track] || '#ffffff', { glow: true }), x + 0.075, y + 0.16);
}

function dinhMetro(track, color) {
  // a bell tower (gác chuông): open wooden ground floor, then three stacked curved roofs with curled corners
  const g = new THREE.Group();
  const roof = mat('Player', color), wood = mat('Timber', WOOD), plinth = mat('StoneDark', STONE_DARK), wall = mat('Plaster', CREAM), gold = mat('Ornament', GOLD, { metal: 0.4, rough: 0.4 });
  put(g, box(0.3, 0.04, 0.3), plinth);
  for (const x of [-0.1, 0.1]) for (const z of [-0.1, 0.1]) put(g, cyl(0.012, 0.012, 0.18, 6), wood, x, 0.04, z);
  put(g, cyl(0.04, 0.05, 0.07, 10), mat('Bell', '#b8862f', { metal: 0.7, rough: 0.35 }), 0, 0.12); // the bell
  // roof, wall band, roof, wall band, roof: the top always ends with a roof
  const tiers = [[0.38, 0.1], [0.3, 0.09], [0.22, 0]];
  let y = 0.22;
  for (const [w, wallH] of tiers) {
    curvedRoof4(g, roof, w, w * 0.3, y, w * 0.13);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tip = put(g, cone(0.012, 0.06, 6), roof, sx * w * 0.5, y + 0.02, sz * w * 0.38);
      tip.rotation.set(sz * 0.6, 0, -sx * 0.9);
    }
    y += w * 0.22;
    if (wallH) put(g, box(w * 0.5, wallH, w * 0.5), wall, 0, y);
    y += wallH;
  }
  put(g, cached('pearl', () => new THREE.SphereGeometry(0.018, 10, 8)), gold, 0, y + 0.02);
  trackFlag(g, track, y + 0.03, 0.03);
  return g;
}

function castleMetro(track, color) {
  // a great round keep with battlements and a pointed roof
  const g = new THREE.Group();
  const roof = mat('Player', color), stone = mat('Stone', STONE), dark = mat('StoneDark', STONE_DARK), win = mat('Glass', '#2b3040', { rough: 0.3 });
  put(g, cyl(0.15, 0.16, 0.05, 14), dark);
  put(g, cyl(0.11, 0.13, 0.58, 14), stone, 0, 0.05);
  put(g, cyl(0.145, 0.145, 0.05, 14), dark, 0, 0.63);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    put(g, box(0.04, 0.05, 0.04), stone, Math.cos(a) * 0.125, 0.68, Math.sin(a) * 0.125, -a);
  }
  for (const y of [0.25, 0.45]) put(g, box(0.035, 0.06, 0.005), win, 0, y, 0.122);
  put(g, cone(0.1, 0.22, 14), roof, 0, 0.68);
  trackFlag(g, track, 0.88);
  return g;
}

function easternMetro(track, color) {
  // a slender five-tier pagoda
  const g = new THREE.Group();
  const roof = mat('Player', color), wall = mat('Plaster', PLASTER), base = mat('StoneDark', STONE_DARK), gold = mat('Ornament', GOLD, { metal: 0.5, rough: 0.35 });
  put(g, box(0.26, 0.04, 0.26), base);
  let y = 0.04;
  for (let i = 0; i < 5; i++) {
    const w = 0.18 - i * 0.025, h = 0.09 - i * 0.008, rw = w + 0.12;
    put(g, box(w, h, w), wall, 0, y);
    y += h;
    curvedRoof4(g, roof, rw, rw * 0.25, y, rw * 0.12);
    y += rw * 0.17;
  }
  put(g, cyl(0.005, 0.014, 0.12, 6), gold, 0, y);
  trackFlag(g, track, y + 0.02, 0.02);
  return g;
}

function vikingMetro(track, color) {
  // a wooden watchtower: four posts, a platform and a lookout hut with a steep roof and carved horns
  const g = new THREE.Group();
  const roof = mat('Player', color), wood = mat('Timber', WOOD_DARK), plank = mat('Plaster', WOOD), base = mat('StoneDark', STONE_DARK);
  put(g, box(0.28, 0.03, 0.28), base);
  for (const x of [-0.1, 0.1]) for (const z of [-0.1, 0.1]) put(g, box(0.03, 0.5, 0.03), wood, x, 0.03, z);
  for (const y of [0.18, 0.36]) {
    // cross braces
    for (const sz of [-0.1, 0.1]) { const b = put(g, box(0.22, 0.02, 0.02), wood, 0, y, sz); b.rotation.z = 0.5; }
  }
  put(g, box(0.3, 0.03, 0.3), plank, 0, 0.53);
  put(g, box(0.2, 0.12, 0.2), plank, 0, 0.56);
  put(g, pyramid(0.28, 0.28, 0.2), roof, 0, 0.68);
  for (const sgn of [-1, 1]) {
    const h = put(g, box(0.014, 0.09, 0.014), wood, 0, 0.84, sgn * 0.02);
    h.rotation.x = sgn * 0.5;
  }
  trackFlag(g, track, 0.88, 0.03);
  return g;
}

const METROS = { dinh: dinhMetro, castle: castleMetro, eastern: easternMetro, viking: vikingMetro };

// the styled metropolis for this owner's style, or null for 'classic' (board3d then uses makeMetro)
export function makeStyledMetro(style, track, color) {
  const make = METROS[style];
  if (!make) return null;
  const g = make(track, color);
  g.scale.setScalar(1.25); // like the generic metropolis tower
  return g;
}

// ---------------- Cities & Knights city wall, per style ----------------
// A ring around the foot of the city, same radius as the generic wall in citiesKnights3d.js (0.3).
// Wall tops carry the owner's colour where the style has a roof or cap, like the houses.
const WALL_R = 0.3;
// place n pieces evenly on the ring; make(i) builds one piece standing at the origin, facing outwards
function ring(g, n, make) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = make(i);
    p.position.set(Math.cos(a) * WALL_R, p.position.y, Math.sin(a) * WALL_R);
    p.rotation.y = -a + Math.PI / 2;
    g.add(p);
  }
}
// a small group holding one wall piece; each part is [geometry, material, y, optional y-rotation]
const piece = (...parts) => {
  const p = new THREE.Group();
  for (const [geo, m, y, ry = 0] of parts) put(p, geo, m, 0, y, 0, ry);
  return p;
};

function dinhWall(color) {
  // yellow brick wall with a little tiled cap in the owner's colour
  const g = new THREE.Group();
  const brick = mat('Brick', '#d9a85b'), cap = mat('Player', color);
  ring(g, 10, () => piece([box(0.17, 0.07, 0.04), brick, 0], [box(0.19, 0.02, 0.06), cap, 0.07]));
  return g;
}

function castleWall(color) {
  // tall stone wall with crenels and three small round turrets with pointed roofs
  const g = new THREE.Group();
  const stone = mat('Stone', STONE), dark = mat('StoneDark', STONE_DARK), roof = mat('Player', color);
  ring(g, 10, i => piece([box(0.17, 0.1, 0.05), i % 2 ? stone : dark, 0], [box(0.05, 0.04, 0.05), stone, 0.1]));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 10;
    const t = piece([cyl(0.035, 0.04, 0.15, 10), stone, 0], [cone(0.045, 0.07, 10), roof, 0.15]);
    t.position.set(Math.cos(a) * WALL_R, 0, Math.sin(a) * WALL_R);
    g.add(t);
  }
  return g;
}

function easternWall(color) {
  // whitewashed wall on a stone footing, capped with tiles in the owner's colour
  const g = new THREE.Group();
  const wall = mat('Plaster', PLASTER), base = mat('StoneDark', STONE_DARK), cap = mat('Player', color);
  ring(g, 10, () => piece([box(0.18, 0.02, 0.05), base, 0], [box(0.17, 0.06, 0.035), wall, 0.02], [gable(0.07, 0.03, 0.19), cap, 0.08, Math.PI / 2]));
  return g;
}

function vikingWall() {
  // a palisade of sharpened wooden stakes
  const g = new THREE.Group();
  const wood = mat('Timber', WOOD_DARK), tip = mat('Plaster', WOOD);
  ring(g, 26, i => piece([cyl(0.017, 0.019, 0.09 + (i % 3) * 0.012, 6), wood, 0], [cone(0.018, 0.035, 6), tip, 0.09 + (i % 3) * 0.012]));
  return g;
}

const WALLS = { dinh: dinhWall, castle: castleWall, eastern: easternWall, viking: vikingWall };

// the styled city wall for this owner's style, or null for 'classic' (board3d then uses makeWall)
export function makeStyledWall(style, color) {
  const make = WALLS[style];
  return make ? make(color) : null;
}
