// On-screen copy + scenario configs of the JR編 branching variants (CLEAR / GAME OVER), JP 9:16.
// This module is the SOURCE of web3d/shibuya/series/variants/jr/_opening.json and variants/jr/<id>.json:
//   node web3d/shibuya/series/copy-variants.mjs            → self-check (checkCopy) + "JSON files are up to date"
//   node web3d/shibuya/series/copy-variants.mjs --write    → (re)write the JSON configs, then self-check
// Edit the copy HERE, not in the JSON files (tests/test_copy_variants.py fails when they drift apart).
//
// Facts: every string that states a fact sits in an object carrying factIds (ids of sources-series.mjs FACTS =
// $LOGS/series/facts-series.json + $LOGS/variants/facts-variants.json, verdict verified | needs-label). Needs-label
// facts carry their label IN THE SAME OBJECT (sources-series `say` groups: years of past examples, 「概略」,
// 「未発表」, 「土休日」, 「OSMから概算」 for computed walks). Game framing strings carry factIds: [].
// Simulation: every simulated outcome / number says 「シミュレーション」 (sim items, stamps, items with sim:true).
// The game clock is fictional (「ゲーム内時刻（架空）」). Routes are 「ルート例」, never 「おすすめ」; we never claim
// another gate is 「空いている」; the red frame is a VEHICLE checkpoint/control zone, never 「立入禁止」.
// GAME OVER = caught in the crowd / missed the last train / no taxi — never death or injury.
//
// Pairs (same choice prompt + options in both partners; GAME OVER picks A, CLEAR picks B):
//   gate  ハチ公改札に直行 → one-way queue + U-turn, stuck (sim)  | 南改札（新南改札も）
//   zone  shortest walk to 原宿 through the crowd core / red frame → can't get through (sim, past one-way examples)
//                                                                  | east-side detour route example (ALT-HARA-H)
//   alt   walk to 原宿 late: its inner-loop last train 0:45 leaves before Shibuya's 0:48 → missed | check first, leave 0:05
//   taxi  wait at the suspended West-Exit stand → no taxi (sim)     | 渋谷SAKURAテラス前 stand
//
// Exports: T, LIMITS, BODY_BEATS, COMMON, PROLOGUE, PAIRS, VARIANT_IDS, buildOpening(), buildVariant(id),
//          buildConfigs() (async: {_opening, <id>…}), checkCopy(configs, keys?) → errors[], checkWarnings,
//          CONFIG_DIR (repo-relative), jaWidth (re-export)
import {FACTS,DROPPED} from './sources-series.mjs';
import {BANNED,FILM_TITLES,BRANDS,jaWidth} from './copy-jr.mjs';
import * as VS from './variant-system.mjs';
export {jaWidth};

export const CONFIG_DIR='web3d/shibuya/series/variants/jr';
export const LIMITS=Object.freeze({ja:16,small:22});
const A=a=>a.map(x=>x);
export const T=(ja,factIds=[],x={})=>({ja,factIds:A(factIds),...x});
const cap=(ja,ids=[],x={})=>({c:'caption',ja,factIds:A(ids),...x});
const sim=(ja,x={})=>({c:'sim',ja,factIds:[],...x});
const mission=(ja,ids=[])=>({c:'mission',ja,factIds:A(ids)});

// ---------------------------------------------------------------- shared copy
export const COMMON=Object.freeze({
 clockLabel:'ゲーム内時刻（架空）',
 simFlow:'人の流れ＝シミュレーション',
 staff:'当日は係員の誘導に従う',
 sourcesNote:'徒歩はOSMから概算（混雑・信号は含まず）',
 cheatNote:'当日は駅・警察の案内を確認',
});

// Opening prologue (after the OP of opening.mjs: flythrough → 3D logo slam → PRESS START). Fictional operator notice
// (game-styled, never alert-styled) + one rules card of REAL safety tips.
export const PROLOGUE=Object.freeze({
 notice:{c:'notice',issuer:'渋谷脱出ゲーム運営（架空）',head:'運営からのお知らせ',when:'10/31（土）夜・渋谷',
  ja:'今夜の渋谷は\n巨大な脱出ゲーム会場',order:'終電までに\n渋谷を脱出せよ',factIds:[]},
 rules:{c:'rules',head:'ゲームのルール＝本物の注意',factIds:[],items:[
  {title:'誘導に従え',tip:'警察・係員の指示が最優先\n出入口は混雑で変わることも',factIds:['MEAS-12']},
  {title:'立ち止まるな',tip:'監視台・警備員が\n滞留を抑える（2026年）',factIds:['MEAS-09']},
  {title:'終電を先に調べろ',tip:'山手線の終電（通常の土休日）\n渋谷 外回り0:33・内回り0:48',factIds:['JR-LAST-01','JR-LAST-02']},
 ]},
});
// QA finding 4 (fixer): 1.6 / 2.7 s were too short to read (5-line notice, 3 titles + 6 tip lines) → 2.5 / 4.0 s;
// the shared opening grows 12.0 → 14.2 s (videos 42.2 s, inside the 30–45 s target).
const PROLOGUE_DUR={notice:2.5,rules:4.0};

// Body beat lengths (s, whole frames at 30 fps): 28.0 s per body; + opening ≈12 s → ≈40 s per video.
export const BODY_BEATS=Object.freeze({start:2.5,choice:4.0,move:4.5,result:4.0,stamp:2.5,lesson:5.0,cheat:3.5,sources:2.0});

// ---------------------------------------------------------------- pairs
// Each pair: shared {title?, start, clock, choice, lesson, cheat, routes?} + per-outcome {title, move, result,
// stamp, lessonTitle}. Beat specs: {shot, crowd?, hud, cues?, clock?, board?, factIds?, amb?}.
const OVER='GAME_OVER',CLEAR='CLEAR';
const ALERT_CUES=[{at:0,sfx:'crowd_swell'},{at:.02,sfx:'ui_blip',gain_db:-4},{at:.6,sfx:'red_alert',duck:1.0}];

