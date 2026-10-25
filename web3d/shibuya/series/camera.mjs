// Camera rigs for the series (JR編 pilot): aerial overhead orbit, close top-down, pedestrian eye-level
// path follow (1.6 m, gait bob, look-ahead, collision-free along OSM footways), interior dolly, and an
// aerial route-map framing. Every rig is a pure function of local time t (seconds) → shot, in the
// shape app.mjs placeCamera(shot) expects: {pos:Vector3, look:Vector3, up:Vector3, fov, fade, trail,
// speed, capAlpha, name}. Deterministic (no wall clock, no randomness).
//
// API (coordinates: sim metres, x east, z south, y up):
//   aerialOrbit({center=[86,0,53] (episodes.md: 35.6590,139.7015), radius=400, height=300, yaw0=-.75, yawSpeed=.045, fov=40, lookY=10}) → t => shot
//   closeTopDown({center=[12,0,26] (Scramble station side + Hachiko Square), height=55, rot0=0, rotSpeed=.012, drift=[0,0], fov=42, tilt=0})       → t => shot
//       tilt (rad) leans the view off pure nadir toward -z (0 = straight down)
//   eyeLevel({path, speed=1.3, height=1.6, bob=.028, sway=.018, stepHz=1.9, lookAhead=7, lookDrop=.12,
//             fov=56, s0=0, smoothYaw=4})                                                             → t => shot (+ shot.s, shot.at:[x,z], shot.done)
//   interiorDolly(keys=[{t,pos:[x,y,z],look:[x,y,z],fov}])                                             → t => shot (Catmull-Rom, eased)
//   routeMap({bounds:[x0,z0,x1,z1], azimuth=-12, pitch=58, fov=40, aspect=9/16, pad=.08, push=.06, dur=8, rect}) → t => shot
//       (shot.far = needed camera far plane; app.mjs's camera far is 5000 — set camera.far = shot.far for map shots)
//   fitView({points:[[x,z]...], azimuth, pitch, fov, aspect, pad, y=0}) → {pos, look, fov, distance}
//   walkRoute(osm, from:[x,z], to:[x,z], {insideBuilding?, clearance=.9, avoid?:[{x,z,r,cost}]})
//       → {points:[[x,z]...] (0.5 m resampled, smoothed, pushed ≥clearance off PLATEAU footprints), metres, osmMetres}
//       Dijkstra on the bundled OSM surface network (footways/steps/crossings preferred; carriageways ×1.6).
//   JR_WALKS     JR pilot walks: 'hachiko' = research route JR-A (Scramble → Hachiko square → koban → passage
//                under the tracks, U-turn at Miyamasuzaka-shita → gate line), 'hachikoShort', 'scramble'
//   jrWalkPath(osm, name='hachiko', {insideBuilding}) → {points, metres, waypoints:[{n,x,z,s}], label}
//                (s = distance along the path where research waypoint n is passed: drive landmark captions)
//   smoothPath(points, {radius, insideBuilding, clearance})  rounded corners + 0.5 m resample + footprint push
//   blend(a, b, k)  shot interpolation (pos/look lerp, fov lerp) for cross-cuts / transitions
//   makeShot(pos, look, {fov, up, name})  / applyShot(camera, shot)
import * as THREE from '../../vendor/three.module.min.js';

