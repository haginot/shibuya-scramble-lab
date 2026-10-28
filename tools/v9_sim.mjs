#!/usr/bin/env node
// JR v9: the CRUSH scenario for the eye-level crush POV beat (logs/ssl-claude-halloween/v9/STEERING-crush-pov.md).
// The v8 solver (crowd-jr.mjs on halloween.mjs) caps every 1 m² cell at 4 people (HALLOWEEN.occupancy), so the v8 meters
// can never read above 4.0. Instead of faking a number, this runs a documented scenario with that cap LIFTED:
//   crush = the v8 `retry` crowd (the crowd of the failing time slot: 390 s warm-up, Hachiko metering 0.45 people/s,
//           3.2 people/s bound for JR, the same 8 routes × 24 walkers), with
//           • the hard occupancy limit raised from 4 to V9_CRUSH.occupancy people per m² (a subclass passes it to
//             halloween.mjs move(); the solver sources are not changed), and
//           • the queue spacing (queueStop: people per m² ahead at which a queuing walker stops) raised from 3 to
//             V9_CRUSH.queueStop, i.e. people keep pushing into the queue instead of keeping a gap.
// Everything else (social force, signal, metering, routes, seeds) is identical. Deterministic and cached (key = hash of
// the solver sources + this file + the scenario).
// Output: web3d/shibuya/series/variants/jr/v9/sim/crush.json (committed): per route the walker records + numbers, the
//   tracked median walker's meter rows (densest 3 m cell within 6 m — the same rule as the v8 simmeter), and per pair
//   `worst` = per route the walker who meets the densest cell, with its meter rows, and per pair `pov` = the GAME OVER
//   route's worst-walker peak on that meter (value, sim time, position): the number the crush POV beat shows.
// usage: node tools/v9_sim.mjs crush [--force]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {JRCrowdSimulation,configureJR} from '../web3d/shibuya/series/crowd-jr.mjs';
import * as V8 from '../web3d/shibuya/series/sim-v8.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'web3d/shibuya/series/variants/jr/v9/sim');
export const V9_CRUSH=Object.freeze({base:'retry',occupancy:8,queueStop:6,trackReach:6,
 label:'シミュレーション（圧死シナリオ：1m²あたりの上限4人→8人に緩和）',
 ja:'圧死シナリオ（仮定）：再計算と同じ人出・時間帯で、モデルの上限（1m²に4人）を8人に緩和し、行列の間隔も詰めた場合',
 en:'Crush scenario (assumption): the same crowd and time slot as the re-run, with the model limit of 4 people/m² lifted to 8 and queue spacing closed up.'});
const args=process.argv.slice(2),force=args.includes('--force');
if(args[0]!=='crush'){console.error('usage: node tools/v9_sim.mjs crush [--force]');process.exit(2);}
const load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,`web3d/data/shibuya_${n}.json`),'utf8'));
const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100;

class CrushSimulation extends JRCrowdSimulation{
 move(i,x,z,dx,dz,d,speed,standing,moving,mayCross,hurry,ocap,pass){return super.move(i,x,z,dx,dz,d,speed,standing,moving,mayCross,hurry,ocap??V9_CRUSH.occupancy,pass);}}

const config=load('config');configureJR(config,{...V8.scenarioJR(V9_CRUSH.base),queueStop:V9_CRUSH.queueStop});
const h=createHash('sha256');
for(const f of ['web3d/shibuya/series/crowd-jr.mjs','web3d/shibuya/halloween.mjs','web3d/shibuya/simulation.mjs','web3d/shibuya/series/sim-v8.mjs','web3d/data/shibuya_config.json','web3d/data/shibuya_osm.json','tools/v9_sim.mjs'])h.update(fs.readFileSync(path.join(ROOT,f)));
h.update(JSON.stringify({agents:config.agents,jr:config.jr,crush:V9_CRUSH}));const key=h.digest('hex').slice(0,16);
const sumF=path.join(OUT,'crush.json');
if(!force&&fs.existsSync(sumF)){try{if(JSON.parse(fs.readFileSync(sumF,'utf8')).key===key){console.log(`v9 sim crush: cached (${key})`);process.exit(0);}}catch{}}
const t0=Date.now();
const sim=new CrushSimulation(config,load('osm'),load('plateau'),load('traffic'));
const G=sim.gridSpec,frames=[];let lastLog=0;
const routes=sim.e.routes,ids=sim.routeList.map(b=>b.ids);
const area=G.area,cellAt=(x,z)=>{const a=Math.floor((x-G.x0)/G.cell),b=Math.floor((z-G.z0)/G.cell);return a<0||b<0||a>=G.w||b>=G.h?-1:b*G.w+a;};
const near=(g,x,z,R)=>{let mx=0,at=null;for(let dz=-R;dz<=R;dz+=G.cell)for(let dx=-R;dx<=R;dx+=G.cell){if(dx*dx+dz*dz>R*R)continue;const c=cellAt(x+dx,z+dz);if(c<0||area[c]<4)continue;const v=g[c]/area[c];if(v>mx){mx=v;at=c;}}return [mx,at];};
let globalPeak={rho:0,t:null,x:null,z:null};
sim.runJR({onKeyframe:k=>{const g=k.grid;
 for(let c=0;c<g.length;c++){if(area[c]<4||!g[c])continue;const v=g[c]/area[c];if(v>globalPeak.rho)globalPeak={rho:r2(v),t:k.t,x:r1(G.x0+(c%G.w+.5)*G.cell),z:r1(G.z0+(Math.floor(c/G.w)+.5)*G.cell)};}
 frames.push({t:k.t,grid:Uint8Array.from(g),wx:Array.from(k.walkers.x),wz:Array.from(k.walkers.z)});
 if(Date.now()-lastLog>20000){lastLog=Date.now();console.log(`  crush t=${k.t} s (${((Date.now()-t0)/1000)|0} s)`);}}});
