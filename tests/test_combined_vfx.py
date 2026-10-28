"""Combined-episode VFX + crowd (crowd/VFX role): web3d/shibuya/series/vfx-caught.mjs (caught hands), kaiju.mjs (the
original kaiju; v7: Showa-style crystal-spined beast), crowd-variants.mjs state 'caught-press' and the zone-clear clear cone (detour-light params.clear).

The caught layout is a pure function of the caught env (deterministic, resumable); hands only enter from the frame
edges and stay near them; black / flash pass through. The kaiju is round (no tall upright-lizard silhouette, no tail
behind it), hidden below ground before the rise, raises its arms and opens its mouth at the roar, cheap. The press
crowd packs in around the player without anybody facing the camera or standing in it. With the documented clear cone
nobody walks into the zone-clear eye camera (nearest person in view ≥ 4 m, < 15 % of the frame)."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _node(script, timeout=300):
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                         capture_output=True, text=True, timeout=timeout).stdout
    return json.loads(out.strip().splitlines()[-1])


def test_caught_layout_is_pure_and_hands_come_from_the_edges():
    got = _node("""const m=await import('./web3d/shibuya/series/vfx-caught.mjs');const A=9/16;
const env=(t)=>({t,dur:2.5,intensity:Math.min(1,t/1.6),press:Math.min(1,t/1.2),flash:t>1.75&&t<2.1?1:0,black:t>=2.15?1:0,seed:7});
const ts=[0,.3,.7,1.1,1.5,1.8,2.2];const a=ts.map(t=>JSON.stringify(m.caughtLayout(env(t),{aspect:A})));const b=ts.slice().reverse().map(t=>JSON.stringify(m.caughtLayout(env(t),{aspect:A}))).reverse();
const edge=([x,y])=>Math.min(x,A-x,y,1-y);let maxWrist=-1,maxTip=-1,baseOut=true;const counts=[];
for(const t of ts){const L=m.caughtLayout(env(t),{aspect:A});counts.push(L.hands.length);
 for(const h of L.hands){baseOut=baseOut&&edge(h.base)<0;maxWrist=Math.max(maxWrist,edge(h.wrist));for(const f of h.fingers)maxTip=Math.max(maxTip,edge(f.at(-1)));}}
const v=m.createCaughtVFX({});const hid=v.update(null)===null&&!v.mesh.visible;const L=v.update(env(1.5),{aspect:A,width:1080,height:1920});
const fr=m.CAUGHT_SHADER_SOURCE.fragment.toLowerCase();
console.log(JSON.stringify({pure:a.every((x,i)=>x===b[i]),nul:m.caughtLayout(null)===null,counts,baseOut,maxWrist,maxTip,hid,shown:v.mesh.visible&&v.mesh.material.uniforms.uN.value===L.hands.length,
 black:m.caughtLayout(env(2.3)).black,flash:m.caughtLayout(env(1.9)).flash,edges:[...new Set(m.caughtLayout(env(1.6)).hands.map(h=>h.edge))],
 words:['blood','gore','face','skull','teeth','eye'].filter(w=>new RegExp('\\\\b'+w+'s?\\\\b').test(fr)),seedDiff:JSON.stringify(m.caughtLayout({...env(1),seed:8}))!==JSON.stringify(m.caughtLayout(env(1)))}));""")
    assert got['pure'] and got['nul'] and got['hid'] and got['shown'] and got['seedDiff'], got
    assert got['counts'][0] == 0 and got['counts'] == sorted(got['counts']) and got['counts'][-1] == 6, got
    assert got['baseOut'], got                      # every arm starts outside the frame
    assert got['maxWrist'] < .1 and got['maxTip'] < .3, got   # hands stay at the edges, the centre stays readable
    assert 'bottom' not in got['edges'], got        # nothing straight up from the bottom (would read as own hands)
    assert got['black'] == 1 and got['flash'] == 1 and not got['words'], got


def test_kaiju_is_original_showa_beast_and_animates():
    """v7 (HAGINO steering 2026-10-27): an ORIGINAL Showa-style giant — black, hunched on four legs, long neck, beaked +
    horned head, dorsal CRYSTAL prisms — and clearly not the famous upright lizard: no tail, not upright (longer than
    tall in its own frame), crystal shards rather than leaf plates, its own synth roar.  v8: the mouth fires a one-shot
    confetti / party-cannon blast on the roar instead of a beam (tests/test_v8_kaiju.py checks the blast itself)."""
    got = _node("""const T=await import('./web3d/vendor/three.module.min.js');const m=await import('./web3d/shibuya/series/kaiju.mjs');
