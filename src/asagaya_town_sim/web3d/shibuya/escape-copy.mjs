// On-screen copy for the v4 "Escape Shibuya" video (JP + EN, one capture, DOM overlays).
// Every factual string carries factIds = ids in research-practical.md (logs, 2026-10-23), resolved to
// outlet names by FACT_SOURCES/SOURCES in sources-halloween.mjs. Strings with sim:true only frame
// simulation numbers. Multi-line captions use '\n'. Limits (9:16 fit): JP <= 22 full-width chars,
// EN <= 42 chars per line; checkCopy() enforces them, the fact ids and the banned words.
// Tone: the crowd are Halloween partygoers; the "horde" is only the red density field.
// No source recommends a route, so routes are "example routes" (ルート例), never "best".
//
// PARODY LAYER (generic horror/death-game genre parody; no real film titles, lines or characters;
// no real agency as issuer; partygoers are never the threat, only the red density field is):
//   BROADCAST  cold-open "urgent notice" card. issuer = fictional game HQ; parody cue (always on screen)
//              + notReal footer. Never styled or named like a real alert service or broadcaster.
//   RULES      head + items[4] {no,title,tip}: rules that are real safety tips. Facts in tips carry factIds.
//   GAME       start / startSub (GAME START), rec (VHS label), countdown (game clock, NOT sim),
//              simClock (sim clock), survivorsHead + survivors (sim counts: escaped / still in Shibuya),
//              alert (red vignette label when sim density spikes).
//   TAGLINES   2 original B-movie taglines (array of T).
//   GAME_OVER  end-of-game parody title before QUESTION. Not a route result: the sub-line reports the
//              sim tally ({escaped}/{total} routes escaped). checkCopy() allows "GAME OVER" only here.
//   STAMPS.escaped is the per-route result stamp (ESCAPED!). STAMPS.caught exists only for a sim
//              CAUGHT outcome; the current sim produces none, so it must never be shown.
//   END_CARD.parody  parody disclaimer on the end card.
import {SOURCES,FACT_SOURCES,DROPPED_FACTS,CROWD_2026} from './sources-halloween.mjs';

const T=(ja,en,factIds=[],extra={})=>Object.freeze({ja,en,factIds:Object.freeze(factIds),...extra});
const fmtN=n=>n.toLocaleString('en-US');

export const EMOJI_FONT_STACK='"Noto Sans CJK JP", "Noto Color Emoji", sans-serif';

// 0-1.5 s hook (scroll-stopper) and the title.
export const HOOK=Object.freeze({
 kicker:T('MISSION 10.31','MISSION: OCT 31'),
 line:T('渋谷から脱出できるか？','Can you escape Shibuya?'),
 sub:T('ハロウィンの夜、帰り道はどこだ','Halloween night. Which way out?'),
});
export const TITLE=Object.freeze({
 main:T('🧙ハロウィンの渋谷を脱出せよ！🎃','Escape Shibuya on Halloween!'),
 // two-line title card (motion spec §3.1)
 card:T('🧙ハロウィンの\n渋谷を脱出せよ！🎃','🧙 ESCAPE SHIBUYA\nON HALLOWEEN! 🎃'),
 sub:T('10/31 渋谷からどう帰る？','Oct 31: how to get home'),
});
export const HEADER=Object.freeze({
 title:TITLE.main, sub:TITLE.sub,
 tagline:T('渋谷から脱出できるか？','Can you escape Shibuya?'),
});

