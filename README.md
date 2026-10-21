# 阿佐ケ谷 AI住民 町シミュレーション（asagaya-town-sim）

> **⚠ これは仮説を試すためのトイモデルです。予測ではありません。**
> 住民・店舗（架空の「ひだまり珈琲」を含む）・売上・販促係数はすべて架空・仮置きです。OSM/GSI由来なのは地図形状・地形のみです（OSMの地名ラベルは出典情報で、実店舗の行動データではありません）。
> 係数（来店確率、ついで寄り確率、営業時間、乗降人数の時間分布など）はすべて仮定値で、実測データで校正していません。
> 数値は「同じモデルの中で条件を変えたら相対的にどう動くか」を見るためのもので、実際の来店数・売上・通行量の予測には使えません。

JR阿佐ケ谷駅の周り半径約400m（OpenStreetMapの道路 約410本・POI 約540件）に、住民と電車の乗降客をエージェントとして置き、1日（5〜24時）を動かします。

## すぐ試す（設定不要）

```bash
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo          # シナリオ・3案の数値を表示
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo --serve  # 続けてWeb UIを開く
```

- `demo` … 4シナリオ（ベースライン／新カフェ／駅前イベント／雨の日）と、駅前の角3案（駐輪場維持／カフェ／広場）を実行して表を表示。既定は900人×5シードで数秒
- `serve` … Web UI（地図アニメーション＋比較画面 `#compare`）を http://127.0.0.1:8765/ で起動
- `build -o out` … `out/index.html` と `out/results.json` を書き出す
- 主なオプション: `--residents 400 --visitors 350 --commuters 150`（合計1000人程度まで数秒〜十数秒）、`--seeds 5`、`--json`、`--no-open`、`--port`

依存ライブラリはありません（Python 3.9以上の標準ライブラリのみ）。地図タイルとLeafletはCDNから読むため、Web UIの表示にはネット接続が必要です。

## 3D版（v0.3）

`asagaya-town-sim demo --serve` の既定画面は three.js の3D版です（2D版は `/2d.html`）。エンジンの出力JSONをそのまま読み、
OSMの建物3,045棟（高さはOSMの height / building:levels、無い建物は駅からの距離で推定）を国土地理院の標高タイル（DEM5A/DEM10B）の地形に載せています。
街路樹・街灯・屋上設備は手続き生成（シード固定）です。

- 住民（青）・電車来訪者（橙）・通勤者（桃）が歩き、中央線が着くと人が降りてきます
- シミュレーション時刻で昼→夕方→夜に変わり、人通りの多い通りが光ります。店の上の数字はモデル内の来訪数です
- 駅前の角を 駐輪場 / カフェ / 広場 に切り替えると3Dの形と数値（通行量・平均滞在・売上のおもちゃ試算）が変わります
- `--area koenji` で高円寺版（実験的。OSMから同じ手順で作成）
- URLパラメータ: `?scenario=rain|event|newcafe&alt=bike|cafe|plaza&t=分&cam=intro|site&timelapse=1050,1380&compare=1&hideui=1&area=koenji`

静的に動かす場合はリポジトリ直下で `python3 -m http.server` して `web3d/sol/` を開きます（`web3d/data/engine*.json` は `python3 tools/export_engine.py` で再生成）。

### 売上の「おもちゃ試算」（予測ではありません）
`toy_total = site_visits × 客単価 + (駐輪案のみ bike_users × 駐輪料金) + (nearby_shop_visits − 駐輪案の nearby_shop_visits) × 周辺客単価`。
仮定: カフェ客単価 650円、広場・駐輪場の区画売上 0円、駐輪料金 100円/回、周辺150m店舗の客単価 800円（`model.py` の `TOY_*`）。
来訪数・通行量・滞在はエンジンの3シード平均で、仮定の単価を掛けただけの数字です。

### モデルバトル
`web3d/sol`（既定）、`web3d/astra`、`web3d/terra` は同じ指示・同じデータで Codex CLI の別モデルに作らせた3つのレンダラーです。

## モデルの中身

