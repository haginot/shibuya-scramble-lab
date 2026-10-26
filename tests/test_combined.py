"""JR編 combined episodes (series/variant-system.mjs combined support, tools/combined_configs.mjs, tools/variant_cues.mjs
combined ids, tools/combined_pipeline.py, tools/render_combined.sh, record_variant.py combined labels): checks without a
browser — the JS modules are evaluated in node; the pipeline steps run on tiny synthetic videos."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import combined_pipeline as cp  # noqa: E402
import record_variant as rv  # noqa: E402

CFG_DIR = ROOT/'web3d/shibuya/series/variants/jr'
PAIRS = ['gate', 'taxi', 'zone', 'alt']
ORDER = ['over-start', 'over-choice', 'over-move', 'over-result', 'caught', 'over-stamp', 'over-lesson', 'continue',
         'clear-choice', 'clear-move', 'clear-result', 'clear-stamp', 'clear-cheat', 'kaiju', 'endcard', 'sources']
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
COMBINED = {p: load(CFG_DIR/'combined'/f'{p}.json') for p in PAIRS}
PARTS = {i: load(CFG_DIR/f'{i}.json') for p in PAIRS for i in (f'{p}-over', f'{p}-clear')}
OPENING = load(CFG_DIR/'_opening.json')

PRELUDE = ("import * as V from './web3d/shibuya/series/variant-system.mjs';"
           "import {FACTS,DROPPED} from './web3d/shibuya/series/sources-series.mjs';"
           "const OPT={facts:FACTS,dropped:[...DROPPED]};"
           "const IN=JSON.parse(process.argv[1]);const out=x=>console.log(JSON.stringify(x));")


def node(body, data=None):
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', PRELUDE+body, json.dumps(data or {})], cwd=ROOT, text=True))


def validate(cfg, configs=True):
    return node("out(V.validateConfig(IN.cfg,{...OPT,part:'body',configs:IN.configs}));", {'cfg': cfg, 'configs': PARTS if configs else None})


def cues_cli(*args):
    r = subprocess.run(['node', 'tools/variant_cues.mjs', *args], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


# ---------------------------------------------------------------- configs
def test_generator_reproduces_configs():
    r = subprocess.run(['node', 'tools/combined_configs.mjs', '--check'], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout+r.stderr


@pytest.mark.parametrize('pair', PAIRS)
def test_combined_config_valid(pair):
    v = validate(COMBINED[pair])
    assert v['ok'], v['errors']
    assert [b['id'] for b in COMBINED[pair]['beats']] == ORDER
    # also valid in the page (no part configs)
    assert validate(COMBINED[pair], configs=False)['ok']


def test_validate_combined_cli_and_video_length():
    rc, out, err = cues_cli('--validate-combined')
    assert rc == 0, out+err
    d = json.loads(out)
    assert sorted(d['combined']) == [f'combined/{p}' for p in sorted(PAIRS)]
    for v in d['combined'].values():
        assert v['ok'] and 60 <= v['duration'] <= 80, v
    # the variant check (render_variant.sh check) ignores the combined/ subdir
    rc, out, _ = cues_cli('--list')
    assert rc == 0 and 'combined' not in out


def mutate(pair, fn):
    c = copy.deepcopy(COMBINED[pair]); fn(c); return c


beat = lambda c, i: next(b for b in c['beats'] if b['id'] == i)
BAD = {
    'order': lambda c: c['beats'].insert(6, c['beats'].pop(7)),
    'missing-reuse': lambda c: beat(c, 'over-start').pop('reuse'),
    'wrong-reuse': lambda c: beat(c, 'over-move').update(reuse={'variant': c['parts']['over'], 'beat': 'result'}),
    'reuse-on-new': lambda c: beat(c, 'kaiju').update(reuse={'variant': c['parts']['over'], 'beat': 'start'}),
    'reuse-dur': lambda c: beat(c, 'over-lesson').update(dur=4.0),
    'gameover-elsewhere': lambda c: beat(c, 'continue')['hud'].append({'c': 'stamp', 'kind': 'GAME_OVER', 'factIds': []}),
    'clear-in-over': lambda c: beat(c, 'over-stamp')['hud'][0].update(kind='GAME_CLEAR'),
    'same-pick': lambda c: [h.update(picked=c['choice']['picked']) for h in beat(c, 'clear-choice')['hud'] if h['c'] == 'choice'],
    'caught-header': lambda c: beat(c, 'caught').pop('header'),
    'kaiju-bgm': lambda c: beat(c, 'kaiju').update(bgm='tension'),
    'sources-union': lambda c: c['sources'].pop(),
    'outcome': lambda c: c.update(outcome='CLEAR'),
    'recommend': lambda c: beat(c, 'endcard')['hud'][0].update(sub='おすすめは南改札'),
    'alert': lambda c: beat(c, 'kaiju')['hud'][0].update(ja='緊急速報！'),
    'banned': lambda c: beat(c, 'continue')['hud'][0].update(ja='c'+'anlyでやり直す'),
    'sim-label': lambda c: beat(c, 'caught')['hud'][0].update(ja='囲まれて動けない…'),
    'clock-format': lambda c: beat(c, 'clear-choice').update(clock={'set': '22:3'}),
}


@pytest.mark.parametrize('name', sorted(BAD))
def test_combined_validator_rejects(name):
    v = validate(mutate('gate', BAD[name]))
    assert not v['ok'], name


def test_reshoot_rules():
    # zone/alt re-shoot clear-result/clear-stamp (origin), gate/taxi reuse them; only those two may be re-shot
    for p in PAIRS:
        cr = beat(COMBINED[p], 'clear-result')
        assert ('origin' in cr) == (p in ('zone', 'alt')) and ('reuse' in cr) == (p in ('gate', 'taxi'))
    c = mutate('gate', lambda c: beat(c, 'over-move').update(origin=beat(c, 'over-move').pop('reuse')))
    assert not validate(c)['ok']


# ---------------------------------------------------------------- timeline / reuse map / clock
def reuse_map(pair):
    rc, out, err = cues_cli('--reuse-map', f'combined/{pair}')
    assert rc == 0, err
    return json.loads(out)


@pytest.mark.parametrize('pair', PAIRS)
def test_reuse_map(pair):
    m = reuse_map(pair)
    assert m['frames'] == 1665
    beats = {b['id']: b for b in m['beats']}
    assert beats['over-start']['src'] == {'variant': f'{pair}-over', 'beat': 'start', 'f0': 0, 'f1': 75}
    assert beats['over-lesson']['src']['f0'] == 525 and beats['clear-cheat']['src'] == {'variant': f'{pair}-clear', 'beat': 'cheat', 'f0': 675, 'f1': 780}
    new = [b['id'] for b in m['beats'] if b['mode'] == 'new']
    fixed = ['clear-result', 'clear-stamp'] if pair in ('zone', 'alt') else []
    assert new == ['caught', 'over-stamp', 'continue', *fixed, 'kaiju', 'endcard', 'sources']
    # pieces tile the body; consecutive source beats merge into one extraction
    p = m['pieces']
    assert p[0]['f0'] == 0 and p[-1]['f1'] == 1665 and all(a['f1'] == b['f0'] for a, b in zip(p, p[1:]))
    assert p[0]['mode'] == 'reuse' and p[0]['src'] == {'variant': f'{pair}-over', 'f0': 0, 'f1': 450}
    assert all(x['frames'] <= 300 for x in p if x['mode'] == 'new')  # each new range ≤ one 300-frame segment
    assert m['sources'][f'{pair}-over']['frames'] == 840


@pytest.mark.parametrize('pair', ['zone', 'alt'])
def test_reshot_beats_match_the_original(pair):
    """The re-shot clear beats see the original's camera time, crowd-state time, clock and background-solver time."""
    d = node("""const C=IN.cfg,S=IN.src,O=IN.op;const res=[];
     const P=V.buildPart(C,'body'),SP=V.buildPart(S,'body'),OP=V.buildPart(O,'opening');P.offset=OP.duration;SP.offset=OP.duration;
     for(const [id,sid] of [['clear-result','result'],['clear-stamp','stamp']]){const b=P.beats.find(x=>x.id===id),sb=SP.beats.find(x=>x.id===sid);
      for(const l of [0,1.3,2.4,b.dur-1/30]){const a=V.frameSpec(P,C,b.t0+l),z=V.frameSpec(SP,S,sb.t0+l);
       res.push({id,l,shot:[a.shot.local,z.shot.local],crowd:[a.crowd?.t,z.crowd?.t],clock:[a.clock?.time,z.clock?.time],vt:[a.vt,z.vt],key:[a.shot.key,z.shot.key],ck:[a.crowd?.key,z.crowd?.key]});}}
     out(res);""", {'cfg': COMBINED[pair], 'src': PARTS[f'{pair}-clear'], 'op': OPENING})
    for r in d:
        for k in ('shot', 'crowd', 'vt'):
            a, b = r[k]
            assert (a is None and b is None) or abs(a-b) < 1e-6, r
        assert r['clock'][0] == r['clock'][1] and r['key'][0] == r['key'][1] and r['ck'][0] == r['ck'][1], r