// ---- parody layer (see header) ----
export const BROADCAST=Object.freeze({
 parody:T('※これはパロディです','PARODY — not a real alert'),
 issuer:T('渋谷脱出ゲーム運営（架空）','ESCAPE GAME HQ (fictional)'),
 head:T('ゲーム運営より緊急のお知らせ','URGENT NOTICE FROM GAME HQ'),
 when:T('10月31日（土）夜　渋谷','Sat Oct 31, night — Shibuya'),
 crowd:T(`予想人出 約${fmtN(CROWD_2026.estimate)}人*（渋谷区）`,`Expected crowd ≈${fmtN(CROWD_2026.estimate)}* (Shibuya City)`,['CROWD-01']),
 order:T('参加者は全員、\n駅かタクシー乗り場へ脱出せよ','All players: escape to a station gate\nor a taxi stand'),
 notReal:T('本物の警報・お知らせではありません','This is not a real alert or notice'),
});
export const RULES=Object.freeze({
 head:T('ゲームのルール','RULES OF THE GAME'),
 items:Object.freeze([
  Object.freeze({no:1,title:T('ルール① 立ち止まるな','RULE 1: Don\'t stop'),
   tip:T('人の流れに乗って、赤い所は避けろ','Move with the flow. Stay out of the red.')}),
  Object.freeze({no:2,title:T('ルール② 警察・警備員の指示に従え','RULE 2: Follow police & staff'),
   tip:T('31日は民間警備員 約125人（区の対策）','Oct 31: ~125 private guards (ward plan)',['MEAS-08'])}),
  Object.freeze({no:3,title:T('ルール③ 自分のルートの改札を使え','RULE 3: Use the gate on your route'),
   tip:T('出入口は混雑で変わる可能性あり','Entrances may change with crowding',['MEAS-12'])}),
  Object.freeze({no:4,title:T('ルール④ 歩いて規制の外へ','RULE 4: Walk out of the closure zone'),
   tip:T('🚕 タクシーは赤枠の外で（規制図）\n🚶 神泉駅まで徒歩約10分など（OSM概算）','🚕 Taxis outside the red zone (police map)\n🚶 e.g. Shinsen ~10 min walk (OSM est.)',['TAXI-07','ALT-01'])}),
 ]),
});
export const GAME=Object.freeze({
 start:T('GAME START','GAME START'),
 startSub:T('ゲーム開始：渋谷から脱出せよ','Your goal: get out of Shibuya'),
 rec:T('▶ PLAY　10.31 SAT','▶ PLAY  OCT 31 SAT'),
 countdown:T('のこり {mmss}','TIME LEFT {mmss}'),
 simClock:T('SIM +{mmss}','SIM +{mmss}',[],{sim:true}),
 survivorsHead:T('脱出カウンター（シミュ）','SURVIVOR COUNT (SIMULATION)',[],{sim:true}),
 survivors:T('脱出 {escaped}人 ／ まだ渋谷 {left}人','out {escaped} · still in Shibuya {left}',[],{sim:true}),
 alert:T('⚠ 密集アラート（シミュレーション）','⚠ CROWD ALERT (SIMULATION)',[],{sim:true}),
});
export const TAGLINES=Object.freeze([
 T('その夜、立ち止まった者から…\n渋滞になる。','That night, whoever stops first…\nbecomes the traffic jam.'),
 T('仮装は自由。\n帰り道は、自分で選べ。','Costumes: optional.\nThe way home: your call.'),
]);
export const GAME_OVER=Object.freeze({
 title:T('GAME OVER','GAME OVER'),
 tally:T('{escaped}/{total}ルート脱出（シミュ）','{escaped}/{total} routes escaped (sim)',[],{sim:true}),
 line:T('…でも本番は10/31','…but the real night is Oct 31'),
});

// 3-7 s MISSION briefing. The 18,000 is a cited ward expectation, NOT a sim number.
export const MISSION=Object.freeze({
 heading:T('MISSION','MISSION'),
 objective:T('改札かタクシー乗り場に\nたどり着け','Reach a station gate\nor a taxi stand'),
 crowdNumber:T(`予想人出 約${fmtN(CROWD_2026.estimate)}人*`,`Expected crowd ≈${fmtN(CROWD_2026.estimate)}*`,['CROWD-01']),
 crowdNote:T('渋谷区の2026年の見込み（22時ごろ）\n2024年のセンター街路上と同程度','Shibuya City 2026 expectation (~22:00):\nabout 2024 on the Center Gai streets',['CROWD-01','CROWD-02']),
 starts:T('5つのスタート地点','5 start points'),
 dangerLegend:T('DANGER＝シミュレーション上の混雑度\n（人/m²）','DANGER = simulated crowd density\n(people/m²)',[],{sim:true}),
});

