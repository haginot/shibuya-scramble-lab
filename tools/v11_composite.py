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
assert C10.WORK10 == WORK11, C10.WORK10


def hud_png(pair, e):
    who = 'opening' if e['part'] == 'opening' else pair
    f = WORK11/who/'hud'/e['part']/f"f{e['pf']:05d}.png"
    if not f.exists(): raise FileNotFoundError(f'EN HUD frame missing: {f} (python3 tools/v11_render.py hud {who})')
    return Image.open(f).convert('RGBA')


_TAG = []


def ai_tag():
    """the EN plate tag (「Edited AI-generated image」) cut from the same tagged HUD frame as v10 (tools/v10_plan.json aiTag),
    its box re-measured: same rows, the run of opaque columns that ends at the JP tag's right edge."""
    if not _TAG:
        who, beat, k = C10.PLAN10['aiTag']['from']; x0, y0, x1, y1 = C10.PLAN10['aiTag']['box']
        tl = json.loads((WORK11/who/'timeline.json').read_text(encoding='utf-8'))
        f0 = next(b['f0'] for b in tl['parts']['body']['beats'] if b['id'] == beat)
        im = Image.open(WORK11/who/'hud'/'body'/f'f{f0+k:05d}.png').convert('RGBA')
        col = np.asarray(im)[y0:y1, :, 3].max(0) > 8
        xr = max(x for x in range(x1-40, min(im.width, x1+60)) if col[x])+1
        xl = xr
        while xl > 0 and col[xl-6:xl].any(): xl -= 1
        box = (max(0, xl-4), y0, min(im.width, xr+4), y1)
        _TAG.append((im.crop(box), box[:2]))
    return _TAG[0]


C10.hud_png = hud_png
C10.ai_tag = ai_tag

if __name__ == '__main__':
    sys.exit(C10.main())
