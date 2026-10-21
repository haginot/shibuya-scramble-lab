"""Fetch a small, attributed Shibuya extract. Network is needed only here.

PLATEAU CityGML is read with HTTP ranges, avoiding the 636 MB whole archive.
OSM is a separate ODbL database; PLATEAU footprints remain a separate CC BY file.
Run: uv run python tools/fetch_shibuya.py --cache /tmp/shibuya-source
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'src/asagaya_town_sim/web3d/data'
CENTER = (35.65948, 139.70055)
BBOX = (35.6559, 139.6961, 35.6631, 139.7050)
PLATEAU = 'https://assets.cms.plateau.reearth.io/assets/e5/29b4f5-f0bf-433d-8f98-deb594bfbebd/13113_shibuya-ku_pref_2023_citygml_2_op.zip'
POLICY = 'https://www.mlit.go.jp/plateau/site-policy/'
OSM_LICENSE = 'https://opendatacommons.org/licenses/odbl/1-0/'
UA = 'ShibuyaScrambleToy/0.5 (small public-data extract)'


def fetch(url, data=None, headers=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def xy(lat, lon):
    return [round((lon-CENTER[1])*111320*math.cos(math.radians(CENTER[0])), 2),
            round(-(lat-CENTER[0])*111320, 2)]


class RangeZip(io.RawIOBase):
    """Seekable remote archive; cache ranges to disk rather than repeatedly fetching."""
    def __init__(self, url, cache):
        self.url, self.cache, self.pos = url, cache, 0
        request = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
        with urllib.request.urlopen(request, timeout=60) as response:
            self.size = int(response.headers['Content-Length'])
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos+offset if whence == 1 else self.size+offset
        return self.pos
    def tell(self):
        return self.pos
    def read(self, n=-1):
        n = min(n if n >= 0 else self.size-self.pos, self.size-self.pos)
        if n <= 0: return b''
        key = self.cache / f'range-{self.pos}-{n}'
        if not key.exists():
            # Query key also prevents proxies reusing another Range response.
            body = fetch(self.url+f'?range={self.pos}-{n}', headers={'Range': f'bytes={self.pos}-{self.pos+n-1}'})
            if len(body) != n: raise ValueError('Server did not honor byte range')
            key.write_bytes(body)
        self.pos += n
        return key.read_bytes()


def plateau(cache):
    ns = {'b':'http://www.opengis.net/citygml/building/2.0', 'g':'http://www.opengis.net/gml'}
    buildings, files = [], []
    with zipfile.ZipFile(RangeZip(PLATEAU, cache)) as archive:
        names = [n for n in archive.namelist() if '/bldg/' in n and n.endswith('.gml') and Path(n).name[:8] in ('53393585','53393586','53393595','53393596')]
        if not names: raise ValueError('No target meshes in CityGML archive')
        for name in names:
            raw = archive.read(name)
            files.append({'path':name, 'sha256':hashlib.sha256(raw).hexdigest()})
            print('CityGML', name, len(raw), flush=True)
            root = ET.fromstring(raw)
            for b in root.findall('.//b:Building', ns):
                rings = b.findall('.//b:lod0FootPrint//g:exterior//g:posList', ns)
                if not rings: rings = b.findall('.//b:GroundSurface//g:exterior//g:posList', ns)
                if not rings: rings = b.findall('.//b:lod1Solid//g:exterior//g:posList', ns)
                candidates = []
                all_heights = []
                for ring in rings:
                    values = list(map(float, ring.text.split()))
                    points = [values[i:i+3] for i in range(0,len(values),3)]
                    if not points: continue
                    all_heights.extend(p[2] for p in points)
                    coords = [xy(p[0],p[1]) for p in points]
                    area = abs(sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(coords,coords[1:])))/2
                    if area > 5: candidates.append((min(p[2] for p in points), -area, points, coords))
                if not candidates: continue
                _, _, points, coords = min(candidates, key=lambda t:(round(t[0],1),t[1]))
                lat, lon = sum(p[0] for p in points)/len(points), sum(p[1] for p in points)/len(points)
                if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]): continue
                h = b.find('b:measuredHeight',ns)
                height = float(h.text) if h is not None else None
                if height is None:
                    zs = [float(p.text.split()[i]) for p in b.findall('.//g:posList', ns) for i in range(2,len(p.text.split()),3)]
                    height = max(zs)-min(zs) if zs else 9
                buildings.append({'id':b.get('{http://www.opengis.net/gml}id'), 'ring':coords, 'height':round(max(2,height),2), 'height_source':'measuredHeight' if h is not None else 'geometry_z_extent'})
    if len(buildings) < 50: raise ValueError('Unexpectedly small PLATEAU extract')
    return {'source':'MLIT Project PLATEAU / Shibuya City 2023, CityGML v4', 'license':'CC BY 4.0', 'license_url':'https://creativecommons.org/licenses/by/4.0/', 'policy_url':POLICY, 'url':PLATEAU, 'center':CENTER, 'bbox':BBOX, 'units':'metres; x east, z south; height above ground', 'processing':'Clipped; exterior ground footprint and measuredHeight; no textures or LOD2 roofs. Flat local ground.', 'files':files, 'buildings':buildings}


def osm(cache):
    bbox = ','.join(map(str,BBOX))
    query = f'[out:json][timeout:120];(way[highway]({bbox});way[railway=rail]({bbox});nwr[shop]({bbox});nwr[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"]({bbox});node[name="ハチ公"]({bbox}););out body geom;'
    rawfile = cache/'osm.json'
    failures = []
    if rawfile.exists():
        try:
            return parse_osm(rawfile.read_bytes(), query)
        except (ValueError, KeyError, TypeError) as exc:
            failures.append(f'Invalid cached response: {exc}')
    for endpoint in ('https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'):
        try:
            raw = fetch(endpoint, urllib.parse.urlencode({'data':query}).encode())
            result = parse_osm(raw, query)
            atomic_write(rawfile, raw)
            return result
        except Exception as exc:
            failures.append(str(exc))
    raise RuntimeError('; '.join(failures))


def atomic_write(path, body):
    temporary = path.with_suffix(path.suffix+'.tmp')
    try:
        temporary.write_bytes(body)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def parse_osm(raw, query):
    data = json.loads(raw)
    if data.get('remark') or not data.get('elements'):
        raise ValueError('Incomplete Overpass response (remark or empty elements)')
    roads, shops, railways = [], [], []
    for e in data['elements']:
        tags = e.get('tags',{})
        geom = e.get('geometry',[])
        if e['type']=='way' and ('highway' in tags or tags.get('railway')=='rail') and geom:
            record = {'id':e['id'],'name':tags.get('name',''), 'kind':tags.get('highway','rail'), 'points':[xy(p['lat'],p['lon']) for p in geom if p], 'nodes':e.get('nodes',[]), 'tags':tags}
            (roads if 'highway' in tags else railways).append(record)
        if 'shop' in tags or tags.get('amenity') in ('restaurant','cafe','fast_food','bar','pub','food_court'):
            if e['type']=='node': lat,lon=e['lat'],e['lon']
            elif geom: lat,lon=sum(p['lat'] for p in geom if p)/len(geom),sum(p['lon'] for p in geom if p)/len(geom)
            else:
                members=[p for m in e.get('members',[]) for p in m.get('geometry',[]) if p]
                if not members: continue
                lat,lon=sum(p['lat'] for p in members)/len(members),sum(p['lon'] for p in members)/len(members)
            if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]): continue
            if tags.get('shop') == 'vacant': continue
            shops.append({'id':f"{e['type']}/{e['id']}", 'name':tags.get('name',tags.get('brand','名称未登録 / unnamed')), 'kind':tags.get('shop',tags.get('amenity')), 'position':xy(lat,lon)})
    if not roads or not railways or not shops:
        raise ValueError('Incomplete Shibuya roads, railways or shops')
    if any(len(r['points'])<2 or any(not all(math.isfinite(v) for v in p) for p in r['points']) for r in roads+railways):
        raise ValueError('Invalid road/rail geometry')
    counts = {}
    for s in shops: counts[s['kind']] = counts.get(s['kind'],0)+1
    nearby_counts={}
    for s in shops:
        if math.hypot(*s['position'])<=150: nearby_counts[s['kind']]=nearby_counts.get(s['kind'],0)+1
    return {'source':'© OpenStreetMap contributors', 'license':'ODbL 1.0', 'license_url':OSM_LICENSE, 'copyright_url':'https://www.openstreetmap.org/copyright', 'timestamp':data.get('osm3s',{}).get('timestamp_osm_base'), 'sha256':hashlib.sha256(raw).hexdigest(), 'query':query, 'bbox':BBOX, 'center':CENTER, 'units':'metres; x east, z south', 'roads':roads, 'railways':railways, 'shops':shops, 'shop_counts':counts, 'nearby_150m_counts':nearby_counts,'nearby_150m_total':sum(nearby_counts.values()), 'shop_count_note':'OSM mapped shop/food objects, including unnamed objects, excluding shop=vacant, centroid clipped to bbox. Incomplete inventory; not a census. Node and area representations can overlap. Radius 150 m uses planar distance from crossing centre.'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache',type=Path,default=Path('/tmp/shibuya-source'))
    ap.add_argument('--only',choices=['osm','plateau'])
    args = ap.parse_args()
    args.cache.mkdir(parents=True,exist_ok=True)
    # Reviewed 2026-10-21, before first acquisition: PLATEAU policy section 3
    # explicitly permits CC BY 4.0; OSM copyright specifies ODbL. See NOTICE.
    print('License review: PLATEAU CC BY 4.0; OSM ODbL 1.0. See NOTICE.', flush=True)
    for kind, loader in (('osm',osm),('plateau',plateau)):
        if args.only and args.only != kind: continue
        data = loader(args.cache)
        dest = DEST/f'shibuya_{kind}.json'
        atomic_write(dest, json.dumps(data,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
        print(dest, dest.stat().st_size, flush=True)
        other = ROOT/'web3d/data'/dest.name
        atomic_write(other, dest.read_bytes())


if __name__ == '__main__': main()
