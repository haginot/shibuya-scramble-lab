// Crowd states for the JR編 branching variants (CLEAR / GAME OVER). SIMULATION ONLY — every number a state reports
// is a count / rate of the people of this model → the HUD labels it 「シミュレーション」 (items carry the word).
//
// Built on crowd-jr.mjs (series pilot): gate capacities / route A geometry / assumptions come from JR_GATES,
// JR_ROUTES, JR_CROWD; a precomputed JR run (tools/precompute_series_jr.mjs, ctx.run) calibrates the Hachiko queue
// (queue length and gate-front density of that run) when given. Each state is a small deterministic set-piece model
// (queues along a polyline with metered / taxi-paced service, a packed crowd held at a barrier, light two-way street
// flow, a platform after the train left). Positions are CLOSED-FORM in t (no integration): advance(h, t) for any t,
// in any order, gives the same people → resumable segmented renders. Positions are approximate (「位置・構造は概略」);
// every rate below is a MODEL ASSUMPTION (not a JR / police / taxi figure).
//
// Registry CROWD_STATES[key] = {key, label:{ja,en}, assumptions:{ja,en}, defaults, setup(ctx?, params?) → handle,
//                                advance(handle, t) → frame}
//   ctx    = {run?: precomputed JR run (crowd-jr precomputeJR / ?jrrun), insideBuilding?(x,z,margin)}
//   params = overrides of `defaults` (positions from series/sets-variants.mjs: path, barrier, stand, platform…)
//   t      = seconds since the state started (beat-local time × sim rate; continuous across beats that share a state)
//   frame  = {key, t, label:'simulation',
//             people: [{x, y, z, heading, speed, id, anim:'walk'|'idle'|'queue'|'phone', role?}]  (NearPeople input;
//                     id = stable style id ≥ 200000 so colours never collide with the JR crowd's agent ids),
//             player: {x, z, y, heading, speed, rank?} | null   (the camera's person for eye-level shots; not in people),
//             focus:  {x, z}  (where the action is), regions: [{x, z, r}] (hide the background JR crowd there),
//             hud:    {label:'シミュレーション', numbers:{…raw}, items:[{id, ja, en, value, unit, text}]}  (text has 「シミュレーション」),
//             previewShot (people-preview.html only)}
//   Keys: 'hachiko-peak' (peak Hachiko-gate queue, one-way + U-turn, metered release → stuck),
//         'zone-dense'   (dense crowd held at police closure barriers; nobody gets through),
//         'detour-light' (light two-way flow on a detour street; the player walks freely),
//         'alt-platform' (sparse platform at an alternative station, the last train has left),
//         'taxi-west'    (suspended stand: a waiting line, no taxi comes),
//         'taxi-sakura'  (working stand: the line moves as taxis arrive),
//         'gate-newsouth'(moderate flow into 新南 / 南改札: short queue, steady admission),
//         'caught-press' (combined episodes: ordinary people pack in around the stopped POV player; neutral, backs/sides).
// detour-light params.clear: clear cone in front of the eye camera (zone-clear fix, see the state).
// CrowdStateView(scene, {state, params?, ctx?, near?: NearPeople, capacity=1600, includePlayer=false}) renders a state's people
//   with series/people-close.mjs (detailed LOD near the camera, light LOD beyond). .update(t, camera, {animTime?}) → frame;
//   .maskCrowd(crowd) hides costume.mjs crowd agents inside frame.regions (call after crowd.update, before culling).
import * as THREE from '../../vendor/three.module.min.js';
import {JR_GATES,JR_CROWD} from './crowd-jr.mjs';
import {NearPeople} from './people-close.mjs';
import {makeShot} from './camera.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const hashU=i=>{let t=(i+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const H=(k,s)=>hashU(k*7919+s*104729+13);
const SIM={ja:'シミュレーション',en:'simulation'};
const fmt=(v,d=0)=>Number(v).toFixed(d);
const item=(id,ja,en,value,unit,d=0)=>({id,ja,en,value,unit,text:`${ja} ${fmt(value,d)}${unit.ja}（シミュレーション）`,textEn:`${en}: ${fmt(value,d)} ${unit.en} (simulation)`});
const U={people:{ja:'人',en:'people'},dens:{ja:'人/m²',en:'p/m²'},min:{ja:'分',en:'min'},m:{ja:'m',en:'m'},mps:{ja:'m/秒',en:'m/s'},cars:{ja:'台',en:'taxis'}};

// ─── polyline helper ─────────────────────────────────────────────────────────
export function polyline(pts){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));const L=cum.at(-1);
 // u < 0 / u > L extend the end segments linearly
 const at=u=>{let i=1;if(u>0)while(i<pts.length-1&&cum[i]<u)i++;const a=pts[i-1],b=pts[i],l=(cum[i]-cum[i-1])||1,f=(u-cum[i-1])/l,dx=(b[0]-a[0])/l,dz=(b[1]-a[1])/l;return {x:a[0]+(b[0]-a[0])*f,z:a[1]+(b[1]-a[1])*f,dx,dz};};
 // smoothed tangent (corners) for headings / lateral offsets
 const frame=(u,win=1.5)=>{const p=at(u),a=at(u-win),b=at(u+win);let dx=b.x-a.x,dz=b.z-a.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;return {x:p.x,z:p.z,dx,dz,nx:-dz,nz:dx};};
 return {pts,cum,L,at,frame};}

