#!/usr/bin/env python3
"""JR v11.1 proof stills: every changed scene of every pair, both languages, BEFORE (JP v10.2 + the zone wrap fix / EN
v11-en) | AFTER (v11.1) side by side, cut from the final videos at the same time
→ demos/halloween-escape-series/jr-v11.1/proof/<lang>-<pair>-NN-<label>.png (1080 × 1000).
usage: python3 tools/v111_proof.py [pair|all]
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import render_v9 as R9  # noqa: E402

DEMOS = Path('/workspace/demos/halloween-escape-series')
OUT = DEMOS/'jr-v11.1'
SER = ROOT/'web3d/shibuya/series/variants/jr'
BEFORE = {'ja': lambda p: DEMOS/('jr-v11-en/ja-zone-fix/zone.mp4' if p == 'zone' else f'jr-v10.2/{p}.mp4'),
          'en': lambda p: DEMOS/f'jr-v11-en/{p}.mp4'}
GHOST = {'ja': SER/'v10/ghost.json', 'en': SER/'v11en/ghost.json'}
# (beat, fraction of the beat | 'ghost' = the middle of the beat's ghost line, label)
COMMON = [('goodbye', .8, 'end-card-enclosure')]
SCENES = {
    'gate': [('over-move', .62, 'over-move-uturn-normal-day'), ('over-move', 'ghost', 'over-move-ghost'), ('over-result', .85, 'over-result-2024-closure'),
             ('over-lesson', .6, 'lesson-normal-day'), ('clear-cheat', .6, 'cheat-normal-day')],
    'taxi': [('over-result', .55, 'over-result-yuryo-stand'), ('over-lesson', .6, 'lesson-yuryo-stand'), ('retry-why', 'ghost', 'retry-why-ghost-2025')],
    'zone': [('over-result', .3, 'over-result-vehicle-checks'), ('over-result', 'ghost', 'over-result-ghost-crowds'), ('sim-pick', .85, 'sim-pick-row-crowded'),
             ('crush-pov', .3, 'crush-pov-one-line'), ('over-lesson', 'ghost', 'over-lesson-ghost'), ('retry-why', .6, 'retry-why-vehicle-limits'),
             ('retry-why', 'ghost', 'retry-why-ghost'), ('clear-choice', .9, 're-run-row-crowded')],
    'alt': [('over-start', .2, 'mission-osaki'), ('clear-cheat', .6, 'cheat-osaki')],
}
EN_ONLY = [('sim-pick', .8, 'sim-pick-score-en'), ('over-start', .7, 'header-title'), ('op-fly', .5, 'signage-city'), ('rules', .6, 'signage-rules')]


def timeline(pair):
    tl = R9.timeline(pair); off = {'opening': 0, 'body': tl['parts']['opening']['beats'][-1]['f1']}; beats = {}
    for part in ('opening', 'body'):
        for b in tl['parts'][part]['beats']: beats[b['id']] = (off[part]+b['f0'], off[part]+b['f1'])
    return beats


def shots(pair, lang):
    beats = timeline(pair); g = json.loads(GHOST[lang].read_text(encoding='utf-8'))['pairs'][pair]['lines']
    out = []
    for b, fr, lab in COMMON+SCENES[pair]+(EN_ONLY if lang == 'en' else []):
        if fr == 'ghost':
            ln = next(l for l in g if l['beat'] == b); t = (ln['t0']+ln['t1'])/2+.25
        else:
            t = (beats[b][0]+(beats[b][1]-beats[b][0])*fr)/R9.FPS
        out.append((lab, t))
    return out


def grab(video, t, out):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(video), '-frames:v', '1', str(out)], check=True)


def side(a, b, t, title, out):
    W, H, BAR = 540, 960, 40
    im = Image.new('RGB', (2*W, H+BAR), (16, 10, 24)); d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 20)
    except OSError: f = ImageFont.load_default()
    for i, (src, lab) in enumerate(((a, 'BEFORE'), (b, 'AFTER v11.1'))):
        im.paste(Image.open(src).convert('RGB').resize((W, H)), (i*W, BAR))
        d.text((i*W+10, 8), f'{lab}  {title}  t={t:.2f}s', fill=(255, 210, 63) if i else (200, 200, 200), font=f)
    im.save(out)


def main(argv):
    pairs = R9.PAIRS if not argv or argv[0] == 'all' else [argv[0]]
    d = OUT/'proof'; d.mkdir(parents=True, exist_ok=True); n = 0
    with tempfile.TemporaryDirectory() as tmp:
        for lang in ('ja', 'en'):
            for p in pairs:
                after, before = OUT/lang/f'{p}.mp4', BEFORE[lang](p)
                if not after.exists(): print('missing', after); continue
                for i, (lab, t) in enumerate(shots(p, lang)):
                    a, b = Path(tmp)/'a.png', Path(tmp)/'b.png'
                    grab(before, t, a); grab(after, t, b)
                    side(a, b, t, f'{lang} {p} {lab}', d/f'{lang}-{p}-{i:02d}-{lab}.png'); n += 1
                print(lang, p, len(shots(p, lang)), 'stills', flush=True)
    print(n, 'proof stills →', d)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
