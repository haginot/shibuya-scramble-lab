// Public figures behind the Halloween video's headline number and travel notes.
// Only figures read on the cited pages (research 2026-10-23, see docs/HALLOWEEN.md).
// They are NOT simulation output: the solver's own population (HALLOWEEN.agents,
// DISPERSAL.inside+plaza) is a separate, explicitly labelled sim assumption.
export const PAST=Object.freeze([
 // Shibuya City street count (Center-gai / Dogenzaka at the busiest hour), as reported.
 {year:2019,people:40000,what:'peak, Center-gai (ward count, pre-COVID)',outlet:'Shibuya Keizai Shimbun',date:'2025-10-02',url:'https://www.shibukei.com/headline/19456/'},
 {year:2023,people:15000,what:'22:00, Center-gai and Dogenzaka (ward count)',outlet:'Tokyo Shimbun',date:'2024-11-01',url:'https://www.tokyo-np.co.jp/article/364102'},
 {year:2024,people:18000,what:'about 22:00 peak, Center-gai and Dogenzaka (ward count)',outlet:'Tokyo Shimbun',date:'2024-11-01',url:'https://www.tokyo-np.co.jp/article/364102'},
 {year:2025,people:4200,what:'about 21:00 peak, Center-gai (ward count; rainy Friday)',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
]);
// 2026: the ward expects about the same as 2024 (≈18,000 at the ~22:00 peak). An estimate, not a count.
export const CROWD_2026=Object.freeze({estimate:18000,low:4200,high:18000,
 basis:'Shibuya City expects about the same as 2024 (≈18,000 on the street at the ~22:00 peak)',
 outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'});
// Ward measures useful to visitors (as reported).
export const FACTS=Object.freeze([
 {en:'Street drinking banned 18:00–05:00 (ward ordinance, since Oct 2024)',ja:'路上飲酒は18時〜翌5時禁止（条例、2024年10月〜）',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
 {en:'Hachiko statue fenced off Oct 30 – Nov 1',ja:'ハチ公像は10/30〜11/1 囲いで閉鎖',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
 {en:'About 185 private security guards over Oct 30–31',ja:'民間警備員 延べ約185人（10/30・31）',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
]);
// Short on-screen footnote (end card and hook).
export const FOOTNOTE={
 shortEn:'*Shibuya City expects about the same as 2024 (≈18,000 at ~22:00): Shibuya Keizai Shimbun 2026-09-30 · 2024 count: Tokyo Shimbun 2024-11-01. Not a sim output.',
 shortJa:'*渋谷区の見込み：2024年並み（22時頃 約1万8千人）シブヤ経済新聞 2026-09-30 ・ 2024年の計測：東京新聞 2024-11-01 ・ シミュレーションの出力ではない',
 en:'Est. ≈18,000 = Shibuya City expectation for 2026, as reported by Shibuya Keizai Shimbun (2026-09-30). Past ward counts: 2019 ≈40,000 (Shibukei 2025-10-02) · 2023 ≈15,000 at 22:00, 2024 ≈18,000 at 22:00 (Tokyo Shimbun 2024-11-01) · 2025 ≈4,200 at 21:00, rain (Shibukei 2026-09-30). Simulated populations are sim assumptions.',
 ja:'推計 約1万8千人＝渋谷区の2026年の見込み（シブヤ経済新聞 2026-09-30）。区の過去の計測：2019年 約4万人（シブ経 2025-10-02）・2023年 22時 約1.5万人、2024年 22時 約1.8万人（東京新聞 2024-11-01）・2025年 21時 約4,200人・雨（シブ経 2026-09-30）。シミュレーションの人数はシミュレーション上の仮定。',
};

// v4 "Escape Shibuya" sources. Keys are referenced by FACT_SOURCES; fact ids are the ids in
// research-practical.md (logs, 2026-10-23). On screen only the outlet NAME (+year/date) is shown;
// URLs are listed in docs/HALLOWEEN.md. MEAS-14 (Toei Bus detours) was dropped as unverifiable.
const YAHOO='https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b';
const WIKI='https://ja.wikipedia.org/wiki/渋谷駅';
const OSRM='https://routing.openstreetmap.de/';
export const SOURCES=Object.freeze({
 shibukei2026:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2026-09-30',url:YAHOO},
 shibukei2025:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2025-10-02',url:'https://www.shibukei.com/headline/19456/'},
 shibukei2024:{ja:'シブヤ経済新聞',en:'Shibuya Keizai Shimbun',date:'2024-10-30',url:'https://www.shibukei.com/headline/18753/'},
 police:{ja:'警視庁渋谷警察署',en:'Shibuya Police (MPD)',date:'2026-10-05',url:'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/shokai/ichiran/kankatsu/shibuya/about_ps/kisei.html'},
 policeMap:{ja:'警視庁渋谷警察署',en:'Shibuya Police (MPD)',date:'2026-10-05',url:'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/shokai/ichiran/kankatsu/shibuya/about_ps/kisei.files/oshirase.pdf'},
 wardNews:{ja:'しぶや区ニュース',en:'Shibuya City News',date:'2026-10-15',url:'https://www.city.shibuya.tokyo.jp/contents/koho-news/1621/20261015_bousai.html'},
 bij:{ja:'Business Insider Japan',en:'Business Insider Japan',date:'2026-10-01',url:'https://www.businessinsider.jp/article/2610-shibuya-halloween-trash-measures-2026/'},
 fashionsnap:{ja:'FASHIONSNAP',en:'FASHIONSNAP',date:'2023-10-31',url:'https://www.fashionsnap.com/article/2023-10-31/shibuya-halloween'},
 jafmate:{ja:'JAF Mate',en:'JAF Mate',date:'2025-10-28',url:'https://jafmate.jp/car/traffic_topics_20251028_1198272.html'},
 norimono2019:{ja:'乗りものニュース',en:'Norimono News',date:'2019-08-30',url:'https://trafficnews.jp/post/89192'},
 norimono2020:{ja:'乗りものニュース',en:'Norimono News',date:'2020-01-03',url:'https://trafficnews.jp/post/92628'},
 norimono2022:{ja:'乗りものニュース',en:'Norimono News',date:'2022-10-23',url:'https://trafficnews.jp/post/122357'},
 norimono2024:{ja:'乗りものニュース',en:'Norimono News',date:'2024-07-18',url:'https://trafficnews.jp/post/133833'},
 impressA:{ja:'Impress Watch',en:'Impress Watch',date:'2019-08-28',url:'https://www.watch.impress.co.jp/docs/news/1203913.html'},
 impressB:{ja:'Impress Watch',en:'Impress Watch',date:'2019-12-27',url:'https://www.watch.impress.co.jp/docs/news/1227145.html'},
 toyokeizai:{ja:'東洋経済オンライン',en:'Toyo Keizai Online',date:'2025-01-29',url:'https://toyokeizai.net/articles/-/854907'},
 matcha:{ja:'MATCHA',en:'MATCHA',date:'2025-07-25',url:'https://matcha-jp.com/jp/1166'},
 metro:{ja:'東京メトロ',en:'Tokyo Metro',date:'2020-03-18',url:'https://www.tokyometro.jp/news/2020/205981.html'},
 wikipedia:{ja:'Wikipedia「渋谷駅」',en:'Wikipedia (ja) "Shibuya Station"',date:'2026-10-23',url:WIKI,noYear:true,note:'accessed 2026-10-23'},
 osm:{ja:'OSM（徒歩概算）',en:'OSM (walk est.)',date:'2026-10-23',url:OSRM,noYear:true,note:'computed 2026-10-23, 80 m/min'},
 ttc:{ja:'東京タクシーセンター',en:'Tokyo Taxi Center',date:'2025-03-12',url:'https://www.tokyo-tc.or.jp/news/driver/000442/'},
 shibukichi:{ja:'シブきち',en:'Shibukichi',date:'2025-03-27',url:'https://shibukichi.net/2025/03/27/shibuya_nishiguchi_taxi/'},
 taxieye:{ja:'taxieye.net（運転手ブログ）',en:'taxieye.net (driver blog)',date:'2026-01-23',url:'https://taxieye.net/post-455/'},
});
// research-practical.md id -> source keys + fact-check verdict ('needs-label' = show its label/year).
export const FACT_SOURCES=Object.freeze({
 'CROWD-01':{src:['shibukei2026'],v:'verified'},
 'CROWD-02':{src:['shibukei2025'],v:'verified'},
 'MEAS-01':{src:['police'],v:'verified'},
 'MEAS-02':{src:['policeMap'],v:'verified'},
 'MEAS-03':{src:['policeMap'],v:'verified'},
 'MEAS-04':{src:['policeMap'],v:'needs-label'},
 'MEAS-05':{src:['wardNews'],v:'verified'},
 'MEAS-06':{src:['shibukei2026'],v:'verified'},
 'MEAS-07':{src:['shibukei2026'],v:'verified'},
 'MEAS-08':{src:['shibukei2026'],v:'verified'},
 'MEAS-09':{src:['shibukei2026'],v:'verified'},
 'MEAS-10':{src:['shibukei2026'],v:'verified'},
 'MEAS-11':{src:['shibukei2026'],v:'verified'},
 'MEAS-12':{src:['shibukei2026'],v:'needs-label'},
 'MEAS-13':{src:['bij'],v:'needs-label'},
 'MEAS-15':{src:['shibukei2024'],v:'verified'},
 'MEAS-16':{src:['fashionsnap'],v:'needs-label'},
 'MEAS-17':{src:['jafmate'],v:'needs-label'},
 'MEAS-18':{src:['norimono2022'],v:'verified'},
 'EXIT-01':{src:['impressA'],v:'verified'},
 'EXIT-02':{src:['norimono2019'],v:'verified'},
 'EXIT-03':{src:['toyokeizai'],v:'verified'},
 'EXIT-04':{src:['matcha'],v:'verified'},
 'EXIT-05':{src:['norimono2024'],v:'verified'},
 'EXIT-06':{src:['norimono2020'],v:'verified'},
 'EXIT-07':{src:['impressB'],v:'needs-label'},
 'EXIT-08':{src:['metro'],v:'verified'},
 'EXIT-09':{src:['wikipedia'],v:'verified'},
 'EXIT-10':{src:['wikipedia'],v:'verified'},
 'EXIT-11':{src:['wikipedia'],v:'verified'},
 'ALT-01':{src:['osm'],v:'verified'},
 'ALT-02':{src:['osm'],v:'needs-label'},
 'ALT-03':{src:['osm'],v:'verified'},
 'ALT-04':{src:['osm'],v:'verified'},
 'ALT-05':{src:['osm'],v:'verified'},
 'ALT-06':{src:['osm'],v:'verified'},
 'ALT-07':{src:['osm'],v:'verified'},
 'ALT-08':{src:['osm'],v:'verified'},
 'TAXI-01':{src:['ttc'],v:'verified'},
 'TAXI-02':{src:['shibukichi'],v:'verified'},
 'TAXI-03':{src:['taxieye'],v:'needs-label'},
 'TAXI-04':{src:['wikipedia'],v:'verified'},
 'TAXI-05':{src:['matcha'],v:'needs-label'},
 'TAXI-06':{src:['jafmate','policeMap'],v:'needs-label'},
 'TAXI-07':{src:['policeMap','ttc'],v:'verified'},
});
export const DROPPED_FACTS=Object.freeze(['MEAS-14']);
