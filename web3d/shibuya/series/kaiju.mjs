// ORIGINAL giant kaiju for the JR編 combined episodes' ending gag (beat `kaiju`, shot `kaiju-skyline`):
// 「おばけモチ」(working name, never shown on screen unless the director writes it) — a colossal, round, rubbery
// GUMDROP / MOCHI BLOB in saturated Halloween purple with a lavender belly patch and bright pink polka dots, TWO big
// glowing lime eyes of UNEVEN size side by side (left bigger + a bit higher, cartoon pupils looking down at the street,
// slightly cross-eyed), a wide goofy mouth (closed: a thin smile; roar: a big round "O" with a pink tongue and one buck
// tooth hanging from the upper rim INSIDE the dark disc), two STUBBY little arms (round nubs) and a BIG orange/purple
// striped party hat with a pompom, tilted jauntily to one side so it reads from the low street camera. No tail, no
// spines, no dorsal plates, no scales, no claws, no reptile snout, no breath beam — the silhouette is a dome + a big
// tilted party hat, i.e. it must not read as any real film monster, and no antenna / three-eyes-in-a-triangle look
// either (QA 2026-10-26: that read like a famous animated toy alien). Goofy, not scary.
//
// Animation (pure function of env.kaiju + time; deterministic):
//   rise 0..1  → the blob comes up from below the ground behind the buildings (depth-tested: the skyline occludes it),
//                with a jelly wobble that settles; eyes 0..1 → eyes light up (HDR → bloom) with a blink cue;
//   roar 0..1  → mouth opens to an "O", arms go up, body stretches + leans back, hat hops; idle → slow bob / sway.
// Night lighting (own ShaderMaterial, cheap on SwiftShader: ~9k tris, 11 draws): dark sky ambient, warm city uplight
// from below, a soft (low, slightly violet) moon key from upper left — kept low so the purple / spots / belly stay
// saturated instead of washing to lavender — a two-tone rim (cyan / magenta fresnel, narrower) so the silhouette reads
// against the sky glow, eye-glow spill on the face, reduced scene fog (shared uFog* of shaders.mjs × fog).
//
// API
//   createKaiju({scene, options?}) → {group, update(kaijuEnvOrNull, {camera, time}) → pose|null, dispose()}
//     kaijuEnv (shots-variants.mjs 'kaiju-skyline' env.kaiju) = {t, rise 0..1, eyes 0..1, roar 0..1, shake, pos:[x,z],
//       scale (height of the body in m, default 150), seed, ground? (y of the base, default 0), yaw? (rad; default:
//       face the camera), fog? (scene-fog factor, default .35), colors? {body, belly, spot, hat, eye} (hex)}
//     null → hidden. camera: yaw-to-camera + eye pupils aim; time: idle bob / jelly (default env.t).
//   kaijuPose(kaijuEnv, time) → pure pose (node-testable): {y (base offset, × scale), squash, stretch, lean, armUp,
//     mouth 0..1, eyeGlow, blink 0..1, hatHop, bob, sway}
//   KAIJU_PARTS  part list (name → description), KAIJU_DEFAULTS.
import * as THREE from '../../vendor/three.module.min.js';
import {shared,common} from '../shaders.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export const KAIJU_DEFAULTS=Object.freeze({scale:150,fog:.35,colors:{body:0x7a22d6,belly:0xd9a8ff,spot:0xff8fd8,hat:0xff8a1f,stripe:0x5a1fa8,eye:0xd8ff4a,pupil:0x120818,mouth:0x2a0a22,tongue:0xff6fa8,tooth:0xfff6e8,pom:0xfff2a0}});
export const KAIJU_PARTS=Object.freeze({body:'round gumdrop blob (sphere, wider bottom, jelly wobble)',belly:'lavender belly patch (shader)',spots:'polka dots (shader)',
 eyes:'2 glowing lime eyes side by side, uneven sizes + pupils',mouth:'wide smile → round O (dark), pink tongue, one buck tooth',arms:'2 stubby round arms',hat:'big striped party hat + pompom, tilted'});

