"""DSP primitives for the procedural soundtrack (48 kHz, stereo arrays shaped (2, n), float64).

Everything is deterministic: randomness comes only from ``rng(*parts)`` which seeds numpy's PCG64 from a CRC32 of
the given parts, so the same asset name always yields the same samples (PCG64 streams are stable across numpy versions).

Also contains the master section: an ITU-R BS.1770-4 integrated-loudness meter (K-weighting, 400 ms blocks, 75 %
overlap, -70 LUFS absolute + -10 LU relative gates), a 4x-oversampled true-peak meter, and a look-ahead true-peak
limiter.  ffmpeg's ebur128 filter is used as an independent cross-check (see analyze.py / mix.py --report).
"""
from __future__ import annotations

import zlib

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000
A4 = 440.0


# ----------------------------------------------------------------------------------------------------------- basics
def seed_for(*parts) -> int:
    return zlib.crc32('|'.join(str(p) for p in parts).encode('utf-8'))


def rng(*parts) -> np.random.Generator:
    return np.random.default_rng(seed_for(*parts))


def ns(sec: float) -> int:
    return int(round(sec * SR))


def tvec(dur: float) -> np.ndarray:
    return np.arange(ns(dur)) / SR


def db(x: float) -> float:
    return 10 ** (x / 20.0)


def midi(m: float) -> float:
    return A4 * 2 ** ((m - 69) / 12.0)


_NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note(name: str) -> float:
    """'A4', 'C#5', 'Bb3' -> Hz."""
    letter, rest = name[0].upper(), name[1:]
    acc = 0
    while rest and rest[0] in '#b':
        acc += 1 if rest[0] == '#' else -1
        rest = rest[1:]
    return midi(12 * (int(rest) + 1) + _NOTE[letter] + acc)


def stereo(mono: np.ndarray) -> np.ndarray:
    return np.vstack([mono, mono])


