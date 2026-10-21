"""Fictional promotion funnel with paired, pre-generated random draws."""
from __future__ import annotations

import copy
import json
import random
import math
import statistics
from importlib import resources
from pathlib import Path

from .model import Town, dist, nonnegative_int
from .publication import write_notices

DISCLAIMER = 'トイモデル / toy model: coefficients are placeholders, not a forecast'
STATES = ['unaware', 'aware', 'want_to_visit', 'visited', 'repeat']


def deep_merge(base, override):
    result = copy.deepcopy(base)
    for key, value in override.items():
        result[key] = deep_merge(result[key], value) if isinstance(value, dict) and isinstance(result.get(key), dict) else copy.deepcopy(value)
    return result


def load_config(path=None, area=None):
    config = json.loads(resources.files('asagaya_town_sim').joinpath('data/promo.json').read_text(encoding='utf-8'))
    if path:
        p = Path(path)
        if p.suffix == '.toml':
            try:
                import tomllib
            except ImportError as exc:
                raise ValueError('TOML requires Python 3.11+; use JSON on Python 3.9') from exc
            override = tomllib.loads(p.read_text(encoding='utf-8'))
        else:
            override = json.loads(p.read_text(encoding='utf-8'))
        config = deep_merge(config, override)
    if area is not None:
        config['area'] = area
    if config['agent_scale'] <= 0 or config['boost_saturation'] <= 0:
        raise ValueError('agent_scale and boost_saturation must be positive')
    if config['population'] < 1 or config['days'] < 1 or config['seeds'] < 1:
        raise ValueError('population, days and seeds must be positive')
    if len(config['hours']) != len(config['hour_multipliers']) or not config['hours']:
        raise ValueError('hours and hour_multipliers must have equal nonzero length')
    if config['combinations'].get('none') != []:
        raise ValueError('combinations must include none: []')
    for channels in config['combinations'].values():
        for name in channels:
            if config['channels'][name]['half_life_days'] <= 0:
                raise ValueError('half_life_days must be positive')
    return config


