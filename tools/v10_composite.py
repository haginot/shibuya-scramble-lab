#!/usr/bin/env python3
"""JR v10 compositor: the v9 video (tools/v9_composite.py: same timeline, CG / HUD renders, cuts, ghost lines) with two
photoreal Gemini plates (tools/v10_plan.json, approved by HAGINO) instead of the procedural flat costumed crowd:
  hachiko3  grounded-refs/v3/01-hachiko-v2.png (v10.1): Hachiko-mae from the exit side (gate route: over-move / over-result / caught /
            over-lesson / continue) and the opening Hachiko-mae reveal (rules, every pair). The costumed people are in
            the photo: no procedural figures, no press row, no 2.5D floor split (it would double real people).
            caught: the photo crowd stays a still bystander crowd under the camera shake; the attackers are still ONLY
            the fictional game-zombie sprites (costumes_v9.attackers_layer).
  crush3    grounded-refs/v3/08-crush-pov.png: every crush POV. The photo is pushed in slowly (0.90 → 0.72 of the plate
            height), sways, lurches + gets kicked sideways on every shove (config crush.shoves = the shove SFX), rolls a
            little, squeezes horizontally on shoves; desaturated shadows, heartbeat vignette. The HUD crushmeter (the
            crush sim's real peak, 圧死危険, シミュレーション label) is the v9 HUD layer, unchanged.
Everything else is v9 frame for frame. The ghost overlay reads variants/jr/v10/ghost.json (tools/v10_ghost.py: v9 lines,
boxes re-checked against the faces / sign panel of the new photos).
Rendered in SEG-frame segments ($WORK10/<pair>/seg/, finished segments are skipped → a restart resumes), then concatenated.
usage: python3 tools/v10_composite.py <pair> [--frames a:b --out FILE] [--stills t1,t2,... --stills-dir DIR]
v10.2: HUD frames re-rendered for the beats whose text tools/v10_configs.mjs fixed ($WORK10/<pair>/hud, tools/v10_hud.py) are
used instead of the v9 ones (hud_png).
env: WORK10 (default /workspace/projects/logs/ssl-claude-halloween/v10.2/render), SEG10 (frames per segment, 600)
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import v9_composite as C9  # noqa: E402
import v9_ghost as GHOST  # noqa: E402
from v9_composite import V7C, COS, W, H, TR, PLAN, FPS, build_index, pieces, segments, cg_path  # noqa: E402

from v10_shots import PLAN10, NEW, spec, crush_cam, crush_to_out, to_out  # noqa: E402
WORK10 = Path(os.environ.get('WORK10', '/workspace/projects/logs/ssl-claude-halloween/v10.2/render'))
SEG = int(os.environ.get('SEG10', 600))
GHOST10 = ROOT/'web3d/shibuya/series/variants/jr/v10/ghost.json'
for _pid, _g in PLAN10['geom'].items():
    V7C.GEOM[_pid] = dict(_g, blank=[tuple(b) for b in _g['blank']], x=tuple(_g['x']), vp=tuple(_g['vp']), mid=tuple(_g['mid']))


def hud_png(pair, e):
    """the v10.2 HUD frame (tools/v10_hud.py, fixed captions) when there is one, else the v9 HUD frame."""
    who = 'opening' if e['part'] == 'opening' else pair
    f = WORK10/who/'hud'/e['part']/f"f{e['pf']:05d}.png"
    return Image.open(f).convert('RGBA') if f.exists() else C9.hud_png(pair, e)


# ---------------------------------------------------------------- the new plates
def prepare(pid):
    """cleaned plate (signage / ad text blurred, the v7 night grade) + the blurred card version; cached in $WORK10/plates.
    No people mask: the costumed people ARE the picture."""
    if pid not in NEW: return V7C.prepare_plate(pid)
    d = WORK10/'plates'; d.mkdir(parents=True, exist_ok=True)
    sharp, card = d/f'{pid}.png', d/f'{pid}-card.png'
    if sharp.exists() and card.exists():
        return Image.open(sharp).convert('RGB'), Image.open(card).convert('RGB')
    im = Image.open(Path(PLAN['plateRoot'])/PLAN10['plates'][pid]['src']).convert('RGB')
    for (x0, y0, x1, y1) in V7C.GEOM[pid]['blank']:
        pad = 30
        box = (max(0, x0-pad), max(0, y0-pad), min(im.width, x1+pad), min(im.height, y1+pad))
        reg = im.crop(box)
        bl = ImageEnhance.Brightness(ImageEnhance.Color(reg.filter(ImageFilter.GaussianBlur(24)).filter(ImageFilter.GaussianBlur(24))).enhance(.6)).enhance(.8)
        m = Image.new('L', reg.size, 0)
        ImageDraw.Draw(m).rectangle((x0-box[0], y0-box[1], x1-box[0], y1-box[1]), fill=255)
        im.paste(Image.composite(bl, reg, m.filter(ImageFilter.GaussianBlur(10))), box[:2])
    a = np.asarray(im).astype(np.float32)/255
    a = np.clip((a-.5)*1.06+.5, 0, 1)*.97
    a[..., 2] = np.clip(a[..., 2]*1.04+.01, 0, 1)
    im = Image.fromarray((a*255+.5).astype(np.uint8)); im.save(sharp)
    c = ImageEnhance.Brightness(im.filter(ImageFilter.GaussianBlur(14))).enhance(.62); c.save(card)
    return im, c


def photo_frame(pid, mode, t, dur, sharp, card):
    """V7C.plate_frame without the 2.5D floor split (real people stand across the horizon line)."""
    img = card if mode in ('card', 'dark') else sharp
    camv = V7C.camera(pid, mode, t, dur, None, img)
    far = V7C.warp(img, *camv)
    if mode == 'dark': far = ImageEnhance.Brightness(ImageEnhance.Color(far).enhance(.35)).enhance(.6)
    if mode == 'stamp': far = ImageEnhance.Brightness(far).enhance(.78)
    if mode == 'reveal': far = ImageEnhance.Brightness(far).enhance(1-.42*V7C.ease((t-.9)/.6))
    return far, camv


# ---------------------------------------------------------------- the crush POV on the photo
_PADDED = {}


def crush_frame(pid, t, dur, sharp, shoves, beat_t_heart=.74):
    PAD = 220
    if pid not in _PADDED:
        _PADDED[pid] = Image.fromarray(np.pad(np.asarray(sharp), ((PAD, PAD), (PAD, PAD), (0, 0)), mode='reflect'))
    img = _PADDED[pid]
    cam = crush_cam(t, dur, shoves, *sharp.size)
    cx, cy, s, roll, sx, sy, sq, kick = cam; c, n = math.cos(roll), math.sin(roll)
    # output (X, Y) → plate: d = ((X-W/2-sx)/(1+sq), Y-H/2-sy); p = c0 + s·R(roll)·d
    a_ = s*c/(1+sq); b_ = -s*n; d_ = s*n/(1+sq); e_ = s*c
    data = (a_, b_, cx+PAD-a_*(W/2+sx)-b_*(H/2+sy), d_, e_, cy+PAD-d_*(W/2+sx)-e_*(H/2+sy))
    fr = img.transform((W, H), Image.AFFINE, data, resample=Image.BICUBIC)
    a = np.asarray(fr).astype(np.float32)
    if kick > .15: a = V7C.hblur(a, int(2+16*kick))         # motion smear on the shove
    # grade: desaturated shadows, a touch darker, heavy vignette breathing with the heartbeat
    lum = (a*np.array([.3, .59, .11], np.float32)).sum(-1, keepdims=True)
    sat = np.clip((lum-30)/120, 0, 1)*.4+.5
    a = (lum+(a-lum)*sat)*.9
    hb = math.exp(-((t % beat_t_heart)/.12)**2)
    yy, xx = np.ogrid[0:H, 0:W]
    rr = np.sqrt(((xx-W/2)/(W*.62))**2+((yy-H/2)/(H*.6))**2).astype(np.float32)
    vig = np.clip(1.08-(.42+.08*hb+.06*V7C.ease(t/max(dur, 1e-3)))*rr**2, .3, 1)[..., None]
    return a*vig


_TAG = []


def ai_tag():
    """(RGBA crop, (x, y)): the 「AI生成画像を加工」 plate tag of a tagged v9 HUD frame (tools/v10_plan.json aiTag)."""
    if not _TAG:
        who, beat, k = PLAN10['aiTag']['from']; box = PLAN10['aiTag']['box']
        tl = json.loads((C9.WORK/who/'timeline.json').read_text(encoding='utf-8'))
        f0 = next(b['f0'] for b in tl['parts']['body']['beats'] if b['id'] == beat)
        im = Image.open(C9.WORK/who/'hud'/'body'/f'f{f0+k:05d}.png').convert('RGBA')
        _TAG.append((im.crop(box), tuple(box[:2])))
    return _TAG[0]


def shot_mapper(pair, e, sharp):
    """plate px → output px for this photo frame (only for the new plates; None otherwise). Used by tools/v10_ghost.py."""
    sp = spec(pair, e)
    if sp['plate'] not in NEW: return None
    if sp['mode'] == 'crush':
        shoves = C9.beat_cfg(pair, e['part'], e['beat']).get('crush', {}).get('shoves', [])
        return crush_to_out(crush_cam(e['bt'], e['bdur'], shoves, *sharp.size))
    return to_out(V7C.camera(sp['plate'], sp['mode'], e['bt'], e['bdur'], None, sharp))


# ---------------------------------------------------------------- compositing (v9_composite.render with the v10 photo shots)
def render(pair, out, frames=None, stills=None, stills_dir=None, ghost_data=None):
    tl, idx, cuts = build_index(pair)
    cutmap = {}
    for v, kind, a, b in cuts:
        for f in range(v-TR//2, v+TR//2): cutmap[f] = (v, kind)
    plates, crowds, meters, stats = {}, {}, {}, []
    rng_f = range(len(idx)) if frames is None else range(*frames)
    if stills: rng_f = sorted({min(len(idx)-1, round(t*FPS)) for t in stills})
    enc = None
    if not stills:
        out.parent.mkdir(parents=True, exist_ok=True)
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', '30', str(out)],
                               stdin=subprocess.PIPE)
    readers = {}
    prev, prev_v = None, None
    beat_f0 = {}
    for v in range(len(idx)):
        k = (idx[v]['part'], idx[v]['beat'])
        if k not in beat_f0: beat_f0[k] = idx[v]['pf']
    all_pieces = pieces(pair)[1]
    ghost = GHOST.Overlay(pair, ghost_data or json.loads(GHOST10.read_text(encoding='utf-8')))
    for v in rng_f:
        e = idx[v]
        if e['layer'] == 'photo':
            sp = spec(pair, e); pid = sp['plate']
            if pid not in plates: plates[pid] = prepare(pid)
            sharp, card = plates[pid]
            key = (e['part'], e['beat'])
            seed = sum(map(ord, pair+e['beat']))
            if key not in meters: meters[key] = C9.meter_of(pair, e['part'], e['beat'])
            m = meters[key]
            rho = C9.meter_rho(m, e['bt']) if m else None
            if sp['mode'] == 'crush':
                shoves = C9.beat_cfg(pair, e['part'], e['beat']).get('crush', {}).get('shoves', [])
                if pid in NEW: a = crush_frame(pid, e['bt'], e['bdur'], sharp, shoves)
                else: a = C9.crush_frame(pid, e['bt'], e['bdur'], sharp, sp.get('crop'), seed, shoves)
                fr = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
                stats.append(dict(frame=v, beat=e['beat'], rho=round(rho or 0, 2), mode='crush', plate=pid))
                fr.alpha_composite(hud_png(pair, e))
                if pid in NEW: tag, xy = ai_tag(); fr.alpha_composite(tag, xy)
                a = V7C.finish(np.asarray(fr.convert('RGB')), v, None)
            else:
                if pid in NEW:
                    fr, camv = photo_frame(pid, sp['mode'], e['bt'], e['bdur'], sharp, card)
                    if m: stats.append(dict(frame=v, beat=e['beat'], rho=round(rho, 2), plate=pid))
                else:
                    fr, camv = V7C.plate_frame(pid, sp['mode'], e['bt'], e['bdur'], sp.get('crop'), sharp, card)
                    if sp['mode'] not in ('card', 'dark'):
                        if key not in crowds: crowds[key] = C9.CostumeCrowd(pid, sp['mode'], e['bdur'], seed=seed)
                        crowds[key].rho = rho
                        if m: stats.append(dict(frame=v, beat=e['beat'], rho=round(rho, 2)))
                        haze = tuple(int(x) for x in np.asarray(fr.resize((8, 8)), np.float32).reshape(-1, 3)[24:40].mean(0))
                        fr = fr.convert('RGBA'); fr.alpha_composite(C9.costume_layer(crowds[key], e['bt'], camv, haze))
                        if sp['mode'] == 'queue' and rho is not None:
                            pl = C9.press_layer(seed, e['bt'], rho, haze)
                            if pl is not None: fr.alpha_composite(pl)
                fr = fr.convert('RGBA')
                if sp['mode'] == 'caught':
                    t = e['bt']
                    if t >= 2.15: fr = Image.new('RGBA', (W, H), (0, 0, 0, 255))
                    else:
                        dark = V7C.ease((t-.6)/1.4)*.55
                        fr = Image.blend(fr, Image.new('RGBA', (W, H), (0, 0, 0, 255)), dark)
                        fr.alpha_composite(COS.attackers_layer(W, H, t, V7C.ease((t-.35)/1.45), seed=seed))
                        ov = Image.new('RGBA', (W, H), (48, 10, 44, int(255*min(.5, max(0, (t-1.75)/.12)*.5*math.exp(-max(0, t-1.87)/.2)))))
                        fr.alpha_composite(ov)
                fr.alpha_composite(hud_png(pair, e))
                a = V7C.finish(np.asarray(fr.convert('RGB')), v, prev if (prev is not None and prev_v == v-1 and sp['mode'] in ('walk', 'caught')) else None)
        else:
            local = e['pf']-beat_f0[(e['part'], e['beat'])]
            who = 'opening' if e['part'] == 'opening' else pair
            if e['layer'] == 'v6':
                src = ('v6', C9.V6_DIR/f'{pair}.mp4'); start = C9.v6_frame_start(pair, e['part'], e['beat'])+local
            elif e['layer'] in ('v7cg', 'v8cg'):
                work = C9.V7_WORK if e['layer'] == 'v7cg' else C9.V8_WORK
                path, start = C9.old_cg_segment(work, who, e['part'], C9.old_beat_f0(work, pair, e['part'], e['beat'])+local); src = (e['layer'], path)
            else:
                seg = next((a, b) for lay, part, f0, f1, _ in all_pieces if lay == 'cg' and part == e['part'] and f0 <= e['pf'] < f1
                           for a, b in segments(f0, f1) if a <= e['pf'] < b)
                src = ('cg', cg_path(who, e['part'], *seg)); start = e['pf']-seg[0]
            r = readers.get(src)
            if r is None or r.next != start:
                if r: r.close()
                r = readers[src] = V7C.Reader(src[1], start)
            a = r.read().astype(np.float32)
        if v in cutmap:
            c, kind = cutmap[v]; u = (v-(c-TR//2)+.5)/TR
            if kind == 'glitch': a = V7C.glitch(a, v, 1-abs(u-.5)*2)
            else: a = V7C.whip(a, -1, (v-(c-TR//2)+1)/(TR//2)) if v < c else V7C.whip(a, 1, (v-c+1)/(TR//2))
        prev, prev_v = a, v
        a = ghost.apply(a, v/FPS)
        b = np.clip(a+.5, 0, 255).astype(np.uint8)
        if stills:
            stills_dir.mkdir(parents=True, exist_ok=True)
            Image.fromarray(b).save(stills_dir/f'{pair}-{v/FPS:06.2f}s.png')
        else:
            enc.stdin.write(b.tobytes())
        if v % 150 == 0: print(f'{pair} {v}/{len(idx)} {e["layer"]} {e["beat"]}', flush=True)
    for r in readers.values(): r.close()
    if enc:
        enc.stdin.close()
        if enc.wait(): raise RuntimeError('ffmpeg encode failed')
    return dict(frames=len(idx), cuts=[dict(frame=c, t=round(c/FPS, 3), kind=k, frm=a, to=b) for c, k, a, b in cuts], crowd=stats[::5])


def render_segmented(pair):
    """SEG-frame segments in $WORK10/<pair>/seg (done = renamed from .part), then a stream-copy concat → video.mp4."""
    _, idx, _ = build_index(pair); n = len(idx)
    d = WORK10/pair/'seg'; d.mkdir(parents=True, exist_ok=True)
    segs, stats = [], {}
    for a in range(0, n, SEG):
        b = min(n, a+SEG); f = d/f'v-{a:05d}-{b:05d}.mp4'; segs.append(f)
        sj = f.with_suffix('.json')
        if f.exists() and sj.exists(): print(f'{pair} segment {a}-{b} done', flush=True); continue
        tmp = f.with_name(f.stem+'.part.mp4')
        res = render(pair, tmp, (a, b))
        tmp.rename(f); sj.write_text(json.dumps(res, ensure_ascii=False), encoding='utf-8')
    lst = d/'list.txt'; lst.write_text(''.join(f"file '{f}'\n" for f in segs), encoding='utf-8')
    out = WORK10/pair/'video.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', '-movflags', '+faststart', str(out)], check=True)
    crowd, cuts = [], None
    for f in segs:
        r = json.loads(f.with_suffix('.json').read_text(encoding='utf-8')); crowd += r['crowd']; cuts = r['cuts']
    (WORK10/pair/'switch.json').write_text(json.dumps(dict(frames=n, cuts=cuts, crowd=crowd), ensure_ascii=False, indent=1), encoding='utf-8')
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pair'); ap.add_argument('--out', type=Path)
    ap.add_argument('--frames', type=lambda s: tuple(int(x) for x in s.split(':')))
    ap.add_argument('--stills', type=lambda s: [float(x) for x in s.split(',')]); ap.add_argument('--stills-dir', type=Path)
    a = ap.parse_args(argv)
    if a.stills: render(a.pair, None, None, a.stills, a.stills_dir or WORK10/a.pair/'stills'); return 0
    if a.frames: render(a.pair, a.out or WORK10/a.pair/f'frames-{a.frames[0]}-{a.frames[1]}.mp4', a.frames); return 0
    print(render_segmented(a.pair)); return 0


if __name__ == '__main__':
    sys.exit(main())
