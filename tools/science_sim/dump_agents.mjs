#!/usr/bin/env node
// science-sim-v2: re-run the v8 'plan' crowd solver (deterministic, same as tools/v8_sim.mjs) and dump EVERY agent inside a
// square window around the Scramble (model origin) at each 1 s keyframe, so the video can render the real trajectories.
// out: OUT/agents.bin  per keyframe: int32 t, int32 n, then n * (uint16 id, int16 x*8, int16 z*8)   OUT/meta.json
// usage: node tools/science_sim/dump_agents.mjs OUT [scenario=plan] [half=260]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {JRCrowdSimulation,configureJR,HIDDEN} from '../../web3d/shibuya/series/crowd-jr.mjs';
import * as V8 from '../../web3d/shibuya/series/sim-v8.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=process.argv[2],name=process.argv[3]||'plan',HALF=Number(process.argv[4]||260);fs.mkdirSync(OUT,{recursive:true});
const load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,`web3d/data/shibuya_${n}.json`),'utf8'));
const config=load('config');configureJR(config,V8.scenarioJR(name));
const sim=new JRCrowdSimulation(config,load('osm'),load('plateau'),load('traffic'));
const fd=fs.openSync(path.join(OUT,'agents.bin'),'w');let nk=0,t0=Date.now();
const onKeyframe=k=>{const ids=[],xs=[],zs=[];for(let i=0;i<sim.baseN;i++){const x=sim.x[i],z=sim.z[i];if(x===HIDDEN||Math.abs(x)>HALF||Math.abs(z)>HALF)continue;ids.push(i);xs.push(Math.round(x*8));zs.push(Math.round(z*8));}
 const b=Buffer.alloc(8+ids.length*6);b.writeInt32LE(Math.round(k.t),0);b.writeInt32LE(ids.length,4);ids.forEach((id,j)=>{b.writeUInt16LE(id,8+6*j);b.writeInt16LE(xs[j],10+6*j);b.writeInt16LE(zs[j],12+6*j);});
 fs.writeSync(fd,b);nk++;if(nk%30===0)console.log('kf',nk,'t',k.t,'n',ids.length,((Date.now()-t0)/1000|0)+'s');};
sim.runJR({onKeyframe});fs.closeSync(fd);
fs.writeFileSync(path.join(OUT,'meta.json'),JSON.stringify({scenario:name,half:HALF,keyframes:nk,agents:config.agents,baseN:sim.baseN,warmup:sim.eStart}));
console.log('done',nk);
