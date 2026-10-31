#!/usr/bin/env python3
"""science-sim-v2: Shibuya-Halloween crowd-crush short built from the finished photoreal plates (ken-burns + captions).
usage: v2_build.py CONFIG_NAME [OUTDIR]   (configs below).  Frames are piped to ffmpeg; audio = bed14.wav (-14 LUFS, non-IP synth bed from v1).
Rules: no game UI/characters/ghost/route-guessing, one stat only (fd.json 0.189/1.055 = 17.9% -> 「2割以下」), 「シミュレーション」 tag, PLATEAU/OSM credit."""
import sys, math, subprocess, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
G = '/workspace/demos/halloween-escape-series/grounded-refs/'
P = '/workspace/projects/logs/ssl-claude-halloween/v11-en/render/plates/'
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
if not os.path.exists(FONT): FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
def font(sz): return ImageFont.truetype(FONT, sz, index=0)

STAT = ['シミュレーション上は', '歩く速さが2割以下に']
CLOSE = '当日は警察・係員の指示に従ってください'
TAG = 'シミュレーションにもとづくイメージ映像'
CREDIT = ['人流：独自シミュレーション（人出48,000人を想定）', '地図：国土交通省 PLATEAU / © OpenStreetMap contributors', '映像はAI生成のイメージです']

CONFIGS = {
 'scramble': dict(out='ja-science-sim-v2-scramble.mp4', total=27.5, shots=[
   # img, t0, t1, zoom0, zoom1, cx0,cy0 -> cx1,cy1 (fractions), sway amp (px in output), caption
   dict(img=G+'v2/05-scramble.png', t0=0, t1=5.6, z=(1.0, 1.10), c=((.5,.5),(.55,.52)), sway=6),
   dict(img=G+'05-scramble.png',    t0=5.0, t1=12.0, z=(1.0, 1.28), c=((.5,.5),(.55,.62)), sway=5),
   dict(img=P+'crush3.png',         t0=11.4, t1=27.5, z=(1.0, 1.22), c=((.5,.5),(.5,.55)), sway=7, freeze_at=17.0),
 ], caps=[
   (-0.4, 5.2, '人が、ふえていく', 'ハロウィーンの夜'),
   (-0.4, 5.2, '渋谷スクランブル交差点', None, 300, 74),
   (6.0, 11.4, 'すき間が、消えていく', None),
   (12.4, 17.6, 'そして、動けなくなる', '満員電車のような密度'),
 ], stat=(19.2, 23.6), close=(23.6, 27.5), dim=(19.0, 23.6)),
}

def smooth(a): return a*a*(3-2*a)

def view(img, z, cx, cy, ox=0, oy=0, rot=0):
    iw, ih = img.size
    s0 = max(W/iw, H/ih)
    s = s0*z
    vw, vh = W/s, H/s
    cxp = min(max(cx*iw, vw/2), iw-vw/2) + ox/s
    cyp = min(max(cy*ih, vh/2), ih-vh/2) + oy/s
    a = 1/s
    return img.transform((W, H), Image.AFFINE, (a, 0, cxp-vw/2, 0, a, cyp-vh/2), resample=Image.BICUBIC)

