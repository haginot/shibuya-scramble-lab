// Sensitivity sweep of the station-closing dispersal comparison (Node, no rendering).
// Each scenario runs both strategies on the real solver for the 25 simulated minutes the
// video shows and records what the solver measured. Nothing here decides a winner: the
// output lists every case, including the ones where management helps less, and the
// video's range card and docs/HALLOWEEN.md are generated from this file.
//   node web3d/shibuya/sweep-dispersal.mjs [--jobs 7] [--out web3d/data/shibuya_dispersal_sweep.json]
import {readFile,writeFile} from 'node:fs/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import os from 'node:os';
import {DispersalSimulation,DISPERSAL} from './dispersal.mjs';

export const SWEEP_SECONDS=1500;
const BASE={inside:DISPERSAL.inside,plaza:DISPERSAL.plaza};
// Scenario list: [key, label, config change, strategies run (others reuse the baseline run)].
export const SCENARIOS=[
 ['base','shipped scenario (seed 7)',{},['none','managed']],
 ['seed11','seed 11',{seed:11},['none','managed']],
 ['seed23','seed 23',{seed:23},['none','managed']],
 ['seed101','seed 101',{seed:101},['none','managed']],
 ['demand60','demand ×0.6 (9,600 people)',{inside:5400,plaza:4200},['none','managed']],
 ['demand125','demand ×1.25 (20,000 people; the plaza is full at 7,000, so the extra wait inside)',{inside:13000,plaza:7000},['none','managed']],
 ['cap70','gate capacity ×0.7',{dispersal:{capScale:.7}},['none','managed']],
 ['cap130','gate capacity ×1.3',{dispersal:{capScale:1.3}},['none','managed']],
 ['destUniform','destinations uniform',{dispersal:{destPower:0}},['none','managed']],
 ['destWide','destinations ∝ street width²',{dispersal:{destPower:1}},['none','managed']],
 ['comply80','80 % follow police instructions',{dispersal:{compliance:.8}},['managed']],
 ['comply60','60 % follow police instructions',{dispersal:{compliance:.6}},['managed']],
 ['spill30','no-control spill-over after 30 s',{dispersal:{spillAfter:30}},['none']],
 ['spillNever','no-control crowd never ignores the signal',{dispersal:{spillAfter:Infinity}},['none']],
];

async function run({key,change,strategy}){
 const load=async name=>JSON.parse(await readFile(new URL(`../data/shibuya_${name}.json`,import.meta.url),'utf8'));
 const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
 const sim=new DispersalSimulation({...config,...change,hour:23.5,strategy},osm,plateau,traffic),marks=[];
 for(let k=1;k<=SWEEP_SECONDS*10;k++){sim.step(.1);if(k%3000===0){const r=sim.now;marks.push({t:r.t,inside:r.inside,area:r.held+r.walking,left:r.left,densePeak:r.densePeak});}}
 const s=sim.snapshot();
 // Conservation check on every run (the sweep refuses to report a run that loses people).
 if(s.inside+s.held+s.walking+s.left!==sim.n||s.lost||s.teleports)throw Error(`${key}/${strategy}: people not conserved`);
 return {key,strategy,agents:sim.n,remaining:s.remaining,inside:s.inside,inArea:s.held+s.walking,left:s.left,stationEmptyAt:s.stationEmptyAt,denseClearedAt:s.denseClearedAt,
  crushPersonMinutes:s.crushPersonMinutes,peakCell:s.peakCell,carsHeld:s.holdTotal,spillTime:s.spillTime,marks};
}

if(!isMainThread)parentPort.postMessage(await run(workerData));
else{
 const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
 const jobs=Number(arg('--jobs',Math.max(1,os.cpus().length-1))),out=arg('--out',new URL('../data/shibuya_dispersal_sweep.json',import.meta.url).pathname);
 const tasks=SCENARIOS.flatMap(([key,,change,strategies])=>strategies.map(strategy=>({key,change,strategy})));
 const results=[];let next=0;const t0=Date.now();
 await Promise.all(Array.from({length:Math.min(jobs,tasks.length)},async()=>{while(next<tasks.length){const task=tasks[next++];
  const r=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:task});w.on('message',resolve);w.on('error',reject);});
  results.push(r);console.log(`${r.key}/${r.strategy}: remaining ${r.remaining} · station empty ${r.stationEmptyAt} · dense cleared ${r.denseClearedAt} · ${((Date.now()-t0)/1000).toFixed(0)} s`);}}));
 const get=(key,strategy)=>results.find(r=>r.key===key&&r.strategy===strategy)||results.find(r=>r.key==='base'&&r.strategy===strategy);
 const scenarios=SCENARIOS.map(([key,label,change])=>({key,label,change:JSON.parse(JSON.stringify(change,(k,v)=>v===Infinity?'never':v)),none:get(key,'none'),managed:get(key,'managed')}));
 await writeFile(out,JSON.stringify({seconds:SWEEP_SECONDS,threshold:DISPERSAL.dense,base:BASE,scenarios},null,1)+'\n');
 console.log(`wrote ${out} (${tasks.length} runs, ${((Date.now()-t0)/1000).toFixed(0)} s)`);
}
