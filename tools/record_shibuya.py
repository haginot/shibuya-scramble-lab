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
# web3d/shibuya/director-halloween.mjs: 42 s directed scene + 3 s end card (45 s).
# One pass renders every frame once and screenshots it twice (Japanese and English
# overlays; the 3D frame is identical), so both videos show the same simulated people.
H_SCENE_SECONDS = 42
H_CREDIT_SECONDS = 3
H_LANGS = ('ja','en')
H_CAPTIONS = [
    (0,'10/31 渋谷駅、どう帰る？','Shibuya on Halloween: heads-up'),
    (2.5,'10/31夜、渋谷で働く・観光する人へ · 仮定 {agents}人','Working or sightseeing in Shibuya on Oct 31? · sim: {agents} people'),
    (6.5,'警察の規制で待機→段階的に解放','expect to be held, then released in waves'),
    (10.5,'DJポリスの指示に従って','follow the "DJ police" instructions'),
    (14,'歩行者青・前列から順に','all-way green: row by row'),
    (19,'00:30 駅閉鎖：規制なし vs 一方通行＋段階的解放','00:30 station closes: no control vs one-way + staged release'),
    (31,'出口別・混雑が解消した時刻','which exit clears first?'),
    (36,'駅閉鎖から25分後','25 minutes after the station closes'),
    (39.5,'あなたならどこから帰る？','Which exit would you take?'),
]
H_CREDITS = CREDITS.replace('Crossing scale: Asahi Shimbun 2016-04-22 (up to 3,000 per green) · see NOTICE and web3d/data/',
    'Halloween crowd, police measures, station closing, exit zones and costumes are illustrative sim assumptions (web3d/shibuya/halloween.mjs, dispersal.mjs)\n'
    'Crowd estimate 2026 ≈18,000 at peak: Shibuya City expectation via Shibuya Keizai Shimbun 2026-09-30 · past counts: Shibukei 2025-10-02, Tokyo Shimbun 2024-11-01 (web3d/shibuya/sources-halloween.mjs)')

H_CREDIT_CARD = r"""(text)=>{const s=window.__shibuyaState,L=(en,ja)=>`<span class="l-en">${en}</span><span class="l-ja">${ja}</span>`,N=(s.dispersal.A.remaining+s.dispersal.A.left).toLocaleString('en-US'),A=s.agents.toLocaleString('en-US');const card=document.createElement('div');card.id='credits';
card.innerHTML=`<div class="t">SHIBUYA <b>HALLOWEEN</b></div><div class="q">${L('Which exit would you take?','あなたならどこから帰る？')}</div><div class="n">${L(`sim assumptions: ${A} people in the area · ${N} at station closing · toy model, not a prediction`,`シミュレーション上の仮定：区域内${A}人・駅閉鎖時${N}人 ・ トイモデル（予測ではない）`)}</div><div class="fn">${L(window.__hwFootnote.en,window.__hwFootnote.ja)}</div><pre></pre><div class="c">built with Claude Code · github.com/haginot/shibuya-scramble-lab</div>`;
card.querySelector('pre').textContent=text;
Object.assign(card.style,{position:'fixed',inset:'0',zIndex:100,background:'radial-gradient(ellipse at 50% 40%,#2a1030 0%,#05040a 70%)',color:'#e9ebf3',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',font:'11px/1.6 Inter,"Noto Sans CJK JP",system-ui,sans-serif',opacity:0});
const st=document.createElement('style');st.textContent='#credits .t{font-weight:800;font-size:30px;letter-spacing:.32em}#credits .t b{font-weight:300;color:#ff8a1f}#credits .q{font:900 34px/1.3 Inter,"Noto Sans CJK JP",sans-serif;color:#ffcf6a;margin:6px 0 4px}#credits .n{margin:4px 0 10px;font-size:12px;letter-spacing:.08em;color:#d9c2ff}#credits .fn{max-width:1100px;text-align:center;font-size:12px;line-height:1.55;color:#ffe2b8;margin-bottom:12px}#credits pre{font:inherit;white-space:pre-line;text-align:center;color:#b9bccb;margin:0;max-width:1180px}#credits .c{margin-top:12px;font-size:11px;letter-spacing:.2em;color:#ffcf6a}';
document.head.append(st);document.body.append(card);}"""


# Same formatting as halloween-app.mjs (JavaScript Math.round rounds halves up).
def jsround(v): return math.floor(v+.5)
def fmt(v): return f'{jsround(v):,}'
def p2(v): return f'{jsround(v*10)/10:.1f}'
def mmss(s): return None if s is None else f'{int(s//60):02d}:{int(s%60):02d}'
EXIT_CLEAR = 2  # dispersal.mjs DISPERSAL.exitClear
def exit_clear_text(e):
    if e['clearAt']==0 and e['peakRun']<=EXIT_CLEAR: return 'never dense · 密集なし'
    return 'not cleared · 未解消' if e['clearAt'] is None else mmss(e['clearAt'])


