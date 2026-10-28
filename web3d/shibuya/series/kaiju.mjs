// ORIGINAL giant kaiju for the JR編 ending gag (beat `kaiju`, shot `kaiju-skyline`) — v7 (HAGINO steering 2026-10-27:
// "original Showa-style giant kaiju: black, taller than buildings, dorsal plates, glowing beam from mouth — clearly NOT
// the famous one"). Working name 「ショウワ・クリスタル」 (never shown on screen).
// v8 (HAGINO steering 2026-10-28, STEERING-sim-core §E: fewer echoes of the famous film monster): the dorsal glow is a NON-BLUE party
// palette (hot pink / orange / yellow / lime / magenta) cycling like party lights, and the mouth BEAM is gone — the beak
// fires a one-shot CONFETTI / PARTY-CANNON blast instead (no continuous breath beam, no blue/cyan anywhere in the glow).
//
// Silhouette, deliberately unlike the famous upright lizard:
//   * HUNCHED, QUADRUPED-ISH: a low, humped torso on four thick, splayed legs (the forelegs plant like a bulldog/turtle),
//     never standing upright; no tail drawn (the hindquarters sit behind the towers anyway).
//   * LONG, CURVED NECK rising from the front of the hump (sauropod/turtle-dragon), carrying a small BEAKED head (hooked
//     upper beak + lower beak = the mouth) with TWO swept-back HORNS and a thin bony CREST — no reptile snout, no teeth row.
//   * DORSAL CRYSTALS: hexagonal crystal PRISMS (pointed, glassy, glowing from inside in PARTY-LIGHT colours — hot pink,
//     orange, yellow, lime, magenta; each crystal offset in the cycle so colour ripples along the spine; hue never in the
//     blue/cyan/violet-blue band 170°–260°: partyColor()) in two staggered rows along the hump and up the neck — spiky
//     shards, not leaf-shaped plates.
//   * CONFETTI BLAST (party cannon): when the beak opens on the roar it POPS once — a short bright starburst flash at the
//     beak, a cone of ~700 tumbling paper pieces (one InstancedMesh, party colours) that spreads, slows with air drag and
//     drifts down a little, plus a few curly streamers (ribbons). Aimed steeply up into the empty night sky (never at the
//     city: absurd, harmless). Not a beam: no cylinder/beam mesh at all. Eyes: small amber slits.
// Rendered stylised in CG (own ShaderMaterial, flat-ish toon light + strong two-tone warm party-coloured rim so the black
// body reads against the night sky), so the gag reads as fiction. Roar sound is the project's own synth (tools/audio sfx
// kaiju_roar); the pop is tools/audio sfx party_popper (cue at roarAt + KAIJU_BLAST.popDelay).
//
// Animation (pure function of env.kaiju + time; deterministic):
//   rise 0..1 → it heaves up from behind the skyline (depth-tested: the towers occlude it), neck uncurling last;
//   eyes 0..1 → eyes light; the crystals glow up with them;
//   roar 0..1 → neck rears up and back, beak opens, the crystals charge base→tip and cycle faster;
//   blast: the confetti cannon pops at env.t = roarAt + KAIJU_BLAST.popDelay (0.1 s; = the moment the old beam fired) —
//     blastAge = t − popT; every piece / streamer / the flash is a closed-form function of blastAge + seed (no state is
//     carried across frames → segment renders resume exactly). Without env.roarAt (old callers) the age is derived from
//     roar (> .3) instead;
//   idle → slow breathing, small head sway.
//
// API (unchanged since the combined episodes)
//   createKaiju({scene, options?}) → {group, update(kaijuEnvOrNull, {camera, time}) → pose|null, parts, dispose()}
//     kaijuEnv (shots-variants.mjs 'kaiju-skyline' env.kaiju) = {t, rise 0..1, eyes 0..1, roar 0..1, shake, pos:[x,z],
//       scale (height of the beast in m: ground → head top, default 150), seed, ground? (y of the base, default 0),
//       yaw? (rad; default: 3/4 view — side-on to the camera, head turned a little toward it), fog?, colors?}
//     null → hidden.
//   kaijuPose(kaijuEnv, time) → pure pose (node-testable): {y, breathe, neckUp, lean, mouth 0..1, blast 0..1 (pop flash →
//     cloud alive), blastAge (s since the pop, <0 before), beam (= blast, legacy alias), charge 0..1, eyeGlow, crystalGlow,
//     partyPhase, sway, legLift, rise}
//   kaijuBlastState(kaijuEnv, time) → pure confetti state (beast-height units, offsets from the beak, group frame):
//     {age, flash 0..1, pieces:[{p:[x,y,z], v:[x,y,z], color:[r,g,b], ...}], streamers:[{points:[[x,y,z]…], color}]}
//   partyColor(phase) → [r,g,b] 0..1 (period 1; pink → orange → yellow → lime → magenta), PARTY_COLORS, KAIJU_BLAST.
//   KAIJU_PARTS part list (name → description), KAIJU_DEFAULTS.
import * as THREE from '../../vendor/three.module.min.js';
import {shared,common} from '../shaders.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export const KAIJU_DEFAULTS=Object.freeze({scale:150,fog:.12,yawOffset:Math.PI+.45,
 colors:{body:0x0d0e12,belly:0x1b1a22,horn:0x2a2630,beak:0x24212a,crystal:0xff2d8a,crystalCore:0xffd92e,eye:0xffa22a,flash:0xfff1c8,mouth:0x050307}});
