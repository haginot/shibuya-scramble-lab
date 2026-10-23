#!/usr/bin/env bash
# Halloween night video (44 s, 1280x720, 30 fps): costumes, police crowd control and the
# station-closing dispersal comparison. Output: $SHIBUYA_VIDEO or out/media/shibuya-halloween.mp4
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
site_dir=$(mktemp -d "${TMPDIR:-/tmp}/shibuya-halloween.XXXXXX")
cleanup() { rm -rf -- "$site_dir"; }
trap cleanup EXIT
cd -- "$repo_dir"
uv run shibuya-scramble-lab build --area shibuya --no-llm -o "$site_dir"
uv run --with playwright python tools/record_shibuya.py "$site_dir" --mode halloween \
  --output "${SHIBUYA_VIDEO:-out/media/shibuya-halloween.mp4}" \
  --stills "${SHIBUYA_STILLS:-out/media/shibuya-halloween}"
