// Preview harness for the variant shots / sets (3D role): no solver worker. Builds the series scene (city.mjs +
// realism.mjs + station-jr.mjs + landmarks-jr.mjs + wide-area.mjs + vehicles) + sets-variants.mjs + a STATIC ordinary
// crowd placed around each shot's env.focus (placeholder, NOT the sim; the crowd layer owns the real states), then
// renders SHOTS[key](ctx, params)(t) through applyEnv — the same path the variant page uses.
//   web3d/shibuya/series/preview-variants.html[?w=720&h=1280&people=2500]
//   window.__pv.keys                         shot keys
//   window.__pv.render(key, params, t)       → {ms, drawCalls, triangles, shot:{name,pos,look,fov}, env}
//   window.__pv.logo(params)                 → opLogoAnchor (OP flythrough end pose + logo point)
//   window.__pv.probe(nx, ny)                → first mesh hit under a screen point (debug)
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {Vehicles} from '../vehicles.mjs';
import {CostumeCrowd} from '../costume.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation} from './station-jr.mjs';
import {createLandmarks} from './landmarks-jr.mjs';
import {loadWideArea,createWideArea} from './wide-area.mjs';
import {createSets} from './sets-variants.mjs';
import {SHOTS,SHOT_KEYS,applyEnv,opLogoAnchor} from './shots-variants.mjs';

const params=new URLSearchParams(location.search);
window.__ready=false;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const [config,osm,plateau,traffic,lod2,wideData]=await Promise.all([json('../../data/shibuya_config.json'),json('../../data/shibuya_osm.json'),json('../../data/shibuya_plateau.json'),json('../../data/shibuya_traffic.json'),loadLod2(),loadWideArea()]);
const W=Number(params.get('w')||720),H=Number(params.get('h')||1280);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.info.autoReset=false;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.3,9000);
const sky=makeSky(scene);
const city=buildCity({scene,osm,plateau,config,theme:null});
const post=new Post(renderer);post.setSize(W,H);
const wide=wideData?createWideArea(scene,wideData,{shared}):null;
const R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true,skylineAvoid:wide?.bounds??null}});
const st=createJRStation(scene,{shared,osm});
const LM=createLandmarks(scene,{shared});
const vehicles=new Vehicles(scene,traffic);vehicles.update(600);
const sets=createSets(scene,{shared,osm,wideData,insideBuilding:R.insideBuilding});
for(const o of [...city.reflective,sky,vehicles.mesh])o.layers.enable(1);
const mirror=new THREE.PerspectiveCamera(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
city.reflectTarget.setSize(Math.round(W/2),Math.round(H/2));
function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
 mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
 city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
 renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}

// static placeholder crowd: general blobs (Hachiko / Scramble) + a dense blob around the shot focus
const N=Number(params.get('people')??3000);const crowd=N>0?new CostumeCrowd(scene,N,{ordinary:true}):null;
function placeCrowd(focus,eyePos,nearHide,focusN=300){let nf=0;if(!crowd)return;let rs=7;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};const list=[];
 const blobs=[[2,48,22,1],[18,30,16,.8],[-10,-4,26,.55],[100,8,30,.6]];if(focus)blobs.push([focus[0],focus[1],16,1.2]);
 let guard=0;while(list.length<N&&guard++<N*30){const bi=Math.floor(rnd()*blobs.length),b=blobs[bi];if(rnd()>b[3])continue;if(bi===4&&nf>=focusN)continue;const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*b[2],x=b[0]+Math.cos(a)*r,z=b[1]+Math.sin(a)*r;
  if(R.insideBuilding(x,z,.4))continue;if(eyePos&&Math.hypot(x-eyePos.x,z-eyePos.z)<Math.max(2.5,nearHide))continue;list.push({x,z,angle:rnd()*Math.PI*2});if(bi===4)nf++;}
 crowd.place(list);crowd.body.geometry.instanceCount=list.length;for(const L of crowd.layers){let k=0;for(const i of L.idx)if(i<list.length)k++;L.mesh.geometry.instanceCount=Math.min(k,L.idx.length);}}

const ctx={osm,st,wide,wideData,insideBuilding:R.insideBuilding,sets,aspect:W/H,routes:{}};
const parts={camera,sky,R,st,LM,wide,city,crowd,vehicles,post,sets};
let last=null;
window.__pv={keys:SHOT_KEYS,anchors:sets.anchors,stats:{sets:sets.stats,realism:R.stats,station:st.stats},
 render(key,p={},t=0){const sig=key+JSON.stringify(p);if(!last||last.sig!==sig)last={sig,fn:SHOTS[key](ctx,p)};const shot=last.fn(t);
  applyEnv(shot,parts,t);const e=shot.env;placeCrowd(e.focus,e.eye?shot.pos:null,e.nearHide||0,Number(params.get('focusN')||(e.sets?.length?60:300)));if(crowd)crowd.visible=e.crowd!==false&&!(e.map>.5);
  shared.uTime.value=t;const gl=renderer.getContext();const t0=performance.now();renderer.info.reset();if(!(e.map>.5))renderReflection();post.render(scene,camera);
  const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const ms=performance.now()-t0;
  return {ms,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,shot:{name:shot.name,pos:shot.pos.toArray().map(v=>+v.toFixed(2)),look:shot.look.toArray().map(v=>+v.toFixed(2)),fov:+shot.fov.toFixed(1)},env:{...e}};},
 logo(p={}){const a=opLogoAnchor(ctx,p);return {pos:a.pos.toArray(),point:a.point.toArray(),normal:a.normal.toArray(),fov:a.fov,worldWidth:a.worldWidth,worldHeight:a.worldHeight,screen:a.screen,clear:a.clear};},
 probe(nx,ny){const rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2(nx*2-1,1-ny*2),camera);const hits=rc.intersectObjects(scene.children,true).filter(h=>h.object.visible);return hits.slice(0,3).map(h=>({name:h.object.name||h.object.parent?.name||h.object.type,d:+h.distance.toFixed(1),p:h.point.toArray().map(v=>+v.toFixed(1)),face:h.faceIndex}));},
 debug:{scene,camera,R,st,sets,wide,city,ctx}};
window.__ready=true;
