// Toon map style (optional, SETTINGS.mapStyle === 'toon'): a cartoon summer island.
// Every land hex is its own raised tile (coloured top, brown soil sides) with simple toy-like
// props (cone and ball trees, sheep, wheat rows and a mill, clay pits and a kiln, snowy peaks,
// dunes and cacti), a flat blue sea with a turquoise shallow ring and white foam that follow
// the island's outline, and N3 houses (walls in the player's colour, dark roof, tall flag,
// colour ring at the foot). Props are merged per colour, so the whole island is a few draw calls.
// Render-only: nothing here reads or changes the rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pixelToHex, hk } from '../engine/board.js';

export const TOON_TOP = 0.3; // height of a tile's top face (pieces stand on it)
export const TOON_HOUSE_SCALE = 1.7; // N3 houses are drawn 70% bigger
const TILE_R = 0.95; // a little under the hex size, so the tiles show a gap between them
const SLAB_BOTTOM = -0.35;

// summer palette (same as the approved preview)
const C = {
  grass: '#5cbf4f', meadow: '#78cc58', forest: '#2c8a3c', leaf: '#2f9a45', pine: '#226b38', trunk: '#6b4a30',
  field: '#e8bf3f', crop: '#f4d25a', clay: '#d4643e', clayDark: '#a8492f', chimney: '#5a3a2e', rock: '#949aa2',
  snow: '#f6f9fc', sand: '#f3d48c', cactus: '#3f8f3e', side: '#86563a', wool: '#fbfbf6', sheepHead: '#2a2a33',
  fence: '#8a6a4a', millWall: '#f0e6d0', millRoof: '#b4533c', gold: '#ffcf3a', back: '#8a6443', unknown: '#9aa39c',
  lake: '#4fb3d9', sea: '#2e9cc4', shallow: '#5fd0d6', foam: '#f4fbff', ink: '#1b1830', roofDark: '#4a3428', pole: '#3a2a1a',
};
const TOP_OF = { wood: C.forest, sheep: C.meadow, wheat: C.field, brick: C.clay, ore: C.rock, desert: C.sand, gold: C.rock };

function prng(seed) {
  let s = seed | 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
}

// black outline: the back faces of the mesh, pushed out along their normals (works on merged geometry)
const OUTLINE = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
OUTLINE.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normal * 0.013;');
};
OUTLINE.customProgramCacheKey = () => 'toonOutline';
OUTLINE.userData.noToon = true;
function outlined(mesh) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.userData.noToon = true;
  o.raycast = () => {}; // never steals clicks
  mesh.add(o);
  return mesh;
}

// one toon material per colour (patched by the board for fog of war and the robber stain)
let matFn = null;
function materials(env) {
  if (matFn) return matFn;
  const cache = new Map();
  return (matFn = (color, extra) => {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!cache.has(key)) {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: env.ramp, ...extra });
      m.userData.noToon = true;
      cache.set(key, env.patch(m, { key: 'toonP' }));
    }
    return cache.get(key);
  });
}

// collects props as world-space geometry, grouped by colour; build() merges each colour into one mesh
function collector() {
  const parts = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    put(geo, color, x, y, z, ry = 0, s = [1, 1, 1]) {
      q.setFromEuler(e.set(0, ry, 0));
      m4.compose(v.set(x, y, z), q, sc.set(s[0], s[1], s[2]));
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m4);
      g.deleteAttribute('uv');
      if (!parts.has(color)) parts.set(color, []);
      parts.get(color).push(g);
    },
    build(group, mat, { shadow = true, outline = true } = {}) {
      for (const [color, list] of parts) {
        const geo = mergeGeometries(list);
        list.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geo, mat(color));
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.userData.own = true;
        if (outline) outlined(mesh);
        group.add(mesh);
      }
      parts.clear();
    },
  };
}