| 要素 | 内容 |
|---|---|
| 住民 | 会社員・子育て世帯・学生・高齢者・在宅ワーカー。属性ごとの確率ルールで1日の予定を作る。自宅は駅から60〜420mの道路ノード |
| 電車の乗降客（外部エージェント） | JR中央線・阿佐ケ谷駅で降車して町に入り、用事の後に駅へ戻って乗車する。「来訪者」（飲食・買い物・イベント）と「町内勤務者」の2種。降車時刻は通勤型の駅を想定した時間分布（仮定値）。住民の通勤・通学による乗車／降車も集計 |
| 行き先の選択 | 「魅力度 × exp(−距離/200m)」（雨は120m）で確率的に選ぶ。**営業時間外の店は選ばない**（すべてのPOIにカテゴリ別の仮定営業時間。閉店時刻で退店。全候補が閉まっていれば断念として計上） |
| ついで寄り（誘発需要） | 歩いている途中で店の30m以内を通ると、カテゴリ別の確率×魅力度で予定外に立ち寄る（1人1日2回まで、営業中のみ）。新しい店は計画来店に加えて通りがかりの来店を生む |
| 移動 | 道路網の最短経路（ダイクストラ）。徒歩78m/分（雨65m/分）。自転車通勤者は駐輪場まで自転車、そこから駅まで徒歩 |
| 比較 | 駅前の角（駅の北東約70m）だけを入れ替え、同じ住民・同じ乱数（共通乱数法）で3案を並べて比較 |
| LLM（任意） | `OPENAI_API_KEY` があれば住民のうち8人（`--llm-agents`）の予定をLLMが作り、比較画面に口コミを表示。`OPENAI_BASE_URL`・`ASAGAYA_LLM_MODEL`（既定 gpt-4o-mini）で変更可。キーが無い・失敗した場合はルールベースに自動で戻る。`--no-llm` で無効化。応答は `~/.cache/asagaya-town-sim/` にキャッシュ |

### 比較画面の指標
- 区画の通行量：評価区画（半径40m）を通過した延べ回数
- 区画への来訪・うちついで寄り・平均滞在・延べ滞在（人・分）
- 周辺150m店舗の来訪（広場による回遊・カフェによる取り合いの両方が出る）
- 既存カフェの来訪（新カフェによる共食い）
- 駐輪場移転による追加徒歩：区画の駐輪場をやめると、自転車通勤者は約300m先の代替駐輪場を使う（仮定）

## 開発

```bash
uv venv && uv pip install -e . pytest && .venv/bin/pytest -q
```

`prototype/` は最初の20人版（networkx/matplotlib使用）。

## ライセンス・出典
- コード: MIT
- 地図データ: © OpenStreetMap contributors（ODbL）。`src/asagaya_town_sim/data/asagaya_osm.geojson`
- 店名はOSM上の名称で、各店舗とは無関係です。シミュレーション上の来店数は架空の値です。
- 着想: Generative Agents、駅の乗降客を外部エージェントとして扱うシミュレーション、複数案を並行して比べる都市計画シミュレーションの事例
- 標高: 国土地理院 標高タイル（3D版の地形）。three.js (MIT) を同梱。

## 店舗販促シミュレーション / Store promotion simulation (toy model)

```sh
uvx --from git+https://github.com/haginot/asagaya-town-sim asagaya-town-sim promo demo --serve
```

架空カフェ「ひだまり珈琲」 / fictional Hidamari Coffee uses fictional residents, spending,
channel response and business data. トイモデル / toy model: coefficients are placeholders,
not a forecast. Existing street geometry supplies home locations; no real store performance
or resident information is used.

`promo demo --json` exports metrics and timelines. `promo build -o /tmp/promo_site` writes
a self-contained static site. Both accept `--config FILE`, `--days D`, and `--seeds N`.
`demo --serve --no-open --port 8765` serves without opening a browser.
The new page shows up to four combinations with one identical camera, a store beam,
funnel colors, and live counters. Use
`/promo/?combos=none,sns_only,sns%2Bcoupon,all_four&speed=30`.
`speed` is the real duration in seconds for the entire simulation period (default 30),
including when `--days` changes. `window.__promoState` exposes data, selected combinations,
duration, current frame/day, live metrics and readiness or an error for debugging.
Frames and live metrics use seed 0; CLI metrics average seeds 0 through N−1.
At most 300 simulated agents are recorded. `population=400` and `agent_scale=5`
represent 2,000 fictional residents; visits, redemptions and gross profit use this scale,
while animation dots and funnel counts represent simulated agents.

Every behavioral/environmental/economic coefficient in
`src/asagaya_town_sim/data/promo.json` is a **fictional placeholder**. JSON partial overrides
recursively merge dictionaries; lists replace defaults. TOML overrides work on Python 3.11+
with stdlib `tomllib`; use JSON on Python 3.9/3.10.

| Metric | Definition and config keys |
| --- | --- |
| Visits / 来訪 | Visit episodes (including repeat visits), multiplied by `agent_scale`, driven by `organic_visit`, `aware_to_want`, `want_to_visit`, `repeat_visit` and `channels.*` reach/conversion boosts. One resident can visit once per time slot. |
| Uplift / 増分 | Mean over seeds of visits(combo) − visits(none), using common random numbers within each seed; percent divides by that seed’s baseline visits (null if zero). |
| Would have come anyway / 元々来訪 | Share of promotion visit episodes whose same agent also visits on the same day and time slot in the paired baseline. Summary pools episode counts across seeds; live counters use seed 0. It is at most baseline visits / promotion visits, and is 1 for `none`. Empty visit sets return 1 by convention. |
| Incremental gross profit / 増分粗利 | Uplift × `store.avg_spend` × `store.margin`, before discounts. |
| Discount cost / 割引費 | Scaled redeemed visits × `coupon_discount` (¥200 off ¥900 placeholder spend). Includes visitors who would have come anyway. `coupon_redeem_rate` controls redemption after coupon exposure. |
| Cost / 費用 | Sum of channel `fixed_cost` plus `daily_cost` for each simulated day in `active_days` (zero-based). Fictional yen. |
| ROI | (Incremental gross profit − discount cost − channel cost) / channel cost; null / N/A for zero cost. Averaged across seeds; the anyway share instead pools episodes. |

