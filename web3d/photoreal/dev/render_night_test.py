"""Headless render of night-test (real data, SwiftShader). Usage:
  nice -n 10 uv run --with playwright python web3d/photoreal/dev/render_night_test.py [views...] [--size WxH] [--t T]
Writes /workspace/projects/logs/ssl-claude-photoreal/qa/night-<view>.png and prints ms/frame + load time."""
import functools, http.server, sys, threading, time, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
from record_shibuya import browser_with_webgl  # noqa: E402

OUT = Path('/workspace/projects/logs/ssl-claude-photoreal/qa')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    from playwright.sync_api import sync_playwright
    args = sys.argv[1:]
    w, h, t, frames, query = 1080, 1920, 0.0, 2, ''
    views = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--size': w, h = map(int, args[i + 1].split('x')); i += 2; continue
        if a == '--t': t = float(args[i + 1]); i += 2; continue
        if a == '--frames': frames = int(args[i + 1]); i += 2; continue
        if a == '--query': query = args[i + 1]; i += 2; continue
        views.append(a); i += 1
    views = views or ['aerial', 'topdown', 'eye', 'tower']
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/web3d/photoreal/dev/night-test.html?{query}'
    with sync_playwright() as p:
        with browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': w, 'height': h})
            page.on('console', lambda m: print('[console]', m.text) if m.type in ('error', 'warning') else None)
            page.on('pageerror', lambda e: print('[pageerror]', e))
            t0 = time.time()
            page.goto(url)
            page.wait_for_function('window.__ready === true', timeout=300000)
            print('load', round(time.time() - t0, 1), 's', json.dumps(page.evaluate('window.__load')))
            for v in views:
                r = page.evaluate(f'window.__render({v!r}, {frames}, {t})')
                path = OUT / f'night-{v}.png'
                page.screenshot(path=str(path))
                print(f'{path.name}: ms/frame {[round(x) for x in r["times"]]} tris {r["tris"]} calls {r["calls"]}')
            page.close()
    server.shutdown()


if __name__ == '__main__':
    main()
