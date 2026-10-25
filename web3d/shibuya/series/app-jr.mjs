// Series pilot page 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」: web3d/shibuya/?mode=series&ep=jr&lang=ja&aspect=v
// (app.mjs hands over to start() before it builds its own scene; the v4 modes are untouched).
//
// Scene: city.mjs + series/realism.mjs (PLATEAU LOD2, night look, lamps, signage-free shop fronts) +
// series/station-jr.mjs (procedural JR station, approximate) + series/wide-area.mjs (OSM context / route map) +
// halloween-scene.mjs (police, barriers) + the crowd as ORDINARY people (costume.mjs ordinary mode).
// + series/landmarks-jr.mjs (koban, JR bridge girders, passage divider, 明治通り plate: what the walk captions name).
// + series/people-close.mjs: within 18 m of an eye-level / interior camera the people are drawn as articulated, animated
//   near models (arms-down rest pose, walk/idle/phone cycles by sim time); costume.mjs figures beyond (same colours per id).
// Platform people: derived from the precomputed concourse run (inbound walkers continue along the Yamanote island).
// Crowd: one live JRCrowdSimulation (crowd-jr-worker.mjs 'init'/'advance'): every frame the solver is stepped to the
// director's JR time simAt(t) (monotonic; a resumed segment simply catches up), and the overlay's live numbers are
// that frame's jrState. Route outcomes / median times (tally) and the concourse (interior) people come from ONE
// precomputed run of the same deterministic scenario: ?jrrun=<url> (tools/precompute_series_jr.mjs), otherwise
// computed in a worker at warm-up (slow: several minutes).
// URL: ?mode=series&ep=jr&lang=ja&aspect=v[&record=1][&jrrun=URL][&agents=N][&pr=1][&hs=0]
// Recording API (deterministic, one call per video frame; tools/record_series.py):
//   window.__seriesPlan                 {duration, fps, frames, sections}
//   await window.__warmup()             crowd to JR time T_SIM0, precomputed run loaded → summary
//   await window.__frame(t)             steps the crowd to simAt(t), renders frame t → state (+ window.__seriesOverlay)
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import {buildCity} from '../city.mjs';
import {Post,makeSky} from '../fx.mjs';
import {Vehicles} from '../vehicles.mjs';
import {CostumeCrowd,costumeOf} from '../costume.mjs';
import {HalloweenScene} from '../halloween-scene.mjs';
import {applyRealism,loadLod2} from './realism.mjs';
import {createJRStation,JR_GATES as ST_GATES} from './station-jr.mjs';
import {loadWideArea,createWideArea} from './wide-area.mjs';
import {jrWalkPath,applyShot} from './camera.mjs';
import {configureJR,concourseFrame,JR_START,HIDDEN} from './crowd-jr.mjs';
import {makeDirector,SECTIONS,DURATION,FPS,ALT_ROUTES,PILOT_ROUTES,T_SIM0} from './director-jr.mjs';
import {SeriesOverlay,ALT_COLORS} from './overlay-jr.mjs';
import {createLandmarks} from './landmarks-jr.mjs';
import {PLATFORM_Y} from './station-jr.mjs';
import {NearCrowdLayer} from './people-close.mjs';

const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

