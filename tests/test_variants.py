"""Branching-variant system (series/variant-system.mjs, tools/variant_cues.mjs, tools/record_variant.py,
tools/render_variant.sh): checks without a browser — the JS modules are evaluated in node."""
import copy
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import record_variant as rv  # noqa: E402

CFG_DIR = ROOT/'web3d/shibuya/series/variants/jr'
SAMPLE = json.loads((CFG_DIR/'_sample.json').read_text(encoding='utf-8'))
SAMPLE_OP = json.loads((CFG_DIR/'_sample-opening.json').read_text(encoding='utf-8'))

PRELUDE = ("import * as V from './web3d/shibuya/series/variant-system.mjs';"
           "import {FACTS,DROPPED,SOURCES,sourceNames} from './web3d/shibuya/series/sources-series.mjs';"
           "import {SHOT_KEYS} from './web3d/shibuya/series/shots-variants.mjs';"
           "import {COMPONENT_KEYS} from './web3d/shibuya/series/ui/components.mjs';"
           "import {CROWD_STATES} from './web3d/shibuya/series/crowd-variants.mjs';"
           "const OPT={facts:FACTS,dropped:[...DROPPED],shotKeys:[...SHOT_KEYS],componentKeys:[...COMPONENT_KEYS],crowdKeys:Object.keys(CROWD_STATES)};"
           "const IN=JSON.parse(process.argv[1]);const out=x=>console.log(JSON.stringify(x));")


def node(body, data=None):
    js = PRELUDE + body
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js, json.dumps(data or {})], cwd=ROOT, text=True))


def validate(cfg, part='body'):
    return node("out(V.validateConfig(IN.cfg,{...OPT,part:IN.part}));", {'cfg': cfg, 'part': part})


def test_sample_configs_validate():
    v = validate(SAMPLE)
    assert v['ok'], v['errors']
    assert any("no-such-shot" in w and 'aerial' in w for w in v['warnings'])
    assert any("no-such-component" in w and 'caption' in w for w in v['warnings'])
    o = validate(SAMPLE_OP, 'opening')
    assert o['ok'], o['errors']


def mutate(fn):
    c = copy.deepcopy(SAMPLE); fn(c); return c


BAD = {
    'sim-unlabelled': lambda c: c['beats'][0]['hud'].append({'c': 'sim', 'ja': '待ち 12分', 'factIds': []}),
    'stamp-mismatch': lambda c: c['beats'][3]['hud'][0].update(kind='GAME_CLEAR'),
    'unknown-fact': lambda c: c['beats'][2]['hud'][0].update(factIds=['XX-99']),
    'dropped-fact': lambda c: c['beats'][2]['hud'][0].update(factIds=['TAXI-02']),
    'say-label-missing': lambda c: c['beats'][2]['hud'][0].update(ja='一方通行の列でUターン…'),
    'banned-name': lambda c: c['beats'][2]['hud'][0].update(ja='c'+'anly（2025年1月の報道）'),
    'real-alert': lambda c: c['beats'][0]['hud'][0].update(ja='緊急速報：改札を通れ'),
    'recommend': lambda c: c['beats'][0]['hud'][0].update(ja='おすすめルート'),
    'cheat-short': lambda c: c['beats'][5].update(dur=2.0),
    'no-choice': lambda c: c['beats'][1].update(hud=[]),
    'picked-not-option': lambda c: c['choice'].update(picked='C'),
    'three-options': lambda c: c['choice']['options'].append({'key': 'C', 'ja': '南改札', 'factIds': []}),
    'lesson-unsourced': lambda c: c['lesson'].update(factIds=[]),
    'stamp-before-choice': lambda c: c['beats'].insert(0, c['beats'].pop(3)),
    'no-stamp': lambda c: c['beats'].pop(3),
    'bad-outcome': lambda c: c.update(outcome='WIN'),
    'dup-beat-id': lambda c: c['beats'][1].update(id='start'),
    'item-after-beat': lambda c: c['beats'][0]['hud'][0].update(at=9),
}


@pytest.mark.parametrize('name', sorted(BAD))
def test_validation_rejects(name):
    v = validate(mutate(BAD[name]))
    assert not v['ok'], (name, v)


