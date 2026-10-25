"""3D logotype + OP choreography (series/ui/logo3d.mjs, series/opening.mjs, tools/build_logo_glyphs.py): data
schema, licensed fonts, opening beats valid for the variant system (node, no browser)."""
import json
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'web3d/data/logo_glyphs.json'


def test_glyph_data_schema_and_text():
    d = json.loads(DATA.read_text())
    assert d['version'] == 1 and d['unit'] == 'em'
    assert d['text']['title'] == 'ハロウィンの渋谷を脱出せよ！'
    assert d['text']['badge'] == 'JR編' and d['text']['subtitle'] == '10/31 渋谷からどう帰る？' and d['text']['parody'] == '※パロディ'
    groups = {it['group'] for it in d['items']}
    assert {'title', 'backing', 'badge', 'badgeText', 'subtitle', 'subtitleText', 'parody', 'parodyText', 'pressText'} <= groups
    title = ''.join(it['char'] for it in d['items'] if it['group'] == 'title')
    assert title == 'ハロウィンの渋谷を脱出せよ！'
    assert ''.join(it['char'] for it in d['items'] if it['group'] == 'parodyText') == '※パロディ'
    x0, y0, x1, y1 = d['sdf']['rect']
    for it in d['items']:
        if it['group'] in ('ornament', 'pressText', 'pressSub'):
            continue  # PRESS START line: may extend past the SDF rect (no SDF effects on it)
        assert it['polys'], it['id']
        for p in it['polys']:
            assert len(p['o']) >= 3
            for x, y in p['o']:
                assert x0-1e-3 <= x <= x1+1e-3 and y0-1e-3 <= y <= y1+1e-3


def test_sdf_png_and_fonts_licensed():
    d = json.loads(DATA.read_text())
    png = ROOT/d['sdf']['file']
    head = png.read_bytes()[:24]
    assert head[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', head[16:24]) == (1024, 1024)
    for f in d['fonts'].values():
        assert (ROOT/f['file']).exists(), f
        assert 'OFL' in f['license']
    for lic in ['OFL-KaiseiTokumin.txt', 'OFL-DelaGothicOne.txt', 'OFL-ZenKakuGothicNew.txt']:
        assert 'SIL Open Font License' in (ROOT/'web3d/fonts'/lic).read_text()


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_opening_beats_validate():
    js = ("Promise.all([import('./web3d/shibuya/series/opening.mjs'),import('./web3d/shibuya/series/variant-system.mjs')]).then(([m,v])=>{"
          "const cfg={id:'_opening',episode:'jr',part:'opening',beats:m.openingBeats()};const r=v.validateConfig(cfg,{part:'opening'});"
          "const p=v.buildPart(cfg,'opening');const logo=[4,5,7.2].map(t=>v.frameSpec(p,cfg,t,{}).logo);"
          "console.log(JSON.stringify({ok:r.ok,errors:r.errors,dur:p.duration,frames:p.frames,logo,end:m.OP_TIMELINE.end,shakes:m.opShakes().length}));})")
    out = json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True, timeout=120).stdout)
    assert out['ok'], out['errors']
    assert abs(out['dur']-out['end']) < 1e-6 and out['frames'] == round(out['end']*30)
    assert out['logo'][0]['press'] is False and out['logo'][2]['press'] is True
    assert out['shakes'] == 2


def test_no_banned_names():
    import re
    banned = re.compile(''.join(map(chr, (101, 110, 97, 98, 108, 101)))+r'\s*x|'+''.join(map(chr, (0x30AB, 0x30F3, 0x30EA, 0x30FC)))+'|'+''.join(map(chr, (99, 97, 110)))+'-?ly', re.I)
    for f in ['web3d/shibuya/series/ui/logo3d.mjs', 'web3d/shibuya/series/opening.mjs', 'web3d/shibuya/series/ui/logo-lab.mjs',
              'web3d/shibuya/series/opening-preview.mjs', 'tools/build_logo_glyphs.py', 'tools/export_logo.py', 'web3d/data/logo_glyphs.json']:
        assert not banned.search((ROOT/f).read_text()), f
