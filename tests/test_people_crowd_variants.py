"""Near-camera people (web3d/shibuya/series/people-close.mjs) and the variant crowd states
(web3d/shibuya/series/crowd-variants.mjs).

The near model's rest pose has the arms down (never a T/A-pose), stays within the triangle budget, and dresses people
deterministically with the same colours as costume.mjs ordinary mode. Every crowd state of the contract exists, is a
pure function of t (same frame in any order, resumable), labels every number 「シミュレーション」, and behaves as the
variant needs (Hachiko queue stuck / slow, taxi-west never served, taxi-sakura moving, nobody passes the closure)."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _node(script, timeout=300):
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                         capture_output=True, text=True, timeout=timeout).stdout
    return json.loads(out.strip().splitlines()[-1])


def test_near_model_rest_pose_is_arms_down_and_within_budget():
    got = _node("""const m=await import('./web3d/shibuya/series/people-close.mjs');const out={};
for(const lod of [0,1]){const g=m._geometry(lod),p=g.getAttribute('position').array,b=g.getAttribute('aBone').array;let armMaxX=0,armMaxY=0,handMaxY=0;
 for(let i=0;i<b.length;i++){const bone=b[i];if(bone>=8&&bone<=11){armMaxX=Math.max(armMaxX,Math.abs(p[3*i]));armMaxY=Math.max(armMaxY,p[3*i+1]);}
  if(bone===9||bone===11)handMaxY=Math.max(handMaxY,p[3*i+1]);}
 let minY=1e9,maxY=-1e9;for(let i=1;i<p.length;i+=3){minY=Math.min(minY,p[i]);maxY=Math.max(maxY,p[i]);}
 out[lod]={tris:g.index.count/3,verts:g.getAttribute('position').count,armMaxX,armMaxY,handMaxY,minY,maxY};}
console.log(JSON.stringify(out));""")
    for lod, g in got.items():
        assert g['armMaxX'] < .26, g      # arms hang beside the body (a T-pose would reach |x| ≈ .8)
        assert g['armMaxY'] < 1.47, g     # nothing of the arm above the shoulder
        assert g['handMaxY'] < 1.2, g     # forearms hang down in the rest pose
        assert -0.01 < g['minY'] < 0.02 and 1.7 < g['maxY'] < 1.85, g
    assert got['0']['tris'] <= 4500 and got['1']['tris'] <= 1400 and got['1']['verts'] <= 1300, got


def test_outfits_are_deterministic_ordinary_and_match_the_far_palette():
    got = _node("""const m=await import('./web3d/shibuya/series/people-close.mjs');const c=await import('./web3d/shibuya/costume.mjs');
const a=[],b=[];for(let i=0;i<3000;i++){a.push(JSON.stringify(m.outfitOf(i)));b.push(JSON.stringify(m.outfitOf(i)));}
const o=[...Array(3000).keys()].map(i=>m.outfitOf(i));
const tops=new Set(['0.035,0.035,0.04','0.06,0.065,0.09','0.12,0.11,0.1','0.025,0.03,0.05','0.42,0.44,0.48','0.75,0.74,0.72','0.2,0.22,0.18','0.45,0.47,0.5','0.6,0.08,0.1','0.1,0.22,0.5','0.62,0.45,0.12','0.15,0.4,0.32']);
console.log(JSON.stringify({same:a.every((x,i)=>x===b[i]),topsOk:o.every(p=>tops.has(p.top.join(','))),
 types:[...new Set(o.map(p=>p.type))].sort(),ears:o.filter(p=>p.type===c.ORDINARY_EARS).every(p=>p.pieces&(1<<(m.PIECES.catEars-1))),
 hats:o.filter(p=>p.type===c.ORDINARY_HAT).every(p=>p.pieces&(1<<(m.PIECES.smallHat-1))),
 skirts:o.filter(p=>p.pieces&(1<<(m.PIECES.skirt-1))).length,phones:o.filter(p=>p.phone).length,
 heights:[Math.min(...o.map(p=>p.height)),Math.max(...o.map(p=>p.height))],
 phoneMatchesCostume:o.every((p,i)=>p.phone===((c.costumeOf(i,{ordinary:true})[2]&1)===1))}));""")
    assert got['same'] and got['topsOk'] and got['ears'] and got['hats'] and got['phoneMatchesCostume'], got
    assert set(got['types']) <= {20, 21, 22}, got   # ordinary people only (no monster costumes)
    assert 300 < got['skirts'] < 900 and 300 < got['phones'] < 900, got
    assert .9 < got['heights'][0] and got['heights'][1] < 1.06, got


def test_crowd_states_cover_the_contract_and_are_pure_functions_of_time():
    got = _node("""const m=await import('./web3d/shibuya/series/crowd-variants.mjs');const res={};
