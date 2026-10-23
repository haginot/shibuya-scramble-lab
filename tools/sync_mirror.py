"""Copy the authoritative web3d/shibuya sources (and the Shibuya data files) into the packaged
mirror src/asagaya_town_sim/web3d. web3d/ is the source of truth; the mirror is what
`shibuya-scramble-lab build` ships. Node-only dev tools (verify*, sweep-*, bench-*) stay out.
tests/test_shibuya.py::test_shibuya_source_mirrors checks both directions.

usage: python tools/sync_mirror.py [--check]
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC, DST = ROOT/'web3d', ROOT/'src/asagaya_town_sim/web3d'
DEV_PREFIXES = ('verify', 'sweep-', 'bench-')
DATA = ('shibuya_osm.json', 'shibuya_plateau.json', 'shibuya_traffic.json', 'shibuya_config.json', 'shibuya_calibration.json', 'shibuya_dispersal_sweep.json')


def pairs():
    for p in sorted((SRC/'shibuya').iterdir()):
        if p.is_file() and not p.name.startswith(DEV_PREFIXES): yield p, DST/'shibuya'/p.name
    for name in DATA: yield SRC/'data'/name, DST/'data'/name


def main(check=False):
    stale = [str(b.relative_to(ROOT)) for a, b in pairs() if not b.exists() or a.read_bytes() != b.read_bytes()]
    extra = [str(p.relative_to(ROOT)) for p in (DST/'shibuya').iterdir() if not (SRC/'shibuya'/p.name).exists() or p.name.startswith(DEV_PREFIXES)]
    if check: return stale, extra
    for a, b in pairs(): shutil.copyfile(a, b)
    for p in extra: (ROOT/p).unlink()
    print(f'synced {len(stale)} file(s), removed {len(extra)}')
    return [], []


if __name__ == '__main__':
    stale, extra = main('--check' in sys.argv)
    if stale or extra: sys.exit(f'mirror out of date: {stale + extra}')
