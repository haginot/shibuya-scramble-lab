#!/usr/bin/env python3
"""JR v10 ghost placement: the v9 guide ghost 「おばけ」 (tools/v9_ghost.py: same lines, timing, blips) re-checked against the
new photoreal plates (tools/v10_plan.json). On every frame of a line where a new plate is on screen, the plate's protect
boxes (faces of the photo people, the blank sign panel) are projected through that frame's camera (push-in / sway / shove
kicks included, tools/v10_composite.py shot_mapper) and dilated 16 px. If the v9 box touches them, the beat's box is
searched again (v9_ghost.search: protect first, then HUD core / overlap, inside the TikTok/Reels safe area).
v10.1: the ghost's first appearance (op-fly, every pair) is a goofy self-intro (INTRO, 2 lines replacing the v9 op-fly
line; same <= 2 x 20 chars / reading-time rules, box re-searched against the op-fly HUD probes).
v10.2: two lines that named a place the plate does not show are rewritten (TEXT_FIX: gate over-move over the outdoor
Hachiko square, zone clear-result over Meiji-dori in Shibuya). The HUD probes of the beats whose HUD text tools/v10_configs.mjs
fixed are the re-rendered v10.2 HUD frames (tools/v10_hud.py; every 6th frame, the v9 probe grid); those beats and the
rewritten lines are re-checked against them (recheck: the box stays unless it now touches the HUD core / a face or overlaps more).
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
import v10_hud as HUD10  # noqa: E402

W, H, FPS = G9.W, G9.H, G9.FPS
OUT = C10.GHOST10
DILATE = 16
# v10.1: the ghost introduces itself at its first appearance (op-fly, all pairs); original lines, no real names / lyrics
INTRO_BEAT = 'op-fly'
INTRO = [(1.0, 'どーも！\n渋谷系おばけです〜'), (3.8, '渋谷の裏道、\nぜんぶ知ってるよ〜')]
# v10.2: (pair, beat) → (v9 text, new text): lines that named a place the plate on screen does not show
TEXT_FIX = {
    # v11.1 (fact check B): the U-turn is the normal-day flow; on the night follow the staff (v10.2: 広場から改札へは／Uターンで入るよ〜)
    ('gate', 'over-move'): ('改札前の通路、\nUターンするんだよ〜', 'ふだんはUターンで入るよ。\n当日は係員の指示に従ってね'),      # hachiko3 = the outdoor square
    ('zone', 'clear-result'): ('やったー！\n原宿まで歩けた〜', 'やったー！\n原宿へ抜けられる〜'),          # meiji = Meiji-dori in Shibuya
    # v11.1 (fact check C): 2026 closures are for vehicles; walkers are stopped by the crowd and the staff guidance
    ('zone', 'over-result'): ('やばっ、規制で\n前に進めない〜', 'やばっ、混雑と誘導で\n前に進めない〜'),
    # v11.1 (fact check, minor): 「去年の3月」 is only right during 2026 → the year
    ('taxi', 'retry-why'): ('乗り場、去年の3月から\nお休みしてたの〜', '乗り場、2025年3月から\nお休みしてたの〜'),
    ('zone', 'over-lesson'): ('赤枠の中は\n通れないことあるの', '赤枠の中は\n混んで通れないことも'),
    ('zone', 'retry-why'): ('赤枠の中、1m²に4人。\nしかも規制あり〜', '赤枠の中、1m²に4人。\n混雑で誘導待ちに〜'),
}
PROBE_STRIDE = 6


def probes10(who, part):
    """the v10.2 HUD frames on the v9 probe grid (every 6th frame) → they replace the v9 probes in v9_ghost.hud_mask."""
    d = C10.WORK10/who/'hud'/part
    return {int(f.stem[1:]): f for f in d.glob('f*.png') if int(f.stem[1:]) % PROBE_STRIDE == 0}


G9.PROBE_OVERRIDE = probes10


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


def intro(pair, lines):
    """v9 lines with the op-fly line replaced by the INTRO lines (timing = beat start + at, reading time as v9), re-numbered,
    and the op-fly box re-searched for the new bubble sizes (HUD probes of the beat, v9 rules)."""
    bt = G9.beat_table(pair); b0 = bt[INTRO_BEAT]['t0']
    new = []
    for at, text in INTRO:
        G9.check_text(text)
        t0 = round(b0+at, 3)
        new.append(dict(id='', beat=INTRO_BEAT, at=at, t0=t0, t1=round(t0+G9.read_time(text), 3), text=text, chars=G9.nchars(text), nums=[], intro=True))
    out = sorted([l for l in lines if l['beat'] != INTRO_BEAT]+new, key=lambda l: l['t0'])
    for a, b in zip(out, out[1:]): assert b['t0']-a['t1'] >= .2, (a, b)
    mask, probes = G9.hud_mask(pair, bt, new[0]['t0']-.15, new[-1]['t1']+.25)
    assert probes, (pair, INTRO_BEAT, 'no HUD probe frames')
    g, b, box, flip, ov, core, _ = G9.search(mask, new)
    for l in new: l.update(box=list(box), ghost=list(g), bubble=list(b), flip=flip, overlap=ov, core=core, probes=probes)
    for i, l in enumerate(out): l['id'] = f'{pair}-{i:02d}'
    print(f'{pair} {INTRO_BEAT:12s} self-intro {[l["text"].replace(chr(10), "/") for l in new]} box={box} core={core} overlap={ov}')
    return out


def fix_text(pair, lines):
    """TEXT_FIX: new text, chars and reading time (same start); → the fixed beats."""
    done = []
    for (p, beat), (old, new) in TEXT_FIX.items():
        if p != pair: continue
        ln = next(l for l in lines if l['beat'] == beat and l['text'] == old)
        G9.check_text(new)
        ln.update(text=new, chars=G9.nchars(new), t1=round(ln['t0']+G9.read_time(new), 3), v9text=old)
        done.append(beat)
    for a, b in zip(lines, lines[1:]): assert b['t0']-a['t1'] >= .2, (a, b)
    return done


def score(mask, pm, g, b):
    """(protect px, HUD core px, dilated-HUD overlap px) of a ghost + bubble placement (v9_ghost.search's metrics)."""
    m = Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25))
    ii, raw, pp = G9._sat(np.asarray(m) > 0), G9._sat(mask), G9._sat(pm)
    return tuple(G9.rect_sum(s, g)+G9.rect_sum(s, b) for s in (pp, raw, ii))


