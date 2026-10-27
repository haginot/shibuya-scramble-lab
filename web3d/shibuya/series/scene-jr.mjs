// Shared JR編 scene for the branching variants (series/app-variant.mjs): the same world as the pilot page
// (series/app-jr.mjs — left untouched so the pilot render stays reproducible): city.mjs + realism.mjs (PLATEAU LOD2,
// night look) + station-jr.mjs + landmarks-jr.mjs + wide-area.mjs + vehicles + halloween-scene.mjs (police, barriers)
// + the live JR crowd solver (crowd-jr-worker.mjs) as ORDINARY people (costume.mjs ordinary mode), plus the variant
// set pieces (sets-variants.mjs) and near-camera people (people-close.mjs NearPeople).
//
//   const S = await buildJRScene(params, {recording, status})
//   S.parts          {camera, sky, R, st, LM, wide, city, crowd, hs, vehicles, post, sets} (shots-variants applyEnv)
//   S.ctx            shots-variants ctx {osm, st, wide, wideData, insideBuilding, sets, aspect, routes}
//   S.stepTo(abs, cpt)   step the solver monotonically to absolute solver time abs (warm-up offset included)
//   S.state          latest solver snapshot; S.eStart (solver warm-up seconds before JR time 0)
//   S.updateCrowd(dtSim) crowd.update from the snapshot (alpha interpolation), HalloweenScene + vehicles
//   S.cullCrowd(maxDist, layersOn) → drawn   (CPU frustum/distance compaction, as the pilot)
//   S.interior(on, tSim, cam)   concourse + Yamanote platform people from the precomputed run (if loaded)
//   S.loadRun()      precomputed run (?jrrun=URL) — optional for variants (only the interior shot uses it)
//   S.render()       reflection pass (unless flat) + post chain;  S.finish() GPU sync (honest ms)
//   S.project(x,y,z) → {x, y, inFrame} CSS px
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {Vehicles} from '../vehicles.mjs';
import {CostumeCrowd,costumeOf} from '../costume.mjs';
import {HalloweenScene} from '../halloween-scene.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation,PLATFORM_Y} from './station-jr.mjs';
import {loadWideArea,createWideArea} from './wide-area.mjs';
import {configureJR,concourseFrame} from './crowd-jr.mjs';
import {createLandmarks} from './landmarks-jr.mjs';
import {createSets} from './sets-variants.mjs';

const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
export const LOOK=Object.freeze({stride:.5,key:.7,nearDim:.6});// pilot series look (QA M1)

