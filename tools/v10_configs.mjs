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
 // v11 (logs/ssl-claude-halloween/v11-en/brief.md): the zone crush-pov caption spilled its last character onto a 2nd line
 // (since v10.1) → 「前に」 dropped (same meaning: can't move a step); re-rendered JP zone → jr-v11-en/ja-zone-fix
 ['zone','crush-pov','caption','スクランブル交差点：一歩も前に進めない','スクランブル交差点：一歩も進めない','ja',
  'v11: the caption wrapped its last character onto line 2 (since v10.1)'],
 ['zone','clear-stamp','stamp','原宿駅にたどり着いた！\n（シミュレーション）','渋谷を抜けて原宿駅へ！\n（シミュレーション）','ja',
  'plate meiji is Meiji-dori seen from the Shibuya deck, not Harajuku station'],
];

// v11.1 (logs/ssl-claude-halloween/v11.1/brief.md; fact check demos/halloween-escape-series/factcheck-2026-10-29.md):
// [pair | '*', path, old value, new value, why]; path = keys from the config root, '@<beat id>' selects a beat.
// Applied after FIXES; the EN text is the i18n table (tools/v11_en_dict.py) plus the `en` fields set here.
const HACHI_OLD='10/30(金)早朝〜11/1(日)朝方　ハチ公像は囲いで観覧不可',HACHI_NEW='10/30(金)早朝〜11/1(日)まで（予定）　ハチ公像は囲いで観覧不可';
const ZONE_WHY_OLD='赤枠内 4.0人/m²（シミュレーション）\n状況により規制（2026年）',ZONE_WHY_NEW='赤枠内 4.0人/m²（シミュレーション）\n状況により車両規制（2026年）';
const GATE_P0_OLD='ハチ公改札前は一方通行\nUターンして入る形\n（2025年1月の報道）',GATE_P0_NEW='平常時はハチ公改札前が一方通行\nUターンして入る形\n（2025年1月の報道）';
export const V111=[
 // A: the ward's end of the Hachiko statue enclosure is "11/1 morning (planned, may change)"; news says ~17:00 → 「まで（予定）」
 ['*',['@goodbye','hud',0,'facts',0,'ja'],HACHI_OLD,HACHI_NEW,'A: enclosure end is planned (ward: 11/1 morning, may change; news: ~17:00)'],
 ['*',['@goodbye','hud',0,'facts',0,'en'],'Oct 30 early AM – Nov 1 morning: Hachiko statue fenced off','Oct 30 early AM – until Nov 1 (planned): Hachiko statue fenced off','A (EN)'],
 // B: the U-turn into the Hachiko gate is the NORMAL-DAY flow; on Halloween 2024 JR closed the passage (MEAS-15), 2026 unannounced
 ['gate',['@over-move','hud',0,'ja'],'ハチ公口の広場、改札待ちの列\n改札へは宮益坂口側でUターン\n（2025年1月・2026年3月の報道）',
  'ハチ公口の広場、改札待ちの列\n平常時の動線：宮益坂口側でUターン\n（2025年1月・2026年3月の報道）\n当日は係員の指示に従う','B: normal-day route + follow staff on the night'],
 ['gate',['@over-result','hud',0,'until'],2,1.6,'B: room for the 3-line fact caption'],
 ['gate',['@over-result','hud',1,'at'],2,1.6,'B'],
 ['gate',['@over-result','hud',1,'ja'],'ハロウィーンは例年\n一部規制（2025年1月の報道）','ハロウィーン当日、2024年は\n宮益坂方面へ通り抜け不可\n（2026年のJRの対策は未発表）','B: the 2024 day-of closure of the passage; 2026 not announced'],
 ['gate',['@over-result','hud',1,'factIds'],['JR-GATE-05'],['MEAS-15','NA-JR-2026'],'B: shibukei 18753 (2024-10-30) + 2026 unannounced'],
 ['gate',['lesson','points',0],GATE_P0_OLD,GATE_P0_NEW,'B: normal-day flow'],
 ['gate',['lesson','ja'],'改札は1つじゃない\n'+GATE_P0_OLD+'\nハロウィーンは例年一部規制\n（例：2024年・2023年）\n南改札（1F）・新南改札（3F）\nも選択肢に\n2026年のJRの対策は\n10/25時点で未発表',
  '改札は1つじゃない\n'+GATE_P0_NEW+'\nハロウィーンは例年一部規制\n（例：2024年・2023年）\n南改札（1F）・新南改札（3F）\nも選択肢に\n2026年のJRの対策は\n10/25時点で未発表','B'],
 ['gate',['lesson','summary'],'ハチ公改札は2025年1月の移設で改札前が一方通行になり、ハチ公側からはUターンして入る形に（2025年1月の報道）。ハロウィーン期間は例年一部規制があるため（例：2024年・2023年）、南改札・新南改札など別の改札も選択肢に。2026年のJRの対策は10/25時点で未発表。',
  'ハチ公改札は2025年1月の移設で、平常時は改札前が一方通行になり、ハチ公側からはUターンして入る形に（2025年1月の報道）。ハロウィーン期間は例年一部規制があり（例：2024年は改札前の通路を通り抜け不可・2023年）、当日は係員の指示に従う。南改札・新南改札など別の改札も選択肢に。2026年のJRの対策は10/25時点で未発表。','B'],
 ['gate',['cheat','rows',0,'sub'],'Uターンして入る（2025年1月の報道）','平常時はUターンして入る（2025年1月の報道）','B'],
 ['gate',['cheat','note'],'当日は係員の誘導に従う','当日は係員の指示に従う','B: brief wording'],
 // C: 2026 police closures are for VEHICLES (black = road closed, red = checks / restrictions); pedestrians stop for crowds / staff
 ['zone',['@over-result','hud',0,'ja'],'赤枠内は状況により\n検問・交通規制（2026年）','赤枠内は状況により\n車両の検問・規制（2026年）','C: vehicle restrictions'],
 ['zone',['@over-result','hud',2,'ja'],'進めない（シミュレーション）','混雑で進めない（シミュレーション）','C: the cause is the crowd'],
 ['zone',['@retry-why','hud',1,'ja'],ZONE_WHY_OLD,ZONE_WHY_NEW,'C: vehicle restrictions'],
 ['zone',['@retry-why','why','text'],ZONE_WHY_OLD,ZONE_WHY_NEW,'C'],
 // D: the last inner-loop trains (Shibuya 0:48, Harajuku 0:45, Ebisu 0:50) terminate at Osaki
 ['alt',['@over-start','hud',0,'ja'],'山手線の内回りで\n品川方面へ帰れ','山手線の内回り\n大崎行き（品川方面）で帰れ','D: the last inner-loop trains end at Osaki'],
 ['alt',['@over-start','hud',1,'ja'],'渋谷の内回り終電は0:48\n（通常の土休日ダイヤ）','渋谷の内回り終電0:48は大崎行き\n（通常の土休日ダイヤ）','D: the source of 「大崎行き」 (JR timetable, JR-LAST-02)'],
 ['alt',['cheat','rows',0,'sec'],'駅 外回り（新宿方面）・内回り（品川方面）','駅 外回り（新宿方面）・内回り（大崎方面）','D: every listed last inner train is for Osaki'],
 // goodbye (JP card): the EN sub-line under the city quote wrapped to 2 lines → a shorter one-line rendering (same content)
 ['*',['@goodbye','hud',0,'quote','en'],'Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance.',
  'Near Shibuya Sta.: drinking, smoking, littering banned by ordinance.','fit: the EN sub-line of the quote on one line'],
 // minor (fact check): the closed stand is the West Exit 「優良」 taxi stand (TTC) — over-result caption + lesson card
 ['taxi',['@over-result','hud',0,'ja'],'西口の乗り場は\n2025年3月30日から一時休止\n（東京タクシーセンター）','西口の優良タクシー乗り場は\n2025年3月30日から一時休止\n（東京タクシーセンター）','minor: 優良タクシー乗り場 (TTC wording)'],
 ['taxi',['lesson','points',0],'西口の乗り場は2025年3月30日\nから一時休止の案内','西口の優良タクシー乗り場は\n2025年3月30日から一時休止の案内','minor'],
 ['taxi',['lesson','ja'],'乗り場は移っている\n西口の乗り場は2025年3月30日\nから一時休止の案内\n再開の発表は見当たらない\n（10/25時点）\n乗るなら渋谷SAKURAテラス前\n新南改札から約97m・約2分\n（OSMから概算・階の移動含まず）\n駅前の高架下は16時ごろ〜\n車両通行止め（2026年）',
  '乗り場は移っている\n西口の優良タクシー乗り場は\n2025年3月30日から一時休止の案内\n再開の発表は見当たらない\n（10/25時点）\n乗るなら渋谷SAKURAテラス前\n新南改札から約97m・約2分\n（OSMから概算・階の移動含まず）\n駅前の高架下は16時ごろ〜\n車両通行止め（2026年）','minor'],
];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function applyV111(pair,c){
 c.v111={fixes:[]};
 for(const [p,keys,from,to,why] of V111){if(p!=='*'&&p!==pair)continue;
  let o=c;for(const k of keys.slice(0,-1)){o=typeof k==='string'&&k[0]==='@'?o.beats.find(b=>b.id===k.slice(1)):o?.[k];if(o==null)throw Error(`${pair} ${keys.join('.')}: path not found`);}
  const last=keys[keys.length-1];if(!same(o[last],from))throw Error(`${pair} ${keys.join('.')}: '${JSON.stringify(o[last])}' is not '${JSON.stringify(from)}'`);
  o[last]=JSON.parse(JSON.stringify(to));c.v111.fixes.push({path:keys.join('.'),from,to,why});}
 return c;}

