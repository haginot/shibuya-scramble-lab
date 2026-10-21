#!/usr/bin/env bash
set -euo pipefail
# Run from the repository root. Requires Playwright Chromium and ffmpeg.
uv run asagaya-town-sim promo build -o /tmp/promo_site
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/promo_site &
server_pid=$!
trap 'kill "$server_pid"' EXIT
# Wait for HTTP readiness without opening a browser.
python3 - <<'PY'
import time
import urllib.request
for attempt in range(50):
    try:
        urllib.request.urlopen('http://127.0.0.1:8765/promo/').close()
        break
    except OSError:
        time.sleep(.1)
else:
    raise SystemExit('HTTP server did not start')
PY
CAPS='[[0,"架空店舗の販促比較：係数は仮置き","Fictional store promotion: placeholder coefficients"],[8,"青は認知、黄色は来訪意向","Blue: aware. Yellow: wants to visit."],[16,"同じ住民・同じ乱数で比較","Same residents and paired random draws"],[24,"元々来訪する人にも割引費用が発生","Discounts also cost money for baseline visitors"]]' \
uv run --with playwright python tools/record3d.py \
 'http://127.0.0.1:8765/promo/?combos=none,sns_only,sns%2Bcoupon,all_four&speed=30' \
 promo.mp4 30 1280 720 30
