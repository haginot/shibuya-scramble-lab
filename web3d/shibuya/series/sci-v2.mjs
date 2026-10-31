// science-sim-v2 render page: the REAL v8 'plan' solver trajectories (all agents in a window, dumped by
// tools/science_sim/dump_agents.mjs → sci/agents.bin) drawn as v9-costumed people over the PLATEAU city, from a chosen camera.
//   sci-v2.html?w=720&h=1280&bin=sci/agents.bin
//   window.__f({ts, pos:[x,y,z], look:[x,y,z], fov, exposure?}) → renders the frame at solver time ts (s after warm-up)
//   window.__info → {t0,t1,n}
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {CostumeCrowd} from '../costume.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation} from './station-jr.mjs';
import {makeShot,applyShot} from './camera.mjs';
import {NearCrowdLayer,setNearCostumes} from './people-close.mjs';
import {v9Style} from './costumes-v9.mjs';

const params=new URLSearchParams(location.search);window.__ready=false;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const W=Number(params.get('w')||720),H=Number(params.get('h')||1280);
setNearCostumes('v9');
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.info.autoReset=false;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.3,9000);
const sky=makeSky(scene);const post=new Post(renderer);post.setSize(W,H);
const [config,osm,plateau,lod2,bin]=await Promise.all([json('../../data/shibuya_config.json'),json('../../data/shibuya_osm.json'),json('../../data/shibuya_plateau.json'),loadLod2(),fetch(params.get('bin')||'sci/agents.bin').then(r=>r.arrayBuffer())]);
const city=buildCity({scene,osm,plateau,config,theme:null});
const R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true}});R.setDetail('street');
createJRStation(scene,{shared,osm});
// ---- trajectories
const dv=new DataView(bin);const frames=[];let off=0,maxId=0;
while(off<bin.byteLength){const t=dv.getInt32(off,true),n=dv.getInt32(off+4,true);off+=8;const id=new Uint16Array(n),x=new Float32Array(n),z=new Float32Array(n);
 for(let j=0;j<n;j++){id[j]=dv.getUint16(off,true);x[j]=dv.getInt16(off+2,true)/8;z[j]=dv.getInt16(off+4,true)/8;off+=6;if(id[j]>maxId)maxId=id[j];}frames.push({t,id,x,z});}
const NA=maxId+1;const mapAt=new Array(frames.length);
const cur=new Float32Array(NA*2),prv=new Float32Array(NA*2),mot=new Float32Array(NA*2),roles=new Uint8Array(NA);
const crowd=new CostumeCrowd(scene,NA,{style:i=>v9Style(i)});crowd.uniforms.uStride.value=.5;crowd.uniforms.uKey.value=.7;
const style0=crowd.body.geometry.getAttribute('aStyle').array.slice(),layer0=crowd.layers.map(L=>L.mesh.geometry.getAttribute('aStyle').array.slice());
const idx=new Int32Array(NA*0+1);
// per-frame lookup: dense arrays of (x,z) per id, NaN when outside the window
function dense(k){if(mapAt[k])return mapAt[k];const f=frames[k],a=new Float32Array(NA*2).fill(NaN);for(let j=0;j<f.id.length;j++){a[2*f.id[j]]=f.x[j];a[2*f.id[j]+1]=f.z[j];}return mapAt[k]=a;}
const nearL=new NearCrowdLayer(scene,{shared,radius:Number(params.get('nearR')||22),minDist:1.0,capacity:1100});
const frustum=new THREE.Frustum(),pm=new THREE.Matrix4(),sph=new THREE.Sphere(new THREE.Vector3(),1.3),keep=new Uint8Array(NA);
function cullCrowd(maxDist){pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
 const d=crowd.data,cx=camera.position.x,cz=camera.position.z,m2=maxDist*maxDist;let n=0;
 for(let i=0;i<NA;i++){const x=d[4*i],z=d[4*i+1];let k=0;if(x>-5000&&(x-cx)*(x-cx)+(z-cz)*(z-cz)<m2){sph.center.set(x,1,z);k=frustum.intersectsSphere(sph)?1:0;}keep[i]=k;}
 for(let li=0;li<crowd.layers.length;li++){const L=crowd.layers[li],o=L.data,st=L.mesh.geometry.getAttribute('aStyle'),S=st.array,S0=layer0[li];let c=0;
  for(let k=0;k<L.idx.length;k++){if(!keep[L.idx[k]])continue;for(let q=0;q<4;q++){o[4*c+q]=o[4*k+q];S[4*c+q]=S0[4*k+q];}c++;}
  L.mesh.geometry.instanceCount=c;L.mesh.visible=c>0;L.attr.needsUpdate=true;st.needsUpdate=true;}
 const bs=crowd.body.geometry.getAttribute('aStyle'),S=bs.array;
 for(let i=0;i<NA;i++){if(!keep[i])continue;for(let q=0;q<4;q++){d[4*n+q]=d[4*i+q];S[4*n+q]=style0[4*i+q];}n++;}
 crowd.body.geometry.instanceCount=n;crowd.attr.needsUpdate=true;bs.needsUpdate=true;return n;}