def test_opening_rejects_stamps():
    o = copy.deepcopy(SAMPLE_OP); o['beats'][3]['hud'].append({'c': 'stamp', 'kind': 'GAME_OVER', 'factIds': []})
    assert not validate(o, 'opening')['ok']


def test_video_length_rule_and_pairs():
    r = node("const {validateVideo}=await import('./tools/variant_cues.mjs');const b={...IN.b,id:'gate-over'};"
             "const c=JSON.parse(JSON.stringify(b));c.id='gate-clear';c.outcome='CLEAR';c.choice.picked='B';c.beats[3].hud[0].kind='GAME_CLEAR';"
             "const d=JSON.parse(JSON.stringify(c));d.choice.prompt.ja='別の質問';"
             "out({short:validateVideo(IN.o,b,OPT).errors,pair:V.validatePair(b,c),bad:V.validatePair(b,d),same:V.validatePair(b,b)});", {'b': SAMPLE, 'o': SAMPLE_OP})
    assert any('30–45' in e for e in r['short'])
    assert r['pair'] == []
    assert any('prompts differ' in e for e in r['bad'])
    assert r['same']


@pytest.fixture(scope='module')
def spec():
    return node("const P=V.videoPlan(IN.o,IN.b);const ts=[];for(let f=0;f<P.opening.frames;f++)ts.push(V.frameSpec(P.opening,IN.o,f/30,OPT));const bs=[];for(let f=0;f<P.body.frames;f++)bs.push(V.frameSpec(P.body,IN.b,f/30,OPT));"
                "out({P:{duration:P.duration,frames:P.frames,segments:P.segments,ob:P.opening.beats.map(b=>[b.id,b.f0,b.f1]),bb:P.body.beats.map(b=>[b.id,b.f0,b.f1]),off:P.body.offset},"
                "op:ts.map(s=>({beat:s.beat.id,logo:s.logo,header:s.header,shot:s.shot.key,local:s.shot.local,fade:s.fade})),"
                "body:bs.map(s=>({beat:s.beat.id,shot:s.shot.key,crowd:s.crowd,clock:s.clock,items:s.items.map(i=>i.c),ids:s.factIds,fb:s.fallbacks,fade:s.fade,stamps:s.stamps}))});",
                {'b': SAMPLE, 'o': SAMPLE_OP})


def test_timeline_tiles_whole_frames(spec):
    P = spec['P']
    for beats in (P['ob'], P['bb']):
        assert beats[0][1] == 0 and all(a[2] == b[1] for a, b in zip(beats, beats[1:]))
    assert P['frames'] == P['ob'][-1][2]+P['bb'][-1][2] and abs(P['off']-P['ob'][-1][2]/30) < 1e-9
    assert P['segments'][0] == {'name': 'opening', 't0': 0, 't1': P['off']} and P['segments'][1]['t1'] == P['duration']


def test_no_black_first_frame(spec):
    assert spec['op'][0]['fade'] == 1 and spec['body'][0]['fade'] == 1
    assert min(s['fade'] for s in spec['body']) < 1, 'transition dip / fade-out still applied inside the body'


def test_logo_time_is_continuous_across_beats(spec):
    lt = [(s['beat'], s['logo']['t']) for s in spec['op'] if s['logo']]
    assert lt[0][1] == 0 and {b for b, _ in lt} == {'logo', 'press'}
    d = [b[1]-a[1] for a, b in zip(lt, lt[1:])]
    assert all(abs(x-1/30) < 1e-6 for x in d), 'logo sequence time advances 1 frame per frame across the logo → press cut'
    assert all(not s['header'] for s in spec['op'] if s['logo']), 'no small header while the 3D logo is up'
    press = [s for s in spec['op'] if s['beat'] == 'press']
    assert press[-1]['logo']['dissolve'] > 0 and press[0]['logo']['dissolve'] == 0


def test_shot_time_continues_with_t0(spec):
    op = [s for s in spec['op'] if s['shot'] == 'op-flythrough']
    loc = [s['local'] for s in op]
    assert all(abs(b-a-1/30) < 1e-6 for a, b in zip(loc, loc[1:])), 'op-flythrough local time is continuous (shot.t0)'


