#!/usr/bin/env python3
"""Cue sheet JSON -> mastered 48 kHz stereo 24-bit WAV.

  uv run --no-project --with numpy --with scipy python tools/audio/mix.py --cues cues.json --out mix.wav \
      [--duration D] [--split 10.5] [--lufs -14] [--tp -1.5] [--report mix.json] [--stems DIR] [--strict]
  (tools/audio/run.sh mix ... is the same with the uv line built in)

Cue sheet (CONTRACT.md; produced by tools/variant_cues.mjs):
  {"duration": s, "fps": 30,
   "events": [{"t": s, "sfx": name, "gain_db": 0, "duck": s?, "duck_db": -9?, "pan": -1..1?,
               "repeat": interval_s?, "count": n? | "until": s?, "align": "start"|"hit"?}],
   "bgm":    [{"t0", "t1", "track": "tension|calm|victory", "gain_db": 0?, "fade_in": 0.5?, "fade_out": 1.0?,
               "offset": s?}],
   "amb":    [{"t0", "t1", "bed": "crowd-night|station-hall|street-quiet", "gain_db": 0?, "fade_in"?, "fade_out"?}],
   "duck":   [{"t0", "t1", "depth_db": -8}],
   "segments": [{"name": "opening", "t0": 0, "t1": 10.5}, ...]?        # optional, same as --split
  }
Runs: abutting runs of the same track/bed continue the loop seamlessly (no fades at the junction); a run that ends
on a segment boundary without continuation fades out over 0.8 s *after* the boundary (see resolve_runs).
Ducking applies to the BGM bus (and ~35 % of the depth to the ambience bus); ramps are causal (start at t0, 60 ms
down, 350 ms up after t1) so nothing before a cue's time is affected.

Mastering: each master segment ([0, split1), [split1, split2), ... ) is normalized to the target integrated loudness
on its own and true-peak limited on its own, so a shared opening (identical cues before the first split) gives
sample-identical audio in every variant; a 300 ms gain glide right after each split avoids a level step.  The whole file
then also measures ≈ target.  Without splits the whole file is one segment.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import ambience  # noqa: E402
import dsp  # noqa: E402
import music  # noqa: E402
import sfx  # noqa: E402
from dsp import SR, ns  # noqa: E402

DEFAULT_DUCK_DB = -9.0
AMB_DUCK_FRACTION = 0.35


def _f(d, k, default=None):
    v = d.get(k, default)
    return default if v is None else float(v)


def expand_events(events, duration):
    out = []
    for i, e in enumerate(events):
        name = e.get('sfx') or e.get('name')
        if not name:
            continue
        t = _f(e, 't', 0.0)
        rep = _f(e, 'repeat', 0.0)
        times = [t]
        if rep and rep > 0:
            if 'count' in e:
                times = [t + k * rep for k in range(int(e['count']))]
            else:
                until = _f(e, 'until', duration)
                times = list(np.arange(t, until - 1e-6, rep))
        for k, tk in enumerate(times):
            ev = dict(e)
            ev['t'] = float(tk)
            ev['sfx'] = name
            if k and ev.get('duck_once'):
                ev.pop('duck', None)
            out.append(ev)
    return out


def duck_curve(n: int, ranges) -> np.ndarray:
    """Gain curve (linear) for the BGM bus from [(t0, t1, depth_db)] — causal ramps, overlapping ranges take the min."""
    g_db = np.zeros(n)
    att, rel = ns(0.06), ns(0.35)
    for t0, t1, depth in ranges:
        a, b = ns(t0), ns(t1)
        if b <= a or a >= n:
            continue
        seg = np.full(n, 0.0)
        ia = np.arange(a, min(a + att, n))
        seg[ia] = depth * (ia - a + 1) / att
        seg[min(a + att, n):min(b, n)] = depth
        ib = np.arange(max(b, a + att), min(max(b, a + att) + rel, n))
        if ib.size:
            start = max(b, a + att)
            seg[ib] = depth * (1 - (ib - start + 1) / rel)
        g_db = np.minimum(g_db, seg)
    return 10 ** (g_db / 20)


def _range_gain(n_total: int, t0: float, t1: float, fin: float, fout: float) -> tuple[int, int, np.ndarray]:
    a, b = max(ns(t0), 0), min(ns(t1), n_total)
    m = max(b - a, 0)
    g = np.ones(m)
    fi, fo = min(ns(fin), m), min(ns(fout), m)
    if fi:
        g[:fi] = np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
    if fo:
        g[m - fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
    return a, b, g


SEAM_TAIL = 0.8   # s: a run that ends on a master-segment boundary (and isn't continued) fades out *after* it


def resolve_runs(runs, key: str, canon, duration: float, cuts, fin_def: float, fout_def: float, strict=False,
                 warn=print):
    """Normalize bgm/amb runs -> [{name, t0, t1, offset, fade_in, fade_out, gain_db}].

    * Abutting runs of the same track/bed are one continuous run: the later one continues the loop phase
      (offset) with no fade at the junction, unless it sets offset / fade_in explicitly.
    * A run ending on a master-segment boundary (e.g. the end of the shared opening) is never faded *before*
      the boundary — if it isn't continued, it rings on for SEAM_TAIL s past the boundary and fades there.  So
      the audio before the boundary doesn't depend on what follows (identical shared opening in every variant).
    Explicit fade_in / fade_out / offset always win."""
    out = []
    for r in runs or []:
        nm = r.get(key) or r.get('track') or r.get('bed')
        if nm in (None, 'none', 'silence', ''):
            continue
        c = canon(nm)
        if c is None:
            if strict:
                raise SystemExit(f'unknown {key} {nm!r}')
            warn(f'warning: unknown {key} {nm!r} skipped')
            continue
        out.append({'name': c, 't0': _f(r, 't0', 0.0), 't1': _f(r, 't1', duration), 'gain_db': _f(r, 'gain_db', 0.0),
                    'offset': r.get('offset'), 'fade_in': r.get('fade_in'), 'fade_out': r.get('fade_out')})
    out.sort(key=lambda r: r['t0'])
    for k, r in enumerate(out):
        nxt = next((q for q in out[k + 1:] if q['name'] == r['name'] and abs(q['t0'] - r['t1']) < 1e-3), None)
        if nxt is not None:
            if nxt['offset'] is None:
                nxt['offset'] = (r['offset'] or 0.0) + (r['t1'] - r['t0'])
            if nxt['fade_in'] is None:
                nxt['fade_in'] = 0.0
            if r['fade_out'] is None:
                r['fade_out'] = 0.0
            nxt['_cont'] = True
        elif r['fade_out'] is None and any(abs(r['t1'] - c) < 1e-3 for c in cuts) and r['t1'] < duration - 1e-3:
            r['t1'] = min(duration, r['t1'] + SEAM_TAIL)
            r['fade_out'] = SEAM_TAIL
    for r in out:
        r['offset'] = float(r['offset'] or 0.0)
        r['fade_in'] = float(fin_def if r['fade_in'] is None else r['fade_in'])
        r['fade_out'] = float(fout_def if r['fade_out'] is None else r['fade_out'])
        r.pop('_cont', None)
    return out


def render_stems(cues: dict, duration: float, strict: bool = False, warn=print, cuts=()):
    n = ns(duration)
    bgm = np.zeros((2, n))
    amb = np.zeros((2, n))
    fx = np.zeros((2, n))
    tracks = lambda nm: nm if nm in music.TRACKS else None  # noqa: E731
    runs = {'bgm': resolve_runs(cues.get('bgm'), 'track', tracks, duration, cuts, 0.5, 1.0, strict, warn),
            'amb': resolve_runs(cues.get('amb'), 'bed', ambience.canonical, duration, cuts, 0.8, 1.0, strict, warn)}
    for kind, bus, src in (('bgm', bgm, music.loop), ('amb', amb, ambience.bed)):
        for r in runs[kind]:
            a, e, g = _range_gain(n, r['t0'], r['t1'], r['fade_in'], r['fade_out'])
            if e > a:
                bus[:, a:e] += dsp.tile(src(r['name']), e - a, ns(r['offset'])) * g * dsp.db(r['gain_db'])
    ducks = [(_f(d, 't0'), _f(d, 't1'), _f(d, 'depth_db', DEFAULT_DUCK_DB)) for d in cues.get('duck', []) or []]
    for e in expand_events(cues.get('events', []) or [], duration):
        name = sfx.canonical(e['sfx'])
        if name is None:
            if strict:
                raise SystemExit(f'unknown sfx {e["sfx"]!r}')
            warn(f'warning: unknown sfx {e["sfx"]!r} skipped')
            continue
        y = sfx.get(name)
        t = e['t']
        if e.get('align') == 'hit':
            t -= sfx.HIT_AT.get(name, 0.0)
        if 'pan' in e and e['pan'] is not None:
            p = float(e['pan'])
            y = y * np.array([[min(1.0, 1 - p)], [min(1.0, 1 + p)]])
        dsp.place(fx, y, t, dsp.db(_f(e, 'gain_db', 0.0)))
        if e.get('duck'):
            ducks.append((e['t'], e['t'] + float(e['duck']), _f(e, 'duck_db', DEFAULT_DUCK_DB)))
    dc = duck_curve(n, ducks)
    bgm *= dc
    amb *= 1 - (1 - dc) * AMB_DUCK_FRACTION
    return {'bgm': bgm, 'amb': amb, 'sfx': fx}, ducks, runs


def segments_from(cues: dict, duration: float, split=None):
    cuts = []
    if split:
        cuts = sorted(float(s) for s in split)
    elif cues.get('segments'):
        cuts = sorted(float(s['t0']) for s in cues['segments'] if float(s['t0']) > 0)
    cuts = [c for c in cuts if 0 < c < duration]
    edges = [0.0] + cuts + [duration]
    return list(zip(edges[:-1], edges[1:]))


def master_segments(x: np.ndarray, segs, lufs: float, tp: float, aac_tp: float | None = -1.2):
    out = np.zeros_like(x)
    infos = []
    prev_gain = None
    for (t0, t1) in segs:
        a, b = ns(t0), min(ns(t1), x.shape[-1])
        part = x[:, a:b]
        L0 = dsp.lufs_integrated(part)
        if not np.isfinite(L0):
            infos.append({'t0': t0, 't1': t1, 'lufs': None})
            out[:, a:b] = part
            continue
        g_steady = lufs - L0
        y = None
        for _ in range(5):
            curve = np.full(b - a, dsp.db(g_steady))
            if prev_gain is not None:
                k = min(ns(0.3), b - a)
                curve[:k] = np.linspace(dsp.db(prev_gain), dsp.db(g_steady), k)
            y = dsp.limiter(part * curve, tp)
            L = dsp.lufs_integrated(y)
            if abs(L - lufs) < 0.05:
                break
            g_steady += lufs - L
        if dsp.true_peak_db(y) > tp + 0.05:
            y = dsp.limiter(y, tp - 0.3)
        aac_hist = []
        if aac_tp is not None:
            y, aac_hist = aac_guard(y, aac_tp)
        out[:, a:b] = y
        prev_gain = g_steady
        pre = dsp.true_peak_curve(part) * dsp.db(g_steady)
        post = dsp.true_peak_curve(y)
        gr = 20 * np.log10(np.maximum(pre, 1e-9) / np.maximum(post, 1e-9))
        infos.append({'t0': t0, 't1': t1, 'lufs_in': round(float(L0), 2), 'gain_db': round(float(g_steady), 2),
                      'lufs': round(float(dsp.lufs_integrated(y)), 2), 'tp_db': round(float(dsp.true_peak_db(y)), 2),
                      'limiter_gr_max_db': round(float(gr.max()), 2),
                      'limiter_active_pct': round(float((gr > 0.5).mean() * 100), 2), 'aac_tp_db': aac_hist})
    return out, infos


def aac_guard(y: np.ndarray, ceiling_db: float = -1.2, iters: int = 3, bitrate: str = '192k') -> tuple[np.ndarray, list]:
    """Keep the *decoded AAC* true peak under the ceiling: encode with ffmpeg's AAC encoder, decode, find where the
    codec overshoots, and apply a short, local extra gain reduction there (look-ahead min-filter + smoothing).
    Loudness is practically unchanged (only a few ms around a handful of transients move).  Returns (y, [tp...])."""
    import subprocess
    import tempfile
    hist = []
    with tempfile.TemporaryDirectory(prefix='aacguard-') as td:
        src, enc, dec = (os.path.join(td, f) for f in ('a.wav', 'a.m4a', 'b.wav'))
        for _ in range(iters + 1):
            write_wav24(src, y)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', bitrate, enc], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', enc, '-c:a', 'pcm_s24le', dec], check=True)
            d = dsp.fit(read_wav(dec), y.shape[-1])
            tpc = dsp.true_peak_curve(d)
            tp = 20 * np.log10(tpc.max() + 1e-12)
            hist.append(round(float(tp), 2))
            if tp <= ceiling_db or len(hist) > iters:
                break
            need = np.minimum(1.0, dsp.db(ceiling_db - 0.15) / np.maximum(tpc, 1e-12))
            from scipy.ndimage import minimum_filter1d, uniform_filter1d
            W = ns(0.006)
            g = uniform_filter1d(minimum_filter1d(need, 2 * W + 1, mode='nearest'), W, mode='nearest')
            y = y * g
    return y, hist


def write_wav24(path: str, x: np.ndarray) -> None:
    x = np.clip(x, -1.0, 1.0 - 1.0 / 8388608)
    ints = np.ascontiguousarray(np.round(x.T * 8388607).astype("<i4"))
    raw = ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, 'rb') as w:
        ch, sw, n = w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = np.frombuffer(w.readframes(n), dtype=np.uint8)
    if sw == 3:
        b = raw.reshape(-1, 3)
        ints = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        ints = np.where(ints >= 1 << 23, ints - (1 << 24), ints)
        x = ints / 8388608.0
    elif sw == 2:
        x = raw.view('<i2') / 32768.0
    else:
        x = raw.view('<i4') / 2147483648.0
    return x.reshape(-1, ch).T


def mix(cues: dict, duration: float | None = None, split=None, lufs: float = -14.0, tp: float = -1.5,
        strict: bool = False, warn=print, aac_tp: float | None = -1.2):
    duration = float(duration if duration is not None else cues['duration'])
    segs = segments_from(cues, duration, split)
    stems, ducks, runs = render_stems(cues, duration, strict, warn, cuts=[t0 for t0, _ in segs[1:]])
    bus = stems['bgm'] + stems['amb'] + stems['sfx']
    bus = dsp.hp(bus, 25, 2)
    out, infos = master_segments(bus, segs, lufs, tp, aac_tp)
    info = {'duration': duration, 'sr': SR, 'segments': infos, 'lufs': round(float(dsp.lufs_integrated(out)), 2),
            'tp_db': round(float(dsp.true_peak_db(out)), 2), 'ducks': [[round(a, 3), round(b, 3), d] for a, b, d in ducks], 'runs': runs}
    return out, stems, info


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--cues', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--duration', type=float)
    ap.add_argument('--split', help='comma-separated master-segment boundaries in seconds (e.g. the opening end)')
    ap.add_argument('--lufs', type=float, default=-14.0)
    ap.add_argument('--tp', type=float, default=-1.5, help='true-peak ceiling dBTP (internal meter; ffmpeg ≤ -1)')
    ap.add_argument('--report', help='write a JSON report (internal + ffmpeg ebur128 measurements)')
    ap.add_argument('--stems', help='also write bgm/amb/sfx stems (pre-master) into this directory')
    ap.add_argument('--strict', action='store_true', help='unknown sfx/track/bed names are errors')
    ap.add_argument('--aac-tp', type=float, default=-1.2,
                    help='AAC guard: keep the decoded AAC-192k true peak under this (dBTP); --no-aac-guard to skip')
    ap.add_argument('--no-aac-guard', action='store_true')
    a = ap.parse_args(argv)
    with open(a.cues, encoding='utf-8') as fh:
        cues = json.load(fh)
    split = [float(s) for s in a.split.split(',')] if a.split else None
    out, stems, info = mix(cues, a.duration, split, a.lufs, a.tp, a.strict, warn=lambda m: print(m, file=sys.stderr),
                           aac_tp=None if a.no_aac_guard else a.aac_tp)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    write_wav24(a.out, out)
    if a.stems:
        os.makedirs(a.stems, exist_ok=True)
        for k, v in stems.items():
            write_wav24(os.path.join(a.stems, f'{k}.wav'), np.clip(v, -1, 1))
    if a.report:
        try:
            import analyze
            info['ffmpeg'] = analyze.ebur128(a.out)
        except Exception as ex:  # ffmpeg missing etc.
            info['ffmpeg'] = {'error': str(ex)}
        with open(a.report, 'w', encoding='utf-8') as fh:
            json.dump(info, fh, indent=1, ensure_ascii=False)
    print(json.dumps({'out': a.out, 'lufs': info['lufs'], 'tp_db': info['tp_db'], 'segments': info['segments'],
                      **({'ffmpeg': info['ffmpeg']} if 'ffmpeg' in info else {})}, ensure_ascii=False))


if __name__ == '__main__':
    main()
