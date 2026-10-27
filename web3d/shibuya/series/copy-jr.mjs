// On-screen copy for the series pilot 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」 (JP 9:16, primary) with
// EN drafts for the tourist version (romaji names, line codes JY/JA/JS/JB/G/Z/F/DT/TY/IN).
// Every string is T(ja, en, factIds, extra). factIds are ids in $LOGS/series/facts-series.json, resolved to
// outlet names by FACTS/SOURCES in sources-series.mjs (verdict verified / needs-label only). Strings with
// no fact (game framing, generic safety advice) carry factIds = [].
//
// extra flags:
//   sim:true      the string frames SIMULATION output → its ja must contain 「シミュレーション」 and its en
//                 "simulation"/"SIM". Placeholders {escaped} {left} {total} {queue} {d} {mmss} are filled
//                 by the overlay from crowd-jr.mjs stats (jrState / jrFrameFrom).
//   labelBy:'SECTION.key'  a caption in the SAME section that is on screen at the same time and carries
//                 the required label (year of a report, 「概略」, 「OSMから概算」, 「土休日」) for this string.
//   wide:true     exact title string, exempt from the per-line width limit (use TITLE.card to lay it out).
//   small:true    fine print / cheat-sheet row (limit LIMITS.small instead of LIMITS.ja).
//   wp:n          WALK_A step: waypoint n of camera.mjs JR_WALKS.hachiko (alt-routes.json JR-A-hachiko).
// Line limits for 9:16 at 720 CSS px: JP ≤ 16 full-width chars (ASCII = ½), EN ≤ 34 chars; fine print 22/44.
// Rules enforced by checkCopy() (also run by tests/test_series_copy.py):
//   • unknown or dropped fact ids are rejected; needs-label facts must show their label (sources-series say);
//   • 「シミュレーション」 on every sim string; 「OSMから概算」 on every computed walk time/distance;
//   • the 「※パロディ」 cue exists (PARODY.cue, always visible) and is on the cold-open notice;
//   • the cold-open issuer is fictional (架空) and names no real agency/alert service/broadcaster;
//   • no real film titles, brands/shop names, banned names, monster words, or "best/おすすめ" claims;
//   • GAME OVER only in TALLY.gameOver; the closing question and title are exact.
// No source recommends a route, so routes are 「ルート例」 (example routes), never 「おすすめ」.
// Past examples always carry their year; 2026 JR measures are 「10/25時点で未発表」.
import {FACTS,DROPPED,SOURCES,sourceNames} from './sources-series.mjs';

const T=(ja,en,factIds=[],extra={})=>Object.freeze({ja,en,factIds:Object.freeze([...factIds]),...extra});
const S=o=>Object.freeze(o);
const A=a=>Object.freeze(a);
const SHI='JR-LAST-01',SHO='JR-LAST-02';// Shibuya Yamanote outer / inner

export const EMOJI_FONT_STACK='"Noto Sans CJK JP", "Noto Color Emoji", sans-serif';
export const EPISODE=S({id:'jr',lang:'ja',aspect:'9:16',checked:'2026-10-25'});

// Permanent parody label (top corner, every frame).
export const PARODY=S({
 cue:T('※パロディ','PARODY'),
 fiction:T('フィクション','FICTION'),// cold-open corner tag (steering 2026-10-26: no persistent ※パロディ)
 long:T('※ホラー・デスゲーム風の\nパロディです','Parody of horror &\ndeath-game movies'),
});

// 0-2 s cold open: fictional game-HQ notice (NOT styled or named like any real alert / broadcaster).
export const COLD_OPEN=S({
 issuer:T('渋谷脱出ゲーム運営（架空）','ESCAPE GAME HQ (fictional)'),
 head:T('【緊急のお知らせ】','URGENT NOTICE'),
 when:T('10/31（土）夜・渋谷','Sat Oct 31, night · Shibuya'),
 body:T('今夜の渋谷は\n巨大な脱出ゲーム会場です','Tonight, Shibuya is\none giant escape game.'),
 order:T('参加者は全員、\nJRの改札をめざせ','All players:\nhead for a JR ticket gate'),
 cue:T('※パロディです。\n本物のお知らせではありません','PARODY: not a real notice'),
});

// 2-5 s title card (most prominent element).
export const TITLE=S({
 main:T('🧙ハロウィンの渋谷を脱出せよ！🎃 JR編','🧙 Escape Halloween Shibuya! 🎃 JR',[],{wide:true}),
 card:T('🧙ハロウィンの\n渋谷を脱出せよ！🎃\nJR編','🧙 ESCAPE\nHALLOWEEN SHIBUYA! 🎃\nJR EDITION'),
 sub:T('10/31 渋谷からどう帰る？','Oct 31: how do you get home?'),
 lines:T('山手線 JY・埼京線 JA\n湘南新宿ライン JS','Yamanote JY · Saikyo JA\nShonan-Shinjuku JS',['JR-LINE-01']),
});