const GATE_COLORS={'JR-A-hachiko':'#FF7A9A','JR-B-south':'#FFD23F','JR-C-newsouth-east':'#4FE3C1'};
const GATE={
 start:{place:'hachiko-square',ja:'スタート：ハチ公前広場',factIds:[]},
 clock:{start:'21:58',ja:COMMON.clockLabel,rate:.5},
 choice:{prompt:{ja:'どの改札から入る？'},options:[
  {key:'A',ja:'ハチ公改札（目の前）',factIds:[]},
  {key:'B',ja:'南改札・新南改札',sub:'少し歩く',factIds:[]}]},
 startBeat:{shot:{key:'topdown',params:{center:[16,0,26]}},crowd:{key:'hachiko-peak'},hud:[
  mission('JRの改札から\n電車に乗れ'),
  cap('スタート：ハチ公前広場',[],{tone:'sub',until:1.2}),
  cap('人出のピークは22時ごろ\n（区の見込み・2024年並み）',['CROWD-01'],{at:1.2}),
  sim(COMMON.simFlow)]},
 choiceBeat:{shot:{key:'routemap',params:{routes:['JR-A-hachiko','JR-B-south','JR-C-newsouth-east'],highlight:null,colors:GATE_COLORS,
   points:[[22,34],[85.9,18.9],[96.6,162],[159.8,260]],azimuth:90,rect:{x0:.1,x1:.9,y0:.17,y1:.33},span:true,redZone:0,drawOn:[.1,1.4]}},
  hud:[{c:'pin',world:[85.9,0,18.9],ja:'A ハチ公改札',color:GATE_COLORS['JR-A-hachiko'],factIds:[]},
   {c:'pin',world:[96.6,0,162],ja:'B 南改札',color:GATE_COLORS['JR-B-south'],factIds:[]},
   {c:'pin',world:[159.8,0,260],ja:'B 新南改札',color:GATE_COLORS['JR-C-newsouth-east'],factIds:[]}]},
 lesson:{
  summary:'ハチ公改札は2025年1月の移設で改札前が一方通行になり、ハチ公側からはUターンして入る形に（2025年1月の報道）。ハロウィーン期間は例年一部規制があるため（例：2024年・2023年）、南改札・新南改札など別の改札も選択肢に。2026年のJRの対策は10/25時点で未発表。',
  points:['ハチ公改札前は一方通行\nUターンして入る形\n（2025年1月の報道）',
   'ハロウィーンは例年一部規制\n（例：2024年・2023年）',
   '南改札（1F）・新南改札（3F）\nも選択肢に',
   '2026年のJRの対策は\n10/25時点で未発表'],
  factIds:['JR-GATE-03','JR-GATE-05','MEAS-15','MEAS-16','JR-GATE-01','NA-JR-2026']},
 cheat:{title:'保存版 JR渋谷の改札',sub:'4つの改札と出口',asOf:'10/25時点',note:COMMON.staff,rows:[
  {sec:'改札 → 出口',ja:'ハチ公改札 1F：前は一方通行',sub:'Uターンして入る（2025年1月の報道）',tone:'ng',factIds:['JR-GATE-01','JR-GATE-03']},
  {ja:'南改札 1F → 西口・東口',sub:'ハチ公前から約4分（OSMから概算）',factIds:['JR-GATE-13','GATE-H-S']},
  {ja:'新南改札 3F → サクラステージ・ストリーム',sub:'ハチ公前から約7〜8分（OSMから概算）',factIds:['JR-GATE-14','GATE-H-NS-E','GATE-H-NS-W']},
  {ja:'中央改札 3F → スクランブルスクエア',factIds:['JR-GATE-01','JR-GATE-12']},
  {sec:'2026年',ja:'JRの対策：10/25時点で未発表',factIds:['NA-JR-2026']},
  {ja:'例：2024年 ハチ公改札を16〜23時ごろ一部規制',factIds:['MEAS-15']}]},
 [OVER]:{
  title:'ハチ公改札に直行したら…',lessonTitle:'改札は1つじゃない',
  move:{shot:{key:'eye-walk',params:{walk:'hachiko',wp:3,speed:1.25}},crowd:{key:'hachiko-peak'},hud:[
   cap('改札前の通路は一方通行\n東口側でUターンして改札へ\n（2025年1月の報道）',['JR-GATE-03']),
   sim('混雑＝シミュレーション')]},
  result:{shot:{key:'gate-queue',params:{mode:'approach',back:17,speed:.3,stopGo:.9,eyeY:2.3,nearHide:2.2,lookGate:.85,lookY:1.9}},crowd:{key:'hachiko-peak'},cues:ALERT_CUES,hud:[
   cap('列がほとんど進まない…\n（シミュレーション）',[],{tone:'warn',sim:true,until:2.0}),
   cap('ハロウィーンは例年\n一部規制（2025年1月の報道）',['JR-GATE-05'],{at:2.0}),
   sim('⚠ 密集（シミュレーション）',{at:.6})]},
  stamp:{ja:'人波にのまれて\n改札までたどり着けない\n（シミュレーション）'}},
 [CLEAR]:{
  title:'別の改札を選んだら…',lessonTitle:'別の改札も選択肢に',lessonFirst:2,
  move:{shot:{key:'routemap',params:{routes:['JR-B-south','JR-C-newsouth-east','JR-A-hachiko'],highlight:'JR-B-south',colors:GATE_COLORS,redZone:0}},hud:[
   {c:'legend',factIds:[],rows:[{color:GATE_COLORS['JR-B-south'],ja:'ルート例：南改札へ'},{color:GATE_COLORS['JR-C-newsouth-east'],ja:'新南改札へ'},{color:GATE_COLORS['JR-A-hachiko'],ja:'ハチ公改札へ'}]},
   cap('ルート例：南改札（1F）へ\nハチ公前から約258m・約4分\n（OSMから概算）',['GATE-H-S','JR-GATE-01'],{until:2.3}),
   cap('新南改札（3F）なら約7〜8分\n（OSMから概算）',['GATE-H-NS-E','GATE-H-NS-W','JR-GATE-01'],{at:2.3})]},
  result:{shot:{key:'gate-newsouth',params:{gate:'south',mode:'hall',dur:6.5}},crowd:{key:'gate-newsouth',params:{path:[[102.49,144.99],[98.38,156.26],[94.95,165.65],[91.52,175.05]],width:2.4,density:.7,fill:.4,approach:6}},hud:[
   cap('この回は列が流れた\n（シミュレーション）',[],{sim:true,until:2.0}),
   cap(COMMON.staff,[],{tone:'note',at:2.0}),
   sim(COMMON.simFlow)]},
  stamp:{ja:'南改札から乗車！\n（シミュレーション）'}},
};

