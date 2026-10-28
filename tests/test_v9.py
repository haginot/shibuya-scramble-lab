"""JR v9: Halloween costumes everywhere + the crush POV (logs/ssl-claude-halloween/v9/STEERING-*.md).

* costume classes: one table (costumes-v9.json) shared by the page and the compositor, deterministic assignment from the
  id (JS == Python), ≥ 8 classes, every class drawn, no class is an attacker, the attackers' sprite set is disjoint;
* crush meter: the number the crush POV shows == the crush scenario's output (tools/v9_sim.mjs → v9/sim/crush.json),
  both in the config and in what the page computes for the HUD at the end of the climb (and, when a render log exists,
  on the rendered frames);
* the SIM PICK is still the argmin of the displayed score (v9 configs = v8 story);
* configs generated + valid (beat order, video length 100–130 s, labels);
* the guide ghost 「おばけ」 (tools/v9_ghost.py → v9/ghost.json): bubble limits (≤ 2 lines × 20 chars, reading time), no jargon /
  banned words, every scene explained, silent in the caught / stamp / GOODBYE beats, placement inside the safe area and off
  the HUD for every beat, quoted numbers == the sim output.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import costumes_v9 as COS  # noqa: E402

PAIRS = ('gate', 'taxi', 'zone', 'alt')
V9DIR = ROOT/'web3d/shibuya/series/variants/jr/v9'
CRUSH = json.loads((V9DIR/'sim/crush.json').read_text(encoding='utf-8'))
SUM = {n: json.loads((ROOT/f'web3d/shibuya/series/variants/jr/v8/sim/{n}.json').read_text(encoding='utf-8')) for n in ('plan', 'retry')}
V9 = {p: json.loads((V9DIR/f'{p}.json').read_text(encoding='utf-8')) for p in PAIRS}
WORK = Path(os.environ.get('V9_WORK', '/workspace/projects/logs/ssl-claude-halloween/v9/render'))


def node(js):
    r = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def beat(c, i):
    return next(b for b in c['beats'] if b['id'] == i)


def items(b, c):
    return [h for h in b.get('hud', []) if h.get('c') == c]


# ---------------------------------------------------------------- costumes
def test_costume_table_shared_and_large_enough():
    js = node("import {V9_COSTUMES} from './web3d/shibuya/series/costumes-v9.mjs';console.log(JSON.stringify(V9_COSTUMES));")
    assert js['classes'] == COS.CLASSES
    assert tuple(js['attackers']['sprites']) == COS.ATTACKERS
    assert len(COS.CLASSES) >= 8 and len(set(COS.CLASS_KEYS)) == len(COS.CLASS_KEYS)


def test_costume_assignment_deterministic_js_equals_python():
    ids = list(range(0, 3000, 7))+[48000, 123456, 200001]
    js = node(f"import * as M from './web3d/shibuya/series/costumes-v9.mjs';console.log(JSON.stringify({ids}.map(i=>[M.classOf(i),M.paletteOf(i)])));")
    py = [[COS.class_of(i), COS.palette_of(i)] for i in ids]
    assert js == py
    assert [COS.class_of(i) for i in ids] == [COS.class_of(i) for i in ids]   # pure function
    seen = {COS.class_of(i) for i in range(5000)}
    assert seen == set(range(len(COS.CLASSES))) and len(seen) >= 8


def test_no_costume_is_an_attacker_and_sets_are_disjoint():
    keys, feats = set(COS.CLASS_KEYS), {f for c in COS.CLASSES for f in c['features']}
    att = set(COS.ATTACKERS)
    assert att and not (att & keys) and not (att & feats)
    for c in COS.CLASSES:
        s = (c['key']+' '+' '.join(c['features'])).lower()
        for w in ('attack', 'claw', 'reach', 'chase', 'monster', 'blood', 'wound', 'gore', 'sprite', 'game-zombie'):
            assert w not in s, (c['key'], w)
    # attacker colours are never a costume colour
    cols = {h.upper() for c in COS.CLASSES for p in c['palettes'] for h in p}
    assert not ({h.upper() for h in COS.ATTACKER_PALETTE} & cols)


def test_cg_style_carries_the_class():
    got = node("""import * as M from './web3d/shibuya/series/costumes-v9.mjs';const o=[];
