"""Behavioral regressions from the publication review."""
from collections import Counter
import copy
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

import pytest

from asagaya_town_sim import cli, llm, promo
from asagaya_town_sim.model import (
    ALTERNATIVES, COSLAT, HOURS, SCENARIOS, SHOP_CATEGORIES,
    Sim, Town, run_all, site_passages, summarize,
)

ROOT = Path(__file__).resolve().parents[1]


def test_poi_ids_isolate_duplicate_names_and_nonshops():
    town = Town()
    la, lo = town.coord[town.site_node]
    town.pois = [
        dict(id=0, name='same café', cat='cafe', lat=la, lon=lo, node=town.site_node, attr=1),
        dict(id=1, name='same café', cat='cafe', lat=la+.003, lon=lo, node=town.site_node, attr=1),
        dict(id=2, name='park', cat='park', lat=la, lon=lo, node=town.site_node, attr=1),
        dict(id=3, name='school', cat='school', lat=la, lon=lo, node=town.site_node, attr=1),
    ]
    sim = Sim(town, residents=0, visitors=0, commuters=0)
    assert sim.site_vicinity == {0}
    run = sim.run(SCENARIOS['baseline'])
    run['visits'] = Counter({0:2, 1:100, 2:200, 3:300})
    run['induced'] = Counter({0:3, 1:50})
    result = summarize(sim, [run])
    assert result['nearby_shop_visits'] == 5
    assert result['by_cat']['cafe'] == 155
    assert result['by_cat']['park'] == 200
    assert {p['id'] for p in result['poi_visits']} == {0,1,2,3}
    assert 'park' not in SHOP_CATEGORIES and 'school' not in SHOP_CATEGORIES


def test_passages_ignore_road_subdivision_and_count_reentry():
    center = (35.7, 139.6)
    def pt(x):
        return (center[0], center[1]+x/(111320*COSLAT))
    assert site_passages([pt(-100),pt(100)], center) == 1
    assert site_passages([pt(x) for x in (-100,-50,-30,-10,0,10,30,50,100)], center) == 1
    assert site_passages([pt(-100),pt(0),pt(100),pt(0),pt(-100)], center) == 2
    assert site_passages([pt(0)], center) == 0
    assert site_passages([pt(50),pt(100)], center) == 0


def test_detours_leave_before_closing_and_tracks_are_monotonic():
    sim = Sim()
    run = sim.run(SCENARIOS['baseline'], seed=0, record=900)
    pois = {p['id']:p for p in sim.town.pois}
    assert any(kind == 'induced' for _,_,_,kind in run['visit_events'])
    dwell = {}
    for pid, start, end, kind in run['visit_events']:
        poi = pois[pid]
        assert any(a <= start <= end <= b for a,b in poi.get('hours') or HOURS[poi['cat']])
        dwell.setdefault(poi['cat'], []).append(end-start)
    for cat, values in run['dwell'].items():
        assert sum(values) == pytest.approx(sum(dwell[cat]))
    for track in run['tracks']:
        times = [f[0] for f in track['f']]
        assert times == sorted(times), track['name']
    assert 0 < run['site_people'] <= run['site_pass']


def test_joint_scenario_alternative_results():
    sim = Sim(residents=15, visitors=15, commuters=5)
    data = run_all(sim, seeds=1, record=10)
    for scenario in ('rain','event'):
        for alt in ALTERNATIVES:
            raw = sim.run(dict(SCENARIOS[scenario], site=alt), seed=0, record=10)
            result = data['scenario_alternatives'][f'{scenario}:{alt}']
            assert result['summary'] == summarize(sim, [raw])
            assert result['tracks'] == raw['tracks']
            assert bool(any(p['id'] == -1 for p in result['extra'])) == (alt == 'cafe')
            assert result['heat']


