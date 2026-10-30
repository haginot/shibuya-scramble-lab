#!/usr/bin/env python3
"""JR v10.2 HUD re-render: the beats whose HUD text tools/v10_configs.mjs changed (variants/jr/v10/<pair>.json vs v9) get
new HUD-only frames (record_variant.py --hud-only, variant v10/<pair>, every frame of the beat) in $WORK10/<pair>/hud/body.
The compositor (tools/v10_composite.py hud_png) and the ghost placement (tools/v10_ghost.py, probe frames = every 6th of
these) read them first and fall back to the v9 HUD / probe frames everywhere else. Resumable (frames on disk are skipped).
usage: python3 tools/v10_hud.py beats [pair]        changed beats + frame ranges
       python3 tools/v10_hud.py render <pair>|all   render the missing frames
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v9 as R9  # noqa: E402

WORK10 = Path(os.environ.get('WORK10', '/workspace/projects/logs/ssl-claude-halloween/v10.2/render'))
CFG = ROOT/'web3d/shibuya/series/variants/jr'
PAIRS = R9.PAIRS


def cfg(rel): return json.loads((CFG/f'{rel}.json').read_text(encoding='utf-8'))


def changed_beats(pair):
    """[(beat id, f0, f1)] body beats whose HUD differs between v10/<pair> and v9/<pair> (body part frames)."""
    c9, b10 = cfg(f'v9/{pair}'), cfg(f'v10/{pair}'); a = {b['id']: b for b in c9['beats']}
    tl = json.loads((R9.WORK/pair/'timeline.json').read_text(encoding='utf-8'))
    fr = {b['id']: (b['f0'], b['f1']) for b in tl['parts']['body']['beats']}

    def shown(c, b):   # v11.1: the lesson / cheat cards take their text from the config root (`lesson`, `cheat`)
        return [b['hud']]+[c.get(k) for k in ('lesson', 'cheat') if any(h.get('c') == k for h in b['hud'])]+[b.get('why')]
    return [(b['id'], *fr[b['id']]) for b in b10['beats'] if shown(b10, b) != shown(c9, a[b['id']])]


def hud_dir(pair): return WORK10/pair/'hud'/'body'


def render(pair):
    d = hud_dir(pair)
    for beat, f0, f1 in changed_beats(pair):
        if all((d/f'f{f:05d}.png').exists() for f in range(f0, f1)): print(pair, beat, 'done'); continue
        print(pair, beat, f0, f1, flush=True)
        rc = R9.recorder(f'v10/{pair}', 'body', ['--hud-only', '--output', str(d), '--log', str(d/f'frames-{f0:04d}.jsonl'),
                                                 '--start-frame', str(f0), '--end-frame', str(f1)])
        if rc: return rc
    return 0


def main(argv):
    if not argv: print(__doc__); return 2
    pairs = PAIRS if len(argv) < 2 or argv[1] == 'all' else [argv[1]]
    if argv[0] == 'beats':
        for p in pairs: print(p, changed_beats(p))
        return 0
    if argv[0] == 'render':
        subprocess.run(['node', 'tools/v10_configs.mjs', '--check'], cwd=ROOT, check=True)
        for p in pairs:
            rc = render(p)
            if rc: return rc
        return 0
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
