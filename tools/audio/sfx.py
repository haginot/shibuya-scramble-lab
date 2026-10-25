"""Original synthesized SFX. ``get(name)`` -> (2, n) at its house level (peak-normalized, then BASE_DB).

Required set (CONTRACT.md): logo_slam, whoosh, ui_blip, ui_select, tick, escaped, clear_jingle, gameover_jingle,
red_alert, stamp_hit.  Extras: tock (2nd tick pitch), riser (1.8 s build that ends on its cue time + 1.8 s;
place it 1.8 s before a slam), heartbeat, card_in (soft paper/air swipe), press_start (soft shimmer for the
PRESS START beat), choice_move (cursor move), crowd_swell (brief crowd surge used under red_alert / zone scenes).

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


REGISTRY = {
    'logo_slam': logo_slam, 'whoosh': whoosh, 'ui_blip': ui_blip, 'ui_select': ui_select, 'tick': tick, 'tock': tock,
    'escaped': escaped, 'clear_jingle': clear_jingle, 'gameover_jingle': gameover_jingle, 'red_alert': red_alert,
    'stamp_hit': stamp_hit, 'riser': riser, 'heartbeat': heartbeat, 'card_in': card_in, 'press_start': press_start,
    'choice_move': choice_move, 'crowd_swell': crowd_swell,
}
REQUIRED = ('logo_slam', 'whoosh', 'ui_blip', 'ui_select', 'tick', 'escaped', 'clear_jingle', 'gameover_jingle',
            'red_alert', 'stamp_hit')
ALIASES = {'slam': 'logo_slam', 'blip': 'ui_blip', 'select': 'ui_select', 'alert': 'red_alert', 'stamp': 'stamp_hit',
           'clear': 'clear_jingle', 'gameover': 'gameover_jingle', 'game_over': 'gameover_jingle'}


def canonical(name: str) -> str | None:
    n = name.strip().lower().replace('-', '_')
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
HIT_AT = {'riser': 1.8, 'escaped': 0.32, 'clear_jingle': 7 * 0.07 + 0.05, 'gameover_jingle': 0.0}
