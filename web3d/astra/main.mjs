import * as THREE from '../vendor/three.module.min.js';
import { TRAIN, normalizeFrames, frameAt, trainAtTime, openingTime } from './simulation.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const numberParam = (name, fallback) => params.has(name) && Number.isFinite(Number(params.get(name))) ? Number(params.get(name)) : fallback;
const ll = (lat, lon) => new THREE.Vector3((lon - 139.6358) * 111320 * Math.cos(35.7047 * Math.PI / 180), 0, -(lat - 35.7047) * 111320);
let seed = 2026;
function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
const state = { scenario: 'baseline', alt: 'bike', t: 1107.6, speed: clamp(numberParam('speed', 1.5), 0, 120), playing: true, orbit: params.get('orbit') !== '0' };
window.__ready = false;
if (params.get('ui') === '0') document.body.classList.add('hide-ui');

// One vertex-colored mesh per material, including all building footprints.
class Batch {
  constructor() { this.positions = []; this.normals = []; this.colors = []; }
  add(geometry, color = 0xffffff, matrix = new THREE.Matrix4(), shade = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), norm = new THREE.Vector3(), base = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      norm.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(v.x, v.y, v.z); this.normals.push(norm.x, norm.y, norm.z);
      const light = shade ? (norm.y > .7 ? 1.14 : .72 + .22 * clamp(v.y / 22, 0, 1)) : 1;
      this.colors.push(base.r * light, base.g * light, base.b * light);
    }
    if (g !== geometry) g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere(); return g;
  }
  mesh(material, parent = scene) {
    const mesh = new THREE.Mesh(this.geometry(), material); parent.add(mesh); return mesh;
  }
}
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
function box(batch, x, y, z, w, h, d, color, yaw = 0) {
  quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(w, h, d));
  batch.add(unitBox, color, matrix);
}
function cylinder(batch, x, y, z, r, h, color) {
  matrix.makeScale(r, h, r).setPosition(x, y, z); batch.add(unitCylinder, color, matrix);
}
function ribbon(batch, a, b, width, color, height = .2) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < .05) return;
  box(batch, (a.x + b.x) / 2, height, (a.z + b.z) / 2, width, .08, len, color, Math.atan2(dx, dz));
}
const scene = new THREE.Scene();
scene.background = new THREE.Color('#21353e');
scene.fog = new THREE.Fog('#21353e', 950, 2200);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('world').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 1, 3000);
const view = { angle: -.38, elevation: .83, radius: 835, target: new THREE.Vector3(0, 0, -5) };
const hemi = new THREE.HemisphereLight('#c6e5ef', '#56685f', 2.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd3a3', 3.2); sun.position.set(-240, 350, 180); scene.add(sun);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -520, right: 520, top: 520, bottom: -520, near: 1, far: 1300 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias = 1.5; sun.shadow.bias = -.0003;
const standard = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, metalness: .04 });
const buildingMaterial = standard.clone();
const groundMaterial = new THREE.MeshStandardMaterial({ color: '#3e5758', roughness: .94, metalness: .08 });
const luminous = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const tempObject = new THREE.Object3D();
let engine, map, tracks = [], arrivals = [], activeData, siteGroup, heatMesh, heatHalo, badgeData = [];
let bodies, heads, agentHalos, trainBody, trainTrim, trainWindows, trainDoors, windowMesh, streetLights, rain, eventGroup;
let stationPoint, sitePoint, trainArrival = 1110, currentTrainPhase = 'approaching', passengerCount = 0;
let frameCount = 0, outsideCount = 0, lastUI = -1;
const labels = [];
const stats = { renderedFrames: 0, activeAgents: 0, arrivalPassengers: 0, trainPhase: 'approaching', drawCalls: 0 };
window.__stats = stats;

function radialTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.15, 'rgba(255,255,255,.85)'); g.addColorStop(.45, 'rgba(255,255,255,.19)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(canvas);
}
const glowTexture = radialTexture();

function makeGround() {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(970, 17, 970), new THREE.MeshStandardMaterial({ color: '#20383c', roughness: .8 }));
  slab.position.y = -9; slab.receiveShadow = true; scene.add(slab);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(964, 964), groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.4; ground.receiveShadow = true; scene.add(ground);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: '#81a19e', transparent: true, opacity: .18 })); edge.position.copy(slab.position); scene.add(edge);
  const grid = new THREE.GridHelper(960, 48, '#628581', '#628581'); grid.position.y = -.3; grid.material.transparent = true; grid.material.opacity = .09; scene.add(grid);
  const markings = new Batch();
  for (let x = -460; x <= 460; x += 20) {
    box(markings, x, -.15, 474, .5, .1, x % 100 === 0 ? 6 : 3, '#9fb7af');
    box(markings, -474, -.15, x, x % 100 === 0 ? 6 : 3, .1, .5, '#9fb7af');
  }
  markings.mesh(standard);
}

