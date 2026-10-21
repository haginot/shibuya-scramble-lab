// Real three.js geometry + a small browser/renderer shim. No server, browser, or network.
// Run: node --experimental-vm-modules web3d/sol/verify.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const root = new URL('./', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('style.css', root), 'utf8');
const [vendorSource, citySource, appSource, engine, buildings] = await Promise.all([
  readFile(new URL('../vendor/three.module.min.js', root), 'utf8'),
  readFile(new URL('city.mjs', root), 'utf8'),
  readFile(new URL('app.mjs', root), 'utf8'),
  readFile(new URL('../data/engine.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('../data/buildings.json', root), 'utf8').then(JSON.parse)
]);

const datasets = {};
for (const suffix of ['', '_koenji']) for (const kind of ['engine', 'buildings', 'terrain']) {
  const path = `../data/${kind}${suffix}.json`;
  datasets[path] = JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

class Element {
  constructor(tag = 'div', text = '') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {};
    this.attributes = {}; this.events = {}; this._text = text; this.value = '';
    const classes = new Set();
    this.classList = { add: c => classes.add(c), contains: c => classes.has(c), toggle: (c, force) => {
      const on = force ?? !classes.has(c); if (on) classes.add(c); else classes.delete(c); return on;
    } };
  }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  get lastChild() { return this.children.at(-1) || this; }
  get offsetWidth() { return this.style.display === 'none' ? 0 : Math.max(90, this.textContent.length * 5); }
  get offsetHeight() { return this.className?.includes('station-label') ? 75 : 26; }
  append(...children) { for (const c of children) { c.parent = this; this.children.push(c); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  addEventListener(k, callback) { this.events[k] = callback; }
  setPointerCapture() {}
}

async function boot(search = '', width = 1280, height = 800, overrides = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const buttons = { alt: ['bike', 'cafe', 'plaza'], scenario: ['baseline', 'rain', 'event', 'newcafe'] };
  for (const [key, values] of Object.entries(buttons)) buttons[key] = values.map(v => {
    const b = new Element('button'); b.dataset[key] = v; return b;
  });
  const live = new Element('span', ' SIMULATION LIVE');
  const document = {
    body: new Element('body'), getElementById: id => elements.get(id),
    createElement: tag => new Element(tag), createTextNode: text => new Element('#text', text),
    querySelector: selector => selector === '.live' ? live : null,
    querySelectorAll: selector => selector === '[data-alt]' ? buttons.alt : selector === '[data-scenario]' ? buttons.scenario : []
  };
  let scheduled, now = 0, lastScene, lastCamera, constructorOptions;
  const errors = [], fetched = [];
  const context = createContext({
    console: { log: console.log, warn: console.warn, error: (...v) => errors.push(v.join(' ')) },
    document, location: { search }, URLSearchParams, performance: { now: () => now },
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    addEventListener() {}, requestAnimationFrame(callback) { scheduled = callback; },
    fetch: async path => {
      assert(path in datasets, `Unexpected fetch: ${path}`); fetched.push(path);
      return { ok: true, json: async () => structuredClone(overrides[path] || datasets[path]) };
    }
  });
  context.window = context;
  const vendor = new SourceTextModule(vendorSource, { context, identifier: 'three' });
  await vendor.link(() => { throw new Error('three.js must be self contained'); }); await vendor.evaluate();
  const THREE = vendor.namespace;
  class Renderer {
    constructor(options) { constructorOptions = options; this.domElement = new Element('canvas'); this.shadowMap = {}; this.info = { render: {} }; }
    setPixelRatio(v) { assert(v > 0 && v <= 1.5); }
    setSize(w, h) { assert(w > 0 && h > 0); }
    render(scene, camera) {
      lastScene = scene; lastCamera = camera; scene.updateMatrixWorld();
      let calls = 0, triangles = 0;
      scene.traverseVisible(o => {
        if (!o.geometry || !o.material || !o.geometry.attributes.position?.count || o.count === 0) return;
        calls++;
        if (o.isMesh) triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      });
      this.info.render = { calls, triangles };
    }
  }
  const names = Object.keys(THREE);
  const graphics = new SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, name === 'WebGLRenderer' ? Renderer : THREE[name]);
  }, { context });
  const city = new SourceTextModule(citySource, { context, identifier: 'city' });
  await city.link(() => graphics);
  const app = new SourceTextModule(appSource, { context, identifier: 'app' });
  await app.link(spec => spec === './city.mjs' ? city : graphics); await app.evaluate();
  for (let i = 0; !context.__ready && i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, [], 'Runtime must not log errors');
  assert.equal(context.__error, undefined); assert.equal(context.__ready, true);
  assert.equal(constructorOptions.preserveDrawingBuffer, true);
  assert.equal(typeof context.__set, 'function');
  return {
    context, elements, buttons, document, THREE, fetched, city: city.namespace,
    scene: () => lastScene, camera: () => lastCamera,
    advance(seconds, step = .1) {
      for (let elapsed = 0; elapsed < seconds - .00001; elapsed += step) {
        now += Math.min(step, seconds - elapsed) * 1000;
        const callback = scheduled; scheduled = null; assert(callback); callback(now);
      }
    }
  };
}

const app = await boot();
const { context: w, elements, THREE } = app;
assert.equal(w.__stats.train, 'approaching');
app.advance(1.9);
assert.equal(w.__stats.train, 'stopped', 'Default train must arrive within three real seconds');
assert(w.__stats.recordedArrivals > 0, 'Opening arrival must use real station tracks');
assert(w.__stats.decorativePassengers > 20, 'An obvious passenger burst must accompany it');
assert(w.__stats.activeAgents > 0);

// Verify every real geometry buffer and winding, using actual three.js scene objects.
let meshes = 0, vertices = 0, badFaces = 0;
const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), normal = new THREE.Vector3();
app.scene().traverse(o => {
  const g = o.geometry; if (!g) return;
  for (const attribute of Object.values(g.attributes)) {
    assert([...attribute.array].every(Number.isFinite), 'Geometry buffers must be finite');
  }
  if (o.isMesh) {
    meshes++; vertices += g.attributes.position.count;
    if (o.isInstancedMesh) {
      assert(o.count <= o.instanceMatrix.count, 'Instance count must fit capacity');
      assert([...o.instanceMatrix.array].every(Number.isFinite));
    }
    if (!g.index) {
      const pos = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        p0.fromBufferAttribute(pos, i); p1.fromBufferAttribute(pos, i + 1); p2.fromBufferAttribute(pos, i + 2);
        edge1.subVectors(p1, p0); edge2.subVectors(p2, p0); normal.fromBufferAttribute(n, i);
        if (edge1.cross(edge2).dot(normal) < -.0001) badFaces++;
      }
    }
  }
});
assert.equal(badFaces, 0, 'Surface winding must agree with lighting normals');
assert(meshes < 65, 'Static buildings must be batched');
assert(w.__stats.drawCalls < 65);
const defaultCalls = w.__stats.drawCalls;

