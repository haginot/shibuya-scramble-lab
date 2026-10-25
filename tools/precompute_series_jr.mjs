// Precompute the JR episode crowd run once (node, one thread, ~270-300 s at 48,636 people) and write a slim,
// clone-safe JSON for the series page (web3d/shibuya/series/app-jr.mjs loads it with ?jrrun=<url>):
//   {key, routes, gates, summary, keyframes (stats only: no count grid, no walker positions), keyframe, warmup,
//    concourse:{gate, layout, run}, admitLog, assumptions, approx, ms}
// The page's live solver is the same deterministic JRCrowdSimulation (same config → same positions), so the
// precomputed summary (route outcomes, median times) describes exactly the crowd the video shows.
// Without the file the page runs precomputeJR itself in a worker (crowd-jr-worker.mjs) — same result, slower.
// usage: node tools/precompute_series_jr.mjs OUT.json [--agents N] [--tmax S]
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {precomputeJR,configureJR} from '../web3d/shibuya/series/crowd-jr.mjs';

const out=process.argv[2];if(!out)throw Error('usage: node tools/precompute_series_jr.mjs OUT.json [--agents N] [--tmax S]');
const arg=(k)=>{const i=process.argv.indexOf(k);return i>=0?Number(process.argv[i+1]):null;};
const root=new URL('../web3d/',import.meta.url);
const load=async name=>JSON.parse(await readFile(new URL(`data/shibuya_${name}.json`,root),'utf8'));
const [config,osm,plateau,traffic]=await Promise.all(['config','osm','plateau','traffic'].map(load));
configureJR(config,arg('--tmax')?{tmax:arg('--tmax')}:{});
if(arg('--agents'))config.agents=arg('--agents');
// cache key: solver + scenario sources and the config actually used
const h=createHash('sha256');
for(const f of ['shibuya/series/crowd-jr.mjs','shibuya/halloween.mjs','shibuya/simulation.mjs','data/shibuya_config.json','data/shibuya_osm.json'])h.update(await readFile(new URL(f,root)));
h.update(JSON.stringify({agents:config.agents,jr:config.jr}));
const key=h.digest('hex').slice(0,16);
try{const old=JSON.parse(await readFile(out,'utf8'));if(old.key===key){console.log(`jr run cached (${key})`);process.exit(0);}}catch{}
const t0=Date.now();
const r=precomputeJR(config,osm,plateau,traffic);
const slim={key,agents:config.agents,jr:config.jr,routes:r.routes,gates:r.gates,summary:r.summary,keyframe:r.keyframe,warmup:r.warmup,assumptions:r.assumptions,approx:r.approx,
 keyframes:r.keyframes.map(({grid,walkers,...k})=>k),concourse:r.concourse,admitLog:r.admitLog,ms:Date.now()-t0};
await writeFile(out,JSON.stringify(slim));
console.log(`jr run ${key}: ${slim.keyframes.length} keyframes, ${(Date.now()-t0)/1000|0} s → ${out}`);
for(const R of slim.summary.routes)console.log(`  ${R.key} ${R.outcome} p50 ${R.timeP50} p90 ${R.timeP90} player ${R.player.doneAt}`);
