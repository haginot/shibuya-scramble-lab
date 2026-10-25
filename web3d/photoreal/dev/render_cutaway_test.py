"""Headless render of the cutaway synthetic test (SwiftShader). Usage:
  nice -n 10 uv run --with playwright python web3d/photoreal/dev/render_cutaway_test.py [views...]
Writes /workspace/projects/logs/ssl-claude-photoreal/qa/cutaway-<view>-<WxH>.png and prints ms/frame."""
import functools, http.server, sys, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
from record_shibuya import browser_with_webgl  # noqa: E402

OUT = Path('/workspace/projects/logs/ssl-claude-photoreal/qa')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    from playwright.sync_api import sync_playwright
    views = sys.argv[1:] or ['aerial', 'close']
    sizes = [(1080, 1920), (1920, 1080)]
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/web3d/photoreal/dev/cutaway-test.html'
    with sync_playwright() as p:
        with browser_with_webgl(p) as browser:
            for w, h in sizes:
                page = browser.new_page(viewport={'width': w, 'height': h})
                page.on('console', lambda m: print('[console]', m.text) if m.type in ('error', 'warning') else None)
                page.on('pageerror', lambda e: print('[pageerror]', e))
                page.goto(url)
                page.wait_for_function('window.__ready === true', timeout=60000)
                for v in views:
                    r = page.evaluate(f'window.__render({v!r}, 3)')
                    path = OUT / f'cutaway-{v}-{w}x{h}.png'
                    page.screenshot(path=str(path))
                    print(f'{path.name}: ms/frame {[round(t) for t in r["times"]]} tris {r["tris"]} calls {r["calls"]}')
                page.close()
    server.shutdown()


if __name__ == '__main__':
    main()
