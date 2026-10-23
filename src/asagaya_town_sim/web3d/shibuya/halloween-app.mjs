// Halloween night mode of the 3D view (?mode=halloween), v4 "🧙ハロウィンの渋谷を脱出せよ！🎃 /
// Escape Shibuya on Halloween!". Loaded on demand by app.mjs, which hands over its renderer, scene,
// solver worker and helpers. The visible crowd is the Halloween crowd (worker 1); the five escape
// levels (escape.mjs) are one deterministic run precomputed at warm-up in a second worker
// (escape-worker.mjs, terminated afterwards) and played back per video frame (escapeFrameFrom).
// The map layer is escape-scene.mjs (no words in WebGL); all text is DOM (escape-overlay.mjs).
// window.__hwOverlay keeps every shown sim number next to its source value plus the fact ids on
// screen, so the recorder can check them frame by frame (tools/record_shibuya.py check_overlay).
import {HALLOWEEN} from './halloween.mjs';
import {DISPERSAL} from './dispersal.mjs';
import {CROWD_2026} from './sources-halloween.mjs';
import {CostumeCrowd} from './costume.mjs';
import {HalloweenScene,THEME} from './halloween-scene.mjs';
import {shared} from './shaders.mjs';
import {ESCAPE,escapeFrameFrom,frameLog} from './escape.mjs';
import {createEscapeScene,MapBase,STATION,heartbeat} from './escape-scene.mjs';
import {EscapeOverlay,endCard,fmt,p2,mmss} from './escape-overlay.mjs';
import {shotAt,setCameras,START_CLOCK,SCENE_SECONDS,CREDIT_SECONDS,LIVE_SECONDS,LEVELS,BEAT,vhsAt,LEVEL_START,LEVEL_SECONDS} from './director-halloween.mjs';
export {CostumeCrowd,THEME,shotAt,fmt,p2,mmss};
export const liveSeconds=LIVE_SECONDS,liveShotAt=t=>shotAt(t%LIVE_SECONDS);

export function configure(config){config.mode='halloween';config.agents=HALLOWEEN.agents;config.hour=HALLOWEEN.hour;config.quota=HALLOWEEN.quota;config.promotion=false;}
// Orange/purple grade, purple haze, dry night.
export function look({shared,post}){shared.uFogColor.value.set(0x120716);shared.uFogDensity.value=.0019;shared.uSkyTop.value.set(0x020108);shared.uSkyHorizon.value.set(0x2a0d2c);shared.uWet.value=.32;
 const s=post.settings;s.uShadowTint.value.set(.012,-.006,.03);s.uHighTint.value.set(.06,.018,-.03);s.uSaturation.value=1.12;
 s.uBloom.value=.2;s.uAberration.value=.002;shared.uFacade.value=1;}

// Single-language overlays: both languages are in the DOM, body.lang-en / body.lang-ja shows one.
export const L=(en,ja)=>`<span class="l-en">${en}</span><span class="l-ja">${ja}</span>`;
export const bi=v=>{const k=String(v).indexOf(' · ');return k<0?String(v):L(String(v).slice(0,k),String(v).slice(k+3));};
// v3 helpers kept for the dispersal tools/tests (the v4 video no longer shows the dispersal runs).
export const exitClearText=e=>e.clearAt===0&&e.peakRun<=DISPERSAL.exitClear?'never dense · 密集なし':e.clearAt==null?'not cleared · 未解消':mmss(e.clearAt);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const SWEEP_METRICS={remaining:fmt,stationEmptyAt:s=>mmss(s)??'25:00+',denseClearedAt:s=>mmss(s)??'25:00+',crushPersonMinutes:fmt,peakCell:p2};
export function sweepRanges(sweep){const out={n:sweep.scenarios.length};
 for(const [metric,f] of Object.entries(SWEEP_METRICS))for(const k of ['none','managed']){const v=sweep.scenarios.map(q=>q[k][metric]).sort((a,b)=>(a??Infinity)-(b??Infinity)),lo=f(v[0]),hi=f(v.at(-1));(out[metric]??={})[k]=lo===hi?lo:`${lo}–${hi}`;}
 out.fewerWaiting=sweep.scenarios.filter(q=>q.managed.remaining<q.none.remaining).length;
 out.laterStation=sweep.scenarios.filter(q=>(q.managed.stationEmptyAt??Infinity)>(q.none.stationEmptyAt??Infinity)).length;
 return out;}

