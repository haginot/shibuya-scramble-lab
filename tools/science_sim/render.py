#!/usr/bin/env python3
"""science-sim-v1 step 2: render the 1080x1920 / 30 fps / 30 s figure-style frames (white background, Zen Kaku Gothic New OFL).
usage: render.py WORKDIR [frame ...]   (no frames = all 900, multiprocessing).  Output: WORKDIR/frames/f%04d.png
Every number drawn is read from prep.npz / fd.json / scalars.json (see docs/SCIENCE-SIM-V1.md)."""
import json, sys, os, math, numpy as np
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK = sys.argv[1]
FPS, NF = 30, 900
W_, H_ = 1080, 1920
FB = R + '/web3d/fonts/ZenKakuGothicNew-Bold.ttf'; FM = R + '/web3d/fonts/ZenKakuGothicNew-Medium.ttf'
_fc = {}
def font(sz, bold=True):
    k = (sz, bold)
    if k not in _fc: _fc[k] = ImageFont.truetype(FB if bold else FM, sz)
    return _fc[k]
BG = (255, 255, 255); INK = (17, 20, 28); GRAY = (96, 102, 112); LIGHT = (214, 217, 223); RED = (198, 40, 40); NAVY = (27, 42, 73)
# density colour map (white-yellow -> orange -> red -> dark purple), the same on the map, the colour bar and the x-axis strip
CM = [(0, (255, 247, 188)), (1, (254, 196, 79)), (2, (244, 109, 67)), (3, (215, 25, 28)), (4, (103, 0, 60))]
def cmap(v):
    v = np.clip(v, 0, 4); out = np.zeros(v.shape + (3,), np.float32)
    for (a, ca), (b, cb) in zip(CM[:-1], CM[1:]):
        m = (v >= a) & (v <= b); t = ((v - a) / (b - a))[..., None]
        out = np.where(m[..., None], np.array(ca) + (np.array(cb) - np.array(ca)) * t, out)
    return out
D = np.load(WORK + '/prep.npz'); RHO = D['rho']; TT = D['t']; AREA = D['area']; OFF = D['off']
IDS, CX, CZ = D['ids'], D['cx'], D['cz']; X0M, Z0M, CELL, NX, NZ = [float(v) for v in D['win']]
NX, NZ = int(NX), int(NZ)
FD = json.load(open(WORK + '/fd.json'))['bins']; SC = json.load(open(WORK + '/scalars.json'))
AGENTS = SC['agents']
# ---------------- map geometry
MX, MY, MS = 150, 450, 810            # map box (px)
PXM = MS / (NX * CELL)               # px per metre
def mp(x, z): return MX + (x - X0M) * PXM, MY + (z - Z0M) * PXM
def ease(t): t = max(0., min(1., t)); return t * t * (3 - 2 * t)
def clamp01(t): return max(0., min(1., t))

def base_map():
    p = WORK + '/base_map.png'
    if os.path.exists(p): return Image.open(p).convert('RGB')
    P = json.load(open(R + '/web3d/data/shibuya_plateau.json'))
    S = 3; im = Image.new('RGB', (MS * S, MS * S), (255, 255, 255)); dr = ImageDraw.Draw(im)
    for b in P['buildings']:
        pts = [((x - X0M) * PXM * S, (z - Z0M) * PXM * S) for x, z in b['ring']]
        if max(q[0] for q in pts) < 0 or min(q[0] for q in pts) > MS * S or max(q[1] for q in pts) < 0 or min(q[1] for q in pts) > MS * S: continue
        dr.polygon(pts, fill=(205, 209, 217), outline=(170, 175, 186))
    im = im.resize((MS, MS), Image.LANCZOS); im.save(p); return im
