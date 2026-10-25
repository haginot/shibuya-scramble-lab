"""Series pilot recorder (tools/record_series.py) and shot list (series/director-jr.mjs, overlay-jr.mjs):
checks run without a browser — the director/overlay modules are evaluated in node."""
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import record_series as rs  # noqa: E402


def node(js):
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT, text=True))


@pytest.fixture(scope='module')
def plan():
    return node("import('./web3d/shibuya/series/director-jr.mjs').then(m=>{const ts=[];for(let f=0;f<m.FRAMES;f++)ts.push(m.simAt(f/30,191.5));"
                "console.log(JSON.stringify({fps:m.FPS,duration:m.DURATION,frames:m.FRAMES,sections:m.SECTIONS,sim:ts,fade:[0,1,2,8.95,9,30,57.9].map(m.fadeAt)}))})")


def test_plan_matches_recorder(plan):
    rs.check_plan(plan)
    assert (plan['fps'], plan['duration']) == (rs.FPS, rs.DURATION)
    assert rs.OUT_SIZE == (1080, 1920) and rs.VIEWPORT == (720, 1280) and rs.VIEWPORT[0]*rs.SCALE == 1080


def test_sim_clock_is_monotonic_and_resumable(plan):
    sim = plan['sim']
    assert all(b >= a-1e-9 for a, b in zip(sim, sim[1:])), 'JR time must never go back (segments catch up by stepping forward)'
    assert sim[0] < 0 < sim[12*30+1], 'player spawns on screen during the mission shot'
    assert sim[int(23.5*30)] >= 191.5, 'interior starts after the player is admitted (ESCAPED stamp)'


def test_fades(plan):
    f = plan['fade']
    assert f[0] == 0 and f[2] == 1 and f[5] == 1 and f[4] < 1


def frame(**kw):
    rec = {'t': 20.0, 'section': 'walk', 'title': {'header': True, 'card': False}, 'parody': True,
           'strings': [rs.TITLE, rs.SUBTITLE, rs.PARODY, '改札前の待ち 12人\n（シミュレーション）'],
           'sims': [{'key': 'queue', 'shown': {'queue': '12'}, 'src': {'value': 12}, 'text': '改札前の待ち 12人\n（シミュレーション）', 'label': True}],
           'claims': ['JR-A-hachiko'], 'footnote': {'ids': ['JR-A-hachiko'], 'text': '出典：© OpenStreetMap contributors'}}
    rec.update(kw)
    return rec


FACTS = ({'JR-A-hachiko': {'na': False}, 'NA-JR-2026': {'na': True}}, {'TAXI-02'})


def test_check_frame_accepts_a_good_frame():
    rs.check_frame(frame(), facts=FACTS)


@pytest.mark.parametrize('bad', [
    dict(title={'header': False, 'card': False}),
    dict(parody=False),
    dict(strings=[rs.TITLE, rs.SUBTITLE]),
    dict(sims=[{'key': 'queue', 'shown': {'queue': '12'}, 'src': {'value': 12}, 'text': '改札前の待ち 12人', 'label': False}]),
    dict(sims=[{'key': 'queue', 'shown': {'queue': '13'}, 'src': {'value': 12}, 'text': '13人（シミュレーション）', 'label': True}]),
    dict(sims=[{'key': 'density', 'shown': {'d': '3.0'}, 'src': {'value': 3.26}, 'text': '3.0（シミュレーション）', 'label': True}]),
    dict(claims=['JR-A-hachiko', 'MEAS-06'], footnote={'ids': ['JR-A-hachiko'], 'text': '出典：x'}),
    dict(claims=['XX-99'], footnote={'ids': ['XX-99'], 'text': '出典：x'}),
    dict(claims=['TAXI-02'], footnote={'ids': ['TAXI-02', 'JR-A-hachiko'], 'text': '出典：x'}),
    dict(footnote={'ids': ['JR-A-hachiko'], 'text': ''}),
    dict(strings=[rs.TITLE, rs.SUBTITLE, rs.PARODY, 'GAME OVER']),
    dict(section='ask'),
    dict(footBox={'top': 990, 'bottom': 1036, 'scrollH': 70, 'clientH': 52, 'limit': 1040}),
    dict(footBox={'top': 1020, 'bottom': 1060, 'scrollH': 40, 'clientH': 40, 'limit': 1040}),
])
def test_check_frame_rejects(bad):
    with pytest.raises(AssertionError):
        rs.check_frame(frame(**bad), facts=FACTS)