// Hooks must update the rendered scene and displayed clock immediately, even when paused.
w.__set({ t: 720, speed: 0, playing: false, orbit: false });
assert.equal(elements.get('clock').textContent, '12:00');
const frozen = w.__stats.time; app.advance(1); assert.equal(w.__stats.time, frozen);
const noon = app.scene().background.clone();
w.__set({ t: 1290 }); assert.equal(elements.get('clock').textContent, '21:30');
assert(app.scene().background.getHSL({}).l < noon.getHSL({}).l);

for (const scenario of ['baseline','rain','event']) {
  for (const alt of Object.keys(engine.alternatives)) {
    w.__set({ scenario, alt, t: 1110.8 });
    const selected = scenario === 'baseline' ? engine.alternatives[alt] : engine.scenario_alternatives[`${scenario}:${alt}`];
    const summary = selected.summary;
    assert.equal(w.__stats.dataKey, `${scenario}:${alt}`);
    assert.equal(w.__stats.trackCount, selected.tracks.length);
    assert.equal(w.__stats.heatSegments, selected.heat.length);
    assert.equal(w.__stats.scenario, scenario); assert.equal(w.__stats.alt, alt);
    assert.equal(Number(elements.get('site-visits').textContent.replaceAll(',', '')), Math.round(summary.site_visits));
    assert.equal(Number(elements.get('foot-traffic').textContent.replaceAll(',', '')), engine.toy_econ_by_scenario[scenario].alts[alt].foot_traffic);
    assert.equal(Number(elements.get('shop-visits').textContent.replaceAll(',', '')), Math.round(summary.nearby_shop_visits));
    assert.equal(Number(elements.get('bike-walk').textContent.replace(/[^\d]/g, '')), Math.round(summary.bike_extra_walk_min_total));
    assert.equal(w.__stats.train, 'stopped'); assert(w.__stats.recordedArrivals > 0);
    assert(w.__stats.drawCalls < 65);
    for (const t of [360, 550, 900, 1190, 1439.9]) {
      w.__set({ t }); assert(Number.isFinite(w.__stats.time)); assert(w.__stats.activeAgents <= selected.tracks.length);
    }
  }
}

