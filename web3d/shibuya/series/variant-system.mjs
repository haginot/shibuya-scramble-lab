// Branching-variant system of the series (JR編 CLEAR / GAME OVER): scenario config (JSON) → validated timeline →
// per-frame spec (shot, crowd state, HUD items, logo, clock, footnote) + audio cue sheet. Pure module: no DOM, no
// three.js — runs in node (tools/variant_cues.mjs, tests) and in the page (series/app-variant.mjs).
//
// A video = SHARED OPENING (variants/<ep>/_opening.json, rendered once, reused byte-for-byte) + VARIANT BODY
// (variants/<ep>/<id>.json). Both are "parts" with the same beats[] schema; part time t starts at 0 in each part,
// video time = t (opening) or opening.duration + t (body). Every beat is a whole number of frames (30 fps).
//
// Config schema (docs/VARIANTS.md has the full reference; CONTRACT.md is the origin):
//  {id, episode:'jr', pair, outcome:'GAME_OVER'|'CLEAR', title:{ja}, start:{place, ja, factIds}, clock:{start:'22:10',
//   ja, rate?=1 (game minutes per video second)}, choice:{prompt:{ja}, options:[{key, ja, factIds}×2], picked},
//   beats:[{id, dur, shot:{key, params?, t0?}, crowd?:{key, params?, t0?, rate?}, hud:[{c, ja?, factIds, at?, until?, …}],
//           cues?:[{at, sfx, gain_db?, duck?, repeat?, count?, until?}] (omitted → automatic cues from the HUD items),
//           clock?: false | {set:'23:40', rate?}, header?: false, bgm?: track|null, amb?: bed|null, duck?: depth_db,
//           transition?: 'cut'|'dip' (dip = 3-frame dip to black around the cut INTO this beat), factIds?: [] (facts
//           shown by the 3D set, e.g. a departure board), board?: {…} (alt-platform departure board, merged into
//           shot.params.board), stamps?: [] (computed)}],
//   lesson:{ja, factIds}, cheat:{rows:[{ja, factIds}]}, sources:[fact ids], bgm, amb, routes?:{id:{points}}}
//  HUD item timing (extension): at (s after the beat start, default 0) … until (s, default beat end); the component
//  gets t = local − at and dur = until − at. A 'logo' item runs the 3D logotype: its sequence time continues across
//  consecutive beats that all carry a logo item (+ item.seq offset); {press:true} shows the 3D PRESS START line,
//  {outAt} dissolves it from that beat-local time.
//
// Exports:
//   FPS, PARTS, OUTCOMES, STAMP_FOR, SIM_RE, TEXT_RULES
//   validateConfig(cfg, {part, facts?, dropped?, shotKeys?, crowdKeys?, componentKeys?, strict?}) → {ok, errors, warnings}
//   validatePair(a, b) → errors[]          (same prompt/options, opposite outcomes, same pair)
//   buildPart(cfg, part) → plan {part, id, duration, frames, beats:[{…beat, index, f0, f1, t0, t1}], offset:0}
//   videoPlan(opening, body) → {duration, frames, opening:plan, body:{…plan, offset}, segments}
//   beatAt(plan, t) → {beat, index, local, u}
//   frameSpec(plan, cfg, t, {facts?, shotKeys?, crowdKeys?, componentKeys?, lang?}) → per-frame spec (see below)
//   footnoteFor(ids, {facts, sourceNames, lang, credit}) → '出典：…' | null
//   sourceRows(ids, {facts, sources}) → [{label, date, url, factIds}]
//   buildCues(opening, body, {fps}) → cue sheet (CONTRACT.md format + segments for tools/audio/mix.py)
//   collectFactIds(cfg) / collectStrings(cfg) / openingHash(openingCfg, extra)
//   COMBINED_BEATS, COMBINED_REUSE, isCombined(cfg), validateCombined(cfg, {configs?}), reuseMap(cfg, configs),
//   clockState(plan, cfg, t)
//
// COMBINED EPISODES (2026-10-26, combined/CONTRACT.md; docs/COMBINED.md): one video per pair = shared opening + a
// combined body (variants/<ep>/combined/<pair>.json, page variant=combined/<pair>) that plays the GAME OVER run → caught
// sequence → GAME OVER on black → lesson → CONTINUE? → the CLEAR run → kaiju gag → end card → union sources card.
//  {…variant schema, kind:'combined', outcome:'COMBINED', parts:{over:'<pair>-over', clear:'<pair>-clear'},
//   beats:[…16 beats in COMBINED_BEATS order; per beat reuse?:{variant, beat} (frames copied from that variant's rendered
//   body.mp4; dur must equal the source beat's) or origin?:{variant, beat} (a NEW render that re-shoots a source beat, e.g.
//   with a fix: zone/alt clear-result + clear-stamp), vt0? (s: video time of the background crowd solver at the beat
//   start — the origin's video time, so a re-shot beat sees the same crowd as the original; default opening + body t)]}
//  Copied/re-shot beats carry explicit shot.t0 / crowd.t0+restart / clock.set (generator tools/combined_configs.mjs), so
//  every beat also renders on its own exactly like its source. Stamps: GAME_OVER only in over-stamp, the CLEAR stamp only
//  in clear-stamp; two choice beats (item.picked = that run's pick). clock.set also takes 'HH:MM:SS' (fractional game
//  minutes: the re-shot clear beats continue the original clear video's clock exactly).