function makeBuildings() {
  const buildings = new Batch(), roofs = new Batch(), windows = new Batch();
  const outline = [], windowGeo = new THREE.PlaneGeometry(1, 1);
  const palette = ['#7d9993', '#a2aea0', '#b8b69c', '#8caaa8', '#acb7a7', '#c1b59a', '#729694', '#b3bfb0'];
  for (const b of map.buildings) {
    if (b.p.length < 3) continue;
    const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length;
    const cz = -b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
    // Reserve the intervention footprint and rail corridor for their explicit models.
    if (Math.abs(cx - sitePoint.x) < 19 && Math.abs(cz - sitePoint.z) < 17) continue;
    if (Math.abs(cx) < 115 && Math.abs(cz - railAt(cx).z) < 9) continue;
    const shape = new THREE.Shape(b.p.map(p => new THREE.Vector2(p[0], p[1])));
    const height = Math.max(3, b.h);
    const winding = Math.sign(b.p.reduce((area, a, i) => { const c = b.p[(i + 1) % b.p.length]; return area + a[0] * c[1] - c[0] * a[1]; }, 0)) || 1;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 });
    matrix.makeRotationX(-Math.PI / 2); matrix.setPosition(0, .15, 0);
    buildings.add(geometry, palette[Math.floor(random() * palette.length)], matrix, true); geometry.dispose();
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length];
      outline.push(a[0], height + .25, -a[1], c[0], height + .25, -c[1]);
      const dx = c[0] - a[0], dz = -(c[1] - a[1]), len = Math.hypot(dx, dz);
      if (len < 3 || Math.hypot(cx, cz) > 540) continue;
      const count = Math.min(10, Math.floor(len / 3.8));
      for (let floor = 0; floor < Math.min(8, Math.floor(height / 3.4)); floor++) {
        for (let w = 0; w < count; w++) {
          if (random() < .43) continue;
          const t = (w + .5) / count;
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx));
          matrix.compose(new THREE.Vector3(a[0] + dx * t - winding * dz / len * .075, 2.1 + floor * 3.25, -a[1] + dz * t + winding * dx / len * .075), quaternion, new THREE.Vector3(1.3, 1.45, 1));
          windows.add(windowGeo, random() > .2 ? '#ffcf85' : '#a6d9d1', matrix);
        }
      }
    }
    if (random() > .66 && height > 6) {
      box(roofs, cx, height + .9, cz, 2.8, 1.5, 2.2, '#637c7b');
      box(roofs, cx, height + 1.7, cz, 3, .2, 2.4, '#b8c2b4');
    }
  }
  const mesh = buildings.mesh(buildingMaterial); mesh.castShadow = true; mesh.receiveShadow = true;
  roofs.mesh(standard);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
  scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#e2e5cc', transparent: true, opacity: .22 })));
  windowMesh = windows.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .65, toneMapped: false }));
  windowGeo.dispose();
}

