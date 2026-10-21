"""Measure interactive FPS separately from encoded video FPS on a local export."""
import argparse
import functools
import http.server
import json
from pathlib import Path
import platform
import statistics
import threading
import time

from record_shibuya import browser_with_webgl, QuietHandler


def percentile(values, fraction):
    ordered=sorted(values)
    return ordered[round((len(ordered)-1)*fraction)]


def summarize(samples, wall_seconds, first_time):
    elapsed=samples[-1]['time']-first_time
    latencies=[s['simulationMs'] for s in samples]
    return dict(simulation_seconds=round(elapsed,3),wall_seconds=round(wall_seconds,3),
                simulation_wall_ratio=round(elapsed/wall_seconds,4),lag_seconds=round(wall_seconds-elapsed,3),
                backlog_seconds=samples[-1]['backlogSeconds'],
                worker_request_ms={f'p{int(q*100)}':round(percentile(latencies,q),2) for q in (.5,.95,.99)},
                observed_phases=sorted({s['phase'] for s in samples}),
                observed_train_waves=samples[-1]['trainWaves'])


def benchmark(site,counts,seconds,min_sim_seconds=180):
    from playwright.sync_api import sync_playwright
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(site)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();runs=[]
    try:
        with sync_playwright() as p,browser_with_webgl(p) as browser:
            for count in counts:
                page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/?agents={count}')
                page.wait_for_function('window.__ready===true',timeout=60000)
                page.wait_for_timeout(3000)
                samples=[];first=page.evaluate('window.__shibuyaState');start=time.monotonic()
                while time.monotonic()-start<seconds or not samples or samples[-1]['time']-first['time']<min_sim_seconds:
                    if time.monotonic()-start>max(60,seconds*3): break
                    page.wait_for_timeout(500);samples.append(page.evaluate('window.__shibuyaState'))
                wall_seconds=time.monotonic()-start
                renderer=page.evaluate('''()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}''')
                run=dict(agents=count,mean_fps=round(statistics.mean(s['fps'] for s in samples),2),min_fps=round(min(s['fps'] for s in samples),2),max_fps=round(max(s['fps'] for s in samples),2),mean_worker_request_ms=round(statistics.mean(s['simulationMs'] for s in samples),2),draw_calls=samples[-1]['drawCalls'],triangles=samples[-1]['triangles'],renderer=renderer,browser=browser.version,viewport=[1280,720],sample_seconds=seconds,errors=errors)
                run.update(summarize(samples,wall_seconds,first['time']))
                run['event_window_complete']=run['simulation_seconds']>=min_sim_seconds and 'vehicles' in run['observed_phases'] and all(run['observed_train_waves'])
                runs.append(run);print(json.dumps(run,ensure_ascii=False),flush=True);page.close()
    finally: server.shutdown();server.server_close();thread.join(timeout=5)
    return dict(platform=platform.platform(),machine=platform.machine(),runs=runs,note='Interactive RAF/render FPS. Worker requests batch 0.1 s fixed steps; latency is not per-step CPU time. Hardware and software rendering vary. Encoding FPS is unrelated.')


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('site',type=Path);ap.add_argument('--agents',type=int,nargs='+',default=[20000,40000]);ap.add_argument('--seconds',type=int,default=180);ap.add_argument('--min-sim-seconds',type=int,default=180);ap.add_argument('--out',type=Path,default=Path('out/media/shibuya-scramble/performance.json'));args=ap.parse_args();result=benchmark(args.site.resolve(),args.agents,args.seconds,args.min_sim_seconds);args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
