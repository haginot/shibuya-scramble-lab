"""Deterministic capture of the series pilot 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」 (JP, 9:16).

Page: web3d/shibuya/?mode=series&ep=jr&lang=ja&aspect=v&record=1 (series/app-jr.mjs, director-jr.mjs,
overlay-jr.mjs), served from the repo root. Viewport 720x1280 CSS px at device_scale_factor 1.5, so the DOM
text is rendered at 1080x1920 while the WebGL canvas draws at pixel ratio 1 (720x1280, CSS-upscaled;
--pr raises it). Every frame calls window.__frame(t): the crowd solver is stepped to the director's JR time and
the frame is drawn; nothing runs on a wall clock. Frames [start, end) of a segment can be rendered on their own
(the solver catches up deterministically), so a long render is split into resumable segments
(tools/render_series.sh) written as fragmented MP4 (a killed segment keeps every finished fragment).

Each frame is checked (check_frame): title present (header or title card), 「フィクション」 tag on the cold open + parody line on the end card (steering 2026-10-26), every
simulation number labelled 「シミュレーション」 and equal to its source value, fact ids on screen known
(sources-series.mjs FACTS) and never dropped, every claim covered by the on-screen footnote, GAME OVER only in
the tally. frames.jsonl gets one line per frame with every shown sim number (text + source) and the fact ids.

usage:
  python tools/record_series.py --output seg-00.mp4 --log seg-00.jsonl --start-frame 0 --end-frame 600
  python tools/record_series.py --stills-at 1,3.5,6 --stills DIR      (preview PNGs named by second + timing.json)
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from record_shibuya import QuietHandler, browser_with_webgl  # noqa: E402

FPS = 30
DURATION = 58
FRAMES = DURATION*FPS
VIEWPORT = (720, 1280)
SCALE = 1.5
OUT_SIZE = (1080, 1920)
LOGS = Path('/workspace/projects/logs/ssl-claude-halloween/series')
RUN_CACHE = LOGS/'cache/jr-run.json'
TITLE = '🧙ハロウィンの渋谷を脱出せよ！🎃 JR編'
SUBTITLE = '10/31 渋谷からどう帰る？'
QUESTION = 'あなたはどの改札から脱出する？'
PARODY = '※パロディ'
FICTION = 'フィクション'
SIM_JA = 'シミュレーション'
CHEAT_MIN_SECONDS = 3
GAME_OVER_RE = re.compile(r'GAME\s*OVER|ゲームオーバー', re.I)
BANNED_RE = re.compile(''.join(map(chr, (101, 110, 97, 98, 108, 101)))+r'\s*x|'+''.join(map(chr, (0x30AB, 0x30F3, 0x30EA, 0x30FC)))+'|'+''.join(map(chr, (99, 97, 110)))+'-?ly', re.I)
CREDITS = ('Buildings: MLIT Project PLATEAU, Shibuya City 2023 (LOD1/LOD2, CC BY 4.0, modified) · '
           'Roads, rails, wide area, walking routes: © OpenStreetMap contributors (ODbL 1.0) · '
           'Facts: sources on screen and on the end card (checked 2026-10-25) · '
           'Counts, density, ESCAPED/GAME OVER: simulation (toy model, not a forecast) · PARODY')


def jsround(v): return math.floor(v+.5)
def fmt(v): return f'{jsround(v):,}'
def p1(v): return f'{jsround(v*10)/10:.1f}'
def mmss(s): return '--:--' if s is None else f'{int(s//60):02d}:{int(s % 60):02d}'


def section_at(t, sections):
    for k, a, b in sections:
        if a <= t < b: return k
    return sections[-1][0]


@functools.lru_cache(maxsize=1)
def fact_table():
    """{id: {'na': bool}} for every fact the series may show (sources-series.mjs FACTS) and the DROPPED ids."""
    js = ("import('./web3d/shibuya/series/sources-series.mjs').then(m=>console.log(JSON.stringify("
          "{facts:Object.fromEntries(Object.entries(m.FACTS).map(([k,v])=>[k,{na:!!v.na,v:v.v}])),dropped:m.DROPPED})))")
    out = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT, text=True))
    return out['facts'], set(out['dropped'])


def check_frame(rec, plan=None, facts=None):
    """Assertions on one frame's overlay record (window.__seriesOverlay). Returns the record."""
    known, dropped = facts or fact_table()
    t, sec = rec['t'], rec['section']
    if plan:
        assert sec == section_at(t, plan['sections']), ('section mismatch', t, sec)
    strings = rec.get('strings') or []
    # title + parody
    assert rec['title']['header'] or rec['title']['card'], ('title missing', t)
    if rec['title']['header']: assert TITLE in strings and SUBTITLE in strings, ('title header text', t)
    if rec['title']['card']: assert any(s.replace('\n', '').replace('🎃JR', '🎃 JR') == TITLE for s in strings), ('title card text', t)
    # HAGINO steering 2026-10-26: no persistent ※パロディ; the fictional cold open carries the 「フィクション」 tag and the
    # end card its parody line (a persistent sticker, ?parody=1, is still accepted)
    if not rec.get('parody'):
        if sec == 'cold': assert rec.get('fiction') and FICTION in strings, ('「フィクション」 tag missing on the cold open', t)
        if sec == 'end': assert any('パロディ' in s or 'parody' in s.lower() for s in strings), ('parody note missing on the end card', t)
    # simulation numbers: labelled and equal to their source
    for s in rec.get('sims') or []:
        assert s['label'] and (SIM_JA in s['text'] or 'simulation' in s['text'].lower()), ('sim number without label', t, s)
        sh, src = s['shown'], s['src']
        k = s['key']
        if k == 'density': assert sh['d'] == p1(src['value']), s
        elif k == 'queue': assert sh['queue'] == fmt(src['value']), s
        elif k == 'arrival' or k.startswith('route'): assert sh['mmss'] == mmss(src['value']), s
        elif k == 'tally': assert sh == {'escaped': str(src['escaped']), 'total': str(src['total'])}, s
    go = rec.get('gameOver')
    if go: assert go['escaped'] == sum(o == 'escaped' for o in go['outcomes']) and go['total'] == len(go['outcomes']), go
    for v in strings:
        if GAME_OVER_RE.search(v): assert sec == 'tally', ('GAME OVER outside the tally', t, v)
        assert not BANNED_RE.search(v), ('banned name on screen', t)
    # facts: known, not dropped, every claim in the footnote, footnote non-empty when an outlet exists
    claims, foot = set(rec['claims']), set(rec['footnote']['ids'])
    assert claims <= foot, ('claims without a footnote', t, claims-foot)
    assert foot <= set(known), ('unknown fact ids', t, foot-set(known))
    assert not (claims | foot) & dropped, ('dropped fact on screen', t, (claims | foot) & dropped)
    sourced = [i for i in claims if not known[i]['na']]
    if sourced: assert rec['footnote']['text'], ('no footnote text', t, sourced)
    if sec != 'end' and rec['footnote']['text']: assert rec['footnote']['text'].startswith('出典：'), rec['footnote']
    if sec == 'ask': assert QUESTION in strings, ('closing question missing', t)
    fb = rec.get('footBox')  # rendered footnote (browser frames): not clipped, above the bottom unsafe zone
    if fb:
        assert fb['scrollH'] <= fb['clientH']+1, ('footnote clipped', t, fb)
        assert fb['bottom'] <= fb['limit'], ('footnote inside the bottom unsafe area', t, fb)
    if sec == 'cheat': assert rec.get('cheat'), ('cheat sheet missing', t)
    if sec == 'end': assert rec.get('endSources'), ('end card without sources', t)
    return rec