// pure pose: base y offset and deformations (all in units of the body height)
export function kaijuPose(k,time){if(!k)return null;const t=time??k.t??0,seed=k.seed??3,rise=clamp(k.rise??1),roar=clamp(k.roar??0),eyes=clamp(k.eyes??1);
 const r=rise*rise*(3-2*rise)+.06*Math.sin(Math.PI*smooth(.72,1,rise));// eased, small overshoot near the top = comedic "boing"
 const settle=Math.sin(t*9+seed)*.05*Math.exp(-3*Math.max(0,t-(k.riseEnd??0)))*smooth(.6,1,rise)*(1-smooth(.98,1,rise)*.5);
 const bob=Math.sin(t*1.6+seed)*.012*rise,sway=Math.sin(t*.9+seed*2)*.04*rise;
 const y=-1.15*(1-r)+bob;// fully below ground at rise 0
 const blinkPh=((t*.43+seed*.17)%1+1)%1,blink=roar>.2?0:smooth(.0,.04,blinkPh)*(1-smooth(.06,.1,blinkPh));
 return {y,squash:1+settle-.04*roar,stretch:1-settle*.6+.07*roar,lean:-.12*roar+.02*Math.sin(t*1.1+seed),armUp:smooth(0,.7,roar),
  mouth:smooth(0,.8,roar),eyeGlow:eyes*(1+.35*roar),blink,hatHop:roar*(.04+.03*Math.abs(Math.sin(t*11))),bob,sway,rise};}

