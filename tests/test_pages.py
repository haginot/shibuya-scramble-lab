"""Check the actual static export, including both runtime area choices."""
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_pages', ROOT / 'tools/build_pages.py')
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


def test_pages_build(tmp_path):
    out = pages.build_pages(tmp_path / 'site')
    for name in ('index.html', '2d.html', 'web3d/default/index.html', 'web3d/promo/index.html'):
        assert (out / name).is_file()
    promo = json.loads((out / 'web3d/data/promo.json').read_text())
    assert {'none', 'sns_only', 'sns+coupon', 'all_four'} <= promo['combinations'].keys()
    assert promo['config']['days'] == 14
    assert promo == json.loads((ROOT/'web3d/data/promo.json').read_text())
    for name in ('engine.json','engine_koenji.json'):
        assert json.loads((out/'web3d/data'/name).read_text()) == json.loads((ROOT/'web3d/data'/name).read_text())
    # Match the fields consumed by promo/app.mjs throughout the animation.
    config = promo['config']
    assert len(promo['store']['position']) == 2
    metric_keys = {'total_visits', 'uplift', 'uplift_pct',
                   'would_have_come_anyway_share', 'roi'}
    for name in ('none', 'sns_only', 'sns+coupon', 'all_four'):
        result = promo['combinations'][name]
        assert metric_keys <= result['metrics'].keys()
        assert len(result['frames']) == config['days'] * len(config['hours'])
        assert len(result['daily']) == config['days']
        for day in result['daily']:
            assert day['weather']
        for index, frame in enumerate(result['frames']):
            assert frame['day'] == index // len(config['hours'])
            assert frame['hour'] == config['hours'][index % len(config['hours'])]
            assert metric_keys <= frame['metrics'].keys()
            assert len(frame['funnel']) == 5
            assert sum(frame['funnel']) == config['population']
            assert frame['agents']
            assert all(len(agent) == 3 for agent in frame['agents'])
    for file in out.rglob('*'):
        if file.suffix not in ('.html', '.mjs', '.css'):
            continue
        text = file.read_text()
        paths = re.findall(r'''(?:src|href)=["']([^"']+)["']''', text)
        paths += re.findall(r'''(?:fetch|fetchJSON|json)\(\s*["'`]([^"'`]+)["'`]''', text)
        paths += re.findall(r'''(?:from\s*|import\s*)["']([^"']+)["']''', text)
        for path in paths:
            parsed = urlsplit(path)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            assert not path.startswith('/'), (file, path)
            variants = [path.replace('${suffix}', suffix) for suffix in ('', '_koenji')] if '${suffix}' in path else [path]
            for variant in variants:
                target = (file.parent / unquote(urlsplit(variant).path)).resolve()
                assert target.is_relative_to(out), (file, variant)
                assert target.exists(), (file, variant)
    for name in ('web3d/default/index.html', 'web3d/promo/index.html', '2d.html'):
        html = (out / name).read_text()
        assert 'https://www.openstreetmap.org/copyright' in html
        if name == '2d.html':
            assert '国土地理院' not in html
        else:
            assert '国土地理院の標高タイルを加工して作成' in html
    assert 'https://{s}.tile.openstreetmap.org' not in (out / '2d.html').read_text()


def test_promo_animation_timestamp_bounds():
    """Exercise the actual animation expressions with an early first RAF timestamp."""
    import subprocess

    app = (ROOT / 'src/asagaya_town_sim/web3d/promo/app.mjs').read_text()
    expressions = re.search(r'const day=(.*);\n  const idx=(.*);', app)
    assert expressions
    subprocess.run(['node', '--input-type=module', '-e', f"""
        import assert from 'node:assert/strict';
        const data = {{config: {{days: 14, hours: [9, 13, 18]}},
                      combinations: {{none: {{frames: Array(42)}}}}}};
        const combos = ['none'], startTime = 100, speed = 30;
        for (const [now, expected] of [[99, 0], [100, 0], [15100, 21], [40100, 41]]) {{
            const day = {expressions[1]};
            const idx = {expressions[2]};
            assert.equal(idx, expected);
        }}
    """], check=True)