// HUD (all numbers inside are simulation output).
export const HUD=Object.freeze({
 simTag:T('シミュレーション','SIMULATION',[],{sim:true}),
 level:T('ステージ {n}/5','LEVEL {n}/5'),
 playerStart:T('現在地','PLAYER START'),
 objective:T('目標','OBJECTIVE'),
 timer:T('SIM +{mmss}','SIM +{mmss}',[],{sim:true}),
 danger:T('DANGER','DANGER',[],{sim:true}),
 dangerLevels:Object.freeze({ja:['低','中','高','非常に高い','最大'],en:['LOW','MED','HIGH','VERY HIGH','MAX']}),
 dangerUnit:T('人/m²','p/m²',[],{sim:true}),
 counters:T('移動中 {walking} ・ 到着 {arrived}','walking {walking} · arrived {arrived}',[],{sim:true}),
 // walk to another station / off-sim taxi stand: walkers only reach the edge of the simulated area.
 countersEdge:T('移動中 {walking} ・ シミュ範囲の端 {arrived}','walking {walking} · at sim edge {arrived}',[],{sim:true}),
 dangerWhere:T('プレイヤーの周囲6m','around the player (6 m)',[],{sim:true}),
 exampleChip:T('ルート例','EXAMPLE ROUTE'),
 branchChip:T('ルート {k}','ROUTE {k}'),
 offSim:T('ここから先はシミュ範囲外','outside the sim area from here'),
});

// Outcome stamps (sim result from the fixed rule; never a prediction).
export const STAMPS=Object.freeze({
 escaped:T('脱出成功！','ESCAPED!',[],{sim:true}),
 caught:T('人混みに捕まった…','CAUGHT IN THE CROWD',[],{sim:true}),
 tag:T('シミュレーション','SIMULATION',[],{sim:true}),
 reasonDense:T('SIM：高密度に {t} 滞在','sim: {t} in ≥3 p/m²',[],{sim:true}),
 reasonTimeout:T('SIM：時間切れ','sim: time out',[],{sim:true}),
});
// Result beat of a level (same start, every route; numbers = the first walker of each route, simulation).
export const RESULT=Object.freeze({
 head:T('VS（シミュレーション）','VS (SIMULATION)',[],{sim:true}),
 dense:T('≥3人/m²に{t}秒','{t} s at ≥3 p/m²',[],{sim:true}),
 edge:T('シミュ範囲の端','sim edge',[],{sim:true}),
 slower:T('同じ場所から：{b}は{a}の約{r}倍の時間','Same start: {b} took {r}× as long as {a}',[],{sim:true}),
 faster:T('同じ場所から：{b}は{a}より速かった','Same start: {b} was faster than {a}',[],{sim:true}),
 same:T('同じ場所から：{a}と{b}はほぼ同じ','Same start: {a} and {b} about the same',[],{sim:true}),
});
// 9:16 hook/title band under the map (0-3 s): what the red means, and what the video tests.
export const TEASER=Object.freeze({
 legend:T('赤＝人が密集（3人/m²以上）','RED = packed crowd (3+ people/m²)',[],{sim:true}),
 simTag:T('シミュレーション','SIMULATION',[],{sim:true}),
 routes:T('5つの場所 × 15ルートで検証','5 start points × 15 routes, simulated',[],{sim:true}),
});

// Per-start scenarios. ids follow the brief; specKey is the motion-spec level key.
// Branch label = line + gate/exit (verified names). kind: gate | walk-alt.
const B=(key,kind,line,gate,factIds)=>Object.freeze({key,kind,line,gate,factIds:Object.freeze(factIds),
 label:T(`${line.ja}\n${gate.ja}`,`${line.en}\n${gate.en}`,factIds)});
const L=(ja,en)=>({ja,en});
const OSM=T('（徒歩はOSM地図から概算）','(walk approx., computed from OpenStreetMap)',['ALT-01']);

