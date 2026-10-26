// "Caught" VFX of the JR編 combined episodes (beat `caught`, shot `caught-pov`, ~2.5 s before the GAME OVER stamp).
// FICTIONAL GAME ZOMBIES, ONLY SUGGESTED: dark greenish shadow masses creeping in at the frame edges + silhouetted
// cartoon creature hands reaching in FROM THE FRAME EDGES (screen-attached). The hands are clearly non-human game
// creatures: a long knobbly forearm, a round palm and THREE long knobbly fingers with a blocky pixel-art edge and a
// glitchy toxic-green pixel outline (game sprite look). Never a face, never a body, never a clear view; no blood/gore
// (the only red is the full-screen flash). Ordinary crowd people are never the ones reaching (crowd state
// 'caught-press' in crowd-variants.mjs keeps them neutral, arms down, mostly backs to camera).
//
// Layers (one full-screen quad, drawn last in the host HDR scene pass, so bloom / grade / grain of fx.mjs Post apply):
//   vignette closing in (dark green-black, radius shrinks with max(intensity, press)) → shadow masses at the edges →
//   hand silhouettes (pixel-quantized SDF) → glitch pixel outline (HDR green, blooms; a few torn rows shift sideways,
//   magenta split on glitched rows) → red flash (env.flash) → black (env.black = 1: opaque black).
//
// Determinism: everything is a pure function of the caught env {t, intensity, press, flash, black, seed} (+ aspect and
// the hands options) — no wall clock, no state carried between frames → resumable segmented renders.
//
// API
//   createCaughtVFX({scene, camera?, renderer?, post?}) → {mesh, update(caughtEnvOrNull, {aspect?, width?, height?}) → layout|null,
//                                                          dispose()}
//     caughtEnv (shots-variants.mjs 'caught-pov' env.caught) = {t (s into the beat), dur, intensity 0..1 (hands/shadows
//       reach in), press 0..1 (crowd closing in: vignette), flash 0..1 (red flash), black 0|1 (hard cut), seed,
//       hands?: options below (the shot's params.hands)}. null / undefined → the quad is hidden (zero cost).
//     aspect = width / height of the frame (default: renderer drawing buffer, else 9/16).
//   caughtLayout(caughtEnv, {aspect, hands}) → pure layout (node-testable): {visible, black, flash, vignette:{r, soft,
//     amount}, shadows:[{x, y, rx, ry, a}], hands:[{slot, edge, base:[x,y], wrist:[x,y], dir, ext, scale, box:[cx,cy,r],
//     fingers:[[[x,y]×4]×3]}], glitch, jitter:[dx,dy]}. Screen coords: x ∈ [0, aspect], y ∈ [0, 1] (y up, origin
//     bottom-left; 1 unit = frame height).
//   CAUGHT_HANDS_DEFAULTS  hands options: {count=6 (≤ MAX_HANDS), reach=1 (wrist depth into the frame ×), scale=1
//     (hand size ×), start=.06 (intensity at which the first hand enters), stagger=.1 (per further hand), glitch=1,
//     shadows=1, vignette=1, slots=null ([{edge:'left'|'right'|'bottom'|'corner-bl'|'corner-br'|'corner-tl'|'corner-tr', at 0..1}] to override the entry points),
//     rim:[r,g,b] (outline colour), tint:[r,g,b] (silhouette colour)}
//   MAX_HANDS = 6, HAND_SLOTS (default entry points: lower-left, right, bottom-left corner, lower-right, upper-left, top-right corner).
//   CAUGHT_SHADER_SOURCE  {vertex, fragment} (tests check the shader has no face / blood terms and reads the layout).
import * as THREE from '../../vendor/three.module.min.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const hashU=i=>{let t=(i+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const H=(k,s,seed=0)=>hashU(k*7919+s*104729+seed*15485863+13);

export const MAX_HANDS=6;
const FINGERS=3,SEGS=3,PPH=2+FINGERS*(SEGS+1);// points per hand: arm base, wrist, 3 fingers × 4 joints
// default entry points, in entry order (at = fraction along the edge: left/right bottom→top, bottom left→right; corners
// bl/br/tl/tr reach in diagonally). No hand comes straight up from the bottom (would read as the player's own hands).
// The 2nd (right) slot sits lower (.32, was .46): at .46 its fingertips reached the centre bystander's shoulder around
// beat 1.4 s and edged toward reading as grabbing a real person (QA 2026-10-26).
export const HAND_SLOTS=Object.freeze([{edge:'left',at:.3},{edge:'right',at:.32},{edge:'corner-bl',at:0},{edge:'right',at:.14},{edge:'left',at:.68},{edge:'corner-tr',at:0}]);
export const CAUGHT_HANDS_DEFAULTS=Object.freeze({count:6,reach:1,scale:1,start:.06,stagger:.1,glitch:1,shadows:1,vignette:1,slots:null,rim:[.22,.95,.3],tint:[.004,.012,.007]});

