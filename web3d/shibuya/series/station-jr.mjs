// Procedural JR Shibuya station (series JR編): island platforms on the elevated tracks, the 1F
// Hachiko-gate concourse on the east-west passage with a row of generic automatic ticket gates,
// stairs + escalators up to the Yamanote platform, and generic gate halls for the Central (3F),
// South (1F) and New South (3F) gates. Generic architecture only: no logos, no signage text (DOM
// overlays label things). POSITION AND STRUCTURE ARE APPROXIMATE (「位置・構造は概略」):
//   - tracks: OSM rails 山手線 / 山手貨物線 (Saikyo / Shonan-Shinjuku use the freight tracks), ODbL;
//     island platforms are the strips between each track pair, rail top JR_TRACK_Y (7.0 m), deck 8.1 m;
//   - Hachiko gate (1F): 14 gates in a line facing the passage under the tracks (EXIT-03: moved 2025-01-26,
//     faces the east-west passage; EXIT-04), paid concourse to the south, stairs + escalators up to the north
//     end of the Yamanote island (OSM steps 904652299 "level 1;2"). Gate point from the research file
//     $L/alt-routes.json jr_gates (lat/lon → sim metres);
//   - Central gate 3F / South gate 1F / New South gate 3F (EXIT-04/05): generic halls at the alt-routes.json
//     jr_gates points (approximate).
// Coordinates: sim metres, x east, z south, y up (origin = Scramble centre).
//
// API:
//   const st = createJRStation(scene, {shared, osm, gates:['hachiko','central','south','newSouth'], train:true})
//     st.group                     THREE.Group (static, ~25 draw calls)
//     st.update()                  no-op (escalator steps animate from shared.uTime); st.setEscalatorSpeed(v)
//     st.anchors                   named world points {x,y,z} for DOM labels / cameras:
//                                  passageSouthLane, hachikoGate, concourse,
//                                  stairsBottom, stairsTop, escBottom, escTop, platformNorth, platformMid,
//                                  yamanotePlatform {center, dir}, saikyoPlatform, central, south, newSouth
//     st.dolly(name='hachiko')     interior dolly keyframes [{t,pos:[x,y,z],look:[x,y,z],fov}] for camera.mjs interiorDolly
//     st.gateRow                   {x0,x1,z,y,aisles:[{x,z,width}], paidSide:'+z'} for crowd queues
//     st.platforms                 [{name:'yamanote'|'saikyo', strip:[[x,z,halfWidth,dirx,dirz],...], y}]
//     st.stats                     {triangles, drawCalls}
//   JR_GATES                       {hachiko:{x,z,y,floor:'1F'}, central:{...'3F'}, south, newSouth} (approx.)
//   PLATFORM_Y = 8.1, CONCOURSE_3F_Y = 13.4
//   APPROX_LABEL = {ja:'位置・構造は概略', en:'Layout approximate'}
import * as THREE from '../../vendor/three.module.min.js';
import {common} from '../shaders.mjs';
import {JR_TRACK_Y} from './realism.mjs';

export const PLATFORM_Y=JR_TRACK_Y+1.1,CONCOURSE_3F_Y=13.4;
export const APPROX_LABEL={ja:'位置・構造は概略',en:'Layout approximate'};
export const JR_GATES={
 hachiko:{x:85.9,z:18.9,y:0,floor:'1F',facts:['EXIT-03','EXIT-04'],note:'gate line facing the passage under the tracks; alt-routes.json jr_gates.hachiko (35.65931,139.7015), approx.'},
 central:{x:90.1,z:103.3,y:CONCOURSE_3F_Y,floor:'3F',facts:['EXIT-04'],note:'alt-routes.json jr_gates.central (OSM Central Paid Area centroid), approx.'},
 south:{x:96.6,z:162,y:0,floor:'1F',facts:['EXIT-04','TAXI-05'],note:'alt-routes.json jr_gates.south (OSM node 8401582601), approx.'},
 newSouth:{x:159.8,z:260,y:CONCOURSE_3F_Y,floor:'3F',facts:['EXIT-05'],note:'alt-routes.json jr_gates.new_south (OSM node 12498007961), approx.'},
};

// Material ids (aMat): shared lighting model, one shader.
const M={floor:0,wall:1,ceil:2,pillar:3,gate:4,reader:5,sign:6,stair:7,metal:8,esc:9,glass:10,pfloor:11,tactile:12,canopy:13,train:14,panel:15,bed:16,edge:17,flap:18,window:19};