const V=(a)=>a.isVector3?a.clone():new THREE.Vector3(a[0],a[1],a[2]);
export function makeShot(pos,look,{fov=45,up=[0,1,0],name='series'}={}){return {pos:V(pos),look:V(look),up:V(up),fov,fade:1,trail:0,speed:1,capAlpha:0,name};}
export function applyShot(camera,shot){if(shot.far&&camera.far!==shot.far)camera.far=shot.far;camera.position.copy(shot.pos);camera.up.copy(shot.up);camera.fov=shot.fov;camera.lookAt(shot.look);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
export function blend(a,b,k){const s=makeShot(a.pos.clone().lerp(b.pos,k),a.look.clone().lerp(b.look,k),{fov:a.fov+(b.fov-a.fov)*k,name:k<.5?a.name:b.name});s.up=a.up.clone().lerp(b.up,k).normalize();return s;}
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

// ---------- aerial overhead orbit ----------
export function aerialOrbit({center=[86,0,53],radius=400,height=300,yaw0=-.75,yawSpeed=.045,fov=40,lookY=10,name='aerial-orbit'}={}){
 return t=>{const a=yaw0+yawSpeed*t;return makeShot([center[0]+Math.sin(a)*radius,height,center[2]+Math.cos(a)*radius],[center[0],lookY,center[2]],{fov,name});};}

// ---------- close top-down ----------
export function closeTopDown({center=[12,0,26],height=55,rot0=0,rotSpeed=.012,drift=[0,0],fov=42,tilt=0,name='top-down'}={}){
 return t=>{const r=rot0+rotSpeed*t,cx=center[0]+drift[0]*t,cz=center[2]+drift[1]*t;const up=[Math.sin(r),0,-Math.cos(r)];
  const off=Math.tan(tilt)*height;return makeShot([cx-up[0]*off,height,cz-up[2]*off],[cx,0,cz],{fov,up,name});};}

// ---------- eye-level path follow ----------
function cumulative(path){const c=[0];for(let i=1;i<path.length;i++)c.push(c[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));return c;}
function sampleAt(path,cum,s){s=clamp(s,0,cum.at(-1));let lo=0,hi=cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(cum[m]<=s)lo=m;else hi=m;}const t=(s-cum[lo])/((cum[hi]-cum[lo])||1);return [path[lo][0]+(path[hi][0]-path[lo][0])*t,path[lo][1]+(path[hi][1]-path[lo][1])*t,path[lo][2]!=null?path[lo][2]+((path[hi][2]??path[lo][2])-path[lo][2])*t:0];}
export function eyeLevel({path,speed=1.3,height=1.6,bob=.028,sway=.018,stepHz=1.9,lookAhead=7,lookDrop=.12,fov=56,s0=0,smoothYaw=4,name='eye-level'}={}){
 const cum=cumulative(path),total=cum.at(-1);
 return t=>{const s=Math.min(total,s0+speed*t),done=s>=total;const p=sampleAt(path,cum,s);
  // heading: average direction over a window ahead (smooth turns, no snapping at polyline corners)
  let hx=0,hz=0;for(let k=1;k<=6;k++){const q=sampleAt(path,cum,s+lookAhead*k/6),b=sampleAt(path,cum,s-smoothYaw*.25+smoothYaw*(k-1)/12);hx+=q[0]-b[0];hz+=q[1]-b[1];}
  const hl=Math.hypot(hx,hz)||1;hx/=hl;hz/=hl;
  const walking=done?0:1,ph=2*Math.PI*stepHz*t;const y=(p[2]||0)+height+bob*walking*Math.sin(ph)+.004;
  const lat=sway*walking*Math.sin(ph/2);const px=p[0]-hz*lat,pz=p[1]+hx*lat;
  const sh=makeShot([px,y,pz],[px+hx*lookAhead,(p[2]||0)+height-lookDrop*lookAhead/7+bob*.3*walking*Math.sin(ph-.6),pz+hz*lookAhead],{fov,name});sh.s=s;sh.at=[p[0],p[1]];sh.done=done;sh.total=total;return sh;};}