@pytest.mark.parametrize('pair', PAIRS)
def test_integrated_fix_and_effect_params(pair):
    """Integrator-finalised params (checked on page stills 2026-10-26): the fixes differ from the original only by the fix
    params; caught hands stay at the edges; the kaiju fits the frame; blank / end-card footnote rules on the page."""
    C, S = COMBINED[pair], PARTS[f'{pair}-clear']
    b = {x['id']: x for x in C['beats']}
    orig = next(x for x in S['beats'] if x['id'] == 'result')['shot']['params']
    for id_ in ('clear-result', 'clear-stamp'):
        sp, cr = b[id_]['shot'].get('params', {}), (b[id_].get('crowd') or {}).get('params', {})
        if pair == 'alt':
            assert sp == {**orig, 'pan': 0, 'side': 3, 'dist': 7.5, 'push': .05, 'fov': 56, 'lookDy': -.6}, sp
            assert b[id_].get('origin') and b[id_].get('fix')
        elif pair == 'zone':
            assert cr.get('clear') == {'ahead': 8, 'behind': 1.5, 'half': 2.4, 'ease': 3} and b[id_].get('origin')
        else:
            assert b[id_].get('reuse') and 'fix' not in b[id_]
    cp_ = b['caught']['shot']['params']
    assert cp_['hands']['scale'] <= .8 and cp_['hands']['reach'] <= .7
    assert (pair == 'alt') == ('board' in cp_['baseParams'])
    k = b['kaiju']['shot']['params']['kaiju']
    assert k['scale'] < 700 and k['ground'] >= 430
    assert b['endcard'].get('footnote') is False
    page = (ROOT/'web3d/shibuya/series/app-variant.mjs').read_text(encoding='utf-8')
    assert 'spec.vt??' in page and "spec.footnote===false?null" in page and 'res.blank?[]:spec.factIds' in page


