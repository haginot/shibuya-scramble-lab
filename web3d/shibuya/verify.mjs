// Node verification of the actual physical solver and bundled provenance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation,phaseAt,demandAt,trainPhaseAt} from './simulation.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const c=config.calibration;
assert.equal(c.station_sources.reduce((n,s)=>n+s.daily*s.proxy_factor,0),c.station_event_proxy);
assert(Math.abs(demandAt(15,c,true)-3000)<1e-8);
assert(Math.abs(demandAt(15,c,false)-788.8621323529411)<1e-8);
assert(demandAt(8,c,false)<demandAt(15,c,false));
assert.equal(phaseAt(0,c.signal),'walk');assert.equal(phaseAt(55,c.signal),'clearance');assert.equal(phaseAt(75,c.signal),'vehicles');assert.equal(phaseAt(140,c.signal),'all-red');assert.equal(phaseAt(150,c.signal),'walk');
for(const line of c.trains){assert.equal(trainPhaseAt(line.offset_s,line).travel,0);assert.equal(trainPhaseAt(line.offset_s+line.walk_delay_s,line).travel,0,'alighting must happen while the train dwells');}
assert.equal(plateau.license,'CC BY 4.0');assert.equal(osm.license,'ODbL 1.0');assert.equal(plateau.buildings.length,1050);assert.equal(osm.nearby_150m_total,111);assert.equal(osm.shops.length,1102);
assert.equal(traffic.model,'SUMO on OSM network');assert(traffic.tracks.length>20);assert(traffic.network.signals>0);
for(const track of traffic.tracks){let prev=-1;for(const f of track.frames){assert(f.every(Number.isFinite));assert(f[0]>prev);prev=f[0];}}
const small={...config,agents:800};const a=new Simulation(small,osm,plateau),b=new Simulation(small,osm,plateau);
const initial=a.snapshot();for(let k=0;k<3;k++){a.advance(10);b.advance(10);}
assert.deepEqual(a.snapshot(),b.snapshot(),'same seed must reproduce every individual');
assert(a.snapshot().positions.some((v,i)=>Math.abs(v-initial.positions[i])>1),'agents actually walk');
assert.equal(a.snapshot().funnel.reduce((x,y)=>x+y,0),800);
assert(a.state.some(s=>s>0),'individual awareness changes');
for(let i=0;i<a.n;i++){assert(Number.isFinite(a.x[i]));assert(Number.isFinite(a.z[i]));assert(a.state[i]>=initial.states[i]);}
// Hold the actual shared clock at clearance; active walkers may still move.
a.clock=74.9;a.active=800;a.step(.1);assert(Math.abs(a.clock-74.9)<1e-6);assert.notEqual(a.snapshot().phase,'vehicles');
a.active=0;a.step(.1);assert.equal(a.snapshot().phase,'vehicles');
const empty=new Simulation({...config,agents:0},osm,plateau);assert.equal(empty.advance(1).positions.length,0);
const wrap=new Simulation(small,osm,plateau);wrap.motion.fill(0);wrap.active=0;wrap.clock=149.899999999999;
wrap.advance(.4);assert.equal(wrap.cycle,1);assert.equal(wrap.active,wrap.motion.reduce((n,s)=>n+(s===1),0),'cycle wrap must not admit twice or lose live crossing identities');assert.equal(wrap.admitted,800);
const n=new Simulation({...config,agents:6500},osm,plateau);n.advance(20);assert(n.trainWaves[0]>0);assert.equal(n.snapshot().funnel.reduce((x,y)=>x+y,0),6500);
if(process.argv.includes('--stress')){
 const crowd=new Simulation(config,osm,plateau);let s;
 for(let i=0;i<3;i++)s=crowd.advance(60);
 assert.equal(s.completed,3000,'the full peak phase must be able to clear');
 assert.equal(s.active,0);assert.equal(s.phase,'vehicles');
 assert.equal(s.funnel.reduce((x,y)=>x+y,0),20000);
 console.log('20,000-agent peak regression: all 3,000 admitted agents cleared; SUMO vehicle phase released.');
}
console.log('Shibuya verified: sources, calibration, deterministic individual motion, funnel, signal hold, train waves, SUMO tracks.');
