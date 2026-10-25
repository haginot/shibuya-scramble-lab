"""Procedural soundtrack toolchain (tools/audio/): synthesis, cue-sheet mix, mastering, mux.

Runs tools/audio/selftest.py once in its own uv environment (numpy + scipy; ~10 s) and checks:
BS.1770 meter agrees with ffmpeg ebur128; every required SFX exists; BGM loops are seamless; the mix is 48 kHz
stereo 24-bit at ≈ -14 LUFS integrated with true peak ≤ -1 dBTP (ffmpeg); a shared opening is sample-identical
across two different bodies; output is deterministic; BGM is ducked under stamp cues; unknown names warn (strict:
error); mux.sh yields AAC 48 kHz stereo with the video's duration.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'tools' / 'audio'

pytestmark = pytest.mark.skipif(not (shutil.which('uv') and shutil.which('ffmpeg')),
                                reason='needs uv and ffmpeg')


@pytest.fixture(scope='module')
def st(tmp_path_factory):
    tmp = tmp_path_factory.mktemp('audio')
    res = subprocess.run([str(AUDIO / 'run.sh'), 'selftest', '--tmp', str(tmp)], cwd=ROOT, capture_output=True,
                         text=True, timeout=600)
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout.strip().splitlines()[-1])


def test_scripts_executable():
    for name in ('run.sh', 'mux.sh'):
        assert os.access(AUDIO / name, os.X_OK), name


def test_demo_cue_sheets_parse():
    for p in sorted((AUDIO / 'demo').glob('*.json')):
        c = json.loads(p.read_text())
        assert c['duration'] > 0 and c['events'] and c['bgm']
        assert all('t' in e and 'sfx' in e for e in c['events'])


def test_meter_matches_ffmpeg(st):
    assert abs(st['meter_internal_lufs'] - st['meter_ffmpeg_lufs']) < 0.3
    assert abs(st['meter_internal_tp'] - st['meter_ffmpeg_tp']) < 0.3


def test_registry(st):
    assert st['sfx_missing'] == []
    assert set(st['bgm_tracks']) == {'tension', 'calm', 'victory'}


def test_loop_seamless(st):
    assert st['loop_seam_step'] <= st['loop_p999_step']


def test_master_levels(st):
    sr, ch, width, frames = st['wav_format']
    assert (sr, ch, width) == (48000, 2, 3) and frames == 11 * 48000
    assert abs(st['mix_ffmpeg_lufs'] - (-14.0)) <= 0.5
    assert st['mix_ffmpeg_tp'] <= -1.0
    for seg in st['segments']:
        assert abs(seg['lufs'] - (-14.0)) <= 0.2 and seg['tp_db'] <= -1.0


def test_shared_opening_and_determinism(st):
    # bodies differ (one continues the opening's BGM, the other switches track at the seam) yet the opening matches
    assert st['opening_identical'] and st['bodies_differ'] and st['deterministic']
    n_runs, offset, fade_in, fade_out = st['continuation']
    assert n_runs == 2 and abs(offset - 4.0) < 1e-6 and fade_in == 0 and fade_out == 0


def test_ducking(st):
    assert st['duck_depth_db'] <= -6.0


def test_unknown_names(st):
    assert st['unknown_warns'] == 1 and st['strict_raises']
    assert st['repeat_count'] == 4


def test_mux(st):
    assert st['mux'] == {'codec': 'aac', 'sr': 48000, 'ch': 2, 'duration': 6.0}
    # true peak of the *encoded* AAC stays ≤ -1 dBTP (mix.py's AAC guard), loudness survives encoding
    assert st['mux_ebur128']['tp_dbtp'] <= -1.0
    assert abs(st['mux_ebur128']['I_lufs'] - (-14.0)) <= 0.6
