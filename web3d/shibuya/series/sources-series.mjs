// Sources for the line series 「🧙ハロウィンの渋谷を脱出せよ！🎃」 (pilot: JR編).
// Fact ids are the ids in $LOGS/series/facts-series.json (transit-researcher + fact-checker, 2026-10-25).
// Only facts with verdict 'verified' or 'needs-label' are listed in FACTS; 'dropped' ids are in DROPPED
// and copy-jr.mjs checkCopy() rejects them. This module EXTENDS sources-halloween.mjs: its SOURCES keys
// (matcha, wikipedia, ttc, jafmate, police, policeMap, wardNews, fashionsnap, norimono2024, shibukei2024)
// are reused as is; series-only outlets are added below.
//
// FACTS[id] = {src:[source keys], v:'verified'|'needs-label', osm?:true (computed walk → 「OSMから概算」),
//              say?:[[alt…],…]  every group needs ≥1 alternative in the ja text of a string citing the
//                               fact (or in the string its `labelBy` points to): year labels for past
//                               reports, 「概略」 for approximate positions, 「未発表」 for unannounced 2026,
//              sayEn?:[[alt…],…] same for the en text, na?:true (an "unannounced / no info" status: no outlet),
//              derived?:[fact ids] (computed from other facts, e.g. a difference of two walks)}
// On screen only the outlet NAME (+ year, or date on the end card) is shown; URLs are listed here and in
// facts-series.json.
import {SOURCES as V4_SOURCES} from '../sources-halloween.mjs';

const SK='https://www.shibukei.com/headline/';
const TT='https://timetables.jreast.co.jp/2611/timetable/';
const TOKYU_MAP='https://www.tokyu.co.jp/railway/station_map/pdf/ty01-shibuya_2.pdf';
const OSRM='https://routing.openstreetmap.de/routed-foot';