`channels` defines `sns_ad`, `flyer_signboard`, `pr_media`, and `campaign_coupon`.
`daily_reach` applies on `active_days`; flyer reach decreases linearly with home distance
to the store out to `proximity_radius_m`. `word_of_mouth` spreads awareness through a
fixed synthetic contact network (`contacts`), including visited residents.
PR has a single `coverage_probability` draw per seed; its ¥100,000 campaign cost is paid
even without coverage. SNS costs ¥60,000, flyers/signboard ¥40,000, and coupon setup
¥30,000; coupon redemption discounts are additional. These are fictional campaign yen.
Exposure strength decays with `half_life_days`, while achieved funnel states remain
monotonic. `aware_to_want_boost` and `want_to_visit_boost` scale with that strength.
The strongest channel response wins, then `boost_saturation` smoothly caps it;
additional channels broaden exposure with diminishing returns.
An organic visitor can pass through the early funnel within one slot.

`weather.sequence` cycles when provided; otherwise `weather.probabilities` draws daily
sunny/cloudy/rain conditions. `weather.multipliers`, `weekday_multipliers` (Monday first),
`start_weekday`, `hours`/`hour_multipliers`, `event.day`/`boost`, and
`competitor.days`/`penalty` multiply visit intent. These also affect organic visits.
`population`, `days`, `seeds`, `record_agents`, and `combinations` control the run and export.
Daily reach is converted to per-slot probability; word of mouth is added per slot.
Channel costs stop after active days, but awareness and decaying effects persist.

Default 14-day run, seeds 0–7: baseline 214.38 visits for 2,000 represented residents
(10.7 visit episodes per 100 residents). The following numbers are illustrative outputs,
not calibration against measured cafe data. Brackets are two-sided 95% Student t
intervals for the mean across independent seeds; they describe seed variation only,
not uncertainty in placeholder coefficients. One seed gives no interval; zero channel
cost gives no ROI. Intervals are not clipped to physically possible outcome ranges.

| Combination | Visits | Uplift [95% interval] | Anyway | Discount ¥ | Channel ¥ | ROI [95% interval] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 214.38 | 0.00 [0.00, 0.00] | 100.0% | 0 | 0 | N/A |
| sns_only | 423.75 | 209.38 [167.90, 250.85] | 50.6% | 0 | 60,000 | 1.04 [0.64, 1.45] |
| flyer_only | 338.75 | 124.38 [95.54, 153.21] | 63.3% | 0 | 40,000 | 0.82 [0.40, 1.24] |
| pr_only | 291.25 | 76.88 [−13.71, 167.46] | 73.6% | 0 | 100,000 | −0.55 [−1.08, −0.02] |
| coupon_only | 416.25 | 201.88 [164.75, 239.00] | 51.5% | 50,125 | 30,000 | 1.27 [0.71, 1.82] |
| sns+coupon | 643.12 | 428.75 [366.51, 490.99] | 33.3% | 76,375 | 90,000 | 0.94 [0.62, 1.26] |
| all_four | 740.62 | 526.25 [443.06, 609.44] | 28.9% | 84,750 | 230,000 | −0.03 [−0.21, 0.15] |

All combinations use identical pre-generated random draws, homes, contacts and weather
within each seed. This allows direct counterfactual comparison inside this toy world;
it does not establish real-world causality. There are no capacity limits, calibrated
responses, validated contact networks, measured acquisition costs or demand estimates.
Positions are illustrative home/store samples with interpolation, not walking routes.
Sensitivity to the placeholder coefficients can be substantial.

To build, serve and record 30 seconds with bilingual captions, run
`bash tools/record_promo.sh`. It requires the same Playwright/browser and ffmpeg setup
as `tools/record3d.py`. The helper sets `CAPS` JSON, serves only on localhost, and writes
`promo.mp4` in the current directory. It is intended to be run manually.

## Static Pages / 静的サイト

```sh
uv run python tools/build_pages.py --out _site
python3 -m http.server --directory _site
```

Precomputed 3D, promotion 2×2 and 2D views; no Python server is needed on Pages.
2D uses external Leaflet and OSM tiles. 出典・ライセンス / attribution: [NOTICE](NOTICE).
[Pages](https://haginot.github.io/asagaya-town-sim/) (公開後 / after publishing).
The manual workflow requires Pages enabled after the repository is public.

30秒デモ動画 / 30 s demo video: 準備中 / coming after publishing.
<!-- 30 s demo: to be uploaded as GitHub release asset or user-attachments link after going public -->
