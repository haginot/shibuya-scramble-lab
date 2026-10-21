# 阿佐ケ谷 AI住民 町シミュレーション（asagaya-town-sim）

[English](README.en.md) · 日本語

**[30秒動画（録画手順・公開待ち）](#30秒動画)** · **[ブラウザで試す（Pages公開後のURL予定）](https://haginot.github.io/asagaya-town-sim/)**

阿佐ケ谷の地図上で、駅前の使い方や架空カフェの販促を、同じ住民・同じ乱数で比較するトイモデルです。
[町の1日](#町の1日)では駐輪場・カフェ・広場、[店舗販促14日間](#店舗販促14日間)では施策なし・SNS広告・クーポンなどを比較します。

AIの役割は3つに分かれます。**開発**ではAIで3Dレンダラーを制作しました（[生成指示](docs/battle/prompt_round1.md)・[成果物](web3d/sol/)）。**町モデル**では任意のLLMが既定8人の予定・架空の口コミを作ります。**販促モデル**の計算は確率ルールです。公開用の静的デモはLLMを使わず生成します。

> **⚠ 仮説検証用のトイモデルです。予測ではありません。**
> 住民・店舗の行動・売上・販促係数は架空・仮置きです。OSM/GSI由来なのは地図形状・地形・地名ラベルのみです。実店舗の業績や住民の行動データは使用していません。
> 営業時間・来店確率などを実測で校正していないため、実際の来店数・売上・通行量の予測には使えません。

## すぐ試す（設定不要）

本体はPython 3.9以上、実行時依存ライブラリなしです。リポジトリ公開後は次で実行できます。

```bash
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo --no-llm
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim promo demo --serve --no-open --port 8765
```

ローカルcheckoutからは `python3 -m pip install .` で導入できます。

```bash
asagaya-town-sim demo --no-llm
asagaya-town-sim serve --no-llm
asagaya-town-sim demo --json --seeds 1 --no-llm
asagaya-town-sim build --no-llm -o out
```

`serve` の3D画面は `http://127.0.0.1:8765/`、2D比較は **`http://127.0.0.1:8765/2d.html#compare`** です。`build` は3D・2D・指標JSON・出典文書を出力します。2DのLeafletと地図タイルにはネット接続が必要です。`--no-llm` の計算と同梱3D資材はオフラインで動きます。

## 町の1日

阿佐ケ谷駅周辺の道路・POIを使い、住民400人・電車来訪者350人・町内勤務者150人の1日（5〜24時）を動かします。
営業時間内の行き先選択、徒歩の最短経路、ついで寄り、乗車・降車をモデル化します。3案は同じ住民・同じ乱数で比較します。

- 3Dの代替案・雨・イベントを選ぶと、形・軌跡・ヒートマップ・数値が対応する同じ計算結果へ切り替わります。軌跡はseed 0、日次指標とヒートマップはシード平均です。
- 通過は半径40m区画内を連続して通る区間を1回とし、道路ノードの分割数による重複を除きます。通った実人数は別指標です。来訪は訪問回数で、同じ人の再訪も含みます。
- 周辺150m店舗はPOI IDで区別し、`cafe / food / bar / grocery / shop` のみを集計します。公園・学校等は周辺売上の対象外です。
- 寄り道・通常訪問とも閉店時刻で退店します。営業時間と徒歩速度（通常78m/分・雨65m/分）は仮定値です。
- `--area koenji` は高円寺版（実験的）。通常CLI出力は指定エリアのみです。両エリアを切り替える場合は同梱静的デモ・Pagesビルドを使います。
- `--residents / --visitors / --commuters / --record` は0以上、`--seeds` は1以上。`--record` は表示軌跡の抽出間隔を指定するための目安で、厳密な上限人数ではありません。
- URL例：`?scenario=rain&alt=cafe&cam=site&compare=1&speed=0&t=1200`。`scenario=newcafe` は通常日＋カフェの別名です。

### 区画収入＋周辺売上差分（仮定）

`合計 = 区画来訪 × 仮定客単価 + 駐輪収入 + (周辺店舗来訪 − 同条件の駐輪案の周辺店舗来訪) × 仮定周辺客単価`。
カフェ650円/回、駐輪100円/回、周辺店舗800円/回です。これは区画の収入と周辺の売上差分を足した指標です。店舗単体の売上や地域全体の売上には相当しません。内訳を画面にも表示します。

同梱静的デモ・Pagesは3シード平均、CLIは既定5（`--seeds` で変更可）。阿佐ケ谷・通常日の再生成結果：

<!-- town-results:start -->
| 案 | 通過（回/日） | 実人数（人/日） | 区画来訪 | 平均滞在（分） | 周辺店舗来訪 | 区画売上 ¥ | 駐輪収入 ¥ | 周辺売上差分 ¥ | 合計（仮定）¥ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 駐輪場 | 555 | 276 | 0 | 0 | 779.7 | 0 | 4,100 | 0 | 4,100 |
| カフェ | 539 | 265.3 | 41.7 | 40.7 | 773.3 | 27,105 | 0 | -5,120 | 21,985 |
| 広場 | 549 | 267.3 | 48 | 26.2 | 785.3 | 0 | 0 | 4,480 | 4,480 |
<!-- town-results:end -->

3DではOSM由来の建物を、国土地理院の標高タイル（DEM5A/DEM10B）を加工した地形に置きます。高さ不明の建物・街路樹・街灯・降車演出等には推定・装飾を含みます。追加の降車演出は計算上の住民ではありません。
`web3d/sol`（既定）・`web3d/astra`・`web3d/terra` は同じ制作指示から作った3つのレンダラーです。

### 任意のLLM

`OPENAI_API_KEY` がある場合、既定8人（`--llm-agents`）の予定と架空の口コミにLLMを使います。キーなし・API失敗時は確率ルールへ戻り、`--no-llm` で無効にできます。架空の属性・予定をAPIへ送り、利用料が発生し得ます。
`ASAGAYA_LLM_MODEL` の既定は `gpt-4o-mini`、`OPENAI_BASE_URL` の既定は `https://api.openai.com/v1`。HTTPSを使用し、HTTPは明示指定したループバック開発用のみ、リダイレクトは拒否します。
応答キャッシュは `XDG_CACHE_HOME`（既定 `~/.cache`）内の `asagaya-town-sim/llm.json` です。

## 店舗販促14日間

架空カフェ「ひだまり珈琲」に対し、施策なし・SNS広告・チラシ看板・広報メディア・クーポンと組合せを比較します。来訪増と費用回収の関係を試す実験です。

```bash
asagaya-town-sim promo demo --serve --no-open --port 8765
asagaya-town-sim promo demo --json
asagaya-town-sim promo build -o /tmp/promo_site
```

ブラウザは `http://127.0.0.1:8765/promo/`。既定4画面は「施策なし」「SNS広告」「SNS広告＋クーポン」「全4施策」で、同じカメラ・住民・乱数を使います。
青は認知、黄色は来訪意向、橙は初訪問、赤は再訪です。点の位置は自宅と店舗の模式的な補間で、道路上の経路や同時在店人数を表しません。

**画面・動画の途中経過はseed 0の1試行、表・CLIは既定8試行の平均です。** 各パネルに試行と平均ROIを併記し、再生終了後に平均・95%区間を示します。
全4施策はseed 0で810来訪・ROI **+27.0%**、8試行平均では740.62来訪・ROI **−3.0%**。同じモデルでも乱数により符号が変わります。来訪が増えても費用を回収できるとは限りません。

表示サンプルは既定200体（上限300体）、総エージェント400体、人口倍率5で架空住民2,000人分を表します。来訪・クーポン利用・利益は人口倍率込み、点・認知段階の集計はエージェント単位です。店舗ラベルは「この時間枠の表示サンプルの来訪」で、全体の枠別来訪も別表示します。

### 主要指標

| 指標 | 定義 |
| --- | --- |
| 来訪 | 再訪を含む訪問回数 × 人口倍率。同一人物は1時間枠に最大1回 |
| 増分 | 同一seedの施策あり来訪 − 施策なし来訪の平均。増分%は各seedのベースライン比（0ならN/A） |
| 重複来訪（元々来訪） | ベースラインと同一人物・同一日・同一時間枠で重なる来訪割合。複数seedは来訪回数で重み付け。来訪0はN/A |
| 増分粗利 | 増分来訪 × 仮定客単価900円 × 仮定粗利率65%。割引前 |
| 割引費 | 人口倍率込みクーポン利用回数 × 仮定割引200円。元々来訪する人への割引も含む |
| 全期間チャネル費 | 各施策の固定費＋対象期間の有効日の運用費。SNS6万円・チラシ看板4万円・PR10万円・クーポン設定3万円（仮定） |
| 総費用・増分利益 | 総費用＝割引費＋チャネル費。増分利益＝増分粗利−総費用 |
| ROI（チャネル費基準、%） | `(増分粗利 − 割引費 − チャネル費) / チャネル費 × 100`。分母に割引費は含めない。0%が損益分岐、チャネル費0はN/A |

途中のROIは**累積増分粗利と累積割引費から全期間チャネル費を引く**定義です。初期の−100%は全期間費用を先に計上した途中経過です。画面に3つの金額も併記します。
既定14日・seed 0〜7の結果。角括弧は独立seedの平均に対する両側95% Student t区間で、乱数の変動だけを表します。仮置き係数の不確実性は含みません。1試行は区間なしです。

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

### 設定の詳細

`src/asagaya_town_sim/data/promo.json` の行動・環境・経済係数はすべて仮定値です。`--config FILE` でJSONを部分上書きでき、辞書は再帰マージ・リストは置換します。TOMLはPython 3.11以上、3.9/3.10はJSONを使ってください。`--days D`・`--seeds N` も指定できます。

`channels` は `sns_ad / flyer_signboard / pr_media / campaign_coupon`。有効日の `daily_reach` を時間枠ごとの確率に変換します。チラシ到達率は自宅距離で線形減衰し、固定の架空接触網で口コミが広がります。PR掲載はseedごとの1回の抽選で、未掲載でも費用が発生します。効果は `half_life_days` で減衰し、認知段階は戻りません。複数施策の反応は最大効果と飽和を使い、単純加算しません。

天候・曜日・時間・イベント・競合条件が来訪意向に掛かります。人口・日数・表示対象数等も設定可能です。実測の需要・獲得費・接触網・供給能力には合わせていません。現実の因果効果を立証するものではありません。
`/promo/?combos=none,sns_only,sns%2Bcoupon,all_four&speed=30` の `speed` は全期間の再生秒数です。`window.__promoState` は使用データ・フレーム・指標・準備状態を公開します。

## 30秒動画

公開動画URLは公開・録画担当が後で追加します。現時点では公開操作・再録画を行っていません。
`bash tools/record_promo.sh` は25秒で14日間を再生し、最後の5秒で8試行平均と95%区間を表示する、日英字幕付き30秒動画を `promo.mp4` に保存します。
Playwright Chromiumとffmpegが必要です。字幕専用帯とOSM・ODbL・国土地理院の加工クレジットを画面に保持します。
投稿説明欄にも [OSM帰属](https://www.openstreetmap.org/copyright)・[ODbL](https://opendatacommons.org/licenses/odbl/1-0/)・[国土地理院](https://maps.gsi.go.jp/development/ichiran.html)・[加工済みデータ取得先（Pages公開後）](https://haginot.github.io/asagaya-town-sim/web3d/data/index.html)を記載してください。

## 静的サイト・再生成・開発

```bash
uv run python tools/build_pages.py --out _site
python3 -m http.server --directory _site
```

Pages用は両エリアと販促を事前計算します。公開は手動workflowです。ビルドだけでは公開しません。
同梱JSONとREADME表の更新順序：

```bash
uv run python tools/export_engine.py asagaya web3d/data/engine.json
uv run python tools/export_engine.py koenji web3d/data/engine_koenji.json
uv run asagaya-town-sim promo build -o /tmp/promo_site
cp /tmp/promo_site/data/promo.json web3d/data/promo.json
uv run python tools/update_readme_tables.py
```

開発にはPythonと **Node.js 20以上** が必要です。

```bash
uv venv
uv pip install -e . pytest
uv run pytest -q
node --experimental-vm-modules web3d/sol/verify.mjs
node --experimental-vm-modules web3d/astra/check.mjs
node --experimental-vm-modules web3d/promo/verify.mjs
python3 tools/update_readme_tables.py --check
```

`prototype/` は最初の20人版（NetworkX・NumPy・Matplotlibが別途必要）です。

## ライセンス・出典

コードは[MIT](LICENSE)。OSM由来の両地域GeoJSON・建物・engineの道路/POIは[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)、© OpenStreetMap contributorsです。国土地理院の標高タイルを加工して地形を作成しています。店名はOSM由来で各店舗とは無関係です。
同梱three.js、CDNのLeaflet、開発・生成依存、対象データの範囲は[NOTICE](NOTICE)を参照してください。出力サイトには同じNOTICEと加工済みデータの取得ページを含めます。
