#!/usr/bin/env bash
# One command per JR編 branching variant (CLEAR / GAME OVER): shared opening (rendered once, cached) + variant body.
#   tools/render_variant.sh <id>                 opening (if not cached) → body segments (resumable) → concat → audio → mux
#                                                → $OUT/<id>.mp4 + $OUT/<id>-contact.jpg (+ $WORK/<id>/report.json)
#   tools/render_variant.sh all                  every config in web3d/shibuya/series/variants/jr/ (not starting with _)
#   tools/render_variant.sh opening              render / verify the shared opening only
#   tools/render_variant.sh stills <id> T1,T2[,…] [body|opening]   preview PNGs (part seconds) → $WORK/<id>/stills/
#   tools/render_variant.sh contact <id>         contact sheet of $OUT/<id>.mp4 (explicit times: OP frames, logo, body beats)
#   tools/render_variant.sh plan <id>            print the segment plan (frames) of the opening and the body
#   tools/render_variant.sh check [<id>]         validate configs (+ pairs) without a browser
# Segments: SEG_FRAMES frames each (default 300 = 10 s; measured ≈1.7–3.5 s/frame incl. PNG → ≈10–20 min per segment,
# far below the 2 h cap even at 3× slower), fragmented MP4 (a killed segment keeps its finished fragments; a segment is
# done only when its frame count matches, otherwise it is re-rendered). Each segment is its own browser session: the
# crowd solver catches up deterministically to the segment start and two warm-up frames are rendered before capture.
# Cache keys (tools/variant_cues.mjs --opening-key / --part-key): stable config JSON + every code/data file that changes
# pixels, so an edited config or module re-renders only what it affects. The opening is copied byte-for-byte into every
# variant (concat -c copy). Audio: tools/audio/run.sh mix (cue sheet from variant_cues.mjs; the opening is mastered as its
# own segment so it sounds identical in every variant) + tools/audio/mux.sh; a silent AAC track if tools/audio is absent.
# Env: MAX_SEGS (render ≤N new segments then exit 3 → one job per segment), BODY_FRAMES (test: first N body frames only),
#      OUT (deliverables), WORK (segments/cache), SEG_FRAMES, AGENTS (smaller crowd, previews only), PR (WebGL pixel ratio),
#      OPENING (opening config id, default _opening → _sample-opening), OPENING_KEY (pin the opening cache key).
# SEGMENT PLAN (integrator 2026-10-26, measured on the shared 8-CPU box under load, full 48,636-agent crowd):
#   s/frame incl. PNG+encode: op-flythrough 1.9–2.9 · topdown 2.7 · aerial 3.2–4.4 · eye-walk 2.8–3.6 · gate-queue 3.3–3.6
#   · gate-newsouth 1.4–2.6 · zone-edge ≈3.5 · detour ≈3.2 · routemap 1.4–2.4 · alt-platform ≈2.8 · taxi 2.5–3.2
#   · card-bg 1.7–2.9 (crowd + solver off behind cards); + 5–13 min fixed start-up per segment job.
#   SEG_FRAMES=300 → opening 2 jobs (≈22 + 11 min), body 3 jobs (≈26 + 25 + 20 min): every job ≤ 45 min.
#   `tools/render_variant.sh plan <id>` prints the estimate per segment and fails if one exceeds 45 min.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$repo_dir"
L=${VARIANT_LOGS:-/workspace/projects/logs/ssl-claude-halloween/variants}
OUT=${OUT:-/workspace/demos/halloween-escape-series/jr-variants}
WORK=${WORK:-$L/render}
SEG_FRAMES=${SEG_FRAMES:-300}
PR=${PR:-1}
# the opening config is resolved ONCE per run and passed to every page / cue call (a config appearing mid-run must
# not mix two openings): _opening.json, else the _sample-opening.json stand-in
if [ -z "${OPENING:-}" ]; then
  if [ -f web3d/shibuya/series/variants/jr/_opening.json ]; then OPENING=_opening; else OPENING=_sample-opening; fi; fi
