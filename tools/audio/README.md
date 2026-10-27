# tools/audio — procedural soundtrack for the JR編 variants and combined episodes

Every sound is synthesized here from code (numpy/scipy, seeded) — no samples, recordings or third-party music.
48 kHz stereo, deterministic: the same cue sheet always gives the same WAV, bit for bit.

```
tools/audio/run.sh mix --cues cues.json --out mix.wav [--report mix.json] [--stems DIR] [--strict]
tools/audio/mux.sh video.mp4 mix.wav out.mp4        # video copied, AAC-LC 192k 48 kHz stereo, length = video
tools/audio/run.sh export_assets --out DIR [--demo] [--analyze]   # every asset as WAV + demo mixes + PNGs
tools/audio/run.sh analyze a.wav ... [--png DIR] [--json out.json] # ebur128 / loudnorm / bands / spectrogram
tools/audio/run.sh selftest                          # what tests/test_audio.py asserts (~10 s)
```
`run.sh` is `uv run --no-project --with numpy --with scipy --with pillow python tools/audio/<tool>.py`.

## Pipeline for one variant
```
node tools/variant_cues.mjs <id> --out W/<id>.cues.json
tools/audio/run.sh mix --cues W/<id>.cues.json --out W/<id>.wav --report W/<id>.audio.json --strict
tools/audio/mux.sh W/<id>-silent.mp4 W/<id>.wav OUT/<id>.mp4
```
A 40 s mix takes about 5–7 s on one core. That covers asset synthesis (≈ 10 s the first time in a process: babble
beds ≈ 1.5–4 s each, BGM loops ≈ 1–2 s each), mastering, and the AAC guard (two ffmpeg encode/decode passes).

## Cue sheet (CONTRACT.md format, as emitted by tools/variant_cues.mjs)
```json
{"duration": 40, "fps": 30,
 "segments": [{"name":"opening","t0":0,"t1":10.5},{"name":"body","t0":10.5,"t1":40}],
 "events": [{"t": 4.2, "sfx": "logo_slam", "gain_db": 0, "duck": 1.6, "duck_db": -14},
            {"t": 4.2, "sfx": "riser", "align": "hit"},
            {"t": 14.2, "sfx": "tick", "repeat": 0.5, "until": 17.5}],
 "bgm": [{"t0": 0, "t1": 10.5, "track": "tension"}, {"t0": 10.5, "t1": 25, "track": "tension"}],
 "amb": [{"t0": 0, "t1": 40, "bed": "crowd-night"}],
 "duck": [{"t0": 28, "t1": 40, "depth_db": -5}]}
```
* events: `t`, `sfx`, `gain_db`. Optional fields: `duck` (s of BGM ducking from t), `duck_db` (default -9), `pan`,
  `repeat` + `count`|`until`, and `align:"hit"`, which places the sound so that its hit lands on t (riser: 1.8 s
  before; escaped: 0.32 s; clear_jingle: 0.54 s).
* bgm / amb runs: `t0`, `t1`, `track`/`bed`, `gain_db`. Optional: `fade_in` (bgm 0.5 / amb 0.8), `fade_out`
  (1.0), `offset` (loop phase). When two runs of the same track touch, they play as one continuous loop with no
  fade at the join. A run that ends on a segment boundary and doesn't continue fades out over 0.8 s *after* the
  boundary. So nothing before the boundary depends on the body.
* duck: `{t0, t1, depth_db}` lowers the BGM bus, and the ambience by 35 % of the depth. Ramps start at t0: 60 ms
  down, then 350 ms back up after t1.
* segments (or `--split 10.5`): each segment is mastered on its own. That makes **the shared opening
  sample-identical in every variant**, and selftest checks it. The body's gain glides in over 300 ms after the
  boundary.
* By default, unknown names print a warning and are skipped. With `--strict` they are an error.
* Tolerance: an event's time can be `t` or `at`. Names go through alias tables (`zombie-groan`, `roar`, `black`,
  `smash`, `yes`, … in `sfx.ALIASES`; `continue`/`light` → `retry` in `music.ALIASES`). A `null`/`"none"` track
  or bed means silence. Unknown keys are ignored.

## Combined episodes (~70 s: opening + GAME OVER → caught → CONTINUE? → CLEAR → kaiju → end card)
The cue sheet needs no new fields. Three rules handle the new beats on their own, and each can be overridden per
event:
* **AUTO_DUCK.** `crowd_press`, `zombie_groan[_b]`, `caught_hit`, `red_flash`, `kaiju_rumble` and `kaiju_roar`
  duck the BGM by -20…-26 dB for their own length (at most 4.5 s), unless the event sets `duck` itself
  (`"duck": 0` turns this off). The BGM is effectively off in the caught and kaiju beats even if the sheet still
  has a track there. The kaiju beat should still use `bgm: null`.
