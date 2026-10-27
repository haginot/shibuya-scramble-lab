#!/usr/bin/env node
// Scenario config → JSON cue sheet + timeline, no browser (series/variant-system.mjs).
//   node tools/variant_cues.mjs <id> [--ep jr] [--opening _opening] [--out cues.json] [--timeline timeline.json]
//                                    [--check] [--strict] [--quiet]
//   node tools/variant_cues.mjs --list [--ep jr]          ids of every variant config (files not starting with _)
//   node tools/variant_cues.mjs --validate-all [--ep jr]  validate every config + every pair; exit 1 on errors
//   node tools/variant_cues.mjs --opening-key [--opening _opening]  cache key of the shared opening (config + code)
//   node tools/variant_cues.mjs --part-key <id> [--opening _opening]   cache key of a variant body (config + opening + code)
//   node tools/variant_cues.mjs combined/<pair> [--out …] [--timeline …] [--check]   a combined episode (variants/<ep>/combined/<pair>.json;
//                                                    its two parts are loaded for the source-beat / pair / sources checks)
//   node tools/variant_cues.mjs --combined-list           ids of every combined config (combined/<pair>)
//   node tools/variant_cues.mjs --validate-combined       validate every combined config (+ its parts); exit 1 on errors
//   node tools/variant_cues.mjs --reuse-map combined/<pair>   reuse map JSON (variant-system.mjs reuseMap: beats, pieces, source timelines)
// Prints {ok, errors, warnings, duration, frames, segments} to stdout (JSON); exit 1 when the config is invalid.
// Combined: video (opening + body) must be 60–80 s (V.COMBINED_VIDEO); the timeline gets kind:'combined' + per beat reuse/origin.
//   node tools/variant_cues.mjs v6/<pair> --opening v6/_opening [--out …] [--timeline …] [--check]   a v6 episode (variants/<ep>/v6/
//                                                    <pair>.json; its sources — both runs + combined/<pair> — are loaded for the checks)
//   node tools/variant_cues.mjs --v6-list                 ids of every v6 config (v6/<pair>)
//   node tools/variant_cues.mjs --validate-v6             validate every v6 config (+ sources) with the v6 opening; exit 1 on errors
//   node tools/variant_cues.mjs --reuse-map v6/<pair> | v6/_opening   reuse map (body: variant bodies + combined/<pair>; opening: _opening)
// v6: video (v6 opening + body) must be 75–95 s (V.V6_VIDEO); the opening of a v6 id defaults to v6/_opening.
// The opening defaults to variants/<ep>/_opening.json, else the test stand-in _sample-opening.json (warning).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as V from '../web3d/shibuya/series/variant-system.mjs';
import {FACTS,DROPPED} from '../web3d/shibuya/series/sources-series.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SERIES=path.join(ROOT,'web3d/shibuya/series');
// files whose content changes the rendered opening (cache key); missing files hash as 'missing'
export const OPENING_CODE=['app-variant.mjs','scene-jr.mjs','variant-system.mjs','shots-variants.mjs','sets-variants.mjs','crowd-variants.mjs','people-close.mjs',
 'opening.mjs','ui/logo3d.mjs','ui/components.mjs','ui/tokens.mjs','ui/hud.css','realism.mjs','station-jr.mjs','landmarks-jr.mjs','camera.mjs','wide-area.mjs','crowd-jr.mjs','crowd-jr-worker.mjs',
 '../costume.mjs','../city.mjs','../fx.mjs','../shaders.mjs','../halloween-scene.mjs','../vehicles.mjs','../../data/logo_glyphs.json','../../data/logo_sdf.png','../../data/logo_halo.png','../../../tools/record_variant.py'];

async function optionalKeys(){const o={};
 try{o.shotKeys=[...(await import('../web3d/shibuya/series/shots-variants.mjs')).SHOT_KEYS];}catch{}
 try{o.crowdKeys=Object.keys((await import('../web3d/shibuya/series/crowd-variants.mjs')).CROWD_STATES);}catch{}
 try{o.componentKeys=[...(await import('../web3d/shibuya/series/ui/components.mjs')).COMPONENT_KEYS];}catch{}
 return o;}
export const configDir=ep=>path.join(SERIES,'variants',ep);
export function readConfig(ep,id){const f=path.join(configDir(ep),`${id}.json`);if(!fs.existsSync(f))throw Error(`no config ${path.relative(ROOT,f)}`);return JSON.parse(fs.readFileSync(f,'utf8'));}
export function openingId(ep,want){if(want)return want;return fs.existsSync(path.join(configDir(ep),'_opening.json'))?'_opening':'_sample-opening';}
export const listCombined=ep=>{const d=path.join(configDir(ep),'combined');return fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>'combined/'+f.slice(0,-5)).sort():[];};
// the two part configs of a combined config ({id: cfg}; missing files are simply absent → the validator reports them)
export function partConfigs(ep,cfg){const o={};
 if(V.isV6Opening(cfg)){try{o._opening=readConfig(ep,'_opening');}catch{}return o;}
 if(!V.isCombined(cfg)&&!V.isV6(cfg))return null;for(const id of Object.values(cfg.parts||{}))try{o[id]=readConfig(ep,id);}catch{}return o;}
