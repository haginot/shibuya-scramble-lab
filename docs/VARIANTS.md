# JR編 branching variants (CLEAR / GAME OVER)

Every variant video is **shared opening + variant body**, JP, 9:16, 1080×1920, 30 fps, H.264 yuv420p + AAC 48 kHz
stereo (≈ −14 LUFS), 30–45 s. The opening is rendered once and copied packet-for-packet into every variant; its audio is
mastered as its own segment so it sounds identical in every variant. Everything is a parody / fiction — see the rules
at the end (HAGINO steering 2026-10-26: no persistent ※パロディ label; a small 「フィクション」 corner tag during the
fictional operator notice of the cold open + a parody/fiction note on every sources card).

## One command

```sh
tools/render_variant.sh gate-over        # → /workspace/demos/halloween-escape-series/jr-variants/gate-over.mp4 + gate-over-contact.jpg
tools/render_variant.sh all              # every config in web3d/shibuya/series/variants/jr/ (files not starting with _)
tools/render_variant.sh check            # validate every config + every CLEAR/GAME OVER pair (no browser)
tools/render_variant.sh plan gate-over   # segment plan
tools/render_variant.sh stills gate-over 1.5,6,12.2 [body|opening]   # preview PNGs + timing.json (part seconds)
tools/render_variant.sh opening          # render / verify the cached shared opening only
tools/render_variant.sh contact gate-over
```

What `tools/render_variant.sh <id>` does:

1. `node tools/variant_cues.mjs <id> --check` — the config (and the opening) must validate.
2. **Opening**: cache key = `variant_cues.mjs --opening-key` (stable JSON of `_opening.json` + hash of every module /
   data file that changes its pixels). If `$WORK/opening-<key>/opening.mp4` has the right frame count it is reused,
   otherwise it is rendered in segments.
3. **Body**: `$WORK/<id>/body-<key>/` (key also covers the opening config), segments of `SEG_FRAMES` frames
   (default 300 = 10 s ≈ 10–20 min each, far below 2 h). Each segment is its own browser session
   (`tools/record_variant.py --start-frame a --end-frame b`), written as **fragmented MP4**; a segment counts as done
   only when its frame count matches, so re-running the same command **resumes** where it stopped.
4. Concat opening + body (`-c copy`), cue sheet → `tools/audio/run.sh mix` (BGM / SFX / ambience, ducking, −14 LUFS,
   opening mastered separately) → `tools/audio/mux.sh` (AAC 192 k). Without `tools/audio/` a silent AAC track is muxed.
5. Verify (frame count, 1080×1920 yuv420p 30/1, AAC 48 kHz stereo, opening packets byte-identical via `framemd5`)
   → `$WORK/<id>/report.json`; contact sheet `<id>-contact.jpg` with explicit, labelled times: OP first frame, OP
   flythrough, logo slam, logo hold, PRESS START, prologue cards, then every body beat (choice + selected, stamp, lesson,
   cheat sheet, sources).

Segment plan: `SEG_FRAMES=300` (default) → opening 2 segment jobs (≈22 + 11 min), body 3 jobs (≈26 + 25 + 20 min), each a
separate browser session ≤ 45 min (measured s/frame per shot in the header of `tools/render_variant.sh`; `plan <id>` prints
the estimate and fails above 45 min). `MAX_SEGS=1 tools/render_variant.sh <id>` renders one missing segment and exits 3
(re-run → next segment), so a scheduler can run one ≤ 45 min job at a time; the last run concatenates, mixes and muxes.

Test mode: `BODY_FRAMES=N OUT=/tmp/x WORK=/tmp/w tools/render_variant.sh <id>` renders the full (cached) opening + only
the first N body frames through the whole pipeline (segments, concat, audio, mux, verify incl. loudness).
`report.json` also records EBU R128 loudness (integrated LUFS, LRA, true peak); verify fails outside −15.5…−12.5 LUFS.

