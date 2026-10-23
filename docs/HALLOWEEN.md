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

Metering is not free: people wait inside the station much longer (the station concourse itself is not modelled spatially). The uncontrolled residue is mostly people who left on the far side of the station and walk back around it against the flow; in this model such counter-flow pockets dissolve slowly because nobody exceeds 5 p/m². Gate positions, capacities, gateways and behaviour rules are illustrative.

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

* `verify-halloween.mjs`: displacement per 0.1 s step ≤ walking speed; no teleports/rescues; ≤ 4 (Halloween) / ≤ 5 (dispersal) people per square metre; HUD counts equal recounts of motion codes; reported peak density equals a recount from positions; dispersal remaining/inside/held/left and "densest now" equal independent recounts; people are conserved, emerge only on gate cells and leave only at gateways; the comparison above holds for the shipped seed.
* `verify-halloween.mjs` also recounts the per-exit people and densest cell every 5 s and checks that zones never double count.
* `tools/record_shibuya.py --mode halloween`: every frame, each number on screen (HUD, hook, split-screen panels and exit chips, exit board, results card, question card) is compared with the solver value of that frame (`check_overlay`), and the recording fails on any relocation or density above 5 p/m².
* `tests/test_halloween.py` runs both and checks that the browser and recorder format numbers identically.
