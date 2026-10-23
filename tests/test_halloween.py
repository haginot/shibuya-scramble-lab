"""Halloween night mode: solver checks, recorder contract and the on-screen number checks."""
import importlib.util
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def recorder():
    spec = importlib.util.spec_from_file_location('record_shibuya', ROOT/'tools/record_shibuya.py')
    rec = importlib.util.module_from_spec(spec); spec.loader.exec_module(rec)
    return rec


def test_halloween_and_dispersal_solvers():
    # Density bounds, no relocation, HUD counts = recounts, dispersal numbers = recounts,
    # and the comparison the video shows (see web3d/shibuya/verify-halloween.mjs).
    out = subprocess.run(['node', str(ROOT/'web3d/shibuya/verify-halloween.mjs')], check=True, timeout=1500, capture_output=True, text=True).stdout
    assert 'PASS Halloween' in out and 'PASS dispersal' in out


def test_halloween_recording_contract():
    rec = recorder()
    director = (ROOT/'web3d/shibuya/director-halloween.mjs').read_text()
    assert f'SCENE_SECONDS={rec.H_SCENE_SECONDS},CREDIT_SECONDS={rec.H_CREDIT_SECONDS}' in director
    assert 30 <= rec.H_SCENE_SECONDS + rec.H_CREDIT_SECONDS <= 45
    split = [float(x) for x in re.search(r'const SPLIT=\[([\d.]+),([\d.]+)\]', director).groups()]
    value = lambda v: split[int(v[6])] if v.startswith('SPLIT[') else float(v)
    shots = {name: value(t0) for name, t0 in re.findall(r"name:'(\w+)',t0:(SPLIT\[\d\]|[\d.]+)", director)}
    assert shots['hook'] == 0 and shots['dispersal'] < shots['results'] < rec.H_SCENE_SECONDS
    assert list(shots) == ['hook', 'establish', 'street', 'dj', 'release', 'dispersal', 'results']
    for t, ja, en in rec.H_CAPTIONS:
        if f"cap:['{en}','{ja}']" in director:
            assert re.search(rf"t0:{t:g},[^\n]*cap:\['{re.escape(en)}','{re.escape(ja)}'\]", director)
    script = (ROOT/'tools/record_shibuya.py').read_text()
    assert "mode=halloween&record=1&cam=cinema" in script and 'check_overlay(ov)' in script and 'time.time()' not in script
    # Normal mode stays on its own director and constants.
    assert rec.SCENE_SECONDS == 39 and rec.CREDIT_SECONDS == 5


def overlay(rec, **change):
    ov = {'shown': {'agents': '48,000', 'crossing': '1,234', 'queued': '567', 'held': '2,001', 'peak': '3.9', 'median': '1.4'},
          'source': {'agents': 48000, 'crossing': 1234, 'queued': 567, 'held': 2001, 'peak': 3.94, 'median': 1.36}}
    side = lambda rem: {'remaining': rec.fmt(rem), 'inside': '0', 'densNow': '4.8', 'peak': '4.9', 'crush': '5,321', 'cars': '10:55',
                        'src': {'remaining': rem, 'inside': 0, 'densNow': 4.78, 'peak': 4.89, 'crush': 5321.2, 'cars': 655.2}}
    ov['split'] = {'clock': '+25:00', 'A': side(3113), 'B': side(0), 'heldB': '0', 'source': {'time': 1500, 'timeB': 1500, 'heldB': 0}}
    for path, value in change.items():
        target = ov
        keys = path.split('__')
        for k in keys[:-1]: target = target[k]
        target[keys[-1]] = value
    return ov


def test_overlay_numbers_must_match_the_solver():
    rec = recorder()
    rec.check_overlay(overlay(rec))
    for bad in ({'shown__held': '2,000'}, {'shown__peak': '4.0'}, {'split__A__remaining': '3,000'}, {'split__clock': '+24:59'}, {'split__B__cars': '00:01'}):
        with pytest.raises(AssertionError):
            rec.check_overlay(overlay(rec, **bad))
    assert rec.mmss(655.2) == '10:55' and rec.p2(4.75) in ('4.8', '4.7') and rec.fmt(16000) == '16,000'


def test_formats_match_the_browser():
    # The browser's formatters (halloween-app.mjs) and the recorder's checks agree.
    script = "import('./web3d/shibuya/halloween-app.mjs').then(m=>console.log(JSON.stringify([m.fmt(16000),m.fmt(3112.6),m.p2(4.888),m.p2(0),m.mmss(655.2),m.mmss(null)])))"
    out = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=60).stdout
    rec = recorder()
    assert out.strip() == '["16,000","3,113","4.9","0.0","10:55",null]'
    assert [rec.fmt(16000), rec.fmt(3112.6), rec.p2(4.888), rec.p2(0), rec.mmss(655.2), rec.mmss(None)] == ['16,000', '3,113', '4.9', '0.0', '10:55', None]


def test_normal_mode_does_not_load_halloween_code():
    app = (ROOT/'web3d/shibuya/app.mjs').read_text()
    assert "params.get('mode')==='halloween'?await import('./halloween-app.mjs'):null" in app
    assert not re.search(r"^import .*halloween", app, re.M)