def recheck(pair, lines, beats):
    """beats whose HUD (v10.2 HUD frames) or line text changed: keep the box (re-laid-out for the new bubble size, same
    bottom-left anchor) unless it now touches a face / the HUD core or overlaps the HUD more; else search again."""
    _, idx, _ = C10.build_index(pair); bt = G9.beat_table(pair)
    for beat in beats:
        lns = [l for l in lines if l['beat'] == beat]
        if not lns: continue
        t0, t1 = min(l['t0'] for l in lns)-.25, max(l['t1'] for l in lns)+.3
        mask, probes = G9.hud_mask(pair, bt, t0+.1, t1-.05)
        assert probes, (pair, beat, 'no HUD probe frames')
        pm, _ = protect_mask(pair, idx, t0, t1, step=1)   # v11.1: every frame (step 2 missed the last frame of gate over-move)
        bw = max(G9.bubble_size(l['text'])[0] for l in lns); bh = max(G9.bubble_size(l['text'])[1] for l in lns)
        box, flip = lns[0]['box'], lns[0]['flip']
        g, b, nbox = G9.layout((box[0], box[3]-max(G9.GH, bh)), bw, bh, flip)
        pr, core, ov = score(mask, pm, g, b)
        if pr == 0 and core == 0 and ov <= lns[0]['overlap']:
            print(f'{pair} {beat:12s} v10.2 HUD/text: box kept {list(nbox)} core=0 overlap={ov} (was {lns[0]["overlap"]})')
        else:
            g, b, nbox, flip, ov, core, pr = G9.search(mask, lns, pm)
            print(f'{pair} {beat:12s} v10.2 HUD/text: box {box} → {list(nbox)} protect={pr} core={core} overlap={ov}')
            for l in lns: l['moved'] = True
        for l in lns:
            l.update(box=list(nbox), ghost=list(g), bubble=list(b), flip=flip, overlap=ov, core=core, probes=probes, protect=pr, v102=True)


def place(pair, data):
    _, idx, _ = C10.build_index(pair)
    bt = G9.beat_table(pair); lines = data['pairs'][pair]['lines']
    groups = {}
    for ln in lines: groups.setdefault(ln['beat'], []).append(ln)
    for beat, lns in groups.items():
        t0, t1 = min(l['t0'] for l in lns)-.25, max(l['t1'] for l in lns)+.3     # incl. pop-in / pop-out
        pm, n = protect_mask(pair, idx, t0, t1, step=1)
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
            data['pairs'][p]['lines'] = intro(p, data['pairs'][p]['lines'])
            fixed = fix_text(p, data['pairs'][p]['lines'])
            place(p, data)
            recheck(p, data['pairs'][p]['lines'], sorted(set(fixed) | {b for b, _, _ in HUD10.changed_beats(p)}))
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