// ─── pure layout ─────────────────────────────────────────────────────────────
export function caughtLayout(c,{aspect=9/16,hands={}}={}){
 if(!c)return null;const o={...CAUGHT_HANDS_DEFAULTS,...(c.hands||{}),...hands};const seed=(c.seed??7)|0,t=+c.t||0;
 const I=clamp(+c.intensity||0),P=clamp(+c.press||0),flash=clamp(+c.flash||0),black=c.black?1:0;const A=aspect;
 // handheld micro-jitter of the screen-attached layer (independent of the camera shake, grows with intensity)
 const jitter=[(Math.sin(t*23.1+seed)*.6+Math.sin(t*41.7+seed*3)*.4)*.004*I,(Math.sin(t*19.3+seed*5)*.6+Math.sin(t*37.9)*.4)*.004*I];
 const slots=(o.slots||HAND_SLOTS).slice(0,Math.min(MAX_HANDS,o.count));
 const out=[];
 slots.forEach((s,i)=>{const start=o.start+i*o.stagger,ext=smooth(0,.38,I-start);if(ext<=0)return;
  const h1=H(i,1,seed),h2=H(i,2,seed),h3=H(i,3,seed),h4=H(i,4,seed),ph=h4*6.283;
  let base,n;// base point outside the frame; n = inward normal
  const r2=Math.SQRT1_2;
  if(s.edge==='left'){base=[-.07,.12+s.at*.76];n=[1,0];}else if(s.edge==='right'){base=[A+.07,.12+s.at*.76];n=[-1,0];}
  else if(s.edge==='corner-bl'){base=[-.05,-.05];n=[r2,r2];}else if(s.edge==='corner-br'){base=[A+.05,-.05];n=[-r2,r2];}
  else if(s.edge==='corner-tl'){base=[-.05,1.05];n=[r2,-r2];}else if(s.edge==='corner-tr'){base=[A+.05,1.05];n=[-r2,-r2];}
  else{base=[.06*A+s.at*.88*A,-.07];n=[0,1];}
  // aim toward the frame centre (a bit low), jittered; never straight along the edge
  // aim: toward the centre line, mostly level with the entry point
  const aim=[A*.5+(h1-.5)*A*.2,base[1]*.55+.45*(.48+(h2-.5)*.16)];let dx=aim[0]-base[0],dy=aim[1]-base[1];const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
  if(dx*n[0]+dy*n[1]<.7){dx=dx*.4+n[0]*.6;dy=dy*.4+n[1]*.6;const m=Math.hypot(dx,dy);dx/=m;dy/=m;}
  const dir=Math.atan2(dy,dx)+Math.sin(t*2.3+ph)*.06*ext;const cd=Math.cos(dir),sd=Math.sin(dir);
  const scale=(.72+.22*h3)*o.scale*(s.edge.startsWith('corner')?1.1:1);
  // lunge: reaches in with the intensity, small grasping pulses (closed form in t)
  const lunge=ext*(1+.12*Math.sin(t*6.5+ph)*ext);const depth=(.02+.035*h1)*o.reach*lunge+(s.edge.startsWith('corner')?.04*lunge:0);// wrist depth inside the frame edge
  const inward=cd*n[0]+sd*n[1]||1;const along=(.07+depth)/inward;// distance from base along dir to reach `depth`
  const wrist=[base[0]+cd*along+jitter[0],base[1]+sd*along+jitter[1]];const b0=[base[0]-cd*.12+jitter[0],base[1]-sd*.12+jitter[1]];
  const grab=smooth(.3,1,I)*.7+.15*Math.sin(t*5.1+ph);const spread=(.55+.15*h2)*(1-.15*grab);
  const seg=[.072,.062,.052].map(v=>v*scale);const palm=.034*scale;
  const fingers=[-1,0,1].map(f=>{let a=dir+f*spread+Math.sin(t*7.3+ph+f*1.9)*.07;const p=[wrist[0]+Math.cos(a)*palm,wrist[1]+Math.sin(a)*palm];const pts=[p.slice()];
   for(let j=0;j<SEGS;j++){a+=(-f*.2-.12+(f===0?.1:0))*grab+Math.sin(t*6.1+ph+f+j*1.3)*.09;p[0]+=Math.cos(a)*seg[j];p[1]+=Math.sin(a)*seg[j];pts.push(p.slice());}
   return pts;});
  // bounding circle (shader early-out)
  const all=[b0,wrist,...fingers.flat()];const cx=all.reduce((s,q)=>s+q[0],0)/all.length,cy=all.reduce((s,q)=>s+q[1],0)/all.length;
  const r=Math.max(...all.map(q=>Math.hypot(q[0]-cx,q[1]-cy)))+.05*scale;
  out.push({slot:i,edge:s.edge,base:b0,wrist,dir,ext,scale,box:[cx,cy,r],fingers});});
 // shadow masses (hunched, faceless, soft) at the edges, growing with the intensity
 const shadows=[[-.05,.3,.24,.4],[A+.05,.38,.24,.42],[A*.5,-.1,A*.6,.2],[A+.02,.86,.16,.22]].map(([x,y,rx,ry],k)=>{const a=smooth(0,.45,I-.02-k*.08)*o.shadows*.95;
  const g=1+.25*smooth(0,1,I);return {x:x+Math.sin(t*1.7+k*2+seed)*.015,y:y+Math.sin(t*1.3+k)*.02,rx:rx*g,ry:ry*g,a};});
 const k=Math.max(I,P);
 return {visible:true,black,flash,aspect:A,vignette:{r:.62-.4*k,soft:.22+.06*(1-k),amount:clamp((.2+.8*k)*o.vignette)},shadows,hands:out,
  glitch:clamp(o.glitch*(.35+.65*I)),jitter,t,seed,rim:o.rim,tint:o.tint};}

