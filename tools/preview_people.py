"""Eye-level preview stills + SwiftShader ms/frame for series/people-close.mjs and series/crowd-variants.mjs.

Opens web3d/shibuya/series/people-preview.html in headless Chromium (SwiftShader WebGL), renders each scene
(lineup, close, crowd, state:<CROWD_STATES key>) at the given times and saves PNGs + timing.json.

Run: uv run python tools/preview_people.py --out DIR [--scenes lineup,state:hachiko-peak] [--times 0,1.3] [--query city=0]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_shibuya import QuietHandler, browser_with_webgl  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--scenes', default='')
    ap.add_argument('--times', default='0,1.3')
    ap.add_argument('--repeat', type=int, default=2)
    ap.add_argument('--query', default='')
    ap.add_argument('--width', type=int, default=720)
    ap.add_argument('--height', type=int, default=1280)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    report = {'viewport': [args.width, args.height], 'scenes': {}}
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': args.width, 'height': args.height}, device_scale_factor=1)
            logs = []
            page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
            page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
            t0 = time.time()
            q = f'w={args.width}&h={args.height}' + (f'&{args.query}' if args.query else '')
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/series/people-preview.html?{q}')
            try:
                page.wait_for_function('window.__ready===true', timeout=600_000)
            except Exception:
                print('\n'.join(logs)); raise
            report['load_s'] = round(time.time() - t0, 1)
            names = [s for s in (args.scenes.split(',') if args.scenes else page.evaluate('__pp.scenes')) if s]
            for name in names:
                for t in [float(x) for x in args.times.split(',')]:
                    res = None
                    for _ in range(max(1, args.repeat)):
                        res = page.evaluate('([n,t])=>__pp.render(n,t)', [name, t])
                    path = args.out / f"{name.replace(':', '-')}-t{t:g}.png"
                    page.locator('canvas').screenshot(path=str(path))
                    res['ms'] = round(res['ms'])
                    report['scenes'][f'{name}@{t:g}'] = res
                    print(name, t, res['ms'], 'ms', res['drawCalls'], 'calls', res['triangles'], 'tris', json.dumps(res['near']), flush=True)
                    if res.get('hud'):
                        print('   ', ' | '.join(i['text'] for i in res['hud']['items']), flush=True)
            if logs: report['console'] = logs[-40:]
    finally:
        server.shutdown(); server.server_close()
    (args.out / 'timing.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for line in report.get('console', []): print(line)


if __name__ == '__main__':
    main()