const walk=routes.map((R,r)=>ids[r].map(i=>({born:r1(sim.jBorn[i]-sim.eStart),done:Number.isNaN(sim.jDone[i])?null:r1(sim.jDone[i]-sim.eStart),dense:r1(sim.jDense[i]),max:r2(sim.jMax[i])})));
const numbers={},track={};
routes.forEach((R,r)=>{const n=V8.routeNumbers(walk[r]);numbers[R.key]={...n,time:n.time==null?null:r1(n.time),dense:r1(n.dense??0),peak:r2(n.peak??0)};
 const W=walk[r];const order=W.map((w,j)=>[w.done==null?Infinity:w.done-w.born,j]).sort((a,b)=>a[0]-b[0]);const j=order[Math.floor((order.length-1)/2)][1];
 const off=ids.slice(0,r).reduce((s,l)=>s+l.length,0)+j;const rows=[];
 for(const f of frames){if(f.t<W[j].born-1e-6||(W[j].done!=null&&f.t>W[j].done+1e-6))continue;const x=f.wx[off],z=f.wz[off];if(Math.abs(x)>5000)continue;
  const [rho]=near(f.grid,x,z,V9_CRUSH.trackReach);rows.push([f.t,r2(rho),r1(x),r1(z)]);}
 track[R.key]={walker:j,born:W[j].born,done:W[j].done,rows};});
// worst case per route: the walker of the route who meets the densest cell (same 6 m meter rule) — the crush POV is that
// walker's view; its meter rows run from its start to that moment, so the last value shown is the scenario's peak there.
const worst={};routes.forEach((R,r)=>{const W=walk[r];let bestJ=0,bestV=-1;const all=[];
 for(let j=0;j<W.length;j++){const off=ids.slice(0,r).reduce((s,l)=>s+l.length,0)+j;const rows=[];
  for(const f of frames){if(f.t<W[j].born-1e-6||(W[j].done!=null&&f.t>W[j].done+1e-6))continue;const x=f.wx[off],z=f.wz[off];if(Math.abs(x)>5000)continue;
   const [rho]=near(f.grid,x,z,V9_CRUSH.trackReach);rows.push([f.t,r2(rho),r1(x),r1(z)]);}
  all.push(rows);const m=Math.max(0,...rows.map(q=>q[1]));if(m>bestV+1e-9){bestV=m;bestJ=j;}}
 worst[R.key]={walker:bestJ,born:W[bestJ].born,done:W[bestJ].done,rows:all[bestJ]};});
const pov={};for(const [pair,P] of Object.entries(V8.V8_PAIRS)){const T=worst[P.over];let best=null;for(const row of T.rows)if(!best||row[1]>best[1]+1e-9)best=row;
 pov[pair]={route:P.over,walker:T.walker,peak:best?best[1]:0,simT:best?best[0]:null,at:best?[best[2],best[3]]:null,medianWalkerPeak:Math.max(0,...track[P.over].rows.map(q=>q[1])),
  rule:'densest 3 m cell within 6 m of the walker (the simmeter rule), worst walker of the route'};}
const out={key,scenario:'crush',label:V9_CRUSH.label,assumptions:{ja:V9_CRUSH.ja,en:V9_CRUSH.en},crush:V9_CRUSH,agents:config.agents,
 jr:{...config.jr,routeDefs:undefined},grid:{x0:G.x0,z0:G.z0,cell:G.cell,w:G.w,h:G.h},keyframes:frames.length,ms:Date.now()-t0,
 numbers,walkers:Object.fromEntries(routes.map((R,r)=>[R.key,walk[r]])),track,worst,pov,globalPeak};
fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(sumF,JSON.stringify(out,null,1)+'\n');
console.log(`v9 sim crush ${key}: ${frames.length} keyframes in ${((Date.now()-t0)/1000)|0} s; global peak ${globalPeak.rho} p/m² at t=${globalPeak.t}`);
for(const [pair,p] of Object.entries(pov))console.log(`  ${pair}: ${p.route} walker ${p.walker} peak ${p.peak} p/m² at t=${p.simT} [${p.at}] (median walker ${p.medianWalkerPeak})`);
