// Set pieces for the JR編 branching variants (CLEAR / GAME OVER). Generic, logo-free, procedural geometry placed
// at APPROXIMATE positions (「位置・構造は概略」 — the HUD shows that label whenever a set is on screen).
// Every piece is a pure function of time for its animated parts (beacons, taxis, the leaving train): deterministic.
//
// Pieces (key → what / where; coordinates = sim metres, x east, z south, y up, origin = Scramble centre):
//   'taxi-west'    suspended West-Exit taxi stand (TAXI-01: 休止中 since 2025-03-30 during the plaza works): kerb island,
//                  shelter, generic 「タクシーのりば」 pole sign with a 「休止中」 board, A-frame barricade + cones across the
//                  bay, white construction hoarding behind. Default at the West-Exit plaza (x≈32, z≈150; OSM/PLATEAU open area).
//   'taxi-sakura'  渋谷SAKURAテラス前 stand (TAXI-01, OSM amenity=taxi node 11393698165 → [112.1, 311.9]): kerb, shelter,
//                  pole sign, generic taxis (no logos, roof lamp without text) pulling in and leaving on a loop.
//   'closure'      police vehicle-closure line (交通規制): steel crowd barriers, lit cones + cone bars, red/white tape, a
//                  generic round "no vehicles" road sign, a generic patrol van (no emblem/text) with red beacons.
//                  Fitted across the carriageway at `at` (perpendicular to the nearest OSM road) unless `line` is given.
//   'alt-platform' generic island platform at an alternative station (default Harajuku [209.8,-1211.2] from
//                  series_wide_osm.json stationPoints; orientation from the nearest wide-area rail): canopy, lights,
//                  benches, a hanging departure board (canvas text from setBoard rows: the SOURCED last-train time
//                  comes from the scenario config), and a train that leaves at `trainLeaveAt`.
//   'gate-queue'   Hachiko-gate one-way queue dressing (JR-GATE-03): steel barriers closing the U-turn at the
//                  Miyamasuzaka-shita end, painted one-way arrows in both lanes of the passage under the tracks,
//                  cones at the U-turn; the white divider itself is landmarks-jr.mjs (z≈1.5).
//
// API:
//   const S = createSets(scene, {shared, osm?, wideData?, insideBuilding?, options?})
//       options: {'taxi-west':{at:[x,z], rot (null = from the nearest OSM carriageway: local x along it, +z toward it)}, 'taxi-sakura':{at, rot}, closure:{at:[x,z], line:[[x,z],[x,z]]},
//                 'alt-platform':{station:'harajuku'|'yoyogi'|'ebisu'|..., at, rot, length:120},
//                 'gate-queue':{uTurnX:146}}
//     S.group                      THREE.Group (all pieces; each piece hidden until shown)
//     S.show(keys|null)            show exactly these pieces (null/[] = none)
//     S.update(t, camera?)         animate (beacons pulse, taxis loop, train leaves): pure function of t
//     S.pieces[key]                {group, anchors, visible}
//     S.anchors                    flat {'<key>.<name>': {x,y,z}} for cameras / DOM labels / crowd states:
//                                  taxi-west: stand, sign, queueHead, queueDir, kerb, barricade
//                                  taxi-sakura: stand, sign, queueHead, queueDir, kerb, bayIn, bayOut
//                                  closure: center, a, b, normal (points AWAY from the closed side), van, sign
//                                  alt-platform: center, board, edge, dir, trainHead, far
//                                  gate-queue: uTurn, northLane, southLane, gate
//     S.setBoard({title, rows:[{time, dest, note}], status, foot})  departure board text (canvas; any of the fields)
//     S.setAltStation(key)         re-place the 'alt-platform' piece at stationPoints[key] (anchors updated in place)
//     S.setTrainLeave(t0)          time (shot-local s fed to update) at which the alt-platform train starts to leave
//     S.addRoute(id, points[[x,z]], {color='#FFD23F', width=5.2, y=1.2})   route ribbon (pilot / research / detour routes;
//                                  chevrons flow along it; drawn over the ground with depthTest off at renderOrder 40)
//     S.showRoutes(ids|null, {progress=1 (draw-on 0..1, number or {id:p}), highlight=null, width?})
//     S.routes                     {id: {mesh, length, points}}
//     S.stats                      {triangles, drawCalls}
//   SET_KEYS, SET_DEFAULTS
import * as THREE from '../../vendor/three.module.min.js';
import {common} from '../shaders.mjs';

export const SET_KEYS=Object.freeze(['taxi-west','taxi-sakura','closure','alt-platform','gate-queue']);
export const SET_DEFAULTS=Object.freeze({
 'taxi-west':{at:[30,152],rot:null,note:'West-Exit plaza, open area west of the JR station (PLATEAU/OSM); approx.'},
 'taxi-sakura':{at:[112.1,311.9],rot:null,note:'OSM amenity=taxi node 11393698165 (渋谷SAKURAテラス前); approx.'},
 closure:{at:[25.5,-150],note:'fixer 2026-10-26: on 神宮通り, the street the zone-over shortest route (ZONE-D-H-HARA) follows north inside the red zone (規制図より概略; was [141,62], 45 m off any carriageway); approx.'},
 'alt-platform':{station:'harajuku',length:120,note:'generic platform at the station point of series_wide_osm.json; not a model of the real station'},
 'gate-queue':{uTurnX:146,note:'one-way divider (JR-GATE-03) U-turn at Miyamasuzaka-shita; approx.'},
});