const TAXI={
 start:{place:'scramble',ja:'スタート：スクランブル交差点',factIds:[]},
 clock:{start:'23:40',ja:COMMON.clockLabel,rate:.5},
 choice:{prompt:{ja:'タクシーはどこで乗る？'},options:[
  {key:'A',ja:'西口の乗り場',sub:'駅のすぐ前',factIds:[]},
  {key:'B',ja:'渋谷SAKURAテラス前',sub:'桜丘町・少し歩く',factIds:['TAXI-01']}]},
 startBeat:{shot:{key:'topdown',params:{center:[4,0,8]}},hud:[
  mission('タクシーで\n渋谷を脱出せよ'),
  cap('スタート：スクランブル交差点',[],{tone:'sub'})]},
 choiceBeat:{shot:{key:'routemap',params:{routes:[],points:[[2,8],[30,152],[112,312]],azimuth:90,rect:{x0:.12,x1:.88,y0:.19,y1:.31},span:true,redZone:0}},
  hud:[{c:'pin',world:[2,0,8],ja:'いまここ',color:'#E9DDFF',factIds:[]},
   {c:'pin',world:[30,0,152],ja:'A 西口',color:'#FF7A9A',factIds:[]},
   {c:'pin',world:[112,0,312],ja:'B SAKURAテラス前',color:'#4FE3C1',factIds:[]}]},
 lesson:{
  summary:'渋谷駅西口の優良タクシー乗り場は2025年3月30日から一時休止の案内（再開の発表は10/25時点で見当たらず）。乗るなら渋谷SAKURAテラス前（桜丘町3-4）の乗り場へ（新南改札から約97m・約2分、OSMから概算・階の移動含まず）。駅前の高架下は16時ごろから車両通行止め（2026年）。',
  points:['西口の乗り場は2025年3月30日\nから一時休止の案内',
   '再開の発表は見当たらない\n（10/25時点）',
   '乗るなら渋谷SAKURAテラス前\n新南改札から約97m・約2分\n（OSMから概算・階の移動含まず）',
   '駅前の高架下は16時ごろ〜\n車両通行止め（2026年）'],
  factIds:['TAXI-01','TAXI-09','TAXI-W-NS','MEAS-20']},
 cheat:{title:'保存版 渋谷でタクシー',sub:'乗り場と歩く時間',asOf:'10/25時点',note:COMMON.cheatNote,rows:[
  {sec:'乗り場',ja:'西口の乗り場：2025年3月30日〜休止',sub:'再開の発表なし（10/25時点）',tone:'ng',factIds:['TAXI-01','TAXI-09']},
  {ja:'渋谷SAKURAテラス前（桜丘町3-4）',sub:'位置は概略・赤枠の外（規制図より概略）',tone:'ok',factIds:['TAXI-01','TAXI-07','MEAS-04']},
  {sec:'歩く時間',ja:'新南改札から約97m・約2分',sub:'OSMから概算・階の移動は含まず',factIds:['TAXI-W-NS']},
  {ja:'スクランブルから約500m・約7分',sub:'OSMから概算',factIds:['TAXI-W-SCR']},
  {sec:'2026年',ja:'駅前の高架下 16時ごろ〜車両通行止め',sub:'宮益坂下〜渋谷駅前',factIds:['MEAS-03','MEAS-20']}]},
 [OVER]:{
  title:'西口でタクシーを待ったら…',lessonTitle:'乗り場は移っている',
  move:{shot:{key:'taxi-west',params:{mode:'front',dur:4.5,lookY:-.6}},crowd:{key:'taxi-west'},hud:[
   cap('西口の乗り場に到着…\nでも列が動かない？\n（シミュレーション）',[],{sim:true}),
   sim('待ち行列＝シミュレーション')]},
  result:{shot:{key:'taxi-west',params:{mode:'queue',dur:6.5,lookSign:.8,lookY:.6}},crowd:{key:'taxi-west'},hud:[
   cap('西口の乗り場は\n2025年3月30日から一時休止\n（東京タクシーセンター）',['TAXI-01'],{until:2.2}),
   cap('再開の発表は見当たらない\n（10/25時点）',['TAXI-09'],{at:2.2}),
   sim('タクシー0台（シミュレーション）',{at:.4})]},
  stamp:{ja:'タクシーが来ない…\n（シミュレーション）'}},
 [CLEAR]:{
  title:'SAKURAテラス前に向かったら…',lessonTitle:'乗り場を先に確かめる',lessonFirst:2,
  move:{shot:{key:'eye-walk',params:{from:[1.8,0],to:[112.1,311.9],speed:1.6}},amb:'street-quiet',hud:[
   cap('西口歩道橋を渡って桜丘町へ\nスクランブルから約500m・約7分\n（OSMから概算）',['TAXI-W-SCR'])]},
  result:{shot:{key:'taxi-sakura',params:{mode:'hero',dur:6.5}},crowd:{key:'taxi-sakura'},amb:'street-quiet',hud:[
   cap('渋谷SAKURAテラス前の乗り場\n（桜丘町3-4・位置は概略）',['TAXI-01','TAXI-07'],{until:2.2}),
   cap('規制エリア（赤枠）の外\n（規制図より概略）',['TAXI-07','MEAS-04'],{at:2.2}),
   sim('列は進む（シミュレーション）',{at:.4})]},
  stamp:{ja:'タクシーに乗れた！\n（シミュレーション）'}},
};

// alt pair (fixer 2026-10-26, QA finding 1): the old premise (walk 20 min north to Harajuku for the SAME inner-loop
// train that leaves Shibuya at 0:48) could never beat staying at Shibuya. Now the player leaves Shibuya on purpose
// (sourced reason: 2026 「混雑状況に応じて公共交通機関の出入り口なども変わる可能性」 MEAS-12; Hachiko gate 例年一部規制
// JR-GATE-05) and picks the neighbour station: 原宿 (upstream on the inner loop: last train 0:45, EARLIER than
// Shibuya's 0:48) → missed; 恵比寿 (downstream: last inner-loop train 0:50, JR-LAST-14) → made it. Same start time and
// the same (simulated) arrival time 0:45–0:47 in both partners: only the station's last train differs.
const ALT_FOOT='通常の土休日ダイヤ（10/25確認）';
const ALT_BOARD={harajuku:{title:'原宿 山手線 内回り',rows:[{note:'終電',time:'0:45',dest:'大崎'}],foot:ALT_FOOT},
 ebisu:{title:'恵比寿 山手線 内回り',rows:[{note:'終電',time:'0:50',dest:'大崎'}],foot:ALT_FOOT}};
