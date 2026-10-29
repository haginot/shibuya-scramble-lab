"""Build the glyph outlines of the original 3D logotype 「ハロウィンの渋谷を脱出せよ！」 + 「JR編」 + subtitle
「10/31 渋谷からどう帰る？」 (series/ui/logo3d.mjs) → web3d/data/logo_glyphs.json.

Fonts (SIL OFL 1.1, files + licences in web3d/fonts/):
  title     Kaisei Tokumin ExtraBold   (web3d/fonts/KaiseiTokumin-ExtraBold.ttf, OFL-KaiseiTokumin.txt)
  badge     Dela Gothic One            (web3d/fonts/DelaGothicOne-Regular.ttf, OFL-DelaGothicOne.txt)
  subtitle  Zen Kaku Gothic New Black  (web3d/fonts/ZenKakuGothicNew-Black.ttf, OFL-ZenKakuGothicNew.txt)

Each glyph outline is drawn from the font (fontTools), cleaned to non-overlapping contours with the nonzero rule
(skia-pathops), flattened, simplified and laid out by INK box (not advance width, so the lockup is tight) in one
coordinate system: 1 unit = 1 em of the big title glyphs, x right, y up, origin = lockup centre. The script also
derives the plates (shapely): the dark backing slab behind each title line (union of the glyphs grown by an offset,
corners rounded), the ticket-shaped 「JR編」 badge, the subtitle bar and the 「※パロディ」 tag. Nothing here traces
or imitates an existing logo: the layout, plates and ornaments are original.

JSON schema (version 1):
  {"version":1, "unit":"em", "fonts":{key:{file,name,license}}, "bbox":[x0,y0,x1,y1],
   "items":[{"id", "group": title|backing|badge|badgeText|subtitle|subtitleText|parody|parodyText|press|pressText|ornament,
             "line": int, "index": int (reveal order), "char": str?, "depth": suggested extrusion (em),
             "center":[x,y], "bbox":[x0,y0,x1,y1], "polys":[{"o":[[x,y]...], "h":[[[x,y]...]...]}]}]}
  Outer rings are counter-clockwise, holes clockwise (y up).

Also writes web3d/data/logo_halo.png (closed + hole-filled backing SDF for the backdrop halo) and web3d/data/logo_sdf.png (data["sdf"]): signed distance fields over data["sdf"]["rect"] (em), encoded
0.5 + d/(2*range) (d > 0 inside): R = title glyphs, G = backing slabs, B = badge / subtitle bar / ※パロディ tag plates.
logo3d.mjs uses them for edge wear, contact shadows, glow halos and the burn-in reveal.

v11-en (--lang en): the English lockup 「ESCAPE FROM / HALLOWEEN / SHIBUYA!」 + 「JR」 ticket + 「10/31 HOW DO YOU GET HOME?」
→ web3d/data/logo_glyphs_en.json / logo_sdf_en.png / logo_halo_en.png (same fonts: all three have full Latin coverage).

usage: uv run --with fonttools --with skia-pathops --with shapely --with numpy --with scipy --with pillow \
         python tools/build_logo_glyphs.py [--preview out.png]
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pathops
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT/'web3d/fonts'
OUT = ROOT/'web3d/data/logo_glyphs.json'
FONT_FILES = {
    'title': ('KaiseiTokumin-ExtraBold.ttf', 'Kaisei Tokumin ExtraBold', 'SIL OFL 1.1 (OFL-KaiseiTokumin.txt), github.com/google/fonts/tree/main/ofl/kaiseitokumin'),
    'badge': ('DelaGothicOne-Regular.ttf', 'Dela Gothic One', 'SIL OFL 1.1 (OFL-DelaGothicOne.txt), github.com/google/fonts/tree/main/ofl/delagothicone'),
    'sub': ('ZenKakuGothicNew-Black.ttf', 'Zen Kaku Gothic New Black', 'SIL OFL 1.1 (OFL-ZenKakuGothicNew.txt), github.com/google/fonts/tree/main/ofl/zenkakugothicnew'),
}
LANG = 'ja'
TEXT = {
    'ja': {'title': 'ハロウィンの渋谷を脱出せよ！', 'badge': 'JR編', 'subtitle': '10/31 渋谷からどう帰る？', 'parody': '※パロディ',
           'press': 'PRESS START', 'pressSub': '▶ 脱出をはじめる'},
    'en': {'title': 'ESCAPE FROM HALLOWEEN SHIBUYA!', 'badge': 'JR', 'subtitle': '10/31 HOW DO YOU GET HOME?', 'parody': '*PARODY',
           'press': 'PRESS START', 'pressSub': '▶ START THE ESCAPE'},
}
TOL = .0016  # flatten / simplify tolerance (em)


class FlatPen(BasePen):
    """Flattens quadratic / cubic segments into polylines (font units)."""
    def __init__(self, glyphset=None, step=12):
        super().__init__(glyphset)
        self.contours, self.cur, self.step = [], [], step

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        n = max(3, int(math.dist(p0, p3)/self.step))
        for i in range(1, n+1):
            t = i/n; u = 1-t
            self.cur.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0], u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        n = max(3, int(math.dist(p0, p2)/self.step))
        for i in range(1, n+1):
            t = i/n; u = 1-t
            self.cur.append((u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0], u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]))

    def _closePath(self):
        if len(self.cur) > 2: self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


class Font:
    def __init__(self, key):
        file, self.name, self.license = FONT_FILES[key]
        self.file = file
        self.tt = TTFont(FONTS/file)
        self.gs = self.tt.getGlyphSet()
        self.cmap = self.tt.getBestCmap()
        self.upm = self.tt['head'].unitsPerEm

    def glyph(self, ch):
        """Glyph ink as a shapely (Multi)Polygon in em units (y up, baseline 0)."""
        path = pathops.Path()
        self.gs[self.cmap[ord(ch)]].draw(path.getPen())
        path.fillType = pathops.FillType.WINDING
        path.simplify()
        pen = FlatPen(step=self.upm*.012)
        path.draw(pen)
        geom = None
        for c in sorted((Polygon([(x/self.upm, y/self.upm) for x, y in c]).buffer(0) for c in pen.contours), key=lambda p: -p.area):
            geom = c if geom is None else geom.symmetric_difference(c)
        return geom.simplify(TOL)


def polys(geom):
    out = []
    for p in (geom.geoms if isinstance(geom, MultiPolygon) else [geom]):
        if p.is_empty or p.area < 1e-6: continue
        p = orient(p, 1.0)
        ring = lambda r: [[round(x, 4), round(y, 4)] for x, y in list(r.coords)[:-1]]
        out.append({'o': ring(p.exterior), 'h': [ring(i) for i in p.interiors if Polygon(i).area > 1e-6]})
    return out


def as_multi(geom):
    if isinstance(geom, Polygon): return MultiPolygon([geom])
    return MultiPolygon([g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)])


def set_line(font, chars, x0, base, size, gap, kern=None):
    """Lays out chars by ink box: each glyph scaled by size[i], placed gap[i] em after the previous ink."""
    out, x = [], x0
    for i, ch in enumerate(chars):
        s = size[i] if isinstance(size, (list, tuple)) else size
        if ch == ' ':
            x += s*.22; continue
        g = font.glyph(ch)
        g = affinity.scale(g, s, s, origin=(0, 0))
        b = g.bounds
        dx = x-b[0]+(kern[i] if kern else 0)
        g = affinity.translate(g, dx, base)
        out.append((ch, g))
        x = g.bounds[2]+(gap[i] if isinstance(gap, (list, tuple)) else gap)
    return out


def ticket(w, h, notch, chamfer):
    """Train-ticket badge: chamfered rectangle with a half-round punch notch on both short sides."""
    c = chamfer
    p = Polygon([(-w/2+c, -h/2), (w/2-c, -h/2), (w/2, -h/2+c), (w/2, h/2-c), (w/2-c, h/2), (-w/2+c, h/2), (-w/2, h/2-c), (-w/2, -h/2+c)])
    from shapely.geometry import Point
    return p.difference(Point(-w/2, 0).buffer(notch, 24)).difference(Point(w/2, 0).buffer(notch, 24))


def parallelogram(x0, x1, y0, y1, slant):
    return Polygon([(x0, y0), (x1-slant, y0), (x1, y1), (x0+slant, y1)])


def build():
    T, B, S = Font('title'), Font('badge'), Font('sub')
    items = []

    def add(group, ch, geom, line, index, depth):
        b = geom.bounds
        items.append({'id': f'{group}-{len(items)}', 'group': group, 'line': line, 'index': index, 'char': ch, 'depth': depth,
                      'center': [round((b[0]+b[2])/2, 4), round((b[1]+b[3])/2, 4)], 'bbox': [round(v, 4) for v in b], 'polys': polys(geom)})

    # ---- title, three lines (layout in em, y up; recentred at the end) ----
    if LANG == 'en':   # same three-line rhythm: small kicker line, two big lines (≈ the JP lockup's width)
        L0 = set_line(T, 'ESCAPE FROM', 0.02, 2.0, .46, .03)
        L1 = set_line(T, 'HALLOWEEN', -.02, 1.0, .74, .028)
        L2 = set_line(T, 'SHIBUYA!', -.02, -.04, [.86]*7+[.9], [.035]*5+[-.07, .05, 0])
    else:
        L0 = set_line(T, 'ハロウィンの', 0.02, 2.02, .5, .035)
        L1 = set_line(T, '渋谷を', -.02, 1.0, [1.04, 1.04, .7], [.0, .05, 0])
        L2 = set_line(T, '脱出せよ！', -.02, -.04, [1.06, 1.06, .76, .76, .96], [.0, .06, .02, .02, 0])
    lines = [L0, L1, L2]
    # 「を」 / 「せよ」 sit on the baseline of the big kanji; nudge 「！」 a touch lower for a heavy finish.
    title = []
    for li, L in enumerate(lines):
        for ch, g in L: title.append((li, ch, g))

    # ---- JR編 ticket badge right of 「渋谷を」 ----
    l1 = unary_union([g for _, g in L1]).bounds
    l2 = unary_union([g for _, g in L2]).bounds
    bw, bh = 1.24, .66
    bx, by = max(l1[2]+.2+bw/2, l2[2]-bw/2+.02), (l1[1]+l1[3])/2+.03
    plate = affinity.translate(ticket(bw, bh, .085, .06), bx, by)
    jr = set_line(B, 'JR', 0, 0, .42, [.025, 0]) if LANG == 'en' else set_line(B, 'JR編', 0, 0, [.42, .42, .44], [.025, .05, 0])
    jb = unary_union([g for _, g in jr]).bounds
    k = min((bw-.36)/(jb[2]-jb[0]), (bh-.2)/(jb[3]-jb[1]))  # fit inside the ticket (clear of the punch notches)
    jr = [(ch, affinity.scale(g, k, k, origin=(0, 0))) for ch, g in jr]
    jb = unary_union([g for _, g in jr]).bounds
    off = (bx-(jb[0]+jb[2])/2, by-(jb[1]+jb[3])/2)
    jr = [(ch, affinity.translate(g, *off)) for ch, g in jr]

    # ---- subtitle bar 「10/31 渋谷からどう帰る？」 ----
    full = unary_union([g for _, _, g in title]+[plate]).bounds
    sub = set_line(S, '10/31', 0, 0, .3, .012)
    xs = sub[-1][1].bounds[2]+.13
    sub += set_line(S, 'HOW DO YOU GET HOME?', xs, 0, .3, .018) if LANG == 'en' else set_line(S, '渋谷からどう帰る？', xs, 0, .3, .022)
    sg = unary_union([g for _, g in sub]); sb = sg.bounds
    cx = (full[0]+full[2])/2
    sy = full[1]-.42
    off = (cx-(sb[0]+sb[2])/2, sy-(sb[1]+sb[3])/2)
    sub = [(ch, affinity.translate(g, *off)) for ch, g in sub]
    sb = unary_union([g for _, g in sub]).bounds
    bar = parallelogram(sb[0]-.34, sb[2]+.34, sb[1]-.13, sb[3]+.13, .14)

    # ---- ※パロディ tag (top left, above 「ハロウィンの」) ----
    par = set_line(S, TEXT[LANG]['parody'], 0, 0, .2, .012)
    pg = unary_union([g for _, g in par]).bounds
    l0 = unary_union([g for _, g in L0]).bounds
    off = (full[2]-pg[2]-.12, l0[1]+(l0[3]-l0[1])/2-(pg[1]+pg[3])/2)
    par = [(ch, affinity.translate(g, *off)) for ch, g in par]
    pg = unary_union([g for _, g in par]).bounds
    tag = box(pg[0]-.1, pg[1]-.07, pg[2]+.1, pg[3]+.07).buffer(.03, join_style=1)

    # ---- PRESS START (shown in the PRESS START beat, below the subtitle) ----
    press = set_line(S, 'PRESS START', 0, 0, .25, [.03, .03, .03, .03, .14, .03, .03, .03, .03, .03, 0])
    pr = unary_union([g for _, g in press]).bounds
    off = (cx-(pr[0]+pr[2])/2, bar.bounds[1]-.5-(pr[1]+pr[3])/2)
    press = [(ch, affinity.translate(g, *off)) for ch, g in press]
    pr = unary_union([g for _, g in press]).bounds
    press2 = set_line(S, TEXT[LANG]['pressSub'][2:], .2, 0, .17, .015)
    p2 = unary_union([g for _, g in press2]).bounds
    tri = Polygon([(0, p2[1]+.012), (0, p2[3]-.012), (.13, (p2[1]+p2[3])/2)])  # ▶ (drawn: not in the font)
    press2 = [('▶', tri)]+press2
    p2 = unary_union([g for _, g in press2]).bounds
    off = (cx-(p2[0]+p2[2])/2, pr[1]-.17-p2[3])
    press2 = [(ch, affinity.translate(g, *off)) for ch, g in press2]
    # thin rules either side of PRESS START (ornament)
    ry = (pr[1]+pr[3])/2
    rules = [parallelogram(pr[0]-.78, pr[0]-.16, ry-.012, ry+.012, 0), parallelogram(pr[2]+.16, pr[2]+.78, ry-.012, ry+.012, 0)]
    diamonds = [Polygon([(x, ry+.05), (x+.05, ry), (x, ry-.05), (x-.05, ry)]) for x in (pr[0]-.84, pr[2]+.84)]

    # ---- backing slabs: per title line, glyph union grown + closed (rounded) ----
    def slab(geoms, grow, close):
        u = unary_union(geoms).buffer(close, join_style=1).buffer(-close+grow, join_style=1)
        return as_multi(u).simplify(TOL*2)

    # ---- recentre everything on the title+badge+subtitle box ----
    allg = unary_union([g for _, _, g in title]+[plate, bar, tag])
    ab = allg.bounds
    c0 = ((ab[0]+ab[2])/2, (ab[1]+ab[3])/2)
    mv = lambda g: affinity.translate(g, -c0[0], -c0[1])

    idx = 0
    for li, ch, g in title:
        add('title', ch, mv(g), li, idx, .2 if li else .12); idx += 1
    for li, L in enumerate(lines):
        add('backing', None, mv(slab([g for _, g in L], .1 if li else .07, .13 if li else .08)), li, li, .1)
    add('badge', None, mv(plate), 1, 0, .12)
    for i, (ch, g) in enumerate(jr): add('badgeText', ch, mv(g), 1, i, .06)
    add('subtitle', None, mv(bar), 3, 0, .06)
    for i, (ch, g) in enumerate(sub): add('subtitleText', ch, mv(g), 3, i, .035)
    add('parody', None, mv(tag), 4, 0, .04)
    for i, (ch, g) in enumerate(par): add('parodyText', ch, mv(g), 4, i, .02)
    for i, (ch, g) in enumerate(press): add('pressText', ch, mv(g), 5, i, .03)
    for i, (ch, g) in enumerate(press2): add('pressSub', ch, mv(g), 5, i, .015)
    for i, g in enumerate(rules+diamonds): add('ornament', None, mv(g), 5, i, .02)

    every = unary_union([mv(g) for _, _, g in title]+[mv(plate), mv(bar), mv(tag)]+[mv(g) for _, g in press2]).bounds
    data = {'version': 1, 'unit': 'em',
            'fonts': {k: {'file': f'web3d/fonts/{v[0]}', 'name': v[1], 'license': v[2]} for k, v in FONT_FILES.items()},
            'text': dict(TEXT[LANG]), 'lang': LANG,
            'bbox': [round(v, 4) for v in every], 'items': items}
    return data


SDF_RANGE = .36
SDF_SIZE = 1024


def build_sdf(data, out):
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy.ndimage import distance_transform_edt as edt
    x0, y0, x1, y1 = data['bbox']
    m = .25
    rect = [round(x0-m, 4), round(y0-m, 4), round(x1+m, 4), round(y1+m, 4)]
    W = H = SDF_SIZE; SS = 2  # supersampled masks
    chans = {'R': ['title'], 'G': ['backing'], 'B': ['badge', 'subtitle']}  # no ※パロディ plate (steering 2026-10-26)
    planes = []
    for groups in chans.values():
        im = Image.new('L', (W*SS, H*SS), 0); d = ImageDraw.Draw(im)
        P = lambda q: ((q[0]-rect[0])/(rect[2]-rect[0])*W*SS, (1-(q[1]-rect[1])/(rect[3]-rect[1]))*H*SS)
        for it in data['items']:
            if it['group'] not in groups: continue
            for p in it['polys']:
                d.polygon([P(q) for q in p['o']], fill=255)
                for h in p['h']: d.polygon([P(q) for q in h], fill=0)
        mask = np.asarray(im.resize((W, H), Image.BOX), dtype=np.float32)/255 > .5
        px = (rect[2]-rect[0])/W  # em per pixel (x); y nearly equal
        dist = (edt(mask)-edt(~mask))*px
        planes.append(np.clip(.5+dist/(2*SDF_RANGE), 0, 1))
        if groups == ['backing']: halo_mask, halo_px = mask, px
    img = (np.stack(planes, -1)*255+.5).astype(np.uint8)
    Image.fromarray(img, 'RGB').save(out, optimize=True)
    # halo field (fixer 2026-10-26, QA: stray glow rings in the counters of 谷 / between 渋 and 谷 / a dot under 渋): the
    # backing mask with narrow gaps closed (≈.05 em), every enclosed hole filled and tiny islands dropped → logo_halo.png
    # (grey SDF, same rect/range); only the halo of the backdrop pass (logo3d.mjs BACK_FS) reads it.
    from scipy.ndimage import binary_closing, binary_fill_holes, label
    r = max(1, int(round(.05/halo_px)))
    yy, xx = np.mgrid[-r:r+1, -r:r+1]
    hm = binary_fill_holes(binary_closing(halo_mask, structure=(xx*xx+yy*yy) <= r*r, iterations=1))
    lab, n = label(hm)
    if n:
        sizes = np.bincount(lab.ravel()); keep = sizes > (.08/halo_px)**2; keep[0] = False; hm = keep[lab]
    hd = (edt(hm)-edt(~hm))*halo_px
    halo = (np.clip(.5+hd/(2*SDF_RANGE), 0, 1)*255+.5).astype(np.uint8)
    hout = Path(out).with_name('logo_halo_en.png' if LANG == 'en' else 'logo_halo.png'); Image.fromarray(halo, 'L').save(hout, optimize=True)
    return {'file': 'web3d/data/'+Path(out).name, 'rect': rect, 'range': SDF_RANGE, 'channels': {k: v for k, v in chans.items()},
            'halo': 'web3d/data/'+hout.name}


def preview(data, out):
    from PIL import Image, ImageDraw
    x0, y0, x1, y1 = data['bbox']
    s = 1800/(x1-x0+.4)
    W, H = 1800, int((y1-y0+.4)*s)
    im = Image.new('RGB', (W, H), '#101014'); d = ImageDraw.Draw(im)
    col = {'backing': '#2a2030', 'title': '#f0d9b5', 'badge': '#0c8a4f', 'badgeText': '#ffffff', 'subtitle': '#1a1520', 'subtitleText': '#ffb35c',
           'parody': '#ffd23f', 'parodyText': '#111111', 'pressText': '#ffffff', 'pressSub': '#cccccc', 'ornament': '#ff8a2a'}
    P = lambda pt: ((pt[0]-x0+.2)*s, H-(pt[1]-y0+.2)*s)
    for it in sorted(data['items'], key=lambda i: ['backing', 'subtitle', 'parody', 'badge'].index(i['group']) if i['group'] in ['backing', 'subtitle', 'parody', 'badge'] else 9):
        for p in it['polys']:
            d.polygon([P(q) for q in p['o']], fill=col[it['group']])
            for h in p['h']: d.polygon([P(q) for q in h], fill='#2a2030' if it['group'] == 'title' else '#101014')
    im.save(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=None)
    ap.add_argument('--lang', default='ja', choices=['ja', 'en'])
    ap.add_argument('--preview', help='also write a flat 2D PNG of the layout')
    a = ap.parse_args()
    LANG = a.lang
    a.out = a.out or str(OUT.with_name('logo_glyphs_en.json') if LANG == 'en' else OUT)
    data = build()
    if LANG == 'ja': del data['lang']   # the JP file stays byte-identical
    data['sdf'] = build_sdf(data, Path(a.out).with_name('logo_sdf_en.png' if LANG == 'en' else 'logo_sdf.png'))
    Path(a.out).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(p['o'])+sum(len(h) for h in p['h']) for it in data['items'] for p in it['polys'])
    print(f'{a.out}: {len(data["items"])} items, {n} outline points, bbox {data["bbox"]}, {Path(a.out).stat().st_size//1024} KiB')
    if a.preview: preview(data, a.preview)
