// Where Seafarers pieces sit on the board (shared by the 3D and the flat SVG board; no three.js).
const WATER_Y = 0.03; // the 3D water plane sits at y = 0

// where a ship sits on edge eid: on the water, along the edge; on a coast it slides toward
// the sea so it doesn't run aground on the shore
export function shipPose(bd, eid) {
  const E = bd.edges[eid], a = bd.vertices[E.a], b = bd.vertices[E.b];
  let x = (a.x + b.x) / 2, z = (a.y + b.y) / 2;
  if (E.kind === 'coast' && E.sea && E.sea.length) {
    const t = bd.sea[E.sea[0]];
    const dx = t.x - x, dz = t.y - z, len = Math.hypot(dx, dz) || 1;
    x += (dx / len) * 0.26;
    z += (dz / len) * 0.26;
  }
  return { x, y: WATER_Y, z, rotY: -Math.atan2(b.y - a.y, b.x - a.x) };
}

export function piratePose(bd) {
  const t = bd.sea[bd.pirate];
  return t ? { x: t.x, y: WATER_Y, z: t.y, rotY: 0.6 } : null;
}
