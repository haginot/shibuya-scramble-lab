// Wide-area context + aerial route map for the series (別駅脱出 branch: Harajuku / Yoyogi / Ebisu ...).
// Data: web3d/data/series_wide_osm.json (tools/fetch_series_wide.py): OSM buildings/roads/rails/parks/stations
// for lat 35.643–35.687, lon 139.688–139.716 (© OpenStreetMap contributors, ODbL 1.0) — buildings OUTSIDE the
// PLATEAU bbox only, low detail (heights from tags, otherwise estimated by type: context only) — plus the
// research walking routes (alt-routes.json: OSRM foot on OSM, 「OSMから概算」) and the research reading of the
// police restriction map (red zone, 「規制図より概略」). No words are drawn in WebGL: labels are DOM, placed
// from W.project().
//
// API (coordinates: sim metres, x east, z south, y up):
//   const data = await loadWideArea(url?)                 → JSON or null
//   const W = createWideArea(scene, data, {shared})
//     W.group / W.stats {buildings, roads, rails, green, routes} / W.bounds [x0,z0,x1,z1] of the OSM extract
//     W.setMode('context'|'map'|'off')   context: night extrusions with lit windows, glowing major roads (aerial fill
//                                         beyond the PLATEAU bbox); map: flattened dark blocks, light road lines,
//                                         green parks, route ribbons + red zone visible
//     W.setMapAmount(k 0..1)             continuous blend context→map (buildings sink to 15 %, fog thinned)
//       NOTE for map shots: hide the sky dome / sky glow (camera is 4–6 km up, outside the 3 km sky sphere) and use
//       a camera far plane ≥ 12000 (camera.mjs routeMap shots carry shot.far; applyShot sets it).
//     W.mapCity(city, k)                 same blend for the bundled city (uCap/uMap like the Halloween map mode;
//                                         hides signs/screens when flat)
//     W.showRoutes(ids|null, {highlight})  which research routes are drawn (null = none); highlight id glows
//     W.drawOn(id, p 0..1)               draw-on progress of a route ribbon (chevrons flow on the lit route)
//     W.setRouteStyle(id, {color, alpha, width})
//     W.showRedZone(alpha 0..1)
//     W.update(t)                        chevron flow
//     W.project(camera, w, h)            → [{id, kind:'station'|'start'|'taxi'|'routeEnd'|'redZone', ja, en, lines?, x, y, inFrame,
//                                          distance_m?, minutes_80m?}] screen anchors for DOM labels
//     W.routeBounds(ids)                 → [x0,z0,x1,z1] for camera.mjs routeMap({bounds})
//   ROUTE_COLORS                         default colours per destination (JY green for JR Yamanote stations etc.)
import * as THREE from '../../vendor/three.module.min.js';
import {common} from '../shaders.mjs';

export async function loadWideArea(url=new URL('../../data/series_wide_osm.json',import.meta.url)){
 try{const r=await fetch(url);if(!r.ok)throw Error(r.status);return await r.json();}catch(e){console.warn('wide-area data unavailable:',e.message);return null;}}

export const ROUTE_COLORS={harajuku:0x9ee86a,yoyogi:0x9ee86a,ebisu:0x9ee86a,meijijingumae:0x7fd0ff,omotesando:0xffb84d,daikanyama:0xff7a9a,shinsen:0xc59bff,ikejiriohashi:0x6ee0c8,komabatodaimae:0xc59bff};

const pairs=a=>{const o=[];for(let i=0;i<a.length;i+=2)o.push([a[i],a[i+1]]);return o;};