// Scrubbing is deterministic, and invalid hook input preserves valid state.
w.__set({ scenario: 'baseline', alt: 'bike', t: 1110.8 });
const before = JSON.stringify(w.__stats);
w.__set({ t: 600 }); w.__set({ t: 1110.8 }); assert.equal(JSON.stringify(w.__stats), before);
const state = w.__set({ scenario: 'invalid', alt: 'invalid', t: NaN, speed: -99 });
assert.equal(state.scenario, 'baseline'); assert.equal(state.alt, 'bike'); assert.equal(state.speed, 0);
w.__set({ t: 1439.9, speed: 1, playing: true }); app.advance(.3);
assert(w.__stats.time >= 360 && w.__stats.time < 361, 'Clock wraps into the next simulated day');

// Exercise local camera controls and the actual UI handlers.
const canvas = elements.get('world').children[0];
const priorPosition = app.camera().position.clone();
canvas.events.pointerdown({ pointerId: 1, clientX: 500, clientY: 300 });
canvas.events.pointermove({ pointerId: 1, clientX: 600, clientY: 330 });
canvas.events.pointerup({ pointerId: 1 }); app.advance(.1);
assert(app.camera().position.distanceTo(priorPosition) > 1);
canvas.events.wheel({ deltaY: -100, preventDefault() {} }); app.advance(.1);
app.buttons.alt.find(b => b.dataset.alt === 'plaza').onclick();
app.buttons.scenario.find(b => b.dataset.scenario === 'rain').onclick(); app.advance(.1);
assert.equal(w.__stats.alt, 'plaza'); assert.equal(w.__stats.scenario, 'rain');
elements.get('play').onclick(); const pauseTime = w.__stats.time; app.advance(.3); assert.equal(w.__stats.time, pauseTime);

// Inspect rail interpolation and 3D forms without relying on a GPU.
const originPoint = app.city.ll(...buildings.origin);
assert(Math.hypot(originPoint.x, originPoint.z) < .0001);
assert.equal(originPoint.y, app.city.terrainHeight(0, 0));
for (let x = -800; x <= 800; x += 20) assert(Number.isFinite(app.city.railZ(x)));
const shapes = ['bike', 'cafe', 'plaza'].map(kind => {
  const group = app.city.buildAlternative(new THREE.Group(), kind, app.city.ll(...engine.site));
  return group.children.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
});
assert.equal(new Set(shapes).size, 3, 'Each alternative must have its own 3D form');
assert(html.includes('not a prediction; a toy model for testing hypotheses'));
assert(html.includes('© OpenStreetMap contributors'));

const capture = await boot('?scenario=rain&alt=cafe&t=1200&speed=0&orbit=0&ui=0', 390, 844);
assert.equal(capture.context.__stats.time, 1200); assert.equal(capture.context.__stats.scenario, 'rain');
assert.equal(capture.context.__stats.alt, 'cafe');
assert(capture.document.body.classList.contains('ui-hidden'));
capture.advance(1); assert.equal(capture.context.__stats.time, 1200);
// Every DEM vertex uses the same sampler as scene placement.
function checkGround(world) {
  const ground = world.scene().getObjectByName('DEM terrain'); assert(ground);
  const p = ground.geometry.attributes.position;
  assert.equal(p.count, 57 * 57);
  for (let i = 0; i < p.count; i++)
    assert(Math.abs(p.getY(i) - (world.city.terrainHeight(p.getX(i), p.getZ(i)) - .03)) < .00001);
  const train = world.scene().getObjectByName('Chuo train');
  assert.equal(train.position.y, world.city.terrainHeight(train.position.x, train.position.z));
}
checkGround(app); checkGround(capture);
for (const credit of ['国土地理院の標高タイルを加工して作成','https://maps.gsi.go.jp/development/ichiran.html','https://www.openstreetmap.org/copyright','https://opendatacommons.org/licenses/odbl/1-0/','../data/NOTICE','../data/index.html']) assert(html.includes(credit),credit);
assert.equal(typeof w.__caption, 'function');
w.__caption('街の可能性を試す', 'Try a different corner');
assert.equal(elements.get('caption').hidden, false);
assert.equal(elements.get('caption-ja').textContent, '街の可能性を試す');
assert.equal(elements.get('caption-en').textContent, 'Try a different corner');
w.__caption('', ''); assert.equal(elements.get('caption').hidden, true);

// Test interpolation with a tiny analytical surface, including north/south sign,
// edge clamping, distinct origins, and zero vertical exaggeration.
const testTerrain = { origin: [35, 139], step: 10, size: 2, x0: -5, y0: -5, base_m: 100, grid: [[1, 3], [5, 7]] };
app.city.initWorld({ origin: [35, 139] }, testTerrain, 2);
assert.equal(app.city.terrainHeight(-5, 5), 2);
assert.equal(app.city.terrainHeight(5, -5), 14);
assert.equal(app.city.terrainHeight(0, 0), 8);
assert.equal(app.city.terrainHeight(-500, 500), 2);
assert.equal(app.city.terrainHeight(500, -500), 14);
const converted = app.city.ll(35 + 10 / 111320, 139 + 10 / (111320 * Math.cos(35 * Math.PI / 180)));
assert(Math.abs(converted.x - 10) < .000001); assert(Math.abs(converted.z + 10) < .000001);
app.city.initWorld({ origin: [35 + 5 / 111320, 139] }, testTerrain, 2);
assert(Math.abs(app.city.terrainHeight(0, 0) - 12) < .000001);
app.city.initWorld({ origin: [35, 139] }, testTerrain, 0); assert.equal(app.city.terrainHeight(0, 0), 0);
app.city.initWorld(buildings, datasets['../data/terrain.json']);

