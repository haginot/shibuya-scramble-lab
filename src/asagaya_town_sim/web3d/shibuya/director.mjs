// Camera director: a shot list over video time drives camera path, field of
// view, simulation speed (time-lapse factor shown on screen), trail exposure
// and captions. The recorder and the live "cinema" mode use the same list.
import * as THREE from '../vendor/three.module.min.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const smooth=t=>t*t*(3-2*t);

// Times in seconds of video. speed = simulated seconds per video second.
export const SHOTS=[
 {name:'arrival',t0:0,t1:6.5,speed:3,ease:smooth,pos:[V(-250,215,-245),V(-165,145,-160),V(-98,82,-88)],look:[V(12,0,14),V(6,0,6),V(1,0,3)],fov:[38,36],trail:[.25,.35],cap:['shibuya, 18:00','渋谷 午後6時']},
 {name:'standoff',t0:6.5,t1:13,speed:1.6,ease:smooth,pos:[V(17,3.6,13),V(12,3.2,8),V(8,3,4)],look:[V(-26,5,-15),V(-27,5.5,-16),V(-28,6,-17)],fov:[44,40],trail:[0,0],cap:['{agents} people, one at a time','一人ひとりが、自分の道を']},
 {name:'rise',t0:13,t1:17,speed:1.6,ease:ease,pos:[V(8,3,4),V(12,34,12),V(-2,108,20)],look:[V(-28,6,-17),V(0,0,-2),V(1,0,1)],fov:[40,40],trail:[0,.5],cap:['all-way walk','スクランブル']},
 {name:'godview',t0:17,t1:27,speed:3.2,ease:x=>x,pos:[V(-2,108,20),V(0,122,6),V(4,130,-8)],look:[V(1,0,1),V(0,0,0),V(-1,0,0)],up:'north',fov:[40,38],trail:[1,1.25],cap:['every trail is one person','光の一本一本が、一人の歩み']},
 {name:'sweep',t0:27,t1:33.5,speed:1.4,ease:smooth,pos:[V(48,9,-30),V(30,6,-38),V(4,5,-44)],look:[V(-8,1.5,4),V(-6,1.5,6),V(-2,1.5,8)],fov:[36,34],trail:[.15,.15],cap:['cars wait for the last walker','最後の一人が渡るまで、車は待つ']},
 {name:'leave',t0:33.5,t1:39,speed:8,ease:ease,pos:[V(4,5,-44),V(6,48,-40),V(30,170,-95)],look:[V(-2,1.5,8),V(0,0,2),V(-6,0,14)],fov:[34,40],trail:[.3,.5],cap:['toy model · not a prediction','トイモデル・予測ではない']},
];
// Video starts at this point of the 150 s signal cycle (vehicle phase), so the
// all-way walk begins about 14 s in.
export const START_CLOCK=118.5;
export const SCENE_SECONDS=39,CREDIT_SECONDS=5,VIDEO_SECONDS=SCENE_SECONDS+CREDIT_SECONDS;

const curves=new Map();
const curve=points=>{if(!curves.has(points))curves.set(points,points.length>2?new THREE.CatmullRomCurve3(points,false,'centripetal'):new THREE.LineCurve3(points[0],points[1]));return curves.get(points);};
export function shotAt(t){
 const s=SHOTS.find(x=>t>=x.t0&&t<x.t1)||SHOTS.at(-1);const u=Math.min(1,Math.max(0,(t-s.t0)/(s.t1-s.t0))),e=s.ease(u);
 const pos=curve(s.pos).getPoint(e),look=curve(s.look).getPoint(e);
 const lerp=(a,b)=>a+(b-a)*e;
 const fadeIn=Math.min(1,t/.8),fadeOut=Math.min(1,Math.max(0,(SCENE_SECONDS-t)/.7));
 // Caption: visible from 0.6 s into the shot until 0.5 s before its end.
 const local=t-s.t0,capAlpha=Math.min(1,Math.max(0,(local-.5)/.5))*Math.min(1,Math.max(0,(s.t1-t-.4)/.5));
 return {name:s.name,pos,look,up:s.up==='north'?V(0,0,-1):V(0,1,0),fov:lerp(...s.fov),speed:s.speed,trail:lerp(...s.trail),fade:fadeIn*fadeOut,caption:s.cap,capAlpha};
}
