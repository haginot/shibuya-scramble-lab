#!/usr/bin/env bash
# Run a tools/audio script with its python deps:  tools/audio/run.sh mix --cues c.json --out m.wav
#   (mix | analyze | export_assets | selftest)
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tool=${1:?usage: run.sh mix|analyze|export_assets|selftest [args...]}; shift
exec uv run --quiet --no-project --with 'numpy>=1.26' --with 'scipy>=1.11' --with 'pillow>=10' python "$here/$tool.py" "$@"