export const FPS=30;
export const PARTS=Object.freeze(['opening','body']);
export const OUTCOMES=Object.freeze(['GAME_OVER','CLEAR']);
export const STAMP_FOR=Object.freeze({GAME_OVER:['GAME_OVER'],CLEAR:['GAME_CLEAR','CLEAR','ESCAPED'],COMBINED:['GAME_OVER','GAME_CLEAR','CLEAR','ESCAPED'],V6:['GAME_OVER','GAME_CLEAR','CLEAR','ESCAPED','TRUE_END']});
export const SIM_RE=/シミュレーション|simulation/i;
export const FALLBACK_SHOT='aerial';
const STAMP_DROP=.16;            // ui/tokens.mjs MOTION.stampDrop (impact frame of the stamp component)
const LOGO_SLAM=.9;              // ui/logo3d.mjs LOGO_TIMELINE.slam
const CARD_COMPONENTS=['notice','rules','mission','lesson','cheat','sources','caption','direction'];
const DUCK_COMPONENTS={notice:-6,rules:-6,lesson:-7,cheat:-6,sources:-5,mission:-4,choice:-4,guide:-4,goodbye:-3};
const cc=(...c)=>String.fromCharCode(...c);
// banned names (never on screen / in configs) and real-alert styling words (must not look like a real emergency alert)
export const TEXT_RULES=Object.freeze({
 banned:[new RegExp(cc(101,110,97,98,108,101)+'\\s*'+cc(120),'i'),new RegExp(cc(0x30AB,0x30F3,0x30EA,0x30FC)),new RegExp(cc(99,97,110)+'-?'+cc(108,121),'i')],
 alert:[/J-?ALERT|Jアラート|緊急速報|国民保護|NHK|エリアメール|緊急地震/i],
 recommend:[/おすすめ|オススメ|推奨ルート/],
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const txt=(v,lang='ja')=>typeof v==='string'?v:isObj(v)?(v[lang]??v.ja??''):'';

// ---------------------------------------------------------------- strings / fact ids
const TEXT_KEYS=new Set(['ja','sub','title','tip','head','issuer','when','order','foot','note','label','labelJa','word','w2','go','snap','asOf','prompt','sec','dest','status','time',
 'en','kicker','attr','enAttr','doneLabel','assume','verdict']);   // + v8 sim panel (assumptions line, verdict)   // + v6 (mission/choice card/TRUE END/guide/goodbye: EN lines and labels are checked too)
// every displayable string of a value: [{text, path, factIds (nearest enclosing factIds)}]
export function collectStrings(v,path='',ids=[],out=[]){
 if(typeof v==='string'){out.push({text:v,path,factIds:ids});return out;}
 if(Array.isArray(v)){v.forEach((x,i)=>collectStrings(x,`${path}[${i}]`,ids,out));return out;}
 if(!isObj(v))return out;
 const own=Array.isArray(v.factIds)?v.factIds:ids;
 for(const [k,x] of Object.entries(v)){if(k==='factIds'||k==='sources')continue;
  if(typeof x==='string'){if(TEXT_KEYS.has(k))out.push({text:x,path:path?`${path}.${k}`:k,factIds:own});}
  else collectStrings(x,path?`${path}.${k}`:k,own,out);}
 return out;}
export function collectFactIds(cfg){const s=new Set();const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(isObj(v)){if(Array.isArray(v.factIds))for(const id of v.factIds)s.add(id);for(const [k,x] of Object.entries(v))if(k!=='factIds')walk(x);}};
 walk(cfg);for(const id of cfg?.sources||[])s.add(id);return [...s];}
// objects carrying factIds together with all their text (for the 「say」 label rules of sources-series.mjs FACTS)
function citingObjects(v,path='',out=[]){if(Array.isArray(v)){v.forEach((x,i)=>citingObjects(x,`${path}[${i}]`,out));return out;}
 if(!isObj(v))return out;
 if(Array.isArray(v.factIds)&&v.factIds.length)out.push({path,ids:v.factIds,text:collectStrings(v).map(s=>s.text).join('\n')});
 for(const [k,x] of Object.entries(v))if(k!=='factIds')citingObjects(x,path?`${path}.${k}`:k,out);
 return out;}

// ---------------------------------------------------------------- validation
// facts: {id:{na, say?, v?}} (sources-series.mjs FACTS); dropped: [ids]. Keys lists: unknown keys are warnings
// (the page falls back: shot → aerial, crowd → none, component → plain caption) unless strict.
export function validateConfig(cfg,{part=null,facts=null,dropped=[],shotKeys=null,crowdKeys=null,componentKeys=null,strict=false,configs=null}={}){
 const E=[],W=[];const err=m=>E.push(m),warn=m=>(strict?E:W).push(m);
 if(!isObj(cfg))return {ok:false,errors:['config is not an object'],warnings:[]};
 part??=cfg.part??(cfg.id==='_opening'||cfg.id==='opening'?'opening':'body');
 if(!PARTS.includes(part))err(`part must be opening|body (${part})`);
 if(typeof cfg.id!=='string'||!/^[a-z0-9_][a-z0-9-]*$/.test(cfg.id))err(`id must be kebab-case (${cfg.id})`);
 if(cfg.episode!=='jr')err(`episode must be 'jr' (${cfg.episode})`);
 if(!Array.isArray(cfg.beats)||!cfg.beats.length){err('beats[] missing');return {ok:false,errors:E,warnings:W};}
 const ids=new Set();let dur=0;
 cfg.beats.forEach((b,i)=>{const at=`beats[${i}]${b?.id?`(${b.id})`:''}`;
  if(!isObj(b)){err(`${at} not an object`);return;}
  if(typeof b.id!=='string'||!b.id)err(`${at}.id missing`);else if(ids.has(b.id))err(`${at}.id duplicate`);else ids.add(b.id);
  if(!(typeof b.dur==='number'&&b.dur>0&&b.dur<=30))err(`${at}.dur must be a number in (0, 30] s`);else{dur+=b.dur;if(Math.abs(b.dur*FPS-Math.round(b.dur*FPS))>1e-6)W.push(`${at}.dur ${b.dur} s is not a whole number of frames (rounded)`);}
  if(!isObj(b.shot)||typeof b.shot.key!=='string')err(`${at}.shot.key missing`);
  else if(shotKeys&&!shotKeys.includes(b.shot.key))warn(`${at}.shot.key '${b.shot.key}' unknown → falls back to '${FALLBACK_SHOT}'`);
  if(b.crowd!=null){if(!isObj(b.crowd)||typeof b.crowd.key!=='string')err(`${at}.crowd must be {key}`);else if(crowdKeys&&!crowdKeys.includes(b.crowd.key))warn(`${at}.crowd.key '${b.crowd.key}' unknown → no crowd state`);}
  if(b.hud!=null&&!Array.isArray(b.hud))err(`${at}.hud must be an array`);
  for(const [j,h] of (b.hud||[]).entries()){const hat=`${at}.hud[${j}]`;
   if(!isObj(h)||typeof h.c!=='string'){err(`${hat}.c missing`);continue;}
   if(componentKeys&&!componentKeys.includes(h.c)&&h.c!=='logo')warn(`${hat}.c '${h.c}' unknown → plain caption`);
   if(!Array.isArray(h.factIds)&&!['logo','choice','lesson','cheat','sources','parody','header','press-start','pressStart','clock','continue','endcard','gag'].includes(h.c))warn(`${hat} has no factIds ([] for game framing)`);
   if(h.c==='sim'&&!SIM_RE.test(txt(h)))err(`${hat}: sim item text must contain 「シミュレーション」`);
   if(h.at!=null&&!(h.at>=0&&h.at<b.dur))err(`${hat}.at outside the beat`);
   if(h.until!=null&&!(h.until>(h.at??0)&&h.until<=b.dur+1e-9))err(`${hat}.until must be in (at, dur]`);
   if(h.c==='stamp'&&part==='opening')err(`${hat}: no stamps in the opening`);
   if(h.c==='stamp'&&cfg.outcome&&!(STAMP_FOR[cfg.outcome]||[]).includes(h.kind))err(`${hat}: stamp ${h.kind} does not match outcome ${cfg.outcome}`);}
  for(const [j,c] of (b.cues||[]).entries())if(!isObj(c)||typeof c.sfx!=='string'||!(c.at>=0))err(`${at}.cues[${j}] must be {at>=0, sfx}`);
  if(b.clock!=null&&b.clock!==false&&!(isObj(b.clock)&&(b.clock.set==null||HM_RE.test(b.clock.set))))err(`${at}.clock must be false or {set:'HH:MM[:SS]', rate?}`);
  if(b.vt0!=null&&!(typeof b.vt0==='number'&&b.vt0>=0))err(`${at}.vt0 must be a number >= 0 (s)`);});
 const has=c=>cfg.beats.some(b=>(b.hud||[]).some(h=>h.c===c));
 const beatWith=c=>cfg.beats.find(b=>(b.hud||[]).some(h=>h.c===c));
 if(part==='opening'){
  if(!has('logo'))warn('opening has no logo item');
  if(!has('press-start')&&!has('pressStart')&&!cfg.beats.some(b=>(b.hud||[]).some(h=>h.c==='logo'&&h.press)))warn('opening has no PRESS START beat (press-start item or logo {press:true})');
  if(isV6Opening(cfg)){if(dur<12||dur>16.5)W.push(`v6 opening is ${dur.toFixed(2)} s (target 14–16 s)`);}
  else if(dur<8||dur>14.5)W.push(`opening is ${dur.toFixed(2)} s (target 9–14.5 s)`);
  if(cfg.beats[0]?.shot?.key!=='op-flythrough')W.push('opening should start on the op-flythrough shot');
  if(isCombined(cfg)||isV6(cfg))err('a combined / v6 config is a body (part=body)');
  if(isV6Opening(cfg)){const c=validateV6Opening(cfg);E.push(...c.errors);W.push(...c.warnings);}}
 else{
  if(!OUTCOMES.includes(cfg.outcome)&&!(isCombined(cfg)&&cfg.outcome==='COMBINED')&&!(isV6(cfg)&&cfg.outcome==='V6'))err(`outcome must be GAME_OVER|CLEAR${isCombined(cfg)?'|COMBINED':isV6(cfg)?'|V6':''} (${cfg.outcome})`);
  if(typeof cfg.pair!=='string'||!cfg.pair)err('pair missing');
  if(!txt(cfg.title))err('title.ja missing');
  const C=cfg.choice;
  if(!isObj(C)||!txt(C.prompt))err('choice.prompt.ja missing');
  else{if(!Array.isArray(C.options)||C.options.length!==2)err('choice.options must have 2 options');
   else{const keys=C.options.map(o=>o.key);if(new Set(keys).size!==2||C.options.some(o=>!txt(o)))err('choice options need distinct keys and ja');if(!keys.includes(C.picked))err(`choice.picked '${C.picked}' not an option`);}}
  if(!has('choice'))err('body has no choice beat (hud c:"choice")');
  if(!has('stamp'))err('body has no stamp beat');
  if(!has('lesson'))err('body has no lesson beat');
  const cb=beatWith('cheat');if(!cb)err('body has no cheat-sheet beat');else{const it=cb.hud.find(h=>h.c==='cheat');const d=(it.until??cb.dur)-(it.at??0);if(d<3-1e-9)err(`cheat sheet shown ${d} s (< 3 s)`);}
  if(!has('sources'))W.push('body has no sources card');
  if(!isObj(cfg.lesson)||!txt(cfg.lesson))err('lesson.ja missing');else if(!(cfg.lesson.factIds||[]).length)err('lesson must cite factIds (a real, sourced lesson)');
  if(!isObj(cfg.cheat)||!Array.isArray(cfg.cheat.rows)||!cfg.cheat.rows.length)err('cheat.rows missing');
  if(!Array.isArray(cfg.sources)||!cfg.sources.length)err('sources[] missing');
  if(isObj(cfg.clock)&&cfg.clock.start!=null&&!/^\d{1,2}:\d{2}$/.test(cfg.clock.start))err('clock.start must be HH:MM');
  if(isV6(cfg)){if(dur<62||dur>80)W.push(`v6 body is ${dur.toFixed(2)} s (target 70–76 s)`);}
  else if(isCombined(cfg)){if(dur<48||dur>64)W.push(`combined body is ${dur.toFixed(2)} s (target 50–62 s)`);}
  else if(dur<20||dur>34)W.push(`body is ${dur.toFixed(2)} s (target 24–32 s)`);
  // the stamp shown must come after the choice is made
  const ci=cfg.beats.indexOf(beatWith('choice')),si=cfg.beats.indexOf(beatWith('stamp'));if(ci>=0&&si>=0&&si<ci)err('stamp before the choice');
  if(isCombined(cfg)){const c=validateCombined(cfg,{configs});E.push(...c.errors);W.push(...c.warnings);}
  if(isV6(cfg)){const c=validateV6(cfg,{configs});E.push(...c.errors);W.push(...c.warnings);}}
 // text rules
 for(const s of collectStrings(cfg)){
  for(const re of TEXT_RULES.banned)if(re.test(s.text))err(`banned name in ${s.path}`);
  for(const re of TEXT_RULES.alert)if(re.test(s.text))err(`real-alert wording in ${s.path}: ${s.text}`);
  for(const re of TEXT_RULES.recommend)if(re.test(s.text))err(`routes are 「ルート例」, never 「おすすめ」 (${s.path})`);}
 // facts
 const all=collectFactIds(cfg);
 for(const id of all){if(dropped.includes(id))err(`dropped fact id ${id}`);else if(facts&&!facts[id])err(`unknown fact id ${id} (add it to sources-series.mjs FACTS)`);}
 // label groups: say (shared with the pilot) + sayV (variants only, e.g. 「通常」 on the regular-timetable last trains) +
 // 「OSMから概算」 for every computed walk (osm:true) — enforced here, not just written by hand (QA finding 10)
 if(facts)for(const o of citingObjects(cfg))for(const id of o.ids){const f=facts[id];if(!f)continue;const groups=[...(f.say||[]),...(f.sayV||[]),...(f.osm?[OSM_SAY]:[])];
  for(const g of groups)if(!g.some(a=>o.text.includes(a)))err(`${o.path}: cites ${id} but its text lacks one of ${JSON.stringify(g)}`);}
 if(part==='body'&&Array.isArray(cfg.sources)){const shown=new Set(all.filter(id=>!(cfg.sources||[]).includes(id)));for(const id of shown)if(facts?.[id]&&!facts[id].na)W.push(`fact ${id} shown but not in sources[]`);}
 return {ok:!E.length,errors:E,warnings:W};}

export const OSM_SAY=Object.freeze(['OSMから概算','概算']);
export function validatePair(a,b){const E=[];
 if(a.pair!==b.pair)E.push(`pair mismatch ${a.pair} / ${b.pair}`);
 if(new Set([a.outcome,b.outcome]).size!==2)E.push(`pair ${a.pair}: outcomes must be one GAME_OVER + one CLEAR`);
 if(txt(a.choice?.prompt)!==txt(b.choice?.prompt))E.push(`pair ${a.pair}: choice prompts differ`);
 const o=c=>JSON.stringify((c.choice?.options||[]).map(x=>[x.key,txt(x)]));if(o(a)!==o(b))E.push(`pair ${a.pair}: choice options differ`);
 if(a.choice?.picked===b.choice?.picked)E.push(`pair ${a.pair}: both variants pick ${a.choice?.picked}`);
 return E;}

// ---------------------------------------------------------------- timeline
export function buildPart(cfg,part=null){part??=cfg.part??(cfg.id==='_opening'?'opening':'body');let f=0;
 const beats=cfg.beats.map((b,index)=>{const n=Math.max(1,Math.round(b.dur*FPS)),f0=f;f+=n;return {...b,index,f0,f1:f,t0:f0/FPS,t1:f/FPS,dur:n/FPS};});
 // runs: start of the contiguous run of beats sharing the same crowd key / carrying a logo item (continuous time)
 // shot runs: a beat whose shot has the same key + params as the previous beat and no explicit t0 continues the move
 // (no jump back to the start of the camera path at the cut); shot.cut:true restarts it
 const sig=b=>b.shot?JSON.stringify([b.shot.key,b.shot.params||{}]):'';
 for(const b of beats){const p=beats[b.index-1];
  b.shotOffset=b.shot?.t0!=null?b.shot.t0:(p&&!b.shot?.cut&&sig(p)===sig(b)?p.shotOffset+p.dur:0);
  b.crowdRun=b.crowd&&p?.crowd?.key===b.crowd.key&&!b.crowd.restart?p.crowdRun:b.t0;
  const lh=(b.hud||[]).find(h=>h.c==='logo'),pl=p&&(p.hud||[]).some(h=>h.c==='logo');b.logoRun=lh?(pl?p.logoRun:b.t0):null;b.logoAt=lh?(pl?p.logoAt:(lh.at??0)):null;}
 return {part,id:cfg.id,duration:f/FPS,frames:f,fps:FPS,beats,offset:0};}
export function videoPlan(opening,body){const o=buildPart(opening,'opening'),b=buildPart(body,'body');b.offset=o.duration;
 return {fps:FPS,duration:o.duration+b.duration,frames:o.frames+b.frames,opening:o,body:b,
  segments:[{name:'opening',t0:0,t1:o.duration},{name:'body',t0:o.duration,t1:o.duration+b.duration}]};}
export function beatAt(plan,t){const f=Math.max(0,Math.min(plan.frames-1,Math.floor(t*FPS+1e-6)));
 let lo=0,hi=plan.beats.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(plan.beats[m].f0<=f)lo=m;else hi=m-1;}
 const beat=plan.beats[lo],local=Math.max(0,t-beat.t0);return {beat,index:lo,local,u:clamp(local/beat.dur)};}

