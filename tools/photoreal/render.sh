#!/usr/bin/env bash
# Photoreal cutaway backdrop: stills + segmented 10 s 1080x1920 test clip (each segment must stay < 40 min).
#   tools/photoreal/render.sh stills          4 PNG stills → $OUT
#   tools/photoreal/render.sh run N A B       frames [A,B) → $SEG/seg-NN.mp4 (fragmented; re-run overwrites)
#   tools/photoreal/render.sh all             every missing/incomplete segment of PLAN, then join
#   tools/photoreal/render.sh join            concat segments → $OUT/photoreal-test-9x16.mp4 (+ contact sheet)
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd); cd -- "$repo_dir"
L=${PR_LOGS:-/workspace/projects/logs/ssl-claude-photoreal}
OUT=${PR_OUT:-/workspace/demos/halloween-escape-series/photoreal}
SEG=${SEG_DIR:-$L/segments}
VIDEO=$OUT/photoreal-test-9x16.mp4
FRAMES=300
PLAN=(${PR_PLAN:-0:100 100:200 200:300})
mkdir -p "$SEG" "$OUT"
R() { nice -n 10 uv run --with playwright python tools/photoreal/render.py "$@"; }
frames_in() { [ -s "$1" ] || { echo 0; return; }; ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$1" 2>/dev/null || echo 0; }
run_seg() { local s; s=$(printf '%s/seg-%02d' "$SEG" "$1"); echo "segment $1: $2-$3 ($(date +%T))"
  R --output "$s.mp4" --start-frame "$2" --end-frame "$3" 2>&1 | tee "$s.log"
  [ "$(frames_in "$s.mp4")" -eq $(($3-$2)) ] || { echo "segment $1 incomplete" >&2; exit 1; }; echo "segment $1 done ($(date +%T))"; }
case "${1:-}" in
  stills) R --stills "$OUT" ${2:+--only "$2"} ;;
  run) run_seg "$2" "$3" "$4" ;;
  all) for i in "${!PLAN[@]}"; do IFS=: read -r a b <<<"${PLAN[$i]}"; s=$(printf '%s/seg-%02d.mp4' "$SEG" "$i")
         [ "$(frames_in "$s")" -eq $((b-a)) ] && echo "segment $i done" || run_seg "$i" "$a" "$b"; done; "$0" join ;;
  join) list=$SEG/concat.txt; : >"$list"
    for i in "${!PLAN[@]}"; do printf "file '%s/seg-%02d.mp4'\n" "$SEG" "$i" >>"$list"; done
    ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$VIDEO"
    echo "$VIDEO: $(frames_in "$VIDEO") frames · $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$VIDEO")"
    [ "$(frames_in "$VIDEO")" -eq $FRAMES ]
    ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -vf "fps=8/10,scale=270:480,tile=4x2" -frames:v 1 "$OUT/photoreal-test-contact.png" ;;
  *) sed -n '2,6p' "$0"; exit 2 ;;
esac
