// Offline smoke test: real Three.js geometry/math, minimal DOM and renderer doubles.
// No server, browser, network, or rasterization. Run: node --experimental-vm-modules web3d/astra/check.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TRAIN, normalizeFrames, frameAt, trainAtTime, openingTime } from './simulation.mjs';

const root = new URL('./', import.meta.url);
const engine = JSON.parse(await readFile(new URL('../data/engine.json', root), 'utf8'));
const position = (lat, lon) => ({ x: (lon - 139.6358) * 111320 * Math.cos(35.7047 * Math.PI / 180), z: -(lat - 35.7047) * 111320 });
const station = position(...engine.center);
let checkedTracks = 0;
for (const data of [...Object.values(engine.scenarios), ...Object.values(engine.alternatives)]) {
  const arrivals = [];
  for (const track of data.tracks) {
    const frames = normalizeFrames(track.f, position);
    assert.ok(frames.length);
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].time > frames[i - 1].time, 'Frame normalization must be strictly increasing');
    for (const time of [360, 720, 1125, 1439]) {
      const i = frameAt(frames, time);
      assert.ok(i >= 0 && i < frames.length);
      assert.ok(i === 0 || frames[i].time <= time);
      assert.ok(i === frames.length - 1 || frames[i + 1].time > time);
    }
    const first = frames.find(f => f.state === '移動');
    if (!track.name.startsWith('住民') && first && Math.hypot(first.pos.x - station.x, first.pos.z - station.z) < 85) arrivals.push({ time: first.time });
    checkedTracks++;
  }
  const start = openingTime(arrivals, 1.5);
  const arrival = trainAtTime(start).arrival;
  assert.equal(trainAtTime(start).phase, 'approaching');
  assert.ok((arrival - start) / 1.5 <= 3);
  assert.ok(arrivals.some(a => a.time >= arrival && (a.time - start) / 1.5 < 3), 'A real station-start track must alight within 3 seconds');
}
for (let t = 360; t < 1440; t += .1) {
  const motion = trainAtTime(t);
  assert.ok(Number.isFinite(motion.center));
  if (motion.phase === 'stopped') assert.equal(motion.center, -20);
}
for (const t of [TRAIN.offset + 7.5999, TRAIN.offset + 7.6001]) assert.equal(trainAtTime(t).visible, false, 'Train recycling must happen offstage');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.textContent = ''; this.value = ''; this.classes = new Set(); this.handlers = {};
    this.classList = { add: c => this.classes.add(c), contains: c => this.classes.has(c), toggle: (c, value) => {
      const on = value ?? !this.classes.has(c); if (on) this.classes.add(c); else this.classes.delete(c); return on;
    } };
  }
  append(...items) { for (const item of items) { this.children.push(item); item.parent = this; } }
  appendChild(item) { this.append(item); return item; }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, handler) { this.handlers[k] = handler; }
  setPointerCapture() {}
  get options() { return this.children; }
  add(item) { this.append(item); }
  get offsetWidth() { return 140; }
  get offsetHeight() { return 38; }
  getBoundingClientRect() { return { left: 1118, right: 1410, top: 34, bottom: 640 }; }
  getContext() { return { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }; }
}
const html = await readFile(new URL('index.html', root), 'utf8');
const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
const buttons = ['bike', 'cafe', 'plaza'].map(alt => { const b = new Element('button'); b.dataset.alt = alt; return b; });
for (const speed of [.5, 1.5, 5, 15, 60]) { const option = new Element('option'); option.value = String(speed); elements.get('speed').append(option); }
const body = new Element('body');
const document = { body, getElementById: id => {
  assert.ok(elements.has(id), `Missing HTML element: ${id}`); return elements.get(id);
}, createElement: tag => new Element(tag), querySelectorAll: () => buttons, querySelector: () => new Element() };
let nextFrame;
class RendererDouble {
  constructor() { this.domElement = new Element('canvas'); this.shadowMap = {}; this.info = { render: { calls: 0, triangles: 0 } }; }
  setPixelRatio() {}
  setSize() {}
  render(scene, camera) {
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    let calls = 0, triangles = 0;
    scene.traverseVisible(o => {
      if (!o.geometry || (o.isInstancedMesh && o.count === 0)) return;
      calls++;
      if (o.isMesh) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    });
    this.info.render = { calls, triangles };
  }
}
const sandbox = {
  console, URLSearchParams, document, devicePixelRatio: 1, innerWidth: 1440, innerHeight: 1000,
  location: { search: process.env.TEST_QUERY || '' }, addEventListener() {},
  requestAnimationFrame: fn => { nextFrame = fn; },
  Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
  fetch: async path => {
    assert.ok(['../data/buildings.json', '../data/engine.json'].includes(path));
    return { ok: true, json: async () => JSON.parse(await readFile(new URL(path, root), 'utf8')) };
  },
};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
const threeModule = new vm.SourceTextModule(await readFile(new URL('../vendor/three.module.min.js', root), 'utf8'), { context });
await threeModule.link(() => { throw new Error('Three.js must have no dependencies'); });
await threeModule.evaluate();
const three = threeModule.namespace;
const shim = new vm.SyntheticModule(Object.keys(three), function () {
  for (const key of Object.keys(three)) this.setExport(key, key === 'WebGLRenderer' ? RendererDouble : three[key]);
}, { context });
await shim.link(() => {}); await shim.evaluate();
const sim = new vm.SourceTextModule(await readFile(new URL('simulation.mjs', root), 'utf8'), { context });
await sim.link(() => {}); await sim.evaluate();
const source = await readFile(new URL('main.mjs', root), 'utf8');
const main = new vm.SourceTextModule(source + '\nexport {scene, rain, windowMesh, heatMesh, trainBody, siteGroup, bodies, labels, tracks, railPath, state};', { context });
await main.link(specifier => {
  if (specifier === '../vendor/three.module.min.js') return shim;
  if (specifier === './simulation.mjs') return sim;
  throw new Error(`Unexpected import: ${specifier}`);
});
await main.evaluate();
for (let n = 0; n < 300 && !sandbox.__ready && !sandbox.__error; n++) await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(sandbox.__error, undefined);
assert.equal(sandbox.__ready, true);
assert.equal(typeof sandbox.__set, 'function');
const exports = main.namespace;
assert.equal(exports.trainBody.count, 10);
assert.ok(sandbox.__stats.drawCalls < 70, `Expected batched geometry; got ${sandbox.__stats.drawCalls} scene draws`);
let vertices = 0;
exports.scene.traverse(o => {
  if (!o.geometry) return;
  for (const [name, attr] of Object.entries(o.geometry.attributes)) {
    for (const value of attr.array) assert.ok(Number.isFinite(value), `Nonfinite ${name} geometry`);
  }
  vertices += o.geometry.attributes.position.count;
});
assert.ok(vertices > 100000, 'Expected full town geometry');
if (!process.env.TEST_QUERY) {
  assert.equal(sandbox.__stats.trainPhase, 'approaching');
  let alighted = false, burst = false;
  nextFrame(0);
  for (let time = 100; time <= 3000; time += 100) {
    nextFrame(time);
    alighted ||= sandbox.__stats.alightingAgents > 0;
    burst ||= sandbox.__stats.decorativeBurst;
  }
  assert.ok(alighted && burst, 'Opening must show real alighting agents and decorative particles within 3 seconds');
} else {
  const params = new URLSearchParams(process.env.TEST_QUERY);
  assert.equal(sandbox.__state.scenario, params.get('scenario'));
  assert.equal(sandbox.__state.alt, params.get('alt'));
  assert.equal(sandbox.__state.t, Number(params.get('t')));
  assert.equal(sandbox.__state.speed, Number(params.get('speed')));
  assert.equal(body.classList.contains('hide-ui'), params.get('ui') === '0');
  assert.ok(!html.match(/<footer[^>]*class="ui/));
}
for (const scenario of Object.keys(engine.scenarios)) for (const alt of Object.keys(engine.alternatives)) {
  sandbox.__set({ scenario, alt, t: 1125.5, speed: 0, orbit: 0 });
  assert.equal(sandbox.__state.scenario, scenario); assert.equal(sandbox.__state.alt, alt);
  assert.equal(exports.rain.visible, scenario === 'rain');
  assert.equal(Number(elements.get('metric-visits').textContent.replaceAll(',', '')), engine.alternatives[alt].summary.site_visits);
  assert.equal(Number(elements.get('metric-foot').textContent.replaceAll(',', '')), engine.alternatives[alt].summary.site_foot_traffic);
  assert.equal(Number(elements.get('metric-shops').textContent.replaceAll(',', '')), engine.alternatives[alt].summary.nearby_shop_visits);
  assert.equal(Number(elements.get('metric-bike').textContent.replaceAll(',', '')), engine.alternatives[alt].summary.bike_extra_walk_min_total);
  assert.ok(exports.bodies.count > 0 && exports.bodies.count <= 500);
  assert.ok(exports.labels.length >= 5);
}
sandbox.__set({ scenario: 'baseline', t: 720, speed: 0 });
const dayWindows = exports.windowMesh.material.opacity, dayHeat = exports.heatMesh.material.opacity;
sandbox.__set({ t: 1300 });
assert.ok(exports.windowMesh.material.opacity > dayWindows);
assert.ok(exports.heatMesh.material.opacity > dayHeat);
elements.get('play').onclick();
assert.equal(sandbox.__state.playing, false);
buttons[1].onclick(); assert.equal(sandbox.__state.alt, 'cafe');
elements.get('scenario').onchange({ target: { value: 'rain' } }); assert.equal(sandbox.__state.scenario, 'rain');
sandbox.__set({ scenario: 'invalid', alt: 'invalid', t: -200, speed: -3 });
assert.equal(sandbox.__state.scenario, 'rain'); assert.equal(sandbox.__state.alt, 'cafe');
assert.equal(sandbox.__state.t, 360); assert.equal(sandbox.__state.speed, 0);
nextFrame(10000); // Prime the frame clock in both the default and URL-parameter runs.
sandbox.__set({ playing: true, t: 1439.95, speed: 120 }); nextFrame(10100);
assert.ok(sandbox.__state.t >= 360 && sandbox.__state.t < 400, 'Clock wraps after midnight');
assert.ok(html.includes('not a prediction; a toy model for testing hypotheses'));
assert.ok(html.includes('© OpenStreetMap contributors'));
assert.ok(source.includes('preserveDrawingBuffer: true'));
console.log(`PASS: ${checkedTracks} tracks; ${vertices.toLocaleString()} geometry vertices; ${sandbox.__stats.drawCalls} scene draws; opening arrival, 12 experiment combinations, metrics, lighting, clock, hooks and controls.`);
console.log('Renderer/DOM doubles were used. Actual WebGL rasterization and visual layout were not tested.');
