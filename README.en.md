# asagaya-town-sim

> **Toy model for hypothesis exploration, not a forecast.** All residents, simulated stores (including fictional 「ひだまり珈琲」 / Hidamari Coffee), sales and promotion coefficients are fictional or placeholders. Only map geometry and terrain come from OSM/GSI; mapped place-name labels are source context, not real store behavior or performance data.

A small agent-based town simulation around JR Asagaya Station in Tokyo. Explore how a new café, an event, rain, or a different use of a station-side site changes activity within the model.

[日本語 README](README.md) · [GitHub](https://github.com/haginot/asagaya-town-sim)

## Features

- Simulates 05:00–24:00 on roughly 400 m of neighborhood radius, with 410 mapped streets and 544 points of interest.
- Defaults to 400 residents, 350 arriving visitors, and 150 local commuters, averaged over five seeds.
- Compares four scenarios and three site alternatives: bicycle parking, café, or plaza.
- Models shortest-path walking, assumed opening hours, spontaneous visits, and station boardings/alightings.
- Provides a Japanese-language animated map, comparison tables, JSON metrics, and static HTML export.
- Optional LLM schedules and fictional reviews, with rule-based fallback.

## Install

The main package requires Python 3.9+ and has no runtime dependencies. Install from a local checkout:

```bash
python3 -m pip install .
```

With `uv` installed, run directly from GitHub once the repository is public:

```bash
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo --no-llm
```

The older `prototype/` has separate dependencies; see its README.

## Usage

```bash
asagaya-town-sim demo --no-llm
asagaya-town-sim serve --no-llm
asagaya-town-sim demo --json --seeds 1 --no-llm
asagaya-town-sim build --no-llm -o out
```

`serve` opens the default 3D UI (2D at `/2d.html`) at `http://127.0.0.1:8765/`; use `/2d.html#compare` for comparisons. `build` writes `out/index.html` and `out/results.json`. The exported UI needs internet access for Leaflet and map tiles. The Python simulation runs offline with `--no-llm`.

## Configuration

Use `--residents`, `--visitors`, `--commuters`, and `--seeds` to change scale. `--record` controls recorded tracks; `--port` changes the local port; `--no-open` suppresses browser launch. See `asagaya-town-sim demo --help`.

LLM use starts automatically if `OPENAI_API_KEY` is set, unless `--no-llm` is supplied. It sends fictional persona and schedule prompts to the configured provider and may incur API charges. Keep credentials outside the repository.

| Setting | Default / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Unset; optional provider credential |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`; compatible API base URL |
| `ASAGAYA_LLM_MODEL` | `gpt-4o-mini` |
| `--llm-agents` | 8 residents |
| `XDG_CACHE_HOME` | `~/.cache`; responses stored in `asagaya-town-sim/llm.json` |

## License and attribution

Code: existing [MIT license](LICENSE), copyright © 2026 HAGINO, with the full standard warranty and liability text. Map data in `src/asagaya_town_sim/data/asagaya_osm.geojson`: © OpenStreetMap contributors, licensed separately under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The map screenshots also contain OpenStreetMap cartography. See [OpenStreetMap attribution information](https://www.openstreetmap.org/copyright) and the [publication audit](PUBLISH_AUDIT.md) for publication preparation details.

## Store promotion simulation (toy model)

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
