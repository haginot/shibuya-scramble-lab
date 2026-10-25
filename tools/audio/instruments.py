"""Synthesized instruments (mono note renderers). All original sound design; each returns a 1-D float array.

Every instrument takes (freq_hz, dur_s, vel 0..1, seed_str) so note-level randomness (detune, phase, noise) is
seeded from the note's identity -> deterministic.
"""
from __future__ import annotations

import numpy as np

import dsp
from dsp import SR, ns, rng, tvec


def music_box(f: float, dur: float = 2.2, vel: float = 0.8, seed: str = '') -> np.ndarray:
    """Tine/celesta-like pluck: fundamental + inharmonic tine mode + octave, fast-decaying strike click."""
    r = rng('mbox', f, seed)
    t = tvec(dur)
    det = 2 ** (r.uniform(-4, 4) / 1200)
    f = f * det
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t / 1.1)
         + 0.32 * np.sin(2 * np.pi * 2.0 * f * t + 0.3) * np.exp(-t / 0.45)
         + 0.16 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.08) * (5.4 * f < SR * 0.45)
         + 0.05 * np.sin(2 * np.pi * 8.9 * f * t) * np.exp(-t / 0.03) * (8.9 * f < SR * 0.45))
    click = dsp.hp(r.standard_normal(ns(0.006)), 3000) * np.linspace(1, 0, ns(0.006)) * 0.15
    y[:click.size] += click
    y *= np.clip(t / 0.0015, 0, 1)
    return dsp.fade(y * vel, 0, 0.05)


def bell(f: float, dur: float = 3.0, vel: float = 0.8, seed: str = '') -> np.ndarray:
    """Bright glassy bell (inharmonic partials) for victory / clear."""
    r = rng('bell', f, seed)
    parts = [(1.0, 1.0), (2.01, 0.55), (2.76, 0.35), (4.07, 0.22), (5.43, 0.12), (6.8, 0.06)]
    decs = [1.6, 0.9, 0.7, 0.45, 0.3, 0.2]
    y = dsp.additive(f, dur, parts, [d * dur / 3 for d in decs], r)
    y *= np.clip(tvec(dur) / 0.002, 0, 1)
    return dsp.fade(y * vel * 0.6, 0, 0.1)


def pluck(f: float, dur: float = 0.6, vel: float = 0.8, seed: str = '', bright: float = 1.0) -> np.ndarray:
    """Additive string pluck: higher harmonics die faster (dynamic brightness)."""
    r = rng('pluck', f, seed)
    t = tvec(dur)
    y = np.zeros_like(t)
    for k in range(1, 14):
        fk = f * k * (1 + 0.0004 * k * k)
        if fk > SR * 0.45:
            break
        tau = 0.9 / (1 + 0.55 * k / bright) * min(1.0, 300 / f + 0.3)
        y += (1 / k) * np.sin(2 * np.pi * fk * t + r.uniform(0, 6.28)) * np.exp(-t / tau)
    y *= np.clip(t / 0.002, 0, 1)
    return dsp.fade(y * vel * 0.5, 0, 0.03)


def bass_pluck(f: float, dur: float = 0.5, vel: float = 0.8, seed: str = '') -> np.ndarray:
    t = tvec(dur)
    y = np.sin(2 * np.pi * f * t) + 0.35 * dsp.lp(dsp.saw(f, dur), 500 + 1500 * vel)
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t / (0.22 + 0.3 * dur))
    return dsp.fade(y * env * vel, 0, 0.02)


def taiko(f: float = 62.0, dur: float = 1.6, vel: float = 0.9, seed: str = '') -> np.ndarray:
    """Low drum hit: pitch-dropping membrane + skin slap noise."""
    r = rng('taiko', f, seed)
    t = tvec(dur)
    fc = f * (1 + 0.9 * np.exp(-t / 0.03))
    body = np.sin(2 * np.pi * dsp.phase_of(fc, t.size)) * np.exp(-t / 0.42)
    over = 0.25 * np.sin(2 * np.pi * dsp.phase_of(fc * 1.59, t.size)) * np.exp(-t / 0.15)
    slap = dsp.lp(r.standard_normal(t.size), 1400) * np.exp(-t / 0.025) * 0.5
    y = dsp.soft_clip((body + over + slap) * 1.2, 1.5)
    return dsp.fade(y * vel, 0.0005, 0.05)