def check_plan(plan):
    assert plan['fps'] == FPS and plan['duration'] == DURATION and plan['frames'] == FRAMES, plan
    secs = {k: (a, b) for k, a, b in plan['sections']}
    assert 45 <= DURATION <= 60
    assert secs['cheat'][1]-secs['cheat'][0] >= CHEAT_MIN_SECONDS, secs['cheat']
    for k in ('cold', 'title', 'mission', 'walk', 'inside', 'gates', 'alt', 'taxi', 'fall', 'tally', 'cheat', 'ask', 'end'): assert k in secs, k
    edges = [s[1] for s in plan['sections']]+[plan['sections'][-1][2]]
    assert edges[0] == 0 and edges[-1] == DURATION and all(a[2] == b[1] for a, b in zip(plan['sections'], plan['sections'][1:])), 'sections must tile the video'


def frame_line(frame, state, rec):
    return {'frame': frame, 't': round(frame/FPS, 4), 'section': rec['section'], 'shot': rec.get('shot'), 'sim': rec.get('sim'),
            'sims': [{'key': s['key'], 'text': s['text'], 'shown': s['shown'], 'src': s['src']} for s in rec.get('sims') or []],
            'claims': sorted(rec['claims']), 'footnote': rec['footnote']['text'], 'stamps': rec.get('stamps'), 'ms': rec.get('ms'),
            'drawCalls': state.get('drawCalls'), 'triangles': state.get('triangles')}


