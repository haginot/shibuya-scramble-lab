#!/usr/bin/env python3
"""JR v7 finish: audio (v7 cue sheet → procedural mix at −14 LUFS), mux, verify, contact sheet.

Cue sheet = the v7 timeline's cues (tools/variant_cues.mjs, same beats/cues as v6) with two v7 edits:
  * every CG↔photoreal switch (tools/v7_composite.py build_index cuts) gets its sound: `glitch` (RGB glitch cut) or `whoosh`
    (whip pan), placed so it peaks on the cut;
  * the caught beat drops the zombie groans (v7 shows no zombie: the caught sequence is a silhouette crowd pressing in);
    crowd_press / red_flash / caught_hit / cut_black stay.
usage: python3 tools/v7_finish.py audio|mux|verify|contact|all <pair>
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from render_v7 import WORK, timeline, build_index, FPS  # noqa: E402

OUT = Path(os.environ.get('OUT', '/workspace/demos/halloween-escape-series/jr-v7'))
DROP_CAUGHT = ('zombie_groan', 'zombie_groan_b')


def cues(pair):
    timeline(pair)
    c = json.loads((WORK/pair/'cues.json').read_text(encoding='utf-8'))
    _, idx, cuts = build_index(pair)
    c['events'] = [e for e in c['events'] if e.get('sfx') not in DROP_CAUGHT]
    for v, kind, a, b in cuts:
        t = v/FPS
        c['events'].append({'t': round(t-.05, 3), 'sfx': 'glitch', 'gain_db': 0} if kind == 'glitch' else
                           {'t': round(t-.32, 3), 'sfx': 'whoosh', 'gain_db': -2})
    c['events'].sort(key=lambda e: e['t'])
    c.setdefault('meta', {})['v7'] = {'switches': [dict(t=round(v/FPS, 3), kind=k, frm=a, to=b) for v, k, a, b in cuts],
                                      'dropped': list(DROP_CAUGHT)}
    p = WORK/pair/'cues-v7.json'; p.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding='utf-8')
    return p


def audio(pair):
    p = cues(pair)
    subprocess.run(['tools/audio/run.sh', 'mix', '--cues', str(p), '--out', str(WORK/pair/'mix.wav'), '--report', str(WORK/pair/'mix.json'), '--strict'],
                   cwd=ROOT, check=True)


def mux(pair):
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(['tools/audio/mux.sh', str(WORK/pair/'video.mp4'), str(WORK/pair/'mix.wav'), str(OUT/f'{pair}.mp4')], cwd=ROOT, check=True)


def probe(path):
    q = lambda *a: subprocess.run(['ffprobe', '-v', 'error', *a, str(path)], capture_output=True, text=True).stdout.strip()
    v = q('-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=width,height,pix_fmt,r_frame_rate,nb_read_packets,codec_name', '-of', 'json')
    a = q('-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json')
    d = q('-show_entries', 'format=duration', '-of', 'csv=p=0')
    return json.loads(v)['streams'][0], json.loads(a)['streams'][0], float(d)


def loudness(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', str(path), '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = r[r.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1)); TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
    return I, TP


def verify(pair):
    f = OUT/f'{pair}.mp4'
    v, a, d = probe(f); I, TP = loudness(f)
    rep = dict(file=str(f), duration=d, video=v, audio=a, lufs=I, true_peak=TP)
    errs = []
    if (v['width'], v['height'], v['pix_fmt'], v['r_frame_rate']) != (1080, 1920, 'yuv420p', '30/1'): errs.append('video format')
    if int(v['nb_read_packets']) != 2646: errs.append(f"frames {v['nb_read_packets']} != 2646")
    if (a['codec_name'], a['sample_rate'], a['channels']) != ('aac', '48000', 2): errs.append('audio format')
    if not -15.0 <= I <= -13.0: errs.append(f'loudness {I}')
    if TP > -1.0: errs.append(f'true peak {TP}')
    rep['errors'] = errs; rep['ok'] = not errs
    (WORK/pair/'report.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(rep, ensure_ascii=False))
    return 0 if not errs else 1


CONTACT = [(1.0, 'cold open (CG) フィクション'), (9.4, 'mission (CG)'), (11.15, 'GLITCH → photoreal'), (11.6, 'Hachiko-mae reveal'),
           (17.0, 'first choice (photo)'), (21.0, 'TRUE END (CG, v6 design)'), (25.0, 'guide (photo)'), (28.0, 'map (CG)'),
           (35.5, 'over-move'), (39.5, 'over-result'), (42.6, 'caught: press'), (43.6, 'caught: dark'), (45.0, 'GAME OVER (v6)'),
           (48.5, 'lesson (photo)'), (52.0, 'CONTINUE? (photo)'), (56.0, 'map (CG)'), (60.5, 'clear-move'), (64.5, 'clear-result'),
           (67.5, 'GAME CLEAR (photo)'), (71.0, 'cheat (photo)'), (72.68, 'GLITCH → CG'), (74.9, 'kaiju beam (CG)'), (80.5, 'GOODBYE (v6)'), (86.5, 'sources + credits')]


def contact(pair):
    sys.path.insert(0, str(ROOT/'tools'))
    from record_variant import contact as mk
    mk(OUT/f'{pair}.mp4', OUT/f'{pair}-contact.jpg', CONTACT, cols=6)


def main(argv):
    cmd, pair = argv[0], argv[1]
    if cmd in ('audio', 'all'): audio(pair)
    if cmd in ('mux', 'all'): mux(pair)
    if cmd in ('contact', 'all'): contact(pair)
    if cmd in ('verify', 'all'): return verify(pair)
    if cmd == 'cues': print(cues(pair))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
