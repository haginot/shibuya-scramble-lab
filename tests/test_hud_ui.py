"""Series game HUD (web3d/shibuya/series/ui): node self-test of the pure component layer + font licences."""
import shutil, subprocess
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_hud_selftest():
    out = subprocess.run(['node', str(ROOT/'web3d/shibuya/series/ui/selftest.mjs')], capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr
    assert 'hud selftest ok' in out.stdout


def test_hud_fonts_have_ofl():
    fonts = ROOT/'web3d/fonts'
    for f in ['DelaGothicOne-Regular.ttf', 'ZenKakuGothicNew-Bold.ttf', 'ZenKakuGothicNew-Black.ttf', 'ZenKakuGothicNew-Medium.ttf', 'Rajdhani-Bold.ttf', 'Rajdhani-SemiBold.ttf']:
        assert (fonts/f).stat().st_size > 100_000
    for lic in ['OFL-DelaGothicOne.txt', 'OFL-ZenKakuGothicNew.txt', 'OFL-Rajdhani.txt']:
        assert 'SIL OPEN FONT LICENSE' in (fonts/lic).read_text().upper()
