// ORIGINAL giant kaiju for the JR編 ending gag (beat `kaiju`, shot `kaiju-skyline`) — v7 (HAGINO steering 2026-10-27:
// "original Showa-style giant kaiju: black, taller than buildings, dorsal plates, glowing beam from mouth — clearly NOT
// the famous one"). Working name 「ショウワ・クリスタル」 (never shown on screen).
//
// Silhouette, deliberately unlike the famous upright lizard:
//   * HUNCHED, QUADRUPED-ISH: a low, humped torso on four thick, splayed legs (the forelegs plant like a bulldog/turtle),
//     never standing upright; no tail drawn (the hindquarters sit behind the towers anyway).
//   * LONG, CURVED NECK rising from the front of the hump (sauropod/turtle-dragon), carrying a small BEAKED head (hooked
//     upper beak + lower beak = the mouth) with TWO swept-back HORNS and a thin bony CREST — no reptile snout, no teeth row.
//   * DORSAL CRYSTALS: hexagonal crystal PRISMS (pointed, glassy, glowing violet→cyan from inside) in two staggered rows
//     along the hump and up the neck — spiky shards, not leaf-shaped plates.
//   * BEAM: a straight glowing violet/cyan beam from the open beak, aimed up into the empty night sky (it never hits the
//     city: absurd, harmless). Eyes: small amber slits.
// Rendered stylised in CG (own ShaderMaterial, flat-ish toon light + strong two-tone rim so the black body reads against
// the night sky), so the gag reads as fiction. Roar sound is the project's own synth (tools/audio sfx kaiju_roar).
//
// Animation (pure function of env.kaiju + time; deterministic):
//   rise 0..1 → it heaves up from behind the skyline (depth-tested: the towers occlude it), neck uncurling last;
//   eyes 0..1 → eyes light; the crystals glow up with them;
//   roar 0..1 → neck rears up and back, beak opens, the crystals charge base→tip, then the beam fires (beam 0..1);
//   idle → slow breathing, small head sway.
//
// API (unchanged since the combined episodes)
//   createKaiju({scene, options?}) → {group, update(kaijuEnvOrNull, {camera, time}) → pose|null, parts, dispose()}
//     kaijuEnv (shots-variants.mjs 'kaiju-skyline' env.kaiju) = {t, rise 0..1, eyes 0..1, roar 0..1, shake, pos:[x,z],
//       scale (height of the beast in m: ground → head top, default 150), seed, ground? (y of the base, default 0),
//       yaw? (rad; default: 3/4 view — side-on to the camera, head turned a little toward it), fog?, colors?}
//     null → hidden.
//   kaijuPose(kaijuEnv, time) → pure pose (node-testable): {y, breathe, neckUp, lean, mouth 0..1, beam 0..1, charge 0..1,
//     eyeGlow, crystalGlow, sway, legLift, rise}
//   KAIJU_PARTS part list (name → description), KAIJU_DEFAULTS.
import * as THREE from '../../vendor/three.module.min.js';
import {shared,common} from '../shaders.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export const KAIJU_DEFAULTS=Object.freeze({scale:150,fog:.12,yawOffset:Math.PI+.45,
 colors:{body:0x0d0e12,belly:0x1b1a22,horn:0x2a2630,beak:0x24212a,crystal:0x8a5cff,crystalCore:0x6ff2ff,eye:0xffa22a,beam:0xb48cff,beamCore:0xe8fbff,mouth:0x050307}});
export const KAIJU_PARTS=Object.freeze({
 torso:'low humped torso, black (hunched, quadruped stance)',
 legs:'4 thick splayed legs, forelegs planted',
 neck:'long curved neck rising from the front of the hump',
 head:'small head with a hooked upper beak',
 mouth:'lower beak = jaw (opens on the roar)',
 horns:'2 swept-back horns + a thin bony crest',
 crystals:'dorsal crystal prisms (hexagonal, glowing violet→cyan), 2 staggered rows on the hump + up the neck',
 eyes:'2 small amber slit eyes',
 beam:'glowing violet/cyan beam from the open beak, up into the empty sky'});