// ─── generic queue along a polyline (entrance → front) ───────────────────────
// served(t) = people admitted at the front by time t (eased, monotonic); arrivals k ≥ n0 reach the entrance at
// a_k = (k − n0 + 1)/lambda and walk (speed v) to their slot. lanes = people abreast; perM = people per metre of path.
function queueModel(o){const P=polyline(o.path),lanes=o.lanes,perM=o.perM,lag=o.lag??.3,v=o.walk??1.25,lam=o.lambda,n0=o.n0,served=o.served,idBase=o.idBase;
 const total=t=>n0+Math.max(0,Math.floor(lam*t+1e-9));
 const rankOf=(k,t)=>{let r=k-served(t);for(let it=0;it<2;it++)r=k-served(t-lag*Math.max(0,r));return r;};
 const posU=(k,t)=>{const r=rankOf(k,t);if(r<0){const sv=-r/perM;return {u:P.L+sv*1.5,gone:sv*1.5>o.exitRun,rank:r};}
  let u=P.L-r/perM-H(k,3)*.18;if(k>=n0){const a=(k-n0+1)/lam;if(t<a)return null;const walked=-o.approach+(t-a)*v;if(walked<u)return {u:walked,rank:r,walking:true};}
  return {u,rank:r};};
 const person=(k,t)=>{const q=posU(k,t);if(!q||q.gone)return null;const f=P.frame(q.u);const lane=k%lanes,lat=((lane+.5)/lanes-.5)*o.width+(H(k,1)-.5)*.22;
  const q2=posU(k,t-.3);const du=q2?q.u-q2.u:0;const speed=Math.abs(du)/.3;
  const sway=Math.sin(t*.4+k)*.04;const x=f.x+f.nx*(lat+sway),z=f.z+f.nz*(lat+sway);
  const heading=Math.atan2(f.dx,f.dz)+(speed<.2?(H(k,2)-.5)*.7:0);
  return {x,z,y:o.y||0,heading,speed,id:idBase+k,rank:q.rank,u:q.u,anim:speed>.3?'walk':H(k,4)<o.phoneShare?'phone':'queue'};};
 return {P,total,person,rankOf,
  frame(t){const out=[];const N=total(t);const s=served(t);for(let k=Math.max(0,Math.floor(s)-Math.ceil(o.exitRun*perM/1.5)-2);k<N;k++){const p=person(k,t);if(p)out.push(p);}return out;}};}

// eased "release" service: blocks of B people every period s, each block released over dur s (stop-and-go metering)
const blockServed=(B,period,dur,offset=0)=>t=>{const tt=t+offset;const j=Math.floor(tt/period),f=tt-j*period;return B*j+B*smooth(0,dur,f);};
// taxi service: departures at known times, groups of 1–2, each step forward eased over 1.6 s
function taxiServed({headway,offset=0,seed=3,first=0}){return t=>{if(headway<=0||!isFinite(headway))return 0;const tt=t-offset;if(tt<first)return 0;const j=Math.floor((tt-first)/headway);let s=0;
 for(let i=0;i<j;i++)s+=H(i,seed)<.6?1:2;const g=H(j,seed)<.6?1:2;return s+g*smooth(0,1.6,(tt-first)-j*headway);};}

// people per m² of standable area within r of (x,z); width = lane width when the area is a lane (queues)
function densityAround(people,x,z,r,width=Infinity){let c=0;for(const p of people)if((p.x-x)**2+(p.z-z)**2<=r*r)c++;return (c+1)/Math.min(Math.PI*r*r,2*r*width);}
const circlesAlong=(P,r,step=6)=>{const out=[];for(let u=0;u<=P.L+1e-6;u+=step){const p=P.at(u);out.push({x:p.x,z:p.z,r});}return out;};
const eyeShot=(player,ahead=8,name='preview')=>{const h=player.heading,dx=Math.sin(h),dz=Math.cos(h);return makeShot([player.x-dx*.4,1.6,player.z-dz*.4],[player.x+dx*ahead,1.35,player.z+dz*ahead],{fov:58,name});};

// ─── states ──────────────────────────────────────────────────────────────────
const G=Object.fromEntries(JR_GATES.map(g=>[g.key,g]));
// Hachiko gate queue (JR-GATE-03: one-way passage under the tracks with a central divider; from the Hachiko side you walk
// east, U-turn at the divider end (Miyamasuzaka-shita) and come back west to the gate). Lanes / U-turn / gate follow the
// visual set (landmarks-jr.mjs divider z≈1.5, sets-variants.mjs 'gate-queue' anchors northLane z −4.5, southLane z 8.5,
// uTurn x 146, gate 85.9/18.9); the 2D solver of crowd-jr.mjs uses its own simplified strip (JR_DIVIDERS). Approximate.
export function hachikoQueuePath({north=-4.5,south=8.5,uTurn=146,gate=[85.9,18.9],entrance=60}={}){const mid=(north+south)/2,r=(south-north)/2;
 return [[entrance,north],[uTurn-r-2,north],[uTurn-r*.3,north+r*.3],[uTurn,mid],[uTurn-r*.3,south-r*.3],[uTurn-r-2,south],[gate[0]+9,south],[gate[0]+2,(south+gate[1])/2+1],[gate[0],gate[1]-2.6]];}
export const HACHIKO_QUEUE_PATH=Object.freeze(hachikoQueuePath());

