"""v4 escape scenarios (web3d/shibuya/escape.mjs): routes reach their destinations on walkable cells,
counts are conserved and honest, outcomes follow the documented rule, only verified facts are cited,
and the run is deterministic. The solver checks themselves live in web3d/shibuya/verify-escape.mjs."""
import json
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT/'web3d/shibuya/verify-escape.mjs'
RESEARCH = Path('/workspace/projects/logs/ssl-claude-halloween/research-practical.md')


def _node(expr):
    script = (f"Promise.all([import('./web3d/shibuya/escape.mjs'),import('./web3d/shibuya/sources-halloween.mjs')])"
              f".then(([m,src])=>console.log(JSON.stringify({expr})))")
    return json.loads(subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                                     capture_output=True, text=True, timeout=120).stdout)


def _last_json(out):
    return json.loads(out.strip().splitlines()[-1])


def test_escape_routes_static():
    # Every route vertex/chord is walkable, starts at the start point, ends inside its destination zone;
    # walk-alt routes end at the sim edge with a sourced off-sim arrow; one example route per level.
    out = subprocess.run(['node', str(VERIFY), '--static'], check=True, timeout=300, capture_output=True, text=True).stdout
    assert 'PASS static' in out
    routes = _last_json(out)['routes']
    assert [r['level'] for r in routes][::3] == ['centergai', 'miyashita', 'hikarie', 'stream', 'dogenzaka']
    assert len(routes) == 15 and {r['kind'] for r in routes} == {'gate', 'taxi', 'walk-alt'}
    assert sum(r['recommended'] for r in routes) == 5


def test_escape_cites_only_verified_facts():
    got = _node("{levels:m.ESCAPE_LEVELS,facts:m.ESCAPE_FACTS,dropped:m.DROPPED_FACTS,known:Object.keys(src.FACT_SOURCES),srcDropped:src.DROPPED_FACTS}")
    ids = set()
    for L in got['levels']:
        ids.update(L['start']['sources'])
        for B in L['branches']:
            ids.update(B['target']['sources'])
            ids.update((B.get('offsimLabel') or {}).get('sources', []))
    assert ids and ids <= set(got['facts']) and ids <= set(got['known'])
    assert not ids & (set(got['dropped']) | set(got['srcDropped']) | {'MEAS-14'})
    # Walking times are never computed by the sim: every off-sim walk cites an ALT-* fact.
    for L in got['levels']:
        for B in L['branches']:
            if B['kind'] == 'walk-alt':
                assert any(f.startswith('ALT-') for f in B['offsimLabel']['sources']), (L['key'], B['key'])
    if RESEARCH.exists():  # the team's research file (outside the repo) lists every id cited here
        listed = set(re.findall(r'^\| ([A-Z]+-\d+) \|', RESEARCH.read_text(), re.M))
        assert ids <= listed, ids - listed


def test_escape_solver_conservation_honest_counts_rule_determinism():
    # Two independent runs (12,000-person Halloween crowd + 360 escape walkers): conservation every step,
    # counts = recounts, no relocation, densities = recounts, outcome = rule, playback = keyframes,
    # identical results (see verify-escape.mjs for every assertion).
    out = subprocess.run(['node', str(VERIFY), '--agents', '12000', '--tmax', '420', '--warmup', '30'],
                         check=True, timeout=1500, capture_output=True, text=True).stdout
    assert 'PASS static' in out and 'PASS dynamic' in out and 'deterministic' in out
    got = _last_json(out)
    S = got['summary']
    assert S['label'] == 'simulation' and S['rule']['denseMax'] > 0
    for L in S['levels']:
        for b in L['branches']:
            assert b['spawned'] == b['arrived'] + b['enRoute']
            assert b['spawned'] + b['pending'] == S['walkersPerBranch']
            assert b['outcome'] in (None, 'escaped', 'caught')
            assert 0 <= b['shareCrush'] <= b['shareDense'] <= 1
    assert got['stats']['conservation'] == 0 and got['stats']['spawnOff'] == 0 and got['stats']['arriveOff'] == 0
    assert any(b['arrived'] for L in S['levels'] for b in L['branches'])
    # Video playback speed contract: 20–120 sim s per video s.
    assert all(20 <= L['speed'] <= 120 for L in got['levels'])


def test_escape_hook_is_inert_for_the_halloween_crowd():
    # The only change to halloween.mjs: motion codes ≥ 16 go to extraAgent() (a no-op there);
    # dispersal keeps its own codes (10–12) and step().
    src = (ROOT/'web3d/shibuya/halloween.mjs').read_text()
    assert 'export const EXTRA_MOTION=16' in src and 'extraAgent(i,x,z,dt,phase,walkLeft){}' in src
    got = _node("{E:m.EMOTION}")
    assert got['E'] == {'PENDING': 16, 'WALK': 17, 'DONE': 18}