// ---------- interior dolly ----------
export function interiorDolly(keys,{name='interior'}={}){
 const P=keys.map(k=>V(k.pos)),L=keys.map(k=>V(k.look));const cr=(arr,i,u)=>{const p0=arr[Math.max(0,i-1)],p1=arr[i],p2=arr[Math.min(arr.length-1,i+1)],p3=arr[Math.min(arr.length-1,i+2)];
  const u2=u*u,u3=u2*u;return new THREE.Vector3().addScaledVector(p0,-.5*u3+u2-.5*u).addScaledVector(p1,1.5*u3-2.5*u2+1).addScaledVector(p2,-1.5*u3+2*u2+.5*u).addScaledVector(p3,.5*u3-.5*u2);};
 return t=>{if(t<=keys[0].t)return makeShot(P[0],L[0],{fov:keys[0].fov,name});const n=keys.length-1;if(t>=keys[n].t)return makeShot(P[n],L[n],{fov:keys[n].fov,name});
  let i=0;while(i<n-1&&t>keys[i+1].t)i++;const u=(t-keys[i].t)/(keys[i+1].t-keys[i].t),e=u*.75+ease(u)*.25;
  return makeShot(cr(P,i,e),cr(L,i,e),{fov:keys[i].fov+(keys[i+1].fov-keys[i].fov)*e,name});};}

// ---------- fit a set of ground points into the frame ----------
export function fitView({points,azimuth=-12,pitch=58,fov=40,aspect=9/16,pad=.08,y=0,rect=null}){
 let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of points){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
 const look=new THREE.Vector3((x0+x1)/2,y,(z0+z1)/2),a=THREE.MathUtils.degToRad(azimuth),e=THREE.MathUtils.degToRad(pitch);
 const dir=new THREE.Vector3(-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)),cam=new THREE.PerspectiveCamera(fov,aspect,.5,1e6),v=new THREE.Vector3();
 const R=rect??{x0:pad,x1:1-pad,y0:pad,y1:1-pad};
 const fits=d=>{cam.position.copy(look).addScaledVector(dir,d);cam.lookAt(look);cam.updateMatrixWorld();cam.updateProjectionMatrix();
  for(const p of points){v.set(p[0],y,p[1]).project(cam);const sx=(v.x+1)/2,sy=(1-v.y)/2;if(v.z>1||sx<R.x0||sx>R.x1||sy<R.y0||sy>R.y1)return false;}return true;};
 let lo=10,hi=20000;for(let k=0;k<44;k++){const m=(lo+hi)/2;if(fits(m))hi=m;else lo=m;}
 // re-centre on the target rect centre
 cam.position.copy(look).addScaledVector(dir,hi);cam.lookAt(look);cam.updateMatrixWorld();
 const H=2*hi*Math.tan(THREE.MathUtils.degToRad(fov)/2),W=H*aspect;const cx=(R.x0+R.x1)/2-.5,cy=(R.y0+R.y1)/2-.5;
 const right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
 const off=right.multiplyScalar(-cx*W).add(up.multiplyScalar(cy*H));
 return {pos:cam.position.clone().add(off),look:look.clone().add(off),fov,distance:hi};}

// ---------- aerial route-map ----------
export function routeMap({bounds,points=null,azimuth=-12,pitch=58,fov=40,aspect=9/16,pad=.08,push=.06,dur=8,rect=null,name='route-map'}){
 const pts=points??[[bounds[0],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[2],bounds[1]]];const f=fitView({points:pts,azimuth,pitch,fov,aspect,pad,rect});
 return t=>{const k=push*ease(clamp(t/dur));const sh=makeShot(f.pos.clone().lerp(f.look,k),f.look,{fov,name});sh.far=Math.max(5000,f.distance*2.2);sh.distance=f.distance;return sh;};}

