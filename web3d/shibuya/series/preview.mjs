// Standalone geometry/camera preview for the series realism layer (no solver worker):
//   web3d/shibuya/series/preview.html?rig=aerial&t=0[&people=6000][&wide=1][&w=720&h=1280]
// Builds the city (city.mjs) + realism.mjs + station-jr.mjs (+ wide-area.mjs when its data exists) and a
// static crowd of ordinary people (costume.mjs ordinary mode, placed procedurally — NOT the sim; the
// crowd-sim layer provides the real positions in the episode). Used by tools/preview_series_geom.py to
// screenshot every rig at 720x1280 under SwiftShader and measure ms/frame.
//   window.__preview.rigs                    rig names
//   window.__preview.render(rig, t) → {ms, drawCalls, triangles, shot}
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {CostumeCrowd} from '../costume.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation} from './station-jr.mjs';
import {aerialOrbit,closeTopDown,eyeLevel,interiorDolly,routeMap,jrWalkPath,applyShot} from './camera.mjs';

const params=new URLSearchParams(location.search);
window.__ready=false;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const [config,osm,plateau,lod2]=await Promise.all([json('../../data/shibuya_config.json'),json('../../data/shibuya_osm.json'),json('../../data/shibuya_plateau.json'),params.get('lod2')==='0'?null:loadLod2()]);
const W=Number(params.get('w')||720),H=Number(params.get('h')||1280);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.info.autoReset=false;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.3,9000);
const sky=makeSky(scene);
const city=buildCity({scene,osm,plateau,config,theme:null});
const post=new Post(renderer);post.setSize(W,H);
let wide=null;
if(params.get('wide')!=='0'){try{const mod=await import('./wide-area.mjs');const data=await mod.loadWideArea();if(data)wide=mod.createWideArea(scene,data,{shared});}catch(e){console.warn('wide-area unavailable',e.message);}}
const R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true,skylineAvoid:wide?.bounds??null}});
const st=createJRStation(scene,{shared,osm});
// Wet-road reflection as in app.mjs (layer 1, half res).
for(const o of [...city.reflective,sky])o.layers.enable(1);
const mirror=new THREE.PerspectiveCamera();const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
city.reflectTarget.setSize(Math.round(W/2),Math.round(H/2));
function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
 mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
 city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
 renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}

// Static ordinary crowd (placeholder density field around Hachiko plaza / Scramble; NOT the sim).
const N=Number(params.get('people')??6000);let crowd=null;
if(N>0){crowd=new CostumeCrowd(scene,N,{ordinary:true});let rs=7;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};const list=[];
 const blobs=[[2,48,22,1],[18,30,16,.8],[-10,-4,26,.55],[-40,-30,18,.5],[46,24,8,.5],[-60,-60,30,.35],[60,-30,22,.3]];
 let guard=0;while(list.length<N&&guard++<N*40){const b=blobs[Math.floor(rnd()*blobs.length)];if(rnd()>b[3])continue;const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*b[2],x=b[0]+Math.cos(a)*r,z=b[1]+Math.sin(a)*r;
  if(R.insideBuilding(x,z,.4))continue;if(R.roadMask(x,z)&&Math.hypot(x,z)>40)continue;list.push({x,z,angle:rnd()*Math.PI*2});}
 crowd.place(list);crowd.n=list.length;crowd.body.geometry.instanceCount=list.length;}
// Indoor queue at the Hachiko gate (placeholder)
// (crowd-jr.mjs owns the real interior queue)

const walk=jrWalkPath(osm,params.get('walk')||'hachiko',{insideBuilding:R.insideBuilding});
const dollyKeys=st.dolly('hachiko');
const rigs={
 aerial:aerialOrbit({center:[40,0,70],radius:420,height:300,yaw0:-.9,yawSpeed:.05,fov:40,lookY:0}),
 aerialLow:aerialOrbit({center:[30,0,50],radius:260,height:170,yaw0:-.6,yawSpeed:.06,fov:42,lookY:15}),
 topdown:closeTopDown({center:[14,0,30],height:85,rot0:-.35,rotSpeed:.015,fov:44}),
 eye:eyeLevel({path:walk.points,speed:1.35,fov:58}),
 eyeLate:t=>eyeLevel({path:walk.points,speed:1.35,fov:58})(t+(walk.waypoints.find(w=>w.n===4)?.s??40)/1.35),
 eyeGate:t=>eyeLevel({path:walk.points,speed:1.35,fov:58})(t+((walk.waypoints.find(w=>w.n===8)?.s??60)+6)/1.35),
 interior:interiorDolly(dollyKeys),
 interiorGates:t=>interiorDolly(dollyKeys)(t+3.6),
 interiorPlatform:t=>interiorDolly(dollyKeys)(t+12.8),
 routemap:routeMap({bounds:[-350,-2600,1100,1400],points:wide?['ALT-HARA-H','ALT-YOYO-H','ALT-EBI-NS'].flatMap(id=>wide.routes[id]?.data.points.filter((_,i)=>i%4===0)??[]):null,azimuth:-8,pitch:66,fov:40,aspect:W/H,dur:8,rect:{x0:.06,x1:.94,y0:.16,y1:.86}}),
};
window.__preview={rigs:Object.keys(rigs),walk:{metres:walk.metres,waypoints:walk.waypoints,points:walk.points.length},stats:{realism:R.stats,station:st.stats,wide:wide?.stats??null,people:crowd?.n??0},
 anchors:st.anchors,
 render(rig,t=0){const shot=rigs[rig](t);camera.far=shot.far||9000;applyShot(camera,shot);const interior=rig.startsWith('interior');R.setInterior(interior,{keepCity:params.get('hideCity')!=='1'});const map=rig==='routemap';if(wide){wide.setMode(map?'map':'context');wide.mapCity(city,map?1:0);wide.showRoutes(map?['ALT-HARA-H','ALT-YOYO-H','ALT-EBI-NS']:null,{highlight:'ALT-HARA-H'});wide.showRedZone(map?1:0);for(const id of ['ALT-HARA-H','ALT-YOYO-H','ALT-EBI-NS'])wide.drawOn(id,Math.min(1,t/3));}if(crowd&&!(params.get('hide')||'').includes('crowd'))crowd.visible=!map;sky.visible=!map;if(R.glow)R.glow.visible=!map;if(R.skyline)R.skyline.visible=!map;R.group.visible=!map&&!(params.get('hide')||'').includes('realism');
  R.setDetail(rig.startsWith('aerial')||rig==='routemap'?'aerial':'street');
  shared.uTime.value=t;const gl=renderer.getContext();const t0=performance.now();renderer.info.reset();renderReflection();post.render(scene,camera);
  const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const ms=performance.now()-t0;
  return {ms,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,shot:{name:shot.name,pos:shot.pos.toArray().map(v=>+v.toFixed(2)),look:shot.look.toArray().map(v=>+v.toFixed(2)),fov:shot.fov}};}};
// debug: ?hide=station,realism,crowd,buildings,signs
for(const h of (params.get('hide')||'').split(',')){if(h==='station')st.group.visible=false;if(h==='realism')R.group.visible=false;if(h==='crowd'&&crowd)crowd.visible=false;if(h==='buildings')city.buildings.visible=false;if(h==='signs')for(const m of city.signs)m.visible=false;if(h.startsWith('wide')&&wide){const k=Number(h.slice(4));wide.group.children[k].visible=false;}}
window.__ready=true;
