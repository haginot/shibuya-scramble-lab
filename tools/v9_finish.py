#!/usr/bin/env python3
"""JR v9 finish: audio (v9 cue sheet → procedural mix at −14 LUFS, true-peak ceiling as v6/v7/v8), mux, verify, contact sheet.

As tools/v8_finish.py for the v9 timeline (100–130 s): the crush POV beat brings its own cues (muffled crowd bed, heartbeat,
breathing, shoves; no BGM / ambience there), the contact sheet is laid out from the timeline beats.

Same as tools/v7_finish.py (switch SFX on every CG↔photo cut, no zombie groans), for the v8 timeline (< 100 s).

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
from render_v9 import WORK, timeline, build_index, FPS, MAX_SECONDS  # noqa: E402

OUT = Path(os.environ.get('OUT', '/workspace/demos/halloween-escape-series/jr-v9'))
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
    # the ghost guide's 'voice': a few soft pitched blips as each speech bubble pops up (original synthesis, no TTS)
    G = json.loads((ROOT/'web3d/shibuya/series/variants/jr/v9/ghost.json').read_text(encoding='utf-8'))
    for i, ln in enumerate(G['pairs'][pair]['lines']):
        for k in range(min(5, 2+ln['chars']//6)):
            c['events'].append({'t': round(ln['t0']+.03+k*.085, 3), 'sfx': 'ghost_blip_'+'abcab'[(i+k) % 5], 'gain_db': 0})
    c['events'].sort(key=lambda e: e['t'])
    c.setdefault('meta', {})['v9'] = {'switches': [dict(t=round(v/FPS, 3), kind=k, frm=a, to=b) for v, k, a, b in cuts],
                                      'dropped': list(DROP_CAUGHT)}
    p = WORK/pair/'cues-v9.json'; p.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding='utf-8')
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
    tl, idx, _ = build_index(pair)
    if int(v['nb_read_packets']) != len(idx): errs.append(f"frames {v['nb_read_packets']} != {len(idx)}")
    if not 100 <= d < MAX_SECONDS: errs.append(f'duration {d} not in [100, {MAX_SECONDS})')
    if (a['codec_name'], a['sample_rate'], a['channels']) != ('aac', '48000', 2): errs.append('audio format')
    if not -15.0 <= I <= -13.0: errs.append(f'loudness {I}')
    if TP > -1.0: errs.append(f'true peak {TP}')
    rep['errors'] = errs; rep['ok'] = not errs
    (WORK/pair/'report.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(rep, ensure_ascii=False))
    return 0 if not errs else 1


# contact sheet: (beat, fraction of the beat, label) → time from the timeline
CONTACT = [('op-fly', .3, 'cold open (CG, costumes) フィクション'), ('mission', .6, 'mission (CG)'), ('rules', .1, 'GLITCH → photoreal'),
           ('rules', .4, 'Hachiko-mae reveal (costumes)'), ('first-choice', .5, 'first choice (photo)'), ('true-end', .6, 'TRUE END (CG)'),
           ('over-start', .5, 'start map (CG costumed crowd)'), ('sim-plan', .25, 'SIM: costumed agents + heat'),
           ('sim-plan', .85, 'SIM: rows live'), ('sim-pick', .7, 'SIM PICK'), ('over-choice', .75, 'gut pick (ignores sim)'),
           ('over-move', .5, 'over-move + meter'), ('over-result', .6, 'over-result + meter (press)'), ('crush-pov', .15, 'CRUSH POV'),
           ('crush-pov', .55, 'CRUSH POV 圧死危険'), ('crush-pov', .9, 'CRUSH POV peak'), ('caught', .55, 'caught (game zombies)'),
           ('over-stamp', .5, 'GAME OVER (v6)'), ('over-lesson', .5, 'lesson'), ('continue', .5, 'CONTINUE?'), ('retry-why', .6, 'why it failed (sim)'),
           ('clear-choice', .45, 're-run (sim)'), ('clear-choice', .9, 're-run pick'), ('clear-move', .5, 'clear-move'),
           ('clear-pov', .6, 'CLEAR POV (low density)'), ('clear-result', .5, 'clear-result + meter'), ('clear-stamp', .6, 'GAME CLEAR'),
           ('clear-cheat', .5, 'cheat sheet'), ('kaiju', .55, 'kaiju confetti (CG)'), ('goodbye', .5, 'GOODBYE (v6)'), ('sources', .6, 'sources + credits')]


def contact_times(pair):
    tl = timeline(pair)
    off = {'opening': 0, 'body': tl['parts']['opening']['frames'] if 'frames' in tl['parts']['opening'] else tl['parts']['opening']['beats'][-1]['f1']}
    beats = {}
    for part in ('opening', 'body'):
        for b in tl['parts'][part]['beats']: beats[b['id']] = (off[part]+b['f0'], off[part]+b['f1'])
    out = []
    for bid, fr, lab in CONTACT:
        if bid not in beats: continue
        f0, f1 = beats[bid]; t = (f0+(f1-f0)*fr)/FPS
        out.append((round(t, 2), f'{t:.1f}s {lab}'.split(' ', 1)[1]))
    return out


def contact(pair):
    sys.path.insert(0, str(ROOT/'tools'))
    from record_variant import contact as mk
    mk(OUT/f'{pair}.mp4', OUT/f'{pair}-contact.jpg', contact_times(pair), cols=6)


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
