// Near-camera people for the series (JR編 pilot + variants): a procedural, articulated, mid-poly human drawn
// with GPU instancing (one draw per LOD) and animated in the vertex shader by forward kinematics.
// Replaces the low-poly costume.mjs figure within ~18 m of the camera (the far crowd keeps costume.mjs).
//
// Why procedural (no glTF): the repo vendors only three.module.min.js (no GLTFLoader / SkeletonUtils) and a skinned
// mesh per person does not instance; under SwiftShader hundreds of SkinnedMesh draws are far too slow. This model is
// built from lathe/cylinder/sphere primitives in a REST POSE WITH ARMS DOWN (never T/A-pose), 15 rigid bones
// (torso with a smooth twist weight, head, thigh/shin/foot ×2, upper arm/forearm ×2, phone, skirt/coat, backpack),
// and is posed per vertex from a few per-instance numbers. No external assets → nothing to license.
//
// Determinism: the pose is a pure function of (animTime, per-instance phase/seed/speed/mode). Pass the solver
// time (or video time) as animTime; the walk phase is animTime × cadence(person) + offset(person) (no integration,
// so a resumed render segment gives the same pose for the same frame).
//
// Clothes: everyday clothes only (ordinary-people rule): top/bottom/skin/hair colours are the SAME formula as
// costume.mjs ordinary mode for the same style id (so a person swapped in at the LOD radius keeps their colours),
// plus near-only detail: hair styles (short / long / bob / cap / beanie), skirt or trousers, long coat, hoodie hood,
// open jacket over a shirt, backpack / shoulder bag / handbag, face mask, scarf, phone (lit screen); small cat ears
// or a small hat for ORDINARY_EARS / ORDINARY_HAT (costume.mjs types 21/22). Body height, girth, shoulder/hip width vary.
//
// Animation modes (ANIM): walk (speed-scaled gait: hip/knee/ankle, arm swing with elbow, pelvis bob/twist),
// idle (weight shift, relaxed knee, breathing, look-around), queue (idle + periodic shuffle steps, looking ahead),
// phone (phone held at chest, head down; while walking too). 'auto' (default) picks walk when speed > .3 m/s,
// else phone for phone carriers, else idle.
//
// API
//   new NearPeople(scene, {capacity=700, lod0=120, lod0Dist=9, shared, key=.55, fill=0, rim=1, exposure=1})
//     .set(people, {animTime, camera?, cull=true}) → {drawn, lod0, lod1}
//         people: [{x, z, y=0, heading (rad, atan2(dx,dz) as costume.mjs), speed (m/s), id (style id),
//                   type? (costume type; default from costumeOf(id,{ordinary:true})), flags? (1 = phone),
//                   anim? 'auto'|'walk'|'idle'|'queue'|'phone', look?: heading the head turns toward (rad)}]
//         nearest lod0 (and within lod0Dist) get the detailed mesh, the rest the light mesh (capacity total).
//     .uniforms {uAnim, uKey, uFill, uRim, uExposure, uNearDim}   .visible   .group   .triangles(lod)
//   swapNearFromCrowd(crowd, {camera, radius=18, minDist=0, styleOf?, anim?, out=[]}) → people[]
//     takes every agent of a costume.mjs CostumeCrowd (after crowd.update / place, BEFORE any CPU culling that
//     compacts crowd.data) within radius of the camera out of the crowd (hidden there, accessory layers re-gathered)
//     and returns them as NearPeople input (id = agent index = costume.mjs colour id). Agents closer than minDist
//     are dropped from both (camera inside a person).
//   splitNear(list, camera, radius) → {near, far}  for list-placed crowds ({x,z,y?,angle|heading,id}).
//   NearCrowdLayer(scene, {radius=18, minDist=1.1}) — page helper (used by app-jr.mjs): begin(); takeCrowd(crowd, camera);
//     far = takeList(list, camera, {idBase}); end({animTime, camera, fill}). Between applyShot and CPU culling.
//   Cost (SwiftShader 720x1280, measured): ≈ +0.3–0.6 s/frame for 50–60 near people at eye level; LOD0 3.5k tris, LOD1 1.0k.
//   outfitOf(id, type?, flags?) → the per-person style (deterministic; JS port of costume.mjs's palette hashes)
//   ANIM = {walk:0, idle:1, queue:2, phone:3}
import * as THREE from '../../vendor/three.module.min.js';
import {shared as SHARED,common} from '../shaders.mjs';
import {costumeOf,ORDINARY,ORDINARY_EARS,ORDINARY_HAT,POLICE,STAFF} from '../costume.mjs';
import * as V9 from './costumes-v9.mjs';

export const ANIM=Object.freeze({walk:0,idle:1,queue:2,phone:3});
// bones
const B={TORSO:0,HEAD:1,THL:2,SHL:3,FTL:4,THR:5,SHR:6,FTR:7,UAL:8,FAL:9,UAR:10,FAR:11,PHONE:12,SKIRT:13,BACK:14};
// materials
const M={SKIN:0,HAIR:1,TOP:2,BOTTOM:3,SHOE:4,BAG:5,SCREEN:6,ACC:7,PHONE:9,SOLE:10,EYE:11,SCARF:12,HEAD:13};
// optional pieces (bit k-1 of the instance mask)
export const PIECES=Object.freeze({hairShort:1,hairLong:2,hairBob:3,cap:4,beanie:5,skirt:6,coat:7,hood:8,backpack:9,shoulderBag:10,phone:11,catEars:12,smallHat:13,handbag:14,scarf:15,trousers:16,hairBun:17});