export async function start(params){
 window.__ready=false;
 const recording=params.get('record')==='1',lang=params.get('lang')||'ja';
 if(params.get('ep')&&params.get('ep')!=='jr')throw Error('only ep=jr exists (pilot)');
 document.title='🧙ハロウィンの渋谷を脱出せよ！🎃 JR編';
 const style=document.createElement('style');
 style.textContent=`#hud,#brand,#caption,#controls,#disclaimer,footer{display:none!important}html,body{margin:0;background:#000;overflow:hidden}#view{position:fixed;inset:0}#view canvas{width:100%!important;height:100%!important;display:block}#loading{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font:600 16px "Noto Sans CJK JP";z-index:50}`;
 document.head.append(style);document.body.classList.add('series',`lang-${lang}`);if(recording)document.body.classList.add('recording');
 const $=id=>document.getElementById(id);const status=m=>{if($('loading')){$('loading').hidden=false;$('loading').textContent=m;}};
 status('JR編を準備中…');

 // ---------- data ----------
 const base='../data/';
 const [config,osm,plateau,traffic,lod2,wideData]=await Promise.all([json(base+'shibuya_config.json'),json(base+'shibuya_osm.json'),json(base+'shibuya_plateau.json'),json(base+'shibuya_traffic.json'),loadLod2(),loadWideArea()]);
 configureJR(config);
 if(params.has('agents')){const n=Number(params.get('agents'));if(!Number.isInteger(n)||n<0||n>60000)throw Error('agents must be 0..60000');config.agents=n;}
 const runPromise=params.get('jrrun')?json(params.get('jrrun')):null;

 // ---------- renderer / scene ----------
 const W=innerWidth,H=innerHeight,pr=Number(params.get('pr')||1);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:recording,powerPreference:'high-performance'});
 renderer.setPixelRatio(pr);renderer.setSize(W,H,false);renderer.info.autoReset=false;$('view').append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,W/H,.3,9000);
 const sky=makeSky(scene);
 const city=buildCity({scene,osm,plateau,config,theme:null});
 const post=new Post(renderer);post.setSize(Math.round(W*pr),Math.round(H*pr));
 const wide=wideData?createWideArea(scene,wideData,{shared}):null;
 const R=applyRealism({scene,city,shared,post,osm,plateau,lod2,sky,options:{skyline:true,skylineAvoid:wide?.bounds??null}});
 const st=createJRStation(scene,{shared,osm});
 const LM=createLandmarks(scene,{shared});// koban, JR bridge girders, passage divider, 明治通り plate (walk captions, QA M5)
 const vehicles=new Vehicles(scene,traffic);
 for(const o of [...city.reflective,sky,vehicles.mesh])o.layers.enable(1);
 const mirror=new THREE.PerspectiveCamera(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
 city.reflectTarget.setSize(Math.round(W*pr/2),Math.round(H*pr/2));
 function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
  mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
  city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}

 // pilot route ribbons (gate-choice shot): research polylines (alt-routes.json via series_wide_osm.json pilotRoutes)
 const pilot=wideData?.pilotRoutes||{};const ribbons=[];
 for(const [key,id,color] of PILOT_ROUTES){const r=pilot[id];if(!r)continue;const pts=r.points,p=[],s=[],ix=[];let acc=0;
  for(let i=0;i<pts.length;i++){if(i)acc+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l;
   for(const sd of [-1,1]){p.push(pts[i][0]+nx*sd*2.6,1.2,pts[i][1]+nz*sd*2.6);s.push(acc,sd);}if(i){const k=2*i;ix.push(k-2,k-1,k+1,k-2,k+1,k);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('aS',new THREE.Float32BufferAttribute(s,2));g.setIndex(ix);
  const mat=new THREE.ShaderMaterial({uniforms:{uProg:{value:0},uLen:{value:acc},uColor:{value:new THREE.Color(color)},uTime:shared.uTime},transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
   vertexShader:`attribute vec2 aS;varying vec2 vS;void main(){vS=aS;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float uProg,uLen,uTime;uniform vec3 uColor;varying vec2 vS;void main(){if(vS.x>uProg*uLen)discard;float e=smoothstep(1.,.6,abs(vS.y));float ch=step(.5,fract(vS.x/14.-uTime*.8));gl_FragColor=vec4(uColor*(1.1+.5*ch),e*.92);}`});
  const m=new THREE.Mesh(g,mat);m.renderOrder=40;m.frustumCulled=false;m.visible=false;scene.add(m);ribbons.push({key,id,mesh:m,mat});}

 // ---------- crowd (live solver in a worker) ----------
 let worker=null,req=0;const pending=new Map();
 const request=data=>new Promise((resolve,reject)=>{const id=++req;pending.set(id,{resolve,reject});worker.postMessage({id,...data});});
 worker=new Worker(new URL('./crowd-jr-worker.mjs',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data);};
 worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();status(e.message);};
 status('群衆シミュレーションを準備中…');
 let state=await request({type:'init',config,osm,plateau,traffic});
 const nAgents=state.positions.length/2,eStart=config.jr?.warmup??150;
 const crowd=new CostumeCrowd(scene,nAgents,{ordinary:true});
 // series look (QA M1): half the leg/arm swing, soft key light on body faces; near figures dimmed at eye level
 const LOOK={stride:.5,key:.7,nearDim:.6};crowd.uniforms.uStride.value=LOOK.stride;crowd.uniforms.uKey.value=LOOK.key;
 // CPU culling (SwiftShader shades every instance's vertices on the CPU): after crowd.update, agents outside the view
 // frustum / beyond maxDist are dropped by compacting the instance arrays (positions AND styles, so nobody changes
 // clothes); accessory layers are skipped from high cameras (sub-pixel).
 const style0=crowd.body.geometry.getAttribute('aStyle').array.slice(),layer0=crowd.layers.map(L=>L.mesh.geometry.getAttribute('aStyle').array.slice());
 const frustum=new THREE.Frustum(),pm=new THREE.Matrix4(),sph=new THREE.Sphere(new THREE.Vector3(),1.3),keep=new Uint8Array(nAgents);
 function cullCrowd(maxDist,layersOn){pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
  const d=crowd.data,cx=camera.position.x,cz=camera.position.z,m2=maxDist*maxDist;let n=0;
  for(let i=0;i<nAgents;i++){const x=d[4*i],z=d[4*i+1];let k=0;if(x>-5000&&(x-cx)*(x-cx)+(z-cz)*(z-cz)<m2){sph.center.set(x,1,z);k=frustum.intersectsSphere(sph)?1:0;}keep[i]=k;}
  for(let li=0;li<crowd.layers.length;li++){const L=crowd.layers[li],o=L.data,st=L.mesh.geometry.getAttribute('aStyle'),S=st.array,S0=layer0[li];let c=0;
   if(layersOn)for(let k=0;k<L.idx.length;k++){if(!keep[L.idx[k]])continue;for(let q=0;q<4;q++){o[4*c+q]=o[4*k+q];S[4*c+q]=S0[4*k+q];}c++;}
   L.mesh.geometry.instanceCount=c;L.mesh.visible=c>0;L.attr.needsUpdate=true;st.needsUpdate=true;}
  const bs=crowd.body.geometry.getAttribute('aStyle'),S=bs.array;
  for(let i=0;i<nAgents;i++){if(!keep[i])continue;for(let q=0;q<4;q++){d[4*n+q]=d[4*i+q];S[4*n+q]=style0[4*i+q];}n++;}
  crowd.body.geometry.instanceCount=n;crowd.attr.needsUpdate=true;bs.needsUpdate=true;return n;}
 const hs=params.get('hs')==='0'?null:new HalloweenScene({scene,layout:state.layout,city});if(hs?.bubble)hs.bubble.visible=false;
 // interior people (concourse model, sim metres incl. height): one small crowd per 0.5 m height bin (uLift)
 const BINS=18,inner=[];for(let b=0;b<BINS;b++){const c=new CostumeCrowd(scene,120,{ordinary:true,style:i=>costumeOf(i+b*120+7,{ordinary:true})});c.uniforms.uLift.value=b*.5;c.uniforms.uStride.value=LOOK.stride;c.uniforms.uKey.value=LOOK.key;c.place([]);c.body.geometry.instanceCount=0;for(const L of c.layers)L.mesh.geometry.instanceCount=0;inner.push(c);}
 function placeInterior(list){const by=Array.from({length:BINS},()=>[]);for(const p of list){const b=Math.max(0,Math.min(BINS-1,Math.round(p.y/.5)));if(by[b].length<120)by[b].push({x:p.x,z:p.z,angle:p.heading});}
  by.forEach((l,b)=>{const c=inner[b];c.place(l);c.body.geometry.instanceCount=l.length;for(const L of c.layers){let k=0;for(const i of L.idx)if(i<l.length)k++;L.mesh.geometry.instanceCount=Math.min(k,L.idx.length);}c.visible=l.length>0;});}
 const showInterior=v=>{for(const c of inner)c.visible=v&&c.body.geometry.instanceCount>0;plat.visible=v&&plat.body.geometry.instanceCount>0;};
 // Yamanote platform people (QA M2), derived from the same precomputed concourse run: every inbound person who
 // reached the top of the stairs walks on along the island platform to a spot (deterministic per id) and waits;
 // every outbound person (alighting burst) walks from a spot on the platform to the stairs top, arriving when the
 // concourse model starts them down. Simulation-derived (the tag 人の流れ＝シミュレーション stays honest).
 const PCAP=420,plat=new CostumeCrowd(scene,PCAP,{ordinary:true,style:i=>costumeOf(i+5003,{ordinary:true})});plat.uniforms.uLift.value=PLATFORM_Y;plat.uniforms.uStride.value=LOOK.stride;plat.uniforms.uKey.value=LOOK.key;
 plat.place([]);plat.body.geometry.instanceCount=0;for(const L of plat.layers)L.mesh.geometry.instanceCount=0;
 const yamP=st.platforms.find(p=>p.name==='yamanote');const pcum=[0];if(yamP)for(let i=1;i<yamP.strip.length;i++)pcum.push(pcum[i-1]+Math.hypot(yamP.strip[i][0]-yamP.strip[i-1][0],yamP.strip[i][1]-yamP.strip[i-1][1]));
 const hsh=n=>{let t=(n*2654435761)>>>0;t^=t>>>15;t=Math.imul(t,2246822519)>>>0;t^=t>>>13;return (t>>>0)/4294967296;};
 function onStrip(d,lat){const S=yamP.strip;d=Math.max(0,Math.min(pcum.at(-1),d));let i=1;while(i<S.length-1&&pcum[i]<d)i++;const a=S[i-1],b=S[i],u=(d-pcum[i-1])/((pcum[i]-pcum[i-1])||1);
  const x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,w=Math.max(.4,(a[2]+(b[2]-a[2])*u)-1.5),dx=a[3],dz=a[4];return {x:x+dz*lat*w,z:z-dx*lat*w,dx,dz};}
 function platformPeople(cr,t){if(!yamP||!cr)return [];const out=[],top=0,speed=1.15;
  for(const p of cr.people){const h1=hsh(p.id*3+1),h2=hsh(p.id*3+2),D=6+h1*Math.min(90,pcum.at(-1)-8),lat=h2*2-1;
   if(p.dir>0&&p.doneAt!=null){const dt=t-p.doneAt;if(dt<0||dt>150)continue;const d=Math.min(D,top+dt*speed),q=onStrip(d,lat*Math.min(1,d/6));const walking=d<D;out.push({x:q.x,z:q.z,y:PLATFORM_Y,id:p.id,speed:walking?speed:0,angle:walking?Math.atan2(q.dx,q.dz):Math.atan2(q.dx,q.dz)+(h2>.5?1.4:-1.4)});}
   else if(p.dir<0){const dt=p.t0-t;if(dt<0||dt>D/speed+20)continue;const d=Math.min(D,dt*speed),q=onStrip(d,lat*Math.min(1,d/6));out.push({x:q.x,z:q.z,y:PLATFORM_Y,id:p.id,speed:d<D?speed:0,angle:Math.atan2(-q.dx,-q.dz)});}
   if(out.length>=PCAP)break;}
  return out;}
 function placePlatform(list){plat.place(list);plat.body.geometry.instanceCount=list.length;for(const L of plat.layers){let k=0;for(const i of L.idx)if(i<list.length)k++;L.mesh.geometry.instanceCount=Math.min(k,L.idx.length);}}
 showInterior(false);
 const nearL=new NearCrowdLayer(scene,{shared,radius:18,minDist:1.1});// near-camera people (series/people-close.mjs)

 // ---------- director ----------
 let run=null;
 const walk=jrWalkPath(osm,'hachiko',{insideBuilding:R.insideBuilding});
 const G=ST_GATES,gatePts={A:G.hachiko,B:G.south,C:G.newSouth,D:G.central};
 const taxi=wideData?.taxiPoints?.sakura_terrace?.p??[112.1,311.9];
 let D=makeDirector({walk,dolly:st.dolly('hachiko'),wide,pilot,gates:gatePts,taxi});
 const plan={duration:DURATION,fps:FPS,frames:DURATION*FPS,sections:SECTIONS.map(s=>[...s]),simStart:T_SIM0,warmup:eStart,agents:nAgents,baseAgents:config.agents};
 window.__seriesPlan=plan;
 const overlay=new SeriesOverlay(document.body,{lang,persistentParody:params.get('parody')==='1'});
 // design-system skin (ui/pilot-skin.mjs: shared HUD fonts/panels; ?skin=flat = the original flat look)
 if(params.get('skin')!=='flat'){try{const m=await import('./ui/pilot-skin.mjs');await m.applyPilotSkin(document);}catch(e){console.warn('pilot skin unavailable:',e.message);}}

 // ---------- sim stepping ----------
 let simAbs=state.time;// absolute solver time requested so far (the worker keeps the remainder)
 async function stepTo(target,camera){let last=state;
  while(simAbs<target-1e-9){const d=Math.min(30,target-simAbs);const final=simAbs+d>=target-1e-9;last=await request({type:'advance',seconds:d,camera:final?camera:undefined});simAbs+=d;}
  if(last===state&&camera)last={...state,jr:(await request({type:'stats',camera})).jr};// no step this frame (sim held): fresh stats
  state=last;return state;}

 // ---------- one frame ----------
 const v3=new THREE.Vector3();
 function project(x,y,z){v3.set(x,y,z).project(camera);const sx=(v3.x+1)/2*W,sy=(1-v3.y)/2*H;return {x:sx,y:sy,inFrame:v3.z<1&&v3.z>-1&&sx>=0&&sx<=W&&sy>=0&&sy<=H};}
 let lastT=null,lastSection=null;
 async function frame(t){const T0=performance.now();const shot=D.shotAt(t),cam=shot.cam;
  // camera point for the "near the camera" stats: the start point in the mission shot, else the camera's ground point
  const cpt=shot.section==='mission'?{x:JR_START.at[0],z:JR_START.at[1]}:{x:cam.at?cam.at[0]:cam.look.x,z:cam.at?cam.at[1]:cam.look.z};
  await stepTo(eStart+shot.sim,cpt);const simMs=performance.now()-T0;
  const dt=state.dt||.1,alpha=clamp(state.alpha||0),dtSim=lastT==null?0:Math.max(0,(t-lastT))*shot.rate;lastT=t;
  // hide simulated people within NEAR m of an eye-level camera (QA M1: close figures read as mannequins / fill the lens)
  const NEAR=shot.section==='walk'?1.3:.9;
  if(shot.eye){const cx=cam.pos.x,cz=cam.pos.z,P=state.positions,Q=state.previous;for(let i=0;i<nAgents;i++){const x=P[2*i],z=P[2*i+1];if(Math.abs(x-cx)<NEAR&&Math.abs(z-cz)<NEAR&&Math.hypot(x-cx,z-cz)<NEAR){P[2*i]=Q[2*i]=HIDDEN;P[2*i+1]=Q[2*i+1]=HIDDEN;}}}
  crowd.update(state,alpha,dtSim);
  const simTime=state.time-dt+alpha*dt;
  hs?.update(simTime);hs?.gates(state.gates,dtSim);
  vehicles.update(Math.max(0,state.clock-dt+alpha*dt));
  // look by section
  const k=shot.map;
  if(wide){wide.setMapAmount(k);wide.mapCity(city,k);wide.group.visible=true;
   const alt=['alt','taxi','fall'].includes(shot.section);wide.showRoutes(alt?[...ALT_ROUTES]:null,{highlight:null});
   ALT_ROUTES.forEach((id,i)=>{wide.drawOn(id,shot.section==='alt'?clamp((shot.local-.9-i*.45)/1.2):1);const r=wide.routes[id];// QA M7: wide solid ribbons in the box colours
    if(r&&alt){const c=ALT_COLORS[r.data.to];if(c)wide.setRouteStyle(id,{color:new THREE.Color(c).multiplyScalar(.45),width:30,alpha:shot.section==='alt'?1:.55});r.mat.uniforms.uLit.value=shot.section==='alt'?1:0;}});
   wide.showRedZone(alt?clamp((t-35.2)/.6)*(shot.section==='alt'?1:.3):0);}
  const flat=k>.5;sky.visible=!flat;if(R.glow)R.glow.visible=!flat;if(R.skyline)R.skyline.visible=!flat;R.group.visible=!flat;st.group.visible=!flat;
  crowd.visible=!flat&&shot.section!=='cheat'&&shot.section!=='end';if(hs)hs.visible=!flat&&!shot.interior;
  vehicles.mesh.visible=!flat&&shot.section!=='walk';// the walk is on the road under the tracks, closed to vehicles from ~16:00 (MEAS)
  LM.visible=!flat&&!shot.interior;crowd.uniforms.uNearDim.value=shot.eye?LOOK.nearDim:0;
  R.setInterior(shot.interior,{keepCity:true});R.setDetail(shot.aerial||flat?'aerial':'street');
  for(const r of ribbons){r.mesh.visible=shot.section==='gates';r.mat.uniforms.uProg.value=clamp((shot.local-.2-(r.key==='A'?0:r.key==='B'?.3:.6))/1.4);}
  camera.far=cam.far||9000;applyShot(camera,cam);nearL.begin();
  if(shot.interior){const cr=run?.concourse?.run,tS=eStart+shot.sim,fr=cr?concourseFrame(cr,tS):null,far=p=>Math.hypot(p.x-cam.pos.x,p.z-cam.pos.z)>1.1||Math.abs(p.y+1.6-cam.pos.y)>1.2;
   placeInterior(nearL.takeList((fr?.people||[]).filter(far),camera,{idBase:300000}));placePlatform(nearL.takeList(platformPeople(cr,tS).filter(p=>Math.hypot(p.x-cam.pos.x,p.z-cam.pos.z)>1.1),camera,{idBase:400000}));showInterior(true);
   for(const c of [...inner,plat]){c.uniforms.uNearDim.value=LOOK.nearDim*.4;c.uniforms.uFill.value=c===plat?.32:.18;}}else showInterior(false);
  if(crowd.visible&&(shot.eye||cam.pos.y<6))nearL.takeCrowd(crowd,camera);
  const nearSt=nearL.end({animTime:simTime,camera,fill:shot.interior?.2:0});nearL.visible=!flat&&shot.section!=='cheat'&&shot.section!=='end';
  const drawn=crowd.visible?cullCrowd(shot.eye?220:4000,cam.pos.y<40):0;
  shared.uTime.value=t;post.settings.uFade.value=shot.fade;post.settings.uExposure.value=shot.aerial&&!flat?1.22:shot.interior?.85-.25*clamp((cam.pos.y-3)/5):1;// QA M2: platform level not blown out
  R.update(t,camera);
  renderer.info.reset();if(!flat)renderReflection();post.render(scene,camera);
  const gl=renderer.getContext();const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);// GPU finish (honest ms)
  const renderMs=performance.now()-T0-simMs;
  // overlay
  const jr=state.jr;const P=jr?.player;
  const proj={start:project(JR_START.at[0],0,JR_START.at[1]),player:P?project(P.x,1.8,P.z):null,gates:Object.fromEntries(Object.entries(gatePts).map(([key,g])=>[key,project(g.x,(g.y||0)+2,g.z)])),
   taxi:project(taxi[0],0,taxi[1]),stations:[],redZone:null};
  if(wide&&flat){for(const s of wide.project(camera,W,H)){if(s.kind==='station')proj.stations.push({...s,key:s.id.split(':')[1]});if(s.id==='start:H')proj.altStart=s;if(s.kind==='redZone')proj.redZone=s;}}
  const rec=overlay.update({t,section:shot.section,local:shot.local,u:shot.u,clip:shot.clip,wp:shot.wp,rate:shot.rate,jr,proj,W,H});
  rec.shot=cam.name;rec.sim={t:shot.sim,abs:state.time,rate:shot.rate};rec.ms={sim:Math.round(simMs),render:Math.round(renderMs)};rec.peopleDrawn=drawn;rec.nearPeople=nearSt;
  window.__seriesOverlay=rec;lastSection=shot.section;
  return {t,frame:shot.frame,section:shot.section,shot:cam.name,simTime:state.jr?.simTime??null,time:state.time,ms:rec.ms,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,agents:nAgents};}

 // ---------- precomputed run (tally, interior) ----------
 async function loadRun(){if(run)return run;
  if(runPromise)run=await runPromise;
  else{status('脱出シミュレーションを計算中（数分）…');const w=new Worker(new URL('./crowd-jr-worker.mjs',import.meta.url),{type:'module'});
   run=await new Promise((resolve,reject)=>{w.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);w.onerror=e=>reject(Error(e.message));w.postMessage({id:1,type:'precompute',config,osm,plateau,traffic});});w.terminate();}
  if(run.agents!=null&&run.agents!==config.agents)console.warn(`jr run computed with ${run.agents} agents, page has ${config.agents}`);
  overlay.run=run;
  const A=run.summary.routes.find(r=>r.key==='A');if(A?.player?.doneAt!=null)D=makeDirector({walk,dolly:st.dolly('hachiko'),wide,pilot,gates:gatePts,taxi,insideSim:Math.ceil(A.player.doneAt*2)/2+.5});
  plan.insideSim=D.insideSim;return run;}

 window.__warmup=async()=>{await loadRun();await stepTo(eStart+T_SIM0,null);const s=await frame(0);$('loading').hidden=true;
  return {...s,run:{key:run.key??null,agents:run.agents??null,routes:run.summary.routes.map(r=>({key:r.key,outcome:r.outcome,timeP50:r.timeP50,player:r.player})),summary:run.summary}};};
 window.__frame=async t=>frame(t);
 window.__seriesDebug={scene,camera,renderer,post,R,st,wide,city,crowd,D,get state(){return state;},get run(){return run;},overlay};
 window.__ready=true;
 if(!recording){// live preview: warm up, then play the director at real time (the crowd catches up per frame)
  await window.__warmup();let t0=null;const loop=async now=>{t0??=now;const t=((now-t0)/1000)%DURATION;if(t<(lastT??0))location.reload();await frame(t);requestAnimationFrame(loop);};requestAnimationFrame(loop);}
}