// party-light palette (no blue/cyan/violet-blue: every hue outside 170°–260°, also between neighbours)
export const PARTY_COLORS=Object.freeze([0xff2d8a,0xff6a12,0xffd61f,0x6cff3a,0xff2fd6]);
const PARTY_RGB=PARTY_COLORS.map(c=>[(c>>16&255)/255,(c>>8&255)/255,(c&255)/255]);
export function partyColor(phase){const n=PARTY_RGB.length,x=((phase%1)+1)%1*n,i=Math.floor(x)%n,f=x-Math.floor(x),u=f*f*(3-2*f);
 const a=PARTY_RGB[i],b=PARTY_RGB[(i+1)%n];return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];}
// confetti cannon (beast-height units, seconds)
export const KAIJU_BLAST=Object.freeze({popDelay:.1,pieces:700,streamers:8,speed:[1.0,2.1],cone:.55,drag:3.4,gravity:.3,
 spin:[6,16],size:[.013,.022],aimElev:.92,life:4.5,flash:.16});
export const KAIJU_PARTS=Object.freeze({
 torso:'low humped torso, black (hunched, quadruped stance)',
 legs:'4 thick splayed legs, forelegs planted',
 neck:'long curved neck rising from the front of the hump',
 head:'small head with a hooked upper beak',
 mouth:'lower beak = jaw (opens on the roar)',
 horns:'2 swept-back horns + a thin bony crest',
 crystals:'dorsal crystal prisms (hexagonal, glowing in cycling party-light colours: pink/orange/yellow/lime/magenta), 2 staggered rows on the hump + up the neck',
 eyes:'2 small amber slit eyes',
 blast:'one-shot confetti / party-cannon pop from the open beak: flash, a cone of tumbling paper pieces + curly streamers, up into the empty sky (no beam)'});

