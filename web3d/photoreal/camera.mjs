// Camera presets for the photoreal cutaway backdrop (x east, y up, z south; origin = Scramble centre).
// Clip box x∈[-340,160], z∈[-250,222]; the east plane x=160 slices Shibuya Scramble Square (bid 908, x 113–193,
// z ≈ 85–160, 230 m), so the cut face looks east (+x) and every cutaway view sits east of the box.
//   SHOTS[name] = {pos, look, fov, up?}        4 stills
//   clipCamera(t) → {pos, look, fov}           10 s 9:16 test clip: the 'aerial' still → slow push-in and descending
//                                               arc onto the Scramble Square cut face, ending on the 'cutaway' still
//   applyCamera(camera, {pos,look,fov,up})
import * as THREE from '../vendor/three.module.min.js';

export const CLIP_SECONDS = 10;
// texBias: mip LOD bias for the photo textures (night.mjs uTexBias); close shots blur the legible third-party
// ads/logos baked into the PLATEAU facade photos (parody series: no real brands readable).
export const SHOTS = {
 // whole diorama, station + Scramble, east (Scramble Square) and south cut faces toward the camera (like the reference)
 aerial: {pos: [500, 330, 300], look: [-40, 20, 5], fov: 44, texBias: 0},
 // close top-down over the Scramble and the station (north up on screen)
 topdown: {pos: [42, 700, 50], look: [42, 0, 46], fov: 26, up: [0, 0, -1], texBias: 0},
 // eye level on the Scramble (south-east corner) looking north-west up Center-gai
 eyelevel: {pos: [8, 1.6, 12], look: [-120, 30, -95], fov: 54, texBias: 4.2},
 // into the cut face of Scramble Square (east clip plane x=160)
 cutaway: {pos: [330, 52, 238], look: [150, 70, 118], fov: 50, texBias: 1.6},
};

const ease = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2, 3)/2;
const lerp3 = (a, b, k) => a.map((v, i) => v+(b[i]-v)*k);
const polar = ({pos, look}) => { const d = pos.map((v, i) => v-look[i]), r = Math.hypot(...d); return {r, az: Math.atan2(d[2], d[0]), el: Math.asin(d[1]/r)}; };

// orbit + dolly in spherical coordinates around a moving target (smooth arc, no straight line through the city);
// k=0 is exactly the 'aerial' still, k=1 exactly the 'cutaway' still (render.py maps the last frame to t=CLIP_SECONDS)
export function clipCamera(t) {
 const k = ease(Math.min(1, Math.max(0, t/CLIP_SECONDS)));
 const A = SHOTS.aerial, B = SHOTS.cutaway, pa = polar(A), pb = polar(B);
 const look = lerp3(A.look, B.look, k);
 const az = THREE.MathUtils.lerp(pa.az, pb.az, k), el = THREE.MathUtils.lerp(pa.el, pb.el, k);
 const dist = THREE.MathUtils.lerp(pa.r, pb.r, Math.pow(k, .8));
 const pos = [look[0]+Math.cos(az)*Math.cos(el)*dist, look[1]+Math.sin(el)*dist, look[2]+Math.sin(az)*Math.cos(el)*dist];
 return {pos, look, fov: THREE.MathUtils.lerp(A.fov, B.fov, k), texBias: THREE.MathUtils.lerp(A.texBias, B.texBias, k*k)};
}

export function applyCamera(camera, {pos, look, fov, up = [0, 1, 0]}) {
 camera.fov = fov; camera.up.set(...up); camera.position.set(...pos); camera.lookAt(...look);
 const d = camera.position.length();
 camera.near = Math.max(.3, Math.min(5, pos[1]*.2)); camera.far = d+2500;
 camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
