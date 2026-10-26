"""Deterministic capture of a JR編 branching variant (shared opening or variant body), JP 9:16.

Page: web3d/shibuya/?mode=series&ep=jr&variant=<id>&part=opening|body&lang=ja&aspect=v&record=1 (series/app-variant.mjs,
series/variant-system.mjs), served from the repo root. Viewport 720x1280 CSS px at device_scale_factor 1.5 (DOM text at
1080x1920; WebGL canvas at pixel ratio --pr, CSS-upscaled), like tools/record_series.py. Every frame calls
window.__frame(t) (part time); nothing runs on a wall clock, so frames [start, end) of a part can be rendered on their
own (the crowd solver catches up deterministically) → resumable segments, written as fragmented MP4 (a killed segment
keeps every finished fragment). Before the first captured frame the page renders two warm-up frames at the segment start
(shader compile, logo bake, solver catch-up): the first captured frame is a real image (no black first frame).

Per-frame checks (check_frame; hard = the render stops):
  hard: 「フィクション」 tag while the fictional operator notice is on screen, parody/fiction note on the sources card
        (HAGINO steering 2026-10-26: no persistent ※パロディ label); every sim item labelled 「シミュレーション」; GAME OVER / GAME CLEAR / ESCAPED stamps only in
        beats whose config carries that stamp (and GAME OVER wording nowhere else); fact ids on screen known
        (sources-series.mjs FACTS) and never dropped; every claim covered by the footnote; footnote text present when a
        sourced claim is on screen and starts with 「出典：」; footnote not clipped / not in the bottom unsafe zone; no banned
        names / real-alert wording; cheat beat shows the cheat sheet; frame 0 of a part is not faded to black.
  soft (counted in the log + summary): HUD safe-area violations, title (header or logo) missing, shot/crowd/HUD fallbacks.
frames.jsonl gets one line per frame.

usage:
  python tools/record_variant.py --variant gate-over --part body --output seg.mp4 --log seg.jsonl --start-frame 0 --end-frame 300
  python tools/record_variant.py --variant gate-over --part opening --stills-at 0,2.5,4.6 --stills DIR
  python tools/record_variant.py contact --video V.mp4 --timeline tl.json --out C.jpg [--times 0,1.2,...]
  python tools/record_variant.py --variant combined/gate --part body --output seg.mp4 --start-frame 450 --end-frame 585
Combined episodes (variants/jr/combined/<pair>.json, tools/render_combined.sh): --variant combined/<pair>; the video must be
60–80 s (variant-system.mjs COMBINED_VIDEO) instead of 30–45 s; the contact sheet labels every combined beat (caught
press/flash/black, GAME OVER on black, CONTINUE?, kaiju rise/roar, end card, the fixed clear-result frame, …).
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time

T_IMPORT = time.monotonic()
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from record_series import (FPS, VIEWPORT, SCALE, OUT_SIZE, RUN_CACHE, PARODY, SIM_JA, BANNED_RE, CREDITS,  # noqa: E402
                           fact_table, ensure_run, SeriesHandler)

TITLE = 'ハロウィンの渋谷を脱出せよ！ JR編'
FICTION = 'フィクション'
STAMP_WORDS = {'gameover': re.compile(r'GAME\s*OVER|ゲームオーバー', re.I), 'clear': re.compile(r'GAME\s*CLEAR', re.I), 'escaped': re.compile(r'ESCAPED', re.I)}
STAMP_OF = {'GAME_OVER': 'gameover', 'GAME_CLEAR': 'clear', 'CLEAR': 'clear', 'ESCAPED': 'escaped'}
ALERT_RE = re.compile(r'J-?ALERT|Jアラート|緊急速報|国民保護|NHK|エリアメール', re.I)
CHEAT_MIN_SECONDS = 3
CONTACT_FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
VIDEO_RANGE = (30, 45)
COMBINED_RANGE = (60, 80)  # series/variant-system.mjs COMBINED_VIDEO


def is_combined(plan):
    return str(plan.get('variant') or '').startswith('combined/') or plan.get('kind') == 'combined'


def check_frame(rec, plan=None, facts=None, soft=None):
    """Assertions on one frame's record (window.__variantOverlay). Returns the record; soft issues → soft (dict counter)."""
    known, dropped = facts or fact_table()
    t = rec['t']
    soft = soft if soft is not None else {}
    strings = rec.get('strings') or []
    # HAGINO steering 2026-10-26: no persistent ※パロディ label. The fictional operator notice (cold open) must carry the
    # small 「フィクション」 tag; the sources card must carry the parody/fiction note.
    items = rec.get('items') or []
    if rec.get('notice') or 'notice' in items:
        assert rec.get('fiction') and any(FICTION in v for v in strings), ('「フィクション」 tag missing on the fictional notice', t)
    if 'sources' in items:
        assert rec.get('parodyNote') and any('パロディ' in v for v in strings), ('sources card without the parody/fiction note', t)
    for s in rec.get('sims') or []:
        assert s.get('label') and (SIM_JA in s['text'] or 'simulation' in s['text'].lower()), ('sim number without label', t, s)
    allowed = {STAMP_OF.get(k, k) for k in rec.get('allowedStamps') or []}
    for st in rec.get('stamps') or []:
        assert st in allowed, ('stamp not in this beat\'s config', t, st, rec.get('beat'))
    for v in strings:
        for kind, rx in STAMP_WORDS.items():
            if rx.search(v): assert kind in allowed, (f'{kind} wording outside its stamp beat', t, v)
        assert not BANNED_RE.search(v), ('banned name on screen', t)
        assert not ALERT_RE.search(v), ('real-alert wording on screen', t, v)
    claims, foot = set(rec.get('claims') or []), set((rec.get('footnote') or {}).get('ids') or [])
    assert claims <= foot, ('claims without a footnote', t, sorted(claims-foot))
    assert foot <= set(known), ('unknown fact ids', t, sorted(foot-set(known)))
    assert not (claims | foot) & dropped, ('dropped fact on screen', t, sorted((claims | foot) & dropped))
    text = (rec.get('footnote') or {}).get('text') or ''
    if any(not known[i]['na'] for i in claims): assert text, ('no footnote text', t, sorted(claims))
    if text: assert text.startswith('出典：') or text.startswith('Sources'), ('footnote prefix', t, text)
    fb = rec.get('footBox')
    if fb:
        assert fb['scrollH'] <= fb['clientH']+1, ('footnote clipped', t, fb)
        assert fb['bottom'] <= fb['limit'], ('footnote inside the bottom unsafe area', t, fb)
    if plan:
        beat = next(b for b in plan['beats'] if b['id'] == rec['beat'])
        if 'cheat' in beat['hud']: assert rec.get('cheat'), ('cheat sheet missing', t)
        assert sorted(beat['stamps']) == sorted(rec.get('allowedStamps') or []), ('stamp plan mismatch', t)
    if round(t*FPS) == 0: assert rec.get('fade', 1) >= .99, ('first frame of the part is faded (black first frame)', t, rec.get('fade'))
    # soft
    if rec.get('safe') and not rec['safe'].get('ok', True): soft['safe'] = soft.get('safe', 0)+1
    if not (rec.get('title') or {}).get('header') and not (rec.get('title') or {}).get('logo'): soft['no-title'] = soft.get('no-title', 0)+1
    for f in rec.get('fallbacks') or []: soft[f] = soft.get(f, 0)+1
    return rec