// 5-9 s rules (each one a real safety tip) + what is announced for 2026.
export const RULES=S({
 head:T('ゲームのルール＝本物の注意','RULES = REAL SAFETY TIPS'),
 items:A([
  S({no:1,title:T('ルール① 誘導に従え','RULE 1: Follow police & staff'),
   tip:T('警察・係員の指示が最優先\n出入口は混雑で変わることも','Their directions come first.\nEntrances may change with crowds.',['MEAS-12'])}),
  S({no:2,title:T('ルール② 路上で飲むな','RULE 2: No drinking on the street'),
   tip:T('路上飲酒は18時〜翌5時\n禁止（通年）','Street drinking banned\n18:00–05:00 (all year)',['MEAS-07'])}),
  S({no:3,title:T('ルール③ ハチ公前で待つな','RULE 3: Don\'t meet at Hachiko'),
   tip:T('ハチ公像は仮囲いで\n見られない（10/30〜11/1）','The statue is boarded up\n(Oct 30 – Nov 1)',['MEAS-06'])}),
  S({no:4,title:T('ルール④ 終電の前に動け','RULE 4: Move before the last train'),
   tip:T('山手線の終電（土休日）\n外回り0:33・内回り0:48','Yamanote last trains (Sat/hol.):\nouter 0:33 · inner 0:48',[SHI,SHO])}),
 ]),
});
export const FACTS_2026=S({
 head:T('2026年 発表済み','ANNOUNCED FOR 2026'),
 items:A([
  T('人出の見込み 約1万8000人\n（区：2024年並み・22時ごろ）','Expected crowd ~18,000\n(ward: same as 2024, ~22:00)',['CROWD-01']),
  T('JR高架下 16時ごろ〜\n車両通行止め','Under the JR tracks:\nno cars from ~16:00',['MEAS-20']),
  T('道玄坂・文化村通り等は\n検問・規制の場合あり','Checkpoints possible on\nDogenzaka, Bunkamura-dori etc.',['MEAS-20']),
  T('ハチ公像は仮囲い','Hachiko statue boarded up',['MEAS-06']),
  T('仮設トイレは設置しない（区）','No temporary toilets (ward)',['MEAS-23']),
 ]),
 notAnnouncedHead:T('未発表（10/25時点）・過去の例','NOT ANNOUNCED (Oct 25) · PAST'),
 notAnnounced:A([
  T('JRの2026年の改札規制：\n未発表','JR 2026 gate measures:\nnot announced',['NA-JR-2026']),
  T('ハチ公改札は例年一部規制\n（2025年1月の報道）','Hachiko gate: usually partly\nrestricted (2025 report)',['JR-GATE-05']),
  T('例：2024年 ハチ公改札を\n16〜23時ごろ一部規制','e.g. 2024: part of Hachiko gate\nrestricted ~16:00–23:00',['MEAS-15']),
  T('例：2023年 ハチ公口改札を\n一時閉鎖','e.g. 2023: Hachiko gate\nclosed for a while',['MEAS-16']),
 ]),
});

// 9-14 s close top-down over Scramble / Hachiko Square.
export const MISSION=S({
 head:T('MISSION','MISSION'),
 objective:T('JRの改札まで\nたどり着け','Reach a JR ticket gate'),
 start:T('スタート：ハチ公前広場','START: Hachiko Square'),
 player:T('PLAYER START\nあなたはここ','PLAYER START\nYou are here'),
 density:T('ここの密度 {d}人/m²\n（シミュレーション）','Density here {d} p/m²\n(simulation)',[],{sim:true}),
 legend:T('赤＝3人/m²以上\n（シミュレーション）','Red = 3+ people/m²\n(simulation)',[],{sim:true}),
});

// 14-24 s eye-level walk, route A (alt-routes.json JR-A-hachiko). One caption per waypoint `wp`.
const WA={labelBy:'WALK_A.caveat'};
export const WALK_A=S({
 head:T('ルートA：ハチ公改札へ','ROUTE A: to the Hachiko gate'),
 dist:T('スクランブル→改札\n約270m・約4分（OSMから概算）','Scramble → gate: ~270 m, ~4 min\n(OSM estimate)',['JR-A-hachiko'],WA),
 caveat:T('一方通行は2025年1月の報道\n位置・ルートは概略','One-way: as reported Jan 2025\nRoute & positions approx.',['JR-GATE-03']),
 steps:A([
  T('正面にJRの高架（ガード）\nと交番が見える','Ahead: the JR tracks overhead\nand a police box (koban)',['JR-A-hachiko'],{...WA,wp:1}),
  T('ハチ公像の仮囲いを右に\n高架の方へ','Hachiko statue (boarded up) on\nyour right: head for the tracks',['JR-A-hachiko','MEAS-06'],{...WA,wp:2}),
  T('交番を左に見て\n高架下の通路へ','Koban on your left:\nenter the passage under the tracks',['JR-A-hachiko'],{...WA,wp:3}),
  T('通路は中央の仕切りで一方通行\n宮益坂（東口）方面の列へ','One-way passage with a divider:\njoin the eastbound lane',['JR-GATE-03','JR-A-hachiko'],{...WA,wp:4}),
  T('右手の仕切りの向こうに\nハチ公改札','The gate line is beyond\nthe divider, on your right',['JR-GATE-02','JR-A-hachiko'],{...WA,wp:5}),
  T('明治通りの手前でUターン！\n→仕切りの反対側を改札へ','U-turn before Meiji-dori!\nThen back on the far side',['JR-GATE-03','JR-A-hachiko'],{...WA,wp:6}),
  T('仕切りの反対側を\n改札へ戻る','Walk back on the other side\nof the divider',['JR-GATE-03','JR-A-hachiko'],{...WA,wp:7}),
  T('左手に改札の列','Gate line on your left',['JR-A-hachiko'],{...WA,wp:8}),
  T('ハチ公改札（1F）\n自動改札14台','Hachiko gate (1F):\n14 automatic gates',['JR-GATE-01','JR-GATE-02'],{...WA,wp:9}),
 ]),
 staff:T('当日は係員の誘導に従う','On the night, follow staff'),
});

