#!/usr/bin/env bash
# Segmented, resumable render of the series pilot 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」 (JP 9:16, 1080x1920, 30 fps, 58 s).
#   tools/render_series.sh run N START END   render frames [START, END) into $SEG_DIR/seg-NN.mp4 (fragmented MP4) + seg-NN.jsonl
#                                             (re-running a segment overwrites it; the solver catches up deterministically)
#   tools/render_series.sh count N           frames in seg-NN.mp4 (and whether it is complete)
#   tools/render_series.sh plan              print the segment plan
#   tools/render_series.sh all               every segment of the plan whose file is missing or incomplete, then join + contact
#   tools/render_series.sh join              concat the segments → $VIDEO (faststart), frames.jsonl, checks frame count/size
#   tools/render_series.sh contact           16-frame 4x4 contact sheet → $CONTACT
# Segment plan from MEASURED steady-state cost after the QA fixes (2026-10-25; 720x1280 canvas, dsf 1.5 PNG 1080x1920,
# 48,636 people, SwiftShader; $L/stills-preview/timing.json, consecutive-frame pairs): aerial ≈2.1–2.2 s render + 0.65 s PNG,
# gate-choice oblique ≈3.3 + 0.7, eye-level walk ≈0.8–1.2 + 0.7, interior / platform ≈0.73 + 0.65, top-down ≈0.75 + 0.7,
# route map ≈0.3 + 0.6, cheat card over the dark orbit ≈0.62 + 0.45 (tally/ask cards ≈2.2 + 0.7: drawn over the orbit);
# solver ≈10 ms/frame at 1×, catch-ups ≈12–26 s at each walk cut and at the cut to the interior; page load + warm-up ≈50–60 s;
# one-off shader compile of the street-level scene up to ≈65 s on the first eye-level frame of a segment.
# Projected: seg 0 (0–19.3 s) ≈23–25 min, seg 1 (19.3–38.7 s, incl. ≈2 min start catch-up and the slow oblique) ≈21–24 min,
# seg 2 (38.7–58 s) ≈17–20 min → ≈65 min total; each segment far below the 90 min cap (still < 90 min if 3× slower).
# The precomputed crowd run is cached ($L/cache/jr-run.json, key 999febb05df495a5; crowd-jr.mjs unchanged by the fixes):
# run `node tools/precompute_series_jr.mjs $L/cache/jr-run.json` once first; it must print "cached".
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$repo_dir"
L=${SERIES_LOGS:-/workspace/projects/logs/ssl-claude-halloween/series}
OUT=${SERIES_OUT:-/workspace/demos/halloween-escape-series}
SEG_DIR=${SEG_DIR:-$L/segments}
VIDEO=${VIDEO:-$OUT/jr-ja-vertical.mp4}
CONTACT=${CONTACT:-$OUT/jr-ja-vertical-contact.png}
FRAMES=1740
PLAN=(0:580 580:1160 1160:1740)
mkdir -p "$SEG_DIR" "$OUT"
seg() { printf '%s/seg-%02d' "$SEG_DIR" "$1"; }
frames_in() { [ -s "$1" ] || { echo 0; return; }; ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$1" 2>/dev/null || echo 0; }
run_seg() {
  local n=$1 a=$2 b=$3 s; s=$(seg "$n")
  rm -f "$s.mp4" "$s.jsonl"
  echo "segment $n: frames $a-$b → $s.mp4 ($(date +%T))"
  uv run --with playwright python tools/record_series.py --output "$s.mp4" --log "$s.jsonl" --start-frame "$a" --end-frame "$b" 2>&1 | tee "$s.log"
  local got; got=$(frames_in "$s.mp4"); [ "$got" -eq $((b-a)) ] || { echo "segment $n incomplete: $got/$((b-a)) frames" >&2; exit 1; }
}
case "${1:-}" in
  run) [ $# -eq 4 ] || { echo "usage: $0 run N START END" >&2; exit 2; }; run_seg "$2" "$3" "$4" ;;
  count) s=$(seg "$2"); got=$(frames_in "$s.mp4"); IFS=: read -r a b <<<"${PLAN[$2]}"; echo "seg $2: $got/$((b-a)) frames"; [ "$got" -eq $((b-a)) ] ;;
  plan) for i in "${!PLAN[@]}"; do IFS=: read -r a b <<<"${PLAN[$i]}"; echo "run $i $a $b  # $((b-a)) frames"; done ;;
  all)
    for i in "${!PLAN[@]}"; do IFS=: read -r a b <<<"${PLAN[$i]}"; s=$(seg "$i")
      if [ "$(frames_in "$s.mp4")" -eq $((b-a)) ]; then echo "segment $i done"; else run_seg "$i" "$a" "$b"; fi; done
    "$0" join; "$0" contact ;;
  join)
    list=$SEG_DIR/concat.txt; : >"$list"; : >"$L/frames.jsonl"
    for i in "${!PLAN[@]}"; do s=$(seg "$i"); IFS=: read -r a b <<<"${PLAN[$i]}"
      [ "$(frames_in "$s.mp4")" -eq $((b-a)) ] || { echo "segment $i missing/incomplete" >&2; exit 1; }
      echo "file '$s.mp4'" >>"$list"; cat "$s.jsonl" >>"$L/frames.jsonl"; done
    ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart+use_metadata_tags "$VIDEO"
    got=$(frames_in "$VIDEO"); size=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt,r_frame_rate -of csv=p=0 "$VIDEO")
    echo "$VIDEO: $got frames · $size · $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO") s"
    [ "$got" -eq $FRAMES ] && [ "$size" = "1080,1920,yuv420p,30/1" ] ;;
  contact)
    ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -vf "fps=16/58,scale=270:480,tile=4x4" -frames:v 1 "$CONTACT"
    echo "$CONTACT" ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
