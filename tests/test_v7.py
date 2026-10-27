"""JR v7 (CG → photoreal switch, new kaiju, v6 QA fixes): configs, switch plan, footnote zone, compositor tables, audio.

Briefs: logs/ssl-claude-halloween/v7/brief.md + STEERING-kaiju.md + STEERING-photoreal-switch.md (HAGINO 2026-10-27).
"""
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
V6 = {p: json.loads((ROOT/f'web3d/shibuya/series/variants/jr/v6/{p}.json').read_text(encoding='utf-8')) for p in PAIRS}
V7 = {p: json.loads((ROOT/f'web3d/shibuya/series/variants/jr/v7/{p}.json').read_text(encoding='utf-8')) for p in PAIRS}
OP7 = json.loads((ROOT/'web3d/shibuya/series/variants/jr/v7/_opening.json').read_text(encoding='utf-8'))
PLAN = json.loads((ROOT/'tools/v7_plan.json').read_text(encoding='utf-8'))


def beat(c, i):
    return next(b for b in c['beats'] if b['id'] == i)


def node(js):
    r = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def test_configs_generated_and_valid():
    subprocess.run(['node', 'tools/v7_configs.mjs', '--check'], cwd=ROOT, check=True, capture_output=True)
    for p in PAIRS:
        r = subprocess.run(['node', 'tools/variant_cues.mjs', f'v7/{p}', '--opening', 'v7/_opening', '--check'], cwd=ROOT, capture_output=True, text=True)
        out = json.loads(r.stdout)
        assert out['ok'] and not out['errors'], (p, out['errors'])
        assert abs(out['duration']-88.2) < 1e-6, out['duration']


@pytest.mark.parametrize('pair', PAIRS)
def test_same_timeline_true_end_and_goodbye_unchanged(pair):
    """v7 keeps the v6 beats and timing; TRUE END and the GOODBYE end card are the v6 content (STEERING: unchanged)."""
    a, b = V6[pair], V7[pair]
    assert [(x['id'], x['dur']) for x in a['beats']] == [(x['id'], x['dur']) for x in b['beats']]
    for i in ('true-end', 'goodbye', 'first-choice', 'guide'):
        assert beat(a, i)['hud'] == beat(b, i)['hud'], i
    assert 'goodbye' in PLAN['reuseV6']   # frame-exact v6 frames


@pytest.mark.parametrize('pair', PAIRS)
def test_photo_beats_tagged_and_cg_beats_not(pair):
    photo = PLAN['pairs'][pair]
    for b in V7[pair]['beats']:
        if b['id'] in photo:
            kind = PLAN['plates'][photo[b['id']]['plate']]['kind']
            assert b['plateTag'] == PLAN['tags'][kind], b['id']
        else:
            assert 'plateTag' not in b, b['id']
    for b in OP7['beats']:
        assert ('plateTag' in b) == (b['id'] in PLAN['opening']), b['id']
    # switch timing (STEERING-photoreal-switch.md): cold open / map / game UI / TRUE END / kaiju / end card = CG;
    # gates, streets, route results, caught, CONTINUE?, CLEAR = photo
    for i in ('over-start', 'over-choice', 'clear-choice', 'true-end', 'kaiju', 'goodbye', 'sources'):
        assert i not in photo, i
    for i in ('over-result', 'caught', 'continue', 'clear-result', 'clear-stamp'):
        assert i in photo, i
    assert PLAN['opening'] == {'rules': {'plate': 'hachikomae', 'mode': 'reveal'}}


def test_switch_plan_cuts():
    from render_v7 import build_index
    src = (ROOT/'tools/v7_composite.py').read_text(encoding='utf-8')
    assert all(f"'{p}': dict(" in src for p in PLAN['plates'])
    assert 6 <= PLAN['transition']['frames'] <= 10
    for p in PAIRS:
        _, idx, cuts = build_index(p)
        assert len(idx) == 2646
        first = cuts[0]; last = cuts[-1]
        assert (first[0], first[1], first[2], first[3]) == (336, 'glitch', 'mission', 'rules')   # 11.2 s: the "real Shibuya" reveal
        assert (last[1], last[2], last[3]) == ('glitch', 'clear-cheat', 'kaiju')                  # glitch back to CG for the gag
        assert all(k in ('glitch', 'whip') for _, k, _, _ in cuts)
        # the フィクション tag: cold open only (mission card, CG)
        assert idx[first[0]-1]['layer'] == 'cg'