def test_check_frame_accepts_a_fitting_footnote():
    rs.check_frame(frame(footBox={'top': 1002, 'bottom': 1036, 'scrollH': 34, 'clientH': 34, 'limit': 1040}), facts=FACTS)


def test_tally_keys_walk_alt_route_apart_from_the_gates():
    """QA C1: the walk-alt sim route (edge of the modelled area, not Harajuku) is keyed 「別」 in the tally, never 'D'
    (D = 中央改札 in the gate choice and the closing question), and shows the OSM walk time to the station."""
    js = r"""
const el=()=>({innerHTML:'',children:[],append(){},id:''});
const ids=['pins','top','card','stamp','caps','tags','foot','clock','head','parody'];
globalThis.document={head:{append(){}},createElement(){const r=el();Object.defineProperty(r,'innerHTML',{set(v){r.children=ids.map(i=>({id:'sj-'+i,innerHTML:''}));},get(){return ''}});return r;}};
const m=await import('./web3d/shibuya/series/overlay-jr.mjs');
const run={summary:{walkersPerRoute:24,routes:[{key:'A',outcome:'escaped',timeP50:185,sources:['JR-A-hachiko']},{key:'D',outcome:'escaped',timeP50:443,sources:['ALT-HARA-H']}]},
 routes:[{key:'A',kind:'gate',label:{ja:'ハチ公改札'}},{key:'D',kind:'walk-alt',label:{ja:'原宿駅まで歩く（JR山手線）'}}]};
const ov=new m.SeriesOverlay({append(){}},{run});
console.log(JSON.stringify(ov.update({t:47.5,section:'tally',local:1.5,u:.5,jr:null,proj:{},W:720,H:1280})));"""
    rec = node(js)
    rs.check_frame(rec)
    text = '\n'.join(rec['strings'])
    assert '原宿駅まで歩く' not in text and 'D 原宿' not in text
    alt = next(s for s in rec['sims'] if s['key'] == 'routeD')
    assert alt['text'].startswith('原宿方面：規制エリア外まで') and '07:23' in alt['text'] and 'OSMから概算' in alt['text']
    assert '別' in rec['strings'] and 'ALT-HARA-H' in rec['claims']
    assert rec['stamps'] == ['clear'] and rec['gameOver'] == {'escaped': 2, 'total': 2, 'outcomes': ['escaped', 'escaped']}


def test_game_over_only_in_tally():
    rs.check_frame(frame(section='tally', strings=[rs.TITLE, rs.SUBTITLE, rs.PARODY, 'GAME OVER'], gameOver={'escaped': 2, 'total': 3, 'outcomes': ['escaped', 'escaped', 'caught']}), facts=FACTS)
    with pytest.raises(AssertionError):
        rs.check_frame(frame(section='tally', gameOver={'escaped': 3, 'total': 3, 'outcomes': ['escaped', 'escaped', 'caught']}), facts=FACTS)


def test_number_formats_match_js():
    assert rs.p1(2.25) == '2.3' and rs.p1(4) == '4.0' and rs.fmt(1234.5) == '1,235' and rs.mmss(190.9) == '03:10' and rs.mmss(None) == '--:--'
    js = node("import('./web3d/shibuya/series/overlay-jr.mjs').then(m=>console.log(JSON.stringify([m.p1(2.25),m.p1(4),m.fmt(1234.5),m.mmss(190.9),m.mmss(null)])))")
    assert js == [rs.p1(2.25), rs.p1(4), rs.fmt(1234.5), rs.mmss(190.9), rs.mmss(None)]


def test_fact_table_has_series_facts():
    known, dropped = rs.fact_table()
    assert 'JR-A-hachiko' in known and 'TAXI-02' in dropped and not dropped & set(known)