// ---------- OSM walking routes ----------
const FOOTISH=new Set(['footway','pedestrian','path','steps','living_street','cycleway','elevator']);
export function walkRoute(osm,from,to,{insideBuilding=null,clearance=.9,avoid=[],allowIndoor=false}={}){
 const nodes=new Map(),adj=new Map();const key=id=>id;
 for(const r of osm.roads){const L=Number(r.tags.layer||0);if(!allowIndoor&&(r.tags.indoor==='yes'||r.tags.tunnel==='yes'||L<0||r.tags.level&&!/^(0|1)$/.test(r.tags.level)))continue;
  if(['motorway','motorway_link','trunk_link'].includes(r.kind))continue;if(r.kind==='elevator')continue;
  const w=FOOTISH.has(r.kind)||r.tags.footway==='crossing'?1:1.6;
  for(let k=0;k<r.points.length;k++){const id=r.nodes?.[k]??`${r.id}:${k}`;nodes.set(id,r.points[k]);if(k){const a=r.nodes?.[k-1]??`${r.id}:${k-1}`;const p=r.points[k-1],q=r.points[k];let len=Math.hypot(q[0]-p[0],q[1]-p[1]);
    let c=len*w;for(const A of avoid){const mx=(p[0]+q[0])/2,mz=(p[1]+q[1])/2;if(Math.hypot(mx-A.x,mz-A.z)<A.r)c*=A.cost??3;}
    if(!adj.has(a))adj.set(a,[]);if(!adj.has(id))adj.set(id,[]);adj.get(a).push([id,c,len]);adj.get(id).push([a,c,len]);}}}
 const nearest=p=>{let best=null,bd=1e9;for(const [id,q] of nodes){if(!adj.has(id))continue;const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<bd){bd=d;best=id;}}return best;};
 const s=nearest(from),g=nearest(to);const dist=new Map([[s,0]]),prev=new Map(),done=new Set();const open=[[0,s]];
 while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(open[i][0]<open[bi][0])bi=i;const [d,u]=open.splice(bi,1)[0];if(done.has(u))continue;done.add(u);if(u===g)break;
  for(const [v,c] of adj.get(u)||[]){const nd=d+c;if(nd<(dist.get(v)??Infinity)){dist.set(v,nd);prev.set(v,u);open.push([nd,v]);}}}
 const chainIds=[];for(let u=g;u!=null;u=prev.get(u)){chainIds.push(u);if(u===s)break;}chainIds.reverse();
 let pts=[from,...chainIds.map(id=>nodes.get(id)),to].map(p=>[p[0],p[1]]);
 let osmMetres=0;for(let i=1;i<pts.length;i++)osmMetres+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
 // Chaikin ×2, resample 0.5 m, push off footprints, light moving-average
 for(let it=0;it<2;it++){const o=[pts[0]];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}o.push(pts.at(-1));pts=o;}
 const cum=cumulative(pts),out=[];for(let s2=0;s2<cum.at(-1);s2+=.5){const p=sampleAt(pts,cum,s2);out.push([p[0],p[1]]);}out.push(pts.at(-1));
 if(insideBuilding){for(const p of out){for(let it=0;it<12&&insideBuilding(p[0],p[1],clearance);it++){// push toward the most open direction
    let best=null,bd=-1;for(let a=0;a<16;a++){const dx=Math.cos(a*Math.PI/8),dz=Math.sin(a*Math.PI/8);let free=0;for(let r=.25;r<=3;r+=.25){if(insideBuilding(p[0]+dx*r,p[1]+dz*r,clearance))break;free=r;}if(free>bd){bd=free;best=[dx,dz];}}
    p[0]+=best[0]*.3;p[1]+=best[1]*.3;}}}
 for(let it=0;it<3;it++)for(let i=1;i<out.length-1;i++){out[i][0]=(out[i-1][0]+out[i][0]*2+out[i+1][0])/4;out[i][1]=(out[i-1][1]+out[i][1]*2+out[i+1][1])/4;}
 const metres=cumulative(out).at(-1);return {points:out,metres,osmMetres};}

