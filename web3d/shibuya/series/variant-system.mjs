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

export const FPS=30;
export const PARTS=Object.freeze(['opening','body']);
export const OUTCOMES=Object.freeze(['GAME_OVER','CLEAR']);
export const STAMP_FOR=Object.freeze({GAME_OVER:['GAME_OVER'],CLEAR:['GAME_CLEAR','CLEAR','ESCAPED']});
export const SIM_RE=/シミュレーション|simulation/i;
export const FALLBACK_SHOT='aerial';
const STAMP_DROP=.16;            // ui/tokens.mjs MOTION.stampDrop (impact frame of the stamp component)
const LOGO_SLAM=.9;              // ui/logo3d.mjs LOGO_TIMELINE.slam
const CARD_COMPONENTS=['notice','rules','mission','lesson','cheat','sources','caption','direction'];
const DUCK_COMPONENTS={notice:-6,rules:-6,lesson:-7,cheat:-6,sources:-5,mission:-4,choice:-4};
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
const TEXT_KEYS=new Set(['ja','sub','title','tip','head','issuer','when','order','foot','note','label','labelJa','word','w2','go','snap','asOf','prompt','sec','dest','status','time']);
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
export function validateConfig(cfg,{part=null,facts=null,dropped=[],shotKeys=null,crowdKeys=null,componentKeys=null,strict=false}={}){
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
   if(!Array.isArray(h.factIds)&&!['logo','choice','lesson','cheat','sources','parody','header','press-start','pressStart','clock'].includes(h.c))warn(`${hat} has no factIds ([] for game framing)`);
   if(h.c==='sim'&&!SIM_RE.test(txt(h)))err(`${hat}: sim item text must contain 「シミュレーション」`);
   if(h.at!=null&&!(h.at>=0&&h.at<b.dur))err(`${hat}.at outside the beat`);
   if(h.until!=null&&!(h.until>(h.at??0)&&h.until<=b.dur+1e-9))err(`${hat}.until must be in (at, dur]`);
   if(h.c==='stamp'&&part==='opening')err(`${hat}: no stamps in the opening`);
   if(h.c==='stamp'&&cfg.outcome&&!(STAMP_FOR[cfg.outcome]||[]).includes(h.kind))err(`${hat}: stamp ${h.kind} does not match outcome ${cfg.outcome}`);}
  for(const [j,c] of (b.cues||[]).entries())if(!isObj(c)||typeof c.sfx!=='string'||!(c.at>=0))err(`${at}.cues[${j}] must be {at>=0, sfx}`);
  if(b.clock!=null&&b.clock!==false&&!(isObj(b.clock)&&(b.clock.set==null||/^\d{1,2}:\d{2}$/.test(b.clock.set))))err(`${at}.clock must be false or {set:'HH:MM', rate?}`);});
 const has=c=>cfg.beats.some(b=>(b.hud||[]).some(h=>h.c===c));
 const beatWith=c=>cfg.beats.find(b=>(b.hud||[]).some(h=>h.c===c));
 if(part==='opening'){
  if(!has('logo'))warn('opening has no logo item');
  if(!has('press-start')&&!has('pressStart')&&!cfg.beats.some(b=>(b.hud||[]).some(h=>h.c==='logo'&&h.press)))warn('opening has no PRESS START beat (press-start item or logo {press:true})');
  if(dur<8||dur>14.5)W.push(`opening is ${dur.toFixed(2)} s (target 9–14.5 s)`);
  if(cfg.beats[0]?.shot?.key!=='op-flythrough')W.push('opening should start on the op-flythrough shot');}
 else{
  if(!OUTCOMES.includes(cfg.outcome))err(`outcome must be GAME_OVER|CLEAR (${cfg.outcome})`);
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
  if(dur<20||dur>34)W.push(`body is ${dur.toFixed(2)} s (target 24–32 s)`);
  // the stamp shown must come after the choice is made
  const ci=cfg.beats.indexOf(beatWith('choice')),si=cfg.beats.indexOf(beatWith('stamp'));if(ci>=0&&si>=0&&si<ci)err('stamp before the choice');}
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
const hm=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+m;};
const fmtHM=m=>{m=Math.floor(m);return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(((m%60)+60)%60).padStart(2,'0')}`;};
export function clockAt(plan,cfg,t){const C=cfg.clock;if(!isObj(C)||!C.start)return null;let base=hm(C.start),rate=C.rate??1,tb=0;
 for(const b of plan.beats){if(b.t0>t+1e-9)break;if(isObj(b.clock)){if(b.clock.set){base=hm(b.clock.set);tb=b.t0;}else{base+=rate*(b.t0-tb);tb=b.t0;}if(b.clock.rate!=null)rate=b.clock.rate;}}
 const {beat}=beatAt(plan,t);if(beat.clock===false)return null;
 return {time:fmtHM(base+rate*(t-tb)+1e-6),label:txt(C)||'ゲーム内時刻（架空）'};}

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
//    factIds:[ids of the items on screen + beat.factIds], fallbacks:[…]}
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
  crowd,items,logo,header:beat.header!==false&&!logo,clock:plan.part==='body'?clockAt(plan,cfg,t):null,fade,stamps,factIds:[...ids],fallbacks:fb};}

// ---------------------------------------------------------------- audio cue sheet
function autoCues(b){const out=[];
 for(const h of b.hud||[]){const a=h.at??0,dur=(h.until??b.dur)-a;
  if(h.c==='logo'){if(b.logoRun===b.t0&&!h.seq){out.push({at:a,sfx:'whoosh',gain_db:-3},{at:a+LOGO_SLAM,sfx:'riser',align:'hit'},{at:a+LOGO_SLAM,sfx:'logo_slam',duck:1.6,duck_db:-14});}}
  else if(h.c==='press-start'||h.c==='pressStart')out.push({at:a+.05,sfx:'press_start'},{at:a+Math.min(dur-.2,.55),sfx:'ui_select'});
  else if(h.c==='choice'){const pick=h.pickAt??Math.max(1.2,dur-1);out.push({at:a+.05,sfx:'card_in'},{at:a+.3,sfx:'tick',repeat:.5,until:a+pick},{at:a+.5+(pick-.5)*.38,sfx:'choice_move'},{at:a+.5+(pick-.5)*.72,sfx:'choice_move'},{at:a+pick,sfx:'ui_select'});}
  else if(h.c==='stamp'){const k=h.kind==='GAME_OVER'?'gameover_jingle':h.kind==='ESCAPED'?'escaped':'clear_jingle';out.push({at:a+STAMP_DROP,sfx:'stamp_hit',duck:2.4,duck_db:-12},{at:a+STAMP_DROP+.05,sfx:k});}
  else if(['notice','rules','lesson','cheat','sources'].includes(h.c))out.push({at:a+.02,sfx:'card_in'});
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
  meta:{opening:opening.id,body:body.id,outcome:body.outcome,frames:V.frames}};}

// ---------------------------------------------------------------- cache keys
// stable JSON (sorted keys) + FNV-1a 64 → hex; the opening cache key also covers `extra` (file hashes of the code)
export function stableJSON(v){if(Array.isArray(v))return `[${v.map(stableJSON).join(',')}]`;if(isObj(v))return `{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJSON(v[k])).join(',')}}`;return JSON.stringify(v);}
export function fnv64(s){let h=0xcbf29ce484222325n;const p=0x100000001b3n,m=(1n<<64n)-1n;for(const c of new TextEncoder().encode(s)){h^=BigInt(c);h=(h*p)&m;}return h.toString(16).padStart(16,'0');}
export const openingHash=(openingCfg,extra='')=>fnv64(stableJSON(openingCfg)+'|'+extra);
