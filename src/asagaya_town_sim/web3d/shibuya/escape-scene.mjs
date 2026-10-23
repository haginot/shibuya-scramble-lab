// "Escape Shibuya on Halloween!" — the game layer of the 3D view (v4).
// Draws, from the escape solver's static levels (escape.mjs `escapeLevels`) and its per-frame
// playback state (escapeFrameFrom): route ribbons per branch (example route lit with flowing
// chevrons, alternatives grey dashed), fork nodes, PLAYER START pins, objective icons (train
// gate / taxi / walk-to-another-station arrow), off-sim dashed continuations with an arrow head,
// the route walkers of the sim (highlighted), the tracked player halo and the red DANGER heat.
// No words are baked into WebGL (one capture serves JP and EN): icons carry only language-neutral
// line symbols (JR, G, Z, DT, F, TY, IN, C) and exit codes. Words are DOM labels placed from
// anchors()/project(). Crowd people are never recoloured; the "horde" is only the heat field.
//
// API (coordinates: sim metres, x east, z south, y up):
//   const em=createEscapeScene(scene, levels|sim|{levels}, {lineMarks?})
//   em.showLevel(key|null)        / em.setScenario(id)    (copy ids accepted: 'scramble' = 'centergai')
//   em.setLevelOpacity(key, a)    previous level fade (0 hides)
//   em.drawOn(key, p0to1)         staggered branch draw-on; icons pop at the end of each branch
//   em.highlight(key, b, amount)  / em.setBranch(b, amount)   lit glow + chevrons, others grey dashed 35 %
//   em.setOutcome(key, b, 'escaped'|'caught'|null)            ✔/✖ badge (symbol only) at the objective
//   em.showAll({recommendedOnly:true, opacity:1})              overview
//   em.dropPin(key, secondsSinceDrop) / em.hidePins()          PLAYER START pin drop (+ 2-pulse ripple)
//   em.setPlayer(x, z, visible)                                purple halo + beacon under the tracked agent
//   em.setWalkers(state|null)     route walkers from an escape state (positions from the sim)
//   em.applyState(state, {heat:true, walkers:true, player:true, outcomes:false})
//   em.setHeat(heat|[heat…]|null) / em.setHeatAlpha(a) / em.heat.pulse=0..1 / em.heat.flash=0..1
//   em.update(videoTime, camera)  animation (chevrons, ripples, shimmer) + screen-size scaling
//   em.anchors(key?) → [{id, level, kind, x, y, z, visible}]   ids: start, A, A-target, A-edge, fork-1 …
//   em.project(camera, width, height, key?) → [{id, level, x, y, visible, inFrame}]  (DOM label placement)
//   em.cameraFor(key, {aspect, fov, azimuth, pitch, column}) → {pos, look, fov}  (fits the level in the 9:16 column)
//
// Parody staging hooks (zombie / death-game look; all sim-driven or purely stylistic, no words in WebGL):
//   RED ALERT — the danger heat throbs on a heartbeat and red shock rings run out from the hotspot, plus a
//   red ground marker, when the SIMULATED density spikes. pulse = smoothstep(alert.from 2, alert.to 3.5, p/m²).
//   em.applyState(state, {danger:true|{source,branch}})   (default on) calls setDanger(state, …) for you
//   em.setDanger(state|p_m2|null, {source:'player'|'route'|'max', branch?, x?, z?}) → danger record
//        'player' (default) = state.danger.value, the same number as the HUD DANGER meter (densest cell ≤ 6 m);
//        'route' = densest cell within 4.5 m of the lit route ribbon (hotspot = that cell); 'max' = larger of both
//   em.setAlert(pulse0to1, {x, z})       manual override (e.g. the cold-open card over heat0)
//   em.routeDanger(state, branchKey?) → {value p/m², x, z}
//   em.dangerPulse  0..1   em.dangerBeat 0..1 (heartbeat at video time, ESCAPE_STYLE.alert.bpm)
//   em.danger → {value, player, route, source, pulse, x, z, beat, label:'simulation'}   (for the DOM HUD)
//   POST FX (fx.mjs Post; uses Post.last unless em.attachPost(post) / opts.post):
//   em.setVhs(0..1, {seed})        VHS/glitch: 3 px scanlines, line jitter, torn bands, RGB split, tracking band
//   em.setAlertVignette(0..1|'auto')   red edge vignette; 'auto' = dangerPulse × heartbeat
//   setDanger/setAlert/setVhs/setAlertVignette are LATCHED PER FRAME: call them every frame they should be on,
//   before em.update(); anything not called falls back to 0, so other shots are unaffected (all defaults 0).
//   VHS only touches the WebGL frame — DOM text (title, HUD) is never distorted by it.
import * as THREE from '../vendor/three.module.min.js';
import {Post} from './fx.mjs';

export const ESCAPE_STYLE=Object.freeze({
 y:.12, width:3.2, outline:.4, glow:10, dash:4, gap:3, chevron:7, flow:9,   // ribbons (m, m/s)
 pin:{height:8, color:'#9D4BFF'}, player:'#C58BFF',
 grey:'#D8D2E8', unlitOpacity:.6,  // spec said 35 %; 60 % keeps the alternatives readable over the lit crosswalks
 iconPx:70, badgePx:26,                                                         // screen px at 720 p
 edgeLength:70,                                                                  // m of dashed ribbon shown toward a far station
 escaped:'#3DFF8B', caught:'#FF2A3A',
 // Parody RED ALERT: pulse = smoothstep(from, to, sim p/m²); heartbeat bpm; shock-ring radius (m);
 // route corridor half-width (m) for the 'route' danger source.
 alert:{from:2, to:3.5, bpm:84, radius:34, corridor:4.5, color:'#FF2A3A'},
});
// Deterministic heartbeat (double thump) at video time t, 0..1.
export function heartbeat(t,bpm=ESCAPE_STYLE.alert.bpm){const ph=((t*bpm/60)%1+1)%1,g=(x,c,w)=>Math.exp(-Math.pow((x-c)/w,2));
 return Math.min(1,g(ph,.06,.05)+g(ph,1.06,.05)+.65*g(ph,.3,.055));}
const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const ALIAS={scramble:'centergai',centergai:'centergai'};
// Language-neutral line symbols and exit codes per branch (same places and fact ids as the
// branch labels in escape.mjs: Z Hanzomon, DT Den-en-toshi, G Ginza, F Fukutoshin, TY Toyoko,
// IN Keio Inokashira, C Chiyoda, JR).
export const LINE_MARKS=Object.freeze({
 centergai:{A:{lines:['Z','DT'],exit:'A0–A4'},B:{lines:['JR']},C:{lines:['IN']}},
 miyashita:{A:{lines:['Z','DT'],exit:'B1'},B:{lines:['JR']},C:{lines:['C','F']}},
 hikarie:{A:{lines:['G','F','TY'],exit:'B5'},B:{exit:'B6'},C:{lines:['G','Z','C']}},
 stream:{A:{lines:['JR']},B:{},C:{lines:['TY']}},
 dogenzaka:{A:{lines:['IN']},B:{lines:['Z','DT'],exit:'A0–A4'},C:{lines:['IN']}},
});
const FONT='Inter,"DejaVu Sans","Noto Sans",sans-serif';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const backOut=t=>{const c=1.7;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);};

// ─── geometry helpers ──────────────────────────────────────────────────────────
// Display-only smoothing of the grid-cell route (the agents follow the raw path).
function smooth(path,passes=3,win=3){let p=path.map(q=>[q[0],q[1]]);if(p.length<3)return p;
 for(let k=0;k<passes;k++){const o=p.map(q=>q.slice());for(let i=1;i<p.length-1;i++){let sx=0,sz=0,n=0;for(let j=Math.max(0,i-win);j<=Math.min(p.length-1,i+win);j++){sx+=p[j][0];sz+=p[j][1];n++;}o[i]=[sx/n,sz/n];}p=o;}
 // drop near-duplicates
 const out=[p[0]];for(const q of p.slice(1))if(Math.hypot(q[0]-out.at(-1)[0],q[1]-out.at(-1)[1])>.4)out.push(q);if(out.length<2)out.push(p.at(-1));return out;}
