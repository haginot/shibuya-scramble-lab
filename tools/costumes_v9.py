#!/usr/bin/env python3
"""JR v9 Halloween costumes for the photoreal plates (logs/ssl-claude-halloween/v9/STEERING-costumes.md).

The class table is web3d/shibuya/series/costumes-v9.json (shared with the page: series/costumes-v9.mjs, same hash → the
same class for the same id). Here: the Python port of the assignment and the procedural costumed figures drawn by
tools/v9_composite.py on the plates (crowd silhouettes v7/v8 → costumed figures) and in the crush POV.

Rules (enforced by construction, checked by tests/test_v9.py):
  * costumed people are ONLY a passive festival crowd: they stand, sway, shuffle or walk away; nobody reaches toward the
    camera, nobody chases, no monster bodies (every class is a person in a costume, arms down / at the sides);
  * faces are never drawn: figures are seen from the back (hair / hood / hat / costume head), or wear a full costume head
    (pumpkin, mascot, sheet, box) — no eyes, mouth or skin detail of a real face, no logos, no text, no known characters;
  * cartoonish fake makeup only: the nurse's red is a stylised print (dots / zigzag), the zombie makeup is a grey-green
    skin tone and torn hems — no wounds, no gore;
  * the GAME OVER attackers are NOT drawn here: they are the fictional game-zombie sprites (`ATTACKERS`, drawn by
    attackers_layer() only in the caught beat) — disjoint from the costume classes.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

try:   # drawing needs numpy + Pillow (compositor env); the table / assignment do not (tests run without them)
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    np = Image = ImageDraw = ImageFilter = None

ROOT = Path(__file__).resolve().parents[1]
TABLE = json.loads((ROOT/'web3d/shibuya/series/costumes-v9.json').read_text(encoding='utf-8'))
CLASSES = TABLE['classes']
CLASS_KEYS = tuple(c['key'] for c in CLASSES)
ATTACKERS = tuple(TABLE['attackers']['sprites'])
ATTACKER_PALETTE = tuple(TABLE['attackers']['palette'])
M32 = 0xFFFFFFFF


def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def _s32(v):
    v &= M32
    return v-(1 << 32) if v & 0x80000000 else v


def hash_u(i: int) -> float:
    """Port of costumes-v9.mjs hashU (= costume.mjs hash): 32-bit integer mix → [0, 1)."""
    t = _s32(i+0x6D2B79F5)
    u = t & M32
    t = _imul(u ^ (u >> 15), 1 | u)
    t2 = (t+_imul(t ^ (t >> 7), 61 | t)) & M32
    t = t2 ^ t
    t &= M32
    return ((t ^ (t >> 14)) & M32)/4294967296


def class_of(pid: int) -> int:
    return min(len(CLASSES)-1, int(hash_u(pid*5+101)*len(CLASSES)))


def palette_of(pid: int) -> int:
    c = CLASSES[class_of(pid)]
    return min(len(c['palettes'])-1, int(hash_u(pid*5+102)*len(c['palettes'])))


def rgb(h):
    v = int(h[1:], 16)
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def costume(pid: int) -> dict:
    k = class_of(pid)
    c = CLASSES[k]
    p = c['palettes'][palette_of(pid)]
    return dict(cls=k, key=c['key'], features=tuple(c['features']), cloth=rgb(p[0]), cloth2=rgb(p[1]), accent=rgb(p[2]), skin=rgb(p[3]))


# ---------------------------------------------------------------- drawing
HAIR = [(18, 14, 12), (34, 24, 18), (52, 40, 30), (14, 12, 16)]


def _shade(c, k, haze=None, f=1.0):
    """colour c lit by k (night: .35–1.0), faded toward the haze colour by (1−f)."""
    out = [min(255, int(v*k)) for v in c]
    if haze is not None and f < 1:
        out = [int(haze[i]*(1-f)*.8+out[i]*(1-(1-f)*.8)) for i in range(3)]
    return tuple(out)+(255,)


def draw_costumed(d, x, yf, h, pid, phase=0.0, haze=None, light=.8, facing=-1, glow=None):
    """see _draw_costumed; then a soft form shade (right side darker, shoulder rim lighter) when `d` blends (mode RGBA)."""
    C = _draw_costumed(d, x, yf, h, pid, phase, haze, light, facing, glow)
    if h > 60 and getattr(d, '_blend', False):
        w = h*.27; sh_y = yf-h*.80
        d.polygon([(x+w*.08, sh_y), (x+w*.62, sh_y), (x+w*.75, yf), (x+w*.12, yf)], fill=(0, 0, 0, 60))
        d.line([(x-w*.45, sh_y+h*.005), (x+w*.1, sh_y+h*.005)], fill=(255, 240, 230, 55), width=max(1, int(h*.01)))
    return C


def _draw_costumed(d, x, yf, h, pid, phase=0.0, haze=None, light=.8, facing=-1, glow=None):
    """One costumed person, feet at (x, yf), height h (output px). facing −1 = back to the camera (default),
    +1 = toward the camera (costume heads only: pumpkin / mascot / sheet / box keep their head; every other class is
    drawn with the hood / hat / hair seen from the back anyway — never a face). Arms always down or at the sides."""
    C = costume(pid)
    F = C['features']
    f = min(1, max(0, (h-30)/420))     # far figures fade into the haze
    L = light*(.75+.25*f)
    S = lambda c, k=1.0: _shade(c, L*k, haze, f)
    hr = HAIR[int(hash_u(pid*5+107)*4)]
    w = h*.27*(1.0+.12*(hash_u(pid*5+105)-.5))
    sw = math.sin(phase)*h*.05
    hip_y, sh_y = yf-h*.48, yf-h*.80
    head = h*.072
    slouch = h*.025 if 'slouch' in F else 0

    def poly(pts, c):
        d.polygon([(x+px, py) for px, py in pts], fill=c)

    def ell(cx, cy, rx, ry, c):
        d.ellipse((x+cx-rx, cy-ry, x+cx+rx, cy+ry), fill=c)

    cloth, cloth2, acc, skin = C['cloth'], C['cloth2'], C['accent'], C['skin']
    body_round = 'mascot' in F or 'dino' in F
    # wings / cape behind the body
    if 'wings' in F:
        for s in (-1, 1):
            poly([(s*w*.15, sh_y+h*.02), (s*w*1.25, sh_y-h*.12), (s*w*1.1, sh_y+h*.18), (s*w*.4, hip_y-h*.02)], S((240, 238, 248), .95))
    if 'dino' in F:   # tail behind
        poly([(w*.2, hip_y+h*.05), (w*1.5, yf-h*.06+sw*.3), (w*1.55, yf-h*.02), (w*.1, hip_y+h*.22)], S(cloth, .85))
    # legs
    leg = S(cloth2, .8)
    if 'sheet' not in F and not body_round:
        poly([(-w*.30, hip_y), (-w*.04, hip_y), (-w*.10+sw, yf), (-w*.30+sw, yf)], leg)
        poly([(w*.04, hip_y), (w*.30, hip_y), (w*.30-sw, yf), (w*.10-sw, yf)], leg)
        if 'bones' in F:
            for k in range(3):
                yy = hip_y+(yf-hip_y)*(.25+.25*k)
                d.line([(x-w*.27+sw*.5, yy), (x-w*.08+sw*.5, yy)], fill=S(acc), width=max(1, int(h*.008)))
                d.line([(x+w*.08-sw*.5, yy), (x+w*.27-sw*.5, yy)], fill=S(acc), width=max(1, int(h*.008)))
    # torso / dress / suit
    if 'sheet' in F:
        top = sh_y-h*.12
        pts = [(-w*.42, top+h*.10), (w*.42, top+h*.10)]
        n = 7
        for k in range(n+1):
            u = k/n
            pts.append((w*(.62-1.24*u), yf-h*.01-(h*.035 if k % 2 else 0)+sw*.2))
        poly([(-w*.3, top), (w*.3, top)]+[pts[1]]+pts[2:]+[pts[0]], S(cloth, .95))
        ell(0, top+h*.02, w*.36, h*.09, S(cloth, 1.0))
        return C
    if body_round:
        ell(0, (sh_y+yf)/2+h*.02, w*.78, (yf-sh_y)*.52, S(cloth, .92))
        ell(-w*.32, yf-h*.02, w*.2, h*.035, S(cloth2, .7)); ell(w*.32, yf-h*.02, w*.2, h*.035, S(cloth2, .7))
    else:
        tw = w*(.52 if 'box-body' not in F else .6)
        if 'box-body' in F:
            poly([(-tw, sh_y-h*.02), (tw, sh_y-h*.02), (tw, hip_y+h*.06), (-tw, hip_y+h*.06)], S(cloth, .95))
            d.rectangle((x-tw*.5, sh_y+h*.06, x+tw*.5, sh_y+h*.14), fill=S(acc))
        else:
            poly([(-w*.5, sh_y+slouch), (w*.5, sh_y+slouch), (w*.37, hip_y+h*.03), (-w*.37, hip_y+h*.03)], S(cloth, .95))
        if 'skirt' in F:
            poly([(-w*.38, hip_y-h*.04), (w*.38, hip_y-h*.04), (w*.78, hip_y+h*.25), (-w*.78, hip_y+h*.25)], S(cloth2 if cloth2 != cloth else cloth, .9))
            if 'bones' in F:   # white apron bow + ruffle hem
                poly([(-w*.18, hip_y-h*.05), (w*.18, hip_y-h*.05), (0, hip_y+h*.02)], S(acc))
                d.line([(x-w*.78, hip_y+h*.25), (x+w*.78, hip_y+h*.25)], fill=S(acc), width=max(1, int(h*.012)))
        if 'torn-hem' in F:
            n = 6
            for k in range(n):
                a = -w*.37+k*w*.74/n
                poly([(a, hip_y+h*.02), (a+w*.74/n, hip_y+h*.02), (a+w*.37/n, hip_y+h*.07+h*.03*hash_u(pid+k))], S(cloth, .95))
            d.line([(x-w*.2, sh_y+h*.08), (x+w*.1, sh_y+h*.18)], fill=S(cloth2, .9), width=max(1, int(h*.01)))
        if 'bandage' in F:
            for k in range(5):   # torso wraps
                yy = sh_y+(hip_y-sh_y)*(k+.5)/5
                d.line([(x-w*.46, yy), (x+w*.46, yy+h*.025)], fill=S(acc, .9), width=max(1, int(h*.007)))
            for k in range(4):   # leg wraps (inside each leg)
                yy = hip_y+(yf-hip_y)*(k+.5)/4
                d.line([(x-w*.28+sw*.5, yy), (x-w*.06+sw*.5, yy+h*.015)], fill=S(acc, .9), width=max(1, int(h*.006)))
                d.line([(x+w*.06-sw*.5, yy), (x+w*.28-sw*.5, yy+h*.015)], fill=S(acc, .9), width=max(1, int(h*.006)))
        if 'red-print' in F:   # stylised cartoon red print (dots + zigzag), no wounds
            for k in range(5):
                cx = (hash_u(pid*11+k)-.5)*w*.7; cy = sh_y+h*.05+hash_u(pid*13+k)*h*.25
                r = h*.012*(1+hash_u(pid*17+k))
                ell(cx, cy, r, r, S(acc))
        if 'bones' in F:
            for k in range(3):   # ribs print on the back (stylised)
                yy = sh_y+h*.06+k*h*.045
                d.line([(x-w*.28, yy), (x+w*.28, yy)], fill=S(acc, .9), width=max(1, int(h*.007)))
    # cape over the back (vampire / fantasy)
    if 'cape' in F:
        poly([(-w*.55, sh_y-h*.01), (w*.55, sh_y-h*.01), (w*.72+sw*.3, yf-h*.08), (-w*.72+sw*.3, yf-h*.08)], S(cloth if cloth != (14, 12, 18) else (20, 16, 26), .8))
        d.line([(x-w*.72+sw*.3, yf-h*.08), (x+w*.72+sw*.3, yf-h*.08)], fill=S(acc), width=max(1, int(h*.014)))
        if 'collar' in F:
            poly([(-w*.55, sh_y), (-w*.25, sh_y-h*.11), (-w*.12, sh_y)], S(acc, .9)); poly([(w*.55, sh_y), (w*.25, sh_y-h*.11), (w*.12, sh_y)], S(acc, .9))
    # arms (down, at the sides; never raised / reaching)
    if not body_round:
        arm = S(skin if 'torn-hem' in F else cloth, .85)
        poly([(-w*.5, sh_y+slouch), (-w*.36, sh_y+slouch), (-w*.42-sw*.4, hip_y+h*.06), (-w*.58-sw*.4, hip_y+h*.04)], arm)
        poly([(w*.36, sh_y+slouch), (w*.5, sh_y+slouch), (w*.58+sw*.4, hip_y+h*.04), (w*.42+sw*.4, hip_y+h*.06)], arm)
    if 'broom' in F:   # broom over the shoulder (prop, held upright — not a weapon pose)
        d.line([(x+w*.55, yf-h*.05), (x+w*.25, sh_y-h*.22)], fill=S((120, 80, 40)), width=max(1, int(h*.012)))
        poly([(w*.5, yf-h*.05), (w*.75, yf+h*.0), (w*.38, yf+h*.0)], S((200, 160, 70)))
    if 'tail' in F:
        d.line([(x, hip_y+h*.04), (x+w*.5, hip_y+h*.2), (x+w*.35, hip_y+h*.32)], fill=S(cloth, .8), width=max(1, int(h*.01)))
        poly([(w*.35, hip_y+h*.30), (w*.43, hip_y+h*.35), (w*.28, hip_y+h*.36)], S(acc))
    # neck + head
    hy = sh_y-h*.05-head*1.05+slouch
    poly([(-w*.1, sh_y+slouch), (w*.1, sh_y+slouch), (w*.08, sh_y-h*.05+slouch), (-w*.08, sh_y-h*.05+slouch)], S(skin if 'torn-hem' in F else hr, .8))
    if 'pumpkin' in F:
        r = head*2.0
        for k, dx in enumerate((-.45, .45, 0)):
            ell(dx*r, hy-r*.25, r*(.62 if k < 2 else .7), r*.78, S(skin, (.85, .85, 1.0)[k]))
        poly([(-r*.06, hy-r*1.0), (r*.08, hy-r*1.0), (r*.12, hy-r*1.28), (r*.0, hy-r*1.3)], S(acc))
        if facing > 0:   # jack-o-lantern face on the costume head (glowing, cartoon; not a human face)
            g = glow or (255, 190, 60)
            poly([(-r*.42, hy-r*.38), (-r*.18, hy-r*.38), (-r*.30, hy-r*.6)], g+(255,)); poly([(r*.18, hy-r*.38), (r*.42, hy-r*.38), (r*.30, hy-r*.6)], g+(255,))
            poly([(-r*.4, hy-r*.05), (r*.4, hy-r*.05), (r*.2, hy+r*.12), (-r*.2, hy+r*.12)], g+(255,))
        return C
    if 'box-head' in F:
        r = head*1.45
        d.rectangle((x-r, hy-r*1.25, x+r, hy+r*.6), fill=S(cloth, 1.0))
        d.rectangle((x-r*.7, hy-r*.7, x+r*.7, hy-r*.35), fill=S(acc, 1.0))
        d.line([(x, hy-r*1.25), (x, hy-r*1.8)], fill=S(acc), width=max(1, int(h*.008)))
        ell(0, hy-r*1.85, r*.13, r*.13, S((255, 80, 120)))
        return C
    if body_round:
        r = head*1.75
        ell(0, hy-r*.2, r, r*.92, S(skin, 1.0))
        if 'round-ears' in F:
            ell(-r*.75, hy-r*.95, r*.32, r*.32, S(skin, .95)); ell(r*.75, hy-r*.95, r*.32, r*.32, S(skin, .95))
            ell(-r*.75, hy-r*.95, r*.17, r*.17, S(acc)); ell(r*.75, hy-r*.95, r*.17, r*.17, S(acc))
        if 'dino' in F:
            for k in range(4):
                yy = hy-r*.6+k*h*.11
                poly([(-r*.12, yy), (r*.12, yy), (0, yy-r*.42)], S(acc))
        return C
    # ordinary-shaped head seen from the back: hair / hood / makeup skin at the neck & ears only
    hc = hr
    if 'torn-hem' in F:
        hc = tuple(int(v*.8) for v in hr)
    ell(0, hy, head*.9, head, S(hc, .9))
    if 'torn-hem' in F:   # grey-green makeup visible at the ears / nape (no face)
        ell(-head*.85, hy+head*.1, head*.2, head*.3, S(skin)); ell(head*.85, hy+head*.1, head*.2, head*.3, S(skin))
    if 'witch-hat' in F:
        poly([(-head*2.0, hy-head*.45), (head*2.0, hy-head*.45), (head*1.2, hy-head*.8), (-head*1.2, hy-head*.8)], S(acc, .9))
        poly([(-head*.95, hy-head*.75), (head*.95, hy-head*.75), (head*.35+head*.4, hy-head*3.4), (head*.2, hy-head*3.5)], S(acc, .95))
        d.line([(x-head*.9, hy-head*.95), (x+head*.9, hy-head*.95)], fill=S(cloth if cloth != acc else (255, 138, 30)), width=max(1, int(h*.01)))
    elif 'nurse-cap' in F:
        poly([(-head*.8, hy-head*.7), (head*.8, hy-head*.7), (head*.6, hy-head*1.25), (-head*.6, hy-head*1.25)], S((250, 250, 250)))
    elif 'headband' in F:
        poly([(-head*.95, hy-head*.55), (head*.95, hy-head*.55), (head*.7, hy-head*.95), (-head*.7, hy-head*.95)], S(acc))
    elif 'horns' in F:
        poly([(-head*.75, hy-head*.5), (-head*.35, hy-head*.7), (-head*.95, hy-head*1.6)], S(acc)); poly([(head*.75, hy-head*.5), (head*.35, hy-head*.7), (head*.95, hy-head*1.6)], S(acc))
    elif 'halo' in F:
        d.ellipse((x-head*1.0, hy-head*1.75, x+head*1.0, hy-head*1.25), outline=(255, 226, 110, 255), width=max(2, int(h*.012)))
    elif 'glow-headband' in F:
        d.line([(x-head*.92, hy-head*.35), (x+head*.92, hy-head*.35)], fill=tuple(min(255, int(v*1.2)) for v in acc)+(255,), width=max(2, int(h*.014)))
    elif 'bandage' in F:
        for k in range(4):
            d.line([(x-head*.9, hy-head*.6+k*head*.4), (x+head*.9, hy-head*.4+k*head*.4)], fill=S(acc), width=max(1, int(h*.006)))
    elif 'collar' in F:
        poly([(-head*.95, hy-head*.2), (0, hy-head*1.15), (head*.95, hy-head*.2)], S(hr, .7))
    return C


GLOW_FEATURES = ('halo', 'glow-headband')


def glow_layer(lay, blur=6):
    """soft bloom for the glowing bits (halo / headbands / pumpkin faces): brightest pixels blurred and added."""
    a = np.asarray(lay).astype(np.float32)
    m = (a[..., :3].max(-1) > 235) & (a[..., 3] > 0)
    if not m.any(): return lay
    g = np.zeros_like(a); g[m] = a[m]
    gi = Image.fromarray(g.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(blur))
    out = lay.copy(); out.alpha_composite(gi)
    return out


# ---------------------------------------------------------------- attackers (GAME OVER only; NOT a costume)
def attackers_layer(W, H, t, intensity, seed=7):
    """The fictional game zombies of the caught beat, only suggested: dark green-black shadow masses creeping in from the
    frame edges + three-fingered sprite hands (pixel-quantized, toxic-green pixel outline) reaching in FROM THE FRAME EDGES
    (screen-attached, never a body or a face). Same look as vfx-caught.mjs. intensity 0..1."""
    dark, mid, edge = (rgb(c) for c in ATTACKER_PALETTE)
    lw, lh = W//8, H//8
    lay = Image.new('RGBA', (lw, lh), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    rng = np.random.default_rng(seed)
    # shadow masses (edges)
    for k in range(6):
        side = k % 3
        cx = (-.05 if side == 0 else 1.05 if side == 1 else .2+.6*rng.random())*lw
        cy = (.55+.4*rng.random())*lh if side < 2 else lh*1.05
        r = (.25+.15*rng.random())*lw*(.4+.8*intensity)
        d.ellipse((cx-r, cy-r*1.3, cx+r, cy+r*1.3), fill=dark+(int(200*intensity),))
    # hands: (edge anchor, direction)
    slots = [((-.02, .62), (1, -.35)), ((1.02, .7), (-1, -.4)), ((.18, 1.02), (.25, -1)), ((.86, 1.02), (-.3, -1))]
    for j, ((ax, ay), (dx, dy)) in enumerate(slots):
        delay = .15*j
        ext = max(0.0, min(1.0, (intensity-delay)/(1-delay+1e-6)))
        if ext <= 0: continue
        ln = math.hypot(dx, dy); dx, dy = dx/ln, dy/ln
        L = (.18+.16*ext)*lw*(1+.08*math.sin(t*6+j))
        bx, by = ax*lw, ay*lh
        px, py = bx+dx*L, by+dy*L
        nx, ny = -dy, dx
        arm = [(bx+nx*lw*.035, by+ny*lw*.035), (px+nx*lw*.03, py+ny*lw*.03), (px-nx*lw*.03, py-ny*lw*.03), (bx-nx*lw*.035, by-ny*lw*.035)]
        d.polygon(arm, fill=mid+(255,))
        d.ellipse((px-lw*.045, py-lw*.045, px+lw*.045, py+lw*.045), fill=mid+(255,))
        for fk in (-1, 0, 1):   # three long knobbly fingers
            a = math.atan2(dy, dx)+fk*.45+.12*math.sin(t*8+j+fk)
            fl = lw*(.09+.02*(fk == 0))
            ex, ey = px+math.cos(a)*fl, py+math.sin(a)*fl
            d.line([(px, py), (ex, ey)], fill=mid+(255,), width=max(2, lw//70))
            d.ellipse((ex-lw*.012, ey-lw*.012, ex+lw*.012, ey+lw*.012), fill=mid+(255,))
    # pixel outline (toxic green) around the hand sprites
    a = np.asarray(lay)
    alpha = a[..., 3] > 0
    solid = (a[..., :3].astype(int).sum(-1) == sum(mid)) & alpha
    edge_m = np.zeros_like(solid)
    edge_m[1:, :] |= solid[:-1, :] & ~solid[1:, :]; edge_m[:-1, :] |= solid[1:, :] & ~solid[:-1, :]
    edge_m[:, 1:] |= solid[:, :-1] & ~solid[:, 1:]; edge_m[:, :-1] |= solid[:, 1:] & ~solid[:, :-1]
    b = a.copy(); b[edge_m] = edge+(int(230*intensity),)
    return Image.fromarray(b, 'RGBA').resize((W, H), Image.NEAREST)


def blend_draw(img):
    """ImageDraw that blends translucent fills (the form shade of draw_costumed)."""
    d = ImageDraw.Draw(img, 'RGBA'); d._blend = True
    return d
