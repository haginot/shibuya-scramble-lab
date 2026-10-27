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
export const HALL_ROT=Object.freeze({central:-.35,south:-.35,newSouth:.4+Math.PI});// v6: New South flipped (free side south, facts.md)
const HALL_DRESS={
 central:{ja:'中央改札',en:'Central Gate',exitL:{ja:'スクランブルスクエア',en:'Scramble Square'},exitR:{ja:'渋谷ストリーム',en:'Shibuya Stream'},wraps:false},
 south:{ja:'南改札',en:'South Gate',exitL:{ja:'西口',en:'West Exit'},exitR:{ja:'東口',en:'East Exit'},office:'free',wraps:true},
 newSouth:{ja:'新南改札',en:'New South Gate',exitL:{ja:'渋谷ストリーム',en:'Shibuya Stream'},exitR:{ja:'サクラステージ',en:'Sakura Stage'},office:'paid',lockers:true,wood:true,tile:true,wraps:true},
};
const M={floor:0,wall:1,ceil:2,pillar:3,gate:4,reader:5,sign:6,stair:7,metal:8,esc:9,glass:10,pfloor:11,tactile:12,canopy:13,train:14,panel:15,bed:16,edge:17,flap:18,window:19,
 gateG:20,hoard:21,wrap:22,wood:23,louvre:24,locker:25,led:26,tile:27,ceilF:28};// v6 (env3d): JR-East-style gate colours, white works hoarding, green/white striped post wraps,
 // wood-tone gate ceiling + white louvre ceiling (New South), coin lockers, LED departure boards (no legible text), striped floor tiles

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
const interiorShader=(hb=null)=>({
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
   if(dot(N,V)<-.02&&m!=14.&&m!=19.&&m!=3.&&m!=4.&&m!=7.&&m!=8.&&m!=20.&&m!=22.&&m!=25.){vec3 c=vec3(.05,.05,.055)*(vec3(.03)+streetLight(p.xz)*.8);gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);return;}
   vec3 alb=vec3(.6);vec3 emit=vec3(0);float spec=0.;${hb?`float hbx=step(${hb.x0.toFixed(2)},p.x)*step(p.x,${hb.x1.toFixed(2)})*step(${hb.z0.toFixed(2)},p.z)*step(p.z,${hb.z1.toFixed(2)})*step(p.y,6.);`:'float hbx=0.;'}
   if(m<.5){vec2 t=floor(p.xz/.6);alb=mix(vec3(.5,.49,.47),vec3(.58,.57,.55),hash21(t))*(.9+.1*noise2(p.xz*4.));spec=.12;}
   else if(m<1.5){alb=vec3(.62,.62,.6)*(1.-.25*step(.97,fract(p.y/1.2))-.2*step(.985,fract((p.x+p.z)/1.8)));}
   else if(m<2.5){alb=vec3(.42,.43,.45)*(1.-.3*step(.96,fract(p.z/.6)));alb*=.7;emit=vec3(3.,2.95,2.8)*stripGlow(p);}
   else if(m<3.5){alb=vec3(.72,.73,.74);spec=.15;if(p.y>${(PLATFORM_Y+1.9).toFixed(2)}&&p.y<${(PLATFORM_Y+2.25).toFixed(2)})alb=vec3(.42,.72,.18);}// platform pillars: line-colour band (no text)
   else if(m<4.5){alb=vec3(.7,.72,.74)*(1.-.35*step(p.y,.12));spec=.35;}// gate cabinet (light grey panels, dark kick plate)
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
   else if(m<19.5){alb=vec3(.03);emit=vec3(1.,.95,.85)*.8;}// lit train window
   else if(m<20.5){alb=vec3(.1,.46,.12)*(1.-.3*step(p.y,.1));spec=.3;}// JR-East-style green gate cabinet panels (colour only, no logo)
   else if(m<21.5){alb=vec3(.8,.81,.8)*(1.-.22*step(.975,fract((p.x+p.z)/.9)))*(1.-.15*step(p.y,.12));}// white temporary works hoarding, panel seams
   else if(m<22.5){float d=fract((p.y+(p.x+p.z)*.55)/.62);alb=mix(vec3(.84,.85,.84),vec3(.06,.42,.12),step(.5,d));}// green/white striped post wrap
   else if(m<23.5){float g=noise2(vec2((p.x+p.z)*.8,(p.x-p.z)*7.));alb=vec3(.5,.37,.24)*(.82+.25*g)*(1.-.35*step(.985,fract((p.x-p.z*.3)/1.8)));}// wood-tone ceiling panels
   else if(m<24.5){float sl=fract((p.x*.92+p.z*.39)/.42);alb=mix(vec3(.04),vec3(.85,.86,.86),step(.28,sl))*(.75+.25*smoothstep(.28,.9,sl));}// white louvre slats (dark void between)
   else if(m<25.5){vec2 c=floor(vec2(p.x+p.z,p.y)/vec2(.42,.36));float h=hash21(c+3.1);vec3 w=vec3(.86,.87,.88);
    alb=h<.55?w:h<.7?vec3(.95,.45,.12):h<.82?vec3(.62,.35,.85):h<.92?vec3(.35,.6,.95):vec3(.95,.75,.2);alb*=1.-.4*step(.94,fract((p.x+p.z)/.42))-.4*step(.93,fract(p.y/.36));}// coin lockers (colour blocks, no text)
   else if(m<26.5){alb=vec3(.02);vec2 q=vUv;float fr=fract(q.y/.16),row=floor(q.y/.16);float on=step(.3,fr)*step(fr,.7)*step(.06,q.x)*step(q.x,.3+.62*(.55+.45*hash11(row*3.7)))*step(.35,fract(q.x/.018));
    emit=vec3(1.,.62,.18)*on*.32;}// QA v6: LED departure board = dim, even amber dot rows (nothing legible, no flicker/noise)
   else if(m>27.5){alb=vec3(.46,.475,.5)*(1.-.4*step(.86,fract(p.z/.3)));emit=vec3(2.6,2.55,2.4)*smoothstep(.07,.03,strip(p.xz))*step(.2,fract(p.z/3.6))*step(fract(p.z/3.6),.62);}// QA v6: Hachiko frontage ceiling — grey slatted (photo hachiko-gate/01), separate tube lights
   else{vec2 t=floor(vec2(p.x*.92+p.z*.39,p.z*.92-p.x*.39)/vec2(1.1,.5));float h=hash21(t);alb=h<.4?vec3(.62,.62,.6):h<.75?vec3(.48,.48,.47):vec3(.34,.34,.34);spec=.1;}// striped grey floor tiles
   vec3 L=lightAt(p,N);if(m>27.5&&m<28.5)L=min(L,vec3(.2))+.05;// frontage ceiling: no hot spill next to the tubes
   L+=hbx*(N.y>.5?vec3(.3,.29,.28):(m>1.5&&m<2.5)?vec3(.55):vec3(.2));// QA v6: the Hachiko concourse + covered frontage read lit (light floor, not a black void)
   vec3 col=alb*L+emit;
   if(spec>0.&&N.y>.5){float f,c;level(p.y,f,c);vec3 R=reflect(-V,N);if(R.y>.05){float h=(c-p.y)/R.y;vec3 q=p+R*h;float s=stripSoft(q,.12+h*.02);col+=vec3(1.,.97,.9)*s*spec*(.5+1.2*pow(1.-max(V.y,0.),4.));}}
   gl_FragColor=vec4(mix(applyFog(col,vWorld,cameraPosition),col,hbx*.75),1.);}`});// QA v6: the street night fog no longer turns the enclosed Hachiko concourse into a navy void


// ---------- v6 signage (canvas text, Noto Sans CJK JP — SIL OFL 1.1). JR-East-STYLE layout/colours read from the 2024–25
// photos (real-refs/hachiko-gate, new-south-gate, south-gate): green gate band with the station + gate name and the line
// symbols JY/JA/JS, yellow exit signs with black text, white platform signs. NO operator logo / wordmark (the JR mark and
// 「JR東日本」 are never drawn), official place / gate / line names only. ----------
const SIGN_FONT='"Noto Sans CJK JP","Noto Sans JP",sans-serif';
export const LINE_BADGES=Object.freeze([{code:'JY',color:'#80C241'},{code:'JA',color:'#00AC9A'},{code:'JS',color:'#E21F26'}]);
export const SIGN_COLORS=Object.freeze({gateBand:'#3aa64a',exit:'#f5c300',platform:'#f4f4f2'});// QA v6: brighter back-lit JR-East-style band (south-gate/09 ≈ rgb 54–97,142–169,56–123)
export const SIGN_GAIN=Object.freeze({gate:1.9,exit:1.5,platform:1.1}),SIGN_LIFT=Object.freeze({gate:.06});// self-lit (unlit shader, no tone mapping): back-lit sign boxes
function badge(x,cx,cy,sz,{code,color}){const r=sz*.14;x.fillStyle='#fff';x.beginPath();x.roundRect(cx-sz/2,cy-sz/2,sz,sz,r);x.fill();
 x.strokeStyle=color;x.lineWidth=sz*.1;x.beginPath();x.roundRect(cx-sz/2+sz*.09,cy-sz/2+sz*.09,sz*.82,sz*.82,r*.7);x.stroke();
 x.fillStyle='#333';x.font=`700 ${sz*.42}px ${SIGN_FONT}`;x.textAlign='center';x.textBaseline='middle';x.fillText(code,cx,cy+sz*.02);}
function arrow(x,cx,cy,sz,dir,col){x.save();x.translate(cx,cy);if(dir<0)x.scale(-1,1);x.fillStyle=col;x.beginPath();x.moveTo(sz*.5,0);x.lineTo(0,-sz*.42);x.lineTo(0,-sz*.14);
 x.lineTo(-sz*.5,-sz*.14);x.lineTo(-sz*.5,sz*.14);x.lineTo(0,sz*.14);x.lineTo(0,sz*.42);x.closePath();x.fill();x.restore();}
// kinds: gate {ja,en} | exit {ja,en,dir:-1 left / 1 right} | platform {num,ja,en,badges:[codes]} ; returns {canvas, aspect}
export function drawSign(kind,o={}){if(typeof document==='undefined')return null;const c=document.createElement('canvas');const x=c.getContext('2d');
 if(kind==='gate'){// band ratio o.ratio (default 10); content (station block · gate block · line symbols) centred as one group
  c.height=160;c.width=Math.round(160*(o.ratio||10));const W=c.width,H=c.height;x.fillStyle=SIGN_COLORS.gateBand;x.fillRect(0,0,W,H);x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,H-8,W,8);
  x.font=`700 66px ${SIGN_FONT}`;const a1=x.measureText('渋谷駅').width;x.font=`500 32px ${SIGN_FONT}`;const a2=x.measureText('Shibuya Station').width;
  x.font=`700 56px ${SIGN_FONT}`;const b1=x.measureText(o.ja||'').width;x.font=`500 30px ${SIGN_FONT}`;const b2=x.measureText(o.en||'').width;
  const A=Math.max(a1,a2),Bw=Math.max(b1,b2),gap=70,badgeW=3*92,tot=A+gap+Bw+gap+badgeW;let L=Math.max(24,(W-tot)/2);
  x.fillStyle='#fff';x.textBaseline='alphabetic';x.textAlign='left';x.font=`700 66px ${SIGN_FONT}`;x.fillText('渋谷駅',L,82);x.font=`500 32px ${SIGN_FONT}`;x.fillText('Shibuya Station',L,130);
  L+=A+gap;x.font=`700 56px ${SIGN_FONT}`;x.fillText(o.ja||'',L,76);x.font=`500 30px ${SIGN_FONT}`;x.fillText(o.en||'',L,122);
  L+=Bw+gap;LINE_BADGES.forEach((b,i)=>badge(x,L+39+i*92,H/2,78,b));}
 else if(kind==='exit'){c.width=640;c.height=160;const W=c.width,H=c.height;x.fillStyle=SIGN_COLORS.exit;x.fillRect(0,0,W,H);const d=o.dir||-1;
  const ax=d<0?70:W-70;arrow(x,ax,H/2,92,d,'#111');x.fillStyle='#111';x.textAlign=d<0?'left':'right';const tx=d<0?140:W-140;
  x.font=`700 62px ${SIGN_FONT}`;x.textBaseline='alphabetic';x.fillText(o.ja||'',tx,84);x.font=`500 30px ${SIGN_FONT}`;x.fillText(o.en||'',tx,130);}
 else{c.width=640;c.height=160;const W=c.width,H=c.height;x.fillStyle=SIGN_COLORS.platform;x.fillRect(0,0,W,H);x.fillStyle='#222';x.fillRect(0,0,W,10);
  x.textBaseline='alphabetic';x.textAlign='left';x.font=`700 70px ${SIGN_FONT}`;x.fillText(o.num||'',24,108);const tx=40+x.measureText(o.num||'').width+24;
  x.font=`700 50px ${SIGN_FONT}`;x.fillText(o.ja||'',tx,78);x.font=`500 26px ${SIGN_FONT}`;x.fillText(o.en||'',tx,122);
  (o.badges||[]).forEach((code,i)=>{const b=LINE_BADGES.find(q=>q.code===code);if(b)badge(x,W-60-i*84,H/2,72,b);});}
 return {canvas:c,aspect:c.width/c.height};}
function signMesh(kind,o,width,{gain=SIGN_GAIN[kind]??1.1,lift=SIGN_LIFT[kind]??0}={}){const d=drawSign(kind,o);if(!d)return null;const t=new THREE.CanvasTexture(d.canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
 const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/d.aspect),new THREE.ShaderMaterial({uniforms:{tMap:{value:t},uGain:{value:gain},uLift:{value:lift}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tMap;uniform float uGain,uLift;varying vec2 vUv;void main(){vec4 c=texture2D(tMap,vUv);gl_FragColor=vec4(pow(c.rgb,vec3(2.2))*uGain+uLift,1.);}`}));
 m.name='sign-'+kind;m.userData.sign={kind,...o};return m;}