function checkCameraClearance(world, intro = true) {
  const p = world.camera().position;
  const bounds = world.scene().getObjectByName('DEM terrain').parent.userData.buildingBounds;
  assert(bounds.length > 2000);
  for (const b of bounds) {
    const d = Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
    if (intro && d <= 60) assert(p.y >= b.top + 45 - .00001, 'Director must clear every nearby roof by 45m');
    if (p.x >= b.minX - 5 && p.x <= b.maxX + 5 && p.z >= b.minZ - 5 && p.z <= b.maxZ + 5)
      assert(p.y >= b.top + 10 - .00001, 'Every camera must clear expanded building bounds');
  }
}
function checkOpening(world, ordinaryTerrain = false) {
  checkCameraClearance(world);
  const suffix = world.context.__stats.area === 'koenji' ? '_koenji' : '';
  const poi = datasets[`../data/engine${suffix}.json`].pois.find(p => p.cat === 'station');
  const station = world.city.ll(poi.lat, poi.lon), camera = world.camera();
  const platform = new world.THREE.Vector3(station.x, world.city.terrainHeight(station.x, world.city.railZ(station.x)) + 5.85, world.city.railZ(station.x));
  const horizontal = Math.hypot(camera.position.x - platform.x, camera.position.z - platform.z);
  assert(horizontal >= 89.99 && horizontal <= 120.01);
  const altitude = camera.position.y - world.city.terrainHeight(camera.position.x, camera.position.z);
  if (ordinaryTerrain) assert(altitude >= 55 && altitude <= 71, `Opening altitude ${altitude.toFixed(1)}m`);
  const pitch = Math.atan2(camera.position.y - platform.y, horizontal) * 180 / Math.PI;
  assert(pitch >= 34.99 && pitch <= 43, `Opening pitch ${pitch.toFixed(1)} degrees`);
  const center = platform.clone().project(camera); assert(Math.hypot(center.x, center.y) < .00001, 'Look at stopping platform, not the POI');
  if (world.context.__stats.train === 'stopped') {
    const train = world.scene().getObjectByName('Chuo train');
    for (const x of [-93.4, 93.4]) for (const z of [-1.8, 1.8]) for (const y of [5, 10.2]) {
      const p = new world.THREE.Vector3(x, y, z).applyMatrix4(train.matrixWorld).project(camera);
      assert(Math.abs(p.x) < .91 && Math.abs(p.y) < .85 && p.z > -1 && p.z < 1, 'Full stationary train must fit with margins');
    }
  }
  return { altitude, pitch };
}
function checkFigurePixels(world, width = 1280, height = 800) {
  for (const name of ['Recorded people', 'Alighting passengers']) {
    const mesh = world.scene().getObjectByName(name), m = new world.THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const foot = new world.THREE.Vector3().applyMatrix4(m).project(world.camera());
      const head = new world.THREE.Vector3(0, 3, 0).applyMatrix4(m).project(world.camera());
      assert(Math.hypot((head.x - foot.x) * width, (head.y - foot.y) * height) * .5 >= 7.99, 'Standing capsules must cover at least eight screen pixels');
    }
  }
}