// 24-32 s station interior (procedural, approximate).
export const INTERIOR=S({
 approx:T('位置・構造は概略','Layout approximate'),
 gate:T('ハチ公改札 1F\n2025年1月に移設','Hachiko gate (1F)\nmoved in Jan 2025',['JR-GATE-02']),
 exits:T('出て左：ハチ公口\n出て右：宮益坂口','Out, left: Hachiko exit\nOut, right: Miyamasuzaka exit',['JR-GATE-10']),
 stairs:T('新しい階段・エスカレーター\nで2Fの山手線ホームへ','New stairs & escalator\nup to the Yamanote platform (2F)',['JR-GATE-04','JR-PLAT-03']),
 elevator:T('エレベーターもあり','Elevator too',['JR-GATE-04']),
 plat1:T('1番線 外回り\n新宿・池袋方面','Track 1: outer loop\nfor Shinjuku · Ikebukuro',['JR-PLAT-01']),
 plat2:T('2番線 内回り\n品川・東京方面','Track 2: inner loop\nfor Shinagawa · Tokyo',['JR-PLAT-01']),
 saikyo:T('埼京線・湘南新宿ラインは\n別ホーム（新南改札寄り）\n3番線 北行・4番線 南行','Saikyo / Shonan-Shinjuku: another\nplatform (New South gate side)\ntrack 3 north · track 4 south',['JR-PLAT-01','JR-PLAT-03']),
 updown:T('上の階：中央改札・新南改札\n下の階：ハチ公改札・南改札','Up: Central & New South gates\nDown: Hachiko & South gates',['JR-PLAT-03']),
 central:T('中央改札（3F）\n出てすぐスクランブルスクエア\n左へ進むと銀座線','Central gate (3F):\nScramble Square right outside\nGinza Line gate: turn left',['JR-GATE-12']),
});

// 32-40 s branch choices: other JR gates, then 別駅脱出 (aerial route map).
const BR={labelBy:'BRANCHES.note'},LB={labelBy:'BRANCHES.lastHead'};
export const BRANCHES=S({
 head:T('分かれ道：どこから脱出？','CHOOSE YOUR EXIT'),
 note:T('ルート例・OSMから概算\n（混雑・信号は含まず）','Example routes · OSM estimate\n(no crowds or signals)'),
 gates:A([
  S({key:'A',gate:'hachiko',label:T('A ハチ公改札 1F\n約4分（OSMから概算）','A Hachiko gate (1F)\n~4 min (OSM estimate)',['JR-A-hachiko','JR-GATE-01'],{labelBy:'BRANCHES.approx'})}),
  S({key:'B',gate:'south',label:T('B 南改札 1F（西口・東口）\n約4分（OSMから概算）','B South gate (1F, West/East exit)\n~4 min (OSM estimate)',['JR-B-south','JR-GATE-13'])}),
  S({key:'C',gate:'shinminami',label:T('C 新南改札 3F\n東回り約7分・西回り約8分\n（OSMから概算）','C New South gate (3F)\n~7 min east / ~8 min west\n(OSM estimate)',['JR-C-newsouth-east','JR-C-newsouth-west','JR-GATE-01'])}),
  S({key:'D',gate:'central',label:T('D 中央改札 3F\n出てすぐスクランブルスクエア','D Central gate (3F):\nScramble Square right outside',['JR-GATE-12'])}),
 ]),
 approx:T('位置は概略','Positions approx.'),
 newSouth:T('新南改札：出て右サクラステージ\n出て左ストリーム','New South gate:\nSakura Stage right, Stream left',['JR-GATE-14']),
 newSouthWhere:T('サクラステージとストリームの間\n（2024年7月の報道）','Between Sakura Stage and Stream\n(reported Jul 2024)',['JR-GATE-09']),
 keio:T('井の頭線へは中央改札から\n屋内通路で','To Keio Inokashira: indoor\npassage from the Central gate',['JR-GATE-17']),
 altHead:T('別駅脱出：となりの駅まで歩く','ESCAPE VIA ANOTHER STATION'),
 startPin:T('渋谷（スタート）','Shibuya (START)'),
 alt:A([
  S({key:'harajuku',walk:T('原宿（山手線 JY）\nハチ公前から約20分\n（OSMから概算）','Harajuku (JY19)\n~20 min from Hachiko Square\n(OSM estimate)',['ALT-HARA-H']),
   last:T('原宿 外回り0:36・内回り0:45','Harajuku: outer 0:36 · inner 0:45',['JR-LAST-07','JR-LAST-08'],LB)}),
  S({key:'yoyogi',walk:T('代々木（JY・JB）\nハチ公前から約42分\n（OSMから概算）','Yoyogi (JY18 · JB)\n~42 min from Hachiko Square\n(OSM estimate)',['ALT-YOYO-H']),
   last:T('代々木 外回り0:38・内回り0:43\nJB 東行0:14・西行0:51','Yoyogi: outer 0:38 · inner 0:43\nJB east 0:14 · west 0:51',['JR-LAST-09','JR-LAST-10','JR-LAST-11','JR-LAST-12','ALT-YOYO-H'],LB)}),
  S({key:'ebisu',walk:T('恵比寿（JY・JA・JS）\n新南改札から約20分\n（OSMから概算）','Ebisu (JY21 · JA · JS)\n~20 min from the New South gate\n(OSM estimate)',['ALT-EBI-NS']),
   last:T('恵比寿 外回り0:30・内回り0:50\n埼京線23:39／23:38','Ebisu: outer 0:30 · inner 0:50\nSaikyo 23:39 / 23:38',['JR-LAST-13','JR-LAST-14','JR-LAST-15','JR-LAST-16'],LB)}),
 ]),
 ebisuFromHachiko:T('恵比寿：ハチ公前からは約25分\n（OSMから概算）','Ebisu from Hachiko Sq.: ~25 min\n(OSM estimate)',['ALT-EBI-H']),
 lastHead:T('終電は通常の土休日ダイヤ\n（10/25確認）','Last trains: regular Sat/holiday\ntimetable (checked Oct 25)'),
 shibuyaLast:T('渋谷 外回り0:33・内回り0:48','Shibuya: outer 0:33 · inner 0:48',[SHI,SHO],LB),
 warn:T('注意！渋谷より終電が\n早い方向もある','Careful: some last trains leave\nEARLIER than at Shibuya',[SHI,SHO,'JR-LAST-08','JR-LAST-10','JR-LAST-13'],LB),
 zone:T('恵比寿ルート例は赤枠の外\n（規制図より概略）','Ebisu example route stays outside\nthe red zone (police map, approx.)',['ALT-EBI-NS','MEAS-04']),
 passage:T('原宿方面の高架下通路は\n規制の可能性（例：2024年）','Passage toward Harajuku may be\nrestricted (e.g. 2024)',['ALT-HARA-H','MEAS-15']),
});