const VERT=/* glsl */`varying vec3 vN,vW,vL;varying vec2 vUv;uniform float uJelly,uTime;
void main(){vUv=uv;vec3 p=position;p+=normal*uJelly*sin(p.y*9.+uTime*3.)*.012;vL=p;vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG=/* glsl */`${common}
uniform vec3 uColor,uColor2,uColor3,uEyePos;uniform float uMode,uEmis,uFog,uRimK,uEyeGlow,uSpill;varying vec3 vN,vW,vL;varying vec2 vUv;
void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vW);vec3 base=uColor;
 if(uMode>.5&&uMode<1.5){// body: belly patch (front, lower) + polka dots
  float belly=smoothstep(.62,.5,length((vL.xy-vec2(0.,-.12))*vec2(1.25,.95)))*smoothstep(-.05,.25,vL.z);base=mix(base,uColor2,belly);
  vec2 sp=vec2(atan(vL.x,vL.z)*2.6,vL.y*7.5);vec2 c=fract(sp)-.5;float dot_=smoothstep(.24,.19,length(c))*step(.45,fract(sin(dot(floor(sp),vec2(12.9,78.2)))*43758.5))*(1.-belly);base=mix(base,uColor3,dot_);}
 if(uMode>1.5&&uMode<2.5){// hat stripes
  base=mix(uColor,uColor2,step(.5,fract(vUv.y*4.+vUv.x*1.)));}// diagonal candy stripes
 // night lighting: sky ambient, warm city uplight, cool moon key, two-tone rim
 vec3 col=base*(vec3(.08,.06,.12)+vec3(.62,.36,.24)*clamp(-n.y*.6+.3,0.,1.)*1.25);
 col+=base*vec3(.36,.3,.46)*clamp(dot(n,normalize(vec3(-.5,.65,.35))),0.,1.)*.5;
 col+=base*.22*clamp(dot(n,v),0.,1.);// soft camera-side fill: the base colour (purple, spots, belly) reads from the street
 float fr=pow(1.-clamp(dot(n,v),0.,1.),3.2);col+=mix(vec3(.25,.9,1.3),vec3(1.2,.35,1.1),clamp(n.x*.5+.5,0.,1.))*fr*uRimK;
 // eye-glow spill on the face
 col+=vec3(.5,.7,.1)*uEyeGlow*.25*clamp(1.-length(vW-uEyePos)/max(uSpill,1e-3),0.,1.)*base;
 col+=uColor*uEmis;
 vec3 fc=applyFog(col,vW,cameraPosition);col=mix(col,fc,uFog);
 gl_FragColor=vec4(col,1.);}`;

export function createKaiju({scene,options={}}={}){
 const C={...KAIJU_DEFAULTS.colors,...(options.colors||{})};const group=new THREE.Group();group.name='kaiju';group.visible=false;
 const mats=[];
 const mk=(color,{mode=0,color2=0x000000,color3=0x000000,emis=0,rim=1}={})=>{const m=new THREE.ShaderMaterial({uniforms:{...shared,uColor:{value:new THREE.Color(color)},uColor2:{value:new THREE.Color(color2)},uColor3:{value:new THREE.Color(color3)},
  uMode:{value:mode},uEmis:{value:emis},uFog:{value:.35},uRimK:{value:rim},uEyeGlow:{value:1},uEyePos:{value:new THREE.Vector3()},uSpill:{value:40},uJelly:{value:0},uTime:shared.uTime},vertexShader:VERT,fragmentShader:FRAG});mats.push(m);return m;};
 // pivot: base of the body at the origin; everything in units of the body height (group.scale = height in m)
 const pivot=new THREE.Group();group.add(pivot);
 const bodyGeo=new THREE.SphereGeometry(.5,48,32);{const p=bodyGeo.attributes.position;for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const w=1+.16*clamp(-y*2)-.06*clamp(y*2);// wider bottom (gumdrop)
  if(y<-.38)y=-.38+(y+.38)*.35;// flattened base
  p.setXYZ(i,x*w*1.02,y+.5,z*w*.92);}bodyGeo.computeVertexNormals();}
 const bodyMat=mk(C.body,{mode:1,color2:C.belly,color3:C.spot,rim:.75});bodyMat.uniforms.uJelly.value=1;
 const body=new THREE.Mesh(bodyGeo,bodyMat);pivot.add(body);
 // eyes: TWO, side by side, uneven (left bigger + higher: goofy), on the front surface (+z), slightly protruding;
 // pupils a little cross-eyed (each nudged toward the nose) and looking down at the street
 const eyeMat=mk(C.eye,{emis:2.4,rim:.3}),pupilMat=mk(C.pupil,{rim:.2}),hiMat=mk(0xffffff,{emis:3,rim:0});
 const eyes=[[-.17,.66,.37,.13,1],[.18,.62,.385,.1,-1]].map(([x,y,z,r,px])=>{const g=new THREE.Group();g.position.set(x,y,z);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),eyeMat);const pupil=new THREE.Mesh(new THREE.SphereGeometry(r*.48,16,12),pupilMat);pupil.position.set(px*r*.2,-r*.2,r*.6);
  const hi=new THREE.Mesh(new THREE.SphereGeometry(r*.14,8,6),hiMat);hi.position.set(r*.28,r*.25,r*.9);g.add(ball,pupil,hi);g.userData={r,pupil,hi,x,y};pivot.add(g);return g;});
 // mouth: dark disc (scaled open), tongue + one buck tooth inside
 const mouth=new THREE.Group();mouth.position.set(0,.4,.47);pivot.add(mouth);
 const mouthMesh=new THREE.Mesh(new THREE.SphereGeometry(.15,32,16),mk(C.mouth,{rim:0}));mouthMesh.scale.z=.42;mouth.add(mouthMesh);// flattened ellipsoid: protrudes from the curved body at any opening (upper rim too)
 const tongue=new THREE.Mesh(new THREE.SphereGeometry(.075,16,10),mk(C.tongue,{rim:.2,emis:.15}));tongue.scale.set(1.2,.55,.3);tongue.position.set(0,-.07,.05);mouth.add(tongue);
 // buck tooth: hangs from the upper rim, fully inside the dark disc (mouth-local, scales with the opening; QA 2026-10-26:
 // at y .085 it sat above the visible part of the disc and read as a nose)
 const tooth=new THREE.Mesh(new THREE.BoxGeometry(.045,.04,.02),mk(C.tooth,{rim:.2,emis:.25}));tooth.position.set(.03,.045,.062);mouth.add(tooth);
 mouth.rotation.x=-.2;
 // stubby arms (round nubs), pivot at the shoulder
 const armMat=mk(C.body,{mode:0,rim:.75});
 const arms=[-1,1].map(s=>{const g=new THREE.Group();g.position.set(s*.47,.42,.05);const a=new THREE.Mesh(new THREE.CapsuleGeometry(.07,.12,6,12),armMat);a.position.set(s*.08,-.01,0);a.rotation.z=-s*Math.PI/2;g.add(a);g.userData.s=s;pivot.add(g);return g;});
 // party hat: BIG striped cone tilted well to the right (reads beside/above the head from the low street camera and
 // stays inside the 9:16 frame at the combined kaiju framing) + pompom
 const HAT={x:.22,y:.9,z:-.05,tilt:-.62,r:.2,h:.4};
 const hat=new THREE.Group();hat.position.set(HAT.x,HAT.y,HAT.z);hat.rotation.z=HAT.tilt;pivot.add(hat);
 const cone=new THREE.Mesh(new THREE.ConeGeometry(HAT.r,HAT.h,28,6,true),mk(C.hat,{mode:2,color2:C.stripe,rim:.6,emis:.12}));cone.position.y=HAT.h/2;hat.add(cone);
 const pom=new THREE.Mesh(new THREE.SphereGeometry(.06,14,10),mk(C.pom,{rim:.8,emis:.5}));pom.position.y=HAT.h+.02;hat.add(pom);
 scene?.add(group);
 const tmpV=new THREE.Vector3();
 function update(k,{camera=null,time}={}){if(!k){group.visible=false;return null;}
  const t=time??k.t??0,P=kaijuPose(k,t);const S=k.scale??KAIJU_DEFAULTS.scale,pos=k.pos||[0,0];
  group.visible=P.rise>0;group.scale.setScalar(S);group.position.set(pos[0],(k.ground??0)+P.y*S,pos[1]);
  let yaw=k.yaw;if(yaw==null&&camera)yaw=Math.atan2(camera.position.x-pos[0],camera.position.z-pos[1]);group.rotation.set(0,(yaw??0)+P.sway*.5,0);
  pivot.scale.set(P.squash,P.stretch,P.squash);pivot.rotation.x=P.lean;
  // arms: idle droop down-out with a little flap; roar → both up ("ta-da!")
  arms.forEach(a=>{const s=a.userData.s;a.rotation.z=s*(-.55+P.armUp*1.75+Math.sin(t*3+s)*.1*(1-P.armUp));a.rotation.x=-P.armUp*.35;});
  mouth.scale.set(1+.15*P.mouth,.12+P.mouth*1.05,1);tongue.visible=P.mouth>.3;tooth.visible=P.mouth>.55;
  hat.position.y=HAT.y+P.hatHop;hat.rotation.z=HAT.tilt+Math.sin(t*7)*.12*P.mouth;
  // eyes: glow, blink (squash y), pupils aim down toward the camera (it looks at the street)
  for(const e of eyes){e.scale.set(1,1-.9*P.blink+.1*P.mouth,1);}
  const fog=k.fog??KAIJU_DEFAULTS.fog;for(const m of mats){m.uniforms.uFog.value=fog;m.uniforms.uEyeGlow.value=P.eyeGlow;}
  eyeMat.uniforms.uEmis.value=.25+2.6*P.eyeGlow;hiMat.uniforms.uEmis.value=.4+2.6*P.eyeGlow;eyeMat.uniforms.uColor.value.set(C.eye).multiplyScalar(.35+.65*clamp(P.eyeGlow));
  group.updateMatrixWorld(true);eyes[0].getWorldPosition(tmpV);for(const m of mats){m.uniforms.uEyePos.value.copy(tmpV);m.uniforms.uSpill.value=.32*S;}
  for(const m of mats)m.uniforms.uRimK.value=m.userData.rim??m.uniforms.uRimK.value;
  return P;}
 for(const m of mats)m.userData.rim=m.uniforms.uRimK.value;
 return {group,update,parts:{body,eyes,mouth,arms,hat},dispose(){scene?.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const m of mats)m.dispose();}};}
