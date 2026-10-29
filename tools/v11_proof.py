#!/usr/bin/env python3
"""JR v11-en proof stills: one PNG per text-heavy EN scene of every pair, cut from the final <pair>.mp4 at a fraction of the beat
(from the timeline) → <OUT>/proof/<pair>-NN-<beat>.png (+ the JP zone fix still in ja-zone-fix/).
usage: python3 tools/v11_proof.py [pair|all]
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

WORK11 = Path(os.environ.get('WORK11', '/workspace/projects/logs/ssl-claude-halloween/v11-en/render'))
os.environ['WORK'] = str(WORK11)
OUT = Path(os.environ.get('OUT', '/workspace/demos/halloween-escape-series/jr-v11-en'))
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v9 as R9  # noqa: E402

# (beat, fraction, label): self-intro (2 bubbles), mission, rules, choices, TRUE END, guide, sim, over-move, crush POV, caught,
# GAME OVER, lesson, CONTINUE?, why, re-run, CLEAR, cheat sheet, kaiju, GOODBYE end card, sources / credits
SHOTS = [('op-fly', .2, 'self-intro-1'), ('op-fly', .62, 'self-intro-2'), ('op-logo', .7, 'logo'), ('mission', .7, 'mission'),
         ('rules', .6, 'rules'), ('first-choice', .7, 'first-choice'), ('true-end', .6, 'true-end'), ('guide', .7, 'guide'),
         ('over-start', .6, 'mission-start'), ('sim-plan', .8, 'sim'), ('sim-pick', .8, 'sim-pick'), ('over-choice', .8, 'gut-pick'),
         ('over-move', .6, 'over-move'), ('over-result', .6, 'over-result'), ('crush-pov', .3, 'crush-pov'), ('caught', .5, 'caught'),
         ('over-stamp', .6, 'game-over'), ('over-lesson', .6, 'lesson'), ('continue', .5, 'continue'), ('retry-why', .7, 'why'),
         ('clear-choice', .9, 're-run'), ('clear-move', .6, 'clear-move'), ('clear-result', .6, 'clear-result'),
         ('clear-stamp', .6, 'game-clear'), ('clear-cheat', .6, 'cheat-sheet'), ('kaiju', .6, 'kaiju'), ('goodbye', .8, 'goodbye'),
         ('sources', .7, 'sources-credits')]


def times(pair):
    tl = R9.timeline(pair); off = {'opening': 0, 'body': tl['parts']['opening']['beats'][-1]['f1']}; beats = {}
    for part in ('opening', 'body'):
        for b in tl['parts'][part]['beats']: beats[b['id']] = (off[part]+b['f0'], off[part]+b['f1'])
    return [(i, lab, (beats[b][0]+(beats[b][1]-beats[b][0])*fr)/R9.FPS) for i, (b, fr, lab) in enumerate(SHOTS) if b in beats]


def grab(video, t, out):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(video), '-frames:v', '1', str(out)], check=True)


def main(argv):
    pairs = R9.PAIRS if not argv or argv[0] == 'all' else [argv[0]]
    d = OUT/'proof'; d.mkdir(parents=True, exist_ok=True)
    for p in pairs:
        v = OUT/f'{p}.mp4'
        if not v.exists(): print('missing', v); continue
        for i, lab, t in times(p): grab(v, t, d/f'{p}-{i:02d}-{lab}.png')
        print(p, len(times(p)), 'stills')
    z = OUT/'ja-zone-fix'/'zone.mp4'
    if z.exists():
        t = next(t for i, lab, t in times('zone') if lab == 'crush-pov')
        grab(z, t, OUT/'ja-zone-fix'/'zone-crush-pov-caption.png'); print('ja-zone-fix still')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