export const SOURCES=Object.freeze({
 ...V4_SOURCES,
 // series fact-check re-fetched Wikipedia on 2026-10-25 (v4 entry says 10-23)
 wikipedia:{...V4_SOURCES.wikipedia,date:'2026-10-25',note:'accessed 2026-10-25 (tertiary)'},
 shibukei18928:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2025-01-27',url:SK+'18928/'},
 shibukei18905:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2025-01-15',url:SK+'18905/'},
 shibukei20179:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2026-09-30',url:SK+'20179/'},
 shibukei20230:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2026-10-23',url:SK+'20230/'},
 norimono2016:{ja:'乗りものニュース',en:'Norimono News',date:'2016-04-07',url:'https://trafficnews.jp/post/50115'},
 norimono2020b:{ja:'乗りものニュース',en:'Norimono News',date:'2020-08-21',url:'https://trafficnews.jp/post/99390'},
 norimono2023:{ja:'乗りものニュース',en:'Norimono News',date:'2023-10-23',url:'https://trafficnews.jp/post/128856'},
 jrPress2024:{ja:'JR東日本 プレスリリース',en:'JR East press release',date:'2024-04-23',
  url:'https://web.archive.org/web/20240423111726/https://www.jreast.co.jp/press/2024/tokyo/20240423_to03.pdf'},
 // One key per station so the URLs stay traceable; on screen they collapse to one name.
 jrTtShibuya:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0808/0808051.html',noYear:true,
  note:'Sat/holiday pages 0808011/021/031/041/051/061, checked 2026-10-25 (JR時刻表 2026年11月号 data)'},
 jrTtHarajuku:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1256/1256011.html',noYear:true,note:'1256011/021'},
 jrTtYoyogi:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1654/1654011.html',noYear:true,note:'1654011/021/031/041'},
 jrTtEbisu:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0290/0290011.html',noYear:true,note:'0290011/021/051/061'},
 // per-direction Yamanote pages (fixer 2026-10-26, QA finding 9: the inner-loop facts pointed at outer-loop pages);
 // URLs = facts-variants.json JR-LAST-01/02/07/08/09/10/13/14. Same outlet name on screen.
 jrTtShibuyaOut:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0808/0808051.html',noYear:true,note:'渋谷 山手線 外回り 土曜・休日'},
 jrTtShibuyaIn:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0808/0808061.html',noYear:true,note:'渋谷 山手線 内回り 土曜・休日'},
 jrTtHarajukuOut:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1256/1256011.html',noYear:true,note:'原宿 山手線 外回り'},
 jrTtHarajukuIn:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1256/1256021.html',noYear:true,note:'原宿 山手線 内回り'},
 jrTtYoyogiOut:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1654/1654031.html',noYear:true,note:'代々木 山手線 外回り'},
 jrTtYoyogiIn:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt1654/1654041.html',noYear:true,note:'代々木 山手線 内回り'},
 jrTtEbisuOut:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0290/0290051.html',noYear:true,note:'恵比寿 山手線 外回り'},
 jrTtEbisuIn:{ja:'JR東日本 時刻表',en:'JR East timetable',date:'2026-10-25',url:TT+'tt0290/0290061.html',noYear:true,note:'恵比寿 山手線 内回り'},
 livedoor:{ja:'ライブドアニュース',en:'livedoor News',date:'2023-10-30',url:'https://news.livedoor.com/article/detail/25262788/'},
 tokyuMap:{ja:'東急電鉄 構内図',en:'Tokyu station map',date:'2026-08-21',url:TOKYU_MAP},
 keioMap:{ja:'京王電鉄 構内マップ',en:'Keio station map',date:'2026-09-30',url:'https://www.keio.co.jp/train/station/station_map/pdf/in01_shibuya.pdf'},
 osmWalk:{osm:true,ja:'OSM（徒歩概算）',en:'OSM (walk est.)',date:'2026-10-25',url:OSRM,noYear:true,note:'OSRM foot on OpenStreetMap (ODbL), computed 2026-10-25, 80 m/min'},
 osmMap:{osm:true,ja:'OpenStreetMap',en:'OpenStreetMap',date:'2026-10-25',url:'https://www.openstreetmap.org/node/11393698165',noYear:true,note:'© OpenStreetMap contributors (ODbL)'},
 // ---- JR編 variants (CLEAR / GAME OVER), $LOGS/variants/facts-variants.json (researcher, 2026-10-25) ----
 shibukei18757:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2024-10-31',url:SK+'18757/'},
 shibukei17945:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2023-11-01',url:SK+'17945/'},
 ttcNews:{ja:'東京タクシーセンター',en:'Tokyo Taxi Center',date:'2026-10-25',url:'https://www.tokyo-tc.or.jp/news/driver/',noYear:true,
  note:'news list (drivers) p1-8 checked 2026-10-25: no reopening notice for the Shibuya West Exit stand'},
 jrTokyuMetro2025:{ja:'東急・JR東日本・東京メトロ',en:'Tokyu / JR East / Tokyo Metro',date:'2025-09-17',
  url:'https://web.archive.org/web/20251014135937/https://www.jreast.co.jp/info/2025/20250917_ho01.pdf',
  note:'live URL https://www.jreast.co.jp/info/2025/20250917_ho01.pdf returned 403; Wayback copy read with pdftotext'},
 // ---- JR編 v6 (GOODBYE end card, mission, sources card), $LOGS/next/facts-v6.json (fact-check, 2026-10-27) ----
 // The end-card footer names these as 「渋谷区公式X（2026/10/22）・渋谷区・警視庁渋谷警察署」; the MPD traffic page is the
 // existing `police` key (same URL, 更新 2026-10-05). Shibuya City pages are quoted as plain attributed text only.
 shibuyaX20261022:{ja:'渋谷区公式X',en:'Shibuya City (X)',date:'2026-10-22',url:'https://x.com/city_shibuya/status/2113103051389010200',
  note:'@city_shibuya 2026-10-22 12:00 JST 【GOODBYE BAD HALLOWEEN】; text re-checked 2026-10-27 (api.fxtwitter.com mirror of the post)'},
 shibuyaPress20261021:{ja:'渋谷区',en:'Shibuya City',date:'2026-10-21',
  url:'https://www.city.shibuya.tokyo.jp/kusei/hodo/hodo-2026/hodo_20261021.html',note:'報道発表 ハチ公像周辺の仮囲い（10/30 6時〜11/1朝 予定）'},
 shibuyaOrdinance:{ja:'渋谷区',en:'Shibuya City',date:'2025-08-22',
  url:'https://www.city.shibuya.tokyo.jp/kusei/shisaku/jorei-toshin/sbykankyo.html',
  note:'渋谷駅周辺地域の安全で安心な環境の確保に関する条例 (路上飲酒 通年18時〜翌5時禁止, 2024-10-01〜); page updated 2025-08-22, accessed 2026-10-27'},
 shibuyaKirei:{ja:'渋谷区',en:'Shibuya City',date:'2026-10-27',noYear:true,
  url:'https://www.city.shibuya.tokyo.jp/kusei/shisaku/jorei-toshin/1001_jourei_kirei.html',
  note:'きれいなまち渋谷をみんなでつくる条例 (ポイ捨て・路上喫煙禁止, 過料2,000円 2026-06-01〜); accessed 2026-10-27'},
 jrPmoX20260221:{ja:'JR東日本 東京建設PMO（公式X）',en:'JR East Tokyo Construction PMO (X)',date:'2026-02-21',
  url:'https://x.com/JREast_TokyoPMO/status/2025133399657033903',note:'3/1(日)初電よりハチ公口の通路切替とハチ公改札内の山手線ホーム階段の移設'},
 shibukei19736:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2026-02-17',url:SK+'19736/'},
});

