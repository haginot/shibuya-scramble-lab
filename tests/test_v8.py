"""JR v8: the crowd-flow simulation drives the route choice (logs/ssl-claude-halloween/v8/STEERING-sim-core.md).

The sim numbers on screen must come from really running the solver (tools/v8_sim.mjs → variants/jr/v8/sim/*.json) and
the highlighted route must be the argmin of the displayed score. These tests check the summaries against the walker
records, the scoring rule, the panel state the page feeds to the HUD, the generated configs and (when a render log
exists) the numbers recorded on the rendered frames.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
SIMDIR = ROOT/'web3d/shibuya/series/variants/jr/v8/sim'
SUM = {n: json.loads((SIMDIR/f'{n}.json').read_text(encoding='utf-8')) for n in ('plan', 'retry')}
V8 = {p: json.loads((ROOT/f'web3d/shibuya/series/variants/jr/v8/{p}.json').read_text(encoding='utf-8')) for p in PAIRS}
WORK = Path(os.environ.get('V8_WORK', '/workspace/projects/logs/ssl-claude-halloween/v8/render'))


def node(js):
    r = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def beat(c, i):
    return next(b for b in c['beats'] if b['id'] == i)


def items(b, c):
    return [h for h in b.get('hud', []) if h.get('c') == c]


def test_configs_generated_and_valid():
    subprocess.run(['node', 'tools/v8_configs.mjs', '--check'], cwd=ROOT, check=True, capture_output=True)
    for p in PAIRS:
        r = subprocess.run(['node', 'tools/variant_cues.mjs', f'v8/{p}', '--opening', 'v8/_opening', '--check'], cwd=ROOT, capture_output=True, text=True)
        out = json.loads(r.stdout)
        assert out['ok'] and not out['errors'], (p, out['errors'])
        assert out['duration'] < 100 and out['duration'] <= 98, out['duration']


@pytest.mark.parametrize('sc', ('plan', 'retry'))
def test_numbers_are_the_walker_records(sc):
    """numbers[route] = medians over that route's simulated walkers (sim-v8 routeNumbers), nothing typed in."""
    S = SUM[sc]
    got = node(f"""import * as V from './web3d/shibuya/series/sim-v8.mjs';import fs from 'node:fs';
const S=JSON.parse(fs.readFileSync('{SIMDIR}/{sc}.json','utf8'));const o={{}};
for(const [k,w] of Object.entries(S.walkers))o[k]=V.routeNumbers(w);console.log(JSON.stringify(o));""")
    for k, n in S['numbers'].items():
        g = got[k]
        assert g['walkers'] == n['walkers'] == 24
        if g['time'] is None: assert n['time'] is None
        else: assert abs(g['time']-n['time']) <= .051, (k, g, n)
        assert abs(g['peak']-n['peak']) <= .006 and abs(g['dense']-n['dense']) <= .051, (k, g, n)
    assert S['agents'] == 48000 and S['label'] == 'シミュレーション'


@pytest.mark.parametrize('sc', ('plan', 'retry'))
@pytest.mark.parametrize('pair', PAIRS)
def test_pick_is_argmin_of_displayed_score(sc, pair):
    S = SUM[sc]['scored'][pair]
    ranked = [r for r in S['rows'] if not r['ruledOut'] and r['score'] is not None]
    assert ranked, pair
    best = min(ranked, key=lambda r: r['score'])
    assert S['pick'] == best['key']
    rule = SUM[sc]['rule']
    for r in S['rows']:
        n = SUM[sc]['numbers'][r['key']]
        off = n['offsim']['seconds'] if n['offsim'] else 0
        if n['time'] is None: assert r['total'] is None and r['ruledOut']; continue
        assert r['total'] == pytest.approx(n['time']+off)
        assert r['score'] == int(r['total']+rule['perUnit']*max(0, n['peak']-rule['peakFree'])+.5)  # JS Math.round
        assert r['risk'] == ('高' if n['peak'] >= 3 else '中' if n['peak'] >= 2 else '低')


