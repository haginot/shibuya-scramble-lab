import json

import pytest

from asagaya_town_sim import cli, promo


@pytest.fixture(scope='module')
def output():
    return promo.simulate(seeds=2)


def test_config_override(tmp_path):
    path = tmp_path/'config.json'
    path.write_text(json.dumps({'store':{'margin':.4},'channels':{'sns_ad':{'daily_reach':.2}}}))
    c = promo.load_config(path)
    assert c['store']['margin'] == .4
    assert c['store']['avg_spend'] == 900
    assert c['channels']['sns_ad']['daily_reach'] == .2
    assert 'half_life_days' in c['channels']['sns_ad']


def test_funnel_valid_monotonic(output):
    for result in output['combinations'].values():
        previous = [0]*len(result['frames'][0]['agents'])
        for f in result['frames']:
            assert sum(f['funnel']) == output['config']['population']
            current = [p[2] for p in f['agents']]
            assert all(0 <= old <= new <= 4 for old,new in zip(previous,current))
            previous = current


def test_none_and_uplift(output):
    none = output['combinations']['none']['metrics']
    assert none['uplift'] == 0
    assert none['would_have_come_anyway_share'] == 1
    assert none['roi'] is None
    for name, result in output['combinations'].items():
        if name != 'none':
            assert result['metrics']['total_visits'] > none['total_visits']


def test_economics(output):
    c = output['config']
    for result in output['combinations'].values():
        m = result['metrics']
        profit = m['uplift']*c['store']['avg_spend']*c['store']['margin']
        assert m['incremental_gross_profit'] == pytest.approx(profit)
        assert m['discount_cost'] == pytest.approx(m['coupon_redeemed']*c['coupon_discount'])
        if m['cost']:
            assert m['roi'] == pytest.approx((profit-m['discount_cost']-m['cost'])/m['cost'])


def test_determinism_and_pairing():
    c = promo.load_config()
    c.update(population=35,days=3,seeds=1)
    a = promo.simulate(c)
    assert a == promo.simulate(c)
    c['combinations'] = dict(reversed(list(c['combinations'].items())))
    assert a['combinations'] == promo.simulate(c)['combinations']


def test_cli_json(capsys):
    cli.main(['promo','demo','--json','--seeds','1','--days','2'])
    d = json.loads(capsys.readouterr().out)
    assert d['combinations']['none']['metrics']['uplift'] == 0
    assert 'toy model' in d['disclaimer']


def test_build(tmp_path):
    d = promo.simulate(seeds=1,days=1)
    promo.write_site(tmp_path,d)
    assert json.loads((tmp_path/'data/promo.json').read_text()) == d
    assert (tmp_path/'vendor/three.module.min.js').exists()
    assert (tmp_path/'promo/app.mjs').exists()


def test_default_cli_still_dispatches_demo(monkeypatch):
    seen = []
    def build(args):
        seen.append(args.cmd)
        raise RuntimeError('legacy demo reached')
    monkeypatch.setattr(cli,'build',build)
    with pytest.raises(RuntimeError,match='legacy demo reached'):
        cli.main([])
    assert seen == ['demo']


def test_all_fetches_and_module_imports_exist(tmp_path):
    import re
    from pathlib import Path
    promo.write_site(tmp_path, promo.simulate(seeds=1, days=1))
    app = (tmp_path/'promo/app.mjs').read_text()
    paths = re.findall(r"(?:json|fetch)\(['\"]([^'\"]+)['\"]\)", app)
    assert len(paths) == 4
    for path in paths:
        assert (tmp_path/'promo'/path).is_file(), path
    for module in (tmp_path/'promo').glob('*.mjs'):
        for path in re.findall(r"from ['\"]([^'\"]+)['\"]", module.read_text()):
            assert (module.parent/path).is_file(), path
    engine = json.loads((tmp_path/'data/engine.json').read_text())
    assert engine['scenarios']['map']['heat']
    for path in Path('web3d/promo').iterdir():
        assert path.read_bytes() == (tmp_path/'promo'/path.name).read_bytes()