def pan(mono: np.ndarray, p: float = 0.0) -> np.ndarray:
    """Equal-power pan, p in [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.vstack([mono * np.cos(a), mono * np.sin(a)])


def place(buf: np.ndarray, sig: np.ndarray, t: float, gain: float = 1.0) -> None:
    """Add sig ((2,n) or (n,)) into buf at time t (seconds); clipped to the buffer."""
    i0 = ns(t)
    n = sig.shape[-1]
    a, b = max(i0, 0), min(i0 + n, buf.shape[-1])
    if b <= a:
        return
    if sig.ndim == 1:
        sig = stereo(sig)
    buf[:, a:b] += gain * sig[:, a - i0:b - i0]


def fit(sig: np.ndarray, n: int) -> np.ndarray:
    """Pad with zeros / truncate along the last axis to length n."""
    if sig.shape[-1] >= n:
        return sig[..., :n]
    pad = [(0, 0)] * (sig.ndim - 1) + [(0, n - sig.shape[-1])]
    return np.pad(sig, pad)


def normalize_peak(x: np.ndarray, peak_db: float = -3.0) -> np.ndarray:
    m = np.max(np.abs(x))
    return x if m == 0 else x * (db(peak_db) / m)


# ------------------------------------------------------------------------------------------------------ oscillators
def phase_of(freq, n: int, phase0: float = 0.0) -> np.ndarray:
    """Phase in cycles for a constant or per-sample frequency."""
    if np.isscalar(freq):
        return phase0 + freq * np.arange(n) / SR
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return phase0 + np.concatenate([[0.0], np.cumsum(f[:-1])]) / SR


def sine(freq, dur: float, phase0: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * phase_of(freq, ns(dur), phase0))


def saw(freq, dur: float, phase0: float = 0.0) -> np.ndarray:
    """PolyBLEP band-limited sawtooth in [-1, 1]."""
    n = ns(dur)
    ph = phase_of(freq, n, phase0)
    p = ph - np.floor(ph)
    dt = np.broadcast_to(np.asarray(freq, dtype=float) / SR, (n,))
    y = 2 * p - 1
    lo = p < dt
    t = p[lo] / dt[lo]
    y[lo] -= t + t - t * t - 1
    hi = p > 1 - dt
    t = (p[hi] - 1) / dt[hi]
    y[hi] -= t * t + t + t + 1
    return y


def square(freq, dur: float, duty: float = 0.5) -> np.ndarray:
    return 0.5 * (saw(freq, dur) - saw(freq, dur, phase0=duty))


def tri_soft(freq, dur: float) -> np.ndarray:
    """Soft triangle-ish tone (sine + weak odd harmonics) — cheap and alias-free for pads."""
    ph = 2 * np.pi * phase_of(freq, ns(dur))
    return np.sin(ph) - np.sin(3 * ph) / 9 + np.sin(5 * ph) / 25


def additive(freq: float, dur: float, partials, decays=None, r: np.random.Generator | None = None) -> np.ndarray:
    """Sum of sine partials: partials = [(ratio, amp)], decays = per-partial exponential time constants (s)."""
    t = tvec(dur)
    y = np.zeros_like(t)
    for k, (ratio, amp) in enumerate(partials):
        f = freq * ratio
        if f >= SR * 0.45:
            continue
        ph0 = 0.0 if r is None else r.uniform(0, 1)
        part = amp * np.sin(2 * np.pi * (f * t + ph0))
        if decays is not None:
            part *= np.exp(-t / decays[k])
        y += part
    return y


def white(n: int, r: np.random.Generator) -> np.ndarray:
    return r.standard_normal(n)


def pink(n: int, r: np.random.Generator) -> np.ndarray:
    """1/f noise via FFT shaping, unit RMS."""
    w = r.standard_normal(n)
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if n > 1 else 1
    spec /= np.sqrt(f)
    y = np.fft.irfft(spec, n)
    return y / (np.std(y) + 1e-12)


def brown(n: int, r: np.random.Generator) -> np.ndarray:
    w = r.standard_normal(n)
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if n > 1 else 1
    spec /= np.maximum(f, 15.0)
    y = np.fft.irfft(spec, n)
    return y / (np.std(y) + 1e-12)


# -------------------------------------------------------------------------------------------------------- envelopes
def env_perc(dur: float, attack: float = 0.002, tau: float = 0.3) -> np.ndarray:
    t = tvec(dur)
    a = np.clip(t / max(attack, 1e-6), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / tau)


def env_adsr(dur: float, a: float, d: float, s: float, r: float) -> np.ndarray:
    """Attack/decay/sustain within dur, then release *inside* dur (total length = dur)."""
    n = ns(dur)
    t = np.arange(n) / SR
    hold_end = max(dur - r, a + d)
    e = np.where(t < a, t / max(a, 1e-6),
                 np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((t - hold_end) / max(r, 1e-6), 0, 1)
    return e * (1 - rel) ** 2


def fade(x: np.ndarray, fin: float = 0.005, fout: float = 0.02) -> np.ndarray:
    n = x.shape[-1]
    g = np.ones(n)
    a, b = min(ns(fin), n), min(ns(fout), n)
    if a:
        g[:a] = np.linspace(0, 1, a)
    if b:
        g[n - b:] *= np.linspace(1, 0, b)
    return x * g


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------------------------------------------------- filters
def _sos(kind: str, fc, order: int):
    fc = np.clip(np.asarray(fc, dtype=float), 10, SR * 0.49)
    return signal.butter(order, fc, btype=kind, fs=SR, output='sos')


def lp(x, fc, order=2):
    return signal.sosfilt(_sos('lowpass', fc, order), x, axis=-1)


def hp(x, fc, order=2):
    return signal.sosfilt(_sos('highpass', fc, order), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos('bandpass', [lo, hi], order), x, axis=-1)


def peak_eq(x, f0, gain_db, q=1.0):
    """RBJ peaking biquad."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=-1)


def resonator(x, f0, q=30.0):
    """Narrow 2-pole band-pass (for woodblock / clock bodies)."""
    b, a = signal.iirpeak(min(f0, SR * 0.45), q, fs=SR)
    return signal.lfilter(b, a, x, axis=-1)


