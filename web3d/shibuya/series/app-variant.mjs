// Branching-variant page of the series (JR編 CLEAR / GAME OVER):
//   web3d/shibuya/?mode=series&ep=jr&variant=<id>&part=opening|body&lang=ja&aspect=v[&record=1][&opening=_opening]
//                 [&jrrun=URL][&agents=N][&pr=1][&hs=0]
// (app.mjs hands over here when `variant` is present; the pilot URL without `variant` still runs series/app-jr.mjs).
// part=opening renders the SHARED opening (variants/<ep>/_opening.json; identical for every variant), part=body the
// variant body (variants/<ep>/<id>.json). The timeline is series/variant-system.mjs; per frame:
//   frameSpec → SHOTS[key](ctx, params)(local) (shots-variants.mjs; unknown key → 'aerial') → applyEnv on the shared
//   scene (scene-jr.mjs) → background crowd = live JR solver stepped to JR time BG0 + video time (spec.vt; monotonic, resumable)
//   → crowd state (crowd-variants.mjs crowdFrame; its regions hide the solver crowd) → near-camera people
//   (people-close.mjs NearPeople: state people + solver agents within 18 m of an eye-level camera) → 3D logo
//   (opening.mjs createOpeningLogo / ui/logo3d.mjs) → shot effects (below) → post → DOM HUD (ui/components.mjs GameHUD;
//   unknown component → plain caption; missing HUD module → plain text fallback).
// Shot effects (combined episodes, optional modules like the others; a missing module = the plain shot):
//   env.caught (shots 'caught-pov') → series/vfx-caught.mjs createCaughtVFX({scene,camera,renderer,post}).update(env.caught|null,
//   {aspect}); env.kaiju ('kaiju-skyline') → series/kaiju.mjs createKaiju({scene}).update(env.kaiju|null,{camera,time}). Both
//   are created up front when the plan uses those shot keys (shaders compiled in __warmup), else lazily on the first frame
//   whose env carries them; every later frame calls update (null when the env has none → hidden). A caught-pov beat's crowd
//   state gets params.pov = {x, z, y (floor), dir:[dx,dz], heading} (the frozen player spot, static per beat → cached setup);
//   'caught-press' also gets at:[x,z] / heading / y from it unless the config sets them.
//   env.blank ('black', caught-pov after the cut): treated like a flat frame (no solver step, no near people, no reflection
//   pass, scene parts hidden) → a black frame costs ≈ the post pass only.
// Recording API (tools/record_variant.py; one call per video frame, nothing on a wall clock):
//   window.__variantPlan     {id, part, ep, duration, frames, fps, offset, beats:[{id,t0,t1,shot,crowd,hud,stamps}], validation,
//                             videoDuration, openingDuration}
//   await window.__warmup(t) solver to the segment start, shaders compiled, two warm-up renders at t (no black first frame)
//   await window.__frame(t)  part time t → state;  window.__variantOverlay = per-frame record (checked by the recorder)
import * as THREE from '../../vendor/three.module.min.js';
import {shared} from '../shaders.mjs';
import * as VS from './variant-system.mjs';
import {FACTS,DROPPED,SOURCES,sourceNames} from './sources-series.mjs';
import {buildJRScene,LOOK} from './scene-jr.mjs';

const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const optional=async(path)=>{try{return await import(path);}catch(e){console.warn(`variant page: ${path} unavailable (${e.message}) → fallback`);return null;}};
export const DATA_CREDIT='3D：PLATEAU／© OpenStreetMap contributors';
export const BG_SIM0=-12;// JR time of the background crowd at video time 0 (as the pilot's T_SIM0)

export async function loadConfigs(ep,id,openingId=null){const dir=new URL(`./variants/${ep}/`,import.meta.url);
 const body=await json(new URL(`${id}.json`,dir));
 let oid=openingId,opening=null;
 if(oid)opening=await json(new URL(`${oid}.json`,dir));
 else{try{opening=await json(new URL('_opening.json',dir));oid='_opening';}catch{opening=await json(new URL('_sample-opening.json',dir));oid='_sample-opening';}}
 return {opening,body,openingId:oid};}