// ---------------------------------------------------------------- game clock
const HM_RE=/^\d{1,2}:\d{2}(:\d{2})?$/;
const hm=s=>{const [h,m,sec=0]=String(s).split(':').map(Number);return h*60+m+sec/60;};
const fmtHM=m=>{m=Math.floor(m);return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(((m%60)+60)%60).padStart(2,'0')}`;};
// clockState → {minutes (game minutes since 00:00, fractional), rate, visible} at part time t (combined generator: the
// exact clock of a source beat, re-applied with clock.set 'HH:MM:SS')
export function clockState(plan,cfg,t){const C=cfg.clock;if(!isObj(C)||!C.start)return null;let base=hm(C.start),rate=C.rate??1,tb=0;
 for(const b of plan.beats){if(b.t0>t+1e-9)break;if(isObj(b.clock)){if(b.clock.set){base=hm(b.clock.set);tb=b.t0;}else{base+=rate*(b.t0-tb);tb=b.t0;}if(b.clock.rate!=null)rate=b.clock.rate;}}
 const {beat}=beatAt(plan,t);return {minutes:base+rate*(t-tb),rate,visible:beat.clock!==false};}
export const fmtHMS=m=>{const s=Math.round(m*60);return `${String(Math.floor(s/3600)%24).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export function clockAt(plan,cfg,t){const st=clockState(plan,cfg,t);if(!st||!st.visible)return null;
 return {time:fmtHM(st.minutes+1e-6),label:txt(cfg.clock)||'ゲーム内時刻（架空）'};}

// ---------------------------------------------------------------- footnote / sources
export function footnoteFor(ids,{facts,sourceNames,lang='ja',credit=null}={}){
 const known=[...new Set(ids)].filter(id=>facts?.[id]&&!facts[id].na);let names=[];
 try{names=known.length&&sourceNames?sourceNames(known,lang):[];}catch{names=[];}
 // the data credit is split on 「／」 and parts already named by a fact (e.g. © OpenStreetMap contributors) are not repeated
 const cred=credit?String(credit).split('／').filter(c=>!names.includes(c)):[];
 const all=[...names,...(cred.length?[cred.join('／')]:[])];if(!all.length)return null;
 return (lang==='en'?'Sources: ':'出典：')+all.join(lang==='en'?' · ':'／');}
export function sourceRows(ids,{facts,sources}={}){const rows=[],seen=new Set();
 for(const id of ids){const f=facts?.[id];if(!f||f.na)continue;for(const k of f.src||[]){const s=sources?.[k];if(!s)continue;const key=k;
  const row=rows.find(r=>r.key===key);if(row){if(!row.factIds.includes(id))row.factIds.push(id);continue;}
  if(seen.has(key))continue;seen.add(key);rows.push({key,label:s.osm?'© OpenStreetMap contributors':s.ja,date:s.date,url:s.url,factIds:[id]});}}
 return rows;}

// ---------------------------------------------------------------- per-frame spec
// → {t, part, beat:{id,index,local,u,dur}, shot:{key, requested, params, local}, crowd:{key, params, t}|null,
//    items:[hud items with t/dur], logo:{t, press, dissolve}|null, header:bool, clock, fade, stamps:[kinds allowed now],
//    factIds:[ids of the items on screen + beat.factIds], fallbacks:[…], vt (video time for the background crowd solver:
//    beat.vt0 + local when the beat sets vt0 (combined re-shot beats), else plan.offset + t), footnote (false when the
//    beat sets footnote:false — e.g. the end card, whose own credit line replaces the page footnote)}
export function frameSpec(plan,cfg,t,{shotKeys=null,crowdKeys=null,componentKeys=null}={}){
 const {beat,index,local,u}=beatAt(plan,t);const fb=[];
 const key=beat.shot?.key;let shotKey=key;if(shotKeys&&!shotKeys.includes(key)){shotKey=FALLBACK_SHOT;fb.push(`shot:${key}→${FALLBACK_SHOT}`);}
 const params={...(shotKey===key?beat.shot?.params||{}:{})};if(beat.board&&shotKey==='alt-platform')params.board={...(params.board||{}),...beat.board};
 let crowd=null;if(beat.crowd){const k=beat.crowd.key;if(crowdKeys&&!crowdKeys.includes(k))fb.push(`crowd:${k}→none`);else crowd={key:k,params:beat.crowd.params||{},t:(beat.crowd.t0??0)+(t-beat.crowdRun)*(beat.crowd.rate??1)};}
 const items=[];let logo=null;const ids=new Set(beat.factIds||[]);
 for(const h of beat.hud||[]){const a=h.at??0,b=h.until??beat.dur;if(local<a-1e-9||local>=b-1e-9&&b<beat.dur-1e-9)continue;
  if(h.c==='logo'){logo={t:(h.seq??0)+(t-beat.logoRun)-beat.logoAt,press:!!h.press,dissolve:h.outAt!=null?clamp((local-h.outAt)/(h.outDur??.5)):0,params:h.params||{}};continue;}
  let it={...h,t:local-a,dur:b-a};delete it.at;delete it.until;
  if(componentKeys&&!componentKeys.includes(h.c)){fb.push(`hud:${h.c}→caption`);it={c:'caption',ja:txt(h)||txt(h.title)||'',factIds:h.factIds||[],t:it.t,dur:it.dur};}
  items.push(it);for(const id of h.factIds||[])ids.add(id);
  // components that default to the config (choice/lesson/cheat) cite the config's fact ids
  if(h.c==='lesson')for(const id of cfg.lesson?.factIds||[])ids.add(id);
  if(h.c==='cheat')for(const r of cfg.cheat?.rows||[])for(const id of r.factIds||[])ids.add(id);
  if(h.c==='choice')for(const o of cfg.choice?.options||[])for(const id of o.factIds||[])ids.add(id);
  if(h.c==='rules')for(const r of h.items||[])for(const id of r.factIds||[])ids.add(id);
  if(h.c==='sources')for(const id of (h.factIds||cfg.sources||[]))ids.add(id);}
 // fade: dip to black around cuts into beats marked transition:'dip' (never on the first frame of a part)
 let fade=1;for(const b of plan.beats){if(b.transition!=='dip'||!b.index)continue;const d=Math.abs(t-b.t0);if(d<.1)fade=Math.min(fade,.25+.75*d/.1);}
 if(beat.fadeOut!=null&&local>beat.dur-beat.fadeOut)fade=Math.min(fade,(beat.dur-local)/beat.fadeOut);
 const stamps=(beat.hud||[]).filter(h=>h.c==='stamp').map(h=>h.kind);
 return {t,part:plan.part,beat:{id:beat.id,index,local,u,dur:beat.dur},shot:{key:shotKey,requested:key,params,local:local+beat.shotOffset},
  crowd,items,logo,header:beat.header===false||logo?false:beat.header&&typeof beat.header==='object'?{...beat.header}:true,// header:{sub?,scrim?} (v6) → the HUD header props
  clock:plan.part==='body'?clockAt(plan,cfg,t):null,fade,stamps,factIds:[...ids],fallbacks:fb,
  vt:beat.vt0!=null?beat.vt0+local:(plan.offset||0)+t,footnote:beat.footnote!==false};}

// ---------------------------------------------------------------- audio cue sheet
// CONTINUE? timing = ui/components.mjs continueTiming (HUD owner; mirrored here so this module stays dependency-free):
// digits count … 1 pop at tickAt[i] (evenly from .34 s to yesAt), YES is pressed at yesAt (default max(.34+.3·count, dur−1));
// the combined configs pin yesAt explicitly so picture and sound cannot drift apart
export function continueTiming(h,dur){const count=Math.max(1,Math.round(h.count??3)),t0=.34,yesAt=+(h.yesAt??Math.max(t0+count*.3,dur-1)).toFixed(3),step=(yesAt-t0)/count;
 return {count,yesAt,tickAt:Array.from({length:count},(_,i)=>+(t0+i*step).toFixed(3))};}
function autoCues(b){const out=[];
 for(const h of b.hud||[]){const a=h.at??0,dur=(h.until??b.dur)-a;
  if(h.c==='logo'){if(b.logoRun===b.t0&&!h.seq){out.push({at:a,sfx:'whoosh',gain_db:-3},{at:a+LOGO_SLAM,sfx:'riser',align:'hit'},{at:a+LOGO_SLAM,sfx:'logo_slam',duck:1.6,duck_db:-14});}}
  else if(h.c==='press-start'||h.c==='pressStart')out.push({at:a+.05,sfx:'press_start'},{at:a+Math.min(dur-.2,.55),sfx:'ui_select'});
  else if(h.c==='choice'&&h.card){const pick=h.pickAt??Math.max(1.2,dur-1);   // v6 first choice (card mode, no countdown ring → no ticks)
   out.push({at:a+.05,sfx:'card_in'},{at:a+.5+(pick-.5)*.38,sfx:'choice_move'},{at:a+.5+(pick-.5)*.72,sfx:'choice_move'},{at:a+pick,sfx:'choice_pick'});}
  else if(h.c==='mission'&&h.card)out.push({at:a+.02,sfx:'mission_in'});
  else if(h.c==='guide')out.push({at:a+.02,sfx:'guide_in'});
  else if(h.c==='goodbye')out.push({at:a,sfx:'goodbye_in'});
  else if(h.c==='stamp'&&h.kind==='TRUE_END')out.push({at:a+STAMP_DROP,sfx:'seal_stamp',duck:3.2,duck_db:-10},{at:a+STAMP_DROP+.05,sfx:'true_end_jingle'});
  else if(h.c==='choice'){const pick=h.pickAt??Math.max(1.2,dur-1);out.push({at:a+.05,sfx:'card_in'},{at:a+.3,sfx:'tick',repeat:.5,until:a+pick},{at:a+.5+(pick-.5)*.38,sfx:'choice_move'},{at:a+.5+(pick-.5)*.72,sfx:'choice_move'},{at:a+pick,sfx:'ui_select'});}
  else if(h.c==='stamp'){const k=h.kind==='GAME_OVER'?'gameover_jingle':h.kind==='ESCAPED'?'escaped':'clear_jingle';out.push({at:a+STAMP_DROP,sfx:'stamp_hit',duck:2.4,duck_db:-12},{at:a+STAMP_DROP+.05,sfx:k});}
  else if(['notice','rules','lesson','cheat','sources'].includes(h.c))out.push({at:a+.02,sfx:'card_in'});
  // combined episodes: CONTINUE? = card_in + one tick per digit (count … 1, evenly until yesAt) + continue_yes at yesAt;
  // end card = smash_cut on the cut in + end_sting; gag caption = boing (the kaiju beat carries its own cues)
  else if(h.c==='continue'){const {count,yesAt,tickAt}=continueTiming(h,dur);out.push({at:a+.02,sfx:'card_in'});
   for(let i=0;i<count;i++)out.push({at:a+tickAt[i],sfx:'continue_tick'});out.push({at:a+yesAt,sfx:'continue_yes',duck:.8,duck_db:-5});}
  else if(h.c==='endcard')out.push({at:a,sfx:'smash_cut',align:'hit'},{at:a+.15,sfx:'end_sting'});
  else if(h.c==='gag')out.push({at:a+.02,sfx:'boing',gain_db:-2});
  else if(CARD_COMPONENTS.includes(h.c)||h.c==='sim')out.push({at:a+.02,sfx:'ui_blip',gain_db:-4});}
 return out;}
export function buildCues(opening,body,{fps=FPS}={}){const V=videoPlan(opening,body);const ev=[],bgm=[],amb=[],duck=[];
 for(const [cfg,plan] of [[opening,V.opening],[body,V.body]]){const off=plan.offset,end=off+plan.duration;
  for(const b of plan.beats){const cues=Array.isArray(b.cues)?b.cues:autoCues(b);
   for(const c of cues){const e={t:+(off+b.t0+c.at).toFixed(4),sfx:c.sfx,gain_db:c.gain_db??0};
    for(const k of ['duck','duck_db','pan','repeat','count','align'])if(c[k]!=null)e[k]=c[k];
    if(c.repeat&&c.count==null)e.until=+(off+b.t0+(c.until??b.dur)).toFixed(4);
    if(e.t<end)ev.push(e);}
   for(const h of b.hud||[]){const d=b.duck??DUCK_COMPONENTS[h.c];if(d!=null)duck.push({t0:+(off+b.t0+(h.at??0)).toFixed(4),t1:+(off+b.t0+(h.until??b.dur)).toFixed(4),depth_db:d});}}
  // bgm / amb runs (beat overrides; null = silence)
  for(const [list,field,def,key] of [[bgm,'bgm',cfg.bgm,'track'],[amb,'amb',cfg.amb,'bed']]){let cur;
   for(const b of plan.beats){const v=b[field]!==undefined?b[field]:def;const t0=+(off+b.t0).toFixed(4),t1=+(off+b.t1).toFixed(4);
    if(cur&&cur[key]===v&&cur.t1===t0)cur.t1=t1;else if(v){cur={t0,t1,[key]:v,gain_db:0};list.push(cur);}else cur=null;}}}
 ev.sort((a,b)=>a.t-b.t);
 // one hit per (time, sfx): several HUD items entering together give one blip, not a stacked (louder) one
 for(let i=ev.length-1;i>0;i--)if(ev.slice(0,i).some(e=>Math.abs(e.t-ev[i].t)<1e-3&&e.sfx===ev[i].sfx&&!e.repeat&&!ev[i].repeat))ev.splice(i,1);
 return {duration:+V.duration.toFixed(4),fps,segments:V.segments.map(s=>({...s,t0:+s.t0.toFixed(4),t1:+s.t1.toFixed(4)})),events:ev,bgm,amb,duck,
  meta:{opening:opening.id,body:body.id,outcome:body.outcome,frames:V.frames,...(isCombined(body)||isV6(body)?{kind:body.kind,parts:body.parts,
   beats:V.body.beats.map(b=>({id:b.id,t0:+(V.body.offset+b.t0).toFixed(4),t1:+(V.body.offset+b.t1).toFixed(4),reuse:b.reuse?`${b.reuse.variant}/${b.reuse.beat}`:null,...(b.origin?{origin:`${b.origin.variant}/${b.origin.beat}`}:{})}))}:{})}};}

// ---------------------------------------------------------------- combined episodes (2026-10-26)
// Binding beat order (combined/CONTRACT.md table). COMBINED_REUSE: copied beat → [part, source beat id]; clear-result /
// clear-stamp may instead be re-shot (origin: zone/alt fixes). New beats: caught (caught-pov), over-stamp (black),
// continue (continue-bg), kaiju (kaiju-skyline), endcard + sources (card-bg|black).
export const COMBINED_BEATS=Object.freeze(['over-start','over-choice','over-move','over-result','caught','over-stamp','over-lesson','continue',
 'clear-choice','clear-move','clear-result','clear-stamp','clear-cheat','kaiju','endcard','sources']);
export const COMBINED_REUSE=Object.freeze({'over-start':['over','start'],'over-choice':['over','choice'],'over-move':['over','move'],'over-result':['over','result'],
 'over-lesson':['over','lesson'],'clear-choice':['clear','choice'],'clear-move':['clear','move'],'clear-result':['clear','result'],'clear-stamp':['clear','stamp'],'clear-cheat':['clear','cheat']});
export const COMBINED_RESHOOT=Object.freeze(['clear-result','clear-stamp']);
export const COMBINED_NEW=Object.freeze({caught:{shot:['caught-pov'],dur:2.5},'over-stamp':{shot:['black'],dur:2},continue:{shot:['continue-bg'],dur:3},
 kaiju:{shot:['kaiju-skyline'],dur:4},endcard:{shot:['card-bg','black'],dur:2.5},sources:{shot:['card-bg'],dur:3}});
export const COMBINED_VIDEO=Object.freeze([60,80]);   // opening + combined body, s (tools/variant_cues.mjs validateVideo)
export const isCombined=cfg=>isObj(cfg)&&cfg.kind==='combined';
const CLEAR_KINDS=['GAME_CLEAR','CLEAR','ESCAPED'];
// combined rules on top of the body rules of validateConfig. configs = {id: variant config} of the two parts (optional:
// the page validates without them; tools/variant_cues.mjs passes them → source beats / durations / pair / sources union)
export function validateCombined(cfg,{configs=null}={}){const E=[],W=[];const err=m=>E.push(m);
 const P=cfg.parts;if(!isObj(P)||typeof P.over!=='string'||typeof P.clear!=='string'){err("combined: parts:{over, clear} missing");return {errors:E,warnings:W};}
 if(cfg.outcome!=='COMBINED')err(`combined: outcome must be 'COMBINED' (${cfg.outcome})`);
 if(P.over!==`${cfg.pair}-over`||P.clear!==`${cfg.pair}-clear`)W.push(`combined: parts ${P.over}/${P.clear} are not ${cfg.pair}-over/${cfg.pair}-clear`);
 const ids=(cfg.beats||[]).map(b=>b?.id);
 if(JSON.stringify(ids)!==JSON.stringify(COMBINED_BEATS))err(`combined: beats must be ${COMBINED_BEATS.join(' → ')} (got ${ids.join(' → ')})`);
 const by=Object.fromEntries((cfg.beats||[]).filter(isObj).map(b=>[b.id,b]));
 const items=(b,c)=>(b?.hud||[]).filter(h=>isObj(h)&&h.c===c);
 for(const b of cfg.beats||[]){if(!isObj(b))continue;const at=`combined ${b.id}`,src=COMBINED_REUSE[b.id];
  for(const k of ['reuse','origin'])if(b[k]!=null){
   if(!src){err(`${at}: a new beat cannot have ${k}`);continue;}
   if(!isObj(b[k])||b[k].variant!==P[src[0]]||b[k].beat!==src[1])err(`${at}.${k} must be {variant:'${P[src[0]]}', beat:'${src[1]}'}`);}
  if(src){if(b.reuse&&b.origin)err(`${at}: reuse and origin are exclusive`);
   else if(!b.reuse&&!b.origin)err(`${at}: copied beat needs reuse:{variant:'${P[src[0]]}', beat:'${src[1]}'}`);
   else if(b.origin&&!COMBINED_RESHOOT.includes(b.id))err(`${at}: only ${COMBINED_RESHOOT.join('/')} may be re-shot (origin)`);}
  const nw=COMBINED_NEW[b.id];
  if(nw){if(!nw.shot.includes(b.shot?.key))W.push(`${at}: shot ${b.shot?.key} (contract: ${nw.shot.join('|')})`);
   if(Math.abs(b.dur-nw.dur)>1e-9)W.push(`${at}: ${b.dur} s (contract: ${nw.dur} s)`);}
  // stamps live only in their beat
  for(const h of items(b,'stamp')){if(h.kind==='GAME_OVER'&&b.id!=='over-stamp')err(`${at}: GAME_OVER stamp only in over-stamp`);
   if(CLEAR_KINDS.includes(h.kind)&&b.id!=='clear-stamp')err(`${at}: ${h.kind} stamp only in clear-stamp`);}}
 const rs=COMBINED_RESHOOT.map(i=>!!by[i]?.origin);if(rs[0]!==rs[1])W.push('combined: clear-result and clear-stamp should both be reused or both re-shot');
 if(by['over-stamp']){if(!items(by['over-stamp'],'stamp').some(h=>h.kind==='GAME_OVER'))err('combined over-stamp: needs a GAME_OVER stamp');
  else if(!items(by['over-stamp'],'stamp').some(h=>h.onBlack))W.push('combined over-stamp: stamp should be onBlack:true');
  if(by['over-stamp'].header!==false)err('combined over-stamp: header:false');}
 if(by['clear-stamp']&&!items(by['clear-stamp'],'stamp').some(h=>CLEAR_KINDS.includes(h.kind)))err('combined clear-stamp: needs a GAME_CLEAR/ESCAPED stamp');
 for(const id of ['caught','kaiju'])if(by[id]){if(by[id].header!==false)err(`combined ${id}: header:false`);if(by[id].clock!==false)err(`combined ${id}: clock:false`);}
 if(by.kaiju&&by.kaiju.bgm!==null)err('combined kaiju: bgm:null (BGM off for the gag)');
 if(by.caught&&by.caught.bgm!==null)W.push('combined caught: bgm:null expected (BGM off in the caught sequence)');
 for(const [id,c] of [['continue','continue'],['endcard','endcard'],['sources','sources'],['over-lesson','lesson'],['clear-cheat','cheat'],['over-choice','choice'],['clear-choice','choice']])
  if(by[id]&&!items(by[id],c).length)err(`combined ${id}: needs a '${c}' item`);
 // two runs → two picks (choice item.picked; default = config choice.picked)
 const pk=id=>items(by[id],'choice')[0]?.picked??cfg.choice?.picked;
 if(by['over-choice']&&by['clear-choice']&&pk('over-choice')===pk('clear-choice'))err('combined: over-choice and clear-choice pick the same option');
 // with the source configs: pair, picks, source beats + durations, sources union
 if(configs){const O=configs[P.over],C=configs[P.clear];
  if(!O||!C)err(`combined: source configs ${!O?P.over:''} ${!C?P.clear:''} missing`);
  else{for(const e of validatePair(O,C))err('combined parts: '+e);
   if(O.outcome!=='GAME_OVER'||C.outcome!=='CLEAR')err('combined: parts.over must be GAME_OVER and parts.clear CLEAR');
   if(O.pair!==cfg.pair)err(`combined: pair ${cfg.pair} ≠ parts pair ${O.pair}`);
   if(pk('over-choice')!==O.choice?.picked)err(`combined over-choice picks ${pk('over-choice')} (${P.over} picks ${O.choice?.picked})`);
   if(pk('clear-choice')!==C.choice?.picked)err(`combined clear-choice picks ${pk('clear-choice')} (${P.clear} picks ${C.choice?.picked})`);
   for(const b of cfg.beats||[]){const r=b?.reuse??b?.origin;if(!isObj(r))continue;const sc=configs[r.variant];const sb=sc?.beats?.find(x=>x.id===r.beat);
    if(!sb){err(`combined ${b.id}: source beat ${r.variant}/${r.beat} missing`);continue;}
    if(Math.round(sb.dur*FPS)!==Math.round(b.dur*FPS))err(`combined ${b.id}: ${b.dur} s ≠ source ${r.variant}/${r.beat} ${sb.dur} s`);
    if(b.origin&&sb.shot?.key!==b.shot?.key)W.push(`combined ${b.id}: re-shot with ${b.shot?.key} (origin ${sb.shot?.key})`);}
   const have=new Set(cfg.sources||[]);const miss=[...new Set([...(O.sources||[]),...(C.sources||[])])].filter(id=>!have.has(id));
   if(miss.length)err(`combined: sources[] must include the union of both parts (missing ${miss.join(', ')})`);}}
 return {errors:E,warnings:W};}
// reuse map of a combined body: per beat {id, f0, f1, frames, mode:'reuse'|'new', src:{variant, beat, f0, f1}|null, origin,
// shot} + pieces (maximal runs: consecutive new beats, or consecutive reused beats that continue the same source body
// contiguously) + the source timelines used. Throws when a source config / beat is missing or a duration differs.
export function reuseMap(cfg,configs={}){const P=buildPart(cfg),src={};
 const beats=P.beats.map(b=>{const r=b.reuse;let s=null;
  if(isObj(r)){const c=configs[r.variant];if(!c)throw Error(`reuseMap: no config ${r.variant}`);const sp=src[r.variant]??=buildPart(c);
   const sb=sp.beats.find(x=>x.id===r.beat);if(!sb)throw Error(`reuseMap: ${r.variant} has no beat ${r.beat}`);
   if(sb.f1-sb.f0!==b.f1-b.f0)throw Error(`reuseMap: ${b.id} ${b.f1-b.f0} frames ≠ ${r.variant}/${r.beat} ${sb.f1-sb.f0}`);s={variant:r.variant,beat:r.beat,f0:sb.f0,f1:sb.f1};}
  return {id:b.id,f0:b.f0,f1:b.f1,frames:b.f1-b.f0,mode:s?'reuse':'new',src:s,origin:isObj(b.origin)?`${b.origin.variant}/${b.origin.beat}`:null,shot:b.shot?.key??null};});
 const pieces=[];for(const b of beats){const p=pieces.at(-1);
  if(p&&p.f1===b.f0&&p.mode===b.mode&&(b.mode==='new'||(p.src.variant===b.src.variant&&p.src.f1===b.src.f0))){p.f1=b.f1;p.frames=p.f1-p.f0;p.beats.push(b.id);if(b.src)p.src.f1=b.src.f1;}
  else pieces.push({mode:b.mode,f0:b.f0,f1:b.f1,frames:b.frames,beats:[b.id],src:b.src?{variant:b.src.variant,f0:b.src.f0,f1:b.src.f1}:null});}
 return {id:cfg.id,pair:cfg.pair,fps:FPS,frames:P.frames,duration:P.duration,beats,pieces,
  sources:Object.fromEntries(Object.entries(src).map(([k,p])=>[k,{frames:p.frames,beats:p.beats.map(b=>({id:b.id,f0:b.f0,f1:b.f1}))}]))};}

// ---------------------------------------------------------------- v6 edition 「渋谷Halloweenには近づくな」 (2026-10-27)
// next/CONTRACT.md; docs/V6.md. One video per pair = v6 OPENING (variants/<ep>/v6/_opening.json: the pinned opening's
// op-fly/op-logo/op-press + rules frames reused, the notice beat replaced by a NEW `mission` beat) + v6 BODY
// (variants/<ep>/v6/<pair>.json, page variant=v6/<pair>): first-choice (A 「そもそも渋谷に行かない」 picked) → TRUE END →
// guide → the 14 combined beats (over run … kaiju; reused or re-shot) → GOODBYE end card → union sources.
//  body {…combined schema, kind:'v6', outcome:'V6', parts:{over, clear, combined:'combined/<pair>'}, beats:[19 beats in
//   V6_BEATS order]}; a copied beat carries reuse:{variant, beat} (frames copied from that source's render: a variant body
//   '<pair>-over'/'<pair>-clear' or the combined episode 'combined/<pair>') or origin:{variant, beat} (re-shot: a NEW
//   render of the same self-contained beat, e.g. after an accuracy fix) — ANY copied beat may be re-shot.
//  opening {id:'_opening-v6', part:'opening', edition:'v6', beats:[op-fly, op-logo, op-press, mission, rules]}: copied
//   beats carry reuse:{variant:'_opening', beat} (= the pinned opening render).
// Stamps: TRUE_END only in true-end, GAME_OVER only in over-stamp, the CLEAR kinds only in clear-stamp. The GOODBYE text
// is fixed verbatim (V6_GOODBYE; only line breaks may differ); the city's quoted block never carries our 「行かない」 line.
export const V6_COPIED=Object.freeze(COMBINED_BEATS.slice(0,14));   // over-start … kaiju
export const V6_BEATS=Object.freeze(['first-choice','true-end','guide',...V6_COPIED,'goodbye','sources']);
export const V6_NEW=Object.freeze({'first-choice':{shot:['card-bg'],dur:4.5},'true-end':{shot:['card-bg','true-end-bg'],dur:4},guide:{shot:['card-bg'],dur:3},
 goodbye:{shot:['card-bg','black'],dur:8},sources:{shot:['card-bg'],dur:3.5}});
export const V6_VIDEO=Object.freeze([75,95]);
// v8 (release:'v8', a v6-kind config; logs/ssl-claude-halloween/v8/STEERING-sim-core.md): the crowd-flow sim beats
// (sim-plan → sim-pick right after the start map; retry-why before the re-run clear-choice), video < 100 s.
export const V8_BEATS=Object.freeze(['first-choice','true-end','guide','over-start','sim-plan','sim-pick','over-choice','over-move','over-result','caught','over-stamp',
 'over-lesson','continue','retry-why','clear-choice','clear-move','clear-result','clear-stamp','clear-cheat','kaiju','goodbye','sources']);
export const V8_VIDEO=Object.freeze([75,100]);
export const isV8=cfg=>isObj(cfg)&&(cfg.release==='v8'||cfg.release==='v9');   // v6 opening + v6 body, s (tools/variant_cues.mjs validateVideo)
// v9 (release:'v9' = v8 + logs/ssl-claude-halloween/v9/STEERING-*.md): Halloween costumes on every CG person (look.costumes),
// the crush POV beat (crush-pov: eye-level crush, crushmeter = the crush scenario's real peak; before the caught sequence —
// alt: on the way out, right after the gut pick) and a low-density contrast beat on the CLEAR route (clear-pov); longer sim
// beats. Video 100–130 s (no cap; HAGINO OK'd longer, STEERING-length.md).
export const isV9=cfg=>isObj(cfg)&&cfg.release==='v9';
export const V9_VIDEO=Object.freeze([100,130]);
export function v9Beats(pair){const B=[...V8_BEATS];B.splice(B.indexOf('clear-move')+1,0,'clear-pov');
 if(pair==='alt')B.splice(B.indexOf('over-choice')+1,0,'crush-pov');else B.splice(B.indexOf('over-result')+1,0,'crush-pov');return Object.freeze(B);}
export const V6_OPENING_BEATS=Object.freeze(['op-fly','op-logo','op-press','mission','rules']);
export const V6_OPENING_REUSE=Object.freeze(['op-fly','op-logo','op-press','rules']);
// the source of a copied beat by default: combined new beats → the combined render; the rest → the variant bodies
// (the generator switches zone/alt clear-result/stamp to the combined render: those were re-shot with the fixes there)
export const V6_COMBINED_NEW=Object.freeze(['caught','over-stamp','continue','kaiju']);
export const isV6=cfg=>isObj(cfg)&&cfg.kind==='v6';
export const isV6Opening=cfg=>isObj(cfg)&&cfg.edition==='v6'&&(cfg.part==='opening'||String(cfg.id).startsWith('_opening'));
// fixed copy (CONTRACT.md; HAGINO-approved, STEERING-concept-dont-go.md / endcard-facts.md) — compare without line breaks
export const V6_MISSION=Object.freeze({ja:['渋谷ハロウィンには、近づくな。','もう来てしまったなら、安全に脱出せよ。'],en:"Stay away from Shibuya Halloween. If you're already there, escape safely."});
export const V6_FIRST=Object.freeze({prompt:'まず、どうする？',A:'そもそも渋谷に行かない',B:'もう渋谷にいる',Bsub:'仕事・住まい・うっかり来てしまった'});
export const V6_GOODBYE=Object.freeze({
 quote:Object.freeze({title:'GOODBYE BAD HALLOWEEN',ja:'渋谷駅周辺では、条例で飲酒・喫煙、ごみのポイ捨ては禁止されています。',attr:'（渋谷区）',
  en:'Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance.',enAttr:'(Shibuya City)'}),
 facts:Object.freeze([Object.freeze({ja:'10/30(金)早朝〜11/1(日)朝方　ハチ公像は囲いで観覧不可',en:'Oct 30 early AM – Nov 1 morning: Hachiko statue fenced off'}),
  Object.freeze({ja:'10/30夕方〜11/1早朝　駅周辺で交通規制',en:'Oct 30 evening – Nov 1 early AM: traffic restrictions around the station'})]),
 ours:Object.freeze({ja:'いちばんのCLEARは、今年の渋谷に「行かない」こと。',en:"The best CLEAR this year: don't go to Shibuya."}),
 foot:Object.freeze({ja:'出典：渋谷区公式X（2026/10/22）・渋谷区・警視庁渋谷警察署　※本編はフィクションです',
  en:'Sources: Shibuya City (X, Oct 22, 2026), Shibuya City, MPD Shibuya Police Station. *Story is fiction.'})});
// "don't come / don't go" wording: ours only, never next to the city's name (the city does not say 「来るな」)
export const STAYAWAY_RE=/来るな|来ないで|行かない|近づくな|stay away|don'?t (go|come)/i;
export const CITY_RE=/渋谷区|Shibuya City/i;
export const INVITE_RE=/会場|楽しも|楽しんで|遊びに来|盛り上が/;   // wording that reads as an invitation (QA flags reused captions)
const flat=s=>String(s??'').replace(/\n/g,'');
// a copied v6 beat's default source: [part key of cfg.parts, source beat id]
export function v6Source(id){const i=V6_COPIED.indexOf(id);if(i<0)return null;
 if(V6_COMBINED_NEW.includes(id))return ['combined',id];return [id.startsWith('over-')?'over':'clear',id.replace(/^(over|clear)-/,'')];}
// allowed sources of a copied beat: the default + (clear-*/over-*) the combined render's copy of it
function v6Allowed(id,P){const s=v6Source(id);if(!s)return [];const out=[{variant:P[s[0]],beat:s[1]}];if(s[0]!=='combined')out.push({variant:P.combined,beat:id});return out;}

export function validateV6Opening(cfg){const E=[],W=[];const err=m=>E.push(m);
 const ids=(cfg.beats||[]).map(b=>b?.id);
 if(JSON.stringify(ids)!==JSON.stringify(V6_OPENING_BEATS))err(`v6 opening: beats must be ${V6_OPENING_BEATS.join(' → ')} (got ${ids.join(' → ')})`);
 for(const b of cfg.beats||[]){if(!isObj(b))continue;const at=`v6 opening ${b.id}`;
  if(V6_OPENING_REUSE.includes(b.id)){if(!isObj(b.reuse)||b.reuse.variant!=='_opening'||b.reuse.beat!==b.id)err(`${at}: reuse:{variant:'_opening', beat:'${b.id}'} (pinned opening frames)`);}
  else if(b.reuse)err(`${at}: a new beat cannot have reuse`);
  if((b.hud||[]).some(h=>h?.c==='notice'))err(`${at}: the notice beat is replaced by the mission beat (no notice in v6)`);}
 const m=(cfg.beats||[]).find(b=>b?.id==='mission');
 if(m){const it=(m.hud||[]).find(h=>h?.c==='mission');
  if(!it)err('v6 opening mission: needs a {c:"mission", card:true} item');
  else{if(!it.card)err('v6 opening mission: card:true (the big mission card)');
   if(flat(it.ja)!==V6_MISSION.ja.join(''))err(`v6 opening mission: ja must be 「${V6_MISSION.ja.join('／')}」`);
   if(flat(it.en)!==V6_MISSION.en)err('v6 opening mission: en must be the CONTRACT line');
   if(it.issuer!=null&&!/架空/.test(txt(it.issuer)))err('v6 opening mission: the issuer must be fictional (…（架空）)');}
  if(Math.abs(m.dur-3.5)>1e-9)W.push(`v6 opening mission: ${m.dur} s (contract 3.5 s)`);}
 for(const s of collectStrings(cfg))if(/脱出ゲーム会場/.test(s.text)||((m?.hud||[]).some(h=>collectStrings(h).some(x=>x.text===s.text))&&INVITE_RE.test(s.text)))err(`v6 opening: invitation wording in ${s.path}: ${s.text}`);
 return {errors:E,warnings:W};}

// v6 body rules on top of the body rules of validateConfig. configs = {id: config} of the sources (variant bodies + the
// combined config under its page id 'combined/<pair>'; optional: the page validates without them)
export function validateV6(cfg,{configs=null}={}){const E=[],W=[];const err=m=>E.push(m);
 const P=cfg.parts;if(!isObj(P)||typeof P.over!=='string'||typeof P.clear!=='string'||typeof P.combined!=='string'){err('v6: parts:{over, clear, combined} missing');return {errors:E,warnings:W};}
 if(cfg.outcome!=='V6')err(`v6: outcome must be 'V6' (${cfg.outcome})`);
 if(P.over!==`${cfg.pair}-over`||P.clear!==`${cfg.pair}-clear`||P.combined!==`combined/${cfg.pair}`)W.push(`v6: parts ${P.over}/${P.clear}/${P.combined} do not match pair ${cfg.pair}`);
 const ids=(cfg.beats||[]).map(b=>b?.id);
 const ORDER=isV9(cfg)?v9Beats(cfg.pair):isV8(cfg)?V8_BEATS:V6_BEATS;
 if(JSON.stringify(ids)!==JSON.stringify(ORDER))err(`v6: beats must be ${ORDER.join(' → ')} (got ${ids.join(' → ')})`);
 const by=Object.fromEntries((cfg.beats||[]).filter(isObj).map(b=>[b.id,b]));
 const items=(b,c)=>(b?.hud||[]).filter(h=>isObj(h)&&h.c===c);
 for(const b of cfg.beats||[]){if(!isObj(b))continue;const at=`v6 ${b.id}`,ok=v6Allowed(b.id,P);
  if(!ok.length){for(const k of ['reuse','origin'])if(b[k]!=null)err(`${at}: a new beat cannot have ${k}`);}
  else{if(b.reuse&&b.origin)err(`${at}: reuse and origin are exclusive`);
   else if(!b.reuse&&!b.origin)err(`${at}: copied beat needs reuse (or origin to re-shoot it)`);
   else{const r=b.reuse??b.origin;if(!isObj(r)||!ok.some(o=>o.variant===r.variant&&o.beat===r.beat))err(`${at}.${b.reuse?'reuse':'origin'} must be one of ${ok.map(o=>`${o.variant}/${o.beat}`).join(' | ')}`);}
   if(b.origin&&b.vt0==null)W.push(`${at}: re-shot without vt0 (the background crowd differs from the original)`);}
  const nw=V6_NEW[b.id];
  if(nw){if(!nw.shot.includes(b.shot?.key))W.push(`${at}: shot ${b.shot?.key} (contract: ${nw.shot.join('|')})`);
   if(Math.abs(b.dur-nw.dur)>1e-9)W.push(`${at}: ${b.dur} s (contract: ${nw.dur} s)`);}
  // stamps live only in their beat
  for(const h of items(b,'stamp')){if(h.kind==='TRUE_END'&&b.id!=='true-end')err(`${at}: TRUE_END stamp only in true-end`);
   if(h.kind==='GAME_OVER'&&b.id!=='over-stamp')err(`${at}: GAME_OVER stamp only in over-stamp`);
   if(CLEAR_KINDS.includes(h.kind)&&b.id!=='clear-stamp')err(`${at}: ${h.kind} stamp only in clear-stamp`);}
  // never invite: new beats must not carry invitation wording; copied (reused) captions are warnings for QA
  for(const s of collectStrings(b.hud||[],`${b.id}.hud`))if(INVITE_RE.test(s.text)){if(nw)err(`${at}: invitation wording ${s.path}: ${s.text}`);else W.push(`${at}: reused caption reads as an invitation? ${s.path}: ${s.text} (QA)`);}}
 // first choice: A 「そもそも渋谷に行かない」 picked, B = already in Shibuya (+ sub)
 const fc=items(by['first-choice'],'choice')[0];
 if(by['first-choice']){if(!fc)err('v6 first-choice: needs a {c:"choice", card:true} item');
  else{const o=fc.options||[],A=o.find(x=>x.key==='A'),B=o.find(x=>x.key==='B');
   if(!fc.card)err('v6 first-choice: card:true (no map)');
   if(flat(txt(fc.prompt))!==V6_FIRST.prompt)err(`v6 first-choice: prompt must be 「${V6_FIRST.prompt}」`);
   if(o.length!==2||!A||!B)err('v6 first-choice: options A + B');
   else{if(txt(A)!==V6_FIRST.A)err(`v6 first-choice: A must be 「${V6_FIRST.A}」`);if(txt(B)!==V6_FIRST.B)err(`v6 first-choice: B must be 「${V6_FIRST.B}」`);
    if(flat(txt(B.sub))!==V6_FIRST.Bsub)err(`v6 first-choice: B.sub must be 「${V6_FIRST.Bsub}」`);}
   if(fc.picked!=='A')err('v6 first-choice: A (「そもそも渋谷に行かない」) must be picked → TRUE END');
   if(fc.pickAt!=null&&!(fc.pickAt>0&&fc.pickAt<by['first-choice'].dur-.3))err('v6 first-choice: pickAt must leave ≥ 0.3 s after the pick');}}
 // TRUE END: right after the first choice, exactly one TRUE_END stamp
 const te=by['true-end'];
 if(te){const st=items(te,'stamp');if(st.length!==1||st[0].kind!=='TRUE_END')err('v6 true-end: exactly one stamp, kind TRUE_END');
  if(ids.indexOf('true-end')!==ids.indexOf('first-choice')+1)err('v6 true-end must follow first-choice directly');
  if(te.crowd)err('v6 true-end: no crowd (calm, nobody goes)');}
 const g=items(by.guide,'guide')[0];if(by.guide){if(!g)err('v6 guide: needs a {c:"guide"} item');else if((g.hot??'B')!=='B')err('v6 guide: B (already in Shibuya) is highlighted');
  if(items(by.guide,'sim').length)err('v6 guide: no sim item (fiction-free card)');}
 for(const id of ['over-stamp','caught','kaiju','goodbye'])if(by[id]&&by[id].header!==false)err(`v6 ${id}: header:false`);
 for(const id of ['caught','kaiju','goodbye','first-choice','true-end','guide'])if(by[id]&&by[id].clock!==false)err(`v6 ${id}: clock:false`);
 if(by.kaiju&&by.kaiju.bgm!==null)err('v6 kaiju: bgm:null (BGM off for the gag)');
 for(const [id,c] of [['over-stamp','stamp'],['clear-stamp','stamp'],['continue','continue'],['over-lesson','lesson'],['clear-cheat','cheat'],['over-choice','choice'],isV8(cfg)?['clear-choice','simpanel']:['clear-choice','choice'],['sources','sources'],...(isV8(cfg)?[['sim-plan','simpanel'],['sim-pick','simpanel']]:[])])
  if(by[id]&&!items(by[id],c).length)err(`v6 ${id}: needs a '${c}' item`);
 if(by['over-stamp']&&!items(by['over-stamp'],'stamp').some(h=>h.kind==='GAME_OVER'))err('v6 over-stamp: needs a GAME_OVER stamp');
 if(by['clear-stamp']&&!items(by['clear-stamp'],'stamp').some(h=>CLEAR_KINDS.includes(h.kind)))err('v6 clear-stamp: needs a GAME_CLEAR/CLEAR/ESCAPED stamp');
 const pk=id=>items(by[id],'choice')[0]?.picked??cfg.choice?.picked;
 if(!isV8(cfg)&&by['over-choice']&&by['clear-choice']&&pk('over-choice')===pk('clear-choice'))err('v6: over-choice and clear-choice pick the same option');
 if(isV8(cfg)){// v8: the sim drives the choice: SIM PICK before the gut pick; the re-run picks the CLEAR route; sim beats are labelled
  const sp=items(by['sim-pick'],'simpanel')[0],cc=items(by['clear-choice'],'simpanel')[0];
  if(sp&&sp.pickAt==null)err('v8 sim-pick: the panel needs pickAt (the SIM PICK highlight)');
  if(cc&&(cc.from==null||cc.pickAt==null))err('v8 clear-choice: the re-run panel needs from (first ranking) + pickAt');
  for(const id of ['sim-plan','sim-pick','retry-why','clear-choice'])if(by[id]&&!by[id].simmap)err(`v8 ${id}: needs simmap (heat map + agents)`);
  if(cfg.sim&&cfg.sim.pick===cfg.sim.over)err('v8: the SIM PICK is the GAME OVER route');
  if(cfg.sim&&cfg.sim.retryPick!==cfg.sim.clear)err('v8: the re-run pick is not the CLEAR route');}
 if(isV9(cfg)){// v9: the crush POV shows the crush scenario's number (crushmeter, labelled シミュレーション); costumes on
  const cm=items(by['crush-pov'],'crushmeter')[0];if(!cm)err('v9 crush-pov: needs a crushmeter item');else if(cm.scenario!=='crush'||cm.route!==cfg.sim?.over)err('v9 crush-pov: the crushmeter reads the crush scenario of the GAME OVER route');
  if(by['clear-pov']&&!items(by['clear-pov'],'simmeter').length)err('v9 clear-pov: needs a simmeter (low density, sim)');
  if(cfg.look?.costumes!=='v9')err("v9: look.costumes must be 'v9'");
  if(by['crush-pov']&&(by['crush-pov'].dur<6-1e-9||by['crush-pov'].dur>8+1e-9))W.push(`v9 crush-pov: ${by['crush-pov'].dur} s (steering: ~6–8 s)`);}
 if(items(by.endcard,'endcard').length||cfg.beats?.some(b=>items(b,'endcard').length))err('v6: the old endcard is replaced by the goodbye card');
 // GOODBYE: verbatim text, 3 separate blocks; the city's block never carries our message
 const gb=by.goodbye;
 if(gb){const it=items(gb,'goodbye')[0];if(!it)err('v6 goodbye: needs a {c:"goodbye"} item');
  else for(const e of goodbyeErrors(it))err('v6 goodbye: '+e);
  if(gb.footnote!==false)err('v6 goodbye: footnote:false (the card carries its own source line)');
  if(gb.dur<8-1e-9)err(`v6 goodbye: ${gb.dur} s (≥ 8 s: ≥ 6 s fully legible)`);}
 // 「来るな」-type wording is ours: never in a string that names the city
 for(const s of collectStrings(cfg))if(STAYAWAY_RE.test(s.text)&&CITY_RE.test(s.text))err(`v6: stay-away wording next to the city's name (${s.path}: ${s.text})`);
 if(cfg.beats?.[0]&&cfg.beats[0].transition==='dip')W.push('v6: first body beat with a dip');
 // with the source configs: picks, source beats + durations, sources union
 if(configs){const O=configs[P.over],C=configs[P.clear],K=configs[P.combined];
  if(!O||!C||!K)err(`v6: source configs ${[!O&&P.over,!C&&P.clear,!K&&P.combined].filter(Boolean).join(' ')} missing`);
  else{if(!isV8(cfg)&&pk('over-choice')!==O.choice?.picked)err(`v6 over-choice picks ${pk('over-choice')} (${P.over} picks ${O.choice?.picked})`);
   if(!isV8(cfg)&&pk('clear-choice')!==C.choice?.picked)err(`v6 clear-choice picks ${pk('clear-choice')} (${P.clear} picks ${C.choice?.picked})`);
   for(const b of cfg.beats||[]){const r=b?.reuse??b?.origin;if(!isObj(r))continue;const sc=configs[r.variant];const sb=sc?.beats?.find(x=>x.id===r.beat);
    if(!sb){err(`v6 ${b.id}: source beat ${r.variant}/${r.beat} missing`);continue;}
    if(!isV8(cfg)&&Math.round(sb.dur*FPS)!==Math.round(b.dur*FPS))err(`v6 ${b.id}: ${b.dur} s ≠ source ${r.variant}/${r.beat} ${sb.dur} s`);
    if(b.reuse&&sb.origin==null&&sb.reuse==null&&r.variant===P.combined&&!V6_COMBINED_NEW.includes(b.id))err(`v6 ${b.id}: ${r.variant}/${r.beat} is not a rendered (new/re-shot) beat of the combined episode`);
    if(b.reuse&&r.variant===P.combined&&sb.reuse)err(`v6 ${b.id}: reuse the original ${sb.reuse.variant}/${sb.reuse.beat}, not the combined copy of it`);}
   const have=new Set(cfg.sources||[]);const miss=[...new Set([...(O.sources||[]),...(C.sources||[])])].filter(id=>!have.has(id));
   if(miss.length)err(`v6: sources[] must include the union of both runs (missing ${miss.join(', ')})`);}}
 return {errors:E,warnings:W};}
// the goodbye item against the fixed text (only line breaks may differ). The props are optional (the HUD defaults to the
// same text); when given they must match.
export function goodbyeErrors(it){const E=[],G=V6_GOODBYE;const eq=(a,b,lab)=>{if(a!=null&&flat(txt(a))!==b)E.push(`${lab} must be 「${b}」 (got 「${flat(txt(a))}」)`);};
 const q=it.quote||{};eq(q.title,G.quote.title,'quote.title');eq(q.ja,G.quote.ja,'quote.ja');eq(q.attr,G.quote.attr,'quote.attr');eq(q.en,G.quote.en,'quote.en');eq(q.enAttr,G.quote.enAttr,'quote.enAttr');
 if(it.facts!=null){if(!Array.isArray(it.facts)||it.facts.length!==G.facts.length)E.push('facts: exactly the 2 fact rows');else it.facts.forEach((f,i)=>{eq(f.ja,G.facts[i].ja,`facts[${i}].ja`);eq(f.en,G.facts[i].en,`facts[${i}].en`);});}
 const o=it.ours||{};eq(o.ja,G.ours.ja,'ours.ja');eq(o.en,G.ours.en,'ours.en');
 if(o.attr!=null||CITY_RE.test(txt(o.label)||''))E.push('ours: our message has no attribution to the city');
 const f=it.foot||{};eq(f.ja,G.foot.ja,'foot.ja');eq(f.en,G.foot.en,'foot.en');
 for(const s of collectStrings(it.quote||{}))if(STAYAWAY_RE.test(s.text))E.push(`quote: the city's block cannot carry 「${s.text}」`);
 for(const s of collectStrings(it.facts||[]))if(STAYAWAY_RE.test(s.text))E.push(`facts: the fact rows cannot carry 「${s.text}」`);
 return E;}

// ---------------------------------------------------------------- cache keys
// stable JSON (sorted keys) + FNV-1a 64 → hex; the opening cache key also covers `extra` (file hashes of the code)
export function stableJSON(v){if(Array.isArray(v))return `[${v.map(stableJSON).join(',')}]`;if(isObj(v))return `{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJSON(v[k])).join(',')}}`;return JSON.stringify(v);}
export function fnv64(s){let h=0xcbf29ce484222325n;const p=0x100000001b3n,m=(1n<<64n)-1n;for(const c of new TextEncoder().encode(s)){h^=BigInt(c);h=(h*p)&m;}return h.toString(16).padStart(16,'0');}
export const openingHash=(openingCfg,extra='')=>fnv64(stableJSON(openingCfg)+'|'+extra);
