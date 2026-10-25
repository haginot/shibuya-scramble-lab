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
//              sayEn?:[[alt…],…] same for the en text, na?:true (an "unannounced / no info" status: no outlet)}
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
 livedoor:{ja:'ライブドアニュース',en:'livedoor News',date:'2023-10-30',url:'https://news.livedoor.com/article/detail/25262788/'},
 tokyuMap:{ja:'東急電鉄 構内図',en:'Tokyu station map',date:'2026-08-21',url:TOKYU_MAP},
 keioMap:{ja:'京王電鉄 構内マップ',en:'Keio station map',date:'2026-09-30',url:'https://www.keio.co.jp/train/station/station_map/pdf/in01_shibuya.pdf'},
 osmWalk:{osm:true,ja:'OSM（徒歩概算）',en:'OSM (walk est.)',date:'2026-10-25',url:OSRM,noYear:true,note:'OSRM foot on OpenStreetMap (ODbL), computed 2026-10-25, 80 m/min'},
 osmMap:{osm:true,ja:'OpenStreetMap',en:'OpenStreetMap',date:'2026-10-25',url:'https://www.openstreetmap.org/node/11393698165',noYear:true,note:'© OpenStreetMap contributors (ODbL)'},
});

const F=(src,v='verified',extra={})=>Object.freeze({src:Object.freeze(src),v,...extra});
const LAST=k=>F([k],'verified',{say:[['土休日']]});
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
 'JR-LAST-01':LAST('jrTtShibuya'),'JR-LAST-02':LAST('jrTtShibuya'),'JR-LAST-03':LAST('jrTtShibuya'),
 'JR-LAST-04':LAST('jrTtShibuya'),'JR-LAST-05':LAST('jrTtShibuya'),'JR-LAST-06':LAST('jrTtShibuya'),
 'JR-LAST-07':LAST('jrTtHarajuku'),'JR-LAST-08':LAST('jrTtHarajuku'),
 'JR-LAST-09':LAST('jrTtYoyogi'),'JR-LAST-10':LAST('jrTtYoyogi'),'JR-LAST-11':LAST('jrTtYoyogi'),'JR-LAST-12':LAST('jrTtYoyogi'),
 'JR-LAST-13':LAST('jrTtEbisu'),'JR-LAST-14':LAST('jrTtEbisu'),'JR-LAST-15':LAST('jrTtEbisu'),'JR-LAST-16':LAST('jrTtEbisu'),
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
});
// Never on screen (fact-check verdict 'dropped'); MEAS-14 was dropped in v4.
export const DROPPED=Object.freeze(['TAXI-02','TOI-OSM-01','NA-LAST-OTHER','MEAS-14']);
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