// pure pose (units: beast height)
export function kaijuPose(k,time){if(!k)return null;const t=time??k.t??0,seed=k.seed??3,rise=clamp(k.rise??1),roar=clamp(k.roar??0),eyes=clamp(k.eyes??1);
 const r=rise*rise*(3-2*rise);
 const y=-1.1*(1-r)+.008*Math.sin(t*1.3+seed)*rise;// fully below the skyline at rise 0
 const breathe=1+.018*Math.sin(t*1.7+seed);
 const uncurl=smooth(.55,1,rise);// the neck uncurls as it finishes rising
 const charge=smooth(0,.35,roar);// crystals charge, then the cannon pops
 const blastAge=blastAgeOf(k,time),blast=blastAge<0||rise<=0?0:blastAge<KAIJU_BLAST.life?1:0;
 return {y,breathe,neckUp:-.5*(1-uncurl)+.32*smooth(0,.4,roar),lean:-.06*smooth(0,.4,roar)+.015*Math.sin(t*.9+seed),
  mouth:smooth(.05,.35,roar),blast,blastAge,beam:blast,charge,eyeGlow:eyes*(1+.6*roar),crystalGlow:.25*eyes+.75*charge,
  partyPhase:t*(.45+.5*charge)+seed*.13,sway:.05*Math.sin(t*.7+seed*2)*rise,legLift:.04*smooth(0,.3,roar),rise};}

// seconds since the pop (<0 before): env.t − (roarAt + popDelay); legacy envs without roarAt → from the roar value
function blastAgeOf(k,time){const t=k.t??time??0;
 if(k.blastAt!=null)return t-k.blastAt;
 if(k.roarAt!=null)return t-(k.roarAt+KAIJU_BLAST.popDelay);
 const roar=clamp(k.roar??0);return roar>.3?(roar-.3)*1.2:-1;}