export function createWideArea(scene,data,{shared}){
 const group=new THREE.Group();group.name='wide-area';scene.add(group);
 const U={uMapK:{value:0}};
 // ---------- buildings (merged extrusions) ----------
 const pos=[],nor=[],att=[],idx=[];
 data.buildings.forEach((b,bi)=>{const h=b[0],ring=pairs(b.slice(1));const n=ring.length;if(n<3)return;const seed=((bi*2654435761)>>>0)/4294967296;
  let s=0;for(let i=0;i<n;i++){const a=ring[i],c=ring[(i+1)%n];s+=a[0]*c[1]-c[0]*a[1];}const ccw=s>0;// z south: sign flips handedness
  for(let i=0;i<n;i++){const a=ring[i],c=ring[(i+1)%n],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<.3)continue;let nx=(c[1]-a[1])/l,nz=-(c[0]-a[0])/l;if(!ccw){nx=-nx;nz=-nz;}
   const k=pos.length/3;pos.push(a[0],0,a[1],c[0],0,c[1],c[0],h,c[1],a[0],h,a[1]);for(let q=0;q<4;q++){nor.push(nx,0,nz);att.push(h,seed);}
   idx.push(k,k+1,k+2,k,k+2,k+3);}
  let tris;try{tris=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(p[0],p[1])),[]);}catch{tris=[];}
  const k=pos.length/3;for(const p of ring){pos.push(p[0],h,p[1]);nor.push(0,1,0);att.push(h,seed);}for(const t of tris)idx.push(k+t[0],k+t[1],k+t[2]);});
 const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bg.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));bg.setAttribute('aB',new THREE.Float32BufferAttribute(att,2));bg.setIndex(idx);bg.computeBoundingSphere();
 const bmat=new THREE.ShaderMaterial({uniforms:{...shared,...U},side:THREE.DoubleSide,extensions:{derivatives:true},
  vertexShader:/* glsl */`uniform float uMapK;attribute vec2 aB;varying vec3 vWorld,vN;varying vec2 vB;void main(){vB=aB;vN=normal;vec3 p=position;p.y*=1.-.85*uMapK;vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform float uMapK;varying vec3 vWorld,vN;varying vec2 vB;void main(){float H=vB.x,seed=vB.y;vec3 col;
   if(vN.y>.5){col=vec3(.03,.03,.035)*(.8+.4*seed);}
   else{vec2 g=vec2((vWorld.x*abs(vN.z)+vWorld.z*abs(vN.x))/3.2,vWorld.y/3.4);vec2 id=floor(g),f=fract(g);float fw=max(fwidth(g.x),fwidth(g.y));float lod=smoothstep(.25,.7,fw);
    float lit=step(hash21(id+seed*97.),mix(.18,.45,seed))*step(1.2,vWorld.y)*step(vWorld.y,H*(1.-.85*uMapK)-.8);float win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.78);
    vec3 wc=mix(vec3(1.,.8,.55),vec3(.85,.92,1.),hash21(id*1.3+seed));col=vec3(.018,.018,.024)+mix(wc*lit*win*1.25,wc*.13*mix(.18,.45,seed),lod);}
   vec3 mapc=vN.y>.5?vec3(.23,.21,.27)+.03*seed:vec3(.10,.09,.13);col=mix(col,mapc,uMapK);
   gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
 const buildings=new THREE.Mesh(bg,bmat);group.add(buildings);

 // ---------- ground, parks, roads, rails ----------
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000).rotateX(-Math.PI/2).translate(0,-.06,-600),new THREE.ShaderMaterial({uniforms:{...shared,...U},
  vertexShader:/* glsl */`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform float uMapK;varying vec3 vWorld;void main(){vec3 col=mix(vec3(.012,.012,.016),vec3(.05,.045,.06),uMapK);gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`}));
 group.add(ground);
 const flatMat=(night,map,y)=>new THREE.ShaderMaterial({uniforms:{...shared,...U,uNight:{value:new THREE.Color(night)},uMapC:{value:new THREE.Color(map)}},polygonOffset:true,polygonOffsetFactor:-1-y,polygonOffsetUnits:-1-y,
  vertexShader:/* glsl */`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform float uMapK;uniform vec3 uNight,uMapC;varying vec3 vWorld;void main(){vec3 col=mix(uNight,uMapC,uMapK);gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
 // parks
 {const p=[],ix=[];for(const g of data.green){const ring=pairs(g);let tris;try{tris=THREE.ShapeUtils.triangulateShape(ring.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch{continue;}const k=p.length/3;for(const q of ring)p.push(q[0],.01,q[1]);for(const t of tris)ix.push(k+t[0],k+t[1],k+t[2]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);const m=new THREE.Mesh(g,flatMat(0x050806,0x16301c,1));m.material.side=THREE.DoubleSide;group.add(m);}
 // road / rail ribbons (flat quads per segment)
 const ribbon=(lines,widthOf,y)=>{const p=[],c=[];for(const L of lines){const pts=pairs(L.slice(1)),w=widthOf(L[0]);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.1)continue;const nx=-(b[1]-a[1])/l*w/2,nz=(b[0]-a[0])/l*w/2;
   p.push(a[0]+nx,y,a[1]+nz,b[0]+nx,y,b[1]+nz,b[0]-nx,y,b[1]-nz,a[0]+nx,y,a[1]+nz,b[0]-nx,y,b[1]-nz,a[0]-nx,y,a[1]-nz);for(let q=0;q<6;q++)c.push(L[0]);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('aCls',new THREE.Float32BufferAttribute(c,1));return g;};
 const roadMat=new THREE.ShaderMaterial({uniforms:{...shared,...U},side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  vertexShader:/* glsl */`attribute float aCls;varying float vCls;varying vec3 vWorld;void main(){vCls=aCls;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform float uMapK;varying float vCls;varying vec3 vWorld;void main(){
   vec3 night=vCls<.5?vec3(.1,.065,.035):vCls<1.5?vec3(.085,.058,.032):vCls<2.5?vec3(.05,.038,.026):vec3(.025,.022,.02);// sodium/LED glow along the carriageways
   vec3 map=vCls<1.5?vec3(.62,.6,.66):vCls<2.5?vec3(.42,.4,.47):vec3(.26,.25,.3);
   gl_FragColor=vec4(applyFog(mix(night,map,uMapK),vWorld,cameraPosition),1.);}`});
 // the bundled city draws its own streets inside the PLATEAU/OSM bbox (±~400 m): keep only segments outside it
 const outside=(x,z)=>Math.abs(x)>395||Math.abs(z)>395;
 const clipRoads=data.roads.map(L=>{const pts=pairs(L.slice(1));const keep=[];for(let i=0;i<pts.length;i++)if(outside(...pts[i])||(i&&outside(...pts[i-1]))||(i<pts.length-1&&outside(...pts[i+1])))keep.push(i);
  if(keep.length<2)return null;return [L[0],...keep.flatMap(i=>pts[i])];}).filter(Boolean);
 const roads=new THREE.Mesh(ribbon(clipRoads,c=>[16,12,8,5][c],.02),roadMat);group.add(roads);
 const roadsMap=new THREE.Mesh(ribbon(data.roads,c=>[16,12,8,5][c],.03),roadMat);roadsMap.visible=false;group.add(roadsMap);
 const railMat=new THREE.ShaderMaterial({uniforms:{...shared,...U},side:THREE.DoubleSide,depthTest:true,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
  vertexShader:/* glsl */`attribute float aCls;varying float vCls;varying vec3 vWorld;void main(){vCls=aCls;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform float uMapK;varying float vCls;varying vec3 vWorld;void main(){vec3 night=vec3(.05,.05,.06);vec3 map=vCls<.5?vec3(.5,.78,.3):vec3(.45,.45,.5);
   gl_FragColor=vec4(applyFog(mix(night,map,uMapK),vWorld,cameraPosition),1.);}`});
 const clip=lines=>lines.map(L=>{const pts=pairs(L.slice(1));const keep=[];for(let i=0;i<pts.length;i++)if(outside(...pts[i])||(i&&outside(...pts[i-1]))||(i<pts.length-1&&outside(...pts[i+1])))keep.push(i);
  if(keep.length<2)return null;return [L[0],...keep.flatMap(i=>pts[i])];}).filter(Boolean);
 // context: only outside the bundled city (realism.mjs draws the JR viaduct there); map: everything
 const rails=new THREE.Mesh(ribbon(clip(data.rails),c=>c===0?7:4,.04),railMat);group.add(rails);
 const railsMap=new THREE.Mesh(ribbon(data.rails,c=>c===0?7:4,.05),railMat);railsMap.visible=false;group.add(railsMap);

 // ---------- red zone (research reading of the police map) ----------
 let redZone=null;
 if(data.redZone?.length>2){const ring=data.redZone;let tris=[];try{tris=THREE.ShapeUtils.triangulateShape(ring.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch{}
  const p=[];for(const t of tris)for(const k of t)p.push(ring[k][0],.6,ring[k][1]);const ol=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];ol.push(a[0],.7,a[1],b[0],.7,b[1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  const fill=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xff2a3a,transparent:true,opacity:.18,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));fill.renderOrder=20;
  const og=new THREE.BufferGeometry();og.setAttribute('position',new THREE.Float32BufferAttribute(ol,3));const line=new THREE.LineSegments(og,new THREE.LineBasicMaterial({color:0xff4a55,transparent:true,opacity:.9,depthTest:false}));line.renderOrder=21;
  redZone=new THREE.Group();redZone.add(fill,line);redZone.visible=false;group.add(redZone);}

 // ---------- route ribbons ----------
 const routes={};
 for(const [id,r] of Object.entries(data.routes||{})){const pts=r.points;if(pts.length<2)continue;const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const p=[],n=[],s=[],side=[],ix=[];
  for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;const nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l;
   for(const sd of [-1,1]){p.push(pts[i][0],2,pts[i][1]);n.push(nx,nz);s.push(cum[i]);side.push(sd);}if(i){const k=2*i;ix.push(k-2,k-1,k+1,k-2,k+1,k);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('aN',new THREE.Float32BufferAttribute(n,2));g.setAttribute('aS',new THREE.Float32BufferAttribute(s,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(ix);
  const col=new THREE.Color(ROUTE_COLORS[r.to]??0xffffff);
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:shared.uTime,uLen:{value:cum.at(-1)},uProg:{value:1},uColor:{value:col},uAlpha:{value:1},uWidth:{value:14},uLit:{value:0}},transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
   vertexShader:/* glsl */`uniform float uWidth;attribute vec2 aN;attribute float aS,aSide;varying float vS,vSide;void main(){vS=aS;vSide=aSide;vec3 p=position+vec3(aN.x,0.,aN.y)*aSide*uWidth*.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:/* glsl */`uniform float uTime,uLen,uProg,uAlpha,uLit;uniform vec3 uColor;varying float vS,vSide;void main(){if(vS>uProg*uLen)discard;
    float edge=smoothstep(1.,.75,abs(vSide));float core=smoothstep(.55,.0,abs(vSide));
    float chev=uLit*step(.5,fract((vS-abs(vSide)*6.)/40.-uTime*.6));float dash=mix(step(.45,fract(vS/30.)),1.,uLit);
    vec3 c=uColor*(.65+.9*core+.6*chev)*(1.+uLit*.6);gl_FragColor=vec4(c,edge*uAlpha*dash*mix(.55,1.,uLit));}`});
  const mesh=new THREE.Mesh(g,mat);mesh.renderOrder=30;mesh.visible=false;mesh.frustumCulled=false;group.add(mesh);
  // end beacon (vertical light column at the destination)
  const end=pts.at(-1);const beacon=new THREE.Mesh(new THREE.CylinderGeometry(5,5,160,12,1,true).translate(end[0],80,end[1]),new THREE.ShaderMaterial({uniforms:{uColor:{value:col},uAlpha:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   vertexShader:/* glsl */`varying float vY;void main(){vY=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:/* glsl */`uniform vec3 uColor;uniform float uAlpha;varying float vY;void main(){gl_FragColor=vec4(uColor*(1.-vY)*1.2*uAlpha,1.);}`}));
  beacon.visible=false;beacon.renderOrder=31;group.add(beacon);
  routes[id]={mesh,mat,beacon,data:r,length:cum.at(-1)};}

 let mode='context',fog0=null;
 const [la0,lo0,la1,lo1]=data.bbox,Cc=Math.cos(data.center[0]*Math.PI/180);
 const bounds=[(lo0-data.center[1])*111320*Cc,-(la1-data.center[0])*111320,(lo1-data.center[1])*111320*Cc,-(la0-data.center[0])*111320];
 const api={group,routes,bounds,
  stats:{buildings:data.buildings.length,roads:data.roads.length,rails:data.rails.length,green:data.green.length,routes:Object.keys(routes).length},
  // map look: fog thinned so a 4–6 km wide frame stays readable; restored when leaving map mode
  setMapAmount(k){U.uMapK.value=k;if(fog0==null)fog0=shared.uFogDensity.value;shared.uFogDensity.value=fog0*(1-k)+.00002*k;roadsMap.visible=k>.5;roads.visible=k<=.5;railsMap.visible=k>.5;rails.visible=k<=.5;},
  setMode(m){mode=m;group.visible=m!=='off';api.setMapAmount(m==='map'?1:0);},
  mapCity(city,k){const u=city.buildings.material.uniforms,e=k*k*(3-2*k);u.uCap.value=k<=0?1e5:260+(7-260)*e;u.uMap.value=e;const tall=u.uCap.value>40;
   for(const m of city.signs||[])m.visible=tall;for(const m of city.screens||[]){m.visible=tall;if(m.userData.frame)m.userData.frame.visible=tall;}
   city.ground.visible=k<.5;for(const m of city.group.children)if(m.isInstancedMesh&&m!==city.buildings)m.visible=k<.5;},
  showRoutes(ids,{highlight=null}={}){for(const [id,r] of Object.entries(routes)){const on=!!ids&&ids.includes(id);r.mesh.visible=on;r.beacon.visible=on;r.mat.uniforms.uLit.value=id===highlight?1:0;r.mat.uniforms.uWidth.value=id===highlight?18:11;}},
  drawOn(id,p){const r=routes[id];if(r){r.mat.uniforms.uProg.value=Math.max(0,Math.min(1,p));r.beacon.material.uniforms.uAlpha.value=p>=1?1:0;}},
  setRouteStyle(id,{color,alpha,width}={}){const r=routes[id];if(!r)return;if(color!=null)r.mat.uniforms.uColor.value.set(color);if(alpha!=null)r.mat.uniforms.uAlpha.value=alpha;if(width!=null)r.mat.uniforms.uWidth.value=width;},
  showRedZone(a){if(!redZone)return;redZone.visible=a>0;redZone.children[0].material.opacity=.18*a;redZone.children[1].material.opacity=.9*a;},
  update(){},
  routeBounds(ids){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const id of ids){const r=routes[id];if(!r)continue;for(const p of r.data.points){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}}return [x0,z0,x1,z1];},
  project(camera,w,h){const out=[],v=new THREE.Vector3();const P=(x,y,z)=>{v.set(x,y,z).project(camera);const sx=(v.x+1)/2*w,sy=(1-v.y)/2*h;return {x:sx,y:sy,inFrame:v.z<1&&sx>=0&&sx<=w&&sy>=0&&sy<=h};};
   for(const [k,s] of Object.entries(data.stationPoints||{}))out.push({id:`station:${k}`,kind:'station',ja:s.ja,en:s.en,lines:s.lines,...P(s.p[0],0,s.p[1])});
   for(const [k,s] of Object.entries(data.taxiPoints||{}))if(s.p)out.push({id:`taxi:${k}`,kind:'taxi',ja:s.ja,...P(s.p[0],0,s.p[1])});
   for(const [k,s] of Object.entries(data.startPoints||{}))out.push({id:`start:${k}`,kind:'start',ja:s.ja,en:s.en,...P(s.p[0],0,s.p[1])});
   for(const [id,r] of Object.entries(routes))if(r.mesh.visible){const e=r.data.points.at(-1);out.push({id:`route:${id}`,kind:'routeEnd',to:r.data.to,ja:r.data.to_ja,distance_m:r.data.distance_m,minutes_80m:r.data.minutes_80m,...P(e[0],0,e[1])});}
   if(redZone?.visible){let cx=0,cz=0;for(const p of data.redZone){cx+=p[0];cz+=p[1];}cx/=data.redZone.length;cz/=data.redZone.length;out.push({id:'redZone',kind:'redZone',ja:'規制図より概略',en:'approx. from the police map',...P(cx,0,cz)});}
   return out;}};
 api.setMode('context');
 return api;}