// 40-44 s taxi + fallbacks.
export const TAXI=S({
 head:T('🚕 タクシーで脱出','🚕 ESCAPE BY TAXI'),
 stand:T('渋谷SAKURAテラス前\nタクシー乗り場（位置は概略）','Taxi stand: Shibuya SAKURA\nTerrace (position approx.)',['TAXI-01','TAXI-07']),
 west:T('西口の乗り場は休止中\n（2025年3月〜）','West exit stand suspended\n(since Mar 2025)',['TAXI-01']),
 walk:T('新南改札から約97m・約2分\n（OSMから概算・階段は含まず）','~97 m, ~2 min from the New South\ngate (OSM estimate, no stairs)',['TAXI-W-NS']),
 scramble:T('スクランブルから約500m・約7分\n（OSMから概算）','~500 m, ~7 min from the Scramble\n(OSM estimate)',['TAXI-W-SCR']),
 zone:T('規制エリア（赤枠）の外\n（規制図より概略）','Outside the red zone\n(police map, approx.)',['TAXI-07','MEAS-04']),
 east:T('東口のりば：B6出口から','East exit stand: via exit B6',['TAXI-04']),
 closure:T('例：2025年の報道では\n黒枠区間はタクシーも\n16時ごろから通行不可','e.g. 2025 report: taxis too were\nbarred from the black section\nfrom ~16:00',['TAXI-06']),
});
const FB={labelBy:'FALLBACK.lastHead'};
export const FALLBACK=S({
 head:T('改札が混んでいたら？','IF THE GATES ARE PACKED'),
 other:T('別の改札か、別の駅へ\n（ルートB・C・別駅脱出）','Try another gate or station\n(routes B, C, walk away)'),
 info:T('駅員のいる案内所\n新南改札付近','Staffed info desk\nnear the New South gate',['JR-GATE-14']),
 toilet:T('トイレ・コインロッカー\n新南改札付近','Toilets & lockers\nnear the New South gate',['JR-GATE-14']),
 tokyu:T('東急の地下総合案内は\n19時まで','Tokyu underground info\ncounter closes at 19:00',['INFO-01']),
 rest:T('休憩所の情報：なし\n仮設トイレもなし（区）','Rest areas: no info\nNo temporary toilets (ward)',['NA-REST','MEAS-23']),
 lastHead:T('終電（通常の土休日ダイヤ）','LAST TRAINS (Sat/holiday)'),
 yamanote:T('山手線 外回り0:33\n内回り0:48','Yamanote: outer 0:33\ninner 0:48',[SHI,SHO],FB),
 saikyo:T('埼京線 北行23:41\n南行23:36','Saikyo: north 23:41\nsouth 23:36',['JR-LAST-03','JR-LAST-04'],FB),
 shonan:T('湘南新宿ライン 北行22:54\n南行23:03','Shonan-Shinjuku: north 22:54\nsouth 23:03',['JR-LAST-05','JR-LAST-06'],FB),
 onDay:T('当日は駅・係員の案内を確認','Check station notices on the night'),
});