export const listV6=ep=>{const d=path.join(configDir(ep),'v6');return fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>'v6/'+f.slice(0,-5)).sort():[];};
const isV6Id=id=>String(id||'').startsWith('v6/');
export const listIds=ep=>fs.existsSync(configDir(ep))?fs.readdirSync(configDir(ep)).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>f.slice(0,-5)).sort():[];
// cache key of a rendered part: config JSON (stable) + every code/data file that changes its pixels; the body key also
// covers the opening config (the body's video time / background crowd depend on the opening length)
export function partKey(ep,id,oid){const cfg=readConfig(ep,id),extra=id===oid?'':V.stableJSON(readConfig(ep,oid));const h=crypto.createHash('sha256');
 for(const f of OPENING_CODE){const p=path.join(SERIES,f);h.update(f+':');h.update(fs.existsSync(p)?fs.readFileSync(p):'missing');}
 return V.openingHash(cfg,h.digest('hex')+'|'+oid+'|'+extra);}
export const openingKey=(ep,oid)=>partKey(ep,oid,oid);

async function main(argv){
 const a={ep:'jr',out:null,timeline:null,opening:null,check:false,strict:false,quiet:false,list:false,all:false,key:false,id:null};
 for(let i=0;i<argv.length;i++){const k=argv[i];
  if(k==='--ep')a.ep=argv[++i];else if(k==='--out')a.out=argv[++i];else if(k==='--timeline')a.timeline=argv[++i];else if(k==='--opening')a.opening=argv[++i];
  else if(k==='--check')a.check=true;else if(k==='--strict')a.strict=true;else if(k==='--quiet')a.quiet=true;else if(k==='--list')a.list=true;
  else if(k==='--validate-all')a.all=true;else if(k==='--validate-combined')a.allCombined=true;else if(k==='--validate-v6')a.allV6=true;else if(k==='--v6-list')a.listV6=true;else if(k==='--combined-list')a.listCombined=true;else if(k==='--reuse-map')a.reuseMap=argv[++i];else if(k==='--opening-key')a.key=true;else if(k==='--part-key')a.partKey=argv[++i];else if(k.startsWith('-'))throw Error(`unknown flag ${k}`);else a.id=k;}
 if(a.list){console.log(listIds(a.ep).join('\n'));return 0;}
 if(a.listCombined){console.log(listCombined(a.ep).join('\n'));return 0;}
 if(a.listV6){console.log(listV6(a.ep).join('\n'));return 0;}
 if(a.reuseMap){const c=readConfig(a.ep,a.reuseMap);if(!V.isCombined(c)&&!V.isV6(c)&&!V.isV6Opening(c))throw Error(`${a.reuseMap} is not a combined / v6 config`);console.log(JSON.stringify(V.reuseMap(c,partConfigs(a.ep,c)),null,1));return 0;}
 const oid=openingId(a.ep,a.opening??((a.allV6||isV6Id(a.id)||isV6Id(a.partKey))?'v6/_opening':null));
 if(a.key){console.log(partKey(a.ep,oid,oid));return 0;}
 if(a.partKey){console.log(partKey(a.ep,a.partKey,oid));return 0;}
 const keys=await optionalKeys(),opt={facts:FACTS,dropped:DROPPED,strict:a.strict,...keys};
 const opening=readConfig(a.ep,oid);const vo=V.validateConfig(opening,{...opt,part:'opening'});
 if(V.isV6Opening(opening)){const r=V.reuseMap(opening,partConfigs(a.ep,opening));for(const b of r.beats)if(b.mode==='reuse'&&b.src.f1-b.src.f0!==b.frames)vo.errors.push(`v6 opening ${b.id}: frames differ from the pinned opening`);vo.ok=!vo.errors.length;}
 if(oid==='_sample-opening')vo.warnings.push(`using ${oid}.json (variants/${a.ep}/_opening.json missing)`);
 if(a.all){const res={opening:vo,variants:{},pairs:{}};let ok=vo.ok;const cfgs={};
  for(const id of listIds(a.ep)){const c=readConfig(a.ep,id);cfgs[id]=c;const v=validateVideo(opening,c,opt);res.variants[id]=v;ok&&=v.ok;}
  const byPair={};for(const c of Object.values(cfgs))(byPair[c.pair]??=[]).push(c);
  for(const [p,list] of Object.entries(byPair)){const e=list.length===2?V.validatePair(list[0],list[1]):[`pair ${p} has ${list.length} configs`];res.pairs[p]={ok:!e.length,errors:e};ok&&=!e.length;}
  console.log(JSON.stringify(res,null,1));return ok?0:1;}
 if(a.allCombined){const res={opening:vo,combined:{}};let ok=vo.ok;const ids=listCombined(a.ep);if(!ids.length){res.error='no combined configs';ok=false;}
  for(const id of ids){const c=readConfig(a.ep,id);const v=validateVideo(opening,c,{...opt,configs:partConfigs(a.ep,c)});const P=V.videoPlan(opening,c);
   res.combined[id]={...v,duration:+P.duration.toFixed(4),frames:P.frames};ok&&=v.ok;}
  console.log(JSON.stringify(res,null,1));return ok?0:1;}
 if(a.allV6){const res={opening:vo,v6:{}};let ok=vo.ok;const ids=listV6(a.ep);if(!ids.length){res.error='no v6 configs';ok=false;}
  for(const id of ids){const c=readConfig(a.ep,id);const v=validateVideo(opening,c,{...opt,configs:partConfigs(a.ep,c)});const P=V.videoPlan(opening,c);
   res.v6[id]={...v,duration:+P.duration.toFixed(4),frames:P.frames};ok&&=v.ok;}
  console.log(JSON.stringify(res,null,1));return ok?0:1;}
 if(!a.id)throw Error('usage: variant_cues.mjs <id> [--out cues.json] [--timeline t.json] | --list | --validate-all | --opening-key');
 const body=readConfig(a.ep,a.id);const v=validateVideo(opening,body,{...opt,configs:partConfigs(a.ep,body)});v.warnings.unshift(...vo.warnings.map(w=>'opening: '+w));v.errors.unshift(...vo.errors.map(e=>'opening: '+e));v.ok=v.errors.length===0;
 const P=V.videoPlan(opening,body);
 const res={ok:v.ok,id:body.id,opening:oid,errors:v.errors,warnings:v.warnings,duration:P.duration,frames:P.frames,openingFrames:P.opening.frames,bodyFrames:P.body.frames,segments:P.segments};
 if(!a.check){const cues=V.buildCues(opening,body);
  if(a.out){fs.mkdirSync(path.dirname(path.resolve(a.out)),{recursive:true});fs.writeFileSync(a.out,JSON.stringify(cues,null,1)+'\n');}
  if(a.timeline){const tl={id:body.id,...(V.isCombined(body)||V.isV6(body)?{kind:body.kind,variant:a.id,parts:body.parts}:{}),opening:oid,fps:V.FPS,duration:P.duration,frames:P.frames,
    parts:Object.fromEntries(['opening','body'].map(k=>[k,{offset:P[k].offset,duration:P[k].duration,frames:P[k].frames,beats:P[k].beats.map(b=>({id:b.id,t0:b.t0,t1:b.t1,f0:b.f0,f1:b.f1,video_t0:+(P[k].offset+b.t0).toFixed(4),shot:b.shot?.key,crowd:b.crowd?.key??null,hud:(b.hud||[]).map(h=>h.c+(h.kind?':'+h.kind:'')+(h.press?':press':'')),
     ...(b.reuse?{reuse:`${b.reuse.variant}/${b.reuse.beat}`}:{}),...(b.origin?{origin:`${b.origin.variant}/${b.origin.beat}`}:{}),...(b.fix?{fix:b.fix}:{})}))}]))};
   fs.mkdirSync(path.dirname(path.resolve(a.timeline)),{recursive:true});fs.writeFileSync(a.timeline,JSON.stringify(tl,null,1)+'\n');}}
 if(!a.quiet||!v.ok)console.log(JSON.stringify(res,null,1));
 return v.ok?0:1;}

// opening + body as one video: both parts valid, total 30–45 s (combined: 60–80 s; test fixtures whose id starts with
// '_' are exempt)
export function validateVideo(opening,body,opt){const v=V.validateConfig(body,{...opt,part:'body'});const P=V.videoPlan(opening,body);
 const [lo,hi]=V.isV6(body)?V.V6_VIDEO:V.isCombined(body)?V.COMBINED_VIDEO:[30,45];
 if(V.isV6(body)&&!V.isV6Opening(opening))v.errors.push(`a v6 body needs the v6 opening (--opening v6/_opening), got ${opening.id}`);
 if(!String(body.id).startsWith('_')&&(P.duration<lo-1e-9||P.duration>hi+1e-9))v.errors.push(`video is ${P.duration.toFixed(2)} s (must be ${lo}–${hi} s)`);
 v.ok=!v.errors.length;return v;}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv.slice(2)).then(c=>process.exit(c),e=>{console.error(e.message);process.exit(2);});