def test_same_slot_overlap_and_scale(output):
    baseline = output['combinations']['none']
    for result in output['combinations'].values():
        for frame, base in zip(result['frames'], baseline['frames']):
            m = frame['metrics']
            assert 0 <= m['would_have_come_anyway_share'] <= 1
            if m['total_visits']:
                assert m['would_have_come_anyway_share'] <= base['metrics']['total_visits']/m['total_visits'] + 1e-12
    c = promo.load_config()
    c.update(population=30, days=3, seeds=2)
    a = promo.simulate(c)
    c['agent_scale'] *= 2
    b = promo.simulate(c)
    for name in c['combinations']:
        x, y = a['combinations'][name]['metrics'], b['combinations'][name]['metrics']
        for key in ('total_visits','uplift','coupon_redeemed','discount_cost','incremental_gross_profit'):
            assert y[key] == pytest.approx(x[key]*2)
        assert y['cost'] == x['cost']


def test_intervals_and_default_calibration():
    data = promo.simulate()
    c = data['config']
    assert c['seeds'] == 8
    baseline = data['combinations']['none']['metrics']['total_visits']
    assert .05 <= baseline/(c['population']*c['agent_scale']) <= .15
    rois = []
    for name, result in data['combinations'].items():
        m = result['metrics']
        for key in ('uplift','roi'):
            bounds = result['intervals_95'][key]
            if m[key] is not None:
                assert bounds[0] <= m[key] <= bounds[1]
        if name != 'none':
            rois.append(m['roi'])
            assert -.8 <= m['roi'] <= 2
            assert m['would_have_come_anyway_share'] <= baseline/m['total_visits'] + 1e-12
    assert min(rois) < 0 < max(rois)
    combos = data['combinations']
    assert combos['all_four']['metrics']['uplift'] < sum(combos[n]['metrics']['uplift'] for n in ('sns_only','flyer_only','pr_only','coupon_only'))
    assert combos['all_four']['metrics']['roi'] < combos['sns+coupon']['metrics']['roi']


def test_pr_coverage_fixed_cost_and_intervals():
    c = promo.load_config()
    c.update(population=40, days=3, seeds=1)
    c['channels']['pr_media']['coverage_probability'] = 0
    data = promo.simulate(c)
    pr = data['combinations']['pr_only']
    assert pr['metrics']['uplift'] == 0
    assert pr['metrics']['cost'] == 100000
    assert pr['metrics']['roi'] == -1
    assert pr['intervals_95'] == {'uplift':None,'roi':None}


def test_cli_definitions_and_intervals(capsys):
    cli.main(['promo','demo','--seeds','2','--days','1'])
    text = capsys.readouterr().out
    assert 'same agent/day/slot' in text
    assert 'discount cost - channel cost' in text
    assert '95%' in text


def test_coupon_discounts_counterfactual_visitors():
    c = promo.load_config()
    c.update(population=20, days=1, seeds=1, organic_visit=1, coupon_redeem_rate=1)
    c['combinations'] = {'none':[], 'coupon_only':['campaign_coupon']}
    c['channels']['campaign_coupon'].update(daily_reach=1, aware_to_want_boost=0, want_to_visit_boost=0)
    c['weather']['multipliers'] = dict.fromkeys(c['weather']['multipliers'], 1)
    c['hour_multipliers'] = [1]*len(c['hours'])
    m = promo.simulate(c)['combinations']['coupon_only']['metrics']
    assert m['uplift'] == 0
    assert m['would_have_come_anyway_share'] == 1
    assert m['coupon_redeemed'] == 20*len(c['hours'])*c['agent_scale']
    assert m['discount_cost'] == m['total_visits']*200
    assert m['roi'] < -1


def test_demo_serve_uses_complete_site(tmp_path, monkeypatch, capsys):
    from pathlib import Path
    monkeypatch.setenv('TMPDIR', str(tmp_path))
    served = []
    class Server:
        def __init__(self, address, handler):
            self.server_address = address
            self.directory = Path(handler.keywords['directory'])
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def serve_forever(self):
            for path in ('promo/app.mjs','data/promo.json','data/engine.json','data/buildings.json','data/terrain.json','vendor/three.module.min.js'):
                assert (self.directory/path).is_file()
            served.append(self.directory)
    monkeypatch.setattr(cli.http.server, 'ThreadingHTTPServer', Server)
    cli.main(['promo','demo','--serve','--no-open','--seeds','1','--days','1'])
    assert len(served) == 1