const hachikoPeak={key:'hachiko-peak',label:{ja:'ハチ公改札前の列（ピーク）',en:'Hachiko gate queue (peak)'},
 assumptions:{ja:'シミュレーション（仮定）：入場整理で約40人ずつ40秒ごとに前進、列に加わる人 毎秒約1.6人、一方通行でUターン。実際の人数・規制ではありません',en:'Simulation (assumptions): metered release of ~40 people every 40 s, ~1.6 people/s join, one-way with a U-turn. Not real counts or measures.'},
 defaults:{path:HACHIKO_QUEUE_PATH,width:3.6,density:2.6,capacity:G.hachiko.capacity,period:40,releaseDur:9,lambda:1.6,fill:.92,playerAt:.58,phoneShare:.35,approach:25},
 setup(ctx={},params={}){const o={...this.defaults,...params};const P=polyline(o.path);
  // calibration from the precomputed JR run (when given): densest gate-front cell of the run → queue density
  const g=ctx.run?.summary?.gates?.find(x=>x.key==='hachiko');if(g&&params.density==null&&g.frontDensityMax>0)o.density=clamp(g.frontDensityMax*.85,2,3.4);
  const perM=o.density*o.width,lanes=Math.max(2,Math.round(o.width/.55)),n0=Math.round(P.L*o.fill*perM),B=Math.round(o.capacity*o.period);
  const served=blockServed(B,o.period,o.releaseDur,o.period*.55);
  const Q=queueModel({path:o.path,width:o.width,lanes,perM,lambda:o.lambda,n0,served,idBase:200000,exitRun:3,approach:o.approach,phoneShare:o.phoneShare,lag:.25});
  const playerK=Math.round(n0*(1-o.playerAt));
  return {o,P,Q,perM,n0,B,served,playerK,calibrated:!!g};},
 advance(h,t){const people=h.Q.frame(t),pl=people.find(p=>p.id===200000+h.playerK)||null;const others=people.filter(p=>p!==pl);
  const inQueue=people.filter(p=>p.rank>=0).length,ahead=pl?Math.max(0,Math.round(pl.rank)):0;
  const rate=h.o.capacity;const wait=ahead/rate/60;const dens=pl?densityAround(others,pl.x,pl.z,2,h.o.width):0;
  const moved60=pl?Math.max(0,pl.u-(h.Q.person(h.playerK,Math.max(0,t-60))?.u??pl.u)):0;
  return {key:this.key,t,label:'simulation',people:others,player:pl?{...pl}:null,focus:pl?{x:pl.x,z:pl.z}:{x:G.hachiko.front[0],z:G.hachiko.front[1]},regions:circlesAlong(h.P,h.o.width/2+2.5),
   hud:{label:'シミュレーション',numbers:{queue:inQueue,ahead,waitMin:wait,density:dens,movedLastMin:moved60,releasePeople:h.B,releaseEvery:h.o.period},
    items:[item('queue','改札前の列','Queue at the gate',inQueue,U.people),item('ahead','自分より前','Ahead of you',ahead,U.people),item('wait','改札まで','To the gate',Math.max(1,Math.round(wait)),U.min),item('density','まわりの混雑','Density around you',dens,U.dens,1)]},
   previewShot:pl?eyeShot(pl,9,'hachiko-peak'):null};}};

const gateNewSouth={key:'gate-newsouth',label:{ja:'新南改札・南改札へ（流れている）',en:'New South / South gate (moving)'},
 assumptions:{ja:'シミュレーション（仮定）：改札前の入場 毎秒約1.4人、列に加わる人 毎秒約1.1人。実際の人数・規制ではありません',en:'Simulation (assumptions): ~1.4 people/s admitted, ~1.1 people/s join. Not real counts.'},
 defaults:{gate:'shinminami',path:null,width:3,density:1.2,lambda:1.1,fill:.5,playerAt:.25,phoneShare:.25,approach:20},
 setup(ctx={},params={}){const o={...this.defaults,...params};const g=G[o.gate]||G.shinminami;
  const path=o.path||[[g.front[0]-34*.6,g.front[1]-34*.8],[g.front[0]-14*.6,g.front[1]-14*.8],[g.front[0],g.front[1]]];const P=polyline(path);
  const perM=o.density*o.width,lanes=Math.max(2,Math.round(o.width/.6)),n0=Math.round(P.L*o.fill*perM),cap=g.capacity;
  const served=t=>cap*t;// steady admission (no metering hold)
  const Q=queueModel({path,width:o.width,lanes,perM,lambda:o.lambda,n0,served,idBase:210000,exitRun:4,approach:o.approach,phoneShare:o.phoneShare,lag:.15});
  return {o,P,Q,perM,n0,cap,playerK:Math.round(n0*(1-o.playerAt)),gate:g};},
 advance(h,t){const people=h.Q.frame(t);let pl=people.find(p=>p.id===210000+h.playerK)||null;const others=people.filter(p=>p!==pl);
  if(!pl&&h.Q.rankOf(h.playerK,t)<0){const f=h.P.frame(h.P.L);pl={x:f.x,z:f.z,y:0,heading:Math.atan2(f.dx,f.dz),speed:0,rank:-1,done:true};}
  const inQueue=people.filter(p=>p.rank>=0).length,ahead=pl?Math.max(0,Math.round(pl.rank)):0,wait=ahead/h.cap/60,dens=pl?densityAround(others,pl.x,pl.z,2,h.o.width):0;
  return {key:this.key,t,label:'simulation',people:others,player:pl,focus:pl?{x:pl.x,z:pl.z}:{x:h.gate.front[0],z:h.gate.front[1]},regions:circlesAlong(h.P,h.o.width/2+2.5),
   hud:{label:'シミュレーション',numbers:{queue:inQueue,ahead,waitMin:wait,density:dens},
    items:[item('queue','改札前の列','Queue at the gate',inQueue,U.people),item('ahead','自分より前','Ahead of you',ahead,U.people),item('wait','改札まで','To the gate',Math.max(1,Math.round(wait)),U.min),item('density','まわりの混雑','Density around you',dens,U.dens,1)]},
   previewShot:pl?eyeShot(pl,9,'gate-newsouth'):null};}};

