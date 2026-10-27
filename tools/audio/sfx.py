"""Original synthesized SFX. ``get(name)`` -> (2, n) at its house level (peak-normalized, then BASE_DB).

Required set (CONTRACT.md): logo_slam, whoosh, ui_blip, ui_select, tick, escaped, clear_jingle, gameover_jingle,
red_alert, stamp_hit.  Extras: tock (2nd tick pitch), riser (1.8 s build that ends on its cue time + 1.8 s;
place it 1.8 s before a slam), heartbeat, card_in (soft paper/air swipe), press_start (soft shimmer for the
PRESS START beat), choice_move (cursor move), crowd_swell (brief crowd surge used under red_alert / zone scenes).
Combined episodes (REQUIRED_COMBINED): crowd_press zombie_groan caught_hit red_flash cut_black continue_tick
continue_yes kaiju_rumble kaiju_roar smash_cut, plus zombie_groan_b (2nd groan voice), boing (gag), end_sting (end
card).  cut_black / smash_cut also *act* in mix.py (CUT_DEFAULTS: other buses silenced / tails chopped), and the
caught/kaiju sounds hard-duck the BGM by default (mix.AUTO_DUCK).

Design notes: red_alert is a *game* sting — detuned buzzy saw pulses with downward pitch drops over a drum hit; it
does not use sine chimes, ascending bell arpeggios or siren sweeps, so it can't be mistaken for J-ALERT / NHK / any
real alert tone.  gameover_jingle is a light toy-box "aww" (gently drooping music-box phrase + soft minor chord),
not a death sting.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

import dsp
import instruments as ins
from dsp import SR, note, ns, rng, tvec

# house levels (dB re. -1 dBFS peak) — balanced against BGM at -18 LUFS and beds at -30 LUFS
BASE_DB = {
    'logo_slam': -2.0, 'whoosh': -7.0, 'ui_blip': -13.0, 'ui_select': -9.0, 'tick': -14.0, 'tock': -14.0,
    'escaped': -6.0, 'clear_jingle': -5.0, 'gameover_jingle': -8.0, 'red_alert': -6.0, 'stamp_hit': -5.5,
    'riser': -6.0, 'heartbeat': -6.0, 'card_in': -14.0, 'press_start': -10.0, 'choice_move': -14.0,
    'crowd_swell': -9.0,
    # combined episodes
    'crowd_press': -8.0, 'zombie_groan': -6.0, 'zombie_groan_b': -7.0, 'caught_hit': -3.0, 'red_flash': -7.0,
    'cut_black': -4.0, 'continue_tick': -12.0, 'continue_yes': -8.0, 'kaiju_rumble': -6.0, 'kaiju_roar': -2.5,
    'boing': -9.0, 'smash_cut': -4.0, 'end_sting': -7.0,
    # v6 (「渋谷Halloweenには近づくな」): mission card, first choice, TRUE END, guide, GOODBYE end card
    'mission_in': -8.0, 'choice_pick': -10.0, 'seal_stamp': -7.0, 'true_end_jingle': -7.5, 'guide_in': -13.0,
    'goodbye_in': -9.0,
    # v7: CG↔photoreal switch (RGB glitch cut)
    'glitch': -9.0,
}

_IR = {}


def _ir(kind: str) -> np.ndarray:
    if kind not in _IR:
        _IR[kind] = {'hall': lambda: dsp.reverb_ir(2.6, 'sfx-hall', 0.02, 5000),
                     'room': lambda: dsp.reverb_ir(0.7, 'sfx-room', 0.008, 7000),
                     'big': lambda: dsp.reverb_ir(4.0, 'sfx-big', 0.03, 4000)}[kind]()
    return _IR[kind]


def _rev(x, kind='room', wet=0.25):
    return dsp.add_reverb(x, _ir(kind), wet)


def logo_slam() -> np.ndarray:
    r = rng('logo_slam')
    d = 3.2
    t = tvec(d)
    n = t.size
    boom_f = 47 + 80 * np.exp(-t / 0.08)        # ends ~47 Hz (not sub-30 Hz rumble that phones drop)
    boom = np.sin(2 * np.pi * dsp.phase_of(boom_f, n)) * np.exp(-t / 0.9) * np.clip(t / 0.005, 0, 1)
    sub = np.sin(2 * np.pi * 41 * t) * np.exp(-t / 1.0) * dsp.smoothstep(t / 0.05) * 0.3
    crack = dsp.bp(r.standard_normal(n), 300, 6000) * np.exp(-t / 0.035) * np.clip(t / 0.004, 0, 1) * 0.9
    body = dsp.lp(r.standard_normal(n), 900) * np.exp(-t / 0.18) * 1.2
    # metallic clang: inharmonic partials (worn sign plate)
    clang = dsp.additive(182.0, d, [(1, 1), (1.47, .8), (2.09, .6), (2.56, .5), (3.39, .4), (4.17, .3), (5.03, .2)],
                         [1.2, .9, .8, .6, .5, .35, .25], r) * 0.22
    grit = dsp.hp(r.standard_normal(n), 2500) * np.exp(-t / 0.4) * 0.05 * (1 + np.sin(2 * np.pi * 31 * t))
    mono = dsp.fade(dsp.soft_clip(boom * 1.1 + sub + crack + body, 1.6) + clang + grit, 0, 0.6)
    clang = dsp.fade(clang, 0, 0.6)
    st = dsp.haas(mono, 0.0) + np.vstack([dsp.hp(clang, 600), -dsp.hp(clang, 600)]) * 0.3
    return _rev(st, 'big', 0.35)


def whoosh(dur: float = 0.75) -> np.ndarray:
    r = rng('whoosh')
    n = ns(dur)
    u = np.arange(n) / n
    env = np.sin(np.pi * u) ** 1.5 * (1 - 0.3 * u)
    fc = 300 + 3200 * np.sin(np.pi * u) ** 2
    nz = r.standard_normal((2, n))
    y = dsp.sweep_filter(nz, 'lowpass', fc) * env
    y = dsp.sweep_filter(y, 'highpass', fc * 0.3)
    p = np.vstack([np.cos((u) * np.pi / 2), np.sin(u * np.pi / 2)])      # left -> right
    return _rev(y * p * 1.6, 'room', 0.2)


def ui_blip() -> np.ndarray:
    d = 0.09
    t = tvec(d)
    f = 1250 + 450 * dsp.smoothstep(t / 0.03)
    y = (0.7 * dsp.square(f, d, 0.3) + 0.5 * dsp.sine(f * 2, d)) * dsp.env_perc(d, 0.002, 0.03)
    y = dsp.lp(y, 6000)
    return _rev(dsp.pan(y, 0.0), 'room', 0.15)


def ui_select() -> np.ndarray:
    d = 0.6
    y = np.zeros(ns(d))
    for i, (nm, at) in enumerate([('E6', 0.0), ('B6', 0.06)]):
        n = ins.pluck(note(nm), d - at, 0.9, f'sel{i}', bright=2.0) + 0.5 * ins.bell(note(nm), d - at, 0.7, f'sel{i}')
        y[ns(at):ns(at) + n.size] += n
    sparkle = dsp.hp(rng('sel').standard_normal(y.size), 7000) * dsp.env_perc(d, 0.01, 0.08) * 0.08
    return _rev(dsp.haas(dsp.fade(y + sparkle, 0, 0.05), 6), 'room', 0.3)


def tick() -> np.ndarray:
    return _rev(dsp.pan(ins.tick(2600, 0.09, 1.0, 'sfx-tick'), 0.1), 'room', 0.12)


def tock() -> np.ndarray:
    return _rev(dsp.pan(ins.tick(2050, 0.09, 1.0, 'sfx-tock'), -0.1), 'room', 0.12)


def riser(dur: float = 1.8) -> np.ndarray:
    r = rng('riser')
    n = ns(dur)
    u = np.arange(n) / n
    nz = r.standard_normal((2, n))
    y = dsp.sweep_filter(nz, 'highpass', 200 + 4000 * u ** 2)
    tone = dsp.saw(55 * 2 ** (2 * u ** 1.5), dur) * 0.25 + dsp.saw(55.4 * 2 ** (2 * u ** 1.5), dur) * 0.25
    tone = dsp.sweep_filter(tone, 'lowpass', 200 + 3000 * u ** 2)
    y = (y * 0.5 + tone) * u ** 2.2 * (1 - 0.5 * dsp.smoothstep((u - 0.85) / 0.15))
    return dsp.fade(y, 0.05, 0.03)   # eases off into the hit instead of a hard stop


def heartbeat() -> np.ndarray:
    y = np.zeros(ns(1.0))
    a = ins.thump(52, 0.45, 1.0, 'hb1')
    b = ins.thump(48, 0.45, 0.7, 'hb2')
    y[:a.size] += a
    y[ns(0.24):ns(0.24) + b.size] += b
    return dsp.stereo(y)


def card_in() -> np.ndarray:
    r = rng('card_in')
    d = 0.35
    n = ns(d)
    u = np.arange(n) / n
    y = dsp.bp(r.standard_normal(n), 1500, 7000)
    y *= np.sin(np.pi * u) ** 2
    return _rev(dsp.haas(y, 4), 'room', 0.15)


def choice_move() -> np.ndarray:
    d = 0.07
    y = dsp.sine(1700, d) * dsp.env_perc(d, 0.001, 0.02) + 0.3 * dsp.sine(3400, d) * dsp.env_perc(d, 0.001, 0.01)
    return _rev(dsp.pan(y, 0.1), 'room', 0.15)


def press_start() -> np.ndarray:
    d = 1.6
    y = np.zeros(ns(d))
    for i, nm in enumerate(['D5', 'A5', 'E6']):
        b = ins.bell(note(nm), d - i * 0.05, 0.5, f'ps{i}')
        y[ns(i * 0.05):ns(i * 0.05) + b.size] += b
    pad = ins.pad_voice(note('D4'), d, 0.25, 'ps-pad', bright=1500, attack=0.05, release=1.0) * 0.5
    return _rev(dsp.haas(y + pad, 8), 'hall', 0.4)


def escaped() -> np.ndarray:
    d = 1.8
    out = np.zeros((2, ns(d) + ns(0.4)))
    up = whoosh(0.5)
    dsp.place(out, up * 0.6, 0.0)
    chord = np.zeros(ns(d - 0.3))
    for i, nm in enumerate(['D5', 'F#5', 'A5', 'D6', 'E6']):
        b = ins.pluck(note(nm), chord.size / SR, 0.7, f'esc{i}', bright=2) + 0.6 * ins.bell(note(nm), chord.size / SR,
                                                                                               0.6, f'esc{i}')
        chord += b
    dsp.place(out, dsp.haas(chord * 0.6, 7), 0.32)
    dsp.place(out, dsp.stereo(ins.taiko(70, 1.0, 0.8, 'esc')), 0.32, 0.5)
    sp = dsp.hp(rng('esc').standard_normal(ns(1.2)), 6000) * dsp.env_perc(1.2, 0.05, 0.3) * 0.1
    dsp.place(out, dsp.haas(sp, 11), 0.35)
    return _rev(out, 'hall', 0.3)


def clear_jingle() -> np.ndarray:
    """~3 s: quick rising pluck run, bright chord with bells, drum hit, shimmer tail (D major, original)."""
    out = np.zeros((2, ns(3.4)))
    run = ['D5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6']
    for i, nm in enumerate(run):
        dsp.place(out, dsp.pan(ins.pluck(note(nm), 0.5, 0.7, f'cj{i}', bright=2), -0.5 + i / 6), i * 0.07, 0.6)
    t0 = len(run) * 0.07 + 0.05
    for i, nm in enumerate(['D4', 'A4', 'D5', 'F#5', 'A5', 'E6']):
        dsp.place(out, dsp.pan(ins.bell(note(nm), 2.6, 0.6, f'cjb{i}'), -0.4 + 0.16 * i), t0, 0.55)
        dsp.place(out, dsp.pan(ins.pad_voice(note(nm), 2.5, 0.25, f'cjp{i}', bright=3000, attack=0.02, release=1.4),
                               0.4 - 0.16 * i), t0, 0.6)
    dsp.place(out, dsp.stereo(ins.taiko(62, 1.4, 1.0, 'cj')), t0, 0.7)
    dsp.place(out, dsp.stereo(ins.taiko(80, 0.8, 0.6, 'cj2')), t0 - 0.14, 0.4)
    return _rev(out, 'hall', 0.35)


def gameover_jingle() -> np.ndarray:
    """~2.8 s gentle 'aww': music-box phrase that droops in pitch + soft D minor chord. Light, not deathly."""
    out = np.zeros((2, ns(3.2)))
    phrase = [('A5', 0.0), ('G5', 0.22), ('F5', 0.44), ('E5', 0.66)]
    for i, (nm, at) in enumerate(phrase):
        dsp.place(out, dsp.pan(ins.music_box(note(nm), 1.4, 0.8, f'go{i}'), 0.3 - 0.2 * i), at, 0.7)
    # last note: slow downward bend (the "aww")
    d = 2.0
    t = tvec(d)
    f = note('D5') * 2 ** (-(0.9 * dsp.smoothstep((t - 0.25) / 1.4)) / 12)
    tone = (np.sin(2 * np.pi * dsp.phase_of(f, t.size)) + 0.25 * np.sin(4 * np.pi * dsp.phase_of(f, t.size)))
    vib = 1 + 0.15 * np.sin(2 * np.pi * 5.2 * t) * dsp.smoothstep((t - 0.4) / 0.5)
    tone *= dsp.env_adsr(d, 0.03, 0.3, 0.7, 0.9) * vib * 0.45
    dsp.place(out, dsp.haas(tone, 5), 0.9)
    for i, nm in enumerate(['D4', 'F4', 'A4']):
        dsp.place(out, dsp.pan(ins.pad_voice(note(nm), 2.2, 0.22, f'gop{i}', bright=1100, attack=0.15, release=1.2,
                                             kind='tri'), -0.3 + 0.3 * i), 0.9, 0.8)
    dsp.place(out, dsp.stereo(ins.thump(55, 0.5, 0.6, 'go')), 0.9, 0.6)
    return _rev(out, 'hall', 0.3)


def red_alert() -> np.ndarray:
    """Game-style warning sting: 3 detuned buzzy pulses that drop in pitch, over a drum hit. Not a real alert tone."""
    out = np.zeros((2, ns(2.4)))
    for k in range(3):
        d = 0.32
        t = tvec(d)
        f0 = 330 * 2 ** (-k * 0.5 / 12)
        f = f0 * (1 - 0.18 * dsp.smoothstep(t / d))
        y = sum(dsp.saw(f * m, d) for m in (1, 1.008, 0.5 * 1.003)) / 3
        y = dsp.sweep_filter(y, 'lowpass', 3500 - 2500 * (t / d))
        y = dsp.soft_clip(y * 2, 2) * dsp.env_adsr(d, 0.004, 0.05, 0.85, 0.08)
        dsp.place(out, dsp.haas(y, 7 + k), k * 0.36, 0.8)
    dsp.place(out, dsp.stereo(ins.taiko(52, 1.6, 1.0, 'ra')), 0.0, 0.9)
    dsp.place(out, dsp.stereo(ins.taiko(58, 1.2, 0.7, 'ra2')), 0.72, 0.6)
    return _rev(out, 'room', 0.3)


def stamp_hit() -> np.ndarray:
    """Heavy rubber-stamp slam: low thud + slap + ink-pad squish, short room."""
    r = rng('stamp')
    d = 1.2
    t = tvec(d)
    n = t.size
    thud_f = 55 + 90 * np.exp(-t / 0.02)
    thud = np.sin(2 * np.pi * dsp.phase_of(thud_f, n)) * np.exp(-t / 0.16)
    slap = dsp.bp(r.standard_normal(n), 400, 4500) * np.exp(-t / 0.018)
    squish = dsp.bp(r.standard_normal(n), 800, 2500) * np.exp(-np.maximum(t - 0.03, 0) / 0.05) * 0.25 * (t > 0.03)
    y = dsp.soft_clip(thud * 1.2 + slap * 0.8 + squish, 1.4) * np.clip(t / 0.0008, 0, 1)
    y = dsp.fade(y, 0, 0.3)
    return _rev(dsp.stereo(y), 'room', 0.3)


def crowd_swell() -> np.ndarray:
    import ambience
    y = ambience.babble(3.0, 'swell', voices=26, rate=5.0)
    u = np.arange(y.shape[-1]) / y.shape[-1]
    return y * np.sin(np.pi * u) ** 1.2


# ------------------------------------------------------------------ combined episodes (2026-10-26)
# caught sequence (crowd_press, zombie_groan[_b], caught_hit, red_flash, cut_black), CONTINUE? (continue_tick,
# continue_yes), kaiju gag (kaiju_rumble, kaiju_roar, boing, smash_cut) and the end card (end_sting).  All synthesized
# here.  The zombies are cartoon *game* creatures: a low, muffled, bouncy synth "mmuh-uh" (buzzy source -> moving
# vowel formants -> heavy low-pass -> a touch of sample-and-hold grit), not a horror-film growl.  The kaiju is a
# goofy giant: a warbly tuba/foghorn bellow (harmonic brass tone below ~3 kHz, scoop up, wide slow vibrato), a comic
# "hic!", then a deflating fall.  No noise screech, no resonant metal scrape, nothing like a famous film roar.

def _formants(x: np.ndarray, f1, f2, f3=None, floor: float = 0.08, bw: float = 0.18) -> np.ndarray:
    """Time-varying vowel colouring: STFT magnitude x (floor + Gaussian bumps at F1(t), F2(t)[, F3(t)]).
    f* are callables of time (s) -> Hz (arrays)."""
    def g(f, t):
        out = np.full(np.broadcast_shapes(f.shape, t.shape), floor)
        for k, fk in enumerate((f1, f2, f3)):
            if fk is None:
                continue
            c = fk(t)
            out = out + (1.0, 0.6, 0.3)[k] * np.exp(-0.5 * ((f - c) / (bw * c + 40)) ** 2)
        return out
    return dsp.spectral_shape(x, g, nper=1024)


def _contour(t: np.ndarray, pts) -> np.ndarray:
    """Piecewise-smooth curve through [(t, value)] (smoothstep between points)."""
    y = np.full_like(t, pts[0][1], dtype=float)
    for (ta, va), (tb, vb) in zip(pts[:-1], pts[1:]):
        m = t >= ta
        y[m] = va + (vb - va) * dsp.smoothstep((t[m] - ta) / max(tb - ta, 1e-6))
    return y


def crowd_press() -> np.ndarray:
    """~2.7 s: the crowd closing in — babble that gets nearer *and* more muffled (bodies around you), cloth
    rustle, shuffling feet, a low pressure swell; the stereo image narrows (boxed in).  Meant to be cut by the
    hard cut to black (mix.py chops it at cut_black)."""
    import ambience
    r = rng('crowd_press')
    d = 2.7
    n = ns(d)
    u = np.arange(n) / n
    bab = dsp.fit(ambience.babble(d + 0.1, 'press', voices=32, rate=5.5, talk=(1.0, 3.0), pause=(0.2, 0.8)), n)
    bab = dsp.sweep_filter(bab, 'lowpass', 2600 * (1 - u) ** 1.4 + 520, order=2)
    rust = dsp.bp(r.standard_normal((2, n)), 900, 5000)
    grains = np.abs(dsp.lp(r.standard_normal(n), 14)) ** 2
    rust = dsp.sweep_filter(rust * grains / (grains.std() + 1e-9), 'lowpass', 5000 - 3500 * u)
    feet = np.zeros(n)
    for k, ts in enumerate(np.sort(r.uniform(0.05, d - 0.15, 22))):
        th = ins.thump(r.uniform(70, 95), 0.14, r.uniform(0.4, 0.8), f'cp{k}')
        scuff = dsp.bp(r.standard_normal(ns(0.09)), 300, 1800) * dsp.env_perc(0.09, 0.004, 0.025) * 0.5
        i = ns(ts)
        feet[i:i + th.size] += th[:n - i]
        feet[i:i + scuff.size] += scuff[:max(0, min(scuff.size, n - i))]
    swell = dsp.lp(dsp.brown(n, r), 160) * 0.5
    y = (bab * (0.55 + 0.6 * u ** 0.8) + rust * 0.10 * (0.4 + u) + dsp.stereo(feet * 0.5 * (0.5 + u))
         + dsp.stereo(swell * u ** 1.5))
    m, s = (y[0] + y[1]) / 2, (y[0] - y[1]) / 2
    s *= 1 - 0.8 * u                                            # image closes in
    y = np.vstack([m + s, m - s]) * dsp.smoothstep(u / 0.12)
    return _rev(dsp.fade(y, 0.02, 0.15), 'room', 0.12)


def _groan(seed: str, pts, dur: float, hiccup: float | None) -> np.ndarray:
    r = rng('groan', seed)
    t = tvec(dur)
    f0 = _contour(t, pts) * 2 ** (0.35 * np.sin(2 * np.pi * 6.3 * t + r.uniform(0, 6)) * dsp.smoothstep(t / 0.4) / 12)
    if hiccup is not None:                                      # cartoon bounce: a quick pitch blip up and back
        f0 *= 2 ** (5 * np.exp(-0.5 * ((t - hiccup) / 0.035) ** 2) / 12)
    src = 0.7 * dsp.saw(f0, dur) + 0.4 * dsp.square(f0 * 0.5, dur, 0.3) + 0.06 * r.standard_normal(t.size)
    v = dsp.smoothstep(t / dur)
    y = _formants(src, lambda q: np.interp(q, [0, dur * .3, dur], [300, 520, 340]),
                  lambda q: np.interp(q, [0, dur * .3, dur], [750, 900, 700]), floor=0.05)
    hold = np.repeat(y[::5], 5)[:y.size]                        # sample-and-hold grit: reads as a game creature
    y = dsp.lp(0.75 * y + 0.25 * hold, 950, 4)                  # muffled ("behind" the crowd)
    env = dsp.env_adsr(dur, 0.12, 0.3, 0.8, 0.35) * (1 - 0.25 * v)
    return dsp.fade(y * env, 0.01, 0.05)


def zombie_groan() -> np.ndarray:
    """~1.5 s cartoon game-creature 'mmmuh-uh' (low, muffled, bouncy).  Not a real-film monster sound."""
    y = _groan('a', [(0, 88), (0.28, 108), (0.9, 84), (1.5, 70)], 1.5, 0.98)
    return _rev(dsp.haas(y, 6), 'room', 0.3)


def zombie_groan_b() -> np.ndarray:
    """Second voice (different contour / pitch) so two groans in one beat don't sound copy-pasted."""
    y = _groan('b', [(0, 76), (0.2, 92), (0.6, 96), (1.25, 64)], 1.25, None)
    return _rev(dsp.haas(y, 9, -1), 'room', 0.3)


