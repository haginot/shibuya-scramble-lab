"""v8 kaiju (HAGINO steering 2026-10-28, STEERING-sim-core §E, fewer echoes of the famous film monster): web3d/shibuya/series/kaiju.mjs.

* The dorsal crystals (and the warm rim light) glow in a NON-BLUE party palette that cycles over time: no hue in the
  blue / cyan / violet-blue band 170°–260° anywhere in partyColor(), in the crystal / rim uniforms, or in the confetti.
* No beam: no cylinder / beam mesh at all; instead a one-shot confetti / party-cannon blast at roarAt + popDelay —
  nothing before the pop, then hundreds of paper pieces flying UP (positive y velocity), streamers and a pop flash;
  the blast state is a pure function of env/time (resumable segment renders).
* tools/audio/sfx.py has an original synthesised `party_popper` (registered like the other SFX), non-silent, peak-safe.
"""
import colorsys
import json
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _node(script, timeout=300):
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                         capture_output=True, text=True, timeout=timeout).stdout
    return json.loads(out.strip().splitlines()[-1])


def _blueish(rgb, min_sat=.12):
    h, s, v = colorsys.rgb_to_hsv(*[max(0., min(1., c)) for c in rgb])
    return s >= min_sat and v > .02 and 170 <= h * 360 <= 260


PRE = """const T=await import('./web3d/vendor/three.module.min.js');const m=await import('./web3d/shibuya/series/kaiju.mjs');
const k=m.createKaiju({});const cam={position:new T.Vector3(0,2,-1000)};
const env=(t,roar)=>({pos:[0,0],scale:480,ground:500,seed:3,eyes:1,rise:1,roarAt:1.85,t,roar:roar??(t<1.85?0:Math.min(1,(t-1.85)/.22))});
"""


def test_party_palette_has_no_blue():
    got = _node(PRE + """
const pal=[];for(let i=0;i<2000;i++)pal.push(m.partyColor(i/2000));
const cry=[],rim=[];for(let i=0;i<80;i++){const t=i*.05;k.update(env(t),{camera:cam,time:60+t});
 for(const c of k.parts.crystals){cry.push(c.material.uniforms.uColor.value.toArray(),c.material.uniforms.uColor2.value.toArray());}
 const u=k.parts.torso.material.uniforms;rim.push(u.uRimA.value.toArray(),u.uRimB.value.toArray());}
const conf=m.kaijuBlastState(env(2.6),2.6).pieces.map(p=>p.color);
const strm=m.kaijuBlastState(env(2.6),2.6).streamers.map(s=>s.color);
const crySet=new Set(cry.map(c=>c.map(x=>x.toFixed(2)).join()));
console.log(JSON.stringify({pal,cry,rim,conf,strm,nCry:crySet.size,defaults:m.KAIJU_DEFAULTS.colors,desc:JSON.stringify(m.KAIJU_PARTS).toLowerCase()}));""")
    for name in ('pal', 'cry', 'rim', 'conf', 'strm'):
        bad = [c for c in got[name] if _blueish(c)]
        assert not bad, (name, bad[:5])
    hues = {round(colorsys.rgb_to_hsv(*c)[0] * 360 / 30) for c in got['pal']}
    assert len(hues) >= 5, hues                       # really cycles through several colours (pink/orange/yellow/lime/magenta)
    assert got['nCry'] > 40, got['nCry']             # the crystals change colour over time (party lights)
    for key, v in got['defaults'].items():           # no blue left in the default colours either
        if key in ('body', 'belly', 'horn', 'beak', 'mouth'):
            continue
        rgb = [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]
        assert not _blueish(rgb), (key, hex(v))
    for w in ('violet', 'cyan', 'beam from'):
        assert w not in got['desc'], w
    src = (ROOT / 'web3d/shibuya/series/kaiju.mjs').read_text(encoding='utf-8')
    assert 'vec3(.45,.25,.9)' not in src and 'vec3(.3,.8,1.)' not in src   # the old violet/cyan rim is gone


