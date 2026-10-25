#!/usr/bin/env bash
# Mux a mastered WAV under a video:  tools/audio/mux.sh video.mp4 mix.wav out.mp4
# Video stream copied untouched; audio -> AAC-LC 192 kb/s, 48 kHz stereo; output length = video length
# (audio padded with silence or trimmed); +faststart. Prints the muxed file's ebur128 summary.
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: $0 video.mp4 mix.wav out.mp4" >&2; exit 2; }
video=$1 wav=$2 out=$3
[ "$(cd -- "$(dirname -- "$video")" && pwd)/$(basename -- "$video")" != "$(cd -- "$(dirname -- "$out")" 2>/dev/null && pwd)/$(basename -- "$out")" ] \
  || { echo "mux.sh: output must differ from input" >&2; exit 2; }
vdur=$(ffprobe -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "$video")
tmp="${out%.*}.muxtmp.${out##*.}"
ffmpeg -hide_banner -loglevel error -y -i "$video" -i "$wav" -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "apad,atrim=0:${vdur}" -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$vdur" -movflags +faststart "$tmp"
mv -f "$tmp" "$out"
ffmpeg -hide_banner -nostats -i "$out" -vn -af ebur128=peak=true:framelog=quiet -f null - 2>&1 \
  | awk '/Summary:/{s=1} s&&/I:|LRA:|Peak:/{gsub(/^ +/,""); printf "%s  ", $0} END{print ""}'