def thump(f: float = 48.0, dur: float = 0.5, vel: float = 0.7, seed: str = '') -> np.ndarray:
    """Soft low pulse (felt more than heard)."""
    t = tvec(dur)
    fc = f * (1 + 0.5 * np.exp(-t / 0.02))
    y = np.sin(2 * np.pi * dsp.phase_of(fc, t.size)) * np.exp(-t / 0.13) * np.clip(t / 0.003, 0, 1)
    return dsp.fade(y * vel, 0, 0.03)


def tick(f: float = 2600.0, dur: float = 0.08, vel: float = 0.6, seed: str = '') -> np.ndarray:
    """Clock tick: noise click into a woodblock-like resonator."""
    r = rng('tick', f, seed)
    t = tvec(dur)
    exc = r.standard_normal(t.size) * np.exp(-t / 0.0015)
    y = dsp.resonator(exc, f, 18) * 1.0 + dsp.resonator(exc, f * 2.3, 25) * 0.4 + dsp.hp(exc, 5000) * 0.08
    y = y / (np.max(np.abs(y)) + 1e-9)
    return dsp.fade(y * np.exp(-t / 0.02) * vel, 0, 0.01)


def shaker(dur: float = 0.12, vel: float = 0.4, seed: str = '') -> np.ndarray:
    r = rng('shaker', seed)
    t = tvec(dur)
    y = dsp.bp(r.standard_normal(t.size), 5000, 12000) * np.clip(t / 0.01, 0, 1) * np.exp(-t / 0.035)
    return dsp.fade(y * vel, 0, 0.01)


def pad_voice(f: float, dur: float, vel: float = 0.5, seed: str = '', bright: float = 1200.0,
              attack: float = 1.2, release: float = 1.5, voices: int = 3, kind: str = 'saw') -> np.ndarray:
    """Detuned saw (or soft-triangle) ensemble, low-passed, slow envelope."""
    r = rng('pad', f, seed)
    y = np.zeros(ns(dur))
    for v in range(voices):
        cents = (v - (voices - 1) / 2) * 7 + r.uniform(-2, 2)
        fv = f * 2 ** (cents / 1200)
        y += dsp.saw(fv, dur, r.uniform(0, 1)) if kind == 'saw' else dsp.tri_soft(fv, dur)
    y = dsp.lp(y / voices, bright, 2)
    env = dsp.env_adsr(dur, attack, 0.5, 0.85, release)
    return y * env * vel


def tremolo_strings(f: float, dur: float, vel: float = 0.4, seed: str = '', rate: float = 7.0) -> np.ndarray:
    """Bowed-tremolo texture: pad voice with fast amplitude flutter (rate jittered)."""
    r = rng('trem', f, seed)
    y = pad_voice(f, dur, vel, seed, bright=1800, attack=0.8, release=1.0, voices=4)
    t = tvec(dur)
    jitter = np.cumsum(r.standard_normal(t.size)) / SR * 2
    trem = 0.6 + 0.4 * np.abs(np.sin(np.pi * (rate * t + jitter)))
    return y * trem


def drone(f: float, dur: float, seed: str = '', harmonics: int = 14, bright: float = 1.0) -> np.ndarray:
    """Evolving additive drone: each harmonic's level wanders slowly (seeded LFOs), slight beating pair."""
    r = rng('drone', f, seed)
    t = tvec(dur)
    y = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        fk = f * k
        if fk > 6000:
            break
        rate = r.uniform(0.03, 0.17)
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rate * t + r.uniform(0, 6.28))
        amp = (1 / k ** (1.3 / bright)) * (0.35 + 0.65 * lfo)
        y += amp * (np.sin(2 * np.pi * fk * t + r.uniform(0, 6.28))
                    + 0.6 * np.sin(2 * np.pi * fk * (1.0025) * t + r.uniform(0, 6.28)))
    return y / harmonics ** 0.5
