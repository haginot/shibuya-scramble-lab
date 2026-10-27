#!/usr/bin/env python3
"""JR v7 compositor: assembles one pair video (2646 frames) from the CG renders, the photoreal layer and frame-exact v6
frames, with the CG↔photo switch transitions (HAGINO steering 2026-10-27, STEERING-photoreal-switch.md; tools/v7_plan.json).

Photoreal layer (per photo beat, tools/v7_plan.json pairs[...][beat] = {plate, mode}):
  plate     cleaned once ($WORK/plates/<id>.png, never committed): brand logos / ads / AI-made sign text blanked (heavy blur),
            every real/AI person blurred + darkened (no identifiable face), night grade; + a blurred card version.
  camera    2.5D: the plate is split at the floor horizon into a far and a near layer that zoom at different rates
            (parallax); slow push / walk bob / caught shake per mode.
  people    PROCEDURAL SILHOUETTES only (drawn here: dark figures, a few costume shapes — witch hat, cat ears, hood), walking
            on the plate's floor with perspective scale, light motion blur; they never attack anyone (caught = a crowd
            pressing in, then black).
  HUD       the transparent HUD layer of the beat ($WORK/<who>/hud/<part>/f*.png, record_variant.py --hud-only).
  finish    grain, vignette, slight temporal smear.
Transitions: 8 frames around every CG↔photo cut: RGB glitch (default) or whip pan (into a walk / result shot).

usage: python3 tools/v7_composite.py <pair> [--out FILE] [--frames a:b] [--stills t1,t2,... --stills-dir DIR]
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
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from render_v7 import PLAN, WORK, pieces, segments, cg_path, build_index, FPS  # noqa: E402

W, H = 1080, 1920
V6_DIR = Path(os.environ.get('V6_DIR', '/workspace/demos/halloween-escape-series/jr-v6'))
PLATE_ROOT = Path(PLAN['plateRoot'])
OPENING_FRAMES = 456
TR = PLAN['transition']['frames']

# ---------------------------------------------------------------- plate geometry (source px; checked on grid sheets)
# blank: rects blurred flat (brand logos, ads, AI-made sign text, plates); people: polygons blurred + darkened (faces);
# floor: yh (horizon y), k (person height = k·(y_feet − yh)), x range for silhouettes; vp: push target; mid: crowd centre.
GEOM = {
 'hachikomae': dict(blank=[(500, 350, 810, 710), (480, 810, 830, 1130), (800, 770, 1050, 990), (50, 970, 340, 1110), (510, 1440, 810, 1540),
                           (180, 840, 250, 1100), (180, 700, 250, 840)],
                    people=[[(0, 1530), (1536, 1530), (1536, 2752), (0, 2752)]],
                    yh=1350, k=.62, x=(-100, 1640), vp=(900, 1450), mid=(1000, 1900)),
 'hachiko': dict(blank=[(150, 900, 1440, 1060), (0, 480, 115, 2060), (1140, 2040, 1460, 2125)],
                 people=[[(80, 1290), (1536, 1290), (1536, 2752), (0, 2752), (0, 1700)]],
                 yh=1330, k=.84, x=(100, 1500), vp=(640, 1330), mid=(760, 1700)),
 'south': dict(blank=[(1165, 1190, 1265, 1270), (1320, 1300, 1430, 1450), (900, 1300, 1000, 1400), (490, 1330, 700, 1540), (735, 1095, 865, 1590),
                      (1180, 1270, 1280, 1300)],
               people=[[(280, 1320), (1536, 1320), (1536, 1800), (280, 1800)]],
               yh=1280, k=.8, x=(200, 1540), vp=(1150, 1350), mid=(1100, 1550)),
 'newsouth': dict(blank=[(260, 600, 1190, 750), (1260, 1170, 1370, 1390), (0, 1200, 140, 1500), (480, 1120, 520, 1170)],
                  people=[[(360, 1240), (1200, 1240), (1200, 1545), (360, 1545)]],
                  yh=1250, k=1.0, x=(150, 1400), vp=(768, 1300), mid=(800, 1420)),
 'concourse': dict(blank=[(0, 780, 520, 1270), (180, 1480, 980, 1595), (1000, 1465, 1175, 1535), (1380, 1780, 1536, 1925), (800, 1190, 960, 1240)],
                   people=[[(0, 1300), (1536, 1300), (1536, 2265), (0, 2265)]],
                   yh=1470, k=.54, x=(0, 1536), vp=(900, 1500), mid=(760, 1900)),
 'dogenzaka': dict(blank=[(0, 1830, 620, 1985), (880, 1530, 1400, 1700)],
                   people=[[(540, 1760), (1536, 1760), (1536, 2110), (540, 2110)], [(0, 1840), (370, 1840), (370, 2660), (0, 2660)]],
                   yh=1805, k=.93, x=(450, 1536), vp=(300, 1820), mid=(1000, 1980)),
 'taxi': dict(blank=[(630, 1830, 940, 2615), (1405, 555, 1536, 725), (990, 1635, 1470, 1735), (945, 1445, 1095, 1550), (1340, 1100, 1536, 1560),
                     (880, 1480, 962, 1800)],
              people=[[(0, 1650), (260, 1650), (260, 2135), (0, 2135)], [(670, 1475), (915, 1475), (915, 1855), (670, 1855)]],
              yh=1420, k=.5, x=(0, 980), vp=(900, 1500), mid=(800, 1700)),
 'meiji': dict(blank=[(0, 1000, 460, 1725), (860, 1105, 955, 1195)],
               people=[[(0, 1640), (1536, 1640), (1536, 2752), (0, 2752)]],
               yh=1320, k=.2, x=(0, 1536), vp=(800, 1480), mid=(900, 2000)),
 'sakura': dict(blank=[(140, 1720, 270, 1830), (325, 285, 435, 395)],
                people=[[(1330, 1770), (1720, 1770), (1720, 2070), (1330, 2070)]],
                yh=1650, k=.5, x=(700, 1800), vp=(1450, 1800), mid=(1350, 1950), grade=.8),
}


def plate_paths(pid):
    d = WORK/'plates'; d.mkdir(parents=True, exist_ok=True)
    return d/f'{pid}.png', d/f'{pid}-card.png'


def prepare_plate(pid):
    sharp, card = plate_paths(pid)
    if sharp.exists() and card.exists():
        return Image.open(sharp).convert('RGB'), Image.open(card).convert('RGB')
    g = GEOM[pid]
    im = Image.open(PLATE_ROOT/PLAN['plates'][pid]['src']).convert('RGB')
    # blank: brand / ad / sign text → heavy blur of the rect (feathered), slightly dimmed
    for (x0, y0, x1, y1) in g['blank']:
        pad = 40
        box = (max(0, x0-pad), max(0, y0-pad), min(im.width, x1+pad), min(im.height, y1+pad))
        reg = im.crop(box)
        bl = reg.filter(ImageFilter.GaussianBlur(28)).filter(ImageFilter.GaussianBlur(28))
        bl = ImageEnhance.Brightness(ImageEnhance.Color(bl).enhance(.5)).enhance(.85 if (x1-x0)*(y1-y0) < 40000 else .38)  # big screens/boards → unlit
        m = Image.new('L', reg.size, 0)
        ImageDraw.Draw(m).rectangle((x0-box[0], y0-box[1], x1-box[0], y1-box[1]), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(10))
        im.paste(Image.composite(bl, reg, m), box[:2])
    # people → blurred, darkened, desaturated mass (no identifiable face; the procedural silhouettes go on top)
    m = Image.new('L', im.size, 0)
    for poly in g['people']: ImageDraw.Draw(m).polygon(poly, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(18))
    ppl = im.filter(ImageFilter.GaussianBlur(16))
    ppl = ImageEnhance.Color(ppl).enhance(.45); ppl = ImageEnhance.Brightness(ppl).enhance(.42)
    im = Image.composite(ppl, im, m)
    # night grade (cooler shadows, a touch of contrast), the real photo a bit darker to sit with the others
    a = np.asarray(im).astype(np.float32)/255
    a = np.clip((a-.5)*1.06+.5, 0, 1)*g.get('grade', .97)
    a[..., 2] = np.clip(a[..., 2]*1.04+.01, 0, 1)
    im = Image.fromarray((a*255+.5).astype(np.uint8))
    im.save(sharp)
    c = im.filter(ImageFilter.GaussianBlur(14)); c = ImageEnhance.Brightness(c).enhance(.62)
    c.save(card)
    return im, c


# ---------------------------------------------------------------- camera
def ease(u): u = min(1, max(0, u)); return u*u*(3-2*u)


def camera(pid, mode, t, dur, crop=None, img=None):
    """→ (cx, cy, h) plate crop (h = crop height in plate px) + shake (dx, dy) in output px."""
    g = GEOM[pid]; PW, PH = img.size
    hmax = min(PH, PW*16/9)
    cx0, cy0 = PW/2, PH/2
    if crop == 'right': cx0 = PW*.62
    u = t/max(dur, 1e-3); sx = sy = 0
    if mode == 'reveal':
        h = hmax*(.86-.06*ease(u)); cx, cy = cx0, h/2+40-30*ease(u)
    elif mode in ('card', 'dark'):
        h = hmax*(.98-.04*u); cx, cy = cx0, cy0
    elif mode == 'walk':
        h = hmax*(1-.28*ease(u*1.1)); f = ease(u)
        cx, cy = cx0+(g['vp'][0]-cx0)*f*.7, cy0+(g['vp'][1]-cy0)*f*.5
        sy = 7*math.sin(t*2*math.pi*1.9); sx = 3*math.sin(t*2*math.pi*.95)
    elif mode == 'queue':
        h = hmax*(.8-.06*u); cx, cy = cx0*.4+g['mid'][0]*.6, cy0*.3+g['mid'][1]*.7
        sx = 2*math.sin(t*5.3); sy = 2*math.sin(t*4.1)
    elif mode == 'caught':
        h = hmax*(.74-.18*ease(u)); cx, cy = cx0*.3+g['mid'][0]*.7, cy0*.3+g['mid'][1]*.7
        amp = 4+38*ease(min(1, t/1.75))
        sx = amp*(math.sin(t*37)+.6*math.sin(t*23+1)); sy = amp*(math.sin(t*41+2)+.5*math.sin(t*29))
    else:  # flow / stamp
        h = hmax*(.94-.08*u); cx, cy = cx0+(g['vp'][0]-cx0)*.25*u, cy0+(g['vp'][1]-cy0)*.15*u
    h = min(h, hmax); w = h*9/16
    cx = min(max(cx, w/2), PW-w/2); cy = min(max(cy, h/2), PH-h/2)
    return cx, cy, h, sx, sy


def warp(img, cx, cy, h, sx=0, sy=0):
    s = h/H
    data = (s, 0, cx-W/2*s-sx*s, 0, s, cy-H/2*s-sy*s)
    return img.transform((W, H), Image.AFFINE, data, resample=Image.BICUBIC)


def plate_frame(pid, mode, t, dur, crop, sharp, card):
    img = card if mode in ('card', 'dark') else sharp
    cx, cy, h, sx, sy = camera(pid, mode, t, dur, crop, img)
    far = warp(img, cx, cy, h, sx, sy)
    if mode not in ('card', 'dark'):
        # 2.5D parallax: the near floor layer (below the horizon) zooms ~35 % faster around the same centre
        PW, PH = img.size; h0 = min(PH, PW*16/9)
        hn = h*(1-.35*(1-h/h0))
        near = warp(img, cx, cy+(GEOM[pid]['yh']-cy)*(1-hn/h)*0, hn, sx*1.3, sy*1.3)
        yh_out = (GEOM[pid]['yh']-cy)/(h/H)+H/2+60
        m = np.clip((np.arange(H, dtype=np.float32)-yh_out)/220, 0, 1)
        m = Image.fromarray((np.repeat(m[:, None], W, 1)*255).astype(np.uint8))
        far = Image.composite(near, far, m)
    if mode == 'dark':
        far = ImageEnhance.Color(far).enhance(.35); far = ImageEnhance.Brightness(far).enhance(.6)
    if mode == 'stamp':
        far = ImageEnhance.Brightness(far).enhance(.78)
    if mode == 'reveal':  # bright "this is real Shibuya" moment, then dims under the rules card
        far = ImageEnhance.Brightness(far).enhance(1-.42*ease((t-.9)/.6))
    return far, (cx, cy, h, sx, sy)


# ---------------------------------------------------------------- procedural silhouettes
class Crowd:
    """Deterministic silhouette crowd on a plate floor. Positions in plate px; drawn through the frame's camera."""
    def __init__(self, pid, mode, dur, seed):
        g = GEOM[pid]; self.g = g; self.mode = mode; self.dur = dur
        rng = np.random.default_rng(seed)
        n = {'reveal': 30, 'walk': 22, 'queue': 34, 'caught': 30, 'flow': 14, 'stamp': 14}.get(mode, 0)
        self.p = []
        yh, k = g['yh'], g['k']
        # tallest figure ≈ 40 % of the frame (queue/caught: a bit more): feet-y cap from the person-height rule
        hcap = {'queue': .5, 'caught': .34}.get(mode, .4)*2752*.85
        ymax = yh+hcap/k
        for i in range(n):
            # feet y: more people far away (perspective), none closer than the cap
            d = rng.random()**(1.4 if mode in ('queue', 'caught') else 2.0)
            y = yh+30+d*(ymax-yh-30)
            x = rng.uniform(*g['x'])
            if mode in ('queue', 'caught'): x = g['mid'][0]+rng.normal(0, 260)
            kind = rng.choice(['plain', 'plain', 'plain', 'plain', 'hat', 'ears', 'hood', 'bag', 'plain', 'bag'])
            speed = rng.uniform(.6, 1.2)
            dirn = {'walk': -1, 'flow': -1, 'stamp': -1, 'queue': 0, 'reveal': rng.choice([-1, 1]), 'caught': 1}[mode]
            self.p.append(dict(x=x, y=y, kind=str(kind), speed=speed, dir=dirn, ph=rng.uniform(0, 6.28), w=rng.uniform(.9, 1.15),
                               dx=rng.uniform(-.15, .15), shade=int(rng.integers(8, 26))))

    def at(self, t):
        g = self.g; yh, k = g['yh'], g['k']; out = []
        for q in self.p:
            y, x = q['y'], q['x']
            if q['dir'] and self.mode != 'caught':
                # walk along the floor: depth changes exponentially toward / away from the horizon (perspective)
                y = yh+(y-yh)*math.exp(q['dir']*.09*q['speed']*t); x = x+q['dx']*(y-yh)*.3*t
            elif self.mode == 'caught':
                c = g['mid'][0]; u = ease(t/2.0)
                y = yh+(y-yh)*(1+2.6*u*q['speed']); x = c+(x-c)*(1+.5*u)
            else:
                x += 6*math.sin(t*1.3+q['ph'])
            hgt = k*(y-yh)
            if hgt < 25: continue
            out.append((y, x, hgt, q, t*2.2*q['speed']+q['ph'] if q['dir'] or self.mode == 'caught' else q['ph']+.3*math.sin(t)))
        out.sort(key=lambda r: r[0])
        return out