// Level playback: escape time shown at local time u. Walkers start at BEAT.walk; the example route's
// first walker arrives at about BEAT.stamp (speed = its travel / walkSpan); during BEAT.ff the clock
// fast-forwards (eased) to level.vsEnd = 1 s after the last route's first walker arrived (VS beat).
const easeIO=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
export function levelSimTime(level,u){
 if(u<=BEAT.ff[0])return Math.max(0,u-BEAT.walk)*level.speed;
 const a=(BEAT.ff[0]-BEAT.walk)*level.speed,end=Math.max(a,level.vsEnd??a);return a+(end-a)*easeIO(clamp((u-BEAT.ff[0])/(BEAT.ff[1]-BEAT.ff[0])));}
// Map mode 0..1 over video time: the 3D city (broadcast/title) sinks into a flat game map during the rules.
export const mapAmount=(sec,t)=>sec==='broadcast'||sec==='title'?0:sec==='rules'?clamp((t-3.8)/1.5):1;

const CSS=`
.lang-en .l-ja,.lang-ja .l-en{display:none!important}
body.hw4 #hud,body.hw4 #brand,body.hw4 #caption,body.hw4.recording footer,body.hw4.recording #disclaimer{display:none!important}
#hw-wait{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);font:600 13px Inter,"Noto Sans CJK JP",sans-serif;color:#D9C2FF;background:#0B0612cc;padding:6px 14px;border-radius:8px;z-index:30}
`;

