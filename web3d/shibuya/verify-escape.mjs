// Node verification of the escape scenarios (escape.mjs) on the real crowd solver:
//  static  • gate/taxi routes ≤ 2.5 × the straight line; every route vertex is on a walkable cell, consecutive vertices are ≤ 2 m apart and the
//            straight line between them stays on walkable cells; the route starts in the start zone
//            and its last vertex is inside the destination zone; cited fact ids are verified ones
//  dynamic • conservation per branch every step: pending + walking + arrived = walkers
//          • counts honest: the reported per-branch counts equal a recount from the agents' motion codes
//          • nobody is relocated: walkers appear only on start cells, finish only inside their zone,
//            and move ≤ 1.95 m/s × dt per step; base crowd teleports = 0; ≤ 4 people per m²
//          • densities: corridorNow / DANGER equal an independent recount from positions
//          • the ESCAPED / CAUGHT outcome follows ESCAPE.rule (recomputed from the raw walker data)
//          • playback: escapeFrame() numbers equal the keyframe numbers (never interpolated)
//          • deterministic: two independent runs (worker threads) give identical summaries
// usage: node verify-escape.mjs [--static] [--agents N] [--tmax S] [--warmup S]
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {EscapeSimulation,ESCAPE,ESCAPE_FACTS,DROPPED_FACTS,EMOTION,HIDDEN} from './escape.mjs';
import {FACT_SOURCES} from './sources-halloween.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?Number(process.argv[i+1]):d;};
const STEP_MAX=1.95*.1+1e-4;
const {PENDING,WALK,DONE}=EMOTION;

function staticChecks(sim){const s=sim.e,out=[];
 const onPass=(x,z)=>{const r=s.ek(x,z);return r>=0&&s.pass[r]>0;};
 for(const L of s.levels){const start=new Set(L._.startCells);
  assert(L._.startCells.length>=20,`${L.key}: start zone has room`);
  for(const B of L.branches){const id=`${L.key}/${B.key}`,P=B.path;
   assert(P.length>=2,`${id}: path`);
   for(const [x,z] of P)assert(onPass(x,z),`${id}: vertex ${x},${z} not walkable`);
   for(let k=1;k<P.length;k++){const [a,b]=[P[k-1],P[k]],d=Math.hypot(b[0]-a[0],b[1]-a[1]);assert(d<=2+1e-6,`${id}: vertices ${d} m apart`);
    for(let u=0;u<=1;u+=.05)assert(onPass(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u),`${id}: segment ${k} leaves the walkable cells`);}
   assert(start.has(s.ek(...P[0]))||Math.hypot(P[0][0]-L.start.x,P[0][1]-L.start.z)<1,`${id}: route starts at the start point`);
   assert(B._.targetSet.has(s.ek(...P.at(-1))),`${id}: last vertex inside the destination zone`);
   assert(Math.hypot(P.at(-1)[0]-B.zone.x,P.at(-1)[1]-B.zone.z)<=B.zone.radius+1,`${id}: end within ${B.zone.radius} m of the zone centre`);
   assert(B._.map[(Math.floor(P[0][1])-B._.bz)*B._.bw+Math.floor(P[0][0])-B._.bx]<Infinity,`${id}: walkers' route map reaches the start`);
   assert(['gate','taxi','walk-alt'].includes(B.kind),`${id}: kind`);
   // No absurd detours to a gate / taxi stand: walked length ≤ 2.5 × the straight line (start → end of route).
   if(B.kind!=='walk-alt'){const straight=Math.max(20,Math.hypot(P.at(-1)[0]-L.start.x,P.at(-1)[1]-L.start.z));assert(B.length<=2.5*straight,`${id}: route ${B.length.toFixed(0)} m is > 2.5 × the straight ${straight.toFixed(0)} m`);}
   if(B.kind==='walk-alt'){assert(B.offsim&&B.offsimLabel&&Number.isFinite(B.edgeBearing),`${id}: walk-alt has an off-sim arrow`);assert(B.offsimLabel.sources.some(f=>f.startsWith('ALT-')),`${id}: walking time is sourced (ALT-*)`);}
   const ids=[...B.sources,...B.target.sources,...(B.offsimLabel?.sources||[]),...L.start.sources];assert(ids.length>0,`${id}: cites facts`);
   for(const f of ids){assert(ESCAPE_FACTS.includes(f),`${id}: ${f} is not a verified fact`);assert(!DROPPED_FACTS.includes(f),`${id}: ${f} was dropped`);assert(FACT_SOURCES[f],`${id}: ${f} has no source in sources-halloween.mjs`);}
   out.push({level:L.key,branch:B.key,kind:B.kind,recommended:B.recommended,length:Math.round(B.length),vertices:P.length,sources:B.sources});}
  assert.equal(L.branches.filter(B=>B.recommended).length,1,`${L.key}: one example route`);}
 assert.deepEqual(s.levels.map(L=>L.key),['centergai','miyashita','hikarie','stream','dogenzaka'],'level order');
 return out;}