def caught_hit() -> np.ndarray:
    """~1.1 s: a soft, heavy 'whump' (pillow-like body hit, no crunch), then one last muffled heartbeat 'lub'
    without its 'dub' — the heartbeat stops.  A slow low slide underneath drains away."""
    r = rng('caught_hit')
    d = 1.1
    t = tvec(d)
    n = t.size
    whump = np.sin(2 * np.pi * dsp.phase_of(62 + 120 * np.exp(-t / 0.05), n)) * np.exp(-t / 0.24)
    thick = dsp.lp(r.standard_normal(n), 700) * np.exp(-t / 0.06) * 0.9
    thick += dsp.bp(r.standard_normal(n), 110, 320) * np.exp(-t / 0.12) * 1.4      # audible 'body' on phones
    slap = dsp.bp(r.standard_normal(n), 250, 2200) * np.exp(-t / 0.015) * 0.6
    y = dsp.soft_clip((whump * 1.2 + thick + slap) * np.clip(t / 0.001, 0, 1), 1.6)
    lub = ins.thump(62, 0.4, 0.75, 'ch-lub')
    i = ns(0.36)
    y[i:i + lub.size] += (dsp.lp(lub, 300) + 0.5 * dsp.soft_clip(lub * 3, 3) * 0.3)[:n - i]
    drain = dsp.sine(70 * 2 ** (-1.2 * t), d) * dsp.env_adsr(d, 0.05, 0.2, 0.6, 0.6) * 0.18
    return _rev(dsp.stereo(dsp.fade(y + drain, 0, 0.2)), 'room', 0.25)


