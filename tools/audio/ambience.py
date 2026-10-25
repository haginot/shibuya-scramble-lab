"""Synthesized ambience beds (no recordings): ``bed(name)`` -> (2, n) seamless loop at its house loudness.

  crowd-night   dense outdoor murmur (synthetic Japanese-vowel babble: glottal source -> 5 vowel formant banks,
                syllable-rate envelopes, talk/pause phrasing), a far diffuse crowd layer, occasional distant
                cheers, low city/traffic rumble.
  station-hall  sparser murmur in a long hall reverb, footsteps on hard floor, ventilation hum.  (No gate beeps,
                no announcements or departure melodies — nothing that could be a real station's sound.)
  street-quiet  wind, distant car passes, a few far voices.

The babble is synthesized at 16 kHz (speech band) and resampled to 48 kHz.  Loops are made with an equal-power
crossfade of an over-long render (dsp.loop_crossfade).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy import signal

import dsp
from dsp import SR, ns, rng

BEDS = ('crowd-night', 'station-hall', 'street-quiet')
BED_LUFS = {'crowd-night': -28.0, 'station-hall': -30.0, 'street-quiet': -32.0}
LOOP_S = 24.0
_BSR = 16000
# Japanese vowels a i u e o: (F1, F2, F3) Hz, adult male-ish; female voices scale by 1.17
_FORMANTS = {'a': (800, 1200, 2500), 'i': (300, 2300, 3000), 'u': (350, 1300, 2300), 'e': (500, 1900, 2500),
             'o': (500, 850, 2400)}
_VOWELS = list(_FORMANTS)


def _bank(vowel: str, scale: float):
    out = []
    for k, f in enumerate(_FORMANTS[vowel]):
        f = min(f * scale, _BSR * 0.45)
        bw = 80 + 0.08 * f
        sos = signal.butter(1, [max(f - bw, 50), min(f + bw, _BSR * 0.49)], btype='bandpass', fs=_BSR, output='sos')
        out.append((sos, (1.0, 0.7, 0.35)[k]))
    return out


def babble(dur: float, seed: str, voices: int = 24, rate: float = 4.5, spread: float = 0.9,
           talk: tuple = (1.5, 4.5), pause: tuple = (0.4, 2.0)) -> np.ndarray:
    """Synthetic multi-talker murmur, (2, ns(dur)) at 48 kHz, unit-ish RMS."""
    r = rng('babble', seed)
    n = int(round(dur * _BSR))
    t = np.arange(n) / _BSR
    # per (gender, vowel) bus, stereo
    bus = np.zeros((2, 5, 2, n))
    for v in range(voices):
        female = r.random() < 0.5
        f0 = r.uniform(185, 250) if female else r.uniform(95, 140)
        # intonation: slow wander + phrase declination
        walk = np.cumsum(r.standard_normal(n)) / np.sqrt(_BSR) * 0.6
        walk = signal.sosfilt(signal.butter(1, 2.0, fs=_BSR, output='sos'), walk)
        f = f0 * 2 ** (np.clip(walk, -0.4, 0.4) * 0.5)
        ph = np.cumsum(f) / _BSR + r.uniform(0, 1)
        src = 2 * (ph - np.floor(ph)) - 1
        src = src + 0.25 * r.standard_normal(n)              # breathiness
        # syllables inside talk spurts
        env = np.zeros((5, n))
        tt = r.uniform(-1, 1)
        while tt < dur:
            spurt_end = tt + r.uniform(*talk)
            while tt < min(spurt_end, dur):
                sd = r.uniform(0.09, 0.22)
                i0, i1 = int(max(tt, 0) * _BSR), int(min(tt + sd, dur) * _BSR)
                if i1 > i0:
                    w = np.sin(np.pi * np.linspace(0, 1, i1 - i0)) ** 1.5 * r.uniform(0.5, 1.0)
                    env[r.integers(0, 5), i0:i1] += w
                tt += sd + r.exponential(1 / rate) * 0.5
            tt += r.uniform(*pause)
        p = r.uniform(-spread, spread)
        a = (p + 1) * np.pi / 4
        g = r.uniform(0.4, 1.0)
        for k in range(5):
            if env[k].any():
                s = src * env[k] * g
                bus[int(female), k, 0] += s * np.cos(a)
                bus[int(female), k, 1] += s * np.sin(a)
    out = np.zeros((2, n))
    for gi in range(2):
        for k, vw in enumerate(_VOWELS):
            for sos, amp in _bank(vw, 1.17 if gi else 1.0):
                out += amp * signal.sosfilt(sos, bus[gi, k], axis=-1)
    out = signal.resample_poly(out, 3, 1, axis=-1)
    out = dsp.fit(out, ns(dur))
    return out / (np.std(out) + 1e-12)


def _diffuse_crowd(dur: float, seed: str) -> np.ndarray:
    """Far crowd wash: pink noise in the speech band with fast random AM (many syllables smeared)."""
    r = rng('diffuse', seed)
    n = ns(dur)
    nz = np.vstack([dsp.pink(n, r), dsp.pink(n, r)])
    nz = dsp.bp(nz, 250, 2200, 2)
    am = dsp.lp(r.standard_normal((2, n)), 6.0, 1)
    am = 1 + 3.0 * am / (np.std(am) + 1e-9) * 0.25
    return nz * am


def _cheer(dur: float, seed: str) -> np.ndarray:
    """Distant group 'wooo' (sustained 'o' vowels, rising then falling pitch), mono."""
    r = rng('cheer', seed)
    n = int(dur * _BSR)
    t = np.arange(n) / _BSR
    u = t / dur
    y = np.zeros(n)
    for v in range(10):
        f0 = r.uniform(160, 330)
        f = f0 * (1 + 0.25 * np.sin(np.pi * u) ** 2) * (1 + 0.01 * np.sin(2 * np.pi * r.uniform(4, 6) * t))
        ph = np.cumsum(f) / _BSR + r.uniform(0, 1)
        y += 2 * (ph - np.floor(ph)) - 1
    env = np.sin(np.pi * u) ** 2
    out = np.zeros(n)
    for sos, amp in _bank('o', 1.1):
        out += amp * signal.sosfilt(sos, y * env)
    out = signal.resample_poly(out, 3, 1)
    return out / (np.max(np.abs(out)) + 1e-9)


def _footsteps(dur: float, seed: str, per_s: float = 6.0) -> np.ndarray:
    r = rng('steps', seed)
    out = np.zeros((2, ns(dur)))
    tt = 0.0
    while tt < dur:
        d = 0.06
        tv = dsp.tvec(d)
        exc = r.standard_normal(tv.size) * np.exp(-tv / 0.004)
        y = dsp.bp(exc, 600, 4000) * 0.6 + dsp.resonator(exc, r.uniform(900, 1600), 8) * 0.4
        dsp.place(out, dsp.pan(y, r.uniform(-0.9, 0.9)), tt, r.uniform(0.2, 1.0))
        tt += r.exponential(1 / per_s)
    return out


def _car_pass(dur: float, seed: str) -> np.ndarray:
    r = rng('car', seed)
    n = ns(dur)
    u = np.arange(n) / n
    nz = np.vstack([dsp.brown(n, r), dsp.brown(n, r)]) * 0.6 + np.vstack([dsp.pink(n, r), dsp.pink(n, r)]) * 0.15
    env = np.exp(-((u - 0.5) / 0.22) ** 2)
    fc = 250 + 1600 * env
    y = dsp.sweep_filter(nz, 'lowpass', fc) * env
    d = 1 if r.random() < 0.5 else -1
    p = np.clip(d * (u - 0.5) * 2, -1, 1)
    a = (p + 1) * np.pi / 4
    return y * np.vstack([np.cos(a), np.sin(a)])


def _rumble(dur: float, seed: str) -> np.ndarray:
    r = rng('rumble', seed)
    n = ns(dur)
    y = np.vstack([dsp.brown(n, r), dsp.brown(n, r)])
    y = dsp.lp(y, 160, 2)
    sw = 1 + 0.4 * dsp.lp(r.standard_normal(n), 0.15, 1) / 0.01
    return y * np.clip(sw / (np.max(np.abs(sw)) + 1e-9) + 0.6, 0.3, 1.5)


def crowd_night(dur: float) -> np.ndarray:
    near = babble(dur, 'cn-near', voices=28, rate=4.8)
    far = babble(dur, 'cn-far', voices=40, rate=5.0)
    far = dsp.lp(far, 1600, 2)
    wash = _diffuse_crowd(dur, 'cn')
    ir = dsp.reverb_ir(1.4, 'outdoor', predelay=0.02, bright=4000)
    y = (dsp.lp(near, 3800, 2) * 0.55 + far * 0.45 + wash * 0.25)
    y = dsp.fit(dsp.add_reverb(y, ir, 0.35), ns(dur))
    r = rng('cn-cheers')
    for k in range(3):
        c = _cheer(r.uniform(1.6, 2.6), f'cn{k}')
        c = dsp.lp(c, 1800, 2)
        cs = dsp.fit(dsp.add_reverb(dsp.pan(c, r.uniform(-0.7, 0.7)), ir, 0.8), ns(4))
        dsp.place(y, cs, r.uniform(1.0, dur - 4.0), 0.35)
    y += _rumble(dur, 'cn') * 0.2
    return y


def station_hall(dur: float) -> np.ndarray:
    talk = babble(dur, 'sh', voices=14, rate=4.2, talk=(1.0, 3.0), pause=(0.8, 3.0))
    steps = _footsteps(dur, 'sh', 7.0) * 0.5
    ir = dsp.reverb_ir(2.6, 'hall', predelay=0.035, bright=3500)
    y = dsp.lp(talk, 3200, 2) * 0.6 + steps
    y = dsp.fit(dsp.add_reverb(y, ir, 0.9), ns(dur))
    r = rng('sh-hvac')
    n = ns(dur)
    hv = dsp.lp(np.vstack([dsp.pink(n, r), dsp.pink(n, r)]), 500, 2) * 0.25
    hum = dsp.stereo(dsp.sine(100.0, dur) * 0.02 + dsp.sine(200.0, dur) * 0.01)
    return y + hv + hum


def street_quiet(dur: float) -> np.ndarray:
    r = rng('sq')
    n = ns(dur)
    wind = dsp.lp(np.vstack([dsp.pink(n, r), dsp.pink(n, r)]), 700, 2)
    wind *= 0.5 + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * dsp.tvec(dur) + 1.0))
    y = wind * 0.35 + _rumble(dur, 'sq') * 0.4
    for k in range(5):
        d = r.uniform(4, 7)
        dsp.place(y, _car_pass(d, f'sq{k}') * r.uniform(0.4, 0.9), r.uniform(-1, dur - 2))
    far = dsp.lp(babble(dur, 'sq-far', voices=5, rate=4.0, talk=(1, 3), pause=(1, 4)), 1500, 2)
    ir = dsp.reverb_ir(1.2, 'street', 0.02, 4000)
    y += dsp.fit(dsp.add_reverb(far * 0.25, ir, 0.6), n)
    return y


_BUILD = {'crowd-night': crowd_night, 'station-hall': station_hall, 'street-quiet': street_quiet}
_ALIAS = {'crowd_night': 'crowd-night', 'crowd': 'crowd-night', 'station_hall': 'station-hall', 'station': 'station-hall',
          'street_quiet': 'street-quiet', 'street': 'street-quiet'}


def canonical(name: str) -> str | None:
    n = name.strip().lower()
    n = _ALIAS.get(n, n)
    return n if n in _BUILD else None


@lru_cache(maxsize=None)
def bed(name: str) -> np.ndarray:
    n = canonical(name)
    if n is None:
        raise KeyError(f'unknown ambience bed {name!r}; known: {BEDS}')
    xf = 1.5
    y = _BUILD[n](LOOP_S + xf + 0.5)
    y = dsp.hp(y, 35, 2)
    y = dsp.loop_crossfade(y, ns(LOOP_S), xf)
    return y * dsp.db(BED_LUFS[n] - dsp.lufs_integrated(np.tile(y, 2)))
