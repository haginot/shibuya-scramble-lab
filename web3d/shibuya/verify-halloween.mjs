// Node verification of the Halloween night mode and the station-closing
// dispersal comparison, on the real solvers (no rendering):
//  • nobody is relocated: per-step displacement ≤ walking speed × dt, teleports/rescues = 0
//  • densities stay plausible: never more than 4 people in a square metre (5 only while
//    clearing the road or passing someone head-on in the dispersal runs), 3 m-cell peak ≤ 5
//  • HUD numbers equal recounts of the agents' own motion codes
//  • dispersal numbers (remaining, density, exposure) equal an independent recount, people
//    are conserved, emerge only on gate cells and leave only at gateways on foot
//  • (which strategy does better is reported, not asserted; see sweep-dispersal.mjs)
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {HalloweenSimulation,HALLOWEEN,HMOTION} from './halloween.mjs';
import {DispersalSimulation,DISPERSAL,DMOTION,HIDDEN} from './dispersal.mjs';
import {fmt,p2,mmss} from './halloween-app.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const STEP_MAX=1.95*.1+1e-4;

// Independent recount of the 3 m-cell densities from positions.
function cells(sim,visible){const H=sim.h,DC=H.DC,DN=H.DN,R=sim.g.R,cnt=new Map();for(let i=0;i<sim.n;i++){if(!visible(i))continue;const a=Math.floor((sim.x[i]+R)/DC),b=Math.floor((sim.z[i]+R)/DC);if(a<0||b<0||a>=DN||b>=DN)continue;const k=b*DN+a;cnt.set(k,(cnt.get(k)||0)+1);}return {cnt,H};}

