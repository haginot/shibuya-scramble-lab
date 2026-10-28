#!/usr/bin/env python3
"""JR v8 render orchestrator (v7 + the crowd-flow sim as the centrepiece; logs/ssl-claude-halloween/v8/brief.md,
STEERING-sim-core.md). Same pattern as tools/render_v7.py, for the v8 timeline (v8/_opening + v8/<pair>, < 100 s).

Every pair video is assembled per frame from four layers (tools/v8_plan.json decides which):
  v7cg  frame-exact v7 CG frames of beats whose picture and HUD are unchanged (cold open, mission, TRUE END, start map):
        read from the v7 CG segments ($V7_WORK/<who>/cg) at the same beat-local frame (v7 timeline);
  cg    re-rendered 3D frames (record_variant.py, v7 configs: footnote outside the TikTok/Reels zone, new kaiju);
  photo photoreal plate + procedural silhouettes + the transparent HUD layer (record_variant.py --hud-only;
        composited by tools/v7_composite.py);
  v6    frame-exact v6 frames (beats with no footnote on screen: over-stamp, goodbye), at the v6/v7 timestamp of the beat.
Renders are split into ≤ 300-frame segments (one browser session each, far below the 2 h job cap), run under nice and
the shared browser lock, and are resumable (finished segments / HUD PNGs are skipped).

usage:
  python3 tools/render_v8.py plan [pair]                pieces per layer (+ frame counts)
  python3 tools/render_v8.py cg opening|<pair>          render the missing CG segments
  python3 tools/render_v8.py hud opening|<pair>         render the missing HUD-only frames
  python3 tools/render_v8.py timeline <pair>            write $WORK/<pair>/timeline.json + cues.json (variant_cues.mjs)
env: WORK (default /workspace/projects/logs/ssl-claude-halloween/v8/render), V7_WORK (v7 render dir), PYBIN, STATUS (status file),
     SEG_FRAMES (≤ 300), BROWSER_LOCK, AGENTS.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get('WORK', '/workspace/projects/logs/ssl-claude-halloween/v8/render'))
V7_WORK = Path(os.environ.get('V7_WORK', '/workspace/projects/logs/ssl-claude-halloween/v7/render'))
STATUS = os.environ.get('STATUS')
PLAN = json.loads((ROOT/'tools/v8_plan.json').read_text(encoding='utf-8'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
FPS = 30
SEG = min(300, int(os.environ.get('SEG_FRAMES', 300)))
LOCK = os.environ.get('BROWSER_LOCK', '/tmp/ssl-halloween-browser.lock')
PYBIN = os.environ.get('PYBIN', '/workspace/projects/logs/ssl-claude-halloween/variants/render/.venv-rec/bin/python')
OPENING = 'v8/_opening'
MAX_SECONDS = 100


def log(*a):
    msg = ' '.join(map(str, a)); print(f'[render_v8 {time.strftime("%H:%M:%S")}]', msg, flush=True)
    if STATUS: Path(STATUS).write_text(f'{time.strftime("%Y-%m-%d %H:%M:%S")} {msg}\n', encoding='utf-8')


def timeline(pair):
    out = WORK/pair/'timeline.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', 'tools/variant_cues.mjs', f'v8/{pair}', '--opening', OPENING, '--timeline', str(out), '--out', str(WORK/pair/'cues.json'), '--quiet'],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    return json.loads(out.read_text(encoding='utf-8'))


def layer_of(part, beat_id, pair):
    if beat_id in PLAN['reuseV6'] and beat_id not in PLAN.get('reuseV6Except', {}).get(pair, []): return 'v6'
    if beat_id in PLAN['reuseV7cg'].get(part, []) and beat_id not in PLAN['reuseV7cgExcept'].get(pair, []): return 'v7cg'
    table = PLAN['opening'] if part == 'opening' else PLAN['pairs'][pair]
    return 'photo' if beat_id in table else 'cg'


def pieces(pair):
    """[(layer, part, f0, f1, beats)] contiguous same-layer runs, in PART frames (body frames start at 0)."""
    tl = timeline(pair)
    res = []
    for part in ('opening', 'body'):
        for b in tl['parts'][part]['beats']:
            lay = layer_of(part, b['id'], pair)
            if res and res[-1][0] == lay and res[-1][1] == part and res[-1][3] == b['f0']:
                res[-1] = (lay, part, res[-1][2], b['f1'], res[-1][4]+[b['id']])
            else: res.append((lay, part, b['f0'], b['f1'], [b['id']]))
    return tl, res


def segments(f0, f1):
    n = max(1, -(-(f1-f0)//SEG))
    edges = [f0+round((f1-f0)*i/n) for i in range(n+1)]
    return list(zip(edges, edges[1:]))


def recorder(variant, part, args):
    cmd = ['nice', '-n', '10', 'flock', LOCK, PYBIN, 'tools/record_variant.py', '--variant', variant, '--part', part, '--opening', OPENING, *args]
    if os.environ.get('AGENTS'): cmd += ['--agents', os.environ['AGENTS']]
    return subprocess.run(cmd, cwd=ROOT).returncode


def cg_path(who, part, a, b):
    return WORK/who/'cg'/f'{part}-{a:04d}-{b:04d}.mp4'


def run_cg(who):
    pair = 'gate' if who == 'opening' else who
    _, ps = pieces(pair)
    for lay, part, f0, f1, beats in ps:
        if lay != 'cg' or (part == 'opening') != (who == 'opening'): continue
        for a, b in segments(f0, f1):
            out = cg_path(who, part, a, b)
            if out.exists(): continue
            out.parent.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix('.part.mp4')
            log(f'cg {who} {part} {a}-{b} ({",".join(beats)})'); t0 = time.time()
            variant = OPENING if part == 'opening' else f'v8/{pair}'
            rc = recorder(variant, part, ['--output', str(tmp), '--log', str(out.with_suffix('.jsonl')), '--start-frame', str(a), '--end-frame', str(b),
                                          '--summary', str(out.with_suffix('.json'))])
            if rc: log(f'FAILED cg {who} {a}-{b} rc={rc}'); return rc
            tmp.rename(out); log(f'cg {who} {part} {a}-{b} done in {time.time()-t0:.0f} s')
    return 0


def run_hud(who):
    pair = 'gate' if who == 'opening' else who
    _, ps = pieces(pair)
    for lay, part, f0, f1, beats in ps:
        if lay != 'photo' or (part == 'opening') != (who == 'opening'): continue
        d = WORK/who/'hud'/part
        for a, b in segments(f0, f1):
            if all((d/f'f{f:05d}.png').exists() for f in range(a, b)): continue
            log(f'hud {who} {part} {a}-{b} ({",".join(beats)})'); t0 = time.time()
            variant = OPENING if part == 'opening' else f'v8/{pair}'
            rc = recorder(variant, part, ['--hud-only', '--output', str(d), '--log', str(d/f'frames-{a:04d}.jsonl'), '--start-frame', str(a), '--end-frame', str(b)])
            if rc: log(f'FAILED hud {who} {a}-{b} rc={rc}'); return rc
            log(f'hud {who} {part} {a}-{b} done in {time.time()-t0:.0f} s')
    return 0


def build_index(pair):
    """per video frame → (layer, part, part_frame, beat, beat_t, beat_dur); + the cut list."""
    tl, ps = pieces(pair)
    idx = []
    beats = {}
    for part in ('opening', 'body'):
        for b in tl['parts'][part]['beats']: beats[(part, b['id'])] = b
    for lay, part, f0, f1, bs in ps:
        for f in range(f0, f1):
            b = next(beats[(part, x)] for x in bs if beats[(part, x)]['f0'] <= f < beats[(part, x)]['f1'])
            idx.append(dict(layer=lay, part=part, pf=f, beat=b['id'], bt=(f-b['f0'])/FPS, bdur=(b['f1']-b['f0'])/FPS))
    assert len(idx) == tl['frames'] and tl['frames'] < MAX_SECONDS*FPS, (len(idx), tl['frames'])
    cuts = []
    for v in range(1, len(idx)):
        a, b = idx[v-1], idx[v]
        if (a['layer'] == 'photo') != (b['layer'] == 'photo'):
            if a['beat'] == 'caught' or b['beat'] == 'caught': continue   # caught ends in black on its own
            kind = 'whip' if b['beat'] in PLAN['transition']['whipInto'] and b['layer'] == 'photo' else 'glitch'
            cuts.append((v, kind, a['beat'], b['beat']))
    return tl, idx, cuts


def main(argv):
    if not argv: print(__doc__); return 2
    cmd, who = argv[0], (argv[1] if len(argv) > 1 else None)
    if cmd == 'plan':
        for p in ([who] if who else PAIRS):
            _, ps = pieces(p); tot = {}
            for lay, part, f0, f1, beats in ps:
                print(f'{p:5s} {lay:5s} {part:7s} {f0:5d}-{f1:5d} ({f1-f0:4d} f) {",".join(beats)}')
                tot[lay] = tot.get(lay, 0)+f1-f0
            print(p, tot)
        return 0
    if cmd == 'timeline': timeline(who); return 0
    if cmd == 'cg': return run_cg(who)
    if cmd == 'hud': return run_hud(who)
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
