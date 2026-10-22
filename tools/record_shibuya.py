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


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site',type=Path)
    ap.add_argument('--output',type=Path,default=Path('out/media/shibuya-scramble.mp4'))
    ap.add_argument('--stills',type=Path,default=Path('out/media/shibuya-scramble'))
    ap.add_argument('--frames',type=int,help='only the first N scene frames (quick preview)')
    args=ap.parse_args();record(args.site.resolve(),args.output.resolve(),args.stills.resolve(),args.frames)