@pytest.mark.parametrize('flag,value', [('--seeds','0'),('--seeds','-1'),('--residents','-1'),('--visitors','-1'),('--commuters','-1'),('--record','-1')])
def test_cli_rejects_invalid_counts_before_build(monkeypatch, flag, value):
    monkeypatch.setattr(cli, 'build', lambda _: pytest.fail('invalid counts reached build'))
    with pytest.raises(SystemExit) as exc:
        cli.main(['demo', flag, value, '--no-llm'])
    assert exc.value.code == 2


@pytest.mark.parametrize('key', ['residents','visitors','commuters'])
def test_library_rejects_negative_population(key):
    with pytest.raises(ValueError, match=key):
        Sim(**{key:-1})


def test_library_rejects_invalid_seeds_and_record():
    sim = Sim(residents=0, visitors=0, commuters=0)
    for kwargs in ({'seeds':0}, {'seeds':1,'record':-1}):
        with pytest.raises(ValueError):
            run_all(sim, **kwargs)
    with pytest.raises(ValueError, match='record'):
        sim.run(SCENARIOS['baseline'], record=-1)
    # Zero population and zero recording are valid.
    assert run_all(sim, seeds=1, record=0)['alternatives']['bike']['summary']['agents'] == 0


@pytest.mark.parametrize('area', ['asagaya','koenji'])
def test_single_area_export_and_attribution(tmp_path, area):
    args = cli.main(['build', '--area',area,'--no-llm','--seeds','1','--residents','0','--visitors','0','--commuters','0','-o',str(tmp_path)])
    data = json.loads((tmp_path/'web3d/data/engine.json').read_text())
    assert data['available_areas'] == [area]
    assert json.loads((tmp_path/f'web3d/data/engine_{area}.json').read_text()) == data
    for base in (tmp_path,tmp_path/'web3d/data'):
        for name in ('LICENSE','NOTICE'):
            assert (base/name).read_bytes() == (ROOT/name).read_bytes()
    index = (tmp_path/'web3d/data/index.html').read_text()
    assert 'engine.json' in index and 'ODbL' in index


@pytest.mark.parametrize('base', ['http://example.com/v1','ftp://localhost/v1','https://user:pass@example.com/v1','https://example.com/v1?key=test'])
def test_llm_refuses_insecure_or_credential_urls(monkeypatch, base):
    monkeypatch.setenv('OPENAI_BASE_URL',base)
    with pytest.raises(ValueError, match='HTTPS'):
        llm.LLMPlanner()


@pytest.mark.parametrize('code', [301,302,303,307,308])
def test_llm_never_follows_authenticated_redirect(monkeypatch, tmp_path, code):
    """Drive urllib's real redirect handling with a transport that returns a redirect."""
    from email.message import Message
    from io import BytesIO
    from urllib.response import addinfourl
    sent = []
    class Transport(urllib.request.HTTPSHandler):
        def https_open(self, request):
            sent.append(request)
            headers = Message()
            headers['Location'] = 'http://other.example/steal'
            result = addinfourl(BytesIO(b''), headers, request.full_url, code)
            result.msg = 'Redirect'
            return result
    monkeypatch.setenv('OPENAI_BASE_URL','https://api.example/v1')
    monkeypatch.setenv('XDG_CACHE_HOME',str(tmp_path))
    monkeypatch.setenv('OPENAI_API_KEY','dummy')
    planner = llm.LLMPlanner()
    planner.opener = urllib.request.build_opener(llm.NoRedirect(),Transport())
    with pytest.raises(urllib.error.HTTPError):
        planner._chat('test')
    assert len(sent) == 1 and sent[0].get_header('Authorization') == 'Bearer dummy'


def test_embedded_json_cannot_close_script():
    attack = '</script><script>globalThis.pwned=true</script><img src=x onerror=alert(1)>'
    html = cli.render_html({'reviews':[{'persona':attack,'scenario':attack,'review':attack}]})
    assert attack not in html
    assert '\\u003c/script>' in html
    embedded = html.split('const D=',1)[1].split(';\nconst C=',1)[0]
    assert json.loads(embedded)['reviews'][0]['review'] == attack