def draw_person(d, x, yf, h, q, phase, haze):
    """One silhouette (feet at x, yf; height h; output px), solid; far figures fade toward the haze colour."""
    s = q['shade']; f = min(1, max(0, (h-40)/500)); hz = haze
    col = tuple(int(hz[i]*(1-f)*.75+(s, s, s+8)[i]*(1-(1-f)*.75)) for i in range(3))+(255,)
    w = h*.27*q['w']; head = h*.068; sw = math.sin(phase)*h*.07
    hip_y, sh_y = yf-h*.48, yf-h*.81
    def poly(pts, c): d.polygon([(x+px, py) for px, py in pts], fill=c)
    for c, oo in ((col, 0),):
        # legs (swing), torso, arms, head
        poly([(-w*.32-oo, hip_y), (-w*.05, hip_y), (-w*.12+sw, yf), (-w*.3+sw-oo, yf)], c)
        poly([(w*.05, hip_y), (w*.32+oo, hip_y), (w*.3-sw+oo, yf), (w*.12-sw, yf)], c)
        poly([(-w*.5-oo, sh_y-oo), (w*.5+oo, sh_y-oo), (w*.36+oo, hip_y+h*.03), (-w*.36-oo, hip_y+h*.03)], c)
        poly([(-w*.5-oo, sh_y), (-w*.36, sh_y), (-w*.42-sw*.5, hip_y+h*.04), (-w*.58-sw*.5-oo, hip_y+h*.02)], c)
        poly([(w*.36, sh_y), (w*.5+oo, sh_y), (w*.58+sw*.5+oo, hip_y+h*.02), (w*.42+sw*.5, hip_y+h*.04)], c)
        poly([(-w*.12, sh_y), (w*.12, sh_y), (w*.1, sh_y-h*.05), (-w*.1, sh_y-h*.05)], c)
        hy = sh_y-h*.05-head*1.05; r = head*(1.12 if q['kind'] == 'hood' else 1)
        d.ellipse((x-r*.9-oo, hy-r-oo, x+r*.9+oo, hy+r+oo), fill=c)
        if q['kind'] == 'hat':
            poly([(-head*1.7, hy-head*.55), (head*1.7, hy-head*.55), (head*.9, hy-head*.75), (head*.5, hy-head*2.6), (-head*.1, hy-head*.8)], c)
        elif q['kind'] == 'ears':
            poly([(-head*.95, hy-head*.3), (-head*.75, hy-head*1.6-oo), (-head*.25, hy-head*.8)], c)
            poly([(head*.95, hy-head*.3), (head*.75, hy-head*1.6-oo), (head*.25, hy-head*.8)], c)
        elif q['kind'] == 'bag':
            poly([(w*.42, sh_y+h*.03), (w*.68+oo, sh_y+h*.05), (w*.66+oo, hip_y-h*.02), (w*.4, hip_y)], c)


