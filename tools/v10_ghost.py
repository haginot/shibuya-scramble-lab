#!/usr/bin/env python3
"""JR v10 ghost placement: the v9 guide ghost 「おばけ」 (tools/v9_ghost.py: same lines, timing, blips) re-checked against the
new photoreal plates (tools/v10_plan.json). On every frame of a line where a new plate is on screen, the plate's protect
boxes (faces of the photo people, the blank sign panel) are projected through that frame's camera (push-in / sway / shove
kicks included, tools/v10_composite.py shot_mapper) and dilated 16 px. If the v9 box touches them, the beat's box is
searched again (v9_ghost.search: protect first, then HUD core / overlap, inside the TikTok/Reels safe area).
Result: web3d/shibuya/series/variants/jr/v10/ghost.json (v9 ghost.json + `protect` px per line, `moved` where re-placed).
usage: python3 tools/v10_ghost.py place [pair|all]
       python3 tools/v10_ghost.py sheet <pair> out.jpg     QA: every line on the composited frame, protect boxes outlined
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import v9_ghost as G9  # noqa: E402
import v10_composite as C10  # noqa: E402

W, H, FPS = G9.W, G9.H, G9.FPS
OUT = C10.GHOST10
DILATE = 16


def protect_rects(pair, idx, v):
    """output-px rects of the protect boxes on video frame v ([] when no new plate is on screen)."""
    e = idx[v]
    if e['layer'] != 'photo': return []
    sp = C10.spec(pair, e)
    if sp['plate'] not in C10.NEW: return []
    if sp['mode'] == 'caught' and e['bt'] >= 2.15: return []      # black
    sharp, _ = C10.prepare(sp['plate'])
    f = C10.shot_mapper(pair, e, sharp)
    out = []
    for x0, y0, x1, y1 in C10.PLAN10['protect'][sp['plate']]:
        pts = [f(x, y) for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out


def protect_mask(pair, idx, t0, t1, step=2):
    m = np.zeros((H, W), bool); n = 0
    for v in range(max(0, int(t0*FPS)), min(len(idx), int(t1*FPS)+1), step):
        for x0, y0, x1, y1 in protect_rects(pair, idx, v):
            a, b = int(max(0, x0-DILATE)), int(max(0, y0-DILATE)); c, d = int(min(W, x1+DILATE)), int(min(H, y1+DILATE))
            if c > a and d > b: m[b:d, a:c] = True; n += 1
    return m, n


def place(pair, data):
    _, idx, _ = C10.build_index(pair)
    bt = G9.beat_table(pair); lines = data['pairs'][pair]['lines']
    groups = {}
    for ln in lines: groups.setdefault(ln['beat'], []).append(ln)
    for beat, lns in groups.items():
        t0, t1 = min(l['t0'] for l in lns)-.25, max(l['t1'] for l in lns)+.3     # incl. pop-in / pop-out
        pm, n = protect_mask(pair, idx, t0, t1)
        if not n:
            for l in lns: l['protect'] = 0
            continue
        ii = G9._sat(pm)
        cur = G9.rect_sum(ii, lns[0]['ghost'])+G9.rect_sum(ii, lns[0]['bubble'])
        if cur == 0:
            for l in lns: l['protect'] = 0
            print(f'{pair} {beat:12s} clear of faces / panel at the v9 box {lns[0]["box"]}')
            continue
        mask, probes = G9.hud_mask(pair, bt, t0+.1, t1-.05)
        g, b, box, flip, ov, core, pr = G9.search(mask, lns, pm)
        print(f'{pair} {beat:12s} v9 box {lns[0]["box"]} covered {cur} px of faces / panel → {box} protect={pr} core={core} overlap={ov}')
        for l in lns:
            l.update(box=list(box), ghost=list(g), bubble=list(b), flip=flip, overlap=ov, core=core, probes=probes, protect=pr, moved=True)


def main(argv):
    if not argv: print(__doc__); return 2
    if argv[0] == 'place':
        data = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else json.loads(G9.GHOST_JSON.read_text(encoding='utf-8'))
        if not OUT.exists():
            data['generated'] = 'tools/v10_ghost.py place (= v9 ghost.json lines; boxes re-checked against the v10 photo plates; do not edit by hand)'
        v9 = json.loads(G9.GHOST_JSON.read_text(encoding='utf-8'))
        pairs = G9.PAIRS if len(argv) < 2 or argv[1] == 'all' else [argv[1]]
        for p in pairs:
            data['pairs'][p] = json.loads(json.dumps(v9['pairs'][p]))     # always start from the v9 placement
            place(p, data)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
        return 0
    if argv[0] == 'sheet':
        pair, out = argv[1], Path(argv[2])
        data = json.loads(OUT.read_text(encoding='utf-8'))
        _, idx, _ = C10.build_index(pair)
        lines = [l for l in data['pairs'][pair]['lines'] if l.get('protect') is not None and protect_rects(pair, idx, int((l['t0']+l['t1'])/2*FPS))]
        ts = [round((l['t0']+l['t1'])/2, 2) for l in lines]
        d = C10.WORK10/pair/'ghost-qa'
        C10.render(pair, None, None, ts, d, data)
        tiles = []
        for t, l in zip(ts, lines):
            v = min(len(idx)-1, round(t*FPS))
            im = Image.open(d/f'{pair}-{v/FPS:06.2f}s.png').convert('RGB'); dr = ImageDraw.Draw(im)
            for r in protect_rects(pair, idx, v): dr.rectangle(r, outline=(0, 255, 255), width=4)
            dr.rectangle(l['box'], outline=(255, 0, 0), width=3)
            tiles.append(im.resize((360, 640)))
        sheet = Image.new('RGB', (min(6, len(tiles))*360, -(-len(tiles)//6)*640))
        for i, im in enumerate(tiles): sheet.paste(im, ((i % 6)*360, (i//6)*640))
        sheet.save(out); print(out); return 0
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
