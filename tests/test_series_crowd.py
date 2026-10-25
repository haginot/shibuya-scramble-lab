"""Series JR episode crowd (web3d/shibuya/series/crowd-jr.mjs) and the ordinary-people costume mode.

Routes reach their JR gates on walkable cells, counts are conserved and honest, the run is deterministic,
only the team's verified fact ids are cited, and ordinary mode never draws monster costumes while the v4
default costume assignment stays byte-identical. The solver checks live in series/verify-crowd-jr.mjs."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT/'web3d/shibuya/series/verify-crowd-jr.mjs'
FACTS = Path('/workspace/projects/logs/ssl-claude-halloween/series/facts-series.json')
# sha256 of costumeOf(i) for i < 100000 before the ordinary mode was added (v4 default must not change).
V4_COSTUME_SHA = '4b08e4eb6175e6339617c8579bf2806fc7d11eb9474d0992dfb6888380bbb487'


def _node(script, timeout=300):
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                         capture_output=True, text=True, timeout=timeout).stdout
    return json.loads(out.strip().splitlines()[-1])


def _last_json(out):
    return json.loads(out.strip().splitlines()[-1])


def test_jr_routes_reach_their_gates_on_walkable_cells():
    out = subprocess.run(['node', str(VERIFY), '--static'], check=True, timeout=300, capture_output=True, text=True).stdout
    assert 'PASS static' in out
    routes = _last_json(out)['routes']
    assert [r['key'] for r in routes] == ['A', 'B', 'C', 'D']
    assert [r['gate'] for r in routes] == ['hachiko', 'south', 'shinminami', None]
    assert {r['kind'] for r in routes} == {'gate', 'walk-alt'}
    assert sum(r['recommended'] for r in routes) == 1 and routes[0]['recommended']
    assert all(r['vertices'] >= 2 and r['length'] > 0 for r in routes)


def test_jr_cites_only_team_facts():
    got = _node("const m=await import('./web3d/shibuya/series/crowd-jr.mjs');"
                "console.log(JSON.stringify({facts:m.JR_FACTS,gates:m.JR_GATES.map(g=>g.sources),routes:m.JR_ROUTES.map(r=>[r.sources,(r.offsimLabel||{}).sources||[]]),start:m.JR_START.sources,conc:m.CONCOURSE_FACTS}))")
    ids = set(got['start']) | set(got['conc'])
    for s in got['gates']:
        ids |= set(s)
    for a, b in got['routes']:
        ids |= set(a) | set(b)
    assert ids and ids <= set(got['facts'])
    assert 'MEAS-14' not in ids
    if (ROOT/'web3d/shibuya/series/sources-series.mjs').exists():  # on-screen footnote sources (copywriter)
        src = _node("const s=await import('./web3d/shibuya/series/sources-series.mjs');console.log(JSON.stringify({ids:Object.keys(s.FACTS),dropped:s.DROPPED}))")
        assert ids <= set(src['ids']), ids - set(src['ids'])
        assert not ids & set(src['dropped'])
    if FACTS.exists():  # the team's machine-readable claims (outside the repo)
        claims = {f['id']: f for f in json.loads(FACTS.read_text())}
        assert ids <= set(claims), ids - set(claims)
        assert not [i for i in ids if any(k in claims[i].get('status', '') for k in ('dropped', 'not announced', 'unverified'))]


def test_jr_crowd_conservation_honest_counts_determinism():
    # Two independent runs (12,000-person Halloween crowd + 4 × 24 route walkers + alighting pool): every check
    # in verify-crowd-jr.mjs (conservation per step, honest counts, no relocation, ≤ 4 p/m², densities = recount,
    # admissions ≤ capacity, signal never stalls, outcome = rule, playback = keyframes, concourse model) and
    # identical summaries.
    out = subprocess.run(['node', str(VERIFY), '--agents', '12000', '--tmax', '400', '--warmup', '30'],
                         check=True, timeout=1500, capture_output=True, text=True).stdout
    assert 'PASS static' in out and 'PASS dynamic' in out and 'PASS deterministic' in out
    got = _last_json(out)
    S, st = got['summary'], got['stats']
    assert S['label'] == 'simulation' and 'シミュレーション' in S['assumptions']['ja']
    assert st['conservation'] == 0 and st['spawnOff'] == 0 and st['alightOff'] == 0 and st['baseExtra'] == 0
    assert st['maxOcc'] <= 4 and st['capacity'] == 0 and st['countChecks'] > 0 and st['densityChecks'] > 0
    assert S['teleports'] == 0 and S['rescued'] == 0
    for r in S['routes']:
        assert r['spawned'] == r['done'] + r['enRoute']
        assert r['spawned'] + r['pending'] == S['walkersPerRoute']
        assert r['outcome'] in (None, 'escaped', 'caught')
        assert 0 <= r['shareCrush'] <= r['shareDense'] <= 1
    assert any(r['done'] for r in S['routes'])
    # Densities are honest: never above the 4 p/m² occupancy limit, peak reported with where and when.
    d = S['density']
    assert 0 < d['peakRun']['value'] <= 4 and d['peakP50'] <= d['peakP90'] <= 4
    c = S['counts']
    assert c['outside'] + c['inside'] + c['pending'] + c['walkersDone'] == c['modelled']
    assert c['enteredStation'] == sum(g['admitted'] for g in S['gates'])
    # The concourse model receives every admission of the Hachiko gate.
    assert S['concourse']['inbound'] == S['gates'][0]['admitted']
    assert S['concourse']['passedIn'] <= S['concourse']['inbound']


def test_ordinary_mode_excludes_monster_costumes_and_keeps_v4_defaults():
    got = _node("""const m=await import('./web3d/shibuya/costume.mjs');const THREE=await import('./web3d/vendor/three.module.min.js');
