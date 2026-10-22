// Node verification of the actual physical solver, signal/vehicle coupling and
// bundled provenance. `--stress` runs the full stats-derived population.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {vehiclePoses} from './traffic.mjs';
import {Simulation,CORNERS,MOTION,phaseAt,demandAt,populationAt,trainPhaseAt} from './simulation.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const c=config.calibration;

// --- Calibration and sources ---
assert.equal(c.station_sources.reduce((n,s)=>n+s.daily*s.proxy_factor,0),c.station_event_proxy);
assert(Math.abs(demandAt(15,c,true)-3000)<1e-8,'14-16h reach the reported 3,000 per green');
assert(Math.abs(demandAt(15,c,false)-788.8621323529411)<1e-8);
assert(Math.abs(demandAt(18,c,true)-2640)<1e-8);
assert(demandAt(8,c,false)<demandAt(15,c,false));
assert.equal(populationAt(18,c),34710,"Little's law: 2,145,705 × .88/13.6 × 15 min");
assert(populationAt(3,c)<populationAt(8,c)&&populationAt(8,c)<populationAt(15,c));
assert.equal(c.crossing_survey.reported_max_per_green,3000);assert.equal(c.presence.street_dwell_min,15);
assert.equal(phaseAt(0,c.signal),'walk');assert.equal(phaseAt(55,c.signal),'clearance');assert.equal(phaseAt(75,c.signal),'vehicles');assert.equal(phaseAt(140,c.signal),'all-red');assert.equal(phaseAt(150,c.signal),'walk');
for(const line of c.trains){assert.equal(trainPhaseAt(line.offset_s,line).travel,0);assert.equal(trainPhaseAt(line.offset_s+line.walk_delay_s,line).travel,0,'alighting must happen while the train dwells');}
assert.equal(plateau.license,'CC BY 4.0');assert.equal(osm.license,'ODbL 1.0');assert.equal(plateau.buildings.length,1050);assert.equal(osm.nearby_150m_total,111);assert.equal(osm.shops.length,1102);
assert.equal(traffic.model,'SUMO on OSM network');assert(traffic.tracks.length>20);assert(traffic.network.signals>0);
for(const track of traffic.tracks){let prev=-1;for(const f of track.frames){assert(f.every(Number.isFinite));assert(f[0]>prev);prev=f[0];}}

// --- SUMO vehicles obey the scramble signal ---
// While pedestrians have the all-way walk (and its clearance), no vehicle is inside
// the scramble polygon (plus a 1 m margin) and none moves there.
function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const edgeDist=(x,z)=>Math.min(...CORNERS.map((a,i)=>{const b=CORNERS[(i+1)%6],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);}));
const inScramble=(x,z,margin)=>inside(x,z,CORNERS)||edgeDist(x,z)<margin;
let held=0,stoppedAtLine=0,released=0;
for(let t=0;t<150;t+=.25){const phase=phaseAt(t,c.signal),now=vehiclePoses(traffic,t),before=new Map(vehiclePoses(traffic,t-.25).map(p=>[p.id,p]));
 for(const car of now){const b=before.get(car.id),speed=b?Math.hypot(car.x-b.x,car.z-b.z)/.25:0;
  if(phase==='walk'||phase==='clearance'){assert(!inScramble(car.x,car.z,1),`vehicle ${car.id} inside the scramble at ${t}s (${phase})`);held++;
   if(Math.hypot(car.x,car.z)<45&&speed<.05)stoppedAtLine++;}
  else if(phase==='vehicles'&&inside(car.x,car.z,CORNERS)&&speed>.5)released++;}}
assert(held>1000,'vehicles exist during the pedestrian phase');assert(stoppedAtLine>100,'cars queue at the stop lines on red');assert(released>100,'cars cross the junction on green');

// --- Individual agents ---
const small={...config,agents:800};const a=new Simulation(small,osm,plateau,traffic),b=new Simulation(small,osm,plateau,traffic);
const initial=a.snapshot();for(let k=0;k<3;k++){a.advance(10);b.advance(10);}
assert.deepEqual(a.snapshot(),b.snapshot(),'same seed must reproduce every individual');
assert(a.snapshot().positions.some((v,i)=>Math.abs(v-initial.positions[i])>1),'agents actually walk');
assert.equal(a.snapshot().funnel.reduce((x,y)=>x+y,0),800);
assert(a.state.some(s=>s>0),'individual awareness changes');
for(let i=0;i<a.n;i++){assert(Number.isFinite(a.x[i]));assert(Number.isFinite(a.z[i]));assert(a.state[i]>=initial.states[i]);}
// Hold the actual shared clock at the end of clearance while anyone crosses.
a.clock=74.9;a.active=800;a.step(.1);assert(Math.abs(a.clock-74.9)<1e-6);assert.notEqual(a.snapshot().phase,'vehicles');
for(let i=0;i<a.n;i++){a.motion[i]=MOTION.BACKGROUND;a.placeBackground(i);}a.active=0;
a.x[0]=0;a.z[0]=0;assert(a.roadBlocked(0,0));a.step(.1);assert(Math.abs(a.clock-74.9)<1e-6,'even a non-crossing pedestrian in the carriageway must hold traffic');
a.placeBackground(0);a.step(.1);assert.equal(a.snapshot().phase,'vehicles');
const empty=new Simulation({...config,agents:0},osm,plateau,traffic);assert.equal(empty.advance(1).positions.length,0);
// Cycle wrap releases every queued person exactly once.
const wrap=new Simulation(small,osm,plateau,traffic);for(let i=0;i<wrap.n;i++){wrap.motion[i]=MOTION.BACKGROUND;}for(let i=0;i<120;i++)wrap.placeQueue(i,i%6);wrap.active=0;wrap.clock=149.9;
wrap.advance(.4);assert.equal(wrap.cycle,1);assert(wrap.admitted>=120&&wrap.admitted<=122,"queued walkers (plus any same-step arrival) depart");assert.equal(wrap.active,wrap.motion.reduce((n,s)=>n+(s===MOTION.CROSS),0),'cycle wrap must not admit twice or lose crossing identities');
// The safety valve is reported separately and never counts as a crossing.
{const v=new Simulation(small,osm,plateau,traffic);let i=0;while(v.motion[i]!==MOTION.CROSS)i++;v.entered[i]=1;v.delay[i]=0;v.timer[i]=151;const before={completed:v.completed,admitted:v.admitted,active:v.active};v.step(.1);
 assert.equal(v.rescued,1);assert.equal(v.rescuedCycle,1);assert(v.completed<=before.completed+5&&v.motion[i]!==MOTION.CROSS);assert.equal(v.snapshot().rescued,1);
 const done=v.completed;v.motion.forEach((m,j)=>{if(m===MOTION.CROSS){v.motion[j]=MOTION.BACKGROUND;v.placeBackground(j);}});assert.equal(done+v.rescuedCycle<=v.admitted,true,'completed + rescued never exceed admissions');}