const ALT={
 start:{place:'hachiko-square',ja:'スタート：ハチ公前広場',factIds:[]},
 clock:{start:'00:20',ja:COMMON.clockLabel,rate:.5},
 choice:{prompt:{ja:'渋谷を避けて隣の駅へ。\nどっちへ歩く？'},options:[
  {key:'A',ja:'原宿駅（北へ）',sub:'約20分・OSMから概算',factIds:['ALT-HARA-H']},
  {key:'B',ja:'恵比寿駅（南へ）',sub:'約25分・OSMから概算',factIds:['ALT-EBI-H']}]},
 startBeat:{shot:{key:'topdown',params:{center:[16,0,26]}},crowd:{key:'hachiko-peak'},hud:[
  mission('山手線の内回りで\n品川方面へ帰れ',['JR-PLAT-01']),
  cap('渋谷の内回り終電は0:48\n（通常の土休日ダイヤ）',['JR-LAST-02'],{until:1.2}),
  cap('混雑で駅の出入口が\n変わる可能性も（2026年）',['MEAS-12'],{at:1.2}),
  sim(COMMON.simFlow)]},
 choiceBeat:{shot:{key:'routemap',params:{routes:['ALT-HARA-H','ALT-EBI-H'],routeWidth:30,highlight:null,colors:{'ALT-HARA-H':'#FF9A3D','ALT-EBI-H':'#4FE3C1'},
   points:[[209.8,-1211.2],[768.8,1406],[22,34]],azimuth:-8,rect:{x0:.14,x1:.86,y0:.2,y1:.86},span:true,redZone:0,drawOn:[.1,1.4]}},hud:[
  {c:'pin',world:[209.8,0,-1211.2],ja:'A 原宿駅',color:'#FF9A3D',factIds:[]},
  {c:'pin',world:[768.8,0,1406],ja:'B 恵比寿駅',color:'#4FE3C1',factIds:[]}]},
 lesson:{
  summary:'同じ山手線でも終電は駅ごとに違う。内回り（品川方面）の終電は原宿0:45・代々木0:43で渋谷0:48より早く、恵比寿は0:50（通常の土休日ダイヤ・10/25確認、2026年の臨時ダイヤは未発表）。別の駅へ歩くなら、その駅の終電と歩く時間を先に確認。',
  points:['内回りの終電は\n原宿0:45・代々木0:43\n渋谷0:48より早い',
   '恵比寿の内回りは0:50\n渋谷0:48より遅い',
   '通常の土休日ダイヤ（10/25確認）\n2026年の臨時ダイヤは未発表',
   '別の駅へ歩くなら\nその駅の終電と歩く時間を\n先に確認'],
  factIds:['JR-LAST-08','JR-LAST-10','JR-LAST-02','JR-LAST-14','ALT-LAST-CMP','NA-JR-2026']},
 cheat:{title:'保存版 山手線の終電',sub:'通常の土休日ダイヤ（10/25確認）',asOf:'10/25時点',note:COMMON.cheatNote,rows:[
  {sec:'駅 外回り（新宿方面）・内回り（品川方面）',ja:'渋谷 外回り0:33・内回り0:48',sub:'通常の土休日・内回りは大崎行',factIds:['JR-LAST-01','JR-LAST-02']},
  {ja:'原宿 外回り0:36・内回り0:45',sub:'土休日・内回りは渋谷より早い',tone:'ng',factIds:['JR-LAST-07','JR-LAST-08']},
  {ja:'代々木 外回り0:38・内回り0:43',sub:'土休日・内回りは渋谷より早い',tone:'ng',factIds:['JR-LAST-09','JR-LAST-10']},
  {ja:'恵比寿 外回り0:30・内回り0:50',sub:'土休日・内回りは渋谷より遅い',tone:'ok',factIds:['JR-LAST-13','JR-LAST-14']},
  {sec:'歩く時間',ja:'原宿 約20分・恵比寿 約25分',sub:'ハチ公前から（OSMから概算）',factIds:['ALT-HARA-H','ALT-EBI-H']},
  {ja:'2026年の臨時ダイヤ：未発表',sub:'10/25時点',factIds:['NA-JR-2026']}]},
 [OVER]:{
  title:'原宿駅へ歩いたら…',lessonTitle:'終電は駅ごとに違う',
  move:{shot:{key:'detour',params:{route:'ALT-HARA-H',mode:'chase',s0:120,speed:9,height:30,back:34,color:'#FF9A3D'}},hud:[
   cap('原宿へ 約1572m・約20分\n（OSMから概算）',['ALT-HARA-H']),
   sim('人混みで遅れ（シミュレーション）')]},
  result:{clock:{set:'00:45'},shot:{key:'alt-platform',params:{station:'harajuku',mode:'train',trainLeaveAt:.4}},crowd:{key:'alt-platform'},
   board:{...ALT_BOARD.harajuku,status:'発車'},factIds:['JR-LAST-08'],amb:'street-quiet',hud:[
   cap('原宿の内回り終電は0:45\n渋谷0:48より早い！\n（通常の土休日ダイヤ）',['JR-LAST-08','JR-LAST-02','ALT-LAST-CMP'],{tone:'warn'}),
   sim('原宿着0:45（シミュレーション）',{at:.4})]},
  stamp:{ja:'目の前で終電が…\n（シミュレーション）'}},
 [CLEAR]:{
  title:'恵比寿駅へ歩いたら…',lessonTitle:'行き先の駅の終電を確認',lessonFirst:1,
  move:{shot:{key:'routemap',params:{routes:['ALT-EBI-H','ALT-HARA-H'],routeWidth:30,highlight:'ALT-EBI-H',colors:{'ALT-HARA-H':'#FF9A3D','ALT-EBI-H':'#4FE3C1'},
    points:[[768.8,1406],[22,34],[209.8,-1211.2]],rect:{x0:.12,x1:.88,y0:.2,y1:.74},span:true,redZone:0}},hud:[
   cap('恵比寿の内回り終電は0:50\n渋谷0:48より遅い\n（通常の土休日ダイヤ）',['JR-LAST-14','JR-LAST-02'],{until:2.3}),
   cap('恵比寿へ 約1932m・約25分\n（OSMから概算）',['ALT-EBI-H'],{at:2.3}),
   {c:'pin',world:[768.8,0,1406],ja:'恵比寿駅',color:'#4FE3C1',factIds:[]}]},
  result:{clock:{set:'00:46'},shot:{key:'alt-platform',params:{station:'ebisu',mode:'board',trainLeaveAt:9}},crowd:{key:'alt-platform'},
   board:{...ALT_BOARD.ebisu,status:''},factIds:['JR-LAST-14'],amb:'street-quiet',hud:[
   cap('恵比寿に0:46ごろ到着\n（シミュレーション）',[],{sim:true}),
   sim('到着時刻＝シミュレーション',{at:.4})]},
  stamp:{ja:'終電に間に合った！\n（シミュレーション）'}},
};

