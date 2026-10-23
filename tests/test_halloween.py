"""Halloween night mode: solver checks, recorder contract and the on-screen number checks."""
import importlib.util
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def recorder():
    spec = importlib.util.spec_from_file_location('record_shibuya', ROOT/'tools/record_shibuya.py')
    rec = importlib.util.module_from_spec(spec); spec.loader.exec_module(rec)
    return rec


def test_halloween_and_dispersal_solvers():
    # Density bounds, no relocation, HUD counts = recounts, dispersal numbers = recounts,
    # and the comparison the video shows (see web3d/shibuya/verify-halloween.mjs).
    out = subprocess.run(['node', str(ROOT/'web3d/shibuya/verify-halloween.mjs')], check=True, timeout=1500, capture_output=True, text=True).stdout
    assert 'PASS Halloween' in out and 'PASS dispersal' in out
    # Per-exit counters (people and densest cell per exit zone) equal recounts every 5 s.
    assert 'PASS exits' in out


def test_halloween_recording_contract():
    rec = recorder()
    director = (ROOT/'web3d/shibuya/director-halloween.mjs').read_text()
    assert f'SCENE_SECONDS={rec.H_SCENE_SECONDS},CREDIT_SECONDS={rec.H_CREDIT_SECONDS}' in director
    assert 30 <= rec.H_SCENE_SECONDS + rec.H_CREDIT_SECONDS <= 45
    split = [float(x) for x in re.search(r'const SPLIT=\[([\d.]+),([\d.]+)\]', director).groups()]
    value = lambda v: split[int(v[6])] if v.startswith('SPLIT[') else float(v)
    shots = {name: value(t0) for name, t0 in re.findall(r"name:'(\w+)',t0:(SPLIT\[\d\]|[\d.]+)", director)}
    assert shots['hook'] == 0 and shots['dispersal'] < shots['results'] < rec.H_SCENE_SECONDS
    assert list(shots) == ['hook', 'establish', 'street', 'dj', 'release', 'dispersal', 'exits', 'results', 'question']
    assert shots['hook'] < 2.5 <= shots['establish']  # the hook (headline number) is on screen from frame 0
    for t, ja, en in rec.H_CAPTIONS:
        if f"cap:['{en}','{ja}']" in director:
            assert re.search(rf"t0:{t:g},[^\n]*cap:\['{re.escape(en)}','{re.escape(ja)}'\]", director)
    script = (ROOT/'tools/record_shibuya.py').read_text()
    assert rec.H_LANGS == ('ja', 'en') and rec.lang_path(Path('a/x.mp4'), 'en') == Path('a/x-en.mp4')
    assert "mode=halloween&record=1&cam=cinema" in script and 'check_overlay(ov)' in script and 'time.time()' not in script
    # Normal mode stays on its own director and constants.
    assert rec.SCENE_SECONDS == 39 and rec.CREDIT_SECONDS == 5


def overlay(rec, **change):
    ov = {'shown': {'agents': '48,000', 'crossing': '1,234', 'queued': '567', 'held': '2,001', 'peak': '3.9', 'median': '1.4'},
          'source': {'agents': 48000, 'crossing': 1234, 'queued': 567, 'held': 2001, 'peak': 3.94, 'median': 1.36}}
    side = lambda rem: {'remaining': rec.fmt(rem), 'inside': '0', 'densNow': '4.8', 'peak': '4.9', 'crush': '5,321', 'cars': '10:55',
                        'src': {'remaining': rem, 'inside': 0, 'densNow': 4.78, 'peak': 4.89, 'crush': 5321.2, 'cars': 655.2}}
    ov['split'] = {'clock': '+25:00', 'A': side(3113), 'B': side(0), 'heldB': '0', 'source': {'time': 1500, 'timeB': 1500, 'heldB': 0},
                   'chips': {'A': [{'key': 'hachiko', 'people': '1,204', 'src': 1204}], 'B': [{'key': 'hachiko', 'people': '0', 'src': 0}]}}
    ov['hook'] = {'n': '18,000', 'line': {'agents': '48,000', 'peak': '3.9', 'held': '2,001'}, 'source': {'n': 18000, 'agents': 48000, 'peak': 3.94, 'held': 2001}}
    ex = lambda c, p: {'clearAt': c, 'peakRun': p}
    ov['board'] = {'rows': [{'key': 'hachiko', 'A': {'clear': 'not cleared · 未解消', 'peak': '4.6'}, 'B': {'clear': '03:12', 'peak': '3.0'}, 'src': {'A': ex(None, 4.62), 'B': ex(192.3, 3.01)}},
                            {'key': 'markcity', 'A': {'clear': 'never dense · 密集なし', 'peak': '1.1'}, 'B': {'clear': '00:00', 'peak': '2.5'}, 'src': {'A': ex(0, 1.1), 'B': ex(0, 2.5)}}]}
    ov['question'] = {'slowest': {'A': 'hachiko', 'B': 'scramble'}, 'clear': {'A': 'not cleared · 未解消', 'B': '13:14'},
                      'source': {'A': [{'key': 'hachiko', **ex(None, 4.6)}, {'key': 'scramble', **ex(None, 4.1)}], 'B': [{'key': 'hachiko', **ex(192, 3)}, {'key': 'scramble', **ex(794.2, 4.1)}]}}
    for path, value in change.items():
        target = ov
        keys = path.split('__')
        for k in keys[:-1]: target = target[k]
        target[keys[-1]] = value
    return ov