def test_shot_runs_continue_unless_cut():
    r = node("const b=JSON.parse(JSON.stringify(IN.b));b.beats[3].shot=JSON.parse(JSON.stringify(b.beats[2].shot));const P=V.buildPart(b,'body');"
             "const c=JSON.parse(JSON.stringify(b));c.beats[3].shot.cut=true;const Q=V.buildPart(c,'body');"
             "const at=(p,cfg,t)=>V.frameSpec(p,cfg,t,OPT).shot.local;const t3=P.beats[3].t0;"
             "out({cont:at(P,b,t3),prev:at(P,b,t3-1/30),cut:at(Q,c,t3),start:at(P,b,0)});", {'b': SAMPLE})
    assert abs(r['cont']-r['prev']-1/30) < 1e-6 and r['cut'] == 0 and r['start'] == 0


def test_fallbacks_and_crowd_and_clock(spec):
    last = spec['body'][-1]
    assert last['shot'] == 'aerial' and 'shot:no-such-shot→aerial' in last['fb'] and 'caption' in last['items']
    q = [s['crowd']['t'] for s in spec['body'] if s['beat'] in ('queue', 'stamp')]
    assert all(abs(b-a-1/30) < 1e-6 for a, b in zip(q, q[1:])), 'crowd state time continues across beats sharing the state'
    st = next(s for s in spec['body'] if s['beat'] == 'start')
    assert st['crowd']['t'] == 0
    assert spec['body'][0]['clock']['time'] == '22:10' and next(s for s in spec['body'] if s['beat'] == 'stamp')['clock']['time'] == '23:58'
    assert all(s['clock'] is None for s in spec['body'] if s['beat'] in ('lesson', 'cheat', 'sources'))
    assert all(s['stamps'] == (['GAME_OVER'] if s['beat'] == 'stamp' else []) for s in spec['body'])
    assert all('JR-GATE-03' in s['ids'] for s in spec['body'] if s['beat'] in ('queue', 'lesson', 'cheat'))


def test_cue_sheet_shape_and_shared_opening():
    r = node("const a=V.buildCues(IN.o,IN.b);const c=JSON.parse(JSON.stringify(IN.b));c.id='_x';c.outcome='CLEAR';c.beats[3].hud[0].kind='ESCAPED';c.bgm='calm';c.beats.splice(1,0,{id:'extra',dur:2,shot:{key:'aerial'},hud:[]});"
             "const b=V.buildCues(IN.o,c);out({a,b});", {'b': SAMPLE, 'o': SAMPLE_OP})
    a, b = r['a'], r['b']
    assert set(a) >= {'duration', 'fps', 'events', 'bgm', 'amb', 'duck', 'segments'} and a['fps'] == 30
    ts = [e['t'] for e in a['events']]
    assert ts == sorted(ts) and 0 <= ts[0] and ts[-1] < a['duration']
    keys = [(round(e['t'], 3), e['sfx']) for e in a['events']]
    assert len(keys) == len(set(keys)), 'no stacked duplicate hits'
    split = a['segments'][0]['t1']
    op = lambda s: ([e for e in s['events'] if e['t'] < split], [x for x in s['bgm'] if x['t0'] < split], [x for x in s['amb'] if x['t0'] < split], [x for x in s['duck'] if x['t0'] < split])
    assert op(a) == op(b), 'the opening cues are identical for every body (shared opening audio)'
    names = {e['sfx'] for e in a['events']}
    assert {'logo_slam', 'press_start', 'tick', 'ui_select', 'stamp_hit', 'gameover_jingle', 'card_in'} <= names
    assert 'escaped' in {e['sfx'] for e in b['events']} and 'gameover_jingle' not in {e['sfx'] for e in b['events']}
    assert any(x['track'] == 'calm' for x in b['bgm'])
    slam = next(e for e in a['events'] if e['sfx'] == 'logo_slam')
    assert abs(slam['t']-(1.5+.9)) < 1e-6 and slam['duck'] > 0
    tick = next(e for e in a['events'] if e['sfx'] == 'tick')
    assert tick['repeat'] == .5 and tick['until'] > tick['t']


