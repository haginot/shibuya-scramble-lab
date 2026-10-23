"""Deterministic cinematic Shibuya recording: 39 s directed scene + 5 s credits,
1280x720, 30 fps (44 s).

The camera path, time-lapse factor and captions come from the shot list in
web3d/shibuya/director.mjs, shared with the live "Cinema" mode. Every frame
advances the simulation by exactly shot.speed/30 simulated seconds via
window.__frame(t); nothing advances on a wall-clock timer. Before frame 0 the
solver is warmed up to director.START_CLOCK so the corner queues have built up
during the vehicle phase and the all-way walk begins on camera.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import functools
import http.server
import json
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import threading
import time

FPS = 30
SCENE_SECONDS = 39
CREDIT_SECONDS = 5
SCENE_FRAMES = SCENE_SECONDS*FPS
CREDIT_FRAMES = CREDIT_SECONDS*FPS
# Captions live in director.mjs (one short line per shot); listed here for the
# video metadata and the regression test.
CAPTIONS = [
    (0,'渋谷 午後6時','shibuya, 18:00'),
    (6.5,'一人ひとりが、自分の道を','{agents} people, one at a time'),
    (13,'スクランブル','all-way walk'),
    (17,'光の一本一本が、一人の歩み','every trail is one person'),
    (27,'最後の一人が渡るまで、車は待つ','cars wait for the last walker'),
    (33.5,'トイモデル・予測ではない','toy model · not a prediction'),
]

CREDITS = '''国土交通省 Project PLATEAU・渋谷区 2023 / MLIT · Shibuya City 2023 — footprints + heights, modified · CC BY 4.0
https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023
© OpenStreetMap contributors · ODbL 1.0 (roads, rails, shops, derived vehicle tracks) · https://www.openstreetmap.org/copyright
Vehicles: Eclipse SUMO (EPL-2.0) on the OSM network · https://eclipse.dev/sumo/
Rendering: three.js (MIT) · procedural shaders, signage and screens; system Noto fonts (SIL OFL)
Station statistics 2024: JR East, Tokyo Metro, Tokyu, Keio (linked in docs/CALIBRATION.md)
Crossing scale: Asahi Shimbun 2016-04-22 (up to 3,000 per green) · see NOTICE and web3d/data/
Toy model scaled to public statistics — not a prediction · 公開統計を参考にしたトイモデル・予測ではない'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass


@contextmanager
def browser_with_webgl(playwright):
    args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
    browser=playwright.chromium.launch(args=args)
    page=browser.new_page()
    works=page.evaluate('!!document.createElement("canvas").getContext("webgl2")')
    page.close()
    xvfb=None
    if not works:
        browser.close()
        display=os.environ.get('DISPLAY')
        if shutil.which('Xvfb'):
            read_fd,write_fd=os.pipe()
            xvfb=subprocess.Popen(['Xvfb','-displayfd',str(write_fd),'-screen','0','1280x720x24','-nolisten','tcp'],pass_fds=[write_fd],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            os.close(write_fd)
            with os.fdopen(read_fd) as stream: display=':'+stream.readline().strip()
        if not display: raise RuntimeError('WebGL unavailable; install Xvfb or use a display with WebGL')
    try:
        if not works: browser=playwright.chromium.launch(headless=False,args=args,env={**os.environ,'DISPLAY':display})
        yield browser
    finally:
        browser.close()
        if xvfb:
            xvfb.terminate();xvfb.wait(timeout=10)


CREDIT_CARD = r"""(text)=>{const s=window.__shibuyaState;const card=document.createElement('div');card.id='credits';
card.innerHTML=`<div class="t">SHIBUYA <b>SCRAMBLE</b></div><div class="n">${s.agents.toLocaleString('en-US')} individual agents · ${s.lastCycle&&s.lastCycle.completed?s.lastCycle.completed.toLocaleString('en-US')+' crossed on foot in the last cycle · ':''}SUMO cars held on red</div><pre></pre><div class="c">built with Claude Code · github.com/haginot/shibuya-scramble-lab</div>`;
card.querySelector('pre').textContent=text;
Object.assign(card.style,{position:'fixed',inset:'0',zIndex:100,background:'radial-gradient(ellipse at 50% 40%,#1a1030 0%,#05060a 70%)',color:'#e9ebf3',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',font:'13px/1.75 Inter,"Noto Sans CJK JP",system-ui,sans-serif',opacity:0});
const st=document.createElement('style');st.textContent='#credits .t{font-weight:800;font-size:34px;letter-spacing:.32em}#credits .t b{font-weight:300;color:#ff4f9a}#credits .n{margin:8px 0 22px;font-size:12px;letter-spacing:.14em;color:#9fe8ff;text-transform:uppercase}#credits pre{font:inherit;white-space:pre-line;text-align:center;color:#c9ccd9;margin:0;max-width:1100px}#credits .c{margin-top:22px;font-size:11px;letter-spacing:.2em;color:#ffcf6a}';
document.head.append(st);document.body.append(card);}"""


def record(site,output,stills,frames=None):
    from playwright.sync_api import sync_playwright
    output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True)
    for name in ('NOTICE','LICENSE'):
        if (site/name).exists(): shutil.copyfile(site/name,stills/name)
    handler=functools.partial(QuietHandler,directory=str(site))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    errors=[];snapshots=[];start=time.monotonic();frame_ms=[]
    encoder=None
    scene_frames=frames or SCENE_FRAMES
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
            page.on('pageerror',lambda error:errors.append(str(error)))
            # Software WebGL on a busy machine can take tens of seconds per frame.
            page.set_default_timeout(600000)
            shot=lambda:page.screenshot(type='png',animations='disabled',timeout=600000)
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?record=1&cam=cinema')
            page.wait_for_function('window.__ready===true',timeout=180000)
            warm=page.evaluate('window.__warmup()')
            print(f"warm-up to clock {warm['clock']:.1f}s · {warm['agents']:,} agents · queued {warm['waiting']:,}",flush=True)
            encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','18','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={CREDITS}','-metadata',f'comment={CREDITS}\nDirected time-lapse (x1.4-x8, shown on screen); {SCENE_SECONDS} s scene, {CREDIT_SECONDS} s credits. Toy model, not a prediction.',str(output)],stdin=subprocess.PIPE)
            for frame in range(scene_frames):
                seconds=frame/FPS;t0=time.monotonic()
                state=page.evaluate(f'window.__frame({seconds})')
                png=shot()
                frame_ms.append((time.monotonic()-t0)*1000)
                encoder.stdin.write(png)
                if frame%FPS==0:
                    snapshots.append(dict(video_seconds=seconds,**{k:state.get(k) for k in ('agents','phase','clock','time','active','waiting','approaching','admitted','completed','rescued','deferred','lastCycle','vehicles','clearanceHold','shot','simulationMs')}))
                    if frame%(3*FPS)==0: (stills/f'{seconds:05.1f}s.png').write_bytes(png)
                    print(f"{seconds:4.1f}/{SCENE_SECONDS}s · {state['shot']} · {state['phase']} · crossing {state['active']:,} · queued {state['waiting']:,} · {frame_ms[-1]:.0f} ms/frame",flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            page.evaluate(CREDIT_CARD,CREDITS)
            for k in range(CREDIT_FRAMES):
                alpha=min(1,k/12,(CREDIT_FRAMES-1-k)/10+.0001)
                page.evaluate(f"document.getElementById('credits').style.opacity={max(0,alpha):.3f}")
                png=shot();encoder.stdin.write(png)
                if k==CREDIT_FRAMES//2:(stills/'credits.png').write_bytes(png)
            encoder.stdin.close()
            if encoder.wait(timeout=120): raise RuntimeError('ffmpeg failed')
            encoder=None
            assert not errors,errors
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
        if encoder:
            encoder.stdin.close();encoder.terminate();encoder.wait(timeout=10)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',str(output)]))
    duration=(scene_frames+CREDIT_FRAMES)/FPS
    assert abs(float(probe['format']['duration'])-duration)<.05,probe
    assert probe['streams'][0]['width']==1280 and probe['streams'][0]['height']==720,probe
    if frames is None:
        assert any(s['phase']=='walk' for s in snapshots) and any(s['phase']=='all-red' for s in snapshots),'the video must show the queue and the scramble'
        assert all(s['rescued']==0 for s in snapshots),'no safety-valve teleports during the recording'
    frame_ms.sort()
    result=dict(video=str(output),duration_s=duration,scene_s=scene_frames/FPS,credits_s=CREDIT_SECONDS,width=1280,height=720,fps=FPS,
                wall_seconds=round(time.monotonic()-start,1),render_ms_per_frame=dict(median=round(frame_ms[len(frame_ms)//2]),p95=round(frame_ms[int(len(frame_ms)*.95)])),
                captions=CAPTIONS,snapshots=snapshots,probe=probe,errors=errors,
                note='Offline deterministic capture (software WebGL in headless Chromium); render time per frame is not interactive FPS. See docs/PERFORMANCE.md.')
    (stills/'recording.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(output,result['wall_seconds'],'s',flush=True)


# ---------------------------------------------------------------- Halloween mode
# v4 "🧙ハロウィンの渋谷を脱出せよ！🎃 / Escape Shibuya on Halloween!" (web3d/shibuya/director-halloween.mjs):
# 42 s directed scene + 3 s end card (45 s). One pass renders every frame once and screenshots it four
# times: Japanese and English 16:9 overlays, and the same two with body.vcut (16:9 panels hidden, map
# labels kept) for the 9:16 cuts (tools/compose_vertical.py). All four show the same simulated people.
H_SCENE_SECONDS = 42
H_CREDIT_SECONDS = 3
H_LANGS = ('ja','en')
H_VLANGS = ('ja-v','en-v')
# Shot table (director-halloween.mjs SHOTS): start second, shot name, compose section.
H_SECTIONS = [(0,'broadcast','broadcast'),(1.5,'title','title'),(3.5,'rules','rules'),(7,'lv1','level'),(13,'lv2','level'),(19,'lv3','level'),
              (25,'lv4','level'),(31,'lv5','level'),(37,'overview','overview'),(39,'gameover','gameover'),(40,'question','question')]
# Parody beats (director-halloween.mjs TITLE_BEAT / GAME_CLOCK; escape-overlay.mjs ALERT; escape-copy.mjs BROADCAST).
H_TITLE_CLEAN = (1.72,3.2)        # title card held fully legible and unglitched (≥ 1 s)
H_HEADER_FROM = 3.5
H_GAME_CLOCK = (7,39)             # parody countdown 00:32 → 00:00 (game clock, not simulation)
H_ALERT = (3,4,.45)               # alert: off below 3 p/m² (the legend's red / DANGER red step); pulse = on+(1-on)·smoothstep(3,4,v)
H_PARODY_CUE = {'ja':'※これはパロディです','en':'PARODY — not a real alert'}
H_NOT_REAL = {'ja':'本物の警報・お知らせではありません','en':'This is not a real alert or notice'}
def countdown_at(t): a,b=H_GAME_CLOCK; return b-a if t<a else max(0,b-t)
def alert_pulse(v):
    a,b,on=H_ALERT
    if not v>=a: return 0.0
    k=min(1,max(0,(v-a)/(b-a))); return on+(1-on)*k*k*(3-2*k)
GAME_OVER_RE = re.compile(r'GAME\s*OVER|ゲームオーバー',re.I)
CAUGHT_RE = re.compile(r'CAUGHT|捕まった',re.I)
def _strings(o,path=()):
    if isinstance(o,str): yield path,o
    elif isinstance(o,dict):
        for k,v in o.items(): yield from _strings(v,path+(k,))
    elif isinstance(o,list):
        for i,v in enumerate(o): yield from _strings(v,path+(i,))
H_CAPTIONS = [(t,name,name) for t,name,_ in H_SECTIONS]  # (v4 has no caption line; kept for recording.json)
H_CREDITS = CREDITS.replace('Crossing scale: Asahi Shimbun 2016-04-22 (up to 3,000 per green) · see NOTICE and web3d/data/',
    'Escape routes: places, gates, stands and walk times from the sources listed on the end card (research 2026-10-23; docs/HALLOWEEN.md); positions on the map approximate\n'
    'Counts, timers, DANGER and ESCAPED/CAUGHT are simulation (web3d/shibuya/escape.mjs, toy model); 2026 crowd ≈18,000: Shibuya City expectation via Shibuya Keizai Shimbun 2026-09-30')

# End card (both languages in the DOM; body.lang-* shows one). Data from window.__hwEnd (escape-overlay.mjs endCard).
H_CREDIT_CARD = r"""(text)=>{const E=window.__hwEnd,L=(k,f=v=>v)=>`<span class="l-en">${f(E.en[k])}</span><span class="l-ja">${f(E.ja[k])}</span>`,esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
 emo=v=>esc(v).replace(/(\p{Extended_Pictographic}️?)/gu,'<span class="emo">$1</span>'),nl=v=>esc(v).replace(/\n/g,' '),list=k=>`<ul>${E[k].sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
const card=document.createElement('div');card.id='credits';
card.innerHTML=`<div class="t">${L('title',emo)}</div><div class="q">${L('question',emo)}</div><div class="sh">${L('sourcesHead')}</div><div class="src"><span class="l-en">${list('en')}</span><span class="l-ja">${list('ja')}</span></div><div class="n">${L('sim',nl)}</div><div class="n2">${L('walk',nl)} ・ ${L('check')}</div><div class="pa">${L('parody')}</div><pre></pre><div class="c">${L('data')} · built with Claude Code · github.com/haginot/shibuya-scramble-lab</div>`;
card.querySelector('pre').textContent=text;
Object.assign(card.style,{position:'fixed',inset:'0',zIndex:100,background:'radial-gradient(ellipse at 50% 35%,#2a1030 0%,#05040a 72%)',color:'#e9ebf3',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',font:'11px/1.5 Inter,"Noto Sans CJK JP","Noto Color Emoji",sans-serif',opacity:0});
const st=document.createElement('style');st.textContent='#credits .emo{font-family:"Noto Color Emoji"}#credits .t{font:700 40px/1.2 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;color:#FFF3E2;text-shadow:0 0 18px #FF8A1F99}.lang-en #credits .t{font:400 34px/1.2 Bungee,"Noto Color Emoji",sans-serif}#credits .q{font:700 32px/1.3 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;color:#ffcf6a;margin:6px 0 12px}.lang-en #credits .q{font:900 30px Inter,"Noto Color Emoji",sans-serif}#credits .sh{font:800 14px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.2em;color:#FF8A1F;text-transform:uppercase}#credits ul{columns:3;column-gap:28px;list-style:none;padding:0;margin:6px 0 10px;font:600 13.5px/1.6 Inter,"Noto Sans CJK JP",sans-serif;color:#E8DCFF;width:1080px}#credits .n{font:700 13.5px/1.5 Inter,"Noto Sans CJK JP",sans-serif;color:#d9c2ff;max-width:1100px;text-align:center}#credits .n2{font:600 13px/1.5 Inter,"Noto Sans CJK JP",sans-serif;color:#ffe2b8;margin:4px 0 8px}#credits .pa{font:800 13px Inter,"Noto Sans CJK JP",sans-serif;color:#0B0612;background:#FFD23F;padding:2px 10px;border-radius:5px;margin:0 0 8px}#credits pre{font:inherit;font-size:10px;white-space:pre-line;text-align:center;color:#9a9db0;margin:0;max-width:1200px}#credits .c{margin-top:8px;font-size:11px;letter-spacing:.14em;color:#ffcf6a}';
document.head.append(st);document.body.append(card);}"""


# Same formatting as escape-overlay.mjs / halloween-app.mjs (JavaScript Math.round rounds halves up).
def jsround(v): return math.floor(v+.5)
def fmt(v): return f'{jsround(v):,}'
def p2(v): return f'{jsround(v*10)/10:.1f}'
def mmss(s): return None if s is None else f'{int(s//60):02d}:{int(s%60):02d}'
EXIT_CLEAR = 2  # dispersal.mjs DISPERSAL.exitClear
def exit_clear_text(e):
    if e['clearAt']==0 and e['peakRun']<=EXIT_CLEAR: return 'never dense · 密集なし'
    return 'not cleared · 未解消' if e['clearAt'] is None else mmss(e['clearAt'])

DANGER_STEPS = (1,2,3,4)   # escape.mjs ESCAPE.dangerLevels (p/m²)
def danger_level(v): return sum(v>=t for t in DANGER_STEPS)
def rule_outcome(src):
    """escape.mjs ESCAPE.rule: ESCAPED iff arrived within simLimit and < denseMax s at ≥ 3 p/m²."""
    if src['denseSeconds']>=src['denseMax']: return 'caught'
    if src['arrived']: return 'escaped' if src['arriveAt']<=src['simLimit'] else 'caught'
    return 'caught' if src['simTime']>src['simLimit'] else None
BADGE = {'escaped':'✔','caught':'✖',None:''}
LABEL_SAFE = (160,1120,72,660)  # 9:16 crop column, below the header

_ROOT = Path(__file__).resolve().parents[1]
def _fact_ids():
    """Fact ids the video may show: used in escape-copy.mjs AND listed in sources-halloween.mjs FACT_SOURCES; never a dropped one."""
    import re
    src=(_ROOT/'web3d/shibuya/sources-halloween.mjs').read_text(encoding='utf-8')
    known=set(re.findall(r"'([A-Z]+-\d\d)':\{src:",src))
    dropped=set(re.findall(r"'([A-Z]+-\d\d)'",src[src.index('DROPPED_FACTS'):].split(';')[0])) if 'DROPPED_FACTS' in src else set()
    copy=set(re.findall(r"'([A-Z]+-\d\d)'",(_ROOT/'web3d/shibuya/escape-copy.mjs').read_text(encoding='utf-8')))
    return (known&copy)-dropped, dropped
FACT_IDS, DROPPED_IDS = _fact_ids()


def check_overlay(ov,sweep=None):
    """Every number on screen must equal the solver value it claims to show."""
    if ov.get('shown'):
        sh,src=ov['shown'],ov['source']
        for k in ('agents','crossing','queued','held'): assert sh[k]==fmt(src[k]),(k,sh,src)
        for k in ('peak','median'): assert sh[k]==p2(src[k]),(k,sh,src)
    if ov.get('hook'):
        h=ov['hook'];src=h['source']
        assert h['n']==fmt(src['n']) and src['n']==ESTIMATE_2026,h   # headline = the cited estimate, not a sim count
        assert h['line']=={'agents':fmt(src['agents']),'peak':p2(src['peak']),'held':fmt(src['held'])},h
    if ov.get('split'):
        sp=ov['split']
        for side in ('A','B'):
            v=sp[side];src=v['src']
            for k in ('inside','streets','gone','remaining'): assert v[k]==fmt(src[k]),(k,v)
            assert v['densNow']==p2(src['densNow']) and v['empty']==mmss(src['empty']),v
            assert src['inside']+src['streets']==src['remaining'],v
        assert sp['clock']=='+'+mmss(sp['source']['time'])
    if ov.get('board'):
        for row in ov['board']['rows']:
            for side in ('A','B'):
                assert row[side]['clear']==exit_clear_text(row['src'][side]) and row[side]['peak']==p2(row['src'][side]['peakRun']),row
    if ov.get('question'):
        q=ov['question']
        for side in ('A','B'):
            ex=q['source'][side];slow=max(ex,key=lambda e:float('inf') if e['clearAt'] is None else e['clearAt'])
            assert q['slowest'][side]==slow['key'] and q['clear'][side]==exit_clear_text(slow),q
    if ov.get('results'):
        r=ov['results'];A,B=r['source']['A'],r['source']['B'];rows=r['rows']
        assert rows[0][2:4]==[mmss(A['stationEmptyAt']) or '25:00+',mmss(B['stationEmptyAt']) or '25:00+']
        assert rows[1][2:4]==[fmt(A['remaining']),fmt(B['remaining'])]
        for col,src in ((2,A),(3,B)):
            cleared=src['denseClearedAt'] is not None and src['densePeakNow'] is not None and src['densePeakNow']<=2
            assert rows[2][col]==(mmss(src['denseClearedAt']) if cleared else '25:00+'),(rows[2],src)
        assert rows[3][2:4]==[fmt(A['crush']),fmt(B['crush'])]
        assert rows[4][2:4]==[f"{p2(A['peakCell'])} p/m²",f"{p2(B['peakCell'])} p/m²"]
        # Ranges: recomputed here from the sweep file; this run is the sweep's base scenario.
        sw=sweep if sweep is not None else load_sweep()
        assert r['sweep'],'results card must show the sweep ranges'
        rg=sweep_ranges(sw)
        for row,metric in zip(rows,('stationEmptyAt','remaining','denseClearedAt','crushPersonMinutes','peakCell')):
            assert row[4:6]==[rg[metric]['none'],rg[metric]['managed']],(row,rg[metric])
        base=next(q for q in sw['scenarios'] if q['key']=='base')
        assert (A['remaining'],B['remaining'],A['stationEmptyAt'],B['stationEmptyAt'])==(base['none']['remaining'],base['managed']['remaining'],base['none']['stationEmptyAt'],base['managed']['stationEmptyAt']),'video run = sweep base run'
    # ---- v4 escape overlay ----
    t=ov.get('t')
    if t is not None and ov.get('title') is not None:
        if H_HEADER_FROM<=t<H_SCENE_SECONDS: assert ov['title']['header'],('title header missing',t)
        if 1.5<=t<3.4: assert ov['title']['card'],('title card missing',t)
        tc=ov.get('titleChars')
        if H_TITLE_CLEAN[0]<=t<H_TITLE_CLEAN[1]:
            # held: complete, opaque, not flying and never glitched (the title stays fully legible)
            assert tc and all(tc[l]==tc['total'][l] for l in ('ja','en')),('title card not complete while held',t,tc)
            assert not ov['title'].get('glitch') and not ov['title'].get('fly') and ov['title'].get('alpha',1)==1,('title glitched/moving while held',t,ov['title'])
    # ---- parody layer ----
    if ov.get('section')=='broadcast':
        b=ov.get('broadcast');assert b,('cold open without the broadcast card',t)
        assert b['cue']==H_PARODY_CUE and b['notReal']==H_NOT_REAL,('parody cue / not-real line missing',b)
        assert b['alpha']>0 and (t>=1.4 or b['alpha']==1),('parody card not fully on screen',t,b['alpha'])
        for lang in ('ja','en'):
            tb=(ov.get('text') or {}).get(lang,{}).get('broadcast') or {}
            assert tb.get('parody')==H_PARODY_CUE[lang] and tb.get('notReal')==H_NOT_REAL[lang],('9:16 broadcast strings missing the parody cue',lang)
    if ov.get('countdown'):
        c=ov['countdown'];assert c['shown']==mmss(countdown_at(c['src']['t'])) and (c['src']['from'],c['src']['to'])==H_GAME_CLOCK,c
    if ov.get('survivors'):
        sv=ov['survivors'];src=sv['src']
        assert sv['shown']['escaped']==fmt(src['arrived']) and sv['shown']['left']==fmt(src['walking']+src['pending']),sv
        if src.get('perBranch'): assert src['arrived']+src['walking']+src['pending']==src['perBranch']*src['branches'],('survivor counter does not conserve walkers',sv)
        e=ov.get('escape')
        if e: assert src['arrived']==sum(b['src']['arrived'] for b in e['branches']) and src['walking']==sum(b['src']['walking'] for b in e['branches']),('survivor counter ≠ branch counters',sv)
    if ov.get('alert'):
        a=ov['alert'];src=a['src']
        assert a['on']==(alert_pulse(src['value'])>=H_ALERT[2])==(src['value']>=H_ALERT[0]),('alert label does not follow the sim density (red = 3+ p/m²)',a)
        if a['on'] and a.get('where')=='route': assert a.get('key'),('route alert without its route key',a)
        assert a['shown']==(p2(src['value']) if a['on'] else ''),a
        assert src['value']==max(src['player'],src['route']),a
        e=ov.get('escape')
        if e: assert jsround(src['player']*1000)==jsround(e['danger']['src']*1000),('alert player value ≠ HUD DANGER',a,e['danger'])
    # GAME OVER is only the end-of-game parody title (gameover shot, sim tally); never a route result.
    # CAUGHT may only appear as a stamp the sim rule produced.
    go=ov.get('gameOver')
    if go:
        assert ov.get('section')=='gameover' and go['section']=='gameover',('GAME OVER outside the end-of-game title',ov.get('section'))
        assert go['shown']['escaped']==sum(o=='escaped' for o in go['src']['outcomes']) and go['shown']['total']==len(go['src']['outcomes']),go
    for lang,T in (ov.get('text') or {}).items():
        for path,v in _strings(T):
            if GAME_OVER_RE.search(v): assert path[:1]==('gameover',) and ov.get('section')=='gameover',('GAME OVER shown outside the end-of-game title',lang,path,v)
            if CAUGHT_RE.search(v):
                st=(ov.get('escape') or {}).get('stamp') or {}
                stamp_ok=path[:3]==('level','stamp','main') and st.get('shown')=='caught' and rule_outcome(st['src'])=='caught'
                rows=(ov.get('overview') or {}).get('rows') or []
                row_ok=path[:1]==('overview',) and len(path)>2 and path[1]<len(rows) and rows[path[1]]['src']['outcome']=='caught'
                assert stamp_ok or row_ok,('CAUGHT shown without a sim CAUGHT outcome',lang,path,v)
    if ov.get('mission'):
        m=ov['mission'];assert m['n']==fmt(ESTIMATE_2026) and m['src']==ESTIMATE_2026,m   # cited estimate, not a sim count
    if ov.get('escape'):
        e=ov['escape'];ts=e['timer']['src']
        assert e['timer']['shown']=='SIM +'+mmss(ts['arriveAt'] if ts['arrived'] else ts['simTime']),e['timer']
        d=e['danger'];assert d['shown']==p2(d['src']) and d['level']==danger_level(d['src'])==d['srcLevel'],d
        for b in e['branches']:
            sh,src=b['shown'],b['src']
            assert sh['walking']==fmt(src['walking']) and sh['arrived']==fmt(src['arrived']) and sh['density']==p2(src['density']),b
            # routes that leave the sim area only reach its edge: never a ✔/✖ for them
            assert sh['badge']==('' if b.get('edge') else BADGE[src['outcome']]),b
            assert 0<=src['walking'] and 0<=src['arrived'],b
        st=e['stamp'];want=rule_outcome(st['src'])
        if st['visible']: assert st['shown']==want and want is not None,(st,want)
        vs=e.get('vs')
        if vs:
            for r in vs['rows']:
                sh,src=r['shown'],r['src']
                on=src['arriveAt'] is not None and src['simTime']+1e-6>=src['arriveAt']
                assert r['on']==on,r
                assert sh['time']==('+'+mmss(src['arriveAt']) if on else ''),r
                assert sh['dense']==(str(jsround(src['denseSeconds'])) if on and src['denseSeconds']>=.5 else ''),r
                assert sh['badge']==('' if r['edge'] or not on else BADGE[src['outcome']]),r
            c=vs.get('cmp')
            if c:
                rows={r['key']:r for r in vs['rows']}
                assert c['src']['a']==rows[c['a']]['src']['arriveAt'] and c['src']['b']==rows[c['b']]['src']['arriveAt'],c
                assert not rows[c['b']]['edge'] and rows[c['a']]['example'],c
                r=c['src']['b']/c['src']['a'];assert c['ratio']==p2(r),c
                assert c['kind']==('slower' if r>=1.2 else 'faster' if r<=1/1.2 else 'same'),c
    if ov.get('overview'):
        for r in ov['overview']['rows']:
            assert r['shown']['time']==mmss(r['src']['arriveAt']) and r['shown']['outcome']==r['src']['outcome'],r
    if 'claims' in ov:
        claims,foot=set(ov['claims']),set(ov['footnote'])
        assert claims<=foot,('claims without a footnote',claims-foot)
        assert foot<=FACT_IDS,('unknown or dropped fact ids',foot-FACT_IDS)
        assert not (claims|foot)&DROPPED_IDS
    for lab in ov.get('labels') or []:
        x0,x1,y0,y1=LABEL_SAFE
        assert x0<=lab['x']<=x1 and y0<=lab['y']<=y1,('label outside the 9:16 column',lab)
        b=lab.get('box');assert b,('label without its box',lab)   # full label box at the 9:16 scale, widest of ja/en
        assert x0<=b['x0'] and b['x1']<=x1 and y0<=b['y0'] and b['y1']<=y1,('label box clipped by the 9:16 column',lab)


SWEEP_PATH = Path(__file__).resolve().parents[1]/'web3d/data/shibuya_dispersal_sweep.json'
def load_sweep(path=SWEEP_PATH): return json.loads(Path(path).read_text(encoding='utf-8'))
SWEEP_METRICS = {'remaining':fmt,'stationEmptyAt':lambda v:mmss(v) or '25:00+','denseClearedAt':lambda v:mmss(v) or '25:00+','crushPersonMinutes':fmt,'peakCell':p2}
def sweep_ranges(sweep):
    """Same as halloween-app.mjs sweepRanges(): min–max per metric and strategy (None = not reached, sorts last)."""
    out={'n':len(sweep['scenarios'])}
    for metric,f in SWEEP_METRICS.items():
        out[metric]={}
        for k in ('none','managed'):
            v=sorted((q[k][metric] for q in sweep['scenarios']),key=lambda x:float('inf') if x is None else x)
            lo,hi=f(v[0]),f(v[-1]);out[metric][k]=lo if lo==hi else f'{lo}–{hi}'
    inf=lambda x:float('inf') if x is None else x
    out['fewerWaiting']=sum(q['managed']['remaining']<q['none']['remaining'] for q in sweep['scenarios'])
    out['laterStation']=sum(inf(q['managed']['stationEmptyAt'])>inf(q['none']['stationEmptyAt']) for q in sweep['scenarios'])
    return out


ESTIMATE_2026 = 18000  # sources-halloween.mjs CROWD_2026.estimate (Shibuya City expectation, Shibukei 2026-09-30)


def lang_path(path,lang):
    return path if lang=='ja' else path.with_name(path.stem+'-'+lang+path.suffix)


def frame_record(seconds,state,ov):
    """Per-frame values for the 9:16 cuts (compose_vertical.py): the overlay strings checked by
    check_overlay for this frame and the escape run's frame log (solver values of this frame)."""
    return {'t':seconds,'shot':state['shot'],'section':state.get('section'),'u':ov.get('u'),'agents':state['agents'],'fly':ov.get('titleFly',0),
            'text':ov.get('text'),'esc':ov.get('frameLog'),'peak':state['density']['peak']}


def record_halloween(site,output,stills,frames=None,stills_at=None,start_frame=0):
    """Writes `output` (Japanese) and `<output>-en` (English), the two body.vcut captures for the
    9:16 cuts (stills/vcut-ja.mp4, stills/vcut-en.mp4) and stills/frames.jsonl (per-frame strings and
    solver values for tools/compose_vertical.py). start_frame>0 resumes a crashed capture: the main
    crowd is advanced deterministically (window.__skip, no rendering) up to that frame, the videos then
    hold frames from start_frame on (join them to the first part with ffmpeg concat) and frames.jsonl
    is appended to. stills_at: only preview stills (4 per time: ja, en, ja-v, en-v) + preview-frames.jsonl;
    times ≥ the scene length render the end card."""
    from playwright.sync_api import sync_playwright
    output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True)
    handler=functools.partial(QuietHandler,directory=str(site))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    errors=[];snapshots=[];overlays=[];start=time.monotonic();frame_ms=[];encoders={}
    outputs={lang:lang_path(output,lang) for lang in H_LANGS}
    outputs.update({v:stills/f'vcut-{v[:2]}.mp4' for v in H_VLANGS})
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('console',lambda m:print('console:',m.text,flush=True) if m.type in ('error','warning') else None)
            page.set_default_timeout(1800000)
            shot=lambda:page.screenshot(type='png',animations='disabled',timeout=900000)
            def shots():
                out={}
                for lang in H_LANGS: page.evaluate(f"window.__setLang('{lang}')");out[lang]=shot()
                page.evaluate('window.__setVcut(true)')
                for v in reversed(H_VLANGS): page.evaluate(f"window.__setLang('{v[:2]}')");out[v]=shot()
                page.evaluate('window.__setVcut(false)')
                return out
            agents=os.environ.get('HALLOWEEN_AGENTS')  # preview only (smaller crowd); the video uses the default
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?mode=halloween&record=1&cam=cinema'+(f'&agents={int(agents)}' if agents else ''))
            for _ in range(1200):
                if errors: raise RuntimeError('; '.join(errors))
                if page.evaluate('window.__ready===true'): break
                page.wait_for_timeout(500)
            else: raise RuntimeError('viewer never became ready')
            plan=page.evaluate('window.__videoPlan')
            scene_seconds,credit_seconds=plan['scene'],plan['credits']
            assert (scene_seconds,credit_seconds)==(H_SCENE_SECONDS,H_CREDIT_SECONDS),plan
            assert plan['estimate']==ESTIMATE_2026,plan
            t_warm=time.monotonic()
            warm=page.evaluate('window.__warmup()')
            esc=warm['escape']
            print(f"warm-up to clock {warm['clock']:.1f}s · {warm['agents']:,} agents · held {warm['held']:,} · escape run {esc['count']} keyframes in {esc['ms']/1000:.0f} s (warm-up {time.monotonic()-t_warm:.0f} s)",flush=True)
            for L in esc['summary']['levels']:
                print('  '+L['key']+': '+' · '.join(f"{b['key']}{'*' if b['recommended'] else ''} {b['outcome']} p50 {b['travelP50']} peak {b['maxDensity']:.2f}" for b in L['branches']),flush=True)
            (stills/'escape-summary.json').write_text(json.dumps(esc['summary'],ensure_ascii=False,indent=1),encoding='utf-8')
            (stills/'endcard.json').write_text(json.dumps(page.evaluate('window.__hwEnd'),ensure_ascii=False,indent=1),encoding='utf-8')
            if stills_at:
                # Preview: where does the simulated density trigger the RED ALERT? Add the strongest frame of the
                # two strongest levels (if any reaches the label threshold) to the stills.
                tl=page.evaluate('window.__hwDebug.alertTimeline()')
                (stills/'alert-timeline.json').write_text(json.dumps(tl),encoding='utf-8')
                best={}
                for r in tl:   # only frames that a 0.1 s still time lands on exactly
                    if abs(r['t']*FPS-round(round(r['t'],1)*FPS))>1e-3: continue
                    if r['level'] not in best or r['value']>best[r['level']]['value']: best[r['level']]=r
                for k,r in best.items(): print(f"  alert {k}: max {r['value']:.2f} p/m² (pulse {alert_pulse(r['value']):.2f}) at {r['t']:.2f}s",flush=True)
                on=sorted((r for r in best.values() if alert_pulse(r['value'])>=H_ALERT[2]),key=lambda r:-r['value'])[:2]
                stills_at=sorted(set(stills_at)|{round(r['t'],1) for r in on})
                done=0;log=(stills/'preview-frames.jsonl').open('w',encoding='utf-8')
                for t in sorted(stills_at):
                    if t>=scene_seconds:
                        if not page.evaluate("!!document.getElementById('credits')"): page.evaluate(H_CREDIT_CARD,H_CREDITS)
                        page.evaluate("document.getElementById('credits').style.opacity=1")
                        for lang,png in shots().items(): (stills/f'preview-{t:05.1f}s-{lang}.png').write_bytes(png)
                        log.write(json.dumps({'t':t,'shot':'credits','section':'credits'})+'\n');continue
                    target=round(t*FPS)
                    while done<target: page.evaluate(f'window.__skip({done/FPS})');done+=1
                    state=page.evaluate(f'window.__frame({done/FPS})');done+=1
                    for lang,png in shots().items(): (stills/f'preview-{t:05.1f}s-{lang}.png').write_bytes(png)
                    ov=page.evaluate('window.__hwOverlay');check_overlay(ov)
                    log.write(json.dumps(frame_record(t,state,ov),ensure_ascii=False)+'\n')
                    print(f"still {t}s · {state['shot']} · labels {len(ov.get('labels') or [])} · claims {sorted(set(ov.get('claims') or []))}",flush=True)
                    if errors: raise RuntimeError('; '.join(errors))
                log.close()
                return
            for lang,path in outputs.items():
                meta=f'comment={H_CREDITS}\nEscape Shibuya on Halloween ({lang}): counts, timers, DANGER and ESCAPED/CAUGHT are simulation; places and measures carry sources; the 2026 crowd figure is a cited estimate. Toy model, not a prediction.'
                encoders[lang]=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','17','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={H_CREDITS}','-metadata',meta,str(path)],stdin=subprocess.PIPE)
            scene_frames=frames or scene_seconds*FPS
            for frame in range(start_frame): page.evaluate(f'window.__skip({frame/FPS})')
            framelog=(stills/'frames.jsonl').open('a' if start_frame else 'w',encoding='utf-8')
            for frame in range(start_frame,scene_frames):
                seconds=frame/FPS;t0=time.monotonic()
                state=page.evaluate(f'window.__frame({seconds})')
                pngs=shots();frame_ms.append((time.monotonic()-t0)*1000)
                for lang,png in pngs.items(): encoders[lang].stdin.write(png)
                ov=page.evaluate('window.__hwOverlay');check_overlay(ov)
                assert state['teleports']==0 and state['rescued']==0,'no relocation in the Halloween crowd'
                assert state['density']['peak']<=5+1e-9,state['density']
                framelog.write(json.dumps(frame_record(seconds,state,ov),ensure_ascii=False)+'\n')
                if frame%(FPS//2)==0:
                    snap={k:state.get(k) for k in ('agents','phase','clock','time','active','waiting','held','released','cutoffs','teleports','rescued','shot','section','density','drawCalls','triangles','escape')}
                    snap['video_seconds']=seconds
                    snapshots.append(snap);overlays.append({k:v for k,v in ov.items() if k!='text'})
                    if frame%(3*FPS//2)==0:
                        for lang in H_LANGS: (stills/f'{seconds:05.1f}s-{lang}.png').write_bytes(pngs[lang])
                    e=state.get('escape') or {}
                    extra=f" · {e['level']} sim +{e['simTime']:.0f}s danger {e['danger']['value']:.2f}" if e else ''
                    print(f"{seconds:4.1f}/{scene_seconds}s · {state['shot']} · peak {state['density']['peak']:.2f}{extra} · {frame_ms[-1]:.0f} ms/frame",flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            framelog.close()
            page.evaluate(H_CREDIT_CARD,H_CREDITS)
            credit_frames=credit_seconds*FPS
            for k in range(credit_frames):
                alpha=min(1,k/10,(credit_frames-1-k)/8+.0001)
                page.evaluate(f"document.getElementById('credits').style.opacity={max(0,alpha):.3f}")
                for lang,png in shots().items():
                    encoders[lang].stdin.write(png)
                    if k==credit_frames//2 and lang in H_LANGS:(stills/f'credits-{lang}.png').write_bytes(png)
            for lang,enc in list(encoders.items()):
                enc.stdin.close()
                if enc.wait(timeout=300): raise RuntimeError(f'ffmpeg failed ({lang})')
                del encoders[lang]
            assert not errors,errors
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
        for enc in encoders.values():
            enc.stdin.close();enc.terminate();enc.wait(timeout=10)
    duration=(scene_frames-start_frame+credit_frames)/FPS
    probes={}
    for lang,path in outputs.items():
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',str(path)]))
        assert abs(float(probe['format']['duration'])-duration)<.05,probe
        assert probe['streams'][0]['width']==1280 and probe['streams'][0]['height']==720,probe
        probes[lang]=probe
    frame_ms.sort()
    result=dict(videos={k:str(v) for k,v in outputs.items()},mode='halloween',version='v4 escape',duration_s=duration,scene_s=scene_frames/FPS,credits_s=credit_seconds,width=1280,height=720,fps=FPS,
                wall_seconds=round(time.monotonic()-start,1),render_ms_per_frame=dict(median=round(frame_ms[len(frame_ms)//2]),p95=round(frame_ms[int(len(frame_ms)*.95)])),
                sections=H_SECTIONS,snapshots=snapshots,overlays=overlays,escape_summary=esc['summary'],probe=probes,errors=errors,estimate_2026=ESTIMATE_2026,
                note='Offline deterministic capture (software WebGL); every on-screen sim number was checked against the escape run of the same frame (check_overlay), fact ids on screen are resolved in the footnote of the same frame; Japanese, English and the two 9:16 source captures are screenshots of the same rendered frame.')
    (stills/'recording.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(*outputs.values(),result['wall_seconds'],'s',flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site',type=Path)
    ap.add_argument('--output',type=Path,default=Path('out/media/shibuya-scramble.mp4'))
    ap.add_argument('--stills',type=Path,default=Path('out/media/shibuya-scramble'))
    ap.add_argument('--frames',type=int,help='only the first N scene frames (quick preview)')
    ap.add_argument('--mode',choices=['normal','halloween'],default='normal',help='halloween: costumes, police crowd control and the station-closing comparison')
    ap.add_argument('--start-frame',type=int,default=0,help='halloween: resume a crashed capture from this scene frame')
    ap.add_argument('--stills-at',type=lambda v:[float(x) for x in v.split(',')],help='halloween: only write preview stills at these video seconds')
    args=ap.parse_args()
    if args.mode=='halloween': record_halloween(args.site.resolve(),args.output.resolve(),args.stills.resolve(),args.frames,args.stills_at,args.start_frame)
    else: record(args.site.resolve(),args.output.resolve(),args.stills.resolve(),args.frames)
