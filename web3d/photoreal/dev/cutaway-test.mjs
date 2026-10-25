// Synthetic test scene for cutaway.mjs (no real data). Exposes window.__ready and window.__render(view) -> ms.
import * as THREE from '../../vendor/three.module.min.js';
import { createCutaway } from '../cutaway.mjs';

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090f);
const camera = new THREE.PerspectiveCamera(35, W / H, 1, 3000);
scene.add(new THREE.HemisphereLight(0x5a6c9a, 0x15110c, 0.5));
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.6); moon.position.set(-0.5, 1, 0.3); scene.add(moon);

// ---------------- deterministic RNG
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const terrain = (x, z) => 0.045 * x + 2.5 * Math.sin(z / 55) + 1.2 * Math.sin((x + z) / 31);

const BOX = { x0: -80, x1: 62, z0: -90, z1: 65, yBottom: -45 };
const C = createCutaway({ box: BOX, floorHeight: 3.6 });

// ---------------- buildings: merge non-indexed geometries with a _bid attribute
const parts = [];
const info = {};
let nextBid = 1;
function addSolid(geom, bid) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();
  parts.push({ g, bid });
}
function boxSolid(cx, cz, w, d, y0, y1, bid) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d);
  g.translate(cx, (y0 + y1) / 2, cz);
  addSolid(g, bid);
}
function baseAt(cx, cz, w, d) {
  return Math.min(terrain(cx - w / 2, cz - d / 2), terrain(cx + w / 2, cz - d / 2), terrain(cx - w / 2, cz + d / 2), terrain(cx + w / 2, cz + d / 2)) - 0.3;
}
// tiered tower straddling the south edge
// (two stacked boxes, same bid, sharing the podium roof plane)
const reserved = [[-2, 42, 48, 84], [-104, -56, -56, -6], [41, 99, -114, -66]];
{
  const bid = nextBid++, y0 = baseAt(20, 65, 40, 30);
  boxSolid(20, 65, 40, 30, y0, y0 + 24, bid);
  boxSolid(24, 68, 22, 18, y0 + 24, y0 + 95, bid);  // part sharing the podium roof plane
  info[bid] = { storeys: 24, storeysBelow: 3 };
}
// L-shaped extruded solid straddling the west edge
{
  const bid = nextBid++;
  const s = new THREE.Shape();
  s.moveTo(-100, 10); s.lineTo(-60, 10); s.lineTo(-60, 22); s.lineTo(-76, 22); s.lineTo(-76, 52); s.lineTo(-100, 52); s.lineTo(-100, 10);
  const h = 38, y0 = terrain(-100, -30) - 0.5;
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);             // shape (x,y) -> (x, 0, -y), extrusion -> +y
  g.translate(0, y0, 0);
  addSolid(g, bid);
  info[bid] = { storeys: 11 };
}
// a large low podium crossing the whole box east-west at the north edge corner
{
  const bid = nextBid++, y0 = baseAt(70, -90, 50, 40);
  boxSolid(70, -90, 50, 40, y0, y0 + 16, bid);
  boxSolid(60, -88, 20, 16, y0 + 16, y0 + 70, bid);
  info[bid] = { storeys: 18, storeysBelow: 2 };
}

// grid city
for (let bx = -160; bx < 160; bx += 34) for (let bz = -160; bz < 160; bz += 30) {
  const n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const w = 8 + rnd() * 16, d = 8 + rnd() * 14;
    const cx = bx + 6 + w / 2 + rnd() * Math.max(0, 22 - w), cz = bz + 6 + d / 2 + rnd() * Math.max(0, 18 - d);
    const h = rnd() < 0.12 ? 60 + rnd() * 80 : 9 + Math.pow(rnd(), 1.6) * 40;
    if (reserved.some((r) => cx + w / 2 > r[0] && cx - w / 2 < r[1] && cz + d / 2 > r[2] && cz - d / 2 < r[3])) continue;
    reserved.push([cx - w / 2 - 1, cx + w / 2 + 1, cz - d / 2 - 1, cz + d / 2 + 1]);
    const bid = nextBid++;
    const y0 = baseAt(cx, cz, w, d);
    boxSolid(cx, cz, w, d, y0, y0 + h, bid);
    info[bid] = { storeys: Math.max(1, Math.round(h / (3.2 + rnd() * 1.0))), storeysBelow: rnd() < 0.4 ? 1 + Math.floor(rnd() * 3) : 0 };
  }
}
let total = 0;
for (const p of parts) total += p.g.getAttribute('position').count;
const posA = new Float32Array(total * 3), nrmA = new Float32Array(total * 3), bidA = new Float32Array(total);
let o = 0;
for (const p of parts) {
  const P = p.g.getAttribute('position'), N = p.g.getAttribute('normal');
  posA.set(P.array, o * 3); nrmA.set(N.array, o * 3); bidA.fill(p.bid, o, o + P.count); o += P.count;
}
const bgeom = new THREE.BufferGeometry();
bgeom.setAttribute('position', new THREE.BufferAttribute(posA, 3));
bgeom.setAttribute('normal', new THREE.BufferAttribute(nrmA, 3));
bgeom.setAttribute('_bid', new THREE.BufferAttribute(bidA, 1));