export const SCENARIOS=Object.freeze([
 Object.freeze({id:'scramble',specKey:'centergai',
  start:T('スクランブル交差点・センター街','Scramble Crossing / Center Gai'),
  objective:T('目標：改札までたどり着け','Objective: reach a ticket gate'),
  branches:Object.freeze([
   B('A','gate',L('半蔵門線・田園都市線','Hanzomon/Den-en-toshi'),L('道玄坂方面改札','Dogenzaka gate (A0–A4)'),['EXIT-09']),
   B('B','gate',L('JR','JR'),L('ハチ公改札','Hachiko gate'),['EXIT-04','EXIT-03']),
   B('C','walk-alt',L('京王井の頭線','Keio Inokashira'),L('神泉駅まで徒歩約10分','walk to Shinsen ~10 min'),['ALT-01']),
  ]),
  example:'A',
  route:T('ルート例：センター街側の\n出入口A0〜A4から地下へ','Example route: go underground\nat exits A0–A4 (Center Gai side)',['EXIT-09']),
  taxi:T('🚕 駅前〜宮益坂下は16時ごろから\n車両通行止め（規制図より）','🚕 No cars Scramble–Miyamasuzaka-shita\nfrom ~16:00 (read from police map)',['MEAS-03','MEAS-04']),
  alt:T('🚶 神泉駅（井の頭線）まで徒歩約10分\n（OSM地図から概算）','🚶 Shinsen (Keio Inokashira): ~10 min walk\n(approx., computed from OpenStreetMap)',['ALT-01']),
  status:T('JRの2026年の改札対策：未発表\n例：2024年はハチ公改札を一部規制','JR 2026 gate plan: not announced\ne.g. 2024: part of Hachiko gate restricted',['MEAS-15'],{notAnnounced:true}),
 }),
 Object.freeze({id:'miyashita',specKey:'miyashita',
  start:T('宮下公園（MIYASHITA PARK）','Miyashita Park'),
  objective:T('目標：改札までたどり着け','Objective: reach a ticket gate'),
  branches:Object.freeze([
   B('A','gate',L('半蔵門線・田園都市線','Hanzomon/Den-en-toshi'),L('B1出口（宮下公園方面）','exit B1 (Miyashita Park)'),['EXIT-09']),
   B('B','gate',L('JR','JR'),L('ハチ公改札（宮益坂口寄り）','Hachiko gate (Miyamasuzaka side)'),['EXIT-04','EXIT-03']),
   B('C','walk-alt',L('千代田線・副都心線','Chiyoda/Fukutoshin'),L('明治神宮前駅まで約15分','walk to Meiji-jingumae ~15 min'),['ALT-03']),
  ]),
  example:'A',
  route:T('ルート例：公園側の\nB1出口から地下へ','Example route: go underground\nat exit B1 by the park',['EXIT-09']),
  taxi:T('🚕 宮益坂下〜駅前 16時ごろ〜通行止め\nのりば例：SAKURAテラス前（赤枠の外）','🚕 No cars Miyamasuzaka-shita–station\nfrom ~16:00. Stand e.g. SAKURA Terrace',['MEAS-03','MEAS-04','TAXI-01','TAXI-07']),
  alt:T('🚶 原宿駅（JR山手線）まで徒歩約16分\n（OSM地図から概算）','🚶 Harajuku (JR Yamanote): ~16 min walk\n(approx., computed from OpenStreetMap)',['ALT-04']),
  status:T('2026年：出入口は混雑で変わる可能性\n各社の具体策は未発表（10/23時点）','2026: entrances may change with crowds\nNo station gate plan published (Oct 23)',['MEAS-12'],{notAnnounced:true}),
 }),
 Object.freeze({id:'hikarie',specKey:'hikarie',
  start:T('ヒカリエ前（明治通り）','Hikarie (Meiji-dori side)'),
  objective:T('目標：改札までたどり着け','Objective: reach a ticket gate'),
  branches:Object.freeze([
   B('A','gate',L('銀座線','Ginza Line'),L('ヒカリエ方面改札','Hikarie gate'),['EXIT-07','EXIT-08']),
   // B/C follow the routes the simulation walks (escape.mjs): East exit taxi stand, walk to Omotesando.
   B('B','taxi',L('タクシー','Taxi'),L('東口のりば（B6出口）','East exit stand (exit B6)'),['TAXI-04']),
   B('C','walk-alt',L('銀座線・半蔵門線・千代田線','Ginza/Hanzomon/Chiyoda'),L('表参道駅まで徒歩約15〜17分','walk to Omotesando ~15–17 min'),['ALT-02']),
  ]),
  example:'A',
  route:T('ルート例：ヒカリエ直結の\n銀座線ヒカリエ方面改札へ','Example route: Ginza Line Hikarie gate,\nconnected to Shibuya Hikarie',['EXIT-08']),
  taxi:T('🚕 東口のりば（明治通り）が\n今のメイン（運転手ブログ・2026年1月）','🚕 East exit stand on Meiji-dori: "main\nstand today" (driver blog, Jan 2026)',['TAXI-03']),
  alt:T('🚶 表参道駅まで徒歩約15〜17分\n（OSM地図から概算）','🚶 Omotesando: ~15–17 min walk\n(approx., computed from OpenStreetMap)',['ALT-02']),
  status:T('東京メトロの2026年の対策：未発表\n（10/23時点）','Tokyo Metro 2026 plan: not announced\n(as of Oct 23)',[],{notAnnounced:true}),
 }),
 Object.freeze({id:'stream',specKey:'stream',
  start:T('渋谷ストリーム（駅の南側）','Shibuya Stream (south side)'),
  objective:T('目標：改札かタクシー乗り場へ','Objective: a gate or a taxi stand'),
  branches:Object.freeze([
   B('A','gate',L('JR','JR'),L('新南改札（3F）','New South gate (3F)'),['EXIT-05','EXIT-04']),
   // B follows the simulation's taxi branch (escape.mjs; last stretch outside the sim area).
   B('B','taxi',L('タクシー','Taxi'),L('SAKURAテラス前のりば','SAKURA Terrace stand'),['TAXI-01','TAXI-07']),
   B('C','walk-alt',L('東急東横線','Tokyu Toyoko'),L('代官山駅まで徒歩約16分','walk to Daikanyama ~16 min'),['ALT-06']),
  ]),
  example:'A',
  route:T('ルート例：ストリームと\nサクラステージの間の新南改札へ','Example route: JR New South gate,\nbetween Stream and Sakura Stage',['EXIT-05']),
  taxi:T('🚕 SAKURAテラス前のりば（桜丘町）\n規制図では赤枠の外','🚕 SAKURA Terrace taxi stand (Sakuragaoka):\noutside the red zone on the police map',['TAXI-01','TAXI-07']),
  alt:T('🚶 恵比寿駅まで徒歩約20分\n（OSM地図から概算）','🚶 Ebisu (JR/Hibiya): ~20 min walk\n(approx., computed from OpenStreetMap)',['ALT-05']),
  status:T('東急の2026年の対策：未発表\nC1〜C3の通路は6〜23時のみ','Tokyu 2026 plan: not announced\nC1–C3 passage is open 6:00–23:00 only',['EXIT-10'],{notAnnounced:true}),
 }),
 Object.freeze({id:'dogenzaka',specKey:'dogenzaka',
  start:T('道玄坂・渋谷マークシティ','Dogenzaka / Mark City'),
  objective:T('目標：改札かタクシー乗り場へ','Objective: a gate or a taxi stand'),
  branches:Object.freeze([
   B('A','gate',L('京王井の頭線','Keio Inokashira'),L('西口（マークシティWEST 1F）','West gate (Mark City WEST 1F)'),['EXIT-11']),
   B('B','gate',L('半蔵門線・田園都市線','Hanzomon/Den-en-toshi'),L('道玄坂方面改札','Dogenzaka gate (A0–A4)'),['EXIT-09']),
   B('C','walk-alt',L('京王井の頭線','Keio Inokashira'),L('神泉駅まで徒歩約10分','walk to Shinsen ~10 min'),['ALT-01']),
  ]),
  example:'A',
  route:T('ルート例：道玄坂から\n井の頭線 西口（WEST 1F）へ','Example route: from Dogenzaka into\nthe Keio West gate (WEST 1F)',['EXIT-11']),
  taxi:T('🚕 道玄坂は赤枠内：検問の場合あり\nSAKURAテラス前は赤枠の外（規制図）','🚕 Dogenzaka is in the red zone: checks\npossible. SAKURA Terrace stand is outside',['MEAS-02','TAXI-07','TAXI-01']),
  alt:T('🚶 池尻大橋駅（田園都市線）まで約23分\n（OSM地図から概算）','🚶 Ikejiri-Ohashi (Den-en-toshi): ~23 min\n(approx., computed from OpenStreetMap)',['ALT-07']),
  status:T('京王の2026年の告知：未発表\n例：2022年 不安を招く仮装での乗車遠慮を依頼','Keio 2026 notice: not announced\ne.g. 2022: please avoid upsetting costumes',['MEAS-18'],{notAnnounced:true}),
 }),
]);
export const SCENARIO_IDS=Object.freeze(SCENARIOS.map(s=>s.id));            // brief order
export const LEVEL_ORDER=Object.freeze(['scramble','miyashita','hikarie','stream','dogenzaka']); // motion-spec clockwise order
export const SPEC_KEY=Object.freeze(Object.fromEntries(SCENARIOS.map(s=>[s.specKey,s.id])));
export const scenario=id=>SCENARIOS.find(s=>s.id===id||s.specKey===id)||null;

