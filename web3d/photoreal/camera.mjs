// Camera presets for the photoreal cutaway backdrop (x east, y up, z south; origin = Scramble centre).
// Clip box ≈ x∈[-340,160], z∈[-250,250]; the east plane x=160 slices Shibuya Scramble Square (bid 908, x 113–193,
// z ≈ 85–160, 230 m), so the cut face looks east (+x) and every cutaway view sits east of the box.
//   SHOTS[name] = {pos, look, fov, up?}        4 stills
//   clipCamera(t) → {pos, look, fov}           10 s 9:16 test clip: high aerial from the south-east → slow push-in and
//                                               arc onto the Scramble Square cut face (ends near the 'cutaway' still)
//   applyCamera(camera, {pos,look,fov,up})
import * as THREE from '../vendor/three.module.min.js';

export const CLIP_SECONDS = 10;
export const SHOTS = {
 // whole diorama, station + Scramble centred, east and south cut faces facing the camera (like the reference)
 aerial: {pos: [610, 430, 560], look: [-60, 0, 10], fov: 38},
 // close top-down over the Scramble and the station (north up on screen)
 topdown: {pos: [40, 330, 95], look: [40, 0, 80], fov: 42, up: [0, 0, -1]},
 // eye level on the Scramble looking south-east at the station and Scramble Square
 eyelevel: {pos: [-34, 1.6, -18], look: [120, 34, 95], fov: 58},
 // into the cut face of Scramble Square (east clip plane x=160)
 cutaway: {pos: [268, 74, 196], look: [158, 62, 112], fov: 46},
};

const ease = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2, 3)/2;
const lerp3 = (a, b, k) => a.map((v, i) => v+(b[i]-v)*k);

// orbit + dolly in cylindrical coordinates around a moving target so the arc stays smooth (no straight-line cut through)
export function clipCamera(t) {
 const k = ease(Math.min(1, Math.max(0, t/CLIP_SECONDS)));
 const look = lerp3([-30, 10, 30], [158, 64, 118], k);
 const az = THREE.MathUtils.lerp(Math.atan2(560, 610), Math.atan2(84, 110), k); // angle from +x toward +z
 const dist = THREE.MathUtils.lerp(900, 125, Math.pow(k, .85));
 const el = THREE.MathUtils.lerp(.52, .12, k); // elevation (rad)
 const pos = [look[0]+Math.cos(az)*Math.cos(el)*dist, look[1]+Math.sin(el)*dist, look[2]+Math.sin(az)*Math.cos(el)*dist];
 return {pos, look, fov: THREE.MathUtils.lerp(38, 46, k)};
}

export function applyCamera(camera, {pos, look, fov, up = [0, 1, 0]}) {
 camera.fov = fov; camera.up.set(...up); camera.position.set(...pos); camera.lookAt(...look);
 const d = camera.position.length();
 camera.near = Math.max(.3, Math.min(5, pos[1]*.2)); camera.far = d+2500;
 camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