// facade: dark material with procedural lit windows (onBeforeCompile; chained by C.patchMaterial)
const facade = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.8, metalness: 0.1 });
facade.onBeforeCompile = (sh) => {
  sh.vertexShader = 'varying vec3 vFW; varying vec3 vFN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvFW=(modelMatrix*vec4(transformed,1.0)).xyz; vFN=normalize(mat3(modelMatrix)*objectNormal);');
  sh.fragmentShader = 'varying vec3 vFW; varying vec3 vFN;\nfloat fh(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\n' +
    sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    if (abs(vFN.y) < 0.5) {
      float u = abs(vFN.x) > 0.5 ? vFW.z : vFW.x;
      vec2 cell = vec2(floor(u/2.2), floor(vFW.y/3.6));
      vec2 f = vec2(fract(u/2.2), fract(vFW.y/3.6));
      float win = step(0.18, f.x)*step(f.x,0.86)*step(0.3,f.y)*step(f.y,0.85);
      float r = fh(vec3(cell, floor(u/40.0)));
      vec3 wc = r < 0.5 ? vec3(0.0) : (r < 0.8 ? vec3(1.0,0.65,0.35) : vec3(0.8,0.9,1.0));
      totalEmissiveRadiance += win * wc * 0.55;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05,0.06,0.08), win);
    }`);
};
C.patchMaterial(facade);
const buildings = new THREE.Mesh(bgeom, facade);
scene.add(buildings);
const caps = C.makeCapMesh(buildings, { buildingInfo: info });

// plinth (+ one underground hook: a subway box on the south face)
const plinth = C.makePlinth(terrain, {
  step: 3,
  underground: [{ side: 'z1', u0: -60, u1: -25, y0: -22, y1: -15 }],
});
C.patchMaterial(plinth.userData.top.material);
scene.add(plinth);

// ShaderMaterial (no #include chunks) crossing the box: must be clipped by patchMaterial too
const bar = new THREE.Mesh(new THREE.BoxGeometry(400, 1.5, 1.5), new THREE.ShaderMaterial({
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0, 0.1, 0.8, 1.0); }',
}));
bar.position.set(0, 75, -20);
C.patchMaterial(bar.material);
scene.add(bar);

// ---------------- views
const VIEWS = {
  aerial: { pos: [-200, 150, 250], tgt: [-5, 10, 0], fovL: 34, fovP: 50 },
  close: { pos: [-12, 30, 125], tgt: [10, 22, 64], fovL: 50, fovP: 70 },
  corner: { pos: [190, 70, 200], tgt: [60, 15, 70], fovL: 40, fovP: 60 },
  low: { pos: [-40, 3, 160], tgt: [10, 8, 85], fovL: 55, fovP: 75 },
  inside: { pos: [-30, 45, 10], tgt: [60, 25, -60], fovL: 60, fovP: 80 },
};
function setView(name) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  camera.fov = W > H ? v.fovL : v.fovP;
  camera.aspect = W / H; camera.updateProjectionMatrix();
  camera.lookAt(...v.tgt);
}
const gl = renderer.getContext();
const px = new Uint8Array(4);
window.__render = (name, frames = 1, opt = {}) => {
  setView(name);
  caps.visible = opt.caps !== false; buildings.material.visible = opt.facade !== false;
  const times = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    C.update(camera, i * 0.04);
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  return { times, tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
};
window.__ready = true;