const k=m.createKaiju({});const cam={position:new T.Vector3(0,2,-1000)};const box=()=>{k.group.updateMatrixWorld(true);return new T.Box3().setFromObject(k.group);};
const base={pos:[0,0],scale:150,seed:3,eyes:1,yaw:0,roarAt:3.2};
k.update({...base,rise:0,roar:0,t:0},{camera:cam});const b0=box();const vis0=k.group.visible;
k.update({...base,rise:1,roar:0,t:3},{camera:cam});const b1=box();const head0=new T.Vector3();k.parts.head.getWorldPosition(head0);const jaw0=k.parts.jaw.rotation.z;const blast0=k.parts.blast.visible;
k.update({...base,rise:1,roar:1,t:3.5},{camera:cam});const head1=new T.Vector3();k.parts.head.getWorldPosition(head1);const jaw1=k.parts.jaw.rotation.z;const blast1=k.parts.blast.visible;
const tb=new T.Box3().setFromObject(k.parts.torso);const ts=new T.Vector3();tb.getSize(ts);
let tris=0,draws=0;k.group.traverse(o=>{if(o.isMesh){draws++;const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;}});
const s1=new T.Vector3();b1.getSize(s1);
const p1=JSON.stringify(m.kaijuPose({...base,rise:.6,roar:.3,t:1.2},1.2)),p2=JSON.stringify(m.kaijuPose({...base,rise:.6,roar:.3,t:1.2},1.2));
console.log(JSON.stringify({vis0,top0:b0.max.y,bottom1:b1.min.y,top1:b1.max.y,torso:[ts.x,ts.y],head0:head0.y,head1:head1.y,jaw0,jaw1,blast0,blast1,
 legs:k.parts.legs.length,crystals:k.parts.crystals.length,horns:k.parts.horns.length,tris,draws,pure:p1===p2,
 parts:Object.keys(m.KAIJU_PARTS),desc:JSON.stringify(m.KAIJU_PARTS).toLowerCase()}));""")
    assert (not got['vis0']) or got['top0'] < 0, got              # below the skyline before the rise
    assert 140 < got['top1'] < 190 and got['bottom1'] > -10, got    # risen: ~150 m to the head top
    assert got['torso'][0] > got['torso'][1] * 1.2, got             # hunched: the torso is long and low, never upright
    assert got['legs'] == 4 and got['horns'] == 2 and got['crystals'] >= 10, got
    assert got['head1'] > got['head0'] and got['jaw1'] < got['jaw0'] - .4, got   # roar: rears up, beak opens
    assert not got['blast0'] and got['blast1'], got                 # the confetti cannon pops only on the roar
    assert got['tris'] < 15000 and got['draws'] <= 40 and got['pure'], got
    assert {'torso', 'legs', 'neck', 'head', 'mouth', 'horns', 'crystals', 'blast'} <= set(got['parts']), got
    assert 'beam' not in got['parts'], got
    assert 'tail' not in got['parts'] and 'beak' in got['desc'] and 'crystal' in got['desc'], got
    assert not any(w in got['desc'] for w in ['godzilla', 'gojira', 'maple', 'upright', 'leaf-shaped plate']) or 'not' in got['desc'], got
    src = (ROOT/'web3d/shibuya/series/kaiju.mjs').read_text(encoding='utf-8')
    assert 'ゴジラ' not in src and 'Godzilla' not in src


def test_caught_press_packs_in_without_facing_or_entering_the_camera():
    got = _node("""const m=await import('./web3d/shibuya/series/crowd-variants.mjs');const S=m.CROWD_STATES['caught-press'];
