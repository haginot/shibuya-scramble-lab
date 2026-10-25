"""Procedural BGM: three original, seamlessly looping horror-game cues (all notes/patterns written for this project).

  tension  D minor, 100 BPM, 8 bars (19.2 s): evolving drone, tremolo-string pad, driving bass 8ths, low drum hits,
           sparse music-box line, a swell into the loop point.  (Deliberately avoids the well-known horror tropes:
           no alternating semitone bass ostinato, no 5/4 piano figure, no tubular-bell pattern.)
  calm     F major, 72 BPM, 8 bars (26.7 s): warm pad, soft celesta arpeggio, sub bass, air — the "relief" bed.
  victory  D major, 120 BPM, 8 bars (16 s): drum groove, bass, pluck arpeggio, bell melody (I-I-bVI-bVII-I-I-IV-V).

Loops are exact: note events are rendered into an over-long buffer and wrap-added onto the loop length, continuous
layers are periodic by construction (frequencies quantized to whole cycles per loop, FFT-made noise), and the reverb
is a circular convolution.  ``loop(name)`` returns a (2, n) array normalized to BGM_LUFS.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

import dsp
import instruments as ins
from dsp import SR, note, ns

BGM_LUFS = -18.0
TRACKS = ('tension', 'calm', 'victory')


class Seq:
    """Tiny sequencer: places mono notes (with pan + reverb send) on a dry and a wet bus, then folds the loop."""

    def __init__(self, name: str, bpm: float, bars: int, beats: int = 4, tail: float = 6.0):
        self.name, self.bpm, self.bars, self.beats = name, bpm, bars, beats
        self.spb = 60.0 / bpm
        self.L = ns(bars * beats * self.spb)
        n = self.L + ns(tail)
        self.dry = np.zeros((2, n))
        self.wet = np.zeros((2, n))
        self.r = dsp.rng('seq', name)

    def t(self, bar: float, beat: float = 0.0) -> float:
        return (bar * self.beats + beat) * self.spb

    def add(self, sig: np.ndarray, bar: float, beat: float, gain: float = 1.0, p: float = 0.0, send: float = 0.2,
            human: float = 0.0):
        t = self.t(bar, beat) + (self.r.uniform(-human, human) if human else 0.0)
        st = dsp.pan(sig, p) if sig.ndim == 1 else sig
        dsp.place(self.dry, st, max(t, 0), gain)
        if send:
            dsp.place(self.wet, st, max(t, 0), gain * send)

    def add_cont(self, sig2: np.ndarray, send: float = 0.0, gain: float = 1.0):
        """Add an exactly periodic (2, L) layer."""
        self.dry[:, :self.L] += gain * sig2
        if send:
            self.wet[:, :self.L] += gain * send * sig2

    def render(self, ir: np.ndarray, wet_gain: float = 1.0) -> np.ndarray:
        dry = dsp.wrap_add(self.dry, self.L)
        wet = dsp.wrap_add(self.wet, self.L)
        return dry + wet_gain * dsp.convolve(wet, ir, circular=True)


def _periodic(f: float, L: int) -> float:
    """Nearest frequency with an integer number of cycles in L samples (exactly loopable)."""
    return max(1, round(f * L / SR)) * SR / L


def _periodic_drone(f: float, L: int, seed: str, harmonics=12, bright=1.0) -> np.ndarray:
    r = dsp.rng('pdrone', f, seed)
    t = np.arange(L) / SR
    dur = L / SR
    y = np.zeros(L)
    for k in range(1, harmonics + 1):
        fk = f * k
        if fk > 5000:
            break
        rate = max(1, round(r.uniform(0.03, 0.15) * dur)) / dur
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rate * t + r.uniform(0, 6.28))
        amp = (1 / k ** (1.3 / bright)) * (0.3 + 0.7 * lfo) * (0.45 if k == 1 else 1.0)
        f1, f2 = _periodic(fk, L), _periodic(fk * 1.003, L)
        y += amp * (np.sin(2 * np.pi * f1 * t + r.uniform(0, 6.28)) + 0.6 * np.sin(2 * np.pi * f2 * t + r.uniform(0, 6.28)))
    return y / harmonics ** 0.5


def _periodic_noise(L: int, seed: str, lo: float, hi: float, tilt: float = 0.5, am_rate: float = 0.0,
                    am_depth: float = 0.0) -> np.ndarray:
    """Band-limited noise made in the FFT domain (therefore exactly periodic), stereo-decorrelated."""
    r = dsp.rng('pnoise', seed)
    out = np.zeros((2, L))
    f = np.fft.rfftfreq(L, 1 / SR)
    mag = np.where((f > lo) & (f < hi), 1.0, 0.0) / np.maximum(f, 20) ** tilt
    # soft band edges
    mag *= dsp.smoothstep((f - lo * 0.7) / (lo * 0.6 + 1)) * dsp.smoothstep((hi * 1.4 - f) / (hi * 0.6 + 1))
    for ch in range(2):
        spec = mag * np.exp(1j * r.uniform(0, 2 * np.pi, f.size))
        y = np.fft.irfft(spec, L)
        out[ch] = y / (np.std(y) + 1e-12)
    if am_rate:
        dur = L / SR
        rate = max(1, round(am_rate * dur)) / dur
        t = np.arange(L) / SR
        out *= 1 - am_depth * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t))
    return out


def _swell(dur: float, seed: str) -> np.ndarray:
    """Reverse-cymbal-like swell (noise, rising envelope + rising high-pass), ends abruptly at dur."""
    r = dsp.rng('swell', seed)
    n = ns(dur)
    t = np.arange(n) / n
    nz = r.standard_normal((2, n))
    fc = 400 + 5000 * t ** 2
    y = dsp.sweep_filter(nz, 'highpass', fc) * (t ** 2.5)
    return dsp.fade(y, 0.0, 0.01)


CH = {  # chord tones (note names, low to high)
    'Dm': ['D3', 'F3', 'A3', 'D4'], 'Bb': ['Bb2', 'D3', 'F3', 'Bb3'], 'Gm': ['G2', 'Bb2', 'D3', 'G3'],
    'A': ['A2', 'C#3', 'E3', 'A3'], 'F': ['F3', 'A3', 'C4', 'E4'], 'Dm9': ['D3', 'F3', 'A3', 'C4', 'E4'],
    'Bbmaj7': ['Bb2', 'D3', 'F3', 'A3'], 'Csus': ['C3', 'F3', 'G3', 'C4'], 'C': ['C3', 'E3', 'G3', 'C4'],
    'D': ['D3', 'F#3', 'A3', 'D4'], 'G': ['G2', 'B2', 'D3', 'G3'], 'Cmaj': ['C3', 'E3', 'G3', 'C4'],
}


def _up(name: str, octaves: int) -> str:
    i = len(name) - 1
    while name[i - 1].isdigit():
        i -= 1
    return name[:i] + str(int(name[i:]) + octaves)


def tension() -> np.ndarray:
    s = Seq('tension', 100, 8)
    L = s.L
    prog = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A']
    # drone: D1/D2 + A2, exactly periodic
    dr = np.vstack([_periodic_drone(note('D2'), L, f'd2{c}', 12) + 0.5 * _periodic_drone(note('A2'), L, f'a2{c}', 8)
                    for c in 'LR'])
    s.add_cont(dr * 0.35, send=0.3)
    s.add_cont(_periodic_noise(L, 'tension-air', 2500, 9000, 0.3, am_rate=0.2, am_depth=0.6) * 0.012, send=0.5)
    for b in range(0, 8, 2):                                    # tremolo strings, 2-bar chords
        for i, nm in enumerate(CH[prog[b]][1:]):
            sig = ins.tremolo_strings(note(_up(nm, 1)), s.t(2) + 0.6, 0.18, f'tr{b}{i}', rate=6.5 + i * 0.7)
            s.add(sig, b, 0, 1.0, p=-0.5 + i * 0.5, send=0.4)
    pattern = [(0, 1.0), (0.5, 0.45), (1.0, 0.7), (1.5, 0.45), (2.5, 0.6), (3.0, 0.75), (3.5, 0.5)]
    for b in range(8):                                          # bass pulse on the chord root
        root = note(CH[prog[b]][0])                             # D3 / Bb2 / G2 / A2: audible on phones
        for beat, v in pattern:
            octave = 2 if (b % 2 == 1 and beat == 3.0) else 1
            s.add(ins.bass_pluck(root * octave, 0.32, v * 0.8, f'b{b}{beat}'), b, beat, 0.42, p=0.0, send=0.05)
    for b in range(8):                                          # low drum hits
        if b % 2 == 0:
            s.add(ins.taiko(60, 1.6, 0.95, f't{b}a'), b, 0, 0.9, p=-0.1, send=0.35)
            s.add(ins.taiko(72, 1.2, 0.55, f't{b}b'), b, 2.5, 0.7, p=0.15, send=0.35)
        else:
            s.add(ins.thump(46, 0.5, 0.6, f'h{b}a'), b, 0, 0.7, send=0.0)
            s.add(ins.thump(46, 0.5, 0.4, f'h{b}b'), b, 0.6, 0.7, send=0.0)
    for k, (beat, v) in enumerate([(0, 0.7), (1.5, 0.6), (2, 0.8), (2.75, 0.7), (3.25, 0.85), (3.5, 0.9), (3.75, 1.0)]):
        s.add(ins.taiko(64 + k * 2, 1.0, v, f'roll{k}'), 7, beat, 0.6, p=-0.3 + k * 0.1, send=0.4)
    for b in range(4, 8):                                       # clock ticks build up in the second half
        for q in range(4):
            s.add(ins.tick(2400 if q % 2 == 0 else 2050, 0.08, 0.5, f'k{b}{q}'), b, q + 0.5, 0.10, p=0.4, send=0.15)
    mel = [  # (bar, beat, note, beats) — original line
        (0, 0, 'A5', 2), (0, 2, 'F5', 1), (0, 3, 'E5', 0.5), (0, 3.5, 'D5', 2.5),
        (1, 2, 'A5', 1), (1, 3, 'Bb5', 0.5), (1, 3.5, 'A5', 2.5),
        (2, 0, 'D6', 1.5), (2, 1.5, 'C6', 0.5), (2, 2, 'Bb5', 1), (2, 3, 'F5', 3),
        (3, 2.5, 'G5', 0.5), (3, 3, 'A5', 1),
        (4, 0, 'G5', 1), (4, 1, 'Bb5', 1), (4, 2, 'D6', 1), (4, 3, 'C6', 0.5), (4, 3.5, 'Bb5', 2.5),
        (5, 2, 'G5', 2),
        (6, 0, 'C#6', 1.5), (6, 1.5, 'E6', 0.5), (6, 2, 'A5', 2),
        (7, 0, 'E5', 1), (7, 1, 'G5', 1), (7, 2, 'C#5', 2),
    ]
    for i, (b, beat, nm, ln) in enumerate(mel):
        s.add(ins.music_box(note(nm), max(1.6, ln * s.spb + 1.0), 0.75, f'm{i}'), b, beat, 0.32,
              p=0.25 * np.sin(i), send=0.55, human=0.006)
    sw = _swell(s.t(0, 2.0), 'tension-swell')                   # 2 beats into the loop point
    dsp.place(s.dry, sw * 0.07, s.t(7, 2.0))
    ir = dsp.reverb_ir(2.8, 'tension', predelay=0.02, bright=5500)
    return s.render(ir, 0.9)


def calm() -> np.ndarray:
    s = Seq('calm', 72, 8)
    L = s.L
    prog = ['F', 'F', 'Dm9', 'Dm9', 'Bbmaj7', 'Bbmaj7', 'Csus', 'C']
    s.add_cont(_periodic_noise(L, 'calm-air', 300, 6000, 0.6, am_rate=0.1, am_depth=0.5) * 0.008, send=0.4)
    for b in range(0, 8, 2):
        names = CH[prog[b]]
        for i, nm in enumerate(names):
            sig = ins.pad_voice(note(nm), s.t(2) + 1.5, 0.14, f'cp{b}{i}', bright=1400, attack=1.6, release=2.0,
                                voices=3, kind='tri')
            s.add(sig, b, 0, 1.0, p=-0.6 + 1.2 * i / max(1, len(names) - 1), send=0.45)
    for b in range(8):
        root = note(_up(CH[prog[b]][0], -1))
        s.add(ins.pad_voice(root, s.t(1) + 0.4, 0.08, f'sub{b}', bright=300, attack=0.3, release=0.6, voices=1,
                            kind='tri'), b, 0, 1.0, send=0.0)
        tones = [_up(nm, 2) for nm in CH[prog[b]][1:]]
        arp = [0, 1, 2, 1, 2, 0, 1, 2] if b % 2 == 0 else [2, 1, 0, 1, 0, 2, 1, 0]
        for k, idx in enumerate(arp):
            if b % 2 == 1 and k >= 6:
                continue
            nm = tones[idx % len(tones)]
            v = 0.45 if k % 2 == 0 else 0.3
            s.add(ins.music_box(note(nm), 2.4, v, f'ca{b}{k}'), b, k * 0.5, 0.28, p=-0.4 + 0.8 * (idx / 2),
                  send=0.6, human=0.008)
    ir = dsp.reverb_ir(3.4, 'calm', predelay=0.03, bright=4500)
    return s.render(ir, 0.9)


def victory() -> np.ndarray:
    s = Seq('victory', 120, 8)
    prog = ['D', 'D', 'Bb', 'Cmaj', 'D', 'D', 'G', 'A']
    for b in range(8):
        names = CH[prog[b]]
        for i, nm in enumerate(names[1:]):
            s.add(ins.pad_voice(note(_up(nm, 1)), s.t(1) + 0.3, 0.12, f'vp{b}{i}', bright=2600, attack=0.05,
                                release=0.4, voices=3), b, 0, 1.0, p=-0.4 + 0.4 * i, send=0.3)
        root = note(names[0])
        for k in range(8):
            f = root * (2 if k in (3, 7) else 1)
            s.add(ins.bass_pluck(f, 0.25, 0.85 if k % 2 == 0 else 0.6, f'vb{b}{k}'), b, k * 0.5, 0.5, send=0.03)
        for beat, v in [(0, 1.0), (1.5, 0.55), (2, 0.85), (3, 0.6), (3.5, 0.5)]:
            s.add(ins.taiko(66, 1.0, v, f'vt{b}{beat}'), b, beat, 0.75, p=0.0, send=0.25)
        for k in range(8):
            s.add(ins.shaker(0.12, 0.5 if k % 2 else 0.3, f'vs{b}{k}'), b, k * 0.5 + 0.25 * (k % 2 == 0), 0.18,
                  p=0.35, send=0.1)
        tones = [_up(nm, 1) for nm in names[1:]] + [_up(names[1], 2)]
        for k in range(16):
            nm = tones[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]]
            s.add(ins.pluck(note(nm), 0.35, 0.55 if k % 4 == 0 else 0.35, f'va{b}{k}', bright=1.4), b, k * 0.25,
                  0.22, p=0.5 * np.sin(k), send=0.2)
    mel = [(0, 0, 'F#5', 1.5), (0, 1.5, 'A5', 0.5), (0, 2, 'D6', 2), (1, 0, 'C#6', 1), (1, 1, 'B5', 1), (1, 2, 'A5', 2),
           (2, 0, 'D6', 1.5), (2, 1.5, 'F6', 0.5), (2, 2, 'D6', 1), (2, 3, 'C6', 1), (3, 0, 'E6', 2), (3, 2, 'G6', 2),
           (4, 0, 'F#6', 1), (4, 1, 'E6', 0.5), (4, 1.5, 'D6', 0.5), (4, 2, 'A5', 2), (5, 0, 'B5', 1), (5, 1, 'C#6', 1),
           (5, 2, 'D6', 2), (6, 0, 'B5', 1), (6, 1, 'D6', 1), (6, 2, 'G6', 2), (7, 0, 'F#6', 1), (7, 1, 'E6', 1),
           (7, 2, 'C#6', 1), (7, 3, 'A5', 1)]
    for i, (b, beat, nm, ln) in enumerate(mel):
        s.add(ins.bell(note(nm), max(1.2, ln * s.spb + 0.8), 0.7, f'vm{i}'), b, beat, 0.3, p=0.15, send=0.4)
    ir = dsp.reverb_ir(1.9, 'victory', predelay=0.015, bright=7000)
    return s.render(ir, 0.8)


_BUILDERS = {'tension': tension, 'calm': calm, 'victory': victory}


@lru_cache(maxsize=None)
def loop(name: str) -> np.ndarray:
    """(2, n) seamless loop, normalized to BGM_LUFS integrated (measured over three repetitions)."""
    y = _BUILDERS[name]()
    y = _make_periodic_hp(y)
    L = dsp.lufs_integrated(np.tile(y, 3))
    return y * dsp.db(BGM_LUFS - L)


def _make_periodic_hp(y: np.ndarray) -> np.ndarray:
    """Bus EQ with periodic filter state: filter two periods, keep the second (the loop stays seamless)."""
    n = y.shape[-1]
    z = dsp.hp(np.concatenate([y, y], axis=-1), 40, 2)
    z = dsp.peak_eq(z, 75, -4.0, 0.8)          # tame the drone/bass build-up below 100 Hz (phones can't play it)
    z = dsp.peak_eq(z, 2500, 2.0, 0.7)         # a little presence
    return z[:, n:]