@pytest.mark.parametrize('pair', PAIRS)
def test_panel_state_shows_the_summary_and_highlights_the_argmin(pair):
    """What the page hands to the HUD (sim-v8 panelState) at the SIM PICK / re-run pick: final rows = summary rows,
    highlight = argmin of the scores shown."""
    c = V8[pair]
    for bid, sc in (('sim-pick', 'plan'), ('clear-choice', 'retry')):
        it = items(beat(c, bid), 'simpanel')[0]
        t = beat(c, bid)['dur']-.05
        st = node(f"""import * as V from './web3d/shibuya/series/sim-v8.mjs';import fs from 'node:fs';
const S=JSON.parse(fs.readFileSync('{SIMDIR}/{sc}.json','utf8')),F=JSON.parse(fs.readFileSync('{SIMDIR}/plan.json','utf8'));
console.log(JSON.stringify(V.panelState(S,{json.dumps(it)},{t},{{from:{'F' if it.get('from') else 'null'}}})));""")
        assert all(r['final'] for r in st['rows'])
        shown = [r for r in st['rows'] if not r['ruledOut']]
        assert st['pick'] == min(shown, key=lambda r: r['score'])['key'] == SUM[sc]['scored'][pair]['pick']
        for r, s in zip(st['rows'], SUM[sc]['scored'][pair]['rows']):
            assert (r['total'], r['peak'], r['score'], r['risk'], bool(r['ruledOut'])) == (s['total'], s['peak'], s['score'], s['risk'], bool(s['ruledOut']))


@pytest.mark.parametrize('pair', PAIRS)
def test_story_follows_the_sim(pair):
    c = V8[pair]; s = c['sim']
    assert s['pick'] == SUM['plan']['scored'][pair]['pick'] != s['over']
    assert s['retryPick'] == SUM['retry']['scored'][pair]['pick'] == s['clear']
    order = [b['id'] for b in c['beats']]
    assert order.index('sim-pick') == order.index('sim-plan')+1 == order.index('over-start')+2
    assert order.index('over-choice') == order.index('sim-pick')+1
    assert order.index('retry-why') == order.index('continue')+1 and order.index('clear-choice') == order.index('retry-why')+1
    # the gut pick: over-choice picks the GAME OVER route's option, against the SIM PICK chip
    oc = beat(c, 'over-choice')
    assert any('シミュレーションの結論' in h.get('ja', '') for h in items(oc, 'sim'))
    # meters: label シミュレーション, fed from the run of their route
    for bid in ('over-move', 'over-result', 'clear-move', 'clear-result'):
        for m in items(beat(c, bid), 'simmeter'):
            assert m['route'] == (s['over'] if bid.startswith('over') else s['clear'])
            assert m['scenario'] == ('plan' if bid.startswith('over') else 'retry')
            assert m['run'] == [0, beat(c, bid)['dur']]


@pytest.mark.parametrize('pair', PAIRS)
def test_why_it_failed_numbers_come_from_the_plan_run(pair):
    from importlib import import_module  # noqa: F401
    rw = beat(V8[pair], 'retry-why')
    w = rw['why']; tr = SUM['plan']['track'][V8[pair]['sim']['over']]
    row = next(r for r in tr['rows'] if abs(r[0]-w['t']) < 1e-6)
    assert (row[1], row[2], row[3]) == (w['rho'], w['x'], w['z'])
    pin = items(rw, 'pin')[0]
    if pair != 'alt': assert pin['world'] == [w['x'], 0, w['z']]
    assert pin['ja'] == w['text']
    if pair in ('gate', 'taxi', 'zone'):
        assert f"{round(w['rho']*10)/10:.1f}人/m²" in pin['ja']
    else:  # alt: the Ebisu arrival = clock start + sim leg + OSM leg
        eb = next(r for r in SUM['plan']['scored']['alt']['rows'] if r['key'] == 'EB')
        assert eb['ruledOut'] and eb['arrive'] > 50
        assert '終電' in pin['ja']
    assert rw['simmap']['freeze'] == w['t'] and rw['simmap']['pulse'] == [w['x'], w['z']]