const F=(src,v='verified',extra={})=>Object.freeze({src:Object.freeze(src),v,...extra});
const LAST=(k,x={})=>F([k],'verified',{say:[['土休日']],...x});
// sayV (variant configs only; the pilot copy keeps its own labels): regular timetable, 2026 special timetable 未発表
const REG={sayV:[['通常','目安']]};
const WALK=(extra={})=>F(['osmWalk'],'verified',{osm:true,...extra});
const Y2025J=[['2025年1月','2025年']];

export const FACTS=Object.freeze({
 // JR gates / platforms
 'JR-GATE-01':F(['matcha','jrPress2024']),
 'JR-GATE-02':F(['shibukei18928'],'verified',{say:Y2025J,sayEn:[['2025']]}),
 'JR-GATE-03':F(['shibukei18928'],'verified',{say:Y2025J,sayEn:[['2025']]}),
 'JR-GATE-04':F(['shibukei18905']),
 'JR-GATE-05':F(['shibukei18905'],'verified',{say:[['例年'],['2025年']],sayEn:[['usually','every year'],['2025']]}),
 'JR-GATE-06':F(['norimono2020b']),
 'JR-GATE-07':F(['shibukei18905']),
 'JR-GATE-08':F(['jrPress2024'],'verified',{say:[['2024年']],sayEn:[['2024']]}),
 'JR-GATE-09':F(['norimono2024'],'needs-label',{say:[['2024年']],sayEn:[['2024']]}),
 'JR-GATE-10':F(['matcha']),
 'JR-GATE-11':F(['matcha']),
 'JR-GATE-12':F(['matcha']),
 'JR-GATE-13':F(['matcha']),
 'JR-GATE-14':F(['matcha']),// amenities: say 「新南改札付近」 (not 'inside the gate')
 'JR-GATE-15':F(['matcha']),
 'JR-GATE-16':F(['wikipedia']),
 // re-sourced by the fact-checker: the tabiris 2020 text described a planned layout, never cite it.
 'JR-GATE-17':F(['matcha','wikipedia'],'needs-label'),
 'JR-PLAT-01':F(['wikipedia','matcha']),
 'JR-PLAT-02':F(['norimono2023']),
 'JR-PLAT-03':F(['matcha']),
 'JR-LINE-01':F(['norimono2016']),
 'JR-LINE-02':F(['wikipedia'],'needs-label',{say:[['概略','参考']],sayEn:[['approx']]}),
 // last trains: regular Sat/holiday timetable as published, checked 2026-10-25 (10/31/2026 is a Saturday)
 'JR-LAST-01':LAST('jrTtShibuyaOut',REG),'JR-LAST-02':LAST('jrTtShibuyaIn',REG),'JR-LAST-03':LAST('jrTtShibuya'),
 'JR-LAST-04':LAST('jrTtShibuya'),'JR-LAST-05':LAST('jrTtShibuya'),'JR-LAST-06':LAST('jrTtShibuya'),
 'JR-LAST-07':LAST('jrTtHarajukuOut'),'JR-LAST-08':LAST('jrTtHarajukuIn'),
 'JR-LAST-09':LAST('jrTtYoyogiOut'),'JR-LAST-10':LAST('jrTtYoyogiIn'),'JR-LAST-11':LAST('jrTtYoyogi'),'JR-LAST-12':LAST('jrTtYoyogi'),
 'JR-LAST-13':LAST('jrTtEbisuOut'),'JR-LAST-14':LAST('jrTtEbisuIn'),'JR-LAST-15':LAST('jrTtEbisu'),'JR-LAST-16':LAST('jrTtEbisu'),
 // 2026 measures and past examples
 'MEAS-01':F(['police']),
 'MEAS-02':F(['policeMap']),
 'MEAS-03':F(['policeMap']),
 'MEAS-04':F(['policeMap'],'verified',{say:[['概略','規制図']],sayEn:[['approx','police map']]}),
 'MEAS-05':F(['wardNews']),
 'MEAS-06':F(['shibukei20230']),
 'MEAS-07':F(['shibukei20179']),
 'MEAS-09':F(['shibukei20179']),
 'MEAS-11':F(['shibukei20179','shibukei20230']),
 'MEAS-12':F(['shibukei20179']),
 'MEAS-15':F(['shibukei2024'],'verified',{say:[['2024年']],sayEn:[['2024']]}),
 'MEAS-16':F(['fashionsnap','livedoor'],'verified',{say:[['2023年']],sayEn:[['2023']]}),
 'MEAS-20':F(['shibukei20230']),
 'MEAS-23':F(['shibukei20179']),
 'MEAS-24':F(['shibukei20179']),
 'CROWD-01':F(['shibukei20179'],'needs-label',{say:[['2024年','一昨年'],['見込み']],sayEn:[['2024'],['expect']]}),
 'CROWD-03':F(['shibukei20179'],'verified',{say:[['2025年']],sayEn:[['2025']]}),
 // taxi / info
 'TAXI-01':F(['ttc']),
 'TAXI-04':F(['wikipedia']),
 'TAXI-06':F(['jafmate'],'needs-label',{say:[['2025年'],['報道']],sayEn:[['2025'],['report']]}),
 'TAXI-07':F(['policeMap','osmMap'],'verified',{say:[['概略']],sayEn:[['approx']]}),
 'INFO-01':F(['tokyuMap']),
 // station structure (later episodes)
 'STR-TK-01':F(['tokyuMap']),
 'STR-TK-02':F(['tokyuMap']),
 'STR-TK-03':F(['tokyuMap']),
 'STR-WP-01':F(['wikipedia'],'needs-label'),
 'STR-G-01':F(['wikipedia']),
 'STR-IN-01':F(['keioMap']),
 'ALT-STOP-01':F(['wikipedia'],'needs-label',{say:[['急行は通過']],sayEn:[['express']]}),
 // computed walks (OSM + OSRM foot, 80 m/min; crowds, signals and stairs not included)
 'ALT-HARA-H':WALK(),'ALT-HARA-M':WALK(),'ALT-MJM-H':WALK(),'ALT-YOYO-H':WALK(),'ALT-OMOTE-HK':WALK(),
 'ALT-OMOTE-H':WALK(),'ALT-EBI-NS':WALK(),'ALT-EBI-H':WALK(),'ALT-DAIK-NS':WALK(),'ALT-SHIN-NS':WALK(),
 'ALT-IKE-NS':WALK(),'ALT-KOMA-NS':WALK(),
 'JR-A-hachiko':F(['osmWalk'],'needs-label',{osm:true,say:[['概略']],sayEn:[['approx']]}),
 'JR-B-south':WALK(),'JR-C-newsouth-west':WALK(),'JR-C-newsouth-east':WALK(),
 'TAXI-W-NS':WALK({say:[['階']],sayEn:[['stairs','floor']]}),
 'TAXI-W-SCR':WALK(),
 // "not announced / no information" statuses (checked 2026-10-25; nothing to cite)
 'NA-JR-2026':F([],'verified',{na:true,say:[['未発表']],sayEn:[['not announced']]}),
 'NA-METRO-TOKYU-KEIO-2026':F([],'verified',{na:true,say:[['未発表']],sayEn:[['not announced']]}),
 'NA-REST':F([],'verified',{na:true}),
 // ---- JR編 variants (CLEAR / GAME OVER): new ids from $LOGS/variants/facts-variants.json (2026-10-25) ----
 // computed walks (OSRM foot on OSM, 80 m/min; label 「OSMから概算（混雑・信号は含まず）」)
 'GATE-H-S':F(['osmWalk'],'needs-label',{osm:true}),'GATE-H-NS-E':F(['osmWalk'],'needs-label',{osm:true}),
 'GATE-H-NS-W':F(['osmWalk'],'needs-label',{osm:true}),
 // shortest Hachiko → Harajuku walk through the crowd core (1350 m, ~347 m inside the red frame): cite MEAS-04 too
 // whenever the red frame is mentioned (「規制図より概略」)
 'ZONE-D-H-HARA':F(['osmWalk'],'needs-label',{osm:true,say:[['概算']],sayEn:[['OSM']]}),
 // derived: 1572 − 1350 m = ~220 m, 20 − 17 = ~3 min (outlets = those of the facts it is derived from)
 'ZONE-DETOUR-COST':F(['osmWalk'],'needs-label',{osm:true,derived:['ZONE-D-H-HARA','ALT-HARA-H'],say:[['概算']],sayEn:[['OSM']]}),
 // police request to detour via surrounding roads: it is in a VEHICLE notice → always say 「車両」
 'MEAS-25':F(['policeMap'],'needs-label',{say:[['車両']],sayEn:[['vehicle','car']]}),
 // past pedestrian one-way flows (examples only; 2026 lanes not announced → NA-PED-2026)
 'PED-2024':F(['shibukei18757'],'verified',{say:[['2024年']],sayEn:[['2024']]}),
 'PED-2024-PLAN':F(['shibukei2024'],'verified',{say:[['2024年']],sayEn:[['2024']]}),
 'PED-2023':F(['shibukei17945'],'verified',{say:[['2023年']],sayEn:[['2023']]}),
 'NA-PED-2026':F([],'verified',{na:true,say:[['未発表']],sayEn:[['not announced']]}),
 // last trains differ by station (regular Sat/holiday timetable, derived from JR-LAST-01/02/08/10/13)
 'ALT-LAST-CMP':F(['jrTtHarajukuIn','jrTtShibuyaIn','jrTtYoyogiIn','jrTtEbisuOut','jrTtShibuyaOut'],'verified',{say:[['土休日']],sayEn:[['Sat']]}),
 // taxi
 'TAXI-03':F(['shibukichi'],'needs-label',{say:[['2025年']],sayEn:[['2025']]}),
 'TAXI-08':F(['jrTokyuMetro2025'],'verified',{say:[['2025年']],sayEn:[['2025']]}),
 'TAXI-09':F(['ttcNews'],'verified',{say:[['10/25']],sayEn:[['Oct 25']]}),// absence of a notice, not a certainty
 // ---- JR編 v6 (2026-10-27, $LOGS/next/facts-v6.json) ----
 // GOODBYE card block 1: the city's own words (X post), quoted verbatim with 「（渋谷区）」 attribution.
 'END-01':F(['shibuyaX20261022','shibuyaOrdinance','shibuyaKirei'],'verified',{say:[['渋谷区']],sayEn:[['Shibuya City']]}),
 // block 2 rows: Hachiko statue fenced 10/30 early AM (6:00) – 11/1 morning (planned; may change)
 'END-02':F(['shibuyaX20261022','shibuyaPress20261021'],'verified',{say:[['ハチ公']],sayEn:[['Hachiko']]}),
 // traffic restrictions around the station 10/30 evening – 11/1 early AM (MPD Shibuya, updated 2026-10-05)
 'END-03':F(['police'],'verified',{say:[['交通規制']],sayEn:[['traffic']]}),
 // the city's visit request is ONLY about viewing the Hachiko statue: always say ハチ公 (never a general "don't come")
 'END-04':F(['shibuyaX20261022','shibuyaPress20261021'],'verified',{say:[['ハチ公']],sayEn:[['Hachiko']]}),
 // our own message (mission 「渋谷ハロウィンには、近づくな。」, TRUE END, 「いちばんのCLEARは…行かない」): no outlet, never
 // attributed to the city; na → no footnote/sources row.
 'OWN-MSG':F([],'verified',{na:true,own:true}),
 // Hachiko gate: passage switched + Yamanote-platform stairs inside the gate moved (temporary) from 2026-03-01 first train
 'JR-GATE-18':F(['jrPmoX20260221','shibukei19736'],'verified',{say:[['2026年3月','3/1','3月']],sayEn:[['2026','Mar']]}),
});
// Never on screen (fact-check verdict 'dropped'); MEAS-14 was dropped in v4.
// UNOFF-01 (variants research): unofficial "exits toward Hachiko close" claim, no official source.
export const DROPPED=Object.freeze(['TAXI-02','TOI-OSM-01','NA-LAST-OTHER','MEAS-14','UNOFF-01']);
export const SOURCE_NOTE=Object.freeze({
 ja:'出典は各社・報道の公開情報（10/25確認）。徒歩はOSMから概算',
 en:'Sources: public operator and press pages (checked Oct 25). Walks: OSM estimates.',
});

