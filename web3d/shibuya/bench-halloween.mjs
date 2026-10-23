// Solver step latency and memory for the Halloween crowd (48,000 agents) and the two
// dispersal runs (16,000 each), in Node on one core per solver, as the browser workers run them.
//   node web3d/shibuya/bench-halloween.mjs [--steps 600]
// Rendering cost (draw calls, triangles, frame time) is logged per frame by the recorder
// (tools/record_shibuya.py → recording.json); see docs/HALLOWEEN.md.
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {HalloweenSimulation,HALLOWEEN} from './halloween.mjs';
import {DispersalSimulation} from './dispersal.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?Number(process.argv[i+1]):d;};
const steps=arg('--steps',600),pct=(v,p)=>v[Math.min(v.length-1,Math.floor(p*v.length))];
const mb=()=>Math.round(process.memoryUsage().rss/1048576);
async function bench(name,make,warm){const t0=performance.now(),sim=make(),init=performance.now()-t0;for(let k=0;k<warm;k++)sim.step(.1);
 const ms=[];for(let k=0;k<steps;k++){const t=performance.now();sim.step(.1);ms.push(performance.now()-t);}
 const t=performance.now();const snap=sim.snapshot(),snapMs=performance.now()-t;ms.sort((a,b)=>a-b);
 const row={name,agents:sim.n,initMs:Math.round(init),stepMs:{p50:+pct(ms,.5).toFixed(1),p95:+pct(ms,.95).toFixed(1),p99:+pct(ms,.99).toFixed(1),max:+ms.at(-1).toFixed(1)},snapshotMs:+snapMs.toFixed(1),
  transferMB:+(snap.positions.byteLength*3/1048576).toFixed(2),realtimeFactor:+(100/pct(ms,.5)).toFixed(1),rssMB:mb()};
 console.log(JSON.stringify(row));return row;}
const H=await bench('halloween',()=>new HalloweenSimulation({...config,mode:'halloween',agents:HALLOWEEN.agents,hour:HALLOWEEN.hour},osm,plateau,traffic),300);
const D=await bench('dispersal-none',()=>new DispersalSimulation({...config,hour:23.5,strategy:'none'},osm,plateau,traffic),3000);
const M=await bench('dispersal-managed',()=>new DispersalSimulation({...config,hour:23.5,strategy:'managed'},osm,plateau,traffic),3000);
console.log(`step = 0.1 simulated s; realtime factor = simulated/wall at the median step · RSS includes all three solvers built in this process`);