class Builder{
 constructor(){this.p=[];this.n=[];this.m=[];this.u=[];this.i=[];}
 quad(a,b,c,d,n,mat,uv=[0,0,1,1]){const k=this.p.length/3;for(const v of [a,b,c,d]){this.p.push(...v);this.n.push(...n);this.m.push(mat);}this.u.push(uv[0],uv[1],uv[2],uv[1],uv[2],uv[3],uv[0],uv[3]);this.i.push(k,k+1,k+2,k,k+2,k+3);}
 // axis-aligned-in-local box rotated by ry around its centre; faces: skip set e.g. {bottom:true}
 box(cx,cy,cz,sx,sy,sz,mat,ry=0,skip={}){const c=Math.cos(ry),s=Math.sin(ry),hx=sx/2,hy=sy/2,hz=sz/2;
  const P=(x,y,z)=>[cx+x*c+z*s,cy+y,cz-x*s+z*c],N=(x,y,z)=>[x*c+z*s,y,-x*s+z*c];
  const F=[[[ -hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[ -hx, hy, hz],[0,0,1],'front'],[[ hx,-hy,-hz],[ -hx,-hy,-hz],[ -hx, hy,-hz],[ hx, hy,-hz],[0,0,-1],'back'],
   [[ hx,-hy, hz],[ hx,-hy,-hz],[ hx, hy,-hz],[ hx, hy, hz],[1,0,0],'right'],[[ -hx,-hy,-hz],[ -hx,-hy, hz],[ -hx, hy, hz],[ -hx, hy,-hz],[-1,0,0],'left'],
   [[ -hx, hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[ -hx, hy,-hz],[0,1,0],'top'],[[ -hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[ -hx,-hy, hz],[0,-1,0],'bottom']];
  for(const [a,b,cc,d,n,name] of F){if(skip[name])continue;this.quad(P(...a),P(...b),P(...cc),P(...d),N(...n),mat,[0,0,name==='top'||name==='bottom'?sx:sx,sy]);}}
 // box spanning from p0 to p1 (centreline), width w, height h (bottom at the line)
 beam(x0,y0,z0,x1,y1,z1,w,h,mat){const dx=x1-x0,dy=y1-y0,dz=z1-z0,L=Math.hypot(dx,dz);const ux=dx/L,uz=dz/L,nx=-uz*w/2,nz=ux*w/2;
  const a=[x0+nx,y0,z0+nz],b=[x0-nx,y0,z0-nz],c=[x1-nx,y1,z1-nz],d=[x1+nx,y1,z1+nz];const up=v=>[v[0],v[1]+h,v[2]];
  const nrm=[-dy*ux/Math.hypot(L,dy),L/Math.hypot(L,dy),-dy*uz/Math.hypot(L,dy)];
  this.quad(up(b),up(a),up(d),up(c),nrm,mat);this.quad(a,b,c,d,[-nrm[0],-nrm[1],-nrm[2]],mat);
  this.quad(b,up(b),up(c),c,[-uz,0,ux].map(v=>-v),mat);this.quad(a,d,up(d),up(a),[-uz,0,ux],mat);}
 geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('aMat',new THREE.Float32BufferAttribute(this.m,1));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));g.setIndex(this.i);g.computeBoundingSphere();return g;}
}

