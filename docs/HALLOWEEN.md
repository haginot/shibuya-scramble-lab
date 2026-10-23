# Halloween night mode / ハロウィンナイトモード

`web3d/shibuya/?mode=halloween` — the same PLATEAU/OSM city, SUMO traffic, scramble signal and individual social-force walkers as the normal mode, with a Halloween crowd, police crowd control and a station-closing dispersal comparison. **Toy model scaled to public statistics, not a prediction.** Every parameter below is an assumption (see `HALLOWEEN` in `halloween.mjs` and `DISPERSAL` in `dispersal.mjs`).

```bash
uv run shibuya-scramble-lab serve --no-llm --no-open   # then open /web3d/shibuya/?mode=halloween
bash tools/record_halloween.sh                          # 44 s video, 1280×720, 30 fps
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

16,000 people: 9,000 still inside the station, 7,000 on the Hachiko plaza. People emerge from four station gate lines (Hachiko 9, Central 8, South 6, East 4 p/s at full capacity, assumption) only onto a gate square metre with room, and count as *left* only when they reach a gateway on foot: the outer end of the connected sidewalk network in each 45° direction (60–160 m out; the modelled sidewalks are cut where unmodelled side roads cross them). Both runs use the same seed and the same people.

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

## Honesty checks

* `verify-halloween.mjs`: displacement per 0.1 s step ≤ walking speed; no teleports/rescues; ≤ 4 (Halloween) / ≤ 5 (dispersal) people per square metre; HUD counts equal recounts of motion codes; reported peak density equals a recount from positions; dispersal remaining/inside/held/left and "densest now" equal independent recounts; people are conserved, emerge only on gate cells and leave only at gateways; the comparison above holds for the shipped seed.
* `tools/record_shibuya.py --mode halloween`: every frame, each number on screen (HUD, hook, split-screen panels, results card) is compared with the solver value of that frame (`check_overlay`), and the recording fails on any relocation or density above 5 p/m².
* `tests/test_halloween.py` runs both and checks that the browser and recorder format numbers identically.
