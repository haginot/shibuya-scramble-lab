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
YELLOW, PINK = (255, 210, 63), (255, 154, 162)
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
DANGER_COLORS = [(79, 227, 193), (255, 210, 63), (255, 122, 26), (255, 42, 58), (176, 0, 42)]
_fonts = {}


def font(size, kind='bold'):
    key = (int(size), kind)
    if key not in _fonts:
        path = {'bold': BOLD, 'reg': REG, 'game': BUNGEE, 'sym': SYMBOL, 'mono': MONO}[kind]
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
        fl = fit(r['label'], 22, 450, lines=1, min_size=15)
        draw(img, X0+40, ry-1+(22-fl.size)*.5, clip(r['label'], fl, 450), fl, (242, 236, 255))
        bx0, bx1 = X0+500, X0+640
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


def broadcast_band(img, B, lang):
    """Cold open (0-1.5 s): the parody "urgent notice" of the fictional game HQ. The parody cue is the first
    and a large line, the "not a real alert" line closes the bottom band; hazard tape, no official styling."""
    if not B: return
    d = ImageDraw.Draw(img)
    for y in (0, H-26):
        for x in range(-40, W+40, 44): d.polygon([(x, y), (x+22, y), (x+48, y+26), (x+26, y+26)], fill=YELLOW+(255,))
    d.rectangle([0, 26, W, MID_Y-6], fill=(18, 4, 12, 255))
    cue = B.get('parody', ''); f = font(52 if lang == 'ja' else 44)
    cw = width(cue, f); panel(img, [W/2-cw/2-30, 64, W/2+cw/2+30, 64+f.size*1.75], fill=YELLOW+(255,), outline=INK+(255,), radius=12, width_=4)
    centered(img, 64+f.size*.12, cue, f, INK, x0=0, x1=W)
    block(img, 186, B.get('issuer', ''), 30, PINK, lines=1, x0=40, maxw=1000)
    g = B.get('glitch', 0) or 0; dx = int(10*g)
    if g: block(img, 246, B.get('head', ''), 64 if lang == 'ja' else 54, (42, 229, 255), lines=2, kind='bold' if lang == 'ja' else 'game', x0=40-dx, maxw=1000, min_size=36)
    y = block(img, 246, B.get('head', ''), 64 if lang == 'ja' else 54, WHITE, lines=2, kind='bold' if lang == 'ja' else 'game', x0=40+dx, maxw=1000, min_size=36, stroke=3, stroke_fill=(106, 0, 16))
    block(img, y+14, B.get('when', ''), 36, YELLOW, lines=1, x0=40, maxw=1000)
    # bottom band: the order and the "not a real alert" line, centred in the band (one parody pill only, at the top)
    d.rectangle([0, MID_Y+MID_H+4, W, H-26], fill=(18, 4, 12, 255))
    top, bot = MID_Y+MID_H+4, H-26
    scratch = Image.new('RGBA', (W, H)); fo = 60 if lang == 'ja' else 52
    h1 = block(scratch, 0, B.get('order', ''), fo, (255, 243, 226), lines=3, x0=40, maxw=1000, min_size=30)
    h2 = 46*1.6
    y = top+((bot-top)-(h1+50+h2))/2
    y = block(img, y, B.get('order', ''), fo, (255, 243, 226), lines=3, x0=40, maxw=1000, min_size=30)
    nr = B.get('notReal', ''); fn = fit(nr, 46, 960, lines=1, min_size=26); nw = width(nr, fn)
    d.line([(W/2-nw/2, y+40), (W/2+nw/2, y+40)], fill=YELLOW, width=3)
    block(img, y+56, nr, 46, YELLOW, lines=1, x0=40, maxw=1000, min_size=26)


def rules_band(img, R, lang, y0):
    """3.5-6.3 s under the map: RULES OF THE GAME (real safety tips; tips carry their footnote marks)."""
    if not R: return
    centered(img, y0-2, R.get('head', ''), font(40, 'game' if lang == 'en' else 'bold'), (255, 74, 85))
    y = y0+58; d = ImageDraw.Draw(img)
    for it in R.get('items', []):
        a = it.get('alpha', 1)
        if a <= 0: y += 64; continue
        d.rectangle([X0, y+4, X0+6, y+58], fill=YELLOW)
        draw(img, X0+20, y-2, it['title'], fit(it['title'], 32, X1-X0-20, lines=1, min_size=24), WHITE)
        tip = it['tip'].replace('\n', ' ')
        draw(img, X0+20, y+36, tip, fit(tip, 24, X1-X0-20, 'bold', 1, 17), (242, 234, 255))
        y += 64
    tl = R.get('tagline', '').replace('\n', ' ')
    if tl: block(img, y+2, tl, 24, PINK, lines=1, min_size=16)