def check_plan(plan):
    assert plan['fps'] == FPS, plan['fps']
    assert plan['frames'] == round(plan['duration']*FPS), plan
    edges = [(b['f0'], b['f1']) for b in plan['beats']]
    assert edges[0][0] == 0 and edges[-1][1] == plan['frames'] and all(a[1] == b[0] for a, b in zip(edges, edges[1:])), 'beats must tile the part'
    if plan['part'] == 'body':
        lo, hi = COMBINED_RANGE if is_combined(plan) else VIDEO_RANGE
        assert lo-1e-6 <= plan['videoDuration'] <= hi+1e-6 or str(plan['id']).startswith('_'), (f'video must be {lo}–{hi} s', plan['videoDuration'])
        cheat = [b for b in plan['beats'] if 'cheat' in b['hud']]
        assert cheat and max(b['t1']-b['t0'] for b in cheat) >= CHEAT_MIN_SECONDS-1e-6, 'cheat sheet beat ≥ 3 s'
        assert any(b['stamps'] for b in plan['beats']), 'body has no stamp'
    else:
        assert not any(b['stamps'] for b in plan['beats']), 'no stamps in the opening'


def frame_line(frame, state, rec):
    return {'frame': frame, 't': round(frame/FPS, 4), 'vt': rec.get('vt'), 'beat': rec['beat'], 'shot': rec.get('shot'), 'crowd': rec.get('crowd'),
            'sims': [s['text'] for s in rec.get('sims') or []], 'stamps': rec.get('stamps'), 'claims': sorted(rec.get('claims') or []),
            'footnote': (rec.get('footnote') or {}).get('text'), 'safe': (rec.get('safe') or {}).get('ok'), 'fallbacks': rec.get('fallbacks'),
            'ms': rec.get('ms'), 'people': rec.get('peopleDrawn'), 'near': rec.get('near'), 'drawCalls': state.get('drawCalls'), 'triangles': state.get('triangles')}