// Packed crowd held at a closure barrier line a→b; the crowd stands on the side `side` (+1: left of a→b).
const zoneDense={key:'zone-dense',label:{ja:'規制エリアの人混み',en:'Dense crowd at the closure'},
 assumptions:{ja:'シミュレーション（仮定）：規制線の前で人が滞留、密度は規制線ぎわ約3.5人/m²から後方へ低下、通り抜けはできない。実際の人数ではありません',en:'Simulation (assumptions): people held at the barrier line, ~3.5 p/m² at the line falling off behind it; nobody passes. Not real counts.'},
 defaults:{barrier:[[141,54],[141,70]],side:-1,depth:16,front:3.5,back:1.4,phoneShare:.3,sidle:.12,player:{depth:4.5,along:.45}},
 setup(ctx={},params={}){const o={...this.defaults,...params};const [a,b]=o.barrier,dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L,nx=-uz*o.side,nz=ux*o.side;
  // deterministic jittered placement at a density falling off with depth
  const base=[];let k=0;for(let d=.45;d<o.depth;d+=.0){const rho=o.back+(o.front-o.back)*Math.exp(-d/5),s=1/Math.sqrt(rho);for(let w=s*.5;w<L+4;w+=s){const jw=(H(k,1)-.5)*s*.8,jd=(H(k,2)-.5)*s*.6;base.push({w:w-2+jw,d:d+jd,k});k++;}d+=s;}
  return {o,a,ux,uz,nx,nz,L,base};},
 advance(h,t){const o=h.o,people=[];let pl=null;const pw=o.player.along*h.L,pd=o.player.depth;
  for(const b of h.base){const k=b.k;// slow sway, crowd pressure surges toward the barrier, a few sidling along it
   const surge=.18*Math.max(0,Math.sin(t*.35+b.w*.15))*Math.exp(-b.d/6),sid=H(k,5)<o.sidle?((H(k,6)<.5?-1:1)*.35*t):0;
   let w=b.w+sid+Math.sin(t*.3+k)*.06,d=Math.max(.4,b.d-surge+Math.cos(t*.27+k*1.3)*.05);
   if(sid){w=((w+2)%(h.L+4)+(h.L+4))%(h.L+4)-2;}
   if(Math.hypot(w-pw,d-pd)<.55)continue;// room for the player
   const x=h.a[0]+h.ux*w+h.nx*d,z=h.a[1]+h.uz*w+h.nz*d;const face=Math.atan2(-h.nx,-h.nz)+(H(k,3)-.5)*(b.d<3?.8:2.2);
   people.push({x,z,y:0,heading:sid?Math.atan2(h.ux*Math.sign(sid),h.uz*Math.sign(sid)):face,speed:sid?.35:0,id:220000+k,anim:sid?'walk':H(k,4)<o.phoneShare?'phone':'queue'});}
  pl={x:h.a[0]+h.ux*pw+h.nx*pd,z:h.a[1]+h.uz*pw+h.nz*pd,y:0,heading:Math.atan2(-h.nx,-h.nz),speed:0};
  const dl=densityAround(people,h.a[0]+h.ux*pw+h.nx*1.6,h.a[1]+h.uz*pw+h.nz*1.6,1.6),dp=densityAround(people,pl.x,pl.z,2);
  return {key:this.key,t,label:'simulation',people,player:pl,focus:{x:pl.x,z:pl.z},regions:[{x:h.a[0]+h.ux*h.L/2+h.nx*o.depth/2,z:h.a[1]+h.uz*h.L/2+h.nz*o.depth/2,r:Math.hypot(h.L,o.depth)/2+3}],
   hud:{label:'シミュレーション',numbers:{inZone:people.length,densityLine:dl,densityPlayer:dp,passed:0},
    items:[item('inZone','規制線の前','At the barrier',people.length,U.people),item('density','規制線ぎわの混雑','Density at the barrier',dl,U.dens,1),item('passed','通り抜けられた人','Got through',0,U.people)]},
   previewShot:eyeShot(pl,7,'zone-dense')};}};

// Light two-way flow on a detour street (closed loop along the path; people near the path ends are dropped).
// params.clear (default null = off, byte-identical to the variant renders) keeps a CLEAR CONE in front of the player
// (= the eye camera of 'detour' mode:'eye' / 'eye-walk', which walks ≈0.6 m behind the player on the same path):
//   {ahead=8 (m in front of the player), behind=1.5 (m behind), half=2.4 (min lateral distance from the player's line),
//    ease=3 (m over which the side-step fades in/out at both ends), minDist=1.2 (radial: nobody closer)}.
// Walkers inside the cone side-step to |lateral| ≥ half (smooth in t: the required offset is a smooth function of the
// along-distance, the walker keeps its side), so nobody walks into / through the camera: with the eye camera
// (fov 58, 9:16 → ±17° horizontal) a person at |lateral| ≥ 2.4 is out of frame closer than ≈6.5 m.
// zone-clear fix (result + stamp beats): crowd.params.clear = {ahead:8, behind:1.5, half:2.4, ease:3}.
export function clearCone(x,z,pl,o){const dx=x-pl.x,dz=z-pl.z,al=dx*pl.dx+dz*pl.dz,sd=dx*pl.nx+dz*pl.nz;
 const w=smooth(-o.behind-o.ease,-o.behind,al)*(1-smooth(o.ahead,o.ahead+o.ease,al));const need=o.half*w;
 if(Math.abs(sd)>=need)return {x,z,w,moved:0};const s=sd>=0?1:-1,ds=s*need-sd;return {x:x+pl.nx*ds,z:z+pl.nz*ds,w,moved:Math.abs(ds)};}
