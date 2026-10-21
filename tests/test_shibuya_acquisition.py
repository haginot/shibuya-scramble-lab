import importlib.util
import json
from pathlib import Path

import pytest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fetch_shibuya',ROOT/'tools/fetch_shibuya.py')
fetcher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetcher)


def response():
    points=[{'lat':35.6595,'lon':139.7005},{'lat':35.6596,'lon':139.7006}]
    return json.dumps({'elements':[
        {'type':'way','id':1,'tags':{'highway':'footway'},'geometry':points},
        {'type':'way','id':2,'tags':{'railway':'rail'},'geometry':points},
        {'type':'node','id':3,'tags':{'shop':'clothes'},'lat':35.6595,'lon':139.7005},
    ]}).encode()


def test_bad_endpoint_does_not_replace_valid_cache(tmp_path,monkeypatch):
    rawfile=tmp_path/'osm.json'
    rawfile.write_bytes(b'{invalid')
    calls=[]
    def fetch(url,*args):
        calls.append(url)
        return b'{"remark":"timeout","elements":[]}' if len(calls)==1 else response()
    monkeypatch.setattr(fetcher,'fetch',fetch)
    result=fetcher.osm(tmp_path)
    assert len(calls)==2
    assert result['roads'] and result['shops']
    assert rawfile.read_bytes()==response()
    calls.clear()
    assert fetcher.osm(tmp_path)==result
    assert not calls


def test_all_invalid_responses_leave_cache_intact(tmp_path,monkeypatch):
    rawfile=tmp_path/'osm.json'
    bad=b'{"remark":"timeout","elements":[]}'
    rawfile.write_bytes(bad)
    monkeypatch.setattr(fetcher,'fetch',lambda *args:bad)
    with pytest.raises(RuntimeError,match='Incomplete'):
        fetcher.osm(tmp_path)
    assert rawfile.read_bytes()==bad
    assert not rawfile.with_suffix('.json.tmp').exists()


def test_benchmark_reports_simulation_slowdown():
    import sys
    sys.path.insert(0,str(ROOT/'tools'))
    import benchmark_shibuya
    samples=[dict(time=t,simulationMs=ms,backlogSeconds=2,phase=p,trainWaves=[1,1])
             for t,ms,p in [(1,10,'walk'),(4,60,'clearance'),(8,100,'vehicles')]]
    metrics=benchmark_shibuya.summarize(samples,10,0)
    assert metrics['simulation_wall_ratio']==.8
    assert metrics['lag_seconds']==2
    assert metrics['worker_request_ms']==dict(p50=60,p95=100,p99=100)
    assert metrics['observed_phases']==['clearance','vehicles','walk']