// shared base geometries
const G = {
  hex: (r, h) => new THREE.CylinderGeometry(r, r, h, 6),
  cone: (r, h, n) => new THREE.ConeGeometry(r, h, n),
  cyl: (r0, r1, h, n) => new THREE.CylinderGeometry(r0, r1, h, n),
  ball: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  dome: (r, w = 10) => new THREE.SphereGeometry(r, w, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
};

// props of one tile, around (cx, cz); `away` keeps them off the corners where houses stand
function tileProps(P, t, kind, cx, cz) {
  const R = prng(t.id * 977 + t.q * 31 + t.r * 17 + 5);
  const y0 = TOON_TOP;
  const corners = [0, 1, 2, 3, 4, 5].map(k => [Math.sin((k * Math.PI) / 3), Math.cos((k * Math.PI) / 3)]);
  const away = (x, z, d = 0.42) => corners.every(([vx, vz]) => (vx - x) ** 2 + (vz - z) ** 2 > d * d);
  const ring = (n, r0, r1, f) => {
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.9, r = r0 + R() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!away(x, z)) continue;
      f(x, z, a, i);
      i++;
    }
  };
  const put = (geo, color, x, y, z, ry, s) => P.put(geo, color, cx + x, y, cz + z, ry, s);
  const tree = (x, z, pine, s) => {
    put(G.cyl(0.035 * s, 0.05 * s, 0.22 * s, 6), C.trunk, x, y0 + 0.11 * s, z);
    if (pine) {
      put(G.cone(0.2 * s, 0.34 * s, 7), C.pine, x, y0 + 0.32 * s, z);
      put(G.cone(0.14 * s, 0.26 * s, 7), C.pine, x, y0 + 0.52 * s, z);
    } else put(G.ball(0.19 * s), C.leaf, x, y0 + 0.38 * s, z);
  };
  switch (kind) {
    case 'wood':
      ring(7, 0.3, 0.66, (x, z, a, i) => tree(x, z, i % 2 === 1, 0.85 + R() * 0.4));
      break;
    case 'sheep':
      ring(4, 0.38, 0.62, (x, z, a) => {
        const ry = a + 1.2; // the body's long axis (local x) points along ry; the head sits at its front
        put(G.ball(0.1), C.wool, x, y0 + 0.08, z, ry, [1.3, 0.9, 0.9]);
        put(G.box(0.07, 0.07, 0.07), C.sheepHead, x + Math.cos(ry) * 0.14, y0 + 0.1, z - Math.sin(ry) * 0.14, ry);
      });
      ring(5, 0.25, 0.68, (x, z) => put(G.ball(0.08, 8, 6), C.grass, x, y0 - 0.01, z, 0, [1, 0.6, 1]));
      put(G.box(0.5, 0.06, 0.03), C.fence, 0.15, y0 + 0.06, -0.55, 0.4);
      break;
    case 'wheat': {
      const ry = R() * Math.PI;
      for (let k = -2; k <= 2; k++) {
        const ox = Math.sin(ry) * k * 0.2, oz = Math.cos(ry) * k * 0.2;
        put(G.box(1.0 - Math.abs(k) * 0.18, 0.12, 0.1), C.crop, ox, y0 + 0.06, oz, ry + Math.PI / 2);
      }
      const ma = R() * Math.PI * 2;
      const mx = Math.cos(ma) * 0.52, mz = Math.sin(ma) * 0.52;
      if (away(mx, mz, 0.3)) {
        put(G.cyl(0.09, 0.13, 0.4, 8), C.millWall, mx, y0 + 0.2, mz);
        put(G.cone(0.13, 0.15, 8), C.millRoof, mx, y0 + 0.475, mz);
      }
      break;
    }
    case 'brick':
      ring(3, 0.36, 0.6, (x, z) => put(G.dome(0.22, 9), C.clay, x, y0, z, 0, [1, 0.75, 1]));
      put(G.box(0.28, 0.22, 0.24), C.clayDark, 0.05, y0 + 0.11, -0.1, R() * 3);
      put(G.cyl(0.04, 0.05, 0.25, 6), C.chimney, 0.13, y0 + 0.33, -0.15);
      break;
    case 'ore':
    case 'gold': {
      const peaks = kind === 'gold' ? [[0.2, -0.15, 0.3, 0.5], [-0.35, 0.25, 0.25, 0.38]] : [[0.12, -0.1, 0.42, 0.95], [-0.38, 0.28, 0.3, 0.6], [0.45, 0.32, 0.26, 0.5]];
      for (const [x, z, r, h] of peaks) {
        const ry = R() * 3;
        put(G.cone(r, h, 6), C.rock, x, y0 + h / 2, z, ry);
        const capH = h * 0.32;
        put(G.cone(r * 0.32 * 1.02, capH, 6), C.snow, x, y0 + h - capH / 2 + 0.005, z, ry);
      }
      if (kind === 'gold') ring(5, 0.25, 0.6, (x, z) => put(new THREE.IcosahedronGeometry(0.06, 0), C.gold, x, y0 + 0.04, z, R() * 3));
      break;
    }
    case 'desert':
      ring(3, 0.3, 0.55, (x, z) => put(G.dome(0.28, 10), C.sand, x, y0, z, R() * 3, [1.4, 0.35, 0.8]));
      ring(2, 0.4, 0.55, (x, z) => {
        put(G.cyl(0.05, 0.05, 0.3, 7), C.cactus, x, y0 + 0.15, z);
        put(G.cyl(0.03, 0.03, 0.12, 6), C.cactus, x + 0.07, y0 + 0.2, z);
      });
      break;
  }
}