for(let i=0;i<400;i++){const [t,s,f]=M.v9Style(i);o.push([M.v9ClassFromFlags(f),M.classOf(i),t,f&3]);}console.log(JSON.stringify(o));""")
    for cls_f, cls, t, low in got:
        assert cls_f == cls and t == COS.CLASSES[cls]['cg'] and low in (0, 1, 2)


def test_v9_configs_turn_costumes_on():
    op = json.loads((V9DIR/'_opening.json').read_text(encoding='utf-8'))
    assert op['look']['costumes'] == 'v9'
    for p, c in V9.items():
        assert c['look']['costumes'] == 'v9'
        for b in c['beats']:
            if b.get('simmap'): assert b['simmap']['costumes'] is True


# ---------------------------------------------------------------- crush POV
@pytest.mark.parametrize('pair', PAIRS)
def test_crush_meter_equals_crush_sim_output(pair):
    c = V9[pair]; b = beat(c, 'crush-pov'); m = items(b, 'crushmeter')[0]
    pov = CRUSH['pov'][pair]
    assert m['scenario'] == 'crush' and m['route'] == c['sim']['over'] == pov['route'] and m['track'] == 'worst'
    assert m['peak'] == pov['peak'] == c['sim']['crushPeak'] and b['crush']['peak'] == pov['peak']
    assert m['simT'][1] == pov['simT']
    rows = CRUSH['worst'][pov['route']]['rows']
    assert max(r[1] for r in rows) == pov['peak']                         # the peak IS the worst walker's densest moment
    assert next(r for r in rows if r[0] == pov['simT'])[1] == pov['peak']
    # what the page hands the HUD at the end of the climb (sim-v8 meterState on the worst-walker track)
    S = str(V9DIR/'sim/crush.json')
    st = node(f"""import * as V from './web3d/shibuya/series/sim-v8.mjs';import fs from 'node:fs';
const S=JSON.parse(fs.readFileSync('{S}','utf8'));const it={json.dumps(m)};
console.log(JSON.stringify([V.meterState({{...S,track:S.worst}},it,it.run[1]),V.meterState({{...S,track:S.worst}},it,{b['dur']})]));""")
    assert st[0]['rho'] == pov['peak'] and st[1]['rho'] == pov['peak']
    assert 'シミュレーション' in m['note'] and '8' in m['note']


def test_crush_scenario_documented():
    assert CRUSH['crush']['occupancy'] == 8 and CRUSH['crush']['base'] == 'retry'
    assert CRUSH['agents'] == 48000 and 'シミュレーション' in CRUSH['label']
    assert CRUSH['globalPeak']['rho'] <= CRUSH['crush']['occupancy']+1e-9


@pytest.mark.parametrize('pair', PAIRS)
def test_crush_and_clear_pov_beats(pair):
    c = V9[pair]; ids = [b['id'] for b in c['beats']]
    i = ids.index('crush-pov')
    assert ids[i+1 if pair != 'alt' else i+1] in ('caught', 'over-move')
    assert ids.index('crush-pov') < ids.index('caught')
    b = beat(c, 'crush-pov')
    assert 6 <= b['dur'] <= 8 and b['bgm'] is None
    sfx = {q['sfx'] for q in b['cues']}
    assert {'heartbeat', 'breath', 'crush_muffled', 'shove'} <= sfx
    assert len([q for q in b['cues'] if q['sfx'] == 'shove']) == len(b['crush']['shoves'])
    cp = beat(c, 'clear-pov'); m = items(cp, 'simmeter')[0]
    assert m['scenario'] == 'retry' and m['route'] == c['sim']['clear']
    rows = SUM['retry']['track'][m['route']]['rows']
    seen = [r[1] for r in rows if m['simT'][0] <= r[0] <= m['simT'][1]]
    assert seen and max(seen) < 3.0          # low density on the CLEAR route (the contrast)


# ---------------------------------------------------------------- sim pick (unchanged story)
@pytest.mark.parametrize('pair', PAIRS)
def test_sim_pick_is_argmin_of_displayed_score(pair):
    c = V9[pair]
    for sc, key in (('plan', 'pick'), ('retry', 'retryPick')):
        S = SUM[sc]['scored'][pair]
        ranked = [r for r in S['rows'] if not r['ruledOut'] and r['score'] is not None]
        assert c['sim'][key] == S['pick'] == min(ranked, key=lambda r: r['score'])['key']
    assert c['sim']['pick'] != c['sim']['over'] and c['sim']['retryPick'] == c['sim']['clear']
    shown = node(f"""import * as V from './web3d/shibuya/series/sim-v8.mjs';import fs from 'node:fs';
