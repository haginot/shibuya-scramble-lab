#!/usr/bin/env python3
"""science-sim-v6.1 (research-figure style: light neutral base, smooth density heatmap, only "you" in red): live-sim top-down map for the realistic-conditions hero run (x1.5, 70% idle, police holds, gate closures, Weidmann).
HUD = elapsed time + density only. 'you' dot blinks red faster with density. Landmarks drawn as extruded shapes with Japanese labels.
Playback in shown segments is exactly 4x; between them a time-skip (map frozen, counter rolls).
usage: map_v61.py OUT_DIR AGENTS_BIN RESULT_JSON KEY J PART(1|2) [nproc=4] [only_frames=a:b]"""
import sys, json, math, os, numpy as np
from pathlib import Path
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
AB, RJ, KEY, J, PART = sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
NP = int(sys.argv[7]) if len(sys.argv) > 7 else 4
FR = sys.argv[8] if len(sys.argv) > 8 else None
W, H, FPS = 1080, 1920, 30
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
_fc = {}
def F(sz):
    if sz not in _fc: _fc[sz] = ImageFont.truetype(FONT, sz)
    return _fc[sz]
CX, CZ = 17.5, 22.5   # dump centre (realistic_run.mjs CENTER)
# ---- agents.bin (uint32 id, int16 x, int16 z; x8, relative to centre)
b = open(AB, 'rb').read(); off = 0; frames = {}
dt = np.dtype([('id', '<u4'), ('x', '<i2'), ('z', '<i2')])
while off + 8 <= len(b):
    t, n = np.frombuffer(b, '<i4', 2, off); off += 8
    if off + 8 * n > len(b): break
    a = np.frombuffer(b, dt, n, off); off += 8 * n
    frames[int(t)] = (a['id'].copy(), a['x'] / 8.0 + CX, a['z'] / 8.0 + CZ)
STEP = 2
R = json.load(open(RJ)); T = R['tracks']
track = {r['t']: r['w'][KEY][J] for r in T if r['w'][KEY][J][0] is not None}
tB = min(track); tEnd = max(track)
def you_at(t):
    k = int(math.floor(t)); u = t - k; a = track.get(k) or track[min(track, key=lambda q: abs(q - k))]; c = track.get(k + 1, a)
    return a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u
def rho_at(t):
    v = [track[k][3] for k in range(int(t) - 2, int(t) + 3) if k in track]; return sum(v) / len(v) if v else 0
waves = []
for g in ('hachiko', 'south', 'shinminami'):
    ts = sorted(w['t'] for w in R['waves'] if w['gate'] == g and w['t'] > -5); grp = [[ts[0]]]
    for t in ts[1:]:
        if t - grp[-1][-1] > 30: grp.append([t])
        else: grp[-1].append(t)
    waves += [(x[0], g, len(x)) for x in grp]
GATE = (85.9, 18.9)
# ---- map data
D = '/workspace/projects/ssl-claude-halloween/web3d/data/'
pl = json.load(open(D + 'shibuya_plateau.json')); osm = json.load(open(D + 'shibuya_osm.json'))
BLD = []
for bd in pl['buildings']:
    a = np.array(bd['ring']); BLD.append((a, a.min(0), a.max(0), bd['height'], bd['id']))
ROADS = [(np.array(r['points']), np.array(r['points']).min(0), np.array(r['points']).max(0)) for r in osm['roads'] if len(r['points']) > 1]
LM_ID = {'QFRONT': '35cd27', 'SHIBUYA109': '7682d8'}
def ring_rect(x0, z0, x1, z1): return np.array([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])
LANDMARKS = [  # (label, ring, height m(draw), colour, label anchor)
    ('SHIBUYA109', None, 34, (178, 112, 190), 'id:7682d8'), ('QFRONT', None, 46, (90, 160, 205), 'id:35cd27'),
    ('渋谷駅', ring_rect(100, 24, 138, 33), 10, (104, 178, 130), None),
    ('ハチ公口', ring_rect(81.9, 19.6, 89.9, 23.6), 8, (226, 168, 56), None),
    ('ハチ公像', ring_rect(5, 45, 9, 49), 6, (222, 128, 78), None),
    ('センター街入口', ring_rect(-30, -31, -20, -26), 7, (205, 105, 150), None),
    ('スクランブル交差点', ring_rect(-24, -22, 24, 22), 0.8, (214, 214, 222), None)]