def crowd_layer(crowd, t, camv, haze):
    cx, cy, h, sx, sy = camv; s = h/H
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for y, x, hgt, q, ph in crowd.at(t):
        xo, yo, ho = (x-cx)/s+W/2+sx*1.3, (y-cy)/s+H/2+sy*1.3, hgt/s
        if yo-ho > H+50 or xo < -ho or xo > W+ho: continue
        draw_person(d, xo, yo, ho, q, ph, haze)
    return lay.filter(ImageFilter.GaussianBlur(1.3))


# ---------------------------------------------------------------- finish + transitions
_vig = None


def finish(a, f, smear=None):
    global _vig
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx-W/2)/(W*.75))**2+((yy-H/2)/(H*.72))**2)
        _vig = np.clip(1.08-.42*r**2, .45, 1)[..., None]
    a = a.astype(np.float32)*_vig
    rng = np.random.default_rng(1000+f)
    a += rng.normal(0, 3.0, (H, W, 1)).astype(np.float32)
    if smear is not None: a = a*.8+smear*.2
    return np.clip(a, 0, 255)


def hblur(a, n):
    if n < 2: return a
    c = np.cumsum(np.pad(a, ((0, 0), (n, 0), (0, 0)), mode='edge'), axis=1, dtype=np.float32)
    return (c[:, n:]-c[:, :-n])/n


