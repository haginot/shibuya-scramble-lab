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
 {en:'Street drinking banned 18:00–05:00 all year (since Oct 2024)',ja:'路上飲酒は通年18時〜翌5時禁止（2024年10月〜）',outlet:'Tokyo Shimbun',date:'2024-11-01',url:'https://www.tokyo-np.co.jp/article/364102'},
 {en:'Hachiko statue fenced off Oct 30 – Nov 1',ja:'ハチ公像は10/30〜11/1 囲いで閉鎖',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
 {en:'Oct 30–31, 19:00–05:00: about 185 guards and 70 ward staff on duty',ja:'10/30・31の19時〜翌5時、警備員約185人・区職員約70人',outlet:'Shibuya Keizai Shimbun (Yahoo! News)',date:'2026-09-30',url:'https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b'},
]);
// Short on-screen footnote (end card and hook).
export const FOOTNOTE={
 en:'Est. ≈18,000 = Shibuya City expectation for 2026, as reported by Shibuya Keizai Shimbun (2026-09-30). Past ward counts: 2019 ≈40,000 (Shibukei 2025-10-02) · 2023 ≈15,000 at 22:00, 2024 ≈18,000 at 22:00 (Tokyo Shimbun 2024-11-01) · 2025 ≈4,200 at 21:00, rain (Shibukei 2026-09-30). Simulated populations are sim assumptions.',
 ja:'推計 約1万8千人＝渋谷区の2026年の見込み（シブヤ経済新聞 2026-09-30）。区の過去の計測：2019年 約4万人（シブ経 2025-10-02）・2023年 22時 約1.5万人、2024年 22時 約1.8万人（東京新聞 2024-11-01）・2025年 21時 約4,200人・雨（シブ経 2026-09-30）。シミュレーションの人数はシミュレーション上の仮定。',
};
