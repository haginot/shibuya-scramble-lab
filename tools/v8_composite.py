#!/usr/bin/env python3
"""JR v8 compositor: assembles one pair video (v8 timeline, < 100 s) from
  cg     the v8 CG renders ($WORK/<who>/cg, tools/render_v8.py) — sim beats, maps, kaiju, sources;
  v7cg   frame-exact v7 CG frames of unchanged beats ($V7_WORK/<who>/cg at the v7 beat-local frame);
  v6     frame-exact v6 frames (GAME OVER stamp on black, GOODBYE card) at the v6/v7 timestamp of the beat;
  photo  the v7 photoreal layer (tools/v7_composite.py: cleaned plate, 2.5D camera, procedural silhouettes, grain) with the
         v8 HUD layer ($WORK/<who>/hud) on top. NEW: the silhouette crowd follows the sim — on a beat with a `simmeter`
         item the number of visible figures (and how close they stand) scales with the tracked walker's density
         (web3d/shibuya/series/variants/jr/v8/sim/<scenario>.json track), so the picture and the meter agree.
Transitions as v7: 8-frame RGB glitch / whip pan at every CG↔photo cut.
usage: python3 tools/v8_composite.py <pair> [--out FILE] [--frames a:b] [--stills t1,t2,... --stills-dir DIR] [--cuts]
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
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v8 as R8  # noqa: E402
import v7_composite as V7C  # noqa: E402  (plates, camera, silhouettes, finish, transitions)
from render_v8 import PLAN, WORK, V7_WORK, pieces, segments, cg_path, build_index, FPS  # noqa: E402

W, H = V7C.W, V7C.H
V6_DIR = Path(os.environ.get('V6_DIR', '/workspace/demos/halloween-escape-series/jr-v6'))
TR = PLAN['transition']['frames']
CFG_DIR = ROOT/'web3d/shibuya/series/variants/jr/v8'
SIM = {n: json.loads((CFG_DIR/'sim'/f'{n}.json').read_text(encoding='utf-8')) for n in ('plan', 'retry')}
V7_OPENING_FRAMES = 456


def v7_timeline(pair):
    return json.loads((V7_WORK/pair/'timeline.json').read_text(encoding='utf-8'))


def v7_beat_f0(pair, part, beat):
    """part-frame start of `beat` in the v7 timeline (+ the video frame offset of the part)."""
    tl = v7_timeline(pair)
    b = next(x for x in tl['parts'][part]['beats'] if x['id'] == beat)
    return b['f0'], (0 if part == 'opening' else V7_OPENING_FRAMES)


def v7_cg_segment(who, part, pf):
    d = V7_WORK/who/'cg'
    for f in sorted(d.glob(f'{part}-*.mp4')):
        if f.name.endswith('.part.mp4'): continue
        a, b = (int(x) for x in f.stem.split('-')[1:3])
        if a <= pf < b: return f, pf-a
    raise FileNotFoundError(f'v7 cg frame {who} {part} {pf}')


# ---------------------------------------------------------------- sim-driven silhouettes
def track_at(track, simT):
    rows = track['rows']
    if not rows: return 0.0
    if simT <= rows[0][0]: return rows[0][1]
    lo = 0
    for i, r in enumerate(rows):
        if r[0] <= simT: lo = i
        else: break
    return rows[lo][1]


def meter_of(pair, part, beat):
    if part == 'opening': return None
    cfg = json.loads((CFG_DIR/f'{pair}.json').read_text(encoding='utf-8'))
    b = next(x for x in cfg['beats'] if x['id'] == beat)
    return next((h for h in b.get('hud', []) if h.get('c') == 'simmeter'), None)


def meter_rho(m, t):
    a, b = m['run']; t0, t1 = m['simT']
    u = min(1, max(0, (t-a)/max(1e-6, b-a)))
    return track_at(SIM[m['scenario']]['track'][m['route']], t0+(t1-t0)*u)


class SimCrowd(V7C.Crowd):
    """v7 silhouette crowd with a density knob: 1.4× the v7 head-count is created; per frame the first
    k = n·clamp(ρ/3.6, .28, 1) figures (fixed random order) are drawn, and in queue/caught modes the figures close in
    toward the crowd centre as ρ rises."""
    def __init__(self, pid, mode, dur, seed):
        super().__init__(pid, mode, dur, seed)
        extra = V7C.Crowd(pid, mode, dur, seed+977)
        self.p += extra.p[:int(len(extra.p)*.4)]
        self.order = list(np.random.default_rng(seed+5).permutation(len(self.p)))
        self.rho = None

    def at(self, t):
        if self.rho is None: return super().at(t)
        k = max(1, int(round(len(self.p)*min(1.0, max(.28, self.rho/3.6)))))
        keep = set(self.order[:k]); full = self.p
        self.p = [q for i, q in enumerate(full) if i in keep]
        if self.mode in ('queue', 'caught'):
            c = self.g['mid'][0]; s = 1.25-.35*min(1, self.rho/4)
            saved = [q['x'] for q in self.p]
            for q in self.p: q['x'] = c+(q['x']-c)*s
            out = super().at(t)
            for q, x in zip(self.p, saved): q['x'] = x
        else:
            out = super().at(t)
        self.p = full
        return out


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
    for v in rng_f:
        e = idx[v]
        if e['layer'] == 'photo':
            sp = V7C.photo_spec(pair, e) if e['part'] == 'opening' else PLAN['pairs'][pair][e['beat']]
            pid = sp['plate']
            if pid not in plates: plates[pid] = V7C.prepare_plate(pid)
            sharp, card = plates[pid]
            fr, camv = V7C.plate_frame(pid, sp['mode'], e['bt'], e['bdur'], sp.get('crop'), sharp, card)
            key = (e['part'], e['beat'])
            if sp['mode'] not in ('card', 'dark'):
                if key not in crowds:
                    crowds[key] = SimCrowd(pid, sp['mode'], e['bdur'], seed=sum(map(ord, pair+e['beat'])))
                    meters[key] = meter_of(pair, e['part'], e['beat'])
                m = meters[key]
                crowds[key].rho = meter_rho(m, e['bt']) if m else None
                if m: stats.append(dict(frame=v, beat=e['beat'], rho=round(crowds[key].rho, 2)))
                haze = tuple(int(x) for x in np.asarray(fr.resize((8, 8)), np.float32).reshape(-1, 3)[24:40].mean(0))
                fr = fr.convert('RGBA'); fr.alpha_composite(V7C.crowd_layer(crowds[key], e['bt'], camv, haze))
            fr = fr.convert('RGBA')
            if sp['mode'] == 'caught':
                t = e['bt']
                if t >= 2.15: fr = Image.new('RGBA', (W, H), (0, 0, 0, 255))
                else:
                    dark = V7C.ease((t-.6)/1.4)*.55
                    ov = Image.new('RGBA', (W, H), (48, 10, 44, int(255*min(.5, max(0, (t-1.75)/.12)*.5*math.exp(-max(0, t-1.87)/.2)))))
                    fr = Image.blend(fr, Image.new('RGBA', (W, H), (0, 0, 0, 255)), dark); fr.alpha_composite(ov)
            fr.alpha_composite(hud_png(pair, e))
            a = V7C.finish(np.asarray(fr.convert('RGB')), v, prev if (prev is not None and prev_v == v-1 and sp['mode'] in ('walk', 'caught')) else None)
        else:
            local = e['pf']-beat_f0[(e['part'], e['beat'])]
            if e['layer'] == 'v6':
                f0, off = v7_beat_f0(pair, e['part'], e['beat'])
                src = ('v6', V6_DIR/f'{pair}.mp4'); start = off+f0+local
            elif e['layer'] == 'v7cg':
                who = 'opening' if e['part'] == 'opening' else pair
                f0, _ = v7_beat_f0(pair, e['part'], e['beat'])
                path, start = v7_cg_segment(who, e['part'], f0+local); src = ('v7cg', path)
            else:
                who = 'opening' if e['part'] == 'opening' else pair
                seg = next((a, b) for lay, part, f0, f1, _ in pieces(pair)[1] if lay == 'cg' and part == e['part'] and f0 <= e['pf'] < f1
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
    return dict(frames=len(idx), cuts=[dict(frame=c, t=round(c/FPS, 3), kind=k, frm=a, to=b) for c, k, a, b in cuts], silhouettes=stats[::5])


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
