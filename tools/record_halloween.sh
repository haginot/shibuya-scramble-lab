#!/usr/bin/env bash
# Halloween night videos (45 s, 1280x720, 30 fps): a "how to get home" heads-up with costumes,
# police crowd control, the station-closing dispersal comparison and per-exit counters.
# One render pass writes the Japanese video ($SHIBUYA_VIDEO, default out/media/shibuya-halloween.mp4)
# and the English one (<name>-en.mp4); then 9:16 cuts of both (<name>-vertical.mp4, <name>-en-vertical.mp4).
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
site_dir=$(mktemp -d "${TMPDIR:-/tmp}/shibuya-halloween.XXXXXX")
cleanup() { rm -rf -- "$site_dir"; }
trap cleanup EXIT
cd -- "$repo_dir"
video=${SHIBUYA_VIDEO:-out/media/shibuya-halloween.mp4}
stills=${SHIBUYA_STILLS:-out/media/shibuya-halloween}
uv run shibuya-scramble-lab build --area shibuya --no-llm -o "$site_dir"
uv run --with playwright python tools/record_shibuya.py "$site_dir" --mode halloween --output "$video" --stills "$stills"
base=${video%.mp4}
uv run --with pillow python tools/compose_vertical.py "$video" "$stills/frames.jsonl" --lang ja --output "$base-vertical.mp4"
uv run --with pillow python tools/compose_vertical.py "$base-en.mp4" "$stills/frames.jsonl" --lang en --output "$base-en-vertical.mp4"