for i, (lab, ring, h, col, anc) in enumerate(LANDMARKS):
    if ring is None:
        bid = anc[3:]; bb = [x for x in BLD if x[4].endswith(bid)][0]; LANDMARKS[i] = (lab, bb[0], h, col, anc)
def cam_at(cams, u):
    """cams: [(u, vx, vz, wm)] smoothstep between keys (log wm)"""
    if u <= cams[0][0]: return cams[0][1:]
    for (u0, *a), (u1, *c) in zip(cams, cams[1:]):
        if u <= u1:
            q = (u - u0) / (u1 - u0); q = q * q * (3 - 2 * q)
            return a[0] + (c[0] - a[0]) * q, a[1] + (c[1] - a[1]) * q, math.exp(math.log(a[2]) + (math.log(c[2]) - math.log(a[2])) * q)
    return cams[-1][1:]
def base_map(vx, vz, wm):
    s = W / wm; hm = H / s; X0, Z0 = vx - wm / 2, vz - hm / 2
    P = lambda x, z: ((x - X0) * s, (z - Z0) * s)
    img = Image.new('RGB', (W, H), (243, 241, 236)); d = ImageDraw.Draw(img)
    for pts, mn, mx in ROADS:
        if mx[0] < X0 or mn[0] > X0 + wm or mx[1] < Z0 or mn[1] > Z0 + hm: continue
        wd_ = int(max(2, 5 * s / 4.9)); pp = [P(*p) for p in pts]
        d.line(pp, fill=(206, 204, 198), width=wd_ + 3); d.line(pp, fill=(252, 251, 248), width=wd_)
    lmids = {l[4][3:] for l in LANDMARKS if l[4]}
    for a, mn, mx, h, bid in BLD:
        if mx[0] < X0 or mn[0] > X0 + wm or mx[1] < Z0 or mn[1] > Z0 + hm: continue
        if any(bid.endswith(i) for i in lmids): continue
        d.polygon([P(*p) for p in a], fill=(224, 222, 215), outline=(196, 193, 185))
    return img, s, X0, Z0, P
def extrude(dr, P, s, ring, h, col, k=0.55):
    pts = [P(*p) for p in ring]; hh = h * s * k
    hh = min(hh, 0.045 * H)
    top = [(x, y - hh) for x, y in pts]
    n = len(pts); dark = tuple(int(c * 0.62) for c in col); mid = tuple(int(c * 0.80) for c in col)
    order = sorted(range(n), key=lambda i: (pts[i][1] + pts[(i + 1) % n][1]) / 2)
    for i in order:
        j = (i + 1) % n
        dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        # visible if the outward normal points down (screen +y) or sideways
        dr.polygon([pts[i], pts[j], top[j], top[i]], fill=dark if dy * 0 + (dx > 0) else mid, outline=(70, 72, 82, 120))
    dr.polygon(top, fill=tuple(int(c * 1.0) for c in col) + (255,), outline=(70, 72, 82, 200))
    return top
def label(dr, xy, text, sz, fill=(38, 42, 56, 255), bg=(255, 255, 255, 238), anchor='mm'):
    f = F(sz); tw = dr.textlength(text, font=f); x, y = xy
    dr.rounded_rectangle([x - tw / 2 - 14, y - sz * 0.62, x + tw / 2 + 14, y + sz * 0.62], int(sz * 0.4), fill=bg, outline=(110, 116, 132, 150), width=2)
    dr.text((x - tw / 2, y - sz * 0.66), text, font=f, fill=fill)
