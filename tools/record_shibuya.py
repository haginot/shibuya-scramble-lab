"""Deterministic 30 s scene + 12 s credits / 1280x720 Shibuya recording.

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
    (0,'任意のデモ目標3,000人。真上から、一人ひとりの横断を。','An arbitrary demo target: 3,000 people crossing individually.'),
    (3,'2万体の個別エージェント。実スケールの渋谷へ。','20,000 individual agents in a metre-scale Shibuya.'),
    (4.8,'銀座線の降車波がまもなく駅出口へ。矢印に注目。','A Ginza alighting wave is about to reach the marked exit.'),
    (6,'銀座線の降車波が到着。既存の個体が出口から歩く。','The Ginza wave arrives: existing agents emerge from the exit.'),
    (8,'横断量・行動は未較正。公開統計の規模・時間帯を参照。','Crossings and behaviour are uncalibrated; public stats inform scale.'),
    (15,'歩行者が残れば車両は待つ。OSM道路網とSUMO。','Pedestrians hold the signal. SUMO vehicles follow OSM roads.'),
    (18.5,'次の山手線の降車波。到着直前から直後を見る。','The next Yamanote wave: watch just before and after arrival.'),
    (19.3,'山手線の降車波が到着。出口からハチ公前へ。','The Yamanote wave reaches the exit toward Hachiko square.'),
    (22,'認知 → 意向 → 来訪。販促対象のカフェは架空。','Awareness → intent → visits. The promoted cafe is fictional.'),
    (27,'公的統計を手掛かりに、仮説を試す。予測ではない。','Public statistics inform a toy experiment, not a prediction.'),
]

CREDITS = '''国土交通省 Project PLATEAU・渋谷区 2023 / MLIT · Shibuya City 2023
足元形状＋高さへ加工 / Modified footprints and heights · CC BY 4.0
https://creativecommons.org/licenses/by/4.0/
https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023
© OpenStreetMap contributors · ODbL 1.0 (roads, rails, shops, derived tracks)
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/
車両軌跡 / Vehicle generation: Eclipse SUMO 1.28.0 · https://eclipse.dev/sumo/
加工データ・帰属条件 / Derived data and NOTICE: repository web3d/data/
https://github.com/haginot/shibuya-scramble-lab/tree/shibuya/web3d/data
web3d/data/NOTICE · shibuya_osm.json · shibuya_plateau.json · shibuya_traffic.json
横断量・行動は未較正 / Crossings and behaviour uncalibrated — not a prediction'''


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
    for name in ('NOTICE','LICENSE'):
        shutil.copyfile(site/name,stills/name)
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
            encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate','30','-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={CREDITS}','-metadata',f'comment={CREDITS}\nSimulation time ×8; 30 s scene, 12 s credits. Toy model, not a prediction.',str(output)],stdin=subprocess.PIPE)
            for frame in range(900):
                seconds=frame/30
                camera='top' if seconds<3 else 'hachiko' if 4.8<=seconds<8 or 18.5<=seconds<22 else 'orbit'
                caption=next(cap for cap in reversed(CAPTIONS) if cap[0]<=seconds)
                page.evaluate('([mode,ja,en])=>{window.__setCamera(mode);window.__caption(ja,en)}',[camera,caption[1],caption[2]])
                state=page.evaluate('window.__advance(8/30)')
                png=page.screenshot(type='png',animations='disabled')
                encoder.stdin.write(png)
                if frame%90==0:
                    (stills/f'{seconds:05.1f}s.png').write_bytes(png)
                    snapshots.append(dict(video_seconds=seconds,**state))
                    print(f'{seconds:4.1f}/30s · {state["agents"]} agents · {state["phase"]} · cleared {state["completed"]}',flush=True)
                if frame in (178,181,576,580):
                    snapshots.append(dict(video_seconds=seconds,**state))
                    (stills/f'wave-{frame}.png').write_bytes(png)
                if errors: raise RuntimeError('; '.join(errors))
            page.evaluate('''text=>{const card=document.createElement('div');card.id='credits';Object.assign(card.style,{position:'fixed',inset:'0',zIndex:100,background:'#0b1722',color:'#edf5ed',padding:'34px 48px',font:'18px/1.6 system-ui',whiteSpace:'pre-line'});card.textContent='CREDITS / 出典・加工データ\\n\\n'+text;document.body.append(card)}''',CREDITS)
            credit_png=page.screenshot(type='png',animations='disabled')
            (stills/'credits.png').write_bytes(credit_png)
            for _ in range(360): encoder.stdin.write(credit_png)
            encoder.stdin.close()
            if encoder.wait(timeout=60): raise RuntimeError('ffmpeg failed')
            encoder=None
            assert any(s['phase']=='vehicles' for s in snapshots),'Peak crowd never released the vehicle phase'
            waves={round(s['video_seconds']*30):s for s in snapshots}
            for before,after,line in ((178,181,1),(576,580,0)):
                assert waves[after]['trainWaves'][line]==waves[before]['trainWaves'][line]+1
                assert waves[before]['camera']==waves[after]['camera']=='hachiko'
            # Show the completed 14-day means/intervals, rather than Day 1 seed 0.
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/promo/?area=shibuya&end=1')
            page.wait_for_function('window.__ready===true && window.__promoState.finished===true',timeout=60000)
            page.evaluate("window.__caption('14日終了・試行平均。来訪増と費用回収は別。','14-day trial means: more visits need not recover campaign costs.')")
            page.screenshot(path=str(stills/'promo.png'),animations='disabled')
            assert not errors,errors
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
        if encoder:
            encoder.stdin.close();encoder.terminate();encoder.wait(timeout=10)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:format_tags:stream=width,height,r_frame_rate','-of','json',str(output)]))
    assert float(probe['format']['duration'])==42.0,probe
    assert probe['format']['tags']['credit']==CREDITS,probe
    assert 'Simulation time ×8' in probe['format']['tags']['comment'],probe
    assert probe['streams'][0]['width']==1280 and probe['streams'][0]['height']==720,probe
    result=dict(video=str(output),duration_s=42,scene_s=30,credits_s=12,simulation_speed=8,width=1280,height=720,fps=30,simulated_seconds=240,warmup_s=8,wall_seconds=round(time.monotonic()-start,2),captions=CAPTIONS,snapshots=snapshots,probe=probe,errors=errors,note='Encoding FPS is fixed output timing, not measured interactive FPS. See docs/PERFORMANCE.md.')
    (stills/'recording.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(output,flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site',type=Path)
    ap.add_argument('--output',type=Path,default=Path('out/media/shibuya-scramble.mp4'))
    ap.add_argument('--stills',type=Path,default=Path('out/media/shibuya-scramble'))
    args=ap.parse_args();record(args.site.resolve(),args.output.resolve(),args.stills.resolve())
