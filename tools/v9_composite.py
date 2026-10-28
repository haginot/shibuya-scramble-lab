#!/usr/bin/env python3
"""JR v9 compositor: assembles one pair video (v9 timeline, 100–130 s) from
  cg     the v9 CG renders ($WORK/<who>/cg, tools/render_v9.py) — costumed cold open / start map, sim + retry beats;
  v7cg   frame-exact v7 CG frames of unchanged beats without people (mission card, TRUE END);
  v8cg   frame-exact v8 CG frames of unchanged beats without CG people (gut pick, CLEAR map, kaiju, sources, zone over-move);
  v6     frame-exact v6 frames (GAME OVER stamp on black, GOODBYE card);
  photo  the v7 photoreal plates (cleaned plate, 2.5D camera, grain) + the v9 HUD layer ($WORK/<who>/hud), with
         • a COSTUMED crowd (tools/costumes_v9.py: zombie makeup, skeleton maids, pumpkin heads, mascot suits, witches,
           vampires, cartoon-print nurses, mummies, sheet ghosts, devils, angels, cardboard robots, inflatable dinos,
           fantasy outfits — passive festival-goers, backs to the camera, no faces) whose head-count follows the sim meter
           of the beat (v8 rule); on over-result at ≥ 3 p/m² a front row of costumed backs presses into the bottom of frame;
         • mode 'crush' (beat crush-pov): the eye-level crush POV — rows of costumed backs edge to edge, pressed against the
           lens, a thin strip of night sky; sway, shoves (config crush.shoves, the same times as the shove SFX), horizontal
           squeeze pulses, heartbeat-timed vignette, desaturated shadows; the HUD crushmeter on top;
         • mode 'caught': the costumed crowd stays a still bystander crowd (no zombie-makeup costumes in this beat, nobody
           closes in); the attackers are ONLY the fictional game-zombie sprites (shadow masses + three-fingered pixel hands
           from the frame edges, costumes_v9.attackers_layer), camera shake, red flash, cut to black at 2.15 s.
Transitions as v7/v8: 8-frame RGB glitch / whip pan at every CG↔photo cut.
On top of everything: the guide ghost 「おばけ」 + speech bubbles (tools/v9_ghost.py Overlay, placed in the safe left area).
usage: python3 tools/v9_composite.py <pair> [--out FILE] [--frames a:b] [--stills t1,t2,... --stills-dir DIR] [--cuts]
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
import v7_composite as V7C  # noqa: E402  (plates, camera, finish, transitions, readers)
import costumes_v9 as COS  # noqa: E402
import v9_ghost as GHOST  # noqa: E402  (the guide character overlay, on top of every layer)
from render_v9 import PLAN, WORK, V7_WORK, V8_WORK, pieces, segments, cg_path, build_index, FPS  # noqa: E402

W, H = V7C.W, V7C.H
V6_DIR = Path(os.environ.get('V6_DIR', '/workspace/demos/halloween-escape-series/jr-v6'))
TR = PLAN['transition']['frames']
CFG_DIR = ROOT/'web3d/shibuya/series/variants/jr/v9'
SIM = {n: json.loads((ROOT/'web3d/shibuya/series/variants/jr/v8/sim'/f'{n}.json').read_text(encoding='utf-8')) for n in ('plan', 'retry')}
SIM['crush'] = json.loads((CFG_DIR/'sim/crush.json').read_text(encoding='utf-8'))
OPENING_FRAMES = {'v7': 456}


def cfg_of(pair):
    return json.loads((CFG_DIR/f'{pair}.json').read_text(encoding='utf-8'))


def beat_cfg(pair, part, beat):
    if part == 'opening': return {}
    return next(x for x in cfg_of(pair)['beats'] if x['id'] == beat)


# ---------------------------------------------------------------- frame-exact reuse (v7 / v8 CG)
def old_beat_f0(work, pair, part, beat):
    tl = json.loads((work/pair/'timeline.json').read_text(encoding='utf-8'))
    return next(x for x in tl['parts'][part]['beats'] if x['id'] == beat)['f0']


def old_cg_segment(work, who, part, pf):
    d = work/who/'cg'
    for f in sorted(d.glob(f'{part}-*.mp4')):
        if f.name.endswith('.part.mp4'): continue
        a, b = (int(x) for x in f.stem.split('-')[1:3])
        if a <= pf < b: return f, pf-a
    raise FileNotFoundError(f'cg frame {work} {who} {part} {pf}')


def v6_frame_start(pair, part, beat):
    f0 = old_beat_f0(V7_WORK, pair, part, beat)
    return f0+(0 if part == 'opening' else OPENING_FRAMES['v7'])


# ---------------------------------------------------------------- sim meter → crowd density
def track_rho(rows, simT):
    if not rows: return 0.0
    lo = 0
    for i, r in enumerate(rows):
        if r[0] <= simT: lo = i
        else: break
    return rows[lo][1]


def meter_of(pair, part, beat):
    b = beat_cfg(pair, part, beat)
    return next((h for h in b.get('hud', []) if h.get('c') in ('simmeter', 'crushmeter')), None)


def meter_rho(m, t):
    a, b = m['run']; t0, t1 = m['simT']
    u = min(1, max(0, (t-a)/max(1e-6, b-a)))
    S = SIM[m['scenario']]
    tr = (S['worst'] if m.get('track') == 'worst' else S['track'])[m['route']]
    return track_rho(tr['rows'], t0+(t1-t0)*u)


# ---------------------------------------------------------------- costumed plate crowd
class CostumeCrowd(V7C.Crowd):
    """the v7 silhouette crowd layout (perspective floor, modes) with costumes: ~2× the v7 head-count is created; per
    frame the first k = n·clamp(ρ/3.6, .28, 1) figures (fixed random order) are drawn (v8 rule). caught: everybody keeps
    still (bystanders; no closing in) and nobody wears zombie makeup."""
    def __init__(self, pid, mode, dur, seed):
        super().__init__(pid, mode, dur, seed)
        for k, s2 in enumerate((977, 1913)):
            extra = V7C.Crowd(pid, mode, dur, seed+s2)
            self.p += extra.p[:int(len(extra.p)*(.5 if k == 0 else .45))]
        zid = COS.CLASS_KEYS.index('zombie-makeup')
        for i, q in enumerate(self.p):
            q['pid'] = seed*1009+i
            if mode == 'caught':
                while COS.class_of(q['pid']) == zid: q['pid'] += 7919
                q['dir'] = 0
            q['facing'] = -1
        self.order = list(np.random.default_rng(seed+5).permutation(len(self.p)))
        self.rho = None

    def at(self, t):
        full = self.p
        if self.rho is not None:
            k = max(1, int(round(len(full)*min(1.0, max(.28, self.rho/3.6)))))
            keep = set(self.order[:k]); self.p = [q for i, q in enumerate(full) if i in keep]
        if self.mode == 'caught':   # still bystanders: only a slight sway (as the queue)
            g = self.g; yh, k = g['yh'], g['k']; out = []
            for q in self.p:
                hgt = k*(q['y']-yh)
                if hgt < 25: continue
                out.append((q['y'], q['x']+5*math.sin(t*1.1+q['ph']), hgt, q, q['ph']+.2*math.sin(t)))
            out.sort(key=lambda r: r[0])
        else:
            out = super().at(t)
        self.p = full
        return out


def light_of(haze):
    lum = (.3*haze[0]+.59*haze[1]+.11*haze[2])/255
    return float(min(1.0, max(.55, .55+.9*lum)))


def costume_layer(crowd, t, camv, haze):
    cx, cy, h, sx, sy = camv; s = h/H
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = COS.blend_draw(lay)
    L = light_of(haze)
    for y, x, hgt, q, ph in crowd.at(t):
        xo, yo, ho = (x-cx)/s+W/2+sx*1.3, (y-cy)/s+H/2+sy*1.3, hgt/s
        if yo-ho > H+50 or xo < -ho or xo > W+ho: continue
        COS.draw_costumed(d, xo, yo, ho, q['pid'], ph, haze, L, facing=q.get('facing', -1))
    lay = lay.filter(ImageFilter.GaussianBlur(1.1))
    return COS.glow_layer(lay)


def press_layer(seed, t, rho, haze):
    """over-result at crush density: a front row of costumed backs pressing into the bottom of the frame."""
    k = min(1.0, max(0.0, (rho-2.8)/1.2))
    if k <= 0: return None
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = COS.blend_draw(lay)
    rng = np.random.default_rng(seed)
    n = 6
    for i in range(n):
        x = (i+.5)/n*W+rng.normal(0, 40)+14*math.sin(t*1.3+i)
        hh = H*(.8+.15*rng.random())
        yf = H+hh*(.62-.14*k)+rng.normal(0, 30)
        COS.draw_costumed(d, x, yf, hh, seed*31+i, 0, haze, .48, -1)
    return lay.filter(ImageFilter.GaussianBlur(5))


# ---------------------------------------------------------------- the crush POV
CRUSH_ROWS = [  # head-top y, height, spacing (px), light, blur, sway amplitude (px)
    (300, 620, 95, .95, 1.0, 6),
    (350, 900, 135, .9, 1.4, 10),
    (440, 1300, 195, .84, 2.0, 16),
    (590, 1850, 290, .76, 3.2, 26),
    (780, 2700, 470, .64, 5.5, 38),
    (1000, 3900, 900, .46, 10.0, 50),
]
_crush_cache = {}
_crush_haze = {}


def crush_rows(seed, haze):
    key = (seed, haze)
    if key in _crush_cache: return _crush_cache[key]
    rng = np.random.default_rng(seed)
    out = []
    PAD = 260
    for r, (top, hh, sp, light, blur, amp) in enumerate(CRUSH_ROWS):
        lay = Image.new('RGBA', (W+2*PAD, H+120), (0, 0, 0, 0)); d = COS.blend_draw(lay)
        x = -sp*rng.random()
        k = 0
        xs = []
        while x < W+2*PAD+sp:
            xs.append(x); x += sp*(.8+.4*rng.random())
        if r == len(CRUSH_ROWS)-1: xs = [PAD-120, PAD+W+120]          # nearest: shoulders at the two frame edges
        for x in xs:
            h2 = hh*(.92+.16*rng.random())
            yf = top+h2*1.0+rng.normal(0, hh*.03)
            COS.draw_costumed(d, x, yf, h2, seed*977+r*101+k, rng.uniform(0, 6), haze, light, -1)
            k += 1
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
        out.append((COS.glow_layer(lay), amp, r))
    _crush_cache[key] = (out, PAD)
    return _crush_cache[key]


def shove_offset(t, shoves, r):
    """lateral push of row r (px): every shove a damped kick, alternating sides, nearer rows move more."""
    x = 0.0
    for i, ts in enumerate(shoves):
        if t < ts: continue
        u = t-ts
        x += (1 if i % 2 else -1)*(18+14*r)*math.exp(-u*2.2)*math.sin(min(u*9, math.pi/2))
    return x


def crush_frame(pid, t, dur, sharp, crop, seed, shoves, beat_t_heart=.74):
    # background: the plate's upper part (neon / sky), dark and soft — only a thin strip shows above the heads
    cx, cy, h, sx, sy = V7C.camera(pid, 'queue', t, dur, crop, sharp)
    bg = V7C.warp(sharp, cx, cy-h*.18, h*.62, 0, 0)
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(4))).enhance(.55).convert('RGBA')
    if seed not in _crush_haze:   # the costume lighting is fixed per beat (no flicker): the strip colour of the first frame
        _crush_haze[seed] = tuple(int(v) for v in np.asarray(bg.resize((4, 4)), np.float32).reshape(-1, 4)[:4, :3].mean(0))
    rows, PAD = crush_rows(seed, _crush_haze[seed])
    sway = lambda r, amp: amp*math.sin(2*math.pi*.42*t+r*.55)+.4*amp*math.sin(2*math.pi*.17*t+r)
    for lay, amp, r in rows:
        ix = int(round(sway(r, amp)+shove_offset(t, shoves, r)))
        iy = int(round(6*math.sin(2*math.pi*.25*t+r*.3)*(1+r*.4)))
        bg.alpha_composite(lay.crop((PAD-ix, -iy, PAD-ix+W, -iy+H)))
    a = np.asarray(bg.convert('RGB')).astype(np.float32)
    # camera: barely creeps forward, jolts on shoves; horizontal squeeze pulses with each shove
    sq = 0.0
    for ts in shoves:
        if t >= ts: sq += .045*math.exp(-(t-ts)*2.6)
    zoom = 1.0+.03*V7C.ease(t/max(dur, 1e-3))
    jx = sum((5 if i % 2 else -5)*math.exp(-(t-ts)*5) for i, ts in enumerate(shoves) if t >= ts)
    ys = (np.arange(H)-H/2)/zoom+H/2
    xs = (np.arange(W)-W/2)/(zoom*(1+sq))+W/2-jx
    a = a[np.clip(ys.astype(int), 0, H-1)][:, np.clip(xs.astype(int), 0, W-1)]
    # grade: desaturated shadows, cold-dim, heavy vignette breathing with the heartbeat
    lum = (a*np.array([.3, .59, .11], np.float32)).sum(-1, keepdims=True)
    sat = np.clip((lum-30)/120, 0, 1)*.45+.45
    a = lum+(a-lum)*sat
    hb = math.exp(-((t % beat_t_heart)/.12)**2)
    yy, xx = np.ogrid[0:H, 0:W]
    rr = np.sqrt(((xx-W/2)/(W*.62))**2+((yy-H/2)/(H*.6))**2).astype(np.float32)
    vig = np.clip(1.08-(.42+.08*hb)*rr**2, .35, 1)[..., None]
    a = a*vig
    return a


# ---------------------------------------------------------------- compositing
def hud_png(pair, e):
    who = 'opening' if e['part'] == 'opening' else pair
    return Image.open(WORK/who/'hud'/e['part']/f"f{e['pf']:05d}.png").convert('RGBA')


def render(pair, out, frames=None, stills=None, stills_dir=None):
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
                                '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', str(out)],
                               stdin=subprocess.PIPE)
    readers = {}
    prev, prev_v = None, None
    beat_f0 = {}
    for v in range(len(idx)):
        k = (idx[v]['part'], idx[v]['beat'])
        if k not in beat_f0: beat_f0[k] = idx[v]['pf']
    all_pieces = pieces(pair)[1]
    ghost = GHOST.Overlay(pair)
    for v in rng_f:
        e = idx[v]
        if e['layer'] == 'photo':
            sp = V7C.photo_spec(pair, e) if e['part'] == 'opening' else PLAN['pairs'][pair][e['beat']]
            pid = sp['plate']
            if pid not in plates: plates[pid] = V7C.prepare_plate(pid)
            sharp, card = plates[pid]
            key = (e['part'], e['beat'])
            seed = sum(map(ord, pair+e['beat']))
            if key not in meters: meters[key] = meter_of(pair, e['part'], e['beat'])
            m = meters[key]
            rho = meter_rho(m, e['bt']) if m else None
            if sp['mode'] == 'crush':
                bc = beat_cfg(pair, e['part'], e['beat'])
                shoves = bc.get('crush', {}).get('shoves', [])
                a = crush_frame(pid, e['bt'], e['bdur'], sharp, sp.get('crop'), seed, shoves)
                fr = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
                stats.append(dict(frame=v, beat=e['beat'], rho=round(rho or 0, 2), mode='crush'))
                fr.alpha_composite(hud_png(pair, e))
                a = V7C.finish(np.asarray(fr.convert('RGB')), v, None)
            else:
                fr, camv = V7C.plate_frame(pid, sp['mode'], e['bt'], e['bdur'], sp.get('crop'), sharp, card)
                if sp['mode'] not in ('card', 'dark'):
                    if key not in crowds: crowds[key] = CostumeCrowd(pid, sp['mode'], e['bdur'], seed=seed)
                    crowds[key].rho = rho
                    if m: stats.append(dict(frame=v, beat=e['beat'], rho=round(rho, 2)))
                    haze = tuple(int(x) for x in np.asarray(fr.resize((8, 8)), np.float32).reshape(-1, 3)[24:40].mean(0))
                    fr = fr.convert('RGBA'); fr.alpha_composite(costume_layer(crowds[key], e['bt'], camv, haze))
                    if sp['mode'] == 'queue' and rho is not None:
                        pl = press_layer(seed, e['bt'], rho, haze)
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
                src = ('v6', V6_DIR/f'{pair}.mp4'); start = v6_frame_start(pair, e['part'], e['beat'])+local
            elif e['layer'] in ('v7cg', 'v8cg'):
                work = V7_WORK if e['layer'] == 'v7cg' else V8_WORK
                path, start = old_cg_segment(work, who, e['part'], old_beat_f0(work, pair, e['part'], e['beat'])+local); src = (e['layer'], path)
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pair'); ap.add_argument('--out', type=Path)
    ap.add_argument('--frames', type=lambda s: tuple(int(x) for x in s.split(':')))
    ap.add_argument('--stills', type=lambda s: [float(x) for x in s.split(',')]); ap.add_argument('--stills-dir', type=Path)
    ap.add_argument('--cuts', action='store_true')
    a = ap.parse_args(argv)
    if a.cuts:
        _, _, cuts = build_index(a.pair)
        print(json.dumps([dict(frame=c, t=round(c/FPS, 3), kind=k, frm=x, to=y) for c, k, x, y in cuts], ensure_ascii=False, indent=1)); return 0
    res = render(a.pair, a.out or WORK/a.pair/'video.mp4', a.frames, a.stills, a.stills_dir)
    (WORK/a.pair).mkdir(parents=True, exist_ok=True)
    if not a.stills: (WORK/a.pair/'switch.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
