#!/usr/bin/env python3
"""JR v9 guide character 「おばけ」 (logs/ssl-claude-halloween/v9/STEERING-guide-ghost.md + STEERING-ghost-voice.md).

An ORIGINAL little ghost drawn procedurally here (round white sheet, tiny orange party hat, big simple eyes, stubby arms):
a silly, slightly dim ghost who happens to know every exit and gate move in Shibuya. It explains every scene in short,
casual speech bubbles (<= 2 lines x 20 chars, readable for 1.0 s + 0.12 s/char). It is a friendly narrator only — never a
monster or attacker, and it looks nothing like the costumed crowd or the game zombies. It stays silent during the caught
sequence, the GAME OVER / GAME CLEAR stamps (no jokes there), and its crush-POV lines are serious.

Numbers the ghost quotes are taken from the sim output / the sim-generated HUD (nums[] of every line; tests/test_v9.py
re-checks them against the files).

Placement: never in the TikTok/Reels zones (bottom 20 %, right 15 %, top 12 %); per beat the ghost + bubble box is placed
on the left edge where the beat's HUD layer (HUD-only probe frames, tools/render_v9.py probe) is empty — preferring the
lower-left, else anywhere on the left; overlap with the HUD is recorded (and must be 0, tests/test_v9.py).

usage: python3 tools/v9_ghost.py write            lines + timing → web3d/shibuya/series/variants/jr/v9/ghost.json
       python3 tools/v9_ghost.py place <pair>|all  boxes from the HUD probe frames ($WORK/<who>/probe) → ghost.json
       python3 tools/v9_ghost.py preview <pair> t  one PNG of the overlay at video time t (on grey) → /tmp
"""
from __future__ import annotations

import json
import math
import sys
from functools import lru_cache
from pathlib import Path

try:   # drawing / placement need numpy + Pillow; the line table and rules (tests) do not
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover
    np = Image = ImageDraw = ImageFilter = ImageFont = None

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
V9 = ROOT/'web3d/shibuya/series/variants/jr/v9'
GHOST_JSON = V9/'ghost.json'
FONT = ROOT/'web3d/fonts/ZenKakuGothicNew-Black.ttf'
W, H, FPS = 1080, 1920, 30
PAIRS = ('gate', 'taxi', 'zone', 'alt')

# TikTok/Reels UI safe zones (STEERING-guide-ghost; the v6–v8 footnote-zone constants: bottom 20 %, right 15 %; top 12 %)
SAFE = dict(x0=42, x1=int(W*.85), y0=int(H*.12), y1=int(H*.80))
MAX_LINES, MAX_CHARS = 2, 20
READ_BASE, READ_PER_CHAR = 1.0, 0.12
SILENT_BEATS = ('caught', 'over-stamp', 'clear-stamp', 'goodbye')   # no ghost at all in these beats (goodbye: the card fills
# the frame and the ghost must never sit on the 渋谷区 quote box — it introduces the card at the end of the kaiju beat instead)

# ghost + bubble geometry (px at 1080x1920)
GW, GH = 128, 150             # ghost sprite box
FS, LH, PADX, PADY = 34, 46, 22, 18
GAP = 4
# beats where the best free spot still touches a HUD element (checked by eye on the QA sheets; tests/test_v9.py allows only
# these, with the reason): SIM PICK — the panel grows a verdict row, the only gap left is next to a route pin on the map
# (overlap = with the HUD dilated by 12 px; core = with the HUD itself: core must be 0 except in these beats)
ALLOW_OVERLAP = {'sim-pick': 'touches a route pin marker on the map only (panel rows, SIM PICK highlight, meters, labels stay clear)',
                 'over-choice': 'taxi / alt: grazes the soft glow edge of a map pin (< 1000 px), no text or panel covered'}
_cc = lambda *c: ''.join(map(chr, c))
JARGON = ('ヒートマップ', 'エージェント', '密度', 'ソルバー', '最適化', 'スコア')
# + the project's banned names (spelled via code points, as tests/test_copy_variants.py does)
BANNED = JARGON+(_cc(101, 110, 97, 98, 108, 101, 88), _cc(0x30AB, 0x30F3, 0x30EA, 0x30FC), _cc(99, 97, 110, 108, 121), _cc(99, 97, 110, 45, 108, 121))