const koenji = await boot('?area=koenji&cam=intro&timelapse=1050,1380&compare=1&agentScale=1.5&exag=3&speed=0');
const kw = koenji.context, ke = datasets['../data/engine_koenji.json'];
assert.equal(kw.__stats.area, 'koenji'); assert.equal(kw.__stats.exag, 3); assert.equal(kw.__stats.agentScale, 1.5);
assert(koenji.fetched.includes('../data/engine_koenji.json'));
assert(koenji.fetched.includes('../data/buildings_koenji.json'));
assert(koenji.fetched.includes('../data/terrain_koenji.json'));
assert.equal(koenji.document.title, 'KOENJI — A living miniature');
assert(koenji.elements.get('area-title').textContent.includes('高円寺'));
assert(koenji.elements.get('labels').textContent.includes(ke.pois.find(p => p.cat === 'station').name));
assert.equal(koenji.elements.get('compare-bar').children.length, 3);
for (const [index, key] of ['bike', 'cafe', 'plaza'].entries()) {
  const metrics = ke.toy_econ.alts[key], card = koenji.elements.get('compare-bar').children[index];
  assert(card.textContent.includes(Math.round(metrics.foot_traffic).toLocaleString()));
  assert(card.textContent.includes(Number(metrics.dwell_min).toFixed(1)));
  assert(card.textContent.includes(`¥${Math.round(metrics.toy_total_yen).toLocaleString()}/day`));
  assert(card.textContent.includes('Site income + nearby sales change'));
}
koenji.elements.get('compare-bar').children[1].onclick();
assert.equal(kw.__stats.alt, 'bike', 'UI changes take effect on the next frame');
koenji.advance(1.1);
assert.equal(kw.__stats.alt, 'cafe'); assert.equal(kw.__stats.train, 'stopped');
assert(kw.__stats.decorativePassengers > 20); assert(Math.abs(kw.__stats.time - 1062.1) < .000001);
checkOpening(koenji); checkFigurePixels(koenji);
assert.equal(koenji.elements.get('dwell-min').textContent, Number(ke.toy_econ.alts.cafe.dwell_min).toFixed(1));
assert(koenji.elements.get('econ-formula').textContent.includes(`Formula: ${ke.toy_econ.assumptions.formula}`));
assert(koenji.elements.get('econ-formula').textContent.includes('bike fees'));
const lowShot = koenji.camera().position.clone(), dawn = koenji.scene().background.clone();
checkGround(koenji);
const recorded = koenji.scene().getObjectByName('Recorded people');
const passenger = koenji.scene().getObjectByName('Alighting passengers');
const glow = koenji.scene().getObjectByName('People glow sprites');
assert.equal(glow.geometry.drawRange.count, recorded.count + passenger.count);
const typeColors = [0x4fc3ff, 0xffb02e, 0xff5fa2];
for (const mesh of [recorded, passenger]) {
  assert(mesh.material.isMeshBasicMaterial && !mesh.material.toneMapped, 'People must emit the same saturated color independently of scene lights');
  mesh.geometry.computeBoundingBox();
  assert(Math.abs(mesh.geometry.boundingBox.max.y - mesh.geometry.boundingBox.min.y - 3) < .001);
  const c = new koenji.THREE.Color();
  for (let i = 0; i < mesh.count; i++) { mesh.getColorAt(i, c); assert(typeColors.includes(c.getHex()), 'Every person must use an exact type color'); }
}
assert.equal(glow.material.blending, koenji.THREE.AdditiveBlending);
assert(glow.geometry.attributes.size.array[0] >= 5.8 * 1.5 - .00001);
const lightTrails = koenji.scene().getObjectByName('Passenger light trails');
assert(lightTrails.geometry.drawRange.count > 0, 'Sparse frames must still have passenger trail history');
assert.equal(lightTrails.material.blending, koenji.THREE.AdditiveBlending);
const trailAttribute = lightTrails.geometry.attributes.position;
for (let i = 0; i < lightTrails.geometry.drawRange.count; i += 2) {
  const a = new koenji.THREE.Vector3().fromBufferAttribute(trailAttribute, i), b = new koenji.THREE.Vector3().fromBufferAttribute(trailAttribute, i + 1);
  assert(a.distanceTo(b) <= 6.0001, 'Trail segments must remain short during fast platform movement');
}
const personMatrix = new koenji.THREE.Matrix4(), pos = new koenji.THREE.Vector3(), quat = new koenji.THREE.Quaternion(), scale = new koenji.THREE.Vector3();
passenger.getMatrixAt(0, personMatrix); personMatrix.decompose(pos, quat, scale);
assert(scale.x >= 1.5, 'Burst capsules start at 3m before agentScale/distance scaling');
assert(pos.y >= koenji.city.terrainHeight(pos.x, pos.z));
koenji.advance(3); assert.equal(kw.__stats.train, 'stopped'); assert(kw.__stats.decorativePassengers > 20);
koenji.advance(1.9, 1.9); assert(Math.abs(kw.__stats.elapsed - 6) < .000001);
checkOpening(koenji);
koenji.advance(8, 8); assert(Math.abs(kw.__stats.elapsed - 14) < .000001);
checkCameraClearance(koenji); checkFigurePixels(koenji);
const overview = koenji.camera().position.clone(); assert(overview.y > lowShot.y + 100);
koenji.advance(8, 8); assert(Math.abs(kw.__stats.elapsed - 22) < .000001);
assert(koenji.camera().position.distanceTo(overview) > 200, 'Shop segment must cross the neighborhood');
koenji.advance(8, 8); assert(Math.abs(kw.__stats.elapsed - 30) < .000001); assert(Math.abs(kw.__stats.time - 1380) < .000001);
checkFigurePixels(koenji); checkCameraClearance(koenji);
assert(koenji.camera().position.y > overview.y + 150);
assert(koenji.scene().background.getHSL({}).l < dawn.getHSL({}).l);
koenji.advance(2, 2); assert.equal(kw.__stats.time, 1380, 'Timelapse holds its endpoint');
koenji.scene().traverse(o => {
  if (o.geometry) for (const attr of Object.values(o.geometry.attributes)) assert([...attr.array].every(Number.isFinite));
});