export async function install(api){
 const {THREE,scene,camera,renderer,post,city,crowd,vehicles,topdown,config,$,n,request}=api;
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);document.body.classList.add('hw4');
 document.title='🧙ハロウィンの渋谷を脱出せよ！🎃 — Escape Shibuya on Halloween!';
 const lang=api.params.get('lang')||(api.recording?'ja':(navigator.language||'').startsWith('ja')?'ja':'en');
 window.__setLang=l=>{document.body.classList.remove('lang-en','lang-ja');document.body.classList.add(`lang-${l}`);return l;};window.__setLang(lang);
 window.__setVcut=v=>{document.body.classList.toggle('vcut',!!v);return !!v;};
 $('disclaimer').innerHTML=L('Toy model scaled to public figures — not a prediction · every on-screen count is counted from the simulated people','公開値を参考にしたトイモデル・予測ではない ・ 画面の人数はすべてシミュレーション上の人数から集計');
 const layout=api.state.layout;if(!layout)throw Error('Halloween layout missing from the solver');
 const hs=new HalloweenScene({scene,layout,city});
 const overlay={};window.__hwOverlay=overlay;
 const sigColor=(state)=>{const ph=state.phase,cyc=state.clock%config.calibration.signal.cycle_s,sig=config.calibration.signal;city.signalMaterial.uniforms.uPed.value.set(ph==='walk'?0x2bff9a:0xff2a1a);city.signalMaterial.uniforms.uCar.value.set(ph==='vehicles'?(cyc>sig.cycle_s-sig.all_red_s-3?0xffb000:0x2bffb0):0xff2a1a);};
 let renderTime=null;

 // ---- escape run (precomputed once) ----
 let E=null,em=null,ui=null,heat0=null,heatEnd=null,base=null;const streetPicks={};const waitEl=document.createElement('div');waitEl.id='hw-wait';
 async function precompute(){if(E)return E;const w=new Worker(new URL('./escape-worker.mjs',import.meta.url),{type:'module'});
  if(!api.recording){waitEl.innerHTML=L('preparing the escape simulation (a few minutes)…','脱出シミュレーションを準備中（数分）…');document.body.append(waitEl);}
  const data=await new Promise((resolve,reject)=>{w.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);w.onerror=e=>reject(Error(e.message));w.postMessage({id:1,config:{...config,mode:'halloween'},osm:api.osm,plateau:api.plateau,traffic:api.traffic});});
  w.terminate();waitEl.remove();E=data;
  const lastT=E.keyframes.at(-1).t;
  for(const lv of E.levels){const S=E.summary.levels.find(l=>l.key===lv.key);lv.vsEnd=Math.min(lastT,Math.max(...S.branches.map(b=>b.player.arriveAt??0))+1);}
  em=createEscapeScene(scene,E.levels);ui=new EscapeOverlay({levels:E.levels,summary:E.summary,agents:n});
  base=new MapBase(scene,api.osm);
  // Fitted cameras: every level inside the map area between the panels (and the 9:16 column).
  const cams={};for(const lv of E.levels)cams[lv.key]=fitCamera(lv.key,{azimuth:-20,pitch:62});
  cams.overview=fitCamera(null,{azimuth:-10,pitch:70,fov:44});
  // Street names per level: picked once from the fitted camera (deterministic; the camera only drifts 4 %).
  for(const lv of E.levels){const c=cams[lv.key],cam=new THREE.PerspectiveCamera(c.fov,1280/720,.5,5000);cam.position.copy(c.pos);cam.lookAt(c.look);cam.updateMatrixWorld();
   const avoid=[[lv.start.x,lv.start.z],[STATION.x,STATION.z]];for(const B of lv.branches){B.path.forEach((p,k)=>{if(k%3===0)avoid.push(p);});avoid.push([B.target.x,B.target.z]);if(B.offsim)avoid.push(B.offsim[0]);}
   streetPicks[lv.key]=base.pick(cam,{rect:{x0:300,x1:980,y0:100,y1:575},avoid});}cams.rules={...cams.overview};cams.question={...cams.overview,pos:cams.overview.pos.clone().lerp(cams.overview.look,.04),drift:.015};
  setCameras(cams);
  heat0=E.keyframes[0].levels.map(l=>l.heat);
  heatEnd=E.levels.map(lv=>escapeFrameFrom(E.keyframes,lv.key,levelSimTime(lv,5),E.keyframe).heat);
  window.__hwEscape={levels:E.levels,summary:E.summary,keyframe:E.keyframe,count:E.keyframes.length,ms:E.ms};
  return E;}
 // Fit the level's start, routes (A, B and the first 120 m of a long walk) and icons into a screen
 // rect between the panels (inside the 9:16 column x 160–1120); the camera is then shifted so the
 // rect's centre (not the screen centre) frames the level.
 const RECT_LEVEL={x0:318,x1:962,y0:150,y1:505},RECT_ALL={x0:476,x1:1104,y0:96,y1:632};
 function fitCamera(key,{azimuth=-20,pitch=58,fov=42,rect=key==null?RECT_ALL:RECT_LEVEL}={}){
  const lvs=key==null?E.levels:[E.levels.find(l=>l.key===key)],pts=[];
  for(const lv of lvs){pts.push([lv.start.x,lv.start.z]);for(const B of lv.branches){if(key==null&&!B.recommended)continue;
   let len=0,prev=null;for(const p of B.path){if(prev)len+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);prev=p;if(B.kind==='walk-alt'&&len>120)break;pts.push(p);}
   if(B.kind!=='walk-alt'&&B.target?.x!=null)pts.push([B.target.x,B.target.z]);}}
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const p of pts){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
  // at least 170 m of map around a level (short routes still show the streets and the station nearby)
  const MIN=170;if(x1-x0<MIN){const c=(x0+x1)/2;x0=c-MIN/2;x1=c+MIN/2;pts.push([x0,(z0+z1)/2],[x1,(z0+z1)/2]);}if(z1-z0<MIN*.6){const c=(z0+z1)/2;z0=c-MIN*.3;z1=c+MIN*.3;pts.push([(x0+x1)/2,z0],[(x0+x1)/2,z1]);}
  const W=1280,H=720,dx=(rect.x0+rect.x1-W)/2,dy=(rect.y0+rect.y1-H)/2,look=new THREE.Vector3((x0+x1)/2,0,(z0+z1)/2),cam=new THREE.PerspectiveCamera(fov,W/H,.5,5000),a=THREE.MathUtils.degToRad(azimuth),e=THREE.MathUtils.degToRad(pitch);
  const dir=new THREE.Vector3(-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)),v=new THREE.Vector3();
  const fits=d=>{cam.position.copy(look).addScaledVector(dir,d);cam.lookAt(look);cam.updateMatrixWorld();cam.updateProjectionMatrix();
   for(const p of pts)for(const y of [0,12]){v.set(p[0],y,p[1]).project(cam);const sx=(v.x+1)/2*W+dx,sy=(1-v.y)/2*H+dy;if(v.z>1||sx<rect.x0||sx>rect.x1||sy<rect.y0||sy>rect.y1)return false;}return true;};
  let lo=20,hi=4000;for(let k=0;k<40;k++){const m=(lo+hi)/2;if(fits(m))hi=m;else lo=m;}
  cam.position.copy(look).addScaledVector(dir,hi);cam.lookAt(look);cam.updateMatrixWorld();
  const up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1),right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),mpp=2*hi*Math.tan(THREE.MathUtils.degToRad(fov)/2)/H;
  const off=up.multiplyScalar(dy*mpp).add(right.multiplyScalar(-dx*mpp));return {pos:cam.position.clone().add(off),look:look.clone().add(off),fov};}

 // ---- drawing ----
 // RED ALERT source (simulated density): the player's cell, and once every route ribbon is drawn the densest
 // route of the level (so a packed rival route, e.g. across the Scramble, also triggers it, labelled "on route X").
 const alertSource=(lv,u)=>u>=BEAT.draw[1]?{source:'max',branch:'all'}:{source:'player'};
 const dangerBar=(lv,u)=>{let s=0;for(let k=0;k<6;k++)s+=escapeFrameFrom(E.keyframes,lv.key,levelSimTime(lv,Math.max(0,u-k/30)),E.keyframe).danger.value;return s/6;};
 function drawEscape(shot){if(!E||!shot){if(em)em.visible=false;return null;}
  em.visible=true;const sec=shot.section,t=shot.t;let state=null;
  em.setWalkers(null);em.setPlayer(0,0,false);em.heat.pulse=0;em.heat.flash=0;
  if(sec==='broadcast'||sec==='title'||sec==='rules'){em.showLevel(null);em.hidePins();em.setHeat(heat0);
   em.setHeatAlpha(sec==='broadcast'?1:sec==='title'?.85:.7);em.heat.pulse=sec==='broadcast'?1:.4;em.heat.flash=sec==='broadcast'&&shot.local>=.2&&shot.local<.2+2/30?1:0;
   if(sec==='rules')E.levels.forEach((lv,k)=>{const d=t-(4.1+.2*k);if(d>=0)em.dropPin(lv.key,d);});}
  else if(sec==='level'){const lv=E.levels.find(l=>l.key===shot.level),u=shot.local;em.hidePins();em.showLevel(lv.key);em.heat.pulse=.25;
   if(u>=BEAT.pin)em.dropPin(lv.key,u-BEAT.pin);em.drawOn(lv.key,clamp((u-BEAT.draw[0])/(BEAT.draw[1]-BEAT.draw[0])));
   em.highlight(lv.key,lv.branches.find(b=>b.recommended).key,clamp((u-BEAT.lit[0])/(BEAT.lit[1]-BEAT.lit[0])));
   state=escapeFrameFrom(E.keyframes,lv.key,levelSimTime(lv,u),E.keyframe);
   em.applyState(state,{heat:true,walkers:u>=BEAT.walk,player:u>=BEAT.walk,outcomes:false,danger:alertSource(lv,u)});em.setHeatAlpha(.9);
   // ✔/✖ only where the route ends inside the sim (gate / in-sim taxi stand); walks to other stations and the
   // off-sim taxi stretch only reach the sim edge.
   for(const b of state.branches){const B=lv.branches.find(x=>x.key===b.key);em.setOutcome(lv.key,b.key,B.kind==='walk-alt'||B.offsim?null:b.outcome);}}
  else{const end=sec==='question'||sec==='gameover';em.hidePins();em.showAll({recommendedOnly:true,opacity:end?.55:1});em.setHeat(heatEnd);em.setHeatAlpha(end?.4:.7);
   for(const S of E.summary.levels){const ex=S.branches.find(b=>b.recommended);em.setOutcome(S.key,ex.key,ex.outcome);}}
  return state;}
 // Map mode: buildings sink to flat blocks, signs/screens hidden, basemap (roads, JR station) fades in.
 function setMapMode(k){const u=city.buildings.material.uniforms,e=k*k*(3-2*k);u.uCap.value=k<=0?1e5:260+(7-260)*e;u.uMap.value=e;
  const tall=u.uCap.value>40;for(const m of city.signs||[])m.visible=tall;for(const m of city.screens||[]){m.visible=tall;if(m.userData.frame)m.userData.frame.visible=tall;}
  city.groundMat.uniforms.uReflectOn.value=1-e;if(base)base.opacity=clamp((k-.35)/.5)*.95;}
 // DOM street/station labels: projected anchors (current frame camera).
 function streetLabels(shot,W,H){const out=[],v=new THREE.Vector3(),k=mapAmount(shot.section,shot.t);if(!E||k<.8)return out;
  const P=(x,z)=>{v.set(x,0,z).project(camera);return {x:(v.x+1)/2*W,y:(1-v.y)/2*H,front:v.z<1};};
  const s=P(STATION.x,STATION.z);out.push({id:'station',kind:'station',ja:STATION.ja,en:STATION.en,x:s.x,y:s.y,inFrame:s.front&&s.x>=0&&s.x<=W&&s.y>=0&&s.y<=H,angle:0});
  if(shot.section==='level')for(const st of streetPicks[shot.level]||[]){const a=P(st.x,st.z),b=P(st.x+st.dx*6,st.z+st.dz*6);let ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;if(ang>90)ang-=180;if(ang<-90)ang+=180;ang=Math.max(-60,Math.min(60,ang));
   out.push({id:`street:${st.key}`,kind:'street',ja:st.ja,en:st.en,x:a.x,y:a.y,inFrame:a.front&&a.x>=0&&a.x<=W&&a.y>=0&&a.y<=H,angle:Math.round(ang)});}
  return out;}

 function drawHW(shot,dtSim){if(!api.state)return;api.resize();const state=api.state,dt=state.dt||.1;let alpha;
  if(api.recording)alpha=state.alpha||0;else{renderTime=Math.min(state.time,Math.max(state.time-dt,(renderTime??state.time-dt)+dtSim));alpha=(renderTime-(state.time-dt))/dt;}
  alpha=Math.min(1,Math.max(0,alpha));const simTime=state.time-dt+alpha*dt;shared.uTime.value=simTime;
  crowd.visible=true;crowd.update(state,alpha,dtSim);hs.update(simTime);hs.gates(state.gates,dtSim);
  const clock=state.clock-dt+alpha*dt,cars=vehicles.update(state.clearanceHold?state.clock:Math.max(0,clock));
  topdown.roles=state.roles;topdown.update(crowd,cars,dtSim);
  api.placeCamera(shot);shared.uTrailGain.value=shot?shot.trail:.3;sigColor(state);
  shared.uScreenGlow.value.setHSL(.07+.7*(.5+.5*Math.sin(simTime*.25)),.85,.5);
  const esc=drawEscape(shot);setMapMode(shot?mapAmount(shot.section,shot.t):0);
  const dim=shot?.section==='question'?.62:shot?.section==='gameover'?.62:1;post.settings.uFade.value=(shot?shot.fade:1)*dim;city.groundMat.uniforms.uReflectOn.value=1;
  // Parody post FX (latched per frame): VHS/glitch on transitions only (director vhsAt), red alert vignette
  // on the levels, driven by the SIMULATED density (em.danger, set by applyState) × heartbeat.
  if(em&&shot){const v=vhsAt(shot.t);if(v>0)em.setVhs(v,{seed:Math.floor(shot.t*4)});if(shot.section==='level')em.setAlertVignette(Math.min(1,em.dangerPulse*(.6+.4*heartbeat(shot.t))));}
  if(em)em.update(shot?shot.t:simTime,camera);
  renderer.info.reset();api.renderReflection();post.render(scene,camera);
  // Overlay (DOM): every number from this frame's escape playback state.
  for(const k of Object.keys(overlay))delete overlay[k];
  if(ui&&shot){const W=renderer.domElement.clientWidth||innerWidth,H=renderer.domElement.clientHeight||innerHeight;
   const proj=em.project(camera,W,H,shot.section==='level'?shot.level:null);
   const lv=shot.level?E.levels.find(l=>l.key===shot.level):null;
   Object.assign(overlay,ui.update({t:shot.t,shot,state:esc,proj,streets:streetLabels(shot,W,H),rule:ESCAPE.rule,alert:em.danger,dangerBar:lv?dangerBar(lv,shot.local):null,simTimeOf:lv?u=>levelSimTime(lv,u):null}));
   if(esc){overlay.frameLog=frameLog(esc);overlay.levelSpeed=lv.speed;overlay.simLimit=lv.branches.find(b=>b.recommended).simLimit;}}
  overlay.frameShot=shot?.name??null;
  const s=api.state;
  window.__shibuyaState={ready:true,mode:'halloween',agents:n,hour:config.hour,fps:api.fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,phase:s.phase,clock:s.clock,time:s.time,
   active:s.active,waiting:s.waiting,approaching:s.approaching,held:s.held,heldPeak:s.heldPeak,attending:s.attending,density:s.density,admitted:s.admitted,completed:s.completed,lastCycle:s.lastCycle,released:s.released,cutoffs:s.cutoffs,
   teleports:s.teleports,rescued:s.rescued,laneViolations:s.laneViolations,deferred:s.deferred,clearanceHold:s.clearanceHold,vehicles:cars.length,camera:api.mode,shot:shot?.name??null,section:shot?.section??null,pumpkins:hs.pumpkinCount,officers:layout.officers.length,djLine:hs.line,
   escape:esc?{level:esc.level,simTime:esc.simTime,danger:esc.danger,alert:em?(({value,source,pulse})=>({value,source,pulse}))(em.danger):null,player:{branch:esc.player.branch,arrived:esc.player.arrived,arriveAt:esc.player.arriveAt,denseSeconds:esc.player.denseSeconds,outcome:esc.player.outcome}}:null};}
 api.setDraw(drawHW);
 if(!api.recording)precompute().catch(e=>{waitEl.textContent=String(e);});

 // ---- Recording API (deterministic: one call per video frame) ----
 window.__videoPlan={scene:SCENE_SECONDS,credits:CREDIT_SECONDS,startClock:START_CLOCK,estimate:CROWD_2026.estimate,levels:LEVELS};
 window.__hwEnd=endCard(n);
 window.__warmup=async(target=START_CLOCK)=>{while(api.state.clock<target-1e-6)api.state=await request({type:'advance',seconds:Math.min(5,Math.max(.1,target-api.state.clock))});
  await precompute();drawHW(shotAt(0),0);return {...window.__shibuyaState,escape:window.__hwEscape};};
 const advance=async shot=>{const dt=shot.speed/30;if(shot.sim==='main')api.state=await request({type:'advance',seconds:dt});return dt;};
 window.__frame=async videoTime=>{const shot=shotAt(videoTime),t=performance.now(),dt=await advance(shot);api.setSim(performance.now()-t);drawHW(shot,dt);return window.__shibuyaState;};
 window.__skip=async videoTime=>{await advance(shotAt(videoTime));};
 window.__render=()=>{drawHW(api.mode==='cinema'?liveShotAt(0):null,0);return window.__shibuyaState;};
 // Preview helper: the alert value (same 'max' source as applyState: player cell vs lit example route) on every
 // level frame, so preview stills can be taken where the simulated density triggers the RED ALERT.
 const alertTimeline=()=>E.levels.flatMap((lv,i)=>{const out=[],t0=LEVEL_START+i*LEVEL_SECONDS;
  for(let f=0;f<LEVEL_SECONDS*30;f++){const u=f/30,st=escapeFrameFrom(E.keyframes,lv.key,levelSimTime(lv,u),E.keyframe),pv=st.danger.value,D=alertSource(lv,u),R=D.source==='player'?{value:0,key:null}:em.routeDanger(st,D.branch??lv.branches.find(b=>b.recommended).key);
   out.push({t:Math.round((t0+u)*1000)/1000,level:lv.key,u,player:pv,route:R.value,routeKey:R.key??null,value:Math.max(pv,R.value)});}return out;});
 window.__hwDebug={scene,post,hs,crowd,city,shared,renderer,drawHW,shotAt,get em(){return em;},get ui(){return ui;},get escape(){return E;},fitCamera,alertTimeline};
}
