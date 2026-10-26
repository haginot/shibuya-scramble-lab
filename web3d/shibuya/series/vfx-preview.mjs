// Preview page for the combined-episode VFX (crowd/VFX role): series/vfx-caught.mjs (caught hands / shadows / flash)
// over an eye-level POV inside crowd state 'caught-press', and series/kaiju.mjs rising behind the Shibuya skyline.
// Own minimal scene (city.mjs + realism.mjs + station-jr.mjs + sky + Post, like people-preview.mjs); own cameras (the
// real shots 'caught-pov' / 'kaiju-skyline' belong to shots-variants.mjs — this page only previews the modules).
//   web3d/shibuya/series/vfx-preview.html?w=720&h=1280[&city=0]
//   window.__vfx.render('caught', t, {at:[x,z], heading, base, caught:{…env override}, hands:{…}}) → {ms, layout, caught}
//   window.__vfx.render('kaiju',  t, {from:[x,y,z], look:[x,y,z], fov, kaiju:{pos:[x,z], scale, …}, rise:[t0,t1], roarAt})
//   window.__vfx.render('kaiju-solo', t, {...})   kaiju on a plain ground + sky (no city; design check, fast)
// caught env timeline used here (reference for the camera role): intensity = smooth(0, 1.6, t), press = smooth(0, 1.2, t),
// flash = pulse 1.75 → 2.05, black from 2.15. kaiju: rise = smooth(rise0, rise1, t), eyes on after 70 % rise, roar
// bell around roarAt (0.9 s). Tools: tools/preview_vfx.py (stills under the browser lock).
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation} from './station-jr.mjs';
import {makeShot,applyShot} from './camera.mjs';
import {NearPeople} from './people-close.mjs';
import {crowdFrame} from './crowd-variants.mjs';
import {createCaughtVFX} from './vfx-caught.mjs';
import {createKaiju} from './kaiju.mjs';

const params=new URLSearchParams(location.search);
window.__ready=false;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const W=Number(params.get('w')||720),H=Number(params.get('h')||1280),withCity=params.get('city')!=='0';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.info.autoReset=false;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.1,9000);
const sky=makeSky(scene);
const post=new Post(renderer);post.setSize(W,H);
let R=null;const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x0b0a12}));scene.add(ground);
if(withCity){const [config,osm,plateau,lod2]=await Promise.all([json('../../data/shibuya_config.json'),json('../../data/shibuya_osm.json'),json('../../data/shibuya_plateau.json'),loadLod2()]);
 const city=buildCity({scene,osm,plateau,config,theme:null});R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true}});createJRStation(scene,{shared,osm});R.setDetail('street');ground.visible=false;}
const near=new NearPeople(scene,{capacity:400,lod0:120});
const vfx=createCaughtVFX({scene,camera,renderer,post});
const kaiju=createKaiju({scene});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function caughtEnvAt(t,o={}){return {t,dur:2.5,intensity:smooth(0,1.6,t),press:smooth(0,1.2,t),flash:t>=1.75&&t<2.15?Math.max(0,1-(t-1.75)/.3):0,black:t>=2.15?1:0,seed:7,...(o.caught||{}),hands:o.hands||{}};}
export function kaijuEnvAt(t,o={}){const [r0,r1]=o.rise||[.2,2.4],roarAt=o.roarAt??2.7,rise=smooth(r0,r1,t);
 const roar=clamp(1-Math.abs(t-roarAt-.35)/.55)**.7*(t>roarAt-.2?1:0);return {t,rise,eyes:smooth(.7,.85,rise),roar,shake:0,pos:[700,520],scale:150,seed:3,riseEnd:r1,...(o.kaiju||{})};}
const scenes={
 caught(t,o){const at=o.at||[136.5,61.2],hd=o.heading??Math.PI/2;const fr=crowdFrame('caught-press',t,{params:{at,heading:hd,...(o.press||{})}});
  const fx=Math.sin(hd),fz=Math.cos(hd),sh=o.shake??.6,c=caughtEnvAt(t,o);const k=sh*c.intensity;
  const jx=(Math.sin(t*31)+Math.sin(t*17.3))*.02*k,jy=(Math.sin(t*27.1)+Math.sin(t*13.7))*.02*k;
  const pos=[at[0]-fx*.25+jx,1.55+jy,at[1]-fz*.25],look=[at[0]+fx*6+jx*8,1.35+jy*6,at[1]+fz*6];
  near.visible=true;near.set(fr.people,{animTime:t,camera});
  return {shot:makeShot(pos,look,{fov:62,name:'caught-preview'}),caught:c,kaiju:null,people:fr.people.length,dim:c.black?0:1};},
 kaiju(t,o){near.visible=false;return {shot:makeShot(o.from||[-60,1.7,-40],o.look||[200,95,160],{fov:o.fov||52,name:'kaiju-preview'}),caught:null,kaiju:kaijuEnvAt(t,o)};},
};
scenes['kaiju-solo']=(t,o)=>{if(R)R.group.visible=false;ground.visible=true;const r=scenes.kaiju(t,{from:[0,40,0],look:[700,100,520],fov:40,...o});return r;};
window.__vfx={scenes:Object.keys(scenes),
 render(name,t=0,o={}){if(R)R.group.visible=true;ground.visible=!R;const r=scenes[name](t,o);applyShot(camera,r.shot);if(r.shot)camera.updateMatrixWorld();
  if(name!=='caught'){near.clear();near.visible=false;}
  const L=vfx.update(r.caught,{aspect:W/H});const P=kaiju.update(r.kaiju,{camera,time:t});
  shared.uTime.value=t;if(R)R.update(t,camera);post.settings.uFade.value=r.dim??1;
  const gl=renderer.getContext();const t0=performance.now();renderer.info.reset();post.render(scene,camera);
  const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
  return {ms:Math.round(performance.now()-t0),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,hands:L?.hands.length??0,pose:P,people:r.people??0,caught:r.caught,kaiju:r.kaiju};}};
window.__ready=true;
