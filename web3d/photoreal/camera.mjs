// Camera presets for the photoreal cutaway backdrop (x east, y up, z south; origin = Scramble centre).
// Clip box x∈[-340,160], z∈[-250,222]; the east plane x=160 slices Shibuya Scramble Square (bid 908, x 113–193,
// z ≈ 85–160, 230 m), so the cut face looks east (+x) and every cutaway view sits east of the box.
//   SHOTS[name] = {pos, look, fov, up?}        4 stills
//   clipCamera(t) → {pos, look, fov}           10 s 9:16 test clip: the 'aerial' still → slow push-in and descending
//                                               arc onto the Scramble Square cut face, ending on the 'cutaway' still
//   applyCamera(camera, {pos,look,fov,up})
import * as THREE from '../vendor/three.module.min.js';

export const CLIP_SECONDS = 10;
export const SHOTS = {
 // whole diorama, station + Scramble centred, east and south cut faces facing the camera (like the reference)
 aerial: {pos: [560, 430, 330], look: [-50, 5, 5], fov: 50},
 // close top-down over the Scramble and the station (north up on screen)
 topdown: {pos: [42, 760, 62], look: [42, 0, 58], fov: 27, up: [0, 0, -1]},
 // eye level on the Scramble (south-east corner) looking north-west up Center-gai
 eyelevel: {pos: [8, 1.6, 12], look: [-120, 16, -95], fov: 62},
 // into the cut face of Scramble Square (east clip plane x=160)
 cutaway: {pos: [330, 52, 238], look: [150, 70, 118], fov: 50},
};

const ease = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2, 3)/2;
const lerp3 = (a, b, k) => a.map((v, i) => v+(b[i]-v)*k);

// orbit + dolly in cylindrical coordinates around a moving target so the arc stays smooth (no straight-line cut through)
export function clipCamera(t) {
 const k = ease(Math.min(1, Math.max(0, t/CLIP_SECONDS)));
 // starts exactly on the 'aerial' still, ends exactly on the 'cutaway' still
 const look = lerp3([-50, 5, 5], [150, 70, 118], k);
 const az = THREE.MathUtils.lerp(Math.atan2(325, 610), Math.atan2(120, 180), k); // angle from +x toward +z
 const dist = THREE.MathUtils.lerp(Math.hypot(610, 425, 325), Math.hypot(180, 18, 120), Math.pow(k, .8));
 const el = THREE.MathUtils.lerp(Math.asin(425/Math.hypot(610, 425, 325)), Math.asin(-18/Math.hypot(180, 18, 120)), k);
 const pos = [look[0]+Math.cos(az)*Math.cos(el)*dist, look[1]+Math.sin(el)*dist, look[2]+Math.sin(az)*Math.cos(el)*dist];
 return {pos, look, fov: 50};
}

export function applyCamera(camera, {pos, look, fov, up = [0, 1, 0]}) {
 camera.fov = fov; camera.up.set(...up); camera.position.set(...pos); camera.lookAt(...look);
 const d = camera.position.length();
 camera.near = Math.max(.3, Math.min(5, pos[1]*.2)); camera.far = d+2500;
 camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