EXTRA=(--opening "$OPENING")
[ -n "${AGENTS:-}" ] && EXTRA+=(--agents "$AGENTS")
[ "$PR" != 1 ] && EXTRA+=(--pr "$PR")
OPT=(--opening "$OPENING")
mkdir -p "$OUT" "$WORK"
log() { echo "[render_variant $(date +%T)] $*"; }
frames_in() { [ -s "$1" ] || { echo 0; return; }; ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$1" 2>/dev/null || echo 0; }
cues() { node tools/variant_cues.mjs "$@" "${OPT[@]}"; }
jsonv() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(eval(sys.argv[2],{'d':d}))" "$@"; }
# --no-project: the recorder needs only playwright + pillow, so no project sync / project lock per segment
PYRUN=(uv run --quiet --no-project --with playwright --with pillow python)
# resolve the ephemeral env's interpreter ONCE per run: later segments start python directly (no uv cache lock wait —
# measured 5–13 min per segment when other uv jobs ran concurrently on the shared box)
# fixer 2026-10-26 (QA finding 16): `uv run --with …` builds an EPHEMERAL env (…/uv/builds-v0/.tmpXXXX, deleted when uv
# exits), so the interpreter path printed above was never reusable and every job paid the uv resolution again. Now a
# persistent recorder venv ($WORK/.venv-rec: playwright + pillow, created once) is used; PYBIN=… overrides; if the venv
# cannot be built, fall back to `uv run` as before.
VENV=$WORK/.venv-rec
if [ -n "${PYBIN:-}" ] && [ -x "$PYBIN" ]; then PYRUN=("$PYBIN")
else
  if ! "$VENV/bin/python" -c 'import playwright,PIL' 2>/dev/null; then
    { uv venv --quiet "$VENV" && uv pip install --quiet --python "$VENV/bin/python" playwright pillow; } >&2 || rm -rf "$VENV"; fi
  if "$VENV/bin/python" -c 'import playwright,PIL' 2>/dev/null; then PYRUN=("$VENV/bin/python"); fi
fi
REC=("${PYRUN[@]}" tools/record_variant.py)

# render_part <variant-for-page> <part> <dir> <frames>: segments into <dir>/seg-NN.mp4, then <dir>/<part>.mp4
render_part() {
  local vid=$1 part=$2 dir=$3 n=$4 k=0 a b s got list
  mkdir -p "$dir"; list=$dir/concat.txt; : >"$list"
  for ((a=0; a<n; a+=SEG_FRAMES)); do b=$((a+SEG_FRAMES)); ((b>n)) && b=$n; s=$(printf '%s/seg-%02d' "$dir" "$k")
    if [ "$(frames_in "$s.mp4")" -eq $((b-a)) ] && [ -s "$s.jsonl" ]; then log "$part seg $k ($a–$b) done"
    else
      # MAX_SEGS=N: render at most N new segments in this invocation, then exit 3 (one scheduler job = one ≤45 min segment)
      if [ -n "${MAX_SEGS:-}" ] && [ "${SEGS_DONE:-0}" -ge "$MAX_SEGS" ]; then log "MAX_SEGS=$MAX_SEGS reached; re-run to continue"; exit 3; fi
      SEGS_DONE=$(( ${SEGS_DONE:-0} + 1 ))
      rm -f "$s.mp4" "$s.jsonl"; log "$part seg $k: frames $a–$b → $s.mp4"; local t0=$SECONDS
      "${REC[@]}" --variant "$vid" --part "$part" --output "$s.mp4" --log "$s.jsonl" --summary "$s.json" --start-frame "$a" --end-frame "$b" "${EXTRA[@]}" 2>&1 \
        | grep --line-buffered -v 'toNonIndexed' | tee "$s.log"
      log "$part seg $k finished in $((SECONDS-t0)) s"
      got=$(frames_in "$s.mp4"); [ "$got" -eq $((b-a)) ] || { echo "$part segment $k incomplete: $got/$((b-a)) frames (re-run to resume)" >&2; exit 1; }
    fi
    echo "file '$s.mp4'" >>"$list"; k=$((k+1)); done
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$dir/$part.mp4"
  cat "$dir"/seg-*.jsonl >"$dir/frames.jsonl"
  got=$(frames_in "$dir/$part.mp4"); [ "$got" -eq "$n" ] || { echo "$dir/$part.mp4: $got/$n frames" >&2; exit 1; }
  log "$part: $dir/$part.mp4 ($n frames)"
}

opening_dir() { local key=${OPENING_KEY:-$(cues --opening-key)}; echo "$WORK/opening-$key"; }
render_opening() { # needs any variant id for the page URL (the opening part ignores the body except for its length check)
  local vid=$1 dir n; dir=$(opening_dir); n=$(cues "$vid" --check | jsonv /dev/stdin "d['openingFrames']")
  if [ "$(frames_in "$dir/opening.mp4")" -eq "$n" ]; then log "opening cached: $dir/opening.mp4"; else render_part "$vid" opening "$dir" "$n"; fi
  echo "$dir" >"$WORK/.opening-dir"
}

render_variant() {
  local id=$1 dir odir n D w
  cues "$id" --check --quiet || { echo "config $id invalid" >&2; exit 1; }
  render_opening "$id"; odir=$(cat "$WORK/.opening-dir")
  dir=$WORK/$id/body-$(cues --part-key "$id"); w=$WORK/$id; mkdir -p "$w"
  cues "$id" --out "$w/cues.json" --timeline "$w/timeline.json" --quiet
  n=$(jsonv "$w/timeline.json" "d['parts']['body']['frames']"); D=$(jsonv "$w/timeline.json" "d['duration']")
  # BODY_FRAMES=N: end-to-end TEST only — render the first N body frames (segments, concat, audio, mux, verify as usual)
  if [ -n "${BODY_FRAMES:-}" ] && [ "$BODY_FRAMES" -lt "$n" ]; then n=$BODY_FRAMES; dir=$dir-test$n
    D=$(jsonv "$w/timeline.json" "round(d['parts']['opening']['frames']/30+$n/30,4)"); log "TEST: body frames 0–$n only (video $D s)"; fi
  export EXPECT_FRAMES=$(( $(jsonv "$w/timeline.json" "d['parts']['opening']['frames']") + n ))
  render_part "$id" body "$dir" "$n"
  # concat opening + body (video packets copied: the opening is byte-identical in every variant)
  printf "file '%s'\nfile '%s'\n" "$odir/opening.mp4" "$dir/body.mp4" >"$w/concat.txt"
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$w/concat.txt" -c copy -movflags +faststart "$w/video.mp4"
  # audio
  if [ -x tools/audio/run.sh ] && [ -f tools/audio/mix.py ]; then
    tools/audio/run.sh mix --cues "$w/cues.json" --duration "$D" --out "$w/mix.wav" --report "$w/mix.json" --strict
  else log "tools/audio missing → silent track (stub)"; ffmpeg -hide_banner -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t "$D" -c:a pcm_s16le "$w/mix.wav"; fi
  if [ -x tools/audio/mux.sh ]; then tools/audio/mux.sh "$w/video.mp4" "$w/mix.wav" "$OUT/$id.mp4"
  else ffmpeg -hide_banner -loglevel error -y -i "$w/video.mp4" -i "$w/mix.wav" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart "$OUT/$id.mp4"; fi
  verify "$id" "$odir" "$w"
  contact_sheet "$id"
}

verify() { # frame count, format, audio, byte-identical opening packets
  local id=$1 odir=$2 w=$3 v=$OUT/$1.mp4 n got fmt aud on
  n=${EXPECT_FRAMES:-$(jsonv "$w/timeline.json" "d['frames']")}; on=$(jsonv "$w/timeline.json" "d['parts']['opening']['frames']")
  got=$(frames_in "$v"); fmt=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt,r_frame_rate -of csv=p=0 "$v")
  aud=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of csv=p=0 "$v")
  ffmpeg -hide_banner -loglevel error -i "$odir/opening.mp4" -map 0:v -c copy -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}' >"$w/op.md5"
  ffmpeg -hide_banner -loglevel error -i "$v" -map 0:v -c copy -frames:v "$on" -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}' >"$w/op-in-video.md5"
  local same=false; cmp -s "$w/op.md5" "$w/op-in-video.md5" && same=true
  # loudness of the delivered file (EBU R128 integrated, LRA, true peak)
  ffmpeg -hide_banner -nostats -i "$v" -vn -af ebur128=peak=true:framelog=quiet -f null - 2>"$w/ebur128.txt" || true
  python3 - "$w/report.json" "$v" "$got" "$n" "$fmt" "$aud" "$same" "$odir" "$w/ebur128.txt" <<'EOF'