// a height field with the same interface as terrainOf(): flat tile tops on land, sea level elsewhere.
// Points on a coast (corners and edges of a land hex) count as land, so houses and roads stand on the tile.
export function toonField(base, bd) {
  const land = base.land;
  const near = (x, z) => {
    const [q, r] = pixelToHex(x, z);
    if (land.has(hk(q, r))) return true;
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const t = land.get(hk(q + dq, r + dr));
      if (t && (t.x - x) ** 2 + (t.y - z) ** 2 <= 1.03 * 1.03) return true;
    }
    return false;
  };
  return { ...base, sample: (x, z) => (near(x, z) ? TOON_TOP : 0) };
}

// the whole island: tiles, props, shallow ring, foam and the sea
export function buildToonIsland(st, env, faceDown) {
  const bd = st.board;
  const mat = materials(env);
  const group = new THREE.Group();
  const tiles = collector(), props = collector(), water = collector();
  const lake = bd.lake >= 0 ? bd.lake : -1;
  for (const t of bd.tiles) {
    const kind = !t.revealed ? (faceDown ? 'back' : 'unknown') : t.id === lake ? 'lake' : t.res;
    const top = kind === 'back' ? C.back : kind === 'unknown' ? C.unknown : kind === 'lake' ? C.lake : TOP_OF[kind] || C.grass;
    const slabH = TOON_TOP - 0.06 - SLAB_BOTTOM;
    tiles.put(G.hex(TILE_R, slabH), C.side, t.x, SLAB_BOTTOM + slabH / 2, t.y);
    tiles.put(G.hex(TILE_R - 0.02, 0.12), top, t.x, TOON_TOP - 0.06, t.y);
    if (t.revealed && t.id !== lake) tileProps(props, t, t.res, t.x, t.y);
    water.put(G.hex(1.5, 0.02), C.shallow, t.x, -0.004, t.y);
    water.put(G.hex(1.1, 0.02), C.foam, t.x, 0.004, t.y);
  }
  tiles.build(group, mat);
  props.build(group, mat);
  water.build(group, mat, { shadow: false, outline: false });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), mat(C.sea));
  sea.position.y = -0.02;
  sea.receiveShadow = true;
  sea.userData.own = true;
  group.add(sea);
  return { group, sea };
}

// N3 house: walls in the player's colour, dark gable roof, tall flag, colour ring at the foot.
// `banner(flag, x, z, height)` draws the player's painted flag; without one the flag is plain colour.
// Returns an object in model units: the board scales it by TOON_HOUSE_SCALE.
export function makeToonHouse(type, color, flag, env, banner) {
  const mat = materials(env);
  const g = new THREE.Group();
  const add = (geo, c, x, y, z, ry = 0, extra) => {
    const m = new THREE.Mesh(geo, mat(c, extra));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(outlined(m));
    return m;
  };
  const roof = (w, r, d) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.lineTo(w / 2, 0);
    sh.lineTo(0, r);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  };
  const body = (bx, w, h, d) => {
    add(G.box(w, h, d), color, bx, h / 2, 0);
    add(roof(w * 1.25, 0.11, d * 1.15), C.roofDark, bx, h, 0);
  };
  const city = type === 'city';
  if (city) {
    body(-0.06, 0.24, 0.17, 0.2);
    body(0.13, 0.13, 0.28, 0.14);
  } else body(0, 0.2, 0.14, 0.18);
  const ringR = city ? 0.27 : 0.2;
  add(G.cyl(ringR, ringR, 0.02, 24), color, city ? 0.02 : 0, 0.01, 0, 0, { emissive: color, emissiveIntensity: 0.25 });
  const px = city ? 0.13 : 0, ph = city ? 0.62 : 0.5;
  if (flag && banner) {
    const b = banner(flag, px, -0.04, ph, 1.05);
    g.add(b);
  } else {
    add(G.cyl(0.008, 0.008, ph, 6), C.pole, px, ph / 2, -0.04);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.11, 8, 1).translate(0.09, 0, 0), mat(color, { side: THREE.DoubleSide }));
    cloth.position.set(px, ph - 0.06, -0.04);
    cloth.castShadow = true;
    g.add(cloth);
  }
  return g;
}
