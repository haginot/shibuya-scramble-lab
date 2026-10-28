#!/usr/bin/env node
// JR v8: run the crowd solver for the sim segment (web3d/shibuya/series/sim-v8.mjs: route set, scenarios, scoring rule).
// Deterministic (same sources + scenario → same numbers) and cached: the run is skipped when the summary's `key` (hash of
// the solver sources, the route set and the scenario) is unchanged.
// Outputs:
//   web3d/shibuya/series/variants/jr/v8/sim/<scenario>.json  summary (committed): per route the walker records and
//     numbers (time, dense seconds, peak density, off-sim OSM leg), per pair the scored rows + pick, the gates, the
//     assumptions; plus `track` (per route, the median walker's density / position / ETA per keyframe second) for the
//     plate meters (simmeter) — every number the video shows comes from here.
//   $V8_SIM_CACHE/<scenario>-frames.json (default logs/…/v8/sim-cache; not committed): per keyframe second the 3 m count
//     grid (base64 uint8), every route walker (route index, x, z) and a 1/12 sample of the crowd (x, z) — the heat map and
//     the dots of the CG sim beats. Also copied to web3d/shibuya/series/variants/jr/v8/sim/cache/ (git-ignored) so the page
//     can fetch it.
// v9: the crowd sample also carries the agent ids (crowd.id) so the map dots keep their costume colour (costumes-v9.mjs).
// usage: node tools/v8_sim.mjs plan|retry|all [--force] [--agents N]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {JRCrowdSimulation,configureJR,HIDDEN} from '../web3d/shibuya/series/crowd-jr.mjs';
import * as V8 from '../web3d/shibuya/series/sim-v8.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'web3d/shibuya/series/variants/jr/v8/sim');
const CACHE=process.env.V8_SIM_CACHE||'/workspace/projects/logs/ssl-claude-halloween/v8/sim-cache';
const args=process.argv.slice(2),force=args.includes('--force'),ai=args.indexOf('--agents');
const which=args[0]==='all'?Object.keys(V8.V8_SCENARIOS):[args[0]];
if(!which[0]||!V8.V8_SCENARIOS[which[0]]){console.error('usage: node tools/v8_sim.mjs plan|retry|all [--force] [--agents N]');process.exit(2);}
const load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,`web3d/data/shibuya_${n}.json`),'utf8'));
const WIDE=JSON.parse(fs.readFileSync(path.join(ROOT,'web3d/data/series_wide_osm.json'),'utf8'));
// ZONE-D-H-HARA (OSRM foot, 1350 m) lives in the zone config routes (copy-variants.mjs ZONE_SHORTEST), not in the wide extract
const ZONE_CFG=JSON.parse(fs.readFileSync(path.join(ROOT,'web3d/shibuya/series/variants/jr/v7/zone.json'),'utf8'));
const osmRoute=id=>WIDE.routes[id]??{...ZONE_CFG.routes[id],distance_m:1350};
const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100;