// Lighting: each level has LED line lights on the ceiling (strips along z every 3 m in x); diffuse from the
// three nearest strips, floor reflections of the strips by ray-plane intersection (polished floors).
const interiorShader=()=>({
 vertexShader:/* glsl */`attribute float aMat;varying float vMat;varying vec3 vWorld,vN;varying vec2 vUv;void main(){vMat=aMat;vUv=uv;vN=normal;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:/* glsl */`${common}varying float vMat;varying vec3 vWorld,vN;varying vec2 vUv;
  uniform float uEsc;
  // level of a point: floor height and ceiling height
  void level(float y,out float f,out float c){if(y<6.){f=0.;c=4.4;}else if(y<12.6){f=${PLATFORM_Y.toFixed(2)};c=11.4;}else{f=${CONCOURSE_3F_Y.toFixed(2)};c=${(CONCOURSE_3F_Y+4.4).toFixed(2)};}}
  float strip(vec2 xz){float sx=xz.x/3.;float d=abs(fract(sx)-.5)*3.;return d;}
  vec3 lightAt(vec3 p,vec3 n){float f,c;level(p.y,f,c);float ph=floor(p.x/3.);float L=0.;
   for(int k=-1;k<=1;k++){float sx=(ph+float(k)+.5)*3.;vec3 d=vec3(sx,c-.05,p.z)-p;d.z=0.;float r2=dot(d,d)+.15;L+=max(0.,dot(normalize(d),n)*.75+.25)/r2;}
   float pl=(p.y>6.&&p.y<12.6)?.42:1.;// platform level (canopy, open sides): dimmer than the enclosed concourse
   return vec3(1.,.97,.92)*L*.95*pl+vec3(.035,.038,.045);}
  float stripGlow(vec3 p){return smoothstep(.09,.03,strip(p.xz))*step(.22,fract(p.z/6.+.08));}
  float stripSoft(vec3 p,float w){return smoothstep(w,0.,strip(p.xz))*(.4+.6*step(.22,fract(p.z/6.+.08)));}
  void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vWorld);float m=vMat;vec3 p=vWorld;
   // seen from behind (outside the station shell): plain dark concrete lit by the street
   if(dot(N,V)<-.02&&m!=14.&&m!=19.&&m!=3.&&m!=4.&&m!=7.&&m!=8.){vec3 c=vec3(.05,.05,.055)*(vec3(.03)+streetLight(p.xz)*.8);gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);return;}
   vec3 alb=vec3(.6);vec3 emit=vec3(0);float spec=0.;
   if(m<.5){vec2 t=floor(p.xz/.6);alb=mix(vec3(.5,.49,.47),vec3(.58,.57,.55),hash21(t))*(.9+.1*noise2(p.xz*4.));spec=.12;}
   else if(m<1.5){alb=vec3(.62,.62,.6)*(1.-.25*step(.97,fract(p.y/1.2))-.2*step(.985,fract((p.x+p.z)/1.8)));}
   else if(m<2.5){alb=vec3(.42,.43,.45)*(1.-.3*step(.96,fract(p.z/.6)));alb*=.7;emit=vec3(3.,2.95,2.8)*stripGlow(p);}
   else if(m<3.5){alb=vec3(.72,.73,.74);spec=.15;if(p.y>${(PLATFORM_Y+1.9).toFixed(2)}&&p.y<${(PLATFORM_Y+2.25).toFixed(2)})alb=vec3(.42,.72,.18);}// platform pillars: line-colour band (no text)
   else if(m<4.5){alb=vec3(.58,.6,.62)*(1.-.35*step(p.y,.12));spec=.2;}// gate cabinet (light grey panels, dark kick plate)
   else if(m<5.5){alb=vec3(.06);vec2 q=abs(vUv-vec2(.5));emit=vec3(.35,.75,1.6)*step(max(q.x,q.y),.32)+vec3(.2,1.4,.5)*step(length(vUv-vec2(.85,.5)),.08);}// IC reader + green indicator
   else if(m<6.5){alb=vec3(.02);emit=vec3(.06,.065,.08)+vec3(2.2,1.7,.4)*step(abs(vUv.y-.5),.07)*step(.04,vUv.x)*step(vUv.x,.96);}// overhead sign box (no text: dark face, amber guide band)
   else if(m<7.5){float nose=step(.86,fract((p.y-.0)/.163));alb=mix(vec3(.42,.42,.41),vec3(.8,.62,.12),nose);}
   else if(m<8.5){alb=vec3(.25,.26,.28);spec=.6;}
   else if(m<9.5){float s=fract(vUv.x*12.-uTime*uEsc*1.2);alb=vec3(.12,.12,.13)*(.6+.4*step(.15,s))+vec3(.5,.4,.05)*step(s,.06);spec=.3;}
   else if(m<10.5){alb=vec3(.05,.06,.07);emit=vec3(.25,.3,.35)*smoothstep(.9,1.,vUv.y);}
   else if(m<11.5){vec2 t=floor(p.xz/vec2(.45,.9));alb=mix(vec3(.3,.3,.29),vec3(.36,.36,.35),hash21(t));spec=.035;}
   else if(m<12.5){vec2 d=fract(p.xz*3.3)-.5;alb=vec3(.85,.66,.08)*(.8+.3*step(length(d),.3));}
   else if(m<13.5){alb=vec3(.16,.17,.19);emit=vec3(1.7,1.65,1.55)*smoothstep(.06,.02,abs(fract(p.x/4.4)-.5)*4.4)*step(.55,fract(p.z/5.));}
   else if(m<14.5){// commuter EMU: stainless ribbed body, line-colour band (no logos)
    float rib=.85+.15*step(.5,fract(p.y*14.));alb=vec3(.62,.64,.66)*rib;float y=p.y-${(JR_TRACK_Y+.35).toFixed(2)};
    alb=mix(alb,vec3(.42,.72,.18),step(abs(y-.95),.12));spec=.5;}
   else if(m<15.5){alb=vec3(.1);vec2 q=vUv;emit=mix(vec3(.9,.95,1.),vec3(1.,.9,.75),hash11(floor(p.x*.3+p.z*.3)))*(1.6+.6*q.y)*step(.03,q.x)*step(q.x,.97)*step(.04,q.y)*step(q.y,.96);}// blank light box (no artwork)
   else if(m<16.5){alb=vec3(.07,.065,.06)*(.7+.6*noise2(p.xz*6.));}
   else if(m<17.5){alb=vec3(.8,.8,.78);}
   else if(m<18.5){alb=vec3(.55,.18,.08);}// gate flap
   else{alb=vec3(.03);emit=vec3(1.,.95,.85)*.8;}// lit train window
   vec3 L=lightAt(p,N);vec3 col=alb*L+emit;
   if(spec>0.&&N.y>.5){float f,c;level(p.y,f,c);vec3 R=reflect(-V,N);if(R.y>.05){float h=(c-p.y)/R.y;vec3 q=p+R*h;float s=stripSoft(q,.12+h*.02);col+=vec3(1.,.97,.9)*s*spec*(.5+1.2*pow(1.-max(V.y,0.),4.));}}
   gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});

