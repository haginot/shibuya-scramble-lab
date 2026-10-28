#!/usr/bin/env python3
"""JR v10 shot logic without numpy / Pillow (shared by tools/v10_composite.py, tools/v10_ghost.py and tests/test_v10.py):
which plate each photo beat uses (tools/v10_plan.json swaps on top of tools/v9_plan.json) and the crush POV camera on the
photo, with its plate → output projection (used to keep the ghost off the faces of the photo people)."""
from __future__ import annotations

import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from render_v7 import PLAN as PLAN7  # noqa: E402  (the opening photo specs, as v7_composite.photo_spec)

PLAN = json.loads((ROOT/'tools/v9_plan.json').read_text(encoding='utf-8'))
PLAN10 = json.loads((ROOT/'tools/v10_plan.json').read_text(encoding='utf-8'))
NEW = set(PLAN10['plates'])
CR = PLAN10['crush']
W, H = 1080, 1920


def ease(u): u = min(1, max(0, u)); return u*u*(3-2*u)


def spec(pair, e):
    """the v9 photo spec with the v10 plate swaps (opening rules → hachiko3, hachiko → hachiko3, crush POV → crush3)."""
    if e['part'] == 'opening':
        sp = dict(PLAN10['opening'].get(e['beat']) or PLAN7['opening'][e['beat']])
    else:
        sp = dict(PLAN['pairs'][pair][e['beat']])
        sp['plate'] = PLAN10['replacePlate'].get(sp['plate'], sp['plate'])
    if sp['mode'] == 'crush': sp['plate'] = PLAN10['crushPlate']
    if sp['plate'] in NEW: sp.pop('crop', None)
    return sp


def crush_cam(t, dur, shoves, PW=1536, PH=2752):
    """→ (cx, cy, s, roll, sx, sy, sq, kick): plate centre, plate px per output px, roll (rad), output shift, squeeze, kick 0..1.
    Slow push-in, sway, and on every shove (= the shove SFX times) a lurch forward, a lateral kick and a roll."""
    hmax = min(PH, PW*16/9); u = ease(t/max(dur, 1e-3))
    lurch = sq = kick = 0.0; kx = 0.0; roll = CR['roll']*math.pi/180*math.sin(2*math.pi*.21*t)
    for i, ts in enumerate(shoves):
        if t < ts: continue
        v = t-ts; side = 1 if i % 2 else -1
        env = math.exp(-v*2.4)*min(1.0, v*12)
        lurch += CR['lurch']*env; sq += CR['squeeze']*math.exp(-v*2.6); kick = max(kick, env)
        kx += side*CR['kick']*math.exp(-v*2.2)*math.sin(min(v*9, math.pi/2))
        roll += side*.5*math.pi/180*env
    h = hmax*(CR['h'][0]+(CR['h'][1]-CR['h'][0])*u)/(1+lurch)
    a, b = CR['sway']
    sx = a*math.sin(2*math.pi*.42*t)+b*math.sin(2*math.pi*.17*t+1)+kx
    sy = 5*math.sin(2*math.pi*.25*t)+3*math.sin(2*math.pi*.49*t+.4)-10*kick
    cx = CR['cx']+20*math.sin(2*math.pi*.11*t)
    cy = CR['cy'][0]+(CR['cy'][1]-CR['cy'][0])*u
    w = h*9/16; cx = min(max(cx, w/2), PW-w/2); cy = min(max(cy, h/2), PH-h/2)
    return cx, cy, h/H, roll, sx, sy, sq, kick


def crush_to_out(cam):
    """plate px → output px for a crush_cam view (inverse of the compositor's affine)."""
    cx, cy, s, roll, sx, sy, sq, _ = cam; c, n = math.cos(roll), math.sin(roll)
    def f(x, y):
        dx, dy = (x-cx)/s, (y-cy)/s
        X, Y = c*dx+n*dy, -n*dx+c*dy                     # inverse roll
        return X*(1+sq)+W/2+sx, Y+H/2+sy                 # squeeze magnifies x around the centre
    return f


def crush_from_out(cam, X, Y):
    """output px → plate px (the compositor's affine)."""
    cx, cy, s, roll, sx, sy, sq, _ = cam; c, n = math.cos(roll), math.sin(roll)
    dX, dY = (X-W/2-sx)/(1+sq), Y-H/2-sy
    return cx+s*(c*dX-n*dY), cy+s*(n*dX+c*dY)


def to_out(camv):
    """plate px → output px for a v7_composite.camera view (inverse of v7_composite.warp)."""
    cx, cy, h, sx, sy = camv; s = h/H
    return lambda x, y: ((x-cx)/s+W/2+sx, (y-cy)/s+H/2+sy)