// 44-47 s game tally (all numbers = simulation; crowd-jr.mjs).
export const CLOCK=S({
 countdown:T('のこり {mmss}','TIME LEFT {mmss}'),
 tag:T('ゲーム時間','GAME CLOCK'),
});
export const TALLY=S({
 stamp:T('ESCAPED!\n脱出成功（シミュレーション）','ESCAPED!\n(simulation)',[],{sim:true}),
 counter:T('脱出{escaped}人・残り{left}人\n（シミュレーション）','Out {escaped} · still in {left}\n(simulation)',[],{sim:true}),
 queue:T('改札前の待ち {queue}人\n（シミュレーション）','Waiting at the gate: {queue}\n(simulation)',[],{sim:true}),
 arrival:T('改札まで {mmss}\n（シミュレーション）','To the gate: {mmss}\n(simulation)',[],{sim:true}),
 alert:T('⚠ 密集アラート\n（シミュレーション）','⚠ CROWD ALERT\n(simulation)',[],{sim:true}),
 gameOver:T('GAME OVER','GAME OVER'),
 clear:T('GAME CLEAR','GAME CLEAR'),
 // walk-alt route (crowd-jr JR_ROUTES D 'walk-alt'): the sim ends at the edge of the modelled area (outside the red
 // zone, north of Miyamasuzaka-shita), NOT at Harajuku → keyed 「別」 in the tally (A–D stay the JR gates) and the
 // OSM walk time to the station is shown next to it.
 altRow:T('原宿方面：規制エリア外まで（概略）\n{mmss}（シミュレーション）\n→原宿駅まで約20分（OSMから概算）','Toward Harajuku: out of the zone (approx.)\n{mmss} (simulation)\n→ Harajuku Sta. ~20 min (OSM estimate)',['ALT-HARA-H','MEAS-04'],{sim:true,small:true}),
 altKey:T('別','ALT'),
 stampWhere:T('ハチ公改札（1F）に到着','At the Hachiko gate (1F)',['JR-GATE-01']),
 tally:T('{escaped}/{total}ルート脱出\n（シミュレーション）','{escaped}/{total} routes escaped\n(simulation)',[],{sim:true}),
 notForecast:T('シミュレーションは予測ではない','Simulation, not a forecast',[],{sim:true}),
 line:T('…でも本番は10/31','…but the real night is Oct 31'),
});

// 47-51 s screenshot-able cheat sheet (held ≥ 3 s).
const CH={labelBy:'CHEAT.note'},CL={labelBy:'CHEAT.last'};
export const CHEAT=S({
 head:T('保存版 JR渋谷 脱出メモ','SAVE THIS: JR SHIBUYA EXITS'),
 gatesHead:T('改札 → 出口','GATE → EXIT'),
 gates:A([
  T('ハチ公改札 1F → ハチ公口・宮益坂口','Hachiko 1F → Hachiko / Miyamasuzaka',['JR-GATE-01','JR-GATE-10'],{small:true}),
  T('中央改札 3F → スクランブルスクエア','Central 3F → Scramble Square',['JR-GATE-01','JR-GATE-12'],{small:true}),
  T('南改札 1F → 西口・東口','South 1F → West / East exit',['JR-GATE-01','JR-GATE-13'],{small:true}),
  T('新南改札 3F → サクラステージ・ストリーム','New South 3F → Sakura Stage / Stream',['JR-GATE-01','JR-GATE-14'],{small:true}),
 ]),
 altHead:T('別駅脱出（徒歩）','WALK TO ANOTHER STATION'),
 alt:A([
  T('原宿 JY 約20分（ハチ公前から）','Harajuku JY ~20 min (from Hachiko)',['ALT-HARA-H'],{...CH,small:true}),
  T('恵比寿 JY・JA・JS 約20分（新南改札から）','Ebisu JY/JA/JS ~20 min (New South)',['ALT-EBI-NS'],{...CH,small:true}),
  T('代々木 JY・JB 約42分（ハチ公前から）','Yoyogi JY/JB ~42 min (from Hachiko)',['ALT-YOYO-H'],{...CH,small:true}),
 ]),
 taxi:T('🚕 渋谷SAKURAテラス前（位置は概略）\n新南改札から約2分','🚕 SAKURA Terrace (approx.)\n~2 min from the New South gate',['TAXI-01','TAXI-07','TAXI-W-NS'],{...CH,small:true}),
 last:T('終電（土休日）山手 外0:33・内0:48','Last (Sat/hol.) JY outer 0:33 inner 0:48',[SHI,SHO],{small:true}),
 last2:T('埼京 北23:41・南23:36\n湘南新宿 北22:54・南23:03','JA north 23:41 · south 23:36\nJS north 22:54 · south 23:03',['JR-LAST-03','JR-LAST-04','JR-LAST-05','JR-LAST-06'],{...CL,small:true}),
 warn:T('原宿・代々木・恵比寿は\n渋谷より終電が早い方向あり','Harajuku/Yoyogi/Ebisu: some last\ntrains leave earlier than Shibuya',['JR-LAST-08','JR-LAST-10','JR-LAST-13',SHI,SHO],{...CL,small:true}),
 status:T('2026年のJR改札規制：10/25時点で未発表\n（例：2024年 16〜23時ごろ一部規制）','JR 2026 gate measures: not announced\n(e.g. 2024: partial limits 16:00–23:00)',['NA-JR-2026','MEAS-15'],{small:true}),
 note:T('徒歩はOSMから概算（階段・混雑は含まず）','Walks: OSM estimate (no stairs/crowds)',[],{small:true}),
});

// 51-54 s closing question + sources.
export const QUESTION=S({
 line:T('あなたはどの改札から脱出する？','Which gate will YOU escape from?'),
 cta:T('コメントで教えて！🎃','Tell us in the comments! 🎃'),
});
export const END_CARD=S({
 title:TITLE.main, question:QUESTION.line,
 sourcesHead:T('出典','Sources'),
 sim:T('ESCAPED・人数・密度は\nシミュレーション（予測ではない）','ESCAPED, counts, density:\nsimulation (not a forecast)',[],{sim:true}),
 walk:T('徒歩：OSMから概算（80m/分）','Walks: OSM estimate (80 m/min)',['ALT-HARA-H']),
 approx:T('駅構内・位置は概略','Station layout approximate'),
 people:T('仮装の人は敵じゃない\n敵は「混雑」だ','Costumed people are not the enemy.\nThe crowding is.'),
 parody:PARODY.long,
 checkOnDay:T('当日は鉄道各社の案内を確認','Check rail notices on the night'),
 data:T('3D：PLATEAU／© OpenStreetMap','3D: PLATEAU / © OpenStreetMap contributors',[],{small:true}),
});