// ─── shader ──────────────────────────────────────────────────────────────────
const VERT=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const FRAG=/* glsl */`precision highp float;
#define MAXH ${MAX_HANDS}
#define PPH ${PPH}
uniform vec2 uP[${MAX_HANDS*PPH}];uniform vec4 uBox[MAXH];uniform vec4 uW[MAXH];uniform vec4 uSh[4];uniform vec4 uShA;
uniform vec4 uVig;uniform float uFlash,uBlack,uGlitch,uTime,uSeed,uAspect;uniform int uN;uniform vec2 uRes;uniform vec3 uRim,uTint;
varying vec2 vUv;
float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
// tapered capsule; knob>0 adds knuckle bumps along it (knobbly creature limbs)
float cap(vec2 p,vec2 a,vec2 b,float ra,float rb,float knob){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-8),0.,1.);
 float r=mix(ra,rb,h)*(1.+knob*sin(h*length(ba)*95.));return length(pa-ba*h)-r;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float handSD(vec2 p,int i){vec4 w=uW[i];int b=i*PPH;
 float d=cap(p,uP[b],uP[b+1],w.y*1.45,w.y*.8,.14);
 d=smin(d,length(p-uP[b+1])-w.x*.04,.014*w.x);
 for(int f=0;f<3;f++){int k=b+2+f*4;
  for(int j=0;j<3;j++){float fj=float(j);float ra=w.z*(1.18-.22*fj),rb=w.z*(j==2?.32:1.-.2*fj);
   d=smin(d,cap(p,uP[k+j],uP[k+j+1],ra,rb,0.),.006*w.x);
   d=min(d,length(p-uP[k+j])-w.w*(1.-.18*fj));}}// knuckle knobs
 return d;}
void over(inout vec4 acc,vec3 c,float a){acc.rgb=c*a+acc.rgb*(1.-a);acc.a=a+acc.a*(1.-a);}
void main(){
 if(uBlack>.5){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec2 p=vec2(vUv.x*uAspect,vUv.y);vec4 acc=vec4(0.);
 // vignette closing in (dark green-black)
 float r=length((vUv-.5)*vec2(1.,1.25));float vg=smoothstep(uVig.x,uVig.x+uVig.y,r)*uVig.z;over(acc,uTint*.4,clamp(vg,0.,1.));
 // shadow masses (soft, faceless), slow fbm-free wobble
 for(int k=0;k<4;k++){vec4 s=uSh[k];float a=uShA[k];if(a<=0.)continue;vec2 q=(p-s.xy)/s.zw;float wob=.08*sin(atan(q.y,q.x)*5.+uTime*2.1+float(k));
  float m=1.-smoothstep(.45+wob,1.+wob,length(q));over(acc,uTint*.5,m*a);}
 // glitch: torn rows shift sideways (stepped in time like a broken sprite)
 float px=max(3.,floor(uRes.y/480.+.5))/uRes.y;// pixel block (≈4 px at 1920)
 float row=floor(vUv.y*64.),tick=floor(uTime*18.)+uSeed*13.;float g=step(1.-.14*uGlitch,h21(vec2(row,tick)));
 vec2 pg=p+vec2((h21(vec2(tick,row+7.))-.5)*.03*g,0.);
 vec2 q=(floor(pg/px)+.5)*px;// pixel-art quantization
 float d=1e3;for(int i=0;i<MAXH;i++){if(i>=uN)break;vec4 bx=uBox[i];if(length(q-bx.xy)>bx.z)continue;d=min(d,handSD(q,i));}
 if(d<px*2.5){
  float inside=step(d,0.);float edge=step(0.,d)*step(d,px*1.05);
  float dither=h21(floor(q/px)+tick*.0)*.35;
  vec3 fill=uTint*(1.+dither)+uRim*.02*smoothstep(-px*3.,0.,d);over(acc,fill,inside);
  float flick=.75+.25*step(.5,h21(vec2(floor(uTime*24.),uSeed)));
  vec3 rim=mix(uRim,vec3(uRim.y,.06,uRim.y*.9),g);over(acc,rim*flick,edge*.9);}
 // red flash
 // red flash (stronger at the edges, centre still faintly readable)
 over(acc,vec3(1.25,.03,.045),clamp(uFlash,0.,1.)*(.6+.35*smoothstep(.1,.6,r)));
 gl_FragColor=acc;}`;