async function dynamicRun({agents,tmax,warmup}){
 const sim=new EscapeSimulation({...config,agents,escape:{tmax,warmup}},osm,plateau,traffic),n=sim.n,s=sim.e,E=sim.E;
 const st={maxStep:0,spawnOff:0,arriveOff:0,conservation:0,countChecks:0,densityChecks:0,maxOcc:0,hiddenWrong:0};
 const prevM=new Uint8Array(n),prevX=new Float32Array(n),prevZ=new Float32Array(n);
 const startSets=s.levels.map(L=>new Set(L._.startCells));
 const recountDensity=()=>{const cnt=new Map();for(let i=0;i<n;i++){const m=sim.motion[i];if(m===PENDING||m===DONE)continue;const a=Math.floor((sim.x[i]+s.RE)/s.DC),b=Math.floor((sim.z[i]+s.RE)/s.DC);if(a<0||b<0||a>=s.DN||b>=s.DN)continue;const k=b*s.DN+a;cnt.set(k,(cnt.get(k)||0)+1);}
  return k=>s.darea[k]>=2?(cnt.get(k)||0)/Math.max(4,s.darea[k]):0;};
 const end=sim.eStart+tmax;
 while(sim.time<end-1e-9){prevM.set(sim.motion);prevX.set(sim.x);prevZ.set(sim.z);sim.step(sim.dt);
  for(let i=sim.baseN;i<n;i++){const m=sim.motion[i],was=prevM[i],B=sim.branchOf(i);
   if(was===PENDING&&m===WALK){if(!startSets[sim.eLevel[i]].has(s.ek(sim.px[i],sim.pz[i])))st.spawnOff++;const d=Math.hypot(sim.x[i]-sim.px[i],sim.z[i]-sim.pz[i]);if(d>st.maxStep)st.maxStep=d;continue;}// px = where it appeared this step
   if(was===WALK&&m===DONE){if(!B._.targetSet.has(s.ek(sim.eAx[i],sim.eAz[i])))st.arriveOff++;const d=Math.hypot(sim.eAx[i]-prevX[i],sim.eAz[i]-prevZ[i]);if(d>st.maxStep)st.maxStep=d;continue;}
   if(m===WALK&&was===WALK){const d=Math.hypot(sim.x[i]-prevX[i],sim.z[i]-prevZ[i]);if(d>st.maxStep)st.maxStep=d;}
   if((m===PENDING||m===DONE)&&(sim.x[i]!==HIDDEN||sim.z[i]!==HIDDEN))st.hiddenWrong++;
   if(m===PENDING&&was!==PENDING)st.conservation++;// nobody goes back
   if(was===DONE&&m!==DONE)st.conservation++;}
  for(const br of sim.branchList){let p=0,w=0,d=0;for(const i of br.ids){const m=sim.motion[i];if(m===PENDING)p++;else if(m===WALK)w++;else if(m===DONE)d++;}if(p+w+d!==E.walkers)st.conservation++;}
  if(sim.stepCount%50===0){
   // Reported counts = recount from motion codes, for every level.
   for(const L of s.levels){const S=sim.escapeState(L.key,{heat:false});for(const b of S.branches){const br=sim.branchList.find(q=>q.l===s.levels.indexOf(L)&&L.branches[q.b].key===b.key);
     let p=0,w=0,d=0;for(const i of br.ids){const m=sim.motion[i];if(m===PENDING)p++;else if(m===WALK)w++;else if(m===DONE)d++;}
     assert.equal(b.walking,w,`${L.key}/${b.key}: walking = recount`);assert.equal(b.arrived,d,`${L.key}/${b.key}: arrived = recount`);assert.equal(b.pending,p);assert.equal(b.spawned,w+d,'spawned = walking + arrived');assert.equal(b.spawned+b.pending,E.walkers);}
    st.countChecks++;}
   const occ=new Map();for(let i=0;i<n;i++){const m=sim.motion[i];if(m===PENDING||m===DONE)continue;const q=sim.g.key(sim.x[i],sim.z[i]);occ.set(q,(occ.get(q)||0)+1);}for(const v of occ.values())st.maxOcc=Math.max(st.maxOcc,v);}
  if(sim.stepCount%10===0&&sim.stepCount%100===0){// right after a density sample: recount and compare
   const dens=recountDensity();for(const br of sim.branchList){const B=s.levels[br.l].branches[br.b];let v=0;for(const q of B._.ccells)v=Math.max(v,dens(q));assert(Math.abs(v-sim.corridorNow(br))<1e-9,`${s.levels[br.l].key}/${B.key}: corridorNow = recount (${v} vs ${sim.corridorNow(br)})`);}
   for(const L of s.levels){const S=sim.escapeState(L.key,{heat:false});let v=0;const R=E.dangerReach;for(let dz=-R;dz<=R;dz+=s.DC)for(let dx=-R;dx<=R;dx+=s.DC){if(dx*dx+dz*dz>R*R)continue;const a=Math.floor((S.player.x+dx+s.RE)/s.DC),b=Math.floor((S.player.z+dz+s.RE)/s.DC);v=Math.max(v,dens(b*s.DN+a));}
    assert(Math.abs(v-S.danger.value)<1e-9,`${L.key}: DANGER = recount`);assert.equal(S.danger.level,E.dangerLevels.filter(t=>v>=t).length);}
   st.densityChecks++;}
  if(sim.branchList.every(br=>br.ids.every(i=>sim.motion[i]===DONE)))break;}
 if(sim.keyframes.at(-1)?.t!==Math.round(sim.escapeT*1e6)/1e6)sim.keyframes.push(sim.capture());
 const S=sim.escapeSummary();
 // Outcome rule recomputed from the raw walker data.
 const R=E.rule;let ruleChecks=0;
 S.levels.forEach((L,l)=>L.branches.forEach((b,k)=>{const br=sim.branchList.find(q=>q.l===l&&q.b===k),B=s.levels[l].branches[k],p=br.player;
  assert.equal(B.simLimit,Math.round(B.freeFlow*R.limitFactor+R.limitSlack),'simLimit = free flow × factor + slack');
  const arrived=sim.motion[p]===DONE,t=arrived?sim.eArrive[p]-sim.eBorn[p]:null,dense=sim.eDense[p];
  const expect=dense>=R.denseMax?['caught','dense']:arrived?(t<=B.simLimit?['escaped',null]:['caught','timeout']):(sim.motion[p]===WALK&&sim.time-sim.eBorn[p]>B.simLimit)?['caught','timeout']:[null,null];
  assert.deepEqual([b.outcome,b.reason],expect,`${L.key}/${b.key}: outcome follows the rule`);ruleChecks++;
  assert.equal(b.spawned,b.arrived+b.enRoute,`${L.key}/${b.key}: spawned = arrived + en route`);assert.equal(b.spawned+b.pending,E.walkers);
  if(b.arrived>0)assert(b.travelP50<=b.travelP90,'p50 ≤ p90');
  assert(b.shareCrush<=b.shareDense+1e-12,'share ≥4 ≤ share ≥3');}));
 // Playback: keyframe numbers are returned unchanged.
 const K=sim.keyframes;for(const L of s.levels)for(const j of [0,Math.floor(K.length/2),K.length-1]){const f=sim.escapeFrame(L.key,K[j].t+.4*E.keyframe),k=K[Math.min(K.length-1,Math.floor((K[j].t+.4*E.keyframe+1e-9)/E.keyframe))].levels[s.levels.indexOf(L)];
  assert.deepEqual(f.branches,k.branches,'playback counts = keyframe');assert.deepEqual(f.danger,k.danger);assert.equal(f.simTime,k.simTime);}
 const hash=createHash('sha256').update(JSON.stringify(S)).update(Buffer.from(sim.x.buffer)).update(Buffer.from(sim.z.buffer)).digest('hex');
 return {stats:st,ruleChecks,summary:S,hash,teleports:sim.teleports,rescued:sim.rescued,keyframes:K.length,time:sim.escapeT,levels:sim.escapeLevels.map(L=>({key:L.key,speed:L.speed,simLimit:L.simLimit,start:[L.start.x,L.start.z],branches:L.branches.map(B=>({key:B.key,kind:B.kind,recommended:B.recommended,target:[B.target.x,B.target.z],zone:B.zone,length:Math.round(B.length),vertices:B.path.length,offsim:!!B.offsim,edgeBearing:B.edgeBearing,sources:B.sources}))}))};}

