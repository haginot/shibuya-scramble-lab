#!/usr/bin/env python3
"""JR v11-en compositor: tools/v10_composite.py (plates, crush POV, costumes, cuts, finish) on the English layers:
  * every non-photo frame from the EN CG renders ($WORK11/<who>/cg, tools/v11_render.py cg: no v6 / v7 / v8 reuse, their
    HUD is Japanese);
  * every photo frame's HUD from the EN HUD renders ($WORK11/<who>/hud; a missing frame is an error, never a JP fallback);
  * the crush POV's AI-image tag stamped from an EN HUD frame (the tag is wider in English: its box is measured);
  * the ghost from variants/jr/v11en/ghost.json (tools/v11_ghost.py).
Segments in $WORK11/<pair>/seg (resumable) → $WORK11/<pair>/video.mp4.
usage: python3 tools/v11_composite.py <pair> [--frames a:b --out FILE] [--stills t1,t2,... --stills-dir DIR]
"""
from __future__ import annotations

import os
from pathlib import Path
import sys

WORK11 = Path(os.environ.get('WORK11', '/workspace/projects/logs/ssl-claude-halloween/v11-en/render'))
os.environ['WORK'] = str(WORK11)
os.environ['WORK10'] = str(WORK11)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import v11_render  # noqa: E402,F401  (render_v9: WORK = WORK11, every non-photo beat = an EN cg render)
import json  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import v10_composite as C10  # noqa: E402

C10.GHOST10 = ROOT/'web3d/shibuya/series/variants/jr/v11en/ghost.json'
# v11.1: no Japanese in the EN picture — the hachikomae plate (AI-made street) still showed legible shop signs
# (「もんじゃ」「クスリ」, vertical signs, small shop boards) where the JP edition keeps them as on site. Extra blur rects
# (source px, the v7 `blank` treatment) for the EN plate only; the EN plate cache is $WORK11/plates (JP: its own work dir).
EN_BLANK = {'hachikomae': [(320, 740, 500, 1560), (0, 780, 50, 1560), (110, 1260, 340, 1540), (810, 1240, 1110, 1530), (1340, 880, 1420, 1140)]}
for _pid, _rects in EN_BLANK.items():
    C10.V7C.GEOM[_pid] = dict(C10.V7C.GEOM[_pid], blank=list(C10.V7C.GEOM[_pid]['blank'])+_rects)
assert C10.WORK10 == WORK11, C10.WORK10


def hud_png(pair, e):
    who = 'opening' if e['part'] == 'opening' else pair
    f = WORK11/who/'hud'/e['part']/f"f{e['pf']:05d}.png"
    if not f.exists(): raise FileNotFoundError(f'EN HUD frame missing: {f} (python3 tools/v11_render.py hud {who})')
    return Image.open(f).convert('RGBA')


_TAG = []


def ai_tag():
    """the EN plate tag (「Edited AI-generated image」) for the crush POV (its HUD has no tag): cut from the EN rules HUD frame
    (opening, no game clock → the tag at the top right, clear of the EN header) and stamped at the same place."""
    if not _TAG:
        tl = json.loads((WORK11/'gate'/'timeline.json').read_text(encoding='utf-8'))
        b = next(b for b in tl['parts']['opening']['beats'] if b['id'] == 'rules')
        im = Image.open(WORK11/'opening'/'hud'/'opening'/f"f{(b['f0']+b['f1'])//2:05d}.png").convert('RGBA')
        a = np.asarray(im)[..., 3]
        ys, xs = np.nonzero(a[:300, 500:] > 8); xs = xs+500
        top = ys.min(); rows = ys < top+60                     # the first opaque block from the top (the tag)
        box = (int(xs[rows].min())-2, int(top)-2, int(xs[rows].max())+3, int(ys[rows].max())+3)
        _TAG.append((im.crop(box), box[:2]))
    return _TAG[0]


C10.hud_png = hud_png
C10.ai_tag = ai_tag

if __name__ == '__main__':
    sys.exit(C10.main())