def text_layer(lines, sizes, y, color=(255,255,255), band=True, align='c'):
    """RGBA layer with centred text lines + soft dark band behind."""
    L = Image.new('RGBA', (W, H), (0,0,0,0)); d = ImageDraw.Draw(L)
    fs = [font(s) for s in sizes]
    hs = [f.getbbox('あ')[3]+int(s*0.35) for f, s in zip(fs, sizes)]
    tot = sum(hs); 
    if band:
        B = Image.new('L', (W, H), 0); bd = ImageDraw.Draw(B)
        bd.rectangle((0, y-40, W, y+tot+40), fill=165)
        B = B.filter(ImageFilter.GaussianBlur(40))
        L.paste(Image.new('RGBA', (W, H), (0,0,0,255)), (0,0), B)
    yy = y
    for t, f, h in zip(lines, fs, hs):
        w = d.textlength(t, font=f)
        d.text(((W-w)/2, yy), t, font=f, fill=color+(255,), stroke_width=max(3, f.size//16), stroke_fill=(0,0,0,255))
        yy += h
    return L

def fit(text, size, maxw=W-140):
    f = font(size)
    while f.getlength(text) > maxw and size > 30:
        size -= 2; f = font(size)
    return size

def main():
    name = sys.argv[1]; cfg = CONFIGS[name]
    outdir = sys.argv[2] if len(sys.argv) > 2 else '/workspace/demos/halloween-escape-series/science-sim-v2'
    os.makedirs(outdir, exist_ok=True)
    T = cfg['total']; N = int(round(T*FPS))
    imgs = {s['img']: Image.open(s['img']).convert('RGB') for s in cfg['shots']}
    # layers
    caps = []
    for c in cfg['caps']:
        t0, t1, big, small = c[:4]; cy = c[4] if len(c) > 4 else 1180; cs = c[5] if len(c) > 5 else 84
        lines = [big] + ([small] if small else []); sizes = [fit(big, cs)] + ([fit(small, 44)] if small else [])
        caps.append((t0, t1, text_layer(lines, sizes, cy)))
    s1 = fit(STAT[0], 70); s2 = fit(STAT[1], 92)
    stat_l = text_layer(STAT, [s1, s2], 800, color=(255,214,102), band=False)
    close_l = text_layer(['当日は警察・係員の', '指示に従ってください'], [70, 70], 800, band=False)
    # static overlays
    st = Image.new('RGBA', (W, H), (0,0,0,0)); d = ImageDraw.Draw(st)
    f = font(34); tw = d.textlength(TAG, font=f)
    d.rounded_rectangle(((W-tw)/2-26, 150, (W+tw)/2+26, 150+64), 14, fill=(0,0,0,150))
    d.text(((W-tw)/2, 158), TAG, font=f, fill=(255,255,255,235))
    cr = Image.new('RGBA', (W, H), (0,0,0,0)); d = ImageDraw.Draw(cr); f = font(27); y = 1545
    for t in CREDIT:
        w = d.textlength(t, font=f); d.text(((W-w)/2, y), t, font=f, fill=(255,255,255,215), stroke_width=2, stroke_fill=(0,0,0,255)); y += 40
    # vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    vig = 1 - 0.55*np.clip(((xx-W/2)/(W*0.75))**2 + ((yy-H/2)/(H*0.7))**2, 0, 1)
    vig = vig[..., None]
    rng = np.random.default_rng(7)
    ff = subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
                           '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-profile:v','high', os.path.join(outdir, name+'_silent.mp4')], stdin=subprocess.PIPE)
    freeze_frames = {}
    def shot_frame(s, t):
        u = (t - s['t0'])/(s['t1']-s['t0']); u = min(max(u, 0), 1)
        tt = t
        fz = s.get('freeze_at')
        amp = s['sway']
        if fz is not None and t > fz:
            tt = fz; u = (fz - s['t0'])/(s['t1']-s['t0'])
            amp = 0
        elif fz is not None:
            amp = s['sway']*(1 - smooth(min(1, max(0, (t-(fz-3.5))/3.5))))   # jostle dies down as it packs
        e = smooth(u) if fz is None else u**0.8
        z = s['z'][0] + (s['z'][1]-s['z'][0])*e
        cx = s['c'][0][0] + (s['c'][1][0]-s['c'][0][0])*e; cy = s['c'][0][1] + (s['c'][1][1]-s['c'][0][1])*e
        ox = amp*math.sin(2*math.pi*0.9*tt) + amp*0.4*math.sin(2*math.pi*2.3*tt+1)
        oy = amp*0.8*math.sin(2*math.pi*1.8*tt+0.5)
        return view(imgs[s['img']], z, cx, cy, ox, oy)
    for i in range(N):
        t = i/FPS
        frame = None
        for s in cfg['shots']:
            if s['t0'] <= t <= s['t1']:
                fr = np.asarray(shot_frame(s, t)).astype(np.float32)
                a = 1.0
                if t < s['t0']+0.6 and s['t0'] > 0: a = smooth((t-s['t0'])/0.6)
                frame = fr if frame is None else frame*(1-a) + fr*a
        # crowd darkening / desaturation as it packs (shot 3 freeze)
        fz = [s.get('freeze_at') for s in cfg['shots'] if s.get('freeze_at')]
        k = 0.0
        if fz: k = smooth(min(1, max(0, (t-(fz[0]-4))/6)))
        if k > 0:
            g = frame.mean(axis=2, keepdims=True)
            frame = frame*(1-0.35*k) + g*0.35*k
            frame = frame*np.array([1-0.10*k, 1-0.02*k, 1+0.06*k], dtype=np.float32)
        dim_lo, dim_hi = cfg['dim']
        dm = smooth(min(1, max(0, (t-dim_lo)/0.8)))
        frame = frame*(1-0.55*dm)
        frame = frame*vig + rng.normal(0, 3.0, frame.shape[:2])[..., None]
        im = Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8)).convert('RGBA')
        im.alpha_composite(st)
        if t > 0.2: im.alpha_composite(cr)
        def put(layer, t0, t1, fi=0.4, fo=0.4):
            a = min(1, (t-t0)/fi, (t1-t)/fo)
            if a <= 0: return
            l = layer if a >= 1 else Image.merge('RGBA', (*layer.split()[:3], layer.split()[3].point(lambda p: int(p*a))))
            im.alpha_composite(l)
        for (t0, t1, L) in caps: put(L, t0, t1)
        put(stat_l, *cfg['stat'], fi=0.7, fo=0.3)
        put(close_l, *cfg['close'], fi=0.6, fo=0.5)
        ff.stdin.write(im.convert('RGB').tobytes())
        if i % 60 == 0: print('frame', i, '/', N, flush=True)
    ff.stdin.close(); ff.wait()

if __name__ == '__main__': main()