def check_overlay(ov):
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
            assert v['remaining']==fmt(src['remaining']) and v['inside']==fmt(src['inside']) and v['densNow']==p2(src['densNow']),v
            assert v['peak']==p2(src['peak']) and v['crush']==fmt(src['crush']) and v['cars']==mmss(src['cars']),v
            for chip in (sp.get('chips') or {}).get(side,[]): assert chip['people']==fmt(chip['src']),chip
        assert sp['clock']=='+'+mmss(sp['source']['time']) and sp['heldB']==fmt(sp['source']['heldB'])
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
        r=ov['results'];A,B=r['source']['A'],r['source']['B']
        assert r['rows'][0][2:]==[fmt(A['remaining']),fmt(B['remaining'])]
        assert r['rows'][2][2:]==[f"{p2(A['peakCell'])} p/m²",f"{p2(B['peakCell'])} p/m²"]
        assert r['rows'][3][2:]==[mmss(A['stationEmptyAt']) or 'still inside · 駅内に残る',mmss(B['stationEmptyAt']) or 'still inside · 駅内に残る']
        assert r['rows'][4][2:]==[fmt(A['crush']),fmt(B['crush'])]
        assert r['rows'][5][2:]==[mmss(A['holdTotal']),mmss(B['holdTotal'])]
        for col,src in ((2,A),(3,B)):
            cleared=src['denseClearedAt'] is not None and src['densePeakNow'] is not None and src['densePeakNow']<=2
            assert r['rows'][1][col]==(mmss(src['denseClearedAt']) if cleared else 'not cleared · 未解消'),(r['rows'][1],src)


ESTIMATE_2026 = 18000  # sources-halloween.mjs CROWD_2026.estimate (Shibuya City expectation, Shibukei 2026-09-30)


def lang_path(path,lang):
    return path if lang=='ja' else path.with_name(path.stem+'-en'+path.suffix)