// shortest Hachiko → Harajuku walk (OSRM foot, ZONE-D-H-HARA, 1350 m) in sim metres (x east, z south of the Scramble
// centre 35.65948N 139.70055E; same projection as web3d/data/series_wide_osm.json), simplified to ≥3 m steps.
const ZONE_SHORTEST=[[22.2,33.8],[15.2,34.8],[16.8,22.2],[18.3,11.6],[19.7,1.4],[20.8,-6],[16.5,-14],[17.6,-17.9],[19.1,-22.7],[33.4,-91.7],[34.3,-103.7],[34.5,-118.9],[34.5,-124],[33.2,-166.6],[33,-178.8],[33,-183.6],[32.9,-201.8],[34.3,-285.4],[36,-289.5],[38.2,-300.7],[38.3,-307.5],[34.3,-311.5],[33.4,-316.8],[33.2,-346.1],[33.7,-355.4],[35.1,-370.2],[36.4,-375.9],[37.6,-380.8],[39.7,-386.5],[42.6,-392.1],[46.1,-398.4],[50.6,-403.5],[55.3,-408.9],[59.5,-412.9],[53.2,-420],[47.4,-427],[53.9,-434.4],[56.2,-438.1],[57.8,-444.5],[58.7,-451.6],[59.6,-460.9],[63.8,-513.3],[66.7,-525.5],[69.7,-557.1],[70.3,-560.8],[70.8,-565.3],[71.5,-571.6],[71.2,-575.6],[77.4,-629.1],[96,-714.6],[98.9,-737.7],[102.8,-786.4],[101.3,-789.8],[94.5,-796.1],[89.4,-795.5],[88.7,-803.7],[88.2,-812.3],[93.5,-813],[102.3,-822.1],[107.4,-886.3],[113.3,-959],[115.6,-990.1],[122,-1032.7],[122.6,-1038.9],[116.6,-1046.2],[124.6,-1058],[113.7,-1080.3],[125.2,-1086.2],[134.3,-1093.3],[137.3,-1094.7],[142.1,-1097],[146.9,-1099.5],[153,-1102.3],[179.8,-1116],[183.1,-1117.7],[186.4,-1120.1],[186,-1124.8],[186.8,-1132.2],[187.5,-1137.7],[187.9,-1141.7],[190.5,-1151],[199.5,-1166.5],[200.6,-1176],[201.2,-1179.9],[202.5,-1190.7],[203.8,-1204.2],[203.8,-1209.8],[203.8,-1211.1]];
// zone pair (fixer 2026-10-26, QA finding 2): lesson rebuilt on sourced items only — 2026 traffic control dates
// (MEAS-01), the police request to detour via surrounding roads (MEAS-25: a VEHICLE notice → said as such), past
// pedestrian one-way lanes (PED-2024; 2026 lanes 未発表 NA-PED-2026) and the OSM detour cost. The pedestrian hold-up
// itself stays a labelled simulation. Route map: both routes coloured + labelled (legend + pins), framed on the
// stretch where they separate (up to ≈140 m apart, z −20…−400). MEAS-15 (pre-2025 indoor passage) no longer cited.
const ZONE_COLORS={'ZONE-D-H-HARA':'#FFD23F','ALT-HARA-H':'#4FE3C1'};
const ZONE_LEGEND={c:'legend',factIds:[],rows:[{color:ZONE_COLORS['ZONE-D-H-HARA'],ja:'A 最短（駅前から北へ）'},{color:ZONE_COLORS['ALT-HARA-H'],ja:'B 外側のルート例'}]};
const ZONE_FRAME=[[-30,60],[210,60],[-30,-470],[210,-470]];
const ZONE_PINS=[{c:'pin',world:[34.5,0,-150],ja:'A 最短',color:ZONE_COLORS['ZONE-D-H-HARA'],factIds:[]},{c:'pin',world:[172,0,-130],ja:'B 外側',color:ZONE_COLORS['ALT-HARA-H'],factIds:[]}];
const ZONE={
 start:{place:'hachiko-square',ja:'スタート：ハチ公前広場',factIds:[]},
 clock:{start:'22:30',ja:COMMON.clockLabel,rate:.5},
 choice:{prompt:{ja:'原宿へ。どの道で行く？'},options:[
  {key:'A',ja:'最短：駅前から北へ直進',factIds:[]},
  {key:'B',ja:'外側を回るルート例',factIds:[]}]},
 routes:{'ZONE-D-H-HARA':{ja:'最短（比較用・OSMから概算）',factIds:['ZONE-D-H-HARA'],points:ZONE_SHORTEST,
  note:'OSRM foot https://routing.openstreetmap.de/routed-foot/route/v1/foot/139.7008,35.65915;139.70287,35.67036 (2026-10-25), © OpenStreetMap contributors'}},
 startBeat:{shot:{key:'topdown',params:{center:[16,0,26]}},crowd:{key:'hachiko-peak'},hud:[
  mission('原宿駅まで\n歩いて脱出せよ'),
  cap('スタート：ハチ公前広場',[],{tone:'sub'}),
  sim(COMMON.simFlow)]},
 choiceBeat:{shot:{key:'routemap',params:{routes:['ZONE-D-H-HARA','ALT-HARA-H'],routeWidth:13,highlight:null,colors:ZONE_COLORS,points:ZONE_FRAME,rect:{x0:.1,x1:.9,y0:.17,y1:.97},span:true,redZone:1,drawOn:[.1,1.4]}},
  hud:[...ZONE_PINS.map(x=>({...x})),{...ZONE_LEGEND,rows:ZONE_LEGEND.rows.map(r=>({...r}))}]},
 lesson:{
  summary:'2026年は10/30夕方〜11/1早朝、駅周辺で警察の交通規制（赤枠＝車両の検問・規制、規制図より概略）。警察は車両に「周辺道路に迂回するなど」協力を呼びかけ。歩行者も、過去には広場やセンター街が一方通行に（例：2024年。2026年は10/25時点で未発表）。外側を回るルート例は約220m・約3分の遠回り（OSMから概算）。',
  points:['10/30夕方〜11/1早朝\n駅周辺は交通規制（2026年）',
   '警察は車両に周辺道路への\n迂回を呼びかけ（2026年）',
   '歩行者の一方通行は例：2024年\n2026年は10/25時点で未発表',
   '遠回りは約220m・約3分\n（外側のルート例・OSMから概算）'],
  factIds:['MEAS-01','MEAS-25','PED-2024','NA-PED-2026','ZONE-DETOUR-COST']},
 cheat:{title:'保存版 渋谷の交通規制',sub:'2026年・警察の発表など',asOf:'10/25時点',note:COMMON.cheatNote,rows:[
  {sec:'2026年',ja:'交通規制：10/30夕方〜11/1早朝',factIds:['MEAS-01']},
  {ja:'高架下（宮益坂下〜駅前）車両通行止め',sub:'各日16時ごろ〜警備終了',tone:'ng',factIds:['MEAS-03','MEAS-20']},
  {ja:'赤枠＝検問・規制の場合あり（車両）',sub:'規制図より概略',factIds:['MEAS-02','MEAS-04']},
  {ja:'警察：車両は周辺道路へ迂回を',sub:'規制のお知らせ（2026年）',factIds:['MEAS-25']},
  {sec:'原宿へ歩く',ja:'ルート例：ガード下→宮益坂下→明治通り東側',sub:'約20分（OSMから概算）',tone:'ok',factIds:['ALT-HARA-H']},
  {ja:'歩行者の一方通行：例：2024年',sub:'2026年は10/25時点で未発表',factIds:['PED-2024','NA-PED-2026']}]},
 [OVER]:{
  title:'最短ルートで突っ切ったら…',lessonTitle:'規制と人の流れを先に確認',
  move:{shot:{key:'routemap',params:{routes:['ZONE-D-H-HARA','ALT-HARA-H'],routeWidth:13,highlight:'ZONE-D-H-HARA',colors:ZONE_COLORS,points:ZONE_FRAME,rect:{x0:.08,x1:.92,y0:.17,y1:.74},span:true,redZone:1}},hud:[
   cap('最短 約1350m・約17分\nうち赤枠内 約347m\n（OSMから概算・規制図より概略）',['ZONE-D-H-HARA','MEAS-04'],{until:2.3}),
   cap('赤枠＝車両の検問・規制エリア\n（2026年・規制図より概略）',['MEAS-02','MEAS-04'],{at:2.3}),
   {...ZONE_LEGEND,rows:ZONE_LEGEND.rows.map(r=>({...r}))}]},
  result:{shot:{key:'zone-edge',params:{side:'open',back:8,height:4.2,lookY:0,far:3,nearHide:2.5}},crowd:{key:'zone-dense'},cues:ALERT_CUES,hud:[
   cap('赤枠内は状況により\n検問・交通規制（2026年）',['MEAS-02'],{until:2.0}),
   cap('過去には歩行者も一方通行\n（例：2024年・2023年）',['PED-2024','PED-2023'],{at:2.0}),
   sim('進めない（シミュレーション）',{at:.6})]},
  stamp:{ja:'人の波で前に進めない…\n（シミュレーション）'}},
 [CLEAR]:{
  title:'外側を回ったら…',lessonTitle:'外側のルート例を確認',lessonFirst:3,
  move:{shot:{key:'routemap',params:{routes:['ALT-HARA-H','ZONE-D-H-HARA'],routeWidth:13,highlight:'ALT-HARA-H',colors:ZONE_COLORS,points:ZONE_FRAME,rect:{x0:.08,x1:.92,y0:.17,y1:.74},span:true,redZone:1}},hud:[
   cap('ルート例：ガード下の歩道\n→宮益坂下→明治通り東側\n（OSMから概算）',['ALT-HARA-H'],{until:2.3}),
   cap('約1572m・約20分\n赤枠内は最初の約180mだけ\n（OSMから概算・規制図より概略）',['ALT-HARA-H','MEAS-04'],{at:2.3}),
   {...ZONE_LEGEND,rows:ZONE_LEGEND.rows.map(r=>({...r}))}]},
  result:{shot:{key:'detour',params:{route:'ALT-HARA-H',mode:'eye',s0:200,speed:1.5,crowd:false}},
   crowd:{key:'detour-light',params:{path:[[161.7,-20.5],[170.4,-22],[177.2,-23.4],[176,-47.2],[175,-61.4],[172.8,-102.1]],width:9,density:.05,player:{u:.24,speed:1.5}}},amb:'street-quiet',hud:[
   cap('この回は流れて歩けた\n（シミュレーション）',[],{sim:true,until:2.0}),
   cap('警察は車両に周辺道路への\n迂回を呼びかけ（2026年）',['MEAS-25'],{tone:'note',at:2.0}),
   sim(COMMON.simFlow)]},
  stamp:{ja:'原宿駅にたどり着いた！\n（シミュレーション）'}},
};

