# 渋谷の較正と仮定 / Shibuya calibration and assumptions

公的統計で較正したトイモデル・予測ではない / **Toy model calibrated to public stats — not a prediction**.

確認日 / reviewed: 2026-10-21. Machine-readable values: `src/asagaya_town_sim/web3d/data/shibuya_calibration.json`. Geometry uses metres, x east / z south, centred at 35.65948° N, 139.70055° E. One agent represents one simulated person. This is an agent simulation, with individual positions, velocities, random streams and promotion states, rather than a fluid model.

## 駅統計 / Station scale

全社で同じ年度をそろえるため2024年度を固定。最新年度を自動追従しない。公表値の事実部分のみを記録し、原文書やウェブページは再配布しない。

| 出典 / source (FY2024 daily average) | 人数 / daily | 定義・使い方 / definition and use |
| --- | ---: | --- |
| [JR東日本](https://www.jreast.co.jp/press/2025/20250912_ho03.pdf) | 324,414 | 乗車のみ。降車も同数と仮定して2倍 / boardings; assume balanced exits, ×2 |
| [東京メトロ・銀座線](https://www.tokyometro.jp/corporate/enterprise/passenger_rail/transportation/passengers/2024.html) | 191,505 | 乗降 / entries + exits |
| [東急・東横線](https://www.tokyu.co.jp/railway/company/business/passengers/2024/) | 414,186 | 他社乗換・直通通過を含む / includes transfers and through traffic |
| [東急・田園都市線](https://www.tokyu.co.jp/railway/company/business/passengers/2024/) | 604,246 | 同上 / same caveat |
| [京王・井の頭線](https://www.keio.co.jp/company/corporate/corporate_manual/number-of-passengers.html) | 286,940 | 乗降 / entries + exits |

`station_event_proxy = 2 × 324414 + 191505 + 414186 + 604246 + 286940 = 2145705`.

これは延べ駅利用イベントの規模指標であり、ユニーク人数でも街頭通行人数でもない。半蔵門線・副都心線の共用駅カウントは東急と重ねて加算しない。それでも他社乗換・往復・直通等の重複は残る。**駅数値から交差点人数への実測換算係数は得られていない。**

通常日: `daily_street_reference = station_event_proxy × 0.12 = 257484.6` crossing trips/day. The 12% street capture is an explicit analyst assumption, not a measured exit share. This station proxy constrains the magnitude; it does not identify actual crossing demand. No railway endorses this application.

## 時間帯 / Hourly profile

[渋谷区 産業・観光ビジョン 資料編 pp.19–20](https://files.city.shibuya.tokyo.jp/assets/12995aba8b194961be709ba879857f70/6b2badcb77454bd8b6ccaeaffdd90317/assets_com_000047960.pdf)は2018年の国内居住者の滞在人口について、平日7時頃から増加、14–16時頃ピーク、19時頃から減少が速まると報告する。

We use these published timing constraints to construct a smooth, approximate 24-hour shape:

```text
hour: 00   01   02   03   04   05   06   07   08   09   10   11
w:   .15  .08  .04  .03  .04  .09  .22  .46  .70  .77  .84  .91
hour: 12   13   14   15   16   17   18   19   20   21   22   23
w:   .96  .99 1.00 1.00  .97  .94  .88  .78  .65  .51  .36  .23
```

`sum(w)=13.6`. `normal_phase_demand(h)=257484.6 × w[h]/13.6 × 150/3600`. At 15:00 this is **788.862** requested departures per phase, rounded to 789 agents. Fractional hours interpolate adjacent bins. Normalisation is across the 24 discrete bins; interpolation is only for selecting a display hour. The simulation holds that chosen hour's demand constant rather than pretending to replay a measured full day.

このカーブは公表された時間的特徴への近似であり、図の数値をデジタイズしたものでも、時間別横断人数への定量フィットでもない。滞在人口→通行トリップの変換、2018年→2024年の形状の持ち越しは仮定。原資料は第三者のモバイル空間統計を含むため、図・原データは同梱しない。

[国交省の全国人流データ](https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/tochi_fudousan_kensetsugyo_fr17_000001_00006.html)は2019–2021年・1kmメッシュ・昼夜等の集計で、信号フェーズ別の横断較正には解像度が足りない。[渋谷区の人流ダッシュボード](https://www.city.shibuya.tokyo.jp/kusei/tokei_shibuya/shibuya-data/shibuya_city_dashboard_peopleflow_KDDI.html)はKDDI由来の滞在・通行統計を公開しているが、再配布可能な交差点別・時間別原データは本実装では取得していない。これらを取得済みデータと混同しない。

## 約3,000人のピーク / Upper-demand scenario

The default visual preset scales the normal curve by **3.8029458849**, so its maximum requested departures are **3,000 per phase**. This is the requested upper-demand demonstration target, **not a verified contemporary official count**. Applying that factor to every hour would imply 979,200 crossing trips/day; we do not present that as observed daily footfall. `--normal-demand` removes it. At most 6,000 primary crossing identities exist, and demand is capped by the configured population. Default total 20,000 includes background outdoor pedestrians, queues and train waves; it is a performance/demo population, not a measured simultaneous census.

画面の「今期の出発 / admitted」は割り当てた横断トリップ、「横断完了 / cleared」は実際に反対側の端点へ到達した個体数。3,000人が55秒で必ず渡り切る、という表示にはしない。混雑時にはクリアランスが延びる。

## 個別の歩行とファネル / Individual motion and funnel

- Fixed integration: 0.1 s. Desired speed 1.05–1.65 m/s; relaxation 0.5 s; body radius 0.23 m. GPU point billboards are about 1.7 m tall in projected scale, with an authored human silhouette, not enlarged crowd markers. Vehicles use InstancedMesh.
- Driving force `(desired_velocity - velocity)/0.5`; pair repulsion `2.1 × exp((0.46 - distance)/0.32)`, clipped at 8 m/s²; speed capped at 1.95 m/s. These are illustrative social-force parameters, not fitted Shibuya trajectories. See [Helbing & Molnár, 1995](https://doi.org/10.1103/PhysRevE.51.4282).
- Typed arrays and a 2.5 m spatial grid, interactions within 2.4 m, at most 32 sampled neighbours per agent. This cap approximates dense interactions and may introduce ordering bias. It keeps computation approximately linear; it is not an exact many-body solution.
- PLATEAU footprint occupancy is rasterised at 2.5 m; static sidewalk-corner distance maps guide obstacle detours. These are static route maps, not a crowd density solver. OSM outdoor footway segments supply background shuttle routes; underground/indoor segments are excluded. Background trips shuttle within segments rather than a citywide travel-demand model. Dense bodies can overlap under soft forces; no validated collision-free guarantee.
- Main funnel: unaware → aware → intent → visited. Each identity has its own state and deterministic xorshift random stream. Within 75 m of the fictional cafe, awareness hazard is 0.04/s with promotion and 0.002/s without; intent hazard is 0.012/s or 0.001/s. Eligible background agents within 32 m approach the cafe; arrival within 3 m records an individual visit. Visits persist. No observed attribution, sales or conversion coefficients.
- Promo on/off changes exposure in the current main run, so it is not by itself a paired causal estimate. Use the existing 14-day comparison, `promo ... --area shibuya`, for common random numbers across promotion combinations. That comparison retains 400 fictional agents × 5 population scale, 8 seeds, 14 days; its movement is schematic and its coefficients are all placeholders. Its time curve is independent of the physical crowd's station calibration.

## 信号と車両 / Signals and traffic

SUMO **1.28.0** was successfully used; no simple-model fallback is included. `tools/export_shibuya_traffic.py` converts the bundled OSM roads to 540 directed edges / 294 junctions, joins the central signal, creates 100 connected routes and exports 202 vehicle tracks after two warm-up cycles. The generation script requires optional `eclipse-sumo`, `sumolib`, `traci`; the distributed viewer and Python CLI do not. Seeds and source/versions are in `shibuya_traffic.json`.

The assumed cycle is 150 s: pedestrian admission 0–55; clearance 55–75; vehicle program 75–140; all red 140–150. SUMO's central signals are forced red through the walking/clearance phase, and restored to the imported vehicle program in the vehicle phase. Demand, routes, turning proportions, speeds and timings are not measured. During clearance overrun, the browser pauses the shared traffic clock before 75 s until admitted pedestrians finish. It keeps already admitted walkers moving and SUMO vehicles stopped. Vehicle tracks repeat with a visible cycle cut; they are not continuous vehicle identities across wraps. SUMO and the browser pedestrians are coupled by the clock, not a live TraCI co-simulation.

## 列車とハチ公 / Trains and Hachiko

山手線150秒間隔・位相4秒・駅出口まで8秒遅れで180人、銀座線180秒間隔・位相38秒・出口まで18秒遅れで90人の波を仮定。時刻表、全編成の実測降車数、改札・階段・出口配分の再現ではない。統計的には駅の規模を参照するが、これらの波形・係数の実測較正は未実施。

Waves reassign existing background identities to the Hachiko-side exit; they do not create decorative uncounted people. The main viewer displays 11 × 19.5 m Yamanote cars and 6 × 16 m Ginza cars, on illustrative approach/dwell/departure motion near the OSM railway context. Platforms, railway elevations, approach paths and Hachiko sculpture are authored approximations; no statue scan, official train artwork or textures are copied. Hachiko's square and a camera preset are the focal scene.

## 地物とライセンス / Geometry and licensing

`tools/fetch_shibuya.py` is the only acquisition entry point. Policy review preceded acquisition. The raw 636 MB PLATEAU archive is not bundled: byte ranges read four CityGML meshes (53393585/86/95/96), then retain 1,050 local footprints and measured heights. LOD2/3D Tiles textures and roofs are omitted for a small offline package. If measuredHeight is absent, geometry Z extent is labelled in each record. Centimetre rounding does not imply centimetre survey accuracy. Ground is flat; no Shibuya DEM has been imported.

License: dataset declares [PLATEAU Site Policy](https://www.mlit.go.jp/plateau/site-policy/), whose section 3 explicitly permits CC BY 4.0. Credit 国土交通省 Project PLATEAU・渋谷区 2023; describe modifications. Files remain separate from OSM. `buildings_shibuya.json` is another representation of the same PLATEAU extract, also CC BY 4.0.

OSM was obtained via Overpass (base timestamp **2026-10-21T08:03:06Z**), bbox 35.6559,139.6961,35.6631,139.7050. Roads, rails and shop/food objects: © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Full derived JSON, query, timestamp and checksum accompany every export. After centroid clipping and excluding vacant units, **1,102 mapped shop/food objects**, **111 within 150 m** (36 restaurants, 13 cafes, 7 bars, 6 fast food, 5 clothing, etc.). This is an incomplete mapped-object inventory with potential node/area duplication, not a count of all operating establishments. These objects provide context/categories, not measured trade or modelled commercial performance. The cafe at x=-46,z=-42 is fictional.

Code / three.js: MIT; optional SUMO: EPL-2.0; Playwright: Apache-2.0; ffmpeg/libx264 external build-dependent licensing. Full details: [NOTICE](../NOTICE). Public station facts are attributed individually; no blanket open-data license is claimed for railway websites or third-party mobile statistics.

## 再生成と残る制約 / Reproduction and limitations

```bash
uv run python tools/fetch_shibuya.py --cache /tmp/shibuya-source
uv run --with eclipse-sumo --with sumolib --with traci python tools/export_shibuya_traffic.py
uv run python tools/export_shibuya.py
uv run python tools/build_pages.py --out _site
uv run pytest -q
node web3d/shibuya/verify.mjs
bash tools/record_shibuya.sh
```

Acquisition has network/remote-service dependencies; running the bundled app does not. Street capture, hourly quantitative crossing counts, real controller plans, real OD matrices, collision parameters, train schedules/exit distribution, conversion parameters, topography and detailed LOD2 facades remain uncalibrated. Browsers, GPUs and CPU speed affect achievable FPS; see `docs/PERFORMANCE.md` and the recording's performance JSON for measurements rather than guarantees.

The bundled OSM snapshot is the reproducible input. A fresh Overpass acquisition can change mapped counts; review source dates, expected counts and notices when updating it. All 1,050 bundled PLATEAU heights use measuredHeight.
