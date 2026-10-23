"""Vertical 9:16 (1080x1920) cut of the v4 Halloween video ("🧙ハロウィンの渋谷を脱出せよ！🎃 /
Escape Shibuya on Halloween!") recorded by record_shibuya.py --mode halloween.

The middle is the body.vcut capture (same rendered frame as the 16:9 videos, 16:9 panels hidden,
map labels kept): x 160-1120 of the 1280x720 frame, scaled to 1080x810 at y 520-1330. The bands
around it (title, level bar, game HUD, callout, footnote) are drawn here from stills/frames.jsonl:
the overlay strings the recorder checked against the solver values of that same frame
(record_shibuya.check_overlay), so every number equals the escape run's value. Colour emoji come
from Noto Color Emoji (CBDT, fixed size 109, drawn with embedded_color and scaled).

usage: python tools/compose_vertical.py VCUT.mp4 FRAMES.jsonl --lang ja|en --output OUT.mp4
       python tools/compose_vertical.py --stills DIR [--lang ja|en]   (preview: DIR/preview-*-{lang}-v.png
                                                                       + DIR/preview-frames.jsonl → *-vertical.png)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('record_shibuya', ROOT/'tools/record_shibuya.py')
rec = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rec)
fmt, p2, mmss = rec.fmt, rec.p2, rec.mmss

W, H, FPS = 1080, 1920, 30
CROP = (160, 0, 1120, 720)       # the 9:16 column of the 1280x720 frame
MID_Y, MID_H = 520, 810          # 960x720 scaled to 1080x810
X0, X1 = 60, 940                 # text safe area (platform buttons on the right)
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
SYMBOL = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'  # ✔ ✖ (not in Noto CJK)
BUNGEE = '/usr/share/fonts/truetype/sand-box/google/Bungee/Bungee-Regular.ttf'
EMOJI_FONT = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
ORANGE, PURPLE, LILAC, SAFE, DANGER, WHITE, INK = (255, 138, 31), (157, 75, 255), (217, 194, 255), (79, 227, 193), (255, 42, 58), (255, 255, 255), (11, 6, 18)
DANGER_COLORS = [(79, 227, 193), (255, 210, 63), (255, 122, 26), (255, 42, 58), (176, 0, 42)]
_fonts = {}


def font(size, kind='bold'):
    key = (int(size), kind)
    if key not in _fonts:
        path = {'bold': BOLD, 'reg': REG, 'game': BUNGEE, 'sym': SYMBOL}[kind]
        _fonts[key] = ImageFont.truetype(path, int(size), index=0) if path.endswith('.ttc') else ImageFont.truetype(path, int(size))
    return _fonts[key]


_emoji_font = None
_emoji_cache = {}
EMOJI = re.compile('([\U0001F300-\U0001FAFF\u2600-\u2713\u2717-\u27BF]\ufe0f?)')  # colour emoji runs; ✔ ✖ stay text glyphs


def emoji_tile(ch, size):
    """Colour emoji at `size` px (Noto Color Emoji is a bitmap font with one strike at 109 px)."""
    global _emoji_font
    key = (ch, size)
    if key not in _emoji_cache:
        if _emoji_font is None: _emoji_font = ImageFont.truetype(EMOJI_FONT, 109)
        tile = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((8, 8), ch, font=_emoji_font, embedded_color=True)
        tile = tile.crop(tile.getbbox() or (0, 0, 1, 1))
        s = size/max(tile.size)
        _emoji_cache[key] = tile.resize((max(1, round(tile.width*s)), max(1, round(tile.height*s))), Image.LANCZOS)
    return _emoji_cache[key]


def runs(text):
    return [(p, bool(EMOJI.fullmatch(p))) for p in EMOJI.split(text) if p]


def width(text, f):
    d = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    return sum(f.size*1.08 if e else d.textlength(p, font=f) for p, e in runs(text))


def draw(img, x, y, text, f, fill, stroke=0, stroke_fill=None, shadow=None):
    """Text with colour-emoji runs at (x, y) (top of the em box). Returns the advance width."""
    d = ImageDraw.Draw(img)
    for p, e in runs(text):
        if e:
            tile = emoji_tile(p, int(f.size*.98)); oy = int(y+f.size*.24); img.alpha_composite(tile, (int(x+f.size*.05), oy)) if img.mode == 'RGBA' else img.paste(tile, (int(x+f.size*.05), oy), tile)
            x += f.size*1.08
        else:
            if shadow: d.text((x+shadow[0], y+shadow[1]), p, font=f, fill=shadow[2], stroke_width=stroke, stroke_fill=shadow[2])
            d.text((x, y), p, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
            x += d.textlength(p, font=f)
    return x


def centered(img, y, text, f, fill, x0=X0, x1=X1, **kw):
    w = width(text, f); draw(img, x0+(x1-x0-w)/2, y, text, f, fill, **kw); return w


NO_START = set('？！?!、。，．・：；」』）)】ーぁぃぅぇぉっゃゅょァィゥェォッャュョ*')  # kinsoku: never at the start of a line


def wrap(text, f, maxw):
    """Word wrap for Latin text, character wrap for CJK (with kinsoku); keeps explicit newlines."""
    out = []
    for para in text.split('\n'):
        cjk = bool(re.search(r'[　-鿿]', para))
        tokens = re.findall(r'\S+\s*', para) if not cjk else re.findall(r'[A-Za-z0-9.,:;~≈*+\-–/()%]+\s*|.', para)
        line = ''
        for tok in tokens:
            if line and width(line+tok.rstrip(), f) > maxw:
                carry = ''
                if cjk and tok[:1] in NO_START and len(line) > 1:  # take the previous character down with the punctuation
                    carry, line = line[-1], line[:-1]
                out.append(line.rstrip()); line = carry+tok.lstrip()
            else: line += tok
        out.append(line.rstrip())
    return out


def fit(text, size, maxw, kind='bold', lines=1, min_size=18):
    """Largest font (≤ size) whose wrapped text fits in `lines` lines of maxw."""
    while size > min_size:
        f = font(size, kind)
        if len(wrap(text, f, maxw)) <= lines: return f
        size -= 2
    return font(min_size, kind)


def block(img, y, text, size, fill, maxw=X1-X0, kind='bold', lines=2, spacing=1.25, align='center', x0=X0, min_size=18, **kw):
    f = fit(text, size, maxw, kind, lines, min_size)
    for line in wrap(text, f, maxw)[:lines+1]:
        if align == 'center': centered(img, y, line, f, fill, x0=x0, x1=x0+maxw, **kw)
        else: draw(img, x0, y, line, f, fill, **kw)
        y += f.size*spacing
    return y


def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def background():
    bg = Image.new('RGBA', (W, H), (8, 5, 14, 255))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = abs(y-H/2)/(H/2)
        d.line([(0, y), (W, y)], fill=(int(10+34*t), int(5+8*t), int(16+40*t), 255))
    return bg


def panel(img, box, fill=(20, 12, 30, 235), outline=None, radius=18, width_=3):
    ImageDraw.Draw(img).rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width_)


def section(shot):
    return 'level' if re.fullmatch(r'lv\d', shot or '') else shot


HOOK_SPLIT = {'ja': ('渋谷から', '脱出できるか？'), 'en': ('Can you escape', 'Shibuya?')}
TITLE_SPLIT = {'ja': ('🧙ハロウィンの', '渋谷を脱出せよ！🎃'), 'en': ('🧙 ESCAPE SHIBUYA', 'ON HALLOWEEN! 🎃')}
_title_cache = {}


def title_block(lang, size, sub_size):
    """Two-line title (+ subtitle) as an RGBA image: white fill, dark stroke, orange glow."""
    key = (lang, size, sub_size)
    if key in _title_cache: return _title_cache[key]
    kind = 'game' if lang == 'en' else 'bold'
    f, fs = font(size, kind), font(sub_size, 'bold')
    sub = '10/31 渋谷からどう帰る？' if lang == 'ja' else 'Oct 31: how to get home'
    lines = TITLE_SPLIT[lang]
    bw = int(max(width(l, f) for l in lines)+40); bh = int(size*1.12*2+sub_size*1.6+56)
    img = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    y = 10
    for l in lines:
        w = width(l, f); x = (bw-w)/2
        ImageDraw.Draw(glow).text((x, y), EMOJI.sub('  ', l), font=f, fill=(255, 138, 31, 150), stroke_width=10, stroke_fill=(255, 138, 31, 110))
        draw(img, x, y, l, f, (255, 243, 226), stroke=6, stroke_fill=(42, 10, 58), shadow=(0, 6, (75, 26, 122)))
        y += size*1.12
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    out = Image.alpha_composite(glow, img)
    centered_x = (bw-width(sub, fs))/2
    draw(out, centered_x, y+24, sub, fs, LILAC)
    _title_cache[key] = out
    return out


def paste_center(img, tile, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1: tile = tile.resize((max(1, int(tile.width*scale)), max(1, int(tile.height*scale))), Image.LANCZOS)
    if alpha < 1:
        tile = tile.copy(); a = tile.getchannel('A').point(lambda v: int(v*alpha)); tile.putalpha(a)
    img.alpha_composite(tile, (int(cx-tile.width/2), int(cy-tile.height/2)))


def meter(img, x, y, w, h, value):
    d = ImageDraw.Draw(img); seg = (w-4*6)/5
    for i, c in enumerate(DANGER_COLORS):
        sx = x+i*(seg+6); d.rounded_rectangle([sx, y, sx+seg, y+h], radius=5, fill=(52, 42, 66, 255))
        k = max(0.0, min(1.0, value-i))
        if k > 0: d.rounded_rectangle([sx, y, sx+seg*k, y+h], radius=5, fill=c+(255,))


def stamp_image(st, lang):
    caught = st['kind'] == 'caught'; col = DANGER if caught else SAFE
    main = st['main'] if lang == 'ja' else ('CAUGHT IN THE CROWD' if caught else 'ESCAPED!')
    f = font(88 if not caught else 64, 'bold' if lang == 'ja' else 'game')
    fs = font(28)
    w = int(max(width(main, f), width(st['sub'], fs))+60); h = int(f.size*1.25+fs.size*1.6+30)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([3, 3, w-3, h-3], radius=18, fill=(11, 6, 18, 215), outline=col, width=7)
    centered(im, 10, main, f, col, x0=0, x1=w)
    centered(im, 16+f.size*1.2, st['sub'], fs, WHITE, x0=0, x1=w)
    return im


def level_hud(img, d, Lv, lang, col, y0):
    """Timer, DANGER (player's surroundings) and the branch rows with their sim counters."""
    panel(img, [40, y0-6, 1040, y0+226], fill=(16, 9, 26, 235), outline=(255, 255, 255, 40), width_=2)
    tag = Lv.get('simTag', ''); f22 = font(22)
    tw = width(tag, f22); panel(img, [X0, y0+6, X0+tw+20, y0+38], fill=LILAC+(255,), radius=6); draw(img, X0+10, y0+6, tag, f22, INK)
    draw(img, X0, y0+48, Lv.get('timer', ''), font(48, 'game'), WHITE)
    dz = Lv.get('danger') or {}; lvl = dz.get('level', 0)
    draw(img, X0, y0+116, 'DANGER', font(26, 'game'), WHITE)
    draw(img, X0+150, y0+110, dz.get('label', ''), font(32, 'game' if lang == 'en' else 'bold'), DANGER_COLORS[lvl])
    vtxt = dz.get('value', ''); fv = font(26); draw(img, 410-width(vtxt, fv), y0+150, vtxt, fv, WHITE)
    draw(img, X0, y0+156, dz.get('where', ''), fit(dz.get('where', ''), 18, 210, 'reg', 1, 14), (207, 200, 222))
    meter(img, X0, y0+196, 350, 22, dz.get('bar', 0))
    by = y0+2; cx = 436
    for b in (Lv.get('branches') or [])[:3]:
        if b.get('alpha', 1) <= 0: by += 74; continue
        d.ellipse([cx, by+6, cx+34, by+40], fill=col if b['example'] else (216, 210, 232))
        centered(img, by+7, b['key'], font(22, 'game'), INK, x0=cx, x1=cx+34)
        tx = cx+46; maxw = X1-tx-30
        draw(img, tx, by, b['line'], fit(b['line'], 22, maxw, lines=1, min_size=16), WHITE)
        gate = b['gate']+('  ['+b['exampleTag']+']' if b['example'] else '')
        draw(img, tx, by+25, gate, fit(gate, 22, maxw, lines=1, min_size=15), col if b['example'] else (240, 232, 255))
        cnt = f"{b['count']} · {b['density']}" if lang == 'en' else f"{b['count']} ・ {b['density']}"
        draw(img, tx, by+50, cnt, fit(cnt, 18, maxw+24, 'reg', 1, 14), (207, 200, 222))
        if b.get('badge'): draw(img, X1-24, by+4, b['badge'], font(30, 'sym'), SAFE if b['badge'] == '✔' else DANGER)
        by += 74


def result_card(img, st, lang, col, y):
    """Result beat: ESCAPED/CAUGHT of the example route (sim rule) + VS rows (first walker per route)."""
    caught = st['kind'] == 'caught'; oc = DANGER if caught else SAFE
    panel(img, [40, y, 1040, y+240], fill=(11, 6, 18, 245), outline=oc+(255,), width_=4)
    k2 = st.get('k', 10); sc = 1.35-.35*(k2/4) if k2 < 4 else 1
    fm = font(int(54*sc), 'bold' if lang == 'ja' else 'game')
    main = st['main']; draw(img, X0, y+8+(54-fm.size)*.5, main, fm, oc, stroke=3, stroke_fill=(11, 6, 18))
    sub = st.get('sub', ''); fs = font(32, 'game'); draw(img, X0+width(main, font(54, 'bold' if lang == 'ja' else 'game'))+24, y+22, sub, fs, WHITE)
    head = st.get('head', ''); fh = font(20); hw = width(head, fh)
    panel(img, [X1-hw-20, y+16, X1, y+46], fill=LILAC+(255,), radius=6); draw(img, X1-hw-10, y+16, head, fh, INK)
    rows = st.get('rows') or []; ry = y+84; d = ImageDraw.Draw(img)
    for r in rows:
        a = 255 if r.get('on') else 90
        d.ellipse([X0, ry, X0+30, ry+30], fill=(col if r['example'] else (216, 210, 232))+(a,))
        centered(img, ry+1, r['key'], font(19, 'game'), INK, x0=X0, x1=X0+30)
        draw(img, X0+40, ry-1, clip(r['label'], font(22), 300), font(22), (242, 236, 255))
        bx0, bx1 = X0+350, X0+600
        d.rounded_rectangle([bx0, ry+8, bx1, ry+24], radius=8, fill=(52, 42, 66, 255))
        if r.get('on') and r.get('bar'):
            w_ = max(16, (bx1-bx0)*r['bar'])
            if r.get('edge'):
                for xx in range(int(bx0), int(bx0+w_), 14): d.rectangle([xx, ry+8, min(xx+7, bx0+w_), ry+24], fill=(216, 210, 232, 255))
            else: d.rounded_rectangle([bx0, ry+8, bx0+w_, ry+24], radius=8, fill=(col if r['example'] else (216, 210, 232))+(255,))
        txt = ((r.get('edgeTag') or '')+' ' if r.get('edgeTag') else '')+(r.get('time') or '')
        ft = fit(txt, 24, 230, lines=1, min_size=15) if txt else font(24)
        draw(img, bx1+14, ry-2, txt, ft, WHITE)
        if r.get('badge'): draw(img, X1-6, ry-4, r['badge'], font(28, 'sym'), SAFE if r['badge'] == '✔' else DANGER)
        if r.get('dense'): draw(img, bx0, ry+22, r['dense'], font(16, 'reg'), (255, 106, 115))
        ry += 40
    if st.get('cmp'): block(img, y+200, st['cmp'], 28, (255, 207, 106), lines=1, min_size=18)


def clip(text, f, maxw):
    """Cut text to maxw with an ellipsis."""
    if width(text, f) <= maxw: return text
    while text and width(text+'…', f) > maxw: text = text[:-1]
    return text+'…'


def teaser(img, T, t):
    """0-3 s under the map: what the red swarm means (simulation) and what the video tests."""
    if not T: return
    y = 1352; d = ImageDraw.Draw(img)
    tag = T.get('simTag', ''); f = font(24); tw = width(tag, f)
    panel(img, [W/2-tw/2-14, y, W/2+tw/2+14, y+36], fill=LILAC+(255,), radius=8); centered(img, y+2, tag, f, INK, x0=0, x1=W)
    block(img, y+54, T.get('legend', ''), 44, WHITE, lines=1, min_size=28)
    # red swarm swatch: ramp of the danger colours
    x0, x1, yy = X0+40, X1-40, y+130
    for i, c in enumerate(DANGER_COLORS):
        sx = x0+i*(x1-x0)/5; d.rounded_rectangle([sx+3, yy, sx+(x1-x0)/5-3, yy+34], radius=8, fill=c+(255,))
    for i, lab in enumerate(['<1', '1–2', '2–3', '3–4', '≥4']):
        sx = x0+i*(x1-x0)/5; centered(img, yy+40, lab, font(24), (232, 220, 255), x0=sx, x1=sx+(x1-x0)/5)
    block(img, y+230, T.get('routes', ''), 54, ORANGE, lines=1, min_size=30)


def band(r, lang, base, end=None, credit_alpha=1.0):
    """All bands for one frame record (frames.jsonl) → RGBA 1080x1920 without the middle video."""
    img = base.copy(); sec = section(r.get('shot'))
    if sec == 'credits': return credits_card(img, end[lang], credit_alpha)
    T = (r.get('text') or {}).get(lang) or {}
    t = r['t']; u = r.get('u') or 0
    d = ImageDraw.Draw(img)
    d.rectangle([0, MID_Y-4, W, MID_Y-1], fill=ORANGE); d.rectangle([0, MID_Y+MID_H, W, MID_Y+MID_H+3], fill=PURPLE)
    # ---- title: hook (0-1 s), card over the video (1-3 s) flying into the title band, then the band ----
    if sec == 'hook':
        a = min(1, u/.2)
        f = font(30, 'game'); kick = T.get('kicker', '')
        kw = width(kick, f); panel(img, [W/2-kw/2-24, 150, W/2+kw/2+24, 206], fill=ORANGE+(int(255*a),), radius=12)
        centered(img, 156, kick, f, INK, x0=0, x1=W)
        line = T.get('hook', '')
        parts = HOOK_SPLIT[lang] if ''.join(HOOK_SPLIT[lang]).replace(' ', '').lower() == line.replace(' ', '').lower() else wrap(line, font(96), 1000)[:2]
        y = 214
        for part in parts:
            block(img, y, part.upper() if lang == 'en' else part, 96 if lang == 'ja' else 78, WHITE, kind='game' if lang == 'en' else 'bold', lines=1, spacing=1.0,
                  stroke=7, stroke_fill=(42, 10, 58), shadow=(0, 7, (176, 0, 42)), x0=30, maxw=1020, min_size=60)
            y += 106 if lang == 'ja' else 94
        block(img, 446 if lang == 'ja' else 428, T.get('hookSub', ''), 34, LILAC, lines=1)
    elif sec == 'title':
        fly = r.get('fly') or 0
        card = title_block(lang, 96 if lang == 'ja' else 80, 44)
        bandt = title_block(lang, 84 if lang == 'ja' else 72, 42)
        s = 1+(bandt.width/card.width-1)*fly
        cy = 318+(265-318)*fly   # big card in the band above the video, settling into the title band
        paste_center(img, card, W/2, cy, s, min(1, (t-1)/.12))
    else:
        paste_center(img, title_block(lang, 84 if lang == 'ja' else 72, 42), W/2, 265)
    # ---- level bar ----
    bar = T.get('bar') or ''
    if bar and sec not in ('hook', 'title'):
        col = hexrgb(T['level']['color']) if sec == 'level' else ORANGE
        block(img, 438, bar, 40, col, lines=1, kind='bold', min_size=26)
    y0 = MID_Y+MID_H+18
    if sec in ('hook', 'title'):
        teaser(img, T.get('teaser') or {}, t)
    if sec == 'mission':
        M = T.get('mission') or {}
        block(img, y0, M.get('objective', '').replace('\n', ' '), 36, WHITE, lines=1, min_size=24)
        block(img, y0+56, M.get('number', ''), 66, ORANGE, lines=1, min_size=40)
        y = block(img, y0+146, M.get('note', '').replace('\n', ' '), 26, (232, 220, 255), lines=2, kind='reg')
        y = block(img, y+8, M.get('legend', '').replace('\n', ' '), 26, (232, 220, 255), lines=1, min_size=20)
        meter(img, X0, y+8, X1-X0, 30, 5)
        for i, lab in enumerate(M.get('levels', [])):
            seg = (X1-X0-24)/5; centered(img, y+46, lab, font(22), (207, 200, 222), x0=X0+i*(seg+6), x1=X0+i*(seg+6)+seg)
    elif sec == 'level':
        Lv = T.get('level') or {}
        col = hexrgb(Lv.get('color', '#FF8A1F'))
        st = Lv.get('stamp')
        if st: result_card(img, st, lang, col, y0-6)
        else: level_hud(img, d, Lv, lang, col, y0)
        tips = Lv.get('tips') or []
        k = 0 if u < 2.2 else 1 if u < 3.4 else 2
        if tips and u >= tips[0].get('from', .8):
            tip = tips[min(k, len(tips)-1)]['text']
            text = ('🚉 ' if k == 0 else '')+tip
            panel(img, [40, 1590, 1040, 1684], fill=(16, 9, 26, 235), outline=col+(255,), width_=3)
            block(img, 1596, text, 32, WHITE, lines=2, min_size=22, spacing=1.2)
    elif sec == 'overview':
        rows = T.get('overview') or []
        y = y0
        for r2 in rows:
            d.ellipse([X0, y+10, X0+22, y+32], fill=hexrgb(r2['color']))
            draw(img, X0+36, y, r2['start'], fit(r2['start'], 28, 500, lines=1, min_size=20), WHITE)
            oc = r2['outcome']; fo = font(26); draw(img, X1-width(oc, fo), y+2, oc[1:], fo, SAFE if '✔' in oc else DANGER); draw(img, X1-width(oc, fo)-6, y+2, oc[0], font(26, 'sym'), SAFE if '✔' in oc else DANGER)
            draw(img, X0+36, y+36, '→ '+r2['dest'], fit('→ '+r2['dest'], 22, X1-X0-40, 'reg', 1, 16), (207, 200, 222))
            y += 68
    elif sec == 'question':
        Q = T.get('question') or {}
        y = block(img, y0, Q.get('line', ''), 66 if lang == 'ja' else 56, (255, 207, 106), lines=1, kind='bold' if lang == 'ja' else 'game', min_size=36)
        for o in Q.get('options', []):
            draw(img, X0, y+4, o['k'], font(26, 'game'), hexrgb(o['color']))
            draw(img, X0+40, y, o['text'], fit(o['text'], 26, X1-X0-40, lines=1, min_size=18), WHITE)
            y += 40
        block(img, y+6, Q.get('cta', ''), 34, WHITE, lines=1)
    # ---- footnote ----
    foot = T.get('footV') or T.get('foot') or ''
    if foot:
        f = font(21, 'reg'); lines = wrap(foot, f, X1-X0)
        y = 1694
        for line in lines[:3]:
            draw(img, X0, y, line, f, (217, 194, 255)); y += 28
    return img


def credits_card(img, E, alpha=1.0):
    d = ImageDraw.Draw(img)
    paste_center(img, title_block('ja' if re.search(r'[぀-ヿ]', E['title']) else 'en', 76 if re.search(r'[぀-ヿ]', E['title']) else 64, 40), W/2, 380)
    y = block(img, 560, E['question'], 56, (255, 207, 106), lines=1)
    centered(img, y+30, E['sourcesHead'], font(30), ORANGE)
    src = E['sources']; half = math.ceil(len(src)/2); f = font(23, 'reg'); y1 = y+84
    for i, s in enumerate(src):
        col, row = divmod(i, half)
        draw(img, X0+col*445, y1+row*36, s, fit(s, 23, 430, 'reg', 1, 16), (232, 220, 255))
    y = y1+half*36+30
    y = block(img, y, E['sim'].replace('\n', ' '), 26, LILAC, lines=3)
    y = block(img, y+10, E['walk'].replace('\n', ' '), 24, (255, 226, 184), lines=2, kind='reg')
    y = block(img, y+6, E['check'], 26, (255, 226, 184), lines=1)
    block(img, y+16, E['data']+' · built with Claude Code', 22, (154, 157, 176), lines=1, kind='reg')
    if alpha < 1:
        black = Image.new('RGBA', img.size, (0, 0, 0, int(255*(1-alpha)))); img.alpha_composite(black)
    return img


def frame_image(r, lang, base, raw_rgb=None, end=None, credit_alpha=1.0):
    img = band(r, lang, base, end, credit_alpha)
    if section(r.get('shot')) != 'credits' and raw_rgb is not None:
        mid = raw_rgb.crop(CROP).resize((W, MID_H), Image.LANCZOS)
        img.paste(mid, (0, MID_Y))

    return img.convert('RGB')


def compose(video, frames, lang, output):
    log = [json.loads(l) for l in Path(frames).read_text(encoding='utf-8').splitlines() if l.strip()]
    end = json.loads((Path(frames).parent/'endcard.json').read_text(encoding='utf-8'))
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', str(video)]))['streams'][0]
    assert (probe['width'], probe['height']) == (1280, 720), probe
    total = int(probe['nb_read_frames']); credit_frames = total-len(log)
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-metadata', f'comment=Vertical cut ({lang}) of {Path(video).name}; band strings and numbers from the recorder frame log (checked against the escape run of each frame).', str(output)], stdin=subprocess.PIPE)
    base = background(); cache = {}
    for k in range(total):
        raw = dec.stdout.read(1280*720*3)
        if len(raw) < 1280*720*3: break
        if k < len(log):
            img = frame_image(log[k], lang, base, Image.frombytes('RGB', (1280, 720), raw))
        else:
            j = k-len(log); alpha = max(0, min(1, j/10, (credit_frames-1-j)/8+.0001)); key = round(alpha, 2)
            if key not in cache: cache[key] = frame_image({'t': 0, 'shot': 'credits'}, lang, base, end=end, credit_alpha=alpha)
            img = cache[key]
        enc.stdin.write(img.tobytes())
    enc.stdin.close(); dec.wait()
    if enc.wait(): raise RuntimeError('ffmpeg failed')
    return output


def stills(directory, langs=('ja', 'en')):
    """Preview: 9:16 stills from record_shibuya.py --stills-at output (no video needed)."""
    directory = Path(directory); out = []
    log = [json.loads(l) for l in (directory/'preview-frames.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
    end = json.loads((directory/'endcard.json').read_text(encoding='utf-8')); base = background()
    for r in log:
        for lang in langs:
            src = directory/f"preview-{r['t']:05.1f}s-{lang}-v.png"
            raw = Image.open(src).convert('RGB') if src.exists() else None
            img = frame_image(r, lang, base, raw, end=end)
            path = directory/f"preview-{r['t']:05.1f}s-{lang}-vertical.png"; img.save(path); out.append(path)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video', type=Path, nargs='?'); ap.add_argument('frames', type=Path, nargs='?')
    ap.add_argument('--lang', choices=['ja', 'en']); ap.add_argument('--output', type=Path)
    ap.add_argument('--stills', type=Path, help='preview mode: compose 9:16 stills from a --stills-at directory')
    a = ap.parse_args()
    if a.stills: print(*stills(a.stills, (a.lang,) if a.lang else ('ja', 'en')), sep='\n')
    else:
        if not (a.video and a.frames and a.lang and a.output): ap.error('VIDEO FRAMES --lang --output are required')
        print(compose(a.video, a.frames, a.lang, a.output))