// 2026 status card: what is announced vs not (past examples always carry their year).
export const STATUS_2026=Object.freeze({
 announcedHead:T('2026年 発表済み','ANNOUNCED FOR 2026'),
 announced:Object.freeze([
  T('10/30・31 16時ごろから車両通行止め','Car closures Oct 30 & 31 from ~16:00',['MEAS-03','MEAS-05']),
  T('井の頭通り・道玄坂等で検問の場合あり','Checkpoints possible on Inokashira-dori,\nDogenzaka etc.',['MEAS-02']),
  T('ハチ公像は仮囲い（10/30〜11/1）','Hachiko statue fenced off (Oct 30–Nov 1)',['MEAS-06']),
  T('路上飲酒は18時〜翌5時禁止（条例）','Street drinking banned 18:00–05:00',['MEAS-07']),
  T('LUUP・Lime 駅周辺26ポート使用不可','LUUP/Lime: 26 ports near station closed',['MEAS-11']),
  T('出入口は混雑で変わる可能性','Entrances may change with crowding',['MEAS-12']),
 ]),
 notAnnouncedHead:T('未発表（10/23時点）・過去の例','NOT ANNOUNCED (Oct 23) · PAST EXAMPLES'),
 notAnnounced:Object.freeze([
  T('鉄道各社の改札対策：未発表','Station gate plans: not announced',[],{notAnnounced:true}),
  T('例：2024年 JRハチ公改札を一部規制','e.g. 2024: partial JR Hachiko gate limits',['MEAS-15']),
  T('例：2023年 ハチ公口改札を一時閉鎖','e.g. 2023: Hachiko gate closed for a while',['MEAS-16']),
  T('タクシーの公式案内：なし','Official taxi guidance: none',[],{notAnnounced:true}),
  T('例：2025年 通行止めはタクシーも対象','e.g. 2025: the closure included taxis',['MEAS-17']),
 ]),
});