// EN drafts for tourists: line codes (colours only where sourced, JR only and approximate).
export const LINES_EN=S({
 head:T('路線記号','LINE CODES'),
 items:A([
  T('山手線 JY（黄緑・色は概略）\n渋谷 JY20','JY Yamanote Line · JY20\n(yellow-green, colour approx.)',['JR-LINE-01','JR-LINE-02']),
  T('埼京線 JA（緑・色は概略）\n渋谷 JA10','JA Saikyo Line\n(green, colour approx.) · JA10',['JR-LINE-01','JR-LINE-02']),
  T('湘南新宿ライン JS\n（赤・色は概略）渋谷 JS19','JS Shonan-Shinjuku Line\n(red, colour approx.) · JS19',['JR-LINE-01','JR-LINE-02']),
  T('中央・総武線各停 JB（代々木）','JB Chuo-Sobu local (at Yoyogi)',['ALT-YOYO-H']),
  T('銀座線 G・半蔵門線 Z（表参道）','G Ginza · Z Hanzomon (Omotesando)',['ALT-OMOTE-HK']),
  T('副都心線 F（明治神宮前）','F Fukutoshin (Meiji-jingumae)',['ALT-MJM-H']),
  T('田園都市線 DT：池尻大橋 DT02\n（各駅停車など・急行は通過）','DT Den-en-toshi: Ikejiri-Ohashi\nDT02 (expresses pass)',['ALT-IKE-NS','ALT-STOP-01']),
  T('東横線 TY：代官山 TY02\n（各駅停車など・急行は通過）','TY Toyoko: Daikanyama TY02\n(expresses pass)',['ALT-DAIK-NS','ALT-STOP-01']),
  T('井の頭線 IN：神泉 IN02\n（各駅停車など・急行は通過）','IN Inokashira: Shinsen IN02\n(expresses pass)',['ALT-SHIN-NS','ALT-STOP-01']),
 ]),
});
// Later episodes (titles only; decided in episodes.md from the real station structure).
export const EPISODES=S({
 items:A([
  S({id:'jr',title:T('JR編','JR (JY / JA / JS)',['JR-LINE-01'])}),
  S({id:'dt-z',title:T('田園都市線・半蔵門線編','Den-en-toshi & Hanzomon (DT / Z)',['STR-TK-01'])}),
  S({id:'ty-f',title:T('東横線・副都心線編','Toyoko & Fukutoshin (TY / F)',['STR-TK-01'])}),
  S({id:'g',title:T('銀座線編','Ginza Line (G)',['STR-G-01'])}),
  S({id:'in',title:T('京王井の頭線編','Keio Inokashira Line (IN)',['STR-IN-01'])}),
 ]),
});

export const COPY=S({PARODY,COLD_OPEN,TITLE,RULES,FACTS_2026,MISSION,WALK_A,INTERIOR,BRANCHES,TAXI,FALLBACK,CLOCK,TALLY,CHEAT,QUESTION,END_CARD,LINES_EN,EPISODES});
// Pilot sections in screen order (LINES_EN / EPISODES are EN/later drafts, not in the JP pilot).
export const PILOT_SECTIONS=A(['PARODY','COLD_OPEN','TITLE','RULES','FACTS_2026','MISSION','WALK_A','INTERIOR','BRANCHES','TAXI','FALLBACK','CLOCK','TALLY','CHEAT','QUESTION','END_CARD']);

// ---- helpers ----
const isT=o=>o&&typeof o==='object'&&typeof o.ja==='string'&&typeof o.en==='string'&&Array.isArray(o.factIds);
function walkStrings(o,path,out){if(!o||typeof o!=='object')return out;if(isT(o)){out.push({path,...o});return out;}
 for(const [k,v] of Object.entries(o))if(v&&typeof v==='object')walkStrings(v,path?path+'.'+k:k,out);return out;}
export const stringsOf=C=>walkStrings(C,'',[]);
export const ALL_STRINGS=Object.freeze(stringsOf(COPY).map(Object.freeze));
const getPath=(p,C=COPY)=>p.split('.').reduce((o,k)=>o==null?o:o[k],C);
export const sectionFactIds=(sec,strings=ALL_STRINGS)=>[...new Set(strings.filter(s=>s.path.split('.')[0]===sec).flatMap(s=>s.factIds))];
const FOOT={ja:{prefix:'出典：',sep:'・'},en:{prefix:'Sources: ',sep:' · '}};
export function footnote(factIds,lang){
 const names=sourceNames(factIds.filter(id=>FACTS[id]),lang);
 return names.length?FOOT[lang].prefix+names.join(FOOT[lang].sep):'';
}
// Per-section footnotes (small print under each beat).
export const FOOTNOTES=Object.freeze(Object.fromEntries(Object.keys(COPY).map(sec=>{const ids=sectionFactIds(sec);
 return [sec,Object.freeze({ja:footnote(ids,'ja'),en:footnote(ids,'en'),factIds:Object.freeze(ids)})];})));
export const ALL_FACT_IDS=Object.freeze([...new Set(PILOT_SECTIONS.flatMap(sec=>sectionFactIds(sec)))]);
// End card: every outlet used in the pilot, with its date (deduped by name+date).
export const END_SOURCES=Object.freeze({ja:Object.freeze(sourceNames(ALL_FACT_IDS,'ja',{date:true})),en:Object.freeze(sourceNames(ALL_FACT_IDS,'en',{date:true}))});
export const END_DATA=Object.freeze({ja:'地図・徒歩：© OpenStreetMap contributors（ODbL）・3D：PLATEAU',en:'Maps & walks: © OpenStreetMap contributors (ODbL) · 3D: PLATEAU'});
export const urlList=()=>[...new Set(ALL_FACT_IDS.flatMap(id=>FACTS[id].src.map(k=>SOURCES[k].url)))];