const siteView = await boot('?area=asagaya&cam=site&hideui=1&compare=1&exag=0&agentScale=2&timelapse=bad');
assert(siteView.document.body.classList.contains('capture-ui'));
assert.equal(siteView.context.__stats.area, 'asagaya');
assert.equal(siteView.city.terrainHeight(0, 0), 0);
const fixedCamera = siteView.camera().position.clone(); siteView.advance(10, 10);
assert(siteView.camera().position.distanceTo(fixedCamera) < .000001);
assert.equal(siteView.context.__set({ ui: true }).ui, false, 'hideui keeps recording controls hidden');
const sitePoint = siteView.city.ll(...engine.site);
assert(siteView.camera().position.distanceTo(sitePoint) >= 80 && siteView.camera().position.distanceTo(sitePoint) <= 115, 'Site view must stay about 80–110m from the intervention');
checkGround(siteView);
assert(!/\.capture-ui[^{}]*#labels[^{}]*\{[^}]*display\s*:\s*none/.test(css), 'hideui must keep the map label layer');
const initialSiteLabel = siteView.elements.get('labels').children.find(el => el.className.includes('site-label'));
assert.notEqual(initialSiteLabel.style.display, 'none');
assert(initialSiteLabel.textContent.includes('Bike parking'));
assert(initialSiteLabel.textContent.includes('passages/day') && initialSiteLabel.textContent.includes('min dwell') && initialSiteLabel.textContent.includes('Income + nearby change ¥'));

function checkSite(world, width = 1280, height = 800) {
  const suffix = world.context.__stats.area === 'koenji' ? '_koenji' : '';
  const site = world.city.ll(...datasets[`../data/engine${suffix}.json`].site), camera = world.camera();
  const focus = site.clone().add(new world.THREE.Vector3(0, 2, 0));
  const center = focus.clone().project(camera);
  assert(Math.hypot(center.x, center.y) < .00001, 'Site form must be centered');
  const distance = camera.position.distanceTo(focus);
  assert(distance >= 80 && distance <= 115, `Close site distance ${distance.toFixed(1)}m`);
  const pitch = Math.atan2(camera.position.y - focus.y, Math.hypot(camera.position.x - focus.x, camera.position.z - focus.z)) * 180 / Math.PI;
  assert(pitch >= 39.9 && pitch <= 47, `Site pitch ${pitch.toFixed(1)} degrees`);
  const bounds = world.scene().getObjectByName('DEM terrain').parent.userData.buildingBounds;
  for (const b of bounds) {
    const d = Math.hypot(Math.max(b.minX - camera.position.x, 0, camera.position.x - b.maxX), Math.max(b.minZ - camera.position.z, 0, camera.position.z - b.maxZ));
    if (d <= 60) assert(camera.position.y >= b.top + 40 - .00001, 'Site camera must clear nearby roofs by 40m');
  }
  const meshes = world.scene().getObjectByName('DEM terrain').parent.children.filter(o => o.isMesh);
  const ray = new world.THREE.Raycaster(), screen = [];
  for (const [x, z] of [[0, 0], [-12, -10], [12, -10], [-12, 10], [12, 10]]) {
    const target = site.clone().add(new world.THREE.Vector3(x, 2, z)), p = target.clone().project(camera); screen.push(p);
    assert(Math.abs(p.x) < .9 && Math.abs(p.y) < .9, 'Entire site parcel must fit in frame');
    const direction = target.clone().sub(camera.position);
    ray.set(camera.position, direction.clone().normalize()); ray.far = direction.length() - .4;
    const hits = ray.intersectObjects(meshes, false);
    assert.equal(hits.length, 0, `Actual city triangles must not hide ${world.context.__stats.area}/${world.context.__stats.alt} site at ${x},${z}; hit ${hits[0]?.object.name} near ${hits[0]?.point.toArray()}`);
  }
  const spanX = (Math.max(...screen.map(p => p.x)) - Math.min(...screen.map(p => p.x))) * width * .5;
  const spanY = (Math.max(...screen.map(p => p.y)) - Math.min(...screen.map(p => p.y))) * height * .5;
  assert(Math.max(spanX / width, spanY / height) > .35, 'Site form must fill a substantial part of the frame');
  const label = world.elements.get('labels').children.find(el => el.className.includes('site-label'));
  assert.notEqual(label.style.display, 'none', 'Site label must survive hideui');
  return { distance, pitch, spanX, spanY };
}
checkSite(siteView);
for (const area of ['asagaya', 'koenji']) {
  const world = await boot(`?area=${area}&cam=site&hideui=1&speed=0`, 390, 844);
  for (const alt of ['bike', 'cafe', 'plaza']) {
    world.context.__set({ alt }); checkSite(world, 390, 844);
    const metrics = datasets[`../data/engine${area === 'koenji' ? '_koenji' : ''}.json`].toy_econ.alts[alt];
    const label = world.elements.get('labels').children.find(el => el.className.includes('site-label'));
    assert(label.textContent.includes(`¥${Math.round(metrics.toy_total_yen).toLocaleString()}/day`));
  }
  const dry = world.scene().getObjectByName('DEM terrain').material.color.clone();
  world.context.__set({ scenario: 'rain', t: 1320 });
  const rain = world.scene().getObjectByName('Rain streaks'), sheen = world.scene().getObjectByName('Wet street light sheen');
  assert(rain.visible && sheen.visible && world.scene().getObjectByName('Wet pavement patches').visible);
  assert(world.scene().getObjectByName('DEM terrain').material.color.getHSL({}).l < dry.getHSL({}).l);
  assert(world.scene().getObjectByName('DEM terrain').material.roughness < .2);
  const beforeRain = [...rain.geometry.attributes.position.array.slice(0, 6)];
  world.advance(.4, .4);
  assert.notDeepEqual([...rain.geometry.attributes.position.array.slice(0, 6)], beforeRain, 'Rain must fall even with a paused simulation clock');
  assert(world.scene().getObjectByName('Ambient sky').intensity >= .16);
  world.context.__set({ scenario: 'event' });
  assert(!rain.visible && !sheen.visible);
  const event = world.scene().getObjectByName('Event POI stage and crowd');
  const poi = datasets[`../data/engine${area === 'koenji' ? '_koenji' : ''}.json`].scenarios.event.extra.find(p => p.cat === 'event');
  assert(event.visible && event.position.distanceTo(world.city.ll(poi.lat, poi.lon)) < .00001, 'Event marker must follow engine extra[] coordinates');
  assert(event.children.filter(o => o.isMesh).length >= 4, 'Event must include a stage, glowing lights, crowd, and halo');
  world.context.__set({ scenario: 'baseline' }); assert(!event.visible);
}

// Seeded decoration reproduces the identical buffers for a given area and seed.
const cityFingerprint = world => {
  const parent = world.scene().getObjectByName('DEM terrain').parent;
  let hash = 2166136261;
  parent.traverse(o => {
    const values = o.geometry?.attributes.position?.array; if (!values) return;
    for (const value of values) hash = Math.imul(hash ^ Math.round(value * 100), 16777619);
  });
  return hash >>> 0;
};
const defaultFingerprint = cityFingerprint(koenji);
const fromEngine = await boot('?cam=intro&exag=3', 1280, 800, {
  '../data/engine.json': { ...ke, area: 'koenji' }
});
assert.equal(fromEngine.context.__stats.area, 'koenji', 'Default area follows engine.json');
assert.equal(cityFingerprint(fromEngine), defaultFingerprint);
fromEngine.advance(2); assert.equal(fromEngine.context.__stats.train, 'stopped');
assert(fromEngine.context.__stats.decorativePassengers > 20, 'Intro must alight even without timelapse');
fromEngine.advance(4.8, 4.8);
const stream = fromEngine.scene().getObjectByName('Alighting passengers'), streamMatrix = new fromEngine.THREE.Matrix4();
let onStreet = 0;
for (let i = 0; i < stream.count; i++) {
  stream.getMatrixAt(i, streamMatrix);
  const p = new fromEngine.THREE.Vector3().setFromMatrixPosition(streamMatrix);
  if (p.y - fromEngine.city.terrainHeight(p.x, p.z) < .15 && Math.abs(p.z - fromEngine.city.railZ(p.x)) > 22) onStreet++;
}
assert(onStreet >= 80, 'By 6.8s the opening cohort must visibly leave the elevated platform for streets');
const fallback = await boot('?area=unknown&cam=site', 1280, 800, {
  '../data/engine.json': { ...engine, area: undefined }
});
assert.equal(fallback.context.__stats.area, 'asagaya', 'Missing default area falls back to Asagaya');
// Reproduce the reported capture, densely sampling the entire rise. At 2s use
// real triangle ray intersections to verify that the platform crowd is visible.
const intro = await boot('?area=asagaya&cam=intro&timelapse=1050,1380&hideui=1');
const openingMetrics = checkOpening(intro, true);
intro.advance(1.2); assert.equal(intro.context.__stats.train, 'stopped');
assert.equal(intro.context.__stats.decorativePassengers, 96);
checkOpening(intro, true); checkFigurePixels(intro);
intro.advance(.8);
const crowd = intro.scene().getObjectByName('Alighting passengers');
const staticMeshes = intro.scene().getObjectByName('DEM terrain').parent.children.filter(o => o.isMesh);
let unobstructed = 0, inFrame = 0;
const ray = new intro.THREE.Raycaster(), matrix = new intro.THREE.Matrix4();
for (let i = 0; i < crowd.count; i++) {
  crowd.getMatrixAt(i, matrix);
  const target = new intro.THREE.Vector3(0, 1.4, 0).applyMatrix4(matrix);
  const projected = target.clone().project(intro.camera());
  if (Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) inFrame++;
  const direction = target.clone().sub(intro.camera().position);
  ray.set(intro.camera().position, direction.clone().normalize()); ray.far = direction.length() - .3;
  if (!ray.intersectObjects(staticMeshes, false).length) unobstructed++;
}
assert(inFrame >= 80, `${inFrame}/96 alighting figures in frame`);
assert(unobstructed >= 72, `${unobstructed}/96 alighting figures visible past actual city triangles`);
for (let i = 0; i < 130; i++) {
  intro.advance(.1); checkCameraClearance(intro);
  if (intro.context.__stats.elapsed <= 6.00001) checkOpening(intro, true);
  if (i % 10 === 0) checkFigurePixels(intro);
}
assert(intro.context.__stats.decorativePassengers >= 192, 'Three-second arrivals retain overlapping cohorts until street dispersal');
// Timelapse owns its clock; use the normal app to check exact lighting times.
for (const t of [1050, 1110, 1140]) {
  w.__set({ t });
  const colors = app.scene().getObjectByName('Sunset sky gradient').material.uniforms;
  assert(colors.horizon.value.r > colors.horizon.value.b * 3, '17:30–19:00 horizon must be warm orange');
  const a = colors.horizon.value, b = colors.zenith.value;
  assert(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > .1, 'Sunset must have a visible gradient');
}
w.__set({ scenario: 'baseline', t: 1230 });
const nightSky = app.scene().getObjectByName('Sunset sky gradient').material.uniforms;
for (const color of [app.scene().background, nightSky.zenith.value, nightSky.horizon.value]) {
  const srgb = color.clone().convertLinearToSRGB(); assert(Math.max(srgb.r, srgb.g, srgb.b) < .07, '20:30 sky must be near black');
}
assert(app.scene().getObjectByName('Ambient sky').intensity >= .18 && app.scene().getObjectByName('Ambient sky').intensity <= .25, 'Night ambient must preserve readable silhouettes');
assert(app.scene().children.find(o => o.isDirectionalLight).intensity < .04);
const portrait = await boot('?area=koenji&cam=intro&timelapse=1050,1380&hideui=1', 390, 844);
portrait.advance(1.2); checkOpening(portrait, true); checkFigurePixels(portrait, 390, 844);
console.log(`PASS: opening ${openingMetrics.altitude.toFixed(1)}m above terrain / ${openingMetrics.pitch.toFixed(1)}° down; ${unobstructed}/96 passengers unoccluded; full train fits landscape + portrait.`);
console.log(`PASS: real data + three.js geometry; ${meshes} meshes, ${vertices.toLocaleString()} vertices, ${defaultCalls} visible draw batches.`);
console.log('PASS: both areas/defaults, bilinear terrain/grounding, seeded decoration, toy economics/comparison, cinematic/site cameras, 30s timelapse/repeated trains, captions/hideui.');
console.log('PASS: opening arrival <3s, all 9 scenario/alternative combinations, controls/hooks, clock/lighting, deterministic scrubbing, geometry winding/finite buffers.');
console.log('WebGL shader compilation and visual appearance require a browser; this check uses a renderer shim.');

// A single-area CLI export must reject a query for an unavailable area.
for(const area of ['asagaya','koenji']){
 const source=datasets[`../data/engine${area==='koenji'?'_koenji':''}.json`];
 const one=structuredClone(source);one.available_areas=[area];
 const other=area==='koenji'?'asagaya':'koenji';
 const single=await boot(`?area=${other}`,1280,720,{'../data/engine.json':one});
 assert.equal(single.context.__stats.area,area);
 assert(!single.fetched.includes(`../data/engine${other==='koenji'?'_koenji':''}.json`) || other==='asagaya');
}
const alias=await boot('?scenario=newcafe');
assert.equal(alias.context.__stats.scenario,'baseline');assert.equal(alias.context.__stats.alt,'cafe');
console.log('PASS: single-area exports and legacy newcafe alias.');
