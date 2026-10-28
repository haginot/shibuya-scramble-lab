#!/usr/bin/env node
// JR v10.2 configs = the v9 configs (web3d/shibuya/series/variants/jr/v9/<pair>.json, unchanged story / timing / sim) with the
// on-screen text that sat over a photo plate showing a different place rewritten (logs/ssl-claude-halloween/v10.2/brief.md).
// Only the HUD layer of those beats is re-rendered (tools/v10_hud.py); every other beat keeps the v9 HUD frames.
//   * gate over-move (plate hachiko3 = grounded-refs/v3/01-hachiko-v2.png, the OUTDOOR Hachiko square): the caption said
//     「改札前の通路は一方通行」 (the passage under the tracks) → the square / the queue toward the gate; same facts
//     (JR-GATE-03 one-way in front of the gate, 2025-01; JR-GATE-18 U-turn on the 宮益坂口 side since 2026-03-01);
//   * gate / alt crush-pov (plate crush3 = an open-air crowd under the night sky): the sim's crush point is in the passage
//     under the tracks ([90, 17.5] / [63.5, 13.2]); the area word no longer names a passage: gate 「改札前」 →
//     「ハチ公改札への列」 (the GA walker is in the inbound queue), alt 「駅前の通路」 → 「駅前」;
//   * zone clear-stamp (plate meiji = Meiji-dori from the Shibuya deck): 「原宿駅にたどり着いた！」 claimed the station over a
//     Shibuya street → 「渋谷を抜けて原宿駅へ！」.
// usage: node tools/v10_configs.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const V9=path.join(ROOT,'web3d/shibuya/series/variants/jr/v9');
const OUT=path.join(ROOT,'web3d/shibuya/series/variants/jr/v10');
export const PAIRS=['gate','taxi','zone','alt'];
const GEN='tools/v10_configs.mjs (do not edit by hand: edit the generator and re-run --write)';

// [pair, beat, hud component, old text, new text, key ('ja' | 'label'), why]
export const FIXES=[
 ['gate','over-move','caption','改札前の通路は一方通行\n宮益坂口側まで抜けてUターン\n（2025年1月・2026年3月の報道）',
  'ハチ公口の広場、改札待ちの列\n改札へは宮益坂口側でUターン\n（2025年1月・2026年3月の報道）','ja',
  'plate hachiko3 is the outdoor Hachiko square, not the passage in front of the gate'],
 ['gate','crush-pov','crushmeter','足元の密度（改札前・圧死シナリオ）','足元の密度（ハチ公改札への列・圧死シナリオ）','label',
  'plate crush3 is an open-air crowd; the sim point is the inbound queue to the Hachiko gate'],
 ['gate','crush-pov','caption','改札前：一歩も前に進めない','ハチ公改札への列：一歩も前に進めない','ja',
  'plate crush3 is an open-air crowd; the sim point is the inbound queue to the Hachiko gate'],
 ['alt','crush-pov','crushmeter','足元の密度（駅前の通路・圧死シナリオ）','足元の密度（駅前・圧死シナリオ）','label',
  'plate crush3 is an open-air crowd, not a passage'],
 ['alt','crush-pov','caption','駅前の通路：一歩も前に進めない','駅前：一歩も前に進めない','ja',
  'plate crush3 is an open-air crowd, not a passage'],
 ['zone','clear-stamp','stamp','原宿駅にたどり着いた！\n（シミュレーション）','渋谷を抜けて原宿駅へ！\n（シミュレーション）','ja',
  'plate meiji is Meiji-dori seen from the Shibuya deck, not Harajuku station'],
];

export function build(){
 const out={};
 for(const pair of PAIRS){
  const c=JSON.parse(fs.readFileSync(path.join(V9,`${pair}.json`),'utf8'));
  c.id=`v10-${pair}`;c.generated=GEN;c.v10={from:`v9/${pair}`,fixes:[]};
  for(const [p,beat,comp,from,to,key,why] of FIXES){if(p!==pair)continue;
   const b=c.beats.find(x=>x.id===beat),h=b?.hud.find(x=>x.c===comp&&x[key]===from);
   if(!h)throw Error(`${pair} ${beat} ${comp}: '${from}' not found`);
   h[key]=to;c.v10.fixes.push({beat,c:comp,key,from,to,why});}
  out[pair]=c;}
 return out;}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check',cfgs=build();let bad=0;
 for(const [k,c] of Object.entries(cfgs)){const f=path.join(OUT,`${k}.json`),txt=JSON.stringify(c,null,2)+'\n';
  if(mode==='--write'){fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(f,txt);console.log('wrote',path.relative(ROOT,f));}
  else if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==txt){console.error('stale:',path.relative(ROOT,f));bad++;}}
 if(mode!=='--write')console.log(bad?`${bad} stale v10 config(s): run node tools/v10_configs.mjs --write`:'v10 configs up to date');
 process.exit(bad?1:0);}
