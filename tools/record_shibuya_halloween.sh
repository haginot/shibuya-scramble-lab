#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
site_dir=$(mktemp -d "${TMPDIR:-/tmp}/shibuya-halloween.XXXXXX")
cleanup() { rm -rf -- "$site_dir"; }
trap cleanup EXIT
cd -- "$repo_dir"
node tools/run_shibuya_halloween.mjs
uv run shibuya-scramble-lab build --area shibuya --no-llm -o "$site_dir"
uv run --with playwright python tools/record_shibuya_halloween.py "$site_dir" \
  --output "${SHIBUYA_VIDEO:-/workspace/demos/shibuya-halloween.mp4}" \
  --stills "${SHIBUYA_STILLS:-/workspace/demos/shibuya-halloween}" "$@"