// pure pose (units: beast height)
export function kaijuPose(k,time){if(!k)return null;const t=time??k.t??0,seed=k.seed??3,rise=clamp(k.rise??1),roar=clamp(k.roar??0),eyes=clamp(k.eyes??1);
 const r=rise*rise*(3-2*rise);
 const y=-1.1*(1-r)+.008*Math.sin(t*1.3+seed)*rise;// fully below the skyline at rise 0
 const breathe=1+.018*Math.sin(t*1.7+seed);
 const uncurl=smooth(.55,1,rise);// the neck uncurls as it finishes rising
 const charge=smooth(0,.35,roar),beam=smooth(.3,.55,roar);// crystals charge, then the beam fires
 return {y,breathe,neckUp:-.5*(1-uncurl)+.32*smooth(0,.4,roar),lean:-.06*smooth(0,.4,roar)+.015*Math.sin(t*.9+seed),
  mouth:smooth(.05,.35,roar),beam,charge,eyeGlow:eyes*(1+.6*roar),crystalGlow:.25*eyes+.75*charge,
  sway:.05*Math.sin(t*.7+seed*2)*rise,legLift:.04*smooth(0,.3,roar),rise};}

const VERT=/* glsl */`varying vec3 vN,vW,vL;varying vec2 vUv;
void main(){vUv=uv;vL=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG=/* glsl */`${common}
uniform vec3 uColor,uColor2;uniform float uMode,uEmis,uFog,uRimK,uGlow,uAlpha;varying vec3 vN,vW,vL;varying vec2 vUv;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}
void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vW);vec3 base=uColor;
 if(uMode>.5&&uMode<1.5){// hide: hard, pebbly black (cell noise darkening) + a slightly lighter underside
  vec3 q=floor(vL*38.);base*=.75+.5*h3(q);base=mix(base,uColor2,smoothstep(.1,-.4,n.y));}
 if(uMode>1.5&&uMode<2.5){// crystal: core colour toward the tip, faceted flicker, glow
  float tip=clamp(vUv.y,0.,1.);vec3 c=mix(uColor,uColor2,tip);float facet=.65+.35*abs(dot(n,normalize(vec3(.3,.8,.5))));
  vec3 col=c*(.18+facet*.35)+c*uGlow*(1.2+1.6*tip);float fr=pow(1.-clamp(dot(n,v),0.,1.),2.);col+=uColor2*fr*(.4+uGlow);
  vec3 fc=applyFog(col,vW,cameraPosition);gl_FragColor=vec4(mix(col,fc,uFog*.5),1.);return;}
 if(uMode>2.5){// beam: additive glow, bright core
  float ax=abs(vUv.x-.5)*2.;float core=pow(1.-ax,3.);vec3 col=mix(uColor,uColor2,core)*(1.+3.*core)*uGlow;
  float fl=.85+.15*sin(vUv.y*60.-uGlow*40.);gl_FragColor=vec4(col*fl,uAlpha*uGlow);return;}
 // toon-ish night light: dark sky ambient, warm city uplight from below, cool moon key, strong violet/cyan rim
 vec3 col=base*(vec3(.10,.10,.14)+vec3(.55,.34,.22)*clamp(-n.y*.6+.25,0.,1.));
 col+=base*vec3(.6,.55,.6)*smoothstep(.1,.4,dot(n,normalize(vec3(-.5,.7,.3))));
 float fr=pow(1.-clamp(dot(n,v),0.,1.),3.2);col+=mix(vec3(.45,.25,.9),vec3(.3,.8,1.),clamp(n.y*.5+.5,0.,1.))*fr*uRimK*(.8+.6*uGlow);
 col+=uColor*uEmis;
 vec3 fc=applyFog(col,vW,cameraPosition);col=mix(col,fc,uFog);
 gl_FragColor=vec4(col,1.);}`;

// a tube along a 3D curve (Catmull-Rom), radius r(u)
function tube(points,radius,seg=28,radial=14){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 const g=new THREE.TubeGeometry(curve,seg,1,radial,false);const P=g.attributes.position,N=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<P.count;i++){const u=uv.getX(i),c=curve.getPointAt(Math.min(1,u)),rr=radius(u);P.setXYZ(i,c.x+N.getX(i)*rr,c.y+N.getY(i)*rr,c.z+N.getZ(i)*rr);}
 g.computeVertexNormals();return {geo:g,curve};}

export function createKaiju({scene,options={}}={}){
 const C={...KAIJU_DEFAULTS.colors,...(options.colors||{})};const group=new THREE.Group();group.name='kaiju';group.visible=false;
 const mats=[];
 const mk=(color,{mode=0,color2=0x000000,emis=0,rim=1,beam=false}={})=>{const m=new THREE.ShaderMaterial({uniforms:{...shared,uColor:{value:new THREE.Color(color)},uColor2:{value:new THREE.Color(color2)},
  uMode:{value:mode},uEmis:{value:emis},uFog:{value:.3},uRimK:{value:rim},uGlow:{value:0},uAlpha:{value:.9}},vertexShader:VERT,fragmentShader:FRAG,
  ...(beam?{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}:{})});m.userData.rim=rim;mats.push(m);return m;};
 // pivot = ground under the torso centre; local +x = forward (head side), +y up; group.scale = height in m
 const pivot=new THREE.Group();group.add(pivot);
 const hide=mk(C.body,{mode:1,color2:C.belly,rim:.3});
 // torso: humped ellipsoid (higher at the shoulders), low to the ground
 const torsoGeo=new THREE.SphereGeometry(.5,40,24);{const p=torsoGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const hump=1+.35*Math.exp(-((x-.12)**2)/.05)*clamp(y*2+.4);// shoulder hump
  p.setXYZ(i,x*.86,y*.56*hump,z*.5);}torsoGeo.computeVertexNormals();}
 const torso=new THREE.Mesh(torsoGeo,hide);torso.position.set(0,.38,0);pivot.add(torso);
 // legs: thick, splayed, slightly bent tubes; forelegs planted forward
 const legs=[[.24,.16],[.24,-.16],[-.26,.15],[-.26,-.15]].map(([x,z],i)=>{const g=new THREE.Group();g.position.set(x,.36,z);
  const s=Math.sign(z),fore=x>0;const {geo}=tube([[0,0,0],[fore?.06:-.02,-.14,s*.06],[fore?.1:-.04,-.36,s*.1]],u=>.085-.02*u+.02*Math.exp(-((u-.95)**2)/.004),10,10);
  const m=new THREE.Mesh(geo,hide);g.add(m);g.userData={x,z,fore};pivot.add(g);return g;});
 // neck + head group: rotates up/down at the base of the neck (neckUp)
 const neckBase=new THREE.Group();neckBase.position.set(.3,.5,0);pivot.add(neckBase);
 const NECK=[[0,0,0],[.12,.14,0],[.2,.32,0],[.24,.5,0]];
 const {geo:neckGeo,curve:neckCurve}=tube(NECK,u=>.13-.075*u,32,14);const neck=new THREE.Mesh(neckGeo,hide);neckBase.add(neck);
 const head=new THREE.Group();head.position.set(...NECK[3]);neckBase.add(head);
 const skull=new THREE.Mesh(new THREE.SphereGeometry(.075,24,16),hide);skull.scale.set(1.35,.85,.8);head.add(skull);
 const beakMat=mk(C.beak,{rim:.5});
 // upper beak: hooked cone pointing forward (+x), tip curling down
 const upper=new THREE.Mesh(new THREE.ConeGeometry(.045,.13,14),beakMat);upper.rotation.z=-Math.PI/2-.25;upper.position.set(.11,-.005,0);head.add(upper);
 const hook=new THREE.Mesh(new THREE.ConeGeometry(.018,.04,10),beakMat);hook.rotation.z=Math.PI;hook.position.set(.165,-.03,0);head.add(hook);
 // jaw (lower beak) pivots at the back of the beak
 const jaw=new THREE.Group();jaw.position.set(.05,-.03,0);head.add(jaw);
 const lower=new THREE.Mesh(new THREE.ConeGeometry(.032,.1,12),beakMat);lower.rotation.z=-Math.PI/2+.12;lower.position.set(.05,-.005,0);jaw.add(lower);
 const mouthDisc=new THREE.Mesh(new THREE.SphereGeometry(.03,12,8),mk(C.mouth,{rim:0}));mouthDisc.position.set(.06,-.015,0);mouthDisc.scale.set(1.4,.4,.7);head.add(mouthDisc);
 // horns: two swept-back cones + a thin crest fin between them
 const hornMat=mk(C.horn,{rim:.6});
 const horns=[-1,1].map(s=>{const h=new THREE.Mesh(new THREE.ConeGeometry(.022,.17,10),hornMat);h.position.set(-.07,.06,s*.04);h.rotation.set(s*.25,0,Math.PI/2+.55);head.add(h);return h;});
 const crestShape=new THREE.Shape();crestShape.moveTo(.04,.04);crestShape.lineTo(-.02,.12);crestShape.lineTo(-.12,.07);crestShape.lineTo(-.06,.03);crestShape.lineTo(.04,.04);
 const crest=new THREE.Mesh(new THREE.ExtrudeGeometry(crestShape,{depth:.008,bevelEnabled:false}),hornMat);crest.position.z=-.004;head.add(crest);
 // eyes: small amber slits on both sides of the skull
 const eyeMat=mk(C.eye,{emis:2,rim:0});
 const eyes=[-1,1].map(s=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),eyeMat);e.scale.set(1.8,.55,.6);e.position.set(.035,.02,s*.055);head.add(e);return e;});
 // crystals: hexagonal prisms with a pointed tip (6-sided cone + cylinder base), along the hump + up the neck
 const crystalMat=mk(C.crystal,{mode:2,color2:C.crystalCore,rim:0});
 const prism=(()=>{const a=new THREE.CylinderGeometry(.5,.55,.55,6,1);a.translate(0,.275,0);const b=new THREE.ConeGeometry(.5,.45,6,1);b.translate(0,.55+.225,0);
  const g=mergeSimple([a,b]);// uv.y = height fraction (tip glow)
  const P=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<P.count;i++)uv.setY(i,clamp(P.getY(i)/1));return g;})();
 const crystals=[];
 const addCrystal=(parent,pos,h,tiltZ,tiltX,order)=>{const m=new THREE.Mesh(prism,crystalMat);m.position.set(...pos);m.scale.set(h*.32,h,h*.32);m.rotation.set(tiltX,0,tiltZ);m.userData.order=order;parent.add(m);crystals.push(m);};
 // hump rows (staggered left/right), tallest over the shoulders, raked back
 const HUMP=[[-.3,.06],[-.2,.1],[-.1,.14],[0,.18],[.1,.2],[.18,.17],[.26,.12]];
 HUMP.forEach(([x,h],i)=>{const yTop=.38+.28*(1+.35*Math.exp(-((x/.86-.12)**2)/.05))*.98;
  addCrystal(pivot,[x,yTop-.02,(i%2?.045:-.045)],h,.45,(i%2?.18:-.18),i/(HUMP.length+5));
  if(i%2===0)addCrystal(pivot,[x+.04,yTop-.04,(i%2?-.08:.08)],h*.6,.5,(i%2?-.3:.3),i/(HUMP.length+5)+.02);});
 // neck row (smaller, following the curve)
 [.2,.42,.62,.8].forEach((u,j)=>{const p=neckCurve.getPointAt(u),tan=neckCurve.getTangentAt(u);const rad=.13-.075*u;
  const ang=Math.atan2(tan.y,tan.x);addCrystal(neckBase,[p.x-Math.sin(ang)*-rad*.0-rad*.7*Math.sin(ang),p.y+rad*.7*Math.cos(ang),0],.09-.05*u,ang+.4,0,(HUMP.length+j)/(HUMP.length+5));});
 // beam: a long open cylinder from the beak, pointing forward-up out of the mouth (head-local), length animated
 const beamMat=mk(C.beam,{mode:3,color2:C.beamCore,rim:0,beam:true});
 const beamGeo=new THREE.CylinderGeometry(.03,.05,1,16,1,true);beamGeo.translate(0,.5,0);{const uv=beamGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)*2)%1);}
 const beam=new THREE.Group();beam.position.set(.16,-.02,0);beam.rotation.z=-Math.PI/2+.05;head.add(beam);
 const beamMesh=new THREE.Mesh(beamGeo,beamMat);beamMesh.frustumCulled=false;beam.add(beamMesh);
 const glow=new THREE.Mesh(new THREE.CylinderGeometry(.09,.14,1,16,1,true).translate(0,.5,0),beamMat);glow.frustumCulled=false;beam.add(glow);
 beam.visible=false;
 scene?.add(group);
 function update(k,{camera=null,time}={}){if(!k){group.visible=false;return null;}
  const t=time??k.t??0,P=kaijuPose(k,t);const S=k.scale??KAIJU_DEFAULTS.scale,pos=k.pos||[0,0];
  group.visible=P.rise>0;group.scale.setScalar(S);group.position.set(pos[0],(k.ground??0)+P.y*S,pos[1]);
  // default yaw: side-on to the camera (local +x across the screen), head turned a little toward it
  let yaw=k.yaw;if(yaw==null&&camera)yaw=Math.atan2(camera.position.x-pos[0],camera.position.z-pos[1])+KAIJU_DEFAULTS.yawOffset;
  group.rotation.set(0,(yaw??0)+P.sway*.4,0);
  torso.scale.set(1,P.breathe,1);pivot.rotation.z=P.lean;
  legs.forEach(l=>{l.rotation.z=l.userData.fore?P.legLift*(l.userData.z>0?1:.4):0;});
  neckBase.rotation.z=P.neckUp;head.rotation.z=-P.neckUp*.55+.08*Math.sin(t*1.1+(k.seed??3))*(1-P.mouth)+.35*P.mouth;
  jaw.rotation.z=-.65*P.mouth;
  // glow: eyes, crystals charge from the hump base toward the neck (order 0..1), beam
  eyeMat.uniforms.uEmis.value=.2+2.4*P.eyeGlow;
  const cg=P.crystalGlow;crystals.forEach(c=>{c.userData.g=clamp(cg*1.4-c.userData.order*.6*(1-P.beam));});
  crystalMat.uniforms.uGlow.value=cg;// shared material: the per-crystal stagger reads through the scale pulse below
  crystals.forEach(c=>{const s=1+.06*c.userData.g*Math.sin(t*14+c.userData.order*9);c.scale.x=c.scale.z=c.userData.base??(c.userData.base=c.scale.x);c.scale.x*=s;c.scale.z*=s;});
  beam.visible=P.beam>0;beamMat.uniforms.uGlow.value=P.beam;beam.scale.set(1+.15*Math.sin(t*30),14*P.beam,1+.15*Math.sin(t*30));
  const fog=k.fog??KAIJU_DEFAULTS.fog;for(const m of mats){m.uniforms.uFog.value=fog;if(m!==crystalMat&&m!==beamMat)m.uniforms.uGlow.value=cg;}
  group.updateMatrixWorld(true);
  return P;}
 return {group,update,parts:{torso,legs,neck,head,jaw,mouth:jaw,horns,crest,eyes,crystals,beam},dispose(){scene?.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const m of mats)m.dispose();}};}

// merge non-indexed copies of BufferGeometries (position/normal/uv) — avoids the BufferGeometryUtils addon
function mergeSimple(geos){const parts=geos.map(g=>g.index?g.toNonIndexed():g);let n=0;for(const g of parts)n+=g.attributes.position.count;
 const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2);let o=0;
 for(const g of parts){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);uv.set(g.attributes.uv.array,o*2);o+=g.attributes.position.count;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;}
