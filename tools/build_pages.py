"""Build the precomputed public demo without network requests or LLM calls."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from asagaya_town_sim import cli, promo
from asagaya_town_sim.publication import refresh_data_index


def build_pages(out='_site'):
    out = Path(out).resolve()
    # Do not overwrite checkout files, its parents, or bundled source assets.
    if out == ROOT or out in ROOT.parents or any(
        out == ROOT / name or ROOT / name in out.parents
        for name in ('src', 'docs', 'web3d', 'tools', 'tests', '.git', '.github')
    ):
        raise ValueError('Choose a separate build directory')
    args = argparse.Namespace(no_llm=True, area='asagaya', residents=400,
                              visitors=350, commuters=150, seeds=3, record=250)
    _, _, data, _, _, _ = cli.build(args)
    data["available_areas"] = ["asagaya", "koenji"]
    cli.write_site(out, cli.render_html(data), data)
    # Both supported areas must work, including the optional ?area=koenji view.
    args.area = 'koenji'
    _, _, other, _, _, _ = cli.build(args)
    other["available_areas"] = ["asagaya", "koenji"]
    (out / 'web3d/data/engine_koenji.json').write_text(
        json.dumps(other, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (out / 'web3d/data/promo.json').write_text(
        json.dumps(promo.simulate(promo.load_config()), ensure_ascii=False,
                   separators=(',', ':')), encoding='utf-8')
    (out / 'index.html').write_text((ROOT / 'tools/pages_index.html').read_text(encoding='utf-8'), encoding='utf-8')
    for name in ('LICENSE', 'NOTICE'):
        (out / name).write_text((ROOT / name).read_text(encoding='utf-8'), encoding='utf-8')
    refresh_data_index(out / 'web3d/data')
    (out / '.nojekyll').touch()
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('-o', '--out', default='_site')
    print(build_pages(parser.parse_args().out))