BASE = None
def heat_layer(rho, alpha=1.0):
    rgb = cmap(rho); a = np.clip((rho - 0.2) / 0.6, 0, 1) * 0.95 * alpha
    arr = np.dstack([rgb, a * 255]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA').resize((MS, MS), Image.BILINEAR)
def rho_at(t):
    k = int(max(0, min(len(RHO) - 1, round(t)))); return RHO[k], k
def crowd_at(t):
    """positions of the 1/12 crowd sample at solver time t (interpolated per agent id between per-second keyframes)"""
    k = int(max(0, min(len(RHO) - 2, math.floor(t)))); u = t - k
    a0, a1 = OFF[k], OFF[k + 1]; b0, b1 = OFF[k + 1], OFF[k + 2]
    ia, ib = IDS[a0:a1], IDS[b0:b1]
    pos = {int(i): (CX[a0 + j], CZ[a0 + j]) for j, i in enumerate(ia)}
    out = []
    for j, i in enumerate(ib):
        p = pos.get(int(i))
        if p is None: continue
        out.append((p[0] + (CX[b0 + j] - p[0]) * u, p[1] + (CZ[b0 + j] - p[1]) * u))
    return out
def dots_layer(pts, color=NAVY, alpha=1.0, r=2.6):
    S = 2; L = Image.new('RGBA', (MS * S, MS * S), (0, 0, 0, 0)); dr = ImageDraw.Draw(L)
    for x, z in pts:
        px, py = (x - X0M) * PXM * S, (z - Z0M) * PXM * S
        if 0 <= px < MS * S and 0 <= py < MS * S: dr.ellipse([px - r * S, py - r * S, px + r * S, py + r * S], fill=color + (int(255 * alpha),))
    return L.resize((MS, MS), Image.LANCZOS)

# ---------------- text helpers
def text(d, xy, s, f, fill=INK, anchor='la'): d.text(xy, s, font=f, fill=fill, anchor=anchor)
def wrap(d, s, f, width):
    lines, cur = [], ''
    for ch in s:
        if ch == '\n': lines.append(cur); cur = ''; continue
        if d.textlength(cur + ch, font=f) > width: lines.append(cur); cur = ch
        else: cur += ch
    if cur: lines.append(cur)
    return lines
def paragraph(d, x, y, s, f, width, fill=INK, lh=1.4):
    for ln in wrap(d, s, f, width): d.text((x, y), ln, font=f, fill=fill); y += int(f.size * lh)
    return y
def rot_text(im, cx, cy, s, f, fill=INK):
    tmp = Image.new('RGBA', (900, 80), (0, 0, 0, 0)); d = ImageDraw.Draw(tmp); d.text((450, 40), s, font=f, fill=fill + (255,), anchor='mm')
    tmp = tmp.rotate(90, expand=True); im.alpha_composite(tmp, (int(cx - tmp.width / 2), int(cy - tmp.height / 2)))
def tag(d):
    f = font(38); s = 'シミュレーション'; w = d.textlength(s, font=f)
    d.rounded_rectangle([60, 118, 60 + w + 40, 176], 10, outline=RED, width=4); d.text((80, 147), s, font=f, fill=RED, anchor='lm')
def fmt1(v): return f'{v:.1f}'

# ---------------- map figure (scenes 1 and 2)
HOT = [  # anchor (model x, z of the cell centre), label box top-left (px)  -- cells picked from the time-mean density of plan-frames (prep.npz)
 dict(x=65.5, z=17.5, box=(745, 575)), dict(x=74.5, z=53.5, box=(745, 745)),
 dict(x=74.5, z=161.5, box=(745, 1040)), dict(x=-39.5, z=14.5, box=(165, 575))]
def cell_rc(x, z): return int((z - Z0M) // CELL), int((x - X0M) // CELL)
def hot_value(rho, h):
    r, c = cell_rc(h['x'], h['z']); return float(rho[max(0, r - 2):r + 3, max(0, c - 2):c + 3].max())
def axes_map(im, d):
    d.rectangle([MX, MY, MX + MS, MY + MS], outline=INK, width=3)
    ft = font(30, False)
    for v in (0, 50, 100, 150):
        x, _ = mp(v, 0); d.line([x, MY + MS, x, MY + MS + 10], fill=INK, width=3); d.text((x, MY + MS + 14), str(v), font=ft, fill=INK, anchor='ma')
    for v in (0, 50, 100, 150):
        _, y = mp(0, v); d.line([MX - 10, y, MX, y], fill=INK, width=3); d.text((MX - 16, y), str(v), font=ft, fill=INK, anchor='rm')
    d.text((MX + MS, MY + MS + 14), 'x [m]', font=font(32, False), fill=INK, anchor='ra')
    rot_text(im, 52, MY + MS / 2, 'z [m]', font(32, False))
def colorbar(d, im, y):
    d.text((MX, y - 8), '密度 [人/㎡]（3m四方の区画）', font=font(34, False), fill=INK, anchor='ls')
    n = MS; v = np.linspace(0, 4, n)[None, :].repeat(34, 0)
    bar = Image.fromarray(cmap(v).astype(np.uint8), 'RGB'); im.paste(bar, (MX, y)); d.rectangle([MX, y, MX + MS, y + 34], outline=INK, width=2)
    for k in range(5):
        x = MX + MS * k / 4; d.line([x, y + 34, x, y + 44], fill=INK, width=3)
        d.text((x, y + 48), str(k), font=font(32, False), fill=INK, anchor='ma' if k not in (4,) else 'ra')
    d.text((MX + MS, y + 84), '4＝モデルの上限', font=font(30, False), fill=GRAY, anchor='ra')
def scene_map(f):
    """f = frame 0..449 (hook 0-59, timelapse 60-449)"""
    global BASE
    if BASE is None: BASE = base_map()
    im = Image.new('RGBA', (W_, H_), BG + (255,)); d = ImageDraw.Draw(im); tag(d)
    hook = f < 60
    if hook:
        ts = f / 30 * 2.0; rho, k = rho_at(ts); heat = ease((f / 30 - 0.15) / 1.2)
        title = ['渋谷に%s人、' % format(AGENTS, ','), 'どこが詰まる？']; fs = 92
    else:
        ts = (f - 60) / 389 * (len(RHO) - 1); rho, k = rho_at(ts); heat = 1.0
        title = ['混み具合の変化', '（15分間・シミュレーション）']; fs = 64
    y = 205
    for ln in title:
        d.text((60, y), ln, font=font(fs), fill=INK); y += int(fs * 1.18)
    # map
    m = Image.new('RGBA', (MS, MS), (255, 255, 255, 255))
    m.alpha_composite(heat_layer(rho, heat)); m.alpha_composite(BASE.convert('RGBA'))
    # buildings are drawn over the heat (only street cells show it); re-draw the heat on streets: BASE is opaque -> keep heat visible by masking
    # (white pixels of BASE are streets: composite heat again through that mask)
    bm = np.array(BASE.convert('RGB')); street = (bm.sum(2) >= 760).astype(np.uint8) * 255
    hl = heat_layer(rho, heat); hl_a = np.array(hl)[..., 3] * (street / 255.0)
    hh = np.array(hl); hh[..., 3] = hl_a.astype(np.uint8)
    m = BASE.convert('RGBA'); m.alpha_composite(Image.fromarray(hh, 'RGBA'))
    pts = crowd_at(ts if hook else float(k))
    m.alpha_composite(dots_layer(pts, NAVY, 0.9 if hook else 0.55, 3.4 if hook else 2.4))
    im.alpha_composite(m, (MX, MY)); d = ImageDraw.Draw(im); axes_map(im, d); colorbar(d, im, 1372)
    if not hook:
        # labelled red spots (value = densest 3 m cell within 2 cells of the anchor, this keyframe)
        for i, h in enumerate(HOT):
            show = ease((f - 60 - 25 - i * 14) / 14)
            if show <= 0: continue
            v = hot_value(rho, h); ax, ay = mp(h['x'], h['z']); bx, by = h['box']; bw, bh = 200, 92
            col = tuple(int(c) for c in cmap(np.array(v))); col = tuple(int(c * 0.78) for c in col)
            d.line([ax, ay, bx + (0 if bx > ax else bw), by + bh / 2], fill=INK, width=3)
            d.ellipse([ax - 14, ay - 14, ax + 14, ay + 14], outline=INK, width=4)
            d.rounded_rectangle([bx, by, bx + bw, by + bh], 12, fill=(255, 255, 255), outline=col, width=5)
            d.text((bx + 14, by + bh / 2 + 4), fmt1(v), font=font(58), fill=col, anchor='lm')
            d.text((bx + bw - 12, by + bh / 2 + 14), '人/㎡', font=font(30), fill=INK, anchor='rm')
        n3 = int((rho >= 3).sum()); tsec = int(round(TT[k]))
        d.text((MX, 1530), 'シミュレーション経過 %02d:%02d' % (tsec // 60, tsec % 60), font=font(46, False), fill=INK)
        d.text((MX, 1596), '3人/㎡以上の区画：', font=font(46, False), fill=INK); wlab = d.textlength('3人/㎡以上の区画：', font=font(46, False))
        d.text((MX + wlab, 1590), str(n3), font=font(60), fill=RED); d.text((MX + wlab + d.textlength(str(n3), font=font(60)) + 10, 1596), '個', font=font(46, False), fill=INK)
    else:
        d.text((MX, 1530), '濃い点＝人（一部を抽出して表示）', font=font(42, False), fill=INK)
    return im.convert('RGB')

# ---------------- fundamental diagram (scene 3)
CX0, CX1, CY0, CY1 = 200, 960, 480, 1240   # chart box
XMAX, YMAX = 4.5, 1.2
def cp(rho, v): return CX0 + rho / XMAX * (CX1 - CX0), CY1 - v / YMAX * (CY1 - CY0)
def scene_fd(f):  # f = 0..299 within the scene
    im = Image.new('RGBA', (W_, H_), BG + (255,)); d = ImageDraw.Draw(im); tag(d)
    d.text((60, 205), '密度が上がると、', font=font(72), fill=INK); d.text((60, 295), '歩く速さは？', font=font(72), fill=INK)
    d.rectangle([CX0, CY0, CX1, CY1], outline=INK, width=3)
    ft = font(32, False)
    for v in (0, 0.5, 1.0):
        x, y = cp(0, v); d.line([CX0 - 10, y, CX0, y], fill=INK, width=3); d.text((CX0 - 16, y), '%.1f' % v, font=ft, fill=INK, anchor='rm')
        if v: d.line([CX0, y, CX1, y], fill=(228, 230, 235), width=2)
    rot_text(im, 62, (CY0 + CY1) / 2, '平均の歩く速さ [m/s]', font(34, False))
    # x axis with the density colour strip
    n = CX1 - CX0; v = np.linspace(0, XMAX, n)[None, :].repeat(26, 0); strip = Image.fromarray(cmap(np.minimum(v, 4)).astype(np.uint8), 'RGB')
    im.paste(strip, (CX0, CY1 + 2)); d.rectangle([CX0, CY1 + 2, CX1, CY1 + 28], outline=INK, width=2)
    for k in range(5):
        x, _ = cp(k, 0); d.line([x, CY1 + 28, x, CY1 + 38], fill=INK, width=3); d.text((x, CY1 + 42), str(k), font=ft, fill=INK, anchor='ma')
    d.text(((CX0 + CX1) / 2, CY1 + 88), '密度 [人/㎡]（3m四方の区画）', font=font(34, False), fill=INK, anchor='ma')
    # cap line
    xc, _ = cp(4.0, 0); d.line([xc, CY0, xc, CY1], fill=GRAY, width=2); d.text((xc - 8, CY0 + 6), '上限4', font=font(30, False), fill=GRAY, anchor='ra')
    # data
    pts = [(b['rho_mid'], b['mean_speed']) for b in FD]
    free = FD[0]['mean_speed']; cap_v = FD[-1]['mean_speed']
    prog = ease((f / 30 - 0.4) / 4.2) * 4.0   # reveal up to rho = prog (15.4 s .. 19.6 s)
    vis = [(r, s) for r, s in pts if r <= prog + 1e-9]
    # partial segment
    segs = list(vis)
    nxt = [p for p in pts if p[0] > prog + 1e-9]
    if nxt and vis:
        a, b = vis[-1], nxt[0]; u = (prog - a[0]) / (b[0] - a[0]); segs.append((prog, a[1] + (b[1] - a[1]) * u))
    if len(segs) > 1: d.line([cp(*p) for p in segs], fill=NAVY, width=7, joint='curve')
    for r, s in vis:
        x, y = cp(r, s); last = (r == 4.0)
        d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(RED if last else NAVY), outline=(255, 255, 255), width=3)
    # reference + callouts
    if f / 30 > 1.0:
        _, yf = cp(0, free); d.line([CX0, yf, CX1, yf], fill=GRAY, width=2)
        d.text((CX0 + 14, yf - 12), '空いた所 %.2f m/s' % free, font=font(34), fill=GRAY, anchor='ls')
    t2 = f / 30 - 4.8
    if t2 > 0:
        a = ease(t2 / 0.6); x, y = cp(4.0, cap_v)
        r = 24 + 8 * math.sin(f / 30 * 6) * a
        d.ellipse([x - r, y - r, x + r, y + r], outline=RED, width=5)
        bx, by, bw, bh = 215, 1040, 440, 150
        ov = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        od.rounded_rectangle([bx, by, bx + bw, by + bh], 14, fill=(255, 255, 255, int(255 * a)), outline=RED + (int(255 * a),), width=5)
        od.line([bx + bw, by + bh * 0.55, x - r, y], fill=RED + (int(255 * a),), width=4)
        od.text((bx + 22, by + 24), '4人/㎡で', font=font(40, False), fill=INK + (int(255 * a),)); od.text((bx + 22, by + 72), '秒速%.2fm' % cap_v, font=font(60), fill=RED + (int(255 * a),))
        im.alpha_composite(ov); d = ImageDraw.Draw(im)
    t3 = f / 30 - 5.6
    if t3 > 0:
        a = ease(t3 / 0.6)
        ov = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        od.text((60, 1490), '空いた所の約%d％まで低下。' % round(cap_v / free * 100), font=font(56, False), fill=INK + (int(255 * a),))
        od.text((60, 1568), 'ほぼ止まる。', font=font(84), fill=RED + (int(255 * a),))
        im.alpha_composite(ov)
    return im.convert('RGB')

# ---------------- assumptions card (scene 4)
def scene_card(f):
    im = Image.new('RGBA', (W_, H_), BG + (255,)); d = ImageDraw.Draw(im); tag(d)
    a = ease(f / 12.)
    d.text((60, 205), '前提とモデル', font=font(70), fill=INK)
    f1, f2 = font(40, False), font(40); W = 960
    y = 320
    items = [('モデル', ['社会力モデル（歩行者が互いに', '避け合う）による人流シミュレーション', '1㎡あたり上限4人／スクランブル信号あり']),
             ('仮定', ['人出%s人／ピーク時（22時ごろ想定）' % format(AGENTS, ','), 'ハチ公改札前は入場規制を仮定']),
             ('範囲', ['渋谷駅周辺 %d×%dm（図は240m四方）' % (SC['grid']['w'] * SC['grid']['cell'], SC['grid']['h'] * SC['grid']['cell'])]),
             ('速さ', ['抽出した人の1秒ごとの移動量の平均', '（待機中の人も含む）'])]
    for k, lines in items:
        d.text((60, y), k, font=f2, fill=GRAY)
        for ln in lines: d.text((220, y), ln, font=f1, fill=INK); y += 56
        y += 22
    y += 20; d.line([60, y, 1020, y], fill=LIGHT, width=3); y += 36
    y = paragraph(d, 60, y, 'シミュレーションです。\n当日は警察・係員の\n指示に従ってください', font(64), W, RED, 1.35) + 30
    paragraph(d, 60, y + 14, '建物：国土交通省 Project PLATEAU（渋谷区 2023）を加工\n道路：© OpenStreetMap contributors を加工', font(32, False), W, GRAY, 1.45)
    return im.convert('RGB')

def frame(f):
    if f < 450: return scene_map(f)
    if f < 750: return scene_fd(f - 450)
    return scene_card(f - 750)
def final(f):
    X = 12
    if 450 - X <= f < 450 + X:   # 2 -> 3 cross-fade
        a = (f - (450 - X)) / (2 * X); return Image.blend(scene_map(min(f, 449)), scene_fd(max(0, f - 450)), ease(a))
    if 750 - X <= f < 750 + X:
        a = (f - (750 - X)) / (2 * X); return Image.blend(scene_fd(min(f - 450, 299)), scene_card(max(0, f - 750)), ease(a))
    return frame(f)
def job(f):
    final(f).save(f'{WORK}/frames/f{f:04d}.png', compress_level=1); return f
if __name__ == '__main__':
    os.makedirs(WORK + '/frames', exist_ok=True); base_map()
    fr = [int(a) for a in sys.argv[2:]] or list(range(NF))
    if len(fr) <= 6:
        for f in fr: job(f)
    else:
        with Pool(6) as p:
            for i, _ in enumerate(p.imap_unordered(job, fr, chunksize=4)):
                if i % 100 == 0: print(i, flush=True)