Env: `OUT` (deliverables, default `/workspace/demos/halloween-escape-series/jr-variants`), `WORK` (segments + cache,
default `/workspace/projects/logs/ssl-claude-halloween/variants/render`), `SEG_FRAMES`, `AGENTS` (smaller crowd —
previews only), `PR` (WebGL pixel ratio), `OPENING` (opening config id), `OPENING_KEY` (pin the opening cache).

The precomputed JR crowd run is reused from the pilot cache (`tools/precompute_series_jr.mjs`, printed "cached").

## Page

`web3d/shibuya/?mode=series&ep=jr&variant=<id>&part=opening|body&lang=ja&aspect=v[&record=1][&opening=<id>][&agents=N][&pr=1]`
(the pilot URL without `variant` still runs `series/app-jr.mjs`). Without `record=1` the part plays live in a browser.

| module | role |
|---|---|
| `series/variant-system.mjs` | pure: validate config, timeline (`buildPart`, `videoPlan`, `beatAt`), per-frame spec (`frameSpec`), footnote / sources rows, cue sheet (`buildCues`), cache hashes |
| `series/app-variant.mjs` | the page: frameSpec → `SHOTS[key](ctx, params)(local)` → `applyEnv` → background solver crowd → crowd state → near people → 3D logo → post → `GameHUD` |
| `series/scene-jr.mjs` | the shared world (same as the pilot): city + PLATEAU LOD2 realism, station, landmarks, wide area, vehicles, police set, live JR solver crowd, interior people, variant set pieces |
| `series/shots-variants.mjs` | `SHOTS` registry (3D role) — unknown key → `aerial` |
| `series/crowd-variants.mjs` | `CROWD_STATES` (crowd role) — unknown key → no state people |
| `series/ui/components.mjs` | `GameHUD` + components (HUD role) — unknown component → plain caption; missing module → plain text |
| `series/opening.mjs`, `series/ui/logo3d.mjs` | OP choreography + 3D logotype (title role) |
| `tools/variant_cues.mjs` | node CLI: config → cue sheet + timeline, `--validate-all`, `--list`, cache keys |
| `tools/record_variant.py` | deterministic capture + per-frame checks, stills, contact sheet |
| `tools/render_variant.sh` | the one command |

Recording API: `window.__variantPlan`, `await window.__warmup(t)` (solver to the segment start, shaders compiled, two
warm-up renders at t — the first captured frame is a real image, never black), `await window.__frame(t)` (part time),
`window.__variantOverlay` (per-frame record).

Background crowd: the live JR solver stepped to JR time `−12 s + video time` (opening and body share one clock, so a
body segment simply catches up). Crowd-state people (`crowd` of a beat) are drawn with `people-close.mjs` and their
`regions` hide the solver crowd there; solver agents within 18 m of an eye-level camera are swapped to the detailed
near-people model too.

## Config schema

Files: `web3d/shibuya/series/variants/jr/_opening.json` (shared opening), `<id>.json` (one per variant body),
`_sample.json` + `_sample-opening.json` (test fixtures; the page uses `_sample-opening` when `_opening.json` is missing).

```json
{
 "id": "gate-over", "episode": "jr", "pair": "gate", "outcome": "GAME_OVER",
 "title": {"ja": "ハチ公改札に直行したら…"},
 "start": {"place": "hachiko-square", "ja": "スタート：ハチ公前広場", "factIds": []},
 "clock": {"start": "22:10", "ja": "ゲーム内時刻（架空）", "rate": 1},
 "choice": {"prompt": {"ja": "どの改札へ向かう？"},
            "options": [{"key": "A", "ja": "ハチ公改札", "factIds": []}, {"key": "B", "ja": "新南改札", "factIds": []}], "picked": "A"},
 "beats": [
  {"id": "start", "dur": 3.0, "shot": {"key": "topdown", "params": {}}, "crowd": {"key": "hachiko-peak"},
   "hud": [{"c": "mission", "ja": "…", "factIds": []}, {"c": "sim", "ja": "人の流れ＝シミュレーション", "factIds": []}],
   "cues": [{"at": 0, "sfx": "ui_blip"}]}
 ],
 "lesson": {"ja": "見出し\n点1\n点2", "factIds": ["…"]},
 "cheat": {"rows": [{"ja": "…", "factIds": [], "tone": "ok|ng"}]},
 "sources": ["fact ids"],
 "bgm": "tension|calm|victory", "amb": "crowd-night|station-hall|street-quiet",
 "routes": {"DETOUR-1": {"points": [[x, z], …]}}
}
```

