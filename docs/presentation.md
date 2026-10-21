# ai& Build Day — Shibuya Scramble Lab

5分構成 / Five-minute talk. Use the [separate MP4 / viewing guide](media/index.html); live demo is optional. Always keep the bilingual toy-model label and data credits on screen.

| 時間 / time | 日本語 | English |
| --- | --- | --- |
| 0:00–0:30 | 真上から3秒、一斉横断。問い：「仮の需要を増やすと、混雑の解消はどう変わる？」 | Open with the overhead crossing. “How does hypothetical demand change crowd clearance?” |
| 0:30–1:10 | 渋谷を実スケールへ。PLATEAUの足元形状＋高さ、OSMの道路・店舗。1mは1m。取得とライセンス確認を先に行う。 | Build a metre-scale setting from PLATEAU footprints/heights and OSM roads/shops. Establish provenance and licenses before using data. |
| 1:10–2:00 | 20,000体は個別の位置・速度・乱数・ファネルを持つ。近傍グリッドとsocial-force、WorkerとGPUビルボードで動かす。流体モデルではない。 | 20,000 individual positions, velocities, random streams and funnels. Spatial hashing, social force, a Worker and GPU billboards make the crowd feasible. |
| 2:00–2:40 | 駅統計の規模と時間帯の公開資料を使う。ただし乗換・往復は重複。12%換算は仮定。3,000人は任意のデモ目標。横断量・行動は未較正。 | Use published station scale and timing evidence. Transfers overlap; the 12% street conversion is assumed. 3,000 is an arbitrary demo target; crossings and behaviour are uncalibrated. |
| 2:40–3:20 | 車両はSUMO＋OSM。歩行者が残れば車を待たせる。山手線と銀座線の到着でハチ公前に波が生まれる。列車の波形と信号時間は仮置き。 | SUMO vehicles on OSM roads share a signal clock. Unfinished crossings hold traffic. Train arrivals create waves near Hachiko; timings and wave sizes are illustrative. |
| 3:20–4:15 | 架空カフェの認知→意向→来訪を色で見る。14日比較は同じ個体と乱数で販促施策を比べる。来訪増は利益増を保証しない。 | Watch awareness → intent → visits at a fictional cafe. The 14-day view compares promotions with paired agents/random draws. More visits need not recover campaign costs. |
| 4:15–5:00 | Codex CLIがシム・画面・録画・回帰テストを実装。人がレビュー・検証し、「較正」の過大表現や待機者と車両の干渉を指摘、修正結果を確認する。次は実測時間帯別カウントとODの較正。 | Codex CLI implements the simulation, UI, recorder and regressions. People review and verify labels, evidence and waiting-pedestrian/vehicle interactions, then inspect the fixes. Next: measured hourly crossing counts and OD calibration. |

## デモ操作 / Demo cues

1. `bash tools/record_shibuya.sh` → `/workspace/demos/shibuya-scramble.mp4` (42 s: 30 s scene at simulation ×8 + 12 s credits; 1280×720, bilingual subtitle band).
2. Live: `uv run shibuya-scramble-lab serve --area shibuya --no-llm --no-open`; overhead → Hachiko → normal demand. Read admitted and cleared separately.
3. Promotion: `uv run shibuya-scramble-lab promo demo --area shibuya --serve --no-open --port 8766`; [completed 14-day means](media/promo.webp) compare hypothetical campaigns. Map labels do not identify participating businesses.
4. If asked for FPS, quote the measured environment and agent count from `docs/PERFORMANCE.md`; recording throughput is separate from interactive FPS.

## 想定問答 / Questions

**本当の3,000人を予測した？ / Did you predict 3,000 real people?**
いいえ。公開統計で規模・時間的特徴を参照し、任意のデモ目標を別に載せたトイモデル。街頭換算や各行動係数は仮定。 / No. Published facts inform scale and timing; 3,000 is an arbitrary demo target. Street conversion and behaviour remain assumed.

**AIが全員の行動を毎フレーム考える？ / Does an LLM control every person?**
渋谷の実行時は依存なし・外部APIなし。個々のエージェントは決定的な数値ルールで動く。 / The Shibuya runtime calls no LLM or external API. Each person follows reproducible numeric rules.

**実店舗の成果を示している？ / Are these actual store results?**
店舗地物はOSMの参考情報。販促対象店と効果は架空。 / OSM shops supply map context. The target cafe and promotional effects are fictional.

**見えていない限界は？ / What remains approximate?**
LOD2の屋根・外装、地形、実信号、OD、列車ダイヤ、個別の接触と来店率。高密度では近傍上限とsoft-forceの近似も残る。 / Roofs/facades, terrain, actual signals, OD, timetables and conversion rates; neighbour truncation and soft-force overlap at high density.

Sources and exact formulas: [CALIBRATION.md](CALIBRATION.md). Licensing and modifications: [NOTICE](../NOTICE).