@pytest.mark.parametrize('pair', PAIRS)
def test_clear_run_clock_rewinds(pair):
    """Retry: the clock of the reused clear-choice beat restarts at the original clear video's time."""
    d = node("""const C=IN.cfg,S=IN.src;const P=V.buildPart(C,'body'),SP=V.buildPart(S,'body');
     const b=P.beats.find(x=>x.id==='clear-choice'),sb=SP.beats.find(x=>x.id==='choice');
     out([V.frameSpec(P,C,b.t0+.5).clock,V.frameSpec(SP,S,sb.t0+.5).clock,V.frameSpec(P,C,P.beats.find(x=>x.id==='caught').t0+.5).clock]);""",
             {'cfg': COMBINED[pair], 'src': PARTS[f'{pair}-clear']})
    assert d[0] == d[1] and d[2] is None


def test_clock_hms_and_vt():
    d = node("""const c={id:'x',episode:'jr',clock:{start:'22:30',rate:.5},beats:[{id:'a',dur:2,shot:{key:'aerial'}},{id:'b',dur:2,shot:{key:'aerial'},clock:{set:'22:35:30'},vt0:25.2}]};
     const P=V.buildPart(c,'body');P.offset=14.2;out([V.clockAt(P,c,2.5).time,V.clockAt(P,c,3.1).time,V.frameSpec(P,c,1).vt,V.frameSpec(P,c,2.5).vt,V.fmtHMS(1355.5)]);""")
    assert d[0] == '22:35' and d[1] == '22:36' and abs(d[2]-15.2) < 1e-9 and abs(d[3]-25.7) < 1e-9 and d[4] == '22:35:30'