def glitch(a, f, i):
    """RGB split + displaced slices + scanlines; i 0..1."""
    if i <= 0: return a
    rng = np.random.default_rng(7000+f); out = a.copy()
    dx = int(36*i)
    out[..., 0] = np.roll(a[..., 0], dx, axis=1); out[..., 2] = np.roll(a[..., 2], -dx, axis=1)
    for _ in range(int(6+10*i)):
        y0 = int(rng.integers(0, H-20)); hh = int(rng.integers(8, 120)); sh = int(rng.integers(-90, 90)*i)
        out[y0:y0+hh] = np.roll(out[y0:y0+hh], sh, axis=1)
    out[::3] *= 1-.25*i
    if rng.random() < .5*i: out = out*.6+np.array([30, 255, 220], np.float32)*.08*i
    return np.clip(out, 0, 255)


def whip(a, side, u):
    """side −1 outgoing (slides left, u 0→1), +1 incoming (from the right, u 0→1 settles)."""
    off = int((ease(u) if side < 0 else 1-ease(u))*W*.55)*(-1 if side < 0 else 1)
    v = 1-abs(.5-u)*2 if side < 0 else 1-u
    b = np.roll(a, off, axis=1)
    return hblur(b, int(10+110*(u if side < 0 else 1-u)))


