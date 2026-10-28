// JR v8 sim map layer (browser): the crowd-density HEAT MAP (DangerHeat style: amber → red, p/m², 4.0 cap) and the
// AGENTS (route walkers as coloured dots, a 1/12 sample of the crowd as faint dots) of a precomputed solver run
// (tools/v8_sim.mjs frames), drawn on a 2D canvas between the WebGL view and the DOM HUD, through the camera of the
// beat (routemap map mode: buildings flattened → the ground plane is what you see). Nothing here invents a number:
// colours come from the 3 m cell densities (count / standable m²) of the keyframe, positions from the agents.
//
// const L = createSimLayer(document.body, {W:720, H:1280, dpr:1.5});
// L.update(spec|null, {simT, frames, project:(x,y,z)=>{x,y,inFrame}, t})
//   spec = beat.simmap: {scenario, routes:[keys], colors:{key:'#hex'}, player?:key, freeze?:simT, bbox?:[x0,z0,x1,z1],
//          heat?:1, crowd?:true, pulse?:[x,z] (ring at the failing spot), dim?:[keys] (routes drawn faint)}
// frames = {grid:{x0,z0,cell,w,h,area:Uint8Array}, routeKeys, frames:[{t, grid:Uint8Array, walkers:{route,x,z}, crowd:{x2,z2}}]}
import {V9_COSTUMES,classOf,paletteOf} from './costumes-v9.mjs';
const RAMP=[[0,[255,210,90,0]],[.35,[255,205,80,0]],[1,[255,190,60,.5]],[2,[255,135,30,.72]],[3,[255,55,45,.86]],[4,[255,25,110,.95]]];
export function heatColor(rho){if(rho<=RAMP[0][0])return RAMP[0][1];for(let i=1;i<RAMP.length;i++){const [v,c]=RAMP[i];if(rho<=v){const [v0,c0]=RAMP[i-1],k=(rho-v0)/(v-v0);return c0.map((a,j)=>a+(c[j]-a)*k);}}return RAMP.at(-1)[1];}
const b64=s=>{const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;};
export function decodeFrames(raw){const G={...raw.grid,area:typeof raw.grid.area==='string'?b64(raw.grid.area):raw.grid.area};
 return {...raw,grid:G,frames:raw.frames.map(f=>({...f,grid:typeof f.grid==='string'?b64(f.grid):f.grid}))};}
const DOT={};function dotColor(id){const k=classOf(id),j=paletteOf(id),key=k*8+j;if(DOT[key])return DOT[key];const C=V9_COSTUMES.classes[k],pal=C.palettes[j];
 const lum=h=>{const v=parseInt(h.slice(1),16);return .3*((v>>16)&255)+.59*((v>>8)&255)+.11*(v&255);};const best=[...pal].sort((a,b)=>lum(b)-lum(a))[0],[R,G,B]=hexRGB(best);
 return DOT[key]={key:C.key,css:`rgba(${R},${G},${B},.8)`};}
const hexRGB=h=>{const v=parseInt(String(h).replace('#',''),16);return [(v>>16)&255,(v>>8)&255,v&255];};

