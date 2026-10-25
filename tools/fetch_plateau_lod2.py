"""Fetch PLATEAU 2023 (Shibuya City) LOD2 building surfaces for the bundled Shibuya bbox.

Series realism layer (web3d/shibuya/series/realism.mjs) uses these roofs/walls (setbacks,
tiered towers, pitched roofs) for every building that has an LOD2 solid; the rest stay LOD1
extrusions from shibuya_plateau.json. Reads only the four CityGML tiles over HTTP ranges,
like tools/fetch_shibuya.py (same archive, same CC BY 4.0 licence, see NOTICE).

Output web3d/data/shibuya_plateau_lod2.json (compact):
  {source, license, ..., units, buildings:[{id, base, gtop, polys:[[kind, ring, ...holes]]}]}
  base: lowest ground point (m above TP); gtop: highest ground point above base (sloped sites; the
  renderer snaps wall bottoms at or below gtop to y=0 because the scene ground is flat).
  kind: 0 wall, 1 roof, 2 other (outer floor/ceiling, closure)  (ground surfaces are dropped)
  ring: flat [x,y,z, x,y,z, ...] in decimetres (integers); x east, z south from the Scramble,
        y up from the building's lowest ground point `base` (metres above TP, 0.1 m).
Run: uv run python tools/fetch_plateau_lod2.py --cache /tmp/shibuya-source
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_shibuya as F  # noqa: E402  (RangeZip, PLATEAU url, BBOX, xy)

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT/'web3d/data/shibuya_plateau_lod2.json'
NS = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml'}
B = '{http://www.opengis.net/citygml/building/2.0}'
KINDS = {'WallSurface': 0, 'RoofSurface': 1, 'GroundSurface': None, 'OuterFloorSurface': 2, 'OuterCeilingSurface': 2, 'ClosureSurface': 2}


def ring(pos):
    v = list(map(float, pos.text.split()))
    return [v[i:i+3] for i in range(0, len(v), 3)]


def surfaces(building):
    """Yield (kind, [exterior, *holes]) for every LOD2 boundary polygon of a building (incl. parts)."""
    for bb in building.iter(B+'boundedBy'):
        for surf in bb:
            name = surf.tag.split('}')[-1]
            if name not in KINDS: continue
            kind = KINDS[name]
            for poly in surf.findall('.//b:lod2MultiSurface//g:Polygon', NS):
                ext = poly.find('g:exterior//g:posList', NS)
                if ext is None: continue
                holes = [ring(p) for p in poly.findall('g:interior//g:posList', NS)]
                yield name, kind, [ring(ext), *holes]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', type=Path, default=Path('/tmp/shibuya-source'))
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    lod1 = {b['id'] for b in json.loads((ROOT/'web3d/data/shibuya_plateau.json').read_text())['buildings']}
    out, files, total = [], [], 0
    with zipfile.ZipFile(F.RangeZip(F.PLATEAU, args.cache)) as archive:
        names = [n for n in archive.namelist() if '/bldg/' in n and n.endswith('.gml') and Path(n).name[:8] in ('53393585', '53393586', '53393595', '53393596')]
        for name in sorted(names):
            raw = archive.read(name)
            files.append({'path': name, 'sha256': hashlib.sha256(raw).hexdigest()})
            root = ET.fromstring(raw)
            for b in root.iter(B+'Building'):
                gid = b.get('{http://www.opengis.net/gml}id')
                if gid not in lod1: continue  # same building set as the LOD1 file (bbox clip)
                total += 1
                polys = list(surfaces(b))
                if not polys: continue
                ground = [p[2] for n, k, rs in polys if n == 'GroundSurface' for p in rs[0]]
                base = min(ground) if ground else min(p[2] for _, _, rs in polys for p in rs[0])
                enc = []
                for _, kind, rs in polys:
                    if kind is None: continue
                    rings = []
                    for r in rs:
                        flat = []
                        for lat, lon, h in r[:-1] if r[0] == r[-1] else r:
                            x, z = F.xy(lat, lon)
                            flat += [round(x*10), round((h-base)*10), round(z*10)]
                        if len(flat) >= 9: rings.append(flat)
                    if rings: enc.append([kind, *rings])
                gtop = (max(ground)-base) if ground else 0.0
                if enc: out.append({'id': gid, 'base': round(base, 1), 'gtop': round(gtop, 1), 'polys': enc})
            print(name, len(out), flush=True)
    data = {'source': 'MLIT Project PLATEAU / Shibuya City 2023, CityGML v4 (LOD2 boundary surfaces)', 'license': 'CC BY 4.0',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/', 'policy_url': F.POLICY, 'url': F.PLATEAU, 'center': F.CENTER, 'bbox': F.BBOX,
            'units': 'decimetres (integers); x east, z south from the centre; y up from base (m above TP)',
            'processing': 'LOD2 Wall/Roof/OuterFloor/OuterCeiling/Closure polygons of the buildings in shibuya_plateau.json; ground surfaces dropped; no textures; modified (reprojected, quantised to 0.1 m)',
            'files': files, 'lod1_buildings': total, 'buildings': out}
    F.atomic_write(DEST, json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode())
    print(DEST, DEST.stat().st_size, f'{len(out)}/{total} buildings with LOD2', flush=True)


if __name__ == '__main__': main()
