// Real-data test for night.mjs. window.__ready, window.__render(view, frames, t) -> {times, ...}, window.__load (ms).
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/addons/GLTFLoader.js';
import { applyNight } from '../night.mjs';
import { createCutaway } from '../cutaway.mjs';

const T0 = performance.now();
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 1, 4000);

const DATA = new URL('../data/', import.meta.url);
const manifest = await (await fetch(new URL('manifest.json', DATA))).json();
const terrain = await (await fetch(new URL('terrain.json', DATA))).json();
const box = manifest.clip;
const loader = new GLTFLoader();
const load = (f) => loader.loadAsync(new URL(f, DATA).href).catch((e) => { console.warn('missing layer', f, e.message); return null; });
const skip = new Set((new URLSearchParams(location.search).get('skip') || '').split(',').filter(Boolean));
const L = manifest.layers;
const [bldg, tran, frn, veg, brid, ubld] = await Promise.all([
  Promise.all(L.bldg.map(load)),
  ...['tran', 'frn', 'veg', 'brid', 'ubld'].map((k) => (skip.has(k) || !L[k] ? null : load(L[k][0]))),
]);
const gltfs = { bldg: bldg.filter(Boolean), tran, frn, veg, brid, ubld };
for (const g of Object.values(gltfs).flat()) if (g) scene.add(g.scene);
const T1 = performance.now();

// trivial clip-box patch: world-position discard outside the box (stands in for cutaway.patchMaterial)
const patch = (m) => {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTBox = { value: new THREE.Vector4(box.x0, box.z0, box.x1, box.z1) };
    sh.vertexShader = 'varying vec3 vTW;\n' + sh.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => s + '\n vTW = (modelMatrix*vec4(position,1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vTW; uniform vec4 uTBox;\n' + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => s + '\n if (vTW.x < uTBox.x || vTW.x > uTBox.z || vTW.z < uTBox.y || vTW.z > uTBox.w) discard;');
  };
  m.customProgramCacheKey = () => 'tbox';
  return m;
};
const Q = new URLSearchParams(location.search);
const C = Q.get('cut') ? createCutaway({ box: { ...box, yBottom: box.y0 ?? -20 }, buildingInfo: manifest.buildings }) : null;
const N = applyNight({ scene, renderer, manifest, gltfs, terrain, box, patch: C ? C.patchMaterial : patch, options: JSON.parse(new URLSearchParams(location.search).get('opt') || '{}') });
window.__N = N;
if (C) {
  C.applyToScene(scene, { buildingInfo: manifest.buildings });
  const pl = C.makePlinth(N.heightAt, { step: 4, topMaterial: N.makeGroundMaterial() });
  scene.add(pl);
  if (N.terrainMesh) N.terrainMesh.visible = false;
}
const T2 = performance.now();

const VIEWS = {
  aerial: { pos: [-250, 380, 520], tgt: [0, 20, 30], fov: 50 },
  topdown: { pos: [10, 260, 40], tgt: [10, 0, 22], fov: 50 },
  eye: { pos: [-22, 1.6, -18], tgt: [20, 6, 20], fov: 70 },
  tower: { pos: [-120, 60, -60], tgt: [140, 90, 120], fov: 60 },
  mid: { pos: [-150, 95, 120], tgt: [-50, 10, 10], fov: 50 },
};
window.__render = (name, frames = 1, t = 0) => {
  const v = VIEWS[name];
  camera.position.set(...v.pos); camera.fov = v.fov; camera.aspect = W / H; camera.updateProjectionMatrix(); camera.lookAt(...v.tgt);
  const times = [];
  const gl = renderer.getContext(), px = new Uint8Array(4);
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    N.update(t + i / 30, camera);
    if (C) C.update(camera, t + i / 30);
    N.render(camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  return { times, tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
};
window.__load = { fetchParse: Math.round(T1 - T0), applyNight: Math.round(T2 - T1), stats: N.stats, hdr: N.hdr };
window.__ready = true;
