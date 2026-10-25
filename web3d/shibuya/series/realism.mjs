// Series realism layer: realistic night Shibuya on top of city.mjs (buildCity) for the line-by-line
// "escape" series (JR編 pilot). Everything is procedural from the bundled open data; no textures,
// logos, brand names or words are drawn here (shop fronts are signage-free; the base city's generic
// category-word signs stay as they are).
//
// Data: PLATEAU 2023 Shibuya LOD2 boundary surfaces (web3d/data/shibuya_plateau_lod2.json, CC BY 4.0,
// fetched by tools/fetch_plateau_lod2.py) replace the LOD1 extrusions at FULL height (no map cap);
// OSM (ODbL) roads/rails drive lamps, kerbs, crosswalk stripes, tactile paving and the JR viaduct.
//
// API (coordinates: sim metres, x east, z south, y up; origin = Scramble centre):
//   const lod2 = await loadLod2(url?)                       fetch shibuya_plateau_lod2.json (or null on failure)
//   const R = applyRealism({scene, city, shared, post, osm, plateau, lod2, sky?, options?})
//       options: {lod2:true, lamps:true, shopfronts:true, ground:true, viaduct:true, skyGlow:true,
//                 skyline:true (procedural far skyline ring), skylineAvoid:[x0,z0,x1,z1] (no procedural boxes there;
//                 pass wide-area.mjs W.bounds so the real OSM context and the ring do not overlap),
//                 look:'night'|'keep', radius:380 (detail radius for shop fronts/kerbs),
//                 hoarding:[x,z]|null (white temporary panels around the Hachiko statue, MEAS-06; default city.mjs statue spot),
//                 exclude:[[x0,z0,x1,z1]] rects without shop fronts (default: the JR Hachiko paid concourse of station-jr.mjs)}
//     R.group                 THREE.Group with every added mesh
//     R.update(t, camera)     per frame (lamp halo billboards, shop flicker); cheap
//     R.setInterior(on, {keepCity=true})  (idempotent) inside the station: hides the station-shell buildings (PLATEAU
//                             masses overlapping the concourse); keepCity:false also hides the whole outdoor city
//                             (buildings, signs, screens, sky glow, lamps; cheaper, but the gate line then looks onto black)
//     R.shell                 the station-shell mesh (LOD2 buildings overlapping options.exclude)
//     R.setDetail(level)      'aerial' (hides kerbs/stripes/halos: invisible from >150 m) | 'street' (all)
//     R.stats                 {lod2Buildings, lod2Triangles, lamps, halos, shopBays, stripes, kerbs, tactile, piers}
//     R.lampPositions         [[x,z], ...] pedestrian lamps (for other layers)
//     R.roadMask(x,z)         true on carriageway asphalt (rasterised from OSM at 0.5 m)
//     R.insideBuilding(x,z, margin=0)   point-in-footprint test against PLATEAU LOD1 rings (spatial hash)
//   nightLook({shared, post})                                 realistic (non-Halloween) night grade
//   buildLod2Geometry(lod2) → {geometry, buildings, triangles}  same attributes as city.mjs (position,
//                                                             normal, aFacade) so city's building material is reused
//   JR_TRACK_Y = 7.0          rail-top height used for the JR viaduct (station-jr.mjs uses the same)
import * as THREE from '../../vendor/three.module.min.js';
import {common} from '../shaders.mjs';
import {roadHalfWidth,CORNERS} from '../simulation.mjs';

export const JR_TRACK_Y=7.0;
const FOOT=['footway','pedestrian','path','steps','living_street','elevator','cycleway'];
const surface=r=>Number(r.tags.layer||0)>=0&&r.tags.tunnel!=='yes'&&r.tags.indoor!=='yes'&&r.tags.bridge!=='yes';
function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1e-9;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};

export async function loadLod2(url=new URL('../../data/shibuya_plateau_lod2.json',import.meta.url)){
 try{const r=await fetch(url);if(!r.ok)throw Error(r.status);return await r.json();}catch(e){console.warn('LOD2 unavailable, LOD1 kept:',e.message);return null;}}

