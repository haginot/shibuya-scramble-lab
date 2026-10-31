"""science-sim-v2: render frames of web3d/shibuya/series/sci-v2.html (real solver trajectories, v9 costumes, PLATEAU city).
usage: v2_render.py --plan plan.json --out DIR [--w 720 --h 1280] [--start 0 --end N --step 1]
plan.json: {"fps":30,"frames":N,"cam":[[frame,{ts,pos,look,fov,...}],...]} (linear keyframes between entries) or a python-made per-frame list
  "per_frame": [{ts,pos,look,fov}, ...]"""
import argparse, functools, http.server, json, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from record_shibuya import QuietHandler
import contextlib
@contextlib.contextmanager
def browser_with_webgl(p):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    try: yield b
    finally: b.close()
ROOT = Path(__file__).resolve().parents[2]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', type=Path, required=True); ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--w', type=int, default=720); ap.add_argument('--h', type=int, default=1280)
    ap.add_argument('--start', type=int, default=0); ap.add_argument('--end', type=int, default=None); ap.add_argument('--step', type=int, default=1)
    ap.add_argument('--bin', default='sci/agents.bin'); ap.add_argument('--nosign', default='1'); ap.add_argument('--skip-existing', action='store_true')
    a = ap.parse_args(); a.out.mkdir(parents=True, exist_ok=True)
    plan = json.loads(a.plan.read_text()); pf = plan['per_frame']; end = a.end if a.end is not None else len(pf)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': a.w, 'height': a.h}, device_scale_factor=1)
            logs = []; page.on('console', lambda m: logs.append(f'{m.type}: {m.text}')); page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
            t0 = time.time()
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/series/sci-v2.html?w={a.w}&h={a.h}&bin={a.bin}&nosign={a.nosign}')
            try: page.wait_for_function('window.__ready===true', timeout=900_000)
            except Exception: print('\n'.join(logs[-30:])); raise
            print('loaded', round(time.time() - t0, 1), 's', page.evaluate('window.__info'), flush=True)
            for i in range(a.start, end, a.step):
                path = a.out / f'f{i:05d}.png'
                if a.skip_existing and path.exists(): continue
                r = page.evaluate('o=>window.__f(o)', pf[i])
                page.locator('canvas').screenshot(path=str(path))
                print(i, r, flush=True)
            for l in logs[-10:]: print(l)
    finally:
        server.shutdown(); server.server_close()
if __name__ == '__main__': main()