def record_halloween(site,output,stills,frames=None,stills_at=None):
    """Writes `output` (Japanese) and `<output>-en` (English) plus stills/frames.jsonl
    (per-frame solver values for the vertical cuts, tools/compose_vertical.py)."""
    from playwright.sync_api import sync_playwright
    output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True)
    handler=functools.partial(QuietHandler,directory=str(site))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    errors=[];snapshots=[];overlays=[];start=time.monotonic();frame_ms=[];encoders={}
    outputs={lang:lang_path(output,lang) for lang in H_LANGS}
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('console',lambda m:print('console:',m.text,flush=True) if m.type in ('error','warning') else None)
            page.set_default_timeout(900000)
            shot=lambda:page.screenshot(type='png',animations='disabled',timeout=900000)
            def shots():
                out={}
                for lang in H_LANGS: page.evaluate(f"window.__setLang('{lang}')");out[lang]=shot()
                return out
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?mode=halloween&record=1&cam=cinema')
            for _ in range(1200):
                if errors: raise RuntimeError('; '.join(errors))
                if page.evaluate('window.__ready===true'): break
                page.wait_for_timeout(500)
            else: raise RuntimeError('viewer never became ready')
            plan=page.evaluate('window.__videoPlan')
            scene_seconds,credit_seconds=plan['scene'],plan['credits']
            assert (scene_seconds,credit_seconds)==(H_SCENE_SECONDS,H_CREDIT_SECONDS),plan
            assert plan['estimate']==ESTIMATE_2026,plan
            warm=page.evaluate('window.__warmup()')
            print(f"warm-up to clock {warm['clock']:.1f}s · {warm['agents']:,} agents · held {warm['held']:,} · queued {warm['waiting']:,} · peak {warm['density']['peak']:.2f} p/m²",flush=True)
            if stills_at:
                done=0
                for t in sorted(stills_at):
                    target=round(t*FPS)
                    while done<target: page.evaluate(f'window.__skip({done/FPS})');done+=1
                    state=page.evaluate(f'window.__frame({done/FPS})');done+=1
                    for lang,png in shots().items(): (stills/f'preview-{t:05.1f}s-{lang}.png').write_bytes(png)
                    check_overlay(page.evaluate('window.__hwOverlay'))
                    print(f"still {t}s · {state['shot']} · {state['phase']}",flush=True)
                    if errors: raise RuntimeError('; '.join(errors))
                return
            for lang,path in outputs.items():
                encoders[lang]=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','17','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={H_CREDITS}','-metadata',f'comment={H_CREDITS}\nHalloween night mode ({lang}): directed time-lapse (x1-x125, shown on screen); every count is counted from the simulated people; the 2026 crowd figure is a cited estimate. Toy model, not a prediction.',str(path)],stdin=subprocess.PIPE)
            scene_frames=frames or scene_seconds*FPS
            framelog=(stills/'frames.jsonl').open('w',encoding='utf-8')
            for frame in range(scene_frames):
                seconds=frame/FPS;t0=time.monotonic()
                state=page.evaluate(f'window.__frame({seconds})')
                pngs=shots();frame_ms.append((time.monotonic()-t0)*1000)
                for lang,png in pngs.items(): encoders[lang].stdin.write(png)
                ov=page.evaluate('window.__hwOverlay');check_overlay(ov)
                d=state.get('dispersal') or {}
                assert state['teleports']==0 and state['rescued']==0,'no relocation in the Halloween crowd'
                assert state['density']['peak']<=5+1e-9,state['density']
                for k in ('A','B'):
                    if d.get(k): assert d[k]['lost']==0 and d[k]['teleports']==0 and d[k]['peakCell']<=5+1e-9,d[k]
                # Per-frame values for the vertical cuts (all from this frame's solver snapshot).
                rec={'t':seconds,'shot':state['shot'],'held':state['held'],'peak':state['density']['peak'],'agents':state['agents']}
                if d and state['shot'] in ('dispersal','exits','results','question'):
                    rec['clock']=d['A']['time'];rec['exits']={k:[[e['key'],e['people'],e['peak'],e['peakRun'],e['clearAt']] for e in d[k]['exits']] for k in ('A','B')}
                    rec['remaining']={k:d[k]['remaining'] for k in ('A','B')}
                framelog.write(json.dumps(rec)+'\n')
                if frame%(FPS//2)==0:
                    snap={k:state.get(k) for k in ('agents','phase','clock','time','active','waiting','approaching','held','attending','admitted','completed','released','cutoffs','teleports','rescued','laneViolations','deferred','lastCycle','vehicles','clearanceHold','shot','density','drawCalls','triangles','djLine')}
                    snap['video_seconds']=seconds
                    if d: snap['dispersal']={k:{q:v for q,v in d[k].items() if q not in ('series','exitSeries')} for k in ('A','B')}
                    snapshots.append(snap);overlays.append(dict(video_seconds=seconds,**ov))
                    if frame%(3*FPS//2)==0:
                        for lang,png in pngs.items(): (stills/f'{seconds:05.1f}s-{lang}.png').write_bytes(png)
                    extra=f" · A left {d['A']['remaining']:,} B {d['B']['remaining']:,}" if d else ''
                    print(f"{seconds:4.1f}/{scene_seconds}s · {state['shot']} · {state['phase']} · crossing {state['active']:,} · held {state['held']:,} · peak {state['density']['peak']:.2f}{extra} · {frame_ms[-1]:.0f} ms/frame",flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            framelog.close()
            final=page.evaluate('window.__shibuyaState')
            page.evaluate(H_CREDIT_CARD,H_CREDITS)
            credit_frames=credit_seconds*FPS
            for k in range(credit_frames):
                alpha=min(1,k/10,(credit_frames-1-k)/8+.0001)
                page.evaluate(f"document.getElementById('credits').style.opacity={max(0,alpha):.3f}")
                for lang,png in shots().items():
                    encoders[lang].stdin.write(png)
                    if k==credit_frames//2:(stills/f'credits-{lang}.png').write_bytes(png)
            for lang,enc in list(encoders.items()):
                enc.stdin.close()
                if enc.wait(timeout=300): raise RuntimeError(f'ffmpeg failed ({lang})')
                del encoders[lang]
            assert not errors,errors
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
        for enc in encoders.values():
            enc.stdin.close();enc.terminate();enc.wait(timeout=10)
    duration=(scene_frames+credit_frames)/FPS
    probes={}
    for lang,path in outputs.items():
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',str(path)]))
        assert abs(float(probe['format']['duration'])-duration)<.05,probe
        assert probe['streams'][0]['width']==1280 and probe['streams'][0]['height']==720,probe
        probes[lang]=probe
    frame_ms.sort()
    disp=final.get('dispersal') or {}
    result=dict(videos={k:str(v) for k,v in outputs.items()},mode='halloween',duration_s=duration,scene_s=scene_frames/FPS,credits_s=credit_seconds,width=1280,height=720,fps=FPS,
                wall_seconds=round(time.monotonic()-start,1),render_ms_per_frame=dict(median=round(frame_ms[len(frame_ms)//2]),p95=round(frame_ms[int(len(frame_ms)*.95)])),
                captions=H_CAPTIONS,snapshots=snapshots,overlays=overlays,dispersal_final=disp,probe=probes,errors=errors,estimate_2026=ESTIMATE_2026,
                note='Offline deterministic capture (software WebGL); every on-screen number was checked against the solver snapshot of the same frame (check_overlay); Japanese and English videos are two screenshots of the same rendered frame.')
    (stills/'recording.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(*outputs.values(),result['wall_seconds'],'s',flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site',type=Path)
    ap.add_argument('--output',type=Path,default=Path('out/media/shibuya-scramble.mp4'))
    ap.add_argument('--stills',type=Path,default=Path('out/media/shibuya-scramble'))
    ap.add_argument('--frames',type=int,help='only the first N scene frames (quick preview)')
    ap.add_argument('--mode',choices=['normal','halloween'],default='normal',help='halloween: costumes, police crowd control and the station-closing comparison')
    ap.add_argument('--stills-at',type=lambda v:[float(x) for x in v.split(',')],help='halloween: only write preview stills at these video seconds')
    args=ap.parse_args()
    if args.mode=='halloween': record_halloween(args.site.resolve(),args.output.resolve(),args.stills.resolve(),args.frames,args.stills_at)
    else: record(args.site.resolve(),args.output.resolve(),args.stills.resolve(),args.frames)
