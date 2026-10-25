// Night look for the photoreal cutaway (PLATEAU LOD2 photo-textured buildings, roads, furniture, trees, bridges,
// underground mall). See CONTRACT.md.
//
//   const N = applyNight({scene, renderer, manifest, gltfs:{bldg:[gltf...], tran, frn, veg, brid, ubld},
//                         terrain /* parsed terrain.json */, box:{x0,x1,z0,z1}, patch, options});
//   N.update(t, camera);          // per frame (t seconds, deterministic: blink + nothing else time-based)
//   N.render(camera, target=null);// sky + scene into an HDR target, bloom, grade, tone map → screen (or target)
//
// Materials: every material created here is a plain THREE.ShaderMaterial (or, for nothing else) and `patch(m)` is
// called on it exactly once, after creation, before first render. None of them sets onBeforeCompile or
// customProgramCacheKey, so patch() may install its own. Vertex shaders are GLSL1-style (three converts to 300 es),
// have a `void main(){` and use the `position` attribute + `modelMatrix` (no #include chunks), so an injector that
// inserts code at the top of main() using `position` works; Points materials too. Not patched (not world geometry,
// not in `scene`): the screen-space sky quad and the post passes.
//
// Exports on N: heightAt(x,z) (terrain heightfield, bilinear, local y), terrainMesh (THREE.Mesh, already added),
// lamps [{x,y,z,color}], uniforms (shared), materials [...], lightTexture (baked ground light, HDR, 1 m texels),
// lightBox {x0,z0,x1,z1}, makeGroundMaterial(albedo?, opts?) (patched ground ShaderMaterial, e.g. for a plinth top),
// setSize(w,h), dispose(), stats.
// terrainMesh.renderOrder = 12 (cutaway RENDER_ORDER.ground); options.terrainMesh=false skips it (use the plinth top).
// ubld is drawn BackSide only (interior visible through the cut, never pokes through the street).
// options (defaults): exposure 1, bloomA .55, bloomB .45, bloomThreshold .9, saturation 1, vignette .42, windows 1,
//   shops 1, signs 1, uplight 1, halloween 1 (0 = off), wet .5, lampSpacing 22, lampMax 600, lampHeight 7,
//   lampGain 1, fogDensity .00055, zebra true, msaa 4 (scene RT samples), margin 24, debugAlbedo false.
import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------- helpers
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hashI = (a, b = 0) => mulberry((a * 73856093) ^ (b * 19349663) ^ 0x5bd1e995)();
const TYPE = { '商業施設': 1, '業務施設': 2, '店舗等併用住宅': 3, '作業所併用住宅': 3, '共同住宅': 4, '住宅': 4, '宿泊施設': 5, '文教厚生施設': 6, '官公庁施設': 6, '運輸倉庫施設': 7, '供給処理施設': 7 };
// Halloween / accent palette (series): orange #ff7a1a, purple #8a3cff
const ORANGE = [1.0, 0.3, 0.03], PURPLE = [0.3, 0.06, 1.0];