def sweep_filter(x: np.ndarray, kind: str, fc_curve: np.ndarray, block: int = 256, order: int = 2) -> np.ndarray:
    """Time-varying Butterworth (block-wise coefficient update with carried state). fc_curve per sample."""
    n = x.shape[-1]
    y = np.zeros_like(x)
    zi = None
    for i in range(0, n, block):
        fc = float(np.mean(fc_curve[i:i + block]))
        sos = _sos(kind, fc, order)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) if x.ndim == 1 else (sos.shape[0], x.shape[0], 2))
        if x.ndim == 1:
            y[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
        else:
            out, zi2 = signal.sosfilt(sos, x[:, i:i + block], axis=-1, zi=zi)
            y[:, i:i + block], zi = out, zi2
    return y


def spectral_shape(x: np.ndarray, gain_fn, nper: int = 2048) -> np.ndarray:
    """STFT-domain time-varying magnitude shaping. gain_fn(freqs[F,1], times[1,T]) -> gains[F,T]."""
    n = x.shape[-1]
    f, t, Z = signal.stft(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4, boundary='zeros', padded=True)
    G = gain_fn(f[:, None], t[None, :])
    _, y = signal.istft(Z * G, fs=SR, nperseg=nper, noverlap=nper * 3 // 4, boundary=True)
    return fit(y, n)


# ----------------------------------------------------------------------------------------------------------- reverb
def reverb_ir(t60: float, seed: str, predelay: float = 0.012, bright: float = 6000.0, er: int = 8,
              width: float = 1.0) -> np.ndarray:
    """Stereo synthetic room IR: sparse early reflections + exponentially decaying noise tail whose decay time
    shortens with frequency (octave bands split in the FFT domain, so the bands sum exactly flat — no crossover
    notches / resonances).  ``bright`` = -3 dB point of the overall tone."""
    r = rng('ir', seed)
    n = ns(t60 * 1.1 + predelay)
    t = np.arange(n) / SR
    f = np.fft.rfftfreq(n, 1 / SR)
    edges = [0, 250, 500, 1000, 2000, 4000, 8000, SR / 2 + 1]
    tone = 1 / np.sqrt(1 + (f / bright) ** 2)
    ir = np.zeros((2, n))
    for ch in range(2):
        N = np.fft.rfft(r.standard_normal(n)) * tone
        tail = np.zeros(n)
        for k in range(len(edges) - 1):
            mask = (f >= edges[k]) & (f < edges[k + 1])
            band = np.fft.irfft(N * mask, n)
            tk = t60 * (1.0 if k < 3 else (0.85, 0.65, 0.5, 0.4)[k - 3])
            tail += band * np.exp(-6.9 * t / tk)
        ir[ch] = tail * smoothstep((t - predelay) / 0.03)
    if width < 1:
        m = ir.mean(0)
        ir = m + width * (ir - m)
    ir /= np.sqrt(np.sum(ir ** 2) / 2) + 1e-12
    for _ in range(er):   # early reflections: short filtered clicks, ~-10 dB re. the tail energy each
        d = r.uniform(predelay * 0.4, predelay + 0.05)
        ch = int(r.integers(0, 2))
        i0 = ns(d)
        click = lp(np.r_[1.0, np.zeros(63)], bright, 2) * r.uniform(0.15, 0.35) * (1 if r.random() < 0.5 else -1)
        ir[ch, i0:i0 + 64] += click[:max(0, min(64, n - i0))]
    return ir / (np.sqrt(np.sum(ir ** 2) / 2) + 1e-12)


def convolve(x: np.ndarray, ir: np.ndarray, circular: bool = False) -> np.ndarray:
    """Stereo (2,n) * (2,m) convolution; circular=True wraps the tail (seamless loops), else output length n+m-1."""
    if x.ndim == 1:
        x = stereo(x)
    n, m = x.shape[-1], ir.shape[-1]
    if circular:
        if m > n:  # fold the IR onto the loop length
            irf = np.zeros((2, n))
            for k in range(0, m, n):
                seg = ir[:, k:k + n]
                irf[:, :seg.shape[-1]] += seg
            ir = irf
        X = np.fft.rfft(x, n, axis=-1)
        H = np.fft.rfft(ir, n, axis=-1)
        return np.fft.irfft(X * H, n, axis=-1)
    return signal.fftconvolve(x, ir, axes=-1)


def add_reverb(x: np.ndarray, ir: np.ndarray, wet: float, circular: bool = False) -> np.ndarray:
    """Dry + wet; non-circular output is extended by the IR length."""
    if x.ndim == 1:
        x = stereo(x)
    w = convolve(x, ir, circular)
    return fit(x, w.shape[-1]) * 1.0 + wet * w


def wrap_add(x: np.ndarray, n: int) -> np.ndarray:
    """Fold everything past n back onto the start (seamless loop of length n for summed events)."""
    out = np.zeros(x.shape[:-1] + (n,))
    for k in range(0, x.shape[-1], n):
        seg = x[..., k:k + n]
        out[..., :seg.shape[-1]] += seg
    return out


def loop_crossfade(x: np.ndarray, n: int, xf: float = 1.0) -> np.ndarray:
    """Make a seamless loop of length n from a render of length >= n + xf (equal-power crossfade of the overrun)."""
    k = ns(xf)
    assert x.shape[-1] >= n + k, 'render must be longer than loop + crossfade'
    out = x[..., :n].copy()
    a = np.linspace(0, np.pi / 2, k)
    out[..., :k] = x[..., :k] * np.sin(a) + x[..., n:n + k] * np.cos(a)
    return out


def tile(loop: np.ndarray, n: int, offset: int = 0) -> np.ndarray:
    L = loop.shape[-1]
    idx = (np.arange(n) + offset) % L
    return loop[..., idx]


def haas(mono: np.ndarray, ms: float = 9.0, side: int = 1) -> np.ndarray:
    d = ns(ms / 1000)
    a = mono
    b = np.concatenate([np.zeros(d), mono[:-d] if d else mono])
    return np.vstack([a, b]) if side > 0 else np.vstack([b, a])


def soft_clip(x, drive=1.0):
    return np.tanh(drive * x) / np.tanh(drive)


# --------------------------------------------------------------------------------------------- loudness / true peak
_KW_PRE = (np.array([1.53512485958697, -2.69169618940638, 1.19839281085285]),
           np.array([1.0, -1.69065929318241, 0.73248077421585]))
_KW_RLB = (np.array([1.0, -2.0, 1.0]), np.array([1.0, -1.99004745483398, 0.99007225036621]))


def _kweight(x: np.ndarray) -> np.ndarray:
    y = signal.lfilter(*_KW_PRE, x, axis=-1)
    return signal.lfilter(*_KW_RLB, y, axis=-1)


def block_loudness(x: np.ndarray, block: float = 0.4, hop: float = 0.1) -> np.ndarray:
    """Per-block loudness (LUFS) of 400 ms blocks every 100 ms (momentary loudness)."""
    if x.ndim == 1:
        x = stereo(x)
    y = _kweight(x) ** 2
    B, H = ns(block), ns(hop)
    n = y.shape[-1]
    if n < B:
        return np.array([-np.inf])
    c = np.concatenate([np.zeros((y.shape[0], 1)), np.cumsum(y, axis=-1)], axis=-1)
    starts = np.arange(0, n - B + 1, H)
    ms = (c[:, starts + B] - c[:, starts]) / B          # mean square per channel per block
    z = ms.sum(0)                                       # L/R weights 1.0
    with np.errstate(divide='ignore'):
        return -0.691 + 10 * np.log10(z)


def lufs_integrated(x: np.ndarray) -> float:
    lk = block_loudness(x)
    lk = lk[lk > -70]
    if lk.size == 0:
        return -np.inf
    z = 10 ** ((lk + 0.691) / 10)
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    g = z[lk > rel]
    return float(-0.691 + 10 * np.log10(g.mean())) if g.size else -np.inf


def true_peak_curve(x: np.ndarray, os: int = 4) -> np.ndarray:
    """Per-original-sample max |x| over the 4x oversampled signal, channel-linked."""
    if x.ndim == 1:
        x = stereo(x)
    up = signal.resample_poly(x, os, 1, axis=-1)
    n = x.shape[-1]
    up = np.abs(up[:, :n * os]).reshape(x.shape[0], n, os).max(-1)
    return np.maximum(up.max(0), np.abs(x).max(0))


def true_peak_db(x: np.ndarray) -> float:
    m = float(true_peak_curve(x).max())
    return 20 * np.log10(m) if m > 0 else -np.inf


def limiter(x: np.ndarray, ceiling_db: float = -1.5, lookahead: float = 0.003, release: float = 0.08) -> np.ndarray:
    """Look-ahead true-peak limiter (zero-latency: gain is applied in place, the look-ahead lives in the gain curve).
    gain = box-smoothed(min-filter(needed gain)), which never exceeds the needed gain at any peak sample."""
    ceil = db(ceiling_db)
    tp = true_peak_curve(x)
    need = np.minimum(1.0, ceil / np.maximum(tp, 1e-12))
    if need.min() >= 1.0:
        return x
    W = max(ns(lookahead), 1)
    g = uniform_filter1d(minimum_filter1d(need, 2 * W + 1, mode='nearest'), W, mode='nearest')
    R = max(ns(release), 2) // 2 * 2
    hold = minimum_filter1d(g, R + 1, origin=R // 2, mode='nearest')            # hold over the past R samples
    rel = uniform_filter1d(hold, R, origin=(R - 1) // 2, mode='nearest')       # then ramp back up over R
    g = np.minimum(g, rel)   # attack = 3 ms look-ahead (g), release = hold + ramp; never above the needed gain
    return x * g


def master(x: np.ndarray, target_lufs: float = -14.0, ceiling_db: float = -1.5, iters: int = 4,
           pre_gain_curve: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    """Normalize to target integrated loudness, then true-peak limit; iterate the make-up gain so the
    limited result lands on target. Returns (audio, info)."""
    base = x if pre_gain_curve is None else x * pre_gain_curve
    L0 = lufs_integrated(base)
    if not np.isfinite(L0):
        return base.copy(), {'lufs_in': None, 'gain_db': 0.0, 'lufs': None, 'tp_db': None}
    g = target_lufs - L0
    y = base
    for _ in range(iters):
        y = limiter(base * db(g), ceiling_db)
        L = lufs_integrated(y)
        if abs(L - target_lufs) < 0.05:
            break
        g += target_lufs - L
    tp = true_peak_db(y)
    if tp > ceiling_db + 0.05:   # resampling corner cases: one more pass at a lower ceiling
        y = limiter(y, ceiling_db - 0.3)
        tp = true_peak_db(y)
    return y, {'lufs_in': round(L0, 2), 'gain_db': round(g, 2), 'lufs': round(lufs_integrated(y), 2),
               'tp_db': round(tp, 2)}
