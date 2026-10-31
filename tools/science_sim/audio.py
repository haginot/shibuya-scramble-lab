#!/usr/bin/env python3
"""science-sim-v1: quiet synthesized ambient bed (no samples, no real IP). usage: audio.py out.wav  -> then loudnorm to -14 LUFS (build.sh)
 - slow pad (A2/E3/A3/C#4 sines with LFO), soft filtered-noise 'crowd murmur' that swells with the timelapse (2-15 s)
 - 15.4-19.6 s: a sine whose pitch follows the measured speed curve (fd.json): high = fast, low = nearly stopped
 - soft ticks when the red labels appear, a low thump at the 4.0 call-out (19.8 s)"""
import sys, json, numpy as np, wave
SR = 48000; T = 30.0; n = int(SR * T); t = np.arange(n) / SR
rng = np.random.default_rng(7)
def env(a, b, rise=.5, fall=.5):
    return np.clip((t - a) / rise, 0, 1) * np.clip((b - t) / fall, 0, 1)
pad = np.zeros(n)
for f, g in [(110, .5), (164.81, .35), (220, .3), (277.18, .12)]:
    lfo = 1 + .25 * np.sin(2 * np.pi * (.07 + f / 4000) * t + f)
    pad += g * np.sin(2 * np.pi * f * t + .4 * np.sin(2 * np.pi * .11 * t)) * lfo
pad *= env(0, T, 1.0, 1.5) * .22
# murmur: band-limited noise (simple FFT filter 200-1800 Hz), swells 2-15 s
nz = rng.standard_normal(n); F = np.fft.rfft(nz); fr = np.fft.rfftfreq(n, 1 / SR)
F *= ((fr > 200) & (fr < 1800)) * (1 / (1 + fr / 600)); nz = np.fft.irfft(F, n); nz /= np.abs(nz).max()
mur = nz * (.05 + .13 * np.clip((t - 1) / 12, 0, 1)) * env(0, 17, 1.0, 2.5)
sig = pad + mur
# sonified fundamental diagram
fd = json.load(open(sys.argv[2]))['bins'] if len(sys.argv) > 2 else None
if fd:
    pts = [(b['rho_mid'], b['mean_speed']) for b in fd]
    t0, t1 = 15.4, 19.6; u = np.clip((t - t0) / (t1 - t0), 0, 1); rho = u * 4.0
    sp = np.interp(rho, [p[0] for p in pts], [p[1] for p in pts])
    fq = 110 + 330 * sp; ph = 2 * np.pi * np.cumsum(fq) / SR
    sig += .09 * np.sin(ph) * env(t0, t1 + .4, .3, .4)
def tick(at, f=880, g=.05):
    m = (t >= at) & (t < at + .25); tt = t[m] - at; return m, g * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 18)
for k in range(4):
    m, s = tick(5.0 + k * .47 + .0, 660 + 110 * k); sig[m] += s
tt = np.clip(t - 19.8, 0, None); m = (t >= 19.8) & (t < 21.6); sig[m] += .22 * np.sin(2 * np.pi * 55 * tt[m]) * np.exp(-tt[m] * 3)
sig *= np.clip(t / .05, 0, 1) * np.clip((T - t) / .6, 0, 1)
sig = np.tanh(sig * 1.2) * .8
st = np.stack([sig, np.roll(sig, int(SR * .004))], 1)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