export const PAIRS=Object.freeze({gate:GATE,zone:ZONE,alt:ALT,taxi:TAXI});
export const VARIANT_IDS=Object.freeze(['gate-over','gate-clear','zone-over','zone-clear','alt-over','alt-clear','taxi-over','taxi-clear']);

// ---------------------------------------------------------------- builders
const clone=v=>JSON.parse(JSON.stringify(v));
const beat=(id,dur,spec,extra={})=>{const b={id,dur,...clone(spec),...extra};if(!b.hud)b.hud=[];return b;};
export function buildVariant(id){
 const [pair,kind]=id.split('-');const P=PAIRS[pair];if(!P||!['over','clear'].includes(kind))throw new Error('unknown variant '+id);
 const outcome=kind==='over'?OVER:CLEAR,V=P[outcome],D=BODY_BEATS;
 const after=outcome===OVER?'calm':'victory';
 const res=V.result,stampShot={...clone(res.shot),t0:D.result};
 const pts=clone(P.lesson.points);if(V.lessonFirst!=null)pts.unshift(...pts.splice(V.lessonFirst,1));
 const beats=[
  beat('start',D.start,P.startBeat),
  beat('choice',D.choice,{...P.choiceBeat,hud:[{c:'choice'},...(P.choiceBeat.hud||[])]}),
  beat('move',D.move,V.move,{transition:'dip'}),
  beat('result',D.result,res),
  beat('stamp',D.stamp,{shot:stampShot,...(res.crowd?{crowd:clone(res.crowd)}:{}),...(res.board?{board:clone(res.board),factIds:clone(res.factIds||[])}:{}),
   ...(res.amb?{amb:res.amb}:{}),hud:[{c:'stamp',kind:outcome===OVER?'GAME_OVER':'GAME_CLEAR',ja:V.stamp.ja,factIds:[]}]},{bgm:after}),
  beat('lesson',D.lesson,{shot:{key:'card-bg'},hud:[{c:'lesson'}]},{clock:false,header:true,bgm:after,transition:'dip'}),
  beat('cheat',D.cheat,{shot:{key:'card-bg',params:{yaw0:1.1}},hud:[{c:'cheat'}]},{clock:false,bgm:after}),
  beat('sources',D.sources,{shot:{key:'card-bg',params:{yaw0:1.5}},hud:[{c:'sources',note:COMMON.sourcesNote,factIds:[]}]},{clock:false,bgm:after,fadeOut:.4}),
 ];
 const cfg={id,episode:'jr',pair,outcome,title:{ja:V.title},start:clone(P.start),clock:clone(P.clock),
  choice:{...clone(P.choice),picked:outcome===OVER?'A':'B'},beats,
  // lessonFirst (CLEAR partners): the point naming the winning choice comes first (QA finding 15)
  lesson:{title:V.lessonTitle,ja:[V.lessonTitle,...pts].join('\n'),points:pts,factIds:clone(P.lesson.factIds),summary:P.lesson.summary},cheat:clone(P.cheat),sources:[],bgm:'tension',amb:'crowd-night'};
 if(P.routes)cfg.routes=clone(P.routes);
 cfg.sources=VS.collectFactIds({...cfg,sources:[]}).filter(i=>FACTS[i]);
 return cfg;}