// ─── palette (JS port of costume.mjs GLSL, float32 like the GPU) ─────────────
const f32=Math.fround;const fract=x=>f32(x-Math.floor(x));
export function hash11(p){p=fract(f32(p)*f32(.1031));p=f32(p*f32(p+f32(33.33)));p=f32(p*f32(p+p));return fract(p);}
const pick4=(r,a,b,c,d)=>r<.25?a:r<.5?b:r<.75?c:d;
const mix3=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hashU=i=>{let t=(i+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
// Same top/bottom/skin/hair as costume.mjs ordinary mode for colour id `id` (aStyle.w) + near-only details.
// v9 Halloween costumes (setNearCostumes('v9')): every near person wears the costume class of their id (or of the palette slot
// carried in flags by a swapped-in costume.mjs v9 agent): costume colours (zombie grey-green / skeleton / pumpkin / mascot
// skin colour = the head), hats, ears, capes (long coat), skirts; no face mask needed (heads are costume heads / makeup).
let NEAR_COSTUMES=null;
export function setNearCostumes(mode){NEAR_COSTUMES=mode||null;}
function v9Outfit(o,id,flags){const slot=flags!=null&&flags>=4?V9.v9SlotFromFlags(flags):-1;const S=slot>=0?V9.V9_SLOTS[slot]:null;
 const k=S?S.cls:V9.classOf(id),C=V9.V9_COSTUMES.classes[k],pal=S?S.colors:C.palettes[V9.paletteOf(id)],L=pal.map(V9.lin),F=C.features,P=PIECES;
 let mask=o.pieces&~((1<<(P.cap-1))|(1<<(P.beanie-1))|(1<<(P.catEars-1))|(1<<(P.smallHat-1))|(1<<(P.skirt-1))|(1<<(P.trousers-1))|(1<<(P.coat-1))|(1<<(P.hood-1))|(1<<(P.scarf-1)));
 const on=q=>{mask|=1<<(q-1);};
 if(F.includes('witch-hat')||F.includes('nurse-cap'))on(P.smallHat);if(F.includes('round-ears')||F.includes('horns'))on(P.catEars);
 if(F.includes('cape')||F.includes('wings')||F.includes('sheet'))on(P.coat);if(F.includes('skirt'))on(P.skirt);else on(P.trousers);
 if(F.includes('mascot')||F.includes('sheet')||F.includes('pumpkin')||F.includes('dino')||F.includes('box-head'))on(P.hood);
 return {...o,costume:C.key,pieces:mask,skin:L[3],hair:L[2],top:L[0],bottom:L[1],acc:L[2],inner:L[2],scarf:L[2],legwear:L[1],jacket:false,faceMask:false};}
export function outfitOf(id,type=null,flags=null){const o=outfitBase(id,type,flags==null?null:flags&3);return NEAR_COSTUMES==='v9'||(flags!=null&&flags>=4)?v9Outfit(o,id,flags):o;}
function outfitBase(id,type=null,flags=null){
 let st=null;if(type==null||flags==null){st=costumeOf(id,{ordinary:true});type??=st[0];flags??=st[2];}
 const seed=st?st[1]:costumeOf(id,{ordinary:true})[1];
 const h1=hash11(f32(id*f32(.731))+f32(1.3)),h4=hash11(f32(id*f32(5.77))+f32(.3)),h3=hash11(f32(id*f32(3.31))+f32(2.9));
 const skin=mix3([.32,.22,.16],[.5,.37,.28],h1),hair=h4>=.85?[.2,.13,.08]:[.02,.015,.01];
 let top=h3<.55?pick4(h4,[.035,.035,.04],[.06,.065,.09],[.12,.11,.1],[.025,.03,.05]):h3<.82?pick4(h4,[.42,.44,.48],[.75,.74,.72],[.2,.22,.18],[.45,.47,.5]):pick4(h4,[.6,.08,.1],[.1,.22,.5],[.62,.45,.12],[.15,.4,.32]);
 let bottom=pick4(fract(f32(h4*7.3)),[.03,.03,.03],[.06,.07,.11],[.2,.19,.18],[.1,.14,.24]);
 let acc=type===ORDINARY_EARS?pick4(fract(seed*5),[.02,.018,.025],[.12,.07,.04],[.7,.68,.66],[.35,.2,.25]):pick4(fract(seed*5),[.02,.018,.025],[.15,.1,.06],[.2,.2,.24],[.3,.08,.1]);
 if(type===POLICE){top=[.03,.05,.13];bottom=[.025,.035,.08];acc=[.03,.05,.13];}
 else if(type===STAFF){top=[.25,.8,.15];bottom=[.05,.05,.05];}
 const u=k=>hashU(id*17+k);// near-only details (independent of the far palette)
 const fem=u(1)<.5,P=PIECES;let mask=0;const on=k=>{mask|=1<<(k-1);};
 // hair
 const hr=u(2);if(fem){if(hr<.5)on(P.hairLong);else if(hr<.78)on(P.hairBob);else if(hr<.9)on(P.hairBun);else on(P.hairShort);}
 else{on(P.hairShort);}
 const headwear=u(3);if(type===ORDINARY_EARS)on(P.catEars);else if(type===ORDINARY_HAT)on(P.smallHat);else if(type===POLICE)on(P.cap);
 else if(headwear<.09)on(P.cap);else if(headwear<.15)on(P.beanie);
 if(mask&(1<<(P.cap-1))||mask&(1<<(P.beanie-1)))mask&=~((1<<(P.hairLong-1))|(1<<(P.hairBob-1))|(1<<(P.hairBun-1))),on(P.hairShort);
 // clothes
 const skirt=fem&&u(4)<.34&&type!==POLICE;if(skirt)on(P.skirt);else on(P.trousers);
 const coat=u(5)<.2,hood=!coat&&u(6)<.2;if(coat)on(P.coat);if(hood)on(P.hood);
 const jacket=!hood&&u(7)<.4;// open jacket over a lighter shirt
 const bag=u(8);if(bag<.22)on(P.backpack);else if(bag<.46)on(P.shoulderBag);else if(fem&&bag<.58)on(P.handbag);
 if(u(9)<.05)on(P.scarf);
 const phone=(flags&1)===1;if(phone)on(P.phone);
 const faceMask=u(10)<.16;
 const inner=pick4(u(11),[.7,.7,.68],[.05,.05,.06],[.55,.5,.42],[.36,.4,.5]),shoe=pick4(u(12),[.03,.03,.03],[.6,.6,.58],[.12,.08,.05],[.08,.08,.1]);
 const bagC=pick4(u(13),[.03,.03,.035],[.16,.1,.06],[.3,.3,.32],[.12,.14,.2]),scarf=pick4(u(14),[.35,.06,.08],[.5,.45,.36],[.06,.08,.18],[.2,.2,.2]);
 const legwear=u(15)<.6?[.025,.022,.025]:mix3(skin,[.06,.05,.05],.4);
 if(skirt&&u(16)<.5)bottom=pick4(u(17),[.03,.03,.035],[.4,.36,.3],[.15,.1,.12],[.2,.22,.3]);
 const height=fem?.93+.06*u(18):.98+.07*u(18),girth=.9+.2*u(19),shoulder=fem?.9+.06*u(20):1.02+.08*u(20),hip=fem?1.04+.06*u(21):.95+.05*u(21);
 const hairStyle=mask&(1<<(P.hairLong-1))?1:mask&(1<<(P.hairBob-1))?2:mask&(1<<(P.hairBun-1))?3:0;
 return {id,type,flags,fem,pieces:mask,hairStyle,skin,hair,top,bottom,acc,inner,shoe,bag:bagC,scarf,legwear,jacket,faceMask,phone,height,girth,shoulder,hip,cadence:.86+.14*u(22),seed:u(23)};}

// head: sphere → egg with a narrower jaw, chin forward, flatter back of the face
function headShape(g){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){let x=p.getX(i)/.1,y=p.getY(i)/.1,z=p.getZ(i)/.1;
  x*=.86;y*=1.1;z*=.97;if(y<0){const k=-y;x*=1-.3*k*k;z=z*(1-.12*k)+.12*k*Math.max(0,z);y*=1.08;}if(y>.2)x*=1-.05*(y-.2);
  p.setXYZ(i,x*.1,y*.1,z*.1);}g.computeVertexNormals();return g;}
// ─── geometry (rest pose: standing, arms down, feet at y = 0, facing +z; character's left = +x) ─────────────
function geometry(lod){const q=lod===0;const S=q?9:5,HS=q?12:7,HR=q?9:5;
 const P=[],N=[],BN=[],MT=[],PC=[],IX=[];
 const add=(g,bone,mat,piece=0)=>{if(!g.index)g=g.toNonIndexed();const base=P.length/3,p=g.getAttribute('position').array,n=g.getAttribute('normal').array;
  for(let i=0;i<p.length;i++){P.push(p[i]);N.push(n[i]);}for(let i=0;i<p.length/3;i++){BN.push(bone);MT.push(mat);PC.push(piece);}
  if(g.index)for(const k of g.index.array)IX.push(base+k);else for(let k=0;k<p.length/3;k++)IX.push(base+k);};
 const cyl=(r0,r1,y0,y1,seg=S,hs=1,open=false)=>new THREE.CylinderGeometry(r1,r0,y1-y0,seg,q?hs:1,open||!q).translate(0,(y0+y1)/2,0);
 const sph=(r,ws=S,hs=Math.max(4,S*2/3|0),ts=0,tl=Math.PI)=>new THREE.SphereGeometry(r,q?ws:Math.min(ws,6),q?hs:Math.min(hs,4),0,Math.PI*2,ts,tl);
 const lathe=(pts,seg=S)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg);
 // torso (hips → waist → chest → shoulders), elliptical section
 add(lathe([[0,.855],[.1,.86],[.15,.89],[.163,.92],[.171,.955],[.168,.975],[.152,1.04],[.146,1.1],[.158,1.2],[.172,1.3],[.18,1.37],[.185,1.41],[.17,1.445],[.1,1.475],[0,1.485]],q?12:8).scale(1,1,.6),B.TORSO,M.TOP);
 // neck, head, ears, nose
 add(cyl(.05,.045,1.44,1.535,S),B.HEAD,M.SKIN);
 add(headShape(sph(.1,HS,HR)).translate(0,1.605,.008),B.HEAD,M.HEAD);
 if(q){add(new THREE.ConeGeometry(.014,.034,5).rotateX(Math.PI/2+.25).translate(0,1.595,.104),B.HEAD,M.SKIN);
  for(const s of [-1,1])add(sph(.022,6,4).scale(.45,1,.75).translate(s*.087,1.6,-.002),B.HEAD,M.SKIN);}
 // hair styles
 // hair: painted on the head and pushed out in the vertex shader (style → hairline / volume); extra volumes here
 add(sph(.1,S,HR).scale(.9,1.45,.36).translate(0,1.5,-.068),B.HEAD,M.HAIR,PIECES.hairLong);// back fall to the shoulder blades
 if(q)add(sph(.045,S,6).translate(0,1.69,-.075),B.HEAD,M.HAIR,PIECES.hairBun);
 // cap (dome + brim), beanie, small hat, cat ears
 add(sph(.111,HS,HR,0,Math.PI*.5).scale(.9,.95,1).translate(0,1.63,-.004),B.HEAD,M.ACC,PIECES.cap);
 add(new THREE.CylinderGeometry(.085,.085,.008,S,1,false,-Math.PI/2.4,Math.PI/1.2).scale(1,1,1.1).translate(0,1.642,.06),B.HEAD,M.ACC,PIECES.cap);
 add(sph(.113,HS,HR,0,Math.PI*.55).scale(.9,1.12,1).translate(0,1.62,-.008),B.HEAD,M.ACC,PIECES.beanie);
 if(q)add(cyl(.1,.1,1.615,1.645,S).scale(.9,1,1.02).translate(0,0,-.006),B.HEAD,M.ACC,PIECES.beanie);
 add(cyl(.045,.045,1.712,1.718,S).rotateZ(-.25).translate(.04,0,0),B.HEAD,M.ACC,PIECES.smallHat);add(cyl(.028,.025,1.716,1.762,S).rotateZ(-.25).translate(.04,0,0),B.HEAD,M.ACC,PIECES.smallHat);
 for(const s of [-1,1])add(new THREE.ConeGeometry(.03,.075,4).rotateZ(-s*.3).translate(s*.058,1.72,.0),B.HEAD,M.ACC,PIECES.catEars);
 // legs: thigh, knee, shin, foot (trousers by default; legwear under a skirt is coloured in the shader)
 for(const s of [1,-1]){const x=s*.093,T=s>0?B.THL:B.THR,SH=s>0?B.SHL:B.SHR,F=s>0?B.FTL:B.FTR;
  add(cyl(.072,.088,.49,.9,S,2).translate(x,0,0),T,M.BOTTOM);
  add(sph(.064,S,6).translate(x,.49,.004),SH,M.BOTTOM);
  add(cyl(.045,.064,.1,.49,S,2).translate(x,0,0),SH,M.BOTTOM);
  if(q)add(sph(.05,S,6).scale(1,.9,1).translate(x,.098,0),SH,M.BOTTOM);
  // shoe: rounded box (toe forward), sole
  add(sph(.06,S,6).scale(.85,.6,2.05).translate(x,.055,.05),F,M.SHOE);
  add(new THREE.BoxGeometry(.082,.016,.22).translate(x,.008,.05),F,M.SOLE);}
 // arms: shoulder ball, upper arm, elbow, forearm, hand (skin)
 for(const s of [1,-1]){const x=s*.19,U=s>0?B.UAL:B.UAR,F=s>0?B.FAL:B.FAR;
  add(sph(.05,S,6).scale(1,.8,.95).translate(x,1.41,0),U,M.TOP);// capsule end of the upper arm (deltoid)
  add(cyl(.043,.05,1.14,1.41,S,2).translate(x,0,0),U,M.TOP);
  add(sph(.042,S,6).translate(x,1.14,0),F,M.TOP);
  add(cyl(.033,.042,.885,1.14,S,2).translate(x,0,0),F,M.TOP);
  add(sph(.034,S,6).scale(.75,1.45,1.05).translate(x,.835,.006),F,M.SKIN);// hand
  if(q)add(sph(.014,5,4).scale(1,1.6,1).translate(x-s*.01,.85,.035),F,M.SKIN);}// thumb
 // skirt / long coat hem (follow the thighs in the shader)
 add(lathe([[.265,.55],[.27,.56],[.2,.88],[.16,1.0]],q?16:9).scale(1,1,.78),B.SKIRT,M.BOTTOM,PIECES.skirt);
 add(lathe([[.245,.49],[.25,.5],[.2,.9],[.165,1.06]],q?16:9).scale(1,1,.72),B.SKIRT,M.TOP,PIECES.coat);
 // hood (lump on the upper back), scarf
 add(sph(.12,S,6).scale(.85,.42,.5).translate(0,1.44,-.1),B.TORSO,M.TOP,PIECES.hood);
 if(q)add(new THREE.TorusGeometry(.068,.03,6,S).rotateX(Math.PI/2).scale(1,1,.85).translate(0,1.47,.0),B.HEAD,M.SCARF,PIECES.scarf);
 // backpack (body + straps), shoulder bag (strap + bag at the left hip), handbag (left hand), phone (right hand)
 add(new THREE.BoxGeometry(.28,.36,.12,2,2,1).translate(0,1.2,-.165),B.BACK,M.BAG,PIECES.backpack);
 if(q)add(sph(.14,S,6).scale(1,.4,.45).translate(0,1.37,-.17),B.BACK,M.BAG,PIECES.backpack);
 for(const s of [-1,1])add(new THREE.BoxGeometry(.035,.34,.012).rotateX(-.08).translate(s*.1,1.3,.112),B.TORSO,M.BAG,PIECES.backpack);
 add(new THREE.BoxGeometry(.024,.56,.006).rotateZ(.7).translate(.0,1.2,.109),B.TORSO,M.BAG,PIECES.shoulderBag);
 add(new THREE.BoxGeometry(.024,.56,.006).rotateZ(.7).translate(.0,1.2,-.109),B.TORSO,M.BAG,PIECES.shoulderBag);
 add(new THREE.BoxGeometry(.06,.2,.24).translate(.2,.92,-.02),B.TORSO,M.BAG,PIECES.shoulderBag);
 add(new THREE.BoxGeometry(.07,.16,.24).translate(.205,.73,.0),B.FAL,M.BAG,PIECES.handbag);
 if(q)add(new THREE.TorusGeometry(.06,.008,4,8,Math.PI).rotateY(Math.PI/2).translate(.205,.81,0),B.FAL,M.BAG,PIECES.handbag);
 add(new THREE.BoxGeometry(.068,.138,.011).translate(-.19,.81,.03),B.PHONE,M.PHONE,PIECES.phone);
 add(new THREE.PlaneGeometry(.06,.126).translate(-.19,.81,.0362),B.PHONE,M.SCREEN,PIECES.phone);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
 g.setAttribute('aBone',new THREE.Float32BufferAttribute(BN,1));g.setAttribute('aMat',new THREE.Float32BufferAttribute(MT,1));g.setAttribute('aPiece',new THREE.Float32BufferAttribute(PC,1));
 g.setIndex(P.length/3>65535?new THREE.Uint32BufferAttribute(IX,1):new THREE.Uint16BufferAttribute(IX,1));return g;}