def encoder_cmd(path, title=TITLE):
    return ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', str(FPS), '-i', '-', '-an',
            '-vf', f'scale={OUT_SIZE[0]}:{OUT_SIZE[1]}:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p',
            '-r', str(FPS), '-g', str(FPS//2), '-bf', '0', '-movflags', '+frag_keyframe+empty_moov+default_base_moof+use_metadata_tags',
            '-metadata', 'title='+title, '-metadata', 'comment='+CREDITS, str(path)]


def page_query(variant, part, agents=None, pr=1.0, opening=None):
    q = f'mode=series&ep=jr&variant={variant}&part={part}&lang=ja&aspect=v&record=1&jrrun=/__series/jr-run.json&pr={pr}'
    if agents: q += f'&agents={int(agents)}'
    if opening: q += f'&opening={opening}'
    return q


def record(variant, part, output=None, log=None, start_frame=0, end_frame=None, stills=None, stills_at=None, agents=None, pr=1.0,
           run_cache=RUN_CACHE, opening=None, summary_path=None):
    t_entry = time.monotonic()
    from playwright.sync_api import sync_playwright
    run_file = ensure_run(run_cache, agents)
    print(f'startup: imports {t_entry-T_IMPORT:.1f} s · playwright+run cache {time.monotonic()-t_entry:.1f} s', flush=True)
    handler = type('H', (SeriesHandler,), {'run_file': run_file})
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    facts = fact_table(); errors = []; encoder = None; started = time.monotonic(); timing = []; soft = {}
    try:
        with sync_playwright() as p, browser_with_webgl_ctx(p) as browser:
            page = browser.new_page(viewport={'width': VIEWPORT[0], 'height': VIEWPORT[1]}, device_scale_factor=SCALE)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: print('console:', m.text, flush=True) if m.type == 'error' or (m.type == 'warning' and 'toNonIndexed' not in m.text) else None)
            page.on('response', lambda r: print('http', r.status, r.url, flush=True) if r.status >= 400 else None)
            page.set_default_timeout(1800000)
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?{page_query(variant, part, agents, pr, opening)}')
            for _ in range(2400):
                if errors: raise RuntimeError('; '.join(errors))
                if page.evaluate('window.__ready===true'): break
                page.wait_for_timeout(250)
            else: raise RuntimeError('variant page never became ready')
            plan = page.evaluate('window.__variantPlan'); check_plan(plan)
            if not plan['validation']['ok']: raise RuntimeError('config invalid: '+'; '.join(plan['validation']['errors']))
            for w in plan['validation']['warnings']: print('config warning:', w, flush=True)
            end_frame = plan['frames'] if end_frame is None else end_frame
            if not 0 <= start_frame < end_frame <= plan['frames']: raise ValueError(f"frames must satisfy 0 <= {start_frame} < {end_frame} <= {plan['frames']}")
            first = (min(stills_at) if stills_at else start_frame/FPS)
            t0 = time.monotonic(); warm = page.evaluate(f'window.__warmup({round(first*FPS)/FPS})')
            print(f"warm-up {time.monotonic()-t0:.0f} s · {warm['agents']:,} agents · {variant}/{part} {plan['duration']:.2f} s ({plan['frames']} frames)", flush=True)
            shot = lambda: page.screenshot(type='png', animations='disabled', timeout=900000)
            if stills_at:
                stills.mkdir(parents=True, exist_ok=True)
                with (stills/'frames.jsonl').open('w', encoding='utf-8') as fl:
                    for t in sorted(stills_at):
                        frame = min(plan['frames']-1, round(t*FPS)); a = time.monotonic()
                        state = page.evaluate(f'window.__frame({frame/FPS})'); b = time.monotonic()
                        png = shot(); c = time.monotonic()
                        rec = check_frame(page.evaluate('window.__variantOverlay'), plan, facts, soft)
                        name = f'{part}-{t:05.2f}s.png'; (stills/name).write_bytes(png)
                        line = frame_line(frame, state, rec); line['wall_ms'] = {'frame': round((b-a)*1000), 'screenshot': round((c-b)*1000)}; line['png'] = name
                        fl.write(json.dumps(line, ensure_ascii=False)+'\n')
                        timing.append({'t': t, 'beat': rec['beat'], 'shot': rec['shot'], **line['wall_ms'], 'sim_ms': rec['ms']['sim'], 'render_ms': rec['ms']['render'], 'near': rec.get('near'), 'people': rec.get('peopleDrawn')})
                        print(f"still {t:5.2f}s · {rec['beat']:10s} · {rec['shot']['key']} ({rec['shot']['name']}) · frame {(b-a)*1000:.0f} ms (sim {rec['ms']['sim']} · render {rec['ms']['render']}) · png {(c-b)*1000:.0f} ms · near {rec.get('near')}", flush=True)
                        if errors: raise RuntimeError('; '.join(errors))
                (stills/'timing.json').write_text(json.dumps({'variant': variant, 'part': part, 'viewport': VIEWPORT, 'scale': SCALE, 'pr': pr, 'warmup_s': round(time.monotonic()-t0), 'soft': soft, 'stills': timing}, indent=1), encoding='utf-8')
                return timing
            output.parent.mkdir(parents=True, exist_ok=True)
            encoder = subprocess.Popen(encoder_cmd(output), stdin=subprocess.PIPE)
            fl = log.open('a', encoding='utf-8') if log else None
            ms = []
            for frame in range(start_frame, end_frame):
                a = time.monotonic()
                state = page.evaluate(f'window.__frame({frame/FPS})')
                png = shot()
                rec = check_frame(page.evaluate('window.__variantOverlay'), plan, facts, soft)
                encoder.stdin.write(png); ms.append((time.monotonic()-a)*1000)
                if fl: fl.write(json.dumps(frame_line(frame, state, rec), ensure_ascii=False)+'\n'); fl.flush()
                if frame % FPS == 0:
                    print(f"{frame/FPS:5.1f}/{plan['duration']:.1f}s · {rec['beat']} · {rec['shot']['key']} · sim {rec['ms']['sim']} ms · render {rec['ms']['render']} ms · {ms[-1]:.0f} ms/frame · elapsed {time.monotonic()-started:.0f} s", flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            encoder.stdin.close()
            if encoder.wait(timeout=300): raise RuntimeError('ffmpeg failed')
            encoder = None
            if fl: fl.close()
            ms.sort()
            summary = {'output': str(output), 'variant': variant, 'part': part, 'frames': [start_frame, end_frame], 'wall_s': round(time.monotonic()-started),
                       'ms_per_frame': {'median': round(ms[len(ms)//2]), 'p95': round(ms[int(len(ms)*.95)])}, 'soft': soft}
            print(json.dumps(summary, ensure_ascii=False), flush=True)
            if summary_path: Path(summary_path).write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
            return summary
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)
        if encoder:
            encoder.stdin.close(); encoder.terminate(); encoder.wait(timeout=10)


def browser_with_webgl_ctx(p):
    from record_shibuya import browser_with_webgl
    return browser_with_webgl(p)


# ---------------------------------------------------------------- contact sheet
def contact_times(timeline):
    """Explicit contact-sheet times (video seconds) from a variant_cues.mjs timeline: OP flythrough ×2, logo slam, logo hold,
    PRESS START, each prologue card, then per body beat (choice: mid + after the pick, stamp: just after impact, cards: mid)."""
    out = []
    op, body = timeline['parts']['opening'], timeline['parts']['body']
    for b in op['beats']:
        d = b['t1']-b['t0']; hud = b['hud']
        press = any(h.startswith('press') or h == 'logo:press' for h in hud)
        if 'logo' in hud and not press:
            out += [(b['t0']+min(d-.05, 1.25), f"logo slam · {b['id']}"), (b['t1']-.1, f"logo hold · {b['id']}")]
        elif press: out.append((b['t0']+d*.45, f"PRESS START · {b['id']}"))
        elif b['shot'] == 'op-flythrough': out += [(b['t0'], f"OP first frame · {b['id']}"), (b['t0']+d*.6, f"OP fly · {b['id']}")]
        else: out.append((b['t0']+d*.6, f"OP {b['id']}"))
    combined = timeline.get('kind') == 'combined'
    for b in body['beats']:
        d = b['t1']-b['t0']; hud = b['hud']; t0 = body['offset']+b['t0']
        if combined and b['id'] in COMBINED_CONTACT:
            out += [(t0+min(d-1/FPS, max(0, x if x >= 0 else d+x)), f"{lab} · {b['id']}") for x, lab in COMBINED_CONTACT[b['id']]]
            continue
        if combined and (b.get('fix') or b.get('origin')) and b['id'] == 'clear-result':
            out += [(t0+d*.3, f"clear-result (re-shot) · {b['id']}"), (t0+FIX_AT, f"FIX frame (orig {timeline['parts']['opening']['duration']+FIX_BODY:.1f}s) · {b['id']}")]
            continue
        if 'choice' in hud: out += [(t0+d*.45, f"choice · {b['id']}"), (t0+d-.2, f"selected · {b['id']}")]
        elif any(h.startswith('stamp') for h in hud): out.append((t0+min(d-.05, 1.0), f"stamp · {b['id']}"))
        else: out.append((t0+d*.6, f"{b['id']}"))
    seen, res = set(), []
    for t, lab in out:
        f = max(0, min(timeline['frames']-1, round(t*FPS)))
        if f not in seen: seen.add(f); res.append((f/FPS, lab))
    return res


# combined beats: (beat-local s, negative = from the end; label). The caught times follow caught-pov flashAt 1.75 / blackAt 2.15.
COMBINED_CONTACT = {
    'caught': [(.5, 'caught: press'), (1.5, 'caught: hands'), (1.8, 'caught: red flash'), (2.3, 'caught: black')],
    'over-stamp': [(1.0, 'GAME OVER on black'), (-.1, 'OVER + safety')],
    'continue': [(.6, 'CONTINUE? 3'), (-.3, 'CONTINUE? YES')],
    'kaiju': [(1.0, 'kaiju rise'), (2.6, 'kaiju roar + gag')],
    'endcard': [(1.2, 'end card')],
    'sources': [(1.8, 'sources (union)')],
}
FIX_BODY = 13.4        # the QA'd fix moment: 13.4 s into the clear body (27.6 s video) …
FIX_AT = FIX_BODY-11.0  # … = 2.4 s into its result beat (body 11.0–15.0 s)


def contact(video, out, times, cols=5, width=216):
    from PIL import Image, ImageDraw, ImageFont
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)], capture_output=True, text=True).stdout.strip() or 0)
    if dur: times = [(t, lab) for t, lab in times if t < dur-1/FPS]  # a shorter (test) video: only the times it has
    h = round(width*16/9)+28
    rows = (len(times)+cols-1)//cols
    sheet = Image.new('RGB', (cols*width, rows*h), (12, 8, 16))
    font = ImageFont.truetype(CONTACT_FONT, 13) if os.path.exists(CONTACT_FONT) else ImageFont.load_default()
    with tempfile.TemporaryDirectory() as tmp:
        for i, (t, label) in enumerate(times):
            png = Path(tmp)/f'{i:03d}.png'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t:.4f}', '-i', str(video), '-frames:v', '1', '-vf', f'scale={width}:-2:flags=lanczos', str(png)], check=True)
            im = Image.open(png).convert('RGB')
            x, y = (i % cols)*width, (i//cols)*h
            sheet.paste(im, (x, y))
            txt = f'{t:5.2f}s {label}'
            while len(txt) > 8 and hasattr(font, 'getlength') and font.getlength(txt) > width-8: txt = txt[:-2]+'…'  # one tile, no overlap
            ImageDraw.Draw(sheet).text((x+4, y+im.height+5), txt, fill=(255, 210, 63), font=font)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=90)
    return out


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == 'contact':
        ap = argparse.ArgumentParser(prog='record_variant.py contact')
        ap.add_argument('--video', type=Path, required=True); ap.add_argument('--out', type=Path, required=True)
        ap.add_argument('--timeline', type=Path); ap.add_argument('--times', help='comma-separated seconds (default: from --timeline)')
        ap.add_argument('--cols', type=int, default=5)
        a = ap.parse_args(argv[1:])
        if a.times: times = [(float(x), '') for x in a.times.split(',')]
        else: times = contact_times(json.loads(a.timeline.read_text(encoding='utf-8')))
        print(contact(a.video, a.out, times, a.cols)); print(json.dumps([[round(t, 3), lab] for t, lab in times], ensure_ascii=False))
        return 0
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--variant', required=True, help='config id (web3d/shibuya/series/variants/jr/<id>.json)')
    ap.add_argument('--part', choices=('opening', 'body'), default='body')
    ap.add_argument('--opening', help='opening config id (default _opening, else _sample-opening)')
    ap.add_argument('--output', type=Path); ap.add_argument('--log', type=Path); ap.add_argument('--summary', type=Path)
    ap.add_argument('--start-frame', type=int, default=0); ap.add_argument('--end-frame', type=int)
    ap.add_argument('--stills', type=Path, default=Path('/tmp/variant-stills'))
    ap.add_argument('--stills-at', type=lambda v: [float(x) for x in v.split(',')], help='only write preview PNGs at these part seconds')
    ap.add_argument('--agents', type=int, help='smaller crowd (preview only)')
    ap.add_argument('--pr', type=float, default=1.0)
    ap.add_argument('--run-cache', type=Path, default=RUN_CACHE)
    a = ap.parse_args(argv)
    kw = dict(agents=a.agents, pr=a.pr, run_cache=a.run_cache, opening=a.opening)
    if a.stills_at: return record(a.variant, a.part, stills=a.stills, stills_at=a.stills_at, **kw)
    if not a.output: ap.error('--output is required (or --stills-at)')
    return record(a.variant, a.part, a.output, a.log, a.start_frame, a.end_frame, summary_path=a.summary, **kw)


if __name__ == '__main__':
    main()