for(const k of Object.keys(m.CROWD_STATES)){const S=m.CROWD_STATES[k];const h1=S.setup({},{}),h2=S.setup({},{});
 const ts=[0,3.3,12,30,47.5];const fwd=ts.map(t=>S.advance(h1,t));const back=ts.slice().reverse().map(t=>S.advance(h2,t)).reverse();
 const sig=f=>JSON.stringify([f.people.map(p=>[p.id,+p.x.toFixed(4),+p.z.toFixed(4),+p.heading.toFixed(4),p.anim]),f.player&&[+f.player.x.toFixed(4),+f.player.z.toFixed(4)],f.hud.numbers]);
 const ids=fwd.every(f=>new Set(f.people.map(p=>p.id)).size===f.people.length);
 const finite=fwd.every(f=>f.people.every(p=>[p.x,p.z,p.y,p.heading,p.speed].every(Number.isFinite)));
 res[k]={pure:fwd.every((f,i)=>sig(f)===sig(back[i])),ids,finite,people:fwd.map(f=>f.people.length),
  labelled:fwd.every(f=>f.label==='simulation'&&f.hud.label==='シミュレーション'&&f.hud.items.length>0&&f.hud.items.every(i=>i.text.includes('シミュレーション')&&Number.isFinite(i.value))),
  numbers:fwd.map(f=>f.hud.numbers),player:fwd.map(f=>!!f.player)};}
res.aliases=Object.entries(m.CROWD_STATE_ALIASES).every(([a,k])=>m.resolveCrowdState(a)===k&&m.CROWD_STATES[k]);
console.log(JSON.stringify(res));""")
    for key in ['hachiko-peak', 'zone-dense', 'detour-light', 'alt-platform', 'taxi-west', 'taxi-sakura', 'gate-newsouth']:
        s = got[key]
        assert s['pure'] and s['ids'] and s['finite'] and s['labelled'], (key, s)
        assert min(s['people']) > 0, (key, s)
    assert got['aliases']
    hk = got['hachiko-peak']['numbers']
    assert all(n['queue'] > 300 for n in hk) and all(n['density'] >= 1.5 for n in hk[1:]), hk
    assert all(a['ahead'] >= b['ahead'] for a, b in zip(hk, hk[1:])), hk     # never moves backwards
    assert hk[0]['waitMin'] > 3, hk                                            # stuck: minutes to the gate
    ns = got['gate-newsouth']['numbers']
    assert ns[0]['waitMin'] < hk[0]['waitMin'] / 2, (ns, hk)                   # the CLEAR gate flows
    assert all(n['taxis'] == 0 for n in got['taxi-west']['numbers'])
    tk = [n['taxis'] for n in got['taxi-sakura']['numbers']]
    assert tk == sorted(tk) and tk[-1] >= 1, tk
    assert all(n['passed'] == 0 and n['densityLine'] > 2 for n in got['zone-dense']['numbers'])
    assert all(n['density'] < .5 for n in got['detour-light']['numbers'])


def test_states_place_on_the_sets_anchors():
    got = _node("""const m=await import('./web3d/shibuya/series/crowd-variants.mjs');
const A={'gate-queue.northLane':{x:104,y:0,z:-4.5},'gate-queue.southLane':{x:104,y:0,z:8.5},'gate-queue.uTurn':{x:146,y:0,z:1.5},'gate-queue.gate':{x:85.9,y:0,z:18.9},
 'taxi-west.queueHead':{x:30,y:0,z:150},'taxi-west.queueDir':{x:-1,y:0,z:0},'closure.a':{x:141,y:0,z:54},'closure.b':{x:141,y:0,z:70},'closure.normal':{x:-1,y:0,z:0}};
const hp=m.paramsFromSets('hachiko-peak',A),tw=m.paramsFromSets('taxi-west',A),zd=m.paramsFromSets('zone-dense',A);
const f=m.CROWD_STATES['zone-dense'].advance(m.CROWD_STATES['zone-dense'].setup({},zd),5);
console.log(JSON.stringify({hpEnd:hp.path.at(-1),hpMaxX:Math.max(...hp.path.map(p=>p[0])),tw,side:zd.side,crowdX:Math.max(...f.people.map(p=>p.x))}));""")
    assert abs(got['hpEnd'][0] - 85.9) < .5 and got['hpMaxX'] <= 146.01, got
    assert got['tw'] == {'stand': [30, 150], 'dir': [-1, 0]}, got
    assert got['crowdX'] <= 141.5, got   # the crowd stands on the open side (normal −x), not inside the closure