function rng(seed){let a=(seed*2654435761)>>>0||1;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
// per-seed launch parameters (cached; pure)
const blastCache=new Map();
function blastParams(seed){if(blastCache.has(seed))return blastCache.get(seed);const B=KAIJU_BLAST,R=rng(seed*7919+17);
 const ax=[Math.cos(B.aimElev),Math.sin(B.aimElev),0];// aim: steeply up and a little forward (beast +x), never down at the city
 // basis around the aim
 const e1=[-ax[1],ax[0],0],e2=[0,0,1];
 const dirIn=(ang,rad)=>{const s=Math.sin(rad),c=Math.cos(rad);const d=[ax[0]*c+(e1[0]*Math.cos(ang)+e2[0]*Math.sin(ang))*s,ax[1]*c+(e1[1]*Math.cos(ang)+e2[1]*Math.sin(ang))*s,ax[2]*c+(e1[2]*Math.cos(ang)+e2[2]*Math.sin(ang))*s];return d;};
 const pieces=[];for(let i=0;i<B.pieces;i++){const rad=B.cone*Math.sqrt(R()),ang=R()*Math.PI*2,d=dirIn(ang,rad);
  const sp=B.speed[0]+(B.speed[1]-B.speed[0])*Math.pow(R(),.7)*(1-.35*rad/B.cone);
  const axis=[R()-.5,R()-.5,R()-.5];const al=Math.hypot(...axis)||1;
  pieces.push({v0:d.map(x=>x*sp),delay:R()*.05,drag:B.drag*(.75+.5*R()),fall:B.gravity*(.7+.6*R()),axis:axis.map(x=>x/al),
   spin:B.spin[0]+(B.spin[1]-B.spin[0])*R(),rot0:R()*6.283,size:B.size[0]+(B.size[1]-B.size[0])*R(),aspect:.45+.35*R(),
   color:partyColor(Math.floor(R()*5)/5+.04*(R()-.5)),flutter:[R()*6.283,1.5+2*R(),.012+.02*R()]});}
 const streamers=[];for(let j=0;j<B.streamers;j++){const rad=B.cone*(.25+.75*R()),ang=(j/B.streamers+.1*R())*Math.PI*2,d=dirIn(ang,rad);
  const sp=(B.speed[0]+B.speed[1])*.5*(.85+.3*R());
  streamers.push({v0:d.map(x=>x*sp),drag:B.drag*.65,fall:B.gravity*2.2,curl:[.035+.025*R(),9+5*R(),R()*6.283],color:partyColor(j/B.streamers+.07),width:.009,len:.9+.3*R()});}
 const P={pieces,streamers,ax};blastCache.set(seed,P);return P;}

// closed-form drag + fall: x(a) = v0 (1−e^{−ka})/k ; y adds −g (a − (1−e^{−ka})/k)/k (terminal fall speed g/k, paper-slow)
function traj(v0,k,g,a){const e=Math.exp(-k*a),m=(1-e)/k,f=g*(a-m)/k;return {p:[v0[0]*m,v0[1]*m-f,v0[2]*m],v:[v0[0]*e,v0[1]*e-g*(1-e)/k,v0[2]*e]};}

export function kaijuBlastState(k,time){if(!k)return null;const B=KAIJU_BLAST,age=blastAgeOf(k,time),rise=clamp(k.rise??1);
 if(age<0||rise<=0||age>=B.life)return {age,flash:0,pieces:[],streamers:[]};
 const P=blastParams(k.seed??3),fade=1-smooth(B.life-.8,B.life,age);
 const pieces=P.pieces.map(q=>{const a=Math.max(0,age-q.delay);const {p,v}=traj(q.v0,q.drag,q.fall,a);
  const fl=q.flutter,w=smooth(.2,.9,a)*fl[2];p[0]+=w*Math.sin(a*fl[1]+fl[0]);p[2]+=w*Math.cos(a*fl[1]*.8+fl[0]);
  return {p,v,axis:q.axis,angle:q.rot0+q.spin*a*(.35+.65*Math.exp(-a*1.5)),size:q.size*fade*smooth(0,.04,a+.01),aspect:q.aspect,color:q.color};});
 const streamers=P.streamers.map(s=>{const N=24,pts=[];const lag=s.len/N*.3;
  for(let i=0;i<=N;i++){const a=Math.max(0,age-i*lag);const {p,v}=traj(s.v0,s.drag,s.fall,a);
   const sv=Math.hypot(...v)||1,r=s.curl[0]*smooth(0,.3,age-a+.02)*(1+i/N);// curl grows along the ribbon (unspooled first)
   const ph=s.curl[2]+a*s.curl[1]+i*.9;// helix around the path (perp to the aim, in the group frame)
   const n1=[-v[1]/sv,v[0]/sv,0];pts.push([p[0]+n1[0]*r*Math.cos(ph),p[1]+n1[1]*r*Math.cos(ph),p[2]+r*Math.sin(ph)]);}
  return {points:pts,color:s.color,width:s.width*fade};});
 return {age,flash:age<B.flash*3?Math.exp(-age/B.flash)*(age<.02?age/.02:1):0,pieces,streamers};}

const VERT=/* glsl */`varying vec3 vN,vW,vL;varying vec2 vUv;
void main(){vUv=uv;vL=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG=/* glsl */`${common}
uniform vec3 uColor,uColor2,uRimA,uRimB;uniform float uMode,uEmis,uFog,uRimK,uGlow,uAlpha;varying vec3 vN,vW,vL;varying vec2 vUv;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}
void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vW);vec3 base=uColor;
 if(uMode>.5&&uMode<1.5){// hide: hard, pebbly black (cell noise darkening) + a slightly lighter underside
  vec3 q=floor(vL*38.);base*=.75+.5*h3(q);base=mix(base,uColor2,smoothstep(.1,-.4,n.y));}
 if(uMode>1.5&&uMode<2.5){// crystal: core colour toward the tip, faceted flicker, glow
  float tip=clamp(vUv.y,0.,1.);vec3 c=mix(uColor,uColor2,tip);float facet=.65+.35*abs(dot(n,normalize(vec3(.3,.8,.5))));
  vec3 col=c*(.3+facet*.45)+c*uGlow*(.35+.5*tip);float fr=pow(1.-clamp(dot(n,v),0.,1.),2.);col+=uColor2*fr*(.25+.5*uGlow);
  vec3 fc=applyFog(col,vW,cameraPosition);gl_FragColor=vec4(mix(col,fc,uFog*.5),1.);return;}
 // toon-ish night light: dark sky ambient, warm city uplight from below, moon key, strong warm party-light rim (uRimA/B)
 vec3 col=base*(vec3(.10,.10,.14)+vec3(.55,.34,.22)*clamp(-n.y*.6+.25,0.,1.));
 col+=base*vec3(.6,.55,.6)*smoothstep(.1,.4,dot(n,normalize(vec3(-.5,.7,.3))));
 float fr=pow(1.-clamp(dot(n,v),0.,1.),3.2);col+=mix(uRimA,uRimB,clamp(n.y*.5+.5,0.,1.))*fr*uRimK*(.4+.3*uGlow);
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
 const mk=(color,{mode=0,color2=0x000000,emis=0,rim=1}={})=>{const m=new THREE.ShaderMaterial({uniforms:{...shared,uColor:{value:new THREE.Color(color)},uColor2:{value:new THREE.Color(color2)},
  uMode:{value:mode},uEmis:{value:emis},uFog:{value:.3},uRimK:{value:rim},uGlow:{value:0},uAlpha:{value:.9},uRimA:{value:new THREE.Color(1,.3,.55)},uRimB:{value:new THREE.Color(1,.62,.2)}},vertexShader:VERT,fragmentShader:FRAG});m.userData.rim=rim;mats.push(m);return m;};
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

 const prism=(()=>{const a=new THREE.CylinderGeometry(.5,.55,.55,6,1);a.translate(0,.275,0);const b=new THREE.ConeGeometry(.5,.45,6,1);b.translate(0,.55+.225,0);
  const g=mergeSimple([a,b]);// uv.y = height fraction (tip glow)
  const P=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<P.count;i++)uv.setY(i,clamp(P.getY(i)/1));return g;})();
 const crystals=[];
 const addCrystal=(parent,pos,h,tiltZ,tiltX,order)=>{const m=new THREE.Mesh(prism,mk(C.crystal,{mode:2,color2:C.crystalCore,rim:0}));m.position.set(...pos);m.scale.set(h*.32,h,h*.32);m.rotation.set(tiltX,0,tiltZ);m.userData.order=order;parent.add(m);crystals.push(m);};
 // hump rows (staggered left/right), tallest over the shoulders, raked back
 const HUMP=[[-.3,.06],[-.2,.1],[-.1,.14],[0,.18],[.1,.2],[.18,.17],[.26,.12]];
 HUMP.forEach(([x,h],i)=>{const yTop=.38+.28*(1+.35*Math.exp(-((x/.86-.12)**2)/.05))*.98;
  addCrystal(pivot,[x,yTop-.02,(i%2?.045:-.045)],h,.45,(i%2?.18:-.18),i/(HUMP.length+5));
  if(i%2===0)addCrystal(pivot,[x+.04,yTop-.04,(i%2?-.08:.08)],h*.6,.5,(i%2?-.3:.3),i/(HUMP.length+5)+.02);});
 // neck row (smaller, following the curve)
 [.2,.42,.62,.8].forEach((u,j)=>{const p=neckCurve.getPointAt(u),tan=neckCurve.getTangentAt(u);const rad=.13-.075*u;
  const ang=Math.atan2(tan.y,tan.x);addCrystal(neckBase,[p.x-Math.sin(ang)*-rad*.0-rad*.7*Math.sin(ang),p.y+rad*.7*Math.cos(ang),0],.09-.05*u,ang+.4,0,(HUMP.length+j)/(HUMP.length+5));});
 // confetti cannon: lives in the group frame (not the head) so the cloud stays in the sky once fired; origin = the beak
 // tip in the reared roar pose (computed once from the rig), aim = KAIJU_BLAST.aimElev (steeply up, a little forward)
 const blast=new THREE.Group();blast.name='kaiju-confetti-blast';blast.visible=false;group.add(blast);
 {const keep=[pivot.rotation.z,neckBase.rotation.z,head.rotation.z];pivot.rotation.z=-.06;neckBase.rotation.z=.32;head.rotation.z=-.32*.55+.35;
  group.updateMatrixWorld(true);const tip=new THREE.Vector3(.17,-.02,0);head.localToWorld(tip);group.worldToLocal(tip);blast.position.copy(tip);
  [pivot.rotation.z,neckBase.rotation.z,head.rotation.z]=keep;}
 const NP=KAIJU_BLAST.pieces;
 const paperGeo=new THREE.PlaneGeometry(1,1);
 const paperMat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
 const confetti=new THREE.InstancedMesh(paperGeo,paperMat,NP);confetti.name='confetti';confetti.frustumCulled=false;
 confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);{const c=new THREE.Color(),z=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<NP;i++){confetti.setMatrixAt(i,z);confetti.setColorAt(i,c.setRGB(1,1,1));}}
 blast.add(confetti);
 // streamers: all ribbons in one dynamic strip geometry (vertex colours)
 const NS=KAIJU_BLAST.streamers,SEG=24,sv=(SEG+1)*2;
 const stGeo=new THREE.BufferGeometry();const stPos=new Float32Array(NS*sv*3),stCol=new Float32Array(NS*sv*3),stIdx=[];
 for(let j=0;j<NS;j++)for(let i=0;i<SEG;i++){const a=j*sv+i*2;stIdx.push(a,a+1,a+2,a+1,a+3,a+2);}
 stGeo.setIndex(stIdx);stGeo.setAttribute('position',new THREE.BufferAttribute(stPos,3).setUsage(THREE.DynamicDrawUsage));stGeo.setAttribute('color',new THREE.BufferAttribute(stCol,3));
 const streamers=new THREE.Mesh(stGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));streamers.name='streamers';streamers.frustumCulled=false;blast.add(streamers);
 // pop flash: camera-facing starburst quad (additive), a few frames long
 const flashMat=new THREE.ShaderMaterial({uniforms:{uK:{value:0},uC:{value:new THREE.Color(C.flash)}},transparent:true,depthWrite:false,
  // pure additive rgb, destination alpha untouched (a plain AdditiveBlending quad showed as a dark box in the post pass)
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
  vertexShader:/* glsl */`varying vec2 vP;void main(){vP=position.xy*2.;float s=length(modelMatrix[0].xyz);vec4 c=viewMatrix*vec4(modelMatrix[3].xyz,1.);
   gl_Position=projectionMatrix*(c+vec4(position.xy*s,0.,0.));}`,
  fragmentShader:/* glsl */`uniform float uK;uniform vec3 uC;varying vec2 vP;void main(){float r=length(vP),a=atan(vP.y,vP.x);
   float core=exp(-r*r*18.),halo=exp(-r*5.)*.5,rays=pow(abs(cos(a*4.)),24.)*exp(-r*2.6)*.9+pow(abs(cos(a*4.+.785)),30.)*exp(-r*4.)*.5;
   float m=1.-smoothstep(.55,1.,r);if(m<=0.)discard;vec3 col=(uC*(core*2.+halo)+vec3(1.,.55,.75)*rays)*m*uK;gl_FragColor=vec4(col,0.);}`});
 const flash=new THREE.Mesh(new THREE.PlaneGeometry(1,1),flashMat);flash.name='pop-flash';flash.frustumCulled=false;flash.visible=false;flash.scale.setScalar(1e-3);blast.add(flash);
 const dummy=new THREE.Object3D(),qa=new THREE.Vector3(),tmpC=new THREE.Color();
 function updateBlast(k,t){const B=kaijuBlastState(k,t);blast.visible=B.pieces.length>0;if(!blast.visible)return B;
  B.pieces.forEach((q,i)=>{dummy.position.set(...q.p);qa.set(...q.axis);dummy.quaternion.setFromAxisAngle(qa,q.angle);dummy.scale.set(q.size,q.size*q.aspect,1);
   dummy.updateMatrix();confetti.setMatrixAt(i,dummy.matrix);confetti.setColorAt(i,tmpC.setRGB(...q.color));});
  confetti.instanceMatrix.needsUpdate=true;confetti.instanceColor.needsUpdate=true;
  B.streamers.forEach((s,j)=>{const pts=s.points;for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
    // ribbon width across the path, in the camera-agnostic plane spanned by the path tangent and the group z axis
    let dx=b[0]-a[0],dy=b[1]-a[1];const dl=Math.hypot(dx,dy)||1;dx/=dl;dy/=dl;const w=s.width*(1-.5*i/pts.length)*.5,tw=Math.cos(i*.7+t*3);
    const o=(j*sv+i*2)*3;const nx=-dy*w*tw,ny=dx*w*tw,nz=w*Math.sqrt(1-tw*tw);
    stPos.set([pts[i][0]+nx,pts[i][1]+ny,pts[i][2]+nz,pts[i][0]-nx,pts[i][1]-ny,pts[i][2]-nz],o);
    const sh=.75+.25*Math.abs(tw);stCol.set([s.color[0]*sh,s.color[1]*sh,s.color[2]*sh,s.color[0]*sh,s.color[1]*sh,s.color[2]*sh],o);}});
  stGeo.attributes.position.needsUpdate=true;stGeo.attributes.color.needsUpdate=true;
  flash.visible=B.flash>.01;flashMat.uniforms.uK.value=B.flash;flash.scale.setScalar(.16+.22*(1-Math.exp(-B.age/.06)));
  return B;}
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
  // glow: eyes; crystals charge from the hump base toward the neck (order 0..1) and cycle party colours, each crystal
  // offset in the cycle (the colour ripples along the spine; faster while charging), full glow once the cannon pops
  eyeMat.uniforms.uEmis.value=.2+2.4*P.eyeGlow;
  const cg=P.crystalGlow,popped=P.blastAge>=0?1:0;
  crystals.forEach(c=>{const g=clamp(cg*1.4-c.userData.order*.6*(1-popped)),m=c.material,ph=P.partyPhase-c.userData.order*1.6;
   c.userData.g=g;m.uniforms.uGlow.value=Math.max(.15*cg,g);m.uniforms.uColor.value.setRGB(...partyColor(ph));
   const tip=partyColor(ph+.1);m.uniforms.uColor2.value.setRGB(.9*tip[0]+.1,.9*tip[1]+.1,.9*tip[2]+.05);});
  crystals.forEach(c=>{const s=1+.06*c.userData.g*Math.sin(t*14+c.userData.order*9);c.scale.x=c.scale.z=c.userData.base??(c.userData.base=c.scale.x);c.scale.x*=s;c.scale.z*=s;});
  const rA=partyColor(P.partyPhase*.5),rB=partyColor(P.partyPhase*.5+.35);
  const fog=k.fog??KAIJU_DEFAULTS.fog;for(const m of mats){m.uniforms.uFog.value=fog;m.uniforms.uRimA.value.setRGB(...rA);m.uniforms.uRimB.value.setRGB(...rB);if(m.uniforms.uMode.value<1.5||m.uniforms.uMode.value>2.5)m.uniforms.uGlow.value=cg;}
  updateBlast(k,time);
  group.updateMatrixWorld(true);
  return P;}
 return {group,update,parts:{torso,legs,neck,head,jaw,mouth:jaw,horns,crest,eyes,crystals,blast,confetti,streamers,flash},dispose(){scene?.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const m of mats)m.dispose();}};}

// merge non-indexed copies of BufferGeometries (position/normal/uv) — avoids the BufferGeometryUtils addon
function mergeSimple(geos){const parts=geos.map(g=>g.index?g.toNonIndexed():g);let n=0;for(const g of parts)n+=g.attributes.position.count;
 const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2);let o=0;
 for(const g of parts){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);uv.set(g.attributes.uv.array,o*2);o+=g.attributes.position.count;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;}
