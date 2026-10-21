# 渋谷スクランブル交差点 — Shibuya Scramble Lab

[English](README.en.md) · 日本語 · [デモ入口（公開後）](https://haginot.github.io/asagaya-town-sim/)

**公開統計の規模・時間帯を参考にしたトイモデル・予測ではない / Toy model scaled to public ridership stats — not a prediction**

仮の需要や販促条件を変え、混雑の解消と来訪状態の変化を観察する実験場です。**横断量・行動は未較正**です。

渋谷の交差点、ハチ公前、山手線・銀座線の降車の波を、既定20,000体の個別エージェントで動かします。一人ずつ位置・速度・乱数と「認知→意向→来訪」の状態を持ちます。近傍グリッドを使うsocial-force、Web Worker、GPUビルボード・車両のthree.js InstancedMeshで計算・描画します。流体モデルや動画の点群再生ではありません。渋谷の実行時にLLM・外部APIは使いません。

建物はPLATEAU渋谷区の1,050棟の足元形状＋高さ、道路・鉄道・店舗の地物はOSMです。単位はm、人物は約1.7m。車両はSUMO＋OSMで生成した軌跡。LOD2の屋根・テクスチャ、地形、列車ダイヤ、信号時間、実際のOD、販促効果は再現・実測較正していません。

[動画を見る（別添MP4・42秒）](docs/media/index.html) · [真上の横断](docs/media/crossing.webp) · [14日販促比較の結果](docs/media/promo.webp) · [ブラウザで試す](https://haginot.github.io/asagaya-town-sim/) · [ローカル実行](#実行)

![真上からの一斉横断](docs/media/crossing.webp)

制作にはCodex CLIを使用し、シミュレーション・画面・録画処理の実装と回帰テスト作成を担当させました。人がレビューし、統計と仮定の表示、ライセンス、車両と歩行者の待機判定を検証する分担です。実行時の個体行動は数値ルールで決まります。

## 実行

Python 3.9以上、実行時Python依存なし。同梱three.js・JSONを使い、3Dはネット接続なしで動きます。初回のパッケージ導入・データ再取得にはネット接続が必要です。

```bash
uv run asagaya-town-sim serve --no-llm --no-open
# http://127.0.0.1:8765/ → web3d/shibuya/
uv run asagaya-town-sim build --area shibuya --no-llm -o out
uv run asagaya-town-sim demo --area shibuya --json --no-llm
uv run asagaya-town-sim serve --area shibuya --agents 30000 --normal-demand --hour 8 --no-open
```

`--area shibuya` が通常CLI・販促CLI・Pagesの新しい既定。`--agents` は0〜60,000、`--seed` は個体の乱数、`--hour` は固定需要時刻（0以上24未満）。既定は15時・任意のデモ目標シナリオ。`demo --json` は設定と要求人数を出力し、実際の歩行・横断完了はブラウザで計算します。表示用の人数を通行実測人数と解釈しないでください。

取得可能な `shibuya` revisionでは、次のコマンドで実行できます。地図データはwheelに同梱され、各データの利用条件はNOTICEに記載しています。

```bash
uvx --from 'git+https://github.com/haginot/asagaya-town-sim.git@shibuya' asagaya-town-sim serve --area shibuya --no-llm --no-open
uvx --from 'git+https://github.com/haginot/asagaya-town-sim.git@shibuya' asagaya-town-sim promo demo --area shibuya --serve --no-open
```

## 画面の読み方

真上・交差点・ハチ公カメラを切り替えられます。需要は任意のデモ目標3,000人・駅統計スケール・朝8時。上段の「今期の出発」は割り当てた人数、「横断完了」は反対側へ到達した人数です。高密度時は歩行者が渡り切るまで共有信号時計を止め、SUMO車両を待たせます。2万体は周辺歩行者・待機者・降車の波を含み、全員が毎フェーズ横断するわけではありません。

画面下段の白・青・黄・橙は個体ごとの未認知・認知・意向・来訪です。販促スイッチはその場で接触確率を変える探索用で、因果効果の推定ではありません。ハチ公像は自作の象徴的形状。列車の到着間隔・降車数・出口配分は仮定で、波は既存エージェントを出口へ移すため総数を増やしません。

`?record=1&cam=top` は録画用の手動刻み。通常モードは実時間で進みます。`window.__shibuyaState` に人数・FPS・シミュレーション時間・描画数・ファネル・信号状態を公開します。録画の30fpsと実時間FPSは別の指標です。[性能測定](docs/PERFORMANCE.md)。

## 公開統計と仮定

2024年度の1日平均: [JR東日本](https://www.jreast.co.jp/press/2025/20250912_ho03.pdf) 324,414 **乗車**、[銀座線](https://www.tokyometro.jp/corporate/enterprise/passenger_rail/transportation/passengers/2024.html) 191,505乗降、[東急](https://www.tokyu.co.jp/railway/company/business/passengers/2024/) 東横線414,186・田園都市線604,246乗降、[京王](https://www.keio.co.jp/company/corporate/corporate_manual/number-of-passengers.html) 286,940乗降。

JRを2倍した延べ駅イベント規模は2,145,705。乗換等が重なるためユニーク人数ではありません。街頭捕捉率12%を仮定し257,484.6トリップ/日の参照量へ換算します。[渋谷区の公開資料](https://files.city.shibuya.tokyo.jp/assets/12995aba8b194961be709ba879857f70/6b2badcb77454bd8b6ccaeaffdd90317/assets_com_000047960.pdf)の「7時頃増加・14〜16時ピーク・19時以降減少」という特徴に合わせた近似形状を正規化すると、15時は約789人/150秒フェーズです。時間別横断実測値への定量フィットではありません。

3,000人は任意のデモ目標シナリオ（通常の3.803倍）で、現在の公的実測値とは主張しません。通常日の参照総量と混同しないよう分けています。[CALIBRATION.md](docs/CALIBRATION.md)に全式・各出典URL・未較正の数値・近傍数上限・交通/列車モデルの制約を記載。

## 渋谷の販促比較

```bash
uv run asagaya-town-sim promo demo --serve --no-open --port 8765
uv run asagaya-town-sim promo build --area shibuya -o out-promo
```

`http://127.0.0.1:8765/promo/?area=shibuya`。実店舗地物は地図の背景で、販促対象は交差点近くの**架空カフェ「ひだまり珈琲」**です。OSMの150m圏内111店舗地物（飲食店36・カフェ13等）を参照しますが、完全な店舗センサスではありません。空き店舗を除外し、名称未登録・node/area重複の可能性を残します。

14日比較は既存の400体×人口倍率5・8試行、同じ個体と乱数で施策なし/SNS/クーポン等を比較します。画面の途中経過はseed 0、最終値は試行平均と95%区間。位置は模式的補間で、物理的な2万人シミュレーションとは別の販促実験です。時間曲線・売上・行動・費用係数は仮置き。来訪増が費用回収を保証するものではありません。`--config FILE` でJSON設定を上書きできます。

## 動画・再取得・検証

```bash
bash tools/record_shibuya.sh
# /workspace/demos/shibuya-scramble.mp4
# /workspace/demos/shibuya-scramble/*.png と recording.json
uv run python tools/build_pages.py --out _site
python3 -m http.server --directory _site
```

動画は42秒（本編30秒＋クレジット12秒）・1280×720・30fps、シミュレーション時間は8倍速、最初の3秒は真上、一斉横断。日英字幕の専用帯は数値行と重なりません。録画にはPlaywright Chromium・ffmpegが必要です。WebGLを使えないheadless環境ではDISPLAYまたはXvfbへ切り替えます。出力先は `SHIBUYA_VIDEO` / `SHIBUYA_STILLS` で変更可能。

```bash
uv run python tools/fetch_shibuya.py --cache /tmp/shibuya-source
uv run --with eclipse-sumo --with traci --with sumolib python tools/export_shibuya_traffic.py
uv run python tools/export_shibuya.py
# Node.js 20以上 / Node.js 20+
uv pip install -e . pytest
uv run pytest -q
node web3d/shibuya/verify.mjs
node --experimental-vm-modules web3d/sol/verify.mjs
node --experimental-vm-modules web3d/astra/check.mjs
node --experimental-vm-modules web3d/promo/verify.mjs
uv run python tools/update_readme_tables.py --check
```

発表の5分構成（日英）: [docs/presentation.md](docs/presentation.md)。

## 出典・ライセンス

コード・three.jsはMIT。**建物**は国土交通省 Project PLATEAU・渋谷区2023 CityGML v4を足元形状＋高さへ加工。[データセット](https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023)の指定する[PLATEAU規約](https://www.mlit.go.jp/plateau/site-policy/)でCC BY 4.0による利用許諾を確認して使用しました。**道路・店舗・鉄道と派生車両軌跡**は© OpenStreetMap contributors / ODbL 1.0。2026-10-21取得、bboxとクエリ・チェックサムをJSONに同梱。全範囲1,102店舗地物。加工データを出力サイトにも同梱し、主な元データは別ファイルです。販促用 `buildings_shibuya.json` は混合アダプターで、`buildings` はCC BY 4.0、`rails` はODbL 1.0です。

SUMO 1.28.0は生成時のみ（EPL-2.0）、実際に使用済み。ブラウザは同梱軌跡を再生し、ライブTraCI連成ではありません。鉄道統計は出典付きの事実数値のみで、原ページへの包括的なオープンライセンスは主張しません。動画・静止画にも画面クレジットを保持します。[NOTICE](NOTICE)に全帰属条件。

## 阿佐ケ谷の互換モード（既存のまま）

`uv run asagaya-town-sim serve --area asagaya --no-llm --no-open`。販促は `promo demo --area asagaya`。2D比較は `http://127.0.0.1:8765/2d.html#compare`。阿佐ケ谷はOSM＋国土地理院の地形、架空の行動・経済係数を使う従来モデルであり、今回の改善対象ではありません。高円寺は従来どおり実験的です。

以下の表は**従来の阿佐ケ谷の回帰参照**です。渋谷の較正や成果ではありません。従来の全4施策ROIは平均−3.00%、クーポンのみ126.57%等の仮定結果で、予測値ではありません。

<!-- town-results:start -->
| 案 | 通過（回/日） | 実人数（人/日） | 区画来訪 | 平均滞在（分） | 周辺店舗来訪 | 区画売上 ¥ | 駐輪収入 ¥ | 周辺売上差分 ¥ | 合計（仮定）¥ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 駐輪場 | 555 | 276 | 0 | 0 | 779.7 | 0 | 4,100 | 0 | 4,100 |
| カフェ | 539 | 265.3 | 41.7 | 40.7 | 773.3 | 27,105 | 0 | -5,120 | 21,985 |
| 広場 | 549 | 267.3 | 48 | 26.2 | 785.3 | 0 | 0 | 4,480 | 4,480 |
<!-- town-results:end -->

<!-- promo-results:start -->
| 組合せ | 来訪 | 増分 [95%区間] | 重複来訪 | 割引費 ¥ | チャネル費 ¥ | 総費用 ¥ | 増分利益 ¥ | ROI（チャネル費基準、%）[95%区間] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 214.38 | 0.00 [0.00, 0.00] | 100.0% | 0 | 0 | 0 | 0 | N/A |
| sns_only | 423.75 | 209.38 [167.90, 250.85] | 50.6% | 0 | 60,000 | 60,000 | 62,484 | 104.14 [63.70, 144.58] |
| flyer_only | 338.75 | 124.38 [95.54, 153.21] | 63.3% | 0 | 40,000 | 40,000 | 32,759 | 81.90 [39.73, 124.06] |
| pr_only | 291.25 | 76.88 [-13.71, 167.46] | 73.6% | 0 | 100,000 | 100,000 | -55,028 | -55.03 [-108.02, -2.04] |
| coupon_only | 416.25 | 201.88 [164.75, 239.00] | 51.5% | 50,125 | 30,000 | 80,125 | 37,972 | 126.57 [70.96, 182.19] |
| sns+coupon | 643.12 | 428.75 [366.51, 490.99] | 33.3% | 76,375 | 90,000 | 166,375 | 84,444 | 93.83 [61.60, 126.06] |
| all_four | 740.62 | 526.25 [443.06, 609.44] | 28.9% | 84,750 | 230,000 | 314,750 | -6,894 | -3.00 [-21.11, 15.12] |
<!-- promo-results:end -->
