// Node verification of the JR episode crowd (crowd-jr.mjs) on the real Halloween solver.
//  static  • every route vertex is on a walkable cell of the start's network, consecutive vertices ≤ 2 m apart,
//            chords stay walkable, the route starts in the start zone and ends inside its gate's admission zone
//            (walk-alt: the sim-edge zone); gate routes ≤ 3 × the straight line + 40 m (the Hachiko route makes the one-way U-turn); cited facts are verified ids
//  dynamic • conservation every step: Halloween crowd + route walkers + alighting pool = n; per route
//            pending + walking + done = walkers; entered-station count = admission log
//          • counts honest: jrState() counts / route states / gate queues equal independent recounts
//          • nobody relocated: visible agents move ≤ 1.95 m/s × dt per step; walkers appear only on start cells,
//            alighting people only on their gate's admission cells; base teleports = 0; ≤ 4 people per m²
//          • densities: jrState densities equal a recount from positions; gate admissions never exceed capacity
//          • the scramble signal never stalls (no deadlock); outcome = rule; playback = keyframes
//          • concourse model: every outdoor admission enters it, one person per gate lane at a time,
//            outbound exits are the alighting schedule of the outdoor model
//          • deterministic: two independent runs (worker threads) give identical summaries
// usage: node verify-crowd-jr.mjs [--static] [--agents N] [--tmax S] [--warmup S]
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {JRCrowdSimulation,JMOTION,HIDDEN,JR_FACTS,JR_GATES,jrFrameFrom,gridDensity,runConcourse,outboundExits,concourseFrame,CONCOURSE} from './crowd-jr.mjs';
import {DROPPED_FACTS} from '../sources-halloween.mjs';
// Fact ids must be in the team's machine-readable claims ($L/facts-series.json; the python test re-checks status).
const FACTS_FILE='/workspace/projects/logs/ssl-claude-halloween/series/facts-series.json';
const KNOWN=await readFile(FACTS_FILE,'utf8').then(t=>new Set(JSON.parse(t).filter(f=>!/dropped|not announced/.test(f.status||'')).map(f=>f.id))).catch(()=>null);
const load=async name=>JSON.parse(await readFile(new URL(`../../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?Number(process.argv[i+1]):d;};
const {PENDING,WALK,DONE,BOUND,INSIDE,OUT}=JMOTION;
const STEP_MAX=1.95*.1+1e-4;

function staticChecks(sim){const s=sim.e,out=[];const onPass=(x,z)=>{const r=s.ek(x,z);return r>=0&&s.mainPass[r]>0;};const start=new Set(s.startCells);
 assert(s.startCells.length>=20,'start zone has room');
 for(const R of s.routes){const id=R.key,P=R.path;assert(P.length>=2,`${id}: path`);
  for(const [x,z] of P)assert(onPass(x,z),`${id}: vertex ${x},${z} not walkable`);
  for(let k=1;k<P.length;k++){const a=P[k-1],b=P[k],d=Math.hypot(b[0]-a[0],b[1]-a[1]);assert(d<=2+1e-6,`${id}: vertices ${d} m apart`);for(let u=0;u<=1;u+=.05)assert(onPass(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u),`${id}: segment ${k} leaves the walkable cells`);}
  assert(start.has(s.ek(...P[0])),`${id}: starts in the start zone`);
  assert(R._.targetSet.has(s.ek(...P.at(-1))),`${id}: ends inside its zone`);
  if(R.kind==='gate'){const G=s.gates[R._.gate];assert.equal(G.key,R.gate);for(const r of G._.front)assert.equal(s.pass[r],1,`${G.key}: admission zone on sidewalk cells`);
   assert(Math.hypot(P.at(-1)[0]-G.front.x,P.at(-1)[1]-G.front.z)<=G.front.radius+1,`${id}: ends at the ${G.key} gate front`);
   const straight=Math.max(20,Math.hypot(P.at(-1)[0]-R.start.x,P.at(-1)[1]-R.start.z));assert(R.length<=3*straight+40,`${id}: ${R.length} m > 3 × ${straight} m + 40 m`);}
  else{assert(R.offsim&&R.offsimLabel&&Number.isFinite(R.edgeBearing),`${id}: walk-alt has an off-sim arrow`);assert(R.offsimLabel.sources.some(f=>f.startsWith('ALT-')),`${id}: walking time is sourced (ALT-*)`);}
  assert(R._.map[(Math.floor(P[0][1])-R._.bz)*R._.bw+Math.floor(P[0][0])-R._.bx]<Infinity,`${id}: route map reaches the start`);
  const ids=[...R.sources,...(R.offsimLabel?.sources||[]),...R.start.sources];assert(ids.length,`${id}: cites facts`);
  for(const f of ids){assert(JR_FACTS.includes(f),`${id}: ${f} not in JR_FACTS`);if(KNOWN)assert(KNOWN.has(f),`${id}: ${f} not in facts-series.json`);assert(!DROPPED_FACTS.includes(f),`${id}: ${f} dropped`);}
  out.push({key:R.key,gate:R.gate,kind:R.kind,recommended:R.recommended,length:Math.round(R.length),vertices:P.length,sources:R.sources});}
 for(const G of s.gates)for(const f of G.sources)assert(JR_FACTS.includes(f)&&(!KNOWN||KNOWN.has(f)),`${G.key}: ${f}`);
 assert.equal(s.routes.filter(R=>R.recommended).length,1,'one example route');
 return out;}

const hashOf=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function dynamicRun({agents,tmax,warmup,check=true}){
 const sim=new JRCrowdSimulation({...config,agents,jr:{tmax,warmup}},osm,plateau,traffic),n=sim.n,s=sim.e,E=sim.E;
 const st={maxStep:0,spawnOff:0,alightOff:0,conservation:0,countChecks:0,densityChecks:0,maxOcc:0,maxClockLag:0,capacity:0,baseExtra:0};
 const prevX=new Float32Array(n),prevZ=new Float32Array(n),prevM=new Uint8Array(n);const startSet=new Set(s.startCells);
 const snap=()=>{prevX.set(sim.x);prevZ.set(sim.z);prevM.set(sim.motion);};snap();
 let steps=0;const end=sim.eStart+E.tmax;
 while(sim.time<end-1e-9){sim.step(sim.dt);steps++;
  if(check){
   for(let i=0;i<n;i++){const m=sim.motion[i],vis=sim.x[i]!==HIDDEN,was=prevX[i]!==HIDDEN;
    if(i<sim.baseN&&(m===PENDING||m===WALK||m===DONE||m===OUT))st.baseExtra++;
    if(i>=sim.baseN&&(m===BOUND||m===INSIDE))st.baseExtra++;
    if(vis!==!(m===PENDING||m===DONE||m===INSIDE))st.conservation++;
    if(vis&&was){const d=Math.hypot(sim.x[i]-prevX[i],sim.z[i]-prevZ[i]);if(d>st.maxStep)st.maxStep=d;}
    if(vis&&!was){const r=s.ek(sim.x[i],sim.z[i]);if(m===WALK){if(!startSet.has(r))st.spawnOff++;}else if(m===OUT){if(!s.gates[sim.jGate[i]]._.frontSet.has(r))st.alightOff++;}else{st.spawnOff++;(st.odd??=[]).length<5&&st.odd.push([i,m,prevM[i],sim.x[i],sim.z[i]]);}}}
   for(const br of sim.routeList){let p=0,w=0,d=0;for(const i of br.ids){const m=sim.motion[i];if(m===PENDING)p++;else if(m===WALK)w++;else if(m===DONE)d++;}if(p+w+d!==br.ids.length)st.conservation++;}
   let inside=0,doneGate=0;for(let i=0;i<n;i++){if(sim.motion[i]===INSIDE)inside++;else if(sim.motion[i]===DONE&&sim.jRoute[i]>=0&&s.routes[sim.jRoute[i]].kind==='gate')doneGate++;}
   if(inside+doneGate!==sim.admitLog.reduce((a,l)=>a+l.length,0))st.conservation++;
   {const occ=new Map();for(let i=0;i<n;i++){if(sim.x[i]===HIDDEN)continue;const k=sim.g.key(sim.x[i],sim.z[i]);occ.set(k,(occ.get(k)||0)+1);}for(const v of occ.values())st.maxOcc=Math.max(st.maxOcc,v);}
   st.maxClockLag=Math.max(st.maxClockLag,sim.time-sim.clock);
   if(steps%50===0){// counts honest + densities = recount
    const J=sim.jrState({camera:{x:30,z:20}});let outside=0,bound=0;for(let i=0;i<n;i++){const m=sim.motion[i];if(m!==PENDING&&m!==DONE&&m!==INSIDE){outside++;if(m===BOUND)bound++;}}
    assert.equal(J.counts.outside,outside);assert.equal(J.counts.bound,bound);assert.equal(J.counts.modelled,n);
    let near=0;for(let i=0;i<n;i++)if(Math.hypot(sim.x[i]-30,sim.z[i]-20)<=E.cameraRadius)near++;assert.equal(J.counts.nearCamera,near);
    J.routes.forEach((r,k)=>{const br=sim.routeList[k];assert.equal(r.pending+r.walking+r.done,br.ids.length);assert.equal(r.spawned,r.walking+r.done);});
    J.gates.forEach((g,k)=>{const G=s.gates[k];let c=0;for(let i=0;i<n;i++){const m=sim.motion[i];if((m===BOUND||m===WALK)&&sim.jGate[i]===k&&sim.efield(G._.map,sim.x[i],sim.z[i])<=E.queueReach)c++;}assert.equal(g.queue,c);assert.equal(g.admitted,sim.admitLog[k].length);});
    st.countChecks++;}
   if(sim.stepCount%10===0){// densities: independent recount from positions on the same 3 m cells
    const cnt=new Map();for(let i=0;i<n;i++){if(sim.x[i]===HIDDEN)continue;const a=Math.floor((sim.x[i]+s.RE)/s.DC),b=Math.floor((sim.z[i]+s.RE)/s.DC);if(a<0||b<0||a>=s.DN||b>=s.DN)continue;const k=b*s.DN+a;cnt.set(k,(cnt.get(k)||0)+1);}
    const P=sim.player(),reach=E.playerReach;let mx=0;for(let dz=-reach;dz<=reach;dz+=s.DC)for(let dx=-reach;dx<=reach;dx+=s.DC){if(dx*dx+dz*dz>reach*reach)continue;const a=Math.floor((P.x+dx+s.RE)/s.DC),b=Math.floor((P.z+dz+s.RE)/s.DC),k=b*s.DN+a;if(s.darea[k]<4)continue;mx=Math.max(mx,(cnt.get(k)||0)/s.darea[k]);}
    assert(Math.abs(mx-sim.densityNear(P.x,P.z,reach).max)<1e-9,`player density ${mx} vs ${sim.densityNear(P.x,P.z,reach).max}`);st.densityChecks++;}}
  snap();
  if(sim.time>sim.eStart&&sim.routeList.every(br=>br.ids.every(i=>sim.motion[i]===DONE)))break;}
 if(sim.keyframes.at(-1)?.t!==Math.round(sim.jrTime*1e6)/1e6)sim.keyframes.push(sim.capture());
 const summary=sim.jrSummary(),hash=hashOf(summary);
 if(check){
  // Admission capacity: in any 60 s window ≤ capacity × 60 + bucket depth.
  s.gates.forEach((G,k)=>{const T=sim.admitLog[k].map(e=>e[0]);for(let a=0,b=0;b<T.length;b++){while(T[b]-T[a]>60)a++;if(b-a+1>G.capacity*60+E.tokenMax+1e-9)st.capacity++;}});
  // Outcome = rule, recomputed from the raw walker data.
  for(const br of sim.routeList){const R=s.routes[br.r],p=br.player,m=sim.motion[p],age=(m===DONE?sim.jDone[p]:sim.time)-sim.jBorn[p];
   const exp=sim.jDense[p]>=E.rule.denseMax?'caught':m===DONE?(age<=R.simLimit?'escaped':'caught'):m===WALK&&age>R.simLimit?'caught':null;
   assert.equal(summary.routes[br.r].outcome,exp,`${R.key}: outcome follows the rule`);}
  // Playback: numbers are those of the keyframe at or before the time.
  const run={keyframes:sim.keyframes,keyframe:E.keyframe,grid:sim.grid};
  for(const t of [0,.5,7.3,30,sim.keyframes.at(-1).t]){const f=jrFrameFrom(run,t),K=sim.keyframes[Math.min(sim.keyframes.length-1,Math.floor(t/E.keyframe+1e-9))];
   assert.deepEqual(f.routes,K.routes);assert.deepEqual(f.gates,K.gates);assert.deepEqual(f.player,K.player);
   const d=gridDensity(run.grid,K.grid,K.player.x,K.player.z,E.playerReach).max;assert.equal(f.density.player,d);}
  // Concourse model: inbound = admissions of the gate; one person per lane at a time; outbound = alighting schedule.
  const k=0,G=s.gates[k],conc=runConcourse(G.key,sim.admitLog[k],{E,tEnd:sim.time+40});
  assert.equal(conc.stats.inbound,sim.admitLog[k].length,'every admission enters the concourse');
  const lanes=new Map();for(const p of conc.people){if(p.gateAt===null)continue;assert(p.gateAt>=p.t0-1e-9);if(p.passedAt!==null){assert(p.passedAt>=p.gateAt);if(!lanes.has(p.lane))lanes.set(p.lane,[]);lanes.get(p.lane).push([p.gateAt,p.passedAt]);}}
  for(const list of lanes.values()){list.sort((a,b)=>a[0]-b[0]);for(let j=1;j<list.length;j++)assert(list[j][0]>=list[j-1][1]-1e-9,'one person per gate lane at a time');}
  const sched=outboundExits(JR_GATES[k],E,E.warmup+E.tmax),spawned=sim.outList[k].map(i=>sim.jSpawnAt[i]);assert.deepEqual(spawned,sched.map(Math.fround),'alighting agents follow the concourse exits');
  const cf=concourseFrame(conc,sim.eStart+10);assert.equal(cf.counts.inConcourse,cf.people.length);
  summary.concourse=conc.stats;}
 return {summary,stats:st,steps,levels:sim.jrRoutes.map(R=>({key:R.key,length:Math.round(R.length)})),hash,signal:{clock:sim.clock,time:sim.time}};}

if(!isMainThread){dynamicRun(workerData).then(r=>parentPort.postMessage(r));}
else{
 const sim=new JRCrowdSimulation({...config,agents:500},osm,plateau,traffic);const routes=staticChecks(sim);
 console.log('PASS static',JSON.stringify(routes.map(r=>[r.key,r.gate,r.length])));
 if(process.argv.includes('--static')){console.log(JSON.stringify({routes}));process.exit(0);}
 const opts={agents:arg('--agents',12000),tmax:arg('--tmax',360),warmup:arg('--warmup',30)};
 const other=new Promise((res,rej)=>{const w=new Worker(new URL(import.meta.url),{workerData:{...opts,check:false}});w.on('message',res);w.on('error',rej);});
 const t=Date.now();const a=await dynamicRun(opts);const b=await other;
 const S=a.stats;assert.equal(S.conservation,0,'conservation');assert.equal(S.spawnOff,0,'spawns on start cells only '+JSON.stringify(S.odd));assert.equal(S.alightOff,0,'alighting on gate cells only');
 assert.equal(S.baseExtra,0,'motion codes stay in their populations');assert(S.maxStep<=STEP_MAX,`max step ${S.maxStep}`);assert(S.maxOcc<=4,`occupancy ${S.maxOcc}`);
 assert.equal(S.capacity,0,'admissions within capacity');assert(S.maxClockLag<60,`signal stalled (${S.maxClockLag} s behind)`);
 assert.equal(a.summary.teleports,0,'no teleports');assert.equal(a.summary.rescued,0,'no rescues');assert(S.countChecks>0&&S.densityChecks>0);
 console.log('PASS dynamic',JSON.stringify(S));
 assert.equal(a.hash,b.hash,'two runs give identical summaries');console.log('PASS deterministic',a.hash.slice(0,16),`${((Date.now()-t)/1000).toFixed(1)} s`);
 console.log(JSON.stringify({summary:a.summary,stats:S,routes}));}