def red_flash() -> np.ndarray:
    """~0.6 s game 'damage' sting: detuned buzzy stab that dips in pitch + a white 'flash' burst + small drum."""
    r = rng('red_flash')
    d = 0.6
    t = tvec(d)
    f = 622 * (1 - 0.12 * dsp.smoothstep(t / 0.12))
    y = sum(dsp.saw(f * m, d) for m in (1.0, 1.012, 0.5, 0.497)) / 4
    y = dsp.sweep_filter(y, 'lowpass', 1400 + 5000 * np.exp(-t / 0.08))
    y = dsp.soft_clip(y * 2.2, 2) * dsp.env_perc(d, 0.002, 0.14)
    burst = dsp.hp(r.standard_normal(t.size), 3000) * np.exp(-t / 0.03) * 0.35
    out = dsp.haas(y + burst, 7)
    dsp.place(out, dsp.stereo(ins.taiko(58, 0.5, 0.6, 'rf')), 0.0, 0.5)
    return _rev(out, 'room', 0.2)


def cut_black() -> np.ndarray:
    """~0.2 s: the hard cut — one short, dull 'thunk' (nothing above ~400 Hz) that is gone within ~0.15 s, so the
    rest of the black is true silence: mix.py silences every other bus right at this cue (CUT_DEFAULTS) and chops
    the tails of everything that started before it."""
    r = rng('cut_black')
    d = 0.2
    t = tvec(d)
    boom = np.sin(2 * np.pi * dsp.phase_of(60 + 60 * np.exp(-t / 0.02), t.size)) * np.exp(-t / 0.045)
    body = dsp.bp(r.standard_normal(t.size), 90, 380) * np.exp(-t / 0.025) * 1.6
    y = dsp.lp(dsp.soft_clip((boom + body) * np.clip(t / 0.0008, 0, 1), 1.3), 420)
    return dsp.stereo(dsp.fade(y, 0, 0.08))


