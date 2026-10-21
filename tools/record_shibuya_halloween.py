"""Record the deterministic 20-second Halloween film; local files only.

Checkpointed frames survive interrupted captures. Reuse is gated by a source
fingerprint. The browser always steps by film time, never by elapsed wall time.
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import http.server
import json
from pathlib import Path
import shutil
import sys
import importlib.util
import subprocess
import threading
import time

from record_shibuya import QuietHandler, browser_with_webgl

WIDTH, HEIGHT, FPS, DURATION = 1080, 1920, 24, 20
STILLS = {0: '01-blueprint.png', 4: '02-day-extrusion.png', 10: '03-dusk.png', 23: '04-witch-hook.png', 35: '05-curb-queues.png', 37: '06-green-stepoff.png', 44: '07-six-arm-launch.png', 65: '08-whole-crossing.png', 84: '09-eye-level.png', 105: '10-five-events.png', 121: '11-all-five-hubs.png', 132: '12-yamanote-boarding.png', 143: '13-inokashira-boarding.png', 154: '14-trio-departure.png', 167: '15-trio-in-carriage.png', 181: '16-lantern-platform.png', 196: '17-trio-alighting.png', 201: '18-lantern-garden.png', 213: '19-inokashira-alighting.png', 217: '19b-inokashira-step-off.png', 232: '20-ebisu-stalls.png', 244: '21-return-to-crossing.png', 249: '22-matched-off-green.png', 260: '22-matched-colour-melt.png', 277: '23-matched-on-green.png', 296: '24-relief-still-green.png', 328: '25-calm-still-green.png', 338: '26-results.png', 372: '27-results-end.png', 396: '28-credits.png', 429: '29-green-loop-return.png', 459: '30-flatten-to-blueprint.png', 479: '31-loop-blueprint.png'}
CREDIT = ('MLIT Project PLATEAU / Shibuya 2023; modified footprints + heights, CC BY 4.0. '
          'https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023 '
          'https://creativecommons.org/licenses/by/4.0/ '
          '© OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright '
          'https://opendatacommons.org/licenses/odbl/1-0/ '
          'three.js r160 MIT. HAGINO 2026 procedural art and code MIT. '
          'Noto Sans CJK JP SIL OFL 1.1. See accompanying NOTICE and ASSETS.md. '
          'Toy model, not a prediction. Seed 1031; 960 agents; 1800 simulated seconds per scenario. '
          'Walking and schematic Yamanote/Inokashira routing; underlying SUMO trajectories are unused.')


def probe_video(path):
    result = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:format_tags:stream=codec_name,width,height,r_frame_rate', '-of', 'json', str(path)]))
    stream = result['streams'][0]
    assert stream['codec_name'] == 'h264', result
    assert (stream['width'], stream['height']) == (WIDTH, HEIGHT), result
    assert abs(float(result['format']['duration']) - DURATION) < 1 / FPS, result
    assert stream['r_frame_rate'] == f'{FPS}/1', result
    assert result['format']['tags']['credit'] == CREDIT, result
    return result


def record(site, output, stills, metrics_path, preview=False):
    from playwright.sync_api import sync_playwright
    for command in ('ffmpeg', 'ffprobe'):
        if not shutil.which(command):
            raise RuntimeError(f'{command} must be installed')
    view = site / 'web3d/shibuya'
    if not (view / 'halloween.html').is_file():
        raise RuntimeError('Build the site first: bash tools/record_shibuya_halloween.sh')
    output.parent.mkdir(parents=True, exist_ok=True)
    stills.mkdir(parents=True, exist_ok=True)
    frames = stills / '.frames'
    frames.mkdir(exist_ok=True)
    sources = sorted(view.glob('halloween*')) + [site / 'web3d/data/shibuya_plateau.json', site / 'web3d/data/shibuya_osm.json', site / 'web3d/data/shibuya_halloween_region.json', Path(__file__)]
    fingerprint = hashlib.sha256(b''.join(p.read_bytes() for p in sources)).hexdigest()
    manifest = frames / 'source.sha256'
    if manifest.exists() and manifest.read_text() != fingerprint:
        # Only remove files created by this recorder, never an arbitrary directory.
        for path in frames.glob('frame-*.jpg'):
            path.unlink()
    manifest.write_text(fingerprint)
    for name in ('NOTICE', 'LICENSE'):
        shutil.copyfile(site / name, stills / name)
    assets = Path(__file__).resolve().parents[1] / 'docs/HALLOWEEN_ASSETS.md'
    if assets.exists():
        shutil.copyfile(assets, stills / 'ASSETS.md')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(site)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    errors, snapshots = [], []
    start = time.monotonic()
    try:
        with sync_playwright() as p, browser_with_webgl(p) as browser:
            page = browser.new_page(viewport={'width': WIDTH, 'height': HEIGHT}, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/web3d/shibuya/halloween.html?record=1')
            page.wait_for_function('window.__ready===true', timeout=120000)
            assert page.evaluate("document.fonts.check('22px \"Noto Sans CJK JP\"')"), 'Noto Sans CJK JP unavailable'
            metrics = page.evaluate('window.__halloweenMetrics')
            if metrics_path.exists():
                assert json.loads(metrics_path.read_text()) == metrics, 'Browser and CLI model results disagree'
            metrics_path.parent.mkdir(parents=True, exist_ok=True)
            metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + '\n')
            (stills / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + '\n')
            selected = list(STILLS) if preview else range(FPS * DURATION)

            for frame in selected:
                path = frames / f'frame-{frame:05d}.jpg'
                if not preview and path.exists() and frame not in STILLS:
                    continue
                seconds = frame / FPS
                state = page.evaluate('t => window.__frame(t)', seconds)
                if errors:
                    raise RuntimeError('; '.join(errors))
                if frame in STILLS:
                    # Validate the actual ending text, not just the exported JSON.
                    if frame == 330:
                        assert page.locator('#no-visits').text_content() == str(metrics['no_events']['visits'])
                        assert page.locator('#promo-density').inner_text() == f"{metrics['events_on']['peak_density_per_m2']:.2f}"
                    page.screenshot(path=str(stills / STILLS[frame]), type='png', animations='disabled')
                    snapshots.append(dict(frame=frame, **state))
                if not preview:
                    path.write_bytes(page.screenshot(type='jpeg', quality=94, animations='disabled'))
                if frame % FPS == 0 or preview:
                    print(f'{seconds:5.2f}/{DURATION}s · {state["scenario"]} · density {state["density"]:.3f} · visits {state["visits"]}', flush=True)
            assert not errors, errors
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    probe = None
    if not preview:
        partial = output.with_name(output.stem + '.partial.mp4')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                        '-framerate', str(FPS), '-i', str(frames / 'frame-%05d.jpg'),
                        '-frames:v', str(FPS * DURATION), '-an', '-c:v', 'libx264',
                        '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart+use_metadata_tags', '-metadata', f'credit={CREDIT}',
                        '-metadata', 'comment=Toy-model values; seeded paired experiment; fictional-event paired replay; matched green comparison at sim 1092s; 20s loop. No audio.',
                        str(partial)], check=True)
        probe = probe_video(partial)
        partial.replace(output)
    result = dict(video=str(output), preview=preview, source_sha256=fingerprint, fps=FPS,
                  duration_s=DURATION, width=WIDTH, height=HEIGHT, wall_seconds=round(time.monotonic()-start, 2),
                  screenshots=[str(stills / p) for p in STILLS.values()], snapshots=snapshots, probe=probe, errors=errors)
    (stills / ('preview.json' if preview else 'recording.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('site', type=Path)
    ap.add_argument('--output', type=Path, default=Path('/workspace/demos/shibuya-halloween.mp4'))
    ap.add_argument('--stills', type=Path, default=Path('/workspace/demos/shibuya-halloween'))
    ap.add_argument('--metrics', type=Path, default=Path('out/media/shibuya-halloween-metrics.json'))
    ap.add_argument('--preview', action='store_true', help='Capture the PNG story frames without encoding')
    ap.add_argument('--renderer', choices=('auto', 'browser', 'software'), default='auto')
    args = ap.parse_args()
    def software():
        interpreter = sys.executable
        if importlib.util.find_spec('numpy') is None or importlib.util.find_spec('PIL') is None:
            interpreter = getattr(sys, '_base_executable', sys.executable)
        cmd = [interpreter, str(Path(__file__).with_name('record_shibuya_halloween_software.py')),
               '--output', str(args.output.resolve()), '--stills', str(args.stills.resolve()),
               '--metrics', str(args.metrics.resolve())]
        if args.preview:
            cmd.append('--preview')
        subprocess.run(cmd, check=True)
    if args.renderer == 'software':
        software()
    else:
        try:
            record(args.site.resolve(), args.output.resolve(), args.stills.resolve(), args.metrics.resolve(), args.preview)
        except Exception as error:
            # Only infrastructure restrictions permit fallback; JS/model errors remain fatal.
            if args.renderer != 'auto' or not (isinstance(error, PermissionError) or type(error).__name__ == 'TargetClosedError'):
                raise
            print(f'Browser capture unavailable ({type(error).__name__}); using local CPU renderer.', flush=True)
            software()
