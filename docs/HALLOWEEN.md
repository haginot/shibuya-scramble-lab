# Halloween night mode / ハロウィンナイトモード

`web3d/shibuya/?mode=halloween` (`&lang=ja|en`) — the same PLATEAU/OSM city, SUMO traffic, scramble signal and individual social-force walkers as the normal mode, with a Halloween crowd, police crowd control and a station-closing dispersal comparison. **Toy model scaled to public statistics, not a prediction.** Every parameter below is an assumption (see `HALLOWEEN` in `halloween.mjs` and `DISPERSAL` in `dispersal.mjs`).

```bash
uv run shibuya-scramble-lab serve --no-llm --no-open   # then open /web3d/shibuya/?mode=halloween
bash tools/record_halloween.sh                          # 45 s videos (Japanese + English, 1280×720, 30 fps) + 9:16 cuts
node web3d/shibuya/verify-halloween.mjs                 # solver checks (≈6 min)
```

## Halloween crowd (21:00)

| | |
|---|---|
| People modelled | 48,000 individual agents (assumption, ≈1.4× the 18:00 Little's-law population) |
| Requested crossings | 3,600 per 150 s cycle (more than the corners hold, so police pens fill) |
| Occupancy rule | nobody steps into a square metre that already holds 4 people |
| Police | gate officers and half-barriers on every corner approach; people are held in pens (≤1.4 p/m² intended) while the corner queue is full (≤1.7 p/m²) and released in stop-and-go pulses; queues leave in rows (front first, 3.5 s apart); no new departures with < 20 s of green left; a police line keeps a 2.6 m arrival strip at the curb |
| Circulation | one-way sidewalks around the scramble, keep-left elsewhere, a cone-bar divider on Center-gai, inbound/outbound halves on the approach sidewalks |
| Events | costume photo spots, street performers, convenience stores, trash/recycling stations (people stop, watch, shop, drop rubbish) |
| DJ police | command vehicle with a raised platform on the station plaza (officer, megaphone, speech bubbles, LED sign) |
| Costumes | witch, vampire, devil, cat/bunny ears, pumpkin head, ghost, zombie/mask, wizard, hero cape, skeleton, casual; phone screens and glow sticks. Rendering only — the solver does not know costumes |

Measured by `verify-halloween.mjs` (48,000 agents, 320 s): peak 3 m-cell density **4.0 p/m²**, person-weighted median **1.1 p/m²**, up to **2,542** people held by police, up to **2,335** on the crossing, **0** relocations/rescues, largest step 0.195 m per 0.1 s. One-way rules are broken in 2.4 % of segment transitions (dead ends with no legal continuation); this is counted, not hidden.

The HUD shows counts of the agents' own motion codes in the frame's snapshot: on the crossing (`CROSS`), queued at corners (`WAIT`), held by police (`HOLD`), peak and median density (3 m cells of walkable area), and "moved by the model" (teleports + safety-valve rescues, expected 0).

## Station-closing dispersal (00:30, the climax)

16,000 people: 9,000 still inside the station, 7,000 on the Hachiko plaza. People emerge from four station gate lines (Hachiko 9, Miyamasuzaka 8 (east half of the north face, called "Central" in v1), South 6, East 4 p/s at full capacity, assumption) only onto a gate square metre with room, and count as *left* only when they reach a gateway on foot: the outer end of the connected sidewalk network in each 45° direction (60–160 m out; the modelled sidewalks are cut where unmodelled side roads cross them). Both runs use the same seed and the same people.

* **No control** — every gate at full capacity; each person leaves through any gate that adds < 60 m to their walk (weighted by capacity); everyone on the plaza starts at once; crossing on any green. When cars have been held for 10 s by people still on the road, the waiting crowd walks into the junction regardless of the signal (cars stay held while anyone is on the road).
* **One-way routes + staged release** — each destination is assigned the gates on its side (within 25 m of the shortest walk); outbound walkers keep to the outbound half of managed sidewalks; the plaza is released in five rings 40 s apart (nearest the exits first); gates run at 75 % capacity and only while the 6 m in front holds < 1.2 p/m²; police line and 20 s cut-off at the crossing.

Shared behaviour: social force, the 4 p/m² occupancy rule (5 only while clearing the road or passing someone headed the opposite way), turning back to the nearest sidewalk with room when stranded on the road after the green, and a detour to the next-best gateway after 25–40 s at a standstill (counted as `rerouted`).

Result after 25 simulated minutes (`verify-halloween.mjs`, also checked frame by frame in the recording):

| | No control | Managed |
|---|---:|---:|
| Still in the area | 2,102 | 1 |
| Dense crowd (no 3 m cell > 2 p/m²) cleared at | not cleared | 13:20 |
| Peak density (3 m cells) | 5.0 p/m² | 4.9 p/m² |
| Last person out of the station | 07:46 | 22:12 |
| Person-minutes at ≥ 4 p/m² | 38,772 | 13,770 |
| Cars held by people on the road | 11:24 | 00:00 |

**Metering is not free: the managed station empties at 22:12 instead of 07:46** — the waiting moves from the streets into the station (whose concourse is not modelled spatially). The video shows this tradeoff as the first row of its results card, and the split screen gives *in the station*, *on the streets* and *gone home* equal size. The uncontrolled residue is mostly people who left on the far side of the station and walk back around it against the flow; in this model such counter-flow pockets dissolve slowly because nobody exceeds 5 p/m². Gate positions, capacities, gateways and behaviour rules are illustrative.

## How robust is the comparison? Sensitivity sweep / 感度分析

The table above is **one bundled scenario** (one seed, one set of assumptions); the two strategies differ in gate assignment, gate capacity, release timing, lane preference and crossing cut-off all at once, and the no-control run includes a spill-over rule. It illustrates mechanisms; it cannot establish how much police control improves real Shibuya dispersal. `node web3d/shibuya/sweep-dispersal.mjs` (24 solver runs, ≈7 min on 7 cores) reruns both strategies for 25 simulated minutes with each assumption varied one at a time and writes `web3d/data/shibuya_dispersal_sweep.json`; the video's results card shows the min–max of this table under each number, and the recorder checks those ranges against the file. The sweep asserts conservation only, never which strategy wins.

| scenario | not home after 25 min (none / managed) | station empty (none / managed) | street crowd > 2 p/m² cleared (none / managed) | person-min ≥ 4 p/m² (none / managed) | peak p/m² |
|---|---|---|---|---|---|
| shipped scenario (seed 7) | 2,102 / 1 | 07:46 / 22:12 | 25:00+ / 13:20 | 38,772 / 13,770 | 5.0 / 4.9 |
| seed 11 | 2,014 / 3 | 08:07 / 22:11 | 25:00+ / 13:11 | 37,308 / 14,573 | 5.0 / 4.9 |
| seed 23 | 2,555 / 0 | 08:01 / 22:10 | 25:00+ / 13:14 | 45,147 / 14,766 | 5.0 / 4.9 |
| seed 101 | 1,933 / 0 | 08:19 / 23:04 | 25:00+ / 13:10 | 37,141 / 14,156 | 5.0 / 4.9 |
| demand ×0.6 (9,600 people) | 971 / 0 | 04:39 / 13:24 | 25:00+ / 10:09 | 15,244 / 5,745 | 5.0 / 4.9 |
| demand ×1.25 (20,000; plaza full at 7,000, the extra wait inside) | 2,845 / **1,428** | 11:22 / **25:00+** | 25:00+ / 15:43 | 43,431 / 18,173 | 5.0 / 4.9 |
| gate capacity ×0.7 | 2,148 / **900** | 11:06 / **25:00+** | 25:00+ / 13:11 | 38,127 / 11,731 | 5.0 / 4.8 |
| gate capacity ×1.3 | 2,102 / 0 | 05:59 / 17:05 | 25:00+ / 13:16 | 37,238 / 15,487 | 5.0 / 4.9 |
| destinations uniform | 2,516 / 0 | 06:57 / 15:51 | 25:00+ / 15:38 | 41,772 / 20,225 | 5.0 / 4.9 |
| destinations ∝ street width² | 1,543 / **982** | 08:59 / **25:00+** | 25:00+ / 13:21 | 33,615 / 10,300 | 4.9 / 4.9 |
| 80 % follow police instructions | 2,102 / 0 | 07:46 / 19:40 | 25:00+ / 12:59 | 38,772 / 11,700 | 5.0 / 4.8 |
| 60 % follow police instructions | 2,102 / **1,749** | 07:46 / **25:00+** | 25:00+ / **25:00+** | 38,772 / 14,303 | 5.0 / 4.9 |
| no-control spill-over after 30 s (not 10 s) | 2,149 / 1 | 07:46 / 22:12 | 25:00+ / 13:20 | 40,998 / 13,770 | 4.9 / 4.9 |
| no-control crowd never ignores the signal | 6,414 / 1 | 07:46 / 22:12 | 25:00+ / 13:20 | 106,741 / 13,770 | 5.0 / 4.9 |

(Rows that vary only one strategy's behaviour reuse the other strategy's base run.)

What holds and what does not, in this model:

* **The waiting moves into the station in every scenario (14/14).** The managed station empties 13:24 to beyond 25:00 after closing; with no control, 04:39–11:22. The concourse is not modelled spatially, so the model cannot say whether that indoor wait is safe or comfortable.
* **Management helps much less when capacity is short or compliance is low** (bold): with 30 % less gate capacity, 25 % more people, destinations concentrated on the widest streets, or only 60 % of people following instructions, 900–1,749 people are still inside the station or on the streets after 25 min (vs 1 in the shipped run). With 60 % compliance the street crowd never falls below 2 p/m².
* The managed runs always leave fewer people waiting after 25 min (14/14) and fewer person-minutes at ≥ 4 p/m², but the margin ranges from ~350 people (60 % compliance) to ~6,400 (no spill-over).
* **Peak density does not discriminate**: every run reaches the model's occupancy cap (4.8–5.0 p/m² in a 3 m cell). That number is a property of the cap, not a finding.
* The no-control result depends strongly on the spill-over rule: if that crowd never walks against the signal, three times as many are still waiting after 25 min.

Knobs (`DISPERSAL.knobs`, overridable per run via `config.dispersal`): `capScale`, `destPower`, `compliance` (non-compliant people use their nearest gate, ignore staging, the police line and the cut-off), `spillAfter`; plus `seed`, `inside`, `plaza`. The defaults reproduce the shipped run bit for bit.

## Performance / 性能

`node web3d/shibuya/bench-halloween.mjs` measures solver step latency (one 0.1 s step, Node 20, one core each, as the browser workers run them; this 8-core container, 2026-10-23, while another job was running):

| solver | agents | step p50 / p95 / p99 / max (ms) | snapshot (ms) | per-frame transfer | realtime factor (p50) |
|---|---:|---|---:|---:|---:|
| Halloween crowd | 48,000 | 36.2 / 54.1 / 66.1 / 89.7 | 10.8 | 1.1 MB | 2.8× |
| dispersal, no control | 16,000 | 11.1 / 30.2 / 37.0 / 65.0 | 16.3 | 0.37 MB | 9.0× |
| dispersal, managed | 16,000 | 9.0 / 19.8 / 28.5 / 30.7 | 8.6 | 0.37 MB | 11.2× |

Process RSS with all three solvers built: 151 MB. Rendering numbers come from the recorder's per-frame log (`recording.json`: draw calls, triangles, ms per frame). The video was captured offline on software WebGL (SwiftShader), so its frame times say nothing about interactive frame rate on a GPU; they are reported only as capture cost.

## Who the video is for / 動画の対象

Not Halloween partiers: people who **work in Shibuya, visitors who are not there for Halloween, and foreign tourists** who need to get home on the night of Oct 31. The Japanese video asks 「10/31 渋谷駅、どう帰る？」; the English one is framed as "Shibuya on Halloween: heads-up". Both end with the question 「あなたならどこから帰る？」 / "Which exit would you take?". One render pass screenshots every frame twice (Japanese and English overlays over the identical 3D frame), so both videos show exactly the same simulated people; `tools/compose_vertical.py` makes 9:16 cuts (the checked 16:9 frame in the middle, large-type bands above and below whose numbers come only from the recorder's per-frame solver log `frames.jsonl`).

## 2026 crowd estimate and sources / 2026年の人出推計と出典

The hook's headline number **≈18,000 is a cited estimate, not a simulation output**: Shibuya City expects the 2026 crowd to be about the same as 2024 (≈18,000 people on the street at the ~22:00 peak), as reported by Shibuya Keizai Shimbun on 2026-09-30. 推計 ≈18,000人は渋谷区の見込み（報道）であり、シミュレーションの出力ではない。The simulated populations (48,000 people in the ~0.8 km area at 21:00; 16,000 at station closing) are **sim assumptions / シミュレーション上の仮定** chosen as a stress test; they measure a different thing (everyone walking in the modelled area, including commuters) and are labelled as such on screen. Figures live in `web3d/shibuya/sources-halloween.mjs`.

| Year | Reported figure | What it measures | Source (outlet, date) |
|---|---:|---|---|
| 2019 | ≈40,000 | ward street count at the peak, Center-gai (pre-COVID) | Shibuya Keizai Shimbun, 2025-10-02, https://www.shibukei.com/headline/19456/ |
| 2023 | ≈15,000 | ward count at 22:00, Center-gai and Dogenzaka | Tokyo Shimbun, 2024-11-01, https://www.tokyo-np.co.jp/article/364102 |
| 2024 | ≈18,000 | ward count at about 22:00 (peak), about +20 % on 2023 | Tokyo Shimbun, 2024-11-01, https://www.tokyo-np.co.jp/article/364102 |
| 2025 | ≈4,200 | ward count at about 21:00 (rainy Friday), lowest since 2019 | Shibuya Keizai Shimbun via Yahoo! News, 2026-09-30, https://news.yahoo.co.jp/articles/83c0f05f26d8d3c86cf0869f7cf991d18d56e48b |
| 2026 | ≈18,000 (expected) | ward expectation: about the same as 2024 at the ~22:00 peak | Shibuya Keizai Shimbun via Yahoo! News, 2026-09-30 (same URL) |

Ward measures shown on the question card (as reported): street drinking banned 18:00–05:00 all year since October 2024 (Tokyo Shimbun 2024-11-01); Hachiko statue fenced off Oct 30 – Nov 1, about 185 private guards and 70 ward staff on Oct 30–31, 19:00–05:00 (Shibuya Keizai Shimbun 2026-09-30). The ward has run "Shibuya is taking a break from Halloween" (渋谷は、ハロウィーンをお休みします) messaging since 2024. Caveats: the 2025 count and the 2026 expectation each rest on one local outlet reporting the ward's press briefing; the 2023 figure is also reported as ≈23,000 elsewhere (Shibukei 2025-10-02, meaning unclear), so we use the Tokyo Shimbun figure for the same hour as 2024. Mobile-location series (LocationMind/Docomo, Intage, Yahoo! DS) use other areas and methods and are not mixed in. No police headcount was found in the sources, so none is shown.

## Per-exit counters / 出口別の混雑

`DISPERSAL.exits` maps the model's station geometry (−z ≈ north, +x ≈ east) onto six exits and routes, each a disc over walkable 1 m cells (first match wins, so nobody is counted twice): **Hachiko exit** (ハチ公口, in front of the Hachiko gate), **Miyamasuzaka** (宮益坂口, in front of the east half of the north face), **Shin-minami / south** (新南口・南側, the south gate and the walk south along the tracks), **Hikarie / east** (ヒカリエ・東側, the east gate and the east side), **Mark City / Inokashira** (マークシティ・井の頭線, the west side towards Dogenzaka) and **Scramble side** (スクランブル側, the junction and its corners). This is an illustrative mapping, not surveyed exit geometry. Every second the solver counts the people in each zone, the densest 3 m cell they stand in, and the time from which no cell in the zone exceeded 2 p/m² ("cleared"); a 5 s series is kept for the charts. The split screen shows the live count per zone as chips (coloured by the densest cell), the exit board shows the cleared time and peak per zone for both strategies, and the question card names the slowest zone of each run — all from the solver snapshot of the frame (`check_overlay`), recounted independently in `verify-halloween.mjs`.

Result for the shipped seed (25 simulated minutes, the exit board in the video; "cleared" = no 3 m cell in the zone above 2 p/m² from then on):

| Exit zone | No control: cleared at (peak) | Managed: cleared at (peak) |
|---|---:|---:|
| Hachiko exit · ハチ公口 | not cleared (4.8 p/m²) | 03:12 (3.9) |
| Miyamasuzaka · 宮益坂口 | 10:59 (4.8) | 11:30 (4.9) |
| Shin-minami / south · 新南口・南側 | not cleared (4.6) | 00:10 (2.2) |
| Hikarie / east · ヒカリエ・東側 | 02:23 (3.2) | 01:34 (2.4) |
| Mark City / Inokashira · マークシティ・井の頭線 | never dense (1.7) | never dense (1.9) |
| Scramble side · スクランブル側 | 02:07 (4.3) | 13:14 (4.2) |

Reading it honestly: the managed run trades a fast-clearing Hachiko and south side for a scramble side that stays dense longer (people are held behind the police line and released per green), while without control the Hachiko plaza and the south side never clear within 25 minutes. Which exit is "best" depends on these illustrative rules; that is the question the video leaves to the viewer.

## Honesty checks

* `verify-halloween.mjs`: displacement per 0.1 s step ≤ walking speed; no teleports/rescues; ≤ 4 (Halloween) / ≤ 5 (dispersal) people per square metre; HUD counts equal recounts of motion codes; reported peak density equals a recount from positions; dispersal remaining/inside/held/left and "densest now" equal independent recounts; people are conserved, emerge only on gate cells and leave only at gateways. Which strategy does better is **not** asserted (see the sensitivity sweep); the only strategy-specific check is that the managed run never holds cars.
* `verify-halloween.mjs` also recounts the per-exit people and densest cell every 5 s and checks that zones never double count.
* `tools/record_shibuya.py --mode halloween`: every frame, each number on screen (HUD, hook, split-screen tiles, exit board, results card and its sweep ranges, question card) is compared with the solver value of that frame (`check_overlay`), and the recording fails on any relocation or density above 5 p/m².
* `tests/test_halloween.py` runs both and checks that the browser and recorder format numbers identically.

## Escape-route sources (v4) / 脱出ルートの出典

On-screen text in `web3d/shibuya/escape-copy.mjs` cites these by outlet name; ids and quotes are in the research log (research-practical.md, 2026-10-23). Walk times are computed from OpenStreetMap (OSRM foot profile, 80 m/min), not quoted. Toei Bus detours were dropped as unverifiable. Railway gate plans for 2026 were not announced as of 2026-10-23; past-year examples are shown with their year.
画面の文言は `escape-copy.mjs` が出典名のみ表示。徒歩時間はOSMからの概算。2026年の改札対策は10/23時点で未発表のため、過去の例は年を明記。

- https://www.shibukei.com/headline/18753/
- https://www.keishicho.metro.tokyo.lg.jp/about_mpd/shokai/ichiran/kankatsu/shibuya/about_ps/kisei.html
- https://www.keishicho.metro.tokyo.lg.jp/about_mpd/shokai/ichiran/kankatsu/shibuya/about_ps/kisei.files/oshirase.pdf
- https://www.city.shibuya.tokyo.jp/contents/koho-news/1621/20261015_bousai.html
- https://www.businessinsider.jp/article/2610-shibuya-halloween-trash-measures-2026/
- https://www.fashionsnap.com/article/2023-10-31/shibuya-halloween
- https://jafmate.jp/car/traffic_topics_20251028_1198272.html
- https://trafficnews.jp/post/89192
- https://trafficnews.jp/post/92628
- https://trafficnews.jp/post/122357
- https://trafficnews.jp/post/133833
- https://www.watch.impress.co.jp/docs/news/1203913.html
- https://www.watch.impress.co.jp/docs/news/1227145.html
- https://toyokeizai.net/articles/-/854907
- https://matcha-jp.com/jp/1166
- https://www.tokyometro.jp/news/2020/205981.html
- https://www.tokyo-tc.or.jp/news/driver/000442/
- https://shibukichi.net/2025/03/27/shibuya_nishiguchi_taxi/
- https://taxieye.net/post-455/
- https://ja.wikipedia.org/wiki/渋谷駅
- https://routing.openstreetmap.de/

## v4 video: 「🧙ハロウィンの渋谷を脱出せよ！🎃」 / "Escape Shibuya on Halloween!"

45 s (42 s scene + 3 s end card), framed as an escape game. Shots (web3d/shibuya/director-halloween.mjs):
hook 0–1 s 「渋谷から脱出できるか？」 over the red DANGER swarm → big title card 1–3 s (all letters in by ~1.75 s,
held, then flies into a persistent header) → MISSION card 3–7 s (≈18,000 = the cited 2026 ward expectation for the
Center Gai streets, not a sim count; the 3D city sinks into a flat game map: buildings capped at 7 m, roads, the JR
station band and street names) → five 6 s levels (Center Gai, Miyashita Park, Hikarie/Meiji-dori, Shibuya Stream,
Dogenzaka/Mark City) → overview of the five example routes 37–39.5 s → 「あなたならどこから帰る？」 39.5–42 s → end card
with every source outlet and date, and one line on why the sim crowd (48,000, whole model area) differs from 18,000.

- Each level: PLAYER START pin, branches A/B/C (station gate, taxi stand or walk to another station), the example
  route lit (no source ranks routes, so it is never called "best"), the sim's walkers on every branch, SIM timer,
  DANGER meter (densest 3 m cell within 6 m of the player, p/m²), ✔/✖ per branch that ends inside the sim area.
  Walks to other stations and the off-sim taxi stretch only reach the sim edge: they say "at sim edge / シミュ範囲の端"
  and never get a ✔.
- Result/VS beat (3.4–6 s of each level): the example route's ESCAPED/CAUGHT (fixed rule in escape.mjs) lands, the
  playback clock fast-forwards until every route's first walker has arrived, and the card compares them (time bar,
  seconds at ≥3 p/m², and "B took r× as long as A" for in-sim routes; r recomputed by the recorder). In the full
  48,000-person run every branch ends ESCAPED, so no CAUGHT screen appears; the contrast is the time and density
  (e.g. Center Gai: A via the Den-en-toshi/Hanzomon Dogenzaka gate vs B across the Scramble to the JR Hachiko gate).
- Hikarie level: the start is on the Meiji-dori sidewalk in front of Hikarie (the model has no walkable deck over
  Meiji-dori, so a start on the station side forced a 389 m detour to a gate 79 m away). verify-escape.mjs fails if a
  gate/taxi route is longer than 2.5 × the straight line.
- Every place, gate, stand, walk time and 2026 measure carries a `*n` mark resolved in the footnote bar of the same
  frame (escape-copy.mjs fact ids → sources-halloween.mjs outlets). The recorder (check_overlay) fails the capture if a
  shown number differs from the escape run, a stamp or VS value differs from the run/rule, a fact id is missing from
  the footnote, unknown or dropped (MEAS-14), the title card is incomplete while held, or a map label leaves the 9:16
  column. The 9:16 footnote leaves out sources only used by the 16:9 status line.
- One capture, four screenshots per frame (ja, en, and the same two with `body.vcut` for the 9:16 cuts);
  tools/compose_vertical.py draws the title, level bar, HUD, callout and footnote bands from frames.jsonl.