function arc(p){const s=[0];for(let i=1;i<p.length;i++)s.push(s[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));return s;}
function pointAt(p,s,at){if(at<=0)return p[0];for(let i=1;i<p.length;i++)if(s[i]>=at){const u=(at-s[i-1])/((s[i]-s[i-1])||1);return [p[i-1][0]+(p[i][0]-p[i-1][0])*u,p[i-1][1]+(p[i][1]-p[i-1][1])*u];}return p.at(-1);}
function distToPath(p,x,z){let d=Infinity;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=clamp(((x-a[0])*dx+(z-a[1])*dz)/l);d=Math.min(d,Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z));}return d;}
// Ribbon strip: centre line + normal; the width is applied in the vertex shader (uHalf × uScale).
function ribbonGeometry(p,y){const s=arc(p),n=p.length,pos=[],nor=[],as=[],av=[],idx=[];
 for(let i=0;i<n;i++){const a=p[Math.max(0,i-1)],b=p[Math.min(n-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
  for(const v of [-1,1]){pos.push(p[i][0],y,p[i][1]);nor.push(nx,nz);as.push(s[i]);av.push(v);}
  if(i)idx.push(2*i-2,2*i-1,2*i,2*i-1,2*i+1,2*i);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aN',new THREE.Float32BufferAttribute(nor,2));
 g.setAttribute('aS',new THREE.Float32BufferAttribute(as,1));g.setAttribute('aV',new THREE.Float32BufferAttribute(av,1));g.setIndex(idx);g.computeBoundingSphere();return {geo:g,length:s.at(-1)};}

const common={uScale:{value:1},uTime:{value:0}};// shared by every escape material (screen-size scale, video time)
const ribbonVS=/* glsl */`uniform float uHalf,uScale;attribute vec2 aN;attribute float aS,aV;varying float vS,vV;
 void main(){vS=aS;vV=aV;vec3 p=position+vec3(aN.x,0.,aN.y)*aV*uHalf*uScale;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
// Core: dark outline, level colour (lit) or grey dashes (unlit), chevrons flowing along s, draw-on head.
const coreFS=/* glsl */`uniform vec3 uColor,uGrey;uniform float uLit,uDraw,uLen,uOpacity,uDashed,uTime,uHalf,uScale,uOutline,uDash,uGap,uChev,uFlow;varying float vS,vV;
 void main(){if(vS>uDraw)discard;float hw=uHalf*uScale,m=abs(vV)*hw;float dashed=max(uDashed,1.-uLit);
  float on=mix(1.,step(fract(vS/((uDash+uGap)*uScale)),uDash/(uDash+uGap)),dashed);if(on<.5)discard;
  float edge=step(hw-uOutline*uScale*(1.+.8*(1.-uLit)),m);
  vec3 base=mix(mix(uGrey,uColor,.5)*.95,uColor*(1.15+.9*uLit),uLit);// unlit: half-tinted so dashes still read over white zebra stripes
  float ph=fract((vS+m*.9-uTime*uFlow)/(uChev*uScale));float chev=smoothstep(.0,.07,ph)*smoothstep(.36,.26,ph)*step(m,hw*.78)*uLit*(1.-uDashed);
  vec3 c=mix(base,vec3(1.,.97,.9)*2.2,chev*.75);
  float head=(uDraw<uLen-.01)?smoothstep(uDraw-6.*uScale,uDraw,vS):0.;c+=uColor*2.5*head;
  c=mix(c,vec3(.02,.01,.03),edge);
  float a=uOpacity*mix(.6,1.,max(uLit,uDashed*.6))*(edge>.5?.85:1.);
  #ifdef XRAY
  a*=.42;c=mix(c,uColor*.8,.3);
  #endif
  gl_FragColor=vec4(c,a);}`;
// Glow: wide additive halo under the lit ribbon.
const glowFS=/* glsl */`uniform vec3 uColor;uniform float uLit,uDraw,uOpacity,uTime;varying float vS,vV;
 void main(){if(vS>uDraw)discard;float f=1.-abs(vV);f=f*f;float pulse=.85+.15*sin(uTime*4.-vS*.15);gl_FragColor=vec4(uColor*f*.55*uLit*uOpacity*pulse,1.);}`;
function ribbonMaterial(kind,color){const S=ESCAPE_STYLE,glow=kind==='glow';
 return new THREE.ShaderMaterial({uniforms:{uScale:common.uScale,uTime:common.uTime,uColor:{value:new THREE.Color(color)},uGrey:{value:new THREE.Color(S.grey)},uLit:{value:0},uDraw:{value:1e9},uLen:{value:1},
   uOpacity:{value:1},uDashed:{value:0},uHalf:{value:glow?S.glow/2:S.width/2},uOutline:{value:S.outline},uDash:{value:S.dash},uGap:{value:S.gap},uChev:{value:S.chevron},uFlow:{value:S.flow}},
  vertexShader:ribbonVS,fragmentShader:glow?glowFS:coreFS,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6,
  blending:glow?THREE.AdditiveBlending:THREE.NormalBlending});}
// "X-ray" pass: the part of a ribbon hidden behind buildings is still drawn, faintly (game-map look,
// readable from the high oblique cameras). Shares the uniforms of the visible pass.
function withXray(mesh){const m=mesh.material,x=new THREE.ShaderMaterial({uniforms:m.uniforms,vertexShader:m.vertexShader,fragmentShader:m.fragmentShader,defines:{XRAY:1},
  transparent:true,depthWrite:false,depthFunc:THREE.GreaterDepth,blending:THREE.NormalBlending});const xm=new THREE.Mesh(mesh.geometry,x);xm.renderOrder=mesh.renderOrder-1;xm.frustumCulled=false;mesh.add(xm);return mesh;}

// ─── procedural icons (no words) ───────────────────────────────────────────────
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;return t;}
const rr=(g,x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();};
function pictogram(g,kind,cx,cy,s){g.save();g.translate(cx,cy);g.scale(s/100,s/100);g.fillStyle='#fff';g.strokeStyle='#fff';g.lineCap='round';g.lineJoin='round';
 if(kind==='gate'){// train front + ticket-gate flaps below
  rr(g,-30,-46,60,62,14);g.fill();g.fillStyle='#140a1e';rr(g,-22,-38,44,22,5);g.fill();g.beginPath();g.arc(-15,2,5,0,7);g.arc(15,2,5,0,7);g.fill();
  g.fillStyle='#fff';g.lineWidth=7;g.beginPath();g.moveTo(-18,18);g.lineTo(-26,30);g.moveTo(18,18);g.lineTo(26,30);g.stroke();
  for(const x of [-40,40]){rr(g,x-7,32,14,16,3);g.fill();}g.fillRect(-28,38,20,5);g.fillRect(8,38,20,5);}
 else if(kind==='taxi'){// car front with a roof sign (shape only)
  g.beginPath();g.moveTo(-14,-46);g.lineTo(14,-46);g.lineTo(18,-34);g.lineTo(-18,-34);g.closePath();g.fill();
  g.beginPath();g.moveTo(-28,-28);g.lineTo(28,-28);g.lineTo(38,-4);g.lineTo(46,-2);g.lineTo(46,26);g.lineTo(-46,26);g.lineTo(-46,-2);g.lineTo(-38,-4);g.closePath();g.fill();
  g.fillStyle='#140a1e';g.beginPath();g.moveTo(-22,-21);g.lineTo(22,-21);g.lineTo(29,-5);g.lineTo(-29,-5);g.closePath();g.fill();g.beginPath();g.arc(-30,10,6,0,7);g.arc(30,10,6,0,7);g.fill();
  g.fillStyle='#fff';rr(g,-42,24,16,18,4);g.fill();rr(g,26,24,16,18,4);g.fill();}
 else{// walking person + arrow
  g.beginPath();g.arc(-14,-40,9,0,7);g.fill();g.lineWidth=11;g.beginPath();g.moveTo(-12,-26);g.lineTo(-18,6);g.moveTo(-18,6);g.lineTo(-30,40);g.moveTo(-18,6);g.lineTo(-4,22);g.lineTo(-6,42);
  g.moveTo(-12,-22);g.lineTo(-30,-6);g.moveTo(-12,-22);g.lineTo(2,-6);g.stroke();
  g.lineWidth=9;g.beginPath();g.moveTo(10,0);g.lineTo(40,0);g.stroke();g.beginPath();g.moveTo(48,0);g.lineTo(32,-14);g.lineTo(32,14);g.closePath();g.fill();}
 g.restore();}
function iconTexture(kind,color,marks={}){const lines=marks.lines||[],items=[...lines.map(t=>({t,line:true})),...(marks.exit?[{t:marks.exit}]:[])],H=items.length?396:300;
 const mc=document.createElement('canvas').getContext('2d');mc.font=`900 54px ${FONT}`;const ws=items.map(i=>mc.measureText(i.t).width+(i.line?26:20)),tot=ws.reduce((a,b)=>a+b,0)+8*Math.max(0,items.length-1),W=Math.max(256,Math.ceil(tot+36)),ox=(W-256)/2;
 return {tex:canvasTex(W,H,(g)=>{g.clearRect(0,0,W,H);
  g.save();g.translate(ox,0);g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=14;g.fillStyle='#140a1e';rr(g,18,14,220,220,44);g.fill();g.shadowBlur=0;
  g.lineWidth=14;g.strokeStyle=color;rr(g,18,14,220,220,44);g.stroke();
  // pointer
  g.fillStyle=color;g.beginPath();g.moveTo(104,238);g.lineTo(152,238);g.lineTo(128,H-4);g.closePath();g.fill();
  pictogram(g,kind,128,124,150);g.restore();
  if(items.length){g.font=`900 54px ${FONT}`;let x=(W-tot)/2;const y=246;
   g.save();g.fillStyle='rgba(20,10,30,.92)';rr(g,x-8,y-6,tot+16,76,14);g.fill();g.restore();
   items.forEach((it,k)=>{const w=ws[k];if(it.line){g.fillStyle='#fff';rr(g,x,y,w,64,10);g.fill();g.fillStyle='#140a1e';}else{g.strokeStyle='#fff';g.lineWidth=3;rr(g,x,y,w,64,10);g.stroke();g.fillStyle='#fff';}
    g.textAlign='center';g.textBaseline='middle';g.fillText(it.t,x+w/2,y+34);x+=w+8;});
   // move pointer below the marks
   g.clearRect(W/2-32,318,64,H-318);g.fillStyle=color;g.beginPath();g.moveTo(W/2-16,322);g.lineTo(W/2+16,322);g.lineTo(W/2,H-4);g.closePath();g.fill();}
 }),aspect:W/H,hRatio:H/236};}
function badgeTexture(outcome){return canvasTex(128,128,(g)=>{const c=outcome==='escaped'?ESCAPE_STYLE.escaped:ESCAPE_STYLE.caught;g.fillStyle=c;g.beginPath();g.arc(64,64,58,0,7);g.fill();g.lineWidth=8;g.strokeStyle='#140a1e';g.stroke();
 g.strokeStyle='#140a1e';g.lineWidth=16;g.lineCap='round';g.beginPath();if(outcome==='escaped'){g.moveTo(34,66);g.lineTo(56,88);g.lineTo(96,40);}else{g.moveTo(40,40);g.lineTo(88,88);g.moveTo(88,40);g.lineTo(40,88);}g.stroke();});}
const BADGES={};const badge=o=>BADGES[o]||(BADGES[o]=badgeTexture(o));
function spriteOf(tex,aspect,order=30){const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,color:new THREE.Color(1.15,1.15,1.15)});const s=new THREE.Sprite(m);s.center.set(.5,0);s.renderOrder=order;s.userData.aspect=aspect;s.frustumCulled=false;return s;}

// ─── DANGER heat (solver density field; heat only, people are never recoloured) ───────────────────
// Danger ramp (p/m²): transparent < 1 → amber 1–2 → orange 2–3 → RED ≥ 3 → deep red ≥ 4, with a
// slow 0.8 Hz noise "swarm shimmer" drifting over the dense cells. The layer floats at 1.3 m (waist to
// shoulder height of the crowd) so the dense cells read as a red swarm over the people (no recolouring).
export class DangerHeat{
 constructor(scene){this.w=1;this.h=1;this.tex=new THREE.DataTexture(new Uint8Array(1),1,1,THREE.RedFormat,THREE.UnsignedByteType);this.tex.magFilter=this.tex.minFilter=THREE.LinearFilter;
  this.mat=new THREE.ShaderMaterial({uniforms:{uMap:{value:this.tex},uOpacity:{value:.7},uPulse:{value:0},uFlash:{value:0},uTime:common.uTime,uOrigin:{value:new THREE.Vector2()},uSize:{value:new THREE.Vector2(1,1)},
    uAlert:{value:0},uBeat:{value:0},uAlertAt:{value:new THREE.Vector2()},uAlertR:{value:ESCAPE_STYLE.alert.radius}},
   transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,
   vertexShader:/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:/* glsl */`uniform sampler2D uMap;uniform float uOpacity,uPulse,uFlash,uTime,uAlert,uBeat,uAlertR;uniform vec2 uOrigin,uSize,uAlertAt;varying vec2 vUv;
    float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
    float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    vec3 ramp(float d){vec3 a=vec3(1.,.78,.22),b=vec3(1.,.42,.08),c=vec3(1.,.08,.12),e=vec3(.78,0.,.10);
     return d<2.?mix(a,b,clamp(d-1.,0.,1.)):d<3.?mix(b,c,d-2.):mix(c,e,clamp(d-3.,0.,1.));}
    void main(){vec2 uv=vec2(vUv.x,1.-vUv.y);float d=texture2D(uMap,uv).r*255./50.;
     vec2 w=uOrigin+uv*uSize;float sw=n2(w*.35+vec2(uTime*.7,-uTime*.5))*.6+n2(w*.9-vec2(uTime*1.3,uTime*.9))*.4;
     float shimmer=1.+.15*sin(6.2832*.8*uTime+sw*6.2832);
     float a=(smoothstep(1.,1.8,d)*.22+smoothstep(2.,3.,d)*.33+smoothstep(2.9,3.4,d)*.4)*shimmer*(.82+.3*sw*step(2.5,d));
     a*=uOpacity*(1.+.35*uPulse*(.5+.5*sin(uTime*6.2832*1.2)));
     vec3 col=ramp(d)*(1.1+.45*step(3.,d))+vec3(uFlash*1.5);
     // RED ALERT (sim density spike near the player/route): dense cells throb on the heartbeat and
     // red shock rings run outward from the hotspot through the crowd (stronger over dense cells).
     if(uAlert>0.){float r=length(w-uAlertAt),dense=smoothstep(1.2,2.6,d);
      float ring=0.;for(int k=0;k<2;k++){float R=fract(uTime*.75+float(k)*.5)*uAlertR;ring+=exp(-pow((r-R)/2.6,2.))*(1.-R/uAlertR);}
      float near=1.-smoothstep(uAlertR*.6,uAlertR,r);
      a+=uAlert*(ring*(.18+.55*dense)+near*dense*uBeat*.35)*uOpacity;
      col=mix(col,vec3(1.,.04,.07)*(1.5+1.2*uBeat),clamp(uAlert*(.35*ring+.6*uBeat*dense*near),0.,1.));}
     gl_FragColor=vec4(col,clamp(a,0.,.95));}`});
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),this.mat);this.mesh.renderOrder=3;this.mesh.frustumCulled=false;this.mesh.visible=false;scene.add(this.mesh);}
 // One heat window {x,z,w,h,cell,data} or several (merged by max on their common 3 m grid).
 set(heat){if(!heat||(Array.isArray(heat)&&!heat.length)){this.mesh.visible=false;return;}
  const list=Array.isArray(heat)?heat:[heat],cell=list[0].cell;let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  for(const H of list){x0=Math.min(x0,H.x);z0=Math.min(z0,H.z);x1=Math.max(x1,H.x+H.w*cell);z1=Math.max(z1,H.z+H.h*cell);}
  const w=Math.round((x1-x0)/cell),h=Math.round((z1-z0)/cell);let data;
  if(list.length===1)data=Uint8Array.from(list[0].data);else{data=new Uint8Array(w*h);for(const H of list){const ox=Math.round((H.x-x0)/cell),oz=Math.round((H.z-z0)/cell);for(let b=0;b<H.h;b++)for(let a=0;a<H.w;a++){const k=(oz+b)*w+ox+a,v=H.data[b*H.w+a];if(v>data[k])data[k]=v;}}}
  if(w!==this.w||h!==this.h){this.tex.dispose();this.tex=new THREE.DataTexture(data,w,h,THREE.RedFormat,THREE.UnsignedByteType);this.tex.magFilter=this.tex.minFilter=THREE.LinearFilter;this.mat.uniforms.uMap.value=this.tex;this.w=w;this.h=h;}
  else this.tex.image.data.set(data);this.tex.needsUpdate=true;
  const W=w*cell,Hh=h*cell;this.mesh.scale.set(W,1,Hh);this.mesh.position.set(x0+W/2,1.3,z0+Hh/2);this.mat.uniforms.uOrigin.value.set(x0,z0);this.mat.uniforms.uSize.value.set(W,Hh);this.mesh.visible=this.opacity>0;}
 get opacity(){return this.mat.uniforms.uOpacity.value;} set opacity(v){this.mat.uniforms.uOpacity.value=v;if(v<=0)this.mesh.visible=false;else if(this.w>1)this.mesh.visible=true;}
 set pulse(v){this.mat.uniforms.uPulse.value=v;} set flash(v){this.mat.uniforms.uFlash.value=v;}
 // Red alert: amount 0..1, heartbeat 0..1, hotspot (sim metres), ring radius (m).
 alert(amount,beat=0,x=0,z=0,radius=ESCAPE_STYLE.alert.radius){const u=this.mat.uniforms;u.uAlert.value=amount;u.uBeat.value=beat;u.uAlertAt.value.set(x,z);u.uAlertR.value=radius;}
 set visible(v){this.mesh.visible=v&&this.w>1;}
}

// ─── the escape map ────────────────────────────────────────────────────────────
export class EscapeMap{
 constructor(scene,source,opts={}){
  const levels=Array.isArray(source)?source:source?.escapeLevels||source?.levels;if(!levels?.length)throw Error('escape-scene: no levels');
  this.levels=levels;this.marks={...LINE_MARKS,...opts.lineMarks};this.group=new THREE.Group();this.group.name='escape';scene.add(this.group);
  this.heat=new DangerHeat(scene);this.L=new Map();this.current=null;this.camera=null;
  const S=ESCAPE_STYLE,pinColor=new THREE.Color(S.pin.color);
  // shared meshes
  const pinGeo=new THREE.ConeGeometry(1.25,5.2,20).rotateX(Math.PI).translate(0,2.6+.2,0),headGeo=new THREE.SphereGeometry(2.2,24,16).translate(0,6.8,0),holeGeo=new THREE.SphereGeometry(.7,16,10).translate(0,6.7,1.25);
  const ringGeo=new THREE.RingGeometry(2.3,3.1,48).rotateX(-Math.PI/2),diamondGeo=new THREE.RingGeometry(1.5,2.3,4).rotateX(-Math.PI/2),dotGeo=new THREE.CircleGeometry(1.1,4).rotateX(-Math.PI/2);
  const flat=(color,opacity=1,add=false)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8});
  const arrowShape=new THREE.Shape([[-1.5,0],[1.5,0],[0,3.2]].map(([x,y])=>new THREE.Vector2(x,y)));
  for(const lv of levels){const g=new THREE.Group();g.visible=false;this.group.add(g);const col=new THREE.Color(lv.color);
   const rec={lv,group:g,opacity:0,draw:1,lit:null,litAmount:0,pinT:null,branches:[],forks:[],outcomes:{}};
   // PLAYER START pin
   const pin=new THREE.Group();pin.position.set(lv.start.x,0,lv.start.z);
   const pinMat=new THREE.MeshBasicMaterial({color:pinColor.clone().multiplyScalar(1.6),transparent:true,depthTest:false});
   const body=new THREE.Mesh(pinGeo,pinMat),head=new THREE.Mesh(headGeo,pinMat),hole=new THREE.Mesh(holeGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthTest:false}));
   const stem=new THREE.Group();stem.add(body,head,hole);stem.children.forEach(m=>m.renderOrder=26);pin.add(stem);
   const ground=new THREE.Mesh(ringGeo,flat(pinColor.clone().multiplyScalar(1.4),.95));ground.position.y=S.y+.02;ground.renderOrder=7;pin.add(ground);
   const ripples=[0,1].map(()=>{const m=new THREE.Mesh(ringGeo,flat(pinColor.clone().multiplyScalar(1.8),0,true));m.position.y=S.y+.03;m.renderOrder=7;pin.add(m);return m;});
   pin.visible=false;this.group.add(pin);rec.pin={group:pin,stem,ground,ripples,mats:[pinMat,hole.material]};
   // Branches
   lv.branches.forEach((B,bi)=>{const p=smooth(B.path),core=ribbonGeometry(p,S.y),gm=ribbonMaterial('glow',lv.color),cm=ribbonMaterial('core',lv.color);
    cm.uniforms.uLen.value=core.length;const glow=new THREE.Mesh(core.geo,gm),line=new THREE.Mesh(core.geo,cm);glow.renderOrder=4;line.renderOrder=6;glow.frustumCulled=line.frustumCulled=false;withXray(line);g.add(glow,line);
    const br={B,bi,pts:p,len:core.length,glow,line,mats:[gm,cm],off:null,icon:null,badge:null};
    // Off-sim continuation: full segment to a nearby place (taxi stand), or a short stub toward a far station.
    if(B.offsim){const [a,b]=B.offsim,d=Math.hypot(b[0]-a[0],b[1]-a[1]),L2=B.kind==='walk-alt'?Math.min(d,S.edgeLength):d,u=L2/d,end=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
     const n=Math.max(2,Math.ceil(L2/2)),op=Array.from({length:n+1},(_,k)=>[a[0]+(end[0]-a[0])*k/n,a[1]+(end[1]-a[1])*k/n]);const og=ribbonGeometry(op,S.y);
     const om=ribbonMaterial('core',lv.color);om.uniforms.uDashed.value=1;om.uniforms.uLen.value=og.length;const mesh=new THREE.Mesh(og.geo,om);mesh.renderOrder=6;mesh.frustumCulled=false;withXray(mesh);g.add(mesh);
     let head=null;if(B.kind==='walk-alt'){head=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(Math.PI/2),flat(col.clone().multiplyScalar(1.6),1));
      head.position.set(end[0],S.y+.03,end[1]);head.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);head.renderOrder=8;g.add(head);}
     br.off={mesh,mat:om,len:og.length,end,head};}
    // Objective icon (billboard) at the target / the edge arrow of a walk to another station.
    const kind=B.kind==='walk-alt'?'walk':B.kind,tx=B.kind==='walk-alt'&&br.off?br.off.end[0]:B.target.x,tz=B.kind==='walk-alt'&&br.off?br.off.end[1]:B.target.z;
    const it=iconTexture(kind,lv.color,this.marks[lv.key]?.[B.key]||{});const icon=spriteOf(it.tex,it.aspect,30);icon.userData.hRatio=it.hRatio;icon.position.set(tx,.5,tz);icon.visible=false;g.add(icon);
    const ring=new THREE.Mesh(ringGeo,flat(col.clone().multiplyScalar(1.5),.9));ring.position.set(B.zone.x,S.y+.02,B.zone.z);ring.renderOrder=7;g.add(ring);
    const bd=spriteOf(badge('escaped'),1,31);bd.center.set(-.15,-.1);bd.visible=false;g.add(bd);
    Object.assign(br,{icon,iconAt:[tx,tz],zoneRing:ring,badge:bd,mid:pointAt(p,arc(p),core.length*.5)});
    rec.branches.push(br);});
   // Game-branch fork nodes: start node + every point where one route leaves another after a shared stretch (> 8 m).
   const nodes=[[lv.start.x,lv.start.z,0]];
   for(const a of rec.branches)for(const b of rec.branches){if(a===b)continue;const s=arc(a.pts);let at=null;for(let i=0;i<a.pts.length;i++)if(distToPath(b.pts,a.pts[i][0],a.pts[i][1])>3){at=i;break;}
    if(at!=null&&s[at]>8){const q=a.pts[Math.max(0,at-1)];if(nodes.every(n=>Math.hypot(n[0]-q[0],n[1]-q[1])>8))nodes.push([q[0],q[1],s[at]]);}}
   nodes.forEach((q,k)=>{const d=new THREE.Mesh(diamondGeo,flat(col.clone().multiplyScalar(1.7),1)),c=new THREE.Mesh(dotGeo,flat(new THREE.Color(1.6,1.6,1.6),1));
    for(const m of [d,c]){m.position.set(q[0],S.y+.05,q[1]);m.renderOrder=9;g.add(m);}rec.forks.push({id:k?`fork-${k}`:'fork-0',x:q[0],z:q[1],s:q[2],meshes:[d,c]});});
   this.L.set(lv.key,rec);}
  // Route walkers (sim agents) + the tracked player halo.
  const cap=Math.max(...levels.map(l=>l.branches.length))*64;
  const body=new THREE.CapsuleGeometry(.28,1.05,3,8).translate(0,.81,0),halo=new THREE.RingGeometry(.75,1.05,20).rotateX(-Math.PI/2).translate(0,S.y+.04,0);
  this.walkBody=new THREE.InstancedMesh(body,new THREE.MeshBasicMaterial({color:0xffffff}),cap);this.walkHalo=new THREE.InstancedMesh(halo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8}),cap);
  for(const m of [this.walkBody,this.walkHalo]){m.count=0;m.frustumCulled=false;m.setColorAt(0,new THREE.Color());this.group.add(m);}this.walkHalo.renderOrder=8;
  this.player=new THREE.Group();const pr=new THREE.Mesh(new THREE.RingGeometry(1.5,2.1,32).rotateX(-Math.PI/2),flat(new THREE.Color(S.player).multiplyScalar(2),1));pr.position.y=S.y+.06;pr.renderOrder=10;
  const pp=new THREE.Mesh(new THREE.RingGeometry(1.5,1.9,32).rotateX(-Math.PI/2),flat(new THREE.Color(S.player).multiplyScalar(2),0,true));pp.position.y=S.y+.05;pp.renderOrder=10;
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.35,12,8,1,true).translate(0,6,0),new THREE.MeshBasicMaterial({color:new THREE.Color(S.player).multiplyScalar(1.4),transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}));
  this.player.add(pr,pp,beam);this.player.userData={ring:pr,pulse:pp,beam};this.player.visible=false;this.group.add(this.player);
  // RED ALERT ground marker at the hotspot: a thick red ring + an expanding shock ring (additive, no words).
  const red=new THREE.Color(S.alert.color).multiplyScalar(2.2);this.alertMark=new THREE.Group();
  const ar=new THREE.Mesh(new THREE.RingGeometry(2.6,3.4,48).rotateX(-Math.PI/2),flat(red,0,true)),aw=new THREE.Mesh(new THREE.RingGeometry(2.9,3.3,48).rotateX(-Math.PI/2),flat(red,0,true));
  ar.position.y=S.y+.07;aw.position.y=S.y+.07;ar.renderOrder=aw.renderOrder=10;this.alertMark.add(ar,aw);this.alertMark.userData={ring:ar,wave:aw};this.alertMark.visible=false;this.group.add(this.alertMark);
  this.post=opts.post||null;this._danger={player:0,route:0,value:0,pulse:0,source:'player',x:0,z:0,set:false};this._fx={vhs:0,seed:0,vig:0,set:false,vigSet:false};this._routeCells=new Map();
  this._tmp=new THREE.Object3D();this._col=new THREE.Color();this.t=0;
 }
 rec(key){const k=ALIAS[key]||key,r=this.L.get(k);if(!r)throw Error(`escape-scene: unknown level ${key}`);return r;}
 // ---- visibility ----
 showLevel(key){for(const r of this.L.values()){r.opacity=0;r.group.visible=false;}this.current=key==null?null:this.rec(key).lv.key;
  if(key!=null){const r=this.rec(key);r.opacity=1;r.group.visible=true;if(r.pinT==null)r.pinT=Infinity;r.recommendedOnly=false;}this.refresh();}
 setScenario(id){this.showLevel(id);}
 setLevelOpacity(key,a){const r=this.rec(key);r.opacity=a;r.group.visible=a>0;this.refresh();}
 showAll({recommendedOnly=true,opacity=1}={}){for(const r of this.L.values()){r.opacity=opacity;r.group.visible=opacity>0;r.recommendedOnly=recommendedOnly;r.draw=1;if(r.pinT==null)r.pinT=Infinity;
  const rb=r.branches.find(b=>b.B.recommended);r.lit=rb?.B.key??null;r.litAmount=1;}this.current=null;this.refresh();}
 drawOn(key,p){const r=this.rec(key);r.draw=clamp(p);this.refresh();}
 highlight(key,branchKey,amount=1){const r=this.rec(key);r.lit=branchKey;r.litAmount=clamp(amount);this.refresh();}
 setBranch(branchKey,amount=1){if(this.current)this.highlight(this.current,branchKey,amount);}
 setOutcome(key,branchKey,outcome){const r=this.rec(key);r.outcomes[branchKey]=outcome||null;this.refresh();}
 dropPin(key,seconds){const r=this.rec(key);r.pinT=seconds;this.refresh();}
 hidePins(){for(const r of this.L.values())r.pinT=null;this.refresh();}
 // Staggered draw-on: branch i starts at i×0.3 of the progress; its ribbon takes 80 % of its share, then the off-sim stub, then the icon pops.
 branchProgress(r,i){const n=r.branches.length,g=n>1?.3:0,d=1-g*(n-1);return clamp((r.draw-g*i)/d);}
 refresh(){const S=ESCAPE_STYLE;
  for(const r of this.L.values()){const show=r.opacity>0;
   r.pin.group.visible=r.pinT!=null&&(show||r.pinOnly!==false);
   r.branches.forEach((br,i)=>{const u=this.branchProgress(r,i),only=r.recommendedOnly&&!br.B.recommended,vis=show&&!only&&u>0;
    const lit=r.lit==null?0:br.B.key===r.lit?r.litAmount:0;
    const [gm,cm]=br.mats;cm.uniforms.uLit.value=r.lit==null?.55:br.B.key===r.lit?.55+.45*lit:.55*(1-r.litAmount);cm.uniforms.uDashed.value=0;gm.uniforms.uLit.value=lit;
    for(const m of br.mats){m.uniforms.uOpacity.value=r.opacity;m.uniforms.uDraw.value=br.off?br.len*clamp(u/.8):br.len*clamp(u/.85);}
    br.line.visible=br.glow.visible=vis;br.zoneRing.visible=vis&&u>=.85;br.zoneRing.material.opacity=.9*r.opacity;
    if(br.off){const ou=clamp((u-.8)/.15);br.off.mesh.visible=vis&&ou>0;br.off.mat.uniforms.uDraw.value=br.off.len*ou;br.off.mat.uniforms.uLit.value=Math.max(.55,lit);br.off.mat.uniforms.uOpacity.value=r.opacity;
     if(br.off.head){br.off.head.visible=vis&&ou>=1;br.off.head.material.opacity=r.opacity;}}
    br.pop=vis?clamp((u-.85)/.15):0;br.icon.visible=br.pop>0;br.icon.material.opacity=r.opacity;
    const o=r.outcomes[br.B.key];br.badge.visible=br.icon.visible&&!!o;if(o&&br.badge.material.map!==badge(o)){br.badge.material.map=badge(o);br.badge.material.needsUpdate=true;}br.badge.material.opacity=r.opacity;});
   const anyB=r.branches.some((br,i)=>this.branchProgress(r,i)>0);
   r.forks.forEach(f=>f.meshes.forEach(m=>{m.visible=show&&anyB&&!r.recommendedOnly;m.material.opacity=r.opacity;}));}}
 // ---- sim state ----
 setPlayer(x,z,visible=true){this.player.visible=!!visible;if(visible)this.player.position.set(x,0,z);}
 setWalkers(state){const bm=this.walkBody,hm=this.walkHalo;if(!state?.walkers){bm.count=hm.count=0;return;}
  const r=this.rec(state.level),W=state.walkers,d=this._tmp,c=this._col,grey=new THREE.Color(ESCAPE_STYLE.grey),lc=new THREE.Color(r.lv.color),sc=common.uScale.value;let n=0;
  const cap=bm.instanceMatrix.count;
  for(let k=0;k<W.branch.length&&n<cap;k++){const b=W.branch[k];if(b<0)continue;const br=r.branches[b];if(!br||r.recommendedOnly&&!br.B.recommended)continue;
   const lit=r.lit==null||br.B.key===r.lit;
   d.position.set(W.x[k],0,W.z[k]);d.rotation.set(0,0,0);d.scale.set(1,1,1);d.updateMatrix();bm.setMatrixAt(n,d.matrix);
   d.scale.set(sc,1,sc);d.updateMatrix();hm.setMatrixAt(n,d.matrix);
   c.copy(lit?lc:grey).multiplyScalar(lit?1.25:.8);bm.setColorAt(n,c);c.copy(lit?lc:grey).multiplyScalar(lit?1.5:.9);hm.setColorAt(n,c);n++;}
  bm.count=hm.count=n;for(const m of [bm,hm]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}}
 setHeat(heat){this.heat.set(heat);} setHeatAlpha(a){this.heat.opacity=a;}
 applyState(state,{heat=true,walkers=true,player=true,outcomes=false,danger=true}={}){if(!state)return;
  if(heat&&state.heat)this.heat.set(state.heat);if(walkers)this.setWalkers(state);
  if(player){const p=state.player;this.setPlayer(p.x,p.z,p.walking);}
  if(outcomes)for(const b of state.branches)this.setOutcome(state.level,b.key,b.outcome);
  if(danger)this.setDanger(state,danger===true?{source:'max'}/*TMPDBG*/:danger);}
 // ---- parody RED ALERT (sim density) ----
 // Densest heat cell (p/m²) within `corridor` m of a branch's route ribbon (cached per heat window).
 routeDanger(state,branchKey=null){const H=state?.heat;if(!H)return {value:0,x:0,z:0};const r=this.rec(state.level),key=branchKey??r.lit??r.branches.find(b=>b.B.recommended)?.B.key;
  const br=r.branches.find(b=>b.B.key===key);if(!br)return {value:0,x:0,z:0};const ck=`${r.lv.key}|${key}|${H.x}|${H.z}|${H.w}|${H.h}|${H.cell}`;
  let cells=this._routeCells.get(ck);if(!cells){cells=[];const c=ESCAPE_STYLE.alert.corridor+H.cell*.71;
   for(let b=0;b<H.h;b++)for(let a=0;a<H.w;a++){const x=H.x+(a+.5)*H.cell,z=H.z+(b+.5)*H.cell;if(distToPath(br.pts,x,z)<=c)cells.push(b*H.w+a);}this._routeCells.set(ck,cells);}
  let best=0,at=-1;for(const k of cells){const v=H.data[k];if(v>best){best=v;at=k;}}
  return at<0?{value:0,x:0,z:0}:{value:best/50,x:H.x+(at%H.w+.5)*H.cell,z:H.z+(Math.floor(at/H.w)+.5)*H.cell};}
 // state = escape playback state (uses state.danger.value at the player and/or the lit route), or a
 // number (p/m²) with {x,z}. source: 'player' (default; matches the HUD DANGER meter) | 'route' | 'max'.
 // Latched per frame: if not called before the next update(), the alert falls back to 0.
 setDanger(state,{source='player',x,z,branch=null}={}){const A=ESCAPE_STYLE.alert,D=this._danger;
  if(state==null){Object.assign(D,{player:0,route:0,value:0,pulse:0,set:true});return D;}
  let pv=0,px=x??0,pz=z??0,rv=0,rx=px,rz=pz;
  if(typeof state==='number')pv=rv=state;
  else{pv=state.danger?.value??0;if(state.player){px=x??state.player.x;pz=z??state.player.z;}
   if(source!=='player'&&state.heat){const R=this.routeDanger(state,branch);rv=R.value;rx=R.x;rz=R.z;}}
  const useRoute=source==='route'||source==='max'&&rv>pv,value=useRoute?rv:pv;
  Object.assign(D,{player:pv,route:rv,value,source,x:useRoute?rx:px,z:useRoute?rz:pz,pulse:smoothstep(A.from,A.to,value),set:true});return D;}
 // Manual override (e.g. the cold open): pulse 0..1 at a hotspot (sim metres).
 setAlert(pulse,{x=0,z=0}={}){Object.assign(this._danger,{pulse:clamp(pulse),x,z,set:true});}
 get dangerPulse(){return this._danger.pulse;}          // 0..1, sim-driven (for the DOM HUD: vignette, counter shake)
 get dangerBeat(){return heartbeat(this.t);}            // 0..1 heartbeat at the current video time (sync DOM flashes)
 get danger(){const D=this._danger;return {value:D.value,player:D.player,route:D.route,source:D.source,pulse:D.pulse,x:D.x,z:D.z,beat:heartbeat(this.t),label:'simulation'};}
 // ---- post effects (fx.mjs Post): VHS / glitch and red alert vignette; both per-frame latched, default 0 ----
 attachPost(post){this.post=post;return this;}
 setVhs(amount,{seed=0}={}){this._fx.vhs=clamp(amount);this._fx.seed=seed;this._fx.set=true;}
 setAlertVignette(a){this._fx.vig=a==='auto'?'auto':clamp(a);this._fx.vigSet=true;}
 // ---- animation ----
 update(t,camera){this.t=t;common.uTime.value=t;if(camera)this.camera=camera;const S=ESCAPE_STYLE,cam=this.camera;
  // Screen-size scale: ribbons, pins and halos grow with camera height so they stay readable in the overview.
  // metres per pixel (720 p) at the ground point in the centre of the view → ribbons stay ≥ ~10 px wide.
  let sc=1;if(cam?.isPerspectiveCamera){const dir=new THREE.Vector3();cam.getWorldDirection(dir);const t0=dir.y<-1e-3?-cam.position.y/dir.y:cam.position.y*2,mpp=2*t0*Math.tan(THREE.MathUtils.degToRad(cam.fov)/2)/720;sc=clamp(mpp*13/S.width,1,6);}
  common.uScale.value=sc;
  const pxWorld=(x,z,px)=>{if(!cam)return px*.12;const d=cam.position.distanceTo(new THREE.Vector3(x,0,z)),H=cam.isPerspectiveCamera?2*d*Math.tan(THREE.MathUtils.degToRad(cam.fov)/2):(cam.top-cam.bottom)/cam.zoom;return px*H/720;};
  for(const r of this.L.values()){const P=r.pin;
   if(r.pinT!=null){const tt=r.pinT===Infinity?9:r.pinT,drop=clamp(tt/.4),y=(1-backOut(drop))*22+0;const s=sc*1.25;
    P.stem.position.y=Math.max(0,y);P.stem.scale.setScalar(s);P.stem.children.forEach(m=>{m.material.opacity=clamp(tt/.15)*(r.opacity>0?1:.85);});
    P.ground.scale.setScalar(s*clamp(drop*1.4));P.stem.rotation.y=t*1.2;
    P.ripples.forEach((m,k)=>{const u=(tt-.35-k*.3)/.9;m.visible=u>0&&u<1;m.scale.setScalar(s*(1+u*3.2));m.material.opacity=.9*(1-u);});}
   for(const f of r.forks){const p=1+.12*Math.sin(t*5);f.meshes[0].scale.setScalar(sc*p);f.meshes[1].scale.setScalar(sc);f.meshes[0].rotation.y=t*.8;}
   for(const br of r.branches){if(br.zoneRing.visible)br.zoneRing.scale.setScalar(sc*(br.B.kind==='walk-alt'?1.2:1.4));
    if(br.off?.head)br.off.head.scale.setScalar(sc*1.3);
    if(br.icon.visible){const lit=r.lit==null||br.B.key===r.lit,px=S.iconPx*(lit?1:.82)*backOut(br.pop),h=pxWorld(br.iconAt[0],br.iconAt[1],px)*br.icon.userData.hRatio;
     br.icon.scale.set(h*br.icon.userData.aspect,h,1);br.icon.position.set(br.iconAt[0],.5,br.iconAt[1]);
     if(br.badge.visible){const b=pxWorld(br.iconAt[0],br.iconAt[1],S.badgePx);br.badge.scale.set(b,b,1);br.badge.position.set(br.iconAt[0],.5+h*.62,br.iconAt[1]);br.badge.center.set(-.6,0);}}}}
  if(this.player.visible){const u=this.player.userData,ph=(t*1.4)%1;u.ring.scale.setScalar(sc);u.pulse.scale.setScalar(sc*(1+ph*1.8));u.pulse.material.opacity=1-ph;u.beam.scale.set(sc,1+.2*sc,sc);}
  // RED ALERT (latched per frame) → heat layer + ground marker; post FX (latched per frame).
  /*TMPDBG*/if(t>2&&t<4){this.setVhs(.8);}if(t>25&&t<31){this.setVhs(.35);this.setAlertVignette('auto');}
  const D=this._danger;if(!D.set)D.pulse=0;D.set=false;const beat=heartbeat(t),al=this.group.visible?D.pulse:0;
  this.heat.alert(al,beat,D.x,D.z,S.alert.radius*Math.max(1,sc*.6));
  const M=this.alertMark;M.visible=al>.01;if(M.visible){const u=M.userData,ph=(t*S.alert.bpm/60)%1;M.position.set(D.x,0,D.z);
   u.ring.scale.setScalar(sc*(1+.15*beat));u.ring.material.opacity=al*(.45+.55*beat);u.wave.scale.setScalar(sc*(1+ph*3.5));u.wave.material.opacity=al*.9*(1-ph);}
  const F=this._fx,post=this.post||Post.last;if(post?.settings?.uVhs){const st=post.settings;
   st.uVhs.value=F.set?F.vhs:0;st.uVhsSeed.value=F.seed;st.uAlertVig.value=F.vigSet?(F.vig==='auto'?al*(.35+.65*beat):F.vig):0;}
  F.set=F.vigSet=false;}
 // ---- anchors for DOM labels ----
 anchors(key=this.current){const out=[],keys=key==null?[...this.L.keys()]:[this.rec(key).lv.key];
  for(const k of keys){const r=this.L.get(k),show=r.opacity>0;const sc=common.uScale.value;
   out.push({id:'start',level:k,kind:'start',x:r.lv.start.x,y:(8.6+1.8)*sc,z:r.lv.start.z,visible:r.pinT!=null});
   r.branches.forEach((br,i)=>{const u=this.branchProgress(r,i),vis=show&&!(r.recommendedOnly&&!br.B.recommended);
    out.push({id:br.B.key,level:k,kind:'chip',x:br.mid[0],y:1,z:br.mid[1],visible:vis&&u>=.5,recommended:br.B.recommended,lit:r.lit===br.B.key});
    out.push({id:`${br.B.key}-target`,level:k,kind:br.B.kind,x:br.iconAt[0],y:.5,z:br.iconAt[1],visible:vis&&br.pop>0,iconPx:ESCAPE_STYLE.iconPx});
    if(br.off)out.push({id:`${br.B.key}-edge`,level:k,kind:'edge',x:br.off.end[0],y:.2,z:br.off.end[1],visible:vis&&clamp((u-.8)/.15)>=1,bearing:br.B.edgeBearing});});
   r.forks.forEach(f=>out.push({id:f.id,level:k,kind:'fork',x:f.x,y:.2,z:f.z,visible:show&&!r.recommendedOnly}));}
  return out;}
 // Screen positions (CSS px) of the anchors; inFrame = in front of the camera and inside the viewport.
 project(camera,width,height,key=this.current){const v=new THREE.Vector3();camera.updateMatrixWorld();
  return this.anchors(key).map(a=>{v.set(a.x,a.y,a.z).project(camera);const x=(v.x+1)/2*width,y=(1-v.y)/2*height,front=v.z<1&&v.z>-1;
   return {...a,x:Math.round(x*10)/10,y:Math.round(y*10)/10,inFrame:front&&x>=0&&x<=width&&y>=0&&y<=height};});}
 // Level bounds: start, routes, zones, off-sim stub ends.
 bounds(key,branches=null){if(key==null)return [...this.L.values()].flatMap(r=>this.bounds(r.lv.key,branches??r.branches.filter(b=>b.B.recommended).map(b=>b.B.key)));const r=this.rec(key),pts=[[r.lv.start.x,r.lv.start.z]];for(const br of r.branches){if(branches&&!branches.includes(br.B.key))continue;pts.push(...br.pts,br.iconAt);if(br.off)pts.push(br.off.end);}return pts;}
 // Camera that fits the level inside the centre column (the 9:16 crop: 960/1280 = 0.75 of the width)
 // with a 40 px margin; azimuth = compass direction the camera looks toward (0 = north).
 cameraFor(key,{aspect=16/9,fov=42,azimuth=-20,pitch=58,column=.75,margin=40,top=72,width=1280,height=720,branches=null}={}){
  const pts=this.bounds(key,branches);let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const p of pts){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
  const look=new THREE.Vector3((x0+x1)/2,0,(z0+z1)/2),cam=new THREE.PerspectiveCamera(fov,aspect,.5,5000),a=THREE.MathUtils.degToRad(azimuth),e=THREE.MathUtils.degToRad(pitch);
  const dir=new THREE.Vector3(-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));// from the look point back toward the camera
  const xMax=column-2*margin/width,yMax=1-2*(top+margin)/height,yMin=-1+2*margin/height,v=new THREE.Vector3();
  const fits=d=>{cam.position.copy(look).addScaledVector(dir,d);cam.lookAt(look);cam.updateMatrixWorld();cam.updateProjectionMatrix();
   for(const p of pts)for(const y of [0,9]){v.set(p[0],y,p[1]).project(cam);if(v.z>1||Math.abs(v.x)>xMax||v.y>yMax||v.y<yMin)return false;}return true;};
  let lo=20,hi=4000;for(let k=0;k<40;k++){const m=(lo+hi)/2;if(fits(m))hi=m;else lo=m;}
  cam.position.copy(look).addScaledVector(dir,hi);
  return {pos:cam.position.clone(),look,fov,up:new THREE.Vector3(0,1,0),distance:hi};}
 set visible(v){this.group.visible=v;this.heat.visible=v;}
 dispose(){this.group.parent?.remove(this.group);this.heat.mesh.parent?.remove(this.heat.mesh);}
}

// ─── game-map basemap (roads, JR tracks, station) + street-name anchors ─────────────────────────
// A flat, language-neutral overlay on the ground drawn from the OSM roads/railways the city already
// uses: carriageways as light bands (named main roads brighter), the above-ground JR tracks, and the
// JR station area as an outlined light band. Names are DOM labels (STREETS) placed from anchors.
export const STREETS=Object.freeze({
 '明治通り':{ja:'明治通り',en:'Meiji-dori'},'道玄坂':{ja:'道玄坂',en:'Dogenzaka'},'宮益坂':{ja:'宮益坂',en:'Miyamasuzaka'},
 '玉川通り':{ja:'玉川通り（246）',en:'Tamagawa-dori (R246)'},'文化村通り':{ja:'文化村通り',en:'Bunkamura-dori'},
 '井ノ頭通り':{ja:'井の頭通り',en:'Inokashira-dori'},'公園通り':{ja:'公園通り',en:'Koen-dori'},'渋谷センター街':{ja:'センター街',en:'Center Gai'},
 '六本木通り':{ja:'六本木通り',en:'Roppongi-dori'},'神宮通り':{ja:'神宮通り',en:'Jingu-dori'}});
// JR Shibuya station label anchor (between the Yamanote and freight tracks, OSM) and its words.
export const STATION={x:104,z:112,ja:'JR渋谷駅',en:'JR Shibuya Sta.'};
const ROAD_W={motorway:0,motorway_link:0,trunk:24,trunk_link:10,primary:20,secondary:14,secondary_link:8,tertiary:11,tertiary_link:7,unclassified:7,residential:6,service:4.5,living_street:5};
const nameOf=r=>r.tags?.name||r.name||'';
export class MapBase{
 constructor(scene,osm,{extent=900,size=2048}={}){const half=extent/2,sc=size/extent,to=(x,z)=>[(x+half)*sc,(z+half)*sc];
  const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.lineCap='round';g.lineJoin='round';
  const path=(pts)=>{g.beginPath();pts.forEach((p,k)=>{const [x,y]=to(...p);k?g.lineTo(x,y):g.moveTo(x,y);});};
  const roads=(osm?.roads||[]).filter(r=>ROAD_W[r.kind]>0&&r.tags?.footway!=='crossing'&&!(Number(r.tags?.layer)<0)&&r.tags?.tunnel!=='yes');
  // carriageways: drawn opaque on a layer, then composited once (no bright blobs where strokes overlap); named main roads brighter
  const layer=(fn,alpha)=>{const o=document.createElement('canvas');o.width=o.height=size;const q=o.getContext('2d');q.lineCap='round';q.lineJoin='round';fn(q);g.globalAlpha=alpha;g.drawImage(o,0,0);g.globalAlpha=1;};
  const pathQ=(q,pts)=>{q.beginPath();pts.forEach((p,k)=>{const [x,y]=to(...p);k?q.lineTo(x,y):q.moveTo(x,y);});};
  layer(q=>{q.strokeStyle='#0c0614';for(const r of roads){q.lineWidth=(ROAD_W[r.kind]+2.4)*sc;pathQ(q,r.points);q.stroke();}},.5);
  layer(q=>{for(const r of roads){q.strokeStyle='#5f4a86';q.lineWidth=ROAD_W[r.kind]*sc;pathQ(q,r.points);q.stroke();}},.62);
  layer(q=>{for(const r of roads){if(!STREETS[nameOf(r)])continue;q.strokeStyle='#8a72bf';q.lineWidth=ROAD_W[r.kind]*sc;pathQ(q,r.points);q.stroke();}},.5);
  // pedestrian streets (Center Gai etc.): dotted lilac
  g.setLineDash([2*sc,3*sc]);g.lineWidth=2.2*sc;g.strokeStyle='rgba(217,194,255,.5)';
  for(const r of osm?.roads||[])if(r.kind==='pedestrian'&&!(Number(r.tags?.layer)<0)){path(r.points);g.stroke();}g.setLineDash([]);
  // JR station area: union of thick strokes along the above-ground JR tracks between the Hachiko and New South ends
  const jr=(osm?.railways||[]).filter(r=>/山手/.test(r.name||'')&&!(Number(r.tags?.layer)<0));
  const clip=pts=>pts.filter(p=>p[1]>-28&&p[1]<258);
  const band=(w,color)=>{const o=document.createElement('canvas');o.width=o.height=size;const q=o.getContext('2d');q.lineCap='round';q.lineJoin='round';q.strokeStyle=color;q.lineWidth=w*sc;
   for(const r of jr){const p=clip(r.points);if(p.length<2)continue;q.beginPath();p.forEach((v,k)=>{const [x,y]=to(...v);k?q.lineTo(x,y):q.moveTo(x,y);});q.stroke();}return o;};
  const outer=band(46,'#fff'),inner=band(40,'#fff');
  const ring=document.createElement('canvas');ring.width=ring.height=size;const rq=ring.getContext('2d');rq.drawImage(outer,0,0);rq.globalCompositeOperation='destination-out';rq.drawImage(inner,0,0);
  rq.globalCompositeOperation='source-in';rq.fillStyle='rgba(255,243,226,.85)';rq.fillRect(0,0,size,size);
  const fill=document.createElement('canvas');fill.width=fill.height=size;const fq=fill.getContext('2d');fq.drawImage(inner,0,0);fq.globalCompositeOperation='source-in';fq.fillStyle='rgba(20,10,30,.45)';fq.fillRect(0,0,size,size);
  g.drawImage(fill,0,0);g.drawImage(ring,0,0);
  // all above-ground tracks: two rails + ties
  g.strokeStyle='rgba(235,225,255,.55)';for(const r of osm?.railways||[]){if(Number(r.tags?.layer)<0)continue;g.lineWidth=2.6*sc;g.setLineDash([.5*sc,1.6*sc]);path(r.points);g.stroke();g.setLineDash([]);g.lineWidth=.5*sc;path(r.points);g.stroke();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;
  this.mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(extent,extent).rotateX(-Math.PI/2),this.mat);this.mesh.position.y=.05;this.mesh.renderOrder=2;this.mesh.visible=false;this.mesh.frustumCulled=false;scene.add(this.mesh);
  // street-name candidates every 10 m along the named roads (anchor + direction)
  this.streets=[];for(const [key,words] of Object.entries(STREETS)){const pts=[];
   for(const r of osm?.roads||[]){if(nameOf(r)!==key||Number(r.tags?.layer)<0)continue;let carry=5;for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.1)continue;
     for(;carry<l;carry+=10){const t=carry/l;pts.push({x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,dx:(b[0]-a[0])/l,dz:(b[1]-a[1])/l});}carry-=l;}}
   if(pts.length)this.streets.push({key,...words,pts});}}
 set opacity(v){this.mat.opacity=v;this.mesh.visible=v>0;} get opacity(){return this.mat.opacity;}
 // Pick at most `max` street anchors for a fixed camera: inside `rect` (CSS px of a W×H view), ≥ `clear`
 // px from every point in `avoid` (projected routes/pins/icons) and ≥ 150 px from each other; the
 // candidate closest to the rect centre wins per street. Deterministic (fitted level camera).
 pick(camera,{W=1280,H=720,rect,avoid=[],clear=46,max=4}={}){const v=new THREE.Vector3(),P=(x,z)=>{v.set(x,0,z).project(camera);return v.z<1?[(v.x+1)/2*W,(1-v.y)/2*H]:null;};
  const A=avoid.map(([x,z])=>P(x,z)).filter(Boolean),cx=(rect.x0+rect.x1)/2,cy=(rect.y0+rect.y1)/2,out=[];
  const ranked=this.streets.map(st=>{let best=null;for(const p of st.pts){const q=P(p.x,p.z);if(!q||q[0]<rect.x0+40||q[0]>rect.x1-40||q[1]<rect.y0+14||q[1]>rect.y1-14)continue;
    let dmin=Infinity;for(const a of A)dmin=Math.min(dmin,Math.hypot(a[0]-q[0],a[1]-q[1]));if(dmin<clear)continue;const sc=Math.hypot(q[0]-cx,(q[1]-cy)*1.4);if(!best||sc<best.sc)best={...p,sc,q};}
   return best&&{key:st.key,ja:st.ja,en:st.en,...best};}).filter(Boolean).sort((a,b)=>a.sc-b.sc);
  for(const s of ranked){if(out.length>=max)break;if(out.every(o=>Math.hypot(o.q[0]-s.q[0],o.q[1]-s.q[1])>150))out.push(s);}
  return out.map(({q,sc,...s})=>s);}
}
export function createEscapeScene(scene,source,opts={}){return new EscapeMap(scene,source,opts);}