const {createHash}=await import('node:crypto');const a=[],types=new Set();
for(let i=0;i<100000;i++){a.push(m.costumeOf(i).map(v=>+v.toFixed(9)).join(','));types.add(m.ordinaryStyle(i)[0]);types.add(m.costumeOf(i,{ordinary:true})[0]);}
const crowd=new m.CostumeCrowd(new THREE.Scene(),4000,{ordinary:true}),v4=new m.CostumeCrowd(new THREE.Scene(),4000);
console.log(JSON.stringify({sha:createHash('sha256').update(a.join(';')).digest('hex'),types:[...types],ord:m.ORDINARY_TYPES,monster:m.MONSTER_TYPES,
 layers:crowd.layers.map(l=>l.name),v4layers:v4.layers.map(l=>l.name),bodyTypes:[...new Set(crowd.types)]}))""")
    assert got['sha'] == V4_COSTUME_SHA  # default assignment unchanged
    assert set(got['types']) <= set(got['ord']) and not set(got['types']) & set(got['monster'])
    assert set(got['bodyTypes']) <= set(got['ord'])
    # Ordinary people wear at most a small hat or small ears (plus a phone / glow stick in hand): no capes, skirts/sheets, props.
    assert set(got['layers']) <= {'hat', 'ears', 'light'}
    assert {'cape', 'skirt', 'prop'} <= set(got['v4layers'])
    src = (ROOT/'web3d/shibuya/costume.mjs').read_text()
    block = src[src.index('else if(T>=20&&T<=22){'):]
    block = block[:block.index('}')]
    assert 'skin=' not in block and 'hair=' not in block and 'GREEN' not in block and 'ORANGE' not in block  # natural skin, everyday palette


def test_police_and_staff_keep_normal_uniforms():
    src = (ROOT/'web3d/shibuya/costume.mjs').read_text()
    assert 'export const POLICE=100,STAFF=101,PERFORMER=102;' in src
    # Uniform colours are unchanged by the ordinary mode (navy police, high-visibility staff vest).
    assert 'else if(T==100){top=vec3(.03,.05,.13)' in src and 'else if(T==101){top=vec3(.25,.8,.15)' in src
