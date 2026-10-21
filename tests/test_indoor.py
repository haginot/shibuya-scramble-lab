"""Phase 2 stays inert; the fictional design example remains internally usable."""
import json
import math
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('web3d/shibuya', 'src/asagaya_town_sim/web3d/shibuya')


@pytest.fixture(scope='module')
def floorplan():
    document = (ROOT / 'docs/phase2-indoor.md').read_text(encoding='utf-8')
    examples = re.findall(r'```json\n(.*?)\n```', document, re.S)
    assert len(examples) == 1
    return json.loads(examples[0])


@pytest.mark.parametrize('directory', MODULES)
def test_indoor_hook_has_no_runtime_effects(directory):
    """Imports and opt-in requests cannot start IO, render work or random draws."""
    module_url = (ROOT / directory / 'indoor.mjs').as_uri()
    subprocess.run(['node', '--input-type=module', '-e', f"""
        import assert from 'node:assert/strict';
        const unexpected = () => {{ throw Error('indoor hook caused a side effect'); }};
        for (const name of ['fetch', 'Worker', 'requestAnimationFrame', 'setTimeout'])
            globalThis[name] = unexpected;
        Math.random = unexpected;
        globalThis.window = new Proxy({{}}, {{get: unexpected, set: unexpected}});
        globalThis.document = new Proxy({{}}, {{get: unexpected, set: unexpected}});
        const {{INDOOR_SCENES, INDOOR_DEFAULTS, requestIndoorScene}} =
            await import({json.dumps(module_url)});
        assert.deepEqual(INDOOR_SCENES,
            ['outdoor_top', 'building_zoom', 'plan_rise', 'indoor_flow', 'store_detail']);
        assert(Object.isFrozen(INDOOR_SCENES));
        assert.deepEqual(INDOOR_DEFAULTS, {{enabled:false, floorplan:null, storeDetail:false}});
        assert(Object.isFrozen(INDOOR_DEFAULTS));
        const plan = Object.freeze({{schema_version:1, id:'sentinel'}});
        const options = Object.freeze({{enabled:true, floorplan:plan, storeDetail:true}});
        for (const target of [...INDOOR_SCENES, 'unknown', null, undefined]) {{
            assert.equal(requestIndoorScene(target), false);
            assert.equal(requestIndoorScene(target, options), false);
        }}
        assert.deepEqual(options, {{enabled:true, floorplan:plan, storeDetail:true}});
        assert.deepEqual(plan, {{schema_version:1, id:'sentinel'}});
    """], check=True, timeout=15)


def test_indoor_requests_preserve_outdoor_replay():
    """The live solver, signal time, funnel and random state match a control."""
    subprocess.run(['node', '--input-type=module', '-e', """
        import assert from 'node:assert/strict';
        import {readFile} from 'node:fs/promises';
        import {Simulation} from './web3d/shibuya/simulation.mjs';
        import {INDOOR_SCENES, requestIndoorScene} from './web3d/shibuya/indoor.mjs';
        const load = async name => JSON.parse(await readFile(
            `web3d/data/shibuya_${name}.json`, 'utf8'));
        const [config, osm, plateau] = await Promise.all(['config', 'osm', 'plateau'].map(load));
        const control = new Simulation({...config, agents:128}, osm, plateau);
        const subject = new Simulation({...config, agents:128}, osm, plateau);
        const options = {enabled:true, floorplan:null, storeDetail:true};
        for (const promo of [false, true]) {
            control.promo = subject.promo = promo;
            for (const seconds of [0, 0.05, 0.05, 1, 11, 60]) {
                const before = subject.snapshot();
                const randomBefore = subject.randomState.slice();
                for (const target of INDOOR_SCENES)
                    assert.equal(requestIndoorScene(target, options), false);
                assert.deepEqual(subject.snapshot(), before);
                assert.deepEqual(subject.randomState, randomBefore);
                assert.deepEqual(subject.advance(seconds), control.advance(seconds));
                assert.deepEqual(subject.randomState, control.randomState);
                assert.equal(subject.accumulator, control.accumulator);
            }
        }
    """], cwd=ROOT, check=True, timeout=30)


def index(items):
    result = {item['id']: item for item in items}
    assert len(result) == len(items), 'duplicate ID'
    return result


def inside(point, ring):
    """Boundary-inclusive point containment for the authored example."""
    x, z = point
    hit = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        cross = (x-a[0])*(b[1]-a[1]) - (z-a[1])*(b[0]-a[0])
        if abs(cross) < 1e-9 and all(min(a[k], b[k]) <= point[k] <= max(a[k], b[k]) for k in (0, 1)):
            return True
        if (a[1] > z) != (b[1] > z) and x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:
            hit = not hit
    return hit