// Polyline helpers (x at a given z along a mostly north-south rail).
function xAtZ(poly,z){for(let k=1;k<poly.length;k++){const a=poly[k-1],b=poly[k];if((a[1]-z)*(b[1]-z)<=0&&a[1]!==b[1]){const t=(z-a[1])/(b[1]-a[1]);return a[0]+(b[0]-a[0])*t;}}return null;}
function chain(ways){// join way polylines into one sorted by z
 const pts=ways.flatMap(w=>w.points);pts.sort((a,b)=>a[1]-b[1]);const out=[];for(const p of pts)if(!out.length||Math.abs(out.at(-1)[1]-p[1])>.5)out.push(p);return out;}

export function createJRStation(scene,{shared,osm,gates=['hachiko','central','south','newSouth'],train=true}={}){
 const group=new THREE.Group();group.name='jr-station';scene.add(group);
 const B=new Builder();const anchors={};const platforms=[];
 // ---------- tracks & island platforms from OSM ----------
 const rails=osm.railways.filter(r=>/山手/.test(r.name||''));
 // the two Yamanote tracks / two freight (Saikyo) tracks through the station: west & east of each pair
 const near=(name,z0,z1)=>rails.filter(r=>r.name===name&&r.points.some(p=>p[1]>z0&&p[1]<z1));
 const pairs=[['yamanote','山手線',52,205],['saikyo','山手貨物線',30,250]];
 for(const [key,name,z0,z1] of pairs){const ways=near(name,z0-30,z1+30);
  // split into two tracks by x offset at z=(z0+z1)/2
  const zm=(z0+z1)/2;const withX=ways.map(w=>({w,x:xAtZ(w.points,zm)??xAtZ(w.points,z0+10)??1e9})).filter(o=>o.x<1e8).sort((a,b)=>a.x-b.x);
  if(withX.length<2)continue;const mid=(withX[0].x+withX.at(-1).x)/2;
  const west=chain(ways.filter(w=>{const x=xAtZ(w.points,zm)??xAtZ(w.points,z0+10)??xAtZ(w.points,z1-10);return x!=null&&x<mid;}));
  const east=chain(ways.filter(w=>{const x=xAtZ(w.points,zm)??xAtZ(w.points,z0+10)??xAtZ(w.points,z1-10);return x!=null&&x>=mid;}));
  const strip=[];for(let z=z0;z<=z1;z+=4){const xa=xAtZ(west,z),xb=xAtZ(east,z);if(xa==null||xb==null)continue;const l=Math.min(xa,xb)+1.65,r=Math.max(xa,xb)-1.65;if(r-l<3)continue;strip.push([(l+r)/2,z,(r-l)/2]);}
  if(strip.length<3)continue;
  for(let k=0;k<strip.length;k++){const a=strip[Math.max(0,k-1)],b=strip[Math.min(strip.length-1,k+1)],L=Math.hypot(b[0]-a[0],b[1]-a[1]);strip[k].push((b[0]-a[0])/L,(b[1]-a[1])/L);}
  platforms.push({name:key,strip,y:PLATFORM_Y,west,east});
  // slab (top + sides), white edge + tactile strip, canopy, pillars, track beds
  for(let k=1;k<strip.length;k++){const a=strip[k-1],b=strip[k];
   const corner=(s,side,inset)=>[s[0]+(-s[4])*0+side*(s[2]-inset)*s[4]*1,PLATFORM_Y,s[1]-side*(s[2]-inset)*s[3]];
   // perpendicular of (dx,dz) is (dz,-dx): left side (west) = -perp
   const P=(s,off,y=PLATFORM_Y)=>[s[0]+s[4]*off,y,s[1]-s[3]*off];
   const w=a[2],w2=b[2];
   B.quad(P(a,-(w-1.15)),P(a,w-1.15),P(b,w2-1.15),P(b,-(w2-1.15)),[0,1,0],M.pfloor);
   for(const side of [-1,1]){const e0=side*(w-1.15),e1=side*(w-.85),f0=side*(w2-1.15),f1=side*(w2-.85);
    {const q0=side*(w-.85),q1=side*(w-.25),r0=side*(w2-.85),r1=side*(w2-.25);B.quad(...(side<0?[P(a,q1),P(a,q0),P(b,r0),P(b,r1)]:[P(a,q0),P(a,q1),P(b,r1),P(b,r0)]),[0,1,0],M.pfloor);}
    B.quad(...(side<0?[P(a,e1),P(a,e0),P(b,f0),P(b,f1)]:[P(a,e0),P(a,e1),P(b,f1),P(b,f0)]),[0,1,0],M.tactile);
    const g0=side*(w-.25),g1=side*w,h0=side*(w2-.25),h1=side*w2;B.quad(...(side<0?[P(a,g1),P(a,g0),P(b,h0),P(b,h1)]:[P(a,g0),P(a,g1),P(b,h1),P(b,h0)]),[0,1,0],M.edge);
    // platform face down to the track bed
    const top0=P(a,side*w),top1=P(b,side*w2),bot0=P(a,side*w,JR_TRACK_Y-.3),bot1=P(b,side*w2,JR_TRACK_Y-.3);
    const n=[side*a[4],0,-side*a[3]];if(side>0)B.quad(bot0,bot1,top1,top0,n,M.wall);else B.quad(bot1,bot0,top0,top1,n,M.wall);
    // track bed (ballast) beyond the edge to the far rail
    const t0=P(a,side*w,JR_TRACK_Y-.3),t1=P(b,side*w2,JR_TRACK_Y-.3),u0=P(a,side*(w+3.4),JR_TRACK_Y-.3),u1=P(b,side*(w2+3.4),JR_TRACK_Y-.3);
    if(side>0)B.quad(t0,u0,u1,t1,[0,1,0],M.bed);else B.quad(u0,t0,t1,u1,[0,1,0],M.bed);}
   // canopy
   const cy=11.4;B.quad(P(b,-(w2+2.6),cy),P(b,w2+2.6,cy),P(a,w+2.6,cy),P(a,-(w+2.6),cy),[0,-1,0],M.canopy);
   if(k%3===0){B.box(a[0],(PLATFORM_Y+cy)/2,a[1],.55,cy-PLATFORM_Y,.55,M.pillar,Math.atan2(a[3],a[4]));}
   // hanging guide sign boxes across the platform (dark face + amber band; words would be DOM, none here)
   if(k%5===2)B.box(a[0],PLATFORM_Y+2.75,a[1],Math.min(2.4,w*.9),.42,.14,M.sign,Math.atan2(a[3],a[4]));}
  const mid2=strip[Math.floor(strip.length/2)];anchors[key+'Platform']={center:{x:mid2[0],y:PLATFORM_Y,z:mid2[1]},dir:{x:mid2[3],z:mid2[4]},north:{x:strip[0][0],y:PLATFORM_Y,z:strip[0][1]},south:{x:strip.at(-1)[0],y:PLATFORM_Y,z:strip.at(-1)[1]}};}

 // ---------- 1F Hachiko gate + paid concourse ----------
 // Gate line faces the passage under the tracks (south sidewalk, z≈11..14); paid area to the south.
 const HG=JR_GATES.hachiko,nGates=14;// 14 automatic gates after the 2025 move (research waypoint 9, shibukei 2025-01-27)
 const rowW=(nGates-1)*.6+.9+(nGates+1)*.24;
 const gateRow={x0:HG.x-rowW/2,x1:HG.x+rowW/2,z:HG.z+.6,y:0,aisles:[],paidSide:'+z',count:nGates};
 const yam=platforms.find(p=>p.name==='yamanote');
 // stairs + escalators rise southward from the paid concourse to the north end of the Yamanote island
 const pz0=yam?yam.strip[0][1]:52,px=yam?yam.strip[0][0]:66,pw=yam?yam.strip[0][2]:4;
 const stair={x0:px-pw+.3,x1:px-pw+.3+Math.min(3.2,pw-.4),z0:pz0-15.6,z1:pz0};const esc={x0:stair.x1+.3,x1:Math.min(stair.x1+3.3,px+pw-.2),z0:pz0-14.2,z1:pz0};
 if(gates.includes('hachiko')){
  const R={x0:Math.min(54,stair.x0-6),x1:Math.max(97,gateRow.x1+4.5),z0:gateRow.z,z1:pz0+.5},H=4.4;
  B.quad([R.x0,.03,R.z1],[R.x1,.03,R.z1],[R.x1,.03,R.z0],[R.x0,.03,R.z0],[0,1,0],M.floor);
  const hole={x0:stair.x0-.3,x1:esc.x1+.3,z0:Math.min(stair.z0,esc.z0)+5,z1:R.z1};
  const ceil=(x0,x1,z0,z1)=>{if(x1>x0&&z1>z0)B.quad([x0,H,z0],[x1,H,z0],[x1,H,z1],[x0,H,z1],[0,-1,0],M.ceil);};
  ceil(R.x0,R.x1,R.z0,hole.z0);ceil(R.x0,hole.x0,hole.z0,R.z1);ceil(hole.x1,R.x1,hole.z0,R.z1);
  // stairwell shaft up to the platform deck (so the platform level is enclosed above the opening)
  const wall=(a,b,n,y0=0,y1=H)=>B.quad([a[0],y0,a[1]],[b[0],y0,b[1]],[b[0],y1,b[1]],[a[0],y1,a[1]],n,M.wall);
  wall([hole.x0,hole.z0],[hole.x0,hole.z1],[1,0,0],H,PLATFORM_Y);wall([hole.x1,hole.z1],[hole.x1,hole.z0],[-1,0,0],H,PLATFORM_Y);wall([hole.x1,hole.z0],[hole.x0,hole.z0],[0,0,1],H,PLATFORM_Y+3.2);
  // walls: south, west, east; north = gate line opening + side walls + transom above the gates
  wall([R.x0,R.z1],[R.x1,R.z1],[0,0,-1]);wall([R.x0,R.z0],[R.x0,R.z1],[1,0,0]);wall([R.x1,R.z1],[R.x1,R.z0],[-1,0,0]);
  wall([gateRow.x0-.2,R.z0],[R.x0,R.z0],[0,0,1]);wall([R.x1,R.z0],[gateRow.x1+3.6,R.z0],[0,0,1]);wall([gateRow.x1+3.6,R.z0],[gateRow.x0-.2,R.z0],[0,0,1],2.7,H);
  // pillars (avoid the gate approach and the stair/escalator footprint)
  for(let x=R.x0+6;x<=R.x1-4;x+=8)for(const z of [R.z0+9,R.z0+21]){if(x>stair.x0-2&&x<esc.x1+2&&z>stair.z0-2)continue;if(Math.abs(x-HG.x)<rowW/2+1&&z<R.z0+12)continue;B.box(x,H/2,z,.9,H,.9,M.pillar);}
  // blank light boxes on the side walls (no artwork, no text)
  for(let z=R.z0+4;z<R.z1-4;z+=6.5){B.box(R.x0+.06,1.75,z,.08,1.5,2.4,M.panel,0,{left:true});B.box(R.x1-.06,1.75,z,.08,1.5,2.4,M.panel,0,{right:true});}
  // ticket gates: cabinets 1.6 m long (along z), 0.24 m wide, 1.0 m high; 0.6 m aisles, one 0.9 m wide aisle
  let x=gateRow.x0;const cab=()=>{B.box(x+.12,.5,gateRow.z,.24,1,1.6,M.gate);B.box(x+.12,1.01,gateRow.z-.62,.22,.02,.3,M.reader);B.box(x+.12,1.01,gateRow.z+.62,.22,.02,.3,M.reader,Math.PI);x+=.24;};
  const aisle=w=>{gateRow.aisles.push({x:x+w/2,z:gateRow.z,width:w});B.box(x+.05,.62,gateRow.z,.1,.36,.03,M.flap);B.box(x+w-.05,.62,gateRow.z,.1,.36,.03,M.flap);x+=w;};// JR gates are normally open: flaps retracted
  cab();for(let k=0;k<nGates;k++){aisle(k===nGates-1?.9:.6);cab();}
  // attendant window east of the gates, fences between the gates and the side walls
  B.box(gateRow.x1+1.8,1.2,gateRow.z+1.3,3.2,2.4,2.6,M.pillar);B.box(gateRow.x1+1.8,1.5,gateRow.z-.01,2.8,.9,.04,M.window);
  B.box((R.x0+gateRow.x0)/2,.55,gateRow.z,gateRow.x0-R.x0,1.1,.08,M.metal);
  // overhead sign box over the gates (dark, amber guide band; text = DOM overlay), facing the passage
  B.box(HG.x,2.95,gateRow.z-1.0,rowW,.55,.25,M.sign);B.box(HG.x,2.95,gateRow.z+1.0,rowW,.55,.25,M.sign);
  // stairs: 0.163 m risers, rising +z to the platform deck; nosing stripes; handrails
  const steps=Math.round(PLATFORM_Y/.163),run=(stair.z1-stair.z0)/steps;
  for(let k=0;k<steps;k++){const y=(k+1)*PLATFORM_Y/steps;B.box((stair.x0+stair.x1)/2,y-PLATFORM_Y/steps/2,stair.z0+run*(k+.5),stair.x1-stair.x0,PLATFORM_Y/steps,run,M.stair,0,{bottom:true});}
  for(const sx of [stair.x0+.05,stair.x1-.05])B.beam(sx,.9,stair.z0,sx,PLATFORM_Y+.9,stair.z1,.06,.06,M.metal);
  B.beam(stair.x0-.1,0,stair.z0,stair.x0-.1,PLATFORM_Y,stair.z1,.2,1.05,M.glass);
  // escalators (up + down): inclined step band with animated steps, balustrades, handrails
  const ex=[esc.x0+(esc.x1-esc.x0)*.27,esc.x1-(esc.x1-esc.x0)*.27],flat=1.2;
  for(const cx of ex){const z0=esc.z0,z1=esc.z1;
   B.box(cx,.06,z0+flat/2,1.0,.12,flat,M.esc,0,{bottom:true});
   B.beam(cx,.12,z0+flat,cx,PLATFORM_Y-.04,z1-flat,1.0,.02,M.esc);
   B.box(cx,PLATFORM_Y-.02,z1-flat/2,1.0,.04,flat,M.esc,0,{bottom:true});
   for(const sd of [-1,1]){B.beam(cx+sd*.58,.12,z0+flat,cx+sd*.58,PLATFORM_Y,z1-flat,.08,.95,M.glass);B.beam(cx+sd*.58,1.07,z0+flat,cx+sd*.58,PLATFORM_Y+.95,z1-flat,.1,.07,M.metal);}}
  anchors.passageSouthLane={x:HG.x+14,y:0,z:12};anchors.hachikoGate={x:HG.x,y:0,z:gateRow.z};
  anchors.stairsBottom={x:(stair.x0+stair.x1)/2,y:0,z:stair.z0};anchors.stairsTop={x:(stair.x0+stair.x1)/2,y:PLATFORM_Y,z:stair.z1};
  anchors.escBottom={x:ex[0],y:0,z:esc.z0};anchors.escTop={x:ex[0],y:PLATFORM_Y,z:esc.z1};anchors.concourse={x:(R.x0+R.x1)/2,y:0,z:(R.z0+R.z1)/2};}
 if(yam){anchors.platformNorth={x:yam.strip[1][0],y:PLATFORM_Y,z:yam.strip[1][1]};const m=yam.strip[Math.floor(yam.strip.length*.35)];anchors.platformMid={x:m[0],y:PLATFORM_Y,z:m[1]};}

 // ---------- generic gate halls (Central 3F, South 1F, New South 3F) ----------
 const hall=(key,{x,z,y},{w=22,d=14,n=8,rot=0}={})=>{const H=4.2,c=Math.cos(rot),s=Math.sin(rot);const P=(lx,ly,lz)=>[x+lx*c+lz*s,y+ly,z-lx*s+lz*c];const nrm=(a,b,cc)=>[a*c+cc*s,b,-a*s+cc*c];
  B.quad(P(-w/2,.03,d/2),P(w/2,.03,d/2),P(w/2,.03,-d/2),P(-w/2,.03,-d/2),[0,1,0],M.floor);B.quad(P(-w/2,H,-d/2),P(w/2,H,-d/2),P(w/2,H,d/2),P(-w/2,H,d/2),[0,-1,0],M.ceil);
  B.quad(P(w/2,0,-d/2),P(-w/2,0,-d/2),P(-w/2,H,-d/2),P(w/2,H,-d/2),nrm(0,0,1),M.wall);B.quad(P(-w/2,0,d/2),P(w/2,0,d/2),P(w/2,H,d/2),P(-w/2,H,d/2),nrm(0,0,-1),M.wall);
  B.quad(P(-w/2,0,-d/2),P(-w/2,0,d/2),P(-w/2,H,d/2),P(-w/2,H,-d/2),nrm(1,0,0),M.wall);B.quad(P(w/2,0,d/2),P(w/2,0,-d/2),P(w/2,H,-d/2),P(w/2,H,d/2),nrm(-1,0,0),M.wall);
  let lx=-(n*.84)/2;for(let k=0;k<=n;k++){const q=P(lx+.12,.5,0);B.box(q[0],q[1],q[2],.24,1,1.6,M.gate,rot);const r=P(lx+.12,1.01,-.62);B.box(r[0],r[1],r[2],.22,.02,.3,M.reader,rot);lx+=.84;}
  const sg=P(0,2.9,-.9);B.box(sg[0],sg[1],sg[2],n*.84,.5,.25,M.sign,rot);
  for(const px2 of [-w/2+2,w/2-2])for(const pz2 of [-d/2+2,d/2-2]){const q=P(px2,H/2,pz2);B.box(q[0],q[1],q[2],.8,H,.8,M.pillar,rot);}
  anchors[key]={x,y,z};};
 for(const key of ['central','south','newSouth'])if(gates.includes(key))hall(key,JR_GATES[key],{rot:key==='newSouth'?.4:key==='central'?-.35:-.35});

 // ---------- a train standing at the Yamanote platform (west track), lit windows ----------
 if(train&&yam){const tr=yam.west;const cars=6,len=19.5;let z=yam.strip[0][1]+2;
  for(let k=0;k<cars;k++){const z0=z,z1=z+len;const x0=xAtZ(tr,z0),x1=xAtZ(tr,z1);if(x0==null||x1==null)break;const cx=(x0+x1)/2,cz=(z0+z1)/2,ang=Math.atan2(x1-x0,z1-z0),yb=JR_TRACK_Y+.35;
   B.box(cx,yb+1.8,cz,2.95,3.6,len-.6,M.train,ang,{bottom:true});
   // window band + doors on both sides
   for(const side of [-1,1]){const nx=Math.cos(ang)*side*1.48,nz=-Math.sin(ang)*side*1.48;for(let w=0;w<7;w++){const t=-len/2+1.6+w*(len-3.2)/6;const wx=cx+Math.sin(ang)*t+nx,wz=cz+Math.cos(ang)*t+nz;B.box(wx,yb+2.25,wz,.02,.95,w%2?1.5:1.2,M.window,ang);}}
   z+=len;}}

 const geo=B.geometry();const mat=new THREE.ShaderMaterial({uniforms:{...shared,uEsc:{value:1}},...interiorShader(),side:THREE.DoubleSide,extensions:{derivatives:true}});// double-sided: quads carry explicit normals
 const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;group.add(mesh);
 const stats={triangles:geo.index.count/3,drawCalls:1};
 function dolly(name='hachiko'){const A=anchors;if(name!=='hachiko'||!A.hachikoGate)return [];const g=A.hachikoGate,sb=A.stairsBottom,st=A.stairsTop,pm=A.platformMid||st;const eye=1.6;
  const ai=gateRow.aisles[Math.floor(gateRow.aisles.length/2)];
  return [
   {t:0,pos:[g.x+13,eye,12.6],look:[g.x+2,1.4,g.z],fov:56},          // south lane of the passage, gates on the left
   {t:2.4,pos:[ai.x+1.2,eye,g.z-4.2],look:[ai.x,1.2,g.z+3],fov:56},   // facing the gate line
   {t:4.2,pos:[ai.x,eye,g.z-1.1],look:[ai.x-.5,1.45,g.z+8],fov:58},   // in the aisle
   {t:6.0,pos:[ai.x-2.5,eye,g.z+3.2],look:[sb.x,2.,sb.z+2],fov:58},   // through: concourse, stairs ahead
   {t:9.0,pos:[sb.x+.4,eye,sb.z-2.4],look:[sb.x,4.6,sb.z+8],fov:60},  // foot of the stairs
   {t:12.0,pos:[sb.x+.2,st.y*.6+eye,sb.z+(st.z-sb.z)*.6],look:[st.x,st.y+1.5,st.z+6],fov:60},
   {t:14.2,pos:[st.x+.4,st.y+eye,st.z+1.6],look:[pm.x,pm.y+1.4,pm.z],fov:58},
   {t:16.5,pos:[st.x+(pm.x-st.x)*.25,st.y+eye,st.z+9],look:[pm.x,pm.y+1.3,pm.z+20],fov:56}];}
 return {group,anchors,gateRow,platforms,stats,dolly,mesh,
  update(){/* escalator steps move with shared.uTime (set by the app per frame) */},
  setEscalatorSpeed(v){mat.uniforms.uEsc.value=v;},
  set visible(v){group.visible=v;},get visible(){return group.visible;}};
}
