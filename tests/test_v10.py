"""JR v10: the v9 videos with two photoreal Gemini plates (tools/v10_plan.json) instead of the procedural flat costumed crowd
— plate swaps, the crush POV camera on the photo, the crush meter still the sim peak, ghost lines unchanged (v10.1: except
the op-fly self-intro) and their boxes clear of the photo faces / sign panel, rendered deliverables (skipped until rendered).
v10.1: the Hachiko plate is grounded-refs/v3/01-hachiko-v2.png (the v10 01-hachiko.png was the wrong place)."""
from __future__ import annotations

import json
import math
from pathlib import Path
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
OUT = Path('/workspace/demos/halloween-escape-series/jr-v10.1')
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
    keys = ('beat', 'at', 't0', 't1', 'text', 'chars', 'nums')
    a = [{k: l.get(k) for k in keys} for l in G9['pairs'][pair]['lines'] if l['beat'] != 'op-fly']
    b = [{k: l.get(k) for k in keys} for l in G10['pairs'][pair]['lines'] if l['beat'] != 'op-fly']
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
    rep = Path('/workspace/projects/logs/ssl-claude-halloween/v10.1/render')/pair/'report.json'
    if not rep.exists() or not (OUT/f'{pair}-share.mp4').exists(): pytest.skip('v10.1 not rendered yet')
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
