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
const SPLIT=[24,38];

export const SHOTS=[
 {name:'hook',t0:0,t1:2.5,sim:'main',speed:2,ease:smooth,pos:[V(46,215,150),V(34,150,110),V(26,96,74)],look:[V(0,0,2),V(1,0,4),V(2,0,6)],fov:[44,38],trail:[.2,.3],cap:null},
 {name:'establish',t0:2.5,t1:7,sim:'main',speed:3,ease:smooth,pos:[V(96,92,112),V(80,80,122),V(58,72,124)],look:[V(0,8,4),V(-3,8,0),V(-6,8,-4)],fov:[40,38],trail:[.3,.4],cap:['Shibuya, Halloween night · {agents} people modelled','渋谷ハロウィン・{agents}人をモデル化']},
 {name:'street',t0:7,t1:12,sim:'main',speed:1,ease:smooth,pos:[V(33,2.7,35),V(30,2.6,30.5),V(27,2.5,26.5)],look:[V(4,1.2,6),V(3,1.2,4),V(2,1.3,3)],fov:[48,44],trail:[0,0],cap:['held in pens, released by the police','警察の規制で待機・段階的に解放']},
 {name:'dj',t0:12,t1:17,sim:'main',speed:1,ease:smooth,pos:[V(9.5,3.4,40.5),V(11.6,3.8,41.8),V(13.4,4.2,43.0)],look:[V(20.5,4.9,51.5),V(20.5,5.0,51.5),V(20.5,5.1,51.5)],fov:[42,38],trail:[0,0],cap:['the "DJ police" keep the crowd moving','DJポリスが群衆を誘導']},
 {name:'release',t0:17,t1:24,sim:'main',speed:2.5,ease:ease,pos:[V(6,58,62),V(2,82,40),V(-4,108,20)],look:[V(0,0,6),V(0,0,3),V(0,0,1)],fov:[42,40],trail:[.4,1],cap:['all-way green: row by row','歩行者青・前列から順に']},
 {name:'dispersal',t0:SPLIT[0],t1:SPLIT[1],sim:'dispersal',speed:DISPERSAL_SECONDS/(SPLIT[1]-SPLIT[0]),ease:x=>x,pos:[V(42,262,122),V(42,258,120)],look:[V(42,0,38),V(42,0,38)],fov:[40,40],trail:[0,0],split:true,cap:null},
 {name:'results',t0:SPLIT[1],t1:41,sim:'none',speed:0,ease:x=>x,pos:[V(42,258,120),V(42,256,119)],look:[V(42,0,38),V(42,0,38)],fov:[40,40],trail:[0,0],split:true,cap:null},
];
// The main crowd is warmed up to this signal-clock point (third cycle, vehicle
// phase), so the all-way walk begins about 1.5 s into the 'release' shot.
export const START_CLOCK=2*150+117.75;
export const SCENE_SECONDS=41,CREDIT_SECONDS=3,VIDEO_SECONDS=SCENE_SECONDS+CREDIT_SECONDS;
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
