# JR編 combined episodes (GAME OVER → CONTINUE? → CLEAR → kaiju gag)

One video per route pair (`gate`, `taxi`, `zone`, `alt`) = **shared opening** (the pinned 14.2 s render, reused as is) +
**combined body** (55.5 s): the GAME OVER run ends in a 2.5 s caught sequence and a GAME OVER stamp on black with a safety
line. Then the real lesson, a CONTINUE? retry beat, the CLEAR run with its practical cheat sheet, an absurd kaiju gag, an
end card with the closing question, and a sources card with the union of both runs' sources. Every video is 69.7 s,
JP, 9:16, 1080×1920, 30 fps, H.264 yuv420p + AAC 48 kHz stereo at about −14 LUFS. Most of the body is **copied frames**
from the existing variant renders. Only the new beats are rendered (≈ 17–23 s per pair).
Variant system: `docs/VARIANTS.md`. Contract: `combined/CONTRACT.md` (logs).

## One command

```sh
tools/render_combined.sh check            # configs == generator, combined validator (+ parts), reuse maps, source bodies, pinned opening
tools/render_combined.sh plan [<pair>]    # pieces + segment plan of the NEW ranges (fails if a segment would exceed 45 min)
tools/render_combined.sh zone             # → /workspace/demos/halloween-escape-series/jr-combined/zone.mp4 + zone-contact.jpg
tools/render_combined.sh all              # gate taxi zone alt
tools/render_combined.sh stills zone 16.5,38.4 | new   # preview PNGs at BODY seconds ('new' = every new beat); AGENTS=8000 default
tools/render_combined.sh contact zone
SMOKE=1 tools/render_combined.sh gate     # no browser: not-yet-rendered new beats = black frames; everything else for real
MAX_SEGS=1 tools/render_combined.sh zone  # render one missing segment, exit 3 (re-run → next); the last run joins + mixes
```

What `tools/render_combined.sh <pair>` does (`$WORK/<pair>/`, WORK default `…/logs/ssl-claude-halloween/combined/render`):

1. **Validate**: `node tools/variant_cues.mjs combined/<pair> --check` (combined rules + all the variant text/fact rules, with
   both part configs loaded). **Reuse map**: `--reuse-map` → `map.json` (per beat reuse/new, merged *pieces*). **Sources**:
   `tools/combined_pipeline.py sources` locates `$SRC/<variant>/body-*/body.mp4`, the non-`-test` dir (the one in
   `concat.txt` if several). It asserts 1080×1920 yuv420p 30/1, 840 frames, and beat edges equal to the config's timeline →
   `sources.json`. The pinned opening must have 426 frames. Cue sheet `cues.json` + `timeline.json`.
2. **Render only the NEW pieces**: consecutive new beats form one piece, rendered with
   `tools/record_variant.py --variant combined/<pair> --part body --start-frame a --end-frame b` in segments of ≤ 300 frames.
   Each segment is its own browser session behind `flock /tmp/ssl-halloween-browser.lock`. Segments are fragmented MP4.
   A segment counts as done only when its frame count matches, so a re-run resumes. Then the segments are concatenated with
   `-c copy` → `body-<key>/new-<f0>-<f1>.mp4`. Wall time per segment goes to `seg-NN.wall` and `report.json`.
3. **Join**: `tools/combined_pipeline.py join` decodes, in timeline order, the pinned opening, every reused range
   (`trim=start_frame:end_frame`, frame-exact) and every new piece. The raw yuv420p goes down **one pipe into one libx264
   encode** (crf 16, `-preset medium`, 30 fps, yuv420p). Each piece's frame count is asserted from the byte count.
4. **Audio**: `tools/audio/run.sh mix --strict` on the combined cue sheet. The cue sheet covers opening + the whole combined
   body. Reused beats keep their source cues at the same beat-local times. The opening is mastered as its own segment.
   Then `tools/audio/mux.sh` (AAC 192 k).
5. **Verify** (`combined_pipeline.py accuracy` + `verify`):
   - frames 2091, `1080,1920,yuv420p,30/1`, `aac,48000,2`;
   - EBU R128 −15.5…−12.5 LUFS and true peak ≤ −1 dBTP;
   - frame accuracy: the first and last frame of the opening and of every reused piece are compared with the source frame
     and its ±1 neighbours (PSNR on a luma thumbnail). The exact frame must be the best match at ≥ 30 dB.

   Results go to `report.json` (+ map, sources, join, accuracy, segments, mix). Then the contact sheet
   `<pair>-contact.jpg`: OP frames, every combined beat labelled (caught press / hands / red flash / black, GAME OVER on
   black, CONTINUE? 3 / YES, kaiju rise / roar, end card, sources) and, for zone/alt, the **FIX frame** (the moment QA
   flagged, 27.6 s in the original clear video).

