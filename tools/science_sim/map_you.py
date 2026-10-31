#!/usr/bin/env python3
"""science-sim-v5: top-down live-sim map frames with HUD (clock, people in area, density around 'you', train-arrival pulses, you-marker,
exit-time card). All numbers come from the solver run tools/science_sim/you_run.mjs (you.json + agents.bin).
usage: map_you.py OUT_DIR YOU_DIR MODE(in|out) ROUTEKEY J SPEED [fps=30] [tail_hold=1.0] [first=0] [step=1]"""
import sys, json, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, '/workspace/tmp/v2'); from rd import load
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
YD = Path(sys.argv[2]); MODE = sys.argv[3]; KEY = sys.argv[4]; J = int(sys.argv[5]); SPEED = float(sys.argv[6])
FPS = int(sys.argv[7]) if len(sys.argv) > 7 else 30; HOLD = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0
FIRST = int(sys.argv[9]) if len(sys.argv) > 9 else 0; STEP = int(sys.argv[10]) if len(sys.argv) > 10 else 1
d = json.load(open(YD / 'you.json')); T = d['tracks']; cx0, cz0 = d['center']
fr = load(str(YD / 'agents.bin'))
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
F = lambda sz: ImageFont.truetype(FONT, sz)
W, H = 1080, 1920
import os
CFG = json.loads(os.environ.get('MAPCFG', '{}'))
VX, VZ, WM = CFG.get('view', [25.0, -22.0, 124.0])   # view centre (m) and width (m)
s = W / WM; hm = H / s; X0, Z0 = VX - WM / 2, VZ - hm / 2
P = lambda x, z: ((x - X0) * s, (z - Z0) * s)
D = '/workspace/projects/ssl-claude-halloween/web3d/data/'
cache = Path('/workspace/tmp/v5_base.png')
if cache.exists(): base = Image.open(cache).convert('RGB')
else:
    pl = json.load(open(D + 'shibuya_plateau.json')); osm = json.load(open(D + 'shibuya_osm.json'))
    base = Image.new('RGB', (W, H), (9, 12, 20)); dr = ImageDraw.Draw(base)
    for r in osm['roads']:
        pts = [P(*p) for p in r['points']]
        if len(pts) > 1: dr.line(pts, fill=(30, 38, 56), width=int(max(2, 5 * s / 4.9)))
    for b in pl['buildings']:
        ring = [P(*p) for p in b['ring']]
        if len(ring) > 2: dr.polygon(ring, fill=(20, 24, 38), outline=(46, 56, 82))
    base.save(cache)
GATES = {'hachiko': ('ハチ公改札', (85.9, 18.9)), 'south': ('南改札', (96.6, 161.5)), 'shinminami': ('新南改札', (159.7, 259.3))}
# wave groups
waves = []
for g in GATES:
    ts = sorted(w['t'] for w in d['waves'] if w['gate'] == g and w['t'] > -5)
    grp = [[ts[0]]]
    for t in ts[1:]:
        if t - grp[-1][-1] > 30: grp.append([t])
        else: grp[-1].append(t)
    waves += [(x[0], g, len(x)) for x in grp]
waves.sort()
track = [(r['t'], r['w'][KEY][J]) for r in T if r['w'][KEY][J] is not None]
tS, tE = track[0][0], track[-1][0]
tx = {t: p for t, p in track}
def you_at(t):
    k = int(min(max(t, tS), tE - 1e-6)); u = t - k if tS <= t < tE else 0
    a = tx[k]; b = tx.get(k + 1, a)
    return a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
dur = (tE - tS) / SPEED; nmain = int(dur * FPS); nhold = int(HOLD * FPS); NT = nmain + nhold
CEN = tuple(CFG.get('tgt', (cx0, cz0)))
LBL = CFG.get('label', '人混みの中心'); INT = CFG.get('in_title', '端から人混みの中心へ歩く'); INR = CFG.get('in_rem', '中心まで あと'); OUTT = CFG.get('out_title', 'ここから外に出るまで'); OUTR = CFG.get('out_rem', '外縁まで あと'); ROBUST = CFG.get('robust', False)
def mmss(sec): sec = int(sec); return f'{sec//60:02d}:{sec%60:02d}'
DS = {}
for t in range(int(tS) - 4, int(tE) + 5):
    if 0 <= t < len(fr):
        yx_, yz_ = you_at(min(max(t, tS), tE)); _, ii, xx, zz = fr[t]
        DS[t] = (np.hypot(xx + cx0 - yx_, zz + cz0 - yz_) < 4).sum() / (np.pi * 16)
def dsm(ts):
    v = [DS[t] for t in range(int(ts) - 3, int(ts) + 4) if t in DS]
    return float(np.mean(v))
