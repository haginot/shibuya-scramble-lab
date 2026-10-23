// Halloween night mode of the 3D view (?mode=halloween). Loaded on demand by
// app.mjs, which hands over its renderer, scene, solver worker and helpers.
// Every number on screen is read from a solver snapshot of the same frame:
// the Halloween crowd (worker 1) or the two station-closing runs (workers 2, 3).
// window.__hwOverlay keeps the shown strings next to their source values so the
// recorder can check them frame by frame.
import {HALLOWEEN} from './halloween.mjs';
import {DISPERSAL} from './dispersal.mjs';
import {CROWD_2026,FACTS,FOOTNOTE} from './sources-halloween.mjs';
import {CostumeCrowd} from './costume.mjs';
import {HalloweenScene,Heatmap,THEME} from './halloween-scene.mjs';
import {shared} from './shaders.mjs';
import {shotAt,START_CLOCK,SCENE_SECONDS,CREDIT_SECONDS,LIVE_SECONDS,DISPERSAL_SECONDS} from './director-halloween.mjs';
export {CostumeCrowd,THEME,shotAt};
export const liveSeconds=LIVE_SECONDS,liveShotAt=t=>shotAt(t%LIVE_SECONDS);

export function configure(config){config.mode='halloween';config.agents=HALLOWEEN.agents;config.hour=HALLOWEEN.hour;config.quota=HALLOWEEN.quota;config.promotion=false;}
// Orange/purple grade, purple haze, dry night.
export function look({shared,post}){shared.uFogColor.value.set(0x120716);shared.uFogDensity.value=.0019;shared.uSkyTop.value.set(0x020108);shared.uSkyHorizon.value.set(0x2a0d2c);shared.uWet.value=.32;
 const s=post.settings;s.uShadowTint.value.set(.012,-.006,.03);s.uHighTint.value.set(.06,.018,-.03);s.uSaturation.value=1.15;s.uBloom.value=.38;}

