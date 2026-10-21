import * as THREE from '../vendor/three.module.min.js';

let origin = [35.7047, 139.6358], terrain, exaggeration = 2;
export let SCALE_X = 111320 * Math.cos(origin[0] * Math.PI / 180);
export function initWorld(buildings, elevation, exag = 2, worldSeed = 4281) {
  origin = buildings.origin || elevation.origin;
  SCALE_X = 111320 * Math.cos(origin[0] * Math.PI / 180);
  terrain = elevation; exaggeration = exag; seed = worldSeed >>> 0;
}
// Scene Z points south; terrain row j points north. Grid values already exclude base_m.
export function terrainHeight(x, z) {
  if (!terrain) return 0;
  const offsetX = (origin[1] - terrain.origin[1]) * 111320 * Math.cos(terrain.origin[0] * Math.PI / 180);
  const offsetY = (origin[0] - terrain.origin[0]) * 111320;
  const u = Math.max(0, Math.min(terrain.size - 1, (x + offsetX - terrain.x0) / terrain.step));
  const v = Math.max(0, Math.min(terrain.size - 1, (-z + offsetY - terrain.y0) / terrain.step));
  const i = Math.min(terrain.size - 2, Math.floor(u)), j = Math.min(terrain.size - 2, Math.floor(v));
  const a = u - i, b = v - j, g = terrain.grid;
  return ((g[j][i] * (1 - a) + g[j][i + 1] * a) * (1 - b)
    + (g[j + 1][i] * (1 - a) + g[j + 1][i + 1] * a) * b) * exaggeration;
}
export const ll = (lat, lon) => {
  const x = (lon - origin[1]) * SCALE_X, z = -(lat - origin[0]) * 111320;
  return new THREE.Vector3(x, terrainHeight(x, z), z);
};
export const palette = { resident: 0x4fc3ff, visitor: 0xffb02e, commuter: 0xff5fa2 };
let seed = 4281;
export function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const trunk = new THREE.CylinderGeometry(0.25, 0.4, 1, 5);
const waterTank = new THREE.CylinderGeometry(1.1, 1.1, 2, 8);
const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3(), normal = new THREE.Vector3();
const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), color = new THREE.Color();

// A tiny local geometry merger: every static category becomes one draw call.
export class Batch {
  constructor(grounded = false) { this.p = []; this.n = []; this.c = []; this.grounded = grounded; }
  vertex(x, y, z, nx, ny, nz, tint) { this.p.push(x, y + (this.grounded ? terrainHeight(x, z) : 0), z); this.n.push(nx, ny, nz); this.c.push(tint.r, tint.g, tint.b); }
  add(geometry, x, y, z, sx, sy, sz, tint, angle = 0) {
    color.set(tint); rotation.setFromAxisAngle(axis, angle);
    matrix.compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(sx, sy, sz));
    normalMatrix.getNormalMatrix(matrix);
    const p = geometry.attributes.position, n = geometry.attributes.normal, index = geometry.index;
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) {
      const j = index ? index.getX(i) : i;
      point.fromBufferAttribute(p, j).applyMatrix4(matrix);
      normal.fromBufferAttribute(n, j).applyMatrix3(normalMatrix).normalize();
      this.vertex(point.x, point.y, point.z, normal.x, normal.y, normal.z, color);
    }
    return this;
  }
  cube(x, y, z, sx, sy, sz, tint, angle = 0) { return this.add(box, x, y, z, sx, sy, sz, tint, angle); }
  quad(a, b, c, d, tint, norm = [0, 1, 0]) {
    color.set(tint);
    // Match winding to the supplied outward normal, regardless of OSM ring order.
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const dot = (ab[1] * ac[2] - ab[2] * ac[1]) * norm[0]
      + (ab[2] * ac[0] - ab[0] * ac[2]) * norm[1]
      + (ab[0] * ac[1] - ab[1] * ac[0]) * norm[2];
    for (const v of dot < 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) this.vertex(...v, ...norm, color);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.grounded) g.computeVertexNormals();
    g.computeBoundingSphere(); return g;
  }
  mesh(material, parent, shadow = false) {
    const mesh = new THREE.Mesh(this.geometry(), material); mesh.castShadow = shadow; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
}
export function standard(extra = {}) { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .08, ...extra }); }
export function basic(extra = {}) { return new THREE.MeshBasicMaterial({ vertexColors: true, ...extra }); }
function strip(batch, a, b, width, y, tint) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < .01) return;
  const nx = -dz / len * width / 2, nz = dx / len * width / 2;
  const steps = Math.ceil(len / 10);
  for (let i = 0; i < steps; i++) {
    const ax = a.x + dx * i / steps, az = a.z + dz * i / steps;
    const bx = a.x + dx * (i + 1) / steps, bz = a.z + dz * (i + 1) / steps;
    batch.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], tint);
  }
}
const coolWalls = [0x66857f, 0x78938b, 0x4b7374, 0x8b9b88, 0x5d7b7e, 0x8c9783, 0x627b84, 0x809b95];
const warmWalls = [0xad987c, 0x9a8b75, 0xaca58e];