// ---- self-check (node web3d/shibuya/series/copy-jr.mjs; tests/test_series_copy.py) ----
export const LIMITS=Object.freeze({ja:16,en:34,small:22,smallEn:44});
export const jaWidth=s=>[...s.replace(/\{\w+\}/g,'0000')].reduce((w,c)=>w+(c.codePointAt(0)<0x100?0.5:1),0);
export const enWidth=s=>[...s.replace(/\{\w+\}/g,'0000')].length;
const cc=(...c)=>String.fromCharCode(...c);// banned names built from char codes so they never appear in the source
export const BANNED=Object.freeze([new RegExp(cc(101,110,97,98,108,101)+'\\s*'+cc(120),'i'),new RegExp(cc(0x30AB,0x30F3,0x30EA,0x30FC)),new RegExp(cc(99,97,110)+'-?'+cc(108,121),'i')]);
// Real horror / death-game film & series titles (JP + EN) and real shop / consumer brands: never on screen.
export const FILM_TITLES=Object.freeze([/バイオハザード|resident\s*evil/i,/ウォーキング.?デッド|walking\s*dead/i,/イカゲーム|squid\s*game/i,
 /今際の国|borderland/i,/バトル.?ロワイアル|battle\s*royale/i,/カイジ|kaiji/i,/ライアーゲーム|liar\s*game/i,/王様ゲーム/,
 /新感染|train\s*to\s*busan/i,/28日後|28\s*days\s*later/i,/ゾンビランド|zombieland/i,/ドーン.?オブ.?ザ.?デッド|dawn\s*of\s*the\s*dead/i,
 /カメラを止めるな/,/ハンガー.?ゲーム|hunger\s*games/i,/\bSAW\b|ソウ[0-9０-９]/,/アイアムアヒーロー|i\s*am\s*a\s*hero/i,/ワールド.?ウォー.?[ZＺ]|world\s*war\s*z/i,/学校であった怖い話|ハロウィン.?キラー/]);
export const BRANDS=Object.freeze([/スタバ|スターバックス|starbucks/i,/ドン.?キ|don\s*quijote/i,/マクドナルド|mcdonald/i,/ユニクロ|uniqlo/i,
 /\bTSUTAYA\b|ツタヤ/i,/\bSHIBUYA\s*109\b|渋谷109|マルキュー/i,/\bMAGNET\b/i,/コカ.?コーラ|coca.?cola/i,/セブン.?イレブン|7.?eleven|ローソン|lawson|ファミリーマート|familymart/i,
 /\bApple\b|\bNike\b|ナイキ/i,/Suica|PASMO/,/NHK|J-?ALERT|Jアラート/i]);