def test_footnote_and_sources_rows():
    r = node("out({f:V.footnoteFor(['JR-GATE-03','NA-JR-2026','XX'],{facts:FACTS,sourceNames,credit:'3D：PLATEAU'}),n:V.footnoteFor(['NA-JR-2026'],{facts:FACTS,sourceNames}),"
             "rows:V.sourceRows(['JR-GATE-03','TAXI-01'],{facts:FACTS,sources:SOURCES})});")
    assert r['f'].startswith('出典：') and 'シブヤ経済新聞 2025' in r['f'] and r['f'].endswith('3D：PLATEAU')
    assert r['n'] is None
    assert [x['factIds'] for x in r['rows']] == [['JR-GATE-03'], ['TAXI-01']] and all(x['url'].startswith('http') for x in r['rows'])


def test_cues_cli_and_keys(tmp_path):
    cues, tl = tmp_path/'c.json', tmp_path/'t.json'
    p = subprocess.run(['node', 'tools/variant_cues.mjs', '_sample', '--out', str(cues), '--timeline', str(tl)], cwd=ROOT, capture_output=True, text=True)
    assert p.returncode == 0, p.stdout+p.stderr
    res = json.loads(p.stdout); t = json.loads(tl.read_text())
    assert res['ok'] and res['frames'] == t['frames'] == res['openingFrames']+res['bodyFrames']
    assert json.loads(cues.read_text())['segments'][0]['name'] == 'opening'
    k1 = subprocess.check_output(['node', 'tools/variant_cues.mjs', '--opening-key'], cwd=ROOT, text=True).strip()
    k2 = subprocess.check_output(['node', 'tools/variant_cues.mjs', '--part-key', '_sample'], cwd=ROOT, text=True).strip()
    assert len(k1) == 16 and len(k2) == 16 and k1 != k2
    bad = subprocess.run(['node', 'tools/variant_cues.mjs', 'no-such-variant'], cwd=ROOT, capture_output=True, text=True)
    assert bad.returncode != 0


def test_contact_times_of_the_real_opening(tmp_path):
    if not (CFG_DIR/'_opening.json').exists(): pytest.skip('no _opening.json yet')
    ids = subprocess.check_output(['node', 'tools/variant_cues.mjs', '--list'], cwd=ROOT, text=True).split()
    if not ids: pytest.skip('no variant configs yet')
    tl = tmp_path/'t.json'
    subprocess.run(['node', 'tools/variant_cues.mjs', ids[0], '--timeline', str(tl), '--quiet'], cwd=ROOT, check=True)
    labels = ' | '.join(l for _, l in rv.contact_times(json.loads(tl.read_text())))
    for want in ('OP first frame', 'logo slam', 'logo hold', 'PRESS START', 'stamp', 'cheat'): assert want in labels, (want, labels)


def test_all_real_configs_validate():
    ids = subprocess.check_output(['node', 'tools/variant_cues.mjs', '--list'], cwd=ROOT, text=True).split()
    if not ids: pytest.skip('no variant configs yet')
    p = subprocess.run(['node', 'tools/variant_cues.mjs', '--validate-all'], cwd=ROOT, capture_output=True, text=True)
    res = json.loads(p.stdout)
    errs = {k: v['errors'] for k, v in res['variants'].items() if not v['ok']}
    errs.update({f'pair {k}': v['errors'] for k, v in res['pairs'].items() if not v['ok']})
    if not res['opening']['ok']: errs['opening'] = res['opening']['errors']
    assert p.returncode == 0 and not errs, errs


# ---------------------------------------------------------------- recorder checks
FACTS = ({'JR-GATE-03': {'na': False}, 'NA-JR-2026': {'na': True}}, {'TAXI-02'})
PLAN = {'beats': [{'id': 'q', 'hud': ['caption'], 'stamps': []}, {'id': 's', 'hud': ['stamp'], 'stamps': ['GAME_OVER']}, {'id': 'c', 'hud': ['cheat'], 'stamps': []}]}


def rec(**kw):
    r = {'t': 2.0, 'beat': 'q', 'items': ['caption'], 'strings': ['一方通行の列（2025年1月の報道）'], 'sims': [{'text': '待ち 5分（シミュレーション）', 'label': True}],
         'stamps': [], 'allowedStamps': [], 'claims': ['JR-GATE-03'], 'footnote': {'ids': ['JR-GATE-03'], 'text': '出典：シブヤ経済新聞 2025'},
         'title': {'header': True, 'logo': False}, 'safe': {'ok': True}, 'fallbacks': [], 'fade': 1}
    r.update(kw); return r