// ---------- geometry builder (vertex colour + emissive + blink phase) ----------
class B{
 constructor(){this.p=[];this.n=[];this.c=[];this.e=[];this.k=[];this.i=[];}
 quad(a,b,c,d,n,col,emit=[0,0,0],blink=0){const s=this.p.length/3;for(const v of [a,b,c,d]){this.p.push(...v);this.n.push(...n);this.c.push(...col);this.e.push(...emit);this.k.push(blink);}this.i.push(s,s+1,s+2,s,s+2,s+3);}
 box(cx,cy,cz,sx,sy,sz,col,ry=0,emit=null,skip={},blink=0){const c=Math.cos(ry),s=Math.sin(ry),hx=sx/2,hy=sy/2,hz=sz/2;
  const T=(x,y,z)=>[cx+x*c+z*s,cy+y,cz-x*s+z*c],R=(x,y,z)=>[x*c+z*s,y,-x*s+z*c];
  const F={front:[[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],back:[[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
   right:[[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],left:[[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
   top:[[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],bottom:[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]]};
  for(const [k,[a,b,cc,d,n]] of Object.entries(F)){if(skip[k])continue;const em=emit?(emit[k]??emit.all??[0,0,0]):[0,0,0];this.quad(T(...a),T(...b),T(...cc),T(...d),R(...n),col,em,blink);}}
 // n-gon prism (cylinder / cone frustum) on the y axis
 cyl(cx,y0,cz,r0,r1,h,col,seg=8,emit=null,blink=0){for(let k=0;k<seg;k++){const a=k/seg*Math.PI*2,b=(k+1)/seg*Math.PI*2,m=(a+b)/2;
   const P=(r,ang,y)=>[cx+Math.sin(ang)*r,y,cz+Math.cos(ang)*r];this.quad(P(r0,a,y0),P(r0,b,y0),P(r1,b,y0+h),P(r1,a,y0+h),[Math.sin(m),(r0-r1)/h,Math.cos(m)],col,emit||[0,0,0],blink);
   if(r1>.001){const t=[cx,y0+h,cz];this.quad(t,P(r1,a,y0+h),P(r1,b,y0+h),t,[0,1,0],col,emit||[0,0,0],blink);}}}
 // segment beam between two points (square section w)
 bar(a,b,w,col,emit=null){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L=Math.hypot(dx,dy,dz);const ry=Math.atan2(dx,dz),flat=Math.hypot(dx,dz);
  if(flat<1e-4){this.box(a[0],(a[1]+b[1])/2,a[2],w,L,w,col,0,emit);return;}
  this.box((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,Math.max(w,Math.abs(dy)),flat,col,ry,emit);}
 geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('aCol',new THREE.Float32BufferAttribute(this.c,3));g.setAttribute('aEmit',new THREE.Float32BufferAttribute(this.e,3));g.setAttribute('aBlink',new THREE.Float32BufferAttribute(this.k,1));g.setIndex(this.i);g.computeBoundingSphere();return g;}
}

// Lit material: street light field + up to 6 local point lights per piece (shelter lamps, beacons) + emissive.
// aBlink: 0 steady; >0 = pulse rate (Hz) of a beacon (phase from position) — rotating-beacon look, no wall clock.
function setMaterial(shared,lights){const L=lights.slice(0,6);while(L.length<6)L.push({p:[0,-999,0],c:[0,0,0],r:1});
 return new THREE.ShaderMaterial({uniforms:{...shared,uLP:{value:L.map(l=>new THREE.Vector4(l.p[0],l.p[1],l.p[2],l.r))},uLC:{value:L.map(l=>new THREE.Vector4(l.c[0],l.c[1],l.c[2],l.blink||0))}},side:THREE.DoubleSide,
  vertexShader:/* glsl */`attribute vec3 aCol,aEmit;attribute float aBlink;varying vec3 vWorld,vN,vCol,vEmit;varying float vBlink;void main(){vN=normalize(mat3(modelMatrix)*normal);vCol=aCol;vEmit=aEmit;vBlink=aBlink;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform vec4 uLP[6],uLC[6];varying vec3 vWorld,vN,vCol,vEmit;varying float vBlink;
   float pulse(float rate,vec3 p){return rate<=0.?1.:.25+.75*pow(max(0.,sin(uTime*rate*6.2832+p.x*.7+p.z*.3)),3.);}
   void main(){vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
    vec3 up=streetLight(vWorld.xz)*exp(-max(0.,vWorld.y-1.)*.2)*(.55+.45*(1.-abs(N.y))+.35*max(0.,N.y));
    vec3 loc=vec3(0);for(int i=0;i<6;i++){vec3 d=uLP[i].xyz-vWorld;float r=uLP[i].w;float dd=dot(d,d);float a=max(0.,dot(normalize(d),N)*.8+.2)*r*r/(dd+r*r*.25);loc+=uLC[i].rgb*a*pulse(uLC[i].a,uLP[i].xyz)*smoothstep(r*3.,r*1.5,sqrt(dd));}
    vec3 col=vCol*(vec3(.035,.037,.05)*(1.+.5*N.y)+up+loc)+vEmit*pulse(vBlink,vWorld);
    gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});}

// canvas sign texture (generic words only; Noto Sans CJK JP, SIL OFL 1.1)
function signTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');draw(x,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return {tex:t,canvas:c,ctx:x};}
const FONT='"Noto Sans CJK JP","Noto Sans JP",sans-serif';
function signPlane(w,h,tex,{emissive=1.2}={}){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.ShaderMaterial({uniforms:{tMap:{value:tex},uGain:{value:emissive}},transparent:true,side:THREE.FrontSide,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tMap;uniform float uGain;varying vec2 vUv;void main(){vec4 c=texture2D(tMap,vUv);gl_FragColor=vec4(pow(c.rgb,vec3(2.2))*uGain,c.a);}`}));return m;}

const COL={steel:[.42,.43,.46],dark:[.08,.085,.09],white:[.86,.86,.84],concrete:[.36,.35,.34],kerb:[.55,.55,.52],yellow:[.95,.72,.05],orange:[1,.38,.05],red:[.75,.05,.04],black:[.03,.03,.03],glass:[.06,.07,.08],road:[.07,.07,.075]};

// ---------- helpers ----------
const smoothstep01=u=>u*u*(3-2*u);
const rot2=(x,z,ang)=>[x*Math.cos(ang)+z*Math.sin(ang),-x*Math.sin(ang)+z*Math.cos(ang)];
function local(at,ang){return (lx,lz)=>{const r=rot2(lx,lz,ang);return [at[0]+r[0],at[1]+r[1]];};}

// shelter: 4 posts, roof slab with a lit underside strip, back glass panel; L = local→world, ang = rotation
function shelter(b,L,ang,{w=8,d=2.2,h=2.7,lit=true}={}){for(const [sx,sz] of [[-w/2+.2,-d/2+.2],[w/2-.2,-d/2+.2],[-w/2+.2,d/2-.2],[w/2-.2,d/2-.2]]){const p=L(sx,sz);b.box(p[0],h/2,p[1],.12,h,.12,COL.steel,ang);}
 const c=L(0,0);b.box(c[0],h+.08,c[1],w+.4,.16,d+.5,[.2,.21,.23],ang,lit?{bottom:[1.1,1.05,.95]}:null);
 const bk=L(0,-d/2+.05);b.box(bk[0],1.4,bk[1],w-.4,2.2,.04,COL.glass,ang,{all:[.02,.025,.03]});
 // bench
 const be=L(0,-d/2+.5);b.box(be[0],.45,be[1],w*.5,.06,.45,[.3,.22,.15],ang);for(const sx of [-w*.22,w*.22]){const q=L(sx,-d/2+.5);b.box(q[0],.22,q[1],.06,.44,.4,COL.steel,ang);}}
// steel crowd barrier 2 m (as halloween-scene.mjs), centred at p, along angle ang
function barrier(b,p,ang,len=2,{orangePanel=true}={}){const ux=Math.sin(ang+Math.PI/2),uz=Math.cos(ang+Math.PI/2);// along
 const at=k=>[p[0]+ux*k,p[1]+uz*k];const a=at(-len/2),c=at(len/2);
 b.bar([a[0],1.02,a[1]],[c[0],1.02,c[1]],.05,COL.steel);b.bar([a[0],.18,a[1]],[c[0],.18,c[1]],.04,COL.steel);
 for(let k=-len/2+.05;k<=len/2-.04;k+=len/5.2){const q=at(k);b.box(q[0],.6,q[1],.025,.84,.025,COL.steel,ang);}
 for(const k of [-len/2+.12,len/2-.12]){const q=at(k);b.box(q[0],.015,q[1],.5,.03,.6,COL.steel,ang+Math.PI/2);}
 if(orangePanel){const q=at(0);b.box(q[0],.62,q[1],.012,.22,len*.6,COL.orange,ang+Math.PI/2,{all:[.3,.09,.01]});}}
function cone(b,p,{lit=true}={}){b.box(p[0],.02,p[1],.4,.04,.4,COL.black);b.cyl(p[0],.04,p[1],.17,.035,.68,COL.orange,8,[.18,.05,0]);b.cyl(p[0],.38,p[1],.115,.1,.1,COL.white,8,[.25,.25,.24]);
 if(lit)b.box(p[0],.74,p[1],.07,.07,.07,COL.red,0,{all:[4,.3,.1]},{},1.2);}
// generic sedan taxi (no logos, roof lamp without text): body along +z of its local frame
// taxiGeometry({hero}): hero = the cab waiting at the stand head (fixer 2026-10-26: a dark box with tail lights did not
// read as a taxi) — lighter two-tone body, big lit roof lamp (blank), lit cabin, red dash lamp, kerb-side rear door open.
function taxiGeometry({hero=false}={}){const b=new B();const body=hero?[.16,.19,.32]:[.12,.13,.16],roof=hero?[.14,.16,.26]:[.1,.1,.12],trim=hero?[.85,.72,.25]:[.55,.48,.2];
 if(hero){b.box(0,1.52,-.1,.62,.24,.26,[1,.92,.6],0,{all:[3.2,2.7,1.2]});// big roof lamp (blank)
  b.box(.92,.95,-.75,.05,.85,1.0,body,-.95);// kerb-side rear door swung open (pivot at the front edge)
  b.box(.7,.97,.45,.03,.14,.5,[1,.15,.05],0,{all:[3,.3,.05]});}// red "vacant"-style dash lamp, blank
 b.box(0,.62,0,1.72,.62,4.6,body);const gw=hero?[.2,.18,.13]:null;// hero: lit cabin glow through the windows
 b.box(0,1.15,-.25,1.56,.5,2.4,roof,0,{front:gw||[.02,.03,.04],back:gw||[.02,.03,.04],left:gw||[.03,.04,.05],right:gw||[.03,.04,.05]});
 b.box(0,.62,0,1.74,.08,4.62,trim);b.box(0,1.46,-.1,.42,.16,.18,[.9,.85,.6],0,{all:[1.6,1.3,.6]});// roof lamp (blank)
 for(const sx of [-.62,.62]){b.box(sx,.7,2.31,.34,.12,.02,[1,1,.9],0,{all:[5,4.8,4.2]});b.box(sx,.72,-2.31,.32,.1,.02,[1,.1,.05],0,{all:[3,.12,.05]});}
 b.box(.7,.96,.5,.02,.12,.4,[.9,.3,.05],0,{all:[.9,.25,.02]});// "空車"-style dash lamp, blank
 for(const sx of [-.82,.82])for(const sz of [-1.45,1.45])b.box(sx,.32,sz,.2,.64,.64,COL.black);
 return b.geometry();}
function vanGeometry(){const b=new B();const white=[.82,.83,.84],navy=[.08,.1,.16];
 b.box(0,1.05,0,1.9,1.55,4.9,white);b.box(0,.55,0,1.92,.4,4.92,navy);b.box(0,1.55,1.6,1.8,.55,1.2,COL.glass,0,{all:[.02,.025,.03]});
 for(const sx of [-.85,.85])for(const sz of [-1.6,1.6])b.box(sx,.33,sz,.22,.66,.66,COL.black);
 // light bar: red beacons (pulse), no text/emblem
 b.box(0,1.9,.6,1.4,.14,.36,[.2,.02,.02],0,{all:[3.5,.15,.08]},{},1.6);
 for(const sx of [-.62,.62])b.box(sx,.85,2.46,.32,.14,.02,[1,1,.9],0,{all:[3,2.9,2.6]});
 return b.geometry();}

// orientation from the nearest OSM carriageway: local x along the road, local +z from the kerb toward the road
function orientToRoad(osm,at,insideBuilding=null,half=6.5){let best=null,bd=1e9;for(const r of osm?.roads||[]){if(['footway','steps','path','pedestrian','cycleway','elevator','service','living_street'].includes(r.kind))continue;
  for(let i=1;i<r.points.length;i++){const a=r.points[i-1],c=r.points[i];const dx=c[0]-a[0],dz=c[1]-a[1],l2=dx*dx+dz*dz||1;const t=Math.max(0,Math.min(1,((at[0]-a[0])*dx+(at[1]-a[1])*dz)/l2));const px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(px-at[0],pz-at[1]);if(d<bd){bd=d;best={px,pz,dx,dz,d};}}}
 if(!best||best.d>40)return null;// local z (rot2(0,1,ang) = (sin ang, cos ang)) must point to the road
 if(best.d<6){// the point is ON the carriageway (OSM node on the road): kerb on the side with buildings, stand moved onto the sidewalk
  const l=Math.hypot(best.dx,best.dz)||1;let nx=-best.dz/l,nz=best.dx/l;const ib=insideBuilding||(()=>false);
  const score=sg=>{let c=0;for(let k=6;k<=20;k+=2)if(ib(best.px-nx*sg*k,best.pz-nz*sg*k,0))c++;return c;};if(score(-1)>score(1)){nx=-nx;nz=-nz;}
  return {ang:Math.atan2(nx,nz),dist:best.d,at:[best.px-nx*half,best.pz-nz*half]};}
 const nx=best.px-at[0],nz=best.pz-at[1],nl=Math.hypot(nx,nz)||1;return {ang:Math.atan2(nx/nl,nz/nl),dist:best.d};}

// ---------- pieces ----------
function buildTaxiWest(shared,opt,osm,ib){const o={...SET_DEFAULTS['taxi-west'],...opt};const ori=o.rot==null?orientToRoad(osm,o.at,ib):null;if(ori?.at)o.at=ori.at;const b=new B(),g=new THREE.Group(),ang=o.rot??ori?.ang??Math.PI/2,L=local(o.at,ang),A={};
 // kerb island + bay (local x along the kerb, local z: +road side)
 const isl=L(0,0);b.box(isl[0],.08,isl[1],16,.16,3.2,COL.kerb,ang);
 const bay=L(0,3.2);b.box(bay[0],.012,bay[1],18,.02,3.2,[.1,.1,.105],ang);
 for(let k=-8;k<8;k+=1.2){const q=L(k+.3,4.7);b.box(q[0],.02,q[1],.5,.01,.12,COL.yellow,ang,{all:[.12,.09,0]});}// bay edge markings
 shelter(b,(x,z)=>L(x,z-.4),ang,{w:7,d:2.0});
 // pole sign: generic box 「タクシーのりば」 + red/white 「休止中」 board
 const sp=L(6.8,.8);b.box(sp[0],1.6,sp[1],.1,3.2,.1,COL.steel,ang);b.box(sp[0],3.05,sp[1],.9,.6,.08,[.95,.75,.05],ang,{front:[.5,.38,.02],back:[.5,.38,.02]});
 // barricade across the bay: A-frame yellow/black boards + cones + bar
 for(let k=-6;k<=6;k+=3){const q=L(k,3.3);b.box(q[0],.75,q[1],2.4,.22,.05,COL.yellow,ang,{all:[.18,.13,0]});b.box(q[0],.35,q[1],2.4,.18,.05,COL.black,ang);for(const s of [-1.1,1.1]){const r=L(k+s,3.3);b.bar([r[0],0,r[1]],[r[0],.95,r[1]],.05,COL.steel);}}
 for(let k=-7.5;k<=7.5;k+=2.5)cone(b,L(k,4.6));
 // construction hoarding (white panels) behind the stand: the plaza works
 for(let k=-12;k<12;k+=2.4){const q=L(k+1.2,-3.6);b.box(q[0],1.5,q[1],2.36,3,.06,[.8,.8,.78],ang);const r=L(k+1.2,-3.62);b.box(r[0],2.6,r[1],2.36,.12,.05,[.15,.42,.85],ang);}
 for(const k of [-11,-4,4,11]){const q=L(k,-3.3);b.box(q[0],3.15,q[1],.12,.12,.12,[1,.6,.1],ang,{all:[3,1.7,.3]},{},.5);}// amber work lamps (slow blink)
 const lp=L(0,-.4);const lights=[{p:[lp[0],2.5,lp[1]],c:[1.4,1.3,1.15],r:3},{p:[sp[0],3.2,sp[1]],c:[.6,.45,.1],r:2}];
 const mesh=new THREE.Mesh(b.geometry(),setMaterial(shared,lights));mesh.frustumCulled=false;g.add(mesh);
 // sign faces (canvas): pole box and the closed board, both sides of the pole
 const s1=signTexture(256,170,(x,w,h)=>{x.fillStyle='#f2c014';x.fillRect(0,0,w,h);x.fillStyle='#111';x.textAlign='center';x.font=`900 50px ${FONT}`;x.fillText('タクシー',w/2,74);x.font=`900 46px ${FONT}`;x.fillText('のりば',w/2,140);});
 const s2=signTexture(300,190,(x,w,h)=>{x.fillStyle='#fff';x.fillRect(0,0,w,h);x.strokeStyle='#d01010';x.lineWidth=16;x.strokeRect(8,8,w-16,h-16);x.fillStyle='#d01010';x.textAlign='center';x.font=`900 78px ${FONT}`;x.fillText('休止中',w/2,122);x.font=`700 24px ${FONT}`;x.fillStyle='#222';x.fillText('こののりばは使えません',w/2,165);});
 const yaw=ang;
 for(const side of [1,-1]){const off=rot2(0,side*.05,ang);const a=signPlane(.86,.57,s1.tex,{emissive:.55});a.position.set(sp[0]+off[0],3.05,sp[1]+off[1]);a.rotation.y=yaw+(side<0?Math.PI:0);g.add(a);
  const c=signPlane(1.25,.8,s2.tex,{emissive:.65});c.position.set(sp[0]+off[0]*1.6,2.1,sp[1]+off[1]*1.6);c.rotation.y=yaw+(side<0?Math.PI:0);g.add(c);}
 // the closed board also on the barricade facing the road
 {const c=signPlane(1.5,.95,s2.tex,{emissive:.6});const q=L(0,3.36);c.position.set(q[0],1.0,q[1]);c.rotation.y=ang;g.add(c);const c2=c.clone();const q2=L(0,3.24);c2.position.set(q2[0],1.0,q2[1]);c2.rotation.y=ang+Math.PI;g.add(c2);}
 const W=(lx,lz,y=0)=>{const p=L(lx,lz);return {x:p[0],y,z:p[1]};};
 Object.assign(A,{stand:W(0,0),sign:W(6.8,.8,3.05),queueHead:W(5.5,.6),queueDir:(()=>{const d=rot2(-1,0,ang);return {x:d[0],y:0,z:d[1]};})(),kerb:W(0,1.6),barricade:W(0,3.3,1),camFront:W(2,11,1.6)});
 return {group:g,anchors:A,tris:b.i.length/3};}

function buildTaxiSakura(shared,opt,osm,ib){const HERO_X=6.2;const o={...SET_DEFAULTS['taxi-sakura'],...opt};const ori=o.rot==null?orientToRoad(osm,o.at,ib):null;if(ori?.at)o.at=ori.at;const b=new B(),g=new THREE.Group(),ang=o.rot??ori?.ang??-.35,L=local(o.at,ang),A={};
 const isl=L(0,0);b.box(isl[0],.08,isl[1],22,.16,3.0,COL.kerb,ang);
 for(let k=-10;k<11;k+=1.2){const q=L(k+.3,4.5);b.box(q[0],.02,q[1],.5,.01,.12,COL.white,ang,{all:[.06,.06,.06]});}
 shelter(b,(x,z)=>L(x-3,z-.3),ang,{w:9,d:2.0});
 const sp=L(8,.8);b.box(sp[0],1.6,sp[1],.1,3.2,.1,COL.steel,ang);b.box(sp[0],3.05,sp[1],.9,.6,.08,[.95,.75,.05],ang,{front:[.6,.45,.03],back:[.6,.45,.03]});
 // queue rail (stanchion line) along the kerb
 for(let k=-9;k<=7;k+=2){const q=L(k,1.05);b.box(q[0],.5,q[1],.06,1,.06,COL.steel,ang);if(k<7){const r=L(k+1,1.05);b.box(r[0],.9,r[1],2,.05,.03,[.2,.35,.6],ang,{all:[.04,.08,.15]});}}
 for(const k of [-7,0,7]){const q=L(k,-.3);b.box(q[0],4.2,q[1],.12,8.4,.12,COL.steel,ang);const r=L(k,.9);b.box(r[0],8.3,r[1],.4,.16,2.4,[.2,.2,.2],ang,{bottom:[2.2,2,1.7]});}// street lamps
 const lp=L(-3,-.3);const lights=[{p:[lp[0],2.5,lp[1]],c:[.95,.9,.8],r:3.2},...[-7,0,7].map(k=>{const q=L(k,1.5);return {p:[q[0],8,q[1]],c:[1.2,1.05,.85],r:5};}),{p:[sp[0],3.2,sp[1]],c:[.6,.45,.1],r:2}];
 const mesh=new THREE.Mesh(b.geometry(),setMaterial(shared,lights));mesh.frustumCulled=false;g.add(mesh);
 const s1=signTexture(256,170,(x,w,h)=>{x.fillStyle='#f2c014';x.fillRect(0,0,w,h);x.fillStyle='#111';x.textAlign='center';x.font=`900 50px ${FONT}`;x.fillText('タクシー',w/2,74);x.font=`900 46px ${FONT}`;x.fillText('のりば',w/2,140);});
 for(const side of [1,-1]){const off=rot2(0,side*.05,ang);const a=signPlane(.86,.57,s1.tex,{emissive:.6});a.position.set(sp[0]+off[0],3.05,sp[1]+off[1]);a.rotation.y=ang+(side<0?Math.PI:0);g.add(a);}
 // taxis: instanced; positions animated in update (loop: approach → stop → pick up → leave)
 const tg=taxiGeometry();const taxis=[];for(let k=0;k<3;k++){const m=new THREE.Mesh(tg,setMaterial(shared,[]));m.frustumCulled=false;g.add(m);taxis.push(m);}
 // the hero cab at the stand head (door open, lamp lit) + its light pool on the kerb
 {const hp=L(HERO_X,3.2);const m=new THREE.Mesh(taxiGeometry({hero:true}),setMaterial(shared,[{p:[hp[0],2.2,hp[1]],c:[1.4,1.25,.9],r:3}]));m.position.set(hp[0],0,hp[1]);m.rotation.y=ang+Math.PI/2;m.frustumCulled=false;g.add(m);}
 const W=(lx,lz,y=0)=>{const p=L(lx,lz);return {x:p[0],y,z:p[1]};};
 Object.assign(A,{stand:W(0,0),sign:W(8,.8,3.05),queueHead:W(7,.4),queueDir:(()=>{const d=rot2(-1,0,ang);return {x:d[0],y:0,z:d[1]};})(),kerb:W(0,1.6),bayIn:W(-30,3.2),bayOut:W(30,3.2),camFront:W(-4,12,1.6),hero:W(HERO_X,3.2,1)});
 // taxi k along the bay line (local x): period P, enters at x=-40, stops at x=6-k*5.5 for `dwell`, then leaves to +45
 // queued cabs pull in behind the hero (stop at HERO_X-6), wait, then pull out into the outer lane (local z 6.4) and leave
 const P=12;function update(t){taxis.forEach((m,k)=>{const ph=((t+k*P/taxis.length)%P+P)%P;const stop=HERO_X-15-(k%2)*5.5;let x,z=3.2;
   if(ph<4){const u=ph/4;x=-40+(stop+40)*(1-(1-u)*(1-u));}else if(ph<7)x=stop;else{const u=(ph-7)/5;x=stop+(45-stop)*u*u;z=3.2+3.2*smoothstep01(Math.min(1,u*3));}
   const p=L(x,z);m.position.set(p[0],0,p[1]);m.rotation.y=ang+Math.PI/2;});}
 return {group:g,anchors:A,update,tris:b.i.length/3+4*tg.index.count/3};}

function fitAcross(osm,insideBuilding,at,maxHalf=26){// perpendicular line across the nearest carriageway at `at`
 let best=null,bd=1e9;for(const r of osm?.roads||[]){if(['footway','steps','path','pedestrian','cycleway','elevator','service'].includes(r.kind))continue;
  for(let i=1;i<r.points.length;i++){const a=r.points[i-1],c=r.points[i];const dx=c[0]-a[0],dz=c[1]-a[1],l2=dx*dx+dz*dz||1;const t=Math.max(0,Math.min(1,((at[0]-a[0])*dx+(at[1]-a[1])*dz)/l2));const d=Math.hypot(a[0]+dx*t-at[0],a[1]+dz*t-at[1]);if(d<bd){bd=d;best=[dx,dz];}}}
 const dir=best?(()=>{const l=Math.hypot(best[0],best[1]);return [best[0]/l,best[1]/l];})():[1,0];const n=[-dir[1],dir[0]];
 const reach=s=>{let k=0;for(;k<maxHalf;k+=.5){const x=at[0]+n[0]*s*k,z=at[1]+n[1]*s*k;if(insideBuilding&&insideBuilding(x,z,.3))break;}return Math.max(3,k-.5);};
 const a=reach(-1),b=reach(1);return [[at[0]-n[0]*a,at[1]-n[1]*a],[at[0]+n[0]*b,at[1]+n[1]*b],dir];}

function buildClosure(shared,opt,osm,insideBuilding){const o={...SET_DEFAULTS.closure,...opt},b=new B(),g=new THREE.Group(),A={};
 let a,c,dir;if(o.line){[a,c]=o.line;const l=Math.hypot(c[0]-a[0],c[1]-a[1]);dir=[-(c[1]-a[1])/l,(c[0]-a[0])/l];}else[a,c,dir]=fitAcross(osm,insideBuilding,o.at);
 const len=Math.hypot(c[0]-a[0],c[1]-a[1]),ux=(c[0]-a[0])/len,uz=(c[1]-a[1])/len,ang=Math.atan2(ux,uz)-Math.PI/2;
 const P=(s,off=0)=>[a[0]+ux*s+dir[0]*off,a[1]+uz*s+dir[1]*off];
 // barriers along the line, a 3 m police gap in the middle closed by cones + a cone bar
 const mid=len/2;for(let s=1;s<len-1;s+=2.05){if(Math.abs(s-mid)<1.6)continue;barrier(b,P(s),ang,2);}
 for(const s of [mid-1.2,mid,mid+1.2])cone(b,P(s,.0));b.bar([P(mid-1.2)[0],.62,P(mid-1.2)[1]],[P(mid+1.2)[0],.62,P(mid+1.2)[1]],.05,COL.red,[2.2,.15,.05]);
 // red/white tape on posts 1.5 m in front (closed side), alternating stripes
 for(let s=.5;s<len;s+=2.5){const q=P(s,-1.6);b.cyl(q[0],0,q[1],.04,.04,1.1,COL.steel,6);}
 for(let s=.5;s<len-.4;s+=.5){const q0=P(s,-1.6),q1=P(Math.min(len-.5,s+.5),-1.6);const k=Math.round(s*2)%2;b.bar([q0[0],1.0,q0[1]],[q1[0],1.0,q1[1]],.07,k?COL.white:COL.red,k?[.3,.3,.3]:[.9,.04,.02]);}
 // cones on the closed side, spaced
 for(let s=2;s<len-1;s+=3.5)cone(b,P(s,-4.5));
 // round "no vehicles" sign (generic road sign pictogram, no text) on a stand at the gap
 const sg=P(mid+2.6,-.8);b.box(sg[0],.02,sg[1],.6,.04,.6,COL.black);b.box(sg[0],.75,sg[1],.06,1.5,.06,COL.steel);
 // patrol van (generic, no emblem/text) parked on the closed side
 const vg=vanGeometry();const van=new THREE.Mesh(vg,setMaterial(shared,[{p:[P(mid,-8)[0],2.3,P(mid,-8)[1]],c:[2.2,.1,.05],r:4,blink:1.6}]));const vp=P(mid+4,-8.5);van.position.set(vp[0],0,vp[1]);van.rotation.y=ang;van.frustumCulled=false;g.add(van);
 const bp=P(mid,-8);const lights=[{p:[bp[0],2.6,bp[1]],c:[2.4,.12,.06],r:6,blink:1.6},{p:[P(mid)[0],1,P(mid)[1]],c:[1.2,.35,.08],r:2.5}];
 const mesh=new THREE.Mesh(b.geometry(),setMaterial(shared,lights));mesh.frustumCulled=false;g.add(mesh);
 const s=signTexture(256,256,(x,w,h)=>{x.clearRect(0,0,w,h);x.fillStyle='#fff';x.beginPath();x.arc(128,128,124,0,Math.PI*2);x.fill();x.strokeStyle='#d01818';x.lineWidth=26;x.beginPath();x.arc(128,128,108,0,Math.PI*2);x.stroke();
  // generic "no motor vehicles" pictogram (car + motorcycle silhouettes)
  x.fillStyle='#103a9a';x.fillRect(70,88,116,34);x.fillRect(92,70,72,26);x.beginPath();x.arc(92,124,12,0,7);x.arc(164,124,12,0,7);x.fill();x.fillRect(84,150,92,20);x.beginPath();x.arc(92,174,10,0,7);x.arc(168,174,10,0,7);x.fill();});
 for(const side of [0,1]){const p=signPlane(.75,.75,s.tex,{emissive:.7});p.position.set(sg[0],1.75,sg[1]);p.rotation.y=ang+Math.PI*side;g.add(p);}
 const W=(q,y=0)=>({x:q[0],y,z:q[1]});
 Object.assign(A,{center:W(P(mid),1),a:W(a),b:W(c),normal:{x:dir[0],y:0,z:dir[1]},van:W(vp,1),sign:W(sg,1.75),camFront:W(P(mid-1.5,7),1.6)});
 return {group:g,anchors:A,tris:b.i.length/3};}

function buildAltPlatform(shared,opt,wideData){const o={...SET_DEFAULTS['alt-platform'],...opt},g=new THREE.Group(),b=new B(),A={};
 const sp=wideData?.stationPoints?.[o.station]?.p;let at=o.at||sp||[209.8,-1211.2];
 // orientation: nearest wide-area rail segment
 let ang=o.rot;if(ang==null&&wideData?.rails){let bd=1e9;for(const r of wideData.rails){for(let i=3;i<r.length;i+=2){const a=[r[i-2],r[i-1]],c=[r[i],r[i+1]];const dx=c[0]-a[0],dz=c[1]-a[1],l2=dx*dx+dz*dz||1;const t=Math.max(0,Math.min(1,((at[0]-a[0])*dx+(at[1]-a[1])*dz)/l2));const d=Math.hypot(a[0]+dx*t-at[0],a[1]+dz*t-at[1]);if(d<bd){bd=d;ang=Math.atan2(dx,dz);if(d<60&&o.snap!==false)at=[a[0]+dx*t,a[1]+dz*t];}}}}
 ang??=0;const L=local(at,ang);// local z = along the platform
 const len=o.length,W=4.6,Y=1.1;
 // ground slab under everything (hides the wide-area map ground/roads below the set), track beds, rails
 const c0=L(0,0);b.box(c0[0],-.05,c0[1],W*2+16,.1,len+40,[.05,.05,.055],ang);
 for(const side of [-1,1]){const tb=L(side*(W+1.9),0);b.box(tb[0],.08,tb[1],3.4,.16,len+40,[.11,.1,.095],ang);
  for(const r of [-.75,.75]){const q=L(side*(W+1.9)+r,0);b.box(q[0],.25,q[1],.08,.14,len+40,[.4,.4,.42],ang);}
  for(let z=-len/2-18;z<len/2+18;z+=.9){const q=L(side*(W+1.9),z);b.box(q[0],.17,q[1],2.4,.06,.22,[.18,.16,.14],ang);}}
 // platform slab + edge + tactile
 b.box(c0[0],Y/2,c0[1],W*2,Y,len,[.32,.32,.31],ang);
 for(const side of [-1,1]){const e=L(side*(W-.15),0);b.box(e[0],Y+.005,e[1],.3,.012,len,COL.white,ang,{top:[.08,.08,.08]});const t=L(side*(W-.75),0);b.box(t[0],Y+.006,t[1],.3,.012,len,COL.yellow,ang,{top:[.1,.07,0]});}
 // canopy + pillars + light strips + benches + generic vending machines
 const cy=Y+3.6;b.box(c0[0],cy+.1,c0[1],W*2+.6,.2,len*.8,[.08,.085,.095],ang,{bottom:[.01,.01,.012]});
 for(let z=-len*.4+2;z<len*.4;z+=6){const q=L(0,z);b.box(q[0],(Y+cy)/2,q[1],.4,cy-Y,.4,[.3,.31,.33],ang);const l=L(0,z+3);b.box(l[0],cy-.02,l[1],W*1.6,.04,.25,[.9,.9,.9],ang,{bottom:[3,3,2.9]});
  if(((z/6)|0)%3===1){for(const sd of [-1,1]){const q2=L(sd*1.3,z+1.8);b.box(q2[0],Y+.45,q2[1],.45,.06,2.2,[.55,.6,.68],ang);}}
  if(((z/6)|0)%5===2){const q2=L(.9,z-1.6);b.box(q2[0],Y+.95,q2[1],.75,1.9,.8,[.85,.85,.86],ang,{front:[.6,.65,.7],back:[.6,.65,.7]});}}
 // far end: a plain fence + dark (the platform ends into the night)
 // hanging departure board (dark box; text = canvas plane)
 const bz=-6,bp=L(0,bz),BW=4.3,BH=1.45;// fixer: board 2.7×0.9 → 4.3×1.45 m (QA: unreadable)
 b.box(bp[0],Y+2.85,bp[1],BW,BH,.18,[.03,.03,.035],ang);for(const sx of [-1,1]){const q=L(sx*1.8,bz);b.box(q[0],(Y+2.85+BH/2+cy)/2,q[1],.04,Math.max(.05,cy-Y-2.85-BH/2),.04,COL.steel,ang);}
 const lights=[...[-30,-12,6,24].map(z=>{const q=L(0,z);return {p:[q[0],cy-1.1,q[1]],c:[.75,.73,.7],r:5};}),{p:[bp[0],Y+2.4,bp[1]],c:[.9,.45,.1],r:1.6}];
 const mesh=new THREE.Mesh(b.geometry(),setMaterial(shared,lights));mesh.frustumCulled=false;g.add(mesh);
 // board canvas (both faces)
 const board=signTexture(640,220,()=>{});const faces=[];for(const side of [1,-1]){const off=rot2(0,side*.1,ang);const p=signPlane(BW-.1,BH-.08,board.tex,{emissive:1.5});p.position.set(bp[0]+rot2(0,side*.1,ang)[0],Y+2.85,bp[1]+rot2(0,side*.1,ang)[1]);p.rotation.y=ang+(side<0?Math.PI:0);g.add(p);faces.push(p);}
 function setBoard({title='',rows=[],status='',foot=''}={}){const x=board.ctx,w=640,h=220;x.fillStyle='#050505';x.fillRect(0,0,w,h);
  // LED dot mask look
  x.fillStyle='#ff9a1a';x.font=`700 30px ${FONT}`;x.textAlign='left';x.fillText(title,18,40);
  rows.slice(0,2).forEach((r,i)=>{const y=96+i*56;x.fillStyle=i===0?'#ffb02a':'#ff9a1a';x.font=`800 40px ${FONT}`;x.textAlign='left';x.fillText(r.note||'',18,y);x.fillText(r.time||'',140,y);x.fillStyle='#f0f0f0';x.font=`700 36px ${FONT}`;x.fillText(r.dest||'',330,y);});
  if(status){x.fillStyle='#ff3b2a';x.font=`800 34px ${FONT}`;x.textAlign='right';x.fillText(status,w-18,40);}
  if(foot){x.fillStyle='#bbbbbb';x.font=`600 22px ${FONT}`;x.textAlign='left';x.fillText(foot,18,h-12);}
  x.globalAlpha=.18;x.fillStyle='#000';for(let yy=0;yy<h;yy+=4)x.fillRect(0,yy,w,1);for(let xx=0;xx<w;xx+=4)x.fillRect(xx,0,1,h);x.globalAlpha=1;board.tex.needsUpdate=true;}
 setBoard({title:'',rows:[{note:'終電',time:'--:--',dest:''}]});
 // train on the +x track: 6 cars, leaves toward -z (local) starting at trainLeave
 const tb=new B();const carL=20;for(let k=0;k<6;k++){const z=-len/2+10+k*carL;tb.box(0,2.1,z+carL/2,2.95,3.5,carL-.6,[.6,.62,.64],0,{left:[.02,.02,.02],right:[.02,.02,.02]});
  for(const sd of [-1,1]){for(let w=0;w<6;w++){const wz=z+2+w*(carL-4)/5;tb.box(sd*1.49,2.45,wz+carL/14,.02,.9,w%2?1.3:1.1,[.05,.05,.05],0,{all:[1.15,1.1,.95]});}
   tb.box(sd*1.49,1.35,z+carL/2,.02,.16,carL-.8,[.42,.72,.18],0,{all:[.06,.12,.03]});}}
 tb.box(0,1.5,-len/2+10-.1,2.6,.3,.04,[1,.1,.05],0,{back:[3,.1,.05]});
 const train=new THREE.Mesh(tb.geometry(),setMaterial(shared,[]));train.frustumCulled=false;g.add(train);
 const trackX=W+1.9;let leaveAt=o.trainLeaveAt??1e9;
 function update(t){const dt=Math.max(0,t-leaveAt);const s=.5*.9*dt*dt;// 0.9 m/s² away
  const p=L(trackX,-s);train.position.set(p[0],0,p[1]);train.rotation.y=ang;train.visible=s<len+140;}
 update(0);
 const Wp=(lx,lz,y=Y)=>{const p=L(lx,lz);return {x:p[0],y,z:p[1]};};const d=rot2(0,1,ang);
 Object.assign(A,{center:Wp(0,0),board:Wp(0,bz,Y+2.85),edge:Wp(W-.2,0),dir:{x:d[0],y:0,z:d[1]},trainHead:Wp(trackX,-len/2+10,2),far:Wp(0,-len/2),camFront:Wp(-2.5,22,Y+1.6),station:o.station});
 return {group:g,anchors:A,update,setBoard,setTrainLeave:t=>{leaveAt=t;},tris:b.i.length/3+tb.i.length/3};}

function buildGateQueue(shared,opt){const o={...SET_DEFAULTS['gate-queue'],...opt},b=new B(),g=new THREE.Group(),A={};
 // U-turn: barriers across both lanes at x≈uTurnX leave a gap at the divider end; one-way arrows painted in each lane
 const X=o.uTurnX;for(let z=-8.5;z<=11;z+=2.05){if(Math.abs(z-1.5)<1.4)continue;barrier(b,[X+1.5,z],Math.PI/2,2);}
 for(const z of [0,3])cone(b,[X-.5,z]);
 const arrow=(x,z,dir)=>{// arrow on the floor pointing +x (dir=1) or -x (dir=-1)
  const s=dir;b.box(x,.025,z,2.2,.01,.36,[.9,.9,.86],0,{top:[.15,.15,.14]});b.quad([x+s*1.1,.03,z-.75],[x+s*2.0,.03,z],[x+s*2.0,.03,z],[x+s*1.1,.03,z+.75],[0,1,0],[.9,.9,.86],[.15,.15,.14]);};
 for(let x=62;x<X-4;x+=12){arrow(x,-4.5,1);arrow(x+6,8.5,-1);}
 // staff-held signboard stands (blank amber faces: words are DOM) at the U-turn
 for(const z of [-6,9]){b.box(X-1,1.1,z,.05,2.2,.05,COL.steel);b.box(X-1,2.1,z,.04,.6,.9,[.95,.6,.1],0,{all:[.45,.25,.02]});}
 const lights=[{p:[X-1,2.5,1.5],c:[1,.8,.5],r:4},{p:[85.9,3.4,17.6],c:[.9,.9,1],r:4}];
 const mesh=new THREE.Mesh(b.geometry(),setMaterial(shared,lights));mesh.frustumCulled=false;g.add(mesh);
 // fixer 2026-10-26: generic lit gate sign on the passage face of the Hachiko gate sign box (station-jr: x 85.9, y 2.95,
 // z ≈ 18.4) so the queue shot reads as 「ハチ公改札」 (plain words + arrow, no operator logo / corporate colours)
 {const t=signTexture(1024,96,(x,w,h)=>{x.fillStyle='#0d1726';x.fillRect(0,0,w,h);x.fillStyle='#f4f4f0';x.textAlign='center';x.textBaseline='middle';
   x.font=`900 62px ${FONT}`;x.fillText('ハチ公改札',w/2-90,h/2+2);x.font=`700 34px ${FONT}`;x.fillStyle='#c9d3e0';x.fillText('Hachiko Gate',w/2+190,h/2+4);
   x.fillStyle='#ffd23f';x.beginPath();x.moveTo(70,h/2);x.lineTo(110,h/2-26);x.lineTo(110,h/2+26);x.fill();x.fillRect(110,h/2-9,40,18);});
  const sp=signPlane(5.6,.52,t.tex,{emissive:1.25});sp.position.set(85.9,2.95,18.33);sp.rotation.y=Math.PI;g.add(sp);
  const sp2=signPlane(7.2,.68,t.tex,{emissive:1.35});sp2.position.set(85.9,3.55,18.3);sp2.rotation.y=Math.PI;g.add(sp2);// larger band above the gate box (readable from the queue)
  b2:{const q=new B();q.box(85.9,3.55,18.42,7.4,.8,.12,[.05,.06,.08]);const m2=new THREE.Mesh(q.geometry(),setMaterial(shared,[]));m2.frustumCulled=false;g.add(m2);}}
 Object.assign(A,{uTurn:{x:X,y:0,z:1.5},northLane:{x:(62+X)/2,y:0,z:-4.5},southLane:{x:(62+X)/2,y:0,z:8.5},gate:{x:85.9,y:0,z:18.9}});
 return {group:g,anchors:A,tris:b.i.length/3};}

export function createSets(scene,{shared,osm=null,wideData=null,insideBuilding=null,options={}}={}){
 const group=new THREE.Group();group.name='variant-sets';scene.add(group);
 const pieces={};
 const add=(key,p)=>{p.group.name='set-'+key;p.group.visible=false;group.add(p.group);pieces[key]=p;Object.defineProperty(p,'visible',{get:()=>p.group.visible,set:v=>{p.group.visible=v;}});};
 add('taxi-west',buildTaxiWest(shared,options['taxi-west']||{},osm,insideBuilding));
 add('taxi-sakura',buildTaxiSakura(shared,options['taxi-sakura']||{},osm,insideBuilding));
 add('closure',buildClosure(shared,options.closure||{},osm,insideBuilding));
 add('alt-platform',buildAltPlatform(shared,options['alt-platform']||{},wideData));
 add('gate-queue',buildGateQueue(shared,options['gate-queue']||{}));
 const anchors={};for(const [k,p] of Object.entries(pieces))for(const [n,v] of Object.entries(p.anchors))anchors[`${k}.${n}`]=v;
 let shown=[];
 // re-place the alternative-station platform at another station point (alt-over 原宿 / alt-clear 恵比寿); anchors updated in place
 function setAltStation(station){const cur=pieces['alt-platform'];if(!station||cur?.anchors?.station===station)return;const vis=cur.group.visible;
  group.remove(cur.group);cur.group.traverse(o=>{o.geometry?.dispose?.();});
  add('alt-platform',buildAltPlatform(shared,{...(options['alt-platform']||{}),station},wideData));pieces['alt-platform'].group.visible=vis;
  for(const k of Object.keys(anchors))if(k.startsWith('alt-platform.'))delete anchors[k];
  for(const [n,v] of Object.entries(pieces['alt-platform'].anchors))anchors[`alt-platform.${n}`]=v;}
 // route ribbons (same look as app-jr.mjs pilot ribbons)
 const routeGroup=new THREE.Group();routeGroup.name='variant-routes';scene.add(routeGroup);const routes={};
 function addRoute(id,pts,{color='#FFD23F',width=5.2,y=1.2}={}){if(routes[id]){routeGroup.remove(routes[id].mesh);routes[id].mesh.geometry.dispose();}
  const p=[],s=[],ix=[];let acc=0;
  for(let i=0;i<pts.length;i++){if(i)acc+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l;
   for(const sd of [-1,1]){p.push(pts[i][0],y,pts[i][1]);s.push(acc,sd,nx*sd,nz*sd);}if(i){const k=2*i;ix.push(k-2,k-1,k+1,k-2,k+1,k);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('aS',new THREE.Float32BufferAttribute(s,4));g.setIndex(ix);
  const mat=new THREE.ShaderMaterial({uniforms:{uProg:{value:1},uLen:{value:acc},uW:{value:width/2},uLit:{value:0},uColor:{value:new THREE.Color(color)},uTime:shared.uTime},transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
   vertexShader:`attribute vec4 aS;uniform float uW;varying vec2 vS;void main(){vS=aS.xy;vec3 p=position+vec3(aS.z,0.,aS.w)*uW;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:`uniform float uProg,uLen,uTime,uLit,uW;uniform vec3 uColor;varying vec2 vS;void main(){if(vS.x>uProg*uLen)discard;float e=smoothstep(1.,.6,abs(vS.y));float ch=step(.5,fract(vS.x/(uW*5.4)-uTime*.8));float head=smoothstep(uW*6.,0.,uProg*uLen-vS.x)*step(uProg,.999);gl_FragColor=vec4(uColor*(1.1+.5*ch+.6*uLit+1.5*head),e*.92);}`});
  const m=new THREE.Mesh(g,mat);m.renderOrder=40;m.frustumCulled=false;m.visible=false;routeGroup.add(m);routes[id]={mesh:m,mat,length:acc,points:pts,width};return routes[id];}
 function showRoutes(ids,{progress=1,highlight=null,width=null}={}){for(const [id,r] of Object.entries(routes)){const on=!!ids&&ids.includes(id);r.mesh.visible=on;if(!on)continue;
  r.mat.uniforms.uProg.value=Math.max(0,Math.min(1,typeof progress==='object'?(progress[id]??1):progress));r.mat.uniforms.uLit.value=id===highlight?1:0;r.mat.uniforms.uW.value=(width??r.width)/2*(id===highlight?1.25:1);}}
 return {group,pieces,anchors,routes,addRoute,showRoutes,
  stats:{triangles:Object.values(pieces).reduce((s,p)=>s+(p.tris|0),0),drawCalls:'1–5 per visible piece'},
  show(keys){shown=(keys||[]).filter(k=>pieces[k]);for(const [k,p] of Object.entries(pieces))p.group.visible=shown.includes(k);group.visible=shown.length>0;},
  get shown(){return [...shown];},
  update(t){for(const k of shown)pieces[k].update?.(t);},
  setBoard(o){pieces['alt-platform'].setBoard(o);},
  setTrainLeave(t){pieces['alt-platform'].setTrainLeave(t);},
  setAltStation,
  set visible(v){group.visible=v;},get visible(){return group.visible;}};
}