Beat fields:

| field | meaning |
|---|---|
| `id`, `dur` | unique id; seconds (rounded to whole frames at 30 fps) |
| `shot` | `{key, params?, t0?}` — `SHOTS` key + params (shots-variants.mjs header); `t0` offsets the shot's local time (explicit). Without `t0`, a beat whose shot has the same key + params as the previous beat **continues** the move (no jump back at the cut); `cut:true` restarts it |
| `crowd` | `{key, params?, t0?, rate?, restart?}` — `CROWD_STATES` key; the state time continues across consecutive beats with the same key (unless `restart`) |
| `hud` | items `{c, ja?, factIds, at?, until?, …component fields}`; `at`/`until` = seconds within the beat (default whole beat); the component gets `t` = local − at, `dur` = until − at. `{c:'sim', crowd:'<item id>'}` takes its text from the crowd state's HUD item (labelled シミュレーション). `{c:'pin', world:[x,y,z], ja}` is projected to the screen (dropped when off-screen). `{c:'logo', press?, outAt?, outDur?, seq?, params?}` runs the 3D logotype (time continues across consecutive logo beats) |
| `cues` | `[{at, sfx, gain_db?, duck?, duck_db?, repeat?, count?, until?, align?}]`, `at` within the beat. **Omitted → automatic cues** from the HUD items (logo: whoosh/riser/logo_slam; press-start: press_start + ui_select; choice: card_in, ticks until the pick, choice_move ×2, ui_select; stamp: stamp_hit + gameover_jingle / clear_jingle / escaped; cards: card_in; captions / sims: ui_blip). `[]` = silence |
| `clock` | `false` (hide) or `{set:'23:40', rate?}` (jump the game clock); body only |
| `header` | `false` hides the small logotype header (also hidden while the 3D logo is up) |
| `bgm`, `amb`, `duck` | per-beat override of the part's track / bed (`null` = off); BGM duck depth in dB for this beat |
| `transition` | `'dip'` = 3-frame dip to black around the cut into this beat (default hard cut; never on frame 0) |
| `fadeOut` | seconds of fade to black at the end of this beat |
| `factIds`, `board` | facts shown by the 3D set (e.g. the departure board) → footnote; `board` merges into `shot.params.board` of `alt-platform` |

Components (`c`): `mission caption direction sim stamp choice lesson cheat sources notice rules press-start clock pin legend`
(`{c:'legend', rows:[{color:'#hex', ja}]}` = route-map key in the top slot; give the routemap shot the same `colors:{routeId:'#hex'}`).
`fiction` (auto with `notice`), `tag` (corner chips, e.g. 「位置・構造は概略」 — passed by the page as `tags`), `parody` (opt-in only)
(+ `logo`). `choice`, `lesson`, `cheat` default to the config's `choice` / `lesson` / `cheat`; `sources` to the rows of
`sources[]` (outlet, date, URL).

### Validation (`tools/render_variant.sh check`, `tests/test_variants.py`)