const HAIRLINE=/* glsl */`
// hair threshold on the unit head direction d (style hs: 0 short, 1 long, 2 bob, 3 bun)
float hairTh(vec3 d,float hs){float back=hs<.5?-.62:hs<1.5?-1.2:hs<2.5?-.8:-.62,front=hs<.5?.5:hs<1.5?.34:hs<2.5?.16:.42,side=hs<.5?.1:hs<1.5?-.3:hs<2.5?-.5:.05;
 float th=d.z>0.?mix(side,front,smoothstep(.25,.85,d.z)):mix(side,back,smoothstep(.1,.8,-d.z));
 return th+.035*sin(atan(d.x,d.z)*7.+hs)+(d.z>.3?.06*d.x:0.);}// a slight side part
`;
const vertex=/* glsl */`${common}${HAIRLINE}
attribute float aBone,aMat,aPiece;
attribute vec4 iPos,iAnim,iBody,iTop,iBot,iHair,iSkin,iMisc;
uniform float uAnim,uNearDim;
varying vec3 vN,vW,vL,vAlb,vEmit,vHair,vBot;varying float vMat,vBone,vFlags,vSeed,vHairM,vShade;
mat3 rX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
void rot(inout vec3 p,inout vec3 n,vec3 o,mat3 R){p=R*(p-o)+o;n=R*n;}
bool has(float k){return k<.5||mod(floor(iMisc.x/exp2(k-1.)+.001),2.)>.5;}
float sn(float x){return sin(x)*.6+sin(x*2.31+1.7)*.4;}
void main(){
 float bone=aBone;
 if(!has(aPiece)){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec3 p=position,n=normal;vL=p;vHairM=0.;vShade=.93+.14*fract(sin(dot(position,vec3(12.9898,78.233,37.719)))*43758.5453);vBone=bone;vMat=aMat;
 float mode=iAnim.x,cyc=iAnim.y*6.2831853,spd=iAnim.z,seed=iAnim.w,flags=iMisc.y;vFlags=flags;vSeed=seed;
 float G=iBody.y,SHW=iBody.z,HPW=iBody.w;bool phone=mod(flags,2.)>.5;bool skirt=has(${PIECES.skirt}.)&&iMisc.x>0.;
 float T=uAnim+seed*97.;
 // ---- body shape (rest space) ----
 bool leg=bone>1.5&&bone<7.5,arm=bone>7.5&&bone<12.5;
 if(bone<.5||bone>12.5){float w=mix(HPW,SHW,smoothstep(.98,1.36,p.y));p.x*=w*G;p.z*=mix(1.,G,.8);}
 if(leg){float sx=sign(p.x)*.093*HPW;p.x=sx+(p.x-sign(p.x)*.093)*G;p.z*=G;}
 if(arm){float sx=(bone<9.5?1.:-1.)*.19;float nx=sx*SHW*mix(1.,G,.35);p.x=nx+(p.x-sx)*mix(1.,G,.8);p.z*=mix(1.,G,.8);}
 if(aMat>12.5){vec3 r=p-vec3(0.,1.605,.008);vec3 d=normalize(r/vec3(.086,.11,.097));float hs=floor(flags/16.);bool hat=has(${PIECES.cap}.)&&iMisc.x>0.||has(${PIECES.beanie}.)&&iMisc.x>0.;
  float h=smoothstep(hairTh(d,hs)-.06,hairTh(d,hs)+.04,d.y);vHairM=h;float th=hat?.002:.006+.012*max(0.,d.y)+(hs>1.5&&hs<2.5?.014*(1.-abs(d.y)):0.)+(hs>.5&&hs<1.5?.006:0.);
  p+=n*th*h;}
 // ---- pose ----
 float amp=smoothstep(.15,1.05,spd)*mix(.9,1.15,seed),idle=1.-smoothstep(.1,.5,spd);
 float sL=sin(cyc),sR=sin(cyc+3.14159);
 float thL=.44*amp*sL,thR=.44*amp*sR;
 float knL=amp*(.08+1.0*pow(max(0.,cos(cyc+.67)),3.)),knR=amp*(.08+1.0*pow(max(0.,cos(cyc+3.81)),3.));
 float anL=(thL-knL)*.8+.25*amp*pow(max(0.,cos(cyc+1.4)),6.),anR=(thR-knR)*.8+.25*amp*pow(max(0.,cos(cyc+4.54)),6.);
 float bob=.02*amp*cos(2.*cyc),pyaw=.09*amp*sL,twist=-.15*amp*sL,lean=.045*amp,sway=.016*amp*sin(cyc);
 float armL=-.36*amp*sL,armR=-.36*amp*sR,elL=.16+.18*amp+.22*amp*max(0.,-sL),elR=.16+.18*amp+.22*amp*max(0.,-sR);
 float abd=.05,hyaw=0.,hpitch=.03;
 // idle: weight shift onto one leg (relaxed knee), breathing, look around
 float ws=sn(T*.21);float relaxL=max(0.,ws),relaxR=max(0.,-ws);
 knL+=idle*.16*relaxL;knR+=idle*.16*relaxR;thL+=idle*-.05*relaxL;thR+=idle*-.05*relaxR;anL+=idle*.1*relaxL;anR+=idle*.1*relaxR;
 sway+=idle*.022*ws;pyaw+=idle*.06*ws;
 float breath=sin(T*1.5)*.006;lean+=breath*idle;
 elL+=idle*(.04+.03*sin(T*.7));elR+=idle*(.04+.03*sin(T*.63+1.));
 hyaw=idle*.55*sn(T*.11+3.);hpitch+=idle*.06*sn(T*.17);
 // queue: periodic shuffle step (alternating feet), eyes ahead most of the time
 if(abs(mode-2.)<.5){float per=3.2+3.*seed,u=fract(T/per),k=mod(floor(T/per),2.);float st=u<.16?sin(3.14159*u/.16):0.;
  if(k<.5){thL-=.2*st*idle;knL+=.42*st*idle;}else{thR-=.2*st*idle;knR+=.42*st*idle;}
  hyaw*=.55;bob+=.006*st;}
 // phone: right forearm up holding the phone at chest height, head down (also while walking)
 float ph=phone?1.:0.;
 if(ph>.5){armR=-.3;elR=1.95+.05*sin(T*.9);hyaw*=.25;hpitch=.45+.04*sin(T*.4);}
 // ---- forward kinematics ----
 vec3 hipL=vec3(.093*HPW,.9,0.),hipR=vec3(-.093*HPW,.9,0.);
 if(leg){bool L=bone<4.5;vec3 hp=L?hipL:hipR;float th=L?thL:thR,kn=L?knL:knR,an=L?anL:anR;
  vec3 kp=vec3(hp.x,.49,0.),ap=vec3(hp.x,.098,0.);
  if(abs(bone-4.)<.5||abs(bone-7.)<.5)rot(p,n,ap,rX(an));
  if(abs(bone-2.)>.5&&abs(bone-5.)>.5)rot(p,n,kp,rX(kn));
  rot(p,n,hp,rX(-th)*rZ((L?1.:-1.)*.018));}
 if(bone>12.5&&bone<13.5){// skirt / coat hem: front/back follow the thigh on its side, below the hips
  float k=smoothstep(.95,.55,p.y),side=clamp(p.x/.12,-1.,1.);float th=mix(thR,thL,side*.5+.5);rot(p,n,vec3(0.,.95,0.),rX(-th*.55*k));
  }
 vec3 chest=vec3(0.,.95,0.);
 if(arm){bool L=bone<9.5;float sgn=L?1.:-1.;vec3 sp=vec3(sgn*.19*SHW*mix(1.,G,.35),1.4,0.),ep=vec3(sp.x,1.14,0.);
  float sw=L?armL:armR,el=L?elL:elR;
  if(bone>8.5&&abs(bone-10.)>.5){rot(p,n,ep,rX(-el));if(!L&&ph>.5)rot(p,n,ep,rY(.5));}
  rot(p,n,sp,rZ(sgn*abd)*rX(-sw)*(!L&&ph>.5?rY(.25):mat3(1.)));}
 if(bone>.5&&bone<1.5)rot(p,n,vec3(0.,1.47,0.),rY(hyaw)*rX(hpitch));
 // torso twist / lean (smooth weight up the spine; arms, head and backpack ride on the chest)
 float wt=bone<.5?smoothstep(.95,1.35,p.y):(bone>13.5||arm||(bone>.5&&bone<1.5))?1.:0.;
 rot(p,n,chest,rY(twist*wt)*rX(lean*wt));
 // pelvis: bob, yaw, lateral sway (everything)
 rot(p,n,vec3(0.,.95,0.),rY(pyaw));p.x+=sway;p.y+=bob;
 p*=iBody.x;
 float hd=iPos.w,c=cos(hd),s=sin(hd);
 vec3 w=vec3(iPos.x+p.x*c+p.z*s,iPos.y+p.y,iPos.z-p.x*s+p.z*c);
 vN=vec3(n.x*c+n.z*s,n.y,-n.x*s+n.z*c);vW=w;
 // ---- albedo ----
 int mt=int(aMat+.5);vec3 a=iTop.rgb;vEmit=vec3(0.);
 if(mt==0||mt==13)a=iSkin.rgb;else if(mt==1)a=iHair.rgb;else if(mt==3)a=(skirt&&leg)?vec3(iBot.a,iSkin.a,iHair.a):iBot.rgb;
 else if(mt==4)a=vec3(iMisc.z);else if(mt==5)a=vec3(fract(iMisc.w),fract(iMisc.w*10.),fract(iMisc.w*100.))*.4;
 else if(mt==6){a=vec3(.02);vEmit=vec3(.55,.7,1.)*1.3;}else if(mt==7)a=vec3(fract(iTop.a),fract(iTop.a*10.),fract(iTop.a*100.))*.8;
 else if(mt==9)a=vec3(.03);else if(mt==10)a=vec3(.02);else if(mt==12)a=vec3(.35,.08,.08);
 vAlb=a;vHair=iHair.rgb;vBot=iBot.rgb;
 gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
const fragment=/* glsl */`${common}${HAIRLINE}
uniform float uKey,uFill,uRim,uExposure,uNearDim;
varying vec3 vN,vW,vL,vAlb,vEmit,vHair,vBot;varying float vMat,vBone,vFlags,vSeed,vHairM,vShade;
void main(){float fl=floor(vFlags+.5);vec3 N=normalize(vN),V=normalize(cameraPosition-vW);if(dot(N,V)<-.2)N=-N;
 vec3 a=vAlb;int mt=int(vMat+.5);vec3 l=vL;
 bool face=vBone>.5&&vBone<1.5&&(mt==0||mt==13);
 if(mt==13&&l.z>.05&&l.y<1.64){// eyes, brows, lips (subtle), face mask (flag 4)
  vec2 f=vec2(abs(l.x)-.034,l.y-1.613);float eye=smoothstep(.013,.007,length(f*vec2(1.,1.9)));
  float brow=smoothstep(.007,.002,abs(l.y-1.638+abs(l.x)*.12))*step(abs(l.x),.055)*step(.014,abs(l.x));
  a=mix(a,vec3(.015,.012,.012),eye*.9);a=mix(a,a*.45,brow*.8);
  a=mix(a,a*vec3(.85,.62,.6),smoothstep(.006,.0,abs(l.y-1.555))*step(abs(l.x),.022));
  if(mod(floor(fl/4.+.01),2.)>.5&&l.y<1.592&&l.y>1.515)a=mix(vec3(.72,.72,.74),vec3(.04),step(.7,vSeed));}
 if(mt==13)a=mix(a,vHair*(.9+.2*fract(l.x*53.+l.y*31.)),step(.5,vHairM));// hairline from the vertex shader (cheap under SwiftShader)
 if(mt==2&&mod(floor(fl/8.+.01),2.)>.5&&vBone<.5&&l.z>.06&&abs(l.x)<.045&&l.y>1.02&&l.y<1.44)a=vec3(fract(vSeed*7.1)<.5?.62:.08);// open jacket: shirt
 // cloth / hair micro variation
 a*=vShade;// per-vertex cloth variation (no per-pixel noise: fragment cost)
 if(mt==2&&vBone<.5&&l.y<.955+.03*fract(vSeed*13.))a=vBot;// top hem: trousers / skirt below
 vec3 street=streetLight(vW.xz);
 vec3 amb=mix(vec3(.03,.027,.045),vec3(.45,.48,.52),uDaylight)*(.62+.38*N.y);
 float side=.72+.28*(1.-abs(N.y));
 vec3 kd=normalize(vec3(.4,.65,.65));float key=max(0.,dot(N,kd));
 vec3 light=amb+street*side*(.78+uKey*(.7*key-.15))+uFill*(.6+.4*max(0.,N.y));
 float fr=pow(1.-max(0.,dot(N,V)),3.);
 vec3 rim=(street*.35+vec3(.03,.03,.05)+uScreenGlow*.04)*fr*uRim;
 float ao=mix(.62,1.,smoothstep(.0,1.15,l.y))*(face?1.:1.-.25*smoothstep(1.5,1.44,l.y)*step(1.3,l.y));
 vec3 c=a*light*ao+rim*(.5+.5*a)+vEmit;
 if(face&&mod(fl,2.)>.5)c+=a*vec3(.25,.33,.5)*.6;// phone glow on the face
 if(mt==0||mt==13)c=c*vec3(.8,.74,.72)+a*street*vec3(.08,.04,.02);// skin: less pale, a little warmth
 if(uNearDim>0.){float dc=length(vW-cameraPosition);c*=mix(1.-uNearDim,1.,smoothstep(1.5,8.,dc));}
 c*=uExposure;
 gl_FragColor=vec4(applyFog(c,vW,cameraPosition),1.);}`;

const INST=[['iPos',4],['iAnim',4],['iBody',4],['iTop',4],['iBot',4],['iHair',4],['iSkin',4],['iMisc',4]];
const pack3=c=>Math.floor(Math.min(.999,c[0]/.8)*10)/10+Math.floor(Math.min(.999,c[1]/.8)*10)/100+Math.floor(Math.min(.999,c[2]/.8)*10)/1000;
const pack3b=c=>Math.floor(Math.min(.999,c[0]/.4)*10)/10+Math.floor(Math.min(.999,c[1]/.4)*10)/100+Math.floor(Math.min(.999,c[2]/.4)*10)/1000;

export class NearPeople{
 constructor(scene,{capacity=700,lod0=120,lod0Dist=9,shared=SHARED,key=.55,fill=0,rim=1,exposure=1}={}){
  this.capacity=capacity;this.lod0Max=lod0;this.lod0Dist=lod0Dist;this.group=new THREE.Group();this.group.name='near-people';scene.add(this.group);
  this.uniforms={...shared,uAnim:{value:0},uKey:{value:key},uFill:{value:fill},uRim:{value:rim},uExposure:{value:exposure},uNearDim:{value:0}};
  const mat=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment});
  this.lods=[0,1].map(lod=>{const g=new THREE.InstancedBufferGeometry().copy(geometry(lod)),cap=lod===0?lod0:capacity;const bufs={};
   for(const [name,k] of INST){const arr=new Float32Array(cap*k),at=new THREE.InstancedBufferAttribute(arr,k).setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);bufs[name]=at;}
   g.instanceCount=0;const m=new THREE.Mesh(g,mat);m.frustumCulled=false;this.group.add(m);return {lod,mesh:m,geo:g,bufs,cap,tris:g.index.count/3};});
  this.cache=new Map();this.frustum=new THREE.Frustum();this.pm=new THREE.Matrix4();this.sph=new THREE.Sphere(new THREE.Vector3(),1.2);this.last={drawn:0,lod0:0,lod1:0};}
 set visible(v){this.group.visible=v;}
 get visible(){return this.group.visible;}
 triangles(lod=0){return this.lods[lod].tris;}
 outfit(p){const k=`${p.id}|${p.type??''}|${p.flags??''}`;let o=this.cache.get(k);if(!o){o=outfitOf(p.id,p.type??null,p.flags??null);if(this.cache.size>20000)this.cache.clear();this.cache.set(k,o);}return o;}
 // people → instances (see header). animTime: seconds (sim or video time; deterministic pose).
 set(people,{animTime=0,camera=null,cull=true}={}){this.uniforms.uAnim.value=animTime;
  let list=people;const cam=camera?camera.position:null;
  if(cam&&cull){this.pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.pm);
   list=[];for(const p of people){this.sph.center.set(p.x,(p.y||0)+.9,p.z);if(this.frustum.intersectsSphere(this.sph))list.push(p);}}
  if(cam){for(const p of list)p._d=(p.x-cam.x)**2+(p.z-cam.z)**2+((p.y||0)+1.6-cam.y)**2;list=list.slice().sort((a,b)=>a._d-b._d);}
  const n0=Math.min(this.lod0Max,list.filter(p=>!cam||p._d<this.lod0Dist**2).length);
  const parts=[list.slice(0,n0),list.slice(n0,n0+this.capacity)];
  parts.forEach((pl,li)=>{const L=this.lods[li],b=L.bufs,cnt=Math.min(pl.length,L.cap);
   for(let k=0;k<cnt;k++){const p=pl[k],o=this.outfit(p);const mode=resolveMode(p,o);
    const ph=animTime*o.cadence+o.seed;// constant cadence per person: no phase jumps when the speed changes
    const flags=(mode===ANIM.phone||(o.phone&&mode!==ANIM.idle)?1:0)|(o.faceMask?4:0)|(o.jacket?8:0)|(o.hairStyle*16);
    let pieces=o.pieces;if(!(flags&1))pieces&=~(1<<(PIECES.phone-1));else pieces|=1<<(PIECES.phone-1);
    b.iPos.array.set([p.x,p.y||0,p.z,p.heading??p.angle??0],4*k);
    b.iAnim.array.set([mode,ph,p.speed||0,o.seed],4*k);
    b.iBody.array.set([o.height,o.girth,o.shoulder,o.hip],4*k);
    b.iTop.array.set([...o.top,pack3(o.acc)],4*k);b.iBot.array.set([...o.bottom,o.legwear[0]],4*k);
    b.iHair.array.set([...o.hair,o.legwear[2]],4*k);b.iSkin.array.set([...o.skin,o.legwear[1]],4*k);
    b.iMisc.array.set([pieces,flags,(o.shoe[0]+o.shoe[1]+o.shoe[2])/3,pack3b(o.bag)],4*k);}
   for(const name of Object.keys(b))b[name].needsUpdate=true;L.geo.instanceCount=cnt;L.mesh.visible=cnt>0;});
  this.last={drawn:Math.min(parts[0].length,this.lods[0].cap)+Math.min(parts[1].length,this.lods[1].cap),lod0:Math.min(parts[0].length,this.lods[0].cap),lod1:Math.min(parts[1].length,this.lods[1].cap)};
  return this.last;}
 clear(){for(const L of this.lods){L.geo.instanceCount=0;L.mesh.visible=false;}this.last={drawn:0,lod0:0,lod1:0};}
 dispose(){for(const L of this.lods)L.geo.dispose();this.lods[0].mesh.material.dispose();this.group.removeFromParent();}
}
function resolveMode(p,o){const a=p.anim||'auto';if(a!=='auto')return ANIM[a]??ANIM.idle;if((p.speed||0)>.3)return ANIM.walk;return o.phone?ANIM.phone:ANIM.idle;}

// Take agents of a CostumeCrowd near the camera out of it (see header).
export function swapNearFromCrowd(crowd,{camera,radius=18,minDist=0,styleOf=null,anim='auto',out=[]}={}){
 const d=crowd.data,n=crowd.n,cx=camera.position.x,cz=camera.position.z,r2=radius*radius,m2=minDist*minDist;let changed=false;
 for(let i=0;i<n;i++){const x=d[4*i];if(x<-5000)continue;const z=d[4*i+1],dd=(x-cx)*(x-cx)+(z-cz)*(z-cz);if(dd>r2)continue;
  if(dd>=m2){const w=d[4*i+3],spd=Math.floor(w/8)/20;const st=styleOf?styleOf(i):null;
   out.push({x,z,y:crowd.uniforms?.uLift?.value||0,heading:d[4*i+2],speed:spd,id:i,type:st?st[0]:undefined,flags:st?st[2]:undefined,anim:typeof anim==='function'?anim(i,spd):anim});}
  d[4*i]=-9999;d[4*i+1]=-9999;changed=true;}
 if(changed&&crowd.gather)crowd.gather();
 return out;}
// List-placed crowds ({x,z,y?,angle|heading,id?}): split at radius from the camera (3D distance on y too).
export function splitNear(list,camera,radius=18){const c=camera.position,r2=radius*radius,near=[],far=[];
 for(const p of list){const d=(p.x-c.x)**2+(p.z-c.z)**2+((p.y||0)+1.5-c.y)**2;(d<=r2?near:far).push(p);}return {near,far};}
// One near-people layer for a page that mixes a solver crowd (CostumeCrowd) and list-placed crowds (interior / platform):
//   L.begin(); L.takeCrowd(crowd, camera, {radius, minDist, styleOf}); far = L.takeList(list, camera, {radius, idBase});
//   L.end({animTime, camera, fill}) → NearPeople.set stats. Call between applyShot(camera) and any CPU culling.
export class NearCrowdLayer{
 constructor(scene,{shared=SHARED,radius=18,minDist=1.1,capacity=900,lod0=120}={}){this.near=new NearPeople(scene,{shared,capacity,lod0});this.radius=radius;this.minDist=minDist;this.list=[];}
 begin(){this.list.length=0;}
 takeCrowd(crowd,camera,{radius=this.radius,minDist=this.minDist,styleOf=null,anim='auto'}={}){if(!crowd.visible)return 0;const n0=this.list.length;swapNearFromCrowd(crowd,{camera,radius,minDist,styleOf,anim,out:this.list});return this.list.length-n0;}
 // list: [{x,z,y?,angle|heading,speed?,id}] → returns the far part (the caller keeps drawing it); near ones get id + idBase
 takeList(list,camera,{radius=this.radius,idBase=0,anim='auto'}={}){const {near,far}=splitNear(list,camera,radius);
  for(const p of near)this.list.push({x:p.x,z:p.z,y:p.y||0,heading:p.heading??p.angle??0,speed:p.speed||0,id:idBase+(p.id??0),anim:p.anim||anim});return far;}
 end({animTime=0,camera=null,fill=null}={}){if(fill!=null)this.near.uniforms.uFill.value=fill;return this.near.set(this.list,{animTime,camera});}
 set visible(v){this.near.visible=v;}
 get visible(){return this.near.visible;}
}
export const _geometry=geometry;// stats / tests