def mmss(sec): sec = max(0, int(sec)); return f'{sec//60:02d}:{sec%60:02d}'
def dens_col(d): return tuple(int(v * 0.8) for v in HEAT_RGB[min(255, int(d / DMAX * 255))][:3])
def agents_at(ts, hold=False):
    k = int(ts // STEP) * STEP; u = (ts - k) / STEP
    A = frames.get(k) or frames[max(q for q in frames if q <= k)]; Bf = frames.get(k + STEP, A)
    ids, xa, za = A; idb, xb, zb = Bf
    pos = np.searchsorted(idb, ids); pos = np.clip(pos, 0, len(idb) - 1); ok = idb[pos] == ids
    x2 = np.where(ok, xb[pos], xa); z2 = np.where(ok, zb[pos], za)
    return xa + (x2 - xa) * u, za + (z2 - za) * u

DMAX = 7.5
def _lut():
    stops = [(0, (150, 205, 225)), (1, (92, 172, 202)), (2.5, (60, 125, 176)), (4.5, (55, 85, 150)), (6, (80, 50, 130)), (7.5, (48, 22, 86))]
    out = np.zeros((256, 4), np.uint8)
    for i in range(256):
        d = i / 255 * DMAX
        for (d0, c0), (d1, c1) in zip(stops, stops[1:]):
            if d <= d1:
                q = (d - d0) / (d1 - d0); out[i, :3] = [c0[k] + (c1[k] - c0[k]) * q for k in range(3)]; break
        al = min(max((d - 0.04) / 0.6, 0), 1); al = al * al * (3 - 2 * al)
        out[i, 3] = int(235 * al)
    return out
HEAT_RGB = _lut()
def box3(a):
    p = np.pad(a, 1, mode='edge'); c = p.cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
    n0, n1 = a.shape
    return (c[3:3 + n0, 3:3 + n1] - c[0:n0, 3:3 + n1] - c[3:3 + n0, 0:n1] + c[0:n0, 0:n1]) / 9.0
def heat_layer(img, xs, zs, X0, Z0, wm, hm, s):
    from PIL import ImageFilter
    gx, gz = int(math.ceil(wm)) + 1, int(math.ceil(hm)) + 1
    ix = np.floor(xs - X0).astype(int); iz = np.floor(zs - Z0).astype(int); ok = (ix >= 0) & (ix < gx) & (iz >= 0) & (iz < gz)
    cnt = np.bincount(iz[ok] * gx + ix[ok], minlength=gx * gz).reshape(gz, gx).astype(float)
    d = box3(cnt)
    idx = np.clip(d / DMAX * 255, 0, 255).astype(np.uint8)
    L = Image.fromarray(idx, 'L').resize((int(gx * s), int(gz * s)), Image.BICUBIC)
    L2 = Image.new('L', (W, H), 0); L2.paste(L, (0, 0)); L = L2.filter(ImageFilter.GaussianBlur(max(2.0, 0.6 * s)))
    rgba = HEAT_RGB[np.asarray(L)]
    img.paste(Image.fromarray(rgba, 'RGBA'), (0, 0), Image.fromarray(rgba[:, :, 3], 'L'))
def render(spec):
    kind, ts, cams_u, cams, el, extra = spec
    vx, vz, wm = cam_at(cams, cams_u)
    img, s, X0, Z0, P = base_map(vx, vz, wm); hm = H / s
    dr = ImageDraw.Draw(img, 'RGBA')
    def lm_vis(ring): 
        a = np.array(ring); return not (a[:, 0].max() < X0 - 5 or a[:, 0].min() > X0 + wm + 5 or a[:, 1].max() < Z0 - 5 or a[:, 1].min() > Z0 + hm + 5)
    for lab, ring, h, col, anc in sorted(LANDMARKS, key=lambda l: np.mean(l[1][:, 1])):
        if lab == 'スクランブル交差点' and lm_vis(ring): extrude(dr, P, s, ring, h, col)
    xs, zs = agents_at(ts)
    m = (xs > X0 - 2) & (xs < X0 + wm + 2) & (zs > Z0 - 2) & (zs < Z0 + hm + 2)
    xs, zs = xs[m], zs[m]
    heat_layer(img, xs, zs, X0, Z0, wm, hm, s)
    dr = ImageDraw.Draw(img, 'RGBA')
    for lab, ring, h, col, anc in sorted(LANDMARKS, key=lambda l: np.mean(l[1][:, 1])):
        if lab != 'スクランブル交差点' and lm_vis(ring): extrude(dr, P, s, ring, h, col)
    for lab, ring, h, col, anc in LANDMARKS:
        a = np.array(ring)
        if not lm_vis(ring): continue
        px, pz = P(a[:, 0].mean(), a[:, 1].min() if h > 3 else a[:, 1].mean())
        pz -= min(h * s * 0.55, 0.05 * H) + 40
        sz = 34 if wm > 200 else 42
        if lab == 'スクランブル交差点': pz = P(0, -10)[1] - 70
        px = min(max(px, 170), W - 170); pz = min(max(pz, 360), H - 80)
        label(dr, (px, pz), lab, sz, fill=tuple(int(c * 0.55) for c in col) + (255,))
    # you
    yx, yz = you_at(ts); ypx, ypz = P(yx, yz); rho = rho_at(ts)
    # arrow to the station gate (text 駅はこっち→)
    gx, gz = P(*GATE); ang = math.atan2(gz - ypz, gx - ypx)
    gd = math.hypot(gx - ypx, gz - ypz)
    if gd < 260:
        top = gz - 70; dr.line([(gx, top - 120), (gx, top)], fill=(36, 58, 86, 255), width=20)
        dr.polygon([(gx, top + 44), (gx - 40, top - 6), (gx + 40, top - 6)], fill=(36, 58, 86, 255))
        label(dr, (min(max(gx, 230), W - 230), top - 170), '駅はこっち ↓', 50, fill=(255, 255, 255, 255), bg=(36, 58, 86, 245))
    else:
        d0 = 120; ax, az = ypx + math.cos(ang) * d0, ypz + math.sin(ang) * d0 + 130
        L = 150; bx, bz = ax + math.cos(ang) * L, az + math.sin(ang) * L
        dr.line([(ax, az), (bx, bz)], fill=(36, 58, 86, 255), width=18)
        hd = 46; dr.polygon([(bx + math.cos(ang) * hd, bz + math.sin(ang) * hd), (bx + math.cos(ang + 2.5) * hd, bz + math.sin(ang + 2.5) * hd), (bx + math.cos(ang - 2.5) * hd, bz + math.sin(ang - 2.5) * hd)], fill=(36, 58, 86, 255))
        txt = '駅はこっち →' if math.cos(ang) >= 0 else '← 駅はこっち'
        label(dr, (min(max((ax + bx) / 2, 230), W - 230), (az + bz) / 2 - 62), txt, 48, fill=(255, 255, 255, 255), bg=(36, 58, 86, 245))
    # trail
    tt = [t for t in range(int(tB), int(ts) + 1) if t in track][-260:]
    tr = [P(*track[t][:2]) for t in tt] + [(ypx, ypz)]
    if len(tr) > 1 and kind != 'skip': dr.line(tr, fill=(70, 74, 88, 150), width=5)
    # blink: faster with density
    fq = 1.0 + 3.0 * min(max((rho - 0.5) / 5.5, 0), 1)
    tv = extra['vt']; on = (tv * fq) % 1.0 < 0.5
    rg = 30 + 26 * ((tv * fq) % 1.0)
    dr.ellipse([ypx - rg, ypz - rg, ypx + rg, ypz + rg], outline=(228, 30, 36, int(230 * (1 - ((tv * fq) % 1.0)))), width=5)
    dr.ellipse([ypx - 21, ypz - 21, ypx + 21, ypz + 21], fill=(228, 30, 36, 255) if on else (255, 214, 214, 255), outline=(255, 255, 255, 255), width=5)
    label(dr, (ypx + 108, ypz - 52), 'あなた', 40, fill=(255, 255, 255, 255), bg=(214, 30, 38, 245))
    # HUD: elapsed + density only
    pn = Image.new('RGBA', (W, 330), (0, 0, 0, 0)); pd = ImageDraw.Draw(pn)
    pd.rounded_rectangle([30, 36, W - 30, 316], 36, fill=(255, 255, 255, 240), outline=(120, 126, 142, 150), width=2)
    pd.text((70, 56), '経過時間', font=F(38), fill=(100, 108, 126, 255)); pd.text((70, 104), mmss(el), font=F(150), fill=(34, 38, 52, 255))
    pd.text((560, 56), 'あなたの周囲の密度', font=F(38), fill=(100, 108, 126, 255))
    col = dens_col(rho)
    if rho >= 7: pd.text((560, 118), '押しつぶされる', font=F(60), fill=col + (255,)); pd.text((560, 190), '危険な密度', font=F(60), fill=col + (255,))
    else:
        pd.text((560, 100), f'{rho:.1f}', font=F(128), fill=col + (255,)); pd.text((560 + pd.textlength(f'{rho:.1f}', font=F(128)) + 12, 178), '人/㎡', font=F(46), fill=col + (255,))
        if rho >= 5.4: pd.text((560, 252), 'ほぼ動けない密度', font=F(40), fill=col + (255,))
    img.paste(pn, (0, 0), pn); dr = ImageDraw.Draw(img, 'RGBA')
    # train toast
    for (tw, g, nn) in waves:
        a = (ts - tw) / 7
        if 0 <= a < 1 and kind != 'skip':
            al = int(255 * min(1, (1 - a) * 3, a * 12 + .2)); lab = f'電車到着 +{nn}人'; f = F(70); tw_ = dr.textlength(lab, font=f); y = 360
            dr.rounded_rectangle([W / 2 - tw_ / 2 - 36, y, W / 2 + tw_ / 2 + 36, y + 100], 26, fill=(52, 62, 96, int(240 * al / 255))); dr.text((W / 2 - tw_ / 2, y + 8), lab, font=f, fill=(255, 255, 255, al))
    if kind == 'skip':
        ov = Image.new('RGBA', (W, H), (255, 255, 255, 110)); img.paste(ov, (0, 0), ov); dr = ImageDraw.Draw(img, 'RGBA')
        q = extra['q']; lab = '⏩ 時間スキップ'.replace('⏩', '≫'); f = F(88); tw_ = dr.textlength(lab, font=f)
        dr.rounded_rectangle([W / 2 - tw_ / 2 - 40, H / 2 - 80, W / 2 + tw_ / 2 + 40, H / 2 + 80], 36, fill=(40, 46, 64, 240), outline=(255, 255, 255, 230), width=4)
        dr.text((W / 2 - tw_ / 2, H / 2 - 62), lab, font=f, fill=(255, 255, 255, 255))
        if extra.get('sub'): dr.text((W / 2 - dr.textlength(extra['sub'], font=F(40)) / 2, H / 2 + 90), extra['sub'], font=F(40), fill=(40, 46, 64, 255), stroke_width=5, stroke_fill=(255, 255, 255, 255))
    if extra.get('cap'):
        cap = extra['cap']; hh = sum(int(sz * 1.45) for _, sz, _ in cap) + 36; y0 = H - 60 - hh
        dr.rounded_rectangle([40, y0, W - 40, y0 + hh], 34, fill=(255, 255, 255, 238), outline=(120, 126, 142, 150), width=2)
        y = y0 + 18
        for txt, sz, c in cap:
            f = F(sz); tw_ = dr.textlength(txt, font=f); dr.text((W / 2 - tw_ / 2, y), txt, font=f, fill=c); y += int(sz * 1.45)
    return img
# ---- timeline specs
E = lambda e: tB + e   # elapsed -> sim t
CAM_WIDE = (-35, -5, 330); CAM_ROUTE = (70, 22, 150); CAM_Q = (94, 17, 46); CAM_H = (95, 17, 30)
def seg(kind, e0, e1, dur, cams, cap=None, sub=None):
    n = int(dur * FPS); out = []
    for i in range(n):
        u = i / max(n - 1, 1); el = e0 + (e1 - e0) * u
        if kind == 'play': ts = E(el)
        elif kind == 'skip': ts = E(e0 if u < .5 else e1)
        else: ts = E(e0)
        out.append((kind, ts, u, cams, el, {'vt': 0, 'q': u, 'cap': cap, 'sub': sub}))
    return out
WH, YL, RD = (34, 38, 52, 255), (140, 92, 0, 255), (120, 32, 110, 255)
specs = []
if PART == 1:
    specs += seg('play', 0, 24, 6.0, [(0, *CAM_WIDE), (.55, *CAM_WIDE), (1, *CAM_ROUTE)], cap=[('改札のあるハチ公口へ向かう', 50, WH)])
    specs += seg('skip', 24, 185, 1.0, [(0, *CAM_ROUTE), (1, *CAM_Q)], sub='人が詰まってきた')
    specs += seg('play', 185, 209, 6.0, [(0, *CAM_Q), (1, *CAM_Q)], cap=[('改札はすぐそこ。でも…', 50, YL)])
else:
    specs += seg('skip', 209, 300, 0.9, [(0, *CAM_Q), (1, *CAM_H)])
    specs += seg('play', 300, 324, 6.0, [(0, *CAM_H), (1, *CAM_H)], cap=[('前にも後ろにも進めない', 52, RD)])
    specs += seg('skip', 324, 560, 1.4, [(0, *CAM_H), (1, *CAM_H)], sub='動かないまま')
    specs += seg('hold', 560, 560, 1.7, [(0, *CAM_H), (1, *CAM_H)], cap=[('連続 約5分、1歩も動けない', 54, RD), ('（この1人のシミュレーション実測）', 34, (90, 98, 116, 255))])
if FR: a, c = map(int, FR.split(':')); idx = list(range(a, c))
else: idx = list(range(len(specs)))
# assign video time for blink
for i, sp in enumerate(specs): sp[5]['vt'] = i / FPS
def work(i):
    render(specs[i]).convert('RGB').save(OUT / f'f{i:04d}.png', compress_level=1); return i
if __name__ == '__main__':
    print('specs', len(specs), 'tB', tB, 'dump frames', len(frames), 'maxdump', max(frames), flush=True)
    with Pool(NP) as p:
        for k in p.imap_unordered(work, idx): pass
