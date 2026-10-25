"""Stills + SwiftShader ms/frame for the JR variant shots (series/shots-variants.mjs + sets-variants.mjs).

Opens web3d/shibuya/series/preview-variants.html (scene + sets + static placeholder crowd, no solver) in headless
Chromium with SwiftShader WebGL at 720x1280 CSS, device scale 1.5 (→ 1080x1920 PNG, like the recorder), renders
each requested shot at the requested beat-local times and saves <out>/<name>-t<t>.png; prints and writes timing.json.

  uv run --with playwright python tools/preview_variant_shots.py --out DIR \
      --shot 'op-flythrough' --shot 'eye-walk:{"walk":"hachiko","wp":3}' --times 0,2 [--name-suffix x] [--probe 0.7,0.8]
A --shot is KEY or KEY:JSONPARAMS or NAME=KEY:JSONPARAMS. Times apply to every shot (or KEY@t1,t2:JSON).
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
from pathlib import Path
import threading
import time
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402

from record_shibuya import QuietHandler, browser_with_webgl  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def parse_shot(s: str, times):
    name = None
    if '=' in s.split(':', 1)[0]:
        name, s = s.split('=', 1)
    key, _, js = s.partition(':')
    ts = times
    if '@' in key:
        key, tl = key.split('@', 1)
        ts = [float(x) for x in tl.split(',')]
    return (name or key), key, (json.loads(js) if js else {}), ts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--shot', action='append', default=[])
    ap.add_argument('--times', default='0')
    ap.add_argument('--repeat', type=int, default=2, help='renders per still (first warms shaders); ms = last')
    ap.add_argument('--query', default='')
    ap.add_argument('--probe', default='')
    ap.add_argument('--logo', action='store_true', help='print the OP logo anchor')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    times = [float(t) for t in args.times.split(',')]
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    report = {'viewport': [720, 1280], 'dsf': 1.5, 'shots': {}}
    tp = args.out / 'timing.json'
    if tp.exists():
        try:
            report['shots'] = json.loads(tp.read_text()).get('shots', {})
        except Exception:
            pass
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': 720, 'height': 1280}, device_scale_factor=1.5)
            logs = []
            page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
            page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
            t0 = time.time()
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/series/preview-variants.html?w=720&h=1280' + (f'&{args.query}' if args.query else ''))
            try:
                page.wait_for_function('window.__ready===true', timeout=600_000)
            except Exception:
                print('\n'.join(logs)); raise
            print('load', round(time.time()-t0, 1), 's', flush=True)
            if args.logo:
                print('logo', json.dumps(page.evaluate('__pv.logo({})')), flush=True)
            for spec in args.shot:
                name, key, params, ts = parse_shot(spec, times)
                for t in ts:
                    res = None
                    for _ in range(max(1, args.repeat)):
                        res = page.evaluate('([k,p,t])=>__pv.render(k,p,t)', [key, params, t])
                    s0 = time.time()
                    path = args.out / f'{name}-t{t:g}.png'
                    page.screenshot(path=str(path))
                    res['screenshot_ms'] = round((time.time()-s0)*1000)
                    res['ms'] = round(res['ms'])
                    report['shots'][f'{name}@{t:g}'] = {k: v for k, v in res.items() if k != 'env'} | {'params': params}
                    print(name, t, res['ms'], 'ms render', res['screenshot_ms'], 'ms png', res['drawCalls'], 'calls', res['triangles'], 'tris', json.dumps(res['shot']), flush=True)
                    if args.probe:
                        nx, ny = (float(v) for v in args.probe.split(','))
                        print(' probe', page.evaluate('([x,y])=>__pv.probe(x,y)', [nx, ny]))
            errs = [l for l in logs if 'error' in l.lower()]
            for line in errs[-20:]:
                print(line)
    finally:
        server.shutdown(); server.server_close()
    tp.write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
