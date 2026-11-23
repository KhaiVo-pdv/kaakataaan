// 3D settlements and cities for the kingdom piece styles (see pieceStyles.js), built from simple
// shapes like the Cities & Knights pieces: no extra model file. Only board3d.js uses this.
// Sizes match the Blender kit (assets/models/kit.glb): a house is about 0.25 wide and 0.27 tall,
// a city about 0.47 wide and 0.7 tall, in model units; board3d scales them like the kit models.
// The roof always carries the player's colour, so ownership stays readable in every style.
// Material names follow the kit ('Timber', 'StoneDark', 'Glass') so the ADHD gold trims still apply.
import * as THREE from 'three';

const mats = new Map();
function mat(name, color, opts = {}) {
  const k = name + color + JSON.stringify(opts);
  if (!mats.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal || 0, flatShading: true });
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