def test_document_floorplan_geometry_and_references(floorplan):
    p = floorplan
    assert p['schema_version'] == 1 and p['units'] == 'm'
    assert p['provenance'] == {'kind': 'self_authored_fictional', 'real_facility_plan': False}
    assert len(p['origin_world_m']) == 2 and all(math.isfinite(v) for v in p['origin_world_m'])
    floors, zones = index(p['floors']), index(p['zones'])
    nodes, tenants = index(p['navigation']['nodes']), index(p['tenants'])
    for floor in floors.values():
        assert floor['height_m'] > 0 and math.isfinite(floor['elevation_m'])
    for item in [*floors.values(), *zones.values()]:
        ring = item.get('outline', item.get('polygon'))
        assert len(ring) >= 3 and ring[0] != ring[-1]
        assert all(len(v) == 2 and all(math.isfinite(n) for n in v) for v in ring)
        assert abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) > 0
        if 'floor_id' in item:
            assert all(inside(v, floors[item['floor_id']]['outline']) for v in ring)
        if 'fixture_polygon' in item:
            assert item['kind'] == 'popup'
            assert all(inside(v, ring) for v in item['fixture_polygon'])
    for node in nodes.values():
        assert len(node['position_m']) == 2 and all(math.isfinite(v) for v in node['position_m'])
        if node['floor_id'] is not None:
            assert inside(node['position_m'], floors[node['floor_id']]['outline'])
            assert not any(inside(node['position_m'], z['fixture_polygon'])
                           for z in zones.values() if z['floor_id'] == node['floor_id'] and
                           'fixture_polygon' in z)
    for tenant in tenants.values():
        zone, entry = zones[tenant['zone_id']], nodes[tenant['entry_node_id']]
        assert zone['kind'] == 'tenant' and entry['floor_id'] == zone['floor_id']
        assert tenant['entry_width_m'] > 0 and inside(entry['position_m'], zone['polygon'])
    cafe = tenants['hidamari']
    assert 'ひだまり珈琲' in cafe['name']
    entry = nodes[cafe['entry_node_id']]['position_m']
    assert [a+b for a, b in zip(p['origin_world_m'], entry)] == [-46, -42]
    portal_pairs = set()
    for portal in p['portals']:
        assert portal['kind'] in ('entrance', 'escalator', 'lift')
        assert nodes[portal['from_node']]['floor_id'] != nodes[portal['to_node']]['floor_id']
        assert all(portal[k] > 0 for k in ('width_m', 'capacity_per_s', 'travel_s'))
        portal_pairs.add(frozenset((portal['from_node'], portal['to_node'])))
    index(p['portals'])
    for edge in p['navigation']['edges']:
        assert nodes[edge['from']]['floor_id'] == nodes[edge['to']]['floor_id']
        assert edge['width_m'] > 0
        assert frozenset((edge['from'], edge['to'])) not in portal_pairs


@pytest.mark.parametrize('accessible', [False, True])
def test_document_routes_allow_entry_and_return(floorplan, accessible):
    nodes = index(floorplan['navigation']['nodes'])
    graph = {key: set() for key in nodes}
    links = [(e['from'], e['to'], e['bidirectional']) for e in floorplan['navigation']['edges']]
    links += [(p['from_node'], p['to_node'], p['bidirectional'])
              for p in floorplan['portals'] if not accessible or p['accessible']]
    for source, target, both in links:
        graph[source].add(target)
        if both:
            graph[target].add(source)

    def reachable(source):
        seen, pending = {source}, [source]
        while pending:
            for target in graph[pending.pop()] - seen:
                seen.add(target)
                pending.append(target)
        return seen

    outside = next(n['id'] for n in nodes.values() if n['floor_id'] is None)
    for tenant in floorplan['tenants']:
        assert tenant['entry_node_id'] in reachable(outside)
        assert outside in reachable(tenant['entry_node_id'])


def test_document_experiment_and_optional_store(floorplan):
    p = floorplan
    floors, zones, tenants = index(p['floors']), index(p['zones']), index(p['tenants'])
    ads = index(p['ads'])
    for ad in ads.values():
        assert inside(ad['position_m'], floors[ad['floor_id']]['outline'])
        assert 0 < ad['fov_deg'] <= 360
        assert ad['range_m'] > 0 and ad['min_exposure_s'] > 0
    experiment = p['experiment']
    assert experiment['duration_s'] > 0
    assert len(set(experiment['seeds'])) == len(experiment['seeds']) >= 2
    assert all(isinstance(s, int) and 0 < s < 2**32 for s in experiment['seeds'])
    scenarios = index(experiment['scenarios'])
    assert set(scenarios) == {'none', 'popup_only', 'ad_only', 'popup_and_ad'}
    assert scenarios['none']['active_popup_ids'] == scenarios['none']['active_ad_ids'] == []
    popup_ids = {z['id'] for z in zones.values() if z['kind'] == 'popup'}
    for scenario in scenarios.values():
        assert set(scenario['active_popup_ids']) <= popup_ids
        assert set(scenario['active_ad_ids']) <= ads.keys()
    assert scenarios['popup_only']['active_popup_ids'] == scenarios['popup_and_ad']['active_popup_ids']
    assert scenarios['ad_only']['active_ad_ids'] == scenarios['popup_and_ad']['active_ad_ids']
    assert not scenarios['popup_only']['active_ad_ids'] and not scenarios['ad_only']['active_popup_ids']
    detail = p['store_detail']
    ring = zones[tenants[detail['tenant_id']]['zone_id']]['polygon']
    index(detail['seats'])
    assert all(inside(s['position_m'], ring) for s in detail['seats'])
    queue = detail['queue']
    assert isinstance(queue['capacity'], int) and queue['capacity'] > 0
    assert queue['service_mean_s'] > 0 and len(queue['path_m']) >= 2
    assert all(inside(point, ring) for point in queue['path_m'])
    assert len({sku['sku'] for sku in detail['inventory']}) == len(detail['inventory'])
    for sku in detail['inventory']:
        assert isinstance(sku['initial_units'], int) and sku['initial_units'] >= 0
        assert isinstance(sku['units_per_checkout'], int) and sku['units_per_checkout'] > 0
        assert all(0 <= r['time_s'] < experiment['duration_s'] and
                   isinstance(r['units'], int) and r['units'] >= 0 for r in sku['restocks'])