def test_overlay_frames_pass_checks():
    """Every section of the overlay (no WebGL; minimal DOM stub) produces a record that passes check_frame."""
    js = r"""
const el=()=>({innerHTML:'',children:[],append(){},id:''});
const ids=['pins','top','card','stamp','caps','tags','foot','clock','head','parody'];
globalThis.document={head:{append(){}},createElement(){const r=el();Object.defineProperty(r,'innerHTML',{set(v){r.children=ids.map(i=>({id:'sj-'+i,innerHTML:''}));},get(){return ''}});return r;}};
const m=await import('./web3d/shibuya/series/overlay-jr.mjs');const D=await import('./web3d/shibuya/series/director-jr.mjs');
const run={summary:{walkersPerRoute:24,routes:[{key:'A',outcome:'escaped',timeP50:186,sources:['JR-A-hachiko','JR-GATE-03'],player:{doneAt:190.9}},{key:'B',outcome:'escaped',timeP50:187,sources:['JR-B-south']}]},
 routes:[{key:'A',label:{ja:'ハチ公改札'}},{key:'B',label:{ja:'南改札'}}]};
const ov=new m.SeriesOverlay({append(){}},{run});
const jr={player:{x:30,z:30,walking:true,reachedAt:null},density:{camera:{max:2.26}},gates:[{key:'hachiko',queue:17}]};
const pt={x:300,y:600,inFrame:true};
const out=[];for(let f=0;f<D.FRAMES;f+=7){const t=f/30,S=D.sectionAt(t);
 out.push(ov.update({t,section:S.key,local:S.local,u:S.u,clip:t>=13.5&&t<23.5?Math.min(4,Math.floor((t-13.5)/2)):null,wp:t>=13.5&&t<23.5?D.WALK_CLIPS[Math.min(4,Math.floor((t-13.5)/2))].wp:null,
  jr,proj:{start:pt,player:pt,gates:{A:pt,B:pt,C:pt,D:pt},taxi:pt,stations:[{key:'harajuku',...pt},{key:'yoyogi',...pt},{key:'ebisu',x:400,y:900,inFrame:true}],redZone:pt},W:720,H:1280}));}
console.log(JSON.stringify({recs:out,plan:{sections:D.SECTIONS}}));"""
    data = node(js)
    secs = set()
    for rec in data['recs']:
        rs.check_frame(rec, data['plan'])
        secs.add(rec['section'])
    assert secs == {s[0] for s in data['plan']['sections']}
    walk = [r for r in data['recs'] if r['section'] == 'walk']
    assert any(s['key'] == 'queue' for r in walk for s in r['sims'])
    tally = [r for r in data['recs'] if r['section'] == 'tally']
    assert tally and all(r['gameOver']['total'] == 2 for r in tally)


def test_render_script_plan_is_complete():
    sh = (ROOT/'tools/render_series.sh').read_text(encoding='utf-8')
    plan = sh.split('PLAN=(')[1].split(')')[0].split()
    spans = [tuple(map(int, p.split(':'))) for p in plan]
    assert spans[0][0] == 0 and spans[-1][1] == rs.FRAMES and all(a[1] == b[0] for a, b in zip(spans, spans[1:]))
    assert f'FRAMES={rs.FRAMES}' in sh and 'fps=16/58' in sh and 'tile=4x4' in sh
    assert all(k in sh for k in ('run)', 'count)', 'join)', 'contact)'))


def test_encoder_is_fragmented_1080x1920():
    cmd = ' '.join(rs.encoder_cmd(Path('x.mp4')))
    assert 'frag_keyframe' in cmd and 'scale=1080:1920' in cmd and 'yuv420p' in cmd and '-r 30' in cmd


def test_app_hook_is_small_and_mirrored():
    app = (ROOT/'web3d/shibuya/app.mjs').read_text(encoding='utf-8')
    assert "params.get('mode')==='series'" in app and './series/app-jr.mjs' in app
    assert app == (ROOT/'src/asagaya_town_sim/web3d/shibuya/app.mjs').read_text(encoding='utf-8')