// Join the two OSM ways that form the west-to-east station track.
let railPath;
function railAt(x) {
  let i = 0;
  while (i < railPath.length - 2 && railPath[i + 1][0] < x) i++;
  const a = railPath[i], b = railPath[i + 1];
  const t = (x - a[0]) / Math.max(.001, b[0] - a[0]);
  return { x, z: -mix(a[1], b[1], t), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function makeRailway() {
  const trackBed = new Batch(), steel = new Batch(), station = new Batch(), platform = new Batch();
  for (const path of map.rails) {
    for (let i = 1; i < path.length; i++) {
      const a = new THREE.Vector3(path[i - 1][0], 0, -path[i - 1][1]), b = new THREE.Vector3(path[i][0], 0, -path[i][1]);
      if (Math.abs(a.x) > 610 && Math.abs(b.x) > 610) continue;
      a.x = clamp(a.x, -610, 610); b.x = clamp(b.x, -610, 610);
      ribbon(trackBed, a, b, 5.4, '#526461', 4.2);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
      for (const side of [-1, 1]) {
        const ax = a.x + Math.cos(angle) * 1.1 * side, az = a.z - Math.sin(angle) * 1.1 * side;
        const bx = b.x + Math.cos(angle) * 1.1 * side, bz = b.z - Math.sin(angle) * 1.1 * side;
        ribbon(steel, new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz), .18, '#b9c3b6', 4.55);
      }
      for (let s = 0; s < len; s += 4) box(trackBed, mix(a.x, b.x, s / len), 4.4, mix(a.z, b.z, s / len), 4, .15, .5, '#78847a', angle);
    }
  }
  // Concrete viaduct and compact platform canopy leave the arriving train visible.
  for (let x = -480; x <= 480; x += 38) {
    const p = railAt(x); box(station, x, 1.5, p.z + 2, 2.2, 6, 15, '#516c6b', p.angle);
  }
  for (let x = -105; x <= 105; x += 15) {
    const p = railAt(x);
    box(platform, x, 5.1, p.z - 5.3, 15, 1.2, 5.5, '#bcbcac', p.angle);
    box(platform, x, 5.75, p.z - 2.9, 15, .12, .55, '#f0bc63', p.angle);
    if (Math.abs(x) < 75) {
      box(station, x, 8.5, p.z - 6.8, .5, 6, .5, '#d4d9c4');
      box(station, x, 11.8, p.z - 6, 15.3, .65, 4.2, '#b9d1c1', p.angle);
    }
  }
  box(station, -20, 4.8, -1, 37, 9, 11, '#667e78');
  box(station, -20, 9.5, -1, 40, .8, 13, '#cad3bd');
  box(station, -20, 4, 5, 18, 6.5, .3, '#1b4549');
  box(station, -20, 7.1, 5.25, 25, .8, .25, '#e9a259');
  trackBed.mesh(standard).receiveShadow = true; steel.mesh(standard); platform.mesh(standard); station.mesh(standard).castShadow = true;
  makeLabel('ASAGAYA  /  阿佐ヶ谷', new THREE.Vector3(-25, 29, -13), 'station-label', 1);
}
function makeRoads() {
  const roads = new Batch();
  for (const seg of engine.scenarios.baseline.heat) {
    const a = ll(seg[0], seg[1]), b = ll(seg[2], seg[3]);
    ribbon(roads, a, b, clamp(3.5 + Math.log1p(seg[4]) * .58, 4, 8), '#263f44', -.06);
  }
  roads.mesh(standard).receiveShadow = true;
  const crossings = new Batch();
  for (const [x, z, angle] of [[-20, -43, -.1], [23, -49, -.3], [-22, 40, -.06], [-83, 22, -.1]]) {
    for (let i = -3; i <= 3; i++) box(crossings, x + i * 1.7, .2, z, .8, .1, 5.3, '#aec1b2', angle);
  }
  crossings.mesh(standard);
}
function setHeat(data) {
  for (const mesh of [heatMesh, heatHalo]) if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  const core = new Batch(), halo = new Batch();
  const max = Math.max(...data.heat.map(h => h[4]));
  const cold = new THREE.Color('#4f9393'), hot = new THREE.Color('#ffc16e');
  for (const h of data.heat) {
    const a = ll(h[0], h[1]), b = ll(h[2], h[3]);
    const value = Math.pow(h[4] / max, .44);
    const color = cold.clone().lerp(hot, value).multiplyScalar(.24 + value * .76);
    ribbon(core, a, b, .35 + 1.6 * value, color, .13);
    ribbon(halo, a, b, 2.6 + 5 * value, color, .07);
  }
  heatMesh = core.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false }));
  heatHalo = halo.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .13, blending: THREE.AdditiveBlending, depthWrite: false }));
}

const crownGeo = new THREE.IcosahedronGeometry(1, 1);
function tree(batch, x, z, size = 1) {
  cylinder(batch, x, 2 * size, z, .45 * size, 4 * size, '#6e7960');
  matrix.makeScale(3.7 * size, 4.2 * size, 3.4 * size).setPosition(x, 6.2 * size, z);
  batch.add(crownGeo, ['#537f68', '#688e6c', '#7b9b72'][Math.floor(random() * 3)], matrix);
}
function makeTreesAndLamps() {
  const trees = new Batch(), poles = new Batch(), lamps = [];
  for (const poi of engine.pois.filter(p => p.cat === 'park')) {
    const p = ll(poi.lat, poi.lon);
    for (let i = 0; i < 7; i++) tree(trees, p.x + (random() - .5) * 26, p.z + (random() - .5) * 24, .75 + random() * .75);
  }
  const taken = new Set();
  for (const h of engine.scenarios.baseline.heat) {
    const p = ll(h[0], h[1]); const key = `${Math.round(p.x / 30)},${Math.round(p.z / 30)}`;
    if (taken.has(key) || h[4] < 30 || Math.hypot(p.x, p.z) > 440) continue;
    taken.add(key); p.x += 3;
    cylinder(poles, p.x, 3.5, p.z, .19, 7, '#77918a');
    box(poles, p.x, 7, p.z, 1.4, .3, 1.4, '#e7cf9e'); lamps.push(p.x, 7.4, p.z);
    if (random() < .25) tree(trees, p.x + 2.4, p.z + 2, .7);
  }
  trees.mesh(standard).castShadow = true; poles.mesh(standard);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  streetLights = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffcf8c', size: 10, map: glowTexture, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); scene.add(streetLights);
}