# ---------------------------------------------------------------- sources
class Reader:
    """Sequential raw RGB frames from a video, from frame f0 (accurate input seek)."""
    def __init__(self, path, f0=0):
        self.path, self.next = path, f0
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', f'{f0/FPS:.6f}', '-i', str(path), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                                  stdout=subprocess.PIPE)

    def read(self):
        b = self.p.stdout.read(W*H*3)
        assert len(b) == W*H*3, ('short read', self.path, self.next)
        self.next += 1
        return np.frombuffer(b, np.uint8).reshape(H, W, 3)

    def close(self):
        self.p.stdout.close(); self.p.kill(); self.p.wait()


def photo_spec(pair, e):
    t = PLAN['opening'] if e['part'] == 'opening' else PLAN['pairs'][pair]
    return t[e['beat']]


def hud_png(pair, e):
    who = 'opening' if e['part'] == 'opening' else pair
    p = WORK/who/'hud'/e['part']/f"f{e['pf']:05d}.png"
    return Image.open(p).convert('RGBA')


def render(pair, out, frames=None, stills=None, stills_dir=None):
    tl, idx, cuts = build_index(pair)
    cutmap = {}
    for v, kind, a, b in cuts:
        for f in range(v-TR//2, v+TR//2): cutmap[f] = (v, kind)
    plates, crowds = {}, {}
    rng_f = range(len(idx)) if frames is None else range(*frames)
    if stills: rng_f = sorted({min(len(idx)-1, round(t*FPS)) for t in stills})
    enc = None
    if not stills:
        out.parent.mkdir(parents=True, exist_ok=True)
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', str(out)],
                               stdin=subprocess.PIPE)
    readers = {}
    prev, prev_v = None, None
    for v in rng_f:
        e = idx[v]
        if e['layer'] == 'photo':
            sp = photo_spec(pair, e); pid = sp['plate']
            if pid not in plates: plates[pid] = prepare_plate(pid)
            sharp, card = plates[pid]
            fr, camv = plate_frame(pid, sp['mode'], e['bt'], e['bdur'], sp.get('crop'), sharp, card)
            key = (e['part'], e['beat'])
            if sp['mode'] not in ('card', 'dark'):
                if key not in crowds: crowds[key] = Crowd(pid, sp['mode'], e['bdur'], seed=sum(map(ord, pair+e['beat'])))
                haze = tuple(int(x) for x in np.asarray(fr.resize((8, 8)), np.float32).reshape(-1, 3)[24:40].mean(0))
                fr = fr.convert('RGBA'); fr.alpha_composite(crowd_layer(crowds[key], e['bt'], camv, haze))
            fr = fr.convert('RGBA')
            if sp['mode'] == 'caught':
                t = e['bt']
                if t >= 2.15: fr = Image.new('RGBA', (W, H), (0, 0, 0, 255))
                else:
                    dark = ease((t-.6)/1.4)*.55
                    ov = Image.new('RGBA', (W, H), (48, 10, 44, int(255*min(.5, max(0, (t-1.75)/.12)*.5*math.exp(-max(0, t-1.87)/.2)))))
                    fr = Image.blend(fr, Image.new('RGBA', (W, H), (0, 0, 0, 255)), dark); fr.alpha_composite(ov)
            fr.alpha_composite(hud_png(pair, e))
            a = finish(np.asarray(fr.convert('RGB')), v, prev if (prev is not None and prev_v == v-1 and sp['mode'] in ('walk', 'caught')) else None)
        else:
            if e['layer'] == 'v6':
                src = ('v6', V6_DIR/f'{pair}.mp4'); start = v
            else:
                who = 'opening' if e['part'] == 'opening' else pair
                seg = next((a, b) for lay, part, f0, f1, _ in pieces(pair)[1] if lay == 'cg' and part == e['part'] and f0 <= e['pf'] < f1
                           for a, b in segments(f0, f1) if a <= e['pf'] < b)
                src = ('cg', cg_path(who, e['part'], *seg)); start = e['pf']-seg[0]
            r = readers.get(src)
            if r is None or r.next != start:
                if r: r.close()
                r = readers[src] = Reader(src[1], start)
            a = r.read().astype(np.float32)
        if v in cutmap:
            c, kind = cutmap[v]; u = (v-(c-TR//2)+.5)/TR  # 0..1 across the transition
            if kind == 'glitch': a = glitch(a, v, 1-abs(u-.5)*2)
            else: a = whip(a, -1, (v-(c-TR//2)+1)/(TR//2)) if v < c else whip(a, 1, (v-c+1)/(TR//2))
        prev, prev_v = a, v
        b = np.clip(a+.5, 0, 255).astype(np.uint8)
        if stills:
            stills_dir.mkdir(parents=True, exist_ok=True)
            Image.fromarray(b).save(stills_dir/f'{pair}-{v/FPS:05.2f}s.png')
        else:
            enc.stdin.write(b.tobytes())
        if v % 150 == 0: print(f'{pair} {v}/{len(idx)} {e["layer"]} {e["beat"]}', flush=True)
    for r in readers.values(): r.close()
    if enc:
        enc.stdin.close()
        if enc.wait(): raise RuntimeError('ffmpeg encode failed')
    return dict(cuts=[dict(frame=c, t=round(c/FPS, 3), kind=k, frm=a, to=b) for c, k, a, b in cuts])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pair'); ap.add_argument('--out', type=Path)
    ap.add_argument('--frames', type=lambda s: tuple(int(x) for x in s.split(':')))
    ap.add_argument('--stills', type=lambda s: [float(x) for x in s.split(',')]); ap.add_argument('--stills-dir', type=Path)
    ap.add_argument('--cuts', action='store_true', help='print the switch plan (cuts) as JSON')
    ap.add_argument('--plates', action='store_true', help='only prepare the plates')
    a = ap.parse_args(argv)
    if a.plates:
        for pid in (PLAN['plates'] if a.pair == 'all' else [a.pair]): prepare_plate(pid); print('plate', pid)
        return 0
    if a.cuts:
        _, _, cuts = build_index(a.pair)
        print(json.dumps([dict(frame=c, t=round(c/FPS, 3), kind=k, frm=x, to=y) for c, k, x, y in cuts], ensure_ascii=False, indent=1)); return 0
    res = render(a.pair, a.out or WORK/a.pair/'video.mp4', a.frames, a.stills, a.stills_dir)
    (WORK/a.pair).mkdir(parents=True, exist_ok=True)
    if not a.stills: (WORK/a.pair/'switch.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
