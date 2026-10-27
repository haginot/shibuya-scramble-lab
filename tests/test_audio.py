"""Procedural soundtrack toolchain (tools/audio/): synthesis, cue-sheet mix, mastering, mux.

Runs tools/audio/selftest.py once in its own uv environment (numpy + scipy; ~10 s) and checks:
BS.1770 meter agrees with ffmpeg ebur128; every required SFX exists; BGM loops are seamless; the mix is 48 kHz
stereo 24-bit at ≈ -14 LUFS integrated with true peak ≤ -1 dBTP (ffmpeg); a shared opening is sample-identical
across two different bodies; output is deterministic; BGM is ducked under stamp cues; unknown names warn (strict:
error); mux.sh yields AAC 48 kHz stereo with the video's duration.
Combined episodes (2026-10-26): the new SFX + retry bed exist (with aliases), the caught sounds hard-duck the BGM,
cut_black gives true silence on the BGM/ambience buses (and chops earlier tails), the BGM returns after the window,
the kaiju beat has no BGM, the kaiju roar is a tonal bellow (no screech energy above 3 kHz), track switches inside a
segment don't dip, and the ~70 s demo-combined cue sheet is well-formed (16 beats, 69.7 s, only known names).
v6 (2026-10-27, 「渋谷Halloweenには近づくな」): mission / first-choice / TRUE END / guide / GOODBYE cues exist, the farewell bed
loops and sits low, the TRUE END jingle is distinct from the CLEAR jingle, goodbye_in soft-cuts the kaiju tail, lint_v6
catches gag SFX on the end card and crowd beds under the TRUE END, and the ~88 s demo-v6 sheet is well-formed.
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
    assert set(st['bgm_tracks']) == {'tension', 'calm', 'victory', 'retry', 'farewell'}


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


# ------------------------------------------------------------------ combined episodes
def test_combined_registry(st):
    assert st['sfx_missing_combined'] == []
    assert st['aliases'] == {'zombie-groan': 'zombie_groan', 'roar': 'kaiju_roar', 'black': 'cut_black',
                             'smash': 'smash_cut', 'yes': 'continue_yes'}
    assert st['bgm_alias_continue'] == 'retry'


def test_combined_bgm_off_in_caught_and_kaiju(st):
    assert st['caught_bgm_duck_db'] <= -18.0       # BGM kept in the cue sheet, still effectively off
    assert st['kaiju_bgm_dbfs'] < -100              # bgm: null in the kaiju beat


def test_combined_black_cut_silence(st):
    assert st['n_hard_cuts'] == 2                    # cut_black + smash_cut
    assert st['black_bgm_amb_dbfs'] < -100           # buses hard-muted right on the cut
    assert st['black_silence_dbfs'] < -60            # whole mix silent after the thunk (tails chopped)
    assert st['after_cut_bgm_dbfs'] > -45            # and the BGM comes back for the stamp beat


def test_combined_continue_auto_bed(st):
    # countdown without BGM -> light retry bed up to the next run; opt-out and already-covered cases add nothing
    assert st['auto_bed'] == [[4.0, 7.0, 'retry']]
    assert st['auto_bed_off'] == 0 and st['auto_bed_covered'] == 0


def test_combined_roar_is_original_bellow(st):
    assert st['roar_gt3k_pct'] < 1.0 and st['roar_centroid_hz'] < 600


def test_combined_switch_and_master(st):
    assert st['switch_dip_lu'] < 6.0
    lufs, tp = st['combined_ffmpeg']
    assert abs(lufs - (-14.0)) <= 0.5 and tp <= -1.0


def test_demo_combined_cue_sheet():
    import sys
    sys.path.insert(0, str(AUDIO))
    c = json.loads((AUDIO / 'demo' / 'demo-combined.json').read_text())
    assert abs(c['duration'] - 69.7) < 1e-6 and len(c['meta']['beats']) == 16
    assert abs(sum(d for _, d in c['meta']['beats']) + 14.2 - c['duration']) < 1e-6
    names = {e['sfx'] for e in c['events']}
    for n in ('crowd_press', 'zombie_groan', 'caught_hit', 'red_flash', 'cut_black', 'continue_tick', 'continue_yes',
              'kaiju_rumble', 'kaiju_roar', 'smash_cut'):
        assert n in names, n
    known = set(json.loads(subprocess.run(
        ['python3', '-c', 'import ast,sys;src=open(sys.argv[1]).read();t=ast.parse(src);'
         'r=[n for n in t.body if isinstance(n,ast.Assign) and getattr(n.targets[0],"id","")=="REGISTRY"][0];'
         'print(__import__("json").dumps([k.value for k in r.value.keys]))', str(AUDIO / 'sfx.py')],
        capture_output=True, text=True, check=True).stdout))
    assert names <= known, names - known


# ------------------------------------------------------------------ v6 (「渋谷Halloweenには近づくな」)
V6_SFX = ('mission_in', 'choice_pick', 'seal_stamp', 'true_end_jingle', 'guide_in', 'goodbye_in')


def test_v6_registry(st):
    assert st['sfx_missing_v6'] == []
    assert st['aliases_v6'] == {'mission': 'mission_in', 'true-end': 'true_end_jingle', 'seal': 'seal_stamp',
                                'guide': 'guide_in', 'goodbye': 'goodbye_in', 'pick': 'choice_pick'}
    assert st['bgm_alias_goodbye'] == 'farewell'


def test_v6_farewell_bed(st):
    seam, p999 = st['farewell_seam']
    assert seam <= p999
    assert -24.0 <= st['farewell_lufs'] <= -21.0          # house trim: calm, under the long end-card read


def test_v6_true_end_jingle_distinct_and_warm(st):
    assert st['true_end_vs_clear_chroma'] < 0.6            # different key / harmony from the CLEAR jingle
    assert st['true_end_lt60_pct'] < 5.0                    # no drum / boom
    assert st['true_end_dur'] <= 6.0                        # short (incl. reverb tail)


def test_v6_goodbye_soft_cut_and_calm(st):
    assert st['goodbye_residual_db'] < -80                  # kaiju tail chopped by goodbye_in
    assert st['goodbye_uncut_tail_db'] > -40                # (and it would be audible without the cut)
    b = st['v6_beats_lufs']
    assert b['goodbye'] <= b['kaiju'] - 1.0
    lufs, tp = st['v6_ffmpeg']
    assert abs(lufs - (-14.0)) <= 0.5 and tp <= -1.0


def test_v6_lint(st):
    assert st['v6_lint'] == [] and st['demo_v6_lint'] == []
    assert st['lint_uncut'] >= 1 and st['lint_gag'] == 1 and st['lint_crowd'] == 1


def test_demo_v6_cue_sheet():
    c = json.loads((AUDIO / 'demo' / 'demo-v6.json').read_text())
    assert 75.0 <= c['duration'] <= 95.0
    seg = {s['name']: (s['t0'], s['t1']) for s in c['segments']}
    assert abs(seg['opening'][1] - 15.2) < 1e-6                     # mission beat 3.5 s (was notice 2.5 s)
    ids = [b['id'] for b in c['meta']['beats']]
    assert ids[:3] == ['first-choice', 'true-end', 'guide'] and ids[-2:] == ['goodbye', 'sources']
    assert 'endcard' not in ids and len(ids) == 19
    assert abs(c['meta']['beats'][-1]['t1'] - c['duration']) < 1e-6
    names = {e['sfx'] for e in c['events']}
    assert set(V6_SFX) <= names and 'smash_cut' not in names
    gb = next(b for b in c['meta']['beats'] if b['id'] == 'goodbye')
    late = [e for e in c['events'] if gb['t0'] <= e['t'] < c['duration']]
    assert {e['sfx'] for e in late} <= {'goodbye_in', 'card_in'}     # no gag / sting on the GOODBYE + sources cards
    assert any(r['track'] == 'farewell' and r['t0'] <= gb['t0'] + 1e-6 for r in c['bgm'])
