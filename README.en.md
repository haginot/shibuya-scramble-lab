# Asagaya Town Simulation

English · [日本語](README.md)

**[30-second video (recording instructions; publication pending)](#30-second-video)** · **[Try in your browser (planned URL after Pages publication)](https://haginot.github.io/asagaya-town-sim/)**

A toy model comparing station-front land use and fictional café promotions on an Asagaya map, with the same residents and paired random draws. Explore [one day in town](#one-day-in-town) or [14 days of store promotion](#14-days-of-store-promotion).

AI has three distinct roles: **development** of the 3D renderers ([generation brief](docs/battle/prompt_round1.md), [renderer](web3d/sol/)); **optional LLM schedules and fictional reviews** for eight town residents by default; and a **probabilistic promotion model** whose calculations use rules. The static public demo is generated with LLM calls disabled.

> **A toy model for testing hypotheses, not a forecast.**
> Residents, behavior, sales and promotion coefficients are fictional placeholders. OSM/GSI supply map geometry, terrain and place labels only. No real resident behavior or store performance data is used. Coefficients and opening hours are uncalibrated, so the outputs cannot predict real visits, sales or foot traffic.

## Install and run

The main package requires Python 3.9+ and has no runtime dependencies. Install from a local checkout with `python3 -m pip install .`. Once the repository is public:

```bash
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo --no-llm
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim promo demo --serve --no-open --port 8765
```

```bash
asagaya-town-sim demo --no-llm
asagaya-town-sim serve --no-llm
asagaya-town-sim demo --json --seeds 1 --no-llm
asagaya-town-sim build --no-llm -o out
```

`serve` opens the 3D UI at `http://127.0.0.1:8765/`. Open **`http://127.0.0.1:8765/2d.html#compare`** for 2D comparisons. `build` exports 3D, 2D, metric JSON, licenses and attribution. Leaflet and 2D map tiles require internet access; the `--no-llm` simulation and bundled 3D assets work offline.

## One day in town

The default run places 400 residents, 350 arriving visitors and 150 local commuters on the street network around Asagaya station, from 05:00 to 24:00. It models assumed opening hours, destination choice, shortest-path walking, spontaneous visits and station boardings/alightings. Compare bicycle parking, a café and a plaza using paired random draws.

- Selecting an alternative and an everyday/rain/event condition selects the same result for tracks, heat and metrics. Paths show seed 0; daily totals and heat average seeds.
- A passage is one continuous intersection of a walking route with the 40 m site circle, independent of road-node subdivision. Unique people are a separate metric. Visits count episodes, including repeat visits.
- Nearby shops are identified by POI ID within 150 m and restricted to `cafe / food / bar / grocery / shop`. Parks, schools and other categories do not contribute to nearby sales.
- Both planned visits and detours end by closing time. Hours and walking speeds (78 m/min, 65 in rain) are assumptions.
- `--area koenji` selects the experimental Koenji area. A normal CLI export supports only its selected area; bundled static demos and Pages exports support both.
- Population arguments and `--record` must be nonnegative; `--seeds` must be at least one. `--record` controls the sampling interval for tracks and is not a strict count limit.
- Example: `?scenario=rain&alt=cafe&cam=site&compare=1&speed=0&t=1200`. Legacy `scenario=newcafe` means everyday + café.

### Site income + nearby sales change (assumed)

`total = site visits × assumed spend + bike fees + (nearby shop visits − nearby shop visits for bike parking under the same condition) × assumed nearby spend`.
Assumptions: café ¥650/visit, bike parking ¥100/use, nearby shops ¥800/visit. The total adds site income to a nearby sales difference; it is neither one store's sales nor total neighborhood sales. The UI displays the components.

Bundled static demos and Pages average three seeds. The CLI defaults to five; change it with `--seeds`. Regenerated Asagaya everyday results:

<!-- town-results:start -->
| Alternative | Passages/day | People/day | Site visits | Dwell min | Nearby shop visits | Site sales ¥ | Bike fees ¥ | Nearby change ¥ | Assumed total ¥ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bike parking | 555 | 276 | 0 | 0 | 779.7 | 0 | 4,100 | 0 | 4,100 |
| Café | 539 | 265.3 | 41.7 | 40.7 | 773.3 | 27,105 | 0 | -5,120 | 21,985 |
| Plaza | 549 | 267.3 | 48 | 26.2 | 785.3 | 0 | 0 | 4,480 | 4,480 |
<!-- town-results:end -->

The 3D scene places OSM buildings on processed GSI DEM5A/DEM10B terrain. Missing building heights, trees, lamps and extra alighting figures include estimates or decoration. Decorative passengers are not extra simulated residents. `web3d/sol` (default), `web3d/astra` and `web3d/terra` are three renderers made from the same development brief.

### Optional LLM configuration

If `OPENAI_API_KEY` is set, an LLM plans eight residents' days and fictional reviews by default (`--llm-agents`). It sends fictional persona/schedule prompts to the configured provider and may incur charges. Without a key, or on API failure, it falls back to rules; `--no-llm` disables it.

| Setting | Default / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Unset; optional provider credential |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`; HTTPS required, except explicitly selected loopback HTTP development endpoints; redirects refused |
| `ASAGAYA_LLM_MODEL` | `gpt-4o-mini` |
| `--llm-agents` | 8 residents |
| `XDG_CACHE_HOME` | `~/.cache`; responses in `asagaya-town-sim/llm.json` |

## 14 days of store promotion

Compare no promotion, social ads, flyers/signboard, PR/media, coupons and combinations for fictional Hidamari Coffee. This experiment tests the relationship between added visits and campaign costs.

```bash
asagaya-town-sim promo demo --serve --no-open --port 8765
asagaya-town-sim promo demo --json
asagaya-town-sim promo build -o /tmp/promo_site
```

Open `http://127.0.0.1:8765/promo/`. The four default panels compare none, social ads, social ads + coupons and all four, with identical cameras and paired residents/random draws. Blue means aware, yellow wants to visit, orange first visit, red repeat. Positions interpolate illustrative home/store samples, not walking routes or simultaneous occupancy.

**Live counters and the video show one trial, seed 0; the table and CLI average eight trials by default.** Each panel labels the trial and shows mean ROI; the ending card shows means and 95% intervals. All four gives 810 visits and **+27.0% ROI** in seed 0, versus 740.62 visits and **−3.0% ROI** averaged over eight trials. Random variation can reverse the sign. More visits may still fail to cover costs.

The default animation shows 200 agents (maximum 300), out of 400 simulated agents × population scale 5 = 2,000 fictional residents. Visits, redemptions and yen use this scale; dots and funnel counts are unscaled simulated agents. The store label shows sample visit episodes in the current time slot, with the full scaled slot total separately. It does not measure current occupancy.

### Metrics

| Metric | Definition |
| --- | --- |
| Visits | Visit episodes, including repeats, multiplied by `agent_scale`. One visit per resident per time slot at most. |
| Uplift | Mean of paired visits(combo) − visits(none). Percentage divides by each seed's baseline visits; N/A if zero. |
| Anyway / overlap share | Promotion visits overlapping the paired baseline for the same agent, day and time slot. Summary pools episode counts across seeds. Empty visit sets give N/A. |
| Incremental gross profit | Uplift × assumed spend ¥900 × margin 65%, before discounts. |
| Discount cost | Scaled coupon redemptions × assumed ¥200 discount, including baseline visitors. |
| Full-period channel cost | Fixed cost + daily costs on active days throughout the simulated period. Default fictional costs: social ads ¥60,000; flyers ¥40,000; PR ¥100,000; coupon setup ¥30,000. |
| Total cost / net gain | Total cost = discounts + channel costs; net incremental profit = incremental gross profit − total cost. |
| ROI (channel cost basis, %) | `(incremental gross profit − discount cost − channel cost) / channel cost × 100`. The denominator excludes discounts. 0% is break-even; zero channel cost gives N/A. |

Live cumulative ROI charges **full-period channel costs** against cumulative incremental gross profit and discounts. An initial −100% is an interim value with the entire campaign cost already charged. All three amounts appear in the panels.

Default 14 days, seeds 0–7. Brackets are two-sided 95% Student t intervals for the independent-seed mean. They describe random-seed variation only, not uncertainty in placeholder coefficients. One trial gives no interval. Intervals are not clipped to physically possible ranges.

<!-- promo-results:start -->
| Combination | Visits | Uplift [95% interval] | Anyway | Discount ¥ | Channel ¥ | Total cost ¥ | Net gain ¥ | ROI (channel cost basis, %) [95% interval] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 214.38 | 0.00 [0.00, 0.00] | 100.0% | 0 | 0 | 0 | 0 | N/A |
| sns_only | 423.75 | 209.38 [167.90, 250.85] | 50.6% | 0 | 60,000 | 60,000 | 62,484 | 104.14 [63.70, 144.58] |
| flyer_only | 338.75 | 124.38 [95.54, 153.21] | 63.3% | 0 | 40,000 | 40,000 | 32,759 | 81.90 [39.73, 124.06] |
| pr_only | 291.25 | 76.88 [-13.71, 167.46] | 73.6% | 0 | 100,000 | 100,000 | -55,028 | -55.03 [-108.02, -2.04] |
| coupon_only | 416.25 | 201.88 [164.75, 239.00] | 51.5% | 50,125 | 30,000 | 80,125 | 37,972 | 126.57 [70.96, 182.19] |
| sns+coupon | 643.12 | 428.75 [366.51, 490.99] | 33.3% | 76,375 | 90,000 | 166,375 | 84,444 | 93.83 [61.60, 126.06] |
| all_four | 740.62 | 526.25 [443.06, 609.44] | 28.9% | 84,750 | 230,000 | 314,750 | -6,894 | -3.00 [-21.11, 15.12] |
<!-- promo-results:end -->

### Configuration details

All coefficients in `src/asagaya_town_sim/data/promo.json` are fictional placeholders. `--config FILE` supports partial JSON overrides: dictionaries merge recursively; lists replace defaults. TOML requires Python 3.11+; use JSON on 3.9/3.10. `--days D` and `--seeds N` override the run length and trial count.
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


There are no calibrated responses, capacity limits, validated contact networks, measured acquisition costs or demand estimates. Paired trials support counterfactual comparison inside this toy world and do not establish real-world causality. Sensitivity to the placeholder coefficients can be substantial.
`/promo/?combos=none,sns_only,sns%2Bcoupon,all_four&speed=30` sets the combinations and whole-period playback duration in seconds. `window.__promoState` exposes data, frames, metrics and readiness.

## 30-second video

The publication/recording reviewer will add the public video URL later. No publishing or re-recording was performed in this revision.
Run `bash tools/record_promo.sh` with Playwright Chromium and ffmpeg installed. It animates the period in 25 seconds and holds the eight-trial mean/95% interval card for the final five seconds, writing a bilingual 30-second `promo.mp4` in the current directory. Captions have a dedicated band; OSM, ODbL and processed GSI elevation credits remain on screen.
The upload description should also link [OSM attribution](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), [GSI tiles](https://maps.gsi.go.jp/development/ichiran.html) and [derived data (after Pages publication)](https://haginot.github.io/asagaya-town-sim/web3d/data/index.html).

## Static site, regeneration and development

```bash
uv run python tools/build_pages.py --out _site
python3 -m http.server --directory _site
```

The Pages build precomputes both town areas and promotions. Deployment uses a manual workflow; building does not publish anything. Regenerate bundled data and README tables in this order:

```bash
uv run python tools/export_engine.py asagaya web3d/data/engine.json
uv run python tools/export_engine.py koenji web3d/data/engine_koenji.json
uv run asagaya-town-sim promo build -o /tmp/promo_site
cp /tmp/promo_site/data/promo.json web3d/data/promo.json
uv run python tools/update_readme_tables.py
```

Development requires Python and **Node.js 20+**:

```bash
uv venv
uv pip install -e . pytest
uv run pytest -q
node --experimental-vm-modules web3d/sol/verify.mjs
node --experimental-vm-modules web3d/astra/check.mjs
node --experimental-vm-modules web3d/promo/verify.mjs
python3 tools/update_readme_tables.py --check
```

The older 20-person `prototype/` has separate NetworkX, NumPy and Matplotlib dependencies.

## License and attribution

Code: [MIT](LICENSE). OSM-derived GeoJSON for both areas, buildings, and engine road/POI geometry: © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Terrain is processed from GSI elevation tiles. OSM place names do not imply any relationship with those stores.
See [NOTICE](NOTICE) for data scope, vendored three.js, CDN Leaflet and development/generation dependencies. Exported sites include that notice and a download page for derived data.