# ---------------------------------------------------------------- cues
@pytest.mark.parametrize('pair', PAIRS)
def test_combined_cue_sheet(pair, tmp_path):
    rc, out, err = cues_cli(f'combined/{pair}', '--out', str(tmp_path/'c.json'), '--timeline', str(tmp_path/'t.json'), '--quiet')
    assert rc == 0, out+err
    c = json.loads((tmp_path/'c.json').read_text()); tl = json.loads((tmp_path/'t.json').read_text())
    assert abs(c['duration']-69.7) < 1e-6 and c['meta']['kind'] == 'combined' and tl['kind'] == 'combined'
    T = {b['id']: b['video_t0'] for b in tl['parts']['body']['beats']}
    ev = lambda s: [e['t'] for e in c['events'] if e['sfx'] == s]
    # exactly one GAME OVER jingle (in over-stamp) and one clear jingle (in clear-stamp)
    assert len(ev('gameover_jingle')) == 1 and T['over-stamp'] <= ev('gameover_jingle')[0] < T['over-lesson']
    assert len(ev('clear_jingle')+ev('escaped')) == 1 and T['clear-stamp'] <= (ev('clear_jingle')+ev('escaped'))[0] < T['clear-cheat']
    for s in ('crowd_press', 'zombie_groan', 'red_flash', 'caught_hit', 'cut_black'):
        assert ev(s) and T['caught'] <= ev(s)[0] < T['over-stamp'], s
    assert len(ev('continue_tick')) == 3 and ev('continue_yes') and T['continue'] <= ev('continue_yes')[0] < T['clear-choice']
    assert ev('kaiju_roar') and T['kaiju'] <= ev('kaiju_roar')[0] < T['endcard'] and ev('smash_cut') == [T['endcard']]
    # BGM off during caught, the black stamp and the kaiju gag
    for b in c['bgm']:
        for i in ('caught', 'over-stamp', 'kaiju'):
            nxt = {'caught': 'over-stamp', 'over-stamp': 'over-lesson', 'kaiju': 'endcard'}[i]
            assert b['t1'] <= T[i]+1e-6 or b['t0'] >= T[nxt]-1e-6, (i, b)
    # the reused ranges carry their source cues at the same beat-local times (gameover/clear runs sound like the originals)
    src = json.loads(subprocess.check_output(['node', 'tools/variant_cues.mjs', f'{pair}-over', '--out', '/dev/stdout', '--quiet'], cwd=ROOT, text=True))
    within = lambda evs, a, b: sorted((round(e['t']-a, 3), e['sfx']) for e in evs if a-1e-6 <= e['t'] < b-1e-6)
    assert within(c['events'], T['over-start'], T['caught']) == within(src['events'], 14.2, 14.2+15)


def test_continue_timing_matches_hud():
    d = node("""import('./web3d/shibuya/series/ui/components.mjs').then(H=>{const a=V.continueTiming({count:3,yesAt:2},3),b=H.continueTiming?H.continueTiming({dur:3,count:3,yesAt:2}):null;
      out({a,b:b?{ticks:b.ticks,yesAt:b.yesAt}:null});});""")
    if d['b'] is None: pytest.skip('HUD continueTiming not available')
    assert d['a']['tickAt'] == d['b']['ticks'] and d['a']['yesAt'] == d['b']['yesAt']


def test_copy_rules():
    """New combined copy: no numbers in the safety / gag / continue / end lines (plain game advice), sim chip labelled."""
    import re
    for p, c in COMBINED.items():
        st = beat(c, 'over-stamp')['hud'][0]
        assert st['onBlack'] and not re.search(r'\d', st['safety']['ja']) and not st['safety']['factIds'], p
        for i, comp in (('kaiju', 'gag'), ('continue', 'continue'), ('endcard', 'endcard')):
            h = next(h for h in beat(c, i)['hud'] if h['c'] == comp)
            assert not re.search(r'\d', h['ja']) and not h['factIds'], (p, i)
        assert all(len(line) <= 9 for line in next(h for h in beat(c, 'kaiju')['hud'] if h['c'] == 'gag')['ja'].split('\n')), p
        assert 'シミュレーション' in beat(c, 'caught')['hud'][0]['ja']
        assert next(h for h in beat(c, 'sources')['hud'] if h['c'] == 'sources').get('compact')


