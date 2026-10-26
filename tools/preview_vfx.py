"""Stills + SwiftShader ms/frame for the combined-episode VFX (web3d/shibuya/series/vfx-preview.html):
caught hands/shadows/flash over the 'caught-press' POV, and the original kaiju over the skyline.

Run (one browser on the box at a time):
  flock /tmp/ssl-halloween-browser.lock uv run python tools/preview_vfx.py --out DIR \
      [--shots 'caught@0.6,1.2,1.8;kaiju@1,2.6,3.1'] [--opts '{"kaiju":{"pos":[700,520]}}'] [--query city=0]
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
    ap.add_argument('--shots', default='caught@0.5,1.1,1.6,1.85;kaiju@1.2,2.4,3.05;kaiju-solo@3.05')
    ap.add_argument('--opts', default='{}', help='JSON options per scene name ({"kaiju":{...}}) or for all ({"*":{...}})')
    ap.add_argument('--query', default='')
    ap.add_argument('--tag', default='')
    ap.add_argument('--width', type=int, default=720)
    ap.add_argument('--height', type=int, default=1280)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    opts = json.loads(args.opts)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    report = {'viewport': [args.width, args.height], 'shots': {}}
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': args.width, 'height': args.height}, device_scale_factor=1)
            logs = []
            page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
            page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
            t0 = time.time()
            q = f'w={args.width}&h={args.height}' + (f'&{args.query}' if args.query else '')
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/series/vfx-preview.html?{q}')
            try:
                page.wait_for_function('window.__ready===true', timeout=600_000)
            except Exception:
                print('\n'.join(logs)); raise
            report['load_s'] = round(time.time() - t0, 1)
            for spec in [s for s in args.shots.split(';') if s]:
                name, times = spec.split('@')
                o = {**opts.get('*', {}), **opts.get(name, {})}
                for t in [float(x) for x in times.split(',')]:
                    res = None
                    for _ in range(2):
                        res = page.evaluate('([n,t,o])=>__vfx.render(n,t,o)', [name, t, o])
                    path = args.out / f"{name}{args.tag}-t{t:g}.png"
                    page.locator('canvas').screenshot(path=str(path))
                    report['shots'][f'{name}@{t:g}'] = res
                    print(name, t, res['ms'], 'ms', res['drawCalls'], 'calls', res['triangles'], 'tris', 'hands', res['hands'], 'people', res['people'], flush=True)
            if logs: report['console'] = logs[-40:]
    finally:
        server.shutdown(); server.server_close()
    (args.out / 'timing.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for line in report.get('console', []): print(line)


if __name__ == '__main__':
    main()