export const CAUGHT_SHADER_SOURCE=Object.freeze({vertex:VERT,fragment:FRAG});

export function createCaughtVFX({scene,camera=null,renderer=null,post=null}={}){
 const uniforms={uP:{value:Array.from({length:MAX_HANDS*PPH},()=>new THREE.Vector2(-9,-9))},uBox:{value:Array.from({length:MAX_HANDS},()=>new THREE.Vector4(-9,-9,0,0))},
  uW:{value:Array.from({length:MAX_HANDS},()=>new THREE.Vector4(1,.03,.012,.016))},uSh:{value:Array.from({length:4},()=>new THREE.Vector4(-9,-9,1,1))},uShA:{value:new THREE.Vector4()},
  uVig:{value:new THREE.Vector4(.6,.25,0,0)},uFlash:{value:0},uBlack:{value:0},uGlitch:{value:0},uTime:{value:0},uSeed:{value:0},uAspect:{value:9/16},uN:{value:0},
  uRes:{value:new THREE.Vector2(1080,1920)},uRim:{value:new THREE.Vector3(...CAUGHT_HANDS_DEFAULTS.rim)},uTint:{value:new THREE.Vector3(...CAUGHT_HANDS_DEFAULTS.tint)}};
 const mat=new THREE.ShaderMaterial({uniforms,vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthTest:false,depthWrite:false,
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);mesh.frustumCulled=false;mesh.renderOrder=1e6;mesh.visible=false;mesh.name='caught-vfx';
 scene?.add(mesh);const tmp=new THREE.Vector2();
 function update(c,{aspect,width,height}={}){if(!c){mesh.visible=false;return null;}
  let w=width,h=height;if((!w||!h)&&post?.width){w=post.width;h=post.height;}if((!w||!h)&&renderer){renderer.getDrawingBufferSize(tmp);w=tmp.x;h=tmp.y;}
  const A=aspect||(w&&h?w/h:9/16);const L=caughtLayout(c,{aspect:A});mesh.visible=true;
  uniforms.uAspect.value=A;uniforms.uRes.value.set(w||1080,h||1920);uniforms.uTime.value=L.t;uniforms.uSeed.value=(L.seed%97)/97;
  uniforms.uFlash.value=L.flash;uniforms.uBlack.value=L.black;uniforms.uGlitch.value=L.glitch;uniforms.uVig.value.set(L.vignette.r,L.vignette.soft,L.vignette.amount,0);
  uniforms.uRim.value.set(...L.rim);uniforms.uTint.value.set(...L.tint);
  L.shadows.forEach((s,k)=>{uniforms.uSh.value[k].set(s.x,s.y,s.rx,s.ry);uniforms.uShA.value.setComponent(k,s.a);});
  uniforms.uN.value=L.hands.length;
  L.hands.forEach((hd,i)=>{const P=uniforms.uP.value,b=i*PPH;P[b].set(...hd.base);P[b+1].set(...hd.wrist);hd.fingers.forEach((f,fi)=>f.forEach((q,j)=>P[b+2+fi*4+j].set(...q)));
   uniforms.uBox.value[i].set(...hd.box,1);uniforms.uW.value[i].set(hd.scale,.026*hd.scale,.011*hd.scale,.0165*hd.scale);});
  return L;}
 return {mesh,update,dispose(){scene?.remove(mesh);mesh.geometry.dispose();mat.dispose();}};}