* **Hard cuts.** `cut_black` chops every SFX that started before it, with a 6 ms fade. It then holds the BGM and
  ambience buses at zero for `silence` s (default 0.4), and they ramp back (BGM 0.35 s, ambience 0.6 s) if their
  runs continue. The `cut_black` sound itself is a 0.2 s dull thunk, so the rest of the black is true silence.
  `smash_cut` (place it with `align:"hit"`; the hit is 0.1 s in) chops earlier tails at the hit and dips
  BGM/ambience to zero with a 0.25 s recovery. Per-event fields: `silence`, `chop:false`. A top-level
  `"silence": [{t0, t1}]` is a cut at t0 that holds for t1 - t0.
* **CONTINUE? bed.** A countdown (`continue_tick` … `continue_yes`) with no BGM run over it gets the light
  `retry` bed automatically, at -2 dB, starting just before the first tick and running to ~1 s after YES (or to
  the next BGM run if that starts within 2 s). mix prints a note when it does this. Set `"auto_bgm": false` to
  turn it off. An explicit beat `bgm:'retry'` is better.
* **Track switches inside a segment** crossfade across the boundary: the old run rings on 0.5 s past it and fades
  over 0.8 s, and the new run fades in over 0.25 s. Before this change the old run faded out before the boundary
  and the new one faded in after it, which left a ~10 dB dip, e.g. at lesson (calm) → CONTINUE? (retry). Segment
  seams (the shared opening) keep the SEAM_TAIL rule, so the opening stays sample-identical. It is checked
  bit-identical against `variants/render/gate-over/mix.wav`.

Demo: `tools/audio/demo/demo-combined.json` is a mock gate cue sheet. It has the 16 beats of the combined
CONTRACT, 69.7 s in total. The reused beats are remapped from the real gate-over/clear sheets, and the new beats
use the proposed auto cues below. It masters to -14.0 LUFS, -1.5 dBTP (WAV), and -14.1 LUFS, -1.2 dBTP as
AAC 192k.

Proposed cues for the new beats. Times are beat-local; `buildCues` / beat `cues` emit them:
| beat / component | cues |
|---|---|
| shot `caught-pov` (flashAt F=1.75, blackAt B=2.15) | 0 `crowd_press` · .2 `zombie_groan` pan -.6 · .55 `heartbeat` -6 dB · .9 `zombie_groan_b` pan +.6, -2 dB · 1.15 `heartbeat` -3 dB · F `red_flash` + `caught_hit` · B `cut_black` |
| `stamp` with `onBlack` | the same as `stamp`: .16 `stamp_hit` (duck 2.4 s, -12 dB) + .21 `gameover_jingle` |
| `continue` {count n, dur} | .02 `card_in` · `continue_tick` at .3 + k·(Y-.3)/n for k = 0…n-1 · Y = dur - .9: `continue_yes` (duck .8 s, -6 dB) · beat `bgm:'retry'` |
| shot `kaiju-skyline` (roarAt R) | 0 `kaiju_rumble` · R `kaiju_roar` `align:'hit'` · beat end `smash_cut` `align:'hit'` · beat `bgm:null` |
| `gag` | at its `at` + .05: `boing` -2 dB (optional) |
| `endcard` | .02 `card_in` · .3 `end_sting` `align:'hit'` |

## Master
Each segment is normalized to **-14 LUFS integrated** with our own ITU-R BS.1770-4 meter. It agrees with ffmpeg
ebur128 to within 0.05 LU. After that, each segment goes through a look-ahead true-peak limiter (4× oversampled,
3 ms attack, 80 ms hold/release, ceiling -1.5 dBTP). We iterate until the result lands within 0.05 LU of the
target. Then the **AAC guard** runs. It encodes the segment with ffmpeg's AAC encoder at 192k, decodes it, and
adds a few ms of extra gain reduction wherever the codec overshoots. This keeps the decoded AAC at ≤ -1.2 dBTP;
without it, ffmpeg's AAC overshot by up to +2 dB on the logo slam. You can skip it with `--no-aac-guard`.
`--report` writes the internal and ffmpeg measurements, limiter gain-reduction stats and the resolved runs.

## Assets (all original)
| kind | names |
|---|---|
| BGM loops (normalized to -18 LUFS) | `tension` (D minor, 100 BPM, 8 bars, 19.2 s), `calm` (F major, 72 BPM, 26.7 s; relief), `victory` (D major, 120 BPM, 16 s), `retry` (F major, 120 BPM, 4 bars, 8 s; the light CONTINUE? bed, aliases `continue` and `light`) |
| ambience loops (24 s) | `crowd-night` (-28 LUFS), `station-hall` (-30), `street-quiet` (-32) |
| SFX | `logo_slam whoosh ui_blip ui_select tick tock escaped clear_jingle gameover_jingle red_alert stamp_hit riser heartbeat card_in press_start choice_move crowd_swell` |
| SFX, combined episodes | `crowd_press zombie_groan zombie_groan_b caught_hit red_flash cut_black continue_tick continue_yes kaiju_rumble kaiju_roar boing smash_cut end_sting` |

