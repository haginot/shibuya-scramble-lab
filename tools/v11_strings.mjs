#!/usr/bin/env node
// JR v11-en: every HUD string of the JR videos (v9/_opening + v10/<pair>), per beat, with its EN text (i18n/en.json).
// Re-runs the page's per-frame HUD state in node (variant-system frameSpec → sim panel/meter states → ui/components render,
// lang=en after i18n trDeep) every STRIDE frames and reports
//   missing: JP input strings with no EN entry; leak: CJK left in the rendered HTML (hard-coded component text);
//   table:   [{part, pair, beat, ja, en}] (unique per pair/beat) for docs/V11-EN.md.
//   fiction: the beats whose rendered EN text carries the fiction word (must be the cold open only)
//   --ja-html F: the JP html of every state (lang=ja) → F (tests: identical to the v10.2 tree, SERIES=<that tree's series dir>)
// usage: node tools/v11_strings.mjs [--json out.json] [--stride 3] [--ja-html out.json]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SERIES=process.env.SERIES||path.join(ROOT,'web3d/shibuya/series');
const S=p=>path.join(SERIES,p);
const VS=await import(S('variant-system.mjs'));
const C=await import(S('ui/components.mjs'));
const SRC=await import(S('sources-series.mjs'));
const SIM=await import(S('sim-v8.mjs'));
const I=fs.existsSync(S('i18n/i18n.mjs'))?await import(S('i18n/i18n.mjs')):await import(path.join(ROOT,'web3d/shibuya/series/i18n/i18n.mjs'));
I.setDict(JSON.parse(fs.readFileSync(path.join(ROOT,'web3d/shibuya/series/i18n/en.json'),'utf8')));
const J=p=>JSON.parse(fs.readFileSync(S(`variants/jr/${p}`),'utf8'));
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
const STRIDE=+(opt('--stride')||3),VAR=opt('--variant')||'v10';
export const PAIRS=['gate','taxi','zone','alt'];
const DATA_CREDIT='3D：PLATEAU／© OpenStreetMap contributors';
const simSum={};const sum=n=>simSum[n]??=(n==='crush'?J('v9/sim/crush.json'):J(`v8/sim/${n}.json`));
const strip=h=>h.replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'\n').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function cjkStrings(v,out=new Set(),k=''){if(typeof v==='string'){if(I.CJK_RE.test(v)&&!['fix','generated','why','from','to','about','what','note_internal'].includes(k))out.add(v);}
 else if(Array.isArray(v))v.forEach(x=>cjkStrings(x,out,k));else if(v&&typeof v==='object')for(const [kk,x] of Object.entries(v))if(!['factIds','fix','generated','v10','v9','v8','routes','sim','lesson','cheat','sources','beats','title','start','firstChoice','choice','clock'].includes(kk)||k==='item')cjkStrings(x,out,kk);return out;}
export function hudStates(pair,{stride=STRIDE,variant=VAR,lang:LANG='en'}={}){
 const opening=J('v9/_opening.json'),body=J(`${variant}/${pair}.json`),V=VS.videoPlan(opening,body);const res=[];
 const srcRows=VS.sourceRows(body.sources||[],{facts:SRC.FACTS,sources:SRC.SOURCES});
 for(const part of ['opening','body']){const plan=part==='opening'?V.opening:V.body,cfg=part==='opening'?opening:body;
  for(let f=0;f<plan.frames;f+=stride){const t=f/VS.FPS,spec=VS.frameSpec(plan,cfg,t);let items=spec.items.filter(it=>it.c!=='parody');const bl=spec.beat.local;
   items=items.map(it=>it.c==='simpanel'?{...it,...SIM.panelState(sum(it.scenario),it,bl,{from:it.from?sum(it.from):null,clockStart:it.clockStart??null})}:it.c==='simmeter'?{...it,...SIM.meterState(sum(it.scenario),it,bl)}:it.c==='crushmeter'?{...it,...SIM.meterState(it.track==='worst'?{...sum(it.scenario),track:sum(it.scenario).worst}:sum(it.scenario),it,bl)}:it);
   items=items.filter(it=>typeof it.crowd!=='string');
   const beat=(cfg.beats||[]).find(b=>b.id===spec.beat.id);
   const plateTag=beat?.plateTag??null;
   const footnote=ids=>VS.footnoteFor(ids,{facts:SRC.FACTS,sourceNames:SRC.sourceNames,lang:LANG,credit:I.tr(DATA_CREDIT,LANG)});
   res.push({part,beat:spec.beat.id,f,t,state:{T:t,items,header:spec.header,clock:spec.clock,tags:plateTag?[plateTag]:[],footnote:spec.footnote===false?null:footnote(spec.factIds),config:body,sources:srcRows}});}}
 return res;}