const CLEAR_DEFAULTS={ahead:8,behind:1.5,half:2.4,ease:3,minDist:1.2};
const detourLight={key:'detour-light',label:{ja:'迂回ルート（すいている）',en:'Detour street (light)'},
 assumptions:{ja:'シミュレーション（仮定）：迂回路の人の密度 約0.15人/m²、歩く速さ 毎秒1.1〜1.5m。実際の人数ではありません',en:'Simulation (assumptions): ~0.15 p/m² on the detour, walking 1.1–1.5 m/s. Not real counts.'},
 defaults:{path:[[150,-70],[156,-20],[160,30],[164,80],[168,130]],width:4.5,density:.15,player:{u:.35,speed:1.3},phoneShare:.15,clear:null},
 setup(ctx={},params={}){const o={...this.defaults,...params};const P=polyline(o.path);const n=Math.round(P.L*o.width*o.density);
  const walkers=Array.from({length:n},(_,k)=>({k,u0:H(k,1)*P.L,dir:H(k,2)<.5?1:-1,v:1.1+.4*H(k,3),lat:(H(k,4)-.5)*o.width}));return {o,P,walkers};},
 advance(h,t){const o=h.o,P=h.P,people=[];const pu=o.player.u*P.L+o.player.speed*t,pf=P.frame(Math.min(P.L,pu));
  const cl=o.clear?{...CLEAR_DEFAULTS,...o.clear}:null;
  for(const w of h.walkers){let u=((w.u0+w.dir*w.v*t)%P.L+P.L)%P.L;if(u<3||u>P.L-3)continue;const f=P.frame(u);const lat=w.lat+(w.dir>0?.6:-.6);
   let x=f.x+f.nx*lat,z=f.z+f.nz*lat;if(cl){const q=clearCone(x,z,pf,cl);x=q.x;z=q.z;if(Math.hypot(x-pf.x,z-pf.z)<cl.minDist)continue;}
   if(Math.hypot(x-pf.x,z-pf.z)<1.2)continue;
   people.push({x,z,y:0,heading:Math.atan2(f.dx*w.dir,f.dz*w.dir),speed:w.v,id:230000+w.k,anim:H(w.k,5)<o.phoneShare?'phone':'walk'});}
  const pl={x:pf.x,z:pf.z,y:0,heading:Math.atan2(pf.dx,pf.dz),speed:pu<P.L?o.player.speed:0};
  const dp=densityAround(people,pl.x,pl.z,6),ms=people.length?people.reduce((s,p)=>s+p.speed,0)/people.length:0;
  return {key:this.key,t,label:'simulation',people,player:pl,focus:{x:pl.x,z:pl.z},regions:circlesAlong(P,o.width/2+3,8),
   hud:{label:'シミュレーション',numbers:{density:dp,meanSpeed:ms,onStreet:people.length},
    items:[item('density','まわりの混雑','Density around you',dp,U.dens,2),item('speed','歩く速さ','Walking speed',ms,U.mps,1)]},
   previewShot:eyeShot(pl,9,'detour-light')};}};

// Platform after the last train left: a few people standing, late arrivals walk in from the stairs and stop.
const altPlatform={key:'alt-platform',label:{ja:'別の駅のホーム（終電後）',en:'Alternative station platform (train gone)'},
 assumptions:{ja:'シミュレーション（仮定）：ホームに残った人と、遅れて着いた人の動き。実際の人数ではありません',en:'Simulation (assumptions): people left on the platform and late arrivals. Not real counts.'},
 defaults:{platform:{x:209.8,y:1.1,z:-1211.2,dir:[0,1],length:110,width:8,stairs:.45,edge:1},standing:14,late:5,lateEvery:2.2,phoneShare:.5},
 setup(ctx={},params={}){const o={...this.defaults,...params};const pf={...this.defaults.platform,...(params.platform||{})};const l=Math.hypot(...pf.dir)||1,ax=pf.dir[0]/l,az=pf.dir[1]/l,nx=-az,nz=ax;
  const at=(s,w)=>({x:pf.x+ax*s+nx*w,z:pf.z+az*s+nz*w});return {o,pf,ax,az,nx,nz,at};},
 advance(h,t){const {o,pf,at}=h,people=[];const half=pf.length/2,hw=pf.width/2;
  for(let k=0;k<o.standing;k++){const s=(H(k,1)-.5)*pf.length*.9,w=(H(k,2)-.5)*pf.width*.6,q=at(s,w);const face=Math.atan2(h.nx*pf.edge,h.nz*pf.edge)+(H(k,3)-.5)*1.4;
   people.push({x:q.x,z:q.z,y:pf.y,heading:face,speed:0,id:240000+k,anim:H(k,4)<o.phoneShare?'phone':'idle',role:'standing'});}
  const s0=(pf.stairs-.5)*pf.length;
  for(let k=0;k<o.late;k++){const t0=k*o.lateEvery,dt=t-t0;if(dt<0)continue;const goal=(H(k,7)-.5)*24,dist=Math.abs(goal)+3,v=1.45,d=Math.min(dist,dt*v);
   const sNow=s0+Math.sign(goal||1)*Math.max(0,d-3),wNow=(H(k,8)-.5)*2+clamp(d/3)*(hw-1.6)*pf.edge;const q=at(sNow,wNow);const moving=d<dist;
   people.push({x:q.x,z:q.z,y:pf.y,heading:moving?(d<3?Math.atan2(h.nx*pf.edge,h.nz*pf.edge):Math.atan2(h.ax*Math.sign(goal||1),h.az*Math.sign(goal||1))):Math.atan2(h.nx*pf.edge,h.nz*pf.edge),speed:moving?v:0,id:240500+k,anim:moving?'walk':'idle',role:'late'});}
  const pq=at(s0-2,pf.edge*(hw-2.2)),pl={x:pq.x,z:pq.z,y:pf.y,heading:Math.atan2(h.nx*pf.edge,h.nz*pf.edge),speed:0};
  return {key:this.key,t,label:'simulation',people,player:pl,focus:{x:pf.x,z:pf.z},regions:[],
   hud:{label:'シミュレーション',numbers:{onPlatform:people.length+1,late:people.filter(p=>p.role==='late').length},
    items:[item('onPlatform','ホームにいる人','On the platform',people.length+1,U.people),item('late','間に合わなかった人','Missed it',people.filter(p=>p.role==='late').length+1,U.people)]},
   previewShot:makeShot([pq.x-h.ax*3,pf.y+1.6,pq.z-h.az*3],[pq.x+h.ax*8,pf.y+1.2,pq.z+h.az*8],{fov:58,name:'alt-platform'})};}};