# ---------------------------------------------------------------- the lines (casual, silly, Shibuya-nerd ghost)
# per pair: name of the GAME OVER (gut) route and of the sim pick, in plain words
OVER = dict(gate='ハチ公改札', taxi='西口の乗り場', zone='最短の道', alt='恵比寿')
PICK = dict(gate='新南改札', taxi='SAKURAテラス前', zone='外側の道', alt='原宿')


def lines_of(pair, crush, cfg):
    """[(beat, at, text, nums)] — at = beat-local start (s)."""
    floor_peak = int(math.floor(crush['pov'][pair]['peak']))
    pin = lambda beat: next(h['ja'] for b in cfg['beats'] if b['id'] == beat for h in b['hud'] if h['c'] == 'pin')
    agents = dict(quote='4万8千人', value=48000, src='sim:plan.agents')
    L = [
        ('op-fly', 1.2, 'やっほー！渋谷の道なら\nぜんぶ知ってるおばけだよ', []),
        ('mission', .1, 'ミッションは\n「近づくな」だって', []),
        ('rules', .45, 'わ、仮装だらけ！\nでも人、多すぎない？', []),
        ('first-choice', .4, 'Aは「行かない」。\nそれ、アリなんだ！？', []),
        ('true-end', .3, '行かないのが最強！\nだからTRUE END〜', []),
        ('guide', .2, '来ちゃった人は\nこっち見てね', []),
        ('over-start', .3, 'ここがスタート。\nどの道で行こっか〜', []),
        ('sim-plan', .3, '赤いとこは\n人ぎゅうぎゅうってこと', []),
        ('sim-plan', 3.5, 'この点々ぜんぶ人ね。\n4万8千人、数えたよ〜', [agents]),
        ('sim-plan', 7.3, '道ごとに時間と混み方と\n危なさを比べてるの', []),
        # why the gold route is the SIM PICK, in the pair's own terms (score = time + crowd penalty; ✕ = ruled out)
        ('sim-pick', .4, {'gate': '金色の道が、混み方も\n入れるといちばん早い！', 'alt': '金色の道が、混み方も\n入れるといちばん早い！',
                          'taxi': '西口はお休み中だから\n金色の道が正解！', 'zone': '赤枠を通らない\n金色の道が正解！'}[pair], []),
        ('over-choice', .3, {'gate': 'でも近い方に\n行きたくなるよね〜', 'zone': 'でも近い方に\n行きたくなるよね〜',
                             'taxi': '駅前の乗り場で\nいい気がするよね〜', 'alt': '終電遅い方が\n安心な気がするよね〜'}[pair], []),
        ('over-move', .4, '改札前の通路、\nUターンするんだよ〜' if pair == 'gate' else 'あ、そっち行ったら\nハマるやつ〜', []),
        ('over-result', .4, {'gate': 'やばっ、列が\nぜんぜん進まない', 'taxi': 'えっ、乗り場が\nお休み中！？',
                             'zone': 'やばっ、規制で\n前に進めない〜', 'alt': 'えっ、着いたら\n終電行っちゃった…'}[pair], []),
        ('crush-pov', .4, 'シミュレーションだと\n一歩も動けないくらい', []),
        ('crush-pov', 4.4, f'1m²に{floor_peak}人以上。\n押されても逃げられない',
         [dict(quote=str(floor_peak), value=crush['pov'][pair]['peak'], src=f'sim:crush.pov.{pair}.peak', rule='floor')]),
        ('over-lesson', .4, {'gate': 'みんなと同じ道は\nハマりやすいんだよね', 'taxi': '乗り場、ちゃんと\n調べとかないとね〜',
                             'zone': '赤枠の中は\n通れないことあるの', 'alt': '終電が遅くても\n着くのが遅いとダメ〜'}[pair], []),
        ('continue', .3, 'もう1回やろ！', []),
    ]
    if pair == 'gate':
        L.append(('retry-why', .3, '改札前、1m²に4人！\n15分たっても通れない〜',
                  [dict(quote='4', value=4.0, src='cfg:retry-why.pin', match='4.0人/m²'), dict(quote='15分', value=15, src='cfg:retry-why.pin', match='15分')]))
    elif pair == 'taxi':
        L.append(('retry-why', .3, '乗り場、去年の3月から\nお休みしてたの〜', [dict(quote='3月', value=3, src='cfg:retry-why.pin', match='2025年3月30日')]))
    elif pair == 'zone':
        L.append(('retry-why', .3, '赤枠の中、1m²に4人。\nしかも規制あり〜', [dict(quote='4', value=4.0, src='cfg:retry-why.pin', match='4.0人/m²')]))
    else:
        L.append(('retry-why', .3, '恵比寿に0:51着。\n終電0:50に1分遅刻〜',
                  [dict(quote='0:51', value='0:51', src='cfg:retry-why.pin', match='0:51'), dict(quote='0:50', value='0:50', src='cfg:retry-why.pin', match='0:50')]))
    L += [
        ('clear-choice', .2, '混む時間に合わせて\nもう1回計算したよ', []),
        ('clear-choice', 3.8, f'やっぱり{PICK[pair]}が\nいちばんいい！' if pair != 'zone' else 'やっぱり外側の道！\n赤枠を通らないから', []),
        ('clear-move', .4, 'この道ならスイスイ〜', []),
        ('clear-pov', .2, 'ほら、こっちは\nすいてるでしょ', []),
        ('clear-result', .5, {'gate': 'やったー！\n電車乗れた〜！', 'taxi': 'やったー！\nタクシー乗れた〜', 'zone': 'やったー！\n原宿まで歩けた〜',
                              'alt': 'やったー！\n終電間に合った〜'}[pair], []),
        ('clear-cheat', .3, 'このメモ、\nスクショしといて〜', []),
        ('kaiju', .3, 'えっ、怪獣！？\n次は渋谷区のお知らせ', []),
        ('sources', .3, '見てくれてありがと〜\nまたね！', []),
    ]
    for beat, _, text, nums in L:
        for n in nums: assert n['quote'] in text, (beat, n, text)
        if any(n['src'].startswith('cfg:') for n in nums): assert all(n['match'] in pin(beat) for n in nums), (beat, pin(beat))
    return L