// 32-35.5 s overview, 35.5-38 s question, end card.
export const OVERVIEW=Object.freeze({
 heading:T('全ルート','ALL ROUTES'),
 results:T('結果（シミュレーション）','RESULTS (SIMULATION)',[],{sim:true}),
});
export const QUESTION=Object.freeze({
 line:T('あなたならどこから帰る？🎃','Which way would you go? 🎃'),
 cta:T('コメントで教えて！','Tell us in the comments!'),
});
export const END_CARD=Object.freeze({
 title:TITLE.main, question:QUESTION.line,
 sourcesHead:T('出典','Sources'),
 sim:T('人数・時間・DANGER・判定は\nシミュレーション（予測ではない）\n仮定の人数 {agents}人','Counts, times, DANGER, ESCAPED:\nsimulation (toy model, not a forecast)\nAssumed crowd: {agents}',[],{sim:true}),
 gap:T('約18,000人＝センター街の路上の数（出典）\nシミュの人数＝駅周辺のモデル範囲全体の仮定','≈18,000 = on Center Gai streets (cited)\nSim crowd: assumption for the model area',['CROWD-02']),
 walk:T('徒歩時間：OSM地図から概算（80m/分）','Walk times: computed from OpenStreetMap\n(80 m/min)',['ALT-01']),
 checkOnDay:T('当日は各鉄道会社の案内を確認','Check rail operator notices on the day'),
 parody:T('※ホラー映画・デスゲーム風のパロディです','Parody of horror & death-game movies'),
 data:T('3D：PLATEAU / OpenStreetMap','3D: PLATEAU / OpenStreetMap'),
});
export const FOOTNOTE_COPY=Object.freeze({
 prefix:T('出典：','Sources: '),
 simSuffix:T('人数・時間・DANGERはシミュレーション','counts, times, DANGER = simulation',[],{sim:true}),
});

