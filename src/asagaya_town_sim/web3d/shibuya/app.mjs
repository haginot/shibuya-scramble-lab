import * as THREE from '../vendor/three.module.min.js';
import {StepQueue} from './timing.mjs';
import {populationAt,demandAt} from './simulation.mjs';
import {requestIndoorScene} from './indoor.mjs';
import {shared} from './shaders.mjs';
import {buildCity} from './city.mjs';
import {Crowd} from './crowd.mjs';
import {Vehicles} from './vehicles.mjs';
import {Post,TopDown,Rain,makeSky} from './fx.mjs';
import {shotAt,SCENE_SECONDS,START_CLOCK} from './director.mjs';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
window.__ready=false;
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json();}
const [config,osm,plateau,traffic]=await Promise.all([json('../data/shibuya_config.json'),json('../data/shibuya_osm.json'),json('../data/shibuya_plateau.json'),json('../data/shibuya_traffic.json')]);
// Halloween night mode (?mode=halloween): loaded on demand, the normal mode never imports it.
const hw=params.get('mode')==='halloween'?await import('./halloween-app.mjs'):null;
if(hw)hw.configure(config,params);
if(params.has('hour')){const h=Number(params.get('hour'));if(!(h>=0&&h<24))throw Error('hour must be in [0,24)');config.hour=h;}
if(params.has('agents')){const v=params.get('agents');const n=v==='auto'?populationAt(config.hour,config.calibration):Number(v);if(!Number.isInteger(n)||n<0||n>60000)throw Error('agents must be 0..60000 or auto');config.agents=n;}
if(params.get('demand')==='normal')config.peak=false;
const recording=params.get('record')==='1';if(recording)document.body.classList.add('recording');
const n=config.agents;

// ---------- Renderer, scene, camera ----------
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:recording,powerPreference:'high-performance'});
renderer.setPixelRatio(recording?1:Math.min(devicePixelRatio,1.5));renderer.autoClear=true;renderer.info.autoReset=false;// count every pass of a frame (reflection, trails, scene, bloom)
$('view').append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,16/9,.3,5000);
const sky=makeSky(scene);
const city=buildCity({scene,osm,plateau,config,theme:hw?.THEME??null});
const crowd=hw?new hw.CostumeCrowd(scene,n):new Crowd(scene,n),vehicles=new Vehicles(scene,traffic),rain=new Rain(scene);
const post=new Post(renderer),topdown=new TopDown(renderer,n,traffic.tracks.length);
city.groundMat.uniforms.uDyn.value=topdown.dyn.texture;
// Wet-road reflection: mirrored camera renders reflective layer 1 at half res.
for(const o of [...city.reflective,sky,vehicles.mesh])o.layers.enable(1);
const mirror=new THREE.PerspectiveCamera();mirror.layers.set(1);
const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
function renderReflection(){const p=camera.position,dir=new THREE.Vector3();camera.getWorldDirection(dir);const target=p.clone().add(dir);
 mirror.copy(camera,false);mirror.layers.set(1);mirror.position.set(p.x,-p.y,p.z);mirror.up.copy(camera.up).setY(-camera.up.y);mirror.lookAt(target.x,-target.y,target.z);mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
 city.groundMat.uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
 renderer.setRenderTarget(city.reflectTarget);renderer.clear();renderer.render(scene,mirror);renderer.setRenderTarget(null);}

// ---------- Look (time of day, weather) ----------
const rainy=hw?params.get('rain')==='1':params.get('rain')!=='0';
function applyLook(hour){const sunUp=Math.max(0,Math.min(1,(Math.min(hour-5.5,18.2-hour))/1.2));// winter-evening sky: dark by ~17:30
 shared.uDaylight.value=sunUp;shared.uWet.value=rainy?.9:.35;
 crowd.uniforms.uUmbrella.value=rainy?.42:0;rain.uniforms.uAmount.value=rainy?.75:0;
 const fog=new THREE.Color(0x24172e).lerp(new THREE.Color(0xa9b4bf),sunUp);shared.uFogColor.value.copy(fog);shared.uFogDensity.value=rainy?.0024:.0016;}