if(!isMainThread)parentPort.postMessage(await dynamicRun(workerData));
else{
 const t0=Date.now(),geo=new EscapeSimulation({...config,agents:2000},osm,plateau,traffic);
 const routes=staticChecks(geo);
 console.log(`PASS static: ${routes.length} routes on walkable cells, ending in their destination zones; facts verified (${[...new Set(routes.flatMap(r=>r.sources))].length} ids)`);
 if(process.argv.includes('--static')){console.log(JSON.stringify({routes}));process.exit(0);}
 const opts={agents:arg('--agents',12000),tmax:arg('--tmax',420),warmup:arg('--warmup',30)};
 const runs=await Promise.all([0,1].map(()=>new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:opts});w.on('message',resolve);w.on('error',reject);})));
 const [A,B]=runs;
 for(const r of runs){const st=r.stats;
  assert.equal(st.conservation,0,'pending + walking + arrived = walkers on every branch, every step');
  assert.equal(st.spawnOff,0,'walkers appear only on start cells');assert.equal(st.arriveOff,0,'walkers finish only inside their destination zone');assert.equal(st.hiddenWrong,0,'pending/arrived walkers are off the map');
  assert(st.maxStep<=STEP_MAX,`largest step ${st.maxStep} m in 0.1 s`);assert.equal(r.teleports,0,'nobody placed back on the walk graph');
  assert(st.maxOcc<=4,`at most 4 people per m² (saw ${st.maxOcc})`);
  assert(st.countChecks>=5&&st.densityChecks>=2,'counts and densities were recounted');assert.equal(r.ruleChecks,15);}
 assert.equal(A.hash,B.hash,'deterministic: two runs give identical results');
 assert.deepEqual(A.summary,B.summary);
 const S=A.summary;let arrived=0;for(const L of S.levels)for(const b of L.branches)arrived+=b.arrived;assert(arrived>0,'walkers reach their destinations');
 console.log(`PASS dynamic (${opts.agents} crowd + ${S.levels.reduce((k,L)=>k+L.branches.length,0)*ESCAPE.walkers} escape walkers, ${A.time.toFixed(0)} s, ${((Date.now()-t0)/1000).toFixed(0)} s wall): conserved, recounted, rule-consistent, deterministic (${A.hash.slice(0,12)})`);
 for(const L of S.levels)console.log(`  ${L.key.padEnd(10)} `+L.branches.map(b=>`${b.key}${b.recommended?'*':''} ${b.kind} ${b.arrived}/${b.spawned} p50 ${b.travelP50?.toFixed(0)??'—'}s max ${b.maxDensity.toFixed(1)} ≥4 ${(100*b.shareCrush).toFixed(0)}% → ${b.outcome??'—'}`).join(' | '));
 console.log(JSON.stringify({opts,routes,summary:S,levels:A.levels,stats:A.stats,rescued:A.rescued,keyframes:A.keyframes}));
}
