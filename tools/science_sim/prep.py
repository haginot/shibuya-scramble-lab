#!/usr/bin/env python3
"""science-sim-v1 step 1: reduce the v8 solver output to what the figure needs. Reads ONLY
  web3d/shibuya/series/variants/jr/v8/sim/cache/{plan,retry}-frames.json  (git-ignored, regenerate: node tools/v8_sim.mjs all)
  web3d/shibuya/series/variants/jr/v8/sim/{plan,retry}.json                (committed)
Writes <out>/prep.npz (density crop + sampled crowd), <out>/fd.json (measured speed-vs-density) and <out>/numbers.json
(every number the video prints, with its source)."""
import json, base64, sys, os, numpy as np
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SIM = R + '/web3d/shibuya/series/variants/jr/v8/sim/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/demos/halloween-escape-series/science-sim-v1/work'
os.makedirs(OUT, exist_ok=True)
# map window: 80 x 80 solver cells of 3 m  (x -50..190 m, z -59..181 m of the model frame)
C0, C1, R0, R1 = 3, 83, 106, 186

def load(sc):
    d = json.load(open(f'{SIM}cache/{sc}-frames.json'))
    G = d['grid']; H, W = G['h'], G['w']
    area = np.frombuffer(base64.b64decode(G['area']), dtype=np.uint8).reshape(H, W)
    fr = d['frames']
    return d, G, H, W, area, fr

def grid_of(f, H, W):
    return np.frombuffer(base64.b64decode(f['grid']), dtype=np.uint8).reshape(H, W).astype(np.float32)

# ---- 1. map data from the PLAN run (t = 0..900 s of solver time after its 150 s warm-up)
d, G, H, W, area, fr = load('plan')
x0m = G['x0'] + C0 * G['cell']; z0m = G['z0'] + R0 * G['cell']
rho = np.zeros((len(fr), R1 - R0, C1 - C0), np.float32)
tt = np.array([f['t'] for f in fr], np.float32)
crowd = []
for k, f in enumerate(fr):
    g = grid_of(f, H, W)
    r = np.where(area >= 4, g / np.maximum(area, 1), 0)          # sim-layer.mjs rule: cells with >= 4 m2 walkable, rho = n/area
    rho[k] = r[R0:R1, C0:C1]
    c = f['crowd']
    crowd.append((np.array(c['id'], np.int32), np.array(c['x2'], np.float32) / 2, np.array(c['z2'], np.float32) / 2))
ids = np.concatenate([c[0] for c in crowd]); off = np.cumsum([0] + [len(c[0]) for c in crowd])
np.savez_compressed(OUT + '/prep.npz', rho=rho, t=tt, area=area[R0:R1, C0:C1], ids=ids, off=off,
                    cx=np.concatenate([c[1] for c in crowd]), cz=np.concatenate([c[2] for c in crowd]),
                    win=np.array([x0m, z0m, 3.0, C1 - C0, R1 - R0]))
print('prep.npz', rho.shape, 'window x0,z0', x0m, z0m)

# ---- 2. measured fundamental diagram: 1-s displacement of every sampled walker vs the density of its 3 m cell
bins = [(0.0, .5), (.5, 1), (1, 1.5), (1.5, 2), (2, 2.5), (2.5, 3), (3, 3.5), (3.5, 4)]
acc = {}
def add(key, sp):
    a = acc.setdefault(key, [0, 0.0]); a[0] += len(sp); a[1] += float(np.sum(sp))
sp_cap = []
for sc in ['plan', 'retry']:
    d, G, H, W, area, fr = load(sc)
    for t in range(len(fr) - 1):
        a, b = fr[t]['crowd'], fr[t + 1]['crowd']
        ia = {i: k for k, i in enumerate(a['id'])}
        g = grid_of(fr[t], H, W)
        ax = np.array(a['x2'], np.float32) / 2; az = np.array(a['z2'], np.float32) / 2
        sel = [(ia.get(i, -1), k2) for k2, i in enumerate(b['id'])]
        k1 = np.array([s[0] for s in sel]); k2 = np.array([s[1] for s in sel]); m = k1 >= 0
        k1, k2 = k1[m], k2[m]
        bx = np.array(b['x2'], np.float32)[k2] / 2; bz = np.array(b['z2'], np.float32)[k2] / 2
        px, pz = ax[k1], az[k1]
        sp = np.hypot(bx - px, bz - pz)
        cx = np.floor((px - G['x0']) / G['cell']).astype(int); cz = np.floor((pz - G['z0']) / G['cell']).astype(int)
        ok = (cx >= 0) & (cx < W) & (cz >= 0) & (cz < H)
        cx, cz, sp = cx[ok], cz[ok], sp[ok]
        ar = area[cz, cx]; ok = ar >= 4
        r = g[cz, cx][ok] / ar[ok]; sp = sp[ok]
        for lo, hi in bins:
            mm = (r >= lo) & (r < hi); add((lo, hi), sp[mm])
        mm = r >= 3.999; add('cap', sp[mm])
fd = []
for lo, hi in bins:
    n, s = acc[(lo, hi)]; fd.append({'rho_lo': lo, 'rho_hi': hi, 'rho_mid': (lo + hi) / 2, 'n': n, 'mean_speed': s / n})
n, s = acc['cap']; fd.append({'rho_lo': 4.0, 'rho_hi': 4.0, 'rho_mid': 4.0, 'n': n, 'mean_speed': s / n, 'note': 'cells at the solver cap (rho = 4.0)'})
json.dump({'method': '1-s displacement (m/s) of the 1/12 crowd sample (same agent id in consecutive per-second keyframes) vs rho = n/area of the 3 m cell it stands in at the start of that second (cells >= 4 m2 walkable); plan + retry runs pooled',
           'bins': fd}, open(OUT + '/fd.json', 'w'), indent=1, ensure_ascii=False)
for r in fd: print(r)

# ---- 3. sourced scalars
plan = json.load(open(SIM + 'plan.json')); retry = json.load(open(SIM + 'retry.json'))
json.dump({'agents': plan['agents'], 'agents_retry': retry['agents'], 'assumptions_ja': plan['assumptions']['ja'],
           'grid': plan['grid'], 'keyframes': plan['keyframes'], 'density_cap': plan['density']['peakP50'],
           'walkable_cells_ge4m2_in_window': int((area[R0:R1, C0:C1] >= 4).sum())}, open(OUT + '/scalars.json', 'w'), indent=1, ensure_ascii=False)
