// Photoreal cutaway backdrop: textured PLATEAU 2025 LOD2 Shibuya clipped to a diorama box with procedural interiors
// on the cut faces (cutaway.mjs), night look (night.mjs), camera presets / clip path (camera.mjs).
// Deterministic: window.__frame(t, shot?) positions the camera and draws one frame; window.__ready when loaded.
// Query: ?shot=<name> (preview a still), ?t=<s> (preview the clip at t), ?nonight=1 (plain textures, debug).
import * as THREE from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/addons/GLTFLoader.js';
import {createCutaway} from './cutaway.mjs';
import {SHOTS, clipCamera, applyCamera} from './camera.mjs';

const Q = new URLSearchParams(location.search);
const DATA = new URL('./data/', import.meta.url);
const log = (...a) => console.log('[pr]', ...a);

async function main() {
 const manifest = await (await fetch(new URL('manifest.json', DATA))).json();
 const terrain = await (await fetch(new URL('terrain.json', DATA))).json();
 const c = manifest.clip;
 const box = {x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, yBottom: -42};
 const W = innerWidth, H = innerHeight;
 const renderer = new THREE.WebGLRenderer({antialias: true, stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
 renderer.setPixelRatio(1); renderer.setSize(W, H);
 document.body.appendChild(renderer.domElement);
 const scene = new THREE.Scene();
 const camera = new THREE.PerspectiveCamera(40, W/H, 1, 4000);

 // ---- load (only building cells that overlap the clip box)
 const loader = new GLTFLoader();
 const load = f => loader.loadAsync(new URL(f, DATA).href).catch(e => { console.warn('missing', f, e.message); return null; });
 const overlaps = b => b && b.maxx > box.x0 && b.minx < box.x1 && b.maxz > box.z0 && b.minz < box.z1;
 const bldgFiles = manifest.layers.bldg.filter(f => !manifest.files[f]?.bounds || overlaps(manifest.files[f].bounds));
 const [bldg, tran, frn, veg, brid, ubld] = await Promise.all([
  Promise.all(bldgFiles.map(load)), ...['tran', 'frn', 'veg', 'brid', 'ubld'].map(k => manifest.layers[k]?.[0] ? load(manifest.layers[k][0]) : null)]);
 const gltfs = {bldg: bldg.filter(Boolean), tran, frn, veg, brid, ubld};
 for (const g of [...gltfs.bldg, tran, frn, veg, brid, ubld]) if (g) scene.add(g.scene);
 log('loaded', bldgFiles.length, 'building cells');

 // ---- cutaway (clip + interior caps + plinth)
 const C = createCutaway({box, floorHeight: 3.6, buildingInfo: manifest.buildings});
 const patch = m => (C.patchMaterial(m), m);

 // ---- night look (lighting module); fallback: plain textures + hemisphere light
 let N = null;
 if (!Q.has('nonight')) {
  try { const {applyNight} = await import('./night.mjs'); N = applyNight({scene, renderer, camera, manifest, gltfs, terrain, box, patch}); }
  catch (e) { console.warn('night.mjs unavailable:', e.message); }
 }
 if (!N) {
  scene.background = new THREE.Color(0x06070c);
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x30281c, 1.4));
  scene.traverse(o => { if (o.isMesh) patch(o.material); });
 }
 // caps on every building mesh
 const solids = [];
 for (const g of gltfs.bldg) g.scene.traverse(o => { if (o.isMesh && (o.geometry.attributes._bid || o.geometry.attributes._BID)) solids.push(o); });
 for (const o of solids) C.makeCapMesh(o, {buildingInfo: manifest.buildings});
 // plinth (terrain block with cut sides); the night module may provide the top material + height function
 const g = terrain;
 const heightAt = N?.heightAt || ((x, z) => {
  const fx = (x-g.x0)/g.step, fz = (z-g.z0)/g.step, i = Math.max(0, Math.min(g.nx-2, Math.floor(fx))), j = Math.max(0, Math.min(g.nz-2, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx-i)), v = Math.min(1, Math.max(0, fz-j)), at = (a, b) => g.heights[b*g.nx+a];
  return (at(i, j)*(1-u)+at(i+1, j)*u)*(1-v)+(at(i, j+1)*(1-u)+at(i+1, j+1)*u)*v; });
 const plinth = C.makePlinth(heightAt, {step: 4, topMaterial: N?.groundMaterial, underground: N?.underground || []});
 patch(plinth.userData.top.material);
 scene.add(plinth);
 if (N?.terrainMesh) N.terrainMesh.visible = false; // the plinth top replaces it

 const frame = (t, shot) => {
  applyCamera(camera, shot ? SHOTS[shot] : clipCamera(t));
  C.update(camera, t);
  if (N) { N.update(t, camera); N.render ? N.render(camera) : renderer.render(scene, camera); }
  else renderer.render(scene, camera);
  return {t, shot: shot || null};
 };
 window.__shots = SHOTS;
 window.__frame = frame;
 let tris = 0; scene.traverse(o => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count/3; });
 window.__stats = {buildingCells: bldgFiles.length, triangles: Math.round(tris), night: !!N};
 frame(Number(Q.get('t') || 0), Q.get('shot') || (Q.has('t') ? null : 'aerial')); // warm-up / shader compile
 window.__ready = true;
}
main().catch(e => { console.error(e); window.__error = String(e && e.stack || e); });