// _opening.json = OP beats of opening.mjs (title designer: flythrough → logo slam → PRESS START) + prologue cards.
export async function buildOpening(){
 const {openingBeats}=await import('./opening.mjs');
 const prologue=[
  {id:'notice',dur:PROLOGUE_DUR.notice,shot:{key:'card-bg'},hud:[clone(PROLOGUE.notice)]},
  {id:'rules',dur:PROLOGUE_DUR.rules,shot:{key:'card-bg',params:{yaw0:.9}},hud:[clone(PROLOGUE.rules)],fadeOut:.2},
 ];
 return {id:'_opening',episode:'jr',part:'opening',
  _note:'GENERATED by web3d/shibuya/series/copy-variants.mjs --write (OP beats from opening.mjs openingBeats()); edit the copy there.',
  beats:clone(openingBeats({prologue})),bgm:'tension',amb:'crowd-night'};}
export async function buildConfigs(){const out={_opening:await buildOpening()};for(const id of VARIANT_IDS)out[id]=buildVariant(id);return out;}

// ---------------------------------------------------------------- self-check
const MONSTER=[/zombie|ゾンビ/i,/monster|モンスター|怪物|化け物|魔物/i,/skeleton|ガイコツ|骸骨/i,/devil|悪魔/i,/gore|流血|血まみれ|血しぶき/i];
const HARM=/死|殺|けが|怪我|負傷|転倒|圧死|将棋倒し|下敷き|事故|犠牲|倒れ/;
const BEST=/おすすめ|オススメ|最適|最善|一番早い|推奨/;
const NOT_CLAIMS=/立入禁止|立ち入り禁止|通行禁止|空いて|空き|すいて|ガラガラ|がらがら/;
const REAL_AGENCY=/警視庁|警察署|政府|内閣|消防|気象庁|区役所|NHK|J-?ALERT|Jアラート/i;
const WALK_NUM=/\d+\s*(分|m(?![a-z])|km)/;
const PAST_YEAR=/20(1\d|2[0-5])年/;
// fields whose text is fine print (cheat rows / subs / sources note / notice foot): LIMITS.small
const SMALL_KEYS=new Set(['sub','note','foot','sec']);
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
function texts(v,path='',out=[],ctx={small:false}){
 if(typeof v==='string'){out.push({path,text:v,small:ctx.small});return out;}
 if(Array.isArray(v)){v.forEach((x,i)=>texts(x,`${path}[${i}]`,out,ctx));return out;}
 if(!isObj(v))return out;
 for(const [k,x] of Object.entries(v)){if(['factIds','sources','_note','id','episode','pair','outcome','c','kind','key','place','picked','tone','points'].includes(k)&&k!=='points')continue;
  if(['shot','crowd','cues','params','routes'].includes(k)&&k!=='routes')continue;
  if(k==='routes'){for(const [rid,r] of Object.entries(x||{}))if(typeof r.ja==='string')out.push({path:`routes.${rid}.ja`,text:r.ja,small:false});continue;}
  const small=ctx.small||SMALL_KEYS.has(k)||path.startsWith('cheat.rows')||(path.includes('board'));
  if(k==='points'){x.forEach((p,i)=>out.push({path:`${path}.points[${i}]`,text:p,small:false}));continue;}
  if(typeof x==='string'){if(['ja','sub','title','tip','head','issuer','when','order','foot','note','label','sec','asOf','status','dest','time'].includes(k))out.push({path:path?`${path}.${k}`:k,text:x,small});}
  else texts(x,path?`${path}.${k}`:k,out,{small});}
 return out;}
// objects that cite facts, with all their text (labels must sit in the same object)
function citing(v,path='',out=[]){if(Array.isArray(v)){v.forEach((x,i)=>citing(x,`${path}[${i}]`,out));return out;}
 if(!isObj(v))return out;
 if(Array.isArray(v.factIds)&&v.factIds.length)out.push({path,ids:v.factIds,text:texts(v).map(s=>s.text).join('\n'),obj:v});
 for(const [k,x] of Object.entries(v))if(k!=='factIds'&&k!=='routes')citing(x,path?`${path}.${k}`:k,out);
 return out;}
const simLike=o=>o&&(o.c==='sim'||o.c==='stamp'||o.sim===true);

