"""JR v10: the v9 videos with two photoreal Gemini plates (tools/v10_plan.json) instead of the procedural flat costumed crowd
— plate swaps, the crush POV camera on the photo, the crush meter still the sim peak, ghost lines unchanged (v10.1: except
the op-fly self-intro) and their boxes clear of the photo faces / sign panel, rendered deliverables (skipped until rendered).
v10.1: the Hachiko plate is grounded-refs/v3/01-hachiko-v2.png (the v10 01-hachiko.png was the wrong place).
v10.2: the on-screen text over a plate that shows a different place is rewritten (tools/v10_configs.mjs FIXES → variants/jr/
v10/<pair>.json, tools/v10_ghost.py TEXT_FIX); only those beats' HUD frames are re-rendered (tools/v10_hud.py)."""
from __future__ import annotations

import json
import math
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))

PLAN10 = json.loads((ROOT/'tools/v10_plan.json').read_text(encoding='utf-8'))
PLAN9 = json.loads((ROOT/'tools/v9_plan.json').read_text(encoding='utf-8'))
V9 = ROOT/'web3d/shibuya/series/variants/jr/v9'
G9 = json.loads((V9/'ghost.json').read_text(encoding='utf-8'))
G10 = json.loads((ROOT/'web3d/shibuya/series/variants/jr/v10/ghost.json').read_text(encoding='utf-8'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
OUT = Path('/workspace/demos/halloween-escape-series/jr-v10.2')
V10 = ROOT/'web3d/shibuya/series/variants/jr/v10'
RENDER = Path('/workspace/projects/logs/ssl-claude-halloween')
PLATE_ROOT = Path(PLAN9['plateRoot'])

import v10_shots as C10  # noqa: E402  (numpy-free)


def test_plates_declared_ai_and_approved():
    assert set(PLAN10['plates']) == {'hachiko3', 'crush3'}
    for pid, p in PLAN10['plates'].items():
        assert p['kind'] == 'ai' and p['approved'] == 'HAGINO' and p['src'].startswith('grounded-refs/v3/')
        assert pid in PLAN10['geom'] and pid in PLAN10['protect']
        assert PLAN10['geom'][pid]['people'] == []          # the costumed people are the picture: no blur mask
    assert PLAN10['replacePlate'] == {'hachiko': 'hachiko3'} and PLAN10['crushPlate'] == 'crush3'


def _e(part, beat, bt=0.0, bdur=4.0):
    return dict(part=part, beat=beat, bt=bt, bdur=bdur, layer='photo')


@pytest.mark.parametrize('pair', PAIRS)
def test_plate_swaps(pair):
    assert C10.spec(pair, _e('opening', 'rules')) == {'plate': 'hachiko3', 'mode': 'reveal'}
    for beat, sp in PLAN9['pairs'][pair].items():
        got = C10.spec(pair, _e('body', beat))
        assert got['mode'] == sp['mode']
        if sp['mode'] == 'crush': assert got['plate'] == 'crush3'
        elif sp['plate'] == 'hachiko': assert got['plate'] == 'hachiko3'
        else: assert got == sp                              # every other shot is v9 as is


def test_gate_route_shots_on_the_new_hachiko_plate():
    on = {b for b in PLAN9['pairs']['gate'] if C10.spec('gate', _e('body', b))['plate'] == 'hachiko3'}
    assert on == {'over-move', 'over-result', 'caught', 'over-lesson', 'continue'}


@pytest.mark.parametrize('pair', PAIRS)
def test_crush_camera_pushes_in_sways_and_stays_on_the_plate(pair):
    cfg = json.loads((V9/f'{pair}.json').read_text(encoding='utf-8'))
    b = next(x for x in cfg['beats'] if x['id'] == 'crush-pov')
    shoves, dur = b['crush']['shoves'], b['dur']
    cams = [C10.crush_cam(i/30, dur, shoves) for i in range(int(dur*30)+1)]
    assert cams[-1][2] < cams[0][2]*.85                     # push-in: ≥ 15 % tighter at the end
    assert max(c[4] for c in cams)-min(c[4] for c in cams) > 20   # sway / kicks
    for ts in shoves:                                       # every shove (= shove SFX) lurches the camera
        k = int(round((ts+.15)*30)); assert cams[k][7] > .5
    for c in cams:                                          # the output corners never leave the photo
        cx, cy, s, roll, sx, sy, sq, _ = c; co, n = math.cos(roll), math.sin(roll)
        for X, Y in ((0, 0), (1080, 0), (0, 1920), (1080, 1920)):
            dX, dY = (X-540-sx)/(1+sq), Y-960-sy
            px, py = cx+s*(co*dX-n*dY), cy+s*(n*dX+co*dY)
            assert -1 <= px <= 1537 and -1 <= py <= 2753


@pytest.mark.parametrize('pair', PAIRS)
def test_crush_meter_is_still_the_sim_peak(pair):
    C9 = pytest.importorskip('v9_composite')
    m = C9.meter_of(pair, 'body', 'crush-pov')
    assert m['c'] == 'crushmeter' and m['scenario'] == 'crush'
    crush = json.loads((V9/'sim/crush.json').read_text(encoding='utf-8'))
    assert round(C9.meter_rho(m, m['run'][1]), 2) == m['peak']
    assert m['peak'] >= m['danger'] == 4                    # 圧死危険
    assert 'シミュレーション' in m['note']
    assert crush  # the scenario output the meter reads


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_lines_unchanged_from_v9_except_the_intro(pair):
    """v9 lines, except the op-fly self-intro (v10.1) and the v10.2 TEXT_FIX lines (new text + reading time, same start)."""
    import v9_ghost as GH
    fix = {beat: v for (p, beat), v in _text_fix().items() if p == pair}
    keys = ('beat', 'at', 't0', 't1', 'text', 'chars', 'nums')
    a = [{k: l.get(k) for k in keys} for l in G9['pairs'][pair]['lines'] if l['beat'] != 'op-fly']
    b = [{k: l.get(k) for k in keys} for l in G10['pairs'][pair]['lines'] if l['beat'] != 'op-fly']
    for l in a:
        if l['beat'] in fix:
            old, new = fix[l['beat']]; assert l['text'] == old
            l.update(text=new, chars=GH.nchars(new), t1=round(l['t0']+GH.read_time(new), 3))
    assert a == b
    ids = [l['id'] for l in G10['pairs'][pair]['lines']]
    assert ids == [f'{pair}-{i:02d}' for i in range(len(ids))]


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_self_intro_at_first_appearance(pair):
    """v10.1: the ghost's first lines (op-fly) are a goofy self-intro, within the bubble rules (<= 2 lines x 20 chars)."""
    import v9_ghost as GH
    lines = sorted(G10['pairs'][pair]['lines'], key=lambda l: l['t0'])
    intro = [l for l in lines if l.get('intro')]
    assert [l['id'] for l in intro] == [l['id'] for l in lines[:len(intro)]] and len(intro) == 2
    assert all(l['beat'] == 'op-fly' for l in intro)
    assert '渋谷系おばけです' in intro[0]['text'].replace('\n', '') and '裏道' in intro[1]['text']
    for l in intro:
        GH.check_text(l['text'])
        assert l['t1'] == round(l['t0']+GH.read_time(l['text']), 3) and l['core'] == 0 and l['overlap'] == 0
    assert intro[0]['box'] == intro[1]['box'] and intro[1]['t0']-intro[0]['t1'] < 1.2      # one span: the ghost stays on


def test_hachiko_plate_is_the_v2_plate():
    assert PLAN10['plates']['hachiko3']['src'] == 'grounded-refs/v3/01-hachiko-v2.png'
    for f in [*(ROOT/'tools').glob('v10*'), ROOT/'web3d/shibuya/series/variants/jr/v10/ghost.json']:
        assert 'v3/01-hachiko.png' not in f.read_text(encoding='utf-8'), f


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_boxes_safe_and_clear_of_photo_faces(pair):
    import v9_ghost as GH
    S = G10['safe']
    checked = 0
    for l in G10['pairs'][pair]['lines']:
        for r in (l['box'], l['ghost'], l['bubble']):
            assert S['x0'] <= r[0] < r[2] <= S['x1'] and S['y0'] <= r[1] < r[3] <= S['y1'], (l['beat'], r)
        assert l['core'] == 0 or (l['beat'] in GH.ALLOW_OVERLAP and l['core'] < 3000), (l['beat'], l['core'])
        assert l['overlap'] < 10000
        assert l.get('protect') == 0, (l['id'], l.get('protect'))
        if l.get('moved'): assert l['beat'] in ('mission', 'over-result', 'crush-pov', 'rules', 'over-move', 'over-lesson', 'continue')
        checked += 'protect' in l
    assert checked == len(G10['pairs'][pair]['lines'])


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_recheck_on_sample_frames(pair):
    """independent re-check of the saved boxes: projected faces / panel (dilated 16 px) vs ghost + bubble at 5 times per line."""
    if not all((PLATE_ROOT/p['src']).exists() for p in PLAN10['plates'].values()): pytest.skip('plates not on this machine')
    G = pytest.importorskip('v10_ghost')
    _, idx, _ = G.C10.build_index(pair)
    hit = lambda a, b: a[0] < b[2]+16 and b[0]-16 < a[2] and a[1] < b[3]+16 and b[1]-16 < a[3]
    for l in G10['pairs'][pair]['lines']:
        for u in (0, .25, .5, .75, 1):
            v = min(len(idx)-1, int((l['t0']+(l['t1']-l['t0'])*u)*30))
            for r in G.protect_rects(pair, idx, v):
                assert not hit(l['ghost'], r) and not hit(l['bubble'], r), (l['id'], v, r)


@pytest.mark.parametrize('pair', PAIRS)
def test_rendered_v10_deliverables(pair):
    # v10.2 re-renders only the pairs with fixed text; the others are copies of the v10.1 files (their v10.1 report)
    rep = RENDER/('v10.2' if _changed(pair) else 'v10.1')/'render'/pair/'report.json'
    if not rep.exists() or not (OUT/f'{pair}-share.mp4').exists(): pytest.skip('v10.2 not rendered yet')
    r = json.loads(rep.read_text(encoding='utf-8'))
    assert r['ok'], r['errors']
    v = r['video']
    assert (v['width'], v['height'], v['r_frame_rate']) == (1080, 1920, '30/1')
    assert -15 <= r['lufs'] <= -13 and r['true_peak'] <= -1
    sh = OUT/f'{pair}-share.mp4'
    assert sh.exists() and sh.stat().st_size < 200*1024*1024


@pytest.mark.parametrize('pair', PAIRS)
def test_every_new_plate_shot_carries_the_ai_tag(pair):
    """「AI生成画像を加工」 on every shot of a Gemini plate: the beat's own HUD plateTag, or (crush POV, whose v9 HUD has
    none) the tag stamped by the compositor (aiTag)."""
    cfgs = {'opening': json.loads((V9/'_opening.json').read_text(encoding='utf-8')), 'body': json.loads((V9/f'{pair}.json').read_text(encoding='utf-8'))}
    for part, beats in (('opening', ['rules']), ('body', list(PLAN9['pairs'][pair]))):
        for beat in beats:
            sp = C10.spec(pair, _e(part, beat))
            if sp['plate'] not in C10.NEW: continue
            b = next(x for x in cfgs[part]['beats'] if x['id'] == beat)
            assert b.get('plateTag') == 'AI生成画像を加工' or (beat == 'crush-pov' and PLAN10['aiTag']['box']), (pair, beat)
    x0, y0, x1, y1 = PLAN10['aiTag']['box']
    assert x1 <= 1080*.9 and y1 < 1920*.15         # top right, under the header, above the crushmeter


# ---------------------------------------------------------------- v10.2: text that names a place the plate does not show
def _text_fix():
    src = (ROOT/'tools/v10_ghost.py').read_text(encoding='utf-8')
    body = src.split('TEXT_FIX = ', 1)[1].split('\n}\n', 1)[0]+'\n}'
    return eval(body, {})                                   # the literal dict (v10_ghost needs numpy to import)


def _changed(pair):
    """beats whose shown text differs from v9 (v11.1: + the lesson / cheat cards read from the config root, the retry 'why')."""
    c9 = json.loads((V9/f'{pair}.json').read_text(encoding='utf-8')); c10 = json.loads((V10/f'{pair}.json').read_text(encoding='utf-8'))
    a = {b['id']: b for b in c9['beats']}

    def shown(c, b): return [b['hud']]+[c.get(k) for k in ('lesson', 'cheat') if any(h.get('c') == k for h in b['hud'])]+[b.get('why')]
    return [b['id'] for b in c10['beats'] if shown(c10, b) != shown(c9, a[b['id']])]


def _undo_v111(c):
    """the config before the v11.1 fixes (tools/v10_configs.mjs V111, recorded in c['v111'])"""
    for f in reversed(c['v111']['fixes']):
        o = c; keys = f['path'].split('.')
        for k in keys[:-1]: o = next(b for b in o['beats'] if b['id'] == k[1:]) if k.startswith('@') else o[int(k) if k.isdigit() else k]
        k = keys[-1]; k = int(k) if k.isdigit() else k
        assert o[k] == f['to'], f; o[k] = f['from']
    return c


def test_v10_configs_up_to_date():
    r = subprocess.run(['node', 'tools/v10_configs.mjs', '--check'], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout+r.stderr


@pytest.mark.parametrize('pair', PAIRS)
def test_v10_configs_are_v9_plus_the_listed_fixes(pair):
    c9 = json.loads((V9/f'{pair}.json').read_text(encoding='utf-8')); c10 = json.loads((V10/f'{pair}.json').read_text(encoding='utf-8'))
    changed = _changed(pair)
    v111 = {f['path'].split('.')[0][1:] for f in c10['v111']['fixes'] if f['path'].startswith('@')}
    v111 |= {b['id'] for b in c10['beats'] for f in c10['v111']['fixes'] if f['path'].split('.')[0] in ('lesson', 'cheat')
             and any(h.get('c') == f['path'].split('.')[0] for h in b['hud'])}
    _undo_v111(c10)
    fixes = c10['v10']['fixes']
    for f in fixes:   # undo the fixes → exactly v9 (apart from id / generator / the v10 record)
        b = next(x for x in c10['beats'] if x['id'] == f['beat'])
        h = next(x for x in b['hud'] if x['c'] == f['c'] and x[f['key']] == f['to']); h[f['key']] = f['from']
    for k in ('id', 'generated', 'v10', 'v111'): c10.pop(k); c9.pop(k, None)
    assert c10 == c9
    assert sorted({f['beat'] for f in fixes} | v111) == sorted(changed)
    assert len(fixes) == dict(gate=3, taxi=0, zone=2, alt=2)[pair]   # v11: + the zone crush-pov wrap fix


def _plate(pair, beat):
    return C10.spec(pair, _e('body', beat))['plate'] if beat in PLAN9['pairs'][pair] else None


def _texts(h): return [h[k] for k in ('ja', 'label') if isinstance(h.get(k), str)]


@pytest.mark.parametrize('pair', PAIRS)
def test_no_passage_or_station_claim_over_outdoor_plates(pair):
    """hachiko3 (the outdoor Hachiko square) and crush3 (an open-air crowd): no caption / meter label / ghost line names the
    passage (通路) or the in-front-of-the-gate spot; meiji (Meiji-dori in Shibuya): no 'arrived at Harajuku station'."""
    c10 = json.loads((V10/f'{pair}.json').read_text(encoding='utf-8'))
    ghost = G10['pairs'][pair]['lines']
    for b in c10['beats']:
        pid = _plate(pair, b['id'])
        if pid is None: continue
        texts = [t for h in b['hud'] if h['c'] not in ('lesson', 'cheat') for t in _texts(h)]
        texts += [l['text'] for l in ghost if l['beat'] == b['id']]
        for t in texts:
            if pid in ('hachiko3', 'crush3'): assert '通路' not in t and '改札前：' not in t and '（改札前・' not in t, (pair, b['id'], t)
            if pid == 'meiji': assert 'たどり着いた' not in t and '原宿まで歩けた' not in t, (pair, b['id'], t)


def test_gate_over_move_caption_describes_the_square_and_keeps_its_sources():
    b = next(x for x in json.loads((V10/'gate.json').read_text(encoding='utf-8'))['beats'] if x['id'] == 'over-move')
    cap = next(h for h in b['hud'] if h['c'] == 'caption')
    assert cap['ja'].startswith('ハチ公口の広場、改札待ちの列') and '宮益坂口' in cap['ja'] and 'Uターン' in cap['ja']
    assert '2025年1月' in cap['ja'] and '2026年3月' in cap['ja'] and cap['factIds'] == ['JR-GATE-03', 'JR-GATE-18']
    assert any(h['c'] == 'sim' and 'シミュレーション' in h['ja'] for h in b['hud'])      # the queue is the sim's picture
    gl = next(l for l in G10['pairs']['gate']['lines'] if l['beat'] == 'over-move')
    # v11.1 (fact check B): the line is the normal-day U-turn + follow staff on the night (was 「広場から改札へは…」 in v10.2)
    assert 'ふだん' in gl['text'] and '係員の指示' in gl['text'] and gl.get('v102') and gl['protect'] == 0 and gl['core'] == 0


@pytest.mark.parametrize('pair', PAIRS)
def test_v102_hud_frames_cover_the_changed_beats(pair):
    tl = RENDER/'v9/render'/pair/'timeline.json'
    if not tl.exists(): pytest.skip('v9 timeline not on this machine')
    HUD = pytest.importorskip('v10_hud')
    ch = HUD.changed_beats(pair)
    assert [b for b, _, _ in ch] == _changed(pair)
    # v11.1: the JP build re-renders the HUD of every changed beat (v10.2 + zone wrap fix + v11.1) in its own work dir
    d = RENDER/'v11.1/render-ja'/pair/'hud'/'body'
    if ch and not d.exists(): pytest.skip('v11.1 JP HUD not rendered yet')
    for _, f0, f1 in ch:
        assert all((d/f'f{f:05d}.png').exists() for f in range(f0, f1))
    if d.exists():   # nothing else is re-rendered: every other beat keeps the v9 HUD frames
        want = {f for _, f0, f1 in ch for f in range(f0, f1)}
        assert {int(p.stem[1:]) for p in d.glob('f*.png')} == want