def _run(c, town, seed):
    rng = random.Random(seed)
    n, days, hours = c['population'], c['days'], c['hours']
    homes = [town.coord[rng.choice(town.home_nodes)] for _ in range(n)]
    contacts = [[rng.randrange(n) for _ in range(c['contacts'])] for _ in range(n)]
    weather = c['weather']
    names = list(weather['probabilities'])
    skies = [weather['sequence'][d % len(weather['sequence'])] if weather['sequence'] else rng.choices(names, weights=list(weather['probabilities'].values()))[0] for d in range(days)]
    # Fixed draw dimensions: no branch or combination changes the RNG stream.
    draws = [[[ [rng.random() for _ in range(6 + len(c['channels']))] for _ in range(n)] for _ in hours] for _ in range(days)]
    coverage = {name: rng.random() < ch.get('coverage_probability', 1) for name, ch in c['channels'].items()}
    store = town.coord[town.site_node]
    outputs = {}
    for combo, enabled in c['combinations'].items():
        states, counts = [0]*n, [0]*n
        effects = {name:[0.0]*n for name in enabled}
        visits, redeemed, frames, daily, visit_ids = 0, 0, [], [], set()
        for day in range(days):
            for name in enabled:
                effects[name] = [v * 0.5**(1/c['channels'][name]['half_life_days']) for v in effects[name]]
            for slot, hour in enumerate(hours):
                old = states[:]
                positions, sample_visitors = [], []
                visits_before = visits
                env = weather['multipliers'][skies[day]] * c['weekday_multipliers'][(c['start_weekday']+day)%7] * c['hour_multipliers'][slot]
                env *= 1 + (c['event']['boost'] if day == c['event']['day'] else 0)
                env *= 1 - (c['competitor']['penalty'] if day in c['competitor']['days'] else 0)
                for i in range(n):
                    r = draws[day][slot][i]
                    want_boost = visit_boost = 0.0
                    for k, name in enumerate(c['channels']):
                        if name not in enabled:
                            continue
                        ch = c['channels'][name]
                        proximity = max(0, 1-dist(homes[i],store)/ch['proximity_radius_m']) if name == 'flyer_signboard' else 1
                        spread = sum(old[j] >= 1 for j in contacts[i]) / max(1,len(contacts[i]))
                        reach = ch['daily_reach'] * proximity if day in ch['active_days'] and coverage[name] else 0
                        p = 1-(1-reach)**(1/len(hours))
                        p += ch['word_of_mouth'] * spread / len(hours) if coverage[name] else 0
                        if r[6+k] < p:
                            effects[name][i] = 1.0
                            states[i] = max(states[i],1)
                        want_boost = max(want_boost, ch['aware_to_want_boost'] * effects[name][i])
                        visit_boost = max(visit_boost, ch['want_to_visit_boost'] * effects[name][i])
                    want_boost = c['boost_saturation'] * (1-math.exp(-want_boost/c['boost_saturation']))
                    visit_boost = c['boost_saturation'] * (1-math.exp(-visit_boost/c['boost_saturation']))
                    if r[0] < c['organic_awareness']:
                        states[i] = max(states[i],1)
                    if states[i] == 1 and r[1] < (c['aware_to_want']+want_boost)*env:
                        states[i] = 2
                    organic = r[2] < c['organic_visit']*env
                    converted = states[i] >= 2 and r[3] < ((c['repeat_visit'] if states[i]>=3 else c['want_to_visit'])+visit_boost)*env
                    visiting = organic or converted
                    if visiting:
                        counts[i] += 1
                        states[i] = 4 if counts[i] > 1 else 3
                        visits += 1
                        visit_ids.add((day,slot,i))
                        if 'campaign_coupon' in enabled and effects['campaign_coupon'][i] > 0 and r[4] < c['coupon_redeem_rate']:
                            redeemed += 1
                    if i < min(300,c['record_agents']):
                        if visiting:
                            sample_visitors.append(i)
                        target = store if visiting else homes[i]
                        # Small deterministic offsets make gathering visible.
                        positions.append([round(target[0]+(r[4]-.5)*.00008,6),round(target[1]+(r[5]-.5)*.00008,6),states[i]])
                frames.append(dict(day=day,hour=hour,agents=positions,sample_visitor_ids=sample_visitors,slot_visits=(visits-visits_before)*c['agent_scale'],funnel=[states.count(s) for s in range(5)],visits=visits,visitor_ids=visit_ids.copy(),redeemed=redeemed))
            daily.append(dict(day=day,weather=skies[day],funnel=[states.count(s) for s in range(5)],visits=visits))
        outputs[combo] = dict(coverage={name:coverage[name] for name in enabled},total_visits=visits,coupon_redeemed=redeemed,visitor_ids=visit_ids,frames=frames,daily=daily)
    base = outputs['none']
    for combo, out in outputs.items():
        cost = sum(c['channels'][name]['fixed_cost'] + c['channels'][name]['daily_cost']*sum(d in c['channels'][name]['active_days'] for d in range(days)) for name in c['combinations'][combo])
        def metrics(visits, redeemed, ids, baseline_visits, baseline_ids):
            scale = c['agent_scale']
            visits, baseline_visits, redeemed = visits*scale, baseline_visits*scale, redeemed*scale
            uplift = visits-baseline_visits
            profit = uplift*c['store']['avg_spend']*c['store']['margin']
            discount = redeemed*c['coupon_discount']
            return dict(total_visits=visits,uplift=uplift,uplift_pct=100*uplift/baseline_visits if baseline_visits else None,would_have_come_anyway_share=len(ids & baseline_ids)/len(ids) if ids else None,incremental_gross_profit=profit,discount_cost=discount,coupon_redeemed=redeemed,cost=cost,total_cost=cost+discount,incremental_profit=profit-discount-cost,roi=(profit-discount-cost)/cost if cost else None)
        out['metrics'] = metrics(out['total_visits'],out['coupon_redeemed'],out['visitor_ids'],base['total_visits'],base['visitor_ids'])
        for f,b in zip(out['frames'],base['frames']):
            f['metrics'] = metrics(f['visits'],f['redeemed'],set(f['visitor_ids']),b['visits'],set(b['visitor_ids']))
        # Keep baseline IDs until every combination is paired.
    for out in outputs.values():
        del out['visitor_ids']
        for frame in out['frames']:
            del frame['visitor_ids']
    return outputs