async function dispersalRun(strategy){
 const sim=new DispersalSimulation({...config,hour:23.5,strategy},osm,plateau,traffic),n=sim.n,s=sim.d,W=sim.g.rsize,R=sim.g.R;
 const gateCells=new Set(s.gates.flatMap(q=>q.cells)),stats={maxStep:0,emergedOffGate:0,leftOffGateway:0,maxOcc:0,conservation:0,exitChecks:0};
 const mPrev=new Uint8Array(n),preX=new Float32Array(n),preZ=new Float32Array(n);
 for(let k=0;k<DISPERSAL_SECONDS*10;k++){mPrev.set(sim.motion);preX.set(sim.x);preZ.set(sim.z);sim.step(.1);
  for(let i=0;i<n;i++){const m=sim.motion[i],was=mPrev[i];
   if(was===DMOTION.INSIDE&&m!==DMOTION.INSIDE){if(!gateCells.has(sim.g.rkey(sim.px[i],sim.pz[i])))stats.emergedOffGate++;const d=Math.hypot(sim.x[i]-sim.px[i],sim.z[i]-sim.pz[i]);if(d>stats.maxStep)stats.maxStep=d;continue;}
   if(m===DMOTION.GONE&&was!==DMOTION.GONE){if(sim.field(s.gateways[sim.gw[i]].map,preX[i],preZ[i])>1.5)stats.leftOffGateway++;continue;}
   if(m===DMOTION.INSIDE||m===DMOTION.GONE){if(sim.x[i]!==HIDDEN||sim.z[i]!==HIDDEN)stats.conservation++;continue;}
   const d=Math.hypot(sim.x[i]-sim.px[i],sim.z[i]-sim.pz[i]);if(d>stats.maxStep)stats.maxStep=d;}
  if(k%50===0){const occ=new Map();for(let i=0;i<n;i++){const m=sim.motion[i];if(m===DMOTION.INSIDE||m===DMOTION.GONE)continue;const q=sim.g.key(sim.x[i],sim.z[i]);occ.set(q,(occ.get(q)||0)+1);}for(const v of occ.values())stats.maxOcc=Math.max(stats.maxOcc,v);
   const snap=sim.snapshot();if(snap.inside+snap.held+snap.walking+snap.left!==n)stats.conservation++;}
  // Per-exit counters (measured on this step): recount people and the densest 3 m cell per zone.
  if(sim.stepCount%50===0){const {cnt,H}=cells(sim,i=>sim.motion[i]!==DMOTION.INSIDE&&sim.motion[i]!==DMOTION.GONE),people=DISPERSAL.exits.map(()=>0),peak=DISPERSAL.exits.map(()=>0);
   for(let i=0;i<n;i++){const m=sim.motion[i];if(m===DMOTION.INSIDE||m===DMOTION.GONE)continue;const r=sim.g.rkey(sim.x[i],sim.z[i]),q=r>=0?s.zone[r]:0;if(!q)continue;
    const a=Math.floor((sim.x[i]+R)/H.DC),b=Math.floor((sim.z[i]+R)/H.DC),k=b*H.DN+a;if(a<0||b<0||a>=H.DN||b>=H.DN)continue;people[q-1]++;peak[q-1]=Math.max(peak[q-1],cnt.get(k)/Math.max(4,H.darea[k]));}
   const shown=sim.snapshot().exits;shown.forEach((e,k)=>{assert.equal(e.people,people[k],`exit ${e.key}: people = recount`);assert(Math.abs(e.peak-peak[k])<1e-9,`exit ${e.key}: peak = recount`);assert(Math.abs(e.density-people[k]/s.zoneArea[k])<1e-12);});stats.exitChecks++;}}
 const snap=sim.snapshot();
 // Independent recount of the reported numbers at the end.
 let inside=0,held=0,walking=0,gone=0;for(let i=0;i<n;i++){const m=sim.motion[i];if(m===DMOTION.INSIDE)inside++;else if(m===DMOTION.HOLD)held++;else if(m===DMOTION.GONE)gone++;else walking++;}
 const {cnt,H}=cells(sim,i=>sim.motion[i]!==DMOTION.INSIDE&&sim.motion[i]!==DMOTION.GONE);let densePeak=0;
 for(let i=0;i<n;i++){const m=sim.motion[i];if(m===DMOTION.INSIDE||m===DMOTION.GONE)continue;const r=sim.g.rkey(sim.x[i],sim.z[i]);if(r<0||!s.study[r])continue;const a=Math.floor((sim.x[i]+R)/H.DC),b=Math.floor((sim.z[i]+R)/H.DC),k=b*H.DN+a;densePeak=Math.max(densePeak,cnt.get(k)/Math.max(4,H.darea[k]));}
 const series=snap.series;let crushFromSeries=0;
 return {strategy,stats,snap:{remaining:snap.remaining,inside:snap.inside,held:snap.held,walking:snap.walking,left:snap.left,lost:snap.lost,teleports:snap.teleports,peakCell:snap.peakCell,densePeakNow:snap.now.densePeak,crush:snap.crushPersonMinutes,holdTotal:snap.holdTotal,denseClearedAt:snap.denseClearedAt,stationEmptyAt:snap.stationEmptyAt,time:snap.time,heatMax:Math.max(...snap.heat.data)/50,series:series.length,exits:snap.exits,exitSeries:snap.exitSeries},
  recount:{remaining:inside+held+walking,inside,held,walking,gone,densePeak},scenario:sim.scenario};
}
const DISPERSAL_SECONDS=1500;
if(!isMainThread){parentPort.postMessage(await dispersalRun(workerData));}
else{
 // --- Halloween crowd (full population) ---
 const sim=new HalloweenSimulation({...config,mode:'halloween',agents:HALLOWEEN.agents,hour:HALLOWEEN.hour},osm,plateau,traffic);
 // Dispersal runs start now, in parallel.
 const runs=['none','managed'].map(strategy=>new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:strategy});w.on('message',resolve);w.on('error',reject);}));
 const n=sim.n,{HOLD,WAIT,CROSS,ATTEND}=HMOTION;let maxStep=0,maxOcc=0,peak=0,heldMax=0,crossMax=0,medians=[],stagesSeen=new Set(),walkStarts=0;
 for(let k=0;k<3200;k++){const wasPhase=sim.snapshot?null:null;sim.step(.1);
  for(let i=0;i<n;i++){const d=Math.hypot(sim.x[i]-sim.px[i],sim.z[i]-sim.pz[i]);if(d>maxStep)maxStep=d;}
  if(k%25===0){const s=sim.snapshot();let h=0,w=0,c=0,a=0;for(let i=0;i<n;i++){const m=sim.motion[i];if(m===HOLD)h++;else if(m===WAIT)w++;else if(m===CROSS)c++;else if(m===ATTEND)a++;}
   assert.equal(s.held,h,'HUD held = people in police pens');assert.equal(s.waiting,w,'HUD queued = people waiting at corners');assert.equal(s.active,c,'HUD crossing = people on the crossing');assert.equal(s.attending,a);
   assert.equal(s.heldByCorner.reduce((x,y)=>x+y,0),h,'per-corner held sums to the total');
   const occ=new Map();for(let i=0;i<n;i++){const q=sim.g.key(sim.x[i],sim.z[i]);occ.set(q,(occ.get(q)||0)+1);}for(const v of occ.values())maxOcc=Math.max(maxOcc,v);
   // Peak density recount from positions (3 m cells with ≥ 4 m² walkable).
   const {cnt,H}=cells(sim,()=>true);let pk=0;for(const [q,v] of cnt)if(H.darea[q]>=4)pk=Math.max(pk,v/H.darea[q]);assert(Math.abs(pk-s.density.peak)<1e-9||s.density.time<sim.time-1e-6,'reported peak density is the recount');
   peak=Math.max(peak,s.density.peak);medians.push(s.density.median);heldMax=Math.max(heldMax,h);crossMax=Math.max(crossMax,c);}
  // Staged release: at each walk start, departures are delayed in rows (front first).
  if(sim.admitted>200&&walkStarts<sim.cycle){walkStarts=sim.cycle;for(let i=0;i<n;i++)if(sim.motion[i]===CROSS&&sim.delay[i]>0)stagesSeen.add(Math.floor(sim.delay[i]/HALLOWEEN.stageGap));}}
 const s=sim.snapshot();medians.sort((a,b)=>a-b);const median=medians[Math.floor(medians.length/2)];
 assert.equal(s.teleports,0,'Halloween: nobody placed back on the walk graph');assert.equal(s.rescued,0,'Halloween: safety valve unused');
 assert(maxStep<=STEP_MAX,`Halloween: largest step ${maxStep} m in 0.1 s`);
 assert(maxOcc<=HALLOWEEN.occupancy,`Halloween: at most ${HALLOWEEN.occupancy} people per m² (saw ${maxOcc})`);
 assert(peak<=4+1e-9,`Halloween: peak 3 m-cell density ${peak}`);assert(median>=.8&&median<=3,`Halloween: typical density ${median} p/m² should be 1–3`);
 assert(heldMax>500,'police pens hold people while the corners are full');assert(crossMax>1500,'thousands cross per green');assert(s.released>1000,'pens release people');
 assert(stagesSeen.size>=2,'queues are released in at least two rows');
 assert(s.totalCompleted>3000,'crossings complete on foot');assert(s.laneViolations<.05*s.transitions,`one-way rules mostly respected (${(100*s.laneViolations/s.transitions).toFixed(1)} % of transitions forced at dead ends)`);
 console.log(`PASS Halloween: ${fmt(n)} agents, 320 s · peak ${p2(peak)} p/m² (cap ${HALLOWEEN.occupancy}/m²), median ${p2(median)} · held max ${fmt(heldMax)} · crossing max ${fmt(crossMax)} · crossed ${fmt(s.totalCompleted)} · lane rule forced at dead ends ${(100*s.laneViolations/s.transitions).toFixed(1)} % · teleports 0 · max step ${maxStep.toFixed(3)} m`);
 // --- Dispersal comparison ---
 const [A,B]=await Promise.all(runs);
 for(const r of [A,B]){const {stats,snap,recount}=r;
  assert.equal(snap.lost,0);assert.equal(snap.teleports,0);assert.equal(stats.emergedOffGate,0,'people emerge only on gate cells');assert.equal(stats.leftOffGateway,0,'people leave only at gateways');assert.equal(stats.conservation,0,'inside + held + walking + left = everyone');
  assert(stats.maxStep<=STEP_MAX,`${r.strategy}: largest step ${stats.maxStep}`);assert(stats.maxOcc<=HALLOWEEN.occupancy+1,`${r.strategy}: ${stats.maxOcc} people in a square metre`);
  assert(snap.peakCell<=5+1e-9,`${r.strategy}: peak ${snap.peakCell}`);
  assert.equal(snap.remaining,recount.remaining);assert.equal(snap.inside,recount.inside);assert.equal(snap.held,recount.held);assert.equal(snap.left,recount.gone);
  assert(Math.abs(snap.densePeakNow-recount.densePeak)<1e-9,'reported "densest now" is the recount');
  assert(snap.heatMax<=5.1,'heat map within the density scale');
  assert(stats.exitChecks>=DISPERSAL_SECONDS/5-1,'per-exit counters recounted every 5 s');
  for(const row of snap.exitSeries)assert(row.slice(1).reduce((a,b)=>a+b,0)<=n,'exit zones never double count');}
 // No assertion about which strategy wins: the comparison is reported, not required (the
 // sensitivity sweep, sweep-dispersal.mjs, lists every scenario including where management helps less).
 // Only scenario-independent facts are checked: the managed run never lets people onto the road
 // against the signal, so it never holds cars.
 assert.equal(B.snap.holdTotal,0,'managed: cars never held by people on the road');
 console.log(`PASS dispersal (${DISPERSAL.inside+DISPERSAL.plaza} people, 25 min): remaining ${fmt(A.snap.remaining)} vs ${fmt(B.snap.remaining)} · peak ${p2(A.snap.peakCell)} vs ${p2(B.snap.peakCell)} p/m² · person-min ≥4 p/m² ${fmt(A.snap.crush)} vs ${fmt(B.snap.crush)} · cars held ${mmss(A.snap.holdTotal)} vs ${mmss(B.snap.holdTotal)} · dense cleared ${mmss(A.snap.denseClearedAt)??'never'} vs ${mmss(B.snap.denseClearedAt)} · station empty ${mmss(A.snap.stationEmptyAt)} vs ${mmss(B.snap.stationEmptyAt)}`);
 console.log(`PASS exits: ${B.snap.exits.map(e=>`${e.key} peak ${p2(A.snap.exits.find(q=>q.key===e.key).peakRun)}/${p2(e.peakRun)} clear ${mmss(A.snap.exits.find(q=>q.key===e.key).clearAt)??'—'}/${mmss(e.clearAt)??'—'}`).join(' · ')}`);
 console.log(JSON.stringify({A:A.snap,B:B.snap}));
}