// Polyline helpers (x at a given z along a mostly north-south rail).
function xAtZ(poly,z){for(let k=1;k<poly.length;k++){const a=poly[k-1],b=poly[k];if((a[1]-z)*(b[1]-z)<=0&&a[1]!==b[1]){const t=(z-a[1])/(b[1]-a[1]);return a[0]+(b[0]-a[0])*t;}}return null;}
function chain(ways){// join way polylines into one sorted by z
 const pts=ways.flatMap(w=>w.points);pts.sort((a,b)=>a[1]-b[1]);const out=[];for(const p of pts)if(!out.length||Math.abs(out.at(-1)[1]-p[1])>.5)out.push(p);return out;}

export function createJRStation(scene,{shared,osm,gates=['hachiko','central','south','newSouth'],train=true}={}){
 const group=new THREE.Group();group.name='jr-station';scene.add(group);
 const B=new Builder();const anchors={};const platforms=[];const signs=[];let HBOX=null;
 const addSign=(kind,o,width,pos,ry,opt)=>{const m=signMesh(kind,o,width,opt);if(!m)return;m.position.set(...pos);m.rotation.y=ry;group.add(m);signs.push({kind,...o,pos,ry,width});};
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
    if(side>0)B.quad(t0,u0,u1,t1,[0,1,0],M.bed);else B.quad(u0,t0,t1,u1,[0,1,0],M.bed);
    // rails (two steel heads on the bed, 1.067 m gauge) + sleepers every 3rd strip step
    for(const r of [1.15,2.22]){const r0=P(a,side*(w+r),JR_TRACK_Y-.12),r1=P(b,side*(w2+r),JR_TRACK_Y-.12);B.beam(r0[0],r0[1],r0[2],r1[0],r1[1],r1[2],.08,.14,M.metal);}
    for(let q=0;q<4;q++){const u=q/4;const m0=P(a,side*(w+1.68),JR_TRACK_Y-.25),m1=P(b,side*(w2+1.68),JR_TRACK_Y-.25);const cx=m0[0]+(m1[0]-m0[0])*u,cz=m0[2]+(m1[2]-m0[2])*u;B.box(cx,m0[1],cz,2.0,.1,.22,M.wall,Math.atan2(a[3],a[4]));}}
   // canopy
   const cy=11.4;B.quad(P(b,-(w2+2.6),cy),P(b,w2+2.6,cy),P(a,w+2.6,cy),P(a,-(w+2.6),cy),[0,-1,0],M.canopy);
   if(k%3===0){B.box(a[0],(PLATFORM_Y+cy)/2,a[1],.55,cy-PLATFORM_Y,.55,M.pillar,Math.atan2(a[3],a[4]));}
   // hanging guide sign boxes across the platform (dark face + amber band; words would be DOM, none here)
   if(k%5===2)B.box(a[0],PLATFORM_Y+2.75,a[1],Math.min(2.4,w*.9),.42,.14,M.sign,Math.atan2(a[3],a[4]));
   if(k%6===4&&w>2.4){const ry=Math.atan2(a[3],a[4]);B.box(a[0],PLATFORM_Y+.44,a[1],.45,.06,2.2,M.metal,ry);for(const o2 of [-.8,.8])B.box(a[0]+a[3]*o2,PLATFORM_Y+.22,a[1]+a[4]*o2,.4,.44,.06,M.metal,ry);}}
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
  // second escalator bank to the Saikyo/Shonan-Shinjuku island (OSM conveying steps "level 1;2", ways at x≈81–85,
  // z≈47–63; shifted ~7 m north here so its foot stays inside the modelled concourse — approximate, 「概略」)
  const sai=platforms.find(p=>p.name==='saikyo');const e2=sai?{x0:80.6,x1:85.4,z0:40,z1:56}:null;
  const hole2=e2?{x0:e2.x0-.3,x1:e2.x1+.3,z0:44,z1:R.z1}:null;
  ceil(R.x0,R.x1,R.z0,hole.z0);ceil(R.x0,hole.x0,hole.z0,R.z1);
  if(hole2&&hole2.x0>hole.x1&&hole2.x1<R.x1){ceil(hole.x1,hole2.x0,hole.z0,R.z1);ceil(hole2.x1,R.x1,hole.z0,R.z1);ceil(hole2.x0,hole2.x1,hole.z0,hole2.z0);}else ceil(hole.x1,R.x1,hole.z0,R.z1);
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
  let x=gateRow.x0;const cab=()=>{B.box(x+.12,.5,gateRow.z,.24,1,1.6,M.gate);for(const e of [-.62,.62])B.box(x+.12,.52,gateRow.z+e,.27,1.04,.36,M.gateG);B.box(x+.12,1.01,gateRow.z-.62,.22,.02,.3,M.reader);B.box(x+.12,1.01,gateRow.z+.62,.22,.02,.3,M.reader,Math.PI);x+=.24;};
  const aisle=w=>{gateRow.aisles.push({x:x+w/2,z:gateRow.z,width:w});B.box(x+.05,.62,gateRow.z,.1,.36,.03,M.flap);B.box(x+w-.05,.62,gateRow.z,.1,.36,.03,M.flap);x+=w;};// JR gates are normally open: flaps retracted
  cab();for(let k=0;k<nGates;k++){aisle(k===nGates-1?.9:.6);cab();}
  // attendant window east of the gates, fences between the gates and the side walls
  B.box(gateRow.x1+1.8,1.2,gateRow.z+1.3,3.2,2.4,2.6,M.pillar);B.box(gateRow.x1+1.8,1.5,gateRow.z-.01,2.8,.9,.04,M.window);
  B.box((R.x0+gateRow.x0)/2,.55,gateRow.z,gateRow.x0-R.x0,1.1,.08,M.metal);
  // v6: passage (north) faces of the gate-line walls = white works hoarding (photos 2025-02: white panels, green/white
  // striped post wraps), green JR-East-style gate band on the transom (free side), yellow exit signs on the paid side
  // (exit north: left/west = ハチ公口, right/east = 宮益坂口; facts.md hachiko-gate).
  const hz=R.z0-.03,hq=(x0,x1,y0,y1)=>B.quad([x1,y0,hz],[x0,y0,hz],[x0,y1,hz],[x1,y1,hz],[0,0,-1],M.hoard);
  hq(R.x0,gateRow.x0-.2,0,H);hq(gateRow.x1+3.6,R.x1,0,H);hq(gateRow.x0-.2,gateRow.x1+3.6,2.7,H);
  for(const px of [gateRow.x0-.45,gateRow.x1+3.85,R.x0+6,R.x0+14,R.x1-.6])if(px<gateRow.x0-.3||px>gateRow.x1+3.7)B.box(px,H/2,R.z0-.22,.4,H,.4,M.wrap);
  // covered gate frontage: the 2025 Hachiko gate sits under the station structure / temporary works deck (photos: low
  // slatted ceiling with strip lights), not under open sky — ceiling over the passage in front of the gate line, east of
  // the JR bridge girders (landmarks-jr) to beyond the Miyamasuzaka side.
  B.quad([80.6,H,4],[118,H,4],[118,H,R.z0],[80.6,H,R.z0],[0,-1,0],M.ceilF);B.quad([80.6,.07,R.z0],[118,.07,R.z0],[118,.07,4],[80.6,.07,4],[0,1,0],M.floor);// y .07 (QA v6): above the street/road surface (it z-fought at .025 → navy floor patches)
  // QA v6: yellow tactile guidance strip along the passage (free side) + branch into the wide aisle (photos: light tile floor, tactile strips)
  {const tz=R.z0-3.2,wa=gateRow.aisles.at(-1),ty=.085;B.quad([80.6,ty,tz-.15],[118,ty,tz-.15],[118,ty,tz+.15],[80.6,ty,tz+.15],[0,1,0],M.tactile);
   if(wa)B.quad([wa.x-.15,ty,tz+.15],[wa.x+.15,ty,tz+.15],[wa.x+.15,ty,R.z0-.9],[wa.x-.15,ty,R.z0-.9],[0,1,0],M.tactile);}
  HBOX={x0:R.x0,x1:118,z0:4,z1:R.z1};anchors.hachikoConcourseBox={x0:R.x0,x1:R.x1,z0:R.z0,z1:R.z1};// paid concourse footprint (scene-jr hides street props inside it)
  B.box(HG.x+1.8,3.45,R.z0-.09,rowW+3.8,1.3,.1,M.sign);
  addSign('gate',{ja:'ハチ公改札',en:'Hachikō Gate',ratio:(rowW+3.6)/1.2},rowW+3.6,[HG.x+1.8,3.45,R.z0-.15],Math.PI);
  B.box(HG.x,2.85,gateRow.z+1.25,rowW,.6,.18,M.sign);
  addSign('exit',{ja:'ハチ公口',en:'Hachikō Exit',dir:-1},2.3,[HG.x-rowW/4,2.85,gateRow.z+1.35],0);
  addSign('exit',{ja:'宮益坂口',en:'Miyamasuzaka Exit',dir:1},2.3,[HG.x+rowW/4,2.85,gateRow.z+1.35],0);
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
  if(hole2&&hole2.x0>hole.x1){const w2=(a,b,n,y0,y1)=>B.quad([a[0],y0,a[1]],[b[0],y0,b[1]],[b[0],y1,b[1]],[a[0],y1,a[1]],n,M.wall);
   w2([hole2.x0,hole2.z0],[hole2.x0,hole2.z1],[1,0,0],H,PLATFORM_Y);w2([hole2.x1,hole2.z1],[hole2.x1,hole2.z0],[-1,0,0],H,PLATFORM_Y);w2([hole2.x1,hole2.z0],[hole2.x0,hole2.z0],[0,0,1],H,PLATFORM_Y+3.2);
   for(const cx of [e2.x0+1.1,e2.x1-1.1]){const z0=e2.z0,z1=e2.z1;
    B.box(cx,.06,z0+flat/2,1.0,.12,flat,M.esc,0,{bottom:true});B.beam(cx,.12,z0+flat,cx,PLATFORM_Y-.04,z1-flat,1.0,.02,M.esc);B.box(cx,PLATFORM_Y-.02,z1-flat/2,1.0,.04,flat,M.esc,0,{bottom:true});
    for(const sd of [-1,1]){B.beam(cx+sd*.58,.12,z0+flat,cx+sd*.58,PLATFORM_Y,z1-flat,.08,.95,M.glass);B.beam(cx+sd*.58,1.07,z0+flat,cx+sd*.58,PLATFORM_Y+.95,z1-flat,.1,.07,M.metal);}}
   B.box((e2.x0+e2.x1)/2,2.95,e2.z0-.6,e2.x1-e2.x0,.45,.2,M.sign);addSign('platform',{num:'3・4',ja:'埼京線・湘南新宿ライン',en:'Saikyō / Shōnan-Shinjuku Line',badges:['JS','JA']},2.4,[(e2.x0+e2.x1)/2,3.05,e2.z0-.72],Math.PI);anchors.esc2Bottom={x:(e2.x0+e2.x1)/2,y:0,z:e2.z0};anchors.esc2Top={x:(e2.x0+e2.x1)/2,y:PLATFORM_Y,z:e2.z1};}
  // generic fare-adjustment / ticket machines along the west wall inside the paid area (blank lit screens, no text)
  for(let k=0;k<4;k++){const z=R.z0+3.2+k*1.05;B.box(R.x0+.45,.85,z,.8,1.7,.95,M.gate);B.box(R.x0+.86,1.25,z,.02,.42,.6,M.reader);}
  // tactile guidance strip from the wide aisle to the stairs (yellow, raised dots)
  {const wa=gateRow.aisles.at(-1),sx=(stair.x0+stair.x1)/2;B.quad([wa.x-.15,.035,gateRow.z+.9],[wa.x+.15,.035,gateRow.z+.9],[wa.x+.15,.035,gateRow.z+4],[wa.x-.15,.035,gateRow.z+4],[0,1,0],M.tactile);
   B.quad([sx+.15,.035,gateRow.z+4],[wa.x+.15,.035,gateRow.z+4],[wa.x+.15,.035,gateRow.z+4.3],[sx+.15,.035,gateRow.z+4.3],[0,1,0],M.tactile);
   B.quad([sx-.15,.035,gateRow.z+4],[sx+.15,.035,gateRow.z+4],[sx+.15,.035,stair.z0-.4],[sx-.15,.035,stair.z0-.4],[0,1,0],M.tactile);}
  {const sx=(stair.x0+esc.x1)/2;B.box(sx,3.35,stair.z0-1.2,3.6,.6,.12,M.sign);addSign('platform',{num:'1・2',ja:'山手線',en:'Yamanote Line',badges:['JY']},3.4,[sx,3.35,stair.z0-1.27],Math.PI);}
  anchors.passageSouthLane={x:HG.x+14,y:0,z:12};anchors.hachikoGate={x:HG.x,y:0,z:gateRow.z};
  anchors.stairsBottom={x:(stair.x0+stair.x1)/2,y:0,z:stair.z0};anchors.stairsTop={x:(stair.x0+stair.x1)/2,y:PLATFORM_Y,z:stair.z1};
  anchors.escBottom={x:ex[0],y:0,z:esc.z0};anchors.escTop={x:ex[0],y:PLATFORM_Y,z:esc.z1};anchors.concourse={x:(R.x0+R.x1)/2,y:0,z:(R.z0+R.z1)/2};}
 if(yam){anchors.platformNorth={x:yam.strip[1][0],y:PLATFORM_Y,z:yam.strip[1][1]};const m=yam.strip[Math.floor(yam.strip.length*.35)];anchors.platformMid={x:m[0],y:PLATFORM_Y,z:m[1]};}

 // ---------- gate halls (Central 3F, South 1F, New South 3F) — v6 (env3d): dressed from the 2022/2024 photos ----------
 // Local frame: gate row along local x at lz 0, FREE side = local −z, PAID side = local +z. Orientation (HALL_ROT) so that
 // leaving through the gates matches facts.md: South (1F) exit faces north → left West exit, right East exit; New South
 // (3F) exit faces south onto the deck → right Sakura Stage, left Stream. JR-East-style green gate band over the free
 // side, yellow exit signs over the paid side, green/stainless gates, LED departure boards (dot rows only) over the paid
 // side; New South: wood-tone ceiling band over the gate line, white louvre ceiling on the free side, coin lockers
 // (colour blocks) and a glass office on the paid side, striped grey floor tiles. All 「概略」.
 const hall=(key,{x,z,y},{w=22,d=24,n=8,rot=0}={})=>{const H=4.2,c=Math.cos(rot),s=Math.sin(rot);const P=(lx,ly,lz)=>[x+lx*c+lz*s,y+ly,z-lx*s+lz*c];const nrm=(a,b,cc)=>[a*c+cc*s,b,-a*s+cc*c];
  const D=HALL_DRESS[key]||HALL_DRESS.central;const box=(lx,ly,lz,sx,sy,sz,mat)=>{const q=P(lx,ly,lz);B.box(q[0],q[1],q[2],sx,sy,sz,mat,rot);};
  const ceilQ=(z0,z1,mat,hh=H)=>B.quad(P(-w/2,hh,z0),P(w/2,hh,z0),P(w/2,hh,z1),P(-w/2,hh,z1),[0,-1,0],mat);
  B.quad(P(-w/2,.03,d/2),P(w/2,.03,d/2),P(w/2,.03,-d/2),P(-w/2,.03,-d/2),[0,1,0],D.tile?M.tile:M.floor);
  if(D.wood){ceilQ(-d/2,-1.6,M.louvre,H+.3);ceilQ(-1.6,1.6,M.wood,H-.25);ceilQ(1.6,d/2,M.ceil);
   B.quad(P(-w/2,H-.25,-1.6),P(w/2,H-.25,-1.6),P(w/2,H+.3,-1.6),P(-w/2,H+.3,-1.6),nrm(0,0,-1),M.wall);B.quad(P(w/2,H-.25,1.6),P(-w/2,H-.25,1.6),P(-w/2,H,1.6),P(w/2,H,1.6),nrm(0,0,1),M.wall);}// step between louvre and wood band
  else ceilQ(-d/2,d/2,M.ceil);
  B.quad(P(w/2,0,-d/2),P(-w/2,0,-d/2),P(-w/2,H+.3,-d/2),P(w/2,H+.3,-d/2),nrm(0,0,1),M.wall);B.quad(P(-w/2,0,d/2),P(w/2,0,d/2),P(w/2,H,d/2),P(-w/2,H,d/2),nrm(0,0,-1),M.wall);
  B.quad(P(-w/2,0,-d/2),P(-w/2,0,d/2),P(-w/2,H+.3,d/2),P(-w/2,H+.3,-d/2),nrm(1,0,0),M.wall);B.quad(P(w/2,0,d/2),P(w/2,0,-d/2),P(w/2,H+.3,-d/2),P(w/2,H+.3,d/2),nrm(-1,0,0),M.wall);
  // gates: stainless cabinets with green end panels + readers on both faces
  let lx=-(n*.84)/2;for(let k=0;k<=n;k++){box(lx+.12,.5,0,.24,1,1.6,M.gate);for(const e of [-.62,.62])box(lx+.12,.52,e,.27,1.04,.36,M.gateG);
   const r=P(lx+.12,1.05,-.62);B.box(r[0],r[1],r[2],.22,.02,.3,M.reader,rot);const r2=P(lx+.12,1.05,.62);B.box(r2[0],r2[1],r2[2],.22,.02,.3,M.reader,rot+Math.PI);lx+=.84;}
  // fences from the gate row to the side walls (office on one side)
  for(const sd of [-1,1]){const a=sd*(n*.84/2+.3),b=sd*(w/2-.1);box((a+b)/2,.55,0,Math.abs(b-a),1.1,.08,M.metal);}
  // free-side gate band (green, station + gate name + JY/JA/JS) and paid-side exit signs
  const bw=n*.84+1.4,by=D.wood?H-.25-.5:H-.6;box(0,by,-1.05,bw+.2,bw/10+.12,.12,M.sign);// band ≈ gate-row width (photos)
  addSign('gate',{ja:D.ja,en:D.en,ratio:10},bw,P(0,by,-1.13),rot+Math.PI);
  for(const [sx,E,dr] of [[-3.1,D.exitL,-1],[3.1,D.exitR,1]]){box(sx,3.2,1.3,2.75,.74,.14,M.sign);addSign('exit',{...E,dir:dr},2.6,P(sx,3.2,1.38),rot);}
  // LED departure boards hanging over the paid side, facing the free side (dot rows only, nothing legible)
  for(let k=0;k<4;k++){const bx=-w/2+3.2+k*(w-6.4)/3;box(bx,3.1,6,3.3,.62,.12,M.led);box(bx,(3.1+.31+H)/2,6,.04,H-3.1-.31,.04,M.metal);}
  // platform signs deeper in the paid side (line names + symbols; which stair leads where is not modelled)
  for(const [sx,o] of [[-4.2,{num:'1・2',ja:'山手線',en:'Yamanote Line',badges:['JY']}],[4.2,{num:'3・4',ja:'埼京線・湘南新宿ライン',en:'Saikyō / Shōnan-Shinjuku Line',badges:['JS','JA']}]]){
   box(sx,3.25,9.5,3.5,.9,.12,M.sign);addSign('platform',o,3.4,P(sx,3.25,9.43),rot+Math.PI);}
  // walls: blank light boxes; ticket machines on the free side; fare-adjustment machines on the paid side
  for(const sd of [-1,1])for(let k=0;k<2;k++)box(sd*(w/2-.06),1.75,-d/2+3+k*5,.08,1.5,2.4,M.panel);
  for(let k=0;k<6;k++){box(-w/2+3+k*1.05,.85,-d/2+.5,.95,1.7,.8,M.gate);box(-w/2+3+k*1.05,1.25,-d/2+.91,.6,.42,.02,M.reader);}
  for(let k=0;k<3;k++){box(-w/2+.5,.85,2.2+k*1.05,.8,1.7,.95,M.gate);box(-w/2+.91,1.25,2.2+k*1.05,.02,.42,.6,M.reader);}
  {const t0=P(.3,.035,-d/2+1.4),t1=P(.6,.035,-d/2+1.4),t2=P(.6,.035,-1),t3=P(.3,.035,-1);B.quad(t0,t1,t2,t3,[0,1,0],M.tactile);}
  if(D.office==='free')box(w/2-2.4,1.3,-4.2,3.6,2.6,4.6,M.pillar),box(w/2-4.21,1.45,-4.2,.02,1.2,3.6,M.window);// attendant office + window (South)
  if(D.office==='paid')box(-w/2+2.2,1.6,4.5,3.4,3.2,5.4,M.glass);// glazed office (New South)
  if(D.lockers)box(w/2-.4,.98,5.6,.7,1.95,5.2,M.locker);
  for(const px2 of [-w/2+2,w/2-2])for(const pz2 of [-d/2+2,d/2-2]){if(D.office==='free'&&px2>0&&pz2<0)continue;box(px2,H/2,pz2,.8,H,.8,pz2<0&&D.wraps?M.wrap:M.pillar);}
  if(D.wraps)box(D.wood?-4:-3.6,H/2,-5.2,.5,H,.5,M.wrap);
  anchors[key]={x,y,z};anchors[key+'Hall']={rot,w,d,freeSide:{x:P(0,0,-d/2+2)[0],z:P(0,0,-d/2+2)[2]},paidSide:{x:P(0,0,d/2-2)[0],z:P(0,0,d/2-2)[2]}};};
 for(const key of ['central','south','newSouth'])if(gates.includes(key))hall(key,JR_GATES[key],{rot:HALL_ROT[key]});

 // ---------- a train standing at the Yamanote platform (west track), lit windows ----------
 if(train&&yam){const tr=yam.west;const cars=6,len=19.5;let z=yam.strip[0][1]+2;
  for(let k=0;k<cars;k++){const z0=z,z1=z+len;const x0=xAtZ(tr,z0),x1=xAtZ(tr,z1);if(x0==null||x1==null)break;const cx=(x0+x1)/2,cz=(z0+z1)/2,ang=Math.atan2(x1-x0,z1-z0),yb=JR_TRACK_Y+.35;
   B.box(cx,yb+1.8,cz,2.95,3.6,len-.6,M.train,ang,{bottom:true});
   // window band + doors on both sides
   for(const side of [-1,1]){const nx=Math.cos(ang)*side*1.48,nz=-Math.sin(ang)*side*1.48;for(let w=0;w<7;w++){const t=-len/2+1.6+w*(len-3.2)/6;const wx=cx+Math.sin(ang)*t+nx,wz=cz+Math.cos(ang)*t+nz;B.box(wx,yb+2.25,wz,.02,.95,w%2?1.5:1.2,M.window,ang);}}
   z+=len;}}

 const geo=B.geometry();const mat=new THREE.ShaderMaterial({uniforms:{...shared,uEsc:{value:1}},...interiorShader(HBOX),side:THREE.DoubleSide,extensions:{derivatives:true}});// double-sided: quads carry explicit normals
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
 return {group,anchors,gateRow,platforms,stats,dolly,mesh,signs,
  update(){/* escalator steps move with shared.uTime (set by the app per frame) */},
  setEscalatorSpeed(v){mat.uniforms.uEsc.value=v;},
  set visible(v){group.visible=v;},get visible(){return group.visible;}};
}
