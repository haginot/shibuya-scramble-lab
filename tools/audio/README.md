# tools/audio — procedural soundtrack for the JR編 variants

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
| BGM loops (normalized to -18 LUFS) | `tension` (D minor, 100 BPM, 8 bars, 19.2 s), `calm` (F major, 72 BPM, 26.7 s; relief), `victory` (D major, 120 BPM, 16 s) |
| ambience loops (24 s) | `crowd-night` (-28 LUFS), `station-hall` (-30), `street-quiet` (-32) |
| SFX | `logo_slam whoosh ui_blip ui_select tick tock escaped clear_jingle gameover_jingle red_alert stamp_hit riser heartbeat card_in press_start choice_move crowd_swell` |

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
