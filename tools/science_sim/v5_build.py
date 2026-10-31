#!/usr/bin/env python3
"""science-sim-v5 (scramble): AI costumed-crowd clips intercut with the live solver map (HUD, train pulses, 'you', exit time).
usage: v5_build.py WORKDIR OUT.mp4   WORKDIR: seg_start/seg_high/seg_eye.mp4 (blurred AI clips), in/f%04d.png, out/f%04d.png (map_you.py)"""
import sys, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).parent)); import v3_build as V3
from v3_build import font, text_c, W, H
wd = Path(sys.argv[1]); out = Path(sys.argv[2])
def grad(h, a=200, top=False):
    g = Image.new('L', (W, h), 0); d = ImageDraw.Draw(g)
    for i in range(h): d.line((0, i, W, i), fill=int(a * ((1 - i / h) if top else (i / h)) ** 1.3))
    return g
def layer_start():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, 0), grad(760, 215, True))
    text_c(d, 150, 'ハロウィンの渋谷', font(64), (255, 255, 255, 255)); text_c(d, 250, 'この人混みの「中心」まで', font(70), (255, 255, 255, 255))
    text_c(d, 350, '歩いていったら？', font(96), (255, 214, 64, 255)); text_c(d, 500, 'シミュレーションで測りました', font(44), (225, 228, 240, 255)); return L
def layer_high():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, H - 760), grad(760, 225))
    text_c(d, H - 470, '中心に着いた。', font(80), (255, 255, 255, 255)); text_c(d, H - 350, 'ここから出るには…', font(96), (255, 214, 64, 255)); return L
def layer_final():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, H - 900), grad(900, 235))
    text_c(d, H - 640, '絶対に', font(110), (255, 255, 255, 255)); text_c(d, H - 500, '人混みの中に', font(110), (255, 255, 255, 255)); text_c(d, H - 360, '進むな', font(150), (255, 70, 70, 255)); return L
def layer_end():
    L = Image.new('RGBA', (W, H), (10, 10, 18, 255)); d = ImageDraw.Draw(L); y = 430
    for s, sz, col in [('当日は警察・係員の指示に従ってください', 52, (255, 255, 255)), ('', 30, None),
        ('人流：独自シミュレーション（人出48,000人を想定）', 37, (212, 212, 222)),
        ('降車の波：電車到着ごと（ハチ公46人・南36人・新南36人、', 35, (212, 212, 222)), ('150秒ごとの到着はシミュレーション上の仮定）', 35, (212, 212, 222)),
        ('出るまでの時間：24回のシミュレーションの中央値', 35, (212, 212, 222)), ('（実際の混雑・人数とは異なります）', 35, (212, 212, 222)), ('', 18, None),
        ('地図：国土交通省 PLATEAU / © OpenStreetMap contributors', 35, (212, 212, 222))]:
        if s: text_c(d, y, s, font(sz), col + (255,), shadow=False)
        y += int(sz * 1.75) if s else sz
    f = font(26); tw = d.textlength('AI生成イメージ', font=f); d.text((W - tw - 36, H - 64), 'AI生成イメージ', font=f, fill=(190, 190, 200, 255)); return L
layers = {'A': layer_start(), 'B': layer_high(), 'C': layer_final(), 'E': layer_end()}
for k, v in layers.items(): v.save(wd / f'L_{k}.png')
def mp4(pat, name):
    dst = wd / name; subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(wd / pat), '-vf', 'noise=alls=2:allf=t', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', str(dst)], check=True); return dst
mi, mo = mp4('in/f%04d.png', 'seg_in.mp4'), mp4('out/f%04d.png', 'seg_out.mp4')
def trim(src, ss, d, name):
    dst = wd / name; subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-t', str(d), '-i', str(src), '-r', '30', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', str(dst)], check=True); return dst
sA = trim(wd / 'seg_start.mp4', 0.3, 4.2, 't_start.mp4'); sB = trim(wd / 'seg_high.mp4', 2.0, 3.6, 't_high.mp4'); sC = trim(wd / 'seg_eye.mp4', 1.0, 4.4, 't_eye.mp4')
segs = [sA, mi, sB, mo, sC]
dur = [float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(s)])) for s in segs]
XF = .3; CARD = 3.2
inputs = sum([['-i', str(s)] for s in segs], [])
fc = []; cur = '[0:v]'; t_acc = dur[0]; starts = [0.0]
for i in range(1, len(segs)):
    off = t_acc - XF; fc.append(f'{cur}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]'); cur = f'[x{i}]'; starts.append(off + XF); t_acc = off + dur[i]
body = t_acc; total = body + CARD
fc.append(f'{cur}format=rgba[b]')
n = len(segs)
for j, (k, st, en) in enumerate([('A', starts[0] + 0.2, starts[1] - 0.1), ('B', starts[2] + 0.1, starts[3] - 0.1), ('C', starts[4] + 0.2, body - 0.1)]):
    inputs += ['-loop', '1', '-i', str(wd / f'L_{k}.png')]
    fc.append(f'[{n+j}:v]format=rgba,fade=t=in:st={st:.2f}:d=0.4:alpha=1,fade=t=out:st={en-0.3:.2f}:d=0.3:alpha=1[l{k}]')
inputs += ['-loop', '1', '-i', str(wd / 'L_E.png')]
fc.append(f'[{n+3}:v]format=rgba,fade=t=in:st={body-0.3:.2f}:d=0.5:alpha=1[le]')
fc.append('[b][lA]overlay=0:0[o1]'); fc.append('[o1][lB]overlay=0:0[o2]'); fc.append('[o2][lC]overlay=0:0[o3]'); fc.append('[o3][le]overlay=0:0[o4]'); fc.append('[o4]format=yuv420p[v]')
audio = '/workspace/demos/halloween-escape-series/science-sim-v2/bed_s14.wav'
cmd = ['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-stream_loop', '-1', '-i', audio, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', f'{n+4}:a', '-t', f'{total:.3f}',
       '-af', f'afade=t=in:st=0:d=0.5,afade=t=out:st={total-1.2:.2f}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=7', '-r', '30', '-c:v', 'libx264', '-crf', '27', '-preset', 'medium', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(out)]
print('starts', starts, 'total', total); subprocess.run(cmd, check=True)