const P={at:[100,50],heading:.7};const h=S.setup({},P);const fx=Math.sin(.7),fz=Math.cos(.7);
const res={};for(const t of [0,.9,1.8,2.4]){const f=S.advance(h,t);let face=-1,minD=99,front=99;
 for(const p of f.people){const tx=100-p.x,tz=50-p.z,d=Math.hypot(tx,tz);minD=Math.min(minD,d);const al=-(tx*fx+tz*fz);
  if(al>-.3)face=Math.max(face,(Math.sin(p.heading)*tx+Math.cos(p.heading)*tz)/d);// people the camera can see (front half)
 if(al>0&&Math.abs(-tx*fz+tz*fx)<.35)front=Math.min(front,al);}
 res[t]={n:f.people.length,around:f.hud.numbers.around,face,minD,front,anims:[...new Set(f.people.map(p=>p.anim))],player:f.player,labelled:f.hud.items.every(i=>i.text.includes('シミュレーション'))};}
const zb=S.advance(S.setup({},{base:{key:'zone-dense',t0:4}}),1);const zp=zb.player;const inBase=zb.people.filter(p=>p.id<270000);
console.log(JSON.stringify({res,base:inBase.length,baseMin:Math.min(...inBase.map(p=>Math.hypot(p.x-zp.x,p.z-zp.z))),alias:m.resolveCrowdState('caught')}));""")
    r = got['res']
    assert r['2.4']['around'] > r['0']['around'] + 10, r           # packs in
    for t, s in r.items():
        assert s['face'] <= .2 + 1e-6, (t, s)                      # nobody faces the camera
        assert s['minD'] > .6 and s['front'] > 1.2, (t, s)         # nobody in / right in front of the camera
        assert set(s['anims']) <= {'idle', 'queue', 'phone'}, (t, s)   # neutral poses only (never reaching)
        assert s['labelled'] and s['player']['x'] == 100, (t, s)
    assert got['base'] > 100 and got['baseMin'] >= 3.4 and got['alias'] == 'caught-press', got


def test_zone_clear_clear_cone_keeps_the_eye_camera_free():
    got = _node("""import fs from 'fs';const S=await import('./web3d/shibuya/series/shots-variants.mjs');const C=await import('./web3d/shibuya/series/crowd-variants.mjs');
const wideData=JSON.parse(fs.readFileSync('web3d/data/series_wide_osm.json'));const cfg=JSON.parse(fs.readFileSync('web3d/shibuya/series/variants/jr/zone-clear.json'));
const ctx={wideData,insideBuilding:()=>false};const clear={ahead:8,behind:1.5,half:2.4,ease:3};
const worst=cl=>{let w={d:99,frac:0};for(const bid of ['result','stamp']){const b=cfg.beats.find(b=>b.id===bid);const shot=S.SHOTS.detour(ctx,b.shot.params);
 for(let i=0;i<=b.dur*30;i++){const t=i/30;const sh=shot(t+(b.shot.t0||0));const fr=C.crowdFrame('detour-light',t+(bid==='stamp'?4:0),{params:{...b.crowd.params,...(cl?{clear:cl}:{})}});
  const cp=sh.pos,lk=sh.look;let fx=lk.x-cp.x,fz=lk.z-cp.z;const l=Math.hypot(fx,fz);fx/=l;fz/=l;
  for(const p of fr.people){const dx=p.x-cp.x,dz=p.z-cp.z,a=dx*fx+dz*fz,s=dx*fz-dz*fx;if(a<.2||Math.abs(s)-.3>=a*.312)continue;
   const frac=Math.min(1,1.75/(2*a*Math.tan(29*Math.PI/180)))*Math.min(1,.55/(2*a*.312));const d=Math.hypot(dx,dz);if(d<w.d)w={d,frac:Math.max(w.frac,frac)};else w.frac=Math.max(w.frac,frac);}}}return w;};
