#!/usr/bin/env python3
"""science-sim-v6: AI packed-crowd i2v clips + live-sim map parts (map_v6.py) + result card + assumptions card.
usage: v6_build.py WORKDIR OUT.mp4 SCENARIO_DIR_ROOT   WORKDIR: a1.mp4 a2.mp4 b.mp4 (AI clips), m1/f%04d.png, m2/f%04d.png"""
import sys, subprocess, json
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).parent)); import rr_analyze as RA
from v3_build import font, text_c, W, H
wd = Path(sys.argv[1]); out = Path(sys.argv[2]); ROOT = Path(sys.argv[3])
def grad(h, a=200, top=False):
    g = Image.new('L', (W, h), 0); d = ImageDraw.Draw(g)
    for i in range(h): d.line((0, i, W, i), fill=int(a * ((1 - i / h) if top else (i / h)) ** 1.3))
    return g
def jp(sec): sec = int(round(sec)); return f'{sec//60}分{sec%60:02d}秒'
# ---- numbers from the runs (70% idle, restricted)
def cells(name):
    full = RA.analyze(str(ROOT / name)); o = full['routes']; res = {}
    for k in ('GA', 'OUTN'):
        v = o[k]
        if v['median_s'] is not None: res[k] = (jp(v['median_s']), f"最長 {jp(v['worst_done_s'])}" + (f"（未達{v['censored']}人）" if v['censored'] else ''))
        else: res[k] = ('30分近く経っても', f"着いたのは {v['done']}/24人" if k == 'GA' else f"出られたのは {v['done']}/24人")
    return res, full
ROWS = [('×1', '48,000人', 'x1_i70_r'), ('×1.5', '72,000人', 'x1.5_i70_r'), ('×2', '96,000人', 'x2_i70_r'), ('×3', '144,000人', 'x3_i70_r')]
TAB = []
for lab, n, nm in ROWS:
    try: c, o = cells(nm); TAB.append((lab, n, c['GA'], c['OUTN'], o['tsim']))
    except Exception as e: TAB.append((lab, n, ('計算中', ''), ('計算中', ''), 0)); print('missing', nm, e)
json.dump(TAB, open(wd / 'card_numbers.json', 'w'), ensure_ascii=False, indent=1)
def layer_start():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, 0), grad(820, 225, True))
    text_c(d, 130, '駅に向かうなら、', font(78), (255, 255, 255, 255)); text_c(d, 250, 'ここだけは', font(104), (255, 255, 255, 255))
    text_c(d, 390, '絶対に通るな', font(140), (255, 80, 70, 255)); text_c(d, 590, 'ハロウィンの渋谷駅前をシミュレーションで測りました', font(36), (225, 228, 240, 255)); return L
def layer_mid():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, H - 760), grad(760, 225))
    text_c(d, H - 470, '改札の目の前で', font(80), (255, 255, 255, 255)); text_c(d, H - 350, '動けなくなる', font(120), (255, 214, 64, 255)); return L
def layer_final():
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); L.paste((0, 0, 0, 255), (0, H - 900), grad(900, 235))
    text_c(d, H - 640, '絶対に', font(110), (255, 255, 255, 255)); text_c(d, H - 500, '人混みの中に', font(110), (255, 255, 255, 255)); text_c(d, H - 360, '進むな', font(150), (255, 70, 70, 255)); return L
def layer_res():
    L = Image.new('RGBA', (W, H), (10, 10, 18, 255)); d = ImageDraw.Draw(L)
    text_c(d, 110, 'シミュレーションの実測', font(62), (255, 255, 255, 255), shadow=False)
    text_c(d, 200, '停止している人70%・警察の規制と改札閉鎖を想定', font(33), (200, 205, 220, 255), shadow=False)
    text_c(d, 248, '（各24人。中央値。時間は人混みの中心から）', font(31), (170, 178, 196, 255), shadow=False)
    x = [40, 300, 690]; y0 = 330; hh = 100
    d.rounded_rectangle([30, y0, W - 30, y0 + hh], 18, fill=(30, 34, 50, 255))
    d.text((x[0] + 10, y0 + 24), '人出', font=font(38), fill=(190, 200, 220, 255)); d.text((x[1] - 10, y0 + 12), '駅の改札まで', font=font(38), fill=(190, 200, 220, 255)); d.text((x[1] - 10, y0 + 56), '(ハチ公口)', font=font(26), fill=(150, 160, 180, 255))
    d.text((x[2] - 10, y0 + 12), '引き返して外へ', font=font(38), fill=(190, 200, 220, 255)); d.text((x[2] - 10, y0 + 56), '(北側)', font=font(26), fill=(150, 160, 180, 255))
    y = y0 + hh + 14
    for k, (lab, n, ga, on, _) in enumerate(TAB):
        d.rounded_rectangle([30, y, W - 30, y + 215], 20, fill=(20, 24, 36, 255) if k % 2 == 0 else (26, 30, 44, 255), outline=(255, 214, 90, 255) if lab == '×1.5' else None, width=4)
        d.text((x[0] + 6, y + 34), lab, font=font(64), fill=(255, 214, 90, 255)); d.text((x[0] + 6, y + 126), n, font=font(30), fill=(200, 205, 220, 255))
        for (c, xx) in ((ga, x[1]), (on, x[2])):
            bad = c[0].startswith('30')
            d.text((xx - 10, y + 40), c[0], font=font(44 if not bad else 38), fill=(255, 90, 90, 255) if bad else (255, 255, 255, 255)); d.text((xx - 10, y + 118), c[1], font=font(30), fill=(185, 192, 210, 255))
        y += 229
    text_c(d, y + 10, '×1.5のあなたは 連続約5分 1歩も動けず', font(40), (255, 120, 110, 255), shadow=False)
    text_c(d, y + 74, '停止の割合が60%・80%だと結果は大きく変わります', font(30), (190, 198, 215, 255), shadow=False)
    text_c(d, y + 120, '（×1でも30分近くかかる例あり）', font(30), (190, 198, 215, 255), shadow=False)
    text_c(d, y + 190, '密度7人/㎡超は「押しつぶされる危険な密度」', font(32), (255, 150, 200, 255), shadow=False)
    return L
