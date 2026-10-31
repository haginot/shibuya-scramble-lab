#!/usr/bin/env python3
"""science-sim-v4: AI-generated photoreal clips (image-to-video from costumed plates) + sim density heatmap cut-in.
Sign text is blurred (feathered gaussian over the whole building/sign band above the crowd line), grain hides AI artefacts.
usage: v4_build.py WORKDIR OUT.mp4   (WORKDIR has start.mp4 high.mp4 eye.mp4 heat/h%04d.png)"""
import sys, subprocess, numpy as np
from pathlib import Path
from PIL import Image, ImageFilter
sys.path.insert(0, str(Path(__file__).parent)); import v3_build as V3
W, H, FPS = 1080, 1920, 30
wd = Path(sys.argv[1]); out = Path(sys.argv[2])
BAND = {'start': (.50, .60), 'high': (.47, .56), 'eye': (.48, .58)}
def blur_seg(name):
    solid, fe = BAND[name]; dst = wd / f'seg_{name}.mp4'
    rd = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', str(wd / f'{name}.mp4'), '-vf', 'fps=30,scale=720:1280', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    wr = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '720x1280', '-r', '30', '-i', '-',
        '-vf', f'scale={W}:{H}:flags=lanczos,unsharp=5:5:0.5,noise=alls=7:allf=t', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p', str(dst)], stdin=subprocess.PIPE)
    y = np.arange(1280, dtype=np.float32); m = np.clip((fe * 1280 - y) / ((fe - solid) * 1280), 0, 1)[:, None, None]
    n = 0
    while True:
        b = rd.stdout.read(720 * 1280 * 3)
        if len(b) < 720 * 1280 * 3: break
        a = np.frombuffer(b, np.uint8).reshape(1280, 720, 3)
        top = int(fe * 1280) + 1
        bl = np.asarray(Image.fromarray(a[:top]).filter(ImageFilter.GaussianBlur(6.5))).astype(np.float32)
        o = a.astype(np.float32); o[:top] = bl * m[:top] + o[:top] * (1 - m[:top])
        wr.stdin.write(o.astype(np.uint8).tobytes()); n += 1
    wr.stdin.close(); wr.wait(); rd.wait(); print(name, n, 'frames'); return dst
segs = [blur_seg(n) for n in ('start', 'high')]
heat = wd / 'seg_heat.mp4'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(wd / 'heat/h%04d.png'), '-vf', 'noise=alls=3:allf=t', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', str(heat)], check=True)
segs += [heat, blur_seg('eye')]
from PIL import Image as I
cap, stat, end = V3.caption_layer(), V3.stat_layer(), V3.end_layer()
cap.save(wd / 'cap.png'); stat.save(wd / 'stat.png'); end.save(wd / 'end.png')
dur = [float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(s)])) for s in segs]
XF = .4; CARD = 3.0
inputs = sum([['-i', str(s)] for s in segs], [])
fc = []; cur = '[0:v]'; t_acc = dur[0]
for i in range(1, len(segs)):
    off = t_acc - XF; fc.append(f'{cur}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]'); cur = f'[x{i}]'; t_acc = off + dur[i]
body = t_acc; total = body + CARD
stat_in = body - 6.5; stat_out = body - 0.5
fc.append(f'{cur}format=rgba[b]')
inputs += ['-loop', '1', '-i', str(wd / 'stat.png'), '-loop', '1', '-i', str(wd / 'end.png')]
n = len(segs)
fc.append(f'[{n}:v]format=rgba,fade=t=in:st={stat_in:.2f}:d=0.6:alpha=1,fade=t=out:st={stat_out-0.6:.2f}:d=0.6:alpha=1[st]')
fc.append(f'[{n+1}:v]format=rgba,fade=t=in:st={body-0.3:.2f}:d=0.6:alpha=1[en]')
fc.append('[b][st]overlay=0:0:shortest=0[o1]'); fc.append('[o1][en]overlay=0:0[o2]'); fc.append('[o2]format=yuv420p[v]')
audio = '/workspace/demos/halloween-escape-series/science-sim-v2/bed_s14.wav'
cmd = ['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-i', audio, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', f'{n+2}:a', '-t', f'{total:.3f}',
       '-af', f'afade=t=in:st=0:d=0.5,afade=t=out:st={total-1.2:.2f}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=7', '-r', '30', '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(out)]
print(' '.join(cmd[:6]), '... total', total, 'body', body); subprocess.run(cmd, check=True)