// ---- helpers ----
const year=d=>d.slice(0,4);
export function sourceKeys(factIds){
 const out=[];
 for(const id of factIds){const f=FACT_SOURCES[id];if(!f)throw new Error('unknown fact id '+id);for(const k of f.src)if(!out.includes(k))out.push(k);}
 return out;
}
// Outlet names (+year, or full date with {date:true}), deduped by name+year, in first-use order.
export function sourceNames(factIds,lang,{date=false}={}){
 const seen=new Set(),out=[];
 for(const k of sourceKeys(factIds)){const s=SOURCES[k];const tag=s.noYear&&!date?s[lang]:`${s[lang]} ${date?s.date:year(s.date)}`;const key=date?tag:`${s[lang]}|${year(s.date)}`;if(!seen.has(key)){seen.add(key);out.push(tag);}}
 return out;
}
export function footnote(factIds,lang,{sim=true}={}){
 const names=sourceNames(factIds,lang);
 const parts=[];if(names.length)parts.push(FOOTNOTE_COPY.prefix[lang]+names.join(lang==='ja'?' ・ ':' · '));
 if(sim)parts.push(FOOTNOTE_COPY.simSuffix[lang]);
 return parts.join(lang==='ja'?' ／ ':' / ');
}
function collect(o,acc=[]){if(o&&typeof o==='object'){if(Array.isArray(o.factIds))acc.push(...o.factIds);for(const v of Object.values(o))if(v&&typeof v==='object'&&v!==o.factIds)collect(v,acc);}return acc;}
export const scenarioFactIds=id=>[...new Set(collect(scenario(id)))];
export const SCENARIO_FOOTNOTES=Object.freeze(Object.fromEntries(SCENARIOS.map(s=>[s.id,Object.freeze({
 ja:footnote(scenarioFactIds(s.id),'ja'),en:footnote(scenarioFactIds(s.id),'en'),factIds:Object.freeze(scenarioFactIds(s.id))})])));
export const ALL_FACT_IDS=Object.freeze([...new Set(collect({HOOK,TITLE,BROADCAST,RULES,GAME,TAGLINES,GAME_OVER,MISSION,HUD,STAMPS,RESULT,TEASER,SCENARIOS,STATUS_2026,OVERVIEW,QUESTION,END_CARD}))]);
// End card: every outlet used anywhere in the video, with its date.
export const END_SOURCES=Object.freeze({ja:sourceNames(ALL_FACT_IDS,'ja',{date:true}),en:sourceNames(ALL_FACT_IDS,'en',{date:true})});