def simulate(config=None, seeds=None, days=None):
    c = copy.deepcopy(config if config is not None else load_config())
    if seeds is not None: c['seeds'] = seeds
    if days is not None: c['days'] = days
    for key in ('seeds', 'days', 'population'):
        nonnegative_int(key, c[key], 1)
    nonnegative_int('record_agents', c['record_agents'])
    if c.get('area') == 'shibuya':
        from .shibuya import PromoTown
        town = PromoTown()
    else:
        town = Town()
    runs = [_run(c,town,seed) for seed in range(c['seeds'])]
    results = {}
    for combo in c['combinations']:
        values = [run[combo]['metrics'] for run in runs]
        means = {key:sum(v[key] for v in values)/len(values) if all(v[key] is not None for v in values) else None for key in values[0]}
        total = sum(v['total_visits'] for v in values)
        means['would_have_come_anyway_share'] = sum((v['would_have_come_anyway_share'] or 0)*v['total_visits'] for v in values)/total if total else None
        branches = {name:dict(observed=sum(run[combo]['coverage'][name] for run in runs), trials=len(runs), probability=c['channels'][name]['coverage_probability'])
                    for name in c['combinations'][combo]
                    if 0 < c['channels'][name].get('coverage_probability', 1) < 1}
        missing_branch = any(v['observed'] in (0, v['trials']) for v in branches.values())
        intervals = {}
        for key in ('uplift', 'roi'):
            sample = [v[key] for v in values]
            if sample[0] is None or len(sample) < 2 or missing_branch:
                intervals[key] = None
            else:
                # Two-sided Student t interval for independent seed means.
                df = len(sample)-1
                critical = (12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042)[df-1] if df <= 30 else 1.96 + 2.4/df
                half = critical*statistics.stdev(sample)/math.sqrt(len(sample))
                intervals[key] = [means[key]-half, means[key]+half]
        results[combo] = dict(metrics=means,intervals_95=intervals,interval_note='insufficient coverage branches' if missing_branch else 'independent seed Student t interval',coverage_branches=branches,frames=runs[0][combo]['frames'],daily=runs[0][combo]['daily'])
    return dict(disclaimer=DISCLAIMER,store=dict(c['store'],position=list(town.coord[town.site_node])),config=c,states=STATES,timeline_seed=0,timeline_note='Frames and live metrics use seed 0; summary metrics average seeds except anyway share, which pools same-agent/day/slot episode overlap.',combinations=results)


def write_site(directory, data):
    import shutil
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    source = resources.files('asagaya_town_sim').joinpath('web3d')
    with resources.as_file(source) as p:
        for name in ('promo','vendor','data'):
            shutil.copytree(p/name,directory/name,dirs_exist_ok=True)
    if data['config'].get('area') == 'shibuya':
        from .shibuya import promo_assets
        promo_assets(directory/'data')
        blob=json.dumps(data,ensure_ascii=False,separators=(',',':'))
        (directory/'data/promo_shibuya.json').write_text(blob,encoding='utf-8')
        (directory/'data/promo.json').write_text(blob,encoding='utf-8')
        write_notices(directory,directory/'data')
        (directory/'index.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=promo/?area=shibuya"><a href="promo/?area=shibuya">Shibuya promotion</a>',encoding='utf-8')
        return directory
    town = Town()
    engine = dict(site=list(town.coord[town.site_node]), center=[town.station['lat'],town.station['lon']], pois=town.pois, scenarios={'map': {'heat': [[*town.coord[u],*town.coord[v],1] for u in town.nodes for v in town.adj[u] if u < v]}})
    (directory/'data'/'engine.json').write_text(json.dumps(engine),encoding='utf-8')
    (directory/'data'/'promo.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    write_notices(directory, directory/'data')
    (directory/'index.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=promo/"><a href="promo/">Promotion toy model</a>',encoding='utf-8')
    return directory