# ---------------------------------------------------------------- recorder / contact sheet
def test_check_plan_combined_range():
    plan = {'fps': 30, 'frames': 1665, 'duration': 55.5, 'part': 'body', 'id': 'combined-gate', 'variant': 'combined/gate', 'videoDuration': 69.7,
            'beats': [{'id': 'a', 'f0': 0, 'f1': 1665, 't0': 0, 't1': 55.5, 'hud': ['cheat', 'stamp'], 'stamps': ['GAME_OVER']}]}
    rv.check_plan(plan)
    with pytest.raises(AssertionError):
        rv.check_plan({**plan, 'variant': 'gate-over', 'id': 'gate-over'})


def test_contact_times_label_combined_beats(tmp_path):
    rc, out, err = cues_cli('combined/zone', '--timeline', str(tmp_path/'t.json'), '--quiet')
    assert rc == 0, err
    labels = [lab for _, lab in rv.contact_times(json.loads((tmp_path/'t.json').read_text()))]
    for want in ('caught: press', 'caught: red flash', 'caught: black', 'GAME OVER on black', 'CONTINUE? YES', 'kaiju roar', 'end card', 'sources (union)', 'FIX frame (orig 27.6s)'):
        assert any(want in lab for lab in labels), want
    times = [t for t, _ in rv.contact_times(json.loads((tmp_path/'t.json').read_text()))]
    fix = next(t for t, lab in rv.contact_times(json.loads((tmp_path/'t.json').read_text())) if 'FIX' in lab)
    tl = json.loads((tmp_path/'t.json').read_text())
    cr = next(b for b in tl['parts']['body']['beats'] if b['id'] == 'clear-result')
    assert abs(fix-(cr['video_t0']+2.4)) < 1/30 and times == sorted(times)


# ---------------------------------------------------------------- pipeline (synthetic videos, no browser)
need_ffmpeg = pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg missing')


def synth(path, frames, color):
    """A tiny test video at the delivery format whose frame number is drawn in (testsrc2 counter)."""
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=s={cp.W}x{cp.H}:r={cp.FPS}', '-vf', f'drawbox=c={color}@0.4:t=fill',
                    '-frames:v', str(frames), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', str(path)], check=True)


