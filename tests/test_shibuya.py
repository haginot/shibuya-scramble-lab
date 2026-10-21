"""The new default, installed resources, physical solver and Shibuya promotion."""
import json
from pathlib import Path
import subprocess

import pytest

from asagaya_town_sim import cli, promo, shibuya

ROOT=Path(__file__).resolve().parents[1]


def test_default_cli_is_shibuya(capsys):
    cli.main(['demo','--json','--no-llm'])
    data=json.loads(capsys.readouterr().out)
    assert data['area']=='shibuya'
    assert data['agents']==20000 and data['phase_demand']==3000
    assert 'not a prediction' in data['disclaimer']
    assert data['traffic']=='SUMO on OSM network'


def test_scale_is_explicit_not_unique_people():
    c=shibuya.load('shibuya_calibration.json')
    assert sum(s['daily']*s['proxy_factor'] for s in c['station_sources'])==c['station_event_proxy']
    assert c['station_event_proxy']==2145705
    assert shibuya.demand(15,True)==pytest.approx(3000)
    assert shibuya.demand(15)==pytest.approx(788.8621323529411)
    assert shibuya.demand(3)<shibuya.demand(8)<shibuya.demand(15)
    assert all(s['url'].startswith('https://') for s in c['station_sources'])


@pytest.mark.parametrize('kwargs',[{'agents':60001},{'agents':-1},{'hour':24},{'hour':float('nan')}])
def test_shibuya_invalid_config(kwargs):
    with pytest.raises(ValueError):shibuya.config(**kwargs)


def test_shibuya_export_and_package_resources(tmp_path):
    out=shibuya.write_site(tmp_path,shibuya.config(agents=100))
    assert 'web3d/shibuya/' in (out/'index.html').read_text()
    for name in ('shibuya_config.json','shibuya_calibration.json','shibuya_osm.json','shibuya_plateau.json','shibuya_traffic.json','promo_shibuya.json','promo.json','engine.json'):
        assert json.loads((out/'web3d/data'/name).read_text())
    assert json.loads((out/'web3d/data/shibuya_config.json').read_text())['agents']==100
    assert json.loads((out/'web3d/data/promo.json').read_text())['config']['area']=='shibuya'
    assert (out/'web3d/shibuya/worker.mjs').is_file()
    assert (out/'web3d/default/app.mjs').is_file()
    assert (out/'NOTICE').read_bytes()==(ROOT/'NOTICE').read_bytes()
    assert 'CC BY 4.0' in (out/'web3d/data/index.html').read_text()


def test_shibuya_promo_keeps_real_context_and_fictional_target(tmp_path):
    data=promo.simulate(promo.load_config(area='shibuya'),seeds=1,days=2)
    assert data['config']['area']=='shibuya'
    assert data['store']['position']==shibuya.latlon(*shibuya.STORE)
    assert 'fictional' in data['store']['name']
    out=promo.write_site(tmp_path,data)
    assert 'area=shibuya' in (out/'index.html').read_text()
    assert json.loads((out/'data/promo_shibuya.json').read_text())==data
    engine=json.loads((out/'data/engine_shibuya_promo.json').read_text())
    assert engine['area']=='shibuya' and len(engine['pois'])==1102
    assert 'PLATEAU' in (out/'promo/index.html').read_text()


def test_physical_solver():
    subprocess.run(['node',str(ROOT/'web3d/shibuya/verify.mjs'),'--stress'],check=True,timeout=90)


def test_recording_contract():
    import importlib.util
    spec=importlib.util.spec_from_file_location('record_shibuya',ROOT/'tools/record_shibuya.py')
    rec=importlib.util.module_from_spec(spec);spec.loader.exec_module(rec)
    assert rec.CAPTIONS[0][0]==0 and all(len(x)==3 for x in rec.CAPTIONS)
    script=(ROOT/'tools/record_shibuya.py').read_text()
    assert 'range(900)' in script and "'top' if seconds<3" in script
    assert "rects['metrics']['bottom'] <= rects['caption']['top']" in script
    subprocess.run(['bash','-n',str(ROOT/'tools/record_shibuya.sh')],check=True)


def test_shibuya_source_mirrors():
    for p in (ROOT/'src/asagaya_town_sim/web3d/shibuya').iterdir():
        assert p.read_bytes()==(ROOT/'web3d/shibuya'/p.name).read_bytes()
    for name in ('shibuya_osm.json','shibuya_plateau.json','shibuya_traffic.json','shibuya_config.json','shibuya_calibration.json'):
        assert (ROOT/'web3d/data'/name).read_bytes()==(ROOT/'src/asagaya_town_sim/web3d/data'/name).read_bytes()