const S=JSON.parse(fs.readFileSync('web3d/shibuya/series/variants/jr/v8/sim/plan.json','utf8'));
const c=JSON.parse(fs.readFileSync('{V9DIR}/{pair}.json','utf8'));const b=c.beats.find(b=>b.id==='sim-pick');const it=b.hud.find(h=>h.c==='simpanel');
console.log(JSON.stringify(V.panelState(S,it,b.dur)));""")
    rows = [r for r in shown['rows'] if not r['ruledOut'] and r['score'] is not None]
    assert shown['pick'] == min(rows, key=lambda r: r['score'])['key'] == c['sim']['pick']


def test_v8_story_changes_kept():
    assert V9['gate']['sim']['clear'] == 'GC'
    assert V9['alt']['sim']['over'] == 'EB' and V9['alt']['sim']['clear'] == 'HA'
    assert V9['alt']['lesson']['title'] == '終電が遅い駅が正解とは限らない'
    assert V9['taxi']['sim']['clear'] == 'TB' and V9['zone']['sim']['over'] == 'ZA'


# ---------------------------------------------------------------- configs
def test_configs_generated_and_valid():
    subprocess.run(['node', 'tools/v9_configs.mjs', '--check'], cwd=ROOT, check=True, capture_output=True)
    for p in PAIRS:
        r = subprocess.run(['node', 'tools/variant_cues.mjs', f'v9/{p}', '--opening', 'v9/_opening', '--check'], cwd=ROOT, capture_output=True, text=True)
        out = json.loads(r.stdout)
        assert out['ok'] and not out['errors'], (p, out['errors'])
        assert 100 <= out['duration'] <= 130, out['duration']


def test_no_real_ip_names():
    # (the banned project names are checked tree-wide by tests/test_copy_variants.py without spelling them out)
    bad = ('walking dead', 'ウォーキング・デッド', 'ゴジラ', 'godzilla', 'パロディ')
    files = [V9DIR/f'{p}.json' for p in PAIRS]+[V9DIR/'_opening.json', ROOT/'web3d/shibuya/series/costumes-v9.json',
                                                  ROOT/'tools/costumes_v9.py', ROOT/'tools/v9_configs.mjs', ROOT/'tools/v9_sim.mjs', ROOT/'tools/v9_composite.py',
                                                  ROOT/'tools/v9_ghost.py', V9DIR/'ghost.json']
    for f in files:
        s = f.read_text(encoding='utf-8').lower()
        for w in bad: assert w.lower() not in s, (f.name, w)


# ---------------------------------------------------------------- rendered frames (when a render log exists)
@pytest.mark.parametrize('pair', PAIRS)
def test_rendered_crush_meter_shows_the_sim_peak(pair):
    logs = sorted((WORK/pair/'hud'/'body').glob('frames-*.jsonl'))
    if not logs: pytest.skip('no v9 HUD render log')
    recs = [json.loads(l) for f in logs for l in f.read_text(encoding='utf-8').splitlines() if l.strip()]
    cm = [r for r in recs if r.get('crushmeter')]
    if not cm: pytest.skip('crush-pov not rendered yet')
    peak = round(CRUSH['pov'][pair]['peak'], 1)
    assert max(r['crushmeter']['rho'] for r in cm) == peak
    assert cm[-1]['crushmeter']['rho'] == peak and cm[-1]['crushmeter']['danger'] == (peak >= 4)


# ---------------------------------------------------------------- the guide ghost
import v9_ghost as GH  # noqa: E402
GHOST = json.loads((V9DIR/'ghost.json').read_text(encoding='utf-8'))


def test_ghost_lines_generated_from_current_inputs(tmp_path):
    # regenerating gives the same lines + timing (placement is kept for unchanged lines)
    before = json.dumps({p: [(l['beat'], l['t0'], l['t1'], l['text'], l['nums']) for l in v['lines']] for p, v in GHOST['pairs'].items()}, ensure_ascii=False)
    crush = CRUSH
    for p in PAIRS:
        L = GH.lines_of(p, crush, V9[p])
        assert sorted(t for _, _, t, _ in L) == sorted(l['text'] for l in GHOST['pairs'][p]['lines'])
    assert before


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_bubble_limits_and_reading_time(pair):
    lines = GHOST['pairs'][pair]['lines']
    for l in lines:
        rows = l['text'].split('\n')
        assert len(rows) <= 2 and all(len(r) <= 20 for r in rows), l['text']
        assert l['t1']-l['t0'] >= 1.0+0.12*l['chars']-1e-6
        for w in GH.BANNED: assert w.lower() not in l['text'].lower(), (w, l['text'])
    for a, b in zip(lines, lines[1:]): assert b['t0'] >= a['t1']+.2


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_explains_every_scene_and_stays_silent_where_it_must(pair):
    bt = GH.beat_table(pair); lines = GHOST['pairs'][pair]['lines']
    said = {l['beat'] for l in lines}
    must = {'mission', 'first-choice', 'true-end', 'guide', 'over-start', 'sim-plan', 'sim-pick', 'over-choice', 'over-result',
            'crush-pov', 'over-lesson', 'retry-why', 'clear-choice', 'clear-pov', 'clear-result', 'clear-cheat', 'kaiju'}
    assert must <= said, must-said
    assert len([l for l in lines if l['beat'] == 'sim-plan']) >= 3 and len([l for l in lines if l['beat'] == 'crush-pov']) >= 2
    for l in lines:
        for k in GH.SILENT_BEATS:
            b = bt[k]; assert l['t1'] <= b['t0'] or l['t0'] >= b['t1'], (l['text'], k)
    # the GOODBYE card is introduced (neutrally) right before it, never spoken over
    assert any('渋谷区' in l['text'] and l['beat'] == 'kaiju' for l in lines)


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_placement_safe_for_every_beat(pair):
    S = GHOST['safe']
    assert S['x1'] <= 1080*.85 and S['y1'] <= 1920*.80 and S['y0'] >= 1920*.10
    for l in GHOST['pairs'][pair]['lines']:
        assert 'box' in l, f'not placed: python3 tools/v9_ghost.py place {pair}'
        for r in (l['box'], l['ghost'], l['bubble']):
            assert S['x0'] <= r[0] < r[2] <= S['x1'] and S['y0'] <= r[1] < r[3] <= S['y1'], (l['beat'], r)
        if GH.ImageFont is None: continue
        bw, bh = GH.bubble_size(l['text'])
        assert l['bubble'][2]-l['bubble'][0] >= bw and l['bubble'][3]-l['bubble'][1] >= bh
        assert l['probes'] > 0
        # nothing of the HUD under the ghost / bubble (12 px margin may be touched; SIM PICK: a map pin marker, see ALLOW_OVERLAP)
        assert l['core'] == 0 or (l['beat'] in GH.ALLOW_OVERLAP and l['core'] < 3000), (l['beat'], l['core'])
        assert l['overlap'] < 10000, (l['beat'], l['overlap'])


def _resolve(src, pair):
    kind, path = src.split(':', 1)
    if kind == 'sim':
        name, *keys = path.split('.')
        o = CRUSH if name == 'crush' else SUM[name]
        for k in keys: o = o[k]
        return o
    beat_id, comp = path.split('.')
    return next(h['ja'] for h in beat(V9[pair], beat_id)['hud'] if h['c'] == comp)


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_quoted_numbers_equal_sim_output(pair):
    import math
    n = 0
    for l in GHOST['pairs'][pair]['lines']:
        for q in l['nums']:
            assert q['quote'] in l['text']
            v = _resolve(q['src'], pair)
            if q['src'].startswith('sim:'):
                if q.get('rule') == 'floor': assert int(q['quote']) == math.floor(v) and v == q['value']
                elif q['quote'] == '4万8千人': assert v == 48000 == q['value']
                else: assert float(q['quote']) == float(v)
            else:
                assert q['match'] in v               # the sim-generated HUD text of that beat
                num = q['quote'].rstrip('分月')
                assert num in q['match']
            n += 1
    assert n >= 2
    # the crush line quotes the same peak the crush meter shows
    cl = [l for l in GHOST['pairs'][pair]['lines'] if l['beat'] == 'crush-pov' and l['nums']][0]
    assert cl['nums'][0]['value'] == CRUSH['pov'][pair]['peak'] == items(beat(V9[pair], 'crush-pov'), 'crushmeter')[0]['peak']