// ---------- LOD2 buildings ----------
// Walls: aFacade=(u along the wall, top of this wall, seed, 0); roofs (0, top, seed, 1) — the window
// shader in city.mjs reads exactly this. Polygon orientation: CityGML rings face outward; a building whose
// walls mostly face its own centroid is flipped as a whole (robust to the odd reversed export).
export function buildLod2Geometry(lod2,{only=null,skip=null}={}){
 const pos=[],nor=[],fac=[],idx=[];let tris=0,flipped=0;const v=new THREE.Vector3();
 lod2.buildings.forEach((b,bi)=>{
  if(only&&!only.has(b.id)||skip&&skip.has(b.id))return;
  const seed=((bi*2654435761)>>>0)/4294967296;
  const polys=b.polys.map(([kind,...rings])=>({kind,rings:rings.map(r=>{const out=[];for(let i=0;i<r.length;i+=3)out.push([r[i]/10,r[i+1]/10,r[i+2]/10]);return out;})}));
  const gtop=(b.gtop||0)+.05;let cx=0,cz=0,cn=0,top=0;
  for(const p of polys)for(const q of p.rings[0]){cx+=q[0];cz+=q[2];cn++;top=Math.max(top,q[1]);}
  cx/=cn;cz/=cn;
  // Newell normals + wall orientation vote.
  let vote=0;
  for(const p of polys){const r=p.rings[0];let nx=0,ny=0,nz=0;for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length];nx+=(a[1]-c[1])*(a[2]+c[2]);ny+=(a[2]-c[2])*(a[0]+c[0]);nz+=(a[0]-c[0])*(a[1]+c[1]);}
   const l=Math.hypot(nx,ny,nz);p.area=l/2;if(l<1e-6){p.skip=true;continue;}p.n=[nx/l,ny/l,nz/l];
   let mx=0,mz=0;for(const q of r){mx+=q[0];mz+=q[2];}mx/=r.length;mz/=r.length;
   if(Math.abs(p.n[1])<.35){const d=(mx-cx)*p.n[0]+(mz-cz)*p.n[2];vote+=Math.sign(d)*p.area;}
   else if(p.kind===1)vote+=(p.n[1]>0?1:-1)*p.area*.5;}
  const flip=vote<0?-1:1;if(flip<0)flipped++;
  for(const p of polys){if(p.skip||p.area<.05)continue;const n=p.n.map(c=>c*flip);
   const wall=Math.abs(n[1])<.35;
   // flat ground: wall bottoms at/below the site's ground top snap to 0
   if(wall)for(const r of p.rings)for(const q of r)if(q[1]<=gtop)q[1]=0;
   const ax=Math.abs(n[0]),ay=Math.abs(n[1]),az=Math.abs(n[2]);
   const proj=ay>=ax&&ay>=az?q=>new THREE.Vector2(q[0],q[2]):ax>=az?q=>new THREE.Vector2(q[2],q[1]):q=>new THREE.Vector2(q[0],q[1]);
   const all=p.rings.flat();let faces;
   try{faces=THREE.ShapeUtils.triangulateShape(p.rings[0].map(proj),p.rings.slice(1).map(r=>r.map(proj)));}catch{continue;}
   const base=pos.length/3;let wtop=0;for(const q of all)wtop=Math.max(wtop,q[1]);
   const tx=-n[2],tz=n[0],tl=Math.hypot(tx,tz)||1;
   for(const q of all){pos.push(q[0],q[1],q[2]);nor.push(n[0],n[1],n[2]);
    if(wall)fac.push((q[0]*tx+q[2]*tz)/tl+seed*37,Math.max(wtop,3),seed,0);else fac.push(0,Math.max(top,3),seed,n[1]>.2?1:0);}
   for(const [i0,i1,i2] of faces){const a=all[i0],c=all[i1],d=all[i2];
    const ex=c[0]-a[0],ey=c[1]-a[1],ez=c[2]-a[2],fx=d[0]-a[0],fy=d[1]-a[1],fz=d[2]-a[2];
    v.set(ey*fz-ez*fy,ez*fx-ex*fz,ex*fy-ey*fx);
    if(v.x*n[0]+v.y*n[1]+v.z*n[2]>=0)idx.push(base+i0,base+i1,base+i2);else idx.push(base+i0,base+i2,base+i1);tris++;}}
 });
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('aFacade',new THREE.Float32BufferAttribute(fac,4));g.setIndex(idx);g.computeBoundingSphere();
 return {geometry:g,buildings:lod2.buildings.length,triangles:tris,flipped};}

// ---------- Look ----------
export function nightLook({shared,post}){
 shared.uDaylight.value=0;shared.uFacade.value=1;shared.uWet.value=.42;
 shared.uFogColor.value.set(0x1d1b25);shared.uFogDensity.value=.00115;
 shared.uSkyTop.value.set(0x03050b);shared.uSkyHorizon.value.set(0x3a2c33);// city sky glow (sodium/LED scatter)
 if(post){const s=post.settings;s.uBloom.value=.24;s.uSaturation.value=1.02;s.uShadowTint.value.set(-.002,.004,.014);s.uHighTint.value.set(.03,.014,-.012);
  s.uVignette.value=.42;s.uGrain.value=.022;s.uAberration.value=.0025;s.uExposure.value=1.08;}}