export function buildCity(scene, buildings, engine) {
  const root = new THREE.Group(); scene.add(root);
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0x263d40, roughness: .92, metalness: .08 });
  const span = terrain.step * (terrain.size - 1);
  const groundGeometry = new THREE.PlaneGeometry(span, span, terrain.size - 1, terrain.size - 1);
  groundGeometry.rotateX(-Math.PI / 2);
  const center = ll(terrain.origin[0], terrain.origin[1]);
  const positions = groundGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + center.x + terrain.x0 + span / 2;
    const z = positions.getZ(i) + center.z - terrain.y0 - span / 2;
    positions.setXYZ(i, x, terrainHeight(x, z) - .03, z);
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, terrainMat);
  ground.name = 'DEM terrain'; ground.receiveShadow = true; root.add(ground);
  const rim = new Batch();
  for (const z of [-501, 501]) rim.cube(0, -9, z, 1004, 2, 2, 0x9cb7a6);
  for (const x of [-501, 501]) rim.cube(x, -9, 0, 2, 2, 1004, 0x9cb7a6);
  rim.mesh(standard(), root);
  const grid = new THREE.GridHelper(1600, 64, 0x335054, 0x223d44); grid.position.y = -10.4; root.add(grid);
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x10252e }));
  underside.rotation.x = -Math.PI / 2; underside.position.y = -11; root.add(underside);
  const mass = new Batch(true), roofs = new Batch(true), windows = new Batch(true), details = new Batch(true), outlines = [];
  const footprintGrid = new Set(), buildingBounds = [];
  const roofHeight = (x, z) => {
    let h = terrainHeight(x, z) + 3;
    for (const b of buildings.buildings) {
      if (Math.abs(b.cx - x) < b.radius && Math.abs(b.cz - z) < b.radius) h = Math.max(h, b.h + terrainHeight(x, z));
    }
    return h;
  };
  for (const b of buildings.buildings) {
    const poly = b.p.map(p => new THREE.Vector2(p[0], -p[1]));
    b.cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
    b.cz = poly.reduce((a, p) => a + p.y, 0) / poly.length;
    b.radius = Math.max(...poly.map(p => Math.hypot(p.x - b.cx, p.y - b.cz)));
    const site = ll(...engine.site);
    // Replace the station's OSM masses with a readable custom platform; clear the intervention parcel.
    const overlapsSite = Math.min(...poly.map(p => p.x)) < site.x + 15 && Math.max(...poly.map(p => p.x)) > site.x - 15
      && Math.min(...poly.map(p => p.y)) < site.z + 13 && Math.max(...poly.map(p => p.y)) > site.z - 13;
    if (b.k === 'train_station' || overlapsSite) continue;
    const height = Math.max(3, Math.min(b.h, 70));
    // World-space bounds include terrain and the rooftop tanks/AC units. Use the
    // same rendered buildings (including parcel exclusions) for camera clearance.
    buildingBounds.push({
      minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)),
      minZ: Math.min(...poly.map(p => p.y)), maxZ: Math.max(...poly.map(p => p.y)),
      top: height + 3 + Math.max(terrainHeight(b.cx, b.cz + 2.5), ...poly.map(p => terrainHeight(p.x, p.y)))
    });
    const central = Math.hypot(b.cx, b.cz) < 180;
    const wallPalette = random() < .17 ? warmWalls : coolWalls;
    const wallColor = new THREE.Color(wallPalette[Math.floor(random() * wallPalette.length)]);
    const roofColor = wallColor.clone().multiplyScalar(1.17);
    const sign = THREE.ShapeUtils.isClockWise(poly) ? -1 : 1;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b2 = poly[(i + 1) % poly.length];
      const dx = b2.x - a.x, dz = b2.y - a.y, len = Math.hypot(dx, dz);
      if (len < .01) continue;
      const nx = dz / len * sign, nz = -dx / len * sign;
      mass.quad([a.x, 0, a.y], [b2.x, 0, b2.y], [b2.x, height, b2.y], [a.x, height, a.y], wallColor, [nx, 0, nz]);
      outlines.push(a.x, terrainHeight(a.x, a.y) + height + .08, a.y, b2.x, terrainHeight(b2.x, b2.y) + height + .08, b2.y);
      // Small lit windows on real footprint walls, batched in a single mesh.
      if (len < 65 && len > 3 && (central || random() < .35)) {
        for (let y = 3; y < height - 1; y += 3.6) {
          for (let u = 2; u < len - 1; u += 3.1) {
            if (random() < .37) continue;
            const px = a.x + dx * u / len + nx * .06, pz = a.y + dz * u / len + nz * .06;
            const wx = dx / len * .68, wz = dz / len * .68;
            windows.quad([px - wx, y, pz - wz], [px + wx, y, pz + wz], [px + wx, y + 1.25, pz + wz], [px - wx, y + 1.25, pz - wz], random() < .8 ? 0xffca80 : 0xb6e9e0, [nx, 0, nz]);
          }
        }
      }
      // Ground-floor shopfronts add little flecks of neighborhood color.
      if (central && len > 7 && len < 30 && random() < .22) {
        const px = (a.x + b2.x) / 2 + nx * .12, pz = (a.y + b2.y) / 2 + nz * .12;
        details.cube(px, 3, pz, Math.min(len * .65, 8), .7, .3, random() < .5 ? 0xc47150 : 0x8eae93, -Math.atan2(dz, dx));
      }
    }
    const triangles = THREE.ShapeUtils.triangulateShape(poly, []);
    for (const tri of triangles) {
      // Earcut's CCW XY triangles face down after mapping into the XZ ground plane.
      for (const index of [tri[0], tri[2], tri[1]]) roofs.vertex(poly[index].x, height, poly[index].y, 0, 1, 0, roofColor);
    }
    if (b.radius > 6 && b.radius < 30 && random() < .5) {
      details.cube(b.cx, height + .6, b.cz, 2.8, 1.2, 2, 0x9daca1);
      details.cube(b.cx + 2, height + .3, b.cz + 3, 1.5, .6, 1.5, 0x526d70);
    }
    if (height > 14 && b.radius > 7) {
      // Seeded rooftop AC bank and a water tank on taller blocks.
      for (let k = 0; k < 2 + Math.floor(random() * 3); k++)
        details.cube(b.cx - 3 + k * 1.7, height + .65, b.cz, 1.2, 1.3, 1.5, 0xa1b5af);
      details.add(waterTank, b.cx, height + 2, b.cz + 2.5, 1, 1, 1, 0x9ba9a3);
    }
    for (const p of poly) footprintGrid.add(`${Math.round(p.x / 5)},${Math.round(p.y / 5)}`);
    footprintGrid.add(`${Math.round(b.cx / 5)},${Math.round(b.cz / 5)}`);
  }
  const buildingMat = standard({ side: THREE.DoubleSide });
  mass.mesh(buildingMat, root, true); roofs.mesh(buildingMat, root, true); details.mesh(standard(), root, true);
  const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outlines, 3));
  const roofLines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xb4c6b5, transparent: true, opacity: .22 })); root.add(roofLines);
  const windowMat = basic({ side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }); windows.mesh(windowMat, root);

  const roads = new Batch(true), sidewalks = new Batch(true), markings = new Batch(true);
  const allSegments = new Map();
  for (const set of Object.values(engine.scenarios)) for (const h of set.heat) {
    const key = h.slice(0, 4).join(','); if (!allSegments.has(key)) allSegments.set(key, h);
  }
  for (const h of allSegments.values()) {
    const a = ll(h[0], h[1]), b = ll(h[2], h[3]);
    if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > 490) continue;
    const width = Math.max(3.1, Math.min(8, 2 + Math.log2(h[4] + 1)));
    strip(sidewalks, a, b, width + 1.9, .02, 0x576d66);
    strip(roads, a, b, width, .06, 0x263b3e);
    if (h[4] > 160) strip(markings, a, b, .23, .09, 0x748c7f);
  }
  const roadMat = standard();
  sidewalks.mesh(standard(), root); roads.mesh(roadMat, root); markings.mesh(basic(), root);
  const rails = new Batch(true), sleepers = new Batch(true);
  for (const rail of buildings.rails) {
    for (let i = 0; i < rail.length - 1; i++) {
      const a = new THREE.Vector3(rail[i][0], 0, -rail[i][1]), b = new THREE.Vector3(rail[i + 1][0], 0, -rail[i + 1][1]);
      if (Math.abs(a.x) > 700 && Math.abs(b.x) > 700) continue;
      strip(rails, a, b, 3.6, 4.8, 0x303e40);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len;
      for (const s of [-.74, .74]) strip(rails, new THREE.Vector3(a.x + nx * s, 0, a.z + nz * s), new THREE.Vector3(b.x + nx * s, 0, b.z + nz * s), .16, 5.04, 0xa5b5a8);
      const ang = -Math.atan2(dz, dx);
      for (let u = 0; u < len; u += 3.2) sleepers.cube(a.x + dx * u / len, 4.97, a.z + dz * u / len, .48, .14, 2.7, 0x626b5c, ang);
    }
  }
  // The railway is a long, low viaduct through the miniature.
  for (let x = -680; x < 681; x += 40) {
    const z = railZ(x);
    rails.cube(x, 2, z - 7, 3, 4, 26, 0x506768);
  }
  for (let x = -700; x < 700; x += 10)
    strip(rails, new THREE.Vector3(x, 0, railZ(x)), new THREE.Vector3(x + 10, 0, railZ(x + 10)), 28, 4.3, 0x465b5d);
  rails.mesh(standard({ metalness: .3 }), root, true); sleepers.mesh(standard(), root);
  const station = new Batch(true), stationGlow = new Batch(true);
  const stationPoint = ll(...engine.center), sx = stationPoint.x;
  const stationAngle = -Math.atan2(railZ(sx + 5) - railZ(sx - 5), 10);
  for (let x = sx - 100; x < sx + 100; x += 10) {
    const z = railZ(x);
    for (const side of [-1, 1]) {
      station.cube(x, 5.35, z + side * 6, 10.2, 1, 5, 0xbbc3aa, stationAngle);
      // A narrow outer-edge canopy leaves the boarding edge visible from above.
      station.cube(x, 9.5, z + side * 9, 10.2, .8, 2, 0x92a99b, stationAngle);
      if (Math.round((x - sx) / 10) % 2 === 0) {
        station.cube(x, 7.5, z + side * 8.2, .7, 3.6, .7, 0x9da99c);
        stationGlow.cube(x, 8.9, z + side * 8.5, 8, .16, .5, 0xffe4ae, stationAngle);
      }
    }
  }
  const sz = railZ(sx);
  station.cube(sx, 4, sz + 20, 30, 8, 15, 0x68867e);
  station.cube(sx, 8.3, sz + 20, 34, 1, 17, 0xa1b5a2);
  stationGlow.cube(sx, 5, sz + 27.6, 24, 2, .15, 0xffca83);
  stationGlow.cube(sx, 7, sz + 28, 27, .7, .2, 0xffb35e);
  station.mesh(standard(), root, true); stationGlow.mesh(basic(), root);
  const stationEnds = [sx - 106, sx + 106];
  buildingBounds.push({ minX: sx - 106, maxX: sx + 106,
    minZ: Math.min(...stationEnds.map(railZ)) - 11, maxZ: Math.max(...stationEnds.map(railZ)) + 11,
    top: 10.4 + Math.max(...stationEnds.map(x => terrainHeight(x, railZ(x)))) });
  buildingBounds.push({ minX: sx - 17, maxX: sx + 17, minZ: sz + 11.5, maxZ: sz + 28.5,
    top: 8.8 + terrainHeight(sx, sz + 20) });
  // Crosswalks around the two station exits.
  const crosswalk = new Batch(true);
  for (let i = 0; i < 7; i++) {
    crosswalk.cube(-23 + i * 2.7, .16, -52, 1.5, .07, 10, 0xaab9a4);
    crosswalk.cube(30 + i * 2.5, .16, 20, 1.3, .07, 9, 0xaab9a4);
  }
  crosswalk.mesh(standard(), root);

  const treeBatch = new Batch(true), trunkBatch = new Batch(true), parks = new Batch(true);
  const treeAt = (x, z, size = 1) => {
    trunkBatch.add(trunk, x, 2 * size, z, size, 4 * size, size, 0x6c7561);
    treeBatch.add(sphere, x, 5 * size, z, 2.9 * size, 3.5 * size, 2.8 * size, [0x417e69, 0x578a70, 0x6a9876][Math.floor(random() * 3)]);
  };
  for (const p of engine.pois.filter(p => p.cat === 'park')) {
    const pos = ll(p.lat, p.lon); if (Math.max(Math.abs(pos.x), Math.abs(pos.z)) > 420) continue;
    parks.cube(pos.x, .03, pos.z, 20, .07, 20, 0x3c6553);
    for (let i = 0; i < 9; i++) treeAt(pos.x + (random() - .5) * 20, pos.z + (random() - .5) * 20, .8 + random() * .6);
  }
  const busyMax = Math.max(1, ...[...allSegments.values()].map(h => h[4]));
  for (const h of allSegments.values()) {
    if (h[4] < busyMax * .15) continue;
    const a = ll(h[0], h[1]), b = ll(h[2], h[3]), len = a.distanceTo(b);
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (let d = 8 + random() * 8; d < len; d += 20 + random() * 10) {
      const side = random() < .5 ? -1 : 1;
      const x = a.x + (b.x - a.x) * d / len + nx * 6 * side;
      const z = a.z + (b.z - a.z) * d / len + nz * 6 * side;
      if (Math.max(Math.abs(x), Math.abs(z)) < 460 && !footprintGrid.has(`${Math.round(x / 5)},${Math.round(z / 5)}`))
        treeAt(x, z, .7 + random() * .35);
    }
  }
  let node = 0;
  const lampBatch = new Batch(true), lampGlow = new Batch(true);
  for (const h of allSegments.values()) {
    node++; if (node % 11) continue;
    const p = ll(h[0], h[1]); if (Math.max(Math.abs(p.x), Math.abs(p.z)) > 440) continue;
    lampBatch.cube(p.x + 2.8, 3, p.z, .25, 6, .25, 0x739383);
    lampBatch.cube(p.x + 2, 6, p.z, 2, .2, .25, 0x84998b);
    lampGlow.cube(p.x + 1.2, 5.9, p.z, 1, .25, .65, 0xffd698);
    if (node % 22 === 0 && !footprintGrid.has(`${Math.round((p.x + 5) / 5)},${Math.round((p.z + 3) / 5)}`)) treeAt(p.x + 5, p.z + 3, .8 + random() * .5);
  }
  parks.mesh(standard(), root); trunkBatch.mesh(standard(), root, true); treeBatch.mesh(standard({ flatShading: true }), root, true);
  lampBatch.mesh(standard(), root);
  const lampMat = basic({ transparent: true, opacity: .8 }); lampGlow.mesh(lampMat, root);
  const stationLight = new THREE.PointLight(0xffc68a, 160, 95, 2); stationLight.position.set(sx, terrainHeight(sx, sz) + 15, sz); root.add(stationLight);
  const nearbyRoofHeight = (x, z, radius = 60) => {
    let top = terrainHeight(x, z);
    for (const b of buildingBounds) {
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (Math.hypot(dx, dz) <= radius) top = Math.max(top, b.top);
    }
    return top;
  };
  root.userData.buildingBounds = buildingBounds;
  return { root, ground, terrainMat, roadMat, buildingMat, windowMat, lampMat, stationLight, roofHeight, buildingBounds, nearbyRoofHeight, roofLines, underside };
}

