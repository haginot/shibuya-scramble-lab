#!/usr/bin/env python3
"""Export every asset (SFX one-shots, BGM loops, ambience loops) as 48 kHz 24-bit WAVs, optionally render the demo
cue sheets and analyze everything (ebur128 / loudnorm / octave bands / spectrogram + waveform PNGs).

  tools/audio/run.sh export_assets --out DIR [--demo] [--analyze]
Writes DIR/sfx/*.wav, DIR/bgm/*.wav, DIR/amb/*.wav, (--demo) DIR/demo-*.wav + .m4a + .json reports,
(--analyze) DIR/png/*.png and DIR/analysis.json.  Assets are at house level (not mastered).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import ambience  # noqa: E402
import mix  # noqa: E402
import music  # noqa: E402
import sfx  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--analyze', action='store_true')
    ap.add_argument('--stems', action='store_true', help='also write pre-master stems of the demo mixes')
    a = ap.parse_args(argv)
    timing = {}
    for sub in ('sfx', 'bgm', 'amb'):
        os.makedirs(os.path.join(a.out, sub), exist_ok=True)
    for name in sfx.REGISTRY:
        t = time.time()
        mix.write_wav24(os.path.join(a.out, 'sfx', f'{name}.wav'), sfx.get(name))
        timing[f'sfx/{name}'] = round(time.time() - t, 3)
    for name in music.TRACKS:
        t = time.time()
        mix.write_wav24(os.path.join(a.out, 'bgm', f'{name}-loop.wav'), music.loop(name))
        timing[f'bgm/{name}'] = round(time.time() - t, 3)
    for name in ambience.BEDS:
        t = time.time()
        mix.write_wav24(os.path.join(a.out, 'amb', f'{name}-loop.wav'), ambience.bed(name))
        timing[f'amb/{name}'] = round(time.time() - t, 3)
    reports = {}
    if a.demo:
        for cues in sorted(glob.glob(os.path.join(HERE, 'demo', '*.json'))):
            name = os.path.splitext(os.path.basename(cues))[0]
            out = os.path.join(a.out, f'{name}.wav')
            t = time.time()
            mix.main(['--cues', cues, '--out', out, '--report', os.path.join(a.out, f'{name}.json')]
                     + (['--stems', os.path.join(a.out, 'stems', name)] if a.stems else []))
            # AAC 192k preview (what the muxed video carries)
            import subprocess
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-c:a', 'aac', '-b:a', '192k',
                            os.path.join(a.out, f'{name}.m4a')], check=True)
            timing[f'mix/{name}'] = round(time.time() - t, 2)
            reports[name] = json.load(open(os.path.join(a.out, f'{name}.json')))
    if a.analyze:
        import analyze
        wavs = sorted(glob.glob(os.path.join(a.out, '*.wav'))) + sorted(glob.glob(os.path.join(a.out, '*', '*.wav')))
        analyze.main([*wavs, '--png', os.path.join(a.out, 'png'), '--json', os.path.join(a.out, 'analysis.json')])
    with open(os.path.join(a.out, 'timing.json'), 'w') as fh:
        json.dump(timing, fh, indent=1)
    print(json.dumps({'timing_s': timing, 'mix': {k: {'lufs': v['lufs'], 'tp_db': v['tp_db'], 'ffmpeg': v.get('ffmpeg')}
                                                   for k, v in reports.items()}}, indent=1))


if __name__ == '__main__':
    main()