export function makeHeightAt(terrain) {
  if (!terrain || !terrain.heights) return () => 0;
  const { x0, z0, step, nx, nz, heights } = terrain;
  return (x, z) => {
    let fx = (x - x0) / step, fz = (z - z0) / step;
    fx = Math.min(Math.max(fx, 0), nx - 1.001); fz = Math.min(Math.max(fz, 0), nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h = (ii, jj) => { const y = heights[jj * nx + ii]; return y == null || Number.isNaN(y) ? 0 : y; };
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}

// ---------------------------------------------------------------- GLSL
const GLSL_COMMON = /* glsl */`
uniform sampler2D uLight; uniform vec4 uLightBox;   // x0, z0, 1/width, 1/depth
uniform sampler2D uHeight; uniform vec4 uHBox;
uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uAmbSky; uniform vec3 uAmbGround; uniform vec3 uMoonCol; uniform vec3 uMoonDir;
uniform float uTime;
float hash3(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash3(vec3(i, 1.0)), hash3(vec3(i + vec2(1,0), 1.0)), f.x), mix(hash3(vec3(i + vec2(0,1), 1.0)), hash3(vec3(i + vec2(1,1), 1.0)), f.x), f.y); }
vec3 poolAt(vec2 xz){ return texture2D(uLight, (xz - uLightBox.xy)*uLightBox.zw).rgb; }
vec3 poolAtB(vec2 xz, float b){ return texture(uLight, (xz - uLightBox.xy)*uLightBox.zw, b).rgb; }
float groundAt(vec2 xz){ return texture2D(uHeight, (xz - uHBox.xy)*uHBox.zw).r; }
vec3 applyFog(vec3 c, vec3 wp, float emisKeep){
  float d = length(wp - cameraPosition) * uFogDensity;
  float f = 1.0 - exp(-d*d);
  return mix(c, uFogColor, f*(1.0 - 0.5*emisKeep));
}
`;

const VS_SURF = /* glsl */`
#ifdef HAS_BID
attribute float _bid;
#endif
varying vec2 vUv; varying vec3 vWP; varying vec3 vN; flat varying float vBid;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
#ifdef HAS_BID
  vBid = _bid;
#else
  vBid = 0.0;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Buildings + generic photo-textured layers (frn, veg, brid) + untextured (ubld, untextured bldg parts)
const FS_SURF = /* glsl */`
uniform sampler2D map; uniform float uHasMap; uniform vec3 uAlbedo;
uniform sampler2D uBInfo;
uniform float uWinGain; uniform float uShopGain; uniform float uSignGain; uniform float uUplight;
uniform float uHalloween; uniform float uDebug; uniform float uTexGain; uniform float uSelfLit; uniform float uDesat; uniform float uRoofDark;
varying vec2 vUv; varying vec3 vWP; varying vec3 vN; flat varying float vBid;
${GLSL_COMMON}
void main(){
  vec3 N = normalize(vN);
  vec3 tex = uHasMap > 0.5 ? texture2D(map, vUv).rgb*uTexGain : uAlbedo;
  float lum = dot(tex, vec3(.2126,.7152,.0722));
  vec3 base = mix(tex, vec3(lum), uDesat);
  float up = N.y*0.5 + 0.5;
  vec3 light = mix(uAmbGround, uAmbSky, up) + uMoonCol*max(dot(N, uMoonDir), 0.0);
  float gy = groundAt(vWP.xz);
  float h = max(vWP.y - gy, 0.0);
  float wall = 1.0 - smoothstep(0.35, 0.75, abs(N.y));
  // street-light / shop-spill bounce on the lower facades (baked ground light sampled just outside the wall)
  vec3 pool = poolAtB(vWP.xz + N.xz*2.0, 1.0);
  light += pool * uUplight * exp(-h*0.16) * (0.25 + 0.75*wall);
  light += uSelfLit * vec3(1.0, 0.93, 0.82);
  float roof = smoothstep(0.6, 0.9, N.y);
  light *= mix(1.0, uRoofDark, roof);
  vec3 col = base * light;
  vec3 emis = vec3(0.0);
#ifdef WINDOWS
  int ib = int(vBid + 0.5);
  vec4 b0 = texelFetch(uBInfo, ivec2(ib, 0), 0);   // base_y, floorH, storeys, type
  vec4 b1 = texelFetch(uBInfo, ivec2(ib, 1), 0);   // top_y, seed, dist to Scramble, shop flag
  if (wall > 0.5 && b0.y > 0.0) {
    vec2 T = normalize(vec2(-N.z, N.x));
    float u = dot(vWP.xz, T);
    float fy = (vWP.y - b0.x) / b0.y;
    float st = floor(fy), fr = fract(fy);
    float seed = b1.y, type = b0.w;
    float face = floor(atan(T.y, T.x)*1.2732 + 0.5);
    float glass = smoothstep(0.16, 0.035, lum) * (0.8 + 0.6*clamp((tex.b - tex.r)*6.0, 0.0, 1.0));
    float bright = smoothstep(0.25, 0.6, lum);
    if (st >= 0.0 && st < b0.z) {
      float cw = mix(2.5, 4.2, fract(seed*7.13));
      float cu = u / cw; float ci = floor(cu); float fx = fract(cu);
      bool shop = st < 0.5 && b1.w > 0.5;
      if (shop) {
        // ground-floor shop front: continuous bright band, per-bay colour/intensity, photo modulates detail
        float bay = floor(u / 6.0);
        float rb = hash3(vec3(bay, seed*41.0, face));
        float band = smoothstep(0.02, 0.08, fr) * smoothstep(0.82, 0.7, fr);
        vec3 sc = rb < 0.55 ? vec3(1.0, 0.82, 0.6) : (rb < 0.85 ? vec3(0.9, 0.95, 1.0) : vec3(1.0, 0.62, 0.35));
        float hw = uHalloween * (1.0 - smoothstep(90.0, 160.0, b1.z));
        float rh = hash3(vec3(bay*3.1, seed*13.0, 7.0));
        if (rh < 0.08*hw) sc = vec3(1.0, 0.25, 0.03)*1.3;
        else if (rh < 0.13*hw) sc = vec3(0.45, 0.12, 1.0)*1.3;
        float on = step(0.12, rb);
        emis += sc * band * on * uShopGain * (0.4 + 0.9*rb) * (0.15 + 1.6*base);
      } else {
        float offc = (type > 1.5 && type < 2.5) || (type > 4.5 && type < 5.5) ? 1.0 : 0.0;
        float resi = (type > 2.5 && type < 4.5) ? 1.0 : 0.0;
        float x0 = mix(0.14, 0.025, offc), y0 = mix(0.3, 0.12, offc), y1 = mix(0.84, 0.93, offc);
        float rect = smoothstep(x0, x0+0.05, fx) * smoothstep(1.0-x0, 0.95-x0, fx)
                   * smoothstep(y0, y0+0.06, fr) * smoothstep(y1, y1-0.06, fr);
        float shape = rect * mix(0.08 + 0.92*glass, 0.45 + 0.55*glass, offc) * (1.0 - 0.8*bright);
        float gsz = mix(2.0 + floor(fract(seed*3.7)*4.0), 4.0 + floor(fract(seed*3.7)*9.0), offc);
        float rf = hash3(vec3(seed*91.0, st, face));
        float rg = hash3(vec3(seed*17.0 + face*31.0, st, floor(ci/gsz)));
        float rc = hash3(vec3(ci, st*1.7 + face, seed*53.0));
        float pFloor = mix(mix(0.42, 0.36, resi), 0.5, offc);
        float lit = step(rf, pFloor) * step(rg, mix(0.55, 0.75, offc)) * step(rc, mix(0.65, 0.95, offc))
                  + (1.0 - step(rf, pFloor)) * step(rc, 0.07);
        lit = min(lit, 1.0);
        float rcol = hash3(vec3(seed*7.0, st, floor(ci/gsz)*1.3 + face));
        vec3 wc = rcol < mix(0.6, 0.2, offc) ? vec3(1.0, 0.66, 0.36) : (rcol < 0.85 ? vec3(1.0, 0.86, 0.66) : vec3(0.78, 0.9, 1.0));
        float inten = (0.35 + 0.9*rc*rc) * uWinGain * (0.6 + 0.8*rf);
        // interior variation: ceiling-lit top, blotchy furniture/blinds, a few curtained (dim, warm-tinted) cells
        float inner = (0.65 + 0.45*smoothstep(y0, y1, fr)) * (0.6 + 0.6*vnoise(vec2(u*1.3, vWP.y*1.1) + seed*50.0));
        float curtain = step(0.82, hash3(vec3(ci*1.7, st, seed*29.0 + face)));
        inner *= mix(1.0, 0.45, curtain);
        emis += mix(wc, wc*vec3(1.0, 0.8, 0.6), curtain) * inten * lit * shape * inner;
        // unlit glass: dark with a faint cool sky reflection
        col = mix(col, col*0.45 + vec3(0.004, 0.006, 0.012), shape*(1.0 - lit));
      }
    }
    // illuminated signage / billboards: saturated photo pixels on lower floors of commercial buildings
    float sat = max(max(tex.r, tex.g), tex.b) - min(min(tex.r, tex.g), tex.b);
    float signy = 1.0 - smoothstep(6.0, 9.0, st);
    float near = 1.0 - smoothstep(60.0, 220.0, b1.z);
    float signK = smoothstep(mix(0.18, 0.1, near), 0.4, sat) * smoothstep(0.04, 0.2, lum) * signy * (b1.w > 0.5 ? 1.0 : 0.3) * (0.25 + 0.75*near);
    emis += tex * signK * uSignGain;
  }
#endif
  col += emis;
  if (uDebug > 0.5) col = tex*0.6 + emis*0.3;
  col = applyFog(col, vWP, clamp(dot(emis, vec3(1.0)), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

// Ground: terrain + road classes (tran)
const VS_GROUND = /* glsl */`
varying vec3 vWP; varying vec3 vN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS_GROUND = /* glsl */`
uniform vec3 uAlbedo; uniform float uWet; uniform float uKind; uniform float uZebra;
varying vec3 vWP; varying vec3 vN;
${GLSL_COMMON}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  vec3 alb = uAlbedo;
  // cheap aggregate variation (low-frequency only: no shimmer)
  alb *= 0.82 + 0.18*vnoise(vWP.xz*0.6) + 0.18*vnoise(vWP.xz*0.13);
#ifdef ZEBRA
  // Scramble crossing: stripes on the intersection surface (4 arms + 2 diagonals), procedural
  {
    vec2 p = vWP.xz;
    float r = length(p);
    float m = 0.0;
    // arms: crossings across each road mouth, stripes parallel to the road axis
    vec2 a = abs(p);
    float armNS = step(14.0, a.y) * step(a.y, 21.0) * step(a.x, 13.0) * step(0.5, fract(p.x/1.0*0.5+0.25));
    float armEW = step(14.0, a.x) * step(a.x, 21.0) * step(a.y, 13.0) * step(0.5, fract(p.y*0.5+0.25));
    vec2 d1 = vec2(p.x + p.y, p.x - p.y) * 0.70710678;
    float diag = step(abs(d1.y), 3.0) * step(abs(d1.x), 16.0) * step(0.5, fract(d1.y*0.5 + 0.25))
               + step(abs(d1.x), 3.0) * step(abs(d1.y), 16.0) * step(0.5, fract(d1.x*0.5 + 0.25));
    m = clamp(armNS + armEW + diag, 0.0, 1.0) * (1.0 - smoothstep(26.0, 30.0, r));
    alb = mix(alb, vec3(0.3), m*uZebra);
  }
#endif
  vec3 pool = poolAt(vWP.xz);
  vec3 col = alb * (uAmbSky*0.16 + uMoonCol*0.3*max(N.y, 0.0) + pool);
  // wet sheen: reflection of the lamps/shops "above" the mirrored ray, glossy (mip bias), fresnel-ish
  float vy = max(V.y, 0.04);
  vec2 rp = vWP.xz - normalize(V.xz + 1e-5) * min(length(V.xz)/vy*6.0, 25.0);
  vec3 refl = poolAtB(rp, 2.5);
  float fres = 0.04 + 0.96*pow(1.0 - vy, 5.0);
  col += refl * uWet * (0.2 + 0.8*fres) * 0.18;
  col += uFogColor * uWet * 0.15 * fres;
  col = applyFog(col, vWP, 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// Glow sprites (lamp heads, Halloween uplights, aviation lights, rooftop lights)
const VS_PTS = /* glsl */`
attribute vec3 aCol; attribute vec3 aInfo;   // size (m), blink(0/1), phase
uniform float uScale; uniform float uTime; uniform float uMinPx;
varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aInfo.x * uScale / max(-mv.z, 1.0);
  float k = 1.0;
  if (aInfo.y > 0.5) { float ph = fract(uTime*0.8 + aInfo.z); k = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.25, 0.45, ph)); }
  float shrink = clamp(s / uMinPx, 0.0, 1.0);
  gl_PointSize = max(s, uMinPx);
  vC = aCol * k * shrink * shrink;
}`;
const FS_PTS = /* glsl */`
varying vec3 vC;
void main(){
  vec2 d = gl_PointCoord*2.0 - 1.0; float r = dot(d, d);
  if (r > 1.0) discard;
  float a = exp(-r*7.0)*0.6 + exp(-r*45.0)*1.6;
  gl_FragColor = vec4(vC*a, 1.0);
}`;

const VS_QUAD = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS_SKY = /* glsl */`
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uFogColor;
varying vec2 vUv;
void main(){
  vec4 v = uInvProj * vec4(vUv*2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize((uCamWorld * vec4(v.xyz/v.w, 0.0)).xyz);
  float h = dir.y;
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(smoothstep(-0.05, 0.6, h), 0.6));
  c = mix(c, uFogColor*0.7, smoothstep(0.0, -0.25, h));
  gl_FragColor = vec4(c, 1.0);
}`;
const FS_BRIGHT = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(max(c.r, c.g), c.b);
  c *= smoothstep(uThreshold, uThreshold*2.5, l);
  gl_FragColor = vec4(min(c, vec3(30.0)), 1.0);
}`;
const FS_BLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += (texture2D(tSrc, vUv + uDir*1.3846154).rgb + texture2D(tSrc, vUv - uDir*1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir*3.2307692).rgb + texture2D(tSrc, vUv - uDir*3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;
const FS_FINAL = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform float uBloomA; uniform float uBloomB; uniform float uExposure; uniform float uSaturation; uniform float uVignette;
uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform vec2 uRes;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloomA, vUv).rgb*uBloomA + texture2D(tBloomB, vUv).rgb*uBloomB;
  c *= uExposure;
  c = aces(c);
  float l = dot(c, vec3(.2126,.7152,.0722));
  c += uShadowTint*(1.0 - l)*(1.0 - l) + uHighTint*l*l;
  c = max(mix(vec3(l), c, uSaturation), 0.0);
  vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
  c *= 1.0 - uVignette*smoothstep(0.25, 0.95, dot(q, q)*2.2);
  c = toSRGB(clamp(c, 0.0, 1.0));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
  c += (n - 0.5)/255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- main
export function applyNight({ scene, renderer, manifest = {}, gltfs = {}, terrain = null, box = null, patch = (m) => m, options = {} }) {
  const T0 = performance.now();
  const o = {
    exposure: 1.0, bloomA: 0.55, bloomB: 0.45, bloomThreshold: 0.9, saturation: 1.0, vignette: 0.42,
    windows: 1.0, shops: 1.0, signs: 1.0, uplight: 1.0, halloween: 1.0, wet: 0.5,
    lampSpacing: 22, lampMax: 600, lampHeight: 7.0, lampGain: 1.0, fogDensity: 0.00055,
    zebra: true, msaa: 4, margin: 24, ...options,
  };
  box = box || manifest.clip || { x0: -340, x1: 160, z0: -250, z1: 250 };
  const buildings = manifest.buildings || {};
  const heightAt = makeHeightAt(terrain);
  const materials = [];
  const mk = (m) => { materials.push(m); const r = patch(m); return r && r.isMaterial ? r : m; };
  scene.updateMatrixWorld(true);

  // ------------------------------------------------ shared uniforms
  const LB = { x0: box.x0 - o.margin, z0: box.z0 - o.margin, x1: box.x1 + o.margin, z1: box.z1 + o.margin };
  const U = {
    uLight: { value: null }, uLightBox: { value: new THREE.Vector4(LB.x0, LB.z0, 1 / (LB.x1 - LB.x0), 1 / (LB.z1 - LB.z0)) },
    uHeight: { value: null }, uHBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFogColor: { value: new THREE.Color(0x1d1b25).convertSRGBToLinear() }, uFogDensity: { value: o.fogDensity },
    uAmbSky: { value: new THREE.Vector3(0.17, 0.2, 0.3) }, uAmbGround: { value: new THREE.Vector3(0.09, 0.08, 0.085) },
    uMoonCol: { value: new THREE.Vector3(0.12, 0.14, 0.21) }, uMoonDir: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() },
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x03050b).convertSRGBToLinear() }, uSkyHorizon: { value: new THREE.Color(0x3a2c33).convertSRGBToLinear() },
  };

  // ------------------------------------------------ heightfield texture
  if (terrain && terrain.heights) {
    const { x0, z0, step, nx, nz, heights } = terrain;
    const d = new Uint16Array(nx * nz);
    for (let k = 0; k < nx * nz; k++) d[k] = THREE.DataUtils.toHalfFloat(heights[k] == null ? 0 : heights[k]);
    const ht = new THREE.DataTexture(d, nx, nz, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
    U.uHeight.value = ht;
    // texel centres at nodes: uv = (x - x0 + step/2) / (nx*step)
    U.uHBox.value.set(x0 - step / 2, z0 - step / 2, 1 / (nx * step), 1 / (nz * step));
  } else {
    const ht = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType); ht.needsUpdate = true;
    U.uHeight.value = ht;
  }

  // ------------------------------------------------ building info texture
  const BW = 2048;
  let maxBid = 0; for (const k in buildings) maxBid = Math.max(maxBid, +k);
  const BWid = Math.max(BW, THREE.MathUtils.ceilPowerOfTwo(maxBid + 1));
  const binfo = new Float32Array(BWid * 2 * 4);
  const bmeta = new Map();
  for (const k in buildings) {
    const b = buildings[k], bid = +k;
    const base = b.base_y ?? 0, top = b.top_y ?? base + 10;
    let H = b.height || (top - base);
    let st = b.storeys || Math.max(1, Math.round(H / 3.6));
    let fh = H / st;
    if (fh < 2.7) { fh = 2.7; st = Math.max(1, Math.floor(H / fh)); }
    if (fh > 6.5) { fh = Math.min(fh, 6.5); st = Math.max(1, Math.floor(H / fh)); }
    const type = TYPE[b.usage] ?? 0;
    const seed = hashI(bid, 11);
    const cx = ((b.minx ?? 0) + (b.maxx ?? 0)) / 2, cz = ((b.minz ?? 0) + (b.maxz ?? 0)) / 2;
    const dist = Math.hypot(cx, cz);
    const shop = type === 1 || type === 3 ? (hashI(bid, 3) < 0.92) : type === 2 ? hashI(bid, 3) < 0.55 : type === 0 ? hashI(bid, 3) < 0.6 : type === 5 ? hashI(bid, 3) < 0.5 : false;
    binfo.set([base, fh, st, type], bid * 4);
    binfo.set([top, seed, dist, shop ? 1 : 0], (BWid + bid) * 4);
    bmeta.set(bid, { base, top, H, st, fh, type, seed, shop, cx, cz, dist, b });
  }
  const binfoTex = new THREE.DataTexture(binfo, BWid, 2, THREE.RGBAFormat, THREE.FloatType);
  binfoTex.magFilter = binfoTex.minFilter = THREE.NearestFilter; binfoTex.needsUpdate = true;

  // ------------------------------------------------ rasterize roads + building footprints (1 m grid)
  const GS = 1.0;
  const GX = Math.ceil((LB.x1 - LB.x0) / GS), GZ = Math.ceil((LB.z1 - LB.z0) / GS);
  const cls = new Uint8Array(GX * GZ);           // 0 none, 1 carriageway, 2 intersection, 3 sidewalk, 4 island
  const bgrid = new Int16Array(GX * GZ).fill(-1); // building id
  function rasterTri(ax, az, bx, bz, cx, cz, fn) {
    const minx = Math.max(0, Math.floor((Math.min(ax, bx, cx) - LB.x0) / GS)), maxx = Math.min(GX - 1, Math.floor((Math.max(ax, bx, cx) - LB.x0) / GS));
    const minz = Math.max(0, Math.floor((Math.min(az, bz, cz) - LB.z0) / GS)), maxz = Math.min(GZ - 1, Math.floor((Math.max(az, bz, cz) - LB.z0) / GS));
    if (minx > maxx || minz > maxz) return;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) return;
    for (let j = minz; j <= maxz; j++) {
      const pz = LB.z0 + (j + 0.5) * GS;
      for (let i = minx; i <= maxx; i++) {
        const px = LB.x0 + (i + 0.5) * GS;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
        if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) fn(j * GX + i);
      }
    }
  }
  function forTris(mesh, cb) {
    const g = mesh.geometry, P = g.getAttribute('position'); if (!P) return;
    const idx = g.index, n = idx ? idx.count : P.count;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const mw = mesh.matrixWorld, ident = mw.equals(new THREE.Matrix4());
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) { const vi = idx ? idx.getX(t + k) : t + k; v[k].fromBufferAttribute(P, vi); if (!ident) v[k].applyMatrix4(mw); }
      cb(v[0], v[1], v[2], idx ? idx.getX(t) : t);
    }
  }
  const CLS = { tran_carriageway: 1, tran_intersection: 2, tran_sidewalk: 3, tran_island: 4 };
  const meshesOf = (g) => { const out = []; if (g && g.scene) { g.scene.updateMatrixWorld(true); g.scene.traverse((m) => { if (m.isMesh) out.push(m); }); } return out; };
  const tranMeshes = meshesOf(gltfs.tran);
  for (const m of tranMeshes) {
    const c = CLS[m.material && m.material.name] || 1;
    forTris(m, (a, b, cc) => rasterTri(a.x, a.z, b.x, b.z, cc.x, cc.z, (k) => { if (!cls[k] || c === 3 || (c === 2 && cls[k] === 1)) cls[k] = c; }));
  }
  const bldgMeshes = (gltfs.bldg || []).flatMap(meshesOf);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const m of bldgMeshes) {
    const BA = m.geometry.getAttribute('_bid'); if (!BA) continue;
    forTris(m, (a, b, c, vi) => {
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      const L = e1.length(); if (L < 1e-6 || Math.abs(e1.y) / L < 0.95) return;   // horizontal faces (roofs + bottoms) give the footprint
      const bid = Math.round(BA.getX(vi));
      rasterTri(a.x, a.z, b.x, b.z, c.x, c.z, (k) => { bgrid[k] = bid; });
    });
  }

  // ------------------------------------------------ lamps
  const rng = mulberry(20261031);
  const lamps = [];
  const lampHash = new Map();
  const near = (x, z, r) => { const gx = Math.floor(x / 24), gz = Math.floor(z / 24); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = lampHash.get((gx + a) + ',' + (gz + b)); if (l) for (const p of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true; } return false; };
  const addLamp = (x, z, color, kind = 'lamp') => { const p = { x, z, y: heightAt(x, z) + o.lampHeight, color, kind }; lamps.push(p); const key = Math.floor(x / 24) + ',' + Math.floor(z / 24); if (!lampHash.has(key)) lampHash.set(key, []); lampHash.get(key).push(p); return p; };
  const inBox = (x, z, m = 0) => x > box.x0 - m && x < box.x1 + m && z > box.z0 - m && z < box.z1 + m;
  const cand1 = [], cand2 = [];
  for (let j = 1; j < GZ - 1; j++) for (let i = 1; i < GX - 1; i++) {
    const k = j * GX + i, c = cls[k];
    if (!c || bgrid[k] >= 0) continue;
    const nb = [cls[k - 1], cls[k + 1], cls[k - GX], cls[k + GX]];
    if (c === 3 && nb.some((v) => v === 1 || v === 2)) cand1.push(k);
    else if (c === 1 && nb.some((v) => v === 0)) cand2.push(k);
  }
  if (!tranMeshes.length) {   // no road layer: lamps along open cells that touch a building footprint
    for (let j = 2; j < GZ - 2; j += 2) for (let i = 2; i < GX - 2; i += 2) {
      const k = j * GX + i; if (bgrid[k] >= 0) continue;
      if (bgrid[k - 3] >= 0 || bgrid[k + 3] >= 0 || bgrid[k - 3 * GX] >= 0 || bgrid[k + 3 * GX] >= 0) cand2.push(k);
    }
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LED = [1.0, 0.86, 0.68], LED2 = [0.95, 0.93, 0.9], SODIUM = [1.0, 0.55, 0.18];
  for (const [list, sp] of [[shuffle(cand1), o.lampSpacing], [shuffle(cand2), o.lampSpacing * 1.15]]) {
    for (const k of list) {
      if (lamps.length >= o.lampMax) break;
      const x = LB.x0 + (k % GX + 0.5) * GS, z = LB.z0 + (Math.floor(k / GX) + 0.5) * GS;
      if (!inBox(x, z, 10) || near(x, z, sp)) continue;
      const r = rng();
      addLamp(x, z, r < 0.12 ? SODIUM : r < 0.55 ? LED : LED2);
    }
  }

  // ------------------------------------------------ bake ground light (HDR, 1 m)
  const L = new Float32Array(GX * GZ * 3);
  function splat(x, z, R, col, I, core = 4) {
    const ci = (x - LB.x0) / GS, cj = (z - LB.z0) / GS, rr = R / GS;
    const i0 = Math.max(0, Math.floor(ci - rr)), i1 = Math.min(GX - 1, Math.ceil(ci + rr));
    const j0 = Math.max(0, Math.floor(cj - rr)), j1 = Math.min(GZ - 1, Math.ceil(cj + rr));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) * GS;
      if (d >= R) continue;
      const t = d / R, f = I * (1 - t * t) * (1 - t * t) / (1 + (d / core) ** 2);
      const k = (j * GX + i) * 3; L[k] += col[0] * f; L[k + 1] += col[1] * f; L[k + 2] += col[2] * f;
    }
  }
  for (const p of lamps) splat(p.x, p.z, 19, p.color, 1.6 * o.lampGain, 7);
  // shop spill: open cells next to shop buildings
  let spill = 0;
  for (let j = 2; j < GZ - 2; j += 1) for (let i = 2; i < GX - 2; i += 1) {
    const k = j * GX + i; if (bgrid[k] >= 0) continue;
    let bid = -1;
    for (const dk of [-1, 1, -GX, GX, -2, 2, -2 * GX, 2 * GX]) if (bgrid[k + dk] >= 0) { bid = bgrid[k + dk]; break; }
    if (bid < 0) continue;
    const m = bmeta.get(bid); if (!m || !m.shop) continue;
    if (((i * 7 + j * 13) & 1) === 1) continue;   // halve the splats; kernels overlap anyway
    const x = LB.x0 + (i + 0.5) * GS, z = LB.z0 + (j + 0.5) * GS;
    const bay = Math.floor((x + z) / 6);
    const rb = hashI(bid * 131 + bay, 5);
    if (rb < 0.12) continue;
    let col = rb < 0.55 ? [1.0, 0.8, 0.58] : rb < 0.85 ? [0.85, 0.92, 1.0] : [1.0, 0.6, 0.32];
    const hw = o.halloween * (1 - THREE.MathUtils.smoothstep(m.dist, 90, 160));
    const rh = hashI(bid * 977 + bay, 9);
    if (rh < 0.08 * hw) col = ORANGE; else if (rh < 0.13 * hw) col = PURPLE;
    splat(x, z, 5, col, 0.4 * o.shops * (0.6 + rb), 2.5);
    spill++;
  }
  // Scramble: big-screen wash (cool white with a hint of magenta/cyan)
  splat(0, 0, 50, [0.75, 0.82, 1.0], 0.7, 30);
  splat(-30, -28, 30, [0.9, 0.6, 1.0], 0.25, 14);
  splat(28, -30, 30, [0.6, 0.9, 1.0], 0.2, 14);
  // Halloween accents: orange / purple pools + uplight sprites around the Scramble and Hachiko square
  const accents = [];
  if (o.halloween > 0) {
    const spots = [
      [-26, 22, ORANGE], [24, 24, PURPLE], [-24, -25, PURPLE], [26, -22, ORANGE],
      [22, 37, ORANGE], [34, 30, PURPLE], [14, 46, PURPLE], [44, 18, ORANGE], [62, 14, PURPLE],
      [-40, 0, ORANGE], [0, -38, PURPLE], [-52, -14, ORANGE],
    ];
    for (const [x, z, col] of spots) {
      // snap onto the nearest open (non-building, non-carriageway) cell within 10 m
      let best = null, bd = 1e9;
      const ci = Math.floor((x - LB.x0) / GS), cj = Math.floor((z - LB.z0) / GS);
      for (let dj = -10; dj <= 10; dj++) for (let di = -10; di <= 10; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GX || j >= GZ) continue;
        const k = j * GX + i; if (bgrid[k] >= 0 || cls[k] === 1 || cls[k] === 2) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [LB.x0 + (i + 0.5) * GS, LB.z0 + (j + 0.5) * GS]; }
      }
      if (!best) best = [x, z];
      splat(best[0], best[1], 11, col, 1.6 * o.halloween, 3);
      accents.push({ x: best[0], z: best[1], y: heightAt(best[0], best[1]) + 0.6, color: col });
    }
  }
  // HDR half-float texture
  const LH = new Uint16Array(GX * GZ * 4);
  for (let k = 0; k < GX * GZ; k++) { LH[k * 4] = THREE.DataUtils.toHalfFloat(L[k * 3]); LH[k * 4 + 1] = THREE.DataUtils.toHalfFloat(L[k * 3 + 1]); LH[k * 4 + 2] = THREE.DataUtils.toHalfFloat(L[k * 3 + 2]); LH[k * 4 + 3] = 15360; }
  const lightTex = new THREE.DataTexture(LH, GX, GZ, THREE.RGBAFormat, THREE.HalfFloatType);
  lightTex.magFilter = THREE.LinearFilter; lightTex.minFilter = THREE.LinearMipmapLinearFilter; lightTex.generateMipmaps = true;
  lightTex.wrapS = lightTex.wrapT = THREE.ClampToEdgeWrapping; lightTex.needsUpdate = true;
  U.uLight.value = lightTex;
  U.uLightBox.value.set(LB.x0, LB.z0, 1 / (GX * GS), 1 / (GZ * GS));

  // ------------------------------------------------ materials
  const surfCache = new Map();
  function surfMaterial(src, { windows = false, bid = false, albedo = [0.5, 0.5, 0.5], selfLit = 0, desat = 0.3, roofDark = 0.6, uplight = 1, texGain = 1, key = '' } = {}) {
    const map = src && src.map ? src.map : null;
    const ck = (map ? map.uuid : 'nomap') + key;
    if (surfCache.has(ck)) return surfCache.get(ck);
    const m = new THREE.ShaderMaterial({
      vertexShader: VS_SURF, fragmentShader: FS_SURF,
      defines: { ...(windows ? { WINDOWS: '' } : {}), ...(bid ? { HAS_BID: '' } : {}) },
      uniforms: {
        ...U, map: { value: map }, uHasMap: { value: map ? 1 : 0 }, uAlbedo: { value: new THREE.Vector3(...albedo) },
        uBInfo: { value: binfoTex }, uWinGain: { value: 1.5 * o.windows }, uShopGain: { value: 1.4 * o.shops },
        uSignGain: { value: 2.0 * o.signs }, uUplight: { value: 0.9 * o.uplight * uplight }, uHalloween: { value: o.halloween }, uDebug: { value: o.debugAlbedo ? 1 : 0 },
        uSelfLit: { value: selfLit }, uTexGain: { value: texGain }, uDesat: { value: desat }, uRoofDark: { value: roofDark },
      },
    });
    m.name = 'night_surf_' + key;
    surfCache.set(ck, mk(m));
    return surfCache.get(ck);
  }
  function groundMaterial(kind, albedo, { zebra = false, wet = o.wet, offset = 0 } = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: VS_GROUND, fragmentShader: FS_GROUND, defines: zebra ? { ZEBRA: '' } : {},
      uniforms: { ...U, uAlbedo: { value: new THREE.Vector3(...albedo) }, uWet: { value: wet }, uKind: { value: kind }, uZebra: { value: 1 } },
      polygonOffset: offset !== 0, polygonOffsetFactor: offset, polygonOffsetUnits: offset * 4,
    });
    m.name = 'night_ground_' + kind;
    return mk(m);
  }
  const swap = (mesh, mat) => { mesh.material = mat; };

  // buildings
  for (const m of bldgMeshes) {
    const hasBid = !!m.geometry.getAttribute('_bid');
    swap(m, surfMaterial(m.material, { windows: hasBid, bid: hasBid, albedo: [0.42, 0.41, 0.4], key: 'bldg' }));
  }
  // roads
  const roadMats = {
    tran_carriageway: groundMaterial(1, [0.035, 0.035, 0.04], { offset: -1, zebra: false }),
    tran_intersection: groundMaterial(2, [0.04, 0.04, 0.045], { offset: -1, zebra: o.zebra }),
    tran_sidewalk: groundMaterial(3, [0.11, 0.105, 0.1], { offset: -2, wet: o.wet * 0.6 }),
    tran_island: groundMaterial(4, [0.07, 0.085, 0.06], { offset: -2, wet: o.wet * 0.3 }),
  };
  for (const m of tranMeshes) swap(m, roadMats[m.material && m.material.name] || roadMats.tran_carriageway);
  // other layers
  for (const m of meshesOf(gltfs.frn)) swap(m, surfMaterial(m.material, { albedo: [0.3, 0.3, 0.3], key: 'frn', desat: 0.35, roofDark: 0.9, uplight: 0.6, texGain: 0.55 }));
  for (const m of meshesOf(gltfs.veg)) swap(m, surfMaterial(m.material, { albedo: [0.1, 0.16, 0.08], key: 'veg', desat: 0.0, roofDark: 1.0, uplight: 1.6 }));
  for (const m of meshesOf(gltfs.brid)) swap(m, surfMaterial(m.material, { albedo: [0.4, 0.4, 0.4], key: 'brid', desat: 0.2, roofDark: 0.8 }));
  // underground mall: only its interior (back faces of the outward-wound shell) is drawn, so it never pokes through the
  // street surface but shows as lit corridors where the cutaway opens it
  for (const m of meshesOf(gltfs.ubld)) {
    const mat = surfMaterial(m.material, { albedo: [0.55, 0.53, 0.5], key: 'ubld', selfLit: 0.9, desat: 0.0, roofDark: 1.0, uplight: 0 });
    mat.side = THREE.BackSide; swap(m, mat);
  }

  // ------------------------------------------------ terrain mesh
  let terrainMesh = null;
  if (terrain && terrain.heights && o.terrainMesh !== false) {
    const { x0, z0, step, nx, nz } = terrain;
    const i0 = Math.max(0, Math.floor((box.x0 - 8 - x0) / step)), i1 = Math.min(nx - 1, Math.ceil((box.x1 + 8 - x0) / step));
    const j0 = Math.max(0, Math.floor((box.z0 - 8 - z0) / step)), j1 = Math.min(nz - 1, Math.ceil((box.z1 + 8 - z0) / step));
    const cw = i1 - i0 + 1, ch = j1 - j0 + 1;
    const pos = new Float32Array(cw * ch * 3);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = x0 + (i0 + i) * step, z = z0 + (j0 + j) * step;
      const h = terrain.heights[(j0 + j) * nx + i0 + i];
      pos.set([x, (h == null ? 0 : h) - 0.3, z], (j * cw + i) * 3);
    }
    const idx = [];
    for (let j = 0; j < ch - 1; j++) for (let i = 0; i < cw - 1; i++) { const a = j * cw + i, b = a + 1, c = a + cw, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    terrainMesh = new THREE.Mesh(g, groundMaterial(0, [0.08, 0.077, 0.075], { offset: 2, wet: o.wet * 0.5 }));
    terrainMesh.name = 'night_terrain';
    terrainMesh.renderOrder = 12;   // cutaway RENDER_ORDER.ground: passes through building interiors → after caps
    scene.add(terrainMesh);
  }

  // ------------------------------------------------ glow sprites
  const P = [], C = [], I = [];
  const add = (x, y, z, col, I3, size, blink = 0, phase = 0) => { P.push(x, y, z); C.push(col[0] * I3, col[1] * I3, col[2] * I3); I.push(size, blink, phase); };
  for (const p of lamps) if (inBox(p.x, p.z)) add(p.x, p.y, p.z, p.color, 6, 1.0);
  for (const a of accents) add(a.x, a.y, a.z, a.color === ORANGE ? [1.0, 0.45, 0.1] : [0.5, 0.2, 1.0], 4, 1.8);
  // aviation obstruction lights (red, flashing) on tall buildings + steady rooftop lights on mid-rise
  for (const [bid, m] of bmeta) {
    if (!inBox(m.cx, m.cz)) continue;
    const b = m.b;
    if (m.H >= 85) {
      const corners = [[b.minx, b.minz], [b.maxx, b.minz], [b.minx, b.maxz], [b.maxx, b.maxz]]
        .map(([x, z]) => [x + (m.cx - x) * 0.12, z + (m.cz - z) * 0.12]).filter(([x, z]) => inBox(x, z, -1));
      for (const [x, z] of corners) add(x, m.top + 0.5, z, [1.0, 0.04, 0.02], 14, 1.3, 1, hashI(bid, 1) * 0.3);
      if (m.H >= 150) for (const [x, z] of corners) add(x, m.base + m.H * 0.5, z, [1.0, 0.05, 0.02], 8, 1.0, 1, hashI(bid, 2) * 0.3);
    } else if (m.H > 25 && hashI(bid, 21) < 0.25) {
      add(m.cx + (hashI(bid, 22) - 0.5) * (b.maxx - b.minx) * 0.6, m.top + 0.4, m.cz + (hashI(bid, 23) - 0.5) * (b.maxz - b.minz) * 0.6,
        hashI(bid, 24) < 0.5 ? [1, 0.8, 0.6] : [0.8, 0.9, 1], 4, 1.2);
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  pg.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  pg.setAttribute('aInfo', new THREE.Float32BufferAttribute(I, 3));
  const ptsMat = mk(new THREE.ShaderMaterial({
    vertexShader: VS_PTS, fragmentShader: FS_PTS,
    uniforms: { uScale: { value: 1000 }, uTime: U.uTime, uMinPx: { value: 2.5 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ptsMat.name = 'night_glow';
  const points = new THREE.Points(pg, ptsMat);
  points.name = 'night_glow'; points.frustumCulled = false; points.renderOrder = 50;
  scene.add(points);

  // ------------------------------------------------ post
  const gl = renderer.getContext();
  const hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const ttype = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const size = new THREE.Vector2();
  let rtScene = null, rtA = null, rtB = null, rtC = null, rtD = null;
  function ensureTargets() {
    renderer.getDrawingBufferSize(size);
    const w = size.x, h = size.y;
    if (rtScene && rtScene.width === w && rtScene.height === h) return;
    [rtScene, rtA, rtB, rtC, rtD].forEach((r) => r && r.dispose());
    rtScene = new THREE.WebGLRenderTarget(w, h, { type: ttype, depthBuffer: true, stencilBuffer: true, samples: o.msaa });
    const q = (d) => new THREE.WebGLRenderTarget(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)), { type: ttype, depthBuffer: false });
    rtA = q(4); rtB = q(4); rtC = q(12); rtD = q(12);
  }
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: VS_QUAD, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false }); const s = new THREE.Scene(); const q = new THREE.Mesh(quadGeo, m); q.frustumCulled = false; s.add(q); return { m, s }; };
  const sky = pass(FS_SKY, { uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uSkyTop: U.uSkyTop, uSkyHorizon: U.uSkyHorizon, uFogColor: U.uFogColor });
  const bright = pass(FS_BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: o.bloomThreshold } });
  const blur = pass(FS_BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const fin = pass(FS_FINAL, {
    tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    uBloomA: { value: o.bloomA }, uBloomB: { value: o.bloomB }, uExposure: { value: o.exposure }, uSaturation: { value: o.saturation },
    uVignette: { value: o.vignette }, uShadowTint: { value: new THREE.Vector3(-0.004, 0.0, 0.012) }, uHighTint: { value: new THREE.Vector3(0.02, 0.008, -0.01) },
    uRes: { value: new THREE.Vector2(1, 1) },
  });
  function run(p, target) { renderer.setRenderTarget(target); renderer.render(p.s, quadCam); }
  function blurPass(src, tmp, dst) {
    blur.m.uniforms.tSrc.value = src.texture; blur.m.uniforms.uDir.value.set(1 / src.width, 0); run(blur, tmp);
    blur.m.uniforms.tSrc.value = tmp.texture; blur.m.uniforms.uDir.value.set(0, 1 / src.height); run(blur, dst);
  }

  const prevBg = scene.background; scene.background = null;
  if (!scene.fog) scene.fog = null;

  const N = {
    heightAt, terrainMesh, lamps, accents, uniforms: U, materials, lightTexture: lightTex, lightBox: { ...LB }, buildingInfo: binfoTex,
    points, options: o, hdr,
    // a fresh patched ground ShaderMaterial (same look as the terrain), e.g. for the cutaway plinth top
    makeGroundMaterial: (albedo = [0.08, 0.077, 0.075], opts = {}) => groundMaterial(0, albedo, { wet: o.wet * 0.5, ...opts }),
    stats: { lamps: lamps.length, spillSplats: spill, materials: materials.length, buildMs: 0 },
    update(t, camera) {
      U.uTime.value = t;
      if (camera) {
        renderer.getDrawingBufferSize(size);
        const f = camera.isPerspectiveCamera ? size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : size.y / 2;
        ptsMat.uniforms.uScale.value = f;
      }
    },
    render(camera, target = null) {
      ensureTargets();
      camera.updateMatrixWorld();
      sky.m.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      sky.m.uniforms.uCamWorld.value.copy(camera.matrixWorld);
      const ac = renderer.autoClear;
      renderer.setRenderTarget(rtScene);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      renderer.render(sky.s, quadCam);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      bright.m.uniforms.tSrc.value = rtScene.texture; bright.m.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height);
      run(bright, rtA);
      blurPass(rtA, rtB, rtA);
      blur.m.uniforms.tSrc.value = rtA.texture; blur.m.uniforms.uDir.value.set(0.7 / rtA.width, 0.7 / rtA.height); run(blur, rtC);
      blurPass(rtC, rtD, rtC);
      fin.m.uniforms.tScene.value = rtScene.texture; fin.m.uniforms.tBloomA.value = rtA.texture; fin.m.uniforms.tBloomB.value = rtC.texture;
      fin.m.uniforms.uRes.value.set(rtScene.width, rtScene.height);
      run(fin, target);
      renderer.autoClear = ac;
    },
    setSize() { ensureTargets(); },
    dispose() {
      [rtScene, rtA, rtB, rtC, rtD].forEach((r) => r && r.dispose());
      materials.forEach((m) => m.dispose()); lightTex.dispose(); binfoTex.dispose();
      scene.remove(points); if (terrainMesh) scene.remove(terrainMesh);
      scene.background = prevBg;
    },
  };
  N.stats.buildMs = Math.round(performance.now() - T0);
  return N;
}