// Main Chūō track, joined from the supplied west and east polylines.
let route = [];
export function initRailRoute(rails, stationX = 0, stationZ = 0) {
  // Choose the line nearest the station, then join matching endpoints. The input
  // ordering and number of disconnected rail polylines differ between areas.
  let best = 0, bestDistance = Infinity;
  rails.forEach((line, index) => {
    for (let i = 0; i < line.length - 1; i++) {
      const [x, y] = line[i], [bx, by] = line[i + 1];
      const u = Math.max(0, Math.min(1, ((stationX - x) * (bx - x) + (-stationZ - y) * (by - y)) / ((bx - x) ** 2 + (by - y) ** 2 || 1)));
      const d = Math.hypot(x + (bx - x) * u - stationX, y + (by - y) * u + stationZ);
      if (d < bestDistance) { bestDistance = d; best = index; }
    }
  });
  route = rails[best].map(p => [p[0], -p[1]]).sort((a, b) => a[0] - b[0]);
  const used = new Set([best]);
  for (let pass = 0; pass < rails.length; pass++) {
    let joined = false;
    rails.forEach((line, index) => {
      if (used.has(index)) return;
      const points = line.map(p => [p[0], -p[1]]).sort((a, b) => a[0] - b[0]);
      const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2;
      if (close(route.at(-1), points[0])) { route.push(...points.slice(1)); joined = true; used.add(index); }
      else if (close(points.at(-1), route[0])) { route.unshift(...points.slice(0, -1)); joined = true; used.add(index); }
    });
    if (!joined) break;
  }
  route = route.filter((p, i) => !i || p[0] - route[i - 1][0] > .001);
}
export function railZ(x) {
  if (!route.length) return -20 - x * .04;
  let i = 0; while (i < route.length - 2 && route[i + 1][0] < x) i++;
  const a = route[i], b = route[i + 1], u = (x - a[0]) / Math.max(.01, b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * u;
}
export function buildHeat(scene, data) {
  const halo = new Batch(true), core = new Batch(true);
  const max = Math.max(1, ...data.heat.map(h => h[4]));
  for (const h of data.heat) {
    const a = ll(h[0], h[1]), b = ll(h[2], h[3]);
    if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > 480) continue;
    const weight = Math.pow(h[4] / max, .6);
    const tint = new THREE.Color().lerpColors(new THREE.Color(0x247b77), new THREE.Color(0xffce80), weight).multiplyScalar(.3 + weight * .9);
    strip(halo, a, b, 5 + weight * 7, .17, tint.clone().multiplyScalar(.24));
    strip(core, a, b, .5 + weight * 1.7, .19, tint);
  }
  const group = new THREE.Group(); scene.add(group);
  const mat = basic({ transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  halo.mesh(mat, group); core.mesh(mat, group);
  return { group, mat };
}

export function buildAlternative(parent, kind, site) {
  const group = new THREE.Group(); group.position.copy(site); parent.add(group);
  const body = new Batch(), glow = new Batch(), vegetation = new Batch();
  body.cube(0, .3, 0, 27, .7, 23, 0x849c87);
  body.cube(0, .72, 0, 25.5, .2, 21.5, 0x476c66);
  for (const x of [-13.5, 13.5]) glow.cube(x, .8, 0, .25, .13, 23.4, 0xa7e5cd);
  for (const z of [-11.5, 11.5]) glow.cube(0, .8, z, 27, .13, .25, 0xa7e5cd);
  if (kind === 'bike') {
    for (let row = -1; row <= 1; row += 2) for (let i = 0; i < 7; i++) {
      const x = -9 + i * 3, z = row * 5;
      body.cube(x, 1.2, z, .18, 1, 3.2, 0xc2c6b0);
      body.cube(x, 1.8, z, .18, 1.3, .18, 0xc2c6b0);
      const wheel = new THREE.TorusGeometry(.65, .11, 4, 10);
      // Torus faces XY by default; bikes face along the Z axis.
      const wg = wheel.clone(); wg.rotateY(Math.PI / 2);
      body.add(wg, x + .65, 1.45, z - .85, 1, 1, 1, 0x253e40);
      body.add(wg, x + .65, 1.45, z + .85, 1, 1, 1, 0x253e40); wg.dispose(); wheel.dispose();
      body.cube(x + .65, 1.85, z, .15, .18, 1.7, i % 2 ? 0xe7b37c : 0xa7cec0);
      body.cube(x + .65, 2.1, z, .15, .8, .15, 0xb8d5bc);
      body.cube(x + .65, 2.5, z + .7, .8, .14, .14, 0xb8d5bc);
      body.cube(x + .65, 2.4, z - .3, .5, .13, .4, 0x203c3d);
    }
    body.cube(-10, 2.5, 9, .25, 4, .25, 0x9ab5a2); glow.cube(-10, 4, 9, 3, 2, .3, 0xa7e5cd);
  } else if (kind === 'cafe') {
    body.cube(0, 3.4, -2, 17, 5.4, 12, 0xc6b79a);
    body.cube(0, 6.5, -2, 19, .9, 14, 0x425f58);
    glow.cube(0, 3, 4.04, 13, 3.5, .1, 0xffce83);
    for (let x = -7; x <= 7; x += 3.5) body.cube(x, 3.1, 4.12, .2, 4.4, .2, 0x355a54);
    for (let x = -8; x < 9; x += 2) body.cube(x, 4.7, 6, 2, .4, 4, x % 4 === 0 ? 0xe7d1a0 : 0xba6d4b);
    for (const x of [-9, 9]) body.cube(x, 2.6, 7, .2, 4, .2, 0x78917e);
    for (const x of [-6, 0, 6]) {
      body.add(new THREE.CylinderGeometry(1.1, 1.1, .2, 10), x, 1.9, 9, 1, 1, 1, 0xbeb398);
      for (const z of [7.5, 10.5]) body.cube(x, 1.1, z, 1, .7, 1, 0xc39670);
    }
  } else {
    body.cube(0, .9, 0, 20, .1, 17, 0x9baf93);
    for (const x of [-9, 9]) for (const z of [-7, 7]) {
      body.cube(x, 1.2, z, 3, 1.4, 3, 0x688c79);
      body.add(trunk, x, 3, z, 1, 4, 1, 0x6b7862);
      vegetation.add(sphere, x, 6, z, 3, 3.2, 3, 0x80a77d);
    }
    for (const z of [-6, 6]) {
      body.cube(0, 1.6, z, 8, .4, 1.7, 0xb6976c);
      body.cube(0, 2.2, z + Math.sign(z) * .8, 8, 1.3, .3, 0xb6976c);
      for (const x of [-3, 3]) body.cube(x, 1.1, z, .3, 1, 1.5, 0x365952);
    }
    for (const x of [-4, 0, 4]) glow.cube(x, 1, 0, .5, .1, .5, 0xffdb9e);
  }
  body.mesh(standard(), group, true); vegetation.mesh(standard({ flatShading: true }), group, true); glow.mesh(basic(), group);
  return group;
}

export function buildTrain(scene) {
  const bodies = new Batch(), glass = new Batch(), trim = new Batch();
  for (let car = 0; car < 10; car++) {
    const x = (car - 4.5) * 18.8;
    bodies.cube(x, 7.3, 0, 17.7, 3.8, 3.2, 0xc5ccc1);
    bodies.cube(x, 9.4, 0, 16.8, .45, 2.9, 0xa4b5aa);
    bodies.cube(x, 7, 0, 17.9, 1.1, 3.28, 0xf4a546);
    bodies.cube(x, 6.4, 0, 17.9, .25, 3.3, 0xffd469);
    bodies.cube(x, 9.8, 0, 3, .5, 2, 0x738b83);
    for (const z of [-1.66, 1.66]) for (let w = -6.5; w < 8; w += 2.6) glass.cube(x + w, 8.1, z, 1.8, 1.25, .04, 0xa2d0c5);
    for (const z of [-1.7, 1.7]) for (const d of [-4, 4]) trim.cube(x + d, 7.2, z, .1, 3, .04, 0xf0d09b);
    for (const wx of [-5.5, 5.5]) bodies.cube(x + wx, 5.5, 0, 3, .9, 2.9, 0x24393c);
  }
  glass.cube(93.1, 8.15, 0, .1, 1.3, 2.8, 0xa3ccc2);
  for (const z of [-1.05, 1.05]) trim.cube(93.3, 7.2, z, .12, .5, .45, 0xfff2c3);
  const group = new THREE.Group(); scene.add(group);
  bodies.mesh(standard({ metalness: .35, roughness: .4 }), group);
  glass.mesh(basic(), group); trim.mesh(basic(), group);
  return group;
}
export function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) m.dispose(); } });
  group.removeFromParent();
}