def test_no_beam_mesh_and_confetti_blast_fires_up_at_the_pop():
    got = _node(PRE + """
const geos=[],names=[];k.update(env(2.6),{camera:cam,time:62.6});k.group.traverse(o=>{if(o.isMesh)geos.push(o.geometry.type);names.push(o.name||'');});
const st=t=>m.kaijuBlastState(env(t),t);const pose=t=>m.kaijuPose(env(t),t);
const popT=1.85+m.KAIJU_BLAST.popDelay;
const before=[1.0,1.7,1.9,popT-.005].map(t=>({n:st(t).pieces.length,s:st(t).streamers.length,f:st(t).flash,blast:pose(t).blast,
 vis:(k.update(env(t),{camera:cam,time:60+t}),k.parts.blast.visible)}));
const at=st(popT+.03),late=st(3.9);
const vy=at.pieces.map(p=>p.v[1]),y=late.pieces.map(p=>p.p[1]);
k.update(env(popT+.03),{camera:cam,time:60+popT+.03});const visAt=k.parts.blast.visible&&k.parts.confetti.visible,count=k.parts.confetti.count;
// pure / resumable: same answer regardless of evaluation order or prior frames
const a=JSON.stringify(st(2.7));for(const t of [3.5,1.0,2.2])st(t);const b=JSON.stringify(st(2.7));
const k2=m.createKaiju({});k2.update(env(2.7),{camera:cam,time:62.7});const k1m=new T.Matrix4(),k2m=new T.Matrix4();
k.update(env(2.7),{camera:cam,time:62.7});k.parts.confetti.getMatrixAt(123,k1m);k2.parts.confetti.getMatrixAt(123,k2m);
console.log(JSON.stringify({geos,names,parts:Object.keys(k.parts),before,n:at.pieces.length,streamers:at.streamers.length,flash:at.flash,
 vyMin:Math.min(...vy),vyMean:vy.reduce((s,v)=>s+v,0)/vy.length,yLateMin:Math.min(...y),yLateMean:y.reduce((s,v)=>s+v,0)/y.length,
 lateN:late.pieces.length,visAt,count,pure:a===b,sameMesh:k1m.equals(k2m),popT,blastAt:pose(popT+.03).blast,beamAlias:pose(popT+.03).beam,
 legacy:m.kaijuBlastState({rise:1,roar:.2,t:5,seed:3},5).pieces.length,legacyOn:m.kaijuBlastState({rise:1,roar:1,t:5,seed:3},5).pieces.length}));""")
    assert not any('Cylinder' in g for g in got['geos']), got['geos']            # no beam cylinder at all
    assert not any('beam' in n.lower() for n in got['names']) and 'beam' not in got['parts'], got['names']
    for b in got['before']:                                                        # nothing before the pop
        assert b['n'] == 0 and b['s'] == 0 and b['f'] == 0 and b['blast'] == 0 and not b['vis'], got['before']
    assert abs(got['popT'] - 1.95) < 1e-9                                          # pop = roarAt + 0.1 s
    assert got['n'] >= 300 and got['streamers'] >= 3 and got['flash'] > .3, got
    assert got['vyMin'] > 0 and got['vyMean'] > 1.0, got                          # every piece flies up at the pop
    assert got['lateN'] >= 300 and got['yLateMean'] > .1 and got['yLateMin'] > -.1, got   # still up in the sky at the beat end
    assert got['visAt'] and got['count'] >= 300 and got['blastAt'] == 1 and got['beamAlias'] == 1, got
    assert got['pure'] and got['sameMesh'], got
    assert got['legacy'] == 0 and got['legacyOn'] > 0, got                        # envs without roarAt: from the roar value


@pytest.mark.skipif(not shutil.which('uv'), reason='needs uv')
def test_party_popper_sfx_exists_and_is_non_silent():
    code = """import json,numpy as np,sfx,dsp
y=sfx.get('party_popper')
rms=lambda a,b:float(20*np.log10(np.sqrt((y[:,dsp.ns(a):dsp.ns(b)]**2).mean())+1e-12))
print(json.dumps({'reg':'party_popper' in sfx.REGISTRY,'lvl':'party_popper' in sfx.BASE_DB,'comedic':'party_popper' in sfx.COMEDIC,
 'hit':sfx.HIT_AT.get('party_popper'),'alias':[sfx.canonical(a) for a in ('popper','confetti','party-cannon')],
 'dur':y.shape[1]/dsp.SR,'peak':float(20*np.log10(np.abs(y).max())),'tp':float(dsp.true_peak_db(y)),
 'pop':rms(0,.05),'squeak':rms(.1,.45),'rustle':rms(.5,.9),'finite':bool(np.isfinite(y).all())}))"""
    out = subprocess.run(['uv', 'run', '--quiet', '--no-project', '--with', 'numpy>=1.26', '--with', 'scipy>=1.11', 'python', '-c', code],
                         cwd=ROOT / 'tools' / 'audio', capture_output=True, text=True, timeout=300, check=True).stdout
    got = json.loads(out.strip().splitlines()[-1])
    assert got['reg'] and got['lvl'] and got['comedic'] and got['hit'] == 0.0, got
    assert got['alias'] == ['party_popper'] * 3, got
    assert 0.9 < got['dur'] < 1.6 and got['finite'], got
    assert -12 < got['peak'] <= -1.0 and got['tp'] <= -1.0, got                   # audible, peak-safe
    assert got['pop'] > got['squeak'] > got['rustle'] > -60, got                   # pop, then squeak, then a rustle tail
