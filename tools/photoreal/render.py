"""Deterministic capture of the photoreal cutaway backdrop (web3d/photoreal/index.html).

The page exposes window.__ready, window.__shots (still presets) and window.__frame(t, shot?) which positions the
camera (clip path at time t seconds, or a named still preset) and draws one frame synchronously. Nothing runs on a
wall clock, so any frame range of the clip can be rendered on its own: long clips are rendered as resumable
segments (fragmented MP4) and concatenated (tools/photoreal/render.sh).

usage (always under `nice -n 10`):
  uv run --with playwright python tools/photoreal/render.py --stills OUTDIR [--only aerial,topdown] [--clip-at 0,5,9.9]
  uv run --with playwright python tools/photoreal/render.py --output seg-00.mp4 --start-frame 0 --end-frame 100
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools'))
from record_shibuya import QuietHandler, browser_with_webgl  # noqa: E402

FPS = 30
CREDIT = '出典：国土交通省 PLATEAU（渋谷区 2025 建築物LOD2・道路LOD3 ほか、加工して作成）／出典：国土地理院（標高タイル、加工して作成）'


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def encoder(output: Path):
    return subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', str(FPS),
                             '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-threads', '2', '-pix_fmt', 'yuv420p',
                             '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-g', str(FPS),
                             '-metadata', f'comment={CREDIT}', str(output)], stdin=subprocess.PIPE)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--stills', type=Path, help='write every still preset as OUTDIR/<name>.png')
    ap.add_argument('--only', default='', help='comma list of still presets')
    ap.add_argument('--prefix', default='photoreal-', help='still file name prefix')
    ap.add_argument('--clip-at', default='', help='with --stills: also write clip frames at these seconds (clip-<t>.png)')
    ap.add_argument('--output', type=Path, help='segment MP4 (fragmented)')
    ap.add_argument('--start-frame', type=int, default=0)
    ap.add_argument('--end-frame', type=int, default=300)
    ap.add_argument('--size', default='1080x1920')
    ap.add_argument('--query', default='', help='extra URL query (e.g. debug=1)')
    args = ap.parse_args()
    w, h = map(int, args.size.split('x'))
    from playwright.sync_api import sync_playwright
    server = serve()
    errors = []
    with sync_playwright() as p, browser_with_webgl(p) as browser:
        page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: print('[page]', m.text, flush=True) if m.type in ('error', 'warning') or m.text.startswith('[pr]') else None)
        page.set_default_timeout(900000)
        t0 = time.monotonic()
        page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/photoreal/index.html?record=1{"&"+args.query if args.query else ""}')
        page.wait_for_function('window.__ready===true||window.__error', timeout=900000, polling=1000)
        if page.evaluate('window.__error||null'): raise RuntimeError(page.evaluate('window.__error'))
        print(f'loaded in {time.monotonic()-t0:.1f}s', json.dumps(page.evaluate('window.__stats||{}')), flush=True)
        shot = lambda: page.screenshot(type='png', animations='disabled', timeout=900000)
        if args.stills:
            args.stills.mkdir(parents=True, exist_ok=True)
            names = [n for n in args.only.split(',') if n] or page.evaluate('Object.keys(window.__shots)')
            timing = {}
            for name in names:
                a = time.monotonic(); page.evaluate(f'window.__frame(0, {json.dumps(name)})')
                b = time.monotonic(); (args.stills/f'{args.prefix}{name}.png').write_bytes(shot())
                timing[name] = {'render_s': round(b-a, 2), 'shot_s': round(time.monotonic()-b, 2)}
                print(name, timing[name], flush=True)
            for sec in [float(v) for v in args.clip_at.split(',') if v]:
                page.evaluate(f'window.__frame({sec})'); (args.stills/f'clip-{sec:05.2f}.png').write_bytes(shot())
            (args.stills/'timing.json').write_text(json.dumps(timing, indent=1))
        if args.output:
            enc = encoder(args.output)
            for f in range(args.start_frame, args.end_frame):
                a = time.monotonic(); page.evaluate(f'window.__frame({f/FPS})'); png = shot()
                enc.stdin.write(png)
                if f % 10 == 0: print(f'frame {f} {time.monotonic()-a:.2f}s', flush=True)
            enc.stdin.close()
            if enc.wait(timeout=600): raise RuntimeError('ffmpeg failed')
    if errors: raise RuntimeError('page errors: '+' | '.join(errors[:5]))


if __name__ == '__main__': main()
