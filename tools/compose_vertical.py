"""Vertical 9:16 (1080x1920) cut of a Halloween video recorded by record_shibuya.py.

The rendered 1280x720 frame (with its checked overlays) sits in the middle; the bands
above and below repeat the shot's headline in large type for phones. Every number in
the bands comes from stills/frames.jsonl, the solver values the recorder logged for
that same frame, formatted like the browser (record_shibuya.fmt/p2/mmss); the 2026
crowd figure is the cited estimate (web3d/shibuya/sources-halloween.mjs).

usage: python tools/compose_vertical.py VIDEO.mp4 FRAMES.jsonl --lang ja|en --output OUT.mp4
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('record_shibuya', ROOT/'tools/record_shibuya.py')
rec = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rec)
fmt, p2, mmss = rec.fmt, rec.p2, rec.mmss

W, H, FPS = 1080, 1920, 30
MID_Y, MID_H = 560, 608          # 1280x720 scaled to 1080x608
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
_fonts = {}
def font(size, bold=True):
    key = (size, bold)
    if key not in _fonts: _fonts[key] = ImageFont.truetype(BOLD if bold else REG, size, index=0)
    return _fonts[key]

# Exit zones as defined in the solver (same order and names as the exit board).
EXITS = re.findall(r"\{key:'(\w+)',name:'([^']+)',ja:'([^']+)'", (ROOT/'web3d/shibuya/dispersal.mjs').read_text())
EXIT_NAME = {k: {'en': en, 'ja': ja} for k, en, ja in EXITS}
ESTIMATE = rec.ESTIMATE_2026

TEXT = {
    'ja': {
        'brand': 'SHIBUYA HALLOWEEN · シミュレーション',
        'head': {'hook': '10/31 渋谷駅、\nどう帰る？', 'main': 'ハロウィン夜の\n渋谷駅前', 'dispersal': '00:30 駅閉鎖\n一斉に帰ると？', 'exits': '出口別\nどこが先に空く？',
                 'results': '規制あり vs なし\n25分後', 'question': 'あなたなら\nどこから帰る？', 'credits': 'あなたなら\nどこから帰る？'},
        'sub': '渋谷で働く人・観光客のための帰り道ガイド',
        'tag': '人数はすべてシミュレーション上の人から集計',
        'est': '2026年 推計', 'est_l': 'ピーク時の路上の人出（渋谷区の見込み*）',
        'live': lambda r: f"規制で待機 {fmt(r['held'])}人 ・ 最大密度 {p2(r['peak'])}人/m²",
        'assume': lambda r: f"シミュレーション上の仮定：区域内 {fmt(r['agents'])}人",
        'cols': ('規制なし', '一方通行＋段階的解放'), 'people': '出口付近の人数', 'clear': '混雑が解消した時刻（駅閉鎖から）',
        'clock': lambda t: f"駅閉鎖から +{mmss(t)}", 'remain': '現場に残る人',
        'cta': 'コメントで教えてください',
        'foot': '*シブヤ経済新聞 2026-09-30（渋谷区の見込み：2024年並み 22時頃 約1万8千人）\n人数・出口ゾーンはシミュレーション上の仮定・予測ではない',
    },
    'en': {
        'brand': 'SHIBUYA HALLOWEEN · simulation',
        'head': {'hook': 'Shibuya on Halloween:\nheads-up', 'main': 'Halloween night at\nShibuya Station', 'dispersal': '00:30 the station closes.\nEveryone heads home.', 'exits': 'Which exit\nclears first?',
                 'results': 'Managed vs no control\n25 min later', 'question': 'Which exit\nwould you take?', 'credits': 'Which exit\nwould you take?'},
        'sub': 'A getting-home guide for workers & visitors',
        'tag': 'every count comes from the simulated people',
        'est': '2026 ESTIMATE', 'est_l': 'people on the street at the peak (Shibuya City expectation*)',
        'live': lambda r: f"held by police {fmt(r['held'])} · peak {p2(r['peak'])} p/m²",
        'assume': lambda r: f"sim assumption: {fmt(r['agents'])} people in the area",
        'cols': ('NO CONTROL', 'ONE-WAY + STAGED'), 'people': 'people near each exit', 'clear': 'crowd cleared at (after closing)',
        'clock': lambda t: f"+{mmss(t)} since closing", 'remain': 'still in the area',
        'cta': 'Tell us in the comments',
        'foot': '*Shibuya Keizai Shimbun 2026-09-30 (ward expects about 2024\'s ≈18,000 at ~22:00)\nPeople counts and exit zones are sim assumptions, not a prediction',
    },
}
CAPS = {round(t*FPS): (ja, en) for t, ja, en in rec.H_CAPTIONS}


def section(shot):
    return shot if shot in ('hook', 'dispersal', 'exits', 'results', 'question', 'credits') else 'main'


def exit_rows(r, lang):
    """(name, people A, people B, densest cell A, densest cell B) per exit zone, from the frame log."""
    if 'exits' not in r: return []
    b = {e[0]: e for e in r['exits']['B']}
    return [(EXIT_NAME[e[0]][lang], fmt(e[1]), fmt(b[e[0]][1]), e[2], b[e[0]][2]) for e in r['exits']['A']]


def clear_rows(r, lang):
    b = {e[0]: e for e in r['exits']['B']}
    part = lambda s: s.split(' · ')[0 if lang == 'en' else 1] if ' · ' in s else s
    txt = lambda e: part(rec.exit_clear_text({'clearAt': e[4], 'peakRun': e[3]}))
    return [(EXIT_NAME[e[0]][lang], txt(e), txt(b[e[0]])) for e in r['exits']['A']]


def dens_color(v):
    return (255, 42, 74) if v >= 4 else (255, 122, 26) if v >= 3 else (255, 210, 26) if v >= 2 else (79, 227, 193)


def centered(d, y, text, f, fill, spacing=8):
    for line in text.split('\n'):
        w = d.textlength(line, font=f)
        d.text(((W-w)/2, y), line, font=f, fill=fill)
        y += f.size + spacing
    return y


def fit(d, text, size, maxw, bold=True):
    while size > 14 and max(d.textlength(l, font=font(size, bold)) for l in text.split('\n')) > maxw: size -= 2
    return font(size, bold)


def background():
    bg = Image.new('RGB', (W, H), (8, 5, 14))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = abs(y-H/2)/(H/2)
        d.line([(0, y), (W, y)], fill=(int(8+30*t), int(5+8*t), int(14+34*t)))
    return bg


def band(r, cap, lang, base):
    T = TEXT[lang]; sec = section(r['shot']); img = base.copy(); d = ImageDraw.Draw(img)
    d.text((48, 40), T['brand'], font=font(26), fill=(255, 138, 31))
    head = T['head'][sec]
    y = centered(d, 120, head, fit(d, head, 92, W-90), (255, 255, 255), 14)
    y = centered(d, max(y+20, 360), T['sub'], fit(d, T['sub'], 36, W-100, False), (217, 194, 255))
    centered(d, y+18, T['tag'], fit(d, T['tag'], 26, W-100, False), (150, 140, 175))
    d.rectangle([0, MID_Y-4, W, MID_Y-1], fill=(255, 138, 31)); d.rectangle([0, MID_Y+MID_H, W, MID_Y+MID_H+3], fill=(157, 75, 255))
    y = MID_Y+MID_H+44
    if sec == 'hook':
        d.text((60, y), T['est'], font=font(34), fill=(255, 217, 168))
        d.text((60, y+44), fmt(ESTIMATE), font=font(170), fill=(255, 138, 31))
        y = centered(d, y+270, T['est_l'], fit(d, T['est_l'], 34, W-100), (255, 255, 255))
        centered(d, y+18, T['live'](r), fit(d, T['live'](r), 30, W-100, False), (255, 217, 168))
    elif sec == 'main':
        if cap:
            text = cap.replace(' · ', '\n')
            y = centered(d, y+10, text, fit(d, text, 50, W-100), (255, 255, 255), 12)
        y = centered(d, max(y+30, MID_Y+MID_H+300), T['live'](r), fit(d, T['live'](r), 38, W-100), (255, 207, 138))
        centered(d, y+16, T['assume'](r), fit(d, T['assume'](r), 28, W-100, False), (201, 194, 219))
    elif sec == 'question':
        for k, (key, en, ja) in enumerate(EXITS):
            name = en if lang == 'en' else ja
            d.rectangle([60, y-4, W-60, y+58], fill=(24, 14, 34)); d.text((84, y+2), 'ABCDEF'[k], font=font(38), fill=(255, 138, 31))
            d.text((150, y+2), name, font=fit(d, name, 38, W-260), fill=(255, 255, 255)); y += 74
        centered(d, y+24, T['cta'], font(48), (255, 207, 106))
    elif sec in ('dispersal', 'exits', 'results') and 'exits' in r:
        d.text((48, y), T['clock'](r['clock']), font=font(34), fill=(255, 255, 255))
        x1, x2 = 640, 900
        d.text((x1-110, y+50), T['cols'][0], font=fit(d, T['cols'][0], 26, 240), fill=(255, 106, 90))
        d.text((x2-110, y+50), T['cols'][1], font=fit(d, T['cols'][1], 26, 250), fill=(79, 227, 193))
        label = T['people'] if sec == 'dispersal' else T['clear']
        d.text((48, y+50), label, font=fit(d, label, 24, 460, False), fill=(201, 194, 219))
        y += 96
        for row in (exit_rows(r, lang) if sec == 'dispersal' else clear_rows(r, lang)):
            d.rectangle([40, y-6, W-40, y+54], fill=(20, 12, 30))
            d.text((60, y+2), row[0], font=fit(d, row[0], 34, 420), fill=(255, 255, 255))
            for x, v, k in ((x1, row[1], 3), (x2, row[2], 4)):
                f = fit(d, v, 40, 240)
                d.text((x-d.textlength(v, font=f)/2, y-2), v, font=f, fill=dens_color(row[k]) if sec == 'dispersal' else (255, 255, 255))
            y += 66
        rem = r['remaining']; line = f"{T['remain']}: {fmt(rem['A'])} / {fmt(rem['B'])}"
        centered(d, y+10, line, font(32), (255, 217, 168))
    elif sec == 'credits':
        centered(d, y+40, T['cta'], font(52), (255, 207, 106))
    centered(d, H-110, T['foot'], fit(d, T['foot'], 22, W-80, False), (190, 180, 210), 6)
    return img


def compose(video, frames, lang, output):
    log = [json.loads(l) for l in Path(frames).read_text(encoding='utf-8').splitlines() if l.strip()]
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', str(video)]))['streams'][0]
    assert (probe['width'], probe['height']) == (1280, 720), probe
    total = int(probe['nb_read_frames'])
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-metadata', f'comment=Vertical cut ({lang}) of {Path(video).name}; band numbers from the recorder frame log (solver values of each frame).', str(output)], stdin=subprocess.PIPE)
    base = background(); cache = {}; cap = None; last = log[-1]
    for k in range(total):
        raw = dec.stdout.read(1280*720*3)
        if len(raw) < 1280*720*3: break
        r = log[k] if k < len(log) else {**last, 'shot': 'credits'}
        if k in CAPS: cap = CAPS[k][0 if lang == 'ja' else 1].replace('{agents}', fmt(r['agents']))
        static = section(r['shot']) in ('credits',)
        key = (r['shot'], cap) if static else None
        if key and key in cache: img = cache[key].copy()
        else:
            img = band(r, cap, lang, base)
            if key: cache[key] = img.copy()
        img.paste(Image.frombytes('RGB', (1280, 720), raw).resize((W, MID_H), Image.LANCZOS), (0, MID_Y))
        enc.stdin.write(img.tobytes())
    enc.stdin.close(); dec.wait()
    if enc.wait(): raise RuntimeError('ffmpeg failed')
    return output


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('video', type=Path); ap.add_argument('frames', type=Path)
    ap.add_argument('--lang', choices=['ja', 'en'], required=True); ap.add_argument('--output', type=Path, required=True)
    a = ap.parse_args()
    print(compose(a.video, a.frames, a.lang, a.output))
