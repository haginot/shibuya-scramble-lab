#!/usr/bin/env python3
"""JR v11-en render orchestrator: the English edition of the four v10.2 pair videos (logs/ssl-claude-halloween/v11-en/brief.md).
Same timeline, configs (variants/jr/v9/_opening + v10/<pair>), sim, plates and audio as v10.2; the page runs with lang=en
(web3d/shibuya/series/i18n/en.json, tools/v11_en_dict.py). Every layer that carries text is rendered again in English:
  cg     EVERY non-photo beat (v10 reused v6 / v7 / v8 CG frames with the JP HUD burnt in: in EN they are 3D re-renders of
         the same beats from the same configs) → $WORK11/<who>/cg/<part>-a-b.mp4
  hud    the transparent HUD layer of every photo beat → $WORK11/<who>/hud/<part>/fNNNNN.png
  probe  HUD-only frames every PROBE_STRIDE frames of every beat (layout probe: text fit log + ghost placement)
The recorder (tools/record_variant.py --lang en) checks every EN frame: no CJK on screen, no automatic wrap / overflow,
the fiction word only in the cold open. Resumable like render_v9 (finished segments / PNGs are skipped).
usage: python3 tools/v11_render.py plan|cg|hud|probe opening|<pair>
env: WORK11 (default /workspace/projects/logs/ssl-claude-halloween/v11-en/render), SEG_FRAMES, PROBE_STRIDE (3)
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time

WORK11 = Path(os.environ.get('WORK11', '/workspace/projects/logs/ssl-claude-halloween/v11-en/render'))
os.environ['WORK'] = str(WORK11)
os.environ['VARIANT_LANG'] = 'en'
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v9 as R9  # noqa: E402

R9.WORK = WORK11
_layer9 = R9.layer_of


def layer_of(part, beat_id, pair):
    """v11-en: no frame-exact reuse of older CG (their HUD is Japanese) → every non-photo beat is a fresh EN CG render."""
    lay = _layer9(part, beat_id, pair)
    return 'photo' if lay == 'photo' else 'cg'


R9.layer_of = layer_of
PAIRS = R9.PAIRS
OPENING = R9.OPENING


def variant_of(who, part): return OPENING if part == 'opening' else f'v10/{who}'


def recorder(variant, part, args):
    cmd = ['nice', '-n', '10', 'flock', R9.LOCK, R9.PYBIN, 'tools/record_variant.py', '--lang', 'en', '--variant', variant, '--part', part, '--opening', OPENING, *args]
    return subprocess.run(cmd, cwd=ROOT, env={**os.environ, 'VARIANT_LANG': 'en'}).returncode


def runs(who, layer):
    pair = 'gate' if who == 'opening' else who
    _, ps = R9.pieces(pair)
    return [(part, f0, f1, beats) for lay, part, f0, f1, beats in ps if lay == layer and (part == 'opening') == (who == 'opening')]


def run_cg(who):
    for part, f0, f1, beats in runs(who, 'cg'):
        for a, b in R9.segments(f0, f1):
            out = R9.cg_path(who, part, a, b)
            if out.exists(): continue
            out.parent.mkdir(parents=True, exist_ok=True); tmp = out.with_suffix('.part.mp4')
            R9.log(f'cg {who} {part} {a}-{b} ({",".join(beats)})'); t0 = time.time()
            rc = recorder(variant_of(who, part), part, ['--output', str(tmp), '--log', str(out.with_suffix('.jsonl')), '--start-frame', str(a), '--end-frame', str(b),
                                                       '--summary', str(out.with_suffix('.json'))])
            if rc: R9.log(f'FAILED cg {who} {a}-{b} rc={rc}'); return rc
            tmp.rename(out); R9.log(f'cg {who} {part} {a}-{b} done in {time.time()-t0:.0f} s')
    return 0


def run_hud(who):
    for part, f0, f1, beats in runs(who, 'photo'):
        d = WORK11/who/'hud'/part
        for a, b in R9.segments(f0, f1):
            if all((d/f'f{f:05d}.png').exists() for f in range(a, b)): continue
            R9.log(f'hud {who} {part} {a}-{b} ({",".join(beats)})'); t0 = time.time()
            rc = recorder(variant_of(who, part), part, ['--hud-only', '--output', str(d), '--log', str(d/f'frames-{a:04d}.jsonl'), '--start-frame', str(a), '--end-frame', str(b)])
            if rc: R9.log(f'FAILED hud {who} {a}-{b} rc={rc}'); return rc
            R9.log(f'hud {who} {part} {a}-{b} done in {time.time()-t0:.0f} s')
    return 0


def run_probe(who, stride=None):
    stride = stride or int(os.environ.get('PROBE_STRIDE', 3))
    pair = 'gate' if who == 'opening' else who
    tl = R9.timeline(pair)
    for part in (('opening',) if who == 'opening' else ('body',)):
        d = WORK11/who/'probe'/part; n = tl['parts'][part]['beats'][-1]['f1']
        if all((d/f'f{f:05d}.png').exists() for f in range(0, n, stride)): continue
        R9.log(f'probe {who} {part} 0-{n} /{stride}')
        rc = recorder(variant_of(who, part), part, ['--hud-only', '--stride', str(stride), '--output', str(d), '--log', str(d/'frames.jsonl'), '--start-frame', '0', '--end-frame', str(n)])
        if rc: return rc
    return 0


def main(argv):
    if len(argv) < 2: print(__doc__); return 2
    cmd, who = argv
    if cmd == 'plan':
        _, ps = R9.pieces('gate' if who == 'opening' else who)
        for lay, part, f0, f1, beats in ps: print(f'{lay:5s} {part:7s} {f0:5d}-{f1:5d} {",".join(beats)}')
        return 0
    return {'cg': run_cg, 'hud': run_hud, 'probe': run_probe}[cmd](who)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
