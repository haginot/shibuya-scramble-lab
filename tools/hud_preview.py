"""Capture the series HUD preview (web3d/shibuya/series/ui/preview.html) at 1080x1920 (720x1280 CSS, dsf 1.5).

  uv run --with playwright python tools/hud_preview.py --out DIR [--shots choice@1.4,stamp-over@0.2 ...] [--contact]

Default shot list covers every component incl. animation phases (+ the combined-episode components: stamp on black,
CONTINUE?, gag, end card, compact sources). Writes DIR/<scene>@<t>.png, DIR/timing.json
(per-frame DOM update+paint ms and screenshot ms) and DIR/records.json (GameHUD records: safe-area check etc.).
No WebGL needed (pure DOM over a still).
"""
import argparse, functools, http.server, json, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V6 = ('mission-card@0.1,mission-card@1.5,first-choice@0.6,first-choice@1.6,first-choice@3.8,true-end@0.1,true-end@0.3,true-end@2.0,'
      'guide@0.3,guide@1.5,goodbye@0.4,goodbye@3.0,goodbye-black@3.0,sources-v6@2.0')
DEFAULT = ('notice@0.12,notice@2.0,rules@0.15,rules@2.5,press@0.3,press@1.6,start@0.1,start@2.0,choice@0.12,choice@1.2,choice@2.4,choice@3.35,choice@3.9,'
           'consequence@1.5,stamp-over@0.08,stamp-over@0.2,stamp-over@0.45,stamp-over@1.4,stamp-clear@0.22,stamp-clear@1.4,stamp-esc@1.4,'
           'lesson@0.2,lesson@2.0,cheat@0.3,cheat@2.0,sources@2.0,map@1.5,'
           # combined episodes (2026-10-26)
           'stamp-black@0.2,stamp-black@1.2,continue@0.4,continue@1.6,continue@2.4,gag@0.3,gag@1.5,endcard@0.6,endcard@1.8,sources-union@2.0,'
           # v6 (2026-10-27)
           + V6)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--shots', default=DEFAULT, help="comma list scene@t, or 'v6' for the v6 components only")
    ap.add_argument('--contact', action='store_true', help='also write contact.jpg')
    a = ap.parse_args()
    if a.shots == 'v6': a.shots = V6
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    th = threading.Thread(target=srv.serve_forever, daemon=True); th.start()
    timing, records, errors, files = [], {}, [], []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={'width': 720, 'height': 1280}, device_scale_factor=1.5)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: print('console:', m.text) if m.type in ('error', 'warning') else None)
            page.goto(f'http://127.0.0.1:{srv.server_address[1]}/web3d/shibuya/series/ui/preview.html')
            page.wait_for_function('window.__ready===true', timeout=120000)
            for s in a.shots.split(','):
                scene, t = s.split('@'); t = float(t)
                t0 = time.monotonic(); r = page.evaluate(f'window.__preview.render({json.dumps(scene)},{t})'); t1 = time.monotonic()
                png = page.screenshot(type='png', animations='disabled'); t2 = time.monotonic()
                f = out / f'{scene}@{t:.2f}.png'; f.write_bytes(png); files.append(f)
                rec = r['rec']; records[s] = rec
                timing.append({'shot': s, 'frame_ms': round(r['ms'], 1), 'eval_ms': round((t1-t0)*1000), 'screenshot_ms': round((t2-t1)*1000)})
                print(f"{s:18s} frame {r['ms']:6.1f} ms · png {(t2-t1)*1000:5.0f} ms · safe {'ok' if rec['safe']['ok'] else rec['safe']['violations']} · note {rec.get('parodyNote')} · fiction {rec.get('fiction')}")
            b.close()
    finally:
        srv.shutdown()
    (out/'timing.json').write_text(json.dumps(timing, indent=1))
    (out/'records.json').write_text(json.dumps(records, ensure_ascii=False, indent=1))
    if errors: raise SystemExit('page errors: ' + '; '.join(errors))
    # HAGINO steering 2026-10-26: no persistent ※パロディ sticker; the sources card must carry the parody/fiction note and
    # the fictional notice the 「フィクション」 tag (same rule as tools/record_variant.py check_frame)
    bad = [k for k, r in records.items() if not r['safe']['ok'] or ('sources' in r['items'] and not r.get('parodyNote'))
           or ('notice' in r['items'] and not r.get('fiction'))]
    # v6 GOODBYE end card: the 4 blocks (quote / facts / ours / foot) must not overlap (visually separate blocks)
    for k, r in records.items():
        gb = sorted([b for b in r['boxes'] if b['c'].startswith('goodbye-')], key=lambda b: b['y0'])
        if gb and (len(gb) != 4 or any(gb[i]['y1'] > gb[i+1]['y0'] for i in range(3))):
            bad.append(k + ' (goodbye blocks overlap/missing)')
    if a.contact:
        from PIL import Image
        cols = 6; w, h = 360, 640; rows = (len(files)+cols-1)//cols
        sheet = Image.new('RGB', (cols*w, rows*h), (0, 0, 0))
        for i, f in enumerate(files): sheet.paste(Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS), ((i % cols)*w, (i//cols)*h))
        sheet.save(out/'contact.jpg', quality=88)
    if bad: raise SystemExit(f'safe-area/parody check failed: {bad}')


if __name__ == '__main__':
    main()