def game_start(img, G, lang, y0):
    k = G.get('k', 1); sc = 1.25-.25*min(1, k/.15)
    f = font(int(84*sc), 'game')
    if k < .12: centered(img, y0+40, G.get('start', ''), f, (42, 229, 255), x0=-12, x1=W-12)
    centered(img, y0+40, G.get('start', ''), f, (255, 243, 226), x0=0, x1=W, stroke=6, stroke_fill=(106, 0, 16))
    block(img, y0+240, G.get('sub', ''), 40, YELLOW, lines=1)


def game_over(img, G, lang, y0):
    """39-40 s: end-of-game parody title (the game clock ran out) + the sim tally of the example routes."""
    if not G: return
    u = G.get('u', 1); f = font(84, 'game')
    if u < .25: centered(img, y0+10, G.get('title', ''), f, (42, 229, 255), x0=-14, x1=W-14)
    centered(img, y0+10, G.get('title', ''), f, YELLOW, x0=0, x1=W, stroke=6, stroke_fill=(42, 22, 0))  # gold: end of the game clock, not a failure
    tally = G.get('tally', ''); ft = font(38)
    tx0 = (W-width(tally, ft))/2
    draw(img, tx0, y0+134, tally[:1], font(34, 'sym'), SAFE); draw(img, tx0+width(tally[:2], ft), y0+124, tally[2:], ft, SAFE)
    block(img, y0+190, G.get('line', ''), 40, (255, 207, 106), lines=1)
    block(img, y0+252, G.get('tagline', '').replace('\n', ' '), 28, PINK, lines=1, min_size=18)


def mid_overlay(img, r, lang):
    """Drawn over the 9:16 middle (the captured map): VHS OSD (cold open/title), the parody countdown and the
    survivor counter (simulation) on a strip at the top, the CROWD ALERT (simulation) banner at the bottom."""
    sec = section(r.get('shot')); T = (r.get('text') or {}).get(lang) or {}
    if T.get('osd'):
        draw(img, 36, MID_Y+24, T['osd'], font(34, 'mono'), WHITE, shadow=(3, 3, (0, 0, 0)))
    G = T.get('game') or {}
    Lv = T.get('level') or {}
    sv = Lv.get('survivors') if sec == 'level' else None
    if G.get('countdown') or sv:
        strip = Image.new('RGBA', (W, 84), (11, 6, 18, 215)); img.alpha_composite(strip, (0, MID_Y))
        d = ImageDraw.Draw(img); d.line([(0, MID_Y+84), (W, MID_Y+84)], fill=DANGER, width=3)
        if G.get('countdown'):
            fc = font(44, 'game' if lang == 'en' else 'bold'); draw(img, X0-20, MID_Y+14, G['countdown'], fc, (255, 74, 85))
            tag = G.get('clockTag', '')
            if tag:   # tiny GAME tag: the countdown is a game clock, not simulation
                ft = font(17); tx = X0-20+width(G['countdown'], fc)+12; tw = width(tag, ft)
                d.rounded_rectangle([tx, MID_Y+30, tx+tw+12, MID_Y+56], radius=5, outline=(207, 200, 222), width=2); draw(img, tx+6, MID_Y+30, tag, ft, (207, 200, 222))
        if sv:
            head = sv.get('head', ''); fh = font(17); hw = width(head, fh)
            panel(img, [1040-hw-16, MID_Y+6, 1040, MID_Y+32], fill=LILAC+(255,), radius=5); draw(img, 1032-hw, MID_Y+6, head, fh, INK)
            line = sv.get('line', ''); fl = fit(line, 30, 560, lines=1, min_size=18)
            draw(img, 1040-width(line, fl), MID_Y+38, line, fl, WHITE)
    al = Lv.get('alert') if sec == 'level' else None
    if al:
        a = int(170+85*min(1, al.get('beat', 1)))
        y = MID_Y+MID_H-70; ban = Image.new('RGBA', (W-80, 60), (255, 42, 58, a)); img.alpha_composite(ban, (40, y))
        txt = f"{al['text']} {al['value']} · {al['where']}" if lang == 'en' else f"{al['text']} {al['value']}・{al['where']}"
        block(img, y+8, txt, 32, WHITE, lines=1, min_size=18, x0=50, maxw=W-100)


