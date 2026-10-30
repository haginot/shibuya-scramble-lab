#!/usr/bin/env python3
"""JR v11.1 report data (no hand-kept tables): every changed on-screen string BEFORE → AFTER per pair / beat / language
(configs: tools/v10_configs.mjs V111 records; ghost lines: v10/ghost.json + v11en/ghost.json vs commit 0aab2b4; EN table:
i18n/en.json vs 0aab2b4; the zone sim label), the text-fit / no-CJK scans of every v11.1 frame log (EN: DOM + CSS + canvas;
JP: wraps / overflow of the rebuilt beats), the ghost box checks of the changed lines, and the deliverables (ffprobe, size,
loudness). Writes the generated part of docs/V11.1.md between the GENERATED markers (and copies the doc to the demo dir).
usage: python3 tools/v111_report.py
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from v11_report import probe, md_cell  # noqa: E402

SER = 'web3d/shibuya/series'
BASE = '0aab2b4'
PAIRS = ('gate', 'taxi', 'zone', 'alt')
LOGS = Path('/workspace/projects/logs/ssl-claude-halloween/v11.1')
OUT = Path('/workspace/demos/halloween-escape-series/jr-v11.1')
DOC = ROOT/'docs/V11.1.md'
FIT_FREE = {'footnote', 'sources', 'simpanel'}


def cur(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def old(rel): return json.loads(subprocess.run(['git', 'show', f'{BASE}:{rel}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout)


def changes():
    rows = []
    en0, en1 = old(f'{SER}/i18n/en.json')['exact'], cur(f'{SER}/i18n/en.json')['exact']
    for p in PAIRS:
        c = cur(f'{SER}/variants/jr/v10/{p}.json')
        for f in c['v111']['fixes']:
            if f['path'].endswith('.en') or f['path'].endswith('factIds') or not isinstance(f['from'], str) or f['path'].endswith('summary') or f['path'] == 'lesson.ja': continue   # lesson.ja = the points joined
            where = f['path'].replace('@', '').replace('.hud.', ' hud[').replace('.ja', '').replace('.text', '')
            where = re.sub(r'hud\[(\d+)', r'hud[\1]', where)
            rows.append(('JP', p, where, f['from'], f['to']))
            rows.append(('EN', p, where, en0.get(f['from'], '?'), en1.get(f['to'], '?')))
    rows.append(('JP', 'zone', 'sim panel row A (sim-plan / sim-pick / retry / re-run)', '赤枠内を長く歩く（規制の可能性）', '混雑する赤枠内を長く歩く'))
    rows.append(('EN', 'zone', 'sim panel row A (sim-plan / sim-pick / retry / re-run)', en0['赤枠内を長く歩く（規制の可能性）'], en1['混雑する赤枠内を長く歩く']))
    for lang, rel in (('JP', f'{SER}/variants/jr/v10/ghost.json'), ('EN', f'{SER}/variants/jr/v11en/ghost.json')):
        g0, g1 = old(rel), cur(rel)
        for p in PAIRS:
            for a, b in zip(g0['pairs'][p]['lines'], g1['pairs'][p]['lines']):
                if a['text'] != b['text']: rows.append((lang, p, f"ghost {b['beat']}", a['text'], b['text']))
    # EN-only rewordings of unchanged JP strings (title, closure wording)
    for k, v in en1.items():
        if k in en0 and en0[k] != v: rows.append(('EN', 'all' if k == 'ハロウィンの渋谷を脱出せよ！' else 'zone', f'EN table 「{k}」'.replace('\n', '／'), en0[k], v))
    rows.append(('EN', 'all', 'sim table RISK column (CSS label)', 'スコア 4:05', 'Score 4:05'))
    rows.append(('JP', 'all', 'goodbye quote, small EN sub-line (JP card; 2 lines → 1 line, 14.5 px)',
                 'Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance. (Shibuya City)',
                 'Near Shibuya Sta.: drinking, smoking, littering banned by ordinance. (Shibuya City)'))
    rows.append(('EN', 'all', 'header title size (every frame; was clipped at the right frame edge)', 'ESCAPE FROM HALLOWEEN SHIBUYA! 27 px (x 63–727 of 720)',
                 'ESCAPE FROM HALLOWEEN SHIBUYA! 22.5 px (ends ≈ x 616)'))
    return rows


def fit_scan(work, lang):
    st = dict(files=0, frames=0, cjk=0, canvas=0, wraps=0, over=0, free_wraps=0, by_kind={}, examples=[])
    if not work.exists(): return st
    for f in sorted(work.rglob('*.jsonl')):
        kind = 'cg' if '/cg/' in str(f) else 'probe' if '/probe/' in str(f) else 'hud'
        st['files'] += 1; k = st['by_kind'].setdefault(kind, 0)
        for line in f.open(encoding='utf-8'):
            r = json.loads(line); fit = r.get('fit')
            if fit is None: continue
            st['frames'] += 1; st['by_kind'][kind] += 1
            hard = [w for w in fit['wraps'] if w['c'] not in FIT_FREE]
            st['wraps'] += bool(hard); st['over'] += bool(fit['over']); st['free_wraps'] += len(fit['wraps'])-len(hard)
            if lang == 'en':
                st['cjk'] += bool(fit['cjk']); st['canvas'] += bool(fit.get('canvas')) + ('canvas' not in fit)
            if (hard or fit['over'] or (lang == 'en' and (fit['cjk'] or fit.get('canvas')))) and len(st['examples']) < 5:
                st['examples'].append((str(f.relative_to(work)), r['frame'], hard[:1], fit['over'][:1], fit['cjk'][:2], fit.get('canvas', [])[:2]))
    return st


def ghost_checks():
    rows = []
    for lang, rel in (('JP', f'{SER}/variants/jr/v10/ghost.json'), ('EN', f'{SER}/variants/jr/v11en/ghost.json')):
        g0, g1 = old(rel), cur(rel)
        for p in PAIRS:
            for a, b in zip(g0['pairs'][p]['lines'], g1['pairs'][p]['lines']):
                if a['text'] != b['text'] or a.get('box') != b.get('box'):
                    rows.append((lang, p, b['beat'], b['text'], b.get('protect'), b.get('core'), b.get('overlap'), b.get('box') != a.get('box')))
    return rows


def build():
    L = ['<!-- GENERATED by tools/v111_report.py: do not edit between the markers -->', '',
         '### Every changed string (BEFORE → AFTER)', '| lang | pair | where | before | after |', '|---|---|---|---|---|']
    for lang, p, w, a, b in changes(): L.append(f'| {lang} | {p} | {md_cell(w)} | {md_cell(a)} | {md_cell(b)} |')
    L += ['', '### Text fit / no-Japanese-in-EN scans (every frame the v11.1 recorder rendered)']
    for lang, work in (('EN', LOGS/'render-en'), ('JP', LOGS/'render-ja')):
        s = fit_scan(work, lang.lower())
        L.append(f"- **{lang}** ({work.name}): {s['frames']} frames in {s['files']} logs ({', '.join(f'{k} {v}' for k, v in s['by_kind'].items())}): "
                 + (f"CJK in DOM/CSS **{s['cjk']}**, CJK canvas text **{s['canvas']}**, " if lang == 'EN' else '')
                 + f"automatic wrap outside paragraph boxes **{s['wraps']}**, overflow **{s['over']}** (paragraph-box wraps, allowed: {s['free_wraps']})."
                 + (f" Examples: {s['examples']}" if s['examples'] else ''))
    L += ['', '### Ghost lines re-checked (changed text or box)', '| lang | pair | beat | line | protect | core | overlap | moved |', '|---|---|---|---|---|---|---|---|']
    for r in ghost_checks(): L.append('| '+' | '.join(md_cell(str(x)) for x in r)+' |')
    L += ['', '### Deliverables', '| file | duration (s) | size (MB) | integrated (LUFS) | true peak (dBTP) |', '|---|---|---|---|---|']
    for lang in ('ja', 'en'):
        for p in PAIRS:
            for n in (f'{p}.mp4', f'{p}-share.mp4'):
                f = OUT/lang/n
                if f.exists():
                    d = probe(f); L.append(f"| `{lang}/{n}` | {d['duration']} | {d['mb']} | {d['lufs']} | {d['tp']} |")
    L += ['', '<!-- /GENERATED -->']
    return '\n'.join(L)


def main():
    txt = DOC.read_text(encoding='utf-8')
    a, b = txt.index('<!-- GENERATED'), txt.index('<!-- /GENERATED -->')+len('<!-- /GENERATED -->')
    DOC.write_text(txt[:a]+build()+txt[b:], encoding='utf-8')
    OUT.mkdir(parents=True, exist_ok=True); shutil.copy(DOC, OUT/'v11.1.md')
    print('wrote', DOC, OUT/'v11.1.md'); return 0


if __name__ == '__main__':
    sys.exit(main())
