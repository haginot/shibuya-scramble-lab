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
    # The video's two runs are the sensitivity sweep's base scenario (so the on-screen ranges
    # include the run that is shown).
    import json
    got = json.loads(out.strip().splitlines()[-1])
    base = next(q for q in sweep_file()['scenarios'] if q['key'] == 'base')
    for side, k in (('A', 'none'), ('B', 'managed')):
        assert got[side]['remaining'] == base[k]['remaining'] and got[side]['stationEmptyAt'] == base[k]['stationEmptyAt'], (side, got[side], base[k])


def test_halloween_recording_contract():
    # v4 "Escape Shibuya" (genre parody): cold-open parody broadcast, big title card, rules + GAME START, five 6 s levels
    # (route → result/VS beat), overview, GAME OVER (end-of-game title), question (+ end card).
    rec = recorder()
    director = (ROOT/'web3d/shibuya/director-halloween.mjs').read_text()
    assert f'SCENE_SECONDS={rec.H_SCENE_SECONDS},CREDIT_SECONDS={rec.H_CREDIT_SECONDS}' in director
    assert 30 <= rec.H_SCENE_SECONDS + rec.H_CREDIT_SECONDS <= 45
    out = subprocess.run(['node', '-e', "import('./web3d/shibuya/director-halloween.mjs').then(m=>console.log(JSON.stringify(m.SHOTS.map(s=>[s.name,s.t0,s.t1,s.level??null]))))"],
                         cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    import json
    shots = json.loads(out)
    assert [s[0] for s in shots] == ['broadcast', 'title', 'rules', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'overview', 'gameover', 'question']
    assert shots[0][1] == 0 and shots[1][1] <= 1.5 and shots[-1][2] == rec.H_SCENE_SECONDS
    for a, b in zip(shots, shots[1:]): assert a[2] == b[1], (a, b)  # no gaps
    levels = [s for s in shots if s[0].startswith('lv')]
    assert [s[3] for s in levels] == ['centergai', 'miyashita', 'hikarie', 'stream', 'dogenzaka']
    assert all(5.5 <= s[2]-s[1] <= 6.5 for s in levels)
    assert [(t, n) for t, n, _ in rec.H_SECTIONS] == [(s[1], s[0]) for s in shots]
    script = (ROOT/'tools/record_shibuya.py').read_text()
    assert rec.H_LANGS == ('ja', 'en') and rec.lang_path(Path('a/x.mp4'), 'en') == Path('a/x-en.mp4')
    assert "mode=halloween&record=1&cam=cinema" in script and 'check_overlay(ov)' in script and 'time.time()' not in script
    assert "window.__setVcut(true)" in script  # one capture: ja, en, ja-v, en-v screenshots of the same frame
    # Normal mode stays on its own director and constants.
    assert rec.SCENE_SECONDS == 39 and rec.CREDIT_SECONDS == 5


def escape_overlay(rec, **change):
    """A level frame as escape-overlay.mjs reports it (shown strings next to the solver values)."""
    src = {'arrived': True, 'arriveAt': 70.4, 'denseSeconds': 3.0, 'simTime': 75, 'simLimit': 192, 'denseMax': 30}
    ov = {'t': 10.8, 'title': {'card': False, 'header': True},
          'escape': {'level': 'centergai', 'timer': {'shown': 'SIM +01:10', 'src': {'simTime': 75, 'arrived': True, 'arriveAt': 70.4}},
                     'danger': {'shown': '2.4', 'level': 2, 'src': 2.44, 'srcLevel': 2},
                     'branches': [{'key': 'A', 'shown': {'walking': '3', 'arrived': '21', 'density': '1.8', 'badge': '✔'}, 'src': {'walking': 3, 'arrived': 21, 'density': 1.78, 'outcome': 'escaped'}},
                                  {'key': 'B', 'shown': {'walking': '24', 'arrived': '0', 'density': '3.8', 'badge': ''}, 'src': {'walking': 24, 'arrived': 0, 'density': 3.78, 'outcome': None}}],
                     'stamp': {'shown': 'escaped', 'visible': True, 'src': src},
                     'vs': {'rows': [{'key': 'A', 'example': True, 'edge': False, 'on': True, 'shown': {'time': '+01:10', 'dense': '', 'badge': '✔'}, 'src': {'arriveAt': 70.4, 'denseSeconds': 0, 'outcome': 'escaped', 'simTime': 230}},
                                     {'key': 'B', 'example': False, 'edge': False, 'on': True, 'shown': {'time': '+03:42', 'dense': '11', 'badge': '✔'}, 'src': {'arriveAt': 222.1, 'denseSeconds': 11, 'outcome': 'escaped', 'simTime': 230}},
                                     {'key': 'C', 'example': False, 'edge': True, 'on': False, 'shown': {'time': '', 'dense': '', 'badge': ''}, 'src': {'arriveAt': 307, 'denseSeconds': 0, 'outcome': 'escaped', 'simTime': 230}}],
                            'cmp': {'kind': 'slower', 'a': 'A', 'b': 'B', 'ratio': '3.2', 'src': {'a': 70.4, 'b': 222.1}}}},
          'claims': ['EXIT-09', 'EXIT-04'], 'footnote': ['EXIT-09', 'EXIT-04', 'ALT-01'],
          'labels': [{'id': 'centergai:start', 'x': 600, 'y': 140, 'box': {'x0': 480, 'x1': 720, 'y0': 110, 'y1': 140}}]}
    for path, value in change.items():
        target = ov
        keys = path.split('__')
        for k in keys[:-1]: target = target[int(k)] if isinstance(target, list) else target[k]
        target[keys[-1]] = value
    return ov


def test_escape_overlay_numbers_must_match_the_solver():
    rec = recorder()
    rec.check_overlay(escape_overlay(rec))
    rec.check_overlay({'t': 5, 'title': {'card': False, 'header': True}, 'mission': {'n': '18,000', 'src': 18000}})
    bad = [{'escape__timer__shown': 'SIM +01:15'}, {'escape__danger__shown': '2.5'}, {'escape__danger__level': 3},
           {'escape__stamp__shown': 'caught'}, {'claims': ['EXIT-09', 'MEAS-06']}, {'footnote': ['EXIT-09', 'EXIT-04', 'MEAS-14']},
           {'labels': [{'id': 'x', 'x': 1150, 'y': 300, 'box': {'x0': 1100, 'x1': 1200, 'y0': 280, 'y1': 300}}]},
           # anchor inside the 9:16 column but the label box runs off its right edge (e.g. 'Hikarie (Meiji-dori side')
           {'labels': [{'id': 'x', 'x': 1020, 'y': 300, 'box': {'x0': 905, 'x1': 1135, 'y0': 270, 'y1': 300}}]},
           {'labels': [{'id': 'x', 'x': 600, 'y': 300}]},  # no box
           {'title': {'card': False, 'header': False}}]
    for change in bad:
        with pytest.raises(AssertionError):
            rec.check_overlay(escape_overlay(rec, **change))
    for row in ({'walking': '2'}, {'arrived': '20'}, {'density': '1.7'}, {'badge': ''}):
        ov = escape_overlay(rec); ov['escape']['branches'][0]['shown'].update(row)
        with pytest.raises(AssertionError):
            rec.check_overlay(ov)
    # Off-grid routes (walk to another station, off-sim taxi stretch) only reach the sim edge: no ✔ there.
    ov = escape_overlay(rec); ov['escape']['branches'][1].update(edge=True, shown={'walking': '24', 'arrived': '0', 'density': '3.8', 'badge': ''}); rec.check_overlay(ov)
    ov['escape']['branches'][1]['src']['outcome'] = 'escaped'; rec.check_overlay(ov)
    ov['escape']['branches'][1]['shown']['badge'] = '✔'
    with pytest.raises(AssertionError):
        rec.check_overlay(ov)
    # VS beat: times, dense seconds and badges = the run's first walker per route; the ratio is recomputed.
    for path, value in (('time', '+03:40'), ('dense', '10'), ('badge', '')):
        ov = escape_overlay(rec); ov['escape']['vs']['rows'][1]['shown'][path] = value
        with pytest.raises(AssertionError):
            rec.check_overlay(ov)
    ov = escape_overlay(rec); ov['escape']['vs']['rows'][2]['shown']['badge'] = '✔'  # edge row, not reached yet
    with pytest.raises(AssertionError):
        rec.check_overlay(ov)
    for bad in ({'ratio': '3.0'}, {'kind': 'same'}, {'b': 'C'}):
        ov = escape_overlay(rec); ov['escape']['vs']['cmp'].update(bad)
        with pytest.raises(AssertionError):
            rec.check_overlay(ov)
    with pytest.raises(AssertionError):  # the 2026 crowd figure is the cited estimate, never a sim count
        rec.check_overlay({'mission': {'n': '48,000', 'src': 48000}})
    # The stamp follows the fixed rule: dense exposure or a time-out is CAUGHT.
    caught = escape_overlay(rec); caught['escape']['stamp']['src']['denseSeconds'] = 31
    with pytest.raises(AssertionError):
        rec.check_overlay(caught)
    caught['escape']['stamp']['shown'] = 'caught'; rec.check_overlay(caught)
    assert rec.rule_outcome({'arrived': False, 'arriveAt': None, 'denseSeconds': 0, 'simTime': 100, 'simLimit': 192, 'denseMax': 30}) is None
    assert rec.rule_outcome({'arrived': True, 'arriveAt': 200, 'denseSeconds': 0, 'simTime': 200, 'simLimit': 192, 'denseMax': 30}) == 'caught'
    assert 'MEAS-14' not in rec.FACT_IDS and 'MEAS-14' in rec.DROPPED_IDS and 'CROWD-01' in rec.FACT_IDS


def test_escape_overlay_helpers_match_the_recorder():
    # escape-overlay.mjs formats and rule = record_shibuya.py's (the checks compare like with like).
    script = ("import('./web3d/shibuya/escape-overlay.mjs').then(m=>console.log(JSON.stringify([m.p2(2.449),m.mmss(70.4),m.dangerLevel(2.99),m.dangerLevel(4),"
              "m.ruleOutcome({arrived:true,arriveAt:70,denseSeconds:31,simTime:70,simLimit:192,denseMax:30}),m.ruleOutcome({arrived:false,arriveAt:null,denseSeconds:0,simTime:200,simLimit:192,denseMax:30}),"
              "m.DANGER_STEPS,m.sourceGroups(['EXIT-09','ALT-01','EXIT-04']).mark(['EXIT-04'])])))")
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    import json
    got = json.loads(out)
    rec = recorder()
    assert got[:2] == [rec.p2(2.449), rec.mmss(70.4)]
    assert got[2:4] == [rec.danger_level(2.99), rec.danger_level(4)] == [2, 4]
    assert got[4:6] == ['caught', 'caught'] and list(rec.DANGER_STEPS) == got[6]
    assert got[7] == '*3'
    esc = (ROOT/'web3d/shibuya/escape.mjs').read_text()
    assert 'dangerLevels:[1,2,3,4]' in esc and 'rule:{denseMax:30,' in esc


def overlay(rec, **change):
    ov = {'shown': {'agents': '48,000', 'crossing': '1,234', 'queued': '567', 'held': '2,001', 'peak': '3.9', 'median': '1.4'},
          'source': {'agents': 48000, 'crossing': 1234, 'queued': 567, 'held': 2001, 'peak': 3.94, 'median': 1.36}}
    side = lambda rem, inside=0: {'inside': rec.fmt(inside), 'streets': rec.fmt(rem-inside), 'gone': rec.fmt(16000-rem), 'remaining': rec.fmt(rem), 'densNow': '4.8', 'empty': '07:46',
                        'src': {'inside': inside, 'streets': rem-inside, 'gone': 16000-rem, 'remaining': rem, 'densNow': 4.78, 'empty': 466.3}}
    ov['split'] = {'clock': '+25:00', 'A': side(3113), 'B': side(10, 4), 'source': {'time': 1500, 'timeB': 1500}}
    ov['hook'] = {'n': '18,000', 'line': {'agents': '48,000', 'peak': '3.9', 'held': '2,001'}, 'source': {'n': 18000, 'agents': 48000, 'peak': 3.94, 'held': 2001}}
    ex = lambda c, p: {'clearAt': c, 'peakRun': p}
    ov['board'] = {'rows': [{'key': 'hachiko', 'A': {'clear': 'not cleared · 未解消', 'peak': '4.6'}, 'B': {'clear': '03:12', 'peak': '3.0'}, 'src': {'A': ex(None, 4.62), 'B': ex(192.3, 3.01)}},
                            {'key': 'markcity', 'A': {'clear': 'never dense · 密集なし', 'peak': '1.1'}, 'B': {'clear': '00:00', 'peak': '2.5'}, 'src': {'A': ex(0, 1.1), 'B': ex(0, 2.5)}}]}
    ov['question'] = {'slowest': {'A': 'hachiko', 'B': 'scramble'}, 'clear': {'A': 'not cleared · 未解消', 'B': '13:14'},
                      'source': {'A': [{'key': 'hachiko', **ex(None, 4.6)}, {'key': 'scramble', **ex(None, 4.1)}], 'B': [{'key': 'hachiko', **ex(192, 3)}, {'key': 'scramble', **ex(794.2, 4.1)}]}}
    sw = rec.load_sweep(); rg = rec.sweep_ranges(sw); base = next(q for q in sw['scenarios'] if q['key'] == 'base')
    A, B = base['none'], base['managed']
    src = lambda q: {'remaining': q['remaining'], 'denseClearedAt': q['denseClearedAt'], 'densePeakNow': 1.0 if q['denseClearedAt'] is not None else 4.0, 'peakCell': q['peakCell'], 'crush': q['crushPersonMinutes'], 'stationEmptyAt': q['stationEmptyAt']}
    t = lambda v: rec.mmss(v) or '25:00+'
    ov['results'] = {'sweep': True, 'source': {'A': src(A), 'B': src(B)}, 'rows': [
        ['', '', t(A['stationEmptyAt']), t(B['stationEmptyAt']), rg['stationEmptyAt']['none'], rg['stationEmptyAt']['managed']],
        ['', '', rec.fmt(A['remaining']), rec.fmt(B['remaining']), rg['remaining']['none'], rg['remaining']['managed']],
        ['', '', t(A['denseClearedAt']), t(B['denseClearedAt']), rg['denseClearedAt']['none'], rg['denseClearedAt']['managed']],
        ['', '', rec.fmt(A['crushPersonMinutes']), rec.fmt(B['crushPersonMinutes']), rg['crushPersonMinutes']['none'], rg['crushPersonMinutes']['managed']],
        ['', '', f"{rec.p2(A['peakCell'])} p/m²", f"{rec.p2(B['peakCell'])} p/m²", rg['peakCell']['none'], rg['peakCell']['managed']]]}
    for path, value in change.items():
        target = ov
        keys = path.split('__')
        for k in keys[:-1]: target = target[k]
        target[keys[-1]] = value
    return ov


def test_overlay_numbers_must_match_the_solver():
    rec = recorder()
    rec.check_overlay(overlay(rec))
    bad_tile = overlay(rec); bad_tile['split']['B']['inside'] = '0'
    bad_range = overlay(rec); bad_range['results']['rows'][1][5] = '0–1'
    bad_run = overlay(rec); bad_run['results']['source']['A']['remaining'] += 1; bad_run['results']['rows'][1][2] = rec.fmt(bad_run['results']['source']['A']['remaining'])
    bad_board = overlay(rec); bad_board['board']['rows'][0]['B']['clear'] = '03:00'
    bad_never = overlay(rec); bad_never['board']['rows'][1]['B']['clear'] = 'never dense · 密集なし'  # peak 2.5 > 2: it was dense
    bad_slow = overlay(rec); bad_slow['question']['slowest']['B'] = 'hachiko'
    bad_hook = overlay(rec); bad_hook['hook'] = {**bad_hook['hook'], 'n': '48,000', 'source': {**bad_hook['hook']['source'], 'n': 48000}}  # headline must be the cited estimate
    for ov in (bad_tile, bad_range, bad_run, bad_board, bad_never, bad_slow, bad_hook):
        with pytest.raises(AssertionError):
            rec.check_overlay(ov)
    for bad in ({'shown__held': '2,000'}, {'shown__peak': '4.0'}, {'split__A__remaining': '3,000'}, {'split__clock': '+24:59'}, {'split__B__empty': '07:47'}, {'split__A__gone': '0'}, {'hook__line__held': '2,000'}):
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


def compose_module():
    spec = importlib.util.spec_from_file_location('compose_vertical', ROOT/'tools/compose_vertical.py')
    cv = importlib.util.module_from_spec(spec); spec.loader.exec_module(cv)
    return cv


def level_record(lang_text):
    return {'t': 10.8, 'shot': 'lv1', 'section': 'level', 'u': 3.8, 'agents': 48000, 'fly': 0,
            'text': {'ja': lang_text('ja'), 'en': lang_text('en')}}


def test_vertical_level_band_draws_the_logged_strings():
    # tools/compose_vertical.py draws only strings logged in frames.jsonl (checked against the solver
    # by the recorder for that frame); colour emoji and the title band are drawn for every scene frame.
    cv = compose_module()
    from PIL import Image
    def text(lang):
        return {'title': '🧙ハロウィンの渋谷を脱出せよ！🎃', 'titleSub': '10/31', 'bar': 'LEVEL 1/5', 'foot': 'Sources: *1 Wikipedia / counts = simulation',
                'level': {'n': 1, 'color': '#FF8A1F', 'simTag': 'SIMULATION', 'timer': 'SIM +01:10', 'danger': {'label': 'HIGH', 'value': '2.4 p/m²', 'level': 2, 'bar': 2.4},
                          'branches': [{'key': 'A', 'example': True, 'exampleTag': 'EXAMPLE ROUTE', 'line': 'Hanzomon', 'gate': 'Dogenzaka gate*1', 'count': 'walking 3 · arrived 21', 'density': '1.8 p/m²', 'badge': '✔', 'alpha': 1}],
                          'tips': [{'text': 'Example route*1', 'from': .8}, {'text': '🚕 taxi*2', 'from': 1.8}, {'text': '🚶 walk*3', 'from': 2.6}],
                          'stamp': {'kind': 'escaped', 'main': 'ESCAPED!', 'sub': 'A +01:10', 'k': 10, 'head': 'VS (SIMULATION)', 'cmp': 'Same start: B took 3.2× as long as A',
                                    'rows': [{'key': 'A', 'example': True, 'edge': False, 'label': 'Hanzomon Dogenzaka gate', 'time': '+01:10', 'badge': '✔', 'dense': '', 'edgeTag': '', 'bar': .3, 'on': True},
                                             {'key': 'C', 'example': False, 'edge': True, 'label': 'Keio walk to Shinsen', 'time': '+05:07', 'badge': '', 'dense': '', 'edgeTag': 'sim edge', 'bar': 1, 'on': True}]}}}
    r = level_record(text)
    frame = Image.new('RGB', (1280, 720), (40, 0, 0))
    for lang in ('ja', 'en'):
        img = cv.frame_image(r, lang, cv.background(), frame)
        assert img.size == (cv.W, cv.H)
        # the middle is the 9:16 column of the captured frame
        assert img.getpixel((540, cv.MID_Y+400)) == (40, 0, 0)
    # the HUD band (before the result beat) and the hook band with its legend/teaser
    hud = level_record(text); [hud['text'][l]['level'].pop('stamp') for l in ('ja', 'en')]
    assert cv.frame_image(hud, 'ja', cv.background(), frame).size == (cv.W, cv.H)
    title = {'t': 2, 'shot': 'title', 'section': 'title', 'u': .5, 'fly': 0, 'text': {'ja': {'osd': '▶ PLAY　10.31 SAT',
             'teaser': {'legend': '赤＝人が密集（3人/m²以上）', 'simTag': 'シミュレーション', 'routes': '5つの場所 × 15ルートで検証'}}}}
    assert cv.frame_image(title, 'ja', cv.background(), frame).size == (cv.W, cv.H)
    # kinsoku: a closing mark never starts a line
    assert all(not l.startswith('？') for l in cv.wrap('渋谷から脱出できるか？', cv.font(92), 1000))
    # colour emoji (title band) really are colour pixels, not tofu
    tile = cv.emoji_tile('🎃', 84)
    assert tile.size[0] > 40 and any(p[0] > 200 and p[1] > 80 and p[2] < 80 and p[3] > 200 for p in tile.getdata())
    assert cv.section('lv3') == 'level' and cv.section('credits') == 'credits'


def test_vertical_credit_and_question_bands():
    cv = compose_module()
    end = {k: {'title': '🧙 Escape Shibuya on Halloween! 🎃', 'question': 'Which way would you go? 🎃', 'sourcesHead': 'Sources', 'sources': ['A 2026-09-30', 'B 2025-10-02'],
               'sim': 'Counts: simulation', 'walk': 'Walk times: OSM', 'check': 'Check notices', 'data': '3D: PLATEAU / OSM'} for k in ('ja', 'en')}
    img = cv.frame_image({'t': 0, 'shot': 'credits'}, 'en', cv.background(), end=end)
    assert img.size == (cv.W, cv.H)
    q = {'t': 37, 'shot': 'question', 'section': 'question', 'u': 1.5, 'text': {'en': {'foot': 'Sources: x', 'question': {'line': 'Which way would you go? 🎃', 'cta': 'Tell us', 'options': [{'k': 'A', 'text': 'Center Gai → gate*1', 'color': '#FF8A1F'}]}}}}
    assert cv.frame_image(q, 'en', cv.background(), None).size == (cv.W, cv.H)


def sweep_file():
    import json
    return json.loads((ROOT/'web3d/data/shibuya_dispersal_sweep.json').read_text())


def test_dispersal_sweep_covers_the_assumptions_and_conserves_people():
    # The sensitivity sweep (web3d/shibuya/sweep-dispersal.mjs) varies every bundled assumption
    # and reports both strategies; it does not require management to win.
    sw = sweep_file()
    keys = {q['key'] for q in sw['scenarios']}
    assert {'base', 'seed11', 'seed23', 'demand60', 'demand125', 'cap70', 'cap130', 'destUniform', 'destWide', 'comply60', 'spillNever'} <= keys
    knobs = set()
    for q in sw['scenarios']:
        knobs |= set(q['change']) | set(q['change'].get('dispersal', {}))
        for k in ('none', 'managed'):
            r = q[k]
            assert r['remaining'] + r['left'] == r['agents'] and r['inside'] + r['inArea'] == r['remaining']
            assert r['peakCell'] <= 5 + 1e-9
            for m in r['marks']: assert m['inside'] + m['area'] + m['left'] == r['agents']
    assert {'seed', 'inside', 'capScale', 'destPower', 'compliance', 'spillAfter'} <= knobs


def test_sweep_ranges_match_the_browser():
    import json
    script = ("import('./web3d/shibuya/halloween-app.mjs').then(async m=>{const fs=await import('node:fs');"
              "console.log(JSON.stringify(m.sweepRanges(JSON.parse(fs.readFileSync('web3d/data/shibuya_dispersal_sweep.json','utf8')))))})")
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    assert json.loads(out) == recorder().sweep_ranges(sweep_file())



def parody_frames(lang):
    return {
        'broadcast': {'parody': {'ja': '※これはパロディです', 'en': 'PARODY — not a real alert'}[lang], 'issuer': 'GAME HQ (fictional)', 'head': 'URGENT NOTICE',
                      'when': 'Oct 31', 'order': 'All players: escape\nto a gate', 'notReal': {'ja': '本物の警報・お知らせではありません', 'en': 'This is not a real alert or notice'}[lang], 'alpha': 1, 'glitch': .5},
        'rules': {'head': 'RULES', 'number': '≈18,000*1', 'note': 'x', 'tagline': 'tag\nline',
                  'items': [{'title': 'RULE 1: Don\'t stop', 'tip': 'Move with the flow', 'alpha': 1}, {'title': 'RULE 2', 'tip': 'x*2', 'alpha': 0}]},
        'gameStart': {'start': 'GAME START', 'sub': 'go', 'k': .05, 'alpha': 1},
        'gameover': {'title': 'GAME OVER', 'tally': '✔ 5/5 routes escaped (sim)', 'line': '…but the real night is Oct 31', 'tagline': 'Costumes: optional.\nThe way home: your call.', 'u': .1},
        'game': {'countdown': 'TIME LEFT 00:21'},
    }


def test_vertical_parody_bands():
    # 9:16: the cold open carries the parody cue (one pill, top band) and the not-real line (bottom band); rules, GAME START, GAME OVER,
    # countdown strip, survivor counter and CROWD ALERT banner are drawn from the logged strings.
    cv = compose_module()
    from PIL import Image
    frame = Image.new('RGB', (1280, 720), (40, 0, 0))
    for lang in ('ja', 'en'):
        P = parody_frames(lang)
        bc = {'t': .5, 'shot': 'broadcast', 'section': 'broadcast', 'u': .5, 'text': {lang: {'broadcast': P['broadcast'], 'osd': '▶ PLAY'}}}
        img = cv.frame_image(bc, lang, cv.background(), frame)
        # the yellow parody-cue pill sits at the top of the frame (above the map)
        assert img.getpixel((cv.W//2-200, 80)) == cv.YELLOW
        ru = {'t': 5, 'shot': 'rules', 'section': 'rules', 'u': 1.5, 'text': {lang: {'rules': P['rules'], 'bar': '≈18,000*1', 'foot': 'Sources: *1 x'}}}
        assert cv.frame_image(ru, lang, cv.background(), frame).size == (cv.W, cv.H)
        gs = {'t': 6.4, 'shot': 'rules', 'section': 'rules', 'u': 2.9, 'text': {lang: {'rules': P['rules'], 'gameStart': P['gameStart'], 'game': P['game']}}}
        assert cv.frame_image(gs, lang, cv.background(), frame).size == (cv.W, cv.H)
        go = {'t': 39.2, 'shot': 'gameover', 'section': 'gameover', 'u': .2, 'text': {lang: {'gameover': P['gameover']}}}
        assert cv.frame_image(go, lang, cv.background(), frame).size == (cv.W, cv.H)
        lv = {'t': 10, 'shot': 'lv1', 'section': 'level', 'u': 3, 'text': {lang: {'game': P['game'], 'bar': 'LEVEL 1/5', 'level': {'color': '#FF8A1F', 'n': 1,
              'survivors': {'head': 'ESCAPE COUNTER (SIM)', 'line': 'out 24 · still in Shibuya 48', 'note': 'x', 'frac': .33},
              'alert': {'text': '⚠ CROWD ALERT (SIMULATION)', 'value': '3.2 p/m²', 'where': 'on route B', 'beat': 1}}}}}
        img = cv.frame_image(lv, lang, cv.background(), frame)
        assert img.getpixel((60, cv.MID_Y+cv.MID_H-40))[0] > 200  # red alert banner over the bottom of the map


def parody_overlay(rec, t=10.8, **extra):
    ov = escape_overlay(rec); ov['t'] = t
    ov.update(extra)
    return ov


def test_parody_overlay_checks():
    rec = recorder()
    T = {l: {'broadcast': {'parody': rec.H_PARODY_CUE[l], 'notReal': rec.H_NOT_REAL[l]}} for l in ('ja', 'en')}
    good_bc = {'t': .5, 'section': 'broadcast', 'title': {'card': False, 'header': False}, 'text': T,
               'broadcast': {'cue': dict(rec.H_PARODY_CUE), 'notReal': dict(rec.H_NOT_REAL), 'alpha': 1, 'glitch': 0}}
    rec.check_overlay(good_bc)
    for bad in ({'cue': {'ja': '緊急', 'en': 'ALERT'}}, {'alpha': .5}, {'notReal': {'ja': '', 'en': ''}}):
        ov = json_copy(good_bc); ov['broadcast'].update(bad)
        with pytest.raises(AssertionError): rec.check_overlay(ov)
    with pytest.raises(AssertionError): rec.check_overlay({**good_bc, 'broadcast': None})
    ov = json_copy(good_bc); ov['text']['en']['broadcast']['parody'] = ''
    with pytest.raises(AssertionError): rec.check_overlay(ov)
    # title held: complete, not flying, not glitched
    held = {'t': 2.5, 'title': {'card': True, 'header': False, 'fly': 0, 'glitch': 0, 'alpha': 1}, 'titleChars': {'ja': 17, 'en': 30, 'total': {'ja': 17, 'en': 30}}}
    rec.check_overlay(held)
    for bad in ({'glitch': .3}, {'fly': .2}, {'alpha': .8}):
        ov = json_copy(held); ov['title'].update(bad)
        with pytest.raises(AssertionError): rec.check_overlay(ov)
    # countdown = the game clock formula; survivor counter = the sim walkers of the branches on screen
    rec.check_overlay(parody_overlay(rec, countdown={'shown': '00:28', 'src': {'t': 10.8, 'from': 7, 'to': 39}}))
    with pytest.raises(AssertionError): rec.check_overlay(parody_overlay(rec, countdown={'shown': '00:30', 'src': {'t': 10.8, 'from': 7, 'to': 39}}))
    sv = {'shown': {'escaped': '21', 'left': '51'}, 'src': {'arrived': 21, 'walking': 27, 'pending': 24, 'perBranch': 24, 'branches': 3}}
    rec.check_overlay(parody_overlay(rec, survivors=sv))
    for path, v in (('escaped', '24'), ('left', '50')):
        bad = json_copy(sv); bad['shown'][path] = v
        with pytest.raises(AssertionError): rec.check_overlay(parody_overlay(rec, survivors=bad))
    bad = json_copy(sv); bad['src']['pending'] = 20; bad['shown']['left'] = '47'
    with pytest.raises(AssertionError): rec.check_overlay(parody_overlay(rec, survivors=bad))  # walkers not conserved
    bad = json_copy(sv); bad['src'].update(arrived=22, pending=23); bad['shown'].update(escaped='22', left='50')
    with pytest.raises(AssertionError): rec.check_overlay(parody_overlay(rec, survivors=bad))  # ≠ branch counters
    # red alert label = the legend's red: on iff the simulated density is ≥ 3 p/m² (2.9 is HIGH/orange: no alert)
    on = {'on': True, 'shown': '3.2', 'where': 'route', 'key': 'B', 'src': {'value': 3.24, 'pulse': .6, 'player': 2.44, 'route': 3.24}}
    rec.check_overlay(parody_overlay(rec, alert=on))
    off = {'on': False, 'shown': '', 'where': 'route', 'key': None, 'src': {'value': 2.94, 'pulse': 0, 'player': 2.44, 'route': 2.94}}
    rec.check_overlay(parody_overlay(rec, alert=off))
    assert rec.alert_pulse(2.99) == 0 and rec.alert_pulse(3.0) == rec.H_ALERT[2] and rec.alert_pulse(5) == 1
    for bad in ({**off, 'on': True, 'shown': '2.9'}, {**on, 'on': False, 'shown': ''}, {**on, 'shown': '3.0'}, {**on, 'src': {**on['src'], 'player': 2.0}}, {**on, 'key': None}):
        with pytest.raises(AssertionError): rec.check_overlay(parody_overlay(rec, alert=bad))
    # GAME OVER: only as the end-of-game title (gameover shot) with the sim tally; never as a route result
    go = {'t': 39.3, 'section': 'gameover', 'gameOver': {'shown': {'escaped': 5, 'total': 5}, 'src': {'outcomes': ['escaped']*5}, 'section': 'gameover'},
          'text': {'en': {'gameover': {'title': 'GAME OVER'}}}}
    rec.check_overlay(go)
    with pytest.raises(AssertionError): rec.check_overlay({**go, 'gameOver': {**go['gameOver'], 'shown': {'escaped': 4, 'total': 5}}})
    with pytest.raises(AssertionError): rec.check_overlay({**go, 'section': 'overview'})
    lvl = escape_overlay(rec); lvl['text'] = {'en': {'level': {'stamp': {'main': 'GAME OVER'}}}}
    with pytest.raises(AssertionError): rec.check_overlay(lvl)
    lvl['text'] = {'en': {'level': {'stamp': {'main': 'CAUGHT IN THE CROWD'}}}}  # the sim said ESCAPED
    with pytest.raises(AssertionError): rec.check_overlay(lvl)
    ov = {'t': 38, 'section': 'overview', 'overview': {'rows': [{'shown': {'time': '01:09', 'outcome': 'escaped'}, 'src': {'arriveAt': 69.2, 'outcome': 'escaped'}}]},
          'text': {'ja': {'overview': [{'outcome': '✖ 捕まった'}]}}}
    with pytest.raises(AssertionError): rec.check_overlay(ov)


def json_copy(o):
    import json
    return json.loads(json.dumps(o))


def test_parody_constants_match_the_browser():
    rec = recorder()
    import json
    script = ("Promise.all([import('./web3d/shibuya/director-halloween.mjs'),import('./web3d/shibuya/escape-overlay.mjs'),import('./web3d/shibuya/escape-copy.mjs'),import('./web3d/shibuya/escape-scene.mjs')]).then(([d,o,c,s])=>console.log(JSON.stringify("
              "{clock:d.GAME_CLOCK,title:d.TITLE_BEAT,cd:[d.countdownAt(0),d.countdownAt(10.8),d.countdownAt(40)],alert:o.ALERT,style:s.ESCAPE_STYLE.alert,pulse:[2.9,3,3.4,4.2].map(o.alertPulse),scenePulse:[2.9,3,3.4,4.2].map(v=>s.alertPulseOf(v)),"
              "cue:c.BROADCAST.parody,nr:c.BROADCAST.notReal,vhs:[0,1,1.6,2.5,3,5,7.1,13.1,20,39.1].map(d.vhsAt),lv:d.LEVEL_START})))")
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    got = json.loads(out)
    assert (got['clock']['from'], got['clock']['to']) == rec.H_GAME_CLOCK and got['clock']['from'] == got['lv']
    assert got['cd'] == [rec.countdown_at(0), rec.countdown_at(10.8), rec.countdown_at(40)]
    assert (got['alert']['from'], got['alert']['to'], got['alert']['on']) == rec.H_ALERT == (got['style']['from'], got['style']['to'], got['style']['on'])
    assert rec.H_ALERT[0] == rec.DANGER_STEPS[2] == 3  # alert = the DANGER meter's red step and the legend's 'RED = 3+'
    for v, p in zip((2.9, 3.0, 3.4, 4.2), got['pulse']): assert abs(p-rec.alert_pulse(v)) < 1e-12
    for v, p in zip((2.9, 3.0, 3.4, 4.2), got['scenePulse']): assert abs(p-rec.alert_pulse(v)) < 1e-12
    assert got['cue'] == {**rec.H_PARODY_CUE, 'factIds': []} and got['nr'] == {**rec.H_NOT_REAL, 'factIds': []}
    # title held clean ≥ 1 s; VHS only on transitions (0 while the title is held and mid-level), ≤ .3 over level cuts
    assert rec.H_TITLE_CLEAN == (got['title']['clean'], got['title']['fly']) and rec.H_TITLE_CLEAN[1]-rec.H_TITLE_CLEAN[0] >= 1
    v = dict(zip([0, 1, 1.6, 2.5, 3, 5, 7.1, 13.1, 20, 39.1], got['vhs']))
    assert v[2.5] == v[3] == v[5] == v[20] == 0 and v[0] > .5 and 0 < v[13.1] <= .3 and v[39.1] > .3
