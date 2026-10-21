#!/usr/bin/env bash
set -euo pipefail
# Run from any directory. Requires Playwright Chromium and ffmpeg.
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
output_path="$PWD/promo.mp4"
site_dir=$(mktemp -d "${TMPDIR:-/tmp}/asagaya-promo-record.XXXXXX")
server_pid=''
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  rm -rf -- "$site_dir"
}
trap cleanup EXIT
cd -- "$repo_dir"
uv run asagaya-town-sim promo build -o "$site_dir"
port=${PROMO_PORT:-8765}
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$site_dir" &
server_pid=$!
# Check both HTTP and our server process so a port conflict cannot record another site.
python3 - "$port" "$server_pid" <<'PY'
import os, sys, time, urllib.request
port, pid = map(int, sys.argv[1:])
for attempt in range(50):
    os.kill(pid, 0)
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/promo/', timeout=1).close()
        time.sleep(.1)
        os.kill(pid, 0)
        break
    except OSError:
        time.sleep(.1)
else:
    raise SystemExit('HTTP server did not start')
PY
# Animate for 25 seconds, then hold the mean/95% interval card for the final five.
CAPS='[[0,"14日間・seed 0の1試行：係数は仮置き","14 days · one trial, seed 0 · placeholder coefficients"],[8,"青は認知、黄色は来訪意向","Blue: aware. Yellow: wants to visit."],[16,"同じ住民・同じ乱数で比較","Same residents and paired random draws"],[25,"8試行平均・95%区間：来訪増でも費用回収とは限らない","8-trial means and 95% intervals · more visits may not cover costs"]]' \
uv run --with playwright python tools/record3d.py \
 "http://127.0.0.1:$port/promo/?combos=none,sns_only,sns%2Bcoupon,all_four&speed=25" \
 "$output_path" 30 1280 720 30