@need_ffmpeg
def test_pipeline_sources_join_accuracy(tmp_path, monkeypatch):
    monkeypatch.setattr(cp, 'FMT', f'{cp.W},{cp.H},yuv420p,{cp.FPS}/1')
    src = tmp_path/'src'; (src/'v-over'/'body-aaaa').mkdir(parents=True); (src/'v-over'/'body-bbbb-test30').mkdir(parents=True)
    synth(src/'v-over'/'body-aaaa'/'body.mp4', 40, 'red'); synth(src/'v-over'/'body-bbbb-test30'/'body.mp4', 30, 'blue')
    beats = [{'id': 'a', 'f0': 0, 'f1': 20}, {'id': 'b', 'f0': 20, 'f1': 40}]
    (src/'v-over'/'timeline.json').write_text(json.dumps({'parts': {'body': {'frames': 40, 'beats': beats}}}))
    op = tmp_path/'op.mp4'; synth(op, 12, 'green')
    m = {'id': 'x', 'frames': 26, 'beats': [], 'sources': {'v-over': {'frames': 40, 'beats': beats}},
         'pieces': [{'mode': 'reuse', 'f0': 0, 'f1': 8, 'frames': 8, 'beats': ['a'], 'src': {'variant': 'v-over', 'f0': 5, 'f1': 13}},
                    {'mode': 'new', 'f0': 8, 'f1': 14, 'frames': 6, 'beats': ['n']},
                    {'mode': 'reuse', 'f0': 14, 'f1': 26, 'frames': 12, 'beats': ['b'], 'src': {'variant': 'v-over', 'f0': 25, 'f1': 37}}]}
    (tmp_path/'map.json').write_text(json.dumps(m))
    assert cp.main(['sources', '--map', str(tmp_path/'map.json'), '--src-root', str(src), '--out', str(tmp_path/'s.json')]) == 0
    s = json.loads((tmp_path/'s.json').read_text())
    assert s['v-over']['body'].endswith('body-aaaa/body.mp4')  # the -test dir is never a source
    nd = tmp_path/'new'; nd.mkdir()
    # without --smoke a missing new piece is an error; with --smoke it becomes black frames
    with pytest.raises(SystemExit):
        cp.main(['join', '--map', str(tmp_path/'map.json'), '--sources', str(tmp_path/'s.json'), '--opening', str(op), '--opening-frames', '12', '--new-dir', str(nd), '--out', str(tmp_path/'v.mp4')])
    args = ['join', '--map', str(tmp_path/'map.json'), '--sources', str(tmp_path/'s.json'), '--opening', str(op), '--opening-frames', '12', '--new-dir', str(nd),
            '--out', str(tmp_path/'v.mp4'), '--report', str(tmp_path/'j.json'), '--preset', 'ultrafast', '--threads', '2']
    assert cp.main(args+['--smoke']) == 0
    assert cp.probe_frames(tmp_path/'v.mp4') == 38
    assert [p['kind'] for p in json.loads((tmp_path/'j.json').read_text())['pieces']] == ['opening', 'reuse', 'black', 'reuse']
    acc = ['accuracy', '--video', str(tmp_path/'v.mp4'), '--map', str(tmp_path/'map.json'), '--sources', str(tmp_path/'s.json'), '--opening', str(op), '--opening-frames', '12', '--out', str(tmp_path/'a.json')]
    assert cp.main(acc) == 0
    # a rendered new piece is used instead of black; an off-by-one extraction is caught by the accuracy check
    synth(cp.new_piece_path(nd, m['pieces'][1]), 6, 'yellow')
    assert cp.main(args) == 0 and [p['kind'] for p in json.loads((tmp_path/'j.json').read_text())['pieces']][2] == 'new'
    m['pieces'][2]['src'] = {'variant': 'v-over', 'f0': 26, 'f1': 38}; (tmp_path/'map.json').write_text(json.dumps(m))
    assert cp.main(args) == 0
    m['pieces'][2]['src'] = {'variant': 'v-over', 'f0': 25, 'f1': 37}; (tmp_path/'map.json').write_text(json.dumps(m))
    assert cp.main(acc) == 1


@need_ffmpeg
def test_pipeline_sources_asserts(tmp_path):
    src = tmp_path/'src'; (src/'v'/'body-a').mkdir(parents=True)
    synth(src/'v'/'body-a'/'body.mp4', 10, 'red')
    beats = [{'id': 'a', 'f0': 0, 'f1': 10}]
    (src/'v'/'timeline.json').write_text(json.dumps({'parts': {'body': {'frames': 10, 'beats': [{'id': 'a', 'f0': 0, 'f1': 9}, {'id': 'b', 'f0': 9, 'f1': 10}]}}}))
    (tmp_path/'m.json').write_text(json.dumps({'sources': {'v': {'frames': 10, 'beats': beats}}}))
    with pytest.raises(SystemExit, match='beat edges'):
        cp.main(['sources', '--map', str(tmp_path/'m.json'), '--src-root', str(src), '--out', str(tmp_path/'s.json')])
    (tmp_path/'m.json').write_text(json.dumps({'sources': {'v': {'frames': 840, 'beats': beats}}}))
    with pytest.raises(SystemExit, match='frames'):
        cp.main(['sources', '--map', str(tmp_path/'m.json'), '--src-root', str(src), '--out', str(tmp_path/'s.json')])


def test_render_combined_help_and_bad_pair():
    sh = ROOT/'tools/render_combined.sh'
    r = subprocess.run([str(sh)], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 2 and 'SMOKE=1' in r.stdout and 'MAX_SEGS' in r.stdout
    r = subprocess.run([str(sh), 'plan', 'nope'], cwd=ROOT, capture_output=True, text=True, env={'WORK': '/tmp/rc-test-work', 'PATH': '/usr/bin:/bin:/usr/local/bin'})
    assert r.returncode == 2 and 'unknown pair' in r.stderr