def continue_tick() -> np.ndarray:
    """Countdown digit beep for CONTINUE?: short pulse-wave blip with a soft click (chip-style, original)."""
    d = 0.22
    y = dsp.square(784, d, 0.25) * 0.8 + 0.25 * dsp.sine(1568, d)
    y = dsp.lp(y, 6500) * dsp.env_adsr(d, 0.002, 0.04, 0.45, 0.1)
    y[:ns(0.012)] += dsp.hp(rng('ct').standard_normal(ns(0.012)), 4000) * np.linspace(0.3, 0, ns(0.012))
    return _rev(dsp.pan(dsp.fade(y, 0.001, 0.02), 0.0), 'room', 0.15)


def continue_yes() -> np.ndarray:
    """~1.1 s YES confirm: a quick 3-step pulse run up (G5 C6 E6) landing on a shimmering chord + bell."""
    out = np.zeros((2, ns(1.3)))
    for i, nm in enumerate(['G5', 'C6', 'E6']):
        d = 0.14 if i < 2 else 0.6
        y = dsp.lp(dsp.square(note(nm), d, 0.25), 7000) * dsp.env_adsr(d, 0.002, 0.05, 0.6, 0.06 if i < 2 else 0.4)
        dsp.place(out, dsp.pan(y, -0.3 + 0.3 * i), i * 0.055, 0.5)
    for i, nm in enumerate(['C6', 'E6', 'G6']):
        dsp.place(out, dsp.pan(ins.bell(note(nm), 1.1, 0.6, f'cy{i}'), -0.3 + 0.3 * i), 0.13, 0.45)
    sp = dsp.hp(rng('cy').standard_normal(ns(0.8)), 6500) * dsp.env_perc(0.8, 0.02, 0.18) * 0.12
    dsp.place(out, dsp.haas(sp, 9), 0.13)
    return _rev(out, 'room', 0.25)