export function createSimLayer(parent,{W=720,H=1280,dpr=1.5,z=40}={}){
 const cv=document.createElement('canvas');cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 Object.assign(cv.style,{position:'fixed',left:'0',top:'0',width:W+'px',height:H+'px',zIndex:String(z),pointerEvents:'none'});cv.id='simlayer';parent.append(cv);
 const g=cv.getContext('2d');const heat=document.createElement('canvas');heat.width=Math.round(W*dpr/2);heat.height=Math.round(H*dpr/2);const hg=heat.getContext('2d');
 let shown=false;
 function frameAt(F,simT){const L=F.frames;if(!L.length)return [null,null,0];const dt=(L.at(-1).t-L[0].t)/Math.max(1,L.length-1)||1;const u=(simT-L[0].t)/dt,i=Math.max(0,Math.min(L.length-1,Math.floor(u)));
  return [L[i],L[Math.min(L.length-1,i+1)],Math.max(0,Math.min(1,u-i))];}
 function update(spec,{simT=0,frames=null,project,t=0}={}){
  if(!spec||!frames){if(shown){g.clearRect(0,0,cv.width,cv.height);shown=false;}cv.style.display='none';return null;}
  cv.style.display='block';shown=true;g.clearRect(0,0,cv.width,cv.height);
  const T=spec.freeze??simT,[A,B,k]=frameAt(frames,T),G=frames.grid,s=dpr;const P=(x,z)=>project(x,.4,z);
  const stats={cells:0,peak:0,walkers:0,crowd:0,simT:T};if(!A)return stats;
  // heat: per 3 m cell density of the keyframe (blend to the next one for smooth motion), polygons on a half-res canvas, blurred
  if(spec.heat!==0){hg.clearRect(0,0,heat.width,heat.height);const bb=spec.bbox||[G.x0,G.z0,G.x0+G.w*G.cell,G.z0+G.h*G.cell];
   const a0=Math.max(0,Math.floor((bb[0]-G.x0)/G.cell)),a1=Math.min(G.w,Math.ceil((bb[2]-G.x0)/G.cell)),b0=Math.max(0,Math.floor((bb[1]-G.z0)/G.cell)),b1=Math.min(G.h,Math.ceil((bb[3]-G.z0)/G.cell));
   const hs=heat.width/W;
   for(let b=b0;b<b1;b++)for(let a=a0;a<a1;a++){const c=b*G.w+a,ar=G.area[c];if(ar<4)continue;const n=A.grid[c]*(1-k)+(B?B.grid[c]:A.grid[c])*k;if(!n)continue;const rho=n/ar;
    if(rho<.35)continue;const col=heatColor(rho);stats.cells++;if(rho>stats.peak)stats.peak=rho;
    const x0=G.x0+a*G.cell,z0=G.z0+b*G.cell,q=[P(x0,z0),P(x0+G.cell,z0),P(x0+G.cell,z0+G.cell),P(x0,z0+G.cell)];if(!q.some(p=>p.inFrame))continue;
    hg.fillStyle=`rgba(${col[0]|0},${col[1]|0},${col[2]|0},${col[3].toFixed(3)})`;hg.beginPath();hg.moveTo(q[0].x*hs,q[0].y*hs);for(let j=1;j<4;j++)hg.lineTo(q[j].x*hs,q[j].y*hs);hg.closePath();hg.fill();}
   g.save();g.globalAlpha=spec.heat??1;g.filter=`blur(${(2*s).toFixed(1)}px)`;g.drawImage(heat,0,0,cv.width,cv.height);g.filter='none';g.globalCompositeOperation='lighter';g.globalAlpha=.35*(spec.heat??1);g.drawImage(heat,0,0,cv.width,cv.height);g.restore();}
  // crowd sample: faint dots (positions of the keyframe, half-metre units)
  // v9 (spec.costumes): every sampled person is drawn in the brightest colour of their costume class (costumes-v9.mjs, by
  // agent id) as a slightly larger dot → the map crowd reads as a chaotic costume crowd; positions are still the solver's.
  if(spec.crowd!==false&&A.crowd){const X=A.crowd.x2,Z=A.crowd.z2,I=A.crowd.id;const cos=spec.costumes&&I;g.fillStyle='rgba(235,225,255,.55)';const r=cos?1.9:1.2;
   if(cos)stats.costumes={};
   for(let i=0;i<X.length;i++){const p=P(X[i]/2,Z[i]/2);if(!p.inFrame)continue;if(cos){const c=dotColor(I[i]);g.fillStyle=c.css;stats.costumes[c.key]=(stats.costumes[c.key]||0)+1;}g.fillRect(p.x*s-r,p.y*s-r,2*r,2*r);stats.crowd++;}}
  // route walkers: coloured dots (interpolated between keyframes for motion only), the player with a halo
  const idx=Object.fromEntries((frames.routeKeys||[]).map((key,i)=>[key,i])),show=new Set(spec.routes||[]),dim=new Set(spec.dim||[]);
  const W0=A.walkers,W1=B?.walkers||W0;const firstOf={};
  for(let j=0;j<W0.route.length;j++){const r=W0.route[j];if(r<0)continue;const key=frames.routeKeys[r];if(!show.has(key))continue;
   const x=W1.route[j]===r?W0.x[j]+(W1.x[j]-W0.x[j])*k:W0.x[j],z=W1.route[j]===r?W0.z[j]+(W1.z[j]-W0.z[j])*k:W0.z[j];const p=P(x,z);if(!p.inFrame)continue;
   const [R,Gc,Bc]=hexRGB(spec.colors?.[key]??'#FFFFFF'),al=dim.has(key)?.35:1;stats.walkers++;
   g.fillStyle=`rgba(${R},${Gc},${Bc},${(.35*al).toFixed(2)})`;g.beginPath();g.arc(p.x*s,p.y*s,9*s/1.5,0,7);g.fill();
   g.fillStyle=`rgba(${R},${Gc},${Bc},${al})`;g.beginPath();g.arc(p.x*s,p.y*s,4.6*s/1.5,0,7);g.fill();g.strokeStyle=`rgba(10,6,16,${(.8*al).toFixed(2)})`;g.lineWidth=1.2*s/1.5;g.stroke();
   if(spec.player===key&&firstOf[key]==null){firstOf[key]=j;const ph=.5+.5*Math.sin(t*6);g.strokeStyle=`rgba(255,255,255,${(.6+.4*ph).toFixed(2)})`;g.lineWidth=2*s/1.5;g.beginPath();g.arc(p.x*s,p.y*s,(11+4*ph)*s/1.5,0,7);g.stroke();}}
  // the failing spot: pulsing red ring (retry "why it failed")
  if(spec.pulse){const p=P(spec.pulse[0],spec.pulse[1]);if(p.inFrame){for(let i=0;i<2;i++){const u=((t*1.2+i*.5)%1);g.strokeStyle=`rgba(255,60,110,${(1-u).toFixed(3)})`;g.lineWidth=3*s/1.5;g.beginPath();g.arc(p.x*s,p.y*s,(14+46*u)*s/1.5,0,7);g.stroke();}}}
  return stats;}
 return {canvas:cv,update};}