def test_sim_labels_and_banned_names():
    for p in PAIRS:
        txt = json.dumps(V8[p], ensure_ascii=False)
        for bad in ('enable' + 'X', 'カン' + 'リー', 'can' + 'ly', 'can-' + 'ly', 'ゴジラ', 'Godzilla'):
            assert bad.lower() not in txt.lower(), (p, bad)
        for bid in ('sim-plan', 'sim-pick', 'clear-choice'):
            it = items(beat(V8[p], bid), 'simpanel')[0]
            assert '仮定' in it['assume'] and it['head'].find('シミュレーション') >= 0 or '再計算' in it['head']
    for f in ('web3d/shibuya/series/sim-v8.mjs', 'web3d/shibuya/series/sim-layer.mjs', 'tools/v8_sim.mjs', 'tools/v8_configs.mjs', 'tools/v8_composite.py', 'tools/render_v8.py'):
        t = (ROOT/f).read_text(encoding='utf-8').lower()
        for bad in ('enable' + 'x', 'カン' + 'リー', 'can' + 'ly'):
            assert bad not in t, (f, bad)


def test_offsim_legs_are_osm_and_labelled():
    for sc in ('plan', 'retry'):
        for k, n in SUM[sc]['numbers'].items():
            if n['offsim']:
                assert n['offsim']['label'] == 'OSMから概算' and n['offsim']['seconds'] == round(n['offsim']['metres']/80*60)
                assert n['offsim']['metres'] < n['offsim']['osmTotal']


def test_components_render_panel_and_meter():
    out = node("""import {render} from './web3d/shibuya/series/ui/components.mjs';
const rows=[{key:'A',label:'A x',color:'#f00',final:true,total:300,peak:3.8,rho:3.8,bar:.95,risk:'高',score:408,ruledOut:null,rank:2,rankFrom:1},
 {key:'B',label:'B y',color:'#0f0',final:true,total:240,peak:2.1,rho:2.1,bar:.5,risk:'中',score:246,ruledOut:null,rank:1,rankFrom:2}];
const p=render({c:'simpanel',rows,pick:'B',pickAt:0,t:1,dur:2,rule:'r',assume:'仮定'});
const m=render({c:'simmeter',rho:3.4,segs:5,eta:95,t:1,dur:2});
console.log(JSON.stringify({p:p.simpanel,ps:p.sims,m:m.simmeter,ms:m.sims,html:p.html.includes('SIM PICK')}));""")
    assert out['p']['pick'] == 'B' and out['html'] and out['ps'][0]['label'] and out['ms'][0]['label']
    assert out['m'] == {'rho': 3.4, 'segs': 5, 'eta': 95}


def test_rendered_frames_show_the_sim_numbers():
    """After rendering: the per-frame records (record_variant.py logs) of the SIM PICK show exactly the summary rows."""
    logs = sorted((WORK/'gate').glob('**/*.jsonl')) if WORK.exists() else []
    recs = []
    for f in logs:
        for line in f.read_text(encoding='utf-8').splitlines():
            try: r = json.loads(line)
            except ValueError: continue
            if r.get('simpanel') and r.get('beat') == 'sim-pick': recs.append(r)
    if not recs: pytest.skip('no rendered sim-pick frames yet')
    S = SUM['plan']['scored']['gate']
    for r in recs[-3:]:
        sp = r['simpanel']
        assert sp['pick'] == S['pick']
        for a, b in zip(sp['rows'], S['rows']):
            assert a['total'] == b['total'] and a['score'] == b['score'] and a['peak'] == b['peak']
