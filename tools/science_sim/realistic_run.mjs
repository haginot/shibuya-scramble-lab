#!/usr/bin/env node
// science-sim-v5b: realistic-conditions re-measure for the Scramble. Same social-force solver (cap 4 p/m²), with
//  - headcount multiplier (config.agents = 48,000 × mult; the share heading for JR gates, boundRate, scales with it),
//  - optional police full-stop windows at the crossing (E.holds) and JR gate closures (E.gateClosures),
//  - 24 walkers per route starting at the packed Hachiko-front corner (centre, 17.5/22.5): to Hachiko / South / New South gate (arrival inside)
//    and turn-back to the north / south edge. Walkers that have not finished by tmax are reported as 'not done' (censored).
// usage: SCEN='{"name":"x3","mult":3,...}' node realistic_run.mjs OUTDIR
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {JRCrowdSimulation,configureJR,HIDDEN,MODEL} from '../../web3d/shibuya/series/crowd-jr.mjs';
import * as V8 from '../../web3d/shibuya/series/sim-v8.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=process.argv[2];fs.mkdirSync(OUT,{recursive:true});
const SC=JSON.parse(process.env.SCEN||'{}');const mult=SC.mult||1,tmax=SC.tmax||3600,HALF=110,STEP=SC.dumpStep||2,DUMPMAX=SC.dumpMax||2400;
const load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,`web3d/data/shibuya_${n}.json`),'utf8'));
const CENTER=[17.5,22.5],START={at:CENTER,label:{ja:'人混みの中心（ハチ公前）',en:'centre'},sources:['science-sim']};
const base=V8.scenarioJR('plan');
const gates=base.routeDefs.filter(r=>['GA','GB','GC'].includes(r.key)).map(r=>({...r,start:START,recommended:r.key==='GA'}));
const mk=(key,to)=>({key,kind:'walk-alt',color:'#fff',via:[],start:START,edge:to,label:{ja:key,en:key},sources:['science-sim']});
const routeDefs=[...gates,mk('OUTN',[40,-90]),mk('OUTS',[3,109])];
const jr={...base,routeDefs,tmax,boundRate:base.boundRate*mult};
if(SC.holds)jr.holds=SC.holds;if(SC.gateClosures)jr.gateClosures=SC.gateClosures;
if(SC.weid){MODEL.weid=true;MODEL.occ=99;}
if(SC.idle){MODEL.idle=SC.idle;}if(SC.moverScale){MODEL.moverScale=SC.moverScale;}
const config=load('config');configureJR(config,jr);config.agents=Math.round(48000*mult);
const sim=new JRCrowdSimulation(config,load('osm'),load('plateau'),load('traffic'));
const waves=[];for(let k=0;k<sim.outList.length;k++){const G=['hachiko','south','shinminami'][k];for(const id of sim.outList[k])waves.push({gate:G,t:Math.round((sim.jSpawnAt[id]-sim.eStart)*10)/10});}
const fd=fs.openSync(path.join(OUT,'agents.bin'),'w');const tracks=[];let nk=0,t0=Date.now();const names=routeDefs.map(r=>r.key);
const onKeyframe=k=>{const t=Math.round(k.t);let ids=[],n=0,inwin=0;
 const wrow={};sim.routeList.forEach((br,r)=>{wrow[names[r]]=br.ids.map(i=>sim.x[i]===HIDDEN?(sim.motion[i]===undefined?null:[null,null,sim.jDone[i]>0?1:0]):[Math.round(sim.x[i]*100)/100,Math.round(sim.z[i]*100)/100,sim.motion[i],Math.round(sim.rhoHere[i]*10)/10]);});
 const row={t,w:wrow,done:sim.routeList.map(br=>br.ids.map(i=>Number.isFinite(sim.jDone[i])?Math.round((sim.jDone[i]-sim.jBorn[i])*10)/10:null))};
 // people within 110 m of the centre, and local density (<=4 m) around walker 0 of GA
 let cnt=0;for(let i=0;i<sim.baseN;i++){const x=sim.x[i];if(x===HIDDEN)continue;if(Math.abs(x-CENTER[0])<=HALF&&Math.abs(sim.z[i]-CENTER[1])<=HALF)cnt++;}row.n=cnt;
 if(t%STEP===0&&t<=DUMPMAX){const xs=[],zs=[];for(let i=0;i<sim.baseN;i++){const x=sim.x[i],z=sim.z[i];if(x===HIDDEN||Math.abs(x-CENTER[0])>HALF||Math.abs(z-CENTER[1])>HALF)continue;ids.push(i);xs.push(Math.round((x-CENTER[0])*8));zs.push(Math.round((z-CENTER[1])*8));}
  const b=Buffer.alloc(8+ids.length*8);b.writeInt32LE(t,0);b.writeInt32LE(ids.length,4);ids.forEach((id,j)=>{b.writeUInt32LE(id,8+8*j);b.writeInt16LE(xs[j],12+8*j);b.writeInt16LE(zs[j],14+8*j);});fs.writeSync(fd,b);}
 tracks.push(row);nk++;if(nk%60===0){console.log('kf',nk,'t',t,'n',cnt,'done',row.done.map(a=>a.filter(v=>v!=null).length).join('/'),((Date.now()-t0)/1000|0)+'s');fs.writeFileSync(path.join(OUT,'partial.json'),JSON.stringify({SC,tracks}));}};
const summary=sim.runJR({onKeyframe});fs.closeSync(fd);
fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify({SC,agents:config.agents,warmup:sim.eStart,keyframes:nk,routes:sim.e.routes.map(R=>({key:R.key,length:Math.round(R.length),freeFlow:Math.round(R.freeFlow)})),waves,summary:{counts:summary.counts,gates:summary.gates},tracks}));
console.log('done',nk,(Date.now()-t0)/1000|0,'s');