const MONSTER=[/zombie|ゾンビ/i,/monster|モンスター|怪物|化け物/i,/skeleton|ガイコツ|骸骨/i,/devil|悪魔/i,/gore|流血|血まみれ/i,/idiot|バカ/i];
const BEST=/おすすめ|オススメ|最適|最善|一番早い|\bbest\b|recommend/i;
const REAL_AGENCY=/警視庁|警察署|政府|内閣|消防|気象庁|渋谷区役所|NHK|J-?ALERT|Jアラート|emergency alert|police dep|government|cabinet/i;
const SIM_SLOTS=/\{(escaped|left|total|queue|d|density)\}/;
const NUM_WALK=/\d+\s*(分|m\b|m・|m（|km)/;
const NUM_WALK_EN=/\d+\s*(min|m\b|km)/;
// checkCopy(C) validates a copy tree shaped like COPY (default: this module's copy; tests pass mutated clones).
export function checkCopy(C=COPY){
 const errs=[],strings=stringsOf(C);
 const {PARODY,COLD_OPEN,TITLE,QUESTION,RULES,WALK_A,CHEAT,INTERIOR,END_CARD}=C;
 for(const s of strings){
  const p=s.path,both=s.ja+'\n'+s.en,sec=p.split('.')[0];
  // width (title main is exempt; use TITLE.card on screen)
  if(!s.wide){const lj=s.small?LIMITS.small:LIMITS.ja,le=s.small?LIMITS.smallEn:LIMITS.en;
   for(const l of s.ja.split('\n'))if(jaWidth(l)>lj)errs.push(`${p} ja too long (${jaWidth(l)}>${lj}): ${l}`);
   for(const l of s.en.split('\n'))if(enWidth(l)>le)errs.push(`${p} en too long (${enWidth(l)}>${le}): ${l}`);}
  // fact ids
  for(const id of s.factIds){
   if(DROPPED.includes(id)){errs.push(`${p} uses dropped fact ${id}`);continue;}
   const f=FACTS[id];if(!f){errs.push(`${p} unknown fact ${id}`);continue;}
   if(f.v!=='verified'&&f.v!=='needs-label')errs.push(`${p} fact ${id} has verdict ${f.v}`);
  }
  // labelBy: same section, existing caption
  const lb=s.labelBy?getPath(s.labelBy,C):null;
  if(s.labelBy&&(!isT(lb)||s.labelBy.split('.')[0]!==sec))errs.push(`${p} labelBy ${s.labelBy} missing or in another section`);
  const ja=s.ja+(isT(lb)?'\n'+lb.ja:''),en=s.en+(isT(lb)?'\n'+lb.en:'');
  // needs-label / year labels
  for(const id of s.factIds){const f=FACTS[id];if(!f)continue;
   for(const g of f.say||[])if(!g.some(t=>ja.includes(t)))errs.push(`${p} ${id} needs label ${g.join('|')} (ja)`);
   for(const g of f.sayEn||[])if(!g.some(t=>en.toLowerCase().includes(t.toLowerCase())))errs.push(`${p} ${id} needs label ${g.join('|')} (en)`);}
  // computed walks: 「OSMから概算」
  const osm=s.factIds.some(id=>FACTS[id]?.osm);
  if(osm&&NUM_WALK.test(s.ja)&&!ja.includes('OSMから概算'))errs.push(`${p} walk time/distance without 「OSMから概算」`);
  if(osm&&NUM_WALK_EN.test(s.en)&&!/OSM/.test(en))errs.push(`${p} walk time/distance without "OSM" (en)`);
  if(!osm&&!s.sim&&/(約|~)\d+\s*(分|min)/.test(both)&&!s.factIds.length)errs.push(`${p} walk time without a computed-walk fact`);
  // simulation
  if(s.sim){if(!s.ja.includes('シミュレーション'))errs.push(`${p} sim string without 「シミュレーション」`);
   if(!/simulation|\bSIM\b/i.test(s.en))errs.push(`${p} sim string without "simulation" (en)`);}
  else if(SIM_SLOTS.test(both))errs.push(`${p} sim number slot in a non-sim string`);
  if(/\{mmss\}/.test(both)&&!s.sim&&!p.startsWith('CLOCK.'))errs.push(`${p} {mmss} outside CLOCK must be sim`);
  // banned / real titles / brands / monsters / best-route claims
  for(const re of [...BANNED,...FILM_TITLES,...BRANDS,...MONSTER])if(re.test(both))errs.push(`${p} forbidden ${re}`);
  if(BEST.test(both))errs.push(`${p} claims a best route (no source recommends one)`);
  if(/GAME\s*OVER|ゲームオーバー/i.test(both)&&p!=='TALLY.gameOver')errs.push(`${p} GAME OVER outside TALLY.gameOver`);
  if(/CAUGHT|捕まった|やられた|死亡|死ぬ/i.test(both))errs.push(`${p} caught/death wording`);
  if(/20(1\d|2[0-5])年/.test(s.ja)&&!s.factIds.length)errs.push(`${p} past-year example without a fact id`);
  if(sec==='COLD_OPEN'&&REAL_AGENCY.test(both))errs.push(`${p} cold open names a real agency/alert service`);
 }
 // parody cue
 if(PARODY.cue.ja!=='※パロディ')errs.push('PARODY.cue must be 「※パロディ」');
 if(!COLD_OPEN.cue.ja.includes('※パロディ')||!/PARODY/.test(COLD_OPEN.cue.en))errs.push('COLD_OPEN cue must carry ※パロディ / PARODY');
 if(!/架空/.test(COLD_OPEN.issuer.ja)||!/fictional/i.test(COLD_OPEN.issuer.en))errs.push('COLD_OPEN issuer must be fictional');
 if(!END_CARD.parody.ja.includes('パロディ'))errs.push('END_CARD parody line missing');
 // exact strings
 if(TITLE.main.ja!=='🧙ハロウィンの渋谷を脱出せよ！🎃 JR編')errs.push('TITLE.main changed');
 if(TITLE.card.ja.replace(/\n/g,'').replace('🎃JR','🎃 JR')!==TITLE.main.ja)errs.push('TITLE.card must be TITLE.main split in lines');
 if(TITLE.sub.ja!=='10/31 渋谷からどう帰る？')errs.push('TITLE.sub changed');
 if(QUESTION.line.ja!=='あなたはどの改札から脱出する？')errs.push('QUESTION.line changed');
 // structure
 if(RULES.items.length<3||RULES.items.length>5)errs.push('RULES must have 3-5 items');
 for(const r of RULES.items)if(!r.tip.factIds.length)errs.push(`RULES ${r.no} tip has no fact id`);
 const wps=WALK_A.steps.map(s=>s.wp);if(wps.some((w,i)=>w!==i+1))errs.push('WALK_A steps must be waypoints 1..n in order');
 if(CHEAT.gates.length!==4)errs.push('CHEAT must list the 4 JR gates');
 if(CHEAT.alt.length<3)errs.push('CHEAT must list ≥3 alt stations');
 if(!INTERIOR.approx.ja.includes('概略'))errs.push('INTERIOR needs 「位置・構造は概略」');
 for(const sec of PILOT_SECTIONS){if(!C[sec]){errs.push(`section ${sec} missing`);continue;}
  const ids=sectionFactIds(sec,strings).filter(id=>FACTS[id]&&!FACTS[id].na);
  if(ids.length&&!footnote(ids,'ja').startsWith('出典：'))errs.push(`${sec} footnote empty`);}
 return errs;
}
if(typeof process!=='undefined'&&process.argv?.[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){
 const e=checkCopy();console.log(e.length?e.join('\n'):`copy-jr ok (${ALL_STRINGS.length} strings, ${ALL_FACT_IDS.length} facts)`);
 if(process.argv.includes('--dump'))console.log(JSON.stringify({FOOTNOTES,END_SOURCES},null,1));
 process.exitCode=e.length?1:0;
}