def nchars(text): return len(text.replace('\n', ''))


def read_time(text): return round(READ_BASE+READ_PER_CHAR*nchars(text), 2)


def check_text(text):
    rows = text.split('\n')
    assert len(rows) <= MAX_LINES and all(len(r) <= MAX_CHARS for r in rows), text
    assert not any(b.lower() in text.lower() for b in BANNED), text


def beat_table(pair):
    from render_v9 import timeline
    tl = timeline(pair); out = {}
    for part in ('opening', 'body'):
        off = tl['parts'][part]['offset']
        for b in tl['parts'][part]['beats']:
            out[b['id']] = dict(part=part, t0=round(off+b['f0']/FPS, 4), t1=round(off+b['f1']/FPS, 4), f0=b['f0'], f1=b['f1'], off=off)
    return out


def write():
    crush = json.loads((V9/'sim/crush.json').read_text(encoding='utf-8'))
    old = json.loads(GHOST_JSON.read_text(encoding='utf-8')) if GHOST_JSON.exists() else {}
    res = dict(generated='tools/v9_ghost.py write (do not edit by hand)', character=dict(
        name='おばけ', design='original, procedural (tools/v9_ghost.py draw_ghost): round white sheet body, tiny orange party hat, big simple eyes, stubby arms'),
        rules=dict(maxLines=MAX_LINES, maxChars=MAX_CHARS, readBase=READ_BASE, readPerChar=READ_PER_CHAR, silentBeats=list(SILENT_BEATS), jargon=list(JARGON)),
        safe=SAFE, pairs={})
    for pair in PAIRS:
        cfg = json.loads((V9/f'{pair}.json').read_text(encoding='utf-8'))
        bt = beat_table(pair); lines = []
        for i, (beat, at, text, nums) in enumerate(lines_of(pair, crush, cfg)):
            check_text(text)
            t0 = round(bt[beat]['t0']+at, 3); t1 = round(t0+read_time(text), 3)
            lines.append(dict(id=f'{pair}-{i:02d}', beat=beat, at=at, t0=t0, t1=t1, text=text, chars=nchars(text), nums=nums))
        lines.sort(key=lambda l: l['t0'])
        for i, ln in enumerate(lines): ln['id'] = f'{pair}-{i:02d}'
        for a, b in zip(lines, lines[1:]): assert b['t0']-a['t1'] >= .2, (a, b)
        for ln in lines:   # a line may run on into the next beat, but never into a silent beat
            for k, b in bt.items():
                if k in SILENT_BEATS: assert ln['t1'] <= b['t0'] or ln['t0'] >= b['t1'], (ln, k)
        prev = {x['id']: x for x in old.get('pairs', {}).get(pair, {}).get('lines', [])}
        for ln in lines:   # keep a previous placement while the line / window is unchanged
            p = prev.get(ln['id'])
            if p and p['text'] == ln['text'] and p['t0'] == ln['t0'] and p['t1'] == ln['t1'] and 'box' in p:
                for k in ('box', 'ghost', 'bubble', 'flip', 'overlap', 'core', 'probes'): ln[k] = p.get(k)
        res['pairs'][pair] = dict(duration=max(b['t1'] for b in bt.values()), lines=lines)
    GHOST_JSON.write_text(json.dumps(res, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    print('wrote', GHOST_JSON.relative_to(ROOT), {p: len(v['lines']) for p, v in res['pairs'].items()})


# ---------------------------------------------------------------- geometry
@lru_cache(maxsize=4)
def font(size=FS): return ImageFont.truetype(str(FONT), size)


def bubble_size(text):
    f = font(); rows = text.split('\n')
    tw = max(f.getbbox(r)[2]-f.getbbox(r)[0] for r in rows)
    return int(tw+2*PADX), int(len(rows)*LH+2*PADY-(LH-FS)*.4)


def layout(box_xy, bw, bh, flip=False):
    """ghost at the left, bubble to its right (tail pointing at the ghost), both bottom-aligned; flip: bubble left, ghost right."""
    x, y = box_xy; hh = max(GH, bh)
    if flip:
        b = (x, y+hh-bh-26, x+bw, y+hh-26)
        g = (x+bw+GAP, y+hh-GH, x+bw+GAP+GW, y+hh)
        return g, b, (x, min(g[1], b[1]), g[2], y+hh)
    g = (x, y+hh-GH, x+GW, y+hh)
    b = (x+GW+GAP, y+hh-bh-26, x+GW+GAP+bw, y+hh-26)
    return g, b, (x, min(g[1], b[1]), max(g[2], b[2]), y+hh)


def place(pair):
    from render_v9 import WORK
    G = json.loads(GHOST_JSON.read_text(encoding='utf-8'))
    bt = beat_table(pair); lines = G['pairs'][pair]['lines']
    # group lines per beat (one box per beat: the ghost does not hop around inside a beat)
    groups = {}
    for ln in lines: groups.setdefault(ln['beat'], []).append(ln)
    for beat, lns in groups.items():
        t0, t1 = min(l['t0'] for l in lns)-.15, max(l['t1'] for l in lns)+.25
        mask = np.zeros((H, W), bool); probes = 0
        for k, b in bt.items():
            if b['t1'] <= t0 or b['t0'] >= t1: continue
            who = 'opening' if b['part'] == 'opening' else pair
            d = WORK/who/'probe'/b['part']
            fa, fb = int(round((max(t0, b['t0'])-b['off'])*FPS)), int(round((min(t1, b['t1'])-b['off'])*FPS))
            for f in sorted(d.glob('f*.png')):
                n = int(f.stem[1:])
                if fa <= n < fb:
                    al = np.asarray(Image.open(f).convert('RGBA'))[..., 3].astype(np.int16)
                    # card beats lay a dim full-frame backdrop (alpha ~150–210) under the card: HUD = clearly above it
                    a = (al >= 240) | (al > np.median(al)+35)
                    mask |= a; probes += 1
        assert probes, (pair, beat, 'no HUD probe frames')
        # dilate the HUD mask (keep a margin around panels / captions)
        m = Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25))
        ii = (np.asarray(m) > 0).astype(np.int32).cumsum(0).cumsum(1)
        ii = np.pad(ii, ((1, 0), (1, 0)))
        area = lambda x0, y0, x1, y1: int(ii[y1, x1]-ii[y0, x1]-ii[y1, x0]+ii[y0, x0])
        raw = np.pad(mask.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        core = lambda r: int(raw[r[3], r[2]]-raw[r[1], r[2]]-raw[r[3], r[0]]+raw[r[1], r[0]])
        bw = max(bubble_size(l['text'])[0] for l in lns); bh = max(bubble_size(l['text'])[1] for l in lns)
        best = None
        hh = max(GH, bh); tw = GW+GAP+bw
        assert SAFE['x0']+tw <= SAFE['x1'], (pair, beat, tw)
        pref_y = SAFE['y1']-hh-12
        for flip in (False, True):
            for x in range(SAFE['x0'], SAFE['x1']-tw+1, 12):
                for y in range(SAFE['y0'], SAFE['y1']-hh+1, 6):
                    g, b, box = layout((x, y), bw, bh, flip)
                    ov = area(g[0], g[1], g[2], g[3])+area(b[0], b[1], b[2], b[3])
                    score = (core(g)+core(b), ov, flip, abs(y-pref_y)/H+(x-SAFE['x0'])/W*.5)
                    if best is None or score < best[0]: best = (score, g, b, box, flip)
        (_, ov, _, _), g, b, box, flip = best
        for l in lns:
            l.update(box=list(box), ghost=list(g), bubble=list(b), flip=flip, overlap=ov, core=core(g)+core(b), probes=probes)
        print(f'{pair} {beat:12s} probes={probes:3d} box={box} core={core(g)+core(b)} overlap={ov}')
    GHOST_JSON.write_text(json.dumps(G, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')


# ---------------------------------------------------------------- drawing
INK = (52, 22, 78, 255)        # dark purple outline / text
SHEET = (252, 250, 255, 255)
SHADE = (214, 204, 240, 255)
HAT = (255, 138, 28, 255)
HAT2 = (255, 214, 64, 255)
CHEEK = (255, 150, 186, 200)


def draw_ghost(t, blink=False, wave=0.0, S=2):
    """the original ghost, supersampled S×: returns an RGBA sprite of GW×GH."""
    w, h = GW*S, GH*S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx = w/2; top = 34*S; r = 46*S; bottom = h-10*S
    o = 4*S
    # body: dome + straight sides + a scalloped hem (3 bumps) that ripples
    def body(dr, fill, grow):
        dr.ellipse((cx-r-grow, top-grow, cx+r+grow, top+2*r+grow), fill=fill)
        dr.rectangle((cx-r-grow, top+r, cx+r+grow, bottom-14*S), fill=fill)
        for i in range(3):
            bx = cx-r+(i+.5)*(2*r/3); by = bottom-14*S+4*S*math.sin(t*5+i*2.1)
            dr.ellipse((bx-r/3-grow, by-16*S-grow, bx+r/3+grow, by+12*S+grow), fill=fill)
    # stubby arms (wave)
    for side in (-1, 1):
        ang = (.35+(wave if side > 0 else .15*math.sin(t*3))) * side
        ax, ay = cx+side*(r-4*S), top+r+14*S
        ex, ey = ax+side*22*S*math.cos(ang), ay-22*S*math.sin(abs(ang))
        d.line((ax, ay, ex, ey), fill=INK, width=int(22*S))
        d.line((ax, ay, ex, ey), fill=SHEET, width=int(14*S))
        d.ellipse((ex-11*S, ey-11*S, ex+11*S, ey+11*S), fill=INK); d.ellipse((ex-7*S, ey-7*S, ex+7*S, ey+7*S), fill=SHEET)
    body(d, INK, o); body(d, SHEET, 0)
    # soft lilac shade on the right
    sh = Image.new('L', (w, h), 0); sd = ImageDraw.Draw(sh); body(sd, 255, 0)
    rim = Image.new('L', (w, h), 0); ImageDraw.Draw(rim).ellipse((cx-r*.55, top-r*.2, cx+r*1.9, h+r), fill=150)
    from PIL import ImageChops
    im.paste(Image.new('RGBA', (w, h), SHADE), (0, 0), ImageChops.multiply(sh, rim.filter(ImageFilter.GaussianBlur(10*S))))
    # face: big simple eyes (blink), cheeks, small open mouth
    ey = top+r*.95
    for side in (-1, 1):
        ex = cx+side*17*S
        if blink: d.line((ex-8*S, ey, ex+8*S, ey), fill=INK, width=int(4*S))
        else:
            d.ellipse((ex-8*S, ey-11*S, ex+8*S, ey+11*S), fill=INK)
            d.ellipse((ex-4*S, ey-8*S, ex+1*S, ey-2*S), fill=(255, 255, 255, 255))
        d.ellipse((ex+side*10*S-8*S, ey+12*S, ex+side*10*S+8*S, ey+19*S), fill=CHEEK)
    d.ellipse((cx-6*S, ey+13*S, cx+6*S, ey+23*S), fill=INK)
    d.ellipse((cx-3.5*S, ey+18*S, cx+3.5*S, ey+23*S), fill=(255, 120, 130, 255))
    # tiny orange party hat (tilted), stripes + pompom
    hx, hy = cx+14*S, top+6*S
    tip = (hx+10*S, hy-40*S)
    base = [(hx-18*S, hy+4*S), (hx+20*S, hy-2*S)]
    d.polygon([base[0], base[1], tip], fill=INK)
    d.polygon([(base[0][0]+4*S, base[0][1]-2*S), (base[1][0]-3*S, base[1][1]-3*S), (tip[0], tip[1]+6*S)], fill=HAT)
    for k in (.33, .62):
        p0 = (base[0][0]+(tip[0]-base[0][0])*k, base[0][1]+(tip[1]-base[0][1])*k)
        p1 = (base[1][0]+(tip[0]-base[1][0])*k, base[1][1]+(tip[1]-base[1][1])*k)
        d.line((p0, p1), fill=HAT2, width=int(5*S))
    d.ellipse((tip[0]-8*S, tip[1]-8*S, tip[0]+8*S, tip[1]+8*S), fill=INK)
    d.ellipse((tip[0]-5*S, tip[1]-5*S, tip[0]+5*S, tip[1]+5*S), fill=HAT2)
    return im.resize((GW, GH), Image.LANCZOS)


@lru_cache(maxsize=256)
def bubble_img(text, n_shown, bw, bh, flip=False):
    S = 2
    im = Image.new('RGBA', ((bw+30)*S, (bh+40)*S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x0, y0 = 26*S, 8*S; x1, y1 = x0+bw*S, y0+bh*S
    # drop shadow, outline, fill; tail toward the ghost (lower left)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((x0+6*S, y0+8*S, x1+6*S, y1+8*S), 24*S, fill=(10, 0, 20, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6*S)))
    tail = [(x0+6*S, y1-34*S), (x0-22*S, y1+14*S), (x0+40*S, y1-6*S)]
    d.polygon(tail, fill=INK); d.rounded_rectangle((x0, y0, x1, y1), 24*S, fill=INK)
    k = 4*S
    d.rounded_rectangle((x0+k, y0+k, x1-k, y1-k), 20*S, fill=(255, 255, 255, 255))
    d.polygon([(tail[0][0]+k, tail[0][1]), (tail[1][0]+3*k, tail[1][1]-2.6*k), (tail[2][0]-k, tail[2][1]-k)], fill=(255, 255, 255, 255))
    if flip:   # bubble left of the ghost: mirror the shape (tail toward the lower right); the text is drawn after
        im = im.transpose(Image.FLIP_LEFT_RIGHT); d = ImageDraw.Draw(im); x0 = im.width-x1
    f = ImageFont.truetype(str(FONT), FS*S)
    shown = 0
    for i, row in enumerate(text.split('\n')):
        part = row[:max(0, n_shown-shown)]; shown += len(row)
        if part: d.text((x0+PADX*S, y0+PADY*S+i*LH*S-4*S), part, font=f, fill=INK)
    return im.resize((bw+30, bh+40), Image.LANCZOS)


def ease_back(u):
    u = min(1.0, max(0.0, u)); c = 1.7
    return 1+(c+1)*(u-1)**3+c*(u-1)**2


class Overlay:
    """per-frame ghost + bubble for one pair (tools/v9_composite.py calls apply(rgb float array, t))."""
    def __init__(self, pair, data=None):
        G = data or json.loads(GHOST_JSON.read_text(encoding='utf-8'))
        self.lines = G['pairs'][pair]['lines']
        assert all('box' in l for l in self.lines), f'ghost not placed for {pair}: python3 tools/v9_ghost.py place {pair}'
        # visibility spans: consecutive lines in the same box with < 1.2 s gap keep the ghost on screen
        self.spans = []
        for l in self.lines:
            s = self.spans[-1] if self.spans else None
            if s and s['box'] == l['box'] and l['t0']-s['t1'] < 1.2: s['t1'] = l['t1']; s['lines'].append(l)
            else: self.spans.append(dict(box=l['box'], t0=l['t0'], t1=l['t1'], lines=[l]))

    def layer(self, t):
        s = next((s for s in self.spans if s['t0']-.2 <= t < s['t1']+.25), None)
        if s is None: return None
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        gx0, gy0 = s['lines'][0]['ghost'][:2]
        pin = ease_back((t-(s['t0']-.2))/.3); pout = 1-min(1, max(0, (t-s['t1'])/.25))
        sc = max(.01, pin*pout)
        blink = (t*1.0) % 3.1 < .12
        wave = .5*max(0, math.sin((t-s['t0'])*6)) if t-s['t0'] < 1.0 else 0
        spr = draw_ghost(t, blink, wave)
        if sc < .999: spr = spr.resize((max(1, int(GW*sc)), max(1, int(GH*sc))), Image.LANCZOS)
        bob = 6*math.sin(t*2*math.pi*.8)
        lay.alpha_composite(spr, (int(gx0+(GW-spr.width)/2), int(gy0+GH-spr.height+bob)))
        l = next((l for l in s['lines'] if l['t0'] <= t < l['t1']+.12), None)
        if l is not None:
            bw, bh = l['bubble'][2]-l['bubble'][0], l['bubble'][3]-l['bubble'][1]
            n = int(min(l['chars'], (t-l['t0'])*40)+1)          # quick typewriter (40 chars/s)
            flip = bool(l.get('flip'))
            im = bubble_img(l['text'], n, bw, bh, flip)
            u = ease_back((t-l['t0'])/.2); a = 1-min(1, max(0, (t-l['t1'])/.12))
            if u < .999:
                im = im.resize((max(1, int(im.width*(.6+.4*u))), max(1, int(im.height*(.6+.4*u)))), Image.LANCZOS)
            if a < 1: im.putalpha(Image.fromarray((np.asarray(im)[..., 3]*a).astype(np.uint8)))
            bx, by = l['bubble'][0]-(4 if flip else 26), l['bubble'][1]-8
            lay.alpha_composite(im, (int(bx), int(by+(1-min(1, u))*20)))
        return lay

    def apply(self, a, t):
        lay = self.layer(t)
        if lay is None: return a
        x = np.asarray(lay, np.float32); al = x[..., 3:4]/255
        return a*(1-al)+x[..., :3]*al


def main(argv):
    if not argv: print(__doc__); return 2
    if argv[0] == 'write': write(); return 0
    if argv[0] == 'place':
        for p in (PAIRS if argv[1] == 'all' else [argv[1]]): place(p)
        return 0
    if argv[0] == 'sheet':   # QA: every line's mid-time bubble on top of the beat's HUD probe frame (grey backdrop) → contact sheet
        from render_v9 import WORK
        pair, out = argv[1], Path(argv[2]); ov = Overlay(pair); bt = beat_table(pair); tiles = []
        for l in ov.lines:
            t = (l['t0']+l['t1'])/2; b = next(b for b in bt.values() if b['t0'] <= t < b['t1'])
            who = 'opening' if b['part'] == 'opening' else pair; f = int(round((t-b['off'])*FPS)); f -= f % 6
            hud = Image.open(WORK/who/'probe'/b['part']/f'f{f:05d}.png').convert('RGBA')
            bg = Image.new('RGBA', (W, H), (70, 90, 70, 255)); bg.alpha_composite(hud)
            a = ov.apply(np.asarray(bg.convert('RGB'), np.float32), t)
            im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
            d.rectangle((SAFE['x0'], SAFE['y0'], SAFE['x1'], SAFE['y1']), outline=(255, 0, 0), width=4)
            d.text((20, 20), f"{t:6.2f}s {l['beat']}", font=font(48), fill=(255, 255, 0))
            tiles.append(im.resize((270, 480)))
        cols = 7; rows = -(-len(tiles)//cols); sheet = Image.new('RGB', (cols*270, rows*480))
        for i, im in enumerate(tiles): sheet.paste(im, ((i % cols)*270, (i//cols)*480))
        sheet.save(out); print(out); return 0
    if argv[0] == 'preview':
        pair, t = argv[1], float(argv[2]); ov = Overlay(pair)
        bg = np.full((H, W, 3), 90, np.float32); out = ov.apply(bg, t)
        p = Path(f'/tmp/ghost-{pair}-{t:.2f}.png'); Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(p); print(p); return 0
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
