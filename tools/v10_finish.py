#!/usr/bin/env python3
"""JR v10 finish: tools/v9_finish.py (cues → procedural mix at −14 LUFS / −2 dBTP master, mux, contact sheet, verify) on the
v10 work dir + the share file. The v10 timeline, cue sheet and ghost lines are the v9 ones (only pictures changed), so the
mix is the v9 mix recomputed (same cues, same shove times as the photo crush POV's kicks).
  share: <pair>-share.mp4 = x264 crf 23 (preset slow, yuv420p, faststart) + the same AAC audio, must be < 200 MB.
usage: python3 tools/v10_finish.py audio|mux|contact|verify|share|all <pair>
env: OUT (default /workspace/demos/halloween-escape-series/jr-v10.1), WORK10
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
os.environ.setdefault('OUT', '/workspace/demos/halloween-escape-series/jr-v10.1')
import render_v9 as R9  # noqa: E402
import v9_finish as F9  # noqa: E402
from v10_composite import WORK10  # noqa: E402

OUT = Path(os.environ['OUT'])
F9.OUT = OUT
SHARE_MAX = 200*1024*1024
F9.CONTACT = [(b, f, lab.replace('Hachiko-mae reveal (costumes)', 'Hachiko-mae reveal (Gemini photo)')
               .replace('over-result + meter (press)', 'over-result + meter (photo)')
               .replace('CRUSH POV', 'CRUSH POV photo', 1)) for b, f, lab in F9.CONTACT]


def prep(pair):
    """timeline / cue sheet (written by render_v9.timeline into the v9 work dir) → $WORK10/<pair>; v9_finish then works there."""
    R9.timeline(pair)
    d = WORK10/pair; d.mkdir(parents=True, exist_ok=True)
    for n in ('timeline.json', 'cues.json'): shutil.copy(R9.WORK/pair/n, d/n)
    F9.WORK = WORK10
    F9.timeline = lambda p: json.loads((WORK10/p/'timeline.json').read_text(encoding='utf-8'))   # the copy


def share(pair):
    src, dst = OUT/f'{pair}.mp4', OUT/f'{pair}-share.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
                    '-c:a', 'copy', '-movflags', '+faststart', str(dst)], check=True)
    size = dst.stat().st_size
    print(json.dumps(dict(file=str(dst), bytes=size, mb=round(size/2**20, 1), ok=size < SHARE_MAX)))
    return 0 if size < SHARE_MAX else 1


def main(argv):
    cmd, pair = argv[0], argv[1]
    prep(pair)
    rc = 0
    if cmd in ('audio', 'all'): F9.audio(pair)
    if cmd in ('mux', 'all'): F9.mux(pair)
    if cmd in ('contact', 'all'): F9.contact(pair)
    if cmd in ('verify', 'all'): rc |= F9.verify(pair)
    if cmd in ('share', 'all'): rc |= share(pair)
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
