#!/usr/bin/env python3
"""science-sim-v3: composite rendered sim frames (v2_render.py) + ONE small caption line + stat + end card, mux with the non-IP synth bed.
usage: v3_build.py FRAMES_DIR OUT.mp4 [--nframes N] [--card 3.0] [--stat-in S] [--stat-out S] [--fps 30] [--audio WAV]"""
import argparse, subprocess, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1080, 1920
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(sz): return ImageFont.truetype(FONT, sz, index=0)
CAPTION = 'シミュレーション／AI生成イメージ'
STAT = ['シミュレーション上は', '歩く速さが2割以下に']
END = [('当日は警察・係員の指示に従ってください', 54, (255, 255, 255)),
       ('', 20, None),
       ('人流：独自シミュレーション（人出48,000人を想定）', 33, (205, 205, 215)),
       ('地図：国土交通省 PLATEAU / © OpenStreetMap contributors', 31, (205, 205, 215)),
       ('映像はシミュレーションとAI生成によるイメージです', 31, (205, 205, 215))]
def text_c(d, y, s, f, fill, w=W, shadow=True):
    tw = d.textlength(s, font=f)
    if shadow:
        for dx, dy in ((3, 3), (-2, 3), (3, -2)): d.text(((w - tw) / 2 + dx, y + dy), s, font=f, fill=(0, 0, 0, 200))
    d.text(((w - tw) / 2, y), s, font=f, fill=fill)
def caption_layer():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); f = font(34)
    tw = d.textlength(CAPTION, font=f); x0 = (W - tw) / 2 - 22
    d.rounded_rectangle((x0, 60, x0 + tw + 44, 60 + 58), 14, fill=(0, 0, 0, 120))
    d.text(((W - tw) / 2, 66), CAPTION, font=f, fill=(255, 255, 255, 235)); return L
def stat_layer():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    g = Image.new('L', (W, 520), 0); gd = ImageDraw.Draw(g)
    for i in range(520): gd.line((0, i, W, i), fill=int(190 * (i / 520) ** 1.4))
    L.paste((0, 0, 0, 255), (0, H - 640), g)
    text_c(d, H - 430, STAT[0], font(58), (255, 255, 255, 255)); text_c(d, H - 340, STAT[1], font(88), (255, 214, 64, 255)); return L
def end_layer():
    L = Image.new('RGBA', (W, H), (10, 10, 18, 255)); d = ImageDraw.Draw(L); y = 640
    for s, sz, col in END:
        if s: text_c(d, y, s, font(sz), col, shadow=False)
        y += int(sz * 1.9) if s else 40
    return L
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('frames', type=Path); ap.add_argument('out', type=Path)
    ap.add_argument('--fps', type=int, default=30); ap.add_argument('--card', type=float, default=3.0)
    ap.add_argument('--stat-in', type=float, default=18.0); ap.add_argument('--stat-out', type=float, default=24.0)
    ap.add_argument('--audio', default='/workspace/demos/halloween-escape-series/science-sim-v2/bed_s14.wav')
    ap.add_argument('--nframes', type=int, default=None)
    a = ap.parse_args()
    files = sorted(a.frames.glob('f*.png'));  n = a.nframes or len(files); files = files[:n]
    ncard = int(a.card * a.fps); total = n + ncard; dur = total / a.fps
    cap, stat, end = caption_layer(), stat_layer(), end_layer()
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
           '-i', a.audio, '-t', f'{dur:.3f}', '-af', f'afade=t=in:st=0:d=0.5,afade=t=out:st={dur-1.2:.2f}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=7',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(a.fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(a.out)]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(total):
        t = i / a.fps
        if i < n:
            im = Image.open(files[i]).convert('RGB')
            if im.size != (W, H): im = im.resize((W, H), Image.LANCZOS)
            im = im.convert('RGBA')
            sa = max(0.0, min(1.0, (t - a.stat_in) / 0.6, (a.stat_out - t) / 0.6 if t > a.stat_out - 0.6 else 1.0))
            if sa > 0:
                s = stat.copy(); s.putalpha(s.getchannel('A').point(lambda v: int(v * sa))); im = Image.alpha_composite(im, s)
            im = Image.alpha_composite(im, cap)
            if i >= n - 8:  # fade into the end card
                k = (i - (n - 8)) / 8; e = Image.alpha_composite(end, cap); e.putalpha(int(255 * k)); im = Image.alpha_composite(im, e)
        else:
            im = Image.alpha_composite(end, cap)
        pr.stdin.write(im.convert('RGB').tobytes())
    pr.stdin.close(); pr.wait(); print('done', a.out, dur)
if __name__ == '__main__': main()
