// Halloween night video v4 "🧙ハロウィンの渋谷を脱出せよ！🎃 / Escape Shibuya on Halloween!":
// shot list over video time (same format as director.mjs). The main Halloween crowd advances
// on every shot (`sim:'main'`, `speed` simulated seconds per video second); the escape walkers of
// a level are played back from the precomputed escape run (escape.mjs) at the level's own speed.
// Level and overview cameras are fitted to the routes at warm-up (setCameras); the spec cameras
// below are the fallback (motion spec §1, logs/spec-v4-motion.md).
import * as THREE from '../vendor/three.module.min.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const smooth=t=>t*t*(3-2*t);
// Level order clockwise around the station (escape.mjs level keys).
export const LEVELS=['centergai','miyashita','hikarie','stream','dogenzaka'];
export const LEVEL_SECONDS=6,LEVEL_START=7,PAN=.6;
// Inside one level (local time u, s): branches draw on, the example route lights, walkers start,
// the player arrives at about u=3.4 (speed = player travel / 2.8) → result card (ESCAPED stamp of
// the example route), then the sim fast-forwards (ff) until every route's first walker has arrived
// and the card compares them (VS beat, all simulation).
export const BEAT=Object.freeze({banner:0,pin:.3,draw:[.6,1.3],lit:[1.3,1.7],walk:.6,walkSpan:2.8,callout:[.8,3.3],stamp:3.4,ff:[3.7,4.7],vs:4.8,out:5.85});
const lv=(k,i,pos,look)=>({name:`lv${i+1}`,level:k,t0:LEVEL_START+i*LEVEL_SECONDS,t1:LEVEL_START+(i+1)*LEVEL_SECONDS,sim:'main',speed:1.5,ease:smooth,pan:PAN,pos,look,fov:[42,42],trail:[0,0],cam:k});
export const SHOTS=[
 {name:'hook',t0:0,t1:1,sim:'main',speed:2,ease:smooth,pos:[V(60,190,150),V(30,70,70)],look:[V(0,0,5),V(4,0,8)],fov:[44,38],trail:[.2,.25]},
 {name:'title',t0:1,t1:3,sim:'main',speed:2,ease:smooth,pos:[V(30,70,70),V(-10,85,80)],look:[V(4,0,8),V(0,0,0)],fov:[38,40],trail:[.25,.2]},
 {name:'mission',t0:3,t1:7,sim:'main',speed:2,ease:t=>ease(Math.min(1,t/.4)),pos:[V(-10,85,80),V(40,300,260)],look:[V(0,0,0),V(30,0,10)],fov:[40,46],trail:[.2,0],cam:'mission'},
 lv('centergai',0,[V(-20,140,90),V(-30,120,70)],[V(-45,0,-30),V(-35,0,-10)]),
 lv('miyashita',1,[V(40,150,30),V(60,135,20)],[V(100,0,-90),V(95,0,-70)]),
 lv('hikarie',2,[V(60,150,-40),V(80,135,-20)],[V(140,0,60),V(130,0,60)]),
 lv('stream',3,[V(120,170,60),V(130,150,90)],[V(200,0,220),V(190,0,210)]),
 lv('dogenzaka',4,[V(-20,150,-30),V(-30,135,-10)],[V(-95,0,60),V(-90,0,55)]),
 {name:'overview',t0:37,t1:39.5,sim:'main',speed:1.5,ease:smooth,pan:PAN,pos:[V(40,330,300),V(40,310,280)],look:[V(40,0,30),V(40,0,30)],fov:[46,46],trail:[0,0],cam:'overview'},
 {name:'question',t0:39.5,t1:42,sim:'main',speed:1.5,ease:x=>x,pos:[V(40,310,280),V(40,305,276)],look:[V(40,0,30),V(40,0,30)],fov:[46,46],trail:[0,0],cam:'question'},
];
// The main crowd is warmed up to this signal-clock point (third cycle, vehicle phase).
export const START_CLOCK=3*150-22-1.5*2.5;
export const SCENE_SECONDS=42,CREDIT_SECONDS=3,VIDEO_SECONDS=SCENE_SECONDS+CREDIT_SECONDS;
export const LIVE_SECONDS=SCENE_SECONDS;// the live "cinema" camera loops over the whole timeline
export const sectionOf=name=>/^lv\d$/.test(name)?'level':name;

// Fitted cameras (escape-scene cameraFor): {centergai:{pos,look,fov},…, overview, mission, question}.
// Each fitted shot drifts 4 % toward its look point; level shots pan in from the previous shot.
const fitted=new Map();
export function setCameras(cams){fitted.clear();curves.clear();
 for(const [k,c] of Object.entries(cams||{})){const pos=c.pos.clone(),look=c.look.clone(),end=pos.clone().lerp(look,c.drift??.04);fitted.set(k,{pos:[pos,end],look:[look,look.clone()],fov:[c.fov,c.fov]});}}
const camOf=s=>{const f=s.cam&&fitted.get(s.cam);if(!f)return s;if(s.name==='mission')return {...s,pos:[s.pos[0],f.pos[0]],look:[s.look[0],f.look[0]],fov:[s.fov[0],f.fov[0]]};return {...s,...f};};

const curves=new Map();
const curve=points=>{const key=points.map(p=>p.toArray().join(',')).join(';');if(!curves.has(key))curves.set(key,points.length>2?new THREE.CatmullRomCurve3(points,false,'centripetal'):new THREE.LineCurve3(points[0],points[1]));return curves.get(key);};
function frame(s,u){const e=s.ease(u),c=camOf(s);return {pos:curve(c.pos).getPoint(e),look:curve(c.look).getPoint(e),fov:c.fov[0]+(c.fov[1]-c.fov[0])*e};}
export function shotAt(t){
 const i=Math.max(0,SHOTS.findIndex(x=>t>=x.t0&&t<x.t1)),s=t>=SCENE_SECONDS?SHOTS.at(-1):SHOTS[i];
 const local=Math.max(0,t-s.t0),u=Math.min(1,local/(s.t1-s.t0));let {pos,look,fov}=frame(s,u);
 // Pan from where the previous shot ended (no cuts between levels).
 if(s.pan&&local<s.pan&&SHOTS.indexOf(s)>0){const p=SHOTS[SHOTS.indexOf(s)-1],a=frame(p,1),b=frame(s,0),k=ease(local/s.pan);
  pos=a.pos.clone().lerp(b.pos,k);look=a.look.clone().lerp(b.look,k);fov=a.fov+(b.fov-a.fov)*k;}
 const fadeIn=Math.min(1,t/.25),fadeOut=Math.min(1,Math.max(0,(SCENE_SECONDS-t)/.6));
 const trail=s.trail[0]+(s.trail[1]-s.trail[0])*u;
 return {name:s.name,section:sectionOf(s.name),level:s.level??null,sim:s.sim,split:false,pos,look,up:V(0,1,0),fov,speed:s.speed,trail,fade:fadeIn*fadeOut,caption:null,capAlpha:0,local,u,t,t0:s.t0,t1:s.t1};
}