* The loops are exact: note events are wrap-added, continuous layers are periodic by construction, and the reverb
  is a circular convolution. selftest checks the seam.
* The crowd murmur is synthetic Japanese-vowel babble: a glottal source fed through a/i/u/e/o formant banks, with
  syllable envelopes and talk/pause phrasing. It is synthesized at 16 kHz, so it has nothing above 8 kHz.
* It contains no announcements, departure melodies, gate beeps or real alert tones.
* `red_alert` is a game-style sting: buzzy detuned saws dropping in pitch over a drum hit. It has no sine chimes,
  ascending bell arpeggios or sirens, so it can't be mistaken for a J-ALERT / NHK / municipal alert.
* `gameover_jingle` is a light toy-box "aww": a music-box phrase drooping into a soft D minor chord. It is not a
  death sting.
* The music deliberately avoids genre clichés that identify specific works. There is no alternating
  semitone bass ostinato, no 5/4 piano figure and no tubular-bell pattern. All melodies are written out in
  `music.py` / `sfx.py`.
* Combined-episode sound design:
  * `zombie_groan` / `_b` are cartoon *game* creatures, not horror-film growls. A buzzy source runs through
    moving o/u formants, a little sample-and-hold grit and a heavy 950 Hz low-pass, which gives a muffled, bouncy
    "mmmuh-uh".
  * `crowd_press` is babble that gets nearer and more muffled while the stereo image narrows, over cloth rustle,
    shuffling feet and a low swell.
  * `caught_hit` is a soft pillow-like "whump" (no crunch) followed by one last heartbeat "lub" without its
    "dub".
  * `kaiju_roar` is an **original, silly bellow**: a tuba/foghorn-like harmonic brass tone with a scoop up, a wide
    warbly vibrato, an oo→aa vowel and a kazoo buzz, then a comic "hic!" and a deflating fall, all within ≈1.75 s (bellow
    .95 s, hic at 1.0, fall 1.2–1.7) so the whole gag lands before the kaiju beat's smash cut (cue at roarAt 1.85). It is tonal, with
    0.02 % of its energy above 3 kHz and a centroid around 320 Hz. It has no noise screech or resonant scrape, so
    it is nothing like any famous film-monster roar (selftest checks the spectrum).
  * `kaiju_rumble` is a low swell with gravel trickles and two weight shifts.

## v6 「渋谷Halloweenには近づくな」 (2026-10-27, ~88 s: opening with mission card + first choice → TRUE END → guide → combined body → GOODBYE end card)
New SFX (all original, procedural; `sfx.REQUIRED_V6`) and what `variant-system.mjs autoCues` emits for them:
| sfx | component / beat | what it is |
|---|---|---|
| `mission_in` | `mission` card (opening, 3.5 s) at +.02 | air swell into a soft felt "dum" + open-fifth bell D4/A4 + low pad: an instruction, not an alert (hit at .12 s) |
| `choice_pick` | `choice` card mode (first-choice) at pickAt | warm low mallet G5→C6 + bell: the calm "right answer" confirm (card mode has no countdown ticks) |
| `seal_stamp` | `stamp` kind `TRUE_END` at STAMP_DROP | soft wooden/wax "thock" + gold shimmer (no rubber slam) |
| `true_end_jingle` | `stamp` kind `TRUE_END` at STAMP_DROP+.05 | Eb major plagal "amen" (IV→I), celesta C6–Bb5–G5, warm low pad, no drums; ≈3.6 s + tail. Distinct from clear_jingle (D major, plucks, taiko): selftest checks the pitch-class profiles |
| `guide_in` | `guide` card at +.02 | soft page/map unfold |
| `goodbye_in` | `goodbye` end card at its t0 | one low felt-piano chord, no sting. **Soft cut** (`mix.CUT_DEFAULTS`): earlier SFX tails (the kaiju gag) are chopped at the card, beds dip/recover |
New BGM `farewell` (aliases goodbye/outro/ending): Bb major 66 BPM 4-bar loop (14.5 s), no drums, house trim -4.5 dB
(`music.TRACK_TRIM`) so the long end-card read stays calm. Beds: first-choice / true-end `calm`, amb none (no crowd under
the TRUE END); goodbye + sources `farewell`, amb none.
`mix.lint_v6(cues)` (runs in every mix, warnings in the report's `lint`; `--strict-lint` makes them errors): no gag/scare
SFX (`sfx.COMEDIC`) sounding over the goodbye/sources cards, a calm bed under goodbye, no crowd bed / tension under
true-end. The report also has per-beat loudness (`beats`, from `meta.beats`). Demo sheet: `demo/demo-v6.json` (88.2 s).