Env: `OUT`, `WORK`, `SRC` (source renders, read only), `OPENING_MP4` (pinned), `SEG_FRAMES` (≤ 300), `MAX_SEGS`, `AGENTS`,
`PR`, `PYBIN`, `CRF`, `X264_PRESET`, `BROWSER_LOCK`, `SMOKE`. SMOKE output goes to `$WORK/smoke/` (never the deliverables).

### Pieces and segment plan (`plan`)

| pair | reused (frames) | NEW pieces (body frames) | render jobs (est., full crowd) |
|---|---|---|---|
| gate, taxi | 0–450, 585–735, 825–1275, 1275–1380 | caught+over-stamp 450–585 · continue 735–825 · kaiju+endcard+sources 1380–1665 | 13 + 12 + 25 min |
| zone, alt | 0–450, 585–735, 825–1080, 1275–1380 | the same + clear-result+clear-stamp 1080–1275 (the fixes) | 13 + 12 + 18 + 25 min |

## Config

`web3d/shibuya/series/variants/jr/combined/<pair>.json`. It sits in a subdir, so `render_variant.sh all/--list/check` skip it.
The page loads it with `variant=combined/<pair>`. The configs are **generated** by `node tools/combined_configs.mjs --write`
from `<pair>-over.json` + `<pair>-clear.json` + `_opening.json`. Edit the generator (COPY / FIX / new beats) and re-run;
`--check` (also run by `render_combined.sh check` and the tests) fails when a file differs.

Schema = the variant schema plus `kind:'combined'`, `outcome:'COMBINED'`, `parts:{over, clear}`. Config-level `lesson` comes
from the over run, `cheat` from the clear run, `sources` is the union, and `choice` is the over run's. Beat extensions:

| field | meaning |
|---|---|
| `reuse:{variant, beat}` | frames copied from that variant's rendered body (dur must equal the source beat's) |
| `origin:{variant, beat}` | a NEW render that re-shoots a source beat (only clear-result / clear-stamp: the zone/alt fixes) |
| `vt0` | video time (s) of the background solver crowd at the beat start; default opening + body t. Copied/re-shot beats use the source's, so a re-shot beat sees the same crowd |
| `clock:{set:'HH:MM:SS', rate}` | `set` also takes seconds (fractional game minutes): the re-shot beats continue the original clock exactly; `clear-choice` rewinds the clock (= retry) |
| `fix` | note on re-shot beats (contact-sheet label) |
| `footnote:false` | no page footnote on this beat (the end card shows its own credit line) |
| choice item `picked` | per-run pick (over-choice = A, clear-choice = B) |

Copied and re-shot beats are self-contained. The generator writes the source beat with an explicit `shot.t0` (camera-path
time), `crowd.t0` + `restart`, `clock`, `vt0`, `bgm`/`amb`, so each one also renders on its own exactly like its source.
`tests/test_combined.py` checks frameSpec equality with the original.

Beats (binding order, `variant-system.mjs COMBINED_BEATS`):

| # | id | s | source | content |
|---|---|---|---|---|
| 1–4 | over-start/choice/move/result | 2.5/4/4.5/4 | reuse `<pair>-over` | the GAME OVER run |
| 5 | caught | 2.5 | NEW `caught-pov` | base = the over-result shot (+ board for alt), baseT0 = its end; crowd `caught-press` (base = over-result crowd); sim chip until the flash 1.75 s, black at 2.15 s; header/clock off, BGM off; explicit cues crowd_press, zombie_groan(_b), red_flash, caught_hit, cut_black |
| 6 | over-stamp | 2 | NEW `black` | GAME OVER `onBlack` + the over stamp text + `safety` line; header/clock/BGM/amb off |
| 7 | over-lesson | 5 | reuse `<pair>-over`/lesson | the real lesson card |
| 8 | continue | 3 | NEW `continue-bg` | HUD `continue` (count 3, `yesAt` 1.6 = HUD continueTiming: ticks .34/.76/1.18, subline from 1.76; BGM `retry`; auto cues: card_in, continue_tick ×3, continue_yes) |
| 9–12 | clear-choice/move/result/stamp | 4/4.5/4/2.5 | reuse `<pair>-clear`; zone/alt result+stamp re-shot (`origin`) with the fix | the CLEAR run |
| 13 | clear-cheat | 3.5 | reuse `<pair>-clear`/cheat | practical directions |
| 14 | kaiju | 4 | NEW `kaiju-skyline` {rise [.15, 1.7], roarAt 1.85, roarDur 1.35} | `gag` caption from 2.5 s; header/clock/BGM off; cues kaiju_rumble, kaiju_roar at 1.85 (1.75 s: bellow, hiccup at +1.0 = the punchline, deflating fall; over by ≈3.6 s, before the smash cut); kaiju: 2 uneven eyes + big tilted striped party hat |
| 15 | endcard | 2.5 | NEW `card-bg` | HUD `endcard` (closing question + sub, own credit, `footnote:false`); auto cues smash_cut (align hit) + end_sting |
| 16 | sources | 3 | NEW `card-bg` | HUD `sources` `compact:true`, union of both runs, both runs' notes; parody/fiction note + 「出典：国土交通省 PLATEAU…」 credit (HUD) |