// Taxi stand: a line along the curb from the stand point (dir = direction the line extends, away from the stand).
function taxiState({key,label,assumptions,defaults,idBase,moving}){return {key,label,assumptions,defaults,
 setup(ctx={},params={}){const o={...defaults,...params};const l=Math.hypot(...o.dir)||1,dx=o.dir[0]/l,dz=o.dir[1]/l;
  const path=[[o.stand[0]+dx*o.length,o.stand[1]+dz*o.length],[o.stand[0],o.stand[1]]];const perM=1/o.spacing;
  const served=moving?taxiServed({headway:o.headway,seed:idBase%97,first:o.firstTaxi}):()=>0;
  const Q=queueModel({path,width:.5,lanes:1,perM,lambda:o.lambda,n0:o.n0,served,idBase,exitRun:2.5,approach:o.approach,phoneShare:o.phoneShare,lag:.45,walk:1.2});
  return {o,Q,P:Q.P,served,playerK:o.n0+o.playerJoin};},
 advance(h,t){const people=h.Q.frame(t).map(p=>({...p,heading:p.speed<.2?p.heading+(H(p.id,9)<.4?-1.2*h.o.roadSide:0):p.heading}));const pl=people.find(p=>p.id===idBase+h.playerK)||null,others=people.filter(p=>p!==pl);
  const line=people.filter(p=>p.rank>=0).length,taxis=moving?Math.floor(countTaxis(h,t)):0,ahead=pl?Math.max(0,Math.round(pl.rank)):Math.max(0,line);
  const wait=moving?ahead*h.o.headway/1.4/60:(h.o.waitedMin+t/60);
  return {key,t,label:'simulation',people:others,player:pl,focus:{x:h.o.stand[0],z:h.o.stand[1]},regions:circlesAlong(h.P,2.5,4),
   hud:{label:'シミュレーション',numbers:{line,taxis,ahead,waitMin:wait},
    items:[item('line','タクシー待ちの列','Taxi line',line,U.people),item('taxis','来たタクシー','Taxis so far',taxis,U.cars),moving?item('wait','乗れるまで','Until your turn',Math.max(1,Math.round(wait)),U.min):item('waited','待っている時間','Waiting for',Math.round(wait),U.min)]},
   previewShot:pl?eyeShot({...pl,heading:Math.atan2(h.o.stand[0]-pl.x,h.o.stand[1]-pl.z)},7,key):makeShot([h.o.stand[0]+3,1.6,h.o.stand[1]+3],[h.o.stand[0],1.2,h.o.stand[1]],{fov:58})};}};}
function countTaxis(h,t){const o=h.o;if(!(o.headway>0))return 0;const tt=t-o.firstTaxi;return tt<0?0:Math.floor(tt/o.headway)+1;}
// West exit stand (suspended on the night: TAXI facts in sources-series.mjs; the set piece is generic). Default position
// is a placeholder near the West exit bus/taxi pool — pass params.stand/dir from series/sets-variants.mjs.
const taxiWest=taxiState({key:'taxi-west',label:{ja:'西口タクシー乗り場（休止中）',en:'West exit taxi stand (suspended)'},idBase:250000,moving:false,
 assumptions:{ja:'シミュレーション（仮定）：休止中の乗り場に並んだ列。タクシーは来ない。実際の人数ではありません',en:'Simulation (assumptions): a line at a suspended stand; no taxi comes. Not real counts.'},
 defaults:{stand:[35.5,152.6],dir:[-1,0],length:30,spacing:.85,n0:24,lambda:.06,playerJoin:-7,phoneShare:.55,approach:12,roadSide:1,waitedMin:18,headway:0,firstTaxi:0}});
const taxiSakura=taxiState({key:'taxi-sakura',label:{ja:'渋谷SAKURAテラス前タクシー乗り場',en:'Shibuya Sakura Terrace taxi stand'},idBase:260000,moving:true,
 assumptions:{ja:'シミュレーション（仮定）：タクシー 約35秒ごとに1台、1台に1〜2人。実際の台数・人数ではありません',en:'Simulation (assumptions): a taxi every ~35 s, 1–2 people each. Not real counts.'},
 defaults:{stand:[112.1,311.9],dir:[-.35,-1],length:26,spacing:.95,n0:12,lambda:.035,playerJoin:-3,phoneShare:.4,approach:10,roadSide:1,headway:35,firstTaxi:4}});

