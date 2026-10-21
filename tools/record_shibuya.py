"""Deterministic 30 s / 1280x720 Shibuya recording, including async worker steps.

The first 90 frames use the overhead camera. Bilingual captions occupy their
own band, independent of the metric row. Never advances on a wall-clock timer.
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

CAPTIONS = [
    (0,'ピーク目標3,000人。真上から、一人ひとりの横断を。','Upper-demand target: 3,000 people. Each crossing is individual.'),
    (3,'2万体の個別エージェント。実スケールの渋谷へ。','20,000 individual agents in a metre-scale Shibuya.'),
    (8,'ハチ公前に集まる人。山手線と銀座線の降車の波。','At Hachiko: arrival waves from Yamanote and Ginza trains.'),
    (15,'歩行者が残れば車両は待つ。OSM道路網とSUMO。','Pedestrians hold the signal. SUMO vehicles follow OSM roads.'),
    (22,'認知 → 意向 → 来訪。販促対象のカフェは架空。','Awareness → intent → visits. The promoted cafe is fictional.'),
    (27,'公的統計を手掛かりに、仮説を試す。予測ではない。','Public statistics inform a toy experiment, not a prediction.'),
]


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


def record(site,output,stills):
    from playwright.sync_api import sync_playwright
    output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True)
    handler=functools.partial(QuietHandler,directory=str(site))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    errors=[];snapshots=[];start=time.monotonic()
    encoder=None
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?record=1&cam=top')
            page.wait_for_function('window.__ready===true',timeout=60000)
            page.evaluate('window.__advance(8)')
            # Verify subtitles are physically separate from numeric rows.
            rects=page.evaluate('''() => Object.fromEntries(['caption','metrics','funnel'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom}]}))''')
            assert rects['metrics']['bottom'] <= rects['caption']['top']
            assert rects['funnel']['bottom'] <= rects['caption']['top']
            encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate','30','-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
            for frame in range(900):
                seconds=frame/30
                camera='top' if seconds<3 else 'hachiko' if 8<=seconds<15 else 'orbit'
                caption=next(cap for cap in reversed(CAPTIONS) if cap[0]<=seconds)
                page.evaluate('([mode,ja,en])=>{window.__setCamera(mode);window.__caption(ja,en)}',[camera,caption[1],caption[2]])
                state=page.evaluate('window.__advance(8/30)')
                png=page.screenshot(type='png',animations='disabled')
                encoder.stdin.write(png)
                if frame%90==0:
                    (stills/f'{seconds:05.1f}s.png').write_bytes(png)
                    snapshots.append(dict(video_seconds=seconds,**state))
                    print(f'{seconds:4.1f}/30s · {state["agents"]} agents · {state["phase"]} · cleared {state["completed"]}',flush=True)
                if errors: raise RuntimeError('; '.join(errors))
            encoder.stdin.close()
            if encoder.wait(timeout=60): raise RuntimeError('ffmpeg failed')
            encoder=None
            assert any(s['phase']=='vehicles' for s in snapshots),'Peak crowd never released the vehicle phase'
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
        if encoder:
            encoder.stdin.close();encoder.terminate();encoder.wait(timeout=10)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',str(output)]))
    assert float(probe['format']['duration'])==30.0,probe
    assert probe['streams'][0]['width']==1280 and probe['streams'][0]['height']==720,probe
    result=dict(video=str(output),duration_s=30,width=1280,height=720,fps=30,simulated_seconds=240,warmup_s=8,wall_seconds=round(time.monotonic()-start,2),captions=CAPTIONS,snapshots=snapshots,probe=probe,errors=errors,note='Encoding FPS is fixed output timing, not measured interactive FPS. See docs/PERFORMANCE.md.')
    (stills/'recording.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(output,flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site',type=Path)
    ap.add_argument('--output',type=Path,default=Path('/workspace/demos/shibuya-scramble.mp4'))
    ap.add_argument('--stills',type=Path,default=Path('/workspace/demos/shibuya-scramble'))
    args=ap.parse_args();record(args.site.resolve(),args.output.resolve(),args.stills.resolve())