function makeSite() {
  if (siteGroup) { scene.remove(siteGroup); siteGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== standard && o.material !== luminous) o.material.dispose(); } }); }
  siteGroup = new THREE.Group(); siteGroup.position.copy(sitePoint); scene.add(siteGroup);
  const b = new Batch(), accents = new Batch();
  box(b, 0, .6, 0, 35, 1.2, 29, '#a6b5a0');
  for (const z of [-14.4, 14.4]) box(accents, 0, 1.25, z, 35, .15, .35, '#d5f3aa');
  for (const x of [-17.4, 17.4]) box(accents, x, 1.25, 0, .35, .15, 29, '#d5f3aa');
  if (state.alt === 'bike') {
    box(b, 0, 5.5, -7, 29, .65, 10, '#7b9b90');
    for (const x of [-13, 13]) box(b, x, 3, -7, .5, 5, .5, '#d9ddbd');
    const wheel = new THREE.TorusGeometry(1.05, .17, 4, 9);
    for (let i = 0; i < 9; i++) {
      const x = -12 + i * 3;
      box(b, x, 1.8, 3, .22, 1.4, 4.6, '#677f7a');
      for (const z of [-.7, 2.1]) {
        matrix.makeRotationY(Math.PI / 2).setPosition(x, 2.25, z); b.add(wheel, '#263d43', matrix);
      }
      box(b, x, 2.9, .6, .3, .45, 3.1, i % 2 ? '#dba86a' : '#608e9a');
      box(b, x, 3.6, -.4, .25, 1.6, .25, '#a4b8a8');
      box(b, x, 4.3, -.4, 1.6, .2, .2, '#d4d8ba');
      box(b, x, 3.7, 1.5, .9, .25, .7, '#30494c');
    }
    wheel.dispose();
  } else if (state.alt === 'cafe') {
    box(b, 0, 5.4, -3, 22, 9, 15, '#d8bd92');
    box(b, 0, 10.3, -3, 25, 1, 17, '#617e71');
    box(b, 0, 5, 4.6, 18, 5.5, .2, '#2f5c5b');
    for (let i = -2; i <= 2; i++) box(b, i * 4, 5.2, 4.8, .35, 6, .3, '#eddec0');
    for (let i = 0; i < 11; i++) box(b, -10 + i * 2, 7.5, 7.2, 2, .6, 5.2, i % 2 ? '#e7dabb' : '#b76d51');
    for (const x of [-8, 8]) { cylinder(b, x, 2.5, 10, 2.2, .4, '#cfaf7e'); cylinder(b, x, 1.8, 10, .2, 2, '#596f64'); }
    box(accents, 0, 8.8, 4.65, 9, .45, .1, '#ffe4a3');
  } else {
    for (const x of [-12, 12]) for (const z of [-9, 9]) {
      box(b, x, 1.8, z, 5, 1.5, 5, '#687f71'); tree(b, x, z, 1.05);
    }
    for (const x of [-7, 7]) {
      box(b, x, 2, 0, 2, .5, 9, '#c1a17c'); box(b, x + 1, 3, 0, .3, 2, 9, '#c1a17c');
      for (const z of [-3, 3]) box(b, x, 1.3, z, 1.5, 1.6, .4, '#536f66');
    }
    cylinder(b, 0, 1.35, 0, 4.2, .3, '#c5ccb0');
  }
  b.mesh(standard, siteGroup).castShadow = true; accents.mesh(luminous, siteGroup);
  const summary = engine.alternatives[state.alt].summary;
  for (const [id, key] of [['metric-visits', 'site_visits'], ['metric-foot', 'site_foot_traffic'], ['metric-shops', 'nearby_shop_visits'], ['metric-bike', 'bike_extra_walk_min_total']]) $(id).textContent = summary[key].toLocaleString('en-US', { maximumFractionDigits: 1 });
  $('alt-title').textContent = { bike: 'Bike parking', cafe: 'Corner café', plaza: 'Open plaza' }[state.alt];
  document.querySelectorAll('[data-alt]').forEach(el => { el.classList.toggle('active', el.dataset.alt === state.alt); el.setAttribute('aria-pressed', String(el.dataset.alt === state.alt)); });
  siteLabel.el.textContent = { bike: '01  /  BIKE PARKING', cafe: '01  /  CORNER CAFÉ', plaza: '01  /  OPEN PLAZA' }[state.alt];
}
let siteLabel;