// JR pilot walks. 'hachiko' = research route JR-A (alt-routes.json pilot_routes['JR-A-hachiko'], hand-traced on
// OSM sidewalks; waypoints n=1..9 outdoors to the gate line, 10..11 inside = station-jr dolly). Points are the
// waypoint lat/lon converted to sim metres (x=(lon-139.70055)*111320*cos(35.65948°), z=-(lat-35.65948)*111320).
// The U-turn follows the reported one-way divider (2025-01-27) — copy/fact ids belong to the overlay.
export const JR_WALKS={
 hachiko:{label:'Scramble → Hachiko square → koban → passage under the tracks (north lane east, U-turn, south lane west) → JR Hachiko gate',
  waypoints:[[1,1.8,0],[2,22.6,36.7],[3,44.3,17.8],[4,49.7,-6.7],[5,100.4,-6.7],[6,144.7,-10],[7,145.6,7.8],[8,108.5,11.1],[9,85.9,14.6]],gate:'hachiko',source:'alt-routes.json JR-A-hachiko'},
 // shortcut variant for a short eye-level shot: Hachiko square → koban → straight to the gate (ignores the one-way U-turn)
 hachikoShort:{label:'Hachiko square → koban → JR Hachiko gate (short shot; ignores the reported one-way U-turn)',
  waypoints:[[2,22.6,36.7],[3,44.3,17.8],[4,52,9],[8,70,12.2],[9,85.9,14.6]],gate:'hachiko',source:'alt-routes.json JR-A-hachiko (subset)'},
 scramble:{label:'Scramble (Center Gai side) → Hachiko square (Dijkstra on OSM)',from:[-22,-6],to:[40,24],gate:'hachiko'},
};
// Smooth a waypoint polyline (rounded corners of radius ≤ r), resample 0.5 m, push off footprints.
export function smoothPath(points,{radius=4,insideBuilding=null,clearance=.8}={}){
 let pts=points.map(p=>[p[0],p[1]]);const out=[pts[0]];
 for(let i=1;i<pts.length-1;i++){const a=pts[i-1],b=pts[i],c=pts[i+1];const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);const r=Math.min(radius,l1*.45,l2*.45);
  const p0=[b[0]+(a[0]-b[0])*r/l1,b[1]+(a[1]-b[1])*r/l1],p1=[b[0]+(c[0]-b[0])*r/l2,b[1]+(c[1]-b[1])*r/l2];
  for(let k=0;k<=8;k++){const t=k/8,u=1-t;out.push([u*u*p0[0]+2*u*t*b[0]+t*t*p1[0],u*u*p0[1]+2*u*t*b[1]+t*t*p1[1]]);}}
 out.push(pts.at(-1));const cum=cumulative(out),res=[];for(let s=0;s<cum.at(-1);s+=.5){const p=sampleAt(out,cum,s);res.push([p[0],p[1]]);}res.push(out.at(-1));
 if(insideBuilding)for(const p of res)for(let it=0;it<12&&insideBuilding(p[0],p[1],clearance);it++){let best=[0,0],bd=-1;for(let a=0;a<16;a++){const dx=Math.cos(a*Math.PI/8),dz=Math.sin(a*Math.PI/8);let free=0;for(let r=.25;r<=3;r+=.25){if(insideBuilding(p[0]+dx*r,p[1]+dz*r,clearance))break;free=r;}if(free>bd){bd=free;best=[dx,dz];}}p[0]+=best[0]*.3;p[1]+=best[1]*.3;}
 return res;}
// → {points, metres, waypoints:[{n, x, z, s}], label}
export function jrWalkPath(osm,name='hachiko',{insideBuilding=null}={}){const W=JR_WALKS[name];
 if(!W.waypoints){const r=walkRoute(osm,W.from,W.to,{insideBuilding});return {...r,waypoints:[],label:W.label};}
 const pts=smoothPath(W.waypoints.map(w=>[w[1],w[2]]),{insideBuilding});const cum=cumulative(pts);
 const waypoints=W.waypoints.map(([n,x,z])=>{let best=0,bd=1e9;pts.forEach((p,i)=>{const d=Math.hypot(p[0]-x,p[1]-z);if(d<bd){bd=d;best=i;}});return {n,x,z,s:cum[best]};});
 return {points:pts,metres:cum.at(-1),outdoorMetres:cum.at(-1),waypoints,label:W.label,source:W.source};}