const year=d=>d.slice(0,4);
export const OSM_CREDIT=Object.freeze({ja:'© OpenStreetMap contributors',en:'© OpenStreetMap contributors'});
export function sourceKeys(factIds){
 const out=[];
 for(const id of factIds){const f=FACTS[id];if(!f)throw new Error('unknown fact id '+id);for(const k of f.src)if(!out.includes(k))out.push(k);}
 return out;
}
// Outlet names for footnotes: one entry per outlet, years joined (「シブヤ経済新聞 2026/2025」), OSM-family
// sources collapsed into one ODbL credit; {date:true} (end card): one entry per outlet+date, in first-use order.
export function sourceNames(factIds,lang,{date=false}={}){
 const order=[],by=new Map();
 for(const k of sourceKeys(factIds)){const s=SOURCES[k];if(!s)throw new Error('unknown source key '+k);
  const name=s.osm?OSM_CREDIT[lang]:s[lang];
  if(!by.has(name)){by.set(name,[]);order.push(name);}
  const tag=date?s.date:(s.noYear||s.osm?'':year(s.date));if(tag&&!by.get(name).includes(tag))by.get(name).push(tag);}
 if(date)return order.flatMap(n=>by.get(n).length?by.get(n).map(d=>`${n} ${d}`):[n]);
 return order.map(n=>by.get(n).length?`${n} ${by.get(n).sort().reverse().join('/')}`:n);
}
export const urlsFor=factIds=>[...new Set(sourceKeys(factIds).map(k=>SOURCES[k].url))];