import json,sys,glob,os,re
out,v,got,n,fmt,aud,same,odir,eb=sys.argv[1:]
txt=open(eb).read().split('Summary:')[-1]
num=lambda k:(lambda m:float(m.group(1)) if m else None)(re.search(k+r':\s*(-?[\d.]+)',txt))
loud={'I_lufs':num('I'),'LRA_lu':num('LRA'),'true_peak_dbtp':num('Peak')}
segs=[json.load(open(f)) for f in sorted(glob.glob(os.path.join(os.path.dirname(out),'body-*','seg-*.json')))+sorted(glob.glob(os.path.join(odir,'seg-*.json')))]
mix=os.path.join(os.path.dirname(out),'mix.json');mix=json.load(open(mix)) if os.path.exists(mix) else None
r={'video':v,'frames':int(got),'expected':int(n),'format':fmt,'audio':aud,'opening_identical':same=='true','opening_dir':odir,'loudness':loud,
   'segments':[{k:s.get(k) for k in ('output','frames','wall_s','ms_per_frame','soft')} for s in segs],'mix':mix}
json.dump(r,open(out,'w'),indent=1,ensure_ascii=False);print(json.dumps({k:r[k] for k in ('video','frames','expected','format','audio','opening_identical','loudness')},ensure_ascii=False))
ok=int(got)==int(n) and fmt=='1080,1920,yuv420p,30/1' and aud.startswith('aac,48000,2') and same=='true'
if loud['I_lufs'] is not None and not -15.5<=loud['I_lufs']<=-12.5: print('loudness out of range', loud, file=sys.stderr); ok=False
sys.exit(0 if ok else 1)
EOF
}

