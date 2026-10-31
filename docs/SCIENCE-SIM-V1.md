# science-sim-v1 — 「科学的な人流シミュレーション」縦型ショート (JA, 9:16, 30 s)

HAGINO's brief via SNS運用担当 (2026-10-31): one message only — **past a certain density people nearly stop**. Research-figure look
(white background, Zen Kaku Gothic New OFL, colour bar, axis labels). No game UI / characters / route guessing.

```sh
node tools/v8_sim.mjs all                               # (only if cache/*-frames.json is missing; git-ignored, ~6 min each)
bash tools/science_sim/build.sh [WORKDIR] [OUT.mp4]     # prep.py -> render.py (900 frames) -> audio.py (-14 LUFS) -> mux
```
Output used for posting: `/workspace/demos/halloween-escape-series/science-sim-v1/ja-science-sim-v1.mp4` (1080×1920, 30 fps, 30.0 s, −14.0 LUFS integrated).

## Model (what the numbers come from)
v8 JR crowd solver (`web3d/shibuya/series/crowd-jr.mjs` on `halloween.mjs`): **social-force pedestrian model**, hard limit **4 people per 1 m²**
(`HALLOWEEN.occupancy`), scramble signal, Hachiko gate metering 0.45 p/s (assumption). Assumptions are the committed text of
`v8/sim/plan.json: assumptions.ja`: 人出48,000人・ピーク時（22時ごろ想定）／ハチ公改札前は入場規制を仮定. Density grid: 3 m cells over a 360 × 726 m window
(`grid.w*cell`, `grid.h*cell`), density = agents / walkable m² of the cell (cells with ≥ 4 m² walkable, `sim-layer.mjs` rule).
Map = PLATEAU building footprints (`web3d/data/shibuya_plateau.json`) over the solver's coordinates; walkable raster = PLATEAU + OSM (CALIBRATION.md).

The solver has no closed-form speed–density law. The fundamental diagram on screen is **measured from the solver output**:
speed = 1-s displacement of each sampled agent (1/12 crowd sample, same `id` in consecutive per-second keyframes) vs the density of the 3 m cell it stands in,
plan + retry runs pooled (`prep.py` → `fd.json`). Standing/queuing agents are included (stated on the card). The cap cells (ρ = 4.0 exactly) are partly a
consequence of the model's hard 4/m² limit — the curve says what the *model* does, not a measured Shibuya crowd.

| ρ bin [p/m²] | agent-seconds | mean speed [m/s] |
|---|---|---|
| 0.0–0.5 | 826,947 | 1.0550 |
| 0.5–1.0 | 1,022,588 | 1.0087 |
| 1.0–1.5 | 654,950 | 0.8394 |
| 1.5–2.0 | 264,008 | 0.6297 |
| 2.0–2.5 | 164,784 | 0.5552 |
| 2.5–3.0 | 82,614 | 0.5203 |
| 3.0–3.5 | 72,402 | 0.4623 |
| 3.5–4.0 | 44,741 | 0.3594 |
| 4.0–4.0 (cap cells) | 36,801 | 0.1892 |

## Every number on screen → source
| on screen | source |
|---|---|
| 48,000人 | `v8/sim/plan.json: agents` (= retry.json, v9 crush.json); assumptions.ja |
| colour bar 0–4, 「4＝モデルの上限」, 「上限4」, 「1㎡あたり上限4人」 | `plan.json: density.peakP50 = 4`, `HALLOWEEN.occupancy = 4`, docs/V8.md ("4.0 as the solver's cap") |
| axis ticks 0/50/100/150 (x, z, m) | solver model frame; window x −50…190, z −59…181 = grid cols 3–83 / rows 106–186 of `grid {x0:-59,z0:-377,cell:3}` |
| red-spot labels (e.g. 4.0, 3.4 人/㎡) | live: max of ρ = `frames[k].grid / grid.area` over the ±2 cells around anchors (65.5,17.5) (74.5,53.5) (74.5,161.5) (−39.5,14.5), `cache/plan-frames.json` keyframe k |
| clock 00:00–15:00 | `frames[k].t` (0…900 s solver time after the plan run's 150 s warm-up; `plan.json: keyframes = 901`) |
| 「3人/㎡以上の区画：N 個」 | live count of window cells with ρ ≥ 3 at keyframe k (same file) |
| 1.05 m/s, 0.19 m/s, 約18％, curve points | `fd.json` (mean speed of bin 0–0.5 = 1.0550; cap cells = 0.1892; 0.1892/1.0550 = 17.9 %) |
| 360×726m | `plan.json: grid.w*cell = 120*3`, `grid.h*cell = 242*3` |
| 240m四方 | the drawn window (80 cells × 3 m) |
| 22時ごろ, 2023 | `assumptions.ja`; PLATEAU 渋谷区 2023 (`shibuya_plateau.json: source`) |

Not claimed: the sim is quasi-stationary (≈ 21.7k of the agents are inside the grid at every second); "3人/㎡以上の区画" grows 15 → 51 over the 15 min, the timelapse
shows that, not a build-up from an empty street. No percentages of "圧死リスク", no route recommendations.