// Number formats used on screen (also used by the recorder's checks via __hwOverlay).
export const fmt=v=>Math.round(v).toLocaleString('en-US');
export const p2=v=>(Math.round(v*10)/10).toFixed(1);
// Single-language overlays: both languages are in the DOM, body.lang-en / body.lang-ja shows one
// (the recorder captures each frame once per language).
export const L=(en,ja)=>`<span class="l-en">${en}</span><span class="l-ja">${ja}</span>`;
export const bi=v=>{const k=String(v).indexOf(' · ');return k<0?String(v):L(String(v).slice(0,k),String(v).slice(k+3));};
export const exitClearText=e=>e.clearAt===0&&e.peakRun<=DISPERSAL.exitClear?'never dense · 密集なし':e.clearAt==null?'not cleared · 未解消':mmss(e.clearAt);
export const mmss=s=>s==null?null:`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;

class SimClient{
 constructor(){this.worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});this.pending=new Map();this.id=0;
  this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);if(data.error)p.reject(Error(data.error));else p.resolve(data);};}
 request(data){return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,...data});});}
}

const CSS=`
#hw-hook{position:fixed;left:0;right:0;top:20%;text-align:center;pointer-events:none;opacity:0;text-shadow:0 4px 30px #000,0 0 3px #000;z-index:20}
#hw-hook .n{font:900 150px/1 Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:-.02em;color:#ff8a1f;filter:drop-shadow(0 0 22px #ff5a0099)}
#hw-hook .l{font:800 34px/1.25 Inter,"Noto Sans CJK JP",sans-serif;color:#fff;margin-top:6px;letter-spacing:.04em}
#hw-hook .j{font:800 26px/1.3 "Noto Sans CJK JP",sans-serif;color:#d9c2ff;margin-top:4px;letter-spacing:.12em}
#hw-hook .s{display:inline-block;margin-top:16px;padding:7px 16px;border-radius:99px;background:#12081ecc;border:1px solid #ff8a1f88;font:600 17px Inter,"Noto Sans CJK JP",sans-serif;color:#ffd9a8;font-variant-numeric:tabular-nums}
#hud .hw{margin-top:7px;display:flex;justify-content:space-between;gap:12px}#hud .hw div{display:flex;flex-direction:column}#hud .hw b{font-size:18px;font-weight:500}#hud .hw small{font-size:9px;color:#99a;letter-spacing:.06em}
#hud .hw b.d{color:#ffb35a}#hud .honest{margin-top:5px;font-size:9px;color:#8f8aa6;letter-spacing:.04em}
#hw-split{position:fixed;inset:0;pointer-events:none;display:none;z-index:15;font-family:Inter,"Noto Sans CJK JP",sans-serif;font-variant-numeric:tabular-nums}
#hw-split .div{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px;background:linear-gradient(#ff8a1f,#9d4bff)}
#hw-split .title{position:absolute;left:0;right:0;top:12px;text-align:center;text-shadow:0 2px 12px #000}
#hw-split .title b{display:inline-block;font:900 25px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.04em;color:#fff;background:#0b0612d9;padding:6px 18px;border-radius:8px;border:1px solid #ffffff22}
#hw-split .title i{display:block;font-style:normal;font-size:14px;color:#e8dcff;margin-top:5px;letter-spacing:.1em}
#hw-split .half{position:absolute;top:92px;width:300px;padding:10px 14px;border-radius:12px;background:#0b0612cc;border:1px solid #ffffff1a}
#hw-split .half.l{left:20px}#hw-split .half.r{right:20px}
#hw-split .tag{font:900 19px/1.15 Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.04em}#hw-split .l .tag{color:#ff6a5a}#hw-split .r .tag{color:#4fe3c1}
#hw-split .tag small{display:block;font-size:12px;font-weight:700;color:#cfc8de;letter-spacing:.06em;margin-top:2px}
#hw-split .big{font:900 54px/1 Inter,sans-serif;margin-top:8px;color:#fff}#hw-split .lbl{font-size:11px;color:#b7b0c9;letter-spacing:.06em}
#hw-split .st{margin-top:7px;font-size:13px;line-height:1.55;color:#eee}#hw-split .st b{color:#ffcf8a;font-weight:700}
#hw-split .clock{position:absolute;left:50%;top:96px;transform:translateX(-50%);font:800 30px Inter,sans-serif;color:#fff;background:#0b0612d9;padding:4px 14px;border-radius:8px;border:1px solid #ffffff22}
#hw-split .clock small{display:block;font-size:10px;font-weight:600;color:#b7b0c9;text-align:center;letter-spacing:.1em}
#hw-chart,#hw-chart-ja{position:absolute;left:40px;right:40px;bottom:40px;width:1200px;height:118px;background:#0b0612d0;border-radius:10px;border:1px solid #ffffff1a}
#hw-split .legend{position:absolute;right:52px;bottom:168px;font-size:11px;color:#ddd;background:#0b0612cc;padding:6px 10px;border-radius:8px}
#hw-split .legend span{display:inline-block;width:150px;height:8px;border-radius:4px;vertical-align:middle;margin:0 6px;background:linear-gradient(90deg,rgba(13,90,255,.2),#1af299,#ffe61a,#ff590d,#ff0d26,#ff33ff)}
#hw-results{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:1060px;padding:22px 30px 18px;border-radius:16px;background:#09050fe8;border:1px solid #ff8a1f66;box-shadow:0 0 60px #9d4bff44;display:none;opacity:0;z-index:30;font-family:Inter,"Noto Sans CJK JP",sans-serif;color:#fff;font-variant-numeric:tabular-nums}
#hw-results h2{margin:0 0 12px;font:900 27px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.03em;text-align:center}#hw-results h2 small{display:block;font-size:14px;color:#cdbdf5;font-weight:700;margin-top:4px;letter-spacing:.08em}
#hw-results table{width:100%;border-collapse:collapse}#hw-results td{padding:6px 10px;border-top:1px solid #ffffff14;font-size:16px}#hw-results td:first-child{color:#d8d2e6;font-size:14px}#hw-results td small{display:block;color:#8f88a3;font-size:11px}
#hw-results th{font:900 16px Inter,"Noto Sans CJK JP",sans-serif;padding:4px 10px;text-align:center}#hw-results th.a{color:#ff6a5a}#hw-results th.b{color:#4fe3c1}
#hw-results td.v{text-align:center;font-weight:800;font-size:24px}#hw-results td.v.b{color:#7dffd8}#hw-results td.v.a{color:#ff9a8a}
#hw-results .f{margin-top:12px;font-size:12px;color:#b9b2cc;text-align:center;letter-spacing:.04em}
.recording #brand .sub{display:none}.recording #caption{transition:none}
.lang-en .l-ja,.lang-ja .l-en,.lang-en #cap-ja,.lang-ja #cap-en{display:none!important}
.lang-ja #cap-ja{font:700 25px/1.3 "Noto Sans CJK JP",sans-serif;letter-spacing:.12em;color:#fff;margin-top:0}
.lang-ja #hud small,.lang-ja #hud .area{letter-spacing:.02em}
#hw-hook .k{display:inline-block;font:900 34px/1.2 Inter,"Noto Sans CJK JP",sans-serif;color:#fff;background:#ff8a1f;padding:6px 22px;border-radius:10px;letter-spacing:.04em;text-shadow:none;margin-bottom:10px;box-shadow:0 0 40px #ff5a0088}
#hw-hook .e{font:800 21px Inter,"Noto Sans CJK JP",sans-serif;color:#ffd9a8;letter-spacing:.14em;margin-top:4px}
#hw-hook .f{position:fixed;left:60px;right:60px;bottom:58px;font:600 12.5px/1.5 Inter,"Noto Sans CJK JP",sans-serif;color:#e8dcff;text-align:center;text-shadow:0 1px 6px #000}
#hw-split .chip{position:absolute;transform:translate(-50%,-50%);padding:3px 8px 4px;border-radius:7px;background:#0b0612d9;border:2px solid #4fe3c1;font:700 11px/1.15 Inter,"Noto Sans CJK JP",sans-serif;color:#fff;white-space:nowrap;text-align:center}
#hw-split .chip b{display:block;font:900 17px/1 Inter,sans-serif;margin-top:1px}
#hw-board,#hw-question{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:1080px;padding:20px 28px 16px;border-radius:16px;background:#09050fee;border:1px solid #ff8a1f66;box-shadow:0 0 60px #9d4bff44;display:none;opacity:0;z-index:30;font-family:Inter,"Noto Sans CJK JP",sans-serif;color:#fff;font-variant-numeric:tabular-nums}
#hw-board h2,#hw-question h2{margin:0 0 10px;font:900 28px Inter,"Noto Sans CJK JP",sans-serif;text-align:center;letter-spacing:.03em}#hw-board h2 small{display:block;font-size:14px;color:#cdbdf5;font-weight:700;margin-top:4px;letter-spacing:.06em}
#hw-board table{width:100%;border-collapse:collapse}#hw-board td{padding:5px 8px;border-top:1px solid #ffffff14;font-size:15px}#hw-board th{font:900 14px Inter,"Noto Sans CJK JP",sans-serif;padding:3px 8px;text-align:center}#hw-board th.a{color:#ff6a5a}#hw-board th.b{color:#4fe3c1}
#hw-board td.n{font:800 19px Inter,"Noto Sans CJK JP",sans-serif;white-space:nowrap}#hw-board td.v{text-align:center;font-weight:800;font-size:21px;white-space:nowrap}#hw-board td.v small{display:block;font-size:11px;color:#a9a2bd;font-weight:600}#hw-board td.v.a{color:#ff9a8a}#hw-board td.v.b{color:#7dffd8}
#hw-board .f{margin-top:10px;font-size:11.5px;color:#b9b2cc;text-align:center}
#hw-question{width:1100px;padding:28px 34px 22px;text-align:center}#hw-question h2{font-size:58px;line-height:1.15;margin-bottom:16px;color:#ffcf6a;text-shadow:0 0 30px #ff8a1f66}
#hw-question .opts{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 12px}#hw-question .opt{padding:8px 16px;border-radius:12px;background:#ffffff10;border:1px solid #ffffff2a;font:800 20px Inter,"Noto Sans CJK JP",sans-serif}#hw-question .opt i{font-style:normal;color:#ff8a1f;margin-right:8px}
#hw-question .tip{margin-top:16px;font:600 16px/1.5 Inter,"Noto Sans CJK JP",sans-serif;color:#e8dcff}#hw-question .tip b{color:#7dffd8}
#hw-question .facts{margin-top:12px;font:500 13px/1.6 Inter,"Noto Sans CJK JP",sans-serif;color:#c9c2db}#hw-question .cta{margin-top:12px;font:900 20px Inter,"Noto Sans CJK JP",sans-serif;color:#fff;letter-spacing:.06em}
`;

export async function install(api){
 const {THREE,scene,camera,renderer,post,city,crowd,vehicles,topdown,config,$,n,request}=api;
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
 document.title='SHIBUYA HALLOWEEN — crowd simulation';
 const lang=api.params.get('lang')||(api.recording?'ja':(navigator.language||'').startsWith('ja')?'ja':'en');
 window.__setLang=l=>{document.body.classList.remove('lang-en','lang-ja');document.body.classList.add(`lang-${l}`);return l;};window.__setLang(lang);
 $('disclaimer').innerHTML=L('Toy model scaled to public figures — not a prediction · every on-screen count is counted from the simulated people','公開値を参考にしたトイモデル・予測ではない ・ 画面の人数はすべてシミュレーション上の人数から集計');
 $('brand').querySelector('.mark').innerHTML='SHIBUYA<b>HALLOWEEN</b>';
 const layout=api.state.layout;if(!layout)throw Error('Halloween layout missing from the solver');
 const hs=new HalloweenScene({scene,layout,city});
 // ---- HUD rows (Halloween) ----
 const hud=$('hud'),row=document.createElement('div');row.className='row hw';
 row.innerHTML=`<div><b id="hw-held">—</b><small>${L('held by police','規制で待機')}</small></div><div><b id="hw-dens" class="d">—</b><small>${L('peak density p/m²','最大密度 人/m²')}</small></div><div><b id="hw-med">—</b><small>${L('typical (median)','中央値')}</small></div>`;
 hud.querySelector('.area').before(row);const honest=document.createElement('div');honest.className='honest';honest.id='hw-honest';hud.append(honest);
 const sm=hud.querySelectorAll('.stats small');sm[0].innerHTML=L('on the crossing now','横断中');sm[1].innerHTML=L('queued at corners','角で信号待ち');sm[2].innerHTML=L('crossed last cycle','前回の横断');
 hud.querySelector('.area span').innerHTML=`<b id="agents">—</b> ${L('people modelled in the ~0.8 km area (sim assumption)','人をモデル化・約0.8km四方（シミュレーション上の仮定）')}`;
 const hook=document.createElement('div');hook.id='hw-hook';hook.innerHTML=`<div class="k">${L('SHIBUYA ON HALLOWEEN: HEADS-UP','10/31 渋谷駅、どう帰る？')}</div><div class="n" id="hw-hook-n"></div><div class="e">${L('2026 ESTIMATE*','2026年 推計*')}</div><div class="l">${L('people on the street at the peak','ピーク時の路上の人出')}</div><div class="s" id="hw-hook-s"></div><div class="f">${L(FOOTNOTE.shortEn,FOOTNOTE.shortJa)}</div>`;document.body.append(hook);
 const split=document.createElement('div');split.id='hw-split';
 split.innerHTML=`<div class="div"></div><div class="title"><b>${L('00:30 STATION CLOSES: EVERYONE HEADS HOME','00:30 駅閉鎖：一斉に帰る')}</b><i id="hw-split-sub"></i></div>
  <div class="half l"><div class="tag">${L('NO CONTROL','規制なし')}<small>${L('all gates open, shortest path','全改札開放・最短経路')}</small></div><div class="big" id="hw-remA">—</div><div class="lbl">${L('still in the area','現場に残る人')}</div><div class="st" id="hw-stA"></div></div>
  <div class="half r"><div class="tag">${L('ONE-WAY + STAGED RELEASE','一方通行＋段階的解放')}<small>${L('gates by destination, released in rings','行き先別の改札・順番に解放')}</small></div><div class="big" id="hw-remB">—</div><div class="lbl">${L('still in the area','現場に残る人')}</div><div class="st" id="hw-stB"></div></div>
  <div class="clock" id="hw-clock">+00:00</div>
  <div class="legend">${L('density','密度')} 0<span></span>5 ${L('p/m²','人/m²')}</div><canvas id="hw-chart" class="l-en" width="1200" height="118"></canvas><canvas id="hw-chart-ja" class="l-ja" width="1200" height="118"></canvas><div id="hw-chips"></div>`;
 document.body.append(split);
 const results=document.createElement('div');results.id='hw-results';document.body.append(results);
 const board=document.createElement('div');board.id='hw-board';document.body.append(board);const question=document.createElement('div');question.id='hw-question';document.body.append(question);
 const EXITS=DISPERSAL.exits,chips={};for(const side of ['A','B'])chips[side]=EXITS.map(e=>{const c=document.createElement('div');c.className='chip';c.innerHTML=`${L(e.name,e.ja)}<b>—</b>`;split.querySelector('#hw-chips').append(c);return c;});
 const legal=document.createElement('style');legal.textContent='#disclaimer{z-index:40}';document.head.append(legal);
 // ---- Dispersal runs: two more solver workers (same seed, same people) ----
 const runs={A:{strategy:'none'},B:{strategy:'managed'}};
 const crowdA=new CostumeCrowd(scene,DISPERSAL.inside+DISPERSAL.plaza,{accessories:false}),crowdB=new CostumeCrowd(scene,DISPERSAL.inside+DISPERSAL.plaza,{accessories:false});crowdA.visible=crowdB.visible=false;
 const heatA=new Heatmap(scene),heatB=new Heatmap(scene);heatA.visible=heatB.visible=false;
 async function initDispersal(){for(const [k,r] of Object.entries(runs)){r.client=new SimClient();r.state=await r.client.request({type:'init',config:{...config,mode:'dispersal',strategy:r.strategy,hour:23.5},osm:api.osm,plateau:api.plateau,traffic:api.traffic});r.scenario=r.state.scenario;}}
 async function advanceDispersal(seconds){const [a,b]=await Promise.all([runs.A.client.request({type:'advance',seconds}),runs.B.client.request({type:'advance',seconds})]);runs.A.state=a;runs.B.state=b;}
 const camL=new THREE.PerspectiveCamera(40,1,.3,5000),camR=new THREE.PerspectiveCamera(40,1,.3,5000);
 const overlay={};window.__hwOverlay=overlay;
 const sigColor=(state)=>{const ph=state.phase,cyc=state.clock%config.calibration.signal.cycle_s,sig=config.calibration.signal;city.signalMaterial.uniforms.uPed.value.set(ph==='walk'?0x2bff9a:0xff2a1a);city.signalMaterial.uniforms.uCar.value.set(ph==='vehicles'?(cyc>sig.cycle_s-sig.all_red_s-3?0xffb000:0x2bffb0):0xff2a1a);};
 let renderTime=null,lastShot=null;
 const set=(id,text)=>{const el=$(id)||document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text;return text;};

 function drawMain(shot,dtSim){const state=api.state,dt=state.dt||.1;let alpha;
  if(api.recording)alpha=state.alpha||0;else{renderTime=Math.min(state.time,Math.max(state.time-dt,(renderTime??state.time-dt)+dtSim));alpha=(renderTime-(state.time-dt))/dt;}
  alpha=Math.min(1,Math.max(0,alpha));const simTime=state.time-dt+alpha*dt;shared.uTime.value=simTime;
  crowd.visible=true;crowdA.visible=crowdB.visible=false;heatA.visible=heatB.visible=false;
  crowd.update(state,alpha,dtSim);hs.update(simTime);
  const clock=state.clock-dt+alpha*dt,cars=vehicles.update(state.clearanceHold?state.clock:Math.max(0,clock));
  topdown.roles=state.roles;topdown.update(crowd,cars,dtSim);
  api.placeCamera(shot);shared.uTrailGain.value=shot?shot.trail:.5;sigColor(state);
  shared.uScreenGlow.value.setHSL(.07+.7*(.5+.5*Math.sin(simTime*.25)),.85,.5);
  post.settings.uFade.value=shot?shot.fade:1;city.groundMat.uniforms.uReflectOn.value=1;
  renderer.info.reset();api.renderReflection();post.render(scene,camera);
  // HUD: counts of the solver's own motion codes in this snapshot.
  const h=config.hour,hh=Math.floor(h),mm=Math.floor((h%1)*60+Math.max(0,simTime)/60)%60;$('clock').textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  const shown={agents:set('agents',fmt(n)),crossing:set('crossing',fmt(state.active)),queued:set('waiting',fmt(state.waiting)),held:set('hw-held',fmt(state.held)),peak:set('hw-dens',p2(state.density.peak)),median:set('hw-med',p2(state.density.median)),
   lastcycle:set('lastcycle',state.lastCycle?.admitted?fmt(state.lastCycle.completed):'—')};
  const mv=state.teleports+state.rescued;if(overlay.moved!==mv){overlay.moved=mv;$('hw-honest').innerHTML=L(`moved by the model: ${mv} · rescued (not counted): ${state.rescued}`,`モデルによる移動: ${mv} ・ 救済（集計外）: ${state.rescued}`);}
  {const ph=bi({walk:'WALK · 歩行者青',clearance:'CLEARING · 点滅',vehicles:'VEHICLES · 車両青','all-red':'ALL RED · 全赤'}[state.phase])+(state.clearanceHold?' · HOLD':'');if($('phase').innerHTML!==ph)$('phase').innerHTML=ph;}$('phase').dataset.phase=state.phase;$('speed').textContent=`×${(shot?shot.speed:1).toFixed(1)}`;
  delete overlay.split;delete overlay.results;delete overlay.board;delete overlay.question;if(shot?.name!=='hook')delete overlay.hook;
  Object.assign(overlay,{frameShot:shot?.name??null,shown,source:{agents:n,crossing:state.active,queued:state.waiting,held:state.held,peak:state.density.peak,median:state.density.median,lastcycle:state.lastCycle?.admitted?state.lastCycle.completed:null}});
  // Hook (first shot): the modelled population and two live counts, large.
  const hookOn=shot?.name==='hook';hook.style.opacity=hookOn?Math.min(1,shot.local/.25)*Math.min(1,(2.5-shot.local)/.35):0;
  if(hookOn){const v={agents:fmt(n),peak:p2(state.density.peak),held:fmt(state.held)};
   const s=L(`sim (assumes ${v.agents} people in the area): peak ${v.peak} p/m² · held by police ${v.held}`,`シミュレーション（仮定 ${v.agents}人）：最大密度 ${v.peak}人/m² ・ 規制で待機 ${v.held}人`);
   set('hw-hook-n',fmt(CROWD_2026.estimate));if($('hw-hook-s').innerHTML!==s)$('hw-hook-s').innerHTML=s;overlay.hook={n:fmt(CROWD_2026.estimate),line:v,source:{n:CROWD_2026.estimate,agents:n,peak:state.density.peak,held:state.held}};}
  $('hud').style.display=hookOn||shot?.name==='dj'?'none':'';split.style.display='none';results.style.display=board.style.display=question.style.display='none';
  if(shot){$('caption').style.opacity=shot.caption?shot.capAlpha:0;if(shot.caption){$('cap-en').textContent=shot.caption[0].replace('{agents}',fmt(n));$('cap-ja').textContent=shot.caption[1].replace('{agents}',fmt(n));}}
  return {cars:cars.length};}

 function chart(){for(const [id,label,unit] of [['hw-chart','people still in the area','min'],['hw-chart-ja','現場に残る人','分']])chartOne(document.getElementById(id),label,unit);}
 function chartOne(c,label,unit){const g=c.getContext('2d'),W=c.width,H=c.height,L=128,R=20,T=14,B=26,N=DISPERSAL.inside+DISPERSAL.plaza;g.clearRect(0,0,W,H);
  g.font='700 13px Inter,"Noto Sans CJK JP",sans-serif';g.fillStyle='#d7d0e9';g.textAlign='left';g.fillText(label,12,38);g.font='600 11px Inter,"Noto Sans CJK JP",sans-serif';
  g.strokeStyle='#ffffff22';g.lineWidth=1;for(let m=0;m<=25;m+=5){const x=L+(W-L-R)*m*60/DISPERSAL_SECONDS;g.beginPath();g.moveTo(x,T);g.lineTo(x,H-B);g.stroke();g.fillStyle='#8f88a3';g.textAlign='center';g.fillText(`${m} ${unit}`,x,H-9);}
  for(const v of [0,N/2,N]){const y=T+(H-B-T)*(1-v/N);g.textAlign='right';g.fillText(fmt(v),L-8,y+4);}
  for(const [k,color] of [['A','#ff6a5a'],['B','#4fe3c1']]){const s=runs[k].state?.series;if(!s?.length)continue;g.strokeStyle=color;g.lineWidth=3;g.beginPath();s.forEach(([t,rem],j)=>{const x=L+(W-L-R)*Math.min(1,t/DISPERSAL_SECONDS),y=T+(H-B-T)*(1-rem/N);j?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}}

 function stats(s){const now=s.now||{},held=s.holdTotal??0;return {remaining:fmt(s.remaining),inside:fmt(s.inside),densNow:p2(now.densePeak??0),peak:p2(s.peakCell),crush:fmt(s.crushPersonMinutes),cars:mmss(held),src:{remaining:s.remaining,inside:s.inside,densNow:now.densePeak??0,peak:s.peakCell,crush:s.crushPersonMinutes,cars:held}};}
 const densColor=v=>v>=4?'#ff2a4a':v>=3?'#ff7a1a':v>=2?'#ffd21a':'#4fe3c1';
 const exitName=e=>L(e.name,e.ja);
 function drawSplit(shot){const W=renderer.domElement.width,H=renderer.domElement.height,a=runs.A.state,b=runs.B.state;api.resize();
  shared.uTime.value=a.time;crowd.visible=false;hs.update(a.time);
  crowdA.update(a,1,shot.speed/30);crowdB.update(b,1,shot.speed/30);heatA.set(a.heat);heatB.set(b.heat);
  for(const cam of [camL,camR]){cam.position.copy(shot.pos);cam.up.copy(shot.up);cam.fov=shot.fov;cam.aspect=(W/2)/H;cam.lookAt(shot.look);cam.updateProjectionMatrix();}
  shared.uTrailGain.value=0;post.settings.uFade.value=shot.fade;city.groundMat.uniforms.uReflectOn.value=0;
  const view=(x,cam,mine,other,hm,ho,st)=>({x,width:W/2,camera:cam,before(){mine.visible=true;other.visible=false;hm.visible=true;ho.visible=false;vehicles.update(st.clock);sigColor(st);}});
  renderer.info.reset();post.render(scene,camL,[view(0,camL,crowdA,crowdB,heatA,heatB,a),view(W/2,camR,crowdB,crowdA,heatB,heatA,b)]);
  // Overlay: live counts from both runs.
  $('hud').style.display='none';hook.style.opacity=0;$('caption').style.opacity=0;split.style.display='block';
  const A=stats(a),B=stats(b),clock=`+${mmss(a.time)}`,clk=`${clock}<small>${L('since closing','閉鎖から')}</small>`;if($('hw-clock').innerHTML!==clk)$('hw-clock').innerHTML=clk;
  const sub=L(`same ${fmt(a.agents)} people in both runs (sim assumption): ${fmt(DISPERSAL.inside)} inside the station + ${fmt(DISPERSAL.plaza)} on the plaza`,`両方とも同じ${fmt(a.agents)}人（シミュレーション上の仮定）：駅構内${fmt(DISPERSAL.inside)}人＋駅前広場${fmt(DISPERSAL.plaza)}人`);
  if($('hw-split-sub').innerHTML!==sub)$('hw-split-sub').innerHTML=sub;
  set('hw-remA',A.remaining);set('hw-remB',B.remaining);
  const stA=L(`densest now <b>${A.densNow}</b> p/m² · in station <b>${A.inside}</b><br>cars held for people on the road <b>${A.cars}</b>`,`現在の最大密度 <b>${A.densNow}</b>人/m² ・ 駅構内 <b>${A.inside}</b>人<br>路上の人で車が停止 <b>${A.cars}</b>`),
   stB=L(`densest now <b>${B.densNow}</b> p/m² · in station <b>${B.inside}</b><br>held by police on the plaza <b>${fmt(b.held)}</b>`,`現在の最大密度 <b>${B.densNow}</b>人/m² ・ 駅構内 <b>${B.inside}</b>人<br>広場で規制待機 <b>${fmt(b.held)}</b>人`);
  if($('hw-stA').innerHTML!==stA)$('hw-stA').innerHTML=stA;if($('hw-stB').innerHTML!==stB)$('hw-stB').innerHTML=stB;
  chart();
  // Per-exit chips: people in each exit zone now (solver counts), coloured by its densest 3 m cell.
  const chipsShown={};const showChips=shot.name==='dispersal';
  for(const [side,cam,st,x0] of [['A',camL,a,0],['B',camR,b,W/2]]){chipsShown[side]=[];(st.exits||[]).forEach((e,k)=>{const c=chips[side][k],d=EXITS[k].disc,p=new THREE.Vector3(d[0],0,d[1]).project(cam);
    const px=Math.min(W/2-70,Math.max(70,(p.x+1)/2*W/2))+x0,py=Math.min(H-190,Math.max(310,(1-p.y)/2*H));c.style.display=showChips?'':'none';c.style.left=`${px}px`;c.style.top=`${py}px`;c.style.borderColor=densColor(e.peak);
    const t=fmt(e.people);if(c.lastChild.textContent!==t)c.lastChild.textContent=t;chipsShown[side].push({key:e.key,people:t,src:e.people});});}
  Object.assign(overlay,{frameShot:shot.name,split:{clock,A,B,heldB:fmt(b.held),chips:showChips?chipsShown:null,source:{time:a.time,timeB:b.time,heldB:b.held}}});
  delete overlay.results;delete overlay.board;delete overlay.question;
  results.style.display=board.style.display=question.style.display='none';
  const fadeIn=el=>{el.style.display='block';el.style.opacity=Math.min(1,shot.local/.4);};
  // Exit board: when each exit zone cleared (no 3 m cell above 2 p/m² from then on) and its peak.
  if(shot.name==='exits'){fadeIn(board);const rows=EXITS.map((e,k)=>{const x=a.exits[k],y=b.exits[k];return {key:e.key,A:{clear:exitClearText(x),peak:p2(x.peakRun)},B:{clear:exitClearText(y),peak:p2(y.peakRun)},src:{A:{clearAt:x.clearAt,peakRun:x.peakRun},B:{clearAt:y.clearAt,peakRun:y.peakRun}}};});
   const cell=(v,cls)=>`<td class="v ${cls}">${bi(v.clear)}<small>${L(`peak ${v.peak} p/m²`,`最大 ${v.peak}人/m²`)}</small></td>`;
   const html=`<h2>${L('Which exit clears first? (sim)','出口別・混雑が解消した時刻（シミュレーション）')}<small>${L(`cleared = no 3 m cell above ${DISPERSAL.exitClear} p/m² from then on · minutes after the station closes`,`解消＝以後どの3m区画も${DISPERSAL.exitClear}人/m²以下 ・ 駅閉鎖からの経過時間`)}</small></h2><table><tr><th></th><th class="a">${L('NO CONTROL','規制なし')}</th><th class="b">${L('ONE-WAY + STAGED RELEASE','一方通行＋段階的解放')}</th></tr>${rows.map((r,k)=>`<tr><td class="n">${exitName(EXITS[k])}</td>${cell(r.A,'a')}${cell(r.B,'b')}</tr>`).join('')}</table><div class="f">${L('exit zones are an illustrative mapping of the model\'s station geometry · counted from the simulated people','出口ゾーンはモデル上の駅形状への便宜的な対応づけ ・ シミュレーション上の人数から集計')}</div>`;
   if(board.innerHTML!==html)board.innerHTML=html;overlay.board={rows};}
  // Results card.
  if(shot.name==='results'){fadeIn(results);const cleared=s=>s.denseClearedAt!=null&&s.now&&s.now.densePeak<=DISPERSAL.dense?mmss(s.denseClearedAt):null;
   const rows=[
    ['still in the area after 25 min','25分後も現場に残る人',fmt(a.remaining),fmt(b.remaining)],
    [`dense crowd (> ${DISPERSAL.dense} p/m²) cleared at`,`密集（${DISPERSAL.dense}人/m²超）が解消した時刻`,cleared(a)??'not cleared · 未解消',cleared(b)??'not cleared · 未解消'],
    ['peak density (3 m cells)','最大密度（3 m 区画）',`${p2(a.peakCell)} p/m²`,`${p2(b.peakCell)} p/m²`],
    ['last person out of the station','駅から最後の人が出た時刻',mmss(a.stationEmptyAt)??'still inside · 駅内に残る',mmss(b.stationEmptyAt)??'still inside · 駅内に残る'],
    ['person-minutes at ≥ 4 p/m²','4人/m²以上の延べ時間（人・分）',fmt(a.crushPersonMinutes),fmt(b.crushPersonMinutes)],
    ['cars held by people on the road','路上の人で止まった車両',mmss(a.holdTotal),mmss(b.holdTotal)],
   ];
   const unit=v=>String(v).endsWith(' p/m²')?L(v,v.replace(' p/m²','人/m²')):bi(v);
   const html=`<h2>${L('25 minutes after the station closes','駅閉鎖から25分後')}<small>${L(`same ${fmt(a.agents)} people, same random seed`,`同じ${fmt(a.agents)}人・同じ乱数`)}</small></h2><table><tr><th></th><th class="a">${L('NO CONTROL','規制なし')}</th><th class="b">${L('MANAGED','一方通行＋段階的解放')}</th></tr>${rows.map(([en,ja,x,y])=>`<tr><td>${L(en,ja)}</td><td class="v a">${unit(x)}</td><td class="v b">${unit(y)}</td></tr>`).join('')}</table><div class="f">${L('every number counted from the simulated people · toy model, not a prediction','シミュレーション上の人数から集計・トイモデル（予測ではない）')}</div>`;
   if(results.innerHTML!==html)results.innerHTML=html;
   overlay.results={rows,source:{A:{remaining:a.remaining,denseClearedAt:a.denseClearedAt,densePeakNow:a.now?.densePeak,peakCell:a.peakCell,crush:a.crushPersonMinutes,holdTotal:a.holdTotal,stationEmptyAt:a.stationEmptyAt},B:{remaining:b.remaining,denseClearedAt:b.denseClearedAt,densePeakNow:b.now?.densePeak,peakCell:b.peakCell,crush:b.crushPersonMinutes,holdTotal:b.holdTotal,stationEmptyAt:b.stationEmptyAt}}};}
  // Comment-bait question + the sim's slowest exit + reported ward measures.
  if(shot.name==='question'){fadeIn(question);const slowest=st=>{let best=null;st.exits.forEach((e,k)=>{const t=e.clearAt==null?Infinity:e.clearAt;if(!best||t>best.t)best={k,t,e};});return best;};
   const sa=slowest(a),sb=slowest(b),txt=e=>exitClearText(e),part=(e,l)=>{const t=txt(e),k=t.indexOf(' · ');return k<0?t:l==='en'?t.slice(0,k):t.slice(k+3);};
   const tip=L(`In the sim, slowest exit to clear: no control — <b>${EXITS[sa.k].name}</b> (${part(sa.e,'en')}) · managed — <b>${EXITS[sb.k].name}</b> (${part(sb.e,'en')})`,
    `シミュレーションで最後まで混雑した出口：規制なし <b>${EXITS[sa.k].ja}</b>（${part(sa.e,'ja')}）・ 規制あり <b>${EXITS[sb.k].ja}</b>（${part(sb.e,'ja')}）`);
   const html=`<h2>${L('Which exit would you take?','あなたならどこから帰る？')}</h2><div class="opts">${EXITS.map((e,k)=>`<span class="opt"><i>${'ABCDEF'[k]}</i>${exitName(e)}</span>`).join('')}</div><div class="tip">${tip}</div><div class="facts">${FACTS.map(f=>L(`${f.en} (${f.outlet}, ${f.date})`,`${f.ja}（${f.outlet.replace('Shibuya Keizai Shimbun','シブヤ経済新聞').replace('Tokyo Shimbun','東京新聞')}, ${f.date}）`)).join('<br>')}</div><div class="cta">${L('Tell us in the comments','コメントで教えてください')}</div>`;
   if(question.innerHTML!==html)question.innerHTML=html;overlay.question={slowest:{A:EXITS[sa.k].key,B:EXITS[sb.k].key},clear:{A:txt(sa.e),B:txt(sb.e)},source:{A:a.exits.map(e=>({key:e.key,clearAt:e.clearAt,peakRun:e.peakRun})),B:b.exits.map(e=>({key:e.key,clearAt:e.clearAt,peakRun:e.peakRun}))}};}
  return {cars:0};}

 const drawHW=(shot,dtSim)=>{if(!api.state)return;api.resize();const r=shot?.split&&runs.A.state?drawSplit(shot):drawMain(shot,dtSim);lastShot=shot;
  const s=api.state,da=runs.A.state,db=runs.B.state,brief=d=>d&&{strategy:d.strategy,time:d.time,clock:d.clock,phase:d.phase,remaining:d.remaining,inside:d.inside,held:d.held,walking:d.walking,left:d.left,emerged:d.emerged,lost:d.lost,teleports:d.teleports,rerouted:d.rerouted,turnbacks:d.turnbacks,holdTotal:d.holdTotal,spillTime:d.spillTime,peakCell:d.peakCell,peakP95:d.peakP95,crushPersonMinutes:d.crushPersonMinutes,stationEmptyAt:d.stationEmptyAt,denseClearedAt:d.denseClearedAt,densePeakNow:d.now?.densePeak,clearedAt:d.clearedAt,summary:d.summary,series:d.series,exits:d.exits,exitSeries:d.exitSeries};
  window.__shibuyaState={ready:true,mode:'halloween',agents:n,hour:config.hour,fps:api.fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,phase:s.phase,clock:s.clock,time:s.time,
   active:s.active,waiting:s.waiting,approaching:s.approaching,held:s.held,heldPeak:s.heldPeak,attending:s.attending,density:s.density,admitted:s.admitted,completed:s.completed,lastCycle:s.lastCycle,released:s.released,cutoffs:s.cutoffs,
   teleports:s.teleports,rescued:s.rescued,laneViolations:s.laneViolations,deferred:s.deferred,clearanceHold:s.clearanceHold,vehicles:r.cars,camera:api.mode,shot:shot?.name??null,pumpkins:hs.pumpkinCount,officers:layout.officers.length,djLine:hs.line,
   dispersal:da?{A:brief(da),B:brief(db),scenario:runs.A.scenario}:null};};
 api.setDraw(drawHW);

 // ---- Recording API (deterministic: one call per video frame) ----
 window.__videoPlan={scene:SCENE_SECONDS,credits:CREDIT_SECONDS,startClock:START_CLOCK,dispersalSeconds:DISPERSAL_SECONDS,estimate:CROWD_2026.estimate};window.__hwFootnote=FOOTNOTE;
 window.__warmup=async(target=START_CLOCK)=>{while(api.state.clock<target-1e-6)api.state=await request({type:'advance',seconds:Math.min(5,Math.max(.1,target-api.state.clock))});
  await initDispersal();drawHW(shotAt(0),0);return window.__shibuyaState;};
 const advance=async shot=>{const dt=shot.speed/30;if(shot.sim==='main')api.state=await request({type:'advance',seconds:dt});else if(shot.sim==='dispersal')await advanceDispersal(dt);return dt;};
 window.__frame=async videoTime=>{const shot=shotAt(videoTime),t=performance.now(),dt=await advance(shot);api.setSim(performance.now()-t);drawHW(shot,dt);return window.__shibuyaState;};
 window.__skip=async videoTime=>{await advance(shotAt(videoTime));};
 window.__render=()=>{drawHW(api.mode==='cinema'?liveShotAt(0):null,0);return window.__shibuyaState;};
 window.__dispersalRuns=runs;
 window.__hwDebug={scene,post,hs,crowd,city,shared,renderer,drawHW,shotAt,initDispersal,advanceDispersal};
}