def test_check_frame_accepts():
    rv.check_frame(rec(), PLAN, FACTS)
    rv.check_frame(rec(beat='s', stamps=['gameover'], allowedStamps=['GAME_OVER'], strings=['GAME OVER']), PLAN, FACTS)
    rv.check_frame(rec(items=['notice'], notice=True, fiction=True, strings=['フィクション', '運営からのお知らせ']), PLAN, FACTS)
    rv.check_frame(rec(items=['sources'], parodyNote=True, strings=['※この動画はパロディ（フィクション）です']), PLAN, FACTS)
    soft = {}; rv.check_frame(rec(safe={'ok': False}, title={'header': False, 'logo': False}, fallbacks=['shot:x→aerial']), PLAN, FACTS, soft)
    assert soft == {'safe': 1, 'no-title': 1, 'shot:x→aerial': 1}


@pytest.mark.parametrize('bad', [
    dict(items=['notice'], notice=True, fiction=False), dict(items=['sources'], parodyNote=False),
    dict(sims=[{'text': '待ち 5分', 'label': False}]),
    dict(stamps=['gameover']), dict(strings=['GAME OVER']),
    dict(beat='s', stamps=['clear'], allowedStamps=['GAME_OVER']),
    dict(claims=['JR-GATE-03', 'NA-JR-2026']), dict(claims=['XX'], footnote={'ids': ['XX'], 'text': '出典：x'}),
    dict(claims=['TAXI-02'], footnote={'ids': ['TAXI-02'], 'text': '出典：x'}),
    dict(footnote={'ids': ['JR-GATE-03'], 'text': ''}), dict(footnote={'ids': ['JR-GATE-03'], 'text': 'x'}),
    dict(strings=['緊急速報']), dict(strings=['enable'+'X']),
    dict(beat='c'), dict(t=0.0, fade=0.0),
    dict(footBox={'top': 990, 'bottom': 1036, 'scrollH': 70, 'clientH': 52, 'limit': 1040}),
])
def test_check_frame_rejects(bad):
    with pytest.raises(AssertionError):
        rv.check_frame(rec(**bad), PLAN, FACTS)


def test_contact_times_cover_op_logo_and_body(tmp_path):
    tl = tmp_path/'t.json'
    subprocess.run(['node', 'tools/variant_cues.mjs', '_sample', '--opening', '_sample-opening', '--timeline', str(tl), '--quiet'], cwd=ROOT, check=True)
    times = rv.contact_times(json.loads(tl.read_text()))
    labels = ' | '.join(l for _, l in times)
    for want in ('OP first frame', 'OP fly', 'logo slam', 'logo hold', 'PRESS START', 'choice', 'selected', 'stamp', 'cheat', 'lesson'):
        assert want in labels, (want, labels)
    assert times[0][0] == 0 and all(a[0] < b[0] for a, b in zip(times, times[1:]))
    assert len(times) <= 20


def test_render_script_and_page_hook():
    sh = ROOT/'tools/render_variant.sh'
    subprocess.run(['bash', '-n', str(sh)], check=True)
    out = subprocess.run([str(sh), 'plan', '_sample'], cwd=ROOT, capture_output=True, text=True, env={'SEG_FRAMES': '100', 'OPENING': '_sample-opening', 'PATH': '/usr/bin:/bin:/usr/local/bin'})
    assert out.returncode == 0 and 'opening 180 frames: 0-100 ~' in out.stdout and '| 100-180 ~' in out.stdout and 'cap 45 min): OK' in out.stdout, out.stdout+out.stderr
    app = (ROOT/'web3d/shibuya/app.mjs').read_text(encoding='utf-8')
    assert "params.has('variant')?'./series/app-variant.mjs':'./series/app-jr.mjs'" in app
    page = (ROOT/'web3d/shibuya/series/app-variant.mjs').read_text(encoding='utf-8')
    for api in ('window.__variantPlan', 'window.__warmup', 'window.__frame', 'window.__variantOverlay'): assert api in page
    assert rv.encoder_cmd(Path('x.mp4'))[rv.encoder_cmd(Path('x.mp4')).index('-movflags')+1].startswith('+frag_keyframe')