// node equivalent of GameHUD.frame (no DOM): html + strings per slot
export function renderState(state,lang){
 const st=lang==='en'?I.trDeep(state,lang):state,env={lang,T:st.T,config:st.config,sources:st.sources};let html='';const strings=[];
 const add=r=>{if(r){html+=r.html+(r.fx||'');strings.push(...r.strings);}};
 const fid=[];
 if((st.items||[]).some(it=>it.c==='notice'||(it.c==='mission'&&it.card&&it.fiction!==false)))add(C.render({c:'fiction'},env));
 if(st.header)add(C.render({c:'header',...(st.header===true?{}:st.header)},env));
 if(st.clock)add(C.render({c:'clock',...st.clock},env));
 for(const tg of st.tags||[])add(C.render({c:'tag',ja:tg},env));
 for(const it of st.items||[]){const r=C.render({t:st.T,...it},env);if(r){add(r);fid.push(...r.factIds);}}
 if(st.footnote){add(C.render({c:'footnote',ja:st.footnote,[lang]:st.footnote},env));}
 return {html,strings,text:strip(html)};}
if(process.argv[1]===fileURLToPath(import.meta.url)&&opt('--ja-html')){
 const out={};for(const pair of PAIRS)for(const s of hudStates(pair,{lang:'ja'}))out[`${pair}/${s.part}/${s.f}`]=renderState(s.state,'ja').html;
 fs.writeFileSync(opt('--ja-html'),JSON.stringify(out));console.log(Object.keys(out).length,'JP states');process.exit(0);}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const fiction=new Set();
 const missing=new Map(),leak=new Map(),table=new Map();
 for(const pair of PAIRS)for(const s of hudStates(pair)){
  const key=`${s.part==='opening'?'opening':pair}/${s.beat}`;
  const tr=I.trDeep(s.state,'en');
  // missing: CJK strings in the translated items / header / tags / footnote
  const ins=new Set();cjkStrings({items:tr.items,header:tr.header,clock:tr.clock,tags:tr.tags,footnote:tr.footnote},ins,'item');
  for(const x of ins){if(!missing.has(x))missing.set(x,new Set());missing.get(x).add(key);}
  const r=renderState(s.state,'en');if(/fiction/i.test(r.text))fiction.add(`${s.part}:${key}`);
  for(const line of r.text.split('\n'))if(I.CJK_RE.test(line)){if(!leak.has(line))leak.set(line,new Set());leak.get(line).add(key);}
  const orig=new Set();cjkStrings({items:s.state.items,header:s.state.header,clock:s.state.clock,tags:s.state.tags,footnote:s.state.footnote},orig,'item');
  for(const x of orig){const k=key+'\u0000'+x;if(!table.has(k))table.set(k,{where:key,ja:x,en:I.tr(x,'en')});}}
 const out={fiction:[...fiction],missing:[...missing].map(([s,w])=>({ja:s,where:[...w]})),leak:[...leak].map(([s,w])=>({text:s,where:[...w]})),table:[...table.values()]};
 if(opt('--json'))fs.writeFileSync(opt('--json'),JSON.stringify(out,null,1));
 console.log(`missing ${out.missing.length}, leak ${out.leak.length}, table ${out.table.length}, fiction on ${JSON.stringify(out.fiction)}`);
 process.exit(out.missing.length||out.leak.length?1:0);}