// 'caught-press' (combined episodes, beat `caught`, shot 'caught-pov'): ORDINARY people close in around the stopped
// player (= the POV camera) and pack — neutral poses only (idle / queue shuffle / phone, arms down, never reaching),
// mostly BACKS or SIDES to the camera: people ahead face the camera's heading (backs), people beside face forward or
// turn away from the camera, nobody faces it (|facing·toCamera| ≤ .2). The fictional game zombies are VFX only
// (vfx-caught.mjs); the crowd is never the attacker. Closed form in t (ring radius eased over closeIn).
// params: {at:[x,z] (the POV camera ground point; default: params.pov {x,z,y,heading} (app-variant, caught-pov anchor),
//          else the base state's player at base t0, else the zone-dense default player), heading (rad, camera yaw, atan2(dx,dz) convention; default: base player heading),
//          y (ground), base:{key, params?, t0=0} (keep that state's people around — e.g. the over-result crowd —
//          minus those within clearBase m, at time base.t0 + t), n=26, inner=8 (people on the inner ring), front=7 (extra backs ahead, 1.5–3.4 m),
//          rFrom:[1.7,3.6] / rTo:[.7,1.5] (start / packed ring radii, m), closeIn:[0,1.8] (s; match the shot's
//          press ramp), frontMin=1.3 (m: nobody closer straight ahead — the frame is not one back, the caught-pov push is ≈.6 m), frontCone=.5 (rad),
//          clearBase=3.4, phoneShare=.15, seed=0 (per pair: other people / jitter in the ring; ids 270000 + seed·64 + k)}
// Pair params (camera at the caught-pov base pose): pass at/heading = the camera's x,z / yaw (pressFromShot(shot)).
export const pressFromShot=shot=>{const p=shot.pos,l=shot.look;return {at:[+p.x.toFixed(2),+p.z.toFixed(2)],heading:+Math.atan2(l.x-p.x,l.z-p.z).toFixed(4)};};
const caughtPress={key:'caught-press',label:{ja:'人混みに囲まれて止まる',en:'Pressed in by the crowd'},
 assumptions:{ja:'シミュレーション（演出）：立ち止まった人のまわりに人が詰まってくる様子。実際の人数ではありません',en:'Simulation (staging): people pack in around someone who stopped. Not real counts.'},
 defaults:{at:null,heading:null,y:0,base:null,n:26,inner:8,front:7,rFrom:[1.7,3.6],rTo:[.7,1.5],closeIn:[0,1.8],frontMin:1.3,frontCone:.5,clearBase:3.4,phoneShare:.15,seed:0},
 setup(ctx={},params={}){const o={...this.defaults,...params};let base=null,bp=null;
  if(o.base?.key){const bk=resolveCrowdState(o.base.key);if(bk&&bk!=='caught-press'){const def=CROWD_STATES[bk];
   const bpar={...(o._anchors&&bk!=='taxi-west'?paramsFromSets(bk,o._anchors):{}),...(o.base.params||{})};base={def,h:def.setup(ctx,bpar),t0:o.base.t0??0};bp=def.advance(base.h,base.t0).player;}}
  const pv=o.pov&&Number.isFinite(o.pov.x)?o.pov:null;// app-variant: params.pov = the caught-pov frozen player spot {x,z,y,heading}
  if(!bp&&!o.at&&!pv){const zd=CROWD_STATES['zone-dense'];bp=zd.advance(zd.setup({},{}),0).player;}
  const at=o.at||(pv?[pv.x,pv.z]:[bp.x,bp.z]),heading=o.heading??pv?.heading??bp?.heading??0,y=o.y||pv?.y||bp?.y||0;
  const K=k=>k+(o.seed|0)*64;// seed → other hash slots + people ids (other faces / clothes / ring jitter per pair)
  const slots=[];for(let k=0;k<o.n;k++){const inner=k<o.inner,m=inner?o.inner:o.n-o.inner,j=inner?k:k-o.inner;
   const rel=(j+.5)/m*2*Math.PI+(H(K(k),11)-.5)*(2*Math.PI/m)*.5+(inner?0:Math.PI/m);// angle from straight ahead
   const a=((rel+Math.PI)%(2*Math.PI))-Math.PI;
   let r1=inner?o.rTo[0]+(o.rTo[1]-o.rTo[0])*.25*H(K(k),12):o.rTo[0]+(o.rTo[1]-o.rTo[0])*(.55+.45*H(K(k),12));
   if(Math.abs(a)<o.frontCone)r1=Math.max(r1,o.frontMin+(inner?0:.55));
   const r0=o.rFrom[0]+(o.rFrom[1]-o.rFrom[0])*H(K(k),13)+(inner?0:.6);slots.push({k:K(k),a,r0,r1,delay:H(K(k),14)*.35});}
  // front cluster: backs filling the view ahead (staggered rows 1.5–3.4 m, inside ±frontCone·1.3)
  for(let j=0;j<o.front;j++){const k=K(o.n+j),a=((j+.5)/o.front-.5)*2*o.frontCone*1.3+(H(k,11)-.5)*.12,r1=o.frontMin+.25+(j%2)*.75+H(k,12)*.5;
   slots.push({k,a,r0:r1+1.4+H(k,13)*1.2,r1,delay:H(k,14)*.35});}
  return {o,at,heading,y,base,slots};},
 advance(h,t){const o=h.o,[ax,az]=h.at,hd=h.heading,fx=Math.sin(hd),fz=Math.cos(hd);const people=[];
  const pos=(s,tt)=>{const p=smooth(o.closeIn[0]+s.delay,o.closeIn[1]+s.delay,tt);const r=s.r0+(s.r1-s.r0)*p+Math.sin(tt*.8+s.k)*.03;const a=s.a+Math.sin(tt*.35+s.k*1.7)*.04;
   const lx=Math.sin(a)*r,lz=Math.cos(a)*r;// local: z ahead, x right
   return {x:ax+fz*lx+fx*lz,z:az-fx*lx+fz*lz,p};};
  for(const s of h.slots){const q=pos(s,t),q0=pos(s,t-.2);const speed=Math.hypot(q.x-q0.x,q.z-q0.z)/.2;
   // facing: ahead → camera heading (backs); beside → forward, turned AWAY from the camera; behind → camera heading
   const side=Math.sign(Math.sin(s.a))||1,abs=Math.abs(s.a);let face=hd+(H(s.k,15)-.5)*.6;
   if(abs>1.0&&abs<2.4)face=hd+side*(.25+.9*H(s.k,16));
   const tx=ax-q.x,tz=az-q.z,tl=Math.hypot(tx,tz)||1;if((Math.sin(face)*tx+Math.cos(face)*tz)/tl>.2)face=hd;
   people.push({x:q.x,z:q.z,y:h.y,heading:face,speed,id:270000+s.k,anim:speed>.25?'queue':H(s.k,17)<o.phoneShare?'phone':'idle',role:'press'});}
  let regions=[{x:ax,z:az,r:Math.max(...o.rFrom)+1.5}],baseN=0;
  if(h.base){const bf=h.base.def.advance(h.base.h,h.base.t0+t);for(const p of bf.people){if(Math.hypot(p.x-ax,p.z-az)<o.clearBase)continue;people.push(p);baseN++;}regions=regions.concat(bf.regions||[]);}
  const around=people.filter(p=>Math.hypot(p.x-ax,p.z-az)<2).length,dens=densityAround(people,ax,az,1.5);
  const pl={x:ax,z:az,y:h.y,heading:hd,speed:0};
  return {key:this.key,t,label:'simulation',people,player:pl,focus:{x:ax,z:az},regions,
   hud:{label:'シミュレーション',numbers:{around,density:dens,base:baseN,press:smooth(o.closeIn[0],o.closeIn[1],t)},
    items:[item('around','まわりの人','People around you',around,U.people),item('density','まわりの混雑','Density around you',dens,U.dens,1)]},
   previewShot:eyeShot(pl,6,'caught-press')};}};