def kaiju_rumble() -> np.ndarray:
    """~4.2 s: something huge rising behind the buildings — a slow low rumble swelling (brown noise + a rattling
    ground tone), gravel/debris trickles getting denser, two heavy shifts of weight.  No roar in it."""
    r = rng('kaiju_rumble')
    d = 4.2
    n = ns(d)
    t = np.arange(n) / SR
    u = t / d
    grow = dsp.smoothstep(u / 0.8) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.6 * t))
    low = dsp.hp(dsp.lp(dsp.brown(n, r), 160, 4), 45, 2) * 0.5
    mid = dsp.bp(dsp.pink(n, r), 80, 500) * 1.1
    ground = dsp.sine(62 + 8 * u, d) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 7 * t))) * 0.3
    ground += dsp.lp(dsp.saw(62 + 8 * u, d), 300) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 7 * t))) * 0.2
    y = dsp.stereo((low + mid + ground) * grow)
    for k, ts in enumerate(np.sort(r.uniform(0.4, d - 0.2, 70) ** 1.0)):
        if r.random() > 0.25 + 0.75 * ts / d:
            continue
        g = dsp.bp(r.standard_normal(ns(0.06)), 900, 4500) * dsp.env_perc(0.06, 0.002, 0.012)
        dsp.place(y, dsp.pan(g, r.uniform(-0.8, 0.8)), ts, r.uniform(0.05, 0.16))
    for ts, f in ((1.5, 58), (2.8, 54)):
        dsp.place(y, dsp.stereo(dsp.lp(ins.taiko(f, 1.4, 1.0, f'kr{ts}'), 500)), ts, 0.9)
    return _rev(dsp.fade(y, 0.1, 0.5), 'big', 0.3)


def kaiju_roar() -> np.ndarray:
    """~1.75 s ORIGINAL silly giant bellow: 'BWOOO-AAAH' (tuba/foghorn: buzzy harmonic tone with brightness that
    follows loudness, scoop up, wide warbly vibrato, vowel oo -> aa, a kazoo-ish buzz on top), a comic 'hic!', then
    a deflating fall 'bwuuu'.  Harmonic and tonal (< ~3 kHz), so it can't be mistaken for any famous screech roar.
    Compact on purpose (QA 2026-10-26): the whole gag — bellow .0–.95, hic 1.0–1.14, fall 1.2–1.7 — must land before
    the smash cut at the kaiju beat end (combined cue at roarAt 1.85 of the 4 s beat → over by ≈3.6 s, swell at 3.9)."""
    r = rng('kaiju_roar')
    d = 1.75
    t = tvec(d)
    n = t.size
    out = np.zeros((2, n))
    # 1) the bellow 0.0 – 0.95 s
    db_ = 0.95
    tb = tvec(db_)
    f0 = _contour(tb, [(0, 52), (0.22, 74), (0.65, 70), (0.95, 66)])
    vib = 2 ** ((0.25 + 0.6 * dsp.smoothstep((tb - 0.2) / 0.5)) * np.sin(2 * np.pi * 4.6 * tb) / 12)
    f0 = f0 * vib
    env = dsp.env_adsr(db_, 0.16, 0.15, 0.9, 0.1)
    src = 0.8 * dsp.saw(f0, db_) + 0.5 * dsp.square(f0 * 0.5, db_, 0.5) + 0.35 * dsp.saw(f0 * 1.006, db_)
    brass = dsp.sweep_filter(src, 'lowpass', 220 + 1700 * env ** 1.5)
    brass = _formants(brass, lambda q: np.interp(q, [0, .35, db_], [320, 650, 700]),
                      lambda q: np.interp(q, [0, .35, db_], [700, 1050, 1150]), floor=0.25, bw=0.3)
    kazoo = dsp.bp(dsp.saw(f0 * 2, db_), 500, 1300) * 0.25
    bel = dsp.lp(dsp.soft_clip((brass + kazoo) * env * 1.6, 1.4), 3000, 4)
    bel = dsp.fade(bel, 0.005, 0.04)
    dsp.place(out, dsp.haas(bel, 11), 0.0)
    dsp.place(out, dsp.haas(dsp.lp(dsp.saw(f0 * 0.997 * 2 ** (6 / 1200), db_), 600) * env * 0.3, 4, -1), 0.0)
    # 2) the hiccup 1.0 – 1.14 s: short upward chirp, 'i' vowel
    dh = 0.14
    th = tvec(dh)
    fh = 150 * 2 ** (1.3 * th / dh)
    hic = dsp.lp(dsp.saw(fh, dh) + 0.5 * dsp.square(fh, dh, 0.4), 2600) * dsp.env_adsr(dh, 0.004, 0.03, 0.7, 0.05)
    hic = _formants(hic, lambda q: 0 * q + 330, lambda q: 0 * q + 2100, floor=0.3)
    hic = dsp.fade(hic, 0.006, 0.03)                           # STFT edges -> no click
    dsp.place(out, dsp.haas(hic, 5), 1.0, 1.1)
    # 3) the deflating fall 1.2 – 1.7 s
    df = 0.5
    tf = tvec(df)
    ff = 72 * 2 ** (-1.0 * dsp.smoothstep(tf / df)) * 2 ** (0.4 * np.sin(2 * np.pi * 7 * tf) / 12)
    fall = dsp.sweep_filter(dsp.saw(ff, df) + 0.4 * dsp.square(ff * 0.5, df), 'lowpass', 900 - 600 * tf / df)
    fall *= dsp.env_adsr(df, 0.04, 0.12, 0.7, 0.22) * 0.6
    dsp.place(out, dsp.haas(fall, 8), 1.2)
    return _rev(dsp.fade(out, 0.005, 0.08), 'big', 0.22)


