#!/usr/bin/env python3
"""Measure / visualize WAVs: ffmpeg ebur128 (integrated LUFS, LRA, true peak), ffmpeg loudnorm measurement,
octave-band balance, and spectrogram + waveform PNGs (ffmpeg showspectrumpic / showwavespic).

  uv run --no-project --with numpy --with scipy python tools/audio/analyze.py a.wav [b.wav ...] [--png DIR] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _ff(args):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True)
    return p.stderr


def ebur128(path: str) -> dict:
    """ffmpeg's EBU R128 summary: I (LUFS), LRA (LU), true peak (dBTP)."""
    err = _ff(['-i', path, '-filter_complex', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'])
    summ = err[err.rfind('Summary:'):]
    def num(label):
        m = re.search(label + r':\s+(-?[\d.]+|-inf)', summ)
        return float(m.group(1)) if m and m.group(1) != '-inf' else None
    return {'I_lufs': num(r'\bI'), 'LRA_lu': num('LRA'), 'tp_dbtp': num('Peak')}


def loudnorm_measure(path: str) -> dict:
    err = _ff(['-i', path, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'])
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', err, re.S)
    if not m:
        return {}
    d = json.loads(m.group(0))
    return {'input_i': float(d['input_i']), 'input_tp': float(d['input_tp']), 'input_lra': float(d['input_lra'])}


def load(path: str):
    """(2, n) float array at 48 kHz from a WAV (direct) or anything ffmpeg can decode (m4a / mp4 audio)."""
    import tempfile
    from mix import read_wav
    if path.lower().endswith('.wav'):
        return read_wav(path)
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'a.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le',
                        out], check=True)
        return read_wav(out)


def bands(path: str) -> dict:
    """Octave-band energy balance (dB re. total) — quick spectral sanity check."""
    import numpy as np
    x = load(path).mean(0)
    X = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2
    f = np.fft.rfftfreq(x.size, 1 / 48000)
    tot = X.sum() + 1e-30
    out = {}
    for lo in (20, 40, 80, 160, 315, 630, 1250, 2500, 5000, 10000):
        hi = lo * 2 if lo < 10000 else 24000
        e = X[(f >= lo) & (f < hi)].sum()
        out[f'{lo}-{hi}'] = round(10 * np.log10(e / tot + 1e-30), 1)
    return out


def _colormap(v):
    """v in [0,1] -> RGB uint8 (black-purple-red-orange-yellow-white)."""
    import numpy as np
    stops = np.array([[0, 0, 0], [40, 10, 90], [150, 20, 120], [230, 60, 40], [250, 170, 30], [255, 255, 210]], float)
    x = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.minimum(x.astype(int), len(stops) - 2)
    f = (x - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


def pictures(path: str, outdir: str, width: int = 1600) -> list[str]:
    """One PNG per file: log-frequency spectrogram (30 Hz-20 kHz, dBFS colour, correct axis), peak/RMS waveform
    (dBFS), and short-term (3 s) + momentary (400 ms) loudness with the -14 LUFS line."""
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy import signal
    import dsp
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, os.path.splitext(os.path.basename(path))[0] + '.png')
    x = load(path)
    mono = x.mean(0)
    dur = x.shape[-1] / 48000
    W, H1, H2, H3, LM, TM = width, 420, 140, 140, 70, 24
    img = Image.new('RGB', (W + LM + 10, TM + H1 + H2 + H3 + 70), (18, 18, 24))
    d = ImageDraw.Draw(img)
    # spectrogram
    nper = 4096
    hop = max(64, int(mono.size / W))
    f, t, Z = signal.stft(mono, 48000, nperseg=nper, noverlap=max(0, nper - hop), boundary=None, padded=False)
    P = 20 * np.log10(np.abs(Z) * 2 + 1e-10)                 # scipy scales by the window sum -> dBFS
    rows = np.geomspace(30, 20000, H1)[::-1]
    fi = np.clip(np.searchsorted(f, rows), 1, f.size - 1)
    S = P[fi]                                                   # (H1, T)
    cols = np.linspace(0, S.shape[1] - 1, W).astype(int) if S.shape[1] else np.zeros(W, int)
    S = S[:, cols]
    rgb = _colormap((S + 110) / 100)                            # -110..-10 dBFS
    img.paste(Image.fromarray(rgb), (LM, TM))
    for fr in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        y = TM + int(H1 * (1 - np.log(fr / 30) / np.log(20000 / 30)))
        d.line([(LM - 5, y), (LM, y)], fill='white')
        d.text((4, y - 6), f'{fr if fr < 1000 else str(fr // 1000) + "k"} Hz', fill='white')
    # waveform peak / rms in dBFS
    y0 = TM + H1 + 10
    n = mono.size
    edges = np.linspace(0, n, W + 1).astype(int)
    pk = np.array([np.abs(x[:, a:b]).max() if b > a else 0 for a, b in zip(edges[:-1], edges[1:])])
    rms = np.array([np.sqrt((x[:, a:b] ** 2).mean()) if b > a else 0 for a, b in zip(edges[:-1], edges[1:])])
    def ydb(v, top, h, lo=-60):
        return top + h - int(h * (np.clip(20 * np.log10(v + 1e-9), lo, 0) - lo) / -lo)
    for i in range(W):
        d.line([(LM + i, ydb(pk[i], y0, H2)), (LM + i, y0 + H2)], fill=(90, 160, 230))
        d.line([(LM + i, ydb(rms[i], y0, H2)), (LM + i, y0 + H2)], fill=(30, 80, 160))
    for lv in (0, -12, -24, -48):
        yy = y0 + H2 - int(H2 * (lv + 60) / 60)
        d.text((4, yy - 6), f'{lv} dBFS', fill='white')
    # loudness
    y1 = y0 + H2 + 14
    mom = dsp.block_loudness(x, 0.4, 0.1)
    st = dsp.block_loudness(x, 3.0, 0.1)
    def yl(v):
        return y1 + H3 - int(H3 * (np.clip(v, -40, -4) + 40) / 36)
    d.line([(LM, yl(-14)), (LM + W, yl(-14))], fill=(120, 220, 120))
    d.text((4, yl(-14) - 6), '-14 LUFS', fill=(120, 220, 120))
    d.text((4, yl(-30) - 6), '-30', fill='white')
    for arr, col, blk in ((mom, (230, 150, 60), 0.4), (st, (255, 255, 255), 3.0)):
        pts = [(LM + int(W * (k * 0.1 + blk / 2) / dur), yl(v)) for k, v in enumerate(arr) if np.isfinite(v)]
        if len(pts) > 1:
            d.line(pts, fill=col, width=2 if blk > 1 else 1)
    for s in range(0, int(dur) + 1, 1 if dur <= 12 else 2):
        xx = LM + int(W * s / dur)
        d.line([(xx, TM + H1), (xx, TM + H1 + 6)], fill='white')
        d.text((xx - 6, y1 + H3 + 6), f'{s}s', fill='white')
    eb = ebur128(path)
    d.text((LM, 4), f'{os.path.basename(path)}   {dur:.2f} s   I={eb["I_lufs"]} LUFS  LRA={eb["LRA_lu"]} LU  '
                    f'TP={eb["tp_dbtp"]} dBTP   (orange: momentary, white: short-term)', fill='white')
    img.save(out)
    return [out]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('wavs', nargs='+')
    ap.add_argument('--png', help='write spectrogram/waveform PNGs here')
    ap.add_argument('--json', help='write all measurements to this JSON file')
    a = ap.parse_args(argv)
    res = {}
    for w in a.wavs:
        r = {'ebur128': ebur128(w), 'loudnorm': loudnorm_measure(w), 'bands_db': bands(w)}
        if a.png:
            r['png'] = pictures(w, a.png)
        res[w] = r
        print(os.path.basename(w), json.dumps(r['ebur128']), json.dumps(r['loudnorm']))
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump(res, fh, indent=1)


if __name__ == '__main__':
    main()