function runScenario(name){
 const config=load('config');configureJR(config,V8.scenarioJR(name));if(ai>=0)config.agents=Number(args[ai+1]);
 const h=createHash('sha256');
 for(const f of ['web3d/shibuya/series/crowd-jr.mjs','web3d/shibuya/halloween.mjs','web3d/shibuya/simulation.mjs','web3d/shibuya/series/sim-v8.mjs','web3d/data/shibuya_config.json','web3d/data/shibuya_osm.json','tools/v8_sim.mjs'])h.update(fs.readFileSync(path.join(ROOT,f)));
 h.update(JSON.stringify({agents:config.agents,jr:config.jr}));const key=h.digest('hex').slice(0,16);
 const sumF=path.join(OUT,`${name}.json`),frF=path.join(CACHE,`${name}-frames.json`);
 if(!force&&fs.existsSync(sumF)&&fs.existsSync(frF)){try{if(JSON.parse(fs.readFileSync(sumF,'utf8')).key===key){console.log(`v8 sim ${name}: cached (${key})`);publish(name);return;}}catch{}}
 const t0=Date.now();
 const sim=new JRCrowdSimulation(config,load('osm'),load('plateau'),load('traffic'));
 const G=sim.gridSpec,frames=[];let lastLog=0;
 const routes=sim.e.routes,ids=sim.routeList.map(b=>b.ids);
 const onKeyframe=k=>{// k: crowd-jr capture() (stats + grid + walkers); add the crowd sample
  const bx=[],bz=[],bi=[];for(let i=0;i<sim.baseN;i+=12){const x=sim.x[i],z=sim.z[i];if(x===HIDDEN||x<G.x0||z<G.z0||x>G.x0+G.w*G.cell||z>G.z0+G.h*G.cell)continue;bx.push(Math.round(x*2));bz.push(Math.round(z*2));bi.push(i);}
  frames.push({t:k.t,grid:Buffer.from(k.grid.buffer,k.grid.byteOffset,k.grid.byteLength).toString('base64'),
   walkers:{route:Array.from(k.walkers.route),x:Array.from(k.walkers.x,r1),z:Array.from(k.walkers.z,r1)},crowd:{x2:bx,z2:bz,id:bi},
   routes:k.routes.map(r=>({key:r.key,walking:r.walking,queued:r.queued,done:r.done,medianTime:r.medianTime})),gates:k.gates.map(g=>({key:g.key,queue:g.queue,frontDensity:r2(g.frontDensity),perMin:g.perMin}))});
  if(Date.now()-lastLog>20000){lastLog=Date.now();console.log(`  ${name} t=${k.t} s (${((Date.now()-t0)/1000)|0} s)`);}};
 const summary=sim.runJR({onKeyframe});
 // per-walker records
 const walk=routes.map((R,r)=>ids[r].map(i=>({born:r1(sim.jBorn[i]-sim.eStart),done:Number.isNaN(sim.jDone[i])?null:r1(sim.jDone[i]-sim.eStart),reach:Number.isNaN(sim.jReach[i])?null:r1(sim.jReach[i]-sim.eStart),dense:r1(sim.jDense[i]),max:r2(sim.jMax[i])})));
 const numbers={};
 routes.forEach((R,r)=>{const n=V8.routeNumbers(walk[r]);const def=V8.V8_ROUTES.find(d=>d.key===R.key);let offsim=null;
  if(def.osm){const W=osmRoute(def.osm);const pts=Array.isArray(W.points[0])?W.points:W.points.reduce((a,v,i)=>(i%2?a[a.length-1].push(v):a.push([v]),a),[]);
   const rem=V8.osmRemainder(pts,[R.zone.x,R.zone.z]);offsim={id:def.osm,metres:rem.metres,seconds:Math.round(rem.metres/V8.V8_RULE.osmSpeed*60),gap:rem.gap,osmTotal:W.distance_m,label:'OSMから概算'};}
  numbers[R.key]={...n,time:n.time==null?null:r1(n.time),dense:r1(n.dense??0),peak:r2(n.peak??0),length:Math.round(R.length),freeFlow:Math.round(R.freeFlow),offsim};});
 // tracked walker per route: the walker whose time is the route median (ties → lowest rank) → per keyframe the densest
 // 3 m cell within 6 m of it (count / standable m², the solver's density cells) and its position; ETA = its finish time − t
 // densest 3 m cell (≥ 4 m² standable) within TRACK_REACH m of the walker — the v4 DANGER meter rule (crowd-jr densityNear)
 const TRACK_REACH=6,near=(g,x,z,R)=>{let mx=0;for(let dz=-R;dz<=R;dz+=G.cell)for(let dx=-R;dx<=R;dx+=G.cell){if(dx*dx+dz*dz>R*R)continue;const c=cellAt(x+dx,z+dz);if(c<0||area[c]<4)continue;mx=Math.max(mx,g[c]/area[c]);}return mx;};
 const area=G.area;const cellAt=(x,z)=>{const a=Math.floor((x-G.x0)/G.cell),b=Math.floor((z-G.z0)/G.cell);return a<0||b<0||a>=G.w||b>=G.h?-1:b*G.w+a;};
 const track={};routes.forEach((R,r)=>{const W=walk[r];const done=W.map((w,j)=>[w.done==null?Infinity:w.done-w.born,j]).sort((a,b)=>a[0]-b[0]);const j=done[Math.floor((done.length-1)/2)][1];
  const off=ids.slice(0,r).reduce((s,l)=>s+l.length,0)+j;const rows=[];
  for(const f of frames){if(f.t<W[j].born-1e-6||(W[j].done!=null&&f.t>W[j].done+1e-6))continue;const x=f.walkers.x[off],z=f.walkers.z[off];if(Math.abs(x)>5000)continue;const g=Buffer.from(f.grid,'base64');const c=cellAt(x,z);
   rows.push([f.t,r2(near(g,x,z,TRACK_REACH)),r1(x),r1(z)]);}
  track[R.key]={walker:j,born:W[j].born,done:W[j].done,rows};});
 const scored={};for(const [pair,P] of Object.entries(V8.V8_PAIRS))scored[pair]=V8.scoreRoutes(pair,numbers,{clockStart:P.clock||null});
 const out={key,scenario:name,label:V8.V8_SIM_LABEL,assumptions:V8.V8_ASSUMPTIONS,rule:V8.V8_RULE,agents:config.agents,jr:{...config.jr,routeDefs:undefined},
  grid:{x0:G.x0,z0:G.z0,cell:G.cell,w:G.w,h:G.h},keyframes:frames.length,ms:Date.now()-t0,
  routes:routes.map(R=>({key:R.key,gate:R.gate,kind:R.kind,color:R.color,sources:R.sources,start:R.start,zone:R.zone,length:Math.round(R.length),freeFlow:Math.round(R.freeFlow),path:R.path.filter((_,i,a)=>i%3===0||i===a.length-1)})),
  numbers,walkers:Object.fromEntries(routes.map((R,r)=>[R.key,walk[r]])),track,scored,
  gates:summary.gates,density:summary.density,counts:summary.counts};
 fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(CACHE,{recursive:true});
 fs.writeFileSync(frF,JSON.stringify({key,scenario:name,grid:{...out.grid,area:Buffer.from(area).toString('base64')},routeKeys:routes.map(R=>R.key),frames}));
 fs.writeFileSync(sumF,JSON.stringify(out,null,1)+'\n');publish(name);
 console.log(`v8 sim ${name} ${key}: ${frames.length} keyframes in ${((Date.now()-t0)/1000)|0} s`);
 for(const [pair,S] of Object.entries(scored))console.log(`  ${pair}: pick ${S.pick} | `+S.rows.map(r=>`${r.key} t=${V8.fmtMS(r.total)} ρ=${V8.fmtRho(r.peak)} dense=${r.dense} score=${r.score}${r.ruledOut?' ✕':''}`).join(' | '));}
// the page fetches the frames from the served tree (git-ignored copy)
function publish(name){const d=path.join(OUT,'cache');fs.mkdirSync(d,{recursive:true});fs.copyFileSync(path.join(CACHE,`${name}-frames.json`),path.join(d,`${name}-frames.json`));}

for(const n of which)runScenario(n);