// Queue capacity: a full corner refuses new arrivals (counted as deferred).
{const q=new Simulation(small,osm,plateau,traffic);q.queueLoad.fill(0);const cap=k=>Math.floor(q.g.zones[k].length*2.5);for(let k=0;k<6;k++)q.queueLoad[k]=cap(k);const r=q.g.zones[4].at(-1),x=r%q.g.rsize-q.g.R+.5,z=Math.floor(r/q.g.rsize)-q.g.R+.5;assert.equal(q.chooseCorner(x,z),-1,'full corners refuse arrivals');q.queueLoad[4]=0;assert.equal(q.chooseCorner(x,z),4);}
const n=new Simulation({...config,agents:6500},osm,plateau,traffic);n.advance(20);assert(n.trainWaves[0]>0);assert.equal(n.snapshot().funnel.reduce((x,y)=>x+y,0),6500);

if(process.argv.includes('--stress')){
 const N=populationAt(18,c),crowd=new Simulation({...config,agents:N,hour:18,peak:true},osm,plateau,traffic);let s,cycles=0,admittedTotal=0,releases=0,checked=0;
 for(let i=0;i<crowd.n;i++){assert(!crowd.blocked(crowd.x[i],crowd.z[i]),`initial ${i} must be walkable`);if(crowd.motion[i]!==MOTION.CROSS)assert(!crowd.roadBlocked(crowd.x[i],crowd.z[i]),`initial ${i} must stay outside carriageway`);}
 const bucket=new Map(),cell=4;let prevPhase=null;
 for(let frame=0;frame<330;frame++){
  const before=crowd.admitted,cycle=crowd.cycle;s=crowd.advance(1);if(crowd.cycle!==cycle){admittedTotal+=before;cycles++;}
  for(let i=0;i<crowd.n;i++)if(crowd.motion[i]!==MOTION.CROSS)assert(!crowd.roadBlocked(crowd.x[i],crowd.z[i]),`non-crossing ${i} entered carriageway at ${crowd.time}`);
  if(s.phase==='vehicles'){assert.equal(crowd.conflictCount(),0,'all pedestrians must clear before vehicle release');assert.equal(s.active,0,'no crossing walker remains when vehicles go');
   if(prevPhase!=='vehicles'){releases++;assert.equal(s.rescuedCycle,0,'nobody was teleported by the safety valve');assert.equal(s.completed,s.admitted,'every admitted walker reached the far side on foot before release');}}
  prevPhase=s.phase;
  // No vehicle body overlaps any pedestrian, in any phase.
  bucket.clear();for(let i=0;i<crowd.n;i++){const k=`${Math.floor(crowd.x[i]/cell)},${Math.floor(crowd.z[i]/cell)}`;let l=bucket.get(k);if(!l)bucket.set(k,l=[]);l.push(i);}
  for(const car of vehiclePoses(traffic,s.clock)){const co=Math.cos(car.angle),si=Math.sin(car.angle),cx=Math.floor(car.x/cell),cz=Math.floor(car.z/cell);
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const i of bucket.get(`${cx+dx},${cz+dz}`)||[]){checked++;const x=crowd.x[i]-car.x,z=crowd.z[i]-car.z;assert(!(Math.abs(x*co-z*si)<1.13&&Math.abs(x*si+z*co)<2.48),`vehicle ${car.id} intersects pedestrian ${i} at clock ${s.clock} (${s.phase})`);}}
 }
 assert(releases>=2,'traffic is released after each pedestrian phase');assert(checked>0);
 assert(cycles>=2,'two full signal cycles');const mean=admittedTotal/cycles;assert(mean>.6*s.quota&&mean<1.4*s.quota,`realised departures per cycle ${mean} track the hourly quota ${s.quota}`);
 assert.equal(s.rescued,0,'no walker needed the safety valve');assert(s.lastCycle.completed>0&&s.lastCycle.rescued===0,'per-cycle realised crossings are reported');assert.equal(s.funnel.reduce((x,y)=>x+y,0),N);
 console.log(`${N.toLocaleString()}-agent evening regression: ${cycles} cycles, ${Math.round(mean)} departures/cycle (quota ${s.quota}); no carriageway intrusions or vehicle overlaps; SUMO vehicles released only after clearance.`);
}
console.log('Shibuya verified: sources, calibration, Little\'s-law population, SUMO stop lines vs scramble, deterministic individual motion, funnel, signal hold, train waves.');