contact_sheet() { local id=$1 w=$WORK/$1
  [ -f "$w/timeline.json" ] || cues "$id" --timeline "$w/timeline.json" --quiet
  "${PYRUN[@]}" tools/record_variant.py contact --video "$OUT/$id.mp4" --timeline "$w/timeline.json" --out "$OUT/$id-contact.jpg"; }

case "${1:-}" in
  ''|-h|--help) awk 'NR>1 && /^#/{print;next} NR>1{exit}' "$0"; exit 2 ;;
  all) ids=$(node tools/variant_cues.mjs --list); [ -n "$ids" ] || { echo "no variant configs" >&2; exit 1; }
       for id in $ids; do render_variant "$id"; done ;;
  opening) id=${2:-$(node tools/variant_cues.mjs --list | head -1)}; id=${id:-_sample}; render_opening "$id"; cat "$WORK/.opening-dir" ;;
  stills) [ $# -ge 3 ] || { echo "usage: $0 stills <id> T1,T2 [body|opening]" >&2; exit 2; }
          "${REC[@]}" --variant "$2" --part "${4:-body}" --stills "$WORK/$2/stills" --stills-at "$3" "${EXTRA[@]}" 2>&1 | grep --line-buffered -v toNonIndexed; echo "$WORK/$2/stills" ;;
  contact) contact_sheet "$2" ;;
  plan) tl=$(mktemp); cues "$2" --timeline "$tl" --quiet; rc=0; python3 - "$tl" "$SEG_FRAMES" <<'EOF' || rc=$?
import json,sys
d=json.load(open(sys.argv[1]));S=int(sys.argv[2])
# Segment plan with a time estimate per segment. MS = measured wall seconds per captured frame (frame + PNG + encode)
# per shot key, SwiftShader 720x1280 @ dsf 1.5, full 48,636-agent crowd, shared 8-CPU box under load
# (integrator 2026-10-26 stills runs; upper end). +WARM s per segment (page load, solver catch-up, warm-up frames).
MS={'op-flythrough':2.9,'topdown':2.9,'aerial':4.4,'eye-walk':3.0,'gate-queue':3.6,'gate-newsouth':2.6,'zone-edge':3.6,
    'detour':3.2,'routemap':2.4,'alt-platform':2.8,'taxi-west':3.2,'taxi-sakura':3.2,'interior':4.5,'card-bg':2.9}
WARM=480;CAP=45*60;worst=0  # WARM measured: uv env + browser + page load + warm-up = 280–460 s per segment (E2E 2026-10-26)
for part in ('opening','body'):
  P=d['parts'][part];n=P['frames'];beats=P['beats']
  cost=lambda f:next((MS.get(b['shot'],4.5) for b in beats if b['f0']<=f<b['f1']),4.5)
  segs=[]
  for a in range(0,n,S):
    b=min(a+S,n);sec=WARM+sum(cost(f) for f in range(a,b));worst=max(worst,sec);segs.append(f'{a}-{b} ~{sec/60:.0f} min')
  print(part,n,'frames:',' | '.join(segs))
print(f'worst segment ~{worst/60:.0f} min (cap 45 min):','OK' if worst<=CAP else 'TOO LONG -> lower SEG_FRAMES')
sys.exit(0 if worst<=CAP else 1)
EOF
        rm -f "$tl"; exit $rc ;;
  check) if [ -n "${2:-}" ]; then cues "$2" --check; else node tools/variant_cues.mjs --validate-all "${OPT[@]}"; fi ;;
  *) render_variant "$1" ;;
esac