applyLook(config.hour);hw?.look({shared,post});

// ---------- Simulation worker ----------
let worker,requestId=0,pending=new Map(),state,busy=false,paused=false,simMs=0;
const stepQueue=new StepQueue();
function request(data){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});worker.postMessage({id,...data});});}
async function reset(){if(worker)worker.terminate();for(const p of pending.values())p.reject(Error('Simulation reset'));pending.clear();worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);if(data.error)p.reject(Error(data.error));else p.resolve(data);};
 worker.onerror=error=>{for(const p of pending.values())p.reject(Error(error.message));pending.clear();$('loading').textContent=error.message;};
 state=await request({type:'init',config:{...config,promotion:$('promotion').checked},osm,plateau,traffic});stepQueue.seconds=0;$('loading').hidden=true;}

// ---------- Cameras: cinema (director), presets, free orbit ----------
let mode=params.get('cam')||'cinema',cinemaTime=0;
const orbit={target:new THREE.Vector3(0,0,4),dist:120,yaw:-.7,pitch:.75};
const PRESETS={top:{target:[0,0,2],dist:150,yaw:0,pitch:1.5},street:{target:[-6,1.6,4],dist:40,yaw:-1.1,pitch:.06},hachiko:{target:[2,1.5,30],dist:46,yaw:-.45,pitch:.18},orbit:{target:[0,0,4],dist:150,yaw:-.7,pitch:.62}};
function setPreset(name){const p=PRESETS[name]||PRESETS.orbit;orbit.target.set(...p.target);orbit.dist=p.dist;orbit.yaw=p.yaw;orbit.pitch=p.pitch;}
if(PRESETS[mode])setPreset(mode);
function placeCamera(shot){if(shot){camera.position.copy(shot.pos);camera.up.copy(shot.up);camera.fov=shot.fov;camera.lookAt(shot.look);}
 else{camera.up.set(0,1,0);const cp=Math.cos(orbit.pitch);camera.position.set(orbit.target.x+Math.sin(orbit.yaw)*cp*orbit.dist,orbit.target.y+Math.sin(orbit.pitch)*orbit.dist,orbit.target.z+Math.cos(orbit.yaw)*cp*orbit.dist);if(orbit.pitch>1.45)camera.up.set(0,0,-1);camera.fov=42;camera.lookAt(orbit.target);}
 camera.updateProjectionMatrix();}
{let drag=null;const el=renderer.domElement;el.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,button:e.button};el.setPointerCapture(e.pointerId);if(mode==='cinema')setMode('free');});
 el.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(drag.button===2||e.shiftKey){const s=orbit.dist*.0016,c=Math.cos(orbit.yaw),sn=Math.sin(orbit.yaw);orbit.target.x-=(dx*c-dy*sn)*s;orbit.target.z-=(-dx*sn-dy*c)*s;}else{orbit.yaw-=dx*.005;orbit.pitch=Math.min(1.52,Math.max(.03,orbit.pitch+dy*.004));}});
 el.addEventListener('pointerup',()=>drag=null);el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('wheel',e=>{e.preventDefault();if(mode==='cinema')setMode('free');orbit.dist=Math.min(900,Math.max(6,orbit.dist*Math.exp(e.deltaY*.001)));},{passive:false});}
function setMode(m){mode=m;if(PRESETS[m])setPreset(m);if(m!=='cinema'&&m!=='free'&&PRESETS[m])mode='free';document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('on',b.dataset.camera===m||(m==='free'&&b.dataset.camera==='free')));}

