#!/usr/bin/env python3
"""JR v11.1 JP build: the v10.2 JP videos (+ the v11 zone wrap fix) with the fact-check fixes (tools/v10_configs.mjs V111,
tools/v10_ghost.py TEXT_FIX, the zone sim label in sim-v8.mjs; logs/ssl-claude-halloween/v11.1/brief.md).
Only what the fixes touch is rendered again (lang=ja, the v10.2 pipeline with WORK10 = $WORKJA):
  hud   the HUD-only frames of every body beat whose HUD text differs from v9 (tools/v10_hud.py: the v10.2 beats, the zone
        wrap fix and the v11.1 beats, incl. the lesson / cheat cards that read the config root) → $WORKJA/<pair>/hud/body;
        the compositor uses them on photo beats, the ghost placement uses them as probes on every beat.
  cg    the non-photo beats whose picture carries changed JP text, as fresh 3D renders on the v9 segment grid
        → $WORKJA/<pair>/cg/<part>-a-b.mp4: the GOODBYE end card (every pair; v10.2 reused the v6 frames, now a CG
        render of the same beat), alt over-start (mission 「大崎行き」), zone sim + retry (the 「混雑する赤枠内を長く歩く」 row
        and the 「車両規制」 pin). Every other CG frame is the v10.2 one (v9 / v8 / v7 work dirs), unchanged.
  composite / finish = tools/v10_composite.py / tools/v10_finish.py with those layers first.
usage: python3 tools/v111_ja.py plan|hud|cg|composite|finish <pair>|all   (composite <pair> --stills t1,t2 --stills-dir D: QA stills)
env: WORKJA (default /workspace/projects/logs/ssl-claude-halloween/v11.1/render-ja), OUT (default
     /workspace/demos/halloween-escape-series/jr-v11.1/ja)
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time

WORKJA = Path(os.environ.get('WORKJA', '/workspace/projects/logs/ssl-claude-halloween/v11.1/render-ja'))
os.environ['WORK10'] = str(WORKJA)
os.environ.setdefault('OUT', '/workspace/demos/halloween-escape-series/jr-v11.1/ja')
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v9 as R9  # noqa: E402
import v10_hud as HUD10  # noqa: E402

PAIRS = R9.PAIRS
# GOODBYE: the v6 frames carry the old end card (「11/1(日)朝方」) → a CG render of the beat in every pair
for _p in PAIRS:
    R9.PLAN.setdefault('reuseV6Except', {}).setdefault(_p, [])
    if 'goodbye' not in R9.PLAN['reuseV6Except'][_p]: R9.PLAN['reuseV6Except'][_p].append('goodbye')
# CG beats whose burnt-in JP text changed in v11.1 (the sim label is not in the configs: zone's sim + retry panels)
SIM_BEATS = {'zone': ['sim-plan', 'sim-pick', 'retry-why', 'clear-choice']}

_cg_v9 = R9.cg_path


def cg_path(who, part, a, b):
    """the v11.1 render of a CG segment when there is one, else the v9 one."""
    p = WORKJA/who/'cg'/f'{part}-{a:04d}-{b:04d}.mp4'
    return p if p.exists() else _cg_v9(who, part, a, b)


R9.cg_path = cg_path


def cg_beats(pair):
    return sorted({b for b, _, _ in HUD10.changed_beats(pair)} | set(SIM_BEATS.get(pair, [])))


def cg_segments(pair):
    """[(a, b, beats)] v9-grid segments of the 'cg' layer that show a changed beat."""
    tl, ps = R9.pieces(pair)
    fr = {b['id']: (b['f0'], b['f1']) for b in tl['parts']['body']['beats']}
    want = cg_beats(pair); out = []
    for lay, part, f0, f1, beats in ps:
        if lay != 'cg' or part != 'body': continue
        for a, b in R9.segments(f0, f1):
            hit = [x for x in beats if x in want and fr[x][0] < b and fr[x][1] > a]
            if hit: out.append((a, b, hit))
    return out


def run_cg(pair):
    for a, b, beats in cg_segments(pair):
        out = WORKJA/pair/'cg'/f'body-{a:04d}-{b:04d}.mp4'
        if out.exists(): continue
        out.parent.mkdir(parents=True, exist_ok=True); tmp = out.with_suffix('.part.mp4')
        R9.log(f'cg ja {pair} body {a}-{b} ({",".join(beats)})'); t0 = time.time()
        rc = R9.recorder(f'v10/{pair}', 'body', ['--output', str(tmp), '--log', str(out.with_suffix('.jsonl')), '--start-frame', str(a), '--end-frame', str(b),
                                                 '--summary', str(out.with_suffix('.json'))])
        if rc: R9.log(f'FAILED cg ja {pair} {a}-{b} rc={rc}'); return rc
        tmp.rename(out); R9.log(f'cg ja {pair} {a}-{b} done in {time.time()-t0:.0f} s')
    return 0


def main(argv):
    if len(argv) < 2: print(__doc__); return 2
    cmd, who = argv[0], argv[1]
    pairs = PAIRS if who == 'all' else [who]
    for p in pairs:
        if cmd == 'plan':
            print(p, 'hud', HUD10.changed_beats(p)); print(p, 'cg', cg_segments(p))
        elif cmd == 'hud':
            subprocess.run(['node', 'tools/v10_configs.mjs', '--check'], cwd=ROOT, check=True)
            rc = HUD10.render(p)
            if rc: return rc
        elif cmd == 'cg':
            rc = run_cg(p)
            if rc: return rc
        elif cmd == 'composite':
            import v10_composite as C10
            C10.cg_path = cg_path
            assert C10.WORK10 == WORKJA, C10.WORK10
            rc = C10.main([p, *argv[2:]])
            if rc: return rc
        elif cmd == 'finish':
            import v10_composite as C10
            C10.cg_path = cg_path
            import v10_finish as F10
            rc = F10.main(['all', p])
            if rc: return rc
        else:
            print(__doc__); return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
