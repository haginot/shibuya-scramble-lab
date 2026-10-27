#!/usr/bin/env node
// JR v7 configs = the v6 configs (web3d/shibuya/series/variants/jr/v6/*.json, same beats, timing, validator) plus:
//   * id v7-<pair> / _opening-v7, release:'v7' (edition stays 'v6' → the v6 validators and video length apply unchanged);
//   * photo beats (tools/v7_plan.json) carry `plateTag` — the corner tag the HUD-only layer draws instead of
//     「位置・構造は概略」 (app-variant.mjs &hudonly=1): 「AI生成画像を加工」 / 「写真 Syced／CC0」;
//   * gate over-move caption names 宮益坂口 (v6 QA minor; fact JR-GATE-18: since 2026-03-01 people entering from the
//     Hachiko-square side walk through to the 宮益坂口 side and U-turn — JR East Tokyo Construction PMO X 2026-02-21 /
//     シブヤ経済新聞 2026-02-17);
//   * kaiju beat: KAIJU_V7 size (the new kaiju.mjs beast);
//   * sources card credit adds the photo author / AI-image note (tools/v7_plan.json credit).
// usage: node tools/v7_configs.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const V6=path.join(ROOT,'web3d/shibuya/series/variants/jr/v6'),V7=path.join(ROOT,'web3d/shibuya/series/variants/jr/v7');
export const PLAN=JSON.parse(fs.readFileSync(path.join(ROOT,'tools/v7_plan.json'),'utf8'));
export const PAIRS=['gate','taxi','zone','alt'];
export const GATE_MOVE_JA='改札前の通路は一方通行\n宮益坂口側まで抜けてUターン\n（2025年1月・2026年3月の報道）';
// v7 kaiju (kaiju.mjs, side-on hunched beast): smaller than the v6 blob so head, crystals and the beam's start fit the 9:16 frame
export const KAIJU_V7=Object.freeze({scale:480,ground:500,pos:[10,1000]});
const GEN='tools/v7_configs.mjs (do not edit by hand: edit the generator / tools/v7_plan.json and re-run --write)';

const tagFor=plate=>PLAN.tags[PLAN.plates[plate].kind];

export function build(){const out={};
 const op=JSON.parse(fs.readFileSync(path.join(V6,'_opening.json'),'utf8'));
 op.id='_opening-v7';op.release='v7';op.generated=GEN;
 for(const b of op.beats){const p=PLAN.opening[b.id];if(p)b.plateTag=tagFor(p.plate);}
 out['_opening']=op;
 for(const pair of PAIRS){const c=JSON.parse(fs.readFileSync(path.join(V6,`${pair}.json`),'utf8'));
  c.id=`v7-${pair}`;c.release='v7';c.generated=GEN;
  for(const b of c.beats){const p=PLAN.pairs[pair][b.id];if(p)b.plateTag=tagFor(p.plate);
   if(pair==='gate'&&b.id==='over-move'){const cap=b.hud.find(h=>h.c==='caption');cap.ja=GATE_MOVE_JA;cap.factIds=['JR-GATE-03','JR-GATE-18'];}
   if(b.id==='kaiju')b.shot.params.kaiju={...(b.shot.params.kaiju||{}),...KAIJU_V7};
   if(b.id==='sources'){const s=b.hud.find(h=>h.c==='sources');s.credit=PLAN.credit;}}
  if(pair==='gate'&&!c.sources.includes('JR-GATE-18'))c.sources.splice(c.sources.indexOf('JR-GATE-03')+1,0,'JR-GATE-18');
  out[pair]=c;}
 return out;}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check',cfgs=build();let bad=0;
 for(const [k,c] of Object.entries(cfgs)){const f=path.join(V7,`${k}.json`),txt=JSON.stringify(c,null,2)+'\n';
  if(mode==='--write'){fs.mkdirSync(V7,{recursive:true});fs.writeFileSync(f,txt);console.log('wrote',path.relative(ROOT,f));}
  else if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==txt){console.error('stale:',path.relative(ROOT,f));bad++;}}
 if(mode!=='--write')console.log(bad?`${bad} stale v7 config(s): run node tools/v7_configs.mjs --write`:'v7 configs up to date');
 process.exit(bad?1:0);}