// ---------- Frame ----------
let lastRenderTime=null,frameCount=0,frameStart=performance.now(),fps=0,trailGain=.5,captionOverride=null;
const fmt=v=>v.toLocaleString('en-US');
function caption(text){if(!text){$('caption').style.opacity=0;return;}$('cap-en').textContent=text[0].replace('{agents}',fmt(n));$('cap-ja').textContent=text[1].replace('{agents}',fmt(n));}
function resize(){const w=innerWidth,h=innerHeight,pr=renderer.getPixelRatio();if(renderer.domElement.width!==Math.round(w*pr)||renderer.domElement.height!==Math.round(h*pr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}post.setSize(Math.round(w*pr),Math.round(h*pr));}
// Rendering runs one solver step behind and interpolates between the last two
// steps. Recording uses the solver's exact remainder; live mode its own clock.
let renderTime=null;
let drawImpl=null;// replaced by the Halloween mode
function draw(shot,dtSim){if(drawImpl)return drawImpl(shot,dtSim);if(!state)return;resize();
 const dt=state.dt||.1;let alpha;
 if(recording)alpha=state.alpha||0;else{renderTime=Math.min(state.time,Math.max(state.time-dt,(renderTime??state.time-dt)+dtSim));alpha=(renderTime-(state.time-dt))/dt;}
 alpha=Math.min(1,Math.max(0,alpha));
 const simTime=state.time-dt+alpha*dt;
 shared.uTime.value=simTime;
 crowd.update(state,alpha,dtSim);
 const clock=state.clock-dt+alpha*dt;
 const cars=vehicles.update(state.clearanceHold?state.clock:Math.max(0,clock));
 topdown.roles=state.roles;topdown.update(crowd,cars,dtSim);
 placeCamera(shot);
 shared.uTrailGain.value=shot?shot.trail:trailGain;
 // Signals: pedestrians green only in the walk phase; vehicles red unless released.
 const ph=state.phase,cyc=state.clock%config.calibration.signal.cycle_s,sig=config.calibration.signal;
 city.signalMaterial.uniforms.uPed.value.set(ph==='walk'?0x2bff9a:0xff2a1a);
 city.signalMaterial.uniforms.uCar.value.set(ph==='vehicles'?(cyc>sig.cycle_s-sig.all_red_s-3?0xffb000:0x2bffb0):0xff2a1a);
 shared.uScreenGlow.value.setHSL((simTime*.03)%1,.7,.5);
 post.settings.uFade.value=shot?shot.fade:1;
 renderer.info.reset();renderReflection();post.render(scene,camera);
 // HUD
 const h=config.hour,hh=Math.floor(h),mm=Math.floor((h%1)*60+simTime/60)%60;
 $('clock').textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
 $('agents').textContent=fmt(n);$('crossing').textContent=fmt(state.active);$('waiting').textContent=fmt((state.waiting??0)+(state.approaching??0));
 $('lastcycle').textContent=state.lastCycle?.admitted?fmt(state.lastCycle.completed):'—';
 const rescued=state.rescued??0;$('rescued').hidden=!rescued;if(rescued)$('rescued').textContent=`safety valve: ${fmt(rescued)} (not counted)`;
 $('phase').textContent={walk:'WALK · 歩行者青',clearance:'CLEARING · 点滅',vehicles:'VEHICLES · 車両青','all-red':'ALL RED · 全赤'}[state.phase]+(state.clearanceHold?' · HOLD':'');
 $('phase').dataset.phase=state.phase;$('speed').textContent=`×${(shot?shot.speed:speed).toFixed(1)}`;
 if(shot){$('caption').style.opacity=shot.capAlpha;caption(captionOverride||shot.caption);}
 window.__shibuyaState={ready:true,agents:n,hour:config.hour,fps,simulationMs:simMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,phase:state.phase,clock:state.clock,time:state.time,admitted:state.admitted,completed:state.completed,active:state.active,waiting:state.waiting,quota:state.quota,funnel:state.funnel,trainWaves:state.trainWaves,clearanceHold:state.clearanceHold,rescued:state.rescued,rescuedCycle:state.rescuedCycle,deferred:state.deferred,deferredCycle:state.deferredCycle,approaching:state.approaching,lastCycle:state.lastCycle,promotion:state.promotion,backlogSeconds:stepQueue.seconds,trafficModel:traffic.model,vehicles:cars.length,camera:mode,shot:shot?.name??null,signs:city.signCount};
}

// ---------- UI ----------
let speed=Number(params.get('speed')||1);
$('promotion').onchange=async e=>{state=await request({type:'promo',enabled:e.target.checked});};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{setMode(b.dataset.camera);if(b.dataset.camera==='cinema')cinemaTime=0;});
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('on',x===b));});
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶':'❚❚';};
$('trails').onchange=e=>{trailGain=e.target.checked?.6:0;};
$('hud-toggle').onclick=()=>document.body.classList.toggle('clean');
$('meta-agents').textContent=fmt(n);$('meta-hour').textContent=`${config.hour}:00`;$('meta-quota').textContent=fmt(Math.round(demandAt(config.hour,config.calibration,config.peak)));