def test_overlay_numbers_must_match_the_solver():
    rec = recorder()
    rec.check_overlay(overlay(rec))
    bad_chip = overlay(rec); bad_chip['split']['chips']['A'][0]['people'] = '1,200'
    bad_board = overlay(rec); bad_board['board']['rows'][0]['B']['clear'] = '03:00'
    bad_never = overlay(rec); bad_never['board']['rows'][1]['B']['clear'] = 'never dense · 密集なし'  # peak 2.5 > 2: it was dense
    bad_slow = overlay(rec); bad_slow['question']['slowest']['B'] = 'hachiko'
    bad_hook = overlay(rec); bad_hook['hook'] = {**bad_hook['hook'], 'n': '48,000', 'source': {**bad_hook['hook']['source'], 'n': 48000}}  # headline must be the cited estimate
    for ov in (bad_chip, bad_board, bad_never, bad_slow, bad_hook):
        with pytest.raises(AssertionError):
            rec.check_overlay(ov)
    for bad in ({'shown__held': '2,000'}, {'shown__peak': '4.0'}, {'split__A__remaining': '3,000'}, {'split__clock': '+24:59'}, {'split__B__cars': '00:01'}, {'hook__line__held': '2,000'}):
        with pytest.raises(AssertionError):
            rec.check_overlay(overlay(rec, **bad))
    assert rec.mmss(655.2) == '10:55' and rec.p2(4.75) in ('4.8', '4.7') and rec.fmt(16000) == '16,000'


def test_formats_match_the_browser():
    # The browser's formatters (halloween-app.mjs) and the recorder's checks agree.
    script = "import('./web3d/shibuya/halloween-app.mjs').then(m=>console.log(JSON.stringify([m.fmt(16000),m.fmt(3112.6),m.p2(4.888),m.p2(0),m.mmss(655.2),m.mmss(null)])))"
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    rec = recorder()
    assert out.strip() == '["16,000","3,113","4.9","0.0","10:55",null]'
    assert [rec.fmt(16000), rec.fmt(3112.6), rec.p2(4.888), rec.p2(0), rec.mmss(655.2), rec.mmss(None)] == ['16,000', '3,113', '4.9', '0.0', '10:55', None]


def test_normal_mode_does_not_load_halloween_code():
    app = (ROOT/'web3d/shibuya/app.mjs').read_text()
    assert "params.get('mode')==='halloween'?await import('./halloween-app.mjs'):null" in app
    assert not re.search(r"^import .*halloween", app, re.M)


def test_exit_zones_and_formats_match_the_browser():
    # The browser's exit-board wording and the recorder's check agree; zones are the solver's.
    script = ("Promise.all([import('./web3d/shibuya/halloween-app.mjs'),import('./web3d/shibuya/dispersal.mjs')]).then(([m,d])=>console.log(JSON.stringify(["
              "m.exitClearText({clearAt:null,peakRun:4}),m.exitClearText({clearAt:0,peakRun:1.2}),m.exitClearText({clearAt:0,peakRun:2.5}),m.exitClearText({clearAt:794.2,peakRun:4}),"
              "d.DISPERSAL.exitClear,d.DISPERSAL.exits.map(e=>e.key)])))")
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    import json
    got = json.loads(out)
    rec = recorder()
    ex = lambda c, p: {'clearAt': c, 'peakRun': p}
    assert got[:4] == [rec.exit_clear_text(ex(None, 4)), rec.exit_clear_text(ex(0, 1.2)), rec.exit_clear_text(ex(0, 2.5)), rec.exit_clear_text(ex(794.2, 4))]
    assert got[4] == rec.EXIT_CLEAR
    assert got[5] == ['hachiko', 'miyamasuzaka', 'shinminami', 'hikarie', 'markcity', 'scramble']


def test_headline_estimate_is_cited():
    # The 2026 headline number is a cited public estimate (not a sim count), and the docs cite it.
    src = (ROOT/'web3d/shibuya/sources-halloween.mjs').read_text()
    rec = recorder()
    assert f'estimate:{rec.ESTIMATE_2026},' in src
    urls = set(re.findall(r"url:'(https://[^']+)'", src))
    assert len(urls) >= 3
    docs = (ROOT/'docs/HALLOWEEN.md').read_text() + (ROOT/'README.md').read_text() + (ROOT/'README.en.md').read_text()
    for url in urls:
        assert url in (ROOT/'docs/HALLOWEEN.md').read_text(), url
    assert '推計' in (ROOT/'README.md').read_text() and 'estimate' in (ROOT/'README.en.md').read_text()
    assert 'sim assumption' in docs and 'シミュレーション上の仮定' in docs


def test_vertical_cut_numbers_come_from_the_frame_log(tmp_path):
    # tools/compose_vertical.py draws per-exit numbers only from frames.jsonl (solver values
    # logged by the recorder for that frame), formatted like the browser.
    spec = importlib.util.spec_from_file_location('compose_vertical', ROOT/'tools/compose_vertical.py')
    cv = importlib.util.module_from_spec(spec); spec.loader.exec_module(cv)
    rec = {'t': 20.0, 'shot': 'dispersal', 'clock': 125.4, 'remaining': {'A': 12813, 'B': 13624},
           'exits': {'A': [['hachiko', 431, 4.2, 4.6, None]], 'B': [['hachiko', 548, 1.9, 2.3, 96.0]]}}
    rows = cv.exit_rows(rec, 'en')
    assert rows == [('Hachiko exit', '431', '548', 4.2, 1.9)]
    assert cv.exit_rows(rec, 'ja')[0][0] == 'ハチ公口'
    assert cv.exit_rows({'t': 1, 'shot': 'hook'}, 'en') == []
