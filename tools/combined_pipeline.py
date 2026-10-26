"""Combined-episode pipeline steps without a browser (driven by tools/render_combined.sh; stdlib + ffmpeg only).

  python3 tools/combined_pipeline.py sources --map map.json --src-root DIR --out sources.json
      locate the rendered body of every source variant of a reuse map (tools/variant_cues.mjs --reuse-map): the non-test
      DIR/<variant>/body-*/body.mp4 (the one named in DIR/<variant>/concat.txt when several exist), assert 1080x1920
      yuv420p 30/1, its frame count (840) and its beat edges (DIR/<variant>/timeline.json == the config's buildPart).
  python3 tools/combined_pipeline.py join --map map.json --sources sources.json --opening O.mp4 --opening-frames 426
                                     --new-dir DIR --out video.mp4 [--report join.json] [--smoke] [--crf 16] [--preset medium]
      decode every piece in timeline order — pinned opening, reused frame ranges (trim=start_frame:end_frame, exact),
      rendered NEW pieces (DIR/new-<f0>-<f1>.mp4) — to raw yuv420p on ONE pipe into ONE libx264 encode (crf 16, 30 fps,
      1080x1920, yuv420p): a single re-encode, constant memory, every piece's frame count asserted from the byte count.
      --smoke: a NEW piece that is not rendered yet becomes black frames (plumbing test without a browser).
  python3 tools/combined_pipeline.py accuracy --video V.mp4 --map map.json --sources sources.json --opening O.mp4
                                     --opening-frames 426 [--out acc.json]
      frame-accuracy spot check: the first + last frame of the opening and of every reused piece in V are compared (PSNR on
      a 270x480 luma thumbnail) with the source frame and its ±1 neighbours; the exact frame must be the best match
      (≥ 30 dB, not beaten by a neighbour by > 0.5 dB). Static frames (neighbours equal) pass as 'static'.
  python3 tools/combined_pipeline.py verify --video V.mp4 --frames N --ebur EB.txt --out report.json [--extra k=json …]
      frames, 1080x1920 yuv420p 30/1, AAC 48 kHz stereo, EBU R128 (−15.5…−12.5 LUFS, true peak ≤ −1 dBTP) → report.json.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time

W, H, FPS = 1080, 1920, 30
FRAME_BYTES = W*H*3//2
TW, TH = 270, 480
LUFS_RANGE = (-15.5, -12.5)
TP_MAX = -1.0
FMT = f'{W},{H},yuv420p,{FPS}/1'


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


def probe_frames(path):
    if not Path(path).is_file() or not Path(path).stat().st_size: return 0
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout.strip()
    return int(out) if out.isdigit() else 0


def probe_fmt(path):
    return run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt,r_frame_rate', '-of', 'csv=p=0', str(path)]).strip()


# ---------------------------------------------------------------- sources
def locate_body(src_root, variant, frames):
    """The rendered body.mp4 of a variant: non-test body-* dirs; the one in concat.txt wins when several exist."""
    vdir = Path(src_root)/variant
    cands = sorted(d for d in vdir.glob('body-*') if d.is_dir() and '-test' not in d.name and (d/'body.mp4').is_file())
    if not cands: raise SystemExit(f'{variant}: no rendered body under {vdir} (body-*/body.mp4, not -test)')
    if len(cands) > 1:
        cat = (vdir/'concat.txt').read_text() if (vdir/'concat.txt').is_file() else ''
        named = [d for d in cands if str(d/'body.mp4') in cat]
        if len(named) != 1: raise SystemExit(f'{variant}: {len(cands)} body dirs and concat.txt does not pick one: {[d.name for d in cands]}')
        cands = named
    body = cands[0]/'body.mp4'
    n = probe_frames(body)
    if n != frames: raise SystemExit(f'{variant}: {body} has {n} frames, expected {frames}')
    fmt = probe_fmt(body)
    if fmt != FMT: raise SystemExit(f'{variant}: {body} is {fmt}, expected {FMT}')
    return body


def cmd_sources(a):
    m = json.loads(Path(a.map).read_text())
    out = {}
    for v, s in m['sources'].items():
        body = locate_body(a.src_root, v, s['frames'])
        tl = Path(a.src_root)/v/'timeline.json'
        if not tl.is_file(): raise SystemExit(f'{v}: {tl} missing (beat edges cannot be checked)')
        rb = json.loads(tl.read_text())['parts']['body']
        got = [(b['id'], b['f0'], b['f1']) for b in rb['beats']]
        want = [(b['id'], b['f0'], b['f1']) for b in s['beats']]
        if got != want or rb['frames'] != s['frames']:
            raise SystemExit(f'{v}: rendered beat edges {got} ≠ config {want} (the source config changed since its render)')
        out[v] = {'body': str(body), 'frames': s['frames'], 'dir': str(body.parent), 'beats': want}
        print(f'source {v}: {body} · {s["frames"]} frames · beats ok', flush=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    return 0


# ---------------------------------------------------------------- join
def new_piece_path(new_dir, p):
    return Path(new_dir)/f'new-{p["f0"]:04d}-{p["f1"]:04d}.mp4'


def pieces_for(m, sources, opening, opening_frames, new_dir, smoke=False):
    """[(label, kind, path|None, f0, f1)] in timeline order; kind: opening|reuse|new|black."""
    out = [('opening', 'opening', str(opening), 0, opening_frames)]
    for p in m['pieces']:
        lab = '+'.join(p['beats'])
        if p['mode'] == 'reuse':
            out.append((lab, 'reuse', sources[p['src']['variant']]['body'], p['src']['f0'], p['src']['f1']))
        else:
            f = new_piece_path(new_dir, p)
            if probe_frames(f) == p['frames']: out.append((lab, 'new', str(f), 0, p['frames']))
            elif smoke: out.append((lab, 'black', None, 0, p['frames']))
            else: raise SystemExit(f'new piece {lab} not rendered: {f} (expected {p["frames"]} frames)')
    return out


def decode_cmd(kind, path, f0, f1):
    if kind == 'black':
        return ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r={FPS}', '-frames:v', str(f1-f0), '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-']
    return ['ffmpeg', '-v', 'error', '-i', path, '-an', '-vf', f'trim=start_frame={f0}:end_frame={f1},setpts=PTS-STARTPTS,scale={W}:{H}:flags=lanczos,format=yuv420p',
            '-fps_mode', 'passthrough', '-f', 'rawvideo', '-']


def cmd_join(a):
    m = json.loads(Path(a.map).read_text()); sources = json.loads(Path(a.sources).read_text())
    if probe_frames(a.opening) != a.opening_frames: raise SystemExit(f'opening {a.opening}: {probe_frames(a.opening)} frames, expected {a.opening_frames}')
    pieces = pieces_for(m, sources, a.opening, a.opening_frames, a.new_dir, a.smoke)
    total = sum(f1-f0 for _, _, _, f0, f1 in pieces)
    tmp = Path(str(a.out)+'.tmp.mp4')
    enc = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{W}x{H}', '-framerate', str(FPS), '-i', '-',
                            '-c:v', 'libx264', '-preset', a.preset, '-crf', str(a.crf), '-threads', str(a.threads), '-pix_fmt', 'yuv420p', '-r', str(FPS), '-g', str(FPS),
                            '-movflags', '+faststart', '-metadata', 'title=ハロウィンの渋谷を脱出せよ！ JR編', '-metadata',
                            'comment=3D: PLATEAU (国土交通省) / © OpenStreetMap contributors', str(tmp)], stdin=subprocess.PIPE)
    rep = {'out': str(a.out), 'frames': total, 'smoke': a.smoke, 'crf': a.crf, 'preset': a.preset, 'pieces': []}
    t_all = time.monotonic(); at = 0
    try:
        for lab, kind, path, f0, f1 in pieces:
            t0 = time.monotonic(); n = f1-f0
            dec = subprocess.Popen(decode_cmd(kind, path, f0, f1), stdout=subprocess.PIPE)
            got = 0
            while True:
                buf = dec.stdout.read(FRAME_BYTES*8)
                if not buf: break
                enc.stdin.write(buf); got += len(buf)
            if dec.wait(): raise SystemExit(f'decode failed: {lab} ({path})')
            if got != n*FRAME_BYTES: raise SystemExit(f'piece {lab}: {got/FRAME_BYTES:.2f} frames decoded, expected {n} ({path} {f0}–{f1})')
            rep['pieces'].append({'label': lab, 'kind': kind, 'src': path, 'src_f0': f0, 'src_f1': f1, 'video_f0': at, 'video_f1': at+n, 'wall_s': round(time.monotonic()-t0, 1)})
            print(f'join {kind:7s} {lab:28s} video {at:4d}–{at+n:4d} ← {Path(path).parent.name+"/"+Path(path).name if path else "black"} [{f0}–{f1}) {time.monotonic()-t0:.0f} s', flush=True)
            at += n
        enc.stdin.close()
        if enc.wait(): raise SystemExit('encode failed')
    except BaseException:
        if enc.poll() is None: enc.kill()
        tmp.unlink(missing_ok=True); raise
    n = probe_frames(tmp)
    if n != total: raise SystemExit(f'{tmp}: {n} frames, expected {total}')
    os.replace(tmp, a.out)
    rep['wall_s'] = round(time.monotonic()-t_all, 1)
    if a.report: Path(a.report).write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    print(f'joined {a.out}: {total} frames ({len(pieces)} pieces, {rep["wall_s"]} s)', flush=True)
    return 0


# ---------------------------------------------------------------- accuracy
def thumbs(path, idx):
    """Luma thumbnails (TWxTH) of the given frame indices of a video, one decode pass → {index: bytes}."""
    idx = sorted(set(i for i in idx if i >= 0))
    if not idx: return {}
    sel = '+'.join(f'eq(n\\,{i})' for i in idx)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-an', '-vf', f'select={sel},scale={TW}:{TH}:flags=area,format=gray', '-fps_mode', 'passthrough',
                          '-f', 'rawvideo', '-'], check=True, capture_output=True).stdout
    n = TW*TH
    got = [raw[k*n:(k+1)*n] for k in range(len(raw)//n)]
    return dict(zip(idx, got))


def psnr(a, b):
    if a is None or b is None: return None
    se = sum((x-y)*(x-y) for x, y in zip(a, b))
    return 99.0 if se == 0 else round(10*math.log10(255*255*len(a)/se), 2)


def cmd_accuracy(a):
    m = json.loads(Path(a.map).read_text()); sources = json.loads(Path(a.sources).read_text())
    probes = []  # (label, video frame, src path, src frame, src frames)
    probes += [('opening first', 0, a.opening, 0, a.opening_frames), ('opening last', a.opening_frames-1, a.opening, a.opening_frames-1, a.opening_frames)]
    for p in m['pieces']:
        if p['mode'] != 'reuse': continue
        s = sources[p['src']['variant']]; v0 = a.opening_frames+p['f0']
        probes += [(f"{'+'.join(p['beats'])} first", v0, s['body'], p['src']['f0'], s['frames']), (f"{'+'.join(p['beats'])} last", v0+p['frames']-1, s['body'], p['src']['f1']-1, s['frames'])]
    vid = thumbs(a.video, [v for _, v, _, _, _ in probes])
    by_src = {}
    for _, _, sp, sf, n in probes: by_src.setdefault(sp, set()).update(j for j in (sf-1, sf, sf+1) if 0 <= j < n)
    src = {sp: thumbs(sp, sorted(ix)) for sp, ix in by_src.items()}
    res, ok = [], True
    for lab, v, sp, sf, n in probes:
        exact = psnr(vid.get(v), src[sp].get(sf)); nb = [psnr(vid.get(v), src[sp].get(j)) for j in (sf-1, sf+1) if 0 <= j < n]
        nb = [x for x in nb if x is not None]; best_nb = max(nb) if nb else None
        static = best_nb is not None and exact is not None and abs(best_nb-exact) < .05 and best_nb >= 45
        good = exact is not None and exact >= 30 and (best_nb is None or exact >= best_nb-.5)
        res.append({'probe': lab, 'video_frame': v, 'src': sp, 'src_frame': sf, 'psnr': exact, 'psnr_neighbours': nb, 'ok': good, 'static': static})
        ok &= good
        print(f"accuracy {lab:34s} v{v:5d} ← {Path(sp).parent.name}#{sf:4d}: {exact} dB (±1: {nb}) {'OK' if good else 'FAIL'}{' static' if static else ''}", flush=True)
    if a.out: Path(a.out).write_text(json.dumps({'ok': ok, 'probes': res}, indent=1))
    return 0 if ok else 1


# ---------------------------------------------------------------- verify
def ebur(path):
    txt = Path(path).read_text().split('Summary:')[-1]
    num = lambda k: (lambda mm: float(mm.group(1)) if mm else None)(re.search(k+r':\s*(-?[\d.]+)', txt))
    return {'I_lufs': num('I'), 'LRA_lu': num('LRA'), 'true_peak_dbtp': num('Peak')}


def cmd_verify(a):
    v = a.video; got = probe_frames(v); fmt = probe_fmt(v)
    aud = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', v]).strip()
    dur = float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v]).strip() or 0)
    loud = ebur(a.ebur)
    errs = []
    if got != a.frames: errs.append(f'frames {got} ≠ {a.frames}')
    if fmt != FMT: errs.append(f'format {fmt} ≠ {FMT}')
    if not aud.startswith('aac,48000,2'): errs.append(f'audio {aud!r} (want aac,48000,2)')
    if loud['I_lufs'] is None or not LUFS_RANGE[0] <= loud['I_lufs'] <= LUFS_RANGE[1]: errs.append(f'loudness {loud["I_lufs"]} LUFS outside {LUFS_RANGE}')
    if loud['true_peak_dbtp'] is not None and loud['true_peak_dbtp'] > TP_MAX: errs.append(f'true peak {loud["true_peak_dbtp"]} dBTP > {TP_MAX}')
    r = {'video': v, 'frames': got, 'expected': a.frames, 'duration_s': dur, 'format': fmt, 'audio': aud, 'loudness': loud, 'ok': not errs, 'errors': errs}
    for kv in a.extra or []:
        k, _, val = kv.partition('=')
        try: r[k] = json.loads(Path(val).read_text()) if val.endswith('.json') and Path(val).is_file() else json.loads(val)
        except (ValueError, OSError): r[k] = val
    Path(a.out).write_text(json.dumps(r, indent=1, ensure_ascii=False))
    print(json.dumps({k: r[k] for k in ('video', 'frames', 'expected', 'duration_s', 'format', 'audio', 'loudness', 'ok', 'errors')}, ensure_ascii=False), flush=True)
    return 0 if not errs else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('sources'); s.add_argument('--map', required=True); s.add_argument('--src-root', required=True); s.add_argument('--out', required=True)
    j = sp.add_parser('join')
    for k in ('--map', '--sources', '--opening', '--new-dir', '--out'): j.add_argument(k, required=True)
    j.add_argument('--opening-frames', type=int, required=True); j.add_argument('--report'); j.add_argument('--smoke', action='store_true')
    j.add_argument('--crf', type=float, default=16); j.add_argument('--preset', default='medium'); j.add_argument('--threads', type=int, default=4)
    c = sp.add_parser('accuracy')
    for k in ('--video', '--map', '--sources', '--opening'): c.add_argument(k, required=True)
    c.add_argument('--opening-frames', type=int, required=True); c.add_argument('--out')
    v = sp.add_parser('verify'); v.add_argument('--video', required=True); v.add_argument('--frames', type=int, required=True)
    v.add_argument('--ebur', required=True); v.add_argument('--out', required=True); v.add_argument('--extra', action='append')
    a = ap.parse_args(argv)
    return {'sources': cmd_sources, 'join': cmd_join, 'accuracy': cmd_accuracy, 'verify': cmd_verify}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