await reset();setMode(mode);

// Recording: one call per video frame, deterministic, never wall-clock driven.
window.__setCamera=m=>setMode(m);
window.__setIndoorScene=requestIndoorScene;
window.__caption=(en,ja)=>{captionOverride=en?[en,ja]:null;};
window.__advance=async seconds=>{const t=performance.now();state=await request({type:'advance',seconds});simMs=performance.now()-t;return window.__shibuyaState;};
window.__frame=async videoTime=>{const shot=shotAt(videoTime);const dtSim=shot.speed/30;const t=performance.now();state=await request({type:'advance',seconds:dtSim});simMs=performance.now()-t;draw(shot,dtSim);return window.__shibuyaState;};
// Advance the solver to the director's start point of the signal cycle (queue
// built up during the vehicle phase), and advance one video frame without drawing.
window.__warmup=async(target=START_CLOCK)=>{while(state.clock<target-1e-6)state=await request({type:'advance',seconds:Math.min(5,Math.max(.1,target-state.clock))});draw(shotAt(0),0);return window.__shibuyaState;};
window.__skip=async videoTime=>{state=await request({type:'advance',seconds:shotAt(videoTime).speed/30});};
window.__render=()=>{draw(mode==='cinema'?shotAt(cinemaTime%SCENE_SECONDS):null,0);return window.__shibuyaState;};
if(hw)await hw.install({THREE,scene,camera,renderer,post,city,crowd,vehicles,topdown,config,osm,plateau,traffic,n,params,recording,$,fmt,request,renderReflection,resize,placeCamera,caption,
 get state(){return state;},set state(v){state=v;},get mode(){return mode;},setDraw(fn){drawImpl=fn;},setSim(ms){simMs=ms;},get fps(){return fps;},stepQueue});
draw(mode==='cinema'?(hw?.shotAt??shotAt)(0):null,0);
window.__ready=true;

async function animate(now){frameCount++;if(now-frameStart>1000){fps=frameCount*1000/(now-frameStart);frameStart=now;frameCount=0;}
 const wall=lastRenderTime===null?0:Math.min(.25,(now-lastRenderTime)/1000);lastRenderTime=now;
 let shot=null,rate=speed;const shots=hw?.liveShotAt??shotAt,loop=hw?.liveSeconds??SCENE_SECONDS;if(mode==='cinema'&&!paused){cinemaTime=(cinemaTime+wall)%loop;}if(mode==='cinema'){shot=shots(cinemaTime);rate=shot.speed;}
 const dtSim=paused?0:wall*rate;if(!paused)stepQueue.add(dtSim);
 if(!busy&&stepQueue.seconds>=.1){busy=true;const seconds=stepQueue.take(),start=performance.now();request({type:'advance',seconds}).then(next=>{state=next;simMs=performance.now()-start;busy=false;}).catch(error=>{if(error.message==='Simulation reset')return;busy=false;$('loading').hidden=false;$('loading').textContent=error.message;});}
 draw(shot,dtSim);requestAnimationFrame(animate);}
if(!recording)requestAnimationFrame(animate);
