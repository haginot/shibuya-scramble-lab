#!/usr/bin/env python3
"""science-sim-v4: top-down density heatmap cut-in from the real solver trajectories (agents.bin), no legend.
usage: heat_cutin.py OUT_DIR [ts0=190] [ts_step=0.5] [n=105] [cx=15 cz=10 width=220]"""
import sys, json, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, '/workspace/tmp/v2'); from rd import load
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ts0 = float(sys.argv[2]) if len(sys.argv) > 2 else 190; step = float(sys.argv[3]) if len(sys.argv) > 3 else .5; N = int(sys.argv[4]) if len(sys.argv) > 4 else 105
cx, cz, wm = (float(v) for v in sys.argv[5:8]) if len(sys.argv) > 7 else (15, 10, 220)
W, H = 1080, 1920; s = W / wm; hm = H / s
X0, Z0 = cx - wm / 2, cz - hm / 2
D = '/workspace/projects/ssl-claude-halloween/web3d/data/'
pl = json.load(open(D + 'shibuya_plateau.json')); osm = json.load(open(D + 'shibuya_osm.json'))
P = lambda x, z: ((x - X0) * s, (z - Z0) * s)
base = Image.new('RGB', (W, H), (8, 10, 18)); d = ImageDraw.Draw(base)
for r in osm['roads']:
    pts = [P(*p) for p in r['points']]
    if len(pts) > 1: d.line(pts, fill=(26, 32, 48), width=int(max(2, 5 * s / 4.9)))
for b in pl['buildings']:
    ring = [P(*p) for p in b['ring']]
    if len(ring) > 2: d.polygon(ring, fill=(30, 36, 54), outline=(52, 62, 88))
base_arr = np.asarray(base).astype(np.float32)
fr = load('/workspace/demos/halloween-escape-series/science-sim-v2/sim/agents.bin')
cm = np.array([[10, 14, 40], [40, 20, 120], [150, 30, 140], [235, 70, 60], [255, 170, 40], [255, 245, 170]], np.float32)
def color(v):  # v 0..1
    p = np.clip(v, 0, 1) * (len(cm) - 1); i = np.clip(p.astype(int), 0, len(cm) - 2); f = (p - i)[..., None]
    return cm[i] * (1 - f) + cm[i + 1] * f
for n in range(N):
    ts = ts0 + n * step; k = int(ts); u = ts - k
    A, B = fr[k], fr[min(k + 1, len(fr) - 1)]
    dmap = {int(i): (x, z) for i, x, z in zip(A[1], A[2], A[3])}
    xs, zs = [], []
    Bm = {int(i): (x, z) for i, x, z in zip(B[1], B[2], B[3])}
    for i, (x, z) in dmap.items():
        if i in Bm: x2, z2 = Bm[i]; xs.append(x + (x2 - x) * u); zs.append(z + (z2 - z) * u)
    H2, _, _ = np.histogram2d(np.array(zs), np.array(xs), bins=[H // 6, W // 6], range=[[Z0, Z0 + hm], [X0, X0 + wm]])
    dens = H2 / ((wm / (W // 6)) * (hm / (H // 6)))  # people / m2
    img = Image.fromarray((np.clip(dens / 4.0, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(9))
    v = np.asarray(img).astype(np.float32) / 255
    col = color(v ** 0.8); a = np.clip(v * 3.0, 0, 0.92)[..., None]
    comp = base_arr * (1 - a) + col * a
    Image.fromarray(comp.astype(np.uint8)).save(out / f'h{n:04d}.png')
print('done', N)
