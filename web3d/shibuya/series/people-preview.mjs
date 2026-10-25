// Preview page for series/people-close.mjs (near-camera people) and series/crowd-variants.mjs (CROWD_STATES):
//   web3d/shibuya/series/people-preview.html?w=720&h=1280[&city=0]
//   window.__pp.scenes                       scene names
//   window.__pp.render(scene, t) → {ms, drawCalls, triangles, near:{drawn,lod0,lod1}, far, hud?}
// Scenes: lineup (modes side by side, eye level), crowd (plaza crowd, far costume.mjs figures swapped to near
// models within 18 m), state:<CROWD_STATES key> (variant crowd states at their default set-piece positions).
// Not used by the episode pages (tools/preview_people.py takes the stills / ms per frame).
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {CostumeCrowd} from '../costume.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation} from './station-jr.mjs';
import {makeShot,applyShot} from './camera.mjs';
import {NearPeople,swapNearFromCrowd} from './people-close.mjs';
import {CROWD_STATES,CrowdStateView} from './crowd-variants.mjs';
import {createSets} from './sets-variants.mjs';
import {loadWideArea} from './wide-area.mjs';

const params=new URLSearchParams(location.search);
window.__ready=false;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const W=Number(params.get('w')||720),H=Number(params.get('h')||1280),withCity=params.get('city')!=='0';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.info.autoReset=false;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.1,9000);
const sky=makeSky(scene);
const post=new Post(renderer);post.setSize(W,H);
let R=null,city=null,st=null,sets=null;
if(withCity){const [config,osm,plateau,lod2]=await Promise.all([json('../../data/shibuya_config.json'),json('../../data/shibuya_osm.json'),json('../../data/shibuya_plateau.json'),loadLod2()]);
 city=buildCity({scene,osm,plateau,config,theme:null});R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true}});st=createJRStation(scene,{shared,osm});R.setDetail('street');
 if(params.get('sets')!=='0'){const wideData=await loadWideArea().catch(()=>null);sets=createSets(scene,{shared,osm,wideData,insideBuilding:R.insideBuilding});}}
else{const g=new THREE.Mesh(new THREE.PlaneGeometry(400,400).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x14121a}));scene.add(g);}

const near=new NearPeople(scene,{capacity:1600,lod0:120,fill:Number(params.get('fill')||0)});
// far crowd (costume.mjs ordinary mode) for the swap test
const FN=3000,far=new CostumeCrowd(scene,FN,{ordinary:true});far.uniforms.uStride.value=.5;far.uniforms.uKey.value=.7;
let rs=11;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
const farBase=[];for(let i=0;i<FN;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*60,x=18+Math.cos(a)*r,z=30+Math.sin(a)*r;const walk=rnd()<.55;farBase.push({x,z,h:rnd()*Math.PI*2,v:walk?.9+rnd()*.5:0});}
if(R)for(const p of farBase)if(R.insideBuilding(p.x,p.z,.4)){p.x=-9999;}
const snap={positions:new Float32Array(FN*2),previous:new Float32Array(FN*2),motion:new Float32Array(FN*2),roles:new Uint8Array(FN)};
function farAt(t){for(let i=0;i<FN;i++){const p=farBase[i];const x=p.x+Math.sin(p.h)*p.v*t,z=p.z+Math.cos(p.h)*p.v*t;snap.positions[2*i]=snap.previous[2*i]=x;snap.positions[2*i+1]=snap.previous[2*i+1]=z;snap.motion[2*i]=p.h;snap.motion[2*i+1]=p.v;}
 far.phase.fill(0);far.update(snap,1,0);for(let i=0;i<FN;i++){far.data[4*i+3]=Math.floor(farBase[i].v*20)*8+((t*farBase[i].v/1.45*6.283+i)%6.283);}far.gather();}

const views={};
const C0=[16,0,40];
// scene(t) → {shot, people?} (people → NearPeople after the camera is placed) or {shot, hud} (state views draw themselves)
const scenes={
 lineup(t){far.visible=false;sets?.show(null);const people=[],modes=[['idle',0],['walk',1.3],['phone',0],['queue',0],['walk',1.0],['idle',0],['walk',1.4],['phone',0]];
  modes.forEach(([anim,v],k)=>{const x=C0[0]-2.45+k*.7,z=C0[2]+(k%2)*1.2;const hd=v>0?Math.PI/2*(k%4<2?1:-1):(k-3.5)*.12;people.push({x,z,heading:hd,speed:v,id:41+k*7,anim});});
  return {shot:makeShot([C0[0],1.5,C0[2]+9.5],[C0[0],1.0,C0[2]],{fov:40,name:'lineup'}),people};},
 close(t){far.visible=false;sets?.show(null);const people=[{x:C0[0]-.5,z:C0[2],heading:.3,speed:0,id:101,anim:'phone'},{x:C0[0]+.6,z:C0[2]-.4,heading:-.4,speed:0,id:208,anim:'idle'},{x:C0[0]+.1,z:C0[2]-2.5,heading:Math.PI/2,speed:1.2,id:315,anim:'walk'}];
  return {shot:makeShot([C0[0],1.6,C0[2]+2.6],[C0[0],1.25,C0[2]],{fov:56,name:'close'}),people};},
 crowd(t){far.visible=true;sets?.show(null);farAt(t);const shot=makeShot([C0[0]-2,1.6,C0[2]+14],[C0[0]+2,1.3,C0[2]-10],{fov:58,name:'crowd'});applyShot(camera,shot);
  return {shot,people:swapNearFromCrowd(far,{camera,radius:18,minDist:.8})};},
};
const PIECE={'hachiko-peak':'gate-queue','zone-dense':'closure','alt-platform':'alt-platform','taxi-west':'taxi-west','taxi-sakura':'taxi-sakura'};
for(const key of Object.keys(CROWD_STATES))scenes['state:'+key]=t=>{far.visible=false;sets?.show(PIECE[key]?[PIECE[key]]:null);sets?.update(t,camera);views[key]??=new CrowdStateView(scene,{state:key,near,anchors:sets?.anchors});for(const [k,o] of Object.entries(views))o.visible=k===key;
 const v=views[key];let fr=v.update(t,camera);let shot=fr.previewShot;const cf=sets?.anchors?.[PIECE[key]+'.camFront'];
 if(cf&&params.get('cam')==='set')shot=makeShot([cf.x,cf.y,cf.z],[fr.focus.x,(fr.people[0]?.y||0)+1.2,fr.focus.z],{fov:58,name:key+'-set'});
 applyShot(camera,shot);fr=v.update(t,camera);return {shot,hud:fr.hud,state:true};};

window.__pp={scenes:Object.keys(scenes),
 render(name,t=0){const r=scenes[name](t);applyShot(camera,r.shot);if(r.people)near.set(r.people,{animTime:t,camera});else if(!r.state)near.clear();
  shared.uTime.value=t;if(R)R.update(t,camera);const gl=renderer.getContext();const t0=performance.now();renderer.info.reset();post.render(scene,camera);
  const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const ms=performance.now()-t0;
  return {ms,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,near:near.last,lodTris:[near.triangles(0),near.triangles(1)],far:far.visible?far.body.geometry.instanceCount:0,hud:r.hud??null};}};
if(params.get('near')==='0')near.group.visible=false,near.group.layers.disableAll();
window.__ready=true;