const off=JSON.stringify(C.crowdFrame('detour-light',2.4,{params:{...cfg.beats.find(b=>b.id==='result').crowd.params}}).people),nul=JSON.stringify(C.crowdFrame('detour-light',2.4,{params:{...cfg.beats.find(b=>b.id==='result').crowd.params,clear:null}}).people);
console.log(JSON.stringify({orig:worst(null),fixed:worst(clear),defaultUnchanged:off===nul}));""")
    assert got['orig']['d'] < 2, got                 # the reported problem: somebody walks into the camera
    assert got['fixed']['d'] >= 4 and got['fixed']['frac'] < .15, got
    assert got['defaultUnchanged'], got


def test_v6_people_audit_press_plain_and_no_text_or_monsters():
    """v6 crowd/VFX audit: caught-press `plain` puts every press person in plain everyday clothes (type ORDINARY, no
    cat ears / hat) and is off by default (identical frames); the near-people shader / outfits carry no text, logo or
    monster body; the series crowd is ordinary-mode only."""
    got = _node("""const cv=await import('./web3d/shibuya/series/crowd-variants.mjs');const C=await import('./web3d/shibuya/costume.mjs');
const pc=await import('./web3d/shibuya/series/people-close.mjs');const fs=await import('node:fs');
const a=cv.crowdFrame('caught-press',1,{params:{seed:7}}),b=cv.crowdFrame('caught-press',1,{params:{seed:7,plain:false}}),p=cv.crowdFrame('caught-press',1,{params:{seed:7,plain:true}});
const press=p.people.filter(x=>x.role==='press');
const src=fs.readFileSync('web3d/shibuya/series/people-close.mjs','utf8');
const types=new Set();for(let i=0;i<5000;i++){types.add(pc.outfitOf(270000+i).type);}
console.log(JSON.stringify({same:JSON.stringify(a)===JSON.stringify(b),noType:a.people.every(x=>x.type===undefined),
 plain:press.length>0&&press.every(x=>x.type===C.ORDINARY),pos:JSON.stringify(p.people.map(x=>[x.x,x.z,x.heading]))===JSON.stringify(a.people.map(x=>[x.x,x.z,x.heading])),
 monster:[...types].filter(t=>C.MONSTER_TYPES.includes(t)),text:/fillText|CanvasTexture|logo|brand/i.test(src)}));""")
    assert got['same'] and got['noType'] and got['plain'] and got['pos'], got
    assert got['monster'] == [] and not got['text'], got


def test_v6_gate_hall_path_follows_env3d_new_south_orientation():
    """env3d v6: the New South (3F) hall's free side faces SOUTH (+z); a crowd entering runs south → north on the 3F
    floor, leaving runs the other way; without params.hall the state is unchanged (gate clear path)."""
    got = _node("""const cv=await import('./web3d/shibuya/series/crowd-variants.mjs');
const i=cv.gateHallPath({gate:'newSouth',dir:'in'}),o=cv.gateHallPath({gate:'newSouth',dir:'out'});
const f=cv.crowdFrame('gate-newsouth',3,{params:{hall:{gate:'newSouth'}}});
console.log(JSON.stringify({inZ:[i.path[0][1],i.path.at(-1)[1]],outZ:[o.path[0][1],o.path.at(-1)[1]],y:i.y,ys:[...new Set(f.people.map(p=>p.y))],py:f.player?.y}));""")
    assert got['inZ'][0] > got['inZ'][1] and got['outZ'][0] < got['outZ'][1], got
    assert got['y'] > 10 and got['ys'] == [got['y']] and got['py'] == got['y'], got