function makeTrain() {
  const body = new Batch(), trim = new Batch(), windows = new Batch(), doors = new Batch();
  box(body, 0, 0, 0, 18.6, 3.9, 3.3, '#d6d9c5');
  box(body, 0, 2.05, 0, 18, .4, 3.2, '#9eafa7');
  box(body, 0, -2, 0, 17.5, .45, 2.8, '#34494c');
  for (const z of [-1.69, 1.69]) {
    box(trim, 0, -.8, z, 18.6, 1.05, .09, '#f59a3e');
    box(trim, 0, -.13, z, 18.6, .22, .1, '#ffd66c');
    for (let i = 0; i < 8; i++) box(windows, -7.4 + 2.1 * i, .8, z, 1.4, 1.25, .12, '#8ac2c5');
    for (const x of [-5.2, 0, 5.2]) box(doors, x, .25, z * 1.015, 1.2, 2.9, .12, '#4d7376');
  }
  box(windows, 9.35, .65, 0, .08, 1.6, 2.6, '#c5e7cf');
  box(trim, 9.4, -.75, 0, .1, .8, 3.1, '#ffb858');
  for (const z of [-1.15, 1.15]) box(windows, 9.44, -.9, z, .12, .4, .45, '#fff0c2');
  trainBody = new THREE.InstancedMesh(body.geometry(), standard, 10);
  trainTrim = new THREE.InstancedMesh(trim.geometry(), standard, 10);
  trainWindows = new THREE.InstancedMesh(windows.geometry(), luminous, 10);
  trainDoors = new THREE.InstancedMesh(doors.geometry(), luminous, 10);
  for (const mesh of [trainBody, trainTrim, trainWindows, trainDoors]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh); }
  trainBody.castShadow = true;
}
function updateTrain() {
  // Illustrative ten-minute service; alighting figures are actual station-start tracks.
  const motion = trainAtTime(state.t);
  trainArrival = motion.arrival; currentTrainPhase = motion.phase;
  passengerCount = arrivals.filter(a => a.time >= trainArrival && a.time < trainArrival + TRAIN.dwell - 1.1).length;
  for (let i = 0; i < 10; i++) {
    const p = railAt(motion.center + (i - 4.5) * 19.3);
    tempObject.position.set(p.x, 6.8, p.z); tempObject.rotation.set(0, p.angle, 0); tempObject.scale.set(1, 1, 1); tempObject.updateMatrix();
    for (const mesh of [trainBody, trainTrim, trainWindows, trainDoors]) mesh.setMatrixAt(i, tempObject.matrix);
  }
  for (const mesh of [trainBody, trainTrim, trainWindows, trainDoors]) { mesh.visible = motion.visible; mesh.instanceMatrix.needsUpdate = true; }
  trainDoors.visible = motion.visible && currentTrainPhase !== 'stopped';
  stats.trainPhase = currentTrainPhase; stats.arrivalPassengers = passengerCount;
}

function prepareTracks(data) {
  arrivals = [];
  tracks = data.tracks.map((tr, index) => {
    const type = tr.name.startsWith('住民') ? 0 : tr.name.startsWith('来訪者') ? 1 : 2;
    const sorted = normalizeFrames(tr.f, ll);
    const firstMove = sorted.find(f => f.state === '移動');
    const arrival = type !== 0 && firstMove && firstMove.pos.distanceTo(stationPoint) < 85 ? firstMove.time : null;
    if (arrival !== null) arrivals.push({ time: arrival, index, type, pos: firstMove.pos });
    return { name: tr.name, frames: sorted, type, arrival, index };
  });
  stats.tracks = tracks.length;
}
const agentColors = ['#88f1c3', '#ffd18b', '#b6afff'];
const agentTints = agentColors.map(color => new THREE.Color(color));
function makeAgents() {
  bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.65, 1.65, 2, 5), new THREE.MeshStandardMaterial({ roughness: .6, emissive: '#a4cfb7', emissiveIntensity: .12 }), 500);
  heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.64, 6, 4), new THREE.MeshStandardMaterial({ color: '#f6dfbb', roughness: .75 }), 500);
  agentHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, opacity: .6, blending: THREE.AdditiveBlending }), 500);
  for (const mesh of [bodies, heads, agentHalos]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh); }
}
const walkPos = new THREE.Vector3();
function updateAgents() {
  let n = 0, alighting = 0;
  for (const tr of tracks) {
    const f = tr.frames;
    if (!f.length || state.t < f[0].time || state.t > f[f.length - 1].time + .2) continue;
    const i = frameAt(f, state.t), a = f[i], b = f[Math.min(i + 1, f.length - 1)];
    if (/在宅|乗車|帰宅|終了/.test(a.state)) continue;
    const moving = a.state === '移動' || a.state === '降車';
    const t = moving && b.time > a.time ? clamp((state.t - a.time) / (b.time - a.time), 0, 1) : 0;
    walkPos.copy(a.pos).lerp(b.pos, t);
    // Show actual station-start tracks emerging from train doors, then join their path.
    if (tr.arrival !== null && tr.arrival >= trainArrival && tr.arrival < trainArrival + TRAIN.dwell - 1.1 && currentTrainPhase === 'stopped' && state.t >= tr.arrival && state.t < tr.arrival + 1.1) {
      alighting++;
      const progress = smooth(0, 1.1, state.t - tr.arrival);
      const doorX = -80 + (tr.index % 9) * 17;
      const door = railAt(doorX);
      walkPos.x = mix(doorX, walkPos.x, progress);
      walkPos.z = mix(door.z - 3, walkPos.z, progress);
      walkPos.y = mix(5.5, 0, progress);
    }
    const bob = moving ? Math.sin(state.t * 35 + tr.index * 3) * .18 : 0;
    tempObject.position.set(walkPos.x, walkPos.y + 1.5 + bob, walkPos.z); tempObject.rotation.set(0, Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z), moving ? Math.sin(state.t * 25 + tr.index) * .06 : 0); tempObject.scale.setScalar(1.35); tempObject.updateMatrix();
    bodies.setMatrixAt(n, tempObject.matrix); bodies.setColorAt(n, agentTints[tr.type]);
    tempObject.position.y += 2; tempObject.scale.setScalar(1.2); tempObject.updateMatrix(); heads.setMatrixAt(n, tempObject.matrix);
    tempObject.position.y = walkPos.y + .2; tempObject.rotation.set(-Math.PI / 2, 0, 0); tempObject.scale.setScalar(1); tempObject.updateMatrix(); agentHalos.setMatrixAt(n, tempObject.matrix); agentHalos.setColorAt(n, agentTints[tr.type]);
    n++;
  }
  for (const mesh of [bodies, heads, agentHalos]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  outsideCount = n; stats.activeAgents = n; stats.alightingAgents = alighting;
}

