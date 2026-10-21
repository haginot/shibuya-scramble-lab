# 動画投稿の説明欄 / Video description

## 日本語

Shibuya Scramble Lab — 仮の需要や販促条件を変え、混雑の解消と来訪状態の変化を観察する実験場。
公開統計の規模・時間帯を参考にしたトイモデル・予測ではありません。横断量・行動は未較正。3,000人は任意のデモ目標です。販促・売上・費用係数は仮置きです。
本編30秒はシミュレーション時間×8、末尾12秒はクレジット。表示個体数20,000は実測人口ではありません。

建物：国土交通省 Project PLATEAU・渋谷区2023 CityGMLを足元形状＋高さへ加工。CC BY 4.0。
https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023
https://creativecommons.org/licenses/by/4.0/

道路・鉄道・店舗・派生車両軌跡：© OpenStreetMap contributors、ODbL 1.0。
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

車両軌跡の生成：Eclipse SUMO 1.28.0（実信号・実測車両需要の再現ではありません）。
https://eclipse.dev/sumo/

加工データとNOTICE：配布アプリの `web3d/data/`。リポジトリの同じパスにも収録しています。
https://github.com/haginot/asagaya-town-sim/tree/shibuya/web3d/data
https://github.com/haginot/asagaya-town-sim/blob/shibuya/NOTICE
`shibuya_plateau.json` はCC BY 4.0、`shibuya_osm.json`・`shibuya_traffic.json` はODbL 1.0。
販促用 `buildings_shibuya.json` の `buildings` はCC BY 4.0、`rails` はODbL 1.0。

制作：Codex CLIが実装と回帰テスト作成を担当し、人がレビュー・検証。実行時にLLMは使用しません。

## English

Shibuya Scramble Lab is an experimental scene for changing hypothetical demand and promotion settings and observing crowd clearance and visit-state changes.
Toy model scaled to public ridership stats — not a prediction. Crossing volumes and behaviour remain uncalibrated. The 3,000-person target is arbitrary. Promotion, sales and cost coefficients are placeholders.
The 30-second scene runs at simulation time ×8, followed by 12 seconds of credits. The 20,000 agents are a demo population, not an observed census.

Buildings: MLIT Project PLATEAU / Shibuya City 2023 CityGML, modified to ground footprints and heights. CC BY 4.0.
https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023
https://creativecommons.org/licenses/by/4.0/

Roads, railways, shops and derived vehicle tracks: © OpenStreetMap contributors, ODbL 1.0.
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

Vehicle trajectories generated with Eclipse SUMO 1.28.0 using assumed signals and demand.
https://eclipse.dev/sumo/

Derived databases and attribution accompany the exported application in `web3d/data/` and the repository:
https://github.com/haginot/asagaya-town-sim/tree/shibuya/web3d/data
https://github.com/haginot/asagaya-town-sim/blob/shibuya/NOTICE
`shibuya_plateau.json`: CC BY 4.0. `shibuya_osm.json` and `shibuya_traffic.json`: ODbL 1.0.
The mixed promo adapter `buildings_shibuya.json` retains CC BY 4.0 for `buildings` and ODbL 1.0 for `rails`.

Codex CLI implements the app and regression tests; people review and verify the work. Runtime agents do not call an LLM.

投稿時には上記のデータ・NOTICEリンクを、実際に配布するrevisionに合わせてください。
When posting, use the data and NOTICE links for the revision actually distributed.
