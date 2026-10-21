import * as THREE from '../vendor/three.module.min.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const ORIGIN = { lat: 35.7047, lon: 139.6358, cos: Math.cos(35.7047 * Math.PI / 180) };
const palette = { resident: new THREE.Color('#70d6ff'), visitor: new THREE.Color('#ffd166'), commuter: new THREE.Color('#ff6b89') };
const state = {
  scenario: q.get('scenario') || 'baseline', alt: q.get('alt') || 'bike',
  time: q.has('t') && Number.isFinite(+q.get('t')) ? +q.get('t') : 536,
  speed: q.has('speed') && Number.isFinite(+q.get('speed')) ? +q.get('speed') : 1,
  playing: true, orbit: q.get('orbit') !== '0', ui: q.get('ui') !== '0', lastTime: 0,
};
if (!state.ui) document.body.classList.add('hidden-ui');

const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#90b8d4');
scene.fog = new THREE.Fog('#90b8d4', 260, 780);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1300);
const orbitTarget = new THREE.Vector3(-5, 0, -38);
let camAzimuth = .72, camElevation = .72, camRadius = 305, drag = null;
const hemi = new THREE.HemisphereLight('#c8eaff', '#26383b', 2.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d0', 3.2); sun.position.set(-190, 360, 110); scene.add(sun);

const world = new THREE.Group(); scene.add(world);
const dynamic = new THREE.Group(); scene.add(dynamic);
let engine, buildingsData, activeScenario, agentMesh, agentTracks = [], rain, burst, train, trainInfo;
let buildingMat, groundMat, streetMat, windowMat, lampMat, heatLines, stationGroup, alternativeGroup;
let badgeEntries = [], previousTime = state.time, arrivalTracks = new Set();
const dummy = new THREE.Object3D();

function xy(lat, lon) { return [(lon - ORIGIN.lon) * 111320 * ORIGIN.cos, (lat - ORIGIN.lat) * 111320]; }
function vxy(lat, lon, h = 0) { const [x, y] = xy(lat, lon); return new THREE.Vector3(x, h, -y); }
function mod(n, d) { return ((n % d) + d) % d; }
function number(n) { return Math.round(n || 0).toLocaleString('en-US'); }
function timeText(t) { t = mod(Math.round(t), 1440); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
function classify(name) { return name.startsWith('住民') ? 'resident' : name.startsWith('来訪者') ? 'visitor' : 'commuter'; }
function moving(s) { return s === '移動' || s.startsWith('寄り道'); }

function addQuad(a, b, c, d, normal, positions, normals, colors, color) {
  for (const p of [a, b, c, a, c, d]) { positions.push(p[0], p[1], p[2]); normals.push(normal[0], normal[1], normal[2]); colors.push(color.r, color.g, color.b); }
}
function buildBuildings(buildings) {
  const pos = [], nor = [], col = [];
  const sideColors = [new THREE.Color('#4c6370'), new THREE.Color('#526875'), new THREE.Color('#5d6e73'), new THREE.Color('#485d68')];
  const roofColors = [new THREE.Color('#87989a'), new THREE.Color('#778b8f'), new THREE.Color('#9aa29b'), new THREE.Color('#6f8489')];
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi], p = b.p;
    if (!p || p.length < 3) continue;
    const h = Math.max(2.5, Math.min(+b.h || 6, 72));
    const si = (bi * 13 + Math.round(h)) % sideColors.length;
    const side = sideColors[si].clone().multiplyScalar(b.s === 'osm' ? 1.06 : .87);
    const roof = roofColors[(si + 1) % roofColors.length].clone().multiplyScalar(b.s === 'osm' ? 1.04 : .82);
    const pts = p.map(a => [a[0], 0, -a[1]]), tops = p.map(a => [a[0], h, -a[1]]);
    for (let j = 1; j < p.length - 1; j++) addQuad(tops[0], tops[j], tops[j + 1], tops[j + 1], [0, 1, 0], pos, nor, col, roof);
    for (let j = 0; j < p.length; j++) {
      const a = pts[j], b0 = pts[(j + 1) % p.length], c = tops[(j + 1) % p.length], d = tops[j];
      const dx = b0[0] - a[0], dz = b0[2] - a[2], len = Math.hypot(dx, dz) || 1;
      addQuad(a, b0, c, d, [-dz / len, 0, dx / len], pos, nor, col, side);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  buildingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89, metalness: .03 });
  const mesh = new THREE.Mesh(g, buildingMat); world.add(mesh);
  return mesh;
}
function makeGround() {
  const geo = new THREE.PlaneGeometry(1220, 1220, 1, 1);
  groundMat = new THREE.MeshStandardMaterial({ color: '#24454b', roughness: .97, metalness: .02 });
  const ground = new THREE.Mesh(geo, groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; world.add(ground);
  const grid = new THREE.GridHelper(980, 28, '#638486', '#486a6e'); grid.position.y = -.14; grid.material.transparent = true; grid.material.opacity = .13; world.add(grid);
}
function lineFromPolylines(lines, color, y = .16, opacity = 1) {
  const ps = [];
  for (const line of lines) for (let i = 0; i < line.length - 1; i++) ps.push(line[i][0], y, -line[i][1], line[i + 1][0], y, -line[i + 1][1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
  return new THREE.LineSegments(g, m);
}
function buildRails(rails) {
  const railGlow = lineFromPolylines(rails, '#bfc9cb', .45, .93); world.add(railGlow);
  const railDark = lineFromPolylines(rails, '#26333a', .18, 1); world.add(railDark);
  const near = rails[0]; let index = 0, best = Infinity;
  near.forEach((p, i) => { const d = p[0] * p[0] + p[1] * p[1]; if (d < best) { best = d; index = i; } });
  const a = near[Math.max(0, index - 1)], b = near[Math.min(near.length - 1, index + 1)];
  const center = new THREE.Vector3(near[index][0], .7, -near[index][1]);
  const tangent = new THREE.Vector3(b[0] - a[0], 0, -(b[1] - a[1])).normalize();
  trainInfo = { center, tangent };
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.75, .13, 7.2), new THREE.MeshStandardMaterial({ color: '#4c3e36', roughness: 1 }), 31);
  for (let i = -15; i <= 15; i++) {
    const t = center.clone().addScaledVector(tangent, i * 11); dummy.position.copy(t); dummy.position.y = .16; dummy.rotation.set(0, Math.atan2(-tangent.z, tangent.x), 0); dummy.scale.setScalar(1); dummy.updateMatrix(); ties.setMatrixAt(i + 15, dummy.matrix);
  }
  ties.instanceMatrix.needsUpdate = true; world.add(ties);
}
function addWindows(buildings) {
  const g = new THREE.BoxGeometry(1.3, 1, .08); windowMat = new THREE.MeshBasicMaterial({ color: '#ffd67a', transparent: true, opacity: 0, depthWrite: false });
  const count = Math.min(760, buildings.length * 2), mesh = new THREE.InstancedMesh(g, windowMat, count);
  let i = 0;
  for (let n = 0; n < buildings.length && i < count; n += 3) {
    const b = buildings[n], p = b.p; if (!p || p.length < 3 || b.h < 6) continue;
    let cx = 0, cy = 0; p.forEach(k => { cx += k[0]; cy += k[1]; }); cx /= p.length; cy /= p.length;
    const h = Math.min(b.h - 1, 2 + ((n * 7) % Math.max(3, Math.floor(b.h - 2))));
    dummy.position.set(cx, h, -cy - .08); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.8 + (n % 3) * .15); dummy.updateMatrix(); mesh.setMatrixAt(i++, dummy.matrix);
    if (i < count) { dummy.position.set(cx + .15, h + 2.2, -cy - .08); dummy.updateMatrix(); mesh.setMatrixAt(i++, dummy.matrix); }
  }
  mesh.count = i; mesh.instanceMatrix.needsUpdate = true; world.add(mesh);
}
function addStreetLamps() {
  const n = 46, pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .1, 5.2, 5), new THREE.MeshStandardMaterial({ color: '#384b51', roughness: .75 }), n);
  lampMat = new THREE.MeshBasicMaterial({ color: '#ffd58b', transparent: true, opacity: .05 });
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(.42, 7, 5), lampMat, n);
  for (let i = 0; i < n; i++) { const ang = i * 2.399, r = 35 + (i % 8) * 17; dummy.position.set(-10 + Math.cos(ang) * r * 1.25, 2.55, -35 + Math.sin(ang) * r); dummy.updateMatrix(); pole.setMatrixAt(i, dummy.matrix); dummy.position.y = 5.2; dummy.scale.setScalar(1); dummy.updateMatrix(); bulb.setMatrixAt(i, dummy.matrix); }
  pole.instanceMatrix.needsUpdate = bulb.instanceMatrix.needsUpdate = true; world.add(pole, bulb);
}
function stationBuilding() {
  stationGroup = new THREE.Group(); stationGroup.name = 'Asagaya Station';
  const shellMat = new THREE.MeshStandardMaterial({ color: '#d5d5c6', roughness: .74, metalness: .05 });
  const signMat = new THREE.MeshBasicMaterial({ color: '#58dfff' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(54, 9, 16), shellMat); body.position.set(-1, 4.5, -42); stationGroup.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(58, 1.2, 20), new THREE.MeshStandardMaterial({ color: '#304651', roughness: .6 })); roof.position.set(-1, 9.5, -42); stationGroup.add(roof);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(18, 2.8, .15), signMat); sign.position.set(-1, 6.3, -33.9); stationGroup.add(sign);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(64, .7, 6), new THREE.MeshStandardMaterial({ color: '#efeee4', roughness: .65 })); canopy.position.set(-1, 5.3, -30); stationGroup.add(canopy);
  const entrance = new THREE.Mesh(new THREE.BoxGeometry(19, 4.3, .2), new THREE.MeshBasicMaterial({ color: '#163b49' })); entrance.position.set(-1, 2.3, -33.8); stationGroup.add(entrance);
  world.add(stationGroup);
}
function makeTrain() {
  train = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e8e4d7', roughness: .42, metalness: .15 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#f6a328' });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: '#183d51' });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(8.5, 3.9, 4.1), bodyMat, 10);
  const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(8.65, .58, 4.16), stripeMat, 10);
  const windowsA = new THREE.InstancedMesh(new THREE.BoxGeometry(6.8, 1.45, .08), windowMaterial, 10);
  const windowsB = new THREE.InstancedMesh(new THREE.BoxGeometry(6.8, 1.45, .08), windowMaterial, 10);
  for (let i = 0; i < 10; i++) {
    const x = (i - 4.5) * 8.75;
    dummy.position.set(x, 2.3, 0); dummy.rotation.set(0,0,0); dummy.scale.setScalar(1); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2.2, 0); dummy.updateMatrix(); stripes.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 3.5, -2.08); dummy.updateMatrix(); windowsA.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 3.5, 2.08); dummy.updateMatrix(); windowsB.setMatrixAt(i, dummy.matrix);
  }
  for (const m of [bodies,stripes,windowsA,windowsB]) { m.instanceMatrix.needsUpdate = true; train.add(m); }
  dynamic.add(train);
}
function addDecorativeTrees() {
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .25, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#5b4939', roughness: 1 }), 55);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.7, 1), new THREE.MeshStandardMaterial({ color: '#3e7159', roughness: .92 }), 55);
  for (let i = 0; i < 55; i++) { const a = i * 2.55, r = 55 + (i % 11) * 16; dummy.position.set(-15 + Math.cos(a) * r, 1.6, -50 + Math.sin(a) * r); dummy.scale.set(1, 1 + (i % 3) * .23, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); dummy.position.y += 3.2; dummy.scale.setScalar(.7 + (i % 4) * .12); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); }
  trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true; world.add(trunks, leaves);
}
function clearAlternative() { if (!alternativeGroup) return; alternativeGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); }); world.remove(alternativeGroup); }
function material(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: .72, metalness: .04 }); }
function makeAlternative() {
  clearAlternative(); alternativeGroup = new THREE.Group();
  const site = vxy(engine.site[0], engine.site[1]); site.y = .05; alternativeGroup.position.copy(site);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(28, .25, 22), material('#5e7676')); slab.position.y = 0; alternativeGroup.add(slab);
  if (state.alt === 'bike') {
    const metal = material('#d2e2e5');
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      const rack = new THREE.Mesh(new THREE.TorusGeometry(1.2, .11, 5, 9, Math.PI), metal); rack.rotation.x = Math.PI / 2; rack.position.set(c * 4.5, 1.2, r * 3.5); alternativeGroup.add(rack);
      if ((r + c) % 2 === 0) { const bike = new THREE.Mesh(new THREE.TorusGeometry(.68, .08, 5, 8), new THREE.MeshBasicMaterial({ color: (r + c) % 3 ? '#52c7df' : '#ffaf42' })); bike.rotation.x = Math.PI / 2; bike.position.set(c * 4.5 + .48, .78, r * 3.5); alternativeGroup.add(bike); }
    }
  } else if (state.alt === 'cafe') {
    const cafe = new THREE.Mesh(new THREE.BoxGeometry(21, 7.5, 14), material('#d8c39e')); cafe.position.y = 3.8; alternativeGroup.add(cafe);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(23, .55, 4.5), material('#d46a45')); awning.position.set(0, 4.8, -8.3); awning.rotation.x = -.18; alternativeGroup.add(awning);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(13, 3.1, .12), new THREE.MeshBasicMaterial({ color: '#f8c76e' })); glass.position.set(0, 3.3, -7.08); alternativeGroup.add(glass);
    for (let i = -2; i <= 2; i++) { const table = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .13, 10), material('#566b70')); table.position.set(i * 3.6, 1.2, -9); alternativeGroup.add(table); }
  } else {
    const paver = new THREE.Mesh(new THREE.BoxGeometry(28, .28, 22), material('#8ca0a0')); paver.position.y = .09; alternativeGroup.add(paver);
    for (const x of [-8, 0, 8]) { const bench = new THREE.Mesh(new THREE.BoxGeometry(4, .45, 1.15), material('#704e3c')); bench.position.set(x, 1.05, 1); alternativeGroup.add(bench); const leg = new THREE.Mesh(new THREE.BoxGeometry(3.7, .9, .18), material('#384a4c')); leg.position.set(x, .58, 1); alternativeGroup.add(leg); }
    for (const [x,z] of [[-10,-7],[10,-7],[-10,7],[10,7]]) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,3.5,6), material('#5a4937')); trunk.position.set(x,1.8,z); alternativeGroup.add(trunk); const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.7,1), material('#4b8461')); crown.position.set(x,5,z); alternativeGroup.add(crown); }
  }
  world.add(alternativeGroup);
}
function makeHeat(heat) {
  if (heatLines) { dynamic.remove(heatLines); heatLines.geometry.dispose(); heatLines.material.dispose(); }
  const p = [], c = [], max = Math.max(...heat.map(h => h[4]));
  for (const h of heat) {
    const power = Math.pow(h[4] / max, .52), color = new THREE.Color().setHSL(.08 - power * .08, .95, .25 + power * .42);
    p.push(...vxy(h[0], h[1], .13).toArray(), ...vxy(h[2], h[3], .13).toArray()); c.push(color.r,color.g,color.b,color.r,color.g,color.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p,3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c,3));
  streetMat = new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:.42, depthWrite:false, blending:THREE.AdditiveBlending });
  heatLines = new THREE.LineSegments(g, streetMat); dynamic.add(heatLines);
}
function makeAgents() {
  if (agentMesh) { dynamic.remove(agentMesh); agentMesh.geometry.dispose(); agentMesh.material.dispose(); }
  const max = Math.max(...Object.values(engine.scenarios).map(s => s.tracks.length));
  const g = new THREE.CapsuleGeometry(.5, 1.1, 3, 6), mat = new THREE.MeshStandardMaterial({ roughness:.5, metalness:.08, vertexColors:true, emissive:'#071018', emissiveIntensity:.3 });
  agentMesh = new THREE.InstancedMesh(g, mat, max); agentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); agentMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  dynamic.add(agentMesh); setScenario(state.scenario, true);
}
function trackPosition(track, time) {
  const f = track.f; if (!f.length || time < f[0][0] || time > f[f.length - 1][0]) return null;
  let lo = 0, hi = f.length - 1;
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (f[m][0] <= time) lo = m; else hi = m - 1; }
  const a = f[lo], b = f[Math.min(lo + 1, f.length - 1)]; if (a[3] === '在宅') return null;
  const dt = b[0] - a[0], u = dt > 0 && moving(a[3]) ? Math.min(1, Math.max(0, (time - a[0]) / dt)) : 0;
  const lat = THREE.MathUtils.lerp(a[1], b[1], u), lon = THREE.MathUtils.lerp(a[2], b[2], u); return { p: vxy(lat, lon, .92), state:a[3], next:b };
}
function updateAgents(t, elapsed) {
  if (!agentMesh) return; const off = new THREE.Matrix4().makeScale(0,0,0);
  for (let i = 0; i < agentMesh.count; i++) {
    const track = agentTracks[i]; if (!track) { agentMesh.setMatrixAt(i, off); continue; }
    const r = trackPosition(track, t); if (!r) { agentMesh.setMatrixAt(i, off); continue; }
    const next = r.next, np = vxy(next[1], next[2]); const dir = np.sub(r.p); const kind = classify(track.name);
    const alighting = burst && burst.life > 0 && arrivalTracks.has(track);
    dummy.position.copy(r.p); dummy.position.y += Math.sin(elapsed * 6 + i) * .035;
    dummy.scale.setScalar((kind === 'visitor' ? .86 : .8) * (alighting ? 1.22 : 1));
    dummy.rotation.set(0, Math.atan2(-dir.z, dir.x) - Math.PI / 2, 0); dummy.updateMatrix(); agentMesh.setMatrixAt(i,dummy.matrix);
    agentMesh.setColorAt(i, alighting ? new THREE.Color('#fff3c4') : palette[kind]);
  }
  agentMesh.instanceMatrix.needsUpdate = true; if (agentMesh.instanceColor) agentMesh.instanceColor.needsUpdate = true;
}
function makeRain() {
  const n = 520, positions = new Float32Array(n * 2 * 3), vel = [];
  for (let i = 0; i < n; i++) { const x = -280 + (i * 67 % 560), z = -310 + (i * 31 % 560), y = 10 + (i * 17 % 150); positions.set([x,y,z,x-.25,y-4,z+.25],i*6); vel.push(35 + i % 20); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(positions,3)); const m = new THREE.LineBasicMaterial({ color:'#b8e4fa', transparent:true, opacity:.5, depthWrite:false });
  rain = { mesh:new THREE.LineSegments(g,m), positions, vel }; rain.mesh.visible = false; dynamic.add(rain.mesh);
}
function updateRain(dt) {
  if (!rain) return; const wet = state.scenario === 'rain'; rain.mesh.visible = wet; if (!wet) return;
  for (let i = 0; i < rain.vel.length; i++) { let y = rain.positions[i*6+1] - rain.vel[i]*dt; if (y < 0) y = 125 + (i % 70); rain.positions[i*6+1] = y; rain.positions[i*6+4] = y - 4; }
  rain.mesh.geometry.attributes.position.needsUpdate = true;
}
function makeBurst() {
  const n=130, p=new Float32Array(n*3), col=new Float32Array(n*3), v=[]; for(let i=0;i<n;i++){ v.push(new THREE.Vector3()); const c=new THREE.Color(i%3?'#ffd166':'#60e1ff');col.set([c.r,c.g,c.b],i*3);p.set([0,-30,0],i*3); }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('color',new THREE.BufferAttribute(col,3)); const m=new THREE.PointsMaterial({size:1.5,vertexColors:true,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}); burst={mesh:new THREE.Points(g,m),p,v,life:0};dynamic.add(burst.mesh);
}
function chooseAlightingTracks(arrivalTime) {
  // The burst is grounded in the simulation: only visitor/commuter paths that
  // begin moving from the station around this train's arrival get the accent.
  if (!trainInfo) return new Set();
  return new Set(agentTracks.filter(track => {
    if (classify(track.name) === 'resident') return false;
    return track.f.some((f, i) => {
      if (!moving(f[3]) || Math.abs(f[0] - arrivalTime) > 3) return false;
      const prior = track.f[i - 1];
      const beginsHere = !prior || !moving(prior[3]) || prior[0] === f[0];
      return beginsHere && vxy(f[1], f[2]).distanceTo(trainInfo.center) < 62;
    });
  }));
}
function triggerBurst(arrivalTime) {
  if (!trainInfo || !burst) return;
  arrivalTracks = chooseAlightingTracks(arrivalTime);
  burst.life=3.6; burst.mesh.material.opacity=1;
  for(let i=0;i<burst.v.length;i++){const a=i*2.4, s=3+(i%9)*.45;burst.p.set([trainInfo.center.x+(i%10-5)*.7,1.1+(i%5)*.23,trainInfo.center.z+(i%8-4)*.6],i*3);burst.v[i].set(Math.cos(a)*s,3+(i%5)*.8,Math.sin(a)*s);}
  burst.mesh.geometry.attributes.position.needsUpdate=true;
  showToast(`CHUO LINE ARRIVAL · ${arrivalTracks.size || 'PASSENGERS'} ALIGHTING`);
}
function updateBurst(dt) { if (!burst || burst.life<=0) return; burst.life-=dt; burst.mesh.material.opacity=Math.max(0,Math.min(1,burst.life*.8)); for(let i=0;i<burst.v.length;i++){burst.v[i].y-=7*dt;burst.p[i*3]+=burst.v[i].x*dt;burst.p[i*3+1]+=burst.v[i].y*dt;burst.p[i*3+2]+=burst.v[i].z*dt;}burst.mesh.geometry.attributes.position.needsUpdate=true; }
function updateTrain(t) {
  if (!train || !trainInfo) return; const phase=mod(t-538,30); let offset;
  if(phase<2) offset=0; else if(phase<10) offset=(phase-2)*33; else if(phase<28) offset=315; else offset=-315+(phase-28)*157.5;
  train.visible=Math.abs(offset)<330; train.position.copy(trainInfo.center).addScaledVector(trainInfo.tangent,offset); train.position.y=.15; train.rotation.y=Math.atan2(-trainInfo.tangent.z,trainInfo.tangent.x);
  const nowCycle=Math.floor((t-538)/30), lastCycle=Math.floor((previousTime-538)/30);
  if (nowCycle!==lastCycle && phase<3) triggerBurst(t);
  if (previousTime < 538 && t >= 538) triggerBurst(t);
}
function updateLighting(t) {
  const hour=mod(t,1440)/60; let night=0;
  if(hour<6.2||hour>18.9) night=1; else if(hour<7.6) night=1-(hour-6.2)/1.4; else if(hour>17.1) night=(hour-17.1)/1.8;
  night=THREE.MathUtils.clamp(night,0,1); const skyDay=new THREE.Color('#8fc4e5'), skyEve=new THREE.Color('#f09a76'), skyNight=new THREE.Color('#07111f'); const sky=skyDay.clone().lerp(skyEve,Math.max(0,(hour-15)/3)).lerp(skyNight,night); scene.background.copy(sky);scene.fog.color.copy(sky);
  hemi.intensity=2.05*(1-night)+.28; sun.intensity=3.1*(1-night)+.06; sun.color.set(night>.45?'#94a5d8':'#fff2d2'); groundMat.color.set(night>.5?'#10292d':'#24454b'); groundMat.roughness=state.scenario==='rain'?.56:.97; buildingMat.emissive.setRGB(.05*night,.035*night,.015*night); windowMat.opacity=.06+.9*night; lampMat.opacity=.05+.93*night; streetMat.opacity=(.25+.35*night)*(state.scenario==='rain'?1.4:1); renderer.toneMappingExposure=1.08-.18*night;
}
function makeBadges() { $('#badges').innerHTML=''; badgeEntries=[]; const summary=activeScenario.summary; const all=[...engine.pois,...(activeScenario.extra||[])]; for(const [name,count] of (summary.top_pois||[]).slice(0,7)){const poi=all.find(p=>p.name===name);if(!poi)continue;const el=document.createElement('div');el.className='badge';el.innerHTML=`<i>●</i>${name.length>13?name.slice(0,12)+'…':name} <b>${count}</b>`;$('#badges').appendChild(el);badgeEntries.push({el,p:vxy(poi.lat,poi.lon,5.5)});}}
function updateBadges() { const w=innerWidth,h=innerHeight; for(const b of badgeEntries){const p=b.p.clone().project(camera), visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;b.el.style.display=visible?'block':'none';if(visible){b.el.style.left=`${(p.x*.5+.5)*w}px`;b.el.style.top=`${(-p.y*.5+.5)*h}px`;}} }
function updateMetrics() { const s=engine.alternatives[state.alt].summary, label=engine.alternatives[state.alt].label||state.alt; $('#alt-label').textContent=label; $('#metrics').innerHTML=`<div class="metric"><b>${number(s.site_visits)}</b><span>site visits / day</span></div><div class="metric"><b>${number(s.site_foot_traffic)}</b><span>passing footfall</span></div><div class="metric"><b>${number(s.nearby_shop_visits)}</b><span>nearby shop visits</span></div><div class="metric"><b>${number(s.bike_extra_walk_min_total)}</b><span>bike walk min total</span></div>`; }
function syncUI() { document.querySelectorAll('[data-alt]').forEach(b=>b.classList.toggle('active',b.dataset.alt===state.alt));document.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===state.scenario));document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',+b.dataset.speed===state.speed));$('#play').textContent=state.playing?'❚❚':'▶';$('#runstate').textContent=state.playing?`SIMULATION LIVE · ${state.speed}×`:'SIMULATION PAUSED'; }
function setScenario(next, quiet=false) { if (!engine.scenarios[next]) return; state.scenario=next;activeScenario=engine.scenarios[next];agentTracks=activeScenario.tracks;arrivalTracks=new Set();makeHeat(activeScenario.heat);makeBadges();syncUI();if(!quiet)showToast(`${activeScenario.label||next} · city behavior updated`); }
function setAlt(next) { if(!engine.alternatives[next])return;state.alt=next;makeAlternative();updateMetrics();syncUI();showToast(`${engine.alternatives[next].label||next} installed at station front`); }
let toastTimeout; function showToast(s){const el=$('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2500);}
function updateCamera(elapsed) { if (!drag && state.orbit) camAzimuth += .018/60; const ce=Math.cos(camElevation), pos=new THREE.Vector3(Math.cos(camAzimuth)*ce,Math.sin(camElevation),-Math.sin(camAzimuth)*ce).multiplyScalar(camRadius).add(orbitTarget); camera.position.lerp(pos,.07);camera.lookAt(orbitTarget); }
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function animate(ms) { requestAnimationFrame(animate);const elapsed=ms*.001,dt=Math.min(.1,state.lastTime?(ms-state.lastTime)/1000:0);state.lastTime=ms;if(state.playing)state.time+=dt*state.speed; if(state.time>1438)state.time=360;updateTrain(state.time);updateAgents(state.time,elapsed);updateRain(dt);updateBurst(dt);updateLighting(state.time);updateCamera(elapsed);$('#clock').textContent=timeText(state.time);syncUI();renderer.render(scene,camera);updateBadges();previousTime=state.time; }
function controls(){renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,a:camAzimuth,e:camElevation};renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;camAzimuth=drag.a-(e.clientX-drag.x)*.006;camElevation=THREE.MathUtils.clamp(drag.e+(e.clientY-drag.y)*.005,.22,1.32);});renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('wheel',e=>{camRadius=THREE.MathUtils.clamp(camRadius+e.deltaY*.17,130,550);},{passive:true});$('#play').onclick=()=>{state.playing=!state.playing;syncUI();};document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;syncUI();});document.querySelectorAll('[data-alt]').forEach(b=>b.onclick=()=>setAlt(b.dataset.alt));document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>setScenario(b.dataset.scenario));addEventListener('resize',resize);}
async function init(){ [buildingsData,engine]=await Promise.all([fetch('../data/buildings.json').then(r=>r.json()),fetch('../data/engine.json').then(r=>r.json())]); if(!engine.scenarios[state.scenario])state.scenario='baseline';if(!engine.alternatives[state.alt])state.alt='bike';makeGround();buildBuildings(buildingsData.buildings);buildRails(buildingsData.rails);addWindows(buildingsData.buildings);addStreetLamps();stationBuilding();addDecorativeTrees();makeTrain();makeBurst();makeRain();makeAgents();makeAlternative();updateMetrics();controls();updateCamera(0);renderer.render(scene,camera);window.__set=(next={})=>{if(next.scenario)setScenario(next.scenario);if(next.alt)setAlt(next.alt);if(Number.isFinite(+next.t))state.time=+next.t;if(Number.isFinite(+next.speed))state.speed=+next.speed;syncUI();};window.__ready=true;animate(performance.now());}
init().catch(err=>{console.error(err);showToast(`Renderer error: ${err.message}`);});
