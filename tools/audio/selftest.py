#!/usr/bin/env python3
"""Fast self-test of the audio toolchain; prints one JSON object of named checks (tests/test_audio.py asserts them).

  tools/audio/run.sh selftest [--tmp DIR]
Includes the combined-episode checks (combined_checks): new SFX registered, aliases, auto hard-duck under the
caught sounds, true silence after cut_black, BGM back after the window, BGM off in the kaiju beat, the roar is tonal
(almost nothing above 3 kHz), no level dip at an in-segment track switch, -14 LUFS / TP <= -1 dBTP.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import analyze  # noqa: E402
import dsp  # noqa: E402
import mix  # noqa: E402
import music  # noqa: E402
import sfx  # noqa: E402

OPEN_END = 4.0


def cues(body_variant: str) -> dict:
    ev = [{'t': 0.3, 'sfx': 'whoosh'}, {'t': 1.5, 'sfx': 'riser', 'align': 'hit'},
          {'t': 1.5, 'sfx': 'logo_slam', 'duck': 1.0, 'duck_db': -12}, {'t': 3.0, 'sfx': 'ui_select'}]
    if body_variant == 'over':
        ev += [{'t': 4.5, 'sfx': 'tick', 'repeat': 0.5, 'count': 4}, {'t': 6.5, 'sfx': 'red_alert', 'duck': 1.0},
               {'t': 8.0, 'sfx': 'stamp_hit', 'duck': 2.5, 'duck_db': -14}, {'t': 8.1, 'sfx': 'gameover_jingle'}]
    else:
        ev += [{'t': 4.5, 'sfx': 'ui_blip'}, {'t': 8.0, 'sfx': 'stamp_hit', 'duck': 2.5},
               {'t': 8.0, 'sfx': 'escaped', 'align': 'hit'}, {'t': 8.6, 'sfx': 'clear_jingle'}]
    return {'duration': 11.0, 'fps': 30,
            'segments': [{'name': 'opening', 't0': 0, 't1': OPEN_END}, {'name': 'body', 't0': OPEN_END, 't1': 11.0}],
            'events': ev,
            # over: the opening's track continues seamlessly; clear: a different track starts at the seam
            'bgm': [{'t0': 0, 't1': OPEN_END, 'track': 'tension'},
                    {'t0': OPEN_END, 't1': 11.0, 'track': 'tension' if body_variant == 'over' else 'victory'}],
            'amb': [{'t0': 0, 't1': 11.0, 'bed': 'station-hall'}],
            'duck': [{'t0': 9.0, 't1': 11.0, 'depth_db': -6}]}


def combined_cues() -> dict:
    """Mini combined-episode timeline: tension BGM kept through a caught beat (auto hard-duck), cut_black (silence
    window + chopped tails), stamp on black, a CONTINUE? beat on the retry bed ('continue' alias, 'at' times),
    then a kaiju beat (BGM off) ending in a smash cut."""
    return {'duration': 12.0, 'fps': 30, 'segments': [{'name': 'body', 't0': 0, 't1': 12.0}],
            'events': [{'t': 1.0, 'sfx': 'crowd_press'}, {'t': 1.2, 'sfx': 'zombie-groan', 'pan': -0.5},
                       {'t': 1.6, 'sfx': 'zombie_groan_b'}, {'t': 1.75, 'sfx': 'red_flash'},
                       {'t': 1.75, 'sfx': 'caught_hit'}, {'t': 2.0, 'sfx': 'cut_black'},
                       {'t': 2.56, 'sfx': 'stamp_hit', 'duck': 2.0, 'duck_db': -12},
                       {'at': 4.3, 'sfx': 'continue_tick'}, {'at': 4.9, 'sfx': 'continue_tick'},
                       {'at': 5.5, 'sfx': 'continue_yes'}, {'t': 7.0, 'sfx': 'kaiju_rumble'},
                       {'t': 8.6, 'sfx': 'kaiju_roar', 'align': 'hit'}, {'t': 9.6, 'sfx': 'boing'},
                       {'t': 10.5, 'sfx': 'smash_cut', 'align': 'hit'}, {'t': 10.6, 'sfx': 'end_sting'}],
            'bgm': [{'t0': 0, 't1': 4.0, 'track': 'tension'}, {'t0': 4.0, 't1': 7.0, 'track': 'continue'},
                    {'t0': 7.0, 't1': 10.5, 'track': None},
                    {'t0': 10.5, 't1': 12.0, 'track': 'victory', 'fade_in': 0.05}],
            'amb': [{'t0': 0, 't1': 4.0, 'bed': 'crowd-night'}]}


def combined_checks(tmp: str) -> dict:
    R = {}
    R['sfx_missing_combined'] = [n for n in sfx.REQUIRED_COMBINED + ('zombie_groan_b', 'boing', 'end_sting')
                                 if sfx.canonical(n) is None]
    R['aliases'] = {a: sfx.canonical(a) for a in ('zombie-groan', 'roar', 'black', 'smash', 'yes')}
    R['bgm_alias_continue'] = music.canonical('continue')
    y, stems, info = mix.mix(combined_cues(), warn=lambda m: None, strict=True)
    wp = os.path.join(tmp, 'mix-combined.wav')
    mix.write_wav24(wp, y)
    ff = analyze.ebur128(wp)
    R['combined_ffmpeg'] = [ff['I_lufs'], ff['tp_dbtp']]

    def lv(a, t0, t1):
        s = a[:, dsp.ns(t0):dsp.ns(t1)]
        return float(20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-12))
    R['caught_bgm_duck_db'] = round(lv(stems['bgm'], 1.3, 1.95) - lv(stems['bgm'], 0.2, 0.9), 1)
    R['black_silence_dbfs'] = round(lv(y, 2.2, 2.38), 1)          # after the cut_black thunk, before the stamp
    R['black_bgm_amb_dbfs'] = round(lv(stems['bgm'] + stems['amb'], 2.02, 2.38), 1)
    R['after_cut_bgm_dbfs'] = round(lv(stems['bgm'], 3.0, 3.5), 1)         # back (under the stamp duck)
    R['kaiju_bgm_dbfs'] = round(lv(stems['bgm'], 7.2, 10.3), 1)
    R['n_hard_cuts'] = len(info['runs']['hard_cuts'])
    r_ = sfx.get('kaiju_roar').mean(0)
    F = np.abs(np.fft.rfft(r_)) ** 2
    f = np.fft.rfftfreq(r_.size, 1 / dsp.SR)
    R['roar_gt3k_pct'] = round(float(F[f > 3000].sum() / F.sum() * 100), 2)   # tonal bellow, not a screech
    R['roar_centroid_hz'] = round(float((F * f).sum() / F.sum()))
    bl = dsp.block_loudness(y)
    cb = {'duration': 10.0, 'events': [{'t': 4.34, 'sfx': 'continue_tick'}, {'t': 4.9, 'sfx': 'continue_tick'},
                                       {'t': 6.0, 'sfx': 'continue_yes'}],
          'bgm': [{'t0': 0, 't1': 4.0, 'track': 'calm'}, {'t0': 7.0, 't1': 10.0, 'track': 'tension'}]}
    R['auto_bed'] = [[r['t0'], r['t1'], r['track']] for r in mix.auto_continue_bed(cb, 10.0)]
    R['auto_bed_off'] = len(mix.auto_continue_bed({**cb, 'auto_bgm': False}, 10.0))
    R['auto_bed_covered'] = len(mix.auto_continue_bed(combined_cues(), 12.0))
    R['switch_dip_lu'] = round(float(np.median(bl[25:38]) - bl[38:44].min()), 1)  # tension -> retry at 4.0 s
    return R


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--tmp')
    a = ap.parse_args(argv)
    tmp = a.tmp or tempfile.mkdtemp(prefix='audio-selftest-')
    os.makedirs(tmp, exist_ok=True)
    R = {}
    # meter sanity: internal BS.1770 vs ffmpeg ebur128 on a synthetic tone+noise
    r = dsp.rng('selftest')
    x = np.vstack([0.2 * dsp.sine(997, 5.0), 0.1 * dsp.sine(997, 5.0)]) + 0.02 * r.standard_normal((2, dsp.ns(5.0)))
    p = os.path.join(tmp, 'tone.wav')
    mix.write_wav24(p, x)
    eb = analyze.ebur128(p)
    R['meter_internal_lufs'] = round(dsp.lufs_integrated(x), 2)
    R['meter_ffmpeg_lufs'] = eb['I_lufs']
    R['meter_ffmpeg_tp'] = eb['tp_dbtp']
    R['meter_internal_tp'] = round(dsp.true_peak_db(x), 2)
    # registry
    R['sfx_missing'] = [n for n in sfx.REQUIRED if sfx.canonical(n) is None]
    R['bgm_tracks'] = list(music.TRACKS)
    # loop seam of the tension loop: the wrap-around step is no bigger than a typical in-loop step
    lp = music.loop('tension')
    wrap = float(np.abs(lp[:, 0] - lp[:, -1]).max())
    R['loop_seam_step'] = wrap
    R['loop_p999_step'] = float(np.percentile(np.abs(np.diff(lp, axis=-1)), 99.9))
    # mixes
    outs = {}
    for v in ('over', 'clear'):
        cp = os.path.join(tmp, f'cues-{v}.json')
        with open(cp, 'w') as fh:
            json.dump(cues(v), fh)
        wp = os.path.join(tmp, f'mix-{v}.wav')
        y, stems, info = mix.mix(cues(v), warn=lambda m: None)
        mix.write_wav24(wp, y)
        outs[v] = (wp, y, stems, info)
    wp, y, stems, info = outs['over']
    with wave.open(wp, 'rb') as w:
        R['wav_format'] = [w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()]
    R['mix_internal_lufs'] = info['lufs']
    R['mix_internal_tp'] = info['tp_db']
    R['segments'] = info['segments']
    ff = analyze.ebur128(wp)
    R['mix_ffmpeg_lufs'] = ff['I_lufs']
    R['mix_ffmpeg_tp'] = ff['tp_dbtp']
    n_open = dsp.ns(OPEN_END)
    runs = outs['over'][3]['runs']['bgm']
    R['continuation'] = [len(runs), runs[1]['offset'], runs[1]['fade_in'], runs[0]['fade_out']]
    R['opening_identical'] = bool(np.array_equal(outs['over'][1][:, :n_open], outs['clear'][1][:, :n_open]))
    R['bodies_differ'] = not bool(np.array_equal(outs['over'][1][:, n_open:], outs['clear'][1][:, n_open:]))
    y2, _, _ = mix.mix(cues('over'), warn=lambda m: None)
    R['deterministic'] = bool(np.array_equal(y, y2))
    R['wav_sha256'] = hashlib.sha256(open(wp, 'rb').read()).hexdigest()
    # ducking: BGM stem RMS during the stamp duck vs. just before the first duck
    bgm = stems['bgm']
    def rms(t0, t1):
        s = bgm[:, dsp.ns(t0):dsp.ns(t1)]
        return 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-12)
    R['duck_depth_db'] = round(rms(8.3, 9.0) - rms(3.0, 3.8), 1)
    # unknown names: warning (lenient) vs. error (strict)
    bad = {'duration': 1.0, 'events': [{'t': 0.1, 'sfx': 'no_such_sfx'}]}
    warns = []
    mix.mix(bad, warn=warns.append)
    R['unknown_warns'] = len(warns)
    try:
        mix.mix(bad, strict=True)
        R['strict_raises'] = False
    except SystemExit:
        R['strict_raises'] = True
    # repeat expansion
    R['repeat_count'] = len(mix.expand_events([{'t': 0, 'sfx': 'tick', 'repeat': 0.5, 'until': 2.0}], 10))
    # mux: tiny synthetic video + the mix -> AAC 48k stereo, video length kept
    vid = os.path.join(tmp, 'v.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x112:r=30:d=6',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vid], check=True)
    mo = os.path.join(tmp, 'muxed.mp4')
    subprocess.run([os.path.join(HERE, 'mux.sh'), vid, wp, mo], check=True, capture_output=True)
    pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                         'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', mo],
                        capture_output=True, text=True, check=True)
    j = json.loads(pr.stdout)
    st = j['streams'][0]
    R['mux'] = {'codec': st['codec_name'], 'sr': int(st['sample_rate']), 'ch': st['channels'],
                'duration': round(float(j['format']['duration']), 2)}
    R['mux_ebur128'] = analyze.ebur128(mo)
    R.update(combined_checks(tmp))
    print(json.dumps(R))


if __name__ == '__main__':
    main()
