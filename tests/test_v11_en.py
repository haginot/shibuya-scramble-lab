"""JR v11-en: the English edition (logs/ssl-claude-halloween/v11-en/brief.md) — every on-screen string has an EN entry and
nothing Japanese reaches the EN screen, EN text fits its box (browser measureFit logs of the EN renders / probes), the ghost's
EN lines keep the bubble rules and their boxes stay clear (protect / core / overlap 0), no forbidden names anywhere in the EN
text, the fiction word only on the cold open, the JP HUD unchanged vs v10.2 (except the zone wrap fix), deliverables (skipped
until rendered)."""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
SER = ROOT/'web3d/shibuya/series'
EN = json.loads((SER/'i18n/en.json').read_text(encoding='utf-8'))
GH = json.loads((SER/'variants/jr/v11en/ghost.json').read_text(encoding='utf-8'))
G10 = json.loads((SER/'variants/jr/v10/ghost.json').read_text(encoding='utf-8'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
WORK11 = Path('/workspace/projects/logs/ssl-claude-halloween/v11-en/render')
OUT = Path('/workspace/demos/halloween-escape-series/jr-v11-en')
CJK = re.compile(r'[　-ヿ㐀-鿿＀-￯]')
FIT_FREE = {'footnote', 'sources', 'simpanel'}
cc = lambda *c: ''.join(map(chr, c))
BANNED = re.compile('|'.join([cc(101, 110, 97, 98, 108, 101)+r'\s*'+cc(120), cc(0x30AB, 0x30F3, 0x30EA, 0x30FC), cc(99, 97, 110)+'-?'+cc(108, 121)]), re.I)


@pytest.fixture(scope='module')
def strings(tmp_path_factory):
    out = tmp_path_factory.mktemp('v11')/'s.json'
    r = subprocess.run(['node', 'tools/v11_strings.mjs', '--json', str(out), '--stride', '6'], cwd=ROOT, capture_output=True, text=True)
    return r, json.loads(out.read_text(encoding='utf-8'))


def test_en_json_generated():
    assert subprocess.run([sys.executable, 'tools/v11_en_dict.py', '--check'], cwd=ROOT).returncode == 0


def test_every_string_translated_nothing_leaks(strings):
    r, s = strings
    assert r.returncode == 0, r.stdout
    assert s['missing'] == [] and s['leak'] == []


def test_fiction_word_on_the_cold_open_only(strings):
    _, s = strings
    assert s['fiction'] and all(w.startswith('opening:') for w in s['fiction']), s['fiction']
    hits = [k for k, v in EN['exact'].items() if re.search('fiction', v, re.I)]
    assert hits == ['フィクション'], hits          # the FICTION tag of the mission card; never in the end card / sources notes


def test_en_text_values():
    vals = list(EN['exact'].values())+[b for _, b in EN['patterns']]
    for v in vals:
        assert not CJK.search(v), v
        assert not BANNED.search(v), v
    # facts: every number of a JP entry reappears in its EN text (dates / times / counts unchanged)
    MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
    for k, v in EN['exact'].items():
        jp = re.sub(r'(\d{1,2})/(\d{1,2})(?!\d)', lambda m: f'{MON[int(m[1])-1]} {m[2]}' if 1 <= int(m[1]) <= 12 else m[0], k)    # 10/25 → Oct 25
        jp = re.sub(r'(\d{1,2})月', lambda m: MON[int(m[1])-1] if 1 <= int(m[1]) <= 12 else m[0], jp).replace('1つ', '')           # 2025年1月 → Jan; 「1つ」
        jp = re.sub(r'(\d{4})/(Oct|Nov|Dec|Jan) (\d+)', lambda m: f'{m[1]}/{MON.index(m[2])+1}/{m[3]}', jp)   # 2026/10/22 kept
        has = lambda t: all(n in v or n in v.replace(',', '') for n in re.findall(r'\d+(?:[.,:]\d+)*|' + '|'.join(MON), t))
        assert has(jp) or has(k.replace('1つ', '')), (k, v)
    # SIMULATION: every JP sim label keeps the label in EN
    for k, v in EN['exact'].items():
        if 'シミュレーション' in k: assert 'SIM' in v.upper(), (k, v)


def test_line_lengths_static():
    """EN lines of the boxed captions / chips are not wider than ~3× their JP line (in full-width cells) + 12 (the measured
    browser check below is the authority; this catches a regression without a render)."""
    for k, v in EN['exact'].items():
        jl, el = k.split('\n'), v.split('\n')
        assert len(el) <= len(jl)+1, (k, v)
        if len(jl) == len(el) and len(k) < 60 and len(k) > 4:
            for a, b in zip(jl, el): assert len(b) <= 3*len(a)+12, (a, b)


def _fit_logs():
    return [f for f in WORK11.rglob('*.jsonl')] if WORK11.exists() else []


@pytest.mark.skipif(not _fit_logs(), reason='no EN renders / probes yet')
def test_rendered_text_fits():
    n = 0
    for f in _fit_logs():
        for line in f.open(encoding='utf-8'):
            r = json.loads(line); fit = r.get('fit')
            if fit is None: continue
            n += 1
            assert not fit['cjk'], (f, r['frame'], fit['cjk'])
            assert not [w for w in fit['wraps'] if w['c'] not in FIT_FREE], (f, r['frame'], fit['wraps'])
            assert not fit['over'], (f, r['frame'], fit['over'])
    assert n > 0


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_en_lines(pair):
    import v11_ghost as V
    lines = GH['pairs'][pair]['lines']; jp = G10['pairs'][pair]['lines']
    assert len(lines) == len(jp) and [l['t0'] for l in lines] == sorted(l['t0'] for l in jp)
    intro = [l for l in lines if l.get('intro')]
    assert len(intro) == 2 and 'Shibuya-kei Ghost' in intro[0]['text']
    for l in lines:
        V.check_text(l['text'], width=False)
        assert l['bubble'][2]-l['bubble'][0] <= GH['rules']['jpMaxWidth'], l['text']
        assert l['t1'] >= l['jp_t1'] and l['t1']-l['t0'] >= V.read_time(l['text'])-1e-6
        assert not BANNED.search(l['text']) and not CJK.search(l['text'])
        for n in l['nums']: assert n['quote_en'] in l['text']
        # protect 0 always; HUD core / dilated overlap 0 except where the JP v10.2 ghost has the same exception (v9_ghost
        # ALLOW_OVERLAP: the full sim map of sim-pick / over-choice; clear-cheat: the dilated margin only, core 0)
        assert l['protect'] == 0, l['beat']
        assert l['core'] == 0 or l['beat'] in V.G9.ALLOW_OVERLAP, (l['beat'], l['core'])
        assert l['overlap'] == 0 or l['beat'] in V.G9.ALLOW_OVERLAP or (l['beat'] == 'clear-cheat' and l['core'] == 0), (l['beat'], l['overlap'])
    for a, b in zip(lines, lines[1:]): assert b['t0']-a['t1'] >= .2-1e-6


def test_logo_en():
    d = json.loads((ROOT/'web3d/data/logo_glyphs_en.json').read_text(encoding='utf-8'))
    assert d['lang'] == 'en' and not any(CJK.search(v) for v in d['text'].values())
    assert {i['char'] for i in d['items'] if i['group'] == 'title'} <= set('ESCAPEFROMHALLOWNSIBUY!')
    ja = json.loads((ROOT/'web3d/data/logo_glyphs.json').read_text(encoding='utf-8'))
    assert 'lang' not in ja and ja['text']['title'] == 'ハロウィンの渋谷を脱出せよ！'


def test_no_forbidden_names_in_v11_files():
    files = [SER/'i18n/en.json', SER/'i18n/i18n.mjs', SER/'variants/jr/v11en/ghost.json', ROOT/'docs/V11-EN.md',
             *[ROOT/'tools'/f for f in ('v11_en_dict.py', 'v11_ghost.py', 'v11_render.py', 'v11_composite.py', 'v11_finish.py', 'v11_strings.mjs', 'v11_report.py')]]
    for f in files:
        if f.exists(): assert not BANNED.search(f.read_text(encoding='utf-8')), f


def test_jp_hud_unchanged_vs_v102(tmp_path):
    """JP HUD html of every 15th frame state, this tree vs commit 7ec8667 (v10.2): identical except the zone wrap fix."""
    if subprocess.run(['git', 'cat-file', '-e', '7ec8667'], cwd=ROOT).returncode: pytest.skip('v10.2 commit not available')
    old = tmp_path/'old'; old.mkdir()
    p = subprocess.Popen(['git', 'archive', '7ec8667', 'web3d/shibuya/series', 'web3d/shibuya/sources-halloween.mjs'], cwd=ROOT, stdout=subprocess.PIPE)
    subprocess.run(['tar', '-x', '-C', str(old)], stdin=p.stdout, check=True); p.wait()
    a, b = tmp_path/'a.json', tmp_path/'b.json'
    subprocess.run(['node', 'tools/v11_strings.mjs', '--ja-html', str(a), '--stride', '15'], cwd=ROOT, check=True, env={'SERIES': str(old/'web3d/shibuya/series'), 'PATH': '/usr/bin:/usr/local/bin:/bin'}, capture_output=True)
    subprocess.run(['node', 'tools/v11_strings.mjs', '--ja-html', str(b), '--stride', '15'], cwd=ROOT, check=True, capture_output=True)
    A, B = json.loads(a.read_text()), json.loads(b.read_text())
    diff = [k for k in A if A[k] != B.get(k)]
    assert len(A) == len(B) > 900
    assert diff and all(k.startswith('zone/body/') and 1245 <= int(k.split('/')[-1]) < 1485 for k in diff), diff
    assert all('スクランブル交差点：一歩も進めない' in B[k] for k in diff)


@pytest.mark.parametrize('pair', PAIRS)
def test_deliverables(pair):
    f, s = OUT/f'{pair}.mp4', OUT/f'{pair}-share.mp4'
    if not s.exists(): pytest.skip('not rendered yet')
    rep = json.loads((WORK11/pair/'report.json').read_text(encoding='utf-8'))
    assert rep['ok'] and rep['duration'] == pytest.approx(121.7, abs=.05) and -15 <= rep['lufs'] <= -13 and rep['true_peak'] <= -1.0
    assert s.stat().st_size < 200*2**20 and (OUT/f'{pair}-contact.jpg').exists()