// Params from series/sets-variants.mjs anchors (S.anchors, flat {'<piece>.<name>':{x,y,z}}): place each state on its set.
export function paramsFromSets(key,A){if(!A)return {};const g=n=>A[n];const k=resolveCrowdState(key);
 if(k==='hachiko-peak'&&g('gate-queue.northLane')){const n=g('gate-queue.northLane'),so=g('gate-queue.southLane'),u=g('gate-queue.uTurn'),gt=g('gate-queue.gate');return {path:hachikoQueuePath({north:n.z,south:so.z,uTurn:u.x,gate:[gt.x,gt.z]})};}
 if(k==='caught-press')return {_anchors:A};// resolved in setup for params.base.key
 if((k==='taxi-west'||k==='taxi-sakura')&&g(k+'.queueHead')){const h=g(k+'.queueHead'),d=g(k+'.queueDir');return {stand:[h.x,h.z],dir:[d.x,d.z]};}
 if(k==='zone-dense'&&g('closure.a')){const a=g('closure.a'),b=g('closure.b'),nm=g('closure.normal'),ux=b.x-a.x,uz=b.z-a.z;return {barrier:[[a.x,a.z],[b.x,b.z]],side:Math.sign(-uz*nm.x+ux*nm.z)||1};}
 if(k==='alt-platform'&&g('alt-platform.center')){const c=g('alt-platform.center'),e=g('alt-platform.edge'),d=g('alt-platform.dir'),nx=-d.z,nz=d.x,side=Math.sign((e.x-c.x)*nx+(e.z-c.z)*nz)||1,hw=Math.hypot(e.x-c.x,e.z-c.z);
  return {platform:{x:c.x,y:c.y??e.y??0,z:c.z,dir:[d.x,d.z],length:110,width:2*hw,edge:side,stairs:.45}};}
 return {};}
export const CROWD_STATES=Object.freeze({'hachiko-peak':hachikoPeak,'gate-newsouth':gateNewSouth,'zone-dense':zoneDense,'detour-light':detourLight,'alt-platform':altPlatform,'taxi-west':taxiWest,'taxi-sakura':taxiSakura,'caught-press':caughtPress});
export const CROWD_STATE_ALIASES=Object.freeze({'hachiko-queue':'hachiko-peak','gate-queue':'hachiko-peak','newsouth':'gate-newsouth','gate-clear':'gate-newsouth','zone':'zone-dense','zone-edge':'zone-dense','closure':'zone-dense','detour':'detour-light','platform':'alt-platform','taxi-suspended':'taxi-west','taxi-moving':'taxi-sakura','caught':'caught-press','press':'caught-press'});
export const resolveCrowdState=key=>CROWD_STATES[key]?key:CROWD_STATE_ALIASES[key]||null;
// Convenience: setup + advance in one (stateless callers; setup is cached per params JSON).
const setupCache=new Map();
export function crowdFrame(key,t,{params={},ctx={}}={}){const k=resolveCrowdState(key);if(!k)throw Error(`crowd-variants: unknown crowd state ${key}`);
 const ck=k+JSON.stringify(params)+(ctx.run?'+run':'');let h=setupCache.get(ck);if(!h){h=CROWD_STATES[k].setup(ctx,params);setupCache.set(ck,h);}return CROWD_STATES[k].advance(h,t);}

// Hide costume.mjs crowd agents inside regions [{x,z,r}] (after crowd.update, before culling). Returns hidden count.
export function maskCrowdRegions(crowd,regions){if(!regions?.length)return 0;const d=crowd.data;let c=0;
 for(let i=0;i<crowd.n;i++){const x=d[4*i];if(x<-5000)continue;const z=d[4*i+1];for(const r of regions)if((x-r.x)**2+(z-r.z)**2<r.r*r.r){d[4*i]=-9999;d[4*i+1]=-9999;c++;break;}}
 if(c&&crowd.gather)crowd.gather();return c;}

// Renderer for one state: every person with people-close.mjs (detailed LOD within lod0Dist, light LOD beyond), so
// colours stay tied to the person id at any distance. includePlayer adds the player figure (third-person shots).
export class CrowdStateView{
 constructor(scene,{state,params={},anchors=null,ctx={},near=null,radius=Infinity,capacity=1600,includePlayer=false}={}){this.key=resolveCrowdState(state);if(!this.key)throw Error(`crowd-variants: unknown crowd state ${state}`);
  this.def=CROWD_STATES[this.key];this.h=this.def.setup(ctx,{...paramsFromSets(this.key,anchors),...params});this.radius=radius;this.includePlayer=includePlayer;
  this.near=near||new NearPeople(scene,{capacity,lod0:120});this.ownNear=!near;this._vis=true;this.frame=null;}
 set visible(v){this._vis=v;if(this.ownNear)this.near.visible=v;}
 get visible(){return this._vis;}
 update(t,camera,{animTime=t}={}){const fr=this.def.advance(this.h,t);this.frame=fr;
  let list=this.includePlayer&&fr.player?[...fr.people,{...fr.player,id:199999,anim:fr.player.speed>.3?'walk':'idle'}]:fr.people;
  if(isFinite(this.radius)){const c=camera.position,r2=this.radius*this.radius;list=list.filter(p=>(p.x-c.x)**2+(p.z-c.z)**2<=r2);}
  this.near.set(list,{animTime,camera});return fr;}
 maskCrowd(crowd){return maskCrowdRegions(crowd,this.frame?.regions);}
 dispose(){if(this.ownNear)this.near.dispose();}
}
