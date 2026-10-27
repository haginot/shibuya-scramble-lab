"""JR編 v6 pipeline steps without a browser (driven by tools/render_v6.sh; stdlib + ffmpeg; PIL only for `contact`).
Builds on tools/combined_pipeline.py (same encode / PSNR / loudness rules); docs/V6.md.

A v6 video = v6 opening (reuse map of variants/jr/v6/_opening.json: pinned-opening frames + the NEW mission beat) + v6 body
(reuse map of variants/jr/v6/<pair>.json: NEW beats, re-shot beats, frames copied from the variant bodies and from the
combined episode's rendered pieces). Every source is described as a list of files covering source-frame ranges:
  '_opening'          → the pinned opening.mp4 (426 frames)
  '<pair>-over|clear' → $SRC/<variant>/body-*/body.mp4 (840 frames; beat edges checked against its timeline.json)
  'combined/<pair>'   → the combined episode's rendered NEW pieces, exactly the files its final join used
                        ($COMBINED/<pair>/join.json kind 'new'; first generation), else its video.mp4 (opening offset; a
                        second-generation fallback, flagged); beat edges checked against $COMBINED/<pair>/timeline.json.

  python3 tools/v6_pipeline.py sources --map map.json --opening-map omap.json --src-root SRC --combined-root COMB
                                       --opening-mp4 O.mp4 --out sources.json
  python3 tools/v6_pipeline.py join --map map.json --opening-map omap.json --sources sources.json --new-dir DIR
                                    --opening-new-dir DIR --out video.mp4 [--report join.json] [--smoke] [--crf 16] [--preset medium]
      decode every piece in timeline order (opening pieces, then body pieces; reused ranges trim=start_frame:end_frame,
      exact; NEW pieces = <dir>/new-<f0>-<f1>.mp4) → raw yuv420p on ONE pipe → ONE libx264 encode. --smoke: a NEW piece
      that is not rendered yet becomes black frames.
  python3 tools/v6_pipeline.py accuracy --video V.mp4 --map map.json --opening-map omap.json --sources sources.json [--out acc.json]
      first + last frame of every reused chunk vs the source frame and its ±1 neighbours (PSNR, luma thumbnail; the exact
      frame must be the best match at ≥ 30 dB) — combined_pipeline.py rules.
  python3 tools/v6_pipeline.py verify …   = combined_pipeline.py verify (frames, format, AAC, −15.5…−12.5 LUFS, TP ≤ −1 dBTP)
  python3 tools/v6_pipeline.py contact --video V.mp4 --timeline timeline.json --out sheet.jpg
      contact sheet, every v6 beat labelled (mission, first choice / A picked, TRUE END, guide, caught, GAME OVER, CONTINUE?,
      clear, kaiju, goodbye blocks, sources, every RE-SHOT beat).
  python3 tools/v6_pipeline.py contact-times --timeline timeline.json     (the labelled times as JSON; tests)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import combined_pipeline as CP  # noqa: E402

W, H, FPS, FRAME_BYTES = CP.W, CP.H, CP.FPS, CP.FRAME_BYTES
PINNED_OPENING_FRAMES = 426
VARIANT_BODY_FRAMES = 840


# ---------------------------------------------------------------- sources
def _edges(beats):
    return [(b['id'], b['f0'], b['f1']) for b in beats]


def locate_variant(src_root, v, spec):
    body = CP.locate_body(src_root, v, spec['frames'])
    tl = Path(src_root)/v/'timeline.json'
    if not tl.is_file(): raise SystemExit(f'{v}: {tl} missing (beat edges cannot be checked)')
    rb = json.loads(tl.read_text())['parts']['body']
    if _edges(rb['beats']) != _edges(spec['beats']) or rb['frames'] != spec['frames']:
        raise SystemExit(f'{v}: rendered beat edges ≠ config (the source config changed since its render)')
    return {'kind': 'variant', 'frames': spec['frames'], 'files': [{'path': str(body), 'f0': 0, 'f1': spec['frames'], 'off': 0}], 'beats': _edges(spec['beats'])}


def locate_combined(comb_root, key, spec):
    pair = key.split('/', 1)[1]; d = Path(comb_root)/pair
    tl = d/'timeline.json'
    if not tl.is_file(): raise SystemExit(f'{key}: {tl} missing')
    T = json.loads(tl.read_text()); rb = T['parts']['body']; on = T['parts']['opening']['frames']
    if _edges(rb['beats']) != _edges(spec['beats']) or rb['frames'] != spec['frames']:
        raise SystemExit(f'{key}: rendered beat edges {_edges(rb["beats"])} ≠ config {_edges(spec["beats"])}')
    files = []
    jf = d/'join.json'
    if jf.is_file():
        for p in json.loads(jf.read_text())['pieces']:
            if p['kind'] != 'new': continue
            f = Path(p['src'])
            if CP.probe_frames(f) != p['src_f1']-p['src_f0']: raise SystemExit(f'{key}: {f} frame count changed since the combined join')
            files.append({'path': str(f), 'f0': p['video_f0']-on, 'f1': p['video_f1']-on, 'off': p['src_f0'], 'gen': 1})
    video = d/'video.mp4'
    if video.is_file():
        n = CP.probe_frames(video)
        if n != on+spec['frames']: raise SystemExit(f'{key}: {video} has {n} frames, expected {on+spec["frames"]}')
        files.append({'path': str(video), 'f0': 0, 'f1': spec['frames'], 'off': on, 'gen': 2})
    if not files: raise SystemExit(f'{key}: nothing rendered under {d} (join.json new pieces / video.mp4)')
    for f in files:
        fmt = CP.probe_fmt(f['path'])
        if fmt != CP.FMT: raise SystemExit(f'{key}: {f["path"]} is {fmt}, expected {CP.FMT}')
    return {'kind': 'combined', 'frames': spec['frames'], 'files': files, 'beats': _edges(spec['beats'])}


def locate_opening(mp4, spec):
    n = CP.probe_frames(mp4)
    if n != spec['frames']: raise SystemExit(f'pinned opening {mp4}: {n} frames, expected {spec["frames"]}')
    fmt = CP.probe_fmt(mp4)
    if fmt != CP.FMT: raise SystemExit(f'pinned opening {mp4} is {fmt}')
    return {'kind': 'opening', 'frames': n, 'files': [{'path': str(mp4), 'f0': 0, 'f1': n, 'off': 0}], 'beats': _edges(spec['beats'])}


def cmd_sources(a):
    out = {}
    for mp in (a.opening_map, a.map):
        m = json.loads(Path(mp).read_text())
        for k, s in m['sources'].items():
            if k in out: continue
            if k == '_opening': out[k] = locate_opening(a.opening_mp4, s)
            elif k.startswith('combined/'): out[k] = locate_combined(a.combined_root, k, s)
            else: out[k] = locate_variant(a.src_root, k, s)
            print(f"source {k}: {out[k]['kind']} · {s['frames']} frames · {len(out[k]['files'])} file(s) · beats ok", flush=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    return 0


def chunks(src, f0, f1):
    """[(path, a, b, gen)] decode ranges covering source frames [f0, f1): first-generation files first."""
    out, at = [], f0
    files = sorted(src['files'], key=lambda f: f.get('gen', 1))
    while at < f1:
        f = next((x for x in files if x['f0'] <= at < x['f1']), None)
        if f is None: raise SystemExit(f'source frame {at} not covered by any file')
        b = min(f1, f['f1'])
        # prefer a single file covering the whole remainder (fewer cuts)
        whole = next((x for x in files if x['f0'] <= at and f1 <= x['f1'] and x.get('gen', 1) == f.get('gen', 1)), None)
        if whole: f, b = whole, f1
        out.append((f['path'], at-f['f0']+f['off'], b-f['f0']+f['off'], f.get('gen', 1)))
        at = b
    return out


# ---------------------------------------------------------------- join
def plan_pieces(omap, bmap, sources, opening_new_dir, new_dir, smoke=False):
    """[(label, kind, path|None, a, b)] in video order; kind opening-reuse|reuse|new|black."""
    out = []
    for part, m, nd in (('opening', omap, opening_new_dir), ('body', bmap, new_dir)):
        for p in m['pieces']:
            lab = f"{part}:{'+'.join(p['beats'])}"
            if p['mode'] == 'reuse':
                for path, a, b, gen in chunks(sources[p['src']['variant']], p['src']['f0'], p['src']['f1']):
                    out.append((lab, 'reuse' if gen == 1 else 'reuse-gen2', path, a, b))
            else:
                f = CP.new_piece_path(nd, p)
                if CP.probe_frames(f) == p['frames']: out.append((lab, 'new', str(f), 0, p['frames']))
                elif smoke: out.append((lab, 'black', None, 0, p['frames']))
                else: raise SystemExit(f'new piece {lab} not rendered: {f} (expected {p["frames"]} frames)')
    return out


def cmd_join(a):
    omap = json.loads(Path(a.opening_map).read_text()); bmap = json.loads(Path(a.map).read_text()); sources = json.loads(Path(a.sources).read_text())
    pieces = plan_pieces(omap, bmap, sources, a.opening_new_dir, a.new_dir, a.smoke)
    total = sum(b-x for _, _, _, x, b in pieces)
    want = omap['frames']+bmap['frames']
    if total != want: raise SystemExit(f'pieces give {total} frames, the timeline has {want}')
    tmp = Path(str(a.out)+'.tmp.mp4')
    enc = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{W}x{H}', '-framerate', str(FPS), '-i', '-',
                            '-c:v', 'libx264', '-preset', a.preset, '-crf', str(a.crf), '-threads', str(a.threads), '-pix_fmt', 'yuv420p', '-r', str(FPS), '-g', str(FPS),
                            '-movflags', '+faststart', '-metadata', 'title=ハロウィンの渋谷を脱出せよ！ JR編 v6', '-metadata',
                            'comment=3D: PLATEAU (国土交通省) / © OpenStreetMap contributors', str(tmp)], stdin=subprocess.PIPE)
    rep = {'out': str(a.out), 'frames': total, 'smoke': a.smoke, 'crf': a.crf, 'preset': a.preset, 'pieces': []}
    t_all = time.monotonic(); at = 0
    try:
        for lab, kind, path, f0, f1 in pieces:
            t0 = time.monotonic(); n = f1-f0
            dec = subprocess.Popen(CP.decode_cmd('black' if kind == 'black' else 'x', path, f0, f1), stdout=subprocess.PIPE)
            got = 0
            while True:
                buf = dec.stdout.read(FRAME_BYTES*8)
                if not buf: break
                enc.stdin.write(buf); got += len(buf)
            if dec.wait(): raise SystemExit(f'decode failed: {lab} ({path})')
            if got != n*FRAME_BYTES: raise SystemExit(f'piece {lab}: {got/FRAME_BYTES:.2f} frames decoded, expected {n} ({path} {f0}–{f1})')
            rep['pieces'].append({'label': lab, 'kind': kind, 'src': path, 'src_f0': f0, 'src_f1': f1, 'video_f0': at, 'video_f1': at+n, 'wall_s': round(time.monotonic()-t0, 1)})
            print(f'join {kind:10s} {lab:44s} video {at:4d}–{at+n:4d} ← {Path(path).parent.name+"/"+Path(path).name if path else "black"} [{f0}–{f1})', flush=True)
            at += n
        enc.stdin.close()
        if enc.wait(): raise SystemExit('encode failed')
    except BaseException:
        if enc.poll() is None: enc.kill()
        tmp.unlink(missing_ok=True); raise
    n = CP.probe_frames(tmp)
    if n != total: raise SystemExit(f'{tmp}: {n} frames, expected {total}')
    tmp.replace(a.out)
    rep['wall_s'] = round(time.monotonic()-t_all, 1)
    if a.report: Path(a.report).write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    print(f'joined {a.out}: {total} frames ({len(pieces)} pieces, {rep["wall_s"]} s)', flush=True)
    return 0


# ---------------------------------------------------------------- accuracy
def cmd_accuracy(a):
    """Probes come from the join report when given (exact decode ranges), else from the maps + sources."""
    probes = []  # (label, video frame, src path, src frame, src frames-in-file)
    if a.join and Path(a.join).is_file():
        for p in json.loads(Path(a.join).read_text())['pieces']:
            if not p['kind'].startswith('reuse'): continue
            n = CP.probe_frames(p['src'])
            probes += [(f"{p['label']} first", p['video_f0'], p['src'], p['src_f0'], n), (f"{p['label']} last", p['video_f1']-1, p['src'], p['src_f1']-1, n)]
    else:
        omap = json.loads(Path(a.opening_map).read_text()); bmap = json.loads(Path(a.map).read_text()); sources = json.loads(Path(a.sources).read_text())
        base = 0
        for part, m in (('opening', omap), ('body', bmap)):
            for p in m['pieces']:
                v = base+p['f0']
                if p['mode'] == 'reuse':
                    for path, x, y, _ in chunks(sources[p['src']['variant']], p['src']['f0'], p['src']['f1']):
                        n = CP.probe_frames(path)
                        probes += [(f"{part}:{'+'.join(p['beats'])} first", v, path, x, n), (f"{part}:{'+'.join(p['beats'])} last", v+(y-x)-1, path, y-1, n)]
                        v += y-x
            base += m['frames']
    vid = CP.thumbs(a.video, [v for _, v, _, _, _ in probes])
    by_src = {}
    for _, _, sp, sf, n in probes: by_src.setdefault(sp, set()).update(j for j in (sf-1, sf, sf+1) if 0 <= j < n)
    src = {sp: CP.thumbs(sp, sorted(ix)) for sp, ix in by_src.items()}
    res, ok = [], True
    for lab, v, sp, sf, n in probes:
        exact = CP.psnr(vid.get(v), src[sp].get(sf)); nb = [CP.psnr(vid.get(v), src[sp].get(j)) for j in (sf-1, sf+1) if 0 <= j < n]
        nb = [x for x in nb if x is not None]; best_nb = max(nb) if nb else None
        static = best_nb is not None and exact is not None and abs(best_nb-exact) < .05 and best_nb >= 45
        good = exact is not None and exact >= 30 and (best_nb is None or exact >= best_nb-.5)
        res.append({'probe': lab, 'video_frame': v, 'src': sp, 'src_frame': sf, 'psnr': exact, 'psnr_neighbours': nb, 'ok': good, 'static': static})
        ok &= good
        print(f"accuracy {lab:46s} v{v:5d} ← {Path(sp).parent.name}/{Path(sp).name}#{sf:4d}: {exact} dB (±1: {nb}) {'OK' if good else 'FAIL'}{' static' if static else ''}", flush=True)
    if a.out: Path(a.out).write_text(json.dumps({'ok': ok, 'probes': res}, indent=1))
    return 0 if ok else 1


# ---------------------------------------------------------------- contact sheet
# (beat-local s; negative = from the end; label). Caught times follow caught-pov flashAt 1.75 / blackAt 2.15; goodbye blocks
# are all in from ≈1.2 s (HUD goodbyeTiming); the first choice picks A at pickAt (3.5 s).
V6_CONTACT = {
    'mission': [(.9, 'MISSION 近づくな'), (-.3, 'MISSION full')],
    'first-choice': [(1.6, 'first choice A/B'), (-.25, 'A picked (行かない)')],
    'true-end': [(.6, 'TRUE END stamp'), (-.4, 'TRUE END + line')],
    'guide': [(1.5, 'guide (B → run)')],
    'over-choice': [(.45, 'over choice'), (-.2, 'over selected')],
    'caught': [(.5, 'caught: press'), (1.5, 'caught: hands'), (1.8, 'caught: red flash'), (2.3, 'caught: black')],
    'over-stamp': [(1.0, 'GAME OVER on black'), (-.1, 'OVER + safety')],
    'over-lesson': [(.6, 'lesson')],
    'continue': [(.6, 'CONTINUE? 3'), (-.3, 'CONTINUE? YES')],
    'clear-choice': [(.45, 'clear choice'), (-.2, 'clear selected')],
    'clear-stamp': [(1.0, 'CLEAR stamp')],
    'clear-cheat': [(.6, 'cheat sheet')],
    'kaiju': [(1.0, 'kaiju rise'), (2.6, 'kaiju roar + gag')],
    'goodbye': [(.5, 'GOODBYE blocks in'), (2.5, 'GOODBYE full'), (-.4, 'GOODBYE end')],
    'sources': [(1.8, 'sources (union)')],
}


def contact_times(tl):
    out = []
    for part in ('opening', 'body'):
        P = tl['parts'][part]
        for b in P['beats']:
            d = b['t1']-b['t0']; t0 = P['offset']+b['t0']; hud = b.get('hud') or []
            tag = ' RE-SHOT' if b.get('origin') else (' new' if part == 'body' and not b.get('reuse') and b['id'] not in V6_CONTACT else '')
            if b.get('origin'):
                out += [(t0+d*.3, f"RE-SHOT {b['id']}"), (t0+d*.75, f"RE-SHOT {b['id']} (fix)")]
                continue
            if b['id'] in V6_CONTACT:
                out += [(t0+min(d-1/FPS, max(0, x if x >= 0 else d+x)), f'{lab}{tag}') for x, lab in V6_CONTACT[b['id']]]
                continue
            if part == 'opening':
                press = any(h.startswith('press') or h == 'logo:press' for h in hud)
                if 'logo' in hud and not press: out += [(t0+min(d-.05, 1.25), 'logo slam'), (t0+d-.1, 'logo hold')]
                elif press: out.append((t0+d*.45, 'PRESS START'))
                elif b.get('shot') == 'op-flythrough': out += [(t0, 'OP first frame'), (t0+d*.6, 'OP fly')]
                else: out.append((t0+d*.6, f"OP {b['id']}"))
            else: out.append((t0+d*.6, f"{b['id']}{tag}"))
    seen, res = set(), []
    for t, lab in out:
        f = max(0, min(tl['frames']-1, round(t*FPS)))
        if f not in seen: seen.add(f); res.append((f/FPS, lab))
    return res


def cmd_contact(a):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from record_variant import contact  # PIL + ffmpeg (no browser)
    tl = json.loads(Path(a.timeline).read_text())
    contact(a.video, a.out, contact_times(tl), cols=a.cols)
    print(a.out)
    return 0


def cmd_contact_times(a):
    print(json.dumps(contact_times(json.loads(Path(a.timeline).read_text())), ensure_ascii=False))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('sources')
    for k in ('--map', '--opening-map', '--src-root', '--combined-root', '--opening-mp4', '--out'): s.add_argument(k, required=True)
    j = sp.add_parser('join')
    for k in ('--map', '--opening-map', '--sources', '--new-dir', '--opening-new-dir', '--out'): j.add_argument(k, required=True)
    j.add_argument('--report'); j.add_argument('--smoke', action='store_true')
    j.add_argument('--crf', type=float, default=16); j.add_argument('--preset', default='medium'); j.add_argument('--threads', type=int, default=4)
    c = sp.add_parser('accuracy')
    c.add_argument('--video', required=True); c.add_argument('--join'); c.add_argument('--map'); c.add_argument('--opening-map'); c.add_argument('--sources'); c.add_argument('--out')
    v = sp.add_parser('verify'); v.add_argument('--video', required=True); v.add_argument('--frames', type=int, required=True)
    v.add_argument('--ebur', required=True); v.add_argument('--out', required=True); v.add_argument('--extra', action='append')
    k = sp.add_parser('contact'); k.add_argument('--video', required=True); k.add_argument('--timeline', required=True); k.add_argument('--out', required=True); k.add_argument('--cols', type=int, default=6)
    t = sp.add_parser('contact-times'); t.add_argument('--timeline', required=True)
    a = ap.parse_args(argv)
    return {'sources': cmd_sources, 'join': cmd_join, 'accuracy': cmd_accuracy, 'verify': CP.cmd_verify, 'contact': cmd_contact,
            'contact-times': cmd_contact_times}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