// ---- self-check (node web3d/shibuya/escape-copy.mjs, and tests/test_escape_copy.py) ----
export const LIMITS=Object.freeze({ja:22,en:42});
const cc=(...c)=>String.fromCharCode(...c);// banned names are built from char codes so they never appear in the source
const FORBID=[new RegExp(cc(101,110,97,98,108,101)+'\\s*'+cc(120),'i'),new RegExp(cc(0x30AB,0x30F3,0x30EA,0x30FC)),new RegExp(cc(99,97,110)+'-?'+cc(108,121),'i'),/zombie/i,/ゾンビ/,/idiot/i,/バカ/,/monster/i,/モンスター/];
export const jaWidth=s=>[...s].reduce((w,c)=>w+(c.codePointAt(0)<0x100?0.5:1),0);
export const enWidth=s=>[...s].length;
export function checkCopy(){
 const errs=[],strings=[];
 (function walk(o,path){if(!o||typeof o!=='object')return;
  if(typeof o.ja==='string'&&typeof o.en==='string'){strings.push([path,o]);}
  for(const [k,v] of Object.entries(o))if(typeof v==='object')walk(v,path+'.'+k);})({HOOK,TITLE,HEADER,BROADCAST,RULES,GAME,TAGLINES,GAME_OVER,MISSION,HUD,STAMPS,RESULT,TEASER,SCENARIOS,STATUS_2026,OVERVIEW,QUESTION,END_CARD,FOOTNOTE_COPY},'');
 for(const [p,o] of strings){
  if(p.endsWith('.line')&&p.includes('branches'))continue;
  for(const l of o.ja.split('\n'))if(jaWidth(l)>LIMITS.ja)errs.push(`${p} ja too long (${jaWidth(l)}): ${l}`);
  for(const l of o.en.split('\n'))if(enWidth(l)>LIMITS.en)errs.push(`${p} en too long (${enWidth(l)}): ${l}`);
  for(const re of FORBID)if(re.test(o.ja)||re.test(o.en))errs.push(`${p} forbidden word ${re}`);
  for(const id of o.factIds||[]){if(!FACT_SOURCES[id])errs.push(`${p} unknown fact ${id}`);if(DROPPED_FACTS.includes(id))errs.push(`${p} dropped fact ${id}`);}
  if(/おすすめ|最適|best/i.test(o.ja+o.en))errs.push(`${p} claims a best route without a source`);
  if(/20(1\d|2[0-5])年|e\.g\. 20/.test(o.ja+o.en)&&!(o.factIds||[]).length&&!p.includes('branches'))errs.push(`${p} past-year example without a source`);
 }
 // parody guards: GAME OVER only as the end-of-game title; parody cue present; fictional issuer only.
 for(const [p,o] of strings)if(/GAME\s*OVER|ゲームオーバー/i.test(o.ja+o.en)&&!p.startsWith('.GAME_OVER'))errs.push(`${p} GAME OVER outside GAME_OVER`);
 if(!/パロディ/.test(BROADCAST.parody.ja)||!/PARODY/.test(BROADCAST.parody.en))errs.push('BROADCAST parody cue missing');
 if(!/架空/.test(BROADCAST.issuer.ja)||!/fictional/i.test(BROADCAST.issuer.en))errs.push('BROADCAST issuer must be marked fictional');
 const REAL=/警視庁|警察署|政府|内閣|消防|気象庁|NHK|J-?ALERT|Jアラート|渋谷区役所|police dep|government|cabinet|emergency alert/i;
 for(const [p,o] of strings)if(p.startsWith('.BROADCAST')&&REAL.test(o.ja+o.en))errs.push(`${p} names a real agency/alert service`);
 if(RULES.items.length<3||RULES.items.length>4)errs.push('RULES must have 3-4 items');
 for(const s of SCENARIOS){if(!s.branches.some(b=>b.key===s.example))errs.push(`${s.id} example branch missing`);
  if(!SCENARIO_FOOTNOTES[s.id].ja.startsWith('出典：'))errs.push(`${s.id} footnote empty`);}
 return errs;
}
if(typeof process!=='undefined'&&process.argv?.[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){
 const e=checkCopy();console.log(e.length?e.join('\n'):'escape-copy ok');
 if(process.argv.includes('--dump'))console.log(JSON.stringify({SCENARIO_FOOTNOTES,END_SOURCES},null,1));
 process.exitCode=e.length?1:0;
}