// checkCopy(configs, {shotKeys, crowdKeys, componentKeys}) → errors[] (warnings of variant-system validation are
// returned by checkWarnings). configs = {_opening, <id>…} (default shape of buildConfigs()).
export const checkWarnings=[];
export function checkCopy(configs,keys={}){
 const E=[];checkWarnings.length=0;const opening=configs._opening;
 if(!opening)E.push('_opening missing');
 for(const id of VARIANT_IDS)if(!configs[id])E.push(`${id} missing`);
 const durOf=c=>c.beats.reduce((s,b)=>s+Math.round(b.dur*VS.FPS)/VS.FPS,0);
 const oDur=opening?durOf(opening):0;
 if(opening&&(oDur<9-1e-6||oDur>14.5+1e-6))E.push(`opening ${oDur.toFixed(2)} s (target 9–14.5 s: OP ≤ 8 s + readable prologue)`);
 for(const [id,cfg] of Object.entries(configs)){
  const part=id==='_opening'?'opening':'body';
  const r=VS.validateConfig(cfg,{part,facts:FACTS,dropped:DROPPED,...keys});
  for(const e of r.errors)E.push(`${id}: ${e}`);for(const w of r.warnings)(/unknown/.test(w)?E:checkWarnings).push(`${id}: ${w}`);
  if(part==='body'){const d=durOf(cfg);if(d<24-1e-6||d>32+1e-6)E.push(`${id}: body ${d.toFixed(2)} s (target 24–32 s)`);
   if(d+oDur<30-1e-6||d+oDur>45+1e-6)E.push(`${id}: video ${(d+oDur).toFixed(2)} s (target 30–45 s)`);
   if(!/架空/.test(cfg.clock?.ja||''))E.push(`${id}: clock label must say 架空`);
   const used=VS.collectFactIds({...cfg,sources:[]}).filter(i=>FACTS[i]);
   for(const i of used)if(!cfg.sources.includes(i))E.push(`${id}: fact ${i} shown but not in sources[]`);
   for(const i of cfg.sources)if(!used.includes(i))E.push(`${id}: sources[] lists ${i} but nothing shows it`);
   const ch=cfg.beats.find(b=>b.hud.some(h=>h.c==='cheat'));if(!ch||ch.dur<3)E.push(`${id}: cheat sheet must hold ≥3 s`);
   if(!(cfg.lesson.points||[]).length)E.push(`${id}: lesson.points missing`);}
  // text rules
  for(const s of texts(cfg)){const lim=s.small?LIMITS.small:LIMITS.ja;
   for(const l of s.text.split('\n'))if(jaWidth(l)>lim)E.push(`${id}: ${s.path} too long (${jaWidth(l)}>${lim}): ${l}`);
   for(const re of [...BANNED,...FILM_TITLES,...BRANDS,...MONSTER])if(re.test(s.text))E.push(`${id}: ${s.path} forbidden ${re}`);
   if(BEST.test(s.text))E.push(`${id}: ${s.path} best-route claim (routes are 「ルート例」)`);
   if(NOT_CLAIMS.test(s.text))E.push(`${id}: ${s.path} unsupported claim (立入禁止 / 空いている): ${s.text}`);
   if(HARM.test(s.text))E.push(`${id}: ${s.path} death/injury wording: ${s.text}`);
   if(/GAME\s*OVER|ゲームオーバー|GAME\s*CLEAR/i.test(s.text))E.push(`${id}: ${s.path} stamp words belong to the stamp component only`);
   if(/[\u{1F300}-\u{1FAFF}]/u.test(s.text))E.push(`${id}: ${s.path} emoji (fonts) — use text`);}
  // past years / sim / OSM labels
  const cites=citing(cfg);
  const walkHud=(v,f)=>{if(Array.isArray(v))v.forEach(x=>walkHud(x,f));else if(isObj(v)){f(v);for(const [k,x] of Object.entries(v))if(k!=='factIds')walkHud(x,f);}};
  walkHud(cfg,o=>{const t=texts(o).map(s=>s.text).join('\n');
   if(simLike(o)&&!t.includes('シミュレーション'))E.push(`${id}: sim/stamp item without 「シミュレーション」: ${t}`);
   if(o.c&&!simLike(o)&&!(o.factIds||[]).length&&/[0-9０-９]+\s*(人|分|m(?![a-z])|秒|台)/.test(o.ja||''))E.push(`${id}: number without a fact or 「シミュレーション」: ${o.ja}`);
   if(o.c&&PAST_YEAR.test(o.ja||'')&&!(o.factIds||[]).length)E.push(`${id}: past year without a fact id: ${o.ja}`);});
  for(const c of cites){const osm=c.ids.some(i=>FACTS[i]?.osm);
   if(osm&&WALK_NUM.test(c.text)&&!c.text.includes('OSMから概算'))E.push(`${id}: ${c.path} computed walk without 「OSMから概算」`);
   for(const i of c.ids){if(DROPPED.includes(i))E.push(`${id}: ${c.path} dropped fact ${i}`);else if(!FACTS[i])E.push(`${id}: ${c.path} unknown fact ${i}`);}
   if(c.ids.includes('MEAS-04')&&!/規制図|概略/.test(c.text))E.push(`${id}: ${c.path} red frame without 「規制図より概略」`);
   if(/赤枠/.test(c.text)&&!c.ids.some(i=>['MEAS-02','MEAS-03','MEAS-04','TAXI-07','ZONE-D-H-HARA'].includes(i)))E.push(`${id}: ${c.path} mentions 赤枠 without a police-map fact`);}
  if(part==='opening'){const n=opening.beats.flatMap(b=>b.hud).find(h=>h.c==='notice');
   if(!n)E.push('_opening: notice card missing');
   else{if(!/架空/.test(n.issuer))E.push('_opening: notice issuer must be fictional (架空)');
    if(REAL_AGENCY.test(texts(n).map(s=>s.text).join('\n')))E.push('_opening: notice names a real agency / alert service');
    if(/※パロディ/.test(texts(n).map(s=>s.text).join('\n')))E.push('_opening: no ※パロディ on the notice (steering 2026-10-26: the HUD adds a small 「フィクション」 tag instead)');}
   const rules=opening.beats.flatMap(b=>b.hud).find(h=>h.c==='rules');
   if(!rules||rules.items.length<3||rules.items.some(r=>!r.factIds.length))E.push('_opening: rules card needs ≥3 sourced tips');}}
 // pairs
 for(const p of Object.keys(PAIRS)){const a=configs[p+'-over'],b=configs[p+'-clear'];if(!a||!b)continue;
  for(const e of VS.validatePair(a,b))E.push(e);
  if(a.outcome!=='GAME_OVER'||b.outcome!=='CLEAR')E.push(`pair ${p}: -over must be GAME_OVER, -clear CLEAR`);
  if(JSON.stringify(a.cheat)!==JSON.stringify(b.cheat))E.push(`pair ${p}: partners should share the cheat sheet`);}
 return E;}

// ---------------------------------------------------------------- CLI
const isMain=typeof process!=='undefined'&&process.argv?.[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop());
if(isMain){
 const fs=await import('node:fs'),path=await import('node:path'),{fileURLToPath}=await import('node:url');
 const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const dir=path.join(ROOT,CONFIG_DIR);
 const keys={};
 try{keys.shotKeys=[...(await import('./shots-variants.mjs')).SHOT_KEYS];}catch(e){console.error('note: shot keys unavailable:',e.message);}
 try{keys.crowdKeys=Object.keys((await import('./crowd-variants.mjs')).CROWD_STATES);}catch(e){console.error('note: crowd keys unavailable:',e.message);}
 try{const m=await import('./ui/components.mjs');keys.componentKeys=[...(m.COMPONENT_KEYS||Object.keys(m.COMPONENTS||{}))];}catch(e){console.error('note: component keys unavailable:',e.message);}
 const configs=await buildConfigs();
 const ser=c=>JSON.stringify(c,null,1)+'\n';
 if(process.argv.includes('--write')){fs.mkdirSync(dir,{recursive:true});for(const [id,c] of Object.entries(configs))fs.writeFileSync(path.join(dir,id+'.json'),ser(c));console.log(`wrote ${Object.keys(configs).length} configs to ${CONFIG_DIR}`);}
 const errs=checkCopy(configs,keys);
 for(const [id,c] of Object.entries(configs)){const f=path.join(dir,id+'.json');
  if(!fs.existsSync(f))errs.push(`${CONFIG_DIR}/${id}.json missing (run with --write)`);else if(fs.readFileSync(f,'utf8')!==ser(c))errs.push(`${CONFIG_DIR}/${id}.json is stale (run with --write)`);}
 if(process.argv.includes('--json'))console.log(JSON.stringify({errors:errs,warnings:checkWarnings,configs}));
 else{for(const w of checkWarnings)console.log('warning: '+w);
  console.log(errs.length?errs.join('\n'):`copy-variants ok (${VARIANT_IDS.length} variants + opening; ${new Set(Object.values(configs).flatMap(c=>VS.collectFactIds(c))).size} fact ids)`);}
 process.exitCode=errs.length?1:0;
}
