"""Preview stills + SwiftShader timing for the series geometry/camera layer.

Opens web3d/shibuya/series/preview.html (city.mjs + series/realism.mjs + station-jr.mjs + wide-area.mjs,
static ordinary crowd) in headless Chromium with SwiftShader WebGL, renders each camera rig of
series/camera.mjs at 720x1280 and saves PNGs; prints ms/frame per rig (render + GPU finish, and the
screenshot cost the recorder also pays).

Run: uv run python tools/preview_series_geom.py --out /tmp/stills [--rigs aerial,eye] [--times 0,4] [--repeat 2]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright

from record_shibuya import QuietHandler, browser_with_webgl

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--rigs', default='')
    ap.add_argument('--times', default='0,3')
    ap.add_argument('--repeat', type=int, default=2, help='renders per still (first warms shaders)')
    ap.add_argument('--query', default='', help='extra query string, e.g. people=0&wide=0')
    ap.add_argument('--width', type=int, default=720)
    ap.add_argument('--height', type=int, default=1280)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    report = {'viewport': [args.width, args.height], 'rigs': {}}
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': args.width, 'height': args.height}, device_scale_factor=1)
            logs = []
            page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
            page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
            t0 = time.time()
            q = f'w={args.width}&h={args.height}' + (f'&{args.query}' if args.query else '')
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/series/preview.html?{q}')
            try:
                page.wait_for_function('window.__ready===true', timeout=600_000)
            except Exception:
                print('\n'.join(logs)); raise
            report['load_s'] = round(time.time()-t0, 1)
            info = page.evaluate('({rigs:__preview.rigs,walk:__preview.walk,stats:__preview.stats,anchors:__preview.anchors})')
            report['info'] = info
            print(json.dumps(info, ensure_ascii=False)[:1500], flush=True)
            rigs = [r for r in (args.rigs.split(',') if args.rigs else info['rigs']) if r]
            times = [float(t) for t in args.times.split(',')]
            for rig in rigs:
                for t in times:
                    res = None
                    for _ in range(max(1, args.repeat)):
                        res = page.evaluate('([r,t])=>__preview.render(r,t)', [rig, t])
                    s0 = time.time()
                    path = args.out/f'{rig}-t{t:g}.png'
                    page.locator('canvas').screenshot(path=str(path))
                    shot_ms = (time.time()-s0)*1000
                    res['screenshot_ms'] = round(shot_ms)
                    res['ms'] = round(res['ms'])
                    report['rigs'][f'{rig}@{t:g}'] = res
                    print(rig, t, res['ms'], 'ms render,', res['screenshot_ms'], 'ms screenshot,', res['drawCalls'], 'calls', res['triangles'], 'tris', flush=True)
            if logs: report['console'] = logs[-40:]
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)
    (args.out/'timing.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for line in report.get('console', []): print(line)


if __name__ == '__main__': main()