Errors: missing/invalid fields; a `sim` item without 「シミュレーション」; a stamp that does not match the outcome
(GAME_OVER ↔ `GAME_OVER`, CLEAR ↔ `GAME_CLEAR`/`ESCAPED`), stamps in the opening, stamp before the choice; no choice /
stamp / lesson / cheat beat; cheat sheet < 3 s; lesson without factIds; unknown or dropped fact ids; a string citing a
fact without the label its `say` rule in `sources-series.mjs` requires (year, 概略, 未発表 …); banned names; real-alert
wording (J-ALERT, 緊急速報, NHK …); 「おすすめ」 (routes are 「ルート例」); opening + body outside 30–45 s. Pairs: same
`pair`, one GAME_OVER + one CLEAR, identical prompt + options, different `picked`. Warnings: unknown shot / crowd /
component keys (rendered with the fallback), durations outside the targets (opening 9–14.5 s, body 24–32 s; the shared opening is 14.2 s since the fixer pass: notice 2.5 s, rules 4.0 s).

Per-frame (recorder, hard): 「フィクション」 tag while the fictional notice is on screen, parody/fiction note on the sources
card, sims labelled, stamps only in their beat (and GAME OVER / GAME CLEAR /
ESCAPED wording nowhere else), claims ⊆ footnote, known / not dropped facts, footnote 「出典：…」 present, not clipped,
above the bottom unsafe zone, cheat sheet present in its beat, frame 0 not faded. Soft (counted in the segment summary):
HUD safe-area violations, missing title (header or logo), fallbacks.

## Adding a variant

1. Copy a config to `web3d/shibuya/series/variants/jr/<new-id>.json`; set `pair`, `outcome`, `choice` (identical to the
   partner's except `picked`), beats, `lesson`, `cheat`, `sources`.
2. New facts: add them to `series/sources-series.mjs` (`FACTS` + `SOURCES`) with their `say` label rules.
3. `tools/render_variant.sh check` → fix every error; `tools/render_variant.sh stills <new-id> 1,5,12` → look at the PNGs.
4. `tools/render_variant.sh <new-id>`.

## Rules (binding)

No gore; costumed people are ordinary people; GAME OVER = caught in the crowd / missed the train / no taxi — never death
or injury. No persistent ※パロディ label (steering 2026-10-26): 「フィクション」 tag on the fictional notice, parody note on
the sources card; nothing looks like a real emergency alert. No real film / game titles, logos,
lines. Every fact sourced (footnote + sources card); simulated numbers 「シミュレーション」; OSM walks 「OSMから概算」;
unconfirmed 2026 info 「目安」/「未発表」; positions 「位置・構造は概略」 (shown automatically for approximate sets).

## Fixer pass 2026-10-26 (QA findings)
- Opening 14.2 s (OP 7.7 s + notice 2.5 s + rules 4.0 s) + body 28 s → every video 42.2 s.
- `routemap` params: `colors:{id:'#hex'}` (own + wide routes), `span:true` (fit the points' span into an off-centre `rect`,
  e.g. the band above the choice panel). Choice beats now show a labelled map (`pin` items A/B + `legend`).
- `gate-queue` `mode:'approach'` (+ `eyeY`, `nearHide`, `back`, `lookY`), `zone-edge` `height/lookY/far/nearHide`,
  `taxi-*` `lookY/lookSign`, `eye-walk` `crowd:false`, `alt-platform` `station` re-places the platform set
  (`sets.setAltStation`). Set pieces: lit 「ハチ公改札」 sign, hero taxi (lamp, open door) at the SAKURAテラス前 stand,
  closure line on 神宮通り, 4.3 m departure board.
- Facts: `sayV` label groups (variants only; `JR-LAST-01/02` need 「通常」/「目安」), every `osm:true` fact needs
  「OSMから概算」/「概算」 (validator), per-direction timetable source keys (`jrTt<Station>In/Out`).
- Pilot: no persistent ※パロディ (「フィクション」 tag during the cold open; `?parody=1` restores the old sticker).
- `render_variant.sh` caches the resolved recorder interpreter in `$WORK/.pybin`.
