"""Export the original 3D logotype 「ハロウィンの渋谷を脱出せよ！」 JR編 (series/ui/logo3d.mjs via series/ui/logo-lab.html)
as stills, rendered in headless Chromium (SwiftShader WebGL) through the series post chain.

  logo.png       2400x2400 lockup on the dark night backdrop (hold pose, t=3.6 s, no PRESS START line)
  logo-9x16.png  1080x1920 9:16 title still (hold pose with the PRESS START line)

usage:
  uv run --with playwright python tools/export_logo.py                      → $OUT/logo.png + $OUT/logo-9x16.png
  uv run --with playwright python tools/export_logo.py --stills DIR --at 0.5,0.9,1.0,1.4,2.2,3.6 [--press 1]
        (9:16 stills of the logo animation named t<sec>.png + timing.json with ms/frame)
  uv run --with playwright python tools/export_logo.py --op-stills DIR --at 1,3.9,4.5,4.6,5.3,6.5,7.2,7.5
        (OP over the real night city: series/opening-preview.html = 3D agent's preview harness + opening.mjs;
         opening time t; 720x1280 canvas at pixel ratio 1, dsf 1.5 like the recorder)
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from record_shibuya import QuietHandler, browser_with_webgl  # noqa: E402

OUT = Path('/workspace/demos/halloween-escape-series/jr-variants')
HOLD = 3.6


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--stills')
    ap.add_argument('--op-stills')
    ap.add_argument('--at', default='0.3,0.6,0.88,0.95,1.1,1.45,1.9,2.5,3.6')
    ap.add_argument('--press', default='0')
    ap.add_argument('--bg', default='night')
    ap.add_argument('--extra', default='', help='extra lab URL params, e.g. &bloom=0')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/web3d/shibuya/series/ui/logo-lab.html'
    with sync_playwright() as p, browser_with_webgl(p) as browser:
        def page_for(w, h, dsf, extra=''):
            page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=dsf)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: print('console:', m.text, flush=True) if m.type == 'error' else None)
            page.goto(f'{base}?pr={dsf}{extra}&bg={a.bg}')
            page.wait_for_function('window.__logoReady===true', timeout=180_000)
            if errors: raise RuntimeError(errors)
            return page

        def shot(page, t, path, press=False, k=0):
            r = page.evaluate(f'window.__logoFrame({t},{{press:{str(press).lower()},pressK:{k}}})')
            page.screenshot(path=str(path), timeout=300_000)
            return r['ms']

        if a.op_stills:
            d = Path(a.op_stills); d.mkdir(parents=True, exist_ok=True)
            page = browser.new_page(viewport={'width': 720, 'height': 1280}, device_scale_factor=1.5)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: print('console:', m.text, flush=True) if m.type == 'error' else None)
            t0 = time.time()
            page.goto(f'http://127.0.0.1:{server.server_port}/web3d/shibuya/series/opening-preview.html?w=720&h=1280{a.extra}')
            page.wait_for_function('window.__opReady===true', timeout=900_000)
            if errors: raise RuntimeError(errors)
            print('load', round(time.time()-t0, 1), 's', flush=True)
            timing = {}
            for t in [float(x) for x in a.at.split(',')]:
                r = page.evaluate(f'window.__op.render({t})')
                r = page.evaluate(f'window.__op.render({t})')  # second call: shaders warm, honest ms
                page.screenshot(path=str(d/f'op-t{t:05.2f}.png'))
                timing[t] = r
                print(f't={t}: {r}', flush=True)
            (d/'timing.json').write_text(json.dumps(timing, indent=1))
            return
        if a.stills:
            d = Path(a.stills); d.mkdir(parents=True, exist_ok=True)
            page = page_for(720, 1280, 1.5, a.extra)
            timing = {}
            for t in [float(x) for x in a.at.split(',')]:
                t0 = time.time()
                ms = shot(page, t, d/f't{t:05.2f}.png', press=a.press == '1')
                timing[t] = {'render_ms': ms, 'wall_ms': round((time.time()-t0)*1000)}
                print(f't={t}: render {ms} ms, wall {timing[t]["wall_ms"]} ms', flush=True)
            (d/'timing.json').write_text(json.dumps(timing, indent=1))
            return
        out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
        page = page_for(720, 1280, 1.5)
        print('logo-9x16.png', shot(page, HOLD, out/'logo-9x16.png', press=True), 'ms', flush=True)
        page.close()
        page = page_for(1200, 1200, 2, '&frameW=.82')
        print('logo.png', shot(page, HOLD, out/'logo.png'), 'ms', flush=True)
    server.shutdown()


if __name__ == '__main__':
    main()