let burst;
function makeWeatherAndBurst() {
  const rainPositions = new Float32Array(1500 * 2 * 3);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#a6cfdd', transparent: true, opacity: .28, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
  const burstGeo = new THREE.BufferGeometry(); burstGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  burst = new THREE.Points(burstGeo, new THREE.PointsMaterial({ size: 4.4, map: glowTexture, color: '#ffdc9a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); burst.frustumCulled = false; scene.add(burst);
}
function updateEffects() {
  rain.visible = state.scenario === 'rain';
  if (rain.visible) {
    const arr = rain.geometry.attributes.position.array;
    for (let i = 0; i < 1500; i++) {
      const x = ((i * 73.713) % 920) - 460, z = ((i * 127.47) % 920) - 460;
      const y = 160 - ((i * 17.31 + state.t * 55) % 160);
      arr.set([x, y, z, x - 1.3, y + 6, z + .6], i * 6);
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }
  const age = state.t - trainArrival;
  burst.visible = currentTrainPhase === 'stopped' && age < 5.7 && passengerCount > 0;
  stats.decorativeBurst = burst.visible;
  if (burst.visible) {
    const arr = burst.geometry.attributes.position.array;
    for (let i = 0; i < 120; i++) {
      const delay = (i % 20) * .06;
      const progress = clamp((age - delay) / 4.4, 0, 1);
      const x = -100 + (i % 10) * 19;
      const p = railAt(x), direction = i % 3 ? -1 : 1;
      arr.set([mix(x, stationPoint.x + Math.sin(i * 3.1) * 28, progress), mix(7, .7, progress) + Math.sin(progress * Math.PI) * 2, p.z + direction * progress * (30 + (i % 7) * 4)], i * 3);
    }
    burst.material.opacity = (1 - smooth(3.7, 5.7, age)) * .85;
    burst.geometry.attributes.position.needsUpdate = true;
  }
}

function makeLabel(text, position, className = '', priority = 0) {
  const el = document.createElement('div'); el.className = `poi-label ${className}`; el.textContent = text; $('labels').appendChild(el);
  const item = { el, position, priority }; labels.push(item); return item;
}
function setBadges() {
  for (const b of badgeData) { b.el.remove(); labels.splice(labels.indexOf(b), 1); }
  badgeData = [];
  const pois = [...engine.pois, ...(activeData.extra || [])];
  const names = new Map(pois.map(p => [p.name, p]));
  const counts = new Map();
  const shopCats = new Set(['shop', 'cafe', 'food', 'grocery', 'bar', 'service']);
  for (const tr of tracks) for (const f of tr.frames) {
    const name = f.state.replace(/^寄り道:/, '');
    if (names.has(name) && shopCats.has(names.get(name).cat)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const top = activeData.summary.top_pois.filter(([name]) => names.has(name) && shopCats.has(names.get(name).cat));
  const chosen = [...top.map(([name, count]) => ({ name, count, total: true })), ...[...counts].sort((a, b) => b[1] - a[1]).filter(([name]) => !top.some(p => p[0] === name)).map(([name, count]) => ({ name, count, total: false }))];
  for (const item of chosen.slice(0, 7)) {
    const p = names.get(item.name), pos = ll(p.lat, p.lon); pos.y = 25;
    for (const b of map.buildings) {
      const x = b.p.reduce((s, p) => s + p[0], 0) / b.p.length, z = -b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
      if (Math.hypot(x - pos.x, z - pos.z) < 18) pos.y = Math.max(pos.y, b.h + 12);
    }
    const label = makeLabel('', pos);
    const name = document.createElement('span'); name.textContent = item.name;
    const value = document.createElement('b'); value.textContent = item.count;
    const sub = document.createElement('small'); sub.textContent = item.total ? 'VISITS / MODEL DAY' : 'VISITS / SAMPLED TRACKS';
    label.el.append(name, value, sub); badgeData.push(label);
  }
}
const projected = new THREE.Vector3();
function updateLabels() {
  const rectangles = [];
  const panel = document.querySelector('.control-panel');
  if (!document.body.classList.contains('hide-ui')) rectangles.push(panel.getBoundingClientRect());
  for (const item of [...labels].sort((a, b) => b.priority - a.priority)) {
    projected.copy(item.position).project(camera);
    const x = (projected.x * .5 + .5) * innerWidth, y = (-projected.y * .5 + .5) * innerHeight;
    const w = item.el.offsetWidth || 130, h = item.el.offsetHeight || 34;
    const rect = { left: x - w / 2, right: x + w / 2, top: y - h, bottom: y + 15 };
    let visible = projected.z > -1 && projected.z < 1 && x > 35 && x < innerWidth - 35 && y > 100 && y < innerHeight - 170;
    if (!item.priority && rectangles.some(r => !(rect.right + 6 < r.left || rect.left - 6 > r.right || rect.bottom < r.top || rect.top > r.bottom))) visible = false;
    item.el.style.display = visible ? '' : 'none';
    if (visible) { item.el.style.left = `${x}px`; item.el.style.top = `${y}px`; rectangles.push(rect); }
  }
}

function setScenario() {
  // Files contain separate experiments, not a Cartesian product of scenario × alternative.
  // Baseline uses the selected alternative's tracks; other scenarios retain their own tracks.
  activeData = state.scenario === 'baseline' ? engine.alternatives[state.alt] : engine.scenarios[state.scenario];
  prepareTracks(activeData); setHeat(activeData); setBadges();
  $('scenario').value = state.scenario;
  const counts = activeData.summary.hourly_alight;
  const max = Math.max(...counts);
  $('histogram').replaceChildren(...counts.map(c => { const el = document.createElement('i'); el.style.height = `${Math.max(2, c / max * 26)}px`; return el; }));
  buildingMaterial.roughness = state.scenario === 'rain' ? .28 : .88;
  buildingMaterial.metalness = state.scenario === 'rain' ? .24 : .04;
  groundMaterial.roughness = state.scenario === 'rain' ? .18 : .94;
  groundMaterial.metalness = state.scenario === 'rain' ? .45 : .08;
  if (eventGroup) eventGroup.visible = state.scenario === 'event';
}
function makeEvent() {
  eventGroup = new THREE.Group(); scene.add(eventGroup); const b = new Batch();
  for (let i = 0; i < 5; i++) {
    const x = -70 + i * 13;
    box(b, x, 2, 35, 9, 3.5, 6, '#cbb18b');
    box(b, x, 4.4, 35, 10, 1.2, 7, i % 2 ? '#d28b70' : '#8dbbb0');
    cylinder(b, x, 8, 35, .2, 8, '#e3d5ae');
    box(b, x + 1.5, 11, 35, 3, 2, .1, '#ffd98b');
  }
  b.mesh(standard, eventGroup); eventGroup.visible = false;
}
function lighting() {
  const t = state.t;
  const daylight = smooth(350, 460, t) * (1 - smooth(1050, 1180, t));
  const dusk = smooth(960, 1070, t) * (1 - smooth(1110, 1200, t));
  const wet = state.scenario === 'rain';
  const sky = new THREE.Color('#10212e').lerp(new THREE.Color(wet ? '#354b56' : '#587b80'), daylight).lerp(new THREE.Color('#6b6761'), dusk * .4);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  hemi.intensity = .65 + daylight * 1.55;
  sun.intensity = (wet ? .45 : 1) * (.15 + daylight * 2.5 + dusk * 1.2);
  sun.color.set('#f7ecd3').lerp(new THREE.Color('#ffab69'), dusk);
  sun.position.set(-280, 100 + daylight * 320, 160);
  windowMesh.material.opacity = .12 + (1 - daylight) * .88;
  streetLights.material.opacity = .08 + (1 - daylight) * .9;
  heatMesh.material.opacity = .22 + (1 - daylight) * .65;
  heatHalo.material.opacity = .025 + (1 - daylight) * .2;
  groundMaterial.color.set(wet ? '#304950' : '#405a59');
  renderer.toneMappingExposure = 1.05 + (1 - daylight) * .14;
  $('period').textContent = wet ? 'RAIN OVER ASAGAYA' : daylight < .12 ? 'AFTER DARK' : dusk > .3 ? 'GOLDEN HOUR' : t < 600 ? 'MORNING COMMUTE' : 'DAYLIGHT';
}

function syncUI() {
  const minute = Math.floor(state.t);
  $('clock').textContent = `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  $('timeline').value = state.t;
  $('active-count').textContent = `${outsideCount} people outside`;
  $('train-status').textContent = currentTrainPhase === 'stopped' ? `Doors open · ${passengerCount} sampled arrivals` : currentTrainPhase === 'approaching' ? 'Arriving at Asagaya' : 'Departing → Tokyo';
  [...$('histogram').children].forEach((el, i) => el.classList.toggle('current', Math.floor(state.t / 60) - 6 === i));
  $('play').textContent = state.playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', state.playing ? 'Pause simulation' : 'Play simulation');
  $('orbit').classList.toggle('active', state.orbit); $('orbit').setAttribute('aria-pressed', String(state.orbit));
  if (![...$('speed').options].some(o => Number(o.value) === state.speed)) { const option = new Option(`${state.speed} min/s`, String(state.speed)); $('speed').add(option); }
  $('speed').value = state.speed;
  window.__state = { ...state };
}
function applySettings(settings = {}) {
  let changeData = false;
  if (settings.scenario && Object.hasOwn(engine.scenarios, settings.scenario)) { state.scenario = settings.scenario; changeData = true; }
  if (settings.alt && Object.hasOwn(engine.alternatives, settings.alt)) { state.alt = settings.alt; makeSite(); changeData = true; }
  if (Number.isFinite(Number(settings.t)) && settings.t !== undefined) state.t = clamp(Number(settings.t), 360, 1439.999);
  if (Number.isFinite(Number(settings.speed)) && settings.speed !== undefined) state.speed = clamp(Number(settings.speed), 0, 120);
  if (settings.orbit !== undefined) state.orbit = !!Number(settings.orbit);
  if (settings.playing !== undefined) state.playing = !!settings.playing;
  if (changeData) setScenario();
  render(0); syncUI(); return { ...state };
}

let pointer = null;
renderer.domElement.addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); state.orbit = false; syncUI(); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!pointer) return;
  view.angle -= (e.clientX - pointer.x) * .005;
  view.elevation = clamp(view.elevation + (e.clientY - pointer.y) * .003, .35, 1.25);
  pointer = { x: e.clientX, y: e.clientY };
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(name, () => { pointer = null; });
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); view.radius = clamp(view.radius * Math.exp(e.deltaY * .001), 250, 1500); }, { passive: false });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
$('play').onclick = () => { state.playing = !state.playing; syncUI(); };
$('orbit').onclick = () => { state.orbit = !state.orbit; syncUI(); };
$('speed').onchange = e => applySettings({ speed: Number(e.target.value) });
$('timeline').oninput = e => applySettings({ t: Number(e.target.value) });
$('scenario').onchange = e => applySettings({ scenario: e.target.value });
document.querySelectorAll('[data-alt]').forEach(el => { el.onclick = () => applySettings({ alt: el.dataset.alt }); });
$('reset').onclick = () => { Object.assign(view, { angle: -.38, elevation: .83, radius: 835 }); state.orbit = true; syncUI(); };
window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); state.playing = !state.playing; syncUI(); } });

function render(dt) {
  if (state.orbit && state.playing) view.angle += dt * .018;
  const radius = view.radius * (innerWidth < 650 ? 1.16 : 1);
  camera.position.set(view.target.x + Math.sin(view.angle) * Math.cos(view.elevation) * radius, Math.sin(view.elevation) * radius, view.target.z + Math.cos(view.angle) * Math.cos(view.elevation) * radius);
  camera.lookAt(view.target);
  updateTrain(); updateAgents(); updateEffects(); lighting();
  renderer.render(scene, camera); updateLabels();
  stats.drawCalls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles; stats.renderedFrames++;
  if (lastUI !== Math.floor(state.t * 5) || frameCount++ % 20 === 0) { syncUI(); lastUI = Math.floor(state.t * 5); }
}
let lastFrame;
function animate(now) {
  requestAnimationFrame(animate);
  // Keep the opening on wall-clock time even on slower software WebGL frames.
  const dt = lastFrame === undefined ? 0 : Math.min(1, (now - lastFrame) / 1000); lastFrame = now;
  if (state.playing) { state.t += dt * state.speed; if (state.t >= 1440) state.t = 360 + (state.t - 1440); }
  render(dt);
}
async function init() {
  const responses = await Promise.all([fetch('../data/buildings.json'), fetch('../data/engine.json')]);
  for (const response of responses) if (!response.ok) throw new Error(`Local data could not be loaded (${response.status})`);
  [map, engine] = await Promise.all(responses.map(r => r.json()));
  stationPoint = ll(...engine.center); sitePoint = ll(...engine.site);
  railPath = [...map.rails[5], ...map.rails[0].slice(1)].sort((a, b) => a[0] - b[0]);
  state.scenario = Object.hasOwn(engine.scenarios, params.get('scenario')) ? params.get('scenario') : 'baseline';
  state.alt = Object.hasOwn(engine.alternatives, params.get('alt')) ? params.get('alt') : 'bike';
  makeGround(); makeRoads(); makeRailway(); makeBuildings(); makeTreesAndLamps();
  siteLabel = makeLabel('', sitePoint.clone().add(new THREE.Vector3(0, 31, 0)), 'site-label', 2);
  makeSite(); makeTrain(); makeAgents(); makeWeatherAndBurst(); makeEvent(); setScenario();
  // A stopped train and real alighting tracks appear within the first three seconds.
  state.t = clamp(numberParam('t', openingTime(arrivals, state.speed)), 360, 1439.999);
  window.__set = applySettings;
  render(0); window.__ready = true; $('loading').classList.add('done');
  requestAnimationFrame(animate);
}
init().catch(error => { console.error(error); $('loading').textContent = `Unable to build Asagaya: ${error.message}. Serve the repository root over HTTP.`; window.__error = error.message; });
