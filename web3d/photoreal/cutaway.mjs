// Photoreal cutaway: clip box + procedural section caps (interior mapping) + solid plinth.
// Coordinates per CONTRACT.md: metres, x east, y up, z south. three r160, WebGL2 required (gl_FragDepth, texelFetch).
//
// Render order (set automatically via renderOrder, see RENDER_ORDER):
//    0..8  buildings (patched, clipped) and other opaque parts that do NOT pass through building interiors
//    9     cap depth pass (extruded basement front faces, depth only)
//    10    cap pass A  (building back faces, real depth test, validity checks, colour off, writes stencil=1)
//    11    cap pass B  (same back faces, stencil==1, shaded at the clip-plane entry point, writes gl_FragDepth of that point)
//    12    plinth TOP / terrain (goes through building interiors, so it must come after the caps)
//    13    plinth SIDES + bottom (after caps so basement/semi-underground caps win over the coplanar plinth section)
// The renderer must have a stencil buffer (WebGLRenderer default stencil:true) and autoClearStencil (default).
//
// API
//   const C = createCutaway({ box:{x0,x1,z0,z1,yBottom}, floorHeight=3.6, basementHeight=3.4, buildingInfo,
//                             interiorGain=1, slabColor=0x3a3a3c, slabThickness=0.55, columnWidth=0.45,
//                             darkFraction=0.16, spookyFraction=0.035, capBias=0.6, clipEps=0.02 })
//   C.patchMaterial(material|material[])      world-space clip-box discard via onBeforeCompile (material.userData.cwMaxY: optional y ceiling) (chains existing
//                                             onBeforeCompile + own customProgramCacheKey). Works for built-in and
//                                             ShaderMaterial (falls back to `position` if there is no <project_vertex>).
//   C.makeCapMesh(meshOrGeometry, {buildingInfo, bidAttribute, bid, basements=true, attach=true}) -> Group
//        Mesh: caps are added as its child (follow its transform). Only triangles of buildings whose bbox crosses a
//        box side are drawn. Adds a shared `aBid` alias attribute to the geometry.
//   C.applyToScene(root, {buildingInfo, filter}) -> Group[]   patch all materials + caps for meshes with a bid attr
//   C.makePlinth(heightFn(x,z) | {data,nx,nz,x0,x1,z0,z1}, {step=4, color, lipColor, lipWidth, topMaterial, topColor,
//                underground:[{side:'x0'|'x1'|'z0'|'z1', u0,u1,y0,y1, gain}]}) -> Group (userData.top/sides/bottom)
//   C.setBox(box), C.update(camera, tSeconds), C.addBuildingInfo(info), C.uniforms (uGain, uConcrete, ...), RENDER_ORDER
//   buildingInfo = manifest.buildings: {<bid>: {storeys, storeysBelow, ...}}; base/top/footprint bbox are measured
//   from the geometry per bid (so they always match the mesh).
//
// Requirements on building geometry: CLOSED solids incl. bottom (GroundSurface) faces, outward CCW winding (glTF
// standard; three handles mirrored transforms), no interpenetrating solids of different buildings (coplanar shared
// walls/floors between parts are fine), one building id per vertex (`_bid`/`_BID` float attribute; three's
// GLTFLoader lower-cases `_BID` to `_bid`) for per-building storeys + the leak guard. Without an id the whole mesh is
// treated as one building (global floorHeight, base y=0, no leak guard). Bids should be dense small ints (texture
// lookup, 1024 per row).
import * as THREE from '../vendor/three.module.min.js';

const INFO_W = 1024;
// renderOrder slots. Buildings and other opaque scene parts: < 9. Anything that passes THROUGH building interiors
// (terrain / DEM / plinth top) must be drawn after the caps (>= ground), or it hides the back faces that trigger caps.
export const RENDER_ORDER = { buildings: 0, capDepth: 9, capStencil: 10, capShade: 11, ground: 12, section: 13 };

// ---------------------------------------------------------------- shared GLSL
const GLSL_HASH = /* glsl */`
float cwHash(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
`;