def draw_frame(n):
    ts = tS + min(n, nmain) / FPS * SPEED; k = int(ts); u = ts - k
    A, B = fr[k], fr[min(k + 1, len(fr) - 1)]
    Bm = {int(i): (x, z) for i, x, z in zip(B[1], B[2], B[3])}
    ids = A[1]; xa = A[2] + cx0; za = A[3] + cz0
    xb = np.array([Bm.get(int(i), (xa[j] - cx0, za[j] - cz0))[0] for j, i in enumerate(ids)]) + cx0
    zb = np.array([Bm.get(int(i), (xa[j] - cx0, za[j] - cz0))[1] for j, i in enumerate(ids)]) + cz0
    xs = xa + (xb - xa) * u; zs = za + (zb - za) * u
    # local density (3 m cells) for colouring
    H2, xe, ze = np.histogram2d(xs, zs, bins=[int(WM // 3) + 8, int(hm // 3) + 8], range=[[X0 - 12, X0 + WM + 12], [Z0 - 12, Z0 + hm + 12]])
    ix = np.clip(((xs - (X0 - 12)) / 3).astype(int), 0, H2.shape[0] - 1); iz = np.clip(((zs - (Z0 - 12)) / 3).astype(int), 0, H2.shape[1] - 1)
    dn = H2[ix, iz] / 9.0
    img = base.copy(); dr = ImageDraw.Draw(img, 'RGBA')
    m = (xs > X0 - 2) & (xs < X0 + WM + 2) & (zs > Z0 - 2) & (zs < Z0 + hm + 2)
    r0 = 0.38 * s
    for x, z, dd in zip(xs[m], zs[m], dn[m]):
        px, pz = P(x, z)
        if dd < 1.0: c = (90, 210, 255, 220)
        elif dd < 2.0: c = (255, 214, 90, 235)
        elif dd < 3.0: c = (255, 140, 50, 245)
        else: c = (255, 60, 60, 255)
        dr.ellipse([px - r0, pz - r0, px + r0, pz + r0], fill=c)
    # gates / pulses
    for (tw, g, nn) in waves:
        if 0 <= ts - tw < 6:
            a = (ts - tw) / 6; lab, (gx, gz) = GATES[g]
            px, pz = P(gx, gz); px = min(max(px, 40), W - 40); pz = min(max(pz, 400), H - 400)
            for q in range(3):
                rr = 40 + 260 * ((a + q / 3) % 1); al = int(200 * (1 - ((a + q / 3) % 1)))
                dr.ellipse([px - rr, pz - rr, px + rr, pz + rr], outline=(255, 90, 90, al), width=6)
    # trail + you
    tt = np.arange(tS, ts, 1.0); tr = [P(*tx[int(t)][:2]) for t in tt if int(t) in tx] + [P(*you_at(ts))]
    if len(tr) > 1: dr.line(tr, fill=(255, 255, 255, 200), width=6)
    yx, yz = you_at(ts); ypx, ypz = P(yx, yz)
    pul = (n / FPS) % 1.2 / 1.2
    rr = 26 + 50 * pul; dr.ellipse([ypx - rr, ypz - rr, ypx + rr, ypz + rr], outline=(255, 255, 255, int(220 * (1 - pul))), width=5)
    dr.ellipse([ypx - 20, ypz - 20, ypx + 20, ypz + 20], fill=(255, 255, 255, 255), outline=(255, 70, 70, 255), width=8)
    f = F(44); lab = 'あなた'; tw_ = dr.textlength(lab, font=f)
    dr.rounded_rectangle([ypx + 34, ypz - 36, ypx + 34 + tw_ + 28, ypz + 24], 14, fill=(255, 70, 70, 240)); dr.text((ypx + 48, ypz - 34), lab, font=f, fill='white')
    # centre target
    cpx, cpz = P(*CEN)
    if MODE == 'in':
        dr.ellipse([cpx - 34, cpz - 34, cpx + 34, cpz + 34], outline=(255, 255, 255, 230), width=4)
        dr.text((cpx + 44, cpz - 28), LBL, font=F(40), fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0, 255))
    # density around you (4 m)
    dyv = dsm(ts)
    # HUD top
    pn = Image.new('RGBA', (W, 430), (0, 0, 0, 0)); pd = ImageDraw.Draw(pn)
    pd.rounded_rectangle([30, 40, W - 30, 410], 36, fill=(6, 8, 14, 225), outline=(255, 255, 255, 60), width=2)
    el = min(n, nmain) / FPS * SPEED
    pd.text((70, 58), '経過時間', font=F(36), fill=(170, 180, 200, 255)); pd.text((70, 100), mmss(el), font=F(112), fill='white')
    pd.text((70, 238), f'シミュレーション ×{int(SPEED)}倍速', font=F(30), fill=(150, 160, 180, 255))
    pd.text((420, 58), '周囲260m四方の人数', font=F(34), fill=(170, 180, 200, 255)); pd.text((420, 98), f'{len(ids):,}人', font=F(78), fill='white')
    pd.text((420, 214), 'あなたの周囲4mの密度', font=F(34), fill=(170, 180, 200, 255))
    col = (90, 210, 255) if dyv < 1 else (255, 214, 90) if dyv < 2 else (255, 140, 50) if dyv < 3 else (255, 60, 60)
    pd.text((420, 252), f'{dyv:.1f}', font=F(90), fill=col + (255,)); pd.text((420 + pd.textlength(f'{dyv:.1f}', font=F(90)) + 12, 298), '人/㎡', font=F(42), fill=col + (255,))
    bw = W - 70 - 700; pd.rounded_rectangle([700, 262, 700 + bw, 292], 14, fill=(40, 46, 62, 255)); pd.rounded_rectangle([700, 262, 700 + max(14, bw * min(dyv / 4, 1)), 292], 14, fill=col + (255,))
    pd.text((700, 300), '4人/㎡ 超で身動きが取れない', font=F(26), fill=(150, 160, 180, 255))
    img.paste(pn, (0, 0), pn)
    dr = ImageDraw.Draw(img, 'RGBA')
    # train toast
    for (tw, g, nn) in waves:
        if 0 <= ts - tw < 7:
            a = (ts - tw) / 7; al = int(255 * min(1, (1 - a) * 3, a * 12 + .2))
            lab = f'電車到着 +{nn}人'; f = F(80); tw_ = dr.textlength(lab, font=f)
            y = 470 + int(10 * a)
            dr.rounded_rectangle([W / 2 - tw_ / 2 - 40, y, W / 2 + tw_ / 2 + 40, y + 170], 30, fill=(200, 30, 40, int(235 * al / 255)))
            dr.text((W / 2 - tw_ / 2, y + 8), lab, font=f, fill=(255, 255, 255, al)); dr.text((W / 2 - dr.textlength(GATES[g][0] + 'から降車', font=F(40)) / 2, y + 108), GATES[g][0] + 'から降車', font=F(40), fill=(255, 235, 235, al))
    # bottom status
    rem = np.hypot(yx - cx0, yz - cz0)
    if MODE == 'in':
        st = f'{INR} {int(rem)} m'
        pn2 = Image.new('RGBA', (W, 260), (0, 0, 0, 0)); p2 = ImageDraw.Draw(pn2); p2.rounded_rectangle([30, 20, W - 30, 230], 36, fill=(6, 8, 14, 225), outline=(255, 255, 255, 60), width=2)
        p2.text((70, 40), INT, font=F(46), fill=(255, 255, 255, 255)); p2.text((70, 112), st, font=F(76), fill=(255, 214, 90, 255))
        img.paste(pn2, (0, H - 280), pn2)
    else:
        done = n >= nmain
        pn2 = Image.new('RGBA', (W, 520), (0, 0, 0, 0)); p2 = ImageDraw.Draw(pn2); p2.rounded_rectangle([30, 20, W - 30, 500], 36, fill=(6, 8, 14, 235), outline=(255, 90, 90, 200), width=4)
        p2.text((70, 38), OUTT, font=F(54), fill=(255, 255, 255, 255))
        p2.text((70, 108), '約' + OUTTXT, font=F(150), fill=(255, 90, 90, 255))
        p2.text((70, 296), (f'（シミュレーション{OUTN}回の中央値。多くは{OUTMIN}〜{OUTMAX}）' if ROBUST else f'（シミュレーション{OUTN}回の中央値。最短{OUTMIN}〜最長{OUTMAX}）'), font=F(32), fill=(190, 200, 220, 255))
        p2.text((70, 346), OUTR + ' ' + (f'{int(np.hypot(yx - OUTTGT[0], yz - OUTTGT[1]))} m' if not done else '0 m（脱出）'), font=F(52), fill=(255, 214, 90, 255))
        p2.text((70, 420), f'この1人の実測：{mmss(el)}' + ('　←脱出まで' if done else ''), font=F(46), fill=(255, 255, 255, 255))
        img.paste(pn2, (0, H - 540), pn2)
    return img
# measured exit-time stats of all 24 walkers on this route (from the same run)
durs = sorted((lambda ts: ts[-1] - ts[0])([r['t'] for r in T if r['w'][KEY][j] is not None]) for j in range(24))
med = (durs[11] + durs[12]) / 2
def jp(sec): sec = int(round(sec)); return f'{sec//60}分{sec%60:02d}秒'
OUTTXT = jp(round(med / 5) * 5) if med < 600 else f'{med/3600:.1f}時間'; OUTN = len(durs); OUTMIN = jp(durs[2] if ROBUST else durs[0]); OUTMAX = jp(durs[-3] if ROBUST else durs[-1])
OUTTGT = track[-1][1][:2]
print('route', KEY, 'median', med, OUTTXT, OUTMIN, OUTMAX, 'frames', NT, 'tS', tS, 'tE', tE, flush=True)
if STEP == 0: sys.exit()
for n in range(FIRST, NT, STEP):
    draw_frame(n).save(out / f'f{n:04d}.png')