export async function start(params){
 window.__ready=false;
 const recording=params.get('record')==='1',lang=params.get('lang')||'ja',ep=params.get('ep')||'jr',id=params.get('variant'),part=params.get('part')||'body';
 if(ep!=='jr')throw Error('only ep=jr has variants');
 if(!VS.PARTS.includes(part))throw Error('part must be opening|body');
 document.title='ハロウィンの渋谷を脱出せよ！ JR編';
 const style=document.createElement('style');
 style.textContent=`#hud,#brand,#caption,#controls,#disclaimer,footer{display:none!important}html,body{margin:0;background:#000;overflow:hidden}#view{position:fixed;inset:0}#view canvas{width:100%!important;height:100%!important;display:block}#loading{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font:600 16px "Noto Sans CJK JP";z-index:50}
 #vs-plain{position:fixed;left:28px;right:92px;top:84px;bottom:240px;z-index:30;color:#fff;font:700 22px/1.4 "Noto Sans CJK JP",sans-serif;text-shadow:0 2px 6px #000;white-space:pre-line}
 #vs-plain .p{display:inline-block;background:#FFD23F;color:#160A14;padding:2px 8px;font-size:16px}#vs-plain .f{position:fixed;left:28px;right:112px;bottom:246px;font-size:12px}`;
 document.head.append(style);document.body.classList.add('series','variant',`lang-${lang}`);if(recording)document.body.classList.add('recording');
 const $=i=>document.getElementById(i);const status=m=>{if($('loading')){$('loading').hidden=false;$('loading').textContent=m;}};
 status('JR編（分岐）を準備中…');

 // ---------- configs + timeline ----------
 const {opening,body,openingId}=await loadConfigs(ep,id,params.get('opening'));
 const cfg=part==='opening'?opening:body;
 const [shotsM,crowdM,hudM,peopleM,openM]=await Promise.all([optional('./shots-variants.mjs'),optional('./crowd-variants.mjs'),optional('./ui/components.mjs'),optional('./people-close.mjs'),optional('./opening.mjs')]);
 if(!shotsM)throw Error('shots-variants.mjs is required');
 const keys={shotKeys:[...shotsM.SHOT_KEYS],crowdKeys:crowdM?Object.keys(crowdM.CROWD_STATES):[],componentKeys:hudM?[...hudM.COMPONENT_KEYS]:null};
 const validation=VS.validateConfig(cfg,{part,facts:FACTS,dropped:DROPPED,...keys});
 if(!validation.ok)console.error('variant config invalid:',validation.errors.join('; '));
 const V=VS.videoPlan(opening,body),plan=part==='opening'?V.opening:V.body;

 // ---------- scene ----------
 const S=await buildJRScene(params,{recording,status,routes:{...(opening.routes||{}),...(body.routes||{})}});
 const {camera,scene,post,sets}=S;
 const near=peopleM?new peopleM.NearPeople(scene,{capacity:900,lod0:140}):null;
 if(near){near.uniforms.uKey.value=LOOK.key;}
 // logo (opening.mjs if present, else Logo3D directly)
 const needLogo=plan.beats.some(b=>(b.hud||[]).some(h=>h.c==='logo'));let logo=null;
 if(needLogo){status('ロゴを準備中…');
  if(openM?.createOpeningLogo)logo=await openM.createOpeningLogo({scene,camera,aspect:S.W/S.H});
  else{const L=await optional('./ui/logo3d.mjs');if(L){const g=new L.Logo3D({data:await L.loadLogoGlyphs(),sdf:await L.loadLogoSdf(),aspect:S.W/S.H,press:true}).attach(scene,camera);g.setTime(-1);
   logo={logo:g,update(s){if(!s){g.setPress(false,0);g.setTime(-1);g.setDissolve(0);return {flash:0};}g.setPress(!!s.press,0);g.setTime(s.t);g.setDissolve(s.dissolve||0);return {flash:g.state.flash};}};}}}
 // HUD (GameHUD, or a plain-text fallback that still carries ※パロディ + footnote)
 let hud=null;
 if(hudM?.GameHUD){hud=new hudM.GameHUD(document.body,{lang});await hud.ready;}
 else{const el=document.createElement('div');el.id='vs-plain';document.body.append(el);
  hud={frame(s){const strings=[],ids=[],sims=[],stamps=[];const notice=s.items.some(i=>i.c==='notice'),src=s.items.some(i=>i.c==='sources');let h=notice?'<span class="p">フィクション</span>\n':'';if(notice)strings.push('フィクション');for(const tg of s.tags||[]){strings.push(tg);h+=tg+'\n';}
   for(const it of s.items){const t=it.ja||it.prompt?.ja||it.kind||'';if(t){strings.push(t);h+=t.replace(/</g,'&lt;')+'\n';}for(const i of it.factIds||[])ids.push(i);if(it.c==='sim'||VS.SIM_RE.test(t))sims.push({text:t,label:VS.SIM_RE.test(t)});if(it.c==='stamp')stamps.push(it.kind==='GAME_OVER'?'gameover':it.kind==='ESCAPED'?'escaped':'clear');}
   if(src){const n='※この動画はパロディ（フィクション）です';strings.push(n);h+=n+'\n';}
   const ft=typeof s.footnote==='function'?s.footnote(ids):s.footnote;if(ft){strings.push(ft);h+=`<div class="f">${ft}</div>`;}el.innerHTML=h;
   return {T:s.T,parody:false,fiction:notice,notice,parodyNote:src,header:!!s.header,items:s.items.map(i=>i.c),strings,factIds:ids,sims,stamps,cheat:s.items.some(i=>i.c==='cheat'),choice:null,boxes:[],safe:{ok:true,violations:[]},footnote:ft?{ids,text:ft}:null,plain:true};}};}
 const srcRows=VS.sourceRows(body.sources||[],{facts:FACTS,sources:SOURCES});
 const footnote=ids=>VS.footnoteFor(ids,{facts:FACTS,sourceNames,lang,credit:DATA_CREDIT});

 // ---------- shots / crowd states (built once per beat) ----------
 const shotCache=new Map();
 function shotFor(spec){const k=spec.beat.index;let e=shotCache.get(k);
  if(!e){let fn;try{fn=shotsM.SHOTS[spec.shot.key](S.ctx,spec.shot.params);}catch(err){console.error(`shot ${spec.shot.key} failed (${err.message}) → aerial`);fn=shotsM.SHOTS[VS.FALLBACK_SHOT](S.ctx,{});spec.fallbacks.push(`shot:${spec.shot.key}!→aerial`);}
   e={fn};shotCache.set(k,e);}
  return e.fn(spec.shot.local);}
 const crowdCtx={insideBuilding:S.R.insideBuilding,run:null};
 // crowd states sit on the set-piece anchors (taxi-sakura queue at the moved stand, closure line, platform…); taxi-west keeps
 // its default spot beside the stand so the queue does not hide the 「休止中」 board (stills review 2026-10-26)
 function crowdState(spec,e={}){if(!spec.crowd||!crowdM)return null;const C=e.caught,hd=C?.dir?Math.atan2(C.dir[0],C.dir[1]):0;
  // caught-pov → the frozen player spot: params.pov for any state + at/heading/y defaults for 'caught-press' (config wins)
  const press=C?.at&&(crowdM.resolveCrowdState?crowdM.resolveCrowdState(spec.crowd.key)==='caught-press':spec.crowd.key==='caught-press');
  const pov=C?.at?{pov:{x:C.at[0],z:C.at[1],y:C.floorY??0,dir:C.dir,heading:hd},...(press?{at:[+C.at[0].toFixed(2),+C.at[1].toFixed(2)],heading:+hd.toFixed(4),y:C.floorY??0}:{})}:{};
  try{return crowdM.crowdFrame(spec.crowd.key,spec.crowd.t,{params:{...(crowdM.paramsFromSets&&sets?.anchors&&spec.crowd.key!=='taxi-west'?crowdM.paramsFromSets(spec.crowd.key,sets.anchors):{}),...pov,...spec.crowd.params},ctx:crowdCtx});}catch(e){console.error('crowd state',e.message);spec.fallbacks.push(`crowd:${spec.crowd.key}!→none`);return null;}}

 // ---------- shot effects: caught VFX + kaiju (optional modules) ----------
 const fx={caught:null,kaiju:null,tried:{}};
 async function ensureFx(kind){if(fx[kind]||fx.tried[kind])return fx[kind];fx.tried[kind]=true;
  try{if(kind==='caught'){const M=await optional('./vfx-caught.mjs');if(M?.createCaughtVFX)fx.caught=M.createCaughtVFX({scene,camera,renderer:S.renderer,post});}
   else{const M=await optional('./kaiju.mjs');if(M?.createKaiju){fx.kaiju=M.createKaiju({scene});if(fx.kaiju?.group&&!fx.kaiju.group.parent)scene.add(fx.kaiju.group);}}}
  catch(err){console.error(`variant page: ${kind} effect failed (${err.message}) → plain shot`);fx[kind]=null;}return fx[kind];}
 const planKeys=new Set(plan.beats.map(b=>b.shot?.key));
 if(planKeys.has('caught-pov'))await ensureFx('caught');if(planKeys.has('kaiju-skyline'))await ensureFx('kaiju');
 function updateFx(e,vt,fb){const out={caught:null,kaiju:null};
  for(const [k,arg] of [['caught',{aspect:S.W/S.H}],['kaiju',{camera,time:vt}]]){const v=fx[k];if(!v)continue;
   try{v.update(e[k]??null,arg);out[k]=!!e[k];}catch(err){console.error(`${k} update`,err.message);fb.push(`${k}!→none`);}}
  return out;}

 window.__variantPlan={id:cfg.id,variant:id,part,ep,openingId,duration:plan.duration,frames:plan.frames,fps:VS.FPS,offset:plan.offset,videoDuration:V.duration,openingDuration:V.opening.duration,
  outcome:body.outcome,beats:plan.beats.map(b=>({id:b.id,t0:b.t0,t1:b.t1,f0:b.f0,f1:b.f1,shot:b.shot?.key,crowd:b.crowd?.key??null,hud:(b.hud||[]).map(h=>h.c),stamps:(b.hud||[]).filter(h=>h.c==='stamp').map(h=>h.kind)})),
  validation,agents:S.nAgents};

 // ---------- one frame ----------
 let lastT=null,lastPartT=null;
 async function frame(t){const T0=performance.now();
  // vt = video time of the background world (solver crowd, near-people anim, interior, uTime): spec.vt = beat.vt0 + local on
  // combined re-shot / new beats (the original's video time, so a re-shot clear beat sees the same crowd), else opening + t.
  // The solver only steps forward: a recording segment starts fresh at its own vt; live preview / multi-time stills that
  // jump back in vt keep the later solver state (cosmetic, preview only).
  const spec=VS.frameSpec(plan,cfg,t,keys),vt=spec.vt??(plan.offset+t);lastPartT=t;
  const lg=logo?logo.update(spec.logo):null;
  const shot=shotFor(spec);
  const res=shotsM.applyEnv(shot,S.parts,spec.shot.local);const flat=res.flat||!!res.blank,e=shot.env||{};
  if(e.caught&&!fx.tried.caught)await ensureFx('caught');if(e.kaiju&&!fx.tried.kaiju)await ensureFx('kaiju');
  post.settings.uFade.value*=spec.fade;if(lg?.flash)post.settings.uExposure.value*=1+lg.flash*.6;
  // background crowd: JR solver to BG0 + video time
  const cpt=e.focus?{x:e.focus[0],z:e.focus[1]}:{x:shot.look.x,z:shot.look.z};
  // the solver only advances while its crowd is on screen (cards / flat maps skip it: ≈1–2 s/frame saved); the next crowd
  // frame catches up deterministically (stepTo is chunk-independent), exactly like a segment start
  if(res.crowdVisible)await S.stepTo(S.eStart+BG_SIM0+vt,cpt);const simMs=performance.now()-T0;
  const dtSim=lastT==null?0:Math.max(0,vt-lastT);lastT=vt;
  S.updateCrowd(dtSim);
  // crowd-state people are invisible from high aerials (>80 m): skip them (and their solver mask) there
  const frAll=crowdState(spec,e),fr=camera.position.y>80||res.blank?null:frAll;
  if(S.crowd){if(fr?.regions?.length)crowdM.maskCrowdRegions(S.crowd,fr.regions);S.crowd.uniforms.uNearDim.value=e.eye?LOOK.nearDim:0;}
  // near people: crowd-state people + solver agents close to an eye-level camera (replaces the low-poly figures)
  let nearList=[];if(fr&&!flat)nearList=fr.people.slice();
  const eyeCam=!flat&&camera.position.y<12;
  if(S.crowd&&res.crowdVisible&&eyeCam&&peopleM)nearList=nearList.concat(peopleM.swapNearFromCrowd(S.crowd,{camera,radius:18,minDist:e.nearHide??.9}));
  else if(S.crowd&&e.eye&&(e.nearHide??0)>0){const P=S.crowd.data,cx=camera.position.x,cz=camera.position.z,r=e.nearHide;let ch=false;for(let i=0;i<S.crowd.n;i++){const x=P[4*i];if(x<-5000)continue;if(Math.hypot(x-cx,P[4*i+1]-cz)<r){P[4*i]=P[4*i+1]=-9999;ch=true;}}if(ch)S.crowd.gather();}
  // eye-level / interior shots: a little fill on the near people (queue shots under the viaduct read as dark blobs otherwise)
  if(near)near.uniforms.uFill.value=e.nearFill??(e.eye||e.interior||camera.position.y<12?.1:0);
  if(near){near.visible=!flat&&nearList.length>0;if(near.visible)near.set(nearList,{animTime:vt,camera});else near.clear();}
  const nInterior=S.interior(!!e.interior&&!flat,S.eStart+BG_SIM0+vt,shot);
  const drawn=S.crowd&&S.crowd.visible?S.cullCrowd(e.eye?220:4000,camera.position.y<40):0;
  shared.uTime.value=vt;S.R.update(vt,camera);
  const fxOn=updateFx(e,vt,spec.fallbacks);
  S.render(flat);S.finish();
  const renderMs=performance.now()-T0-simMs;
  // HUD
  let items=spec.items.filter(it=>it.c!=='parody');
  items=items.map(it=>{if(it.c==='pin'&&Array.isArray(it.world)){const q=S.project(it.world[0],it.world[1]??0,it.world[2]??0);return q.inFrame?{...it,x:q.x,y:q.y}:null;}if(typeof it.crowd==='string'){const f=frAll?.hud?.items?.find(x=>x.id===it.crowd);return f?{...it,c:it.c==='sim'?'sim':it.c,ja:f.text}:null;}return it;}).filter(Boolean);
  // 「位置・構造は概略」 for approximate sets / the station interior: a design-system corner tag (ui/components.mjs tag)
  // (not on the caught POV: the creature hands own the frame edges there)
  const approx=(e.approx||e.interior)&&!flat&&!e.caught?(shotsM.APPROX_LABEL?.[lang]??'位置・構造は概略'):null;
  // beat.factIds cover the 3D content (e.g. the departure board): not on screen on blank frames (black / after the caught cut);
  // beat.footnote:false (end card: its own credit line) → no page footnote; a blank frame without claims → none either
  // kaiju gag: the footnote sits over the bright street-light row → dark backing plate (ui footnote plate:true)
  const beatIds=res.blank?[]:spec.factIds;
  const rec=hud.frame({T:t,items,header:spec.header,clock:spec.clock,tags:approx?[approx]:[],footnote:spec.footnote===false?null:ids=>{const all=[...new Set([...beatIds,...ids])];if(res.blank&&!all.length)return null;const f=footnote(all);return f&&e.kaiju?{ja:f,[lang]:f,plate:true}:f;},config:body,sources:srcRows,lang});
  const strings=[...rec.strings];
  const claims=[...new Set([...beatIds,...rec.factIds])];
  const out={t,vt,part,beat:spec.beat.id,beatIndex:spec.beat.index,local:spec.beat.local,shot:{key:spec.shot.key,requested:spec.shot.requested,name:shot.name},
   crowd:spec.crowd?{key:spec.crowd.key,t:spec.crowd.t,people:fr?.people?.length??0}:null,
   title:{header:!!rec.header,logo:!!spec.logo&&spec.logo.t>=0&&(spec.logo.dissolve??0)<1},parody:!!rec.parody,fiction:!!rec.fiction,notice:!!rec.notice,parodyNote:!!rec.parodyNote,approx:!!approx,strings,sims:rec.sims,stamps:rec.stamps,allowedStamps:spec.stamps,
   claims,footnote:rec.footnote?{ids:claims,text:rec.footnote.text}:{ids:[],text:''},footBox:rec.footBox||null,safe:rec.safe,cheat:!!rec.cheat,choice:rec.choice,items:rec.items,fallbacks:spec.fallbacks,
   caught:e.caught?{t:+e.caught.t.toFixed(3),intensity:+e.caught.intensity.toFixed(3),press:+e.caught.press.toFixed(3),flash:+e.caught.flash.toFixed(3),black:e.caught.black,vfx:!!fxOn.caught}:null,
   kaiju:e.kaiju?{rise:+e.kaiju.rise.toFixed(3),eyes:+e.kaiju.eyes.toFixed(3),roar:+e.kaiju.roar.toFixed(3),model:!!fxOn.kaiju}:null,blank:!!res.blank,
   cont:rec.cont??null,endcard:rec.endcard??null,gag:rec.gag??null,credit:rec.credit??null,goodbye:rec.goodbye??null,guide:rec.guide??null,mission:rec.mission??null,
   ms:{sim:Math.round(simMs),render:Math.round(renderMs)},peopleDrawn:drawn,near:near?.last?.drawn??0,interior:nInterior,fade:+(post.settings.uFade.value).toFixed(3),cutFade:+(+spec.fade).toFixed(3)};
  window.__variantOverlay=out;
  return {t,frame:Math.round(t*VS.FPS),beat:spec.beat.id,shot:spec.shot.key,ms:out.ms,drawCalls:S.renderer.info.render.calls,triangles:S.renderer.info.render.triangles,agents:S.nAgents};}

 window.__warmup=async(t0=0)=>{if(params.get('jrrun')){await S.loadRun();crowdCtx.run=S.run;}
  const spec=VS.frameSpec(plan,cfg,t0,keys);const sh=shotFor(spec);shotsM.applyEnv(sh,S.parts,spec.shot.local);S.compile();
  // two renders at the segment start: shader programs + logo bake + solver catch-up happen here, never on a captured frame
  const s=await frame(t0);lastT=null;await frame(t0);lastT=null;if($('loading'))$('loading').hidden=true;
  return {...s,agents:S.nAgents,validation};};
 window.__frame=async t=>frame(t);
 window.__variantDebug={S,plan,cfg,opening,body,VS,get logo(){return logo;},near,hud};
 window.__ready=true;
 if(!recording){await window.__warmup(0);let t0=null;const loop=async now=>{t0??=now;const t=((now-t0)/1000)%plan.duration;if(lastPartT!=null&&t<lastPartT)location.reload();await frame(t);requestAnimationFrame(loop);};requestAnimationFrame(loop);}
}
