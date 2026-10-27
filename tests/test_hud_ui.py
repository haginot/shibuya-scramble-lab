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


# v6 (2026-10-27): the GOODBYE end card must carry the HAGINO-approved CONTRACT text verbatim (only line breaks may
# differ), keep our 「行かない」 line out of the quoted city block, and the new components must be registered.
GOODBYE_EXPECTED = [
    'GOODBYE BAD HALLOWEEN',
    '渋谷駅周辺では、条例で飲酒・喫煙、ごみのポイ捨ては禁止されています。（渋谷区）',
    '10/30(金)早朝〜11/1(日)朝方　ハチ公像は囲いで観覧不可',
    '10/30夕方〜11/1早朝　駅周辺で交通規制',
    'いちばんのCLEARは、今年の渋谷に「行かない」こと。',
    '出典：渋谷区公式X（2026/10/22）・渋谷区・警視庁渋谷警察署　※本編はフィクションです',
    'Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance. (Shibuya City)',
    'Oct 30 early AM – Nov 1 morning: Hachiko statue fenced off',
    'Oct 30 evening – Nov 1 early AM: traffic restrictions around the station',
    "The best CLEAR this year: don't go to Shibuya.",
    'Sources: Shibuya City (X, Oct 22, 2026), Shibuya City, MPD Shibuya Police Station. *Story is fiction.',
]


def _node_json(js):
    import json
    out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_hud_v6_goodbye_verbatim_and_blocks():
    r = _node_json("import {render,COMPONENT_KEYS} from './web3d/shibuya/series/ui/components.mjs';"
                   "const g=render({c:'goodbye',t:3,dur:8},{});const i=k=>g.html.indexOf(`data-c=\"${k}\"`);"
                   "console.log(JSON.stringify({strings:g.strings,quote:g.html.slice(i('goodbye-quote'),i('goodbye-facts')),"
                   "ours:g.html.slice(i('goodbye-ours'),i('goodbye-foot')),keys:COMPONENT_KEYS,"
                   "te:render({c:'stamp',kind:'TRUE_END',ja:'今年の渋谷ハロウィンには行かない',t:1,dur:4},{}).stamps}))")
    for line in GOODBYE_EXPECTED:
        assert line in r['strings'], line
    assert '（渋谷区）' in r['quote'] and '行かない' not in r['quote'] and '来るな' not in r['quote']
    assert '行かない' in r['ours'] and '渋谷区' not in r['ours']
    for k in ('mission', 'choice', 'stamp', 'guide', 'goodbye', 'sources'):
        assert k in r['keys']
    assert r['te'] == ['trueend']