def boing() -> np.ndarray:
    """~0.7 s cartoon spring 'boyoyoing' for the gag caption."""
    d = 0.7
    t = tvec(d)
    f = 240 + 160 * (1 - np.exp(-t / 0.03)) + 70 * np.sin(2 * np.pi * 15 * t) * np.exp(-t / 0.22)
    ph = 2 * np.pi * dsp.phase_of(f, t.size)
    y = (np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) * dsp.env_perc(d, 0.003, 0.22)
    tw = dsp.resonator(rng('boing').standard_normal(t.size) * np.exp(-t / 0.004), 1800, 12) * 0.1
    return _rev(dsp.pan(dsp.fade(y + tw, 0.001, 0.05), 0.1), 'room', 0.15)


def smash_cut() -> np.ndarray:
    """~0.6 s: 0.1 s sucked-in noise swell into a hard punchy 'thwack' (kick + snap) — the gag's smash cut.
    The hit is at 0.1 s (HIT_AT, place with align:'hit'); mix.py chops earlier SFX tails right at the hit."""
    r = rng('smash_cut')
    pre = 0.1
    d = 0.6
    n = ns(d)
    out = np.zeros((2, n))
    k = ns(pre)
    uu = np.arange(k) / k
    sw = dsp.sweep_filter(r.standard_normal((2, k)), 'highpass', 500 + 5000 * uu ** 2) * uu ** 2.5 * 0.5
    out[:, :k] += sw
    th = tvec(d - pre)
    kick = np.sin(2 * np.pi * dsp.phase_of(68 + 130 * np.exp(-th / 0.025), th.size)) * np.exp(-th / 0.1)
    snap = dsp.bp(r.standard_normal(th.size), 1500, 8000) * np.exp(-th / 0.03) * 0.8
    body = dsp.bp(r.standard_normal(th.size), 200, 1200) * np.exp(-th / 0.05) * 0.5
    dsp.place(out, dsp.haas(dsp.soft_clip(kick + snap + body, 1.5), 3), pre)
    return _rev(dsp.fade(out, 0, 0.1), 'room', 0.18)


def end_sting() -> np.ndarray:
    """~1.8 s end-card sting: light pluck flourish up into a soft bright chord (F major add9) + small drum."""
    out = np.zeros((2, ns(2.2)))
    for i, nm in enumerate(['C5', 'F5', 'A5', 'C6']):
        dsp.place(out, dsp.pan(ins.pluck(note(nm), 0.5, 0.7, f'es{i}', bright=2), -0.4 + 0.27 * i), i * 0.06, 0.6)
    t0 = 0.26
    for i, nm in enumerate(['F4', 'C5', 'G5', 'A5', 'F6']):
        dsp.place(out, dsp.pan(ins.bell(note(nm), 1.8, 0.55, f'esb{i}'), -0.4 + 0.2 * i), t0, 0.5)
    dsp.place(out, dsp.stereo(ins.taiko(70, 0.9, 0.7, 'es')), t0, 0.5)
    return _rev(out, 'hall', 0.3)


# ------------------------------------------------------------------ v6 (2026-10-27): 「渋谷Halloweenには近づくな」
# mission card (opening), first choice (A 「そもそも渋谷に行かない」 picked), TRUE END (gold seal + warm jingle), guide
# card, GOODBYE end card.  Tone: sincere and warm, not comic.  The TRUE END jingle is deliberately unlike the game's
# victory cues (clear_jingle / escaped / victory are D major, bright, plucked, with drums): Eb major, slow, no drums, a
# plagal (IV -> I) "amen" resolution with a soft celesta line and a warm low horn-like pad.  goodbye_in opens the end
# card quietly (a low felt-piano chord) and acts as a *soft cut* in mix.py (CUT_DEFAULTS: earlier SFX tails — the kaiju
# gag — are chopped, beds dip and recover), so no comedic tail ever plays over the quoted city text.

def _felt(f: float, dur: float, vel: float, seed: str) -> np.ndarray:
    """Soft felt-piano-like note: a dark pluck + a quiet bell partial + a tiny hammer thump; slow, warm decay."""
    y = ins.pluck(f, dur, vel, f'felt{seed}', bright=0.7) + 0.25 * ins.bell(f, dur, vel * 0.6, f'feltb{seed}')
    y = dsp.lp(y, 2600)
    th = dsp.lp(rng('felt', seed).standard_normal(ns(0.03)), 900) * dsp.env_perc(0.03, 0.001, 0.008) * 0.15 * vel
    y[:th.size] += th
    return dsp.fade(y, 0.002, 0.3)


def mission_in() -> np.ndarray:
    """~2.4 s mission-card hit for the opening 「渋谷ハロウィンには、近づくな。」: a short air swell into a soft low
    'dum' (felt mallet, not a slam), an open-fifth bell dyad D4/A4 (serious, neither scary nor cheerful), and a low
    pad tail so the card reads as an instruction, not an alert.  Hit at 0.12 s (HIT_AT, align:'hit')."""
    r = rng('mission_in')
    pre = 0.12
    out = np.zeros((2, ns(2.6)))
    k = ns(pre)
    uu = np.arange(k) / k
    out[:, :k] += dsp.sweep_filter(r.standard_normal((2, k)), 'lowpass', 600 + 3500 * uu ** 2) * uu ** 2 * 0.25
    dsp.place(out, dsp.stereo(ins.thump(62, 0.5, 0.7, 'mi')), pre, 0.55)
    for i, nm in enumerate(['D4', 'A4']):
        dsp.place(out, dsp.pan(ins.bell(note(nm), 2.2, 0.6, f'mib{i}'), -0.25 + 0.5 * i), pre + 0.01 * i, 0.75)
        dsp.place(out, dsp.pan(_felt(note(nm) / 2, 2.2, 0.7, f'mi{i}'), 0.2 - 0.4 * i), pre, 0.6)
    for i, nm in enumerate(['D3', 'A3']):
        dsp.place(out, dsp.pan(ins.pad_voice(note(nm), 2.2, 0.2, f'mip{i}', bright=900, attack=0.08, release=1.2,
                                             kind='tri'), -0.4 + 0.8 * i), pre, 0.7)
    return _rev(dsp.fade(out, 0.002, 0.4), 'hall', 0.3)


def choice_pick() -> np.ndarray:
    """~0.9 s warm confirm for the first choice's pick (A 「そもそも渋谷に行かない」): two soft mallet notes G5 -> C6
    and a quiet bell E6 — lower and rounder than ui_select (E6 -> B6, bright): the right answer sounds calm, not
    flashy."""
    out = np.zeros((2, ns(1.1)))
    for i, (nm, at) in enumerate([('G5', 0.0), ('C6', 0.07)]):
        dsp.place(out, dsp.pan(_felt(note(nm), 0.9, 0.8, f'cp{i}'), -0.15 + 0.3 * i), at, 0.7)
        dsp.place(out, dsp.pan(ins.music_box(note(nm), 0.9, 0.5, f'cpm{i}'), -0.15 + 0.3 * i), at, 0.25)
    dsp.place(out, dsp.haas(ins.bell(note('E6'), 0.9, 0.4, 'cpb'), 6), 0.08, 0.25)
    return _rev(out, 'room', 0.3)


