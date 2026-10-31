"""science-sim-v3 #1 (scramble) camera/time plan -> per_frame JSON for v2_render.py"""
import json, sys
FPS = 30
def lerp(a, b, k): return [x + (y - x) * k for x, y in zip(a, b)]
def ease(k): return k * k * (3 - 2 * k)
SHOTS = [  # dur s, cam0, cam1, look0, look1, fov, ts0, speed0, speed1
    dict(dur=7.5, p0=[-45,12,35], p1=[-38,11,30], l0=[5,2,-5], l1=[3,2,-4], fov=55, ts0=22, s0=2.0, s1=2.0),
    dict(dur=8.0, p0=[22,38,56], p1=[18,30,46], l0=[16,0,24], l1=[16,0,26], fov=50, ts0=130, s0=1.25, s1=1.25),
    dict(dur=8.5, p0=[-38,4.5,31], p1=[-39.5,3.5,25], l0=[-39,2,14], l1=[-39,2,14], fov=58, ts0=140, s0=1.0, s1=0.25),
]
pf = []
for si, s in enumerate(SHOTS):
    n = round(s['dur'] * FPS); ts = s['ts0']
    for i in range(n):
        k = i / (n - 1); e = ease(k)
        sp = s['s0'] + (s['s1'] - s['s0']) * k
        fade = 1.0
        if si > 0 and i < 7: fade = (i + 1) / 8
        if si < len(SHOTS) - 1 and i >= n - 7: fade = (n - i) / 8
        pf.append(dict(ts=round(ts, 4), pos=lerp(s['p0'], s['p1'], e), look=lerp(s['l0'], s['l1'], e), fov=s['fov'], fade=fade))
        ts += sp / FPS
json.dump({'fps': FPS, 'per_frame': pf}, open(sys.argv[1], 'w'))
print(len(pf), 'frames', len(pf) / FPS, 's')