def test_text_display_sinks_for_external_strings():
    for path in ('src/asagaya_town_sim/template.html','prototype/template.html'):
        text = (ROOT/path).read_text()
        assert ".bindTooltip(p.name" not in text
        assert "bindTooltip(textElement('span',p.name" in text
        assert '.textContent=String(text)' in text
        assert "top_pois.forEach" in text
    text = (ROOT/'src/asagaya_town_sim/template.html').read_text()
    assert "list.append(textElement('li'," in text


def test_prototype_map_attribution_and_safe_json():
    import ast
    tree = ast.parse((ROOT/'prototype/sim.py').read_text())
    strings = [n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)]
    assert any('© OpenStreetMap contributors' in s and 'https://www.openstreetmap.org/copyright' in s for s in strings)
    assert '\\u003c' in strings


def test_viewer_attribution_matches_data_used():
    for path in ('web3d/sol/index.html','web3d/promo/index.html','web3d/astra/index.html','web3d/terra/index.html'):
        text = (ROOT/path).read_text()
        for required in ('https://www.openstreetmap.org/copyright','https://opendatacommons.org/licenses/odbl/1-0/','../data/NOTICE','../data/index.html'):
            assert required in text, (path, required)
    for path in ('web3d/sol/index.html','web3d/promo/index.html'):
        assert '国土地理院の標高タイルを加工して作成' in (ROOT/path).read_text()
    for path in ('src/asagaya_town_sim/template.html','prototype/template.html'):
        assert '国土地理院' not in (ROOT/path).read_text()


def test_license_resources_and_viewer_copies_match():
    for name in ('LICENSE','NOTICE'):
        assert (ROOT/'src/asagaya_town_sim/licenses'/name).read_bytes() == (ROOT/name).read_bytes()
    for source,target in (('web3d/sol','src/asagaya_town_sim/web3d/default'),('web3d/promo','src/asagaya_town_sim/web3d/promo')):
        for path in (ROOT/source).iterdir():
            if path.name not in ('verify.mjs','README.md'):
                assert path.read_bytes() == (ROOT/target/path.name).read_bytes()


def test_bilingual_readme_tables_match_exports():
    import sys
    subprocess.run([sys.executable, str(ROOT/'tools/update_readme_tables.py'), '--check'],check=True)
    for filename, other in (('README.md','README.en.md'),('README.en.md','README.md')):
        text = (ROOT/filename).read_text()
        intro = text.split('## ',1)[0]
        assert other in intro
        assert 'https://haginot.github.io/asagaya-town-sim/' in intro
        assert 'seed 0' in text
        assert 'http://127.0.0.1:8765/2d.html#compare' in text
        assert 'asagaya-town-sim promo demo --serve --no-open --port 8765' in text
        assert '126.57' in text and '-3.00' in text
        assert 'Node.js 20' in text


def test_recording_helper_caption_schedule_and_ending():
    import re
    script = (ROOT/'tools/record_promo.sh').read_text()
    subprocess.run(['bash','-n',str(ROOT/'tools/record_promo.sh')],check=True)
    caps = json.loads(re.search(r"CAPS='(.*?)'",script)[1])
    assert caps[0][0] == 0 and 'seed 0' in caps[0][1]
    assert caps[-1][0] == 25 and '95%' in caps[-1][1]
    assert all(len(cap)==3 and cap[1] and cap[2] for cap in caps)
    assert 'speed=25' in script and '30 1280 720 30' in script
    assert 'trap cleanup EXIT' in script and 'mktemp -d' in script


def test_pages_ci_installs_package_and_runs_viewer_checks():
    workflow = (ROOT/'.github/workflows/pages.yml').read_text()
    assert 'python -m pip install -e . pytest' in workflow
    assert 'actions/setup-node@v4' in workflow
    for script in ('web3d/sol/verify.mjs','web3d/astra/check.mjs','web3d/promo/verify.mjs'):
        assert f'node --experimental-vm-modules {script}' in workflow