// ---------- main ----------
export function applyRealism({scene,city,shared,post,osm,plateau,lod2=null,sky=null,options={}}){
 const o={lod2:true,lamps:true,shopfronts:true,ground:true,viaduct:true,skyGlow:true,skyline:true,look:'night',radius:380,exclude:[[52,17,100,55]],hoarding:[1,48],...options};
 const excluded=(x,z)=>o.exclude.some(r=>x>r[0]&&x<r[2]&&z>r[1]&&z<r[3]);
 const rnd=mulberry(20261031);const group=new THREE.Group();group.name='series-realism';scene.add(group);
 const stats={};const outdoor=[];// meshes hidden by setInterior
 if(o.look==='night')nightLook({shared,post});
 // Full heights: the escape map mode caps buildings; the series never does.
 const bu=city.buildings.material.uniforms;bu.uCap.value=1e5;bu.uMap.value=0;
 // Window LOD: city.mjs averages the window grid when either cell axis is < ~2 px, which turns walls seen at a
 // grazing angle into flat tan slabs from the air; here the horizontal axis counts at 35 % (series only).
 {const m=city.buildings.material,from='float lod=smoothstep(.25,.6,max(aa.x,aa.y));';if(m.fragmentShader.includes(from)){m.fragmentShader=m.fragmentShader.replace(from,'float lod=smoothstep(.25,.6,max(aa.x*.35,aa.y));');m.needsUpdate=true;stats.windowLod='patched';}else stats.windowLod='unpatched';}
 // Station shell: PLATEAU buildings overlapping the station-interior rects (o.exclude) go into their own mesh,
 // hidden while the camera is inside (setInterior), so their walls do not cut through the procedural concourse.
 const shellIds=new Set();
 for(const b of plateau.buildings){const r=b.ring;const hit=o.exclude.some(([x0,z0,x1,z1])=>r.some(p=>p[0]>x0&&p[0]<x1&&p[1]>z0&&p[1]<z1)||[[x0,z0],[x1,z0],[x0,z1],[x1,z1],[(x0+x1)/2,(z0+z1)/2]].some(([x,z])=>inside(x,z,r)));if(hit)shellIds.add(b.id);}
 let shell=null;
 if(o.lod2&&lod2){const L=buildLod2Geometry(lod2,{skip:shellIds});city.buildings.geometry.dispose();city.buildings.geometry=L.geometry;city.buildings.frustumCulled=true;stats.lod2Buildings=L.buildings;stats.lod2Triangles=L.triangles;stats.lod2Flipped=L.flipped;
  const S=buildLod2Geometry(lod2,{only:shellIds});shell=new THREE.Mesh(S.geometry,city.buildings.material);shell.name='station-shell';group.add(shell);shell.layers.enable(1);stats.stationShell=[...shellIds];}
 else stats.lod2Buildings=0;

 // Footprint spatial hash (LOD1 rings) for collision tests.
 const rings=plateau.buildings.map(b=>b.ring);const hash=new Map();
 rings.forEach((r,i)=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of r){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
  for(let gx=Math.floor(x0/20);gx<=Math.floor(x1/20);gx++)for(let gz=Math.floor(z0/20);gz<=Math.floor(z1/20);gz++){const k=gx+','+gz;if(!hash.has(k))hash.set(k,[]);hash.get(k).push(i);}});
 function insideBuilding(x,z,margin=0){const near=new Set();for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const l=hash.get((Math.floor(x/20)+dx)+','+(Math.floor(z/20)+dz));if(l)for(const i of l)near.add(i);}
  for(const i of near){const r=rings[i];if(inside(x,z,r))return true;if(margin>0)for(let k=0;k<r.length-1;k++)if(segDist(x,z,r[k],r[k+1])<margin)return true;}return false;}

 // Carriageway raster (0.5 m) for kerb/plaza tests.
 const MASK=1800,MX=-450,MS=900/MASK;const maskCanvas=document.createElement('canvas');maskCanvas.width=maskCanvas.height=MASK;
 {const S=maskCanvas.getContext('2d');S.fillStyle='#000';S.fillRect(0,0,MASK,MASK);S.strokeStyle='#fff';S.fillStyle='#fff';S.lineCap='round';S.lineJoin='round';
  const to=(x,z)=>[(x-MX)/MS,(z-MX)/MS];
  for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||r.tags.footway==='crossing')continue;S.lineWidth=(roadHalfWidth(r)-.5)*2/MS;S.beginPath();r.points.forEach((p,k)=>{const [x,y]=to(...p);k?S.lineTo(x,y):S.moveTo(x,y);});S.stroke();}
  S.beginPath();CORNERS.forEach((p,k)=>{const [x,y]=to(p[0]*.86,p[1]*.86);k?S.lineTo(x,y):S.moveTo(x,y);});S.closePath();S.fill();}
 const maskData=maskCanvas.getContext('2d').getImageData(0,0,MASK,MASK).data;
 const roadMask=(x,z)=>{const i=Math.floor((x-MX)/MS),j=Math.floor((z-MX)/MS);if(i<0||j<0||i>=MASK||j>=MASK)return false;return maskData[(j*MASK+i)*4]>127;};

 const lightTex=shared.uLightmap.value,LC=city.lightCanvas,LM=LC.width,lrect=shared.uLightRect.value,lsc=LM/lrect.z,G=LC.getContext('2d');
 const toL=(x,z)=>[(x-lrect.x)*lsc,(z-lrect.y)*lsc];
 const pool=(x,z,r,rgba)=>{const [px,py]=toL(x,z),g=G.createRadialGradient(px,py,0,px,py,r*lsc);g.addColorStop(0,rgba);g.addColorStop(1,'rgba(0,0,0,0)');G.fillStyle=g;G.fillRect(px-r*lsc,py-r*lsc,2*r*lsc,2*r*lsc);};
 G.globalCompositeOperation='lighter';

 // Continuous carriageway glow (overlapping LED/sodium lamp throws read as lit streets from the air).
 if(o.lamps){G.lineCap='round';G.lineJoin='round';for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||r.tags.footway==='crossing')continue;const hw=roadHalfWidth(r);
   const major=['trunk','primary','secondary','tertiary'].includes(r.kind);G.strokeStyle=major?'rgba(255,214,176,.055)':'rgba(255,200,160,.035)';G.lineWidth=Math.max(1,(hw*2+3)*lsc);
   G.beginPath();r.points.forEach((p,k)=>{const [x,y]=toL(...p);k?G.lineTo(x,y):G.moveTo(x,y);});G.stroke();}}
 // ---------- Street lamps: city's road lamps get halos; new pedestrian lamps on footways ----------
 const halos=[];// [x,y,z,size,r,g,b]
 const roadLamps=city.group.children.find(m=>m.isInstancedMesh&&m.count===city.lampCount);
 if(roadLamps&&o.lamps){const m=new THREE.Matrix4(),p=new THREE.Vector3();for(let i=0;i<roadLamps.count;i++){roadLamps.getMatrixAt(i,m);p.set(0,5.9,1.2).applyMatrix4(m);
   if(Math.abs(p.x)>440||Math.abs(p.z)>440)continue;halos.push([p.x,p.y,p.z,1.5,1,1.02,1.08]);pool(p.x,p.z,9,'rgba(200,214,255,.16)');}}
 const lampPositions=[];
 if(o.lamps){for(const r of osm.roads){if(!['footway','pedestrian','living_street'].includes(r.kind)||!surface(r)||r.tags.footway==='crossing')continue;
   let carry=rnd()*14;for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.1)continue;
    for(;carry<l;carry+=17){const t=carry/l,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;if(Math.hypot(x,z)>430||insideBuilding(x,z,.6)||roadMask(x,z))continue;
     if(lampPositions.some(q=>Math.abs(q[0]-x)<9&&Math.abs(q[1]-z)<9))continue;lampPositions.push([x,z]);}carry-=l;}}
  const warmL=[];for(const [x,z] of lampPositions){const sodium=rnd()<.35;warmL.push(sodium);
   pool(x,z,7.5,sodium?'rgba(255,160,80,.26)':'rgba(255,214,170,.22)');halos.push([x,4.3,z,1.1,...(sodium?[1.6,.85,.38]:[1.35,1.08,.8])]);}
  // pole + lantern (4.5 m pedestrian lamp)
  const parts=[new THREE.CylinderGeometry(.05,.07,4.2,5).translate(0,2.1,0),new THREE.CylinderGeometry(.16,.12,.42,6).translate(0,4.38,0),new THREE.CylinderGeometry(.2,.2,.05,6).translate(0,4.62,0)];
  const pp=[],hh=[];parts.forEach((g,k)=>{const a=g.toNonIndexed().getAttribute('position').array;pp.push(...a);for(let i=0;i<a.length/3;i++)hh.push(k===1?1:0);});
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));lg.setAttribute('aHead',new THREE.Float32BufferAttribute(hh,1));lg.computeVertexNormals();
  const lm=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`attribute float aHead;attribute float aWarm;varying float vHead,vWarm;varying vec3 vWorld;void main(){vHead=aHead;vWarm=aWarm;vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:/* glsl */`${common}varying float vHead,vWarm;varying vec3 vWorld;void main(){vec3 c=mix(vec3(.02)+streetLight(vWorld.xz)*.06,mix(vec3(2.4,2.,1.5),vec3(3.,1.6,.6),vWarm),vHead);gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`});
  if(lampPositions.length){const warmAttr=new Float32Array(lampPositions.length);warmL.forEach((w,i)=>warmAttr[i]=w?1:0);lg.setAttribute('aWarm',new THREE.InstancedBufferAttribute(warmAttr,1));
   const mesh=new THREE.InstancedMesh(lg,lm,lampPositions.length);const d=new THREE.Object3D();lampPositions.forEach(([x,z],i)=>{d.position.set(x,0,z);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});group.add(mesh);outdoor.push(mesh);city.reflective?.push(mesh);mesh.layers.enable(1);}}
 // Station-front / plaza wash (big LED floods on the station building and Hachiko plaza).
 pool(25,40,32,'rgba(255,236,214,.16)');pool(60,10,24,'rgba(225,232,255,.12)');pool(-30,-20,26,'rgba(255,220,200,.08)');
 stats.lamps=lampPositions.length;

 // Halo billboards (additive): one draw call; size grows a little with distance so far lamps still read.
 let haloMesh=null;
 if(halos.length){const g=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1));const d=new Float32Array(halos.length*4),c=new Float32Array(halos.length*4);
  halos.forEach((h,i)=>{d.set([h[0],h[1],h[2],h[3]],4*i);c.set([h[4],h[5],h[6],rnd()],4*i);});g.setAttribute('aHalo',new THREE.InstancedBufferAttribute(d,4));g.setAttribute('aCol',new THREE.InstancedBufferAttribute(c,4));g.instanceCount=halos.length;
  haloMesh=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{...shared},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:/* glsl */`${common}attribute vec4 aHalo,aCol;varying vec2 vUv;varying vec3 vCol;varying float vFog;
    void main(){vUv=position.xy*2.;vec3 c=aHalo.xyz;float dist=length(cameraPosition-c);float s=aHalo.w*(1.+dist*.0012);
     vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
     vec3 w=c+(right*position.x+up*position.y)*s*2.;vCol=aCol.rgb*(1.-.9*uDaylight)/(1.+dist*.004)*smoothstep(4.,14.,dist);vFog=exp(-pow(dist*uFogDensity,1.35));gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
   fragmentShader:/* glsl */`varying vec2 vUv;varying vec3 vCol;varying float vFog;void main(){float r=length(vUv);if(r>1.)discard;float a=exp(-r*r*7.)*1.4+exp(-r*3.2)*.22;gl_FragColor=vec4(vCol*a*vFog,1.);}`}));
  haloMesh.frustumCulled=false;haloMesh.renderOrder=6;group.add(haloMesh);outdoor.push(haloMesh);}
 stats.halos=halos.length;

 // ---------- Signage-free shop fronts (lit glass bays, shutters, dark bays, plain fascia) ----------
 let shopMesh=null;const shopBays=[];
 if(o.shopfronts){const roadPts=new Map();for(const r of osm.roads){if(!surface(r)&&r.tags.bridge!=='yes')continue;if(r.tags.bridge==='yes')continue;
   for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<=l;s+=3){const x=a[0]+(b[0]-a[0])*s/(l||1),z=a[1]+(b[1]-a[1])*s/(l||1),key=Math.floor(x/8)+','+Math.floor(z/8);if(!roadPts.has(key))roadPts.set(key,[]);roadPts.get(key).push([x,z,FOOT.includes(r.kind)?2.5:roadHalfWidth(r)]);}}}
  const nearStreet=(x,z)=>{for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const l=roadPts.get((Math.floor(x/8)+dx)+','+(Math.floor(z/8)+dz));if(l)for(const [px,pz,hw] of l)if(Math.hypot(px-x,pz-z)<hw+6)return true;}return false;};
  for(const m of city.meta){if(m.dist>o.radius||m.h<4.5)continue;const r=m.ring;
   for(let k=0;k<r.length;k++){const a=r[k],c=r[(k+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<3)continue;
    const ux=(c[0]-a[0])/l,uz=(c[1]-a[1])/l,nx=-uz*m.sign,nz=ux*m.sign;const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2;
    if(!nearStreet(mx+nx*3,mz+nz*3)||insideBuilding(mx+nx*1.5,mz+nz*1.5))continue;
    const n=Math.max(1,Math.round(l/(3.6+rnd()*2.4))),w=l/n;
    for(let i=0;i<n;i++){const t=(i+.5)*w;const kind=rnd();if(excluded(a[0]+ux*t,a[1]+uz*t))continue;shopBays.push([a[0]+ux*t+nx*.06,a[1]+uz*t+nz*.06,Math.atan2(nx,nz),w-.35,kind<.68?0:kind<.84?1:2,rnd()]);}}}
  if(shopBays.length){const g=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1).translate(0,.5,0));const d=new Float32Array(shopBays.length*4),s=new Float32Array(shopBays.length*4);
   shopBays.forEach((b,i)=>{d.set([b[0],b[1],b[2],b[3]],4*i);s.set([b[4],b[5],0,0],4*i);});g.setAttribute('aBay',new THREE.InstancedBufferAttribute(d,4));g.setAttribute('aKind',new THREE.InstancedBufferAttribute(s,4));g.instanceCount=shopBays.length;
   shopMesh=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{...shared},extensions:{derivatives:true},
    vertexShader:/* glsl */`attribute vec4 aBay,aKind;varying vec2 vUv;varying vec3 vWorld,vN;varying vec2 vKind;varying float vW;
     void main(){vUv=vec2(position.x+.5,position.y);vKind=aKind.xy;vW=aBay.w;float c=cos(aBay.z),s=sin(aBay.z);
      vec3 p=vec3(position.x*aBay.w,position.y*4.25,0.);vec3 w=vec3(aBay.x+p.x*c+p.z*s,p.y,aBay.y-p.x*s+p.z*c);vN=vec3(s,0.,c);vWorld=w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:/* glsl */`${common}varying vec2 vUv;varying vec3 vWorld,vN;varying vec2 vKind;varying float vW;
     vec3 tint(float r){return r<.45?vec3(1.,.8,.58):r<.75?vec3(1.,.95,.86):r<.9?vec3(.86,.93,1.):vec3(1.,.7,.82);}
     void main(){float y=vWorld.y,x=vUv.x*vW,seed=vKind.y;vec3 street=streetLight(vWorld.xz+vN.xz*1.5);
      vec3 col;
      if(y>3.55){// plain fascia band (no lettering): dark panel with a thin backlit edge
       float edge=smoothstep(.06,.0,abs(y-3.62))+smoothstep(.06,.0,abs(y-4.18));vec3 base=mix(vec3(.05,.05,.055),vec3(.12,.1,.09),hash11(seed*7.));
       col=base*(.25+street*.6)+tint(fract(seed*13.))*edge*.9*step(.3,hash11(seed*3.))+tint(fract(seed*5.))*.18*step(.55,hash11(seed*11.));}
      else if(vKind.x<.5){// lit glass bay: interior (ceiling light row, shelves/racks, back wall), mullions, door
       vec2 cell=vec2(x/1.25,y);float mull=step(.94,fract(cell.x))+step(y,.18)+step(3.42,y);
       float ceil=smoothstep(2.9,3.3,y)*(.7+.3*sin(x*5.));float shelves=step(.5,fract(y*2.6+hash11(floor(x*1.3)+seed*40.)))*step(y,2.2)*step(.4,y);
       float blobs=noise2(vec2(x*2.3,y*3.1)+seed*31.);vec3 T=tint(fract(seed*17.));
       vec3 interior=T*(.55+.9*ceil+.35*shelves*blobs)*mix(.6,1.5,hash11(seed*19.));
       float door=step(abs(x-vW*.5),.85)*step(y,2.4);interior*=mix(1.,.75,door);
       // people silhouettes/products near the glass break up the uniform glow
       interior*=1.-.45*smoothstep(.62,.7,noise2(vec2(x*.9+seed*9.,1.)))*step(y,1.8);
       vec3 refl=street*.5+skyColor(reflect(normalize(vWorld-cameraPosition),vN))*.05;
       col=mix(interior*1.15,vec3(.03),mull)+refl*.25;}
      else if(vKind.x<1.5){// rolled-down shutter (closed shop), lit by the street
       float rib=.6+.4*sin(y*48.);col=vec3(.2,.2,.21)*rib*(street*1.2+.03);col*=mix(1.,.5,step(3.4,y));}
      else{// dark glass / closed interior with a small lit sign-free panel
       col=vec3(.012,.013,.017)+street*.12;col+=tint(fract(seed*23.))*.6*step(abs(x-vW*.3),.25)*step(abs(y-1.6),.35);}
      col*=1.-.85*uDaylight;
      gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`}));
   shopMesh.frustumCulled=false;group.add(shopMesh);outdoor.push(shopMesh);city.reflective?.push(shopMesh);shopMesh.layers.enable(1);}}
 stats.shopBays=shopBays.length;

 // ---------- Ground details: crosswalk stripes, kerbs, tactile paving, Hachiko plaza granite ----------
 const detail=[];
 if(o.ground){
  // Crosswalk stripes (white, 0.45 m bars every 0.9 m, parallel to traffic) outside the city's 160 m near map.
  const stripes=[];
  for(const r of osm.roads){if(r.tags.footway!=='crossing'||!surface(r)||r.tags['crossing:markings']==='no'||r.tags.crossing==='unmarked')continue;
   const a=r.points[0],b=r.points.at(-1);if(Math.abs((a[0]+b[0])/2)<78&&Math.abs((a[1]+b[1])/2)<78)continue;if(Math.hypot(a[0],a[1])>o.radius+60)continue;
   const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<2)continue;const ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len,width=len>14?4.5:3.5;
   for(let s=.7;s<len-.5;s+=.9)stripes.push([a[0]+ux*s,a[1]+uz*s,Math.atan2(ux,uz),width]);}
  // Kerbs along both edges of carriageways (0.15 m high, 0.2 m wide), skipped across junctions.
  const kerbs=[];
  for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||['motorway','motorway_link'].includes(r.kind))continue;const hw=roadHalfWidth(r)-.5;
   for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.5)continue;const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l;
    for(const side of [-1,1]){const nx=-uz*side,nz=ux*side;for(let s=0;s<l;s+=2){const L=Math.min(2,l-s),t=s+L/2,x=a[0]+ux*t+nx*(hw+.1),z=a[1]+uz*t+nz*(hw+.1);
     if(Math.hypot(x,z)>o.radius||roadMask(x+nx*.5,z+nz*.5)||insideBuilding(x,z))continue;kerbs.push([x,z,Math.atan2(ux,uz),L]);}}}}
  // Tactile paving (yellow 0.3 m) on the OSM footways tagged tactile_paving=yes (e.g. the Hachiko plaza paths).
  const tactile=[];
  for(const r of osm.roads){if(r.tags.tactile_paving!=='yes'||!surface(r)||r.kind==='steps'||r.tags.footway==='crossing')continue;
   for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.3)continue;const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l;
    for(let s=0;s<l;s+=1.5){const L=Math.min(1.5,l-s),x=a[0]+ux*(s+L/2),z=a[1]+uz*(s+L/2);if(roadMask(x,z)||insideBuilding(x,z))continue;tactile.push([x,z,Math.atan2(ux,uz),L]);}}}
  // One instanced decal mesh for stripes + tactile (flat quads), one for kerbs (boxes).
  const decals=[...stripes.map(s=>[s[0],s[1],s[2]+Math.PI/2,s[3],.45,0]),...tactile.map(s=>[s[0],s[1],s[2],s[3],.3,1])];
  if(decals.length){const g=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2));const d=new Float32Array(decals.length*4),e=new Float32Array(decals.length*2);
   decals.forEach((q,i)=>{d.set([q[0],q[1],q[2],q[3]],4*i);e.set([q[4],q[5]],2*i);});g.setAttribute('aDec',new THREE.InstancedBufferAttribute(d,4));g.setAttribute('aDec2',new THREE.InstancedBufferAttribute(e,2));g.instanceCount=decals.length;
   const m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{...shared},polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:/* glsl */`attribute vec4 aDec;attribute vec2 aDec2;varying vec3 vWorld;varying vec2 vUv;varying float vKind;void main(){float c=cos(aDec.z),s=sin(aDec.z);vec2 p=vec2(position.x*aDec2.x,position.z*aDec.w);vUv=position.xz+.5;vKind=aDec2.y;
     vec3 w=vec3(aDec.x+p.x*c+p.y*s,.025,aDec.y-p.x*s+p.y*c);vWorld=w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:/* glsl */`${common}varying vec3 vWorld;varying vec2 vUv;varying float vKind;void main(){vec3 alb=vKind>.5?vec3(.42,.33,.07):vec3(.62,.62,.6);
     float wear=.75+.25*noise2(vWorld.xz*3.1);if(vKind>.5){vec2 d=fract(vUv*vec2(4.,6.))-.5;alb*=.8+.35*step(length(d),.3);}
     vec3 col=alb*wear*(vec3(.02,.022,.03)+streetLight(vWorld.xz));gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`}));
   m.frustumCulled=false;group.add(m);outdoor.push(m);detail.push(m);}
  if(kerbs.length){const geo=new THREE.BoxGeometry(.2,.15,1).translate(0,.075,0);const m=new THREE.InstancedMesh(geo,new THREE.ShaderMaterial({uniforms:{...shared},
    vertexShader:/* glsl */`varying vec3 vWorld,vN;void main(){vN=normalize(mat3(modelMatrix*instanceMatrix)*normal);vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:/* glsl */`${common}varying vec3 vWorld,vN;void main(){vec3 col=vec3(.2,.2,.19)*(.8+.3*noise2(vWorld.xz*4.))*(vec3(.02,.022,.03)+streetLight(vWorld.xz)*(.6+.4*vN.y));gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`}),kerbs.length);
   const d=new THREE.Object3D();kerbs.forEach(([x,z,a,L],i)=>{d.position.set(x,0,z);d.rotation.set(0,a,0);d.scale.set(1,1,L);d.updateMatrix();m.setMatrixAt(i,d.matrix);});group.add(m);outdoor.push(m);detail.push(m);}
  // Hachiko plaza: light granite slabs (0.6 m) over the open plaza between the Scramble and the station (asphalt excluded via the mask texture).
  {const mt=new THREE.CanvasTexture(maskCanvas);mt.colorSpace=THREE.NoColorSpace;mt.generateMipmaps=false;mt.minFilter=THREE.LinearFilter;
   const plaza=new THREE.Mesh(new THREE.PlaneGeometry(62,58).rotateX(-Math.PI/2).translate(12,.012,44),new THREE.ShaderMaterial({uniforms:{...shared,uMask:{value:mt}},extensions:{derivatives:true},polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    vertexShader:/* glsl */`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:/* glsl */`${common}uniform sampler2D uMask;varying vec3 vWorld;void main(){vec2 xz=vWorld.xz;if(texture2D(uMask,(xz+450.)/900.).r>.3)discard;
     vec2 c=xz/.6;vec2 id=floor(c+vec2(floor(c.y)*.5,0.));vec2 f=abs(fract(c+vec2(floor(c.y)*.5,0.))-.5);float fw=max(fwidth(c.x),1e-3);float joint=smoothstep(.5-fw*1.5,.5,max(f.x,f.y));
     vec3 alb=mix(vec3(.2,.19,.18),vec3(.27,.25,.23),hash21(id))*(.85+.3*noise2(xz*2.))*(1.-joint*.45);
     // soft edge so the decal blends into the base paving
     float edge=smoothstep(0.,6.,min(min(xz.x+19.,43.-xz.x),min(xz.y-15.,73.-xz.y)));
     vec3 col=alb*(vec3(.02,.022,.03)+streetLight(xz))*1.1;gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),edge*.92);}`,transparent:true,depthWrite:false}));
   group.add(plaza);outdoor.push(plaza);}
  stats.stripes=stripes.length;stats.kerbs=kerbs.length;stats.tactile=tactile.length;}

 // ---------- JR viaduct (Yamanote / Yamanote freight = Saikyo/Shonan-Shinjuku tracks), outside station buildings ----------
 if(o.viaduct){const jr=osm.railways.filter(r=>/山手/.test(r.name||''));const deck=[],piers=[],rails=[];
  for(const r of jr)for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.5)continue;const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l;
   for(let s=0;s<l;s+=6){const L=Math.min(6,l-s),x=a[0]+ux*(s+L/2),z=a[1]+uz*(s+L/2);if(Math.abs(x)>460||Math.abs(z)>460)continue;deck.push([x,z,Math.atan2(ux,uz),L+.05]);
    if(Math.round((s+k*7)/6)%3===0&&!insideBuilding(x,z)&&!excluded(x,z))piers.push([x,z,Math.atan2(ux,uz)]);}}
  const mat=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`varying vec3 vWorld,vN;void main(){vN=normalize(mat3(modelMatrix*instanceMatrix)*normal);vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:/* glsl */`${common}varying vec3 vWorld,vN;void main(){float n=noise2(vWorld.xz*.7+vWorld.y);vec3 alb=vec3(.16,.16,.155)*(.8+.3*n);
    vec3 up=streetLight(vWorld.xz)*exp(-vWorld.y*.12)*(.4+.6*max(0.,-vN.y)+.4*(1.-abs(vN.y)));vec3 col=alb*(vec3(.022,.024,.034)*(1.+vN.y*.5)+up);
    float rail=step(.92,fract(vWorld.x*0.))*0.;gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
  const dg=new THREE.BoxGeometry(4.6,1.3,1).translate(0,JR_TRACK_Y-.85,0);const dm=new THREE.InstancedMesh(dg,mat,deck.length);const d=new THREE.Object3D();
  deck.forEach(([x,z,a,L],i)=>{d.position.set(x,0,z);d.rotation.set(0,a,0);d.scale.set(1,1,L);d.updateMatrix();dm.setMatrixAt(i,d.matrix);});
  // parapet walls
  const pg=new THREE.BoxGeometry(.2,1.1,1);const pm=new THREE.InstancedMesh(pg,mat,deck.length*2);deck.forEach(([x,z,a,L],i)=>{for(const s of [-1,1]){d.position.set(x+Math.cos(a)*2.2*s,JR_TRACK_Y-.2+.55,z-Math.sin(a)*2.2*s);d.rotation.set(0,a,0);d.scale.set(1,1,L);d.updateMatrix();pm.setMatrixAt(2*i+(s>0?1:0),d.matrix);}});
  const pierG=new THREE.BoxGeometry(1.1,JR_TRACK_Y-1.5,1.1).translate(0,(JR_TRACK_Y-1.5)/2,0);const pim=new THREE.InstancedMesh(pierG,mat,Math.max(1,piers.length));piers.forEach(([x,z,a],i)=>{d.position.set(x,0,z);d.rotation.set(0,a,0);d.scale.set(1,1,1);d.updateMatrix();pim.setMatrixAt(i,d.matrix);});pim.count=piers.length;
  for(const m of [dm,pm,pim]){group.add(m);outdoor.push(m);}
  // rails (two thin steel lines per track; caught by the light as faint highlights)
  const rp=[];for(const r of jr)for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.5)continue;const nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l;for(const s of [-.53,.53])rp.push(a[0]+nx*s,JR_TRACK_Y,a[1]+nz*s,b[0]+nx*s,JR_TRACK_Y,b[1]+nz*s);}
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));const rl=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0x4a4f58}));group.add(rl);outdoor.push(rl);detail.push(rl);
  stats.viaductSegments=deck.length;stats.piers=piers.length;}

 // ---------- Hachiko statue hoarding (MEAS-06: statue fenced off over Halloween) ----------
 // Plain white temporary panels around city.mjs's symbolic statue at (1,48); no print, no text.
 if(o.hoarding){const [hx,hz]=o.hoarding,g=new THREE.Group();const mat=new THREE.ShaderMaterial({uniforms:{...shared},
   vertexShader:/* glsl */`varying vec3 vWorld,vN;void main(){vN=normal;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:/* glsl */`${common}varying vec3 vWorld,vN;void main(){float seam=step(.97,fract((vWorld.x+vWorld.z)/1.8));vec3 alb=vec3(.72,.73,.74)*(1.-.35*seam)*(1.-.4*step(vWorld.y,.12));
    vec3 col=alb*(vec3(.03,.032,.04)+streetLight(vWorld.xz+vN.xz*1.2)*1.1);gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
  const W=5.2,H=2.4;for(const [dx,dz,sx,sz] of [[0,-W/2,W,.08],[0,W/2,W,.08],[-W/2,0,.08,W],[W/2,0,.08,W]]){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,H,sz),mat);m.position.set(hx+dx,H/2,hz+dz);g.add(m);}
  g.rotation.y=0;group.add(g);outdoor.push(g);stats.hoarding=[hx,hz];}

 // ---------- Sky glow dome + procedural far skyline ----------
 let glow=null,skyline=null;
 if(o.skyGlow){glow=new THREE.Mesh(new THREE.CylinderGeometry(2600,2600,900,48,1,true).translate(0,300,0),new THREE.ShaderMaterial({uniforms:{...shared},side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:/* glsl */`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:/* glsl */`${common}varying vec3 vP;void main(){float h=clamp((vP.y+150.)/900.,0.,1.);float a=atan(vP.x,vP.z);float band=exp(-h*5.)*(.75+.25*sin(a*3.+1.)*sin(a*7.));
    vec3 c=mix(vec3(.16,.09,.06),vec3(.07,.06,.09),h)*band*(1.-uDaylight);gl_FragColor=vec4(c,1.);}`}));
  glow.frustumCulled=false;glow.renderOrder=-9;group.add(glow);outdoor.push(glow);}
 if(o.skyline){const boxes=[];const r2=mulberry(77);
  for(let i=0;i<1400;i++){const ang=r2()*Math.PI*2,rad=520+Math.pow(r2(),.7)*1700,x=Math.cos(ang)*rad,z=Math.sin(ang)*rad;if(Math.abs(x)<470&&Math.abs(z)<470)continue;if(o.skylineAvoid){const r=o.skylineAvoid;if(x>r[0]&&x<r[2]&&z>r[1]&&z<r[3])continue;}
   const tall=r2()<.06;boxes.push([x,z,8+r2()*24+(tall?40+r2()*120:0),12+r2()*30,10+r2()*26,r2()*Math.PI]);}
  const g=new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
  const m=new THREE.InstancedMesh(g,new THREE.ShaderMaterial({uniforms:{...shared},extensions:{derivatives:true},
   vertexShader:/* glsl */`varying vec3 vWorld,vLocal;varying float vSeed,vH;void main(){vLocal=position*vec3(instanceMatrix[0][0]*0.+1.);vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;vH=length(instanceMatrix[1].xyz);vSeed=fract(instanceMatrix[3].x*.013+instanceMatrix[3].z*.007);gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:/* glsl */`${common}varying vec3 vWorld,vLocal;varying float vSeed,vH;void main(){vec2 g=vec2((vWorld.x+vWorld.z)/3.,vWorld.y/3.4);vec2 id=floor(g);float lit=step(hash21(id+vSeed*91.),.32)*step(2.,vWorld.y)*step(vWorld.y,vH-1.);
    vec2 f=fract(g);float win=step(.25,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.75);float fw=fwidth(g.x);float lod=smoothstep(.3,.7,fw);
    vec3 wc=mix(vec3(1.,.78,.5),vec3(.8,.9,1.),hash21(id*1.7));vec3 col=vec3(.012,.012,.016)+mix(wc*lit*win*1.3,wc*.12,lod);col=mix(col,vec3(.02,.018,.02),step(vH-.05,vWorld.y));
    gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`}),boxes.length);
  const d=new THREE.Object3D();boxes.forEach(([x,z,h,w,dd,a],i)=>{d.position.set(x,0,z);d.rotation.set(0,a,0);d.scale.set(w,h,dd);d.updateMatrix();m.setMatrixAt(i,d.matrix);});
  skyline=m;group.add(m);outdoor.push(m);stats.skyline=boxes.length;}

 G.globalCompositeOperation='source-over';if(lightTex)lightTex.needsUpdate=true;
 // City neon signs / screens that fall inside the excluded (station interior) rects are removed.
 {const m4=new THREE.Matrix4(),p=new THREE.Vector3(),zero=new THREE.Matrix4().makeScale(0,0,0);let hidden=0;
  for(const mesh of city.signs||[]){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m4);p.setFromMatrixPosition(m4);if(excluded(p.x,p.z)){mesh.setMatrixAt(i,zero);hidden++;}}mesh.instanceMatrix.needsUpdate=true;}
  for(const sc of city.screens||[])if(excluded(sc.position.x,sc.position.z)){sc.visible=false;if(sc.userData.frame)sc.userData.frame.visible=false;hidden++;}
  stats.signsRemovedInStation=hidden;}

 const cityOutdoor=()=>[city.buildings,...(city.signs||[]),...(city.screens||[]),...(city.screens||[]).map(s=>s.userData.frame).filter(Boolean),city.ground,...city.group.children.filter(m=>m.isInstancedMesh),sky].filter(Boolean);
 let detailLevel='street',interiorState='false/true';
 return {group,stats,shell,lampPositions,roadMask,insideBuilding,skyline,glow,
  update(t,camera){/* reserved: halos/shops are static; uTime drives nothing here yet */},
  setInterior(on,{keepCity=true}={}){on=!!on;const key=on+'/'+keepCity;if(key===interiorState)return;interiorState=key;
   for(const m of [...outdoor,...cityOutdoor()])m.visible=!(on&&!keepCity);if(shell)shell.visible=!on;this.setDetail(detailLevel);},
  setDetail(level){detailLevel=level;const street=level!=='aerial';for(const m of detail)m.visible=street;if(haloMesh)haloMesh.visible=true;},
  setSkyline(on){if(skyline)skyline.visible=on;}};
}