// Interior-mapped section shading. Inputs in "section space": pu = along the cut (m), py = world y, rd* = ray
// direction in (u, y, w) with w = depth into the solid (rdw > 0). Returns linear radiance.
const GLSL_SECTION = /* glsl */`
uniform float uGain;
uniform float uTime;
uniform vec3  uConcrete;
uniform float uSlabT;
uniform float uColW;
uniform float uDarkFrac;
uniform float uSpookyFrac;

vec3 cwLightColour(float r, float office, out float I){
  // r in [0,1): pick light kind. office in [0,1] biases to cool white.
  float dark = uDarkFrac, spooky = uSpookyFrac;
  float cool = mix(0.18, 0.65, office);
  I = 1.0;
  if (r < dark) { I = 0.0; return vec3(0.0); }
  r = (r - dark) / (1.0 - dark);
  if (r < spooky*0.6) { I = 1.2; return vec3(1.0, 0.36, 0.05); }        // jack-o-lantern orange
  if (r < spooky) { I = 1.1; return vec3(0.55, 0.18, 1.0); }            // purple
  r = (r - spooky) / (1.0 - spooky);
  if (r < cool) { I = 0.95; return vec3(0.8, 0.9, 1.0); }             // ~5000K office
  r = (r - cool) / (1.0 - cool);
  if (r < 0.5) { I = 0.8; return vec3(1.0, 0.6, 0.32); }             // ~2700K
  I = 0.9; return vec3(1.0, 0.75, 0.5);                                // ~3500K
}

// returns colour; ent = entry t (unused), bid/fi/ci seeds
vec3 cwSection(float pu, float py, vec3 rd, float base, float top, float fh, float bid, float side){
  float yRel = py - base;
  float fi = floor(yRel / fh);
  bool under = fi < 0.0;
  float hb1 = cwHash(vec3(bid, 1.7, 3.1));
  float hb2 = cwHash(vec3(bid, 9.2, 0.4));
  float office = step(0.55, cwHash(vec3(bid, 4.4, 7.7)));
  float roomW = under ? 7.5 : mix(3.6, 7.2, hb1) * (office > 0.5 ? 1.25 : 1.0);
  float D = under ? 14.0 : mix(5.0, 9.5, hb2);
  float slabT = under ? uSlabT*1.4 : uSlabT;
  float colW = uColW * (under ? 1.6 : 1.0);
  float y0 = base + fi*fh;
  float ci = floor(pu / roomW);
  float lu = pu - ci*roomW;          // 0..roomW
  float ly = py - y0;                // 0..fh
  float topLocal = min(fh, top - uSlabT*1.2 - y0);
  float hr = cwHash(vec3(bid*0.37 + side*17.0, fi + 0.5, ci + 0.25));
  // whole floors tend to share one lighting state (offices strongly, homes less): reads as floor bands from afar
  float hf = cwHash(vec3(bid*0.53 + side*5.0, fi + 0.75, 9.1));
  if (cwHash(vec3(ci*0.71 + 2.0, fi, bid*0.29)) < mix(0.4, 0.82, office)) hr = hf;
  float hr2 = cwHash(vec3(ci*1.3 + 5.0, bid, fi*0.7 + side));
  float hr3 = cwHash(vec3(fi + 3.3, ci*0.91, bid + side*3.0));

  float I; vec3 Lc;
  if (under) { Lc = vec3(0.7, 0.85, 1.0); I = hr < 0.3 ? 0.05 : 0.22; }
  else Lc = cwLightColour(hr, office, I);
  I *= uGain * mix(0.45, 1.15, hr2*hr2);

  // ---- structure on the cut face (slab band, columns, roof slab)
  float roofD = top - py;
  bool slab = ly < slabT || roofD < uSlabT*1.2 || topLocal < slabT + 1.6;
  bool col = lu < colW*0.5 || lu > roomW - colW*0.5;
  if (slab || col) {
    vec3 c = uConcrete;
    // subtle edge highlight at the slab lip, spill from the room below/above
    float edge = slab ? smoothstep(0.08, 0.0, abs(ly - slabT)) + smoothstep(0.08, 0.0, ly) : 0.0;
    c *= 0.85 + 0.3*cwHash(vec3(floor(pu*2.0), floor(py*2.0), bid));
    vec3 spill = Lc * I * 0.06 * (slab ? smoothstep(0.0, slabT, ly) : 1.0);
    return c * (0.55 + 0.45*edge) + spill * (roofD < uSlabT*1.2 ? 0.0 : 1.0);
  }

  // ---- room box in local coords
  float umin = colW*0.5, umax = roomW - colW*0.5, ymin = slabT, ymax = topLocal;
  vec3 p = vec3(lu, ly, 0.0);
  vec3 d = rd;
  vec3 dd = vec3(abs(d.x) < 1e-5 ? 1e-5 : d.x, abs(d.y) < 1e-5 ? 1e-5 : d.y, max(d.z, 1e-5));
  float tu = ((dd.x > 0.0 ? umax : umin) - p.x) / dd.x;
  float ty = ((dd.y > 0.0 ? ymax : ymin) - p.y) / dd.y;
  float tw = D / dd.z;
  float t = min(min(tu, ty), tw);
  vec3 n; vec3 alb; float face;
  vec3 H = p + dd*t;
  float wallTone = cwHash(vec3(bid, fi*0.13, 2.0));
  vec3 wallC = under ? vec3(0.42) : mix(vec3(0.62,0.58,0.52), vec3(0.55,0.6,0.62), wallTone) * mix(0.75, 1.05, hr3);
  vec3 em = vec3(0.0);
  if (t == ty) {
    if (dd.y < 0.0) { // floor
      n = vec3(0,1,0);
      alb = under ? vec3(0.30,0.30,0.31) : mix(vec3(0.36,0.24,0.15), vec3(0.28,0.27,0.30), hr3);
      if (under && abs(fract(H.x/2.5) - 0.5) > 0.47) alb = vec3(0.7, 0.66, 0.5); // bay lines
    } else { // ceiling + lamp
      n = vec3(0,-1,0);
      alb = vec3(0.55);
      vec2 lp = abs(vec2(H.x - (umin+umax)*0.5, H.z - D*0.45));
      if (lp.x < (under ? 2.5 : 0.7) && lp.y < (under ? 0.12 : 0.5)) em = Lc * I * 1.6;
    }
  } else if (t == tw) { // back wall with clutter
    n = vec3(0,0,-1);
    alb = wallC;
    float cell = floor(H.x / 0.55);
    float hc = cwHash(vec3(cell, fi, bid + ci*7.0));
    float cabH = (ymin + 0.4 + 1.6*hr2);
    if (!under && H.y < cabH && hc > 0.35) {  // shelves / cabinets silhouettes
      vec3 goods = 0.5 + 0.5*cos(6.2831*(hc*3.0 + vec3(0.0, 0.33, 0.67)));   // colourful stock / books
      alb = mix(vec3(0.16,0.12,0.1), goods*0.55, step(0.6, hc) * step(0.45, hr)) * (fract(H.y*2.2) < 0.1 ? 0.35 : 1.0);
    }
    if (!under && hr3 > 0.6 && abs(H.x - umin - (umax-umin)*hr2) < 0.5 && abs(H.y - ymin - 1.6) < 0.35) // poster / screen
      { alb = vec3(0.1); em = (I < 0.01 ? vec3(0.1,0.25,0.6)*0.6 : vec3(0.3,0.5,0.9)*0.15) * (0.7+0.3*sin(uTime*7.0+hr*40.0)); }
  } else { // side wall
    n = vec3(dd.x > 0.0 ? -1.0 : 1.0, 0, 0);
    alb = wallC * 0.9;
    if (!under && H.y < ymin + 0.85 && H.z > D*hr2*0.5 && H.z < D*(0.5 + 0.5*hr3)) alb = vec3(0.2,0.15,0.12); // sideboard
  }

  // ---- one furniture block (desk / sofa / counter; car in the parking)
  float fw0 = D * mix(0.25, 0.6, hr2), fw1 = fw0 + (under ? 4.3 : mix(0.8, 2.2, hr3));
  float fu0 = umin + (umax - umin) * (under ? 0.15 : mix(0.1, 0.5, hr3)), fu1 = fu0 + (under ? 1.8 : mix(0.8, 2.4, hr));
  float fy1 = ymin + (under ? 1.45 : mix(0.75, 1.15, hr2));
  if (under ? hr > 0.3 : I > 0.0 || hr3 > 0.5) {
    vec3 bmin = vec3(fu0, ymin, fw0), bmax = vec3(min(fu1, umax-0.2), fy1, fw1);
    vec3 t0 = (bmin - p) / dd, t1 = (bmax - p) / dd;
    vec3 tn3 = min(t0, t1), tf3 = max(t0, t1);
    float tn = max(max(tn3.x, tn3.y), tn3.z), tf = min(min(tf3.x, tf3.y), tf3.z);
    if (tn > 0.0 && tn < tf && tn < t) {
      t = tn; H = p + dd*t;
      n = tn == tn3.y ? vec3(0,1,0) : (tn == tn3.x ? vec3(-sign(dd.x),0,0) : vec3(0,0,-1));
      alb = under ? mix(vec3(0.5,0.05,0.05), vec3(0.6,0.62,0.65), step(0.5, hr3)) * (0.4 + 0.6*hr2)
                  : mix(vec3(0.22,0.14,0.09), vec3(0.45,0.42,0.38), hr) * (n.y > 0.5 ? 1.15 : 0.7);
      em = vec3(0.0);
    }
  }

  // ---- lighting: one ceiling light + bounce
  vec3 L = vec3((umin+umax)*0.5, ymax - 0.15, D*0.45);
  vec3 tl = L - H;
  float dist2 = dot(tl, tl);
  float lam = max(dot(n, tl * inversesqrt(dist2)), 0.0);
  float att = 1.0 / (1.0 + 0.16*dist2);
  vec3 col3 = alb * Lc * I * (lam*att*1.6 + 0.07) + em;
  // dark rooms: faint cool skyglow on surfaces near the cut
  col3 += alb * vec3(0.02, 0.026, 0.05) * uGain * exp(-H.z*0.3);
  // depth cue
  col3 *= mix(1.0, 0.55, clamp(H.z / 12.0, 0.0, 1.0));
  // grazing view onto the cut: interior detail aliases -> fade to the room's average radiance
  vec3 avg = wallC * Lc * I * 0.35 + vec3(0.004, 0.005, 0.009) * uGain;
  return mix(avg, col3, smoothstep(0.06, 0.22, dd.z));
}
`;