const mirror=new THREE.PerspectiveCamera(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
for(const o of [...city.reflective,sky])o.layers.enable(1);city.reflectTarget.setSize(Math.round(W/2),Math.round(H/2));
function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
 mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
 city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
 renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}
let lastTs=null;
window.__f=async o=>{const T0=performance.now();const ts=o.ts;
 const k=Math.max(0,Math.min(frames.length-2,Math.floor(ts-frames[0].t))),a=ts-frames[k].t-(frames[0].t-frames[0].t),u=Math.max(0,Math.min(1,ts-frames[k].t));
 const A=dense(k),B=dense(k+1);
 for(let i=0;i<NA;i++){const ax=A[2*i],az=A[2*i+1],bx=B[2*i],bz=B[2*i+1];
  if(Number.isNaN(ax)&&Number.isNaN(bx)){cur[2*i]=-9999;prv[2*i]=-9999;continue;}
  const px=Number.isNaN(ax)?bx:ax,pz=Number.isNaN(ax)?bz:az,qx=Number.isNaN(bx)?px:bx,qz=Number.isNaN(bx)?pz:bz;
  cur[2*i]=px+(qx-px)*u;cur[2*i+1]=pz+(qz-pz)*u;const dx=qx-px,dz=qz-pz,s=Math.hypot(dx,dz);
  // fade the entry/exit of the window: hide when NaN on one side beyond half
  mot[2*i]=s>.05?Math.atan2(dx,dz):mot[2*i];mot[2*i+1]=s;
 }
 const dtSim=lastTs==null?0:Math.abs(ts-lastTs);lastTs=ts;
 const snap={positions:cur,previous:cur,motion:mot,roles};crowd.update(snap,1,dtSim);
 const shot=makeShot(o.pos,o.look,{fov:o.fov||50,name:'sci'});applyShot(camera,shot);camera.updateMatrixWorld();
 nearL.begin();nearL.takeCrowd(crowd,camera);const nst=nearL.end({animTime:ts,camera,fill:0});
 const drawn=cullCrowd(o.maxDist||260);
 crowd.uniforms.uNearDim.value=o.nearDim??.3;
 shared.uTime.value=ts;post.settings.uFade.value=o.fade??1;post.settings.uExposure.value=o.exposure??1.0;
 R.update(ts,camera);renderer.info.reset();renderReflection();post.render(scene,camera);
 const gl=renderer.getContext();const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
 return {ms:Math.round(performance.now()-T0),drawn,near:nst,calls:renderer.info.render.calls};};
window.__info={t0:frames[0].t,t1:frames.at(-1).t,n:NA,frames:frames.length};
window.__ready=true;