def layer_ass():
    L = Image.new('RGBA', (W, H), (10, 10, 18, 255)); d = ImageDraw.Draw(L); y = 230
    text_c(d, y, '当日は警察・係員の指示に従ってください', font(46), (255, 255, 255, 255), shadow=False); y += 120
    text_c(d, y, '前提（すべて独自シミュレーション上の仮定）', font(40), (255, 214, 90, 255), shadow=False); y += 80
    rows = ['人出：×1=48,000人（区の発表：2019年ピーク約4万人）',
            '×1.5・×2・×3(144,000人)は仮定の人数',
            '立ち止まる人：70%（60・80%も試算）／動く人は0.5倍速',
            '警察の規制：横断部の全停止120秒を600秒ごと（仮定）',
            'ハチ公口の改札：900秒のうち300秒閉鎖（仮定）',
            '電車の降車の波：150秒ごと（仮定・時刻表ではない）',
            '速度と密度：Weidmann(1993) 5.4人/㎡で速度ゼロ',
            '時間：実際の10〜30分を最大4倍速とスキップで表示',
            '目的地は改札の位置（概略）。結果は大きくばらつく',
            '実際の混雑・所要時間とは異なります',
            '地図：国土交通省 PLATEAU / © OpenStreetMap contributors',
            '人出の出典：渋谷区の発表（シブヤ経済新聞・TBS NEWS DIG）']
    for r in rows: text_c(d, y, r, font(32), (214, 216, 226, 255), shadow=False); y += 92
    f = font(26); tw = d.textlength('AI生成イメージ', font=f); d.text((W - tw - 36, H - 64), 'AI生成イメージ', font=f, fill=(190, 190, 200, 255)); return L
layers = {'A': layer_start(), 'B': layer_mid(), 'C': layer_final(), 'R': layer_res(), 'S': layer_ass()}
for k, v in layers.items(): v.save(wd / f'L_{k}.png')
def sh(cmd): subprocess.run(cmd, check=True)
def clip(name, ss, dur, out_name):
    # 720x1280 24fps -> 1080x1920 30fps, blur the upper part (signage), light grain
    vf = ("[0:v]scale=1080:1920:flags=lanczos,fps=30,split[a][b];[b]gblur=sigma=9,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*clip((0.5*H-Y)/(0.18*H),0,1)'[bb];"
          "[a]format=yuva420p[aa];[aa][bb]overlay=0:0,noise=alls=2:allf=t,format=yuv420p[v]")
    sh(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-t', str(dur), '-i', str(wd / name), '-filter_complex', vf, '-map', '[v]', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', str(wd / out_name)])
    return wd / out_name
def mp4(pat, name):
    dst = wd / name; sh(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(wd / pat), '-vf', 'noise=alls=2:allf=t', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', str(dst)]); return dst
sA = clip('a1.mp4', 0.3, 4.2, 't_a.mp4'); sB = clip('a2.mp4', 1.2, 3.0, 't_b.mp4'); sC = clip('b.mp4', 1.4, 3.2, 't_c.mp4')
m1, m2 = mp4('m1/f%04d.png', 'seg_m1.mp4'), mp4('m2/f%04d.png', 'seg_m2.mp4')
def still(layer, dur, name):
    dst = wd / name; sh(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', str(wd / layer), '-t', str(dur), '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', str(dst)]); return dst
eR, eS = still('L_R.png', 5.2, 'seg_r.mp4'), still('L_S.png', 6.2, 'seg_s.mp4')
segs = [sA, m1, sB, m2, sC, eR, eS]
dur = [float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(s)])) for s in segs]
XF = .3
inputs = sum([['-i', str(s)] for s in segs], [])
fc = []; cur = '[0:v]'; t_acc = dur[0]; starts = [0.0]
for i in range(1, len(segs)):
    off = t_acc - XF; fc.append(f'{cur}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]'); cur = f'[x{i}]'; starts.append(off + XF); t_acc = off + dur[i]
total = t_acc; n = len(segs)
fc.append(f'{cur}format=rgba[b]')
ov = [('A', starts[0] + 0.2, starts[1] - 0.1), ('B', starts[2] + 0.1, starts[3] - 0.1), ('C', starts[4] + 0.2, starts[5] - 0.1)]
for j, (k, st, en) in enumerate(ov):
    inputs += ['-loop', '1', '-i', str(wd / f'L_{k}.png')]
    fc.append(f'[{n+j}:v]format=rgba,fade=t=in:st={st:.2f}:d=0.4:alpha=1,fade=t=out:st={en-0.3:.2f}:d=0.3:alpha=1[l{k}]')
fc.append('[b][lA]overlay=0:0[o1]'); fc.append('[o1][lB]overlay=0:0[o2]'); fc.append('[o2][lC]overlay=0:0[o3]'); fc.append('[o3]format=yuv420p[v]')
audio = '/workspace/demos/halloween-escape-series/science-sim-v2/bed_s14.wav'
cmd = ['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-stream_loop', '-1', '-i', audio, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', f'{n+3}:a', '-t', f'{total:.3f}',
       '-af', f'afade=t=in:st=0:d=0.5,afade=t=out:st={total-1.2:.2f}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=7', '-r', '30', '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(out)]
print('starts', starts, 'total', total); sh(cmd)