export async function buildJRScene(params,{recording=false,status=()=>{},routes={},crowd:withCrowd=true}={}){
 const base=new URL('../../data/',import.meta.url).href;
 const [config,osm,plateau,traffic,lod2,wideData]=await Promise.all([json(base+'shibuya_config.json'),json(base+'shibuya_osm.json'),json(base+'shibuya_plateau.json'),json(base+'shibuya_traffic.json'),loadLod2(),loadWideArea()]);
 configureJR(config);
 if(params.has('agents')){const n=Number(params.get('agents'));if(!Number.isInteger(n)||n<0||n>60000)throw Error('agents must be 0..60000');config.agents=n;}
 const runPromise=params.get('jrrun')?json(params.get('jrrun')):null;
 const W=innerWidth,H=innerHeight,pr=Number(params.get('pr')||1);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:recording,powerPreference:'high-performance'});
 renderer.setPixelRatio(pr);renderer.setSize(W,H,false);renderer.info.autoReset=false;document.getElementById('view').append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.3,9000);
 const sky=makeSky(scene);
 const city=buildCity({scene,osm,plateau,config,theme:null});
 const post=new Post(renderer);post.setSize(Math.round(W*pr),Math.round(H*pr));
 const wide=wideData?createWideArea(scene,wideData,{shared}):null;
 const R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true,skylineAvoid:wide?.bounds??null}});
 const st=createJRStation(scene,{shared,osm});
 const LM=createLandmarks(scene,{shared});
 const vehicles=new Vehicles(scene,traffic);
 const sets=createSets(scene,{shared,osm,wideData,insideBuilding:R.insideBuilding});
 for(const [id,r] of Object.entries(routes||{}))if(r?.points?.length>1)sets.addRoute(id,r.points,r.style||{});
 for(const o of [...city.reflective,sky,vehicles.mesh])o.layers.enable(1);
 const mirror=new THREE.PerspectiveCamera(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
 city.reflectTarget.setSize(Math.round(W*pr/2),Math.round(H*pr/2));
 function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
  mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
  city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}

 // ---------- crowd (live solver in a worker, as the pilot) ----------
 let worker=null,req=0,state=null,simAbs=0;const pending=new Map();
 const request=data=>new Promise((resolve,reject)=>{const id=++req;pending.set(id,{resolve,reject});worker.postMessage({id,...data});});
 let crowd=null,nAgents=0,hs=null,eStart=config.jr?.warmup??150;
 if(withCrowd){
  worker=new Worker(new URL('./crowd-jr-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data);};
  worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();status(e.message);};
  status('群衆シミュレーションを準備中…');
  state=await request({type:'init',config,osm,plateau,traffic});simAbs=state.time;
  nAgents=state.positions.length/2;
  crowd=new CostumeCrowd(scene,nAgents,{ordinary:true});crowd.uniforms.uStride.value=LOOK.stride;crowd.uniforms.uKey.value=LOOK.key;
  // QA v6: the street layout's cones / police gate bars that fall inside the (enclosed) Hachiko paid concourse footprint
  // showed through the gate line as 「tape and cones」 in the void behind the gates — keep them out of the station
  const HB=st.anchors.hachikoConcourseBox,outHB=o=>!HB||!(o.x>HB.x0&&o.x<HB.x1&&o.z>HB.z0&&o.z<HB.z1);
  const hsLayout=HB?{...state.layout,cones:(state.layout.cones||[]).filter(outHB),barriers:(state.layout.barriers||[]).filter(outHB)}:state.layout;
  hs=params.get('hs')==='0'?null:new HalloweenScene({scene,layout:hsLayout,city});if(hs?.bubble)hs.bubble.visible=false;}
 const style0=crowd?crowd.body.geometry.getAttribute('aStyle').array.slice():null,layer0=crowd?crowd.layers.map(L=>L.mesh.geometry.getAttribute('aStyle').array.slice()):[];
 const frustum=new THREE.Frustum(),pm=new THREE.Matrix4(),sph=new THREE.Sphere(new THREE.Vector3(),1.3),keep=new Uint8Array(Math.max(1,nAgents));
 function cullCrowd(maxDist,layersOn){if(!crowd)return 0;pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
  const d=crowd.data,cx=camera.position.x,cz=camera.position.z,m2=maxDist*maxDist;let n=0;
  for(let i=0;i<nAgents;i++){const x=d[4*i],z=d[4*i+1];let k=0;if(x>-5000&&(x-cx)*(x-cx)+(z-cz)*(z-cz)<m2){sph.center.set(x,1,z);k=frustum.intersectsSphere(sph)?1:0;}keep[i]=k;}
  for(let li=0;li<crowd.layers.length;li++){const L=crowd.layers[li],o=L.data,sa=L.mesh.geometry.getAttribute('aStyle'),S=sa.array,S0=layer0[li];let c=0;
   if(layersOn)for(let k=0;k<L.idx.length;k++){if(!keep[L.idx[k]])continue;for(let q=0;q<4;q++){o[4*c+q]=o[4*k+q];S[4*c+q]=S0[4*k+q];}c++;}
   L.mesh.geometry.instanceCount=c;L.mesh.visible=c>0;L.attr.needsUpdate=true;sa.needsUpdate=true;}
  const bs=crowd.body.geometry.getAttribute('aStyle'),S=bs.array;
  for(let i=0;i<nAgents;i++){if(!keep[i])continue;for(let q=0;q<4;q++){d[4*n+q]=d[4*i+q];S[4*n+q]=style0[4*i+q];}n++;}
  crowd.body.geometry.instanceCount=n;crowd.attr.needsUpdate=true;bs.needsUpdate=true;return n;}
 async function stepTo(target,cpt){if(!crowd)return null;let last=state;
  while(simAbs<target-1e-9){const d=Math.min(30,target-simAbs);const final=simAbs+d>=target-1e-9;last=await request({type:'advance',seconds:d,camera:final?cpt:undefined});simAbs+=d;}
  state=last;return state;}
 function updateCrowd(dtSim){if(!crowd)return;const dt=state.dt||.1,alpha=Math.max(0,Math.min(1,state.alpha||0));crowd.update(state,alpha,dtSim);
  const simTime=state.time-dt+alpha*dt;hs?.update(simTime);hs?.gates(state.gates,dtSim);vehicles.update(Math.max(0,state.clock-dt+alpha*dt));}

 // ---------- interior people (precomputed concourse run; pilot code) ----------
 const BINS=18,inner=[];for(let b=0;b<BINS;b++){const c=new CostumeCrowd(scene,120,{ordinary:true,style:i=>costumeOf(i+b*120+7,{ordinary:true})});c.uniforms.uLift.value=b*.5;c.uniforms.uStride.value=LOOK.stride;c.uniforms.uKey.value=LOOK.key;c.place([]);c.body.geometry.instanceCount=0;for(const L of c.layers)L.mesh.geometry.instanceCount=0;c.visible=false;inner.push(c);}
 function placeInterior(list){const by=Array.from({length:BINS},()=>[]);for(const p of list){const b=Math.max(0,Math.min(BINS-1,Math.round(p.y/.5)));if(by[b].length<120)by[b].push({x:p.x,z:p.z,angle:p.heading});}
  by.forEach((l,b)=>{const c=inner[b];c.place(l);c.body.geometry.instanceCount=l.length;for(const L of c.layers){let k=0;for(const i of L.idx)if(i<l.length)k++;L.mesh.geometry.instanceCount=Math.min(k,L.idx.length);}c.visible=l.length>0;});}
 const PCAP=420,plat=new CostumeCrowd(scene,PCAP,{ordinary:true,style:i=>costumeOf(i+5003,{ordinary:true})});plat.uniforms.uLift.value=PLATFORM_Y;plat.uniforms.uStride.value=LOOK.stride;plat.uniforms.uKey.value=LOOK.key;
 plat.place([]);plat.body.geometry.instanceCount=0;for(const L of plat.layers)L.mesh.geometry.instanceCount=0;plat.visible=false;
 const yamP=st.platforms.find(p=>p.name==='yamanote');const pcum=[0];if(yamP)for(let i=1;i<yamP.strip.length;i++)pcum.push(pcum[i-1]+Math.hypot(yamP.strip[i][0]-yamP.strip[i-1][0],yamP.strip[i][1]-yamP.strip[i-1][1]));
 const hsh=n=>{let t=(n*2654435761)>>>0;t^=t>>>15;t=Math.imul(t,2246822519)>>>0;t^=t>>>13;return (t>>>0)/4294967296;};
 function onStrip(d,lat){const S=yamP.strip;d=Math.max(0,Math.min(pcum.at(-1),d));let i=1;while(i<S.length-1&&pcum[i]<d)i++;const a=S[i-1],b=S[i],u=(d-pcum[i-1])/((pcum[i]-pcum[i-1])||1);
  const x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,w=Math.max(.4,(a[2]+(b[2]-a[2])*u)-1.5),dx=a[3],dz=a[4];return {x:x+dz*lat*w,z:z-dx*lat*w,dx,dz};}
 function platformPeople(cr,t){if(!yamP||!cr)return [];const out=[],speed=1.15;
  for(const p of cr.people){const h1=hsh(p.id*3+1),h2=hsh(p.id*3+2),D=6+h1*Math.min(90,pcum.at(-1)-8),lat=h2*2-1;
   if(p.dir>0&&p.doneAt!=null){const dt=t-p.doneAt;if(dt<0||dt>150)continue;const d=Math.min(D,dt*speed),q=onStrip(d,lat*Math.min(1,d/6));const walking=d<D;out.push({x:q.x,z:q.z,angle:walking?Math.atan2(q.dx,q.dz):Math.atan2(q.dx,q.dz)+(h2>.5?1.4:-1.4)});}
   else if(p.dir<0){const dt=p.t0-t;if(dt<0||dt>D/speed+20)continue;const d=Math.min(D,dt*speed),q=onStrip(d,lat*Math.min(1,d/6));out.push({x:q.x,z:q.z,angle:Math.atan2(-q.dx,-q.dz)});}
   if(out.length>=PCAP)break;}
  return out;}
 function placePlatform(list){plat.place(list);plat.body.geometry.instanceCount=list.length;for(const L of plat.layers){let k=0;for(const i of L.idx)if(i<list.length)k++;L.mesh.geometry.instanceCount=Math.min(k,L.idx.length);}}
 let run=null;
 async function loadRun(){if(run||!runPromise)return run;run=await runPromise;return run;}
 function interior(on,tSim,cam){if(!on||!run?.concourse?.run){for(const c of inner)c.visible=false;plat.visible=false;return 0;}
  const cr=run.concourse.run,fr=concourseFrame(cr,tSim),far=p=>Math.hypot(p.x-cam.pos.x,p.z-cam.pos.z)>2.4||Math.abs(p.y+1.6-cam.pos.y)>1.2;
  placeInterior((fr?.people||[]).filter(far));placePlatform(platformPeople(cr,tSim).filter(p=>Math.hypot(p.x-cam.pos.x,p.z-cam.pos.z)>2.2));
  for(const c of [...inner,plat]){c.uniforms.uNearDim.value=LOOK.nearDim*.4;c.uniforms.uFill.value=c===plat?.32:.18;}plat.visible=plat.body.geometry.instanceCount>0;return fr?.people?.length||0;}

 const v3=new THREE.Vector3();
 function project(x,y,z){v3.set(x,y,z).project(camera);const sx=(v3.x+1)/2*W,sy=(1-v3.y)/2*H;return {x:sx,y:sy,inFrame:v3.z<1&&v3.z>-1&&sx>=0&&sx<=W&&sy>=0&&sy<=H};}
 const px=new Uint8Array(4);
 const S={THREE,renderer,scene,camera,sky,city,post,wide,wideData,R,st,LM,vehicles,sets,crowd,hs,config,osm,W,H,pr,nAgents,
  get state(){return state;},get eStart(){return eStart;},get run(){return run;},
  parts:{camera,sky,R,st,LM,wide,city,crowd,hs,vehicles,post,sets},
  ctx:{osm,st,wide,wideData,insideBuilding:R.insideBuilding,sets,aspect:W/H,routes:{...(wideData?.pilotRoutes||{}),...routes}},
  stepTo,updateCrowd,cullCrowd,interior,loadRun,project,
  render(flat){renderer.info.reset();if(!flat)renderReflection();post.render(scene,camera);},
  finish(){const gl=renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);},
  compile(){try{renderer.compile(scene,camera);}catch(e){console.warn('compile',e.message);}}};
 return S;}