Fixes (re-shot beats; finalised by the integrator 2026-10-26, checked on page stills):
- **zone** clear-result/stamp: `crowd.params.clear = {ahead:8, behind:1.5, half:2.4, ease:3}`. detour-light walkers in the cone
  ahead of the eye camera side-step out of frame (crowd-variants.mjs `clearCone`). The camera is unchanged.
- **alt** clear-result/stamp: `alt-platform` board framing `{pan:0, side:3, dist:7.5, push:.05, fov:56, lookDy:-.6}` (shots-variants.mjs).
  The board holds at screen y≈.32–.52, fully below the header + clock and above the captions; no canopy light strip.

### Validation (`validateCombined`, inside `validateConfig` for `kind:'combined'`)

Errors:
- beat ids / order ≠ COMBINED_BEATS;
- a copied beat without the right `reuse` (or `origin` for clear-result/stamp), or a new beat with `reuse`;
- GAME_OVER stamp outside over-stamp, or a CLEAR/ESCAPED stamp outside clear-stamp; missing stamps;
- over-stamp / caught / kaiju with a header; caught / kaiju with a clock; kaiju with BGM;
- missing continue / endcard / sources / lesson / cheat / choice items; both runs picking the same option.

With the part configs (CLI, tests), also errors on:
- an invalid pair, or a pick that differs from the source run;
- a source beat that is missing or has a different duration;
- `sources[]` that is not the union of both runs.

The video (opening + body) must be 60–80 s. All variant rules still apply: banned names, real-alert wording, sims labelled
シミュレーション, fact label rules, 「おすすめ」 banned, lesson factIds, cheat ≥ 3 s.

Warnings: new-beat shot keys or durations that differ from the contract; clear-result and clear-stamp not both reused or both
re-shot.

Recorder (`record_variant.py`): `--variant combined/<pair>`. The plan check accepts 60–80 s for combined ids. All per-frame
checks are unchanged: stamps only in their beat, GAME OVER wording nowhere else, sims labelled, claims ⊆ footnote, parody note
on the sources card.

## Page API additions (variant-system.mjs frameSpec)

- `spec.vt`: background-solver video time (`beat.vt0 + local`, else `plan.offset + t`). The page should step the solver
  and animate with `spec.vt` (camera owner integration).
- `spec.footnote`: false on beats with `footnote:false`.

## Copy (tools/combined_configs.mjs COPY)

| pair | caught chip | safety line | CONTINUE sub | kaiju gag | end card |
|---|---|---|---|---|---|
| gate | 囲まれて動けない（シミュレーション） | 混雑の中で立ち止まると危険 | 別の改札でやり直す | えっ、／ボス戦あるの!? | あなたなら、どう帰る？／改札はひとつじゃない |
| taxi | 押し寄せて動けない（シミュレーション） | 人が集まる場所で立ち止まり続けない | 別の乗り場でやり直す | それ／タクシーじゃない! | あなたなら、どう帰る？／乗り場はひとつじゃない |
| zone | 人の波にはさまれた（シミュレーション） | 密集の中で立ち止まると危険 | 外側を回ってやり直す | 隠しボス／出現!? | あなたなら、どう帰る？／最短が近道とは限らない |
| alt | ホームで囲まれた（シミュレーション） | 混雑したホームで立ち止まると危険 | 反対側の駅でやり直す | 終電より／デカいの来た | あなたなら、どう帰る？／終電の時刻は駅ごとにちがう |

The safety lines are plain game advice: no numbers, no fact claims. The over stamp sub line is the over run's own (sourced or
labelled シミュレーション). Rules as in `docs/VARIANTS.md`:
- no gore;
- ordinary / costumed people never attack; zombies are fictional game creatures, only suggested (VFX);
- the kaiju is original (round, no spines, no breath weapon) with an original roar;
- no real film or game names;
- no persistent ※パロディ label; the parody/fiction note is on the sources card.