def ensure_run(cache=RUN_CACHE, agents=None):
    if agents: cache = cache.with_name(f'{cache.stem}-{int(agents)}{cache.suffix}')  # preview crowd: own cache file
    cache.parent.mkdir(parents=True, exist_ok=True)
    cmd = ['node', str(ROOT/'tools/precompute_series_jr.mjs'), str(cache)]+(['--agents', str(agents)] if agents else [])
    subprocess.run(cmd, check=True, cwd=ROOT)
    return cache


class SeriesHandler(QuietHandler):
    run_file: Path = RUN_CACHE
    def translate_path(self, path):
        if path.split('?')[0] == '/__series/jr-run.json': return str(self.run_file)
        return super().translate_path(path)


def encoder_cmd(path):
    return ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', str(FPS), '-i', '-', '-an',
            '-vf', f'scale={OUT_SIZE[0]}:{OUT_SIZE[1]}:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p',
            '-r', str(FPS), '-g', str(FPS//2), '-movflags', '+frag_keyframe+empty_moov+default_base_moof+use_metadata_tags',
            '-metadata', 'title='+TITLE, '-metadata', 'comment='+CREDITS, str(path)]


def record(output=None, log=None, start_frame=0, end_frame=FRAMES, stills=None, stills_at=None, agents=None, pr=1.0, run_cache=RUN_CACHE):
    from playwright.sync_api import sync_playwright
    run_file = ensure_run(run_cache, agents)
    handler = type('H', (SeriesHandler,), {'run_file': run_file})
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    facts = fact_table(); errors = []; encoder = None; started = time.monotonic(); timing = []
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': VIEWPORT[0], 'height': VIEWPORT[1]}, device_scale_factor=SCALE)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: print('console:', m.text, flush=True) if m.type in ('error',) else None)
            page.set_default_timeout(1800000)
            q = f'mode=series&ep=jr&lang=ja&aspect=v&record=1&jrrun=/__series/jr-run.json&pr={pr}'+(f'&agents={int(agents)}' if agents else '')
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?{q}')
            for _ in range(2400):
                if errors: raise RuntimeError('; '.join(errors))
                if page.evaluate('window.__ready===true'): break
                page.wait_for_timeout(250)
            else: raise RuntimeError('series page never became ready')
            plan = page.evaluate('window.__seriesPlan'); check_plan(plan)
            t0 = time.monotonic(); warm = page.evaluate('window.__warmup()')
            print(f"warm-up {time.monotonic()-t0:.0f} s · {warm['agents']:,} agents · run {warm['run']['key']} · "+' · '.join(f"{r['key']} {r['outcome']} p50 {r['timeP50']:.0f}s" for r in warm['run']['routes']), flush=True)
            shot = lambda: page.screenshot(type='png', animations='disabled', timeout=900000)
            if stills_at:
                stills.mkdir(parents=True, exist_ok=True)
                with (stills/'frames.jsonl').open('w', encoding='utf-8') as fl:
                    for t in sorted(stills_at):
                        frame = round(t*FPS); a = time.monotonic()
                        state = page.evaluate(f'window.__frame({frame/FPS})'); b = time.monotonic()
                        png = shot(); c = time.monotonic()
                        rec = check_frame(page.evaluate('window.__seriesOverlay'), plan, facts)
                        (stills/f'{t:05.2f}s.png').write_bytes(png)
                        line = frame_line(frame, state, rec); line['wall_ms'] = {'frame': round((b-a)*1000), 'screenshot': round((c-b)*1000)}; fl.write(json.dumps(line, ensure_ascii=False)+'\n')
                        timing.append({'t': t, 'section': rec['section'], 'shot': rec.get('shot'), **line['wall_ms'], 'sim_ms': rec['ms']['sim'], 'render_ms': rec['ms']['render']})
                        print(f"still {t:5.2f}s · {rec['section']:8s} · {rec.get('shot')} · frame {(b-a)*1000:.0f} ms (sim {rec['ms']['sim']} · render {rec['ms']['render']}) · png {(c-b)*1000:.0f} ms", flush=True)
                        if errors: raise RuntimeError('; '.join(errors))
                # steady-state cost: consecutive frames per section (the first frame of a still may include a sim catch-up)
                (stills/'timing.json').write_text(json.dumps({'viewport': VIEWPORT, 'scale': SCALE, 'pr': pr, 'warmup_s': round(time.monotonic()-t0), 'stills': timing}, indent=1), encoding='utf-8')
                return timing
            output.parent.mkdir(parents=True, exist_ok=True)
            encoder = subprocess.Popen(encoder_cmd(output), stdin=subprocess.PIPE)
            fl = log.open('a', encoding='utf-8') if log else None
            ms = []
            for frame in range(start_frame, end_frame):
                a = time.monotonic()
                state = page.evaluate(f'window.__frame({frame/FPS})')
                png = shot()
                rec = check_frame(page.evaluate('window.__seriesOverlay'), plan, facts)
                encoder.stdin.write(png); ms.append((time.monotonic()-a)*1000)
                if fl: fl.write(json.dumps(frame_line(frame, state, rec), ensure_ascii=False)+'\n'); fl.flush()
                if frame % FPS == 0:
                    print(f"{frame/FPS:5.1f}/{DURATION}s · {rec['section']} · {rec.get('shot')} · sim {rec['ms']['sim']} ms · render {rec['ms']['render']} ms · {ms[-1]:.0f} ms/frame · elapsed {time.monotonic()-started:.0f} s", flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            encoder.stdin.close()
            if encoder.wait(timeout=300): raise RuntimeError('ffmpeg failed')
            encoder = None
            if fl: fl.close()
            ms.sort()
            summary = {'output': str(output), 'frames': [start_frame, end_frame], 'wall_s': round(time.monotonic()-started), 'ms_per_frame': {'median': round(ms[len(ms)//2]), 'p95': round(ms[int(len(ms)*.95)])}}
            print(json.dumps(summary), flush=True)
            return summary
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)
        if encoder:
            encoder.stdin.close(); encoder.terminate(); encoder.wait(timeout=10)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--output', type=Path, help='segment MP4 (fragmented)')
    ap.add_argument('--log', type=Path, help='frames.jsonl to append to')
    ap.add_argument('--start-frame', type=int, default=0)
    ap.add_argument('--end-frame', type=int, default=FRAMES)
    ap.add_argument('--stills', type=Path, default=LOGS/'stills-preview')
    ap.add_argument('--stills-at', type=lambda v: [float(x) for x in v.split(',')], help='only write preview PNGs at these video seconds')
    ap.add_argument('--agents', type=int, help='smaller crowd (preview only)')
    ap.add_argument('--pr', type=float, default=1.0, help='WebGL pixel ratio (1 = 720x1280 canvas, CSS-upscaled)')
    ap.add_argument('--run-cache', type=Path, default=RUN_CACHE)
    a = ap.parse_args(argv)
    if not 0 <= a.start_frame < a.end_frame <= FRAMES: ap.error(f'need 0 <= start < end <= {FRAMES}')
    if a.stills_at: return record(stills=a.stills, stills_at=a.stills_at, agents=a.agents, pr=a.pr, run_cache=a.run_cache)
    if not a.output: ap.error('--output is required (or --stills-at)')
    return record(a.output, a.log, a.start_frame, a.end_frame, agents=a.agents, pr=a.pr, run_cache=a.run_cache)


if __name__ == '__main__':
    main()
