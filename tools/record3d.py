"""Deterministic recorder: fake clock (rAF/perf.now) + screenshot per frame -> ffmpeg.
python3 rec.py URL out.mp4 seconds [w h fps] [--stills dir:prefix:every_s]"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
url, out, secs = sys.argv[1], sys.argv[2], float(sys.argv[3])
W, H, FPS = (int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (1280, 720, 30)
stills = sys.argv[7] if len(sys.argv) > 7 else None
args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(args=args)
    pg = b.new_page(viewport=dict(width=W, height=H))
    pg.on("console", lambda m: m.type in ("error",) and print("console:", m.text[:200], file=sys.stderr))
    pg.on("pageerror", lambda e: print("pageerror:", str(e)[:300], file=sys.stderr))
    pg.add_init_script("""(()=>{let T=0;const q=new Map();let id=1;const D=Date.now();
      performance.now=()=>T; const RD=Date; window.Date=class extends RD{constructor(...a){a.length?super(...a):super(D+T)} static now(){return D+T}};
      window.requestAnimationFrame=cb=>{q.set(id,cb);return id++}; window.cancelAnimationFrame=i=>q.delete(i);
      window.__tick=ms=>{T+=ms;const c=[...q.values()];q.clear();for(const f of c){try{f(T)}catch(e){console.error(e)}}};})()""")
    pg.goto(url)
    for _ in range(600):
        pg.evaluate('__tick(100)')
        if pg.evaluate("!!window.__ready"): break
        time.sleep(0.05)
    else:
        raise RuntimeError("Viewer did not become ready")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    n = int(secs * FPS)
    import json as _j
    caps = _j.loads(os.environ.get('CAPS', '[]'))
    ci = -1
    for i in range(n):
        tt = i / FPS
        k = max([j for j, c in enumerate(caps) if c[0] <= tt], default=-1)
        if k != ci:
            ci = k; pg.evaluate('([a,b])=>window.__caption&&__caption(a,b)', caps[k][1:] if k >= 0 else ['', ''])
        pg.evaluate(f'__tick({1000 / FPS})')
        png = pg.screenshot(type="png")
        ff.stdin.write(png)
        if stills:
            d, pre, ev = stills.split(":")
            if i % int(float(ev) * FPS) == int(float(ev) * FPS) // 2:
                open(f"{d}/{pre}_{i // FPS:02d}s.png", "wb").write(png)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("ffmpeg encoding failed")
    b.close()
print(f"{out} {n} frames in {time.time()-t0:.0f}s")
