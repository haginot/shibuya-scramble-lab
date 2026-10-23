// Halloween night video: shot list over video time (same format as director.mjs)
// plus the dispersal climax. `sim` says which solver a shot advances:
// 'main' = the Halloween crowd, 'dispersal' = both station-closing runs
// (no control / managed) side by side; `speed` is simulated seconds per video
// second for that solver.
import * as THREE from '../vendor/three.module.min.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const smooth=t=>t*t*(3-2*t);
export const DISPERSAL_SECONDS=1500;// simulated time shown in the climax (25 min)
const SPLIT=[19,31];
// Captions: [English, Japanese]. The video is a practical heads-up for people who work in,
// visit or pass through Shibuya on Halloween night (not a party trailer).
export const SHOTS=[
 {name:'hook',t0:0,t1:2.5,sim:'main',speed:2,ease:smooth,pos:[V(46,215,150),V(34,150,110),V(26,96,74)],look:[V(0,0,2),V(1,0,4),V(2,0,6)],fov:[44,38],trail:[.2,.3],cap:null},
 {name:'establish',t0:2.5,t1:6.5,sim:'main',speed:3,ease:smooth,pos:[V(96,92,112),V(80,80,122),V(58,72,124)],look:[V(0,8,4),V(-3,8,0),V(-6,8,-4)],fov:[40,38],trail:[.3,.4],cap:['Working or sightseeing in Shibuya on Oct 31? · sim: {agents} people','10/31夜、渋谷で働く・観光する人へ · 仮定 {agents}人']},
 {name:'street',t0:6.5,t1:10.5,sim:'main',speed:1,ease:smooth,pos:[V(33,2.7,35),V(30,2.6,30.5),V(27,2.5,26.5)],look:[V(4,1.2,6),V(3,1.2,4),V(2,1.3,3)],fov:[48,44],trail:[0,0],cap:['expect to be held, then released in waves','警察の規制で待機→段階的に解放']},
 {name:'dj',t0:10.5,t1:14,sim:'main',speed:1,ease:smooth,pos:[V(9.5,3.4,40.5),V(11.6,3.8,41.8),V(13.4,4.2,43.0)],look:[V(20.5,4.9,51.5),V(20.5,5.0,51.5),V(20.5,5.1,51.5)],fov:[42,38],trail:[0,0],cap:['follow the "DJ police" instructions','DJポリスの指示に従って']},
 {name:'release',t0:14,t1:SPLIT[0],sim:'main',speed:2.5,ease:ease,pos:[V(6,58,62),V(2,82,40),V(-4,108,20)],look:[V(0,0,6),V(0,0,3),V(0,0,1)],fov:[42,40],trail:[.4,1],cap:['all-way green: row by row','歩行者青・前列から順に']},
 {name:'dispersal',t0:SPLIT[0],t1:SPLIT[1],sim:'dispersal',speed:DISPERSAL_SECONDS/(SPLIT[1]-SPLIT[0]),ease:x=>x,pos:[V(36,268,124),V(36,264,122)],look:[V(36,0,38),V(36,0,38)],fov:[42,42],trail:[0,0],split:true,cap:null},
 {name:'exits',t0:SPLIT[1],t1:36,sim:'none',speed:0,ease:x=>x,pos:[V(36,264,122),V(36,262,121)],look:[V(36,0,38),V(36,0,38)],fov:[42,42],trail:[0,0],split:true,cap:null},
 {name:'results',t0:36,t1:39.5,sim:'none',speed:0,ease:x=>x,pos:[V(36,262,121),V(36,261,120.5)],look:[V(36,0,38),V(36,0,38)],fov:[42,42],trail:[0,0],split:true,cap:null},
 {name:'question',t0:39.5,t1:42,sim:'none',speed:0,ease:x=>x,pos:[V(36,261,120.5),V(36,260,120)],look:[V(36,0,38),V(36,0,38)],fov:[42,42],trail:[0,0],split:true,cap:null},
];
// The main crowd is warmed up to this signal-clock point (third cycle, vehicle
// phase), so the all-way walk begins about 1.5 s into the 'release' shot
// (hook 5 + establish 12 + street 4 + dj 3.5 simulated seconds before it).
export const START_CLOCK=3*150-24.5-1.5*2.5;
export const SCENE_SECONDS=42,CREDIT_SECONDS=3,VIDEO_SECONDS=SCENE_SECONDS+CREDIT_SECONDS;
export const LIVE_SECONDS=SPLIT[0];// the live "cinema" camera loops over the main-crowd shots

const curves=new Map();
const curve=points=>{if(!curves.has(points))curves.set(points,points.length>2?new THREE.CatmullRomCurve3(points,false,'centripetal'):new THREE.LineCurve3(points[0],points[1]));return curves.get(points);};
export function shotAt(t){
 const s=SHOTS.find(x=>t>=x.t0&&t<x.t1)||SHOTS.at(-1);const u=Math.min(1,Math.max(0,(t-s.t0)/(s.t1-s.t0))),e=s.ease(u);
 const pos=curve(s.pos).getPoint(e),look=curve(s.look).getPoint(e),lerp=(a,b)=>a+(b-a)*e;
 const fadeIn=Math.min(1,t/.25),fadeOut=Math.min(1,Math.max(0,(SCENE_SECONDS-t)/.6));
 const local=t-s.t0,capAlpha=Math.min(1,Math.max(0,(local-.4)/.4))*Math.min(1,Math.max(0,(s.t1-t-.3)/.4));
 return {name:s.name,sim:s.sim,split:!!s.split,pos,look,up:V(0,1,0),fov:lerp(...s.fov),speed:s.speed,trail:lerp(...s.trail),fade:fadeIn*fadeOut,caption:s.cap,capAlpha,local,t};
}