export function build(){
 const out={};
 for(const pair of PAIRS){
  const c=JSON.parse(fs.readFileSync(path.join(V9,`${pair}.json`),'utf8'));
  c.id=`v10-${pair}`;c.generated=GEN;c.v10={from:`v9/${pair}`,fixes:[]};
  for(const [p,beat,comp,from,to,key,why] of FIXES){if(p!==pair)continue;
   const b=c.beats.find(x=>x.id===beat),h=b?.hud.find(x=>x.c===comp&&x[key]===from);
   if(!h)throw Error(`${pair} ${beat} ${comp}: '${from}' not found`);
   h[key]=to;c.v10.fixes.push({beat,c:comp,key,from,to,why});}
  out[pair]=applyV111(pair,c);}
 return out;}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check',cfgs=build();let bad=0;
 for(const [k,c] of Object.entries(cfgs)){const f=path.join(OUT,`${k}.json`),txt=JSON.stringify(c,null,2)+'\n';
  if(mode==='--write'){fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(f,txt);console.log('wrote',path.relative(ROOT,f));}
  else if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==txt){console.error('stale:',path.relative(ROOT,f));bad++;}}
 if(mode!=='--write')console.log(bad?`${bad} stale v10 config(s): run node tools/v10_configs.mjs --write`:'v10 configs up to date');
 process.exit(bad?1:0);}
