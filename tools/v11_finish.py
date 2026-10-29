#!/usr/bin/env python3
"""JR v11-en finish: tools/v10_finish.py (v9 cue sheet → procedural mix at −14 LUFS / −2 dBTP master, mux, contact sheet,
verify, <pair>-share.mp4 x264 crf 23 < 200 MB) on the EN work dir. Captions + SFX/music only, like the JP build (the ghost's
"voice" is the same synthesized blips, no TTS): the timeline, the cuts and the ghost line starts are the JP ones, so the mix
is the v10.2 mix recomputed. Contact-sheet labels in English.
usage: python3 tools/v11_finish.py audio|mux|contact|verify|share|all <pair>
env: OUT (default /workspace/demos/halloween-escape-series/jr-v11-en), WORK11
"""
from __future__ import annotations

import os
from pathlib import Path
import sys

WORK11 = Path(os.environ.get('WORK11', '/workspace/projects/logs/ssl-claude-halloween/v11-en/render'))
os.environ['WORK'] = str(WORK11)
os.environ['WORK10'] = str(WORK11)
os.environ.setdefault('OUT', '/workspace/demos/halloween-escape-series/jr-v11-en')
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import v11_render  # noqa: E402,F401
import render_v9 as R9  # noqa: E402
import v10_finish as F10  # noqa: E402

F9 = F10.F9
LAB = {'cold open (CG, costumes) フィクション': 'cold open (CG) FICTION tag', 'CRUSH POV photo 圧死危険': 'CRUSH POV photo CRUSH DANGER',
       'GAME OVER (v6)': 'GAME OVER (EN CG)', 'GOODBYE (v6)': 'GOODBYE (EN CG)', 'mission (CG)': 'mission (EN CG)', 'TRUE END (CG)': 'TRUE END (EN CG)'}
F9.CONTACT = [(b, f, LAB.get(lab, lab)) for b, f, lab in F9.CONTACT]


def prep(pair):
    R9.timeline(pair)   # → $WORK11/<pair>/timeline.json + cues.json (the v9 timeline / cue sheet)
    F9.WORK = WORK11


F10.prep = prep

if __name__ == '__main__':
    assert F10.OUT == Path(os.environ['OUT']) and F9.OUT == F10.OUT
    sys.exit(F10.main(sys.argv[1:]))
