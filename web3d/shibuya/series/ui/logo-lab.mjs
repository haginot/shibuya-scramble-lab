// Logo lab: the 3D logotype (logo3d.mjs) alone, through the series post chain (fx.mjs Post: HDR bloom, ACES, grade,
// grain), over a dark night backdrop. Used by tools/export_logo.py (logo.png / logo-9x16.png) and for title stills.
// URL: series/ui/logo-lab.html?[t=3.5][&bg=night|black][&press=1][&pr=1][&auto=1]
// API: await window.__logoReady; window.__logoFrame(t,{press,pressK,dissolve}) → {ms}
import * as THREE from '../../../vendor/three.module.min.js';
import {Post} from '../../fx.mjs';
import {shared} from '../../shaders.mjs';
import {Logo3D,loadLogoGlyphs,loadLogoSdf} from './logo3d.mjs';

const q=new URLSearchParams(location.search);
const W=innerWidth,H=innerHeight,pr=Number(q.get('pr')||1);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(pr);renderer.setSize(W,H,false);document.body.append(renderer.domElement);
const post=new Post(renderer);post.setSize(Math.round(W*pr),Math.round(H*pr));if(q.has('bloom'))post.settings.uBloom.value=Number(q.get('bloom'));
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);
// night backdrop: violet-black gradient, ember glow from below, a few soft out-of-focus city lights (procedural)
if(q.get('bg')!=='black'){const m=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{uTime:shared.uTime,uAspect:{value:W/H}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.);}`,
 fragmentShader:`uniform float uTime,uAspect;varying vec2 vUv;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 p=vUv;vec3 c=mix(vec3(.03,.012,.035),vec3(.004,.003,.008),p.y);c+=vec3(.5,.14,.02)*.25*exp(-pow((p.y-.0)/.28,2.))*(.6+.4*sin(p.x*3.+1.));
  vec2 g=vec2(p.x*uAspect,p.y)*14.;vec2 id=floor(g),f=fract(g)-.5;float r=h(id);if(r>.82&&p.y<.55){float s=length(f-vec2(h(id+1.)-.5,h(id+2.)-.5)*.6);vec3 lc=r>.95?vec3(1.,.5,.15):r>.9?vec3(.5,.3,1.):vec3(1.,.85,.6);c+=lc*smoothstep(.22,.05,s)*.22*(1.-p.y*1.6);}
  gl_FragColor=vec4(c,1.);}`});const bg=new THREE.Mesh(new THREE.PlaneGeometry(2,2),m);bg.frustumCulled=false;scene.add(bg);}
const [data,sdf]=await Promise.all([loadLogoGlyphs(),loadLogoSdf()]);
const logo=new Logo3D({data,sdf,aspect:W/H,press:true,backdrop:Number(q.get('backdrop')??1),particles:q.get('particles')!=='0',frame:{width:Number(q.get('frameW')||.9)}}).attach(scene,camera);
window.__logo=logo;
function frame(t,o={}){const t0=performance.now();shared.uTime.value=t;logo.setPress(o.press??(q.get('press')==='1'),o.pressK??0);const dv=o.dissolve??(q.has('dissolve')?Number(q.get('dissolve')):0);logo.setDissolve(dv);logo.setTime(t);
 post.settings.uExposure.value=1+logo.state.flash*.6;post.render(scene,camera);const px=new Uint8Array(4);const gl=renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);return {ms:Math.round(performance.now()-t0),state:logo.state};}
window.__logoFrame=frame;
frame(Number(q.get('t')??3.5));
window.__logoReady=true;
if(q.get('auto')==='1'){let s=null;const loop=now=>{s??=now;frame(((now-s)/1000)%7);requestAnimationFrame(loop);};requestAnimationFrame(loop);}