// ---------------------------------------------------------------- module
export function createCutaway(opts = {}) {
  const box = { x0: -100, x1: 100, z0: -100, z1: 100, yBottom: -40, ...(opts.box || {}) };
  const floorHeight = opts.floorHeight ?? 3.6;
  const basementHeight = opts.basementHeight ?? 3.4;

  const uniforms = {
    uBoxMin: { value: new THREE.Vector3(box.x0, box.yBottom, box.z0) },
    uBoxMax: { value: new THREE.Vector3(box.x1, 1e6, box.z1) },
    uClipEps: { value: opts.clipEps ?? 0.02 },
    uTime: { value: 0 },
    uGain: { value: opts.interiorGain ?? 1.0 },
    uConcrete: { value: new THREE.Color(opts.slabColor ?? 0x3a3a3c) },
    uSlabT: { value: opts.slabThickness ?? 0.55 },
    uColW: { value: opts.columnWidth ?? 0.45 },
    uDarkFrac: { value: opts.darkFraction ?? 0.16 },
    uSpookyFrac: { value: opts.spookyFraction ?? 0.035 },
    uFloorH: { value: floorHeight },
    uCapBias: { value: opts.capBias ?? 0.6 },
  };

  // ---------------- building registry -> info texture (2 texels per building)
  const reg = new Map(); // bid -> {minx,maxx,miny,maxy,minz,maxz, storeys, below}
  const meta = opts.buildingInfo || {};
  let infoTex = new THREE.DataTexture(new Float32Array(4 * INFO_W * 2), INFO_W, 2, THREE.RGBAFormat, THREE.FloatType);
  const infoU = { value: infoTex };
  let dirty = false;

  function addMeta(info) { if (info) for (const k in info) meta[k] = info[k]; dirty = true; }

  function rebuildInfo() {
    let maxBid = 0;
    for (const b of reg.keys()) maxBid = Math.max(maxBid, b);
    const rows = Math.ceil((maxBid + 1) / INFO_W);
    const data = new Float32Array(4 * INFO_W * rows * 2);
    for (const [bid, r] of reg) {
      const m = meta[bid] || meta[String(bid)] || {};
      const base = r.miny, top = r.maxy, h = Math.max(top - base, 0.5);
      let st = +m.storeys || 0;
      let fh = st > 0 ? h / st : 0;
      if (!(fh >= 2.5 && fh <= 7)) { st = Math.max(1, Math.round(h / floorHeight)); fh = h / st; }
      const below = (+m.storeysBelow || 0) * basementHeight;
      const x = bid % INFO_W, y = Math.floor(bid / INFO_W) * 2;
      const i0 = 4 * (y * INFO_W + x), i1 = 4 * ((y + 1) * INFO_W + x);
      data.set([base, top, fh, below], i0);
      data.set([r.minx, r.maxx, r.minz, r.maxz], i1);
    }
    infoTex.dispose();
    infoTex = new THREE.DataTexture(data, INFO_W, rows * 2, THREE.RGBAFormat, THREE.FloatType);
    infoTex.needsUpdate = true;
    infoU.value = infoTex;
    dirty = false;
  }

  function registerGeometry(geom, matrixWorld, bidAttr, fixedBid) {
    const pos = geom.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (matrixWorld) v.applyMatrix4(matrixWorld);
      const bid = bidAttr ? Math.round(bidAttr.getX(i)) : fixedBid;
      let r = reg.get(bid);
      if (!r) { r = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, minz: Infinity, maxz: -Infinity }; reg.set(bid, r); }
      if (v.x < r.minx) r.minx = v.x; if (v.x > r.maxx) r.maxx = v.x;
      if (v.y < r.miny) r.miny = v.y; if (v.y > r.maxy) r.maxy = v.y;
      if (v.z < r.minz) r.minz = v.z; if (v.z > r.maxz) r.maxz = v.z;
    }
    dirty = true;
  }

  // ---------------- clip patch for arbitrary materials
  const CLIP_VERT_DECL = 'varying vec3 vCwWorld;\n';
  const CLIP_VERT = `
  { vec4 cwp = vec4(CW_POS, 1.0);
    #ifdef USE_INSTANCING
      cwp = instanceMatrix * cwp;
    #endif
    #ifdef USE_BATCHING
      cwp = batchingMatrix * cwp;
    #endif
    vCwWorld = (modelMatrix * cwp).xyz; }
`;
  const CLIP_FRAG_DECL = 'varying vec3 vCwWorld;\nuniform vec3 uBoxMin;\nuniform vec3 uBoxMax;\nuniform float uClipEps;\n';
  const CLIP_FRAG = `
  if (vCwWorld.x < uBoxMin.x - uClipEps || vCwWorld.x > uBoxMax.x + uClipEps ||
      vCwWorld.z < uBoxMin.z - uClipEps || vCwWorld.z > uBoxMax.z + uClipEps ||
      vCwWorld.y < uBoxMin.y - uClipEps) discard;
`;
  function injectMain(src, code) {
    const i = src.search(/void\s+main\s*\(\s*(void)?\s*\)\s*\{/);
    if (i < 0) throw new Error('cutaway.patchMaterial: no main()');
    const j = src.indexOf('{', i) + 1;
    return src.slice(0, j) + code + src.slice(j);
  }

  function patchMaterial(material) {
    if (Array.isArray(material)) { material.forEach(patchMaterial); return material; }
    if (!material || material.userData.__cutawayPatched) return material;
    material.userData.__cutawayPatched = true;
    const prev = material.onBeforeCompile;
    // only an OWN customProgramCacheKey is meaningful; the prototype one stringifies onBeforeCompile (= our wrapper)
    const prevKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
    material.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      shader.uniforms.uBoxMin = uniforms.uBoxMin;
      shader.uniforms.uBoxMax = uniforms.uBoxMax;
      shader.uniforms.uClipEps = uniforms.uClipEps;
      let vs = shader.vertexShader;
      if (vs.includes('#include <project_vertex>')) {
        vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + CLIP_VERT.replace('CW_POS', 'transformed'));
      } else {
        vs = injectMain(vs, CLIP_VERT.replace('CW_POS', 'position'));
      }
      shader.vertexShader = CLIP_VERT_DECL + vs;
      const maxY = material.userData.cwMaxY; // optional ceiling (e.g. underground layers must never reach the street)
      shader.fragmentShader = CLIP_FRAG_DECL + injectMain(shader.fragmentShader, CLIP_FRAG +
        (maxY !== undefined ? `  if (vCwWorld.y > ${Number(maxY).toFixed(3)}) discard;\n` : ''));
    };
    material.customProgramCacheKey = function () {
      return (prevKey ? prevKey.call(this) : (prev ? prev.toString() : '')) + '|cutaway1|' + (this.userData.cwMaxY ?? '');
    };
    material.needsUpdate = true;
    return material;
  }

  // ---------------- caps
  const CAP_VERT = /* glsl */`
  attribute float aBid;
  uniform sampler2D uInfo;
  varying vec3 vWP;
  flat varying float vBid;
  void main(){
    #ifdef CW_HAS_BID
      vBid = aBid;
    #else
      vBid = 0.0;
    #endif
    vec4 wp = modelMatrix * vec4(position, 1.0);
    #ifdef CW_BASEMENT
      ivec2 c = ivec2(int(mod(vBid, ${INFO_W}.0)), int(floor(vBid / ${INFO_W}.0)) * 2);
      vec4 i0 = texelFetch(uInfo, c, 0);
      if (i0.w > 0.0 && wp.y < i0.x + 0.3) wp.y = i0.x - i0.w;
    #endif
    vWP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

  // pass A (SHADE undefined) runs the same validity checks so the stencil only marks real cut pixels
  const CAP_FRAG = (shade) => /* glsl */`
  ${shade ? '#define CW_SHADE' : ''}
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform sampler2D uInfo;
  uniform float uCapBias;
  uniform float uFloorH;
  uniform mat4 projectionMatrix;
  varying vec3 vWP;
  flat varying float vBid;
  ${shade ? GLSL_HASH + GLSL_SECTION : ''}
  void main(){
    vec3 ro = cameraPosition;
    vec3 dv = vWP - ro;
    float tB = length(dv);
    vec3 rd = dv / tB;
    vec3 rs = vec3(abs(rd.x) < 1e-6 ? 1e-6 : rd.x, rd.y, abs(rd.z) < 1e-6 ? 1e-6 : rd.z);
    float tx0 = (uBoxMin.x - ro.x) / rs.x, tx1 = (uBoxMax.x - ro.x) / rs.x;
    float tz0 = (uBoxMin.z - ro.z) / rs.z, tz1 = (uBoxMax.z - ro.z) / rs.z;
    float txn = min(tx0, tx1), txf = max(tx0, tx1);
    float tzn = min(tz0, tz1), tzf = max(tz0, tz1);
    float tyn = -1e9, tyf = 1e9;
    if (abs(rd.y) > 1e-6) {
      float ty = (uBoxMin.y - ro.y) / rd.y;
      if (rd.y > 0.0) tyn = ty; else tyf = ty;
    } else if (ro.y < uBoxMin.y) discard;
    float tEn = max(max(txn, tzn), tyn);
    float tEx = min(min(txf, tzf), tyf);
    // eye inside the box (tEn<=0), ray misses the box, or the back face is in front of the box: no cap
    if (tEn <= 0.0 || tEn >= tEx || tEn >= tB) discard;
    vec3 Q = ro + rd * tEn;

    // per-building info + leak guard (entry point must lie within the building's extents)
    float base = 0.0, top = 1e5, fh = uFloorH, below = 0.0;
    #ifdef CW_HAS_BID
      ivec2 c = ivec2(int(mod(vBid, ${INFO_W}.0)), int(floor(vBid / ${INFO_W}.0)) * 2);
      vec4 i0 = texelFetch(uInfo, c, 0);
      vec4 i1 = texelFetch(uInfo, c + ivec2(0, 1), 0);
      base = i0.x; top = i0.y; fh = i0.z; below = i0.w;
      if (Q.x < i1.x - 0.3 || Q.x > i1.y + 0.3 || Q.z < i1.z - 0.3 || Q.z > i1.w + 0.3 ||
          Q.y > top + 0.3 || Q.y < base - below - 0.3) discard;
    #endif
  #ifndef CW_SHADE
    gl_FragColor = vec4(0.0);
  #else
    vec3 col;
    if (tEn == tyn) {
      col = uConcrete * 0.3;   // entered through the bottom plane
    } else {
      bool xPlane = tEn == txn;
      float pu = xPlane ? Q.z * sign(rd.x) : -Q.x * sign(rd.z);
      vec3 lrd = xPlane ? vec3(rd.z * sign(rd.x), rd.y, abs(rd.x)) : vec3(-rd.x * sign(rd.z), rd.y, abs(rd.z));
      float side = xPlane ? (rd.x > 0.0 ? 0.0 : 1.0) : (rd.z > 0.0 ? 2.0 : 3.0);
      col = cwSection(pu, Q.y, lrd, base, top, max(fh, 2.2), vBid, side);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    // depth of the cut point, pulled slightly toward the eye (beats the coplanar plinth side); nearer back faces win ties
    float tD = tEn - uCapBias - 0.0008 * tEn + 0.004 * min(tB - tEn, 150.0);
    vec4 clip = projectionMatrix * viewMatrix * vec4(ro + rd * max(tD, 0.0), 1.0);
    gl_FragDepth = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
  #endif
  }`;

  function capMaterials(hasBid, basement) {
    const defines = {};
    if (hasBid) defines.CW_HAS_BID = '';
    if (basement && hasBid) defines.CW_BASEMENT = '';
    const u = { ...uniforms, uInfo: infoU };
    const A = new THREE.ShaderMaterial({
      name: 'cutawayCapA', uniforms: u, defines, vertexShader: CAP_VERT, fragmentShader: CAP_FRAG(false),
      side: THREE.BackSide, colorWrite: false, depthWrite: false, depthTest: true,
      // back faces win over coplanar internal front faces (building parts sharing a wall/floor plane)
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
    });
    const B = new THREE.ShaderMaterial({
      name: 'cutawayCapB', uniforms: u, defines, vertexShader: CAP_VERT, fragmentShader: CAP_FRAG(true),
      side: THREE.BackSide, depthWrite: true, depthTest: true, depthFunc: THREE.LessDepth,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
    });
    // basement front faces (extruded part), depth only: hides underground back faces from rays that come through air
    const Z = basement && hasBid ? new THREE.ShaderMaterial({
      name: 'cutawayCapZ', uniforms: u, defines, vertexShader: CAP_VERT,
      fragmentShader: `uniform vec3 uBoxMin; uniform vec3 uBoxMax; varying vec3 vWP;
        void main(){ if (vWP.x < uBoxMin.x || vWP.x > uBoxMax.x || vWP.z < uBoxMin.z || vWP.z > uBoxMax.z) discard;
          gl_FragColor = vec4(0.0); }`,
      side: THREE.FrontSide, colorWrite: false, depthWrite: true, depthTest: true,
    }) : null;
    return [A, B, Z];
  }

  function findBidAttr(geom, name) {
    if (name) return geom.getAttribute(name);
    return geom.getAttribute('_bid') || geom.getAttribute('_BID') || geom.getAttribute('aBid') || null;
  }

  // makeCapMesh(meshOrGeometry, {buildingInfo, bidAttribute, bid, basements=true, attach=true}) -> THREE.Group
  function makeCapMesh(src, o = {}) {
    if (o.buildingInfo) addMeta(o.buildingInfo);
    const isMesh = src && src.isMesh;
    const geom = isMesh ? src.geometry : src;
    let bidAttr = findBidAttr(geom, o.bidAttribute);
    const fixedBid = o.bid ?? null;
    if (!bidAttr && fixedBid != null) {
      bidAttr = new THREE.BufferAttribute(new Float32Array(geom.getAttribute('position').count).fill(fixedBid), 1);
    }
    if (bidAttr && geom.getAttribute('aBid') !== bidAttr) geom.setAttribute('aBid', bidAttr);
    if (isMesh) src.updateWorldMatrix(true, false);
    registerGeometry(geom, isMesh ? src.matrixWorld : null, bidAttr, 0);
    if (dirty) rebuildInfo();
    const [A, B, Z] = capMaterials(!!bidAttr, o.basements !== false);
    // cap geometry = only triangles of buildings whose footprint crosses a side of the box (the others can never
    // produce a cap and would only cost fragment work, which dominates in SwiftShader)
    const capGeom = new THREE.BufferGeometry();
    for (const k in geom.attributes) capGeom.setAttribute(k, geom.attributes[k]);
    const entry = { src: geom, capGeom, bidAttr, bounds: null };
    filterCap(entry);
    capEntries.push(entry);
    const g = new THREE.Group();
    g.name = 'cutawayCap';
    const mA = new THREE.Mesh(capGeom, A); mA.renderOrder = RENDER_ORDER.capStencil; mA.frustumCulled = isMesh ? src.frustumCulled : true;
    const mB = new THREE.Mesh(capGeom, B); mB.renderOrder = RENDER_ORDER.capShade; mB.frustumCulled = mA.frustumCulled;
    g.add(mA, mB);
    if (Z) { const mZ = new THREE.Mesh(capGeom, Z); mZ.renderOrder = RENDER_ORDER.capDepth; mZ.frustumCulled = mA.frustumCulled; g.add(mZ); }
    if (isMesh && o.attach !== false) src.add(g);   // follows the source transform
    return g;
  }

  const capEntries = [];
  function straddles(r, m = 0.3) {
    if (!r) return true;
    const overlaps = r.maxx > box.x0 - m && r.minx < box.x1 + m && r.maxz > box.z0 - m && r.minz < box.z1 + m;
    const inside = r.minx > box.x0 + m && r.maxx < box.x1 - m && r.minz > box.z0 + m && r.maxz < box.z1 - m;
    return overlaps && !inside;
  }
  function filterCap(e) {
    const { src, capGeom, bidAttr } = e;
    const n = src.index ? src.index.count : src.getAttribute('position').count;
    const idx = src.index ? src.index.array : null;
    const keep = [];
    const cache = new Map();
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx[t] : t;
      const bid = bidAttr ? Math.round(bidAttr.getX(a)) : 0;
      let ok = cache.get(bid);
      if (ok === undefined) { ok = straddles(reg.get(bid)); cache.set(bid, ok); }
      if (ok) keep.push(a, idx ? idx[t + 1] : t + 1, idx ? idx[t + 2] : t + 2);
    }
    const nv = src.getAttribute('position').count;
    capGeom.setIndex(keep.length ? (nv > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1)) : null);
    capGeom.setDrawRange(0, keep.length);
    capGeom.boundingSphere = null; capGeom.boundingBox = null;
    e.triangles = keep.length / 3;
  }

  // convenience: patch every material and add caps under `root` (meshes with a bid attribute, or filter(mesh))
  function applyToScene(root, o = {}) {
    const caps = [];
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && m.name !== 'cutawayCap' && !m.material?.name?.startsWith('cutawayCap')) meshes.push(m); });
    for (const m of meshes) {
      patchMaterial(m.material);
      const want = o.filter ? o.filter(m) : !!findBidAttr(m.geometry, o.bidAttribute);
      if (want) caps.push(makeCapMesh(m, o));
    }
    return caps;
  }

  // ---------------- plinth
  // heightFn(x,z) -> y, or grid {data:Float32Array(nx*nz), nx, nz, x0, x1, z0, z1} (row-major z then x)
  function sampler(src) {
    if (typeof src === 'function') return src;
    if (src && src.data) {
      const { data, nx, nz, x0, x1, z0, z1 } = src;
      return (x, z) => {
        const fx = THREE.MathUtils.clamp((x - x0) / (x1 - x0) * (nx - 1), 0, nx - 1);
        const fz = THREE.MathUtils.clamp((z - z0) / (z1 - z0) * (nz - 1), 0, nz - 1);
        const ix = Math.min(Math.floor(fx), nx - 2), iz = Math.min(Math.floor(fz), nz - 2);
        const tx = fx - ix, tz = fz - iz;
        const a = data[iz * nx + ix], b = data[iz * nx + ix + 1], c = data[(iz + 1) * nx + ix], d = data[(iz + 1) * nx + ix + 1];
        return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
      };
    }
    return () => 0;
  }

  const PLINTH_VERT = /* glsl */`
  attribute float aTopY;
  attribute float aU;
  varying vec3 vWP; varying float vTopY; varying float vU;
  void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; vTopY = aTopY; vU = aU;
    gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const PLINTH_FRAG = /* glsl */`
  uniform vec3 uSoil; uniform vec3 uLip; uniform float uLipW; uniform float uYBottom;
  uniform vec4 uHoles[8]; uniform vec4 uHoleSide[8]; uniform int uHoleN;
  uniform float uFloorH;
  varying vec3 vWP; varying float vTopY; varying float vU;
  ${GLSL_HASH}
  ${GLSL_SECTION}
  void main(){
    float depth = vTopY - vWP.y;
    float wob = sin(vU*0.021 + 1.3)*2.2 + sin(vU*0.077)*0.6;
    float band = floor((vWP.y + wob) / 4.5);
    float hb = cwHash(vec3(band, 2.0, 5.0));
    vec3 c = uSoil * mix(0.8, 1.15, hb);
    c *= mix(1.0, 0.55, clamp(depth / max(vTopY - uYBottom, 1.0), 0.0, 1.0));
    float grain = cwHash(vec3(floor(vU*3.0), floor(vWP.y*3.0), 1.0));
    c *= 0.93 + 0.14*grain;
    // asphalt/topsoil skin right under the lip, then the bright lip line
    c = mix(c, uSoil*0.4, smoothstep(0.9, 0.5, depth));
    c = mix(c, uLip, smoothstep(uLipW, uLipW*0.4, depth));
    // underground hooks: rectangles (u0,u1,y0,y1) on side s render as lit interior-mapped cavities
    for (int i = 0; i < 8; i++) {
      if (i >= uHoleN) break;
      vec4 h = uHoles[i];
      if (abs(uHoleSide[i].x - uHoleSide[i].y) < 0.5 && vU > h.x && vU < h.y && vWP.y > h.z && vWP.y < h.w) {
        vec3 rd = normalize(vWP - cameraPosition);
        float s = uHoleSide[i].y;
        vec3 lrd = s < 1.5 ? vec3(rd.z*sign(rd.x), rd.y, abs(rd.x)) : vec3(-rd.x*sign(rd.z), rd.y, abs(rd.z));
        c = cwSection(vU - h.x, vWP.y, lrd, h.w + 1.0, h.w + 1.0, h.w - h.z + 1.0, 900.0 + float(i), s) * uHoleSide[i].z;
      }
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

  // makePlinth(heightFnOrGrid, {color, lipColor, lipWidth, step, topMaterial, underground:[{side:'x0'|'x1'|'z0'|'z1', u0,u1,y0,y1, gain}]})
  // -> Group{ top (Mesh, material hook), sides (Mesh), bottom (Mesh) }. u on side faces = coordinate along the side
  // (z for x-sides, x for z-sides), matching world coords.
  function makePlinth(src, o = {}) {
    const H = sampler(src);
    const step = o.step ?? 4;
    const nx = Math.max(2, Math.ceil((box.x1 - box.x0) / step) + 1);
    const nz = Math.max(2, Math.ceil((box.z1 - box.z0) / step) + 1);
    // top grid
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = box.x0 + (box.x1 - box.x0) * i / (nx - 1), z = box.z0 + (box.z1 - box.z0) * j / (nz - 1);
      const k = j * nx + i;
      pos.set([x, H(x, z), z], k * 3); uv.set([i / (nx - 1), 1 - j / (nz - 1)], k * 2);
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const topG = new THREE.BufferGeometry();
    topG.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    topG.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    topG.setIndex(idx); topG.computeVertexNormals();
    const topM = o.topMaterial || new THREE.MeshStandardMaterial({ color: o.topColor ?? 0x1c1d20, roughness: 0.95 });
    const top = new THREE.Mesh(topG, topM); top.name = 'plinthTop'; top.renderOrder = RENDER_ORDER.ground;

    // sides: strips from terrain profile to yBottom, outward-facing
    const sp = [], sTop = [], sU = [], si = [];
    const yb = box.yBottom;
    const addSide = (pts, outward) => { // pts: [[x,z],...] in order
      const n0 = sp.length / 3;
      for (const [x, z] of pts) {
        const y = H(x, z), u = outward === 'x' ? z : x;
        sp.push(x, y, z, x, yb, z); sTop.push(y, y); sU.push(u, u);
      }
      for (let i = 0; i < pts.length - 1; i++) { const a = n0 + 2 * i, b = a + 1, c = a + 2, d = a + 3; si.push(a, b, c, c, b, d); }
    };
    const line = (xa, za, xb, zb, n) => Array.from({ length: n }, (_, i) => [xa + (xb - xa) * i / (n - 1), za + (zb - za) * i / (n - 1)]);
    // windings chosen so faces point out of the box
    addSide(line(box.x0, box.z1, box.x1, box.z1, nx), 'z');   // south (+z)
    addSide(line(box.x1, box.z0, box.x0, box.z0, nx), 'z');   // north (-z)
    addSide(line(box.x1, box.z1, box.x1, box.z0, nz), 'x');   // east (+x)
    addSide(line(box.x0, box.z0, box.x0, box.z1, nz), 'x');   // west (-x)
    const sideG = new THREE.BufferGeometry();
    sideG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sideG.setAttribute('aTopY', new THREE.Float32BufferAttribute(sTop, 1));
    sideG.setAttribute('aU', new THREE.Float32BufferAttribute(sU, 1));
    sideG.setIndex(si); sideG.computeVertexNormals();

    const holes = (o.underground || []).slice(0, 8);
    const sideId = { x1: 0, x0: 1, z1: 2, z0: 3 };
    // side ids in GLSL_SECTION seeds: per-fragment face id from normal is not available here, so encode face via normal sign
    const sideMat = new THREE.ShaderMaterial({
      name: 'cutawayPlinthSide',
      uniforms: {
        ...uniforms,
        uSoil: { value: new THREE.Color(o.color ?? 0x231f1c) },
        uLip: { value: new THREE.Color(o.lipColor ?? 0xb8b2a6) },
        uLipW: { value: o.lipWidth ?? 0.18 },
        uYBottom: { value: yb },
        uHoles: { value: Array.from({ length: 8 }, (_, i) => holes[i] ? new THREE.Vector4(holes[i].u0, holes[i].u1, holes[i].y0, holes[i].y1) : new THREE.Vector4()) },
        uHoleSide: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-9, -9, 1, 0)) },
        uHoleN: { value: holes.length },
      },
      vertexShader: PLINTH_VERT.replace('varying vec3 vWP;', 'varying vec3 vWP; varying float vSide;').replace('vU = aU;', 'vU = aU; vec3 nn = normalize(mat3(modelMatrix)*normal); vSide = abs(nn.x) > 0.5 ? (nn.x > 0.0 ? 0.0 : 1.0) : (nn.z > 0.0 ? 2.0 : 3.0);'),
      fragmentShader: PLINTH_FRAG.replace('varying vec3 vWP;', 'varying vec3 vWP; varying float vSide;')
        .replace('abs(uHoleSide[i].x - uHoleSide[i].y)', 'abs(vSide - uHoleSide[i].y)'),
    });
    holes.forEach((h, i) => sideMat.uniforms.uHoleSide.value[i].set(0, sideId[h.side] ?? 0, h.gain ?? 1, 0));
    const sides = new THREE.Mesh(sideG, sideMat); sides.name = 'plinthSides'; sides.renderOrder = RENDER_ORDER.section;

    const botG = new THREE.PlaneGeometry(box.x1 - box.x0, box.z1 - box.z0);
    botG.rotateX(Math.PI / 2); botG.translate((box.x0 + box.x1) / 2, yb, (box.z0 + box.z1) / 2);
    const bottom = new THREE.Mesh(botG, new THREE.MeshBasicMaterial({ color: 0x050505 })); bottom.name = 'plinthBottom'; bottom.renderOrder = RENDER_ORDER.section;

    const g = new THREE.Group(); g.name = 'plinth';
    g.add(top, sides, bottom);
    g.userData = { top, sides, bottom, height: H };
    return g;
  }

  function setBox(b) {
    Object.assign(box, b);
    uniforms.uBoxMin.value.set(box.x0, box.yBottom, box.z0);
    uniforms.uBoxMax.value.set(box.x1, 1e6, box.z1);
    for (const e of capEntries) filterCap(e);
  }

  function update(camera, t = 0) {
    uniforms.uTime.value = t;
    if (dirty) rebuildInfo();
  }

  return {
    box, uniforms, RENDER_ORDER, patchMaterial, makeCapMesh, applyToScene, makePlinth, setBox, update,
    addBuildingInfo: addMeta,
    get infoTexture() { return infoU.value; },
  };
}