def band(r, lang, base, end=None, credit_alpha=1.0):
    """All bands for one frame record (frames.jsonl) → RGBA 1080x1920 without the middle video."""
    img = base.copy(); sec = section(r.get('shot'))
    if sec == 'credits': return credits_card(img, end[lang], credit_alpha)
    T = (r.get('text') or {}).get(lang) or {}
    t = r['t']; u = r.get('u') or 0
    d = ImageDraw.Draw(img)
    d.rectangle([0, MID_Y-4, W, MID_Y-1], fill=ORANGE); d.rectangle([0, MID_Y+MID_H, W, MID_Y+MID_H+3], fill=PURPLE)
    # ---- cold-open parody card (0-1.5 s), title card (1.5-3.5 s) flying into the title band, then the band ----
    if sec == 'broadcast':
        broadcast_band(img, T.get('broadcast') or {}, lang)
    elif sec == 'title':
        fly = r.get('fly') or 0
        card = title_block(lang, 96 if lang == 'ja' else 80, 44)
        bandt = title_block(lang, 84 if lang == 'ja' else 72, 42)
        s = 1+(bandt.width/card.width-1)*fly
        cy = 318+(265-318)*fly   # big card in the band above the video, settling into the title band
        paste_center(img, card, W/2, cy, s, 1 if fly < 1 else 0)
    else:
        paste_center(img, title_block(lang, 84 if lang == 'ja' else 72, 42), W/2, 265)
    # ---- level bar ----
    bar = T.get('bar') or ''
    if bar and sec not in ('broadcast', 'title'):
        col = hexrgb(T['level']['color']) if sec == 'level' else ORANGE
        block(img, 438, bar, 40, col, lines=1, kind='bold', min_size=26)
    y0 = MID_Y+MID_H+18
    if sec == 'title':
        teaser(img, T.get('teaser') or {}, t)
    if sec == 'rules':
        if T.get('gameStart'): game_start(img, T['gameStart'], lang, y0)
        else: rules_band(img, T.get('rules') or {}, lang, y0)
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
    elif sec == 'gameover':
        game_over(img, T.get('gameover') or {}, lang, y0)
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


def credits_card(img, E, alpha=1.0, dy=None):
    if dy is None:   # dry run on a scratch image → centre the whole card vertically (no empty bottom third)
        end = _credits_body(Image.new('RGBA', (W, H)), E, 0)
        dy = max(0, int((H-(end-240))/2-240))
    _credits_body(img, E, dy)
    if alpha < 1:
        black = Image.new('RGBA', img.size, (0, 0, 0, int(255*(1-alpha)))); img.alpha_composite(black)
    return img


def _credits_body(img, E, dy):
    """Draws the end card shifted down by dy; returns the bottom y of the content."""
    jp = bool(re.search(r'[぀-ヿ]', E['title']))
    paste_center(img, title_block('ja' if jp else 'en', 80 if jp else 68, 42), W/2, 380+dy)
    y = block(img, 560+dy, E['question'], 60, (255, 207, 106), lines=1)
    centered(img, y+30, E['sourcesHead'], font(30), ORANGE)
    src = E['sources']; half = math.ceil(len(src)/2); y1 = y+84
    for i, s in enumerate(src):
        col, row = divmod(i, half)
        draw(img, X0+col*445, y1+row*40, s, fit(s, 25, 430, 'reg', 1, 16), (232, 220, 255))
    y = y1+half*40+30
    y = block(img, y, E['sim'].replace('\n', ' '), 26, LILAC, lines=3)
    y = block(img, y+10, E['walk'].replace('\n', ' '), 24, (255, 226, 184), lines=2, kind='reg')
    y = block(img, y+6, E['check'], 26, (255, 226, 184), lines=1)
    if E.get('parody'):
        fp = font(26); pw = width(E['parody'], fp); panel(img, [W/2-pw/2-16, y+8, W/2+pw/2+16, y+50], fill=YELLOW+(255,), radius=8); centered(img, y+10, E['parody'], fp, INK, x0=0, x1=W); y += 56
    return block(img, y+16, E['data']+' · built with Claude Code', 22, (154, 157, 176), lines=1, kind='reg')


def frame_image(r, lang, base, raw_rgb=None, end=None, credit_alpha=1.0):
    img = band(r, lang, base, end, credit_alpha)
    if section(r.get('shot')) != 'credits' and raw_rgb is not None:
        mid = raw_rgb.crop(CROP).resize((W, MID_H), Image.LANCZOS)
        img.paste(mid, (0, MID_Y))
    if section(r.get('shot')) != 'credits': mid_overlay(img, r, lang)

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
