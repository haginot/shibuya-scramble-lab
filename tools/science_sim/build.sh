#!/usr/bin/env bash
# science-sim-v1 build: prep -> render -> audio (-14 LUFS) -> mux.   bash tools/science_sim/build.sh [WORKDIR] [OUT.mp4]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WORK="${1:-/workspace/demos/halloween-escape-series/science-sim-v1/work}"; OUT="${2:-$WORK/../ja-science-sim-v1.mp4}"
[ -f "$WORK/prep.npz" ] || python3 "$HERE/prep.py" "$WORK"
nice python3 "$HERE/render.py" "$WORK"
python3 "$HERE/audio.py" "$WORK/bed.wav" "$WORK/fd.json"
M=$(ffmpeg -hide_banner -nostats -i "$WORK/bed.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$M" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -hide_banner -loglevel error -i "$WORK/bed.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -ar 48000 "$WORK/bed14.wav"
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$WORK/frames/f%04d.png" -i "$WORK/bed14.wav" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart -c:a aac -b:a 160k -t 30 "$OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
