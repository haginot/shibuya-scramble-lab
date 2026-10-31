#!/usr/bin/env node
// science-sim-v4b: run the v8 'plan' solver (48,000 people, alighting waves) with extra routeDefs for a walker who goes from the
// edge of the crowd INTO the packed area (IN routes) and one who starts in the packed area and tries to get OUT (OUT routes).
// The escape time is MEASURED from the solver (jDone - jBorn of 24 walkers per route). Also dumps agents (window ±HALF) per second,
// the walkers' tracks, the alighting-wave spawn times per gate and local densities.
// usage: node tools/science_sim/you_run.mjs OUT [half=130]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {JRCrowdSimulation,configureJR,HIDDEN} from '../../web3d/shibuya/series/crowd-jr.mjs';
import * as V8 from '../../web3d/shibuya/series/sim-v8.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=process.argv[2],HALF=Number(process.argv[3]||130);fs.mkdirSync(OUT,{recursive:true});
const load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,`web3d/data/shibuya_${n}.json`),'utf8'));
const CENTER=[17.5,22.5],CB=[-37.5,12.5],EDGES={S:[3,109],N:[40,-90],W:[-90,30]};
const mk=(key,from,to,rec)=>({key,kind:'walk-alt',recommended:!!rec,color:'#ffffff',via:[],start:{at:from,label:{ja:key,en:key},sources:['science-sim']},edge:to,label:{ja:key,en:key},sources:['science-sim']});
const routeDefs=[];for(const [cn,C,es] of [['A',CENTER,['S','N']],['B',CB,['W','S']]])for(const e of es){routeDefs.push(mk(`IN${cn}_${e}`,EDGES[e],C,routeDefs.length===0));routeDefs.push(mk(`OUT${cn}_${e}`,C,EDGES[e]));}
const config=load('config');const jr={...V8.scenarioJR('plan'),routeDefs,spawnGap:Number(process.env.GAP||12)};configureJR(config,jr);
const sim=new JRCrowdSimulation(config,load('osm'),load('plateau'),load('traffic'));
// alighting waves: outbound agents (alighting) per gate with their spawn times
const waves=[];for(let k=0;k<sim.outList.length;k++){const G=['hachiko','south','shinminami'][k];for(const id of sim.outList[k])waves.push({gate:G,t:Math.round((sim.jSpawnAt[id]-sim.eStart)*10)/10});}
const fd=fs.openSync(path.join(OUT,'agents.bin'),'w');const tracks=[];let nk=0,t0=Date.now();
const names=routeDefs.map(r=>r.key);
const onKeyframe=k=>{const ids=[],xs=[],zs=[];for(let i=0;i<sim.baseN;i++){const x=sim.x[i],z=sim.z[i];if(x===HIDDEN||Math.abs(x-CENTER[0])>HALF||Math.abs(z-CENTER[1])>HALF)continue;ids.push(i);xs.push(Math.round((x-CENTER[0])*8));zs.push(Math.round((z-CENTER[1])*8));}
 const b=Buffer.alloc(8+ids.length*6);b.writeInt32LE(Math.round(k.t),0);b.writeInt32LE(ids.length,4);ids.forEach((id,j)=>{b.writeUInt16LE(id,8+6*j);b.writeInt16LE(xs[j],10+6*j);b.writeInt16LE(zs[j],12+6*j);});fs.writeSync(fd,b);
 const row={t:k.t,n:ids.length,w:{}};
 sim.routeList.forEach((br,r)=>{row.w[names[r]]=br.ids.map(i=>sim.x[i]===HIDDEN?null:[Math.round(sim.x[i]*100)/100,Math.round(sim.z[i]*100)/100,sim.motion[i]]);});
 const P=sim.routeList[0].ids[0];if(sim.x[P]!==HIDDEN){const d=sim.densityNear(sim.x[P],sim.z[P],6);row.pd=[Math.round(d.max*100)/100,Math.round(d.mean*100)/100];}
 tracks.push(row);nk++;if(nk%30===0)console.log('kf',nk,'t',k.t,'n',ids.length,((Date.now()-t0)/1000|0)+'s');};
const summary=sim.runJR({onKeyframe});fs.closeSync(fd);
const routes=sim.e.routes.map(R=>({key:R.key,start:R.start,zone:R.zone,length:Math.round(R.length),freeFlow:Math.round(R.freeFlow),path:R.path.filter((_,i)=>i%4===0)}));
fs.writeFileSync(path.join(OUT,'you.json'),JSON.stringify({center:CENTER,edges:EDGES,half:HALF,warmup:sim.eStart,keyframes:nk,routes,waves,summary:{numbers:summary.numbers,walkers:summary.walkers,counts:summary.counts,gates:summary.gates,jr:summary.jr,agents:summary.agents},tracks}));
console.log('done',nk,(Date.now()-t0)/1000|0,'s');