def seal_stamp() -> np.ndarray:
    """~0.9 s TRUE END seal: a soft wooden/wax 'thock' (no rubber slam, no crack) + a short gold shimmer.  Place it
    where the stamp lands (variant-system STAMP_DROP), then true_end_jingle ~0.05 s later."""
    r = rng('seal_stamp')
    d = 0.9
    t = tvec(d)
    n = t.size
    body = np.sin(2 * np.pi * dsp.phase_of(120 + 80 * np.exp(-t / 0.015), n)) * np.exp(-t / 0.07)
    wood = dsp.resonator(r.standard_normal(n) * np.exp(-t / 0.004), 520, 18) * 0.5
    tap = dsp.bp(r.standard_normal(n), 300, 2200) * np.exp(-t / 0.008) * 0.35
    y = dsp.lp(dsp.soft_clip((body + wood + tap) * np.clip(t / 0.001, 0, 1), 1.2), 3000)
    out = dsp.stereo(dsp.fade(y, 0, 0.2))
    sh = dsp.bp(r.standard_normal(ns(0.7)), 5000, 11000) * dsp.env_adsr(0.7, 0.04, 0.1, 0.5, 0.45) * 0.05
    dsp.place(out, dsp.haas(sh, 8), 0.03)
    dsp.place(out, dsp.pan(ins.bell(note('Bb6'), 0.8, 0.35, 'ssb'), 0.2), 0.03, 0.18)
    return _rev(out, 'room', 0.25)


def true_end_jingle() -> np.ndarray:
    """~3.6 s TRUE END: original, warm and short.  Eb major, slow, no drums: a soft rolled harp-like chord (Ab/Eb, the
    IV), a celesta line C6 - Bb5 - G5 resolving onto Eb maj9 (the I) with a warm low horn-like pad and a quiet bell on
    Eb6 — a plagal 'amen' cadence, the opposite of the bright D-major victory/clear cues.  Light, kind, not
    triumphant."""
    out = np.zeros((2, ns(4.0)))
    for i, nm in enumerate(['Eb3', 'Ab3', 'C4', 'Eb4', 'Ab4']):            # IV over the tonic pedal, rolled
        dsp.place(out, dsp.pan(ins.pluck(note(nm), 1.4, 0.6, f'te{i}', bright=0.8), -0.5 + 0.25 * i), i * 0.06, 0.5)
    for i, nm in enumerate(['Ab3', 'C4', 'Eb4']):
        dsp.place(out, dsp.pan(ins.pad_voice(note(nm), 1.4, 0.18, f'tep{i}', bright=1100, attack=0.15, release=0.6,
                                             kind='tri'), -0.3 + 0.3 * i), 0.0, 0.6)
    for i, (nm, at) in enumerate([('C6', 0.32), ('Bb5', 0.62), ('G5', 1.02)]):   # celesta line
        dsp.place(out, dsp.pan(ins.music_box(note(nm), 2.2, 0.7, f'tem{i}'), 0.25 - 0.1 * i), at, 0.5)
    t1 = 1.0                                                                  # I: Eb maj9
    for i, nm in enumerate(['Eb3', 'Bb3', 'G4', 'D5', 'F5']):
        dsp.place(out, dsp.pan(ins.pluck(note(nm), 2.6, 0.55, f'tei{i}', bright=0.9), -0.4 + 0.2 * i), t1 + i * 0.05,
                  0.45)
        dsp.place(out, dsp.pan(ins.pad_voice(note(nm), 2.8, 0.2, f'teip{i}', bright=1500, attack=0.25, release=1.6,
                                             kind='tri'), 0.4 - 0.2 * i), t1, 0.55)
    horn = ins.pad_voice(note('Eb3'), 2.6, 0.35, 'tehorn', bright=700, attack=0.2, release=1.3, voices=2, kind='saw')
    dsp.place(out, dsp.haas(dsp.lp(horn, 900), 5), t1, 0.45)
    dsp.place(out, dsp.haas(ins.bell(note('Eb6'), 2.6, 0.45, 'tebell'), 9), t1 + 0.3, 0.3)
    dsp.place(out, dsp.stereo(ins.thump(52, 0.6, 0.5, 'tet')), t1, 0.35)    # soft floor, not a drum hit
    return _rev(dsp.fade(out, 0.002, 0.6), 'hall', 0.35)


def guide_in() -> np.ndarray:
    """~0.5 s guide card in (「ここからは“もしも”の脱出ガイド」): a soft page/map unfold — two quick paper swipes and a
    low-mid 'tuck', calmer than ui_blip, distinct from card_in (a single air swipe)."""
    r = rng('guide_in')
    out = np.zeros((2, ns(0.6)))
    for k, (at, lo, hi) in enumerate([(0.0, 1200, 6000), (0.11, 900, 4500)]):
        d = 0.18
        u = np.arange(ns(d)) / ns(d)
        y = dsp.bp(r.standard_normal(ns(d)), lo, hi) * np.sin(np.pi * u) ** 2
        dsp.place(out, dsp.pan(y, -0.3 + 0.6 * k), at, 0.8 - 0.2 * k)
    dsp.place(out, dsp.stereo(dsp.lp(ins.thump(140, 0.12, 0.5, 'gi'), 900)), 0.25, 0.4)
    return _rev(out, 'room', 0.18)


def goodbye_in() -> np.ndarray:
    """~3 s end-card open (GOODBYE BAD HALLOWEEN): one low felt-piano chord Bb2 F3 D4 (+ C5 add9) with a soft air
    breath — sincere, no sting, no gag.  mix.py treats it as a soft cut (CUT_DEFAULTS): the kaiju gag's tails are
    chopped at its cue time and the beds dip then recover into the `farewell` bed."""
    r = rng('goodbye_in')
    out = np.zeros((2, ns(3.2)))
    for i, nm in enumerate(['Bb2', 'F3', 'D4', 'C5']):
        dsp.place(out, dsp.pan(_felt(note(nm), 3.0, 0.75 - 0.1 * i, f'gb{i}'), -0.3 + 0.2 * i), 0.02 * i, 0.6)
    n = ns(1.2)
    u = np.arange(n) / n
    air = dsp.bp(r.standard_normal((2, n)), 400, 3000) * np.sin(np.pi * u) ** 2 * 0.05
    dsp.place(out, air, 0.0)
    return _rev(dsp.fade(out, 0.002, 0.8), 'hall', 0.35)