def test_gate_caption_names_miyamasuzaka_with_sources():
    cap = next(h for h in beat(V7['gate'], 'over-move')['hud'] if h['c'] == 'caption')
    assert '宮益坂口' in cap['ja'] and '2026年3月' in cap['ja'] and '2025年1月' in cap['ja']
    assert cap['factIds'] == ['JR-GATE-03', 'JR-GATE-18'] and 'JR-GATE-18' in V7['gate']['sources']
    src = (ROOT/'web3d/shibuya/series/sources-series.mjs').read_text(encoding='utf-8')
    assert "'JR-GATE-18':F(['jrPmoX20260221','shibukei19736']" in src


def test_footnote_outside_tiktok_reels_zone_and_no_parody_summary():
    z = node("const t=await import('./web3d/shibuya/series/ui/tokens.mjs');const c=await import('./web3d/shibuya/series/ui/components.mjs');"
             "console.log(JSON.stringify({Z:t.ZONE,S:t.SAFE,F:t.FOOT_CLEAR,cheat:c.HUD_TEXT.cheatFoot}));")
    Z, S, F = z['Z'], z['S'], z['F']
    assert Z['foot']['bottom'] >= S['H']*F['bottomFrac'] and Z['foot']['right'] >= S['W']*F['rightFrac']
    assert F == {'bottomFrac': .2, 'rightFrac': .15}
    assert Z['low']['bottom'] >= Z['foot']['bottom']+Z['foot']['maxH']    # captions stack above the raised footnote
    assert 'パロディ' not in z['cheat']
    for p in (ROOT/'web3d/shibuya/series').rglob('*.mjs'):
        assert 'パロディ動画の要約' not in p.read_text(encoding='utf-8'), p
    rec = (ROOT/'tools/record_variant.py').read_text(encoding='utf-8')
    assert "fb['right'] <= fb['rlimit']" in rec


def test_sources_credit_and_kaiju_size():
    for p in PAIRS:
        s = next(h for h in beat(V7[p], 'sources')['hud'] if h['c'] == 'sources')
        assert 'PLATEAU' in s['credit'] and 'Syced' in s['credit'] and 'CC0' in s['credit'] and 'AI生成' in s['credit']
        k = beat(V7[p], 'kaiju')['shot']['params']['kaiju']
        assert k['scale'] < 560 and k['ground'] >= 430
    gag = next(h for h in beat(V7['gate'], 'kaiju')['hud'] if h['c'] == 'gag')
    assert 'ボス戦あるの' in gag['ja']
    assert PLAN['plates']['sakura']['license'].startswith('CC0') and 'ref-only' not in json.dumps(PLAN)


def test_audio_glitch_and_v7_cues():
    from v7_finish import cues, DROP_CAUGHT
    sys.path.insert(0, str(ROOT/'tools/audio'))
    src = (ROOT/'tools/audio/sfx.py').read_text(encoding='utf-8')
    assert "'glitch': glitch" in src and "'glitch': -9.0" in src
    c = json.loads(cues('gate').read_text(encoding='utf-8'))
    names = [e['sfx'] for e in c['events']]
    assert not set(DROP_CAUGHT) & set(names)
    assert names.count('glitch')+names.count('whoosh') >= len(c['meta']['v7']['switches'])
    assert 'kaiju_roar' in names and 'crowd_press' in names


def test_hud_only_mode_wired():
    page = (ROOT/'web3d/shibuya/series/app-variant.mjs').read_text(encoding='utf-8')
    assert "hudOnly=params.get('hudonly')==='1'" in page and '#view{visibility:hidden!important}' in page
    rec = (ROOT/'tools/record_variant.py').read_text(encoding='utf-8')
    assert "omit_background=hud_only" in rec and "startswith(('v6/', 'v7/'))" in rec