def glitch() -> np.ndarray:
    """v7 CG↔photoreal switch: a short digital stutter — bit-crushed noise bursts gated in 3 jittered slices + a falling
    sine blip, ≈ 0.3 s (synthesised; the video's RGB-glitch cut lasts 8 frames)."""
    r = rng('glitch')
    d = 0.32
    n = ns(d)
    t = tvec(d)
    nz = r.standard_normal((2, n))
    crush = np.round(nz * 3) / 3                                     # bit-crush
    held = np.repeat(crush[:, ::24], 24, axis=1)[:, :n]              # sample-and-hold → digital grit
    gate = np.zeros(n)
    for a, b in ((0.0, 0.05), (0.075, 0.11), (0.14, 0.24)):
        gate[ns(a):ns(b)] = 1
    gate = dsp.lp(gate, 400)
    blip = dsp.sine(2400 * np.exp(-t * 9), d) * dsp.env_perc(d, 0.002, 0.12)
    y = (0.55 * dsp.bp(held, 600, 7000) + 0.35 * dsp.hp(crush, 2500)) * gate + 0.4 * dsp.stereo(blip)
    return _rev(y, 'room', 0.12)


REGISTRY = {
    'logo_slam': logo_slam, 'whoosh': whoosh, 'ui_blip': ui_blip, 'ui_select': ui_select, 'tick': tick, 'tock': tock,
    'escaped': escaped, 'clear_jingle': clear_jingle, 'gameover_jingle': gameover_jingle, 'red_alert': red_alert,
    'stamp_hit': stamp_hit, 'riser': riser, 'heartbeat': heartbeat, 'card_in': card_in, 'press_start': press_start,
    'choice_move': choice_move, 'crowd_swell': crowd_swell,
    'crowd_press': crowd_press, 'zombie_groan': zombie_groan, 'zombie_groan_b': zombie_groan_b,
    'caught_hit': caught_hit, 'red_flash': red_flash, 'cut_black': cut_black, 'continue_tick': continue_tick,
    'continue_yes': continue_yes, 'kaiju_rumble': kaiju_rumble, 'kaiju_roar': kaiju_roar, 'boing': boing,
    'smash_cut': smash_cut, 'end_sting': end_sting,
    'mission_in': mission_in, 'choice_pick': choice_pick, 'seal_stamp': seal_stamp,
    'true_end_jingle': true_end_jingle, 'guide_in': guide_in, 'goodbye_in': goodbye_in,
    'glitch': glitch,
}
REQUIRED = ('logo_slam', 'whoosh', 'ui_blip', 'ui_select', 'tick', 'escaped', 'clear_jingle', 'gameover_jingle',
            'red_alert', 'stamp_hit')
# combined-episodes contract (CONTRACT.md "Sound"); selftest / tests check these exist too
REQUIRED_COMBINED = ('crowd_press', 'zombie_groan', 'caught_hit', 'red_flash', 'cut_black', 'continue_tick',
                     'continue_yes', 'kaiju_rumble', 'kaiju_roar', 'smash_cut')
ALIASES = {'slam': 'logo_slam', 'blip': 'ui_blip', 'select': 'ui_select', 'alert': 'red_alert', 'stamp': 'stamp_hit',
           'clear': 'clear_jingle', 'gameover': 'gameover_jingle', 'game_over': 'gameover_jingle',
           # combined episodes: tolerant spellings a cue sheet might use
           'press': 'crowd_press', 'crowd_close': 'crowd_press', 'groan': 'zombie_groan', 'zombie': 'zombie_groan',
           'groan_b': 'zombie_groan_b', 'zombie_groan2': 'zombie_groan_b', 'zombie_groan_2': 'zombie_groan_b',
           'hit': 'caught_hit', 'caught': 'caught_hit', 'flash': 'red_flash', 'black': 'cut_black',
           'cut_to_black': 'cut_black', 'tick_continue': 'continue_tick', 'countdown': 'continue_tick',
           'yes': 'continue_yes', 'continue_select': 'continue_yes', 'rumble': 'kaiju_rumble',
           'roar': 'kaiju_roar', 'kaiju': 'kaiju_roar', 'spring': 'boing', 'gag': 'boing', 'smash': 'smash_cut',
           'endcard': 'end_sting', 'end_card': 'end_sting', 'sting': 'end_sting',
           # v6
           'mission': 'mission_in', 'mission_card': 'mission_in', 'pick': 'choice_pick', 'first_pick': 'choice_pick',
           'choice_select': 'choice_pick', 'seal': 'seal_stamp', 'stamp_true': 'seal_stamp',
           'true_end_stamp': 'seal_stamp', 'true_end': 'true_end_jingle', 'trueend': 'true_end_jingle',
           'guide': 'guide_in', 'guide_card': 'guide_in',
           'goodbye': 'goodbye_in', 'goodbye_card': 'goodbye_in', 'farewell_in': 'goodbye_in',
           # v7
           'rgb_glitch': 'glitch', 'switch': 'glitch', 'whip': 'whoosh', 'whip_pan': 'whoosh'}
# v6 contract (next/CONTRACT.md "sound"): selftest / tests check these exist
REQUIRED_V6 = ('mission_in', 'choice_pick', 'seal_stamp', 'true_end_jingle', 'guide_in', 'goodbye_in')
# gag / scare sounds that must never sound over the GOODBYE end card's quoted block (mix.lint_v6 checks this)
COMEDIC = ('boing', 'smash_cut', 'kaiju_roar', 'kaiju_rumble', 'zombie_groan', 'zombie_groan_b', 'red_flash',
           'caught_hit', 'red_alert', 'crowd_swell', 'crowd_press', 'end_sting', 'gameover_jingle', 'stamp_hit',
           'logo_slam')


def canonical(name: str) -> str | None:
    n = str(name).strip().lower().replace('-', '_').replace(' ', '_')
    n = ALIASES.get(n, n)
    return n if n in REGISTRY else None


@lru_cache(maxsize=None)
def get(name: str) -> np.ndarray:
    n = canonical(name)
    if n is None:
        raise KeyError(f'unknown sfx {name!r}; known: {sorted(REGISTRY)}')
    y = REGISTRY[n]()
    if y.ndim == 1:
        y = dsp.stereo(y)
    y = dsp.hp(y, 30, 2)
    y = dsp.normalize_peak(y, -1.0) * dsp.db(BASE_DB[n])
    # trim trailing near-silence
    e = np.max(np.abs(y), 0)
    idx = np.nonzero(e > 1e-4)[0]
    end = min(y.shape[-1], (idx[-1] + ns(0.02)) if idx.size else y.shape[-1])
    return dsp.fade(y[:, :end], 0, 0.01)


# Offsets for cues whose musical "hit" is not at sample 0 (e.g. riser ends at its length).  mix.py uses
# 'align': 'end' to place by the hit point.
HIT_AT = {'riser': 1.8, 'escaped': 0.32, 'clear_jingle': 7 * 0.07 + 0.05, 'gameover_jingle': 0.0,
          'smash_cut': 0.1, 'kaiju_roar': 0.3, 'continue_yes': 0.0, 'end_sting': 0.26,
          'mission_in': 0.12, 'true_end_jingle': 1.0, 'seal_stamp': 0.0, 'goodbye_in': 0.0}
