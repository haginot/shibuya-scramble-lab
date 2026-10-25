"""Wide-area OSM context for the series route-map shots (別駅脱出: Harajuku / Yoyogi / Ebisu ...).

Fetches (or reads from --cache) Overpass extracts for lat 35.643–35.687, lon 139.688–139.716 —
buildings, highways, rail/subway, stations, parks/forest — and writes a compact JSON for
web3d/shibuya/series/wide-area.mjs: web3d/data/series_wide_osm.json (© OpenStreetMap contributors, ODbL 1.0).
The walking routes are taken from the research file alt-routes.json (OSRM foot profile on OSM data,
computed by the transit researcher; labelled 「OSMから概算」) when --routes is given.

Compact format (metres, x east, z south from the Scramble centre 35.65948,139.70055; integers):
  buildings: [[h, x0,z0, x1,z1, ...], ...]   (outside the bundled PLATEAU bbox only; h estimated where untagged)
  roads:     [[cls, x0,z0, ...], ...]          cls 0 motorway/trunk, 1 primary/secondary, 2 tertiary, 3 minor
  rails:     [[kind, x0,z0, ...], ...]         kind 0 JR (東日本旅客鉄道 / 山手線 etc), 1 other surface rail
  green:     [[x0,z0, ...], ...]               parks / forest / wood (outer rings)
  stations:  [{ja, en, operator, x, z}]
  routes:    {id: {from, to, to_ja, distance_m, minutes_80m, inside_red_m, points:[[x,z],...]}}
  redZone:   [[x,z],...]  (research reading of the police map, 「規制図より概略」), startPoints, stationPoints
Run: uv run python tools/fetch_series_wide.py --cache /tmp/series-wide --routes $L/alt-routes.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT/'web3d/data/series_wide_osm.json'
CENTER = (35.65948, 139.70055)
PLATEAU_BBOX = (35.6559, 139.6961, 35.6631, 139.7050)
BBOX = (35.643, 139.688, 35.687, 139.716)
LATS = (35.643, 35.654, 35.665, 35.676, 35.687)
UA = 'ShibuyaSeriesToy/0.1 (small public-data extract)'
ENDPOINTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
             'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter')
C = math.cos(math.radians(CENTER[0]))


def xy(lat, lon):
    return ((lon-CENTER[1])*111320*C, -(lat-CENTER[0])*111320)


def queries():
    out = {}
    for i in range(4):
        b = f'{LATS[i]},{BBOX[1]},{LATS[i+1]},{BBOX[3]}'
        out[f'hw{i}'] = f'[out:json][timeout:170];way[highway]({b});out tags geom qt;'
        out[f'bd{i}'] = f'[out:json][timeout:170];way[building]({b});out tags geom qt;'
    b = ','.join(map(str, BBOX))
    out['misc'] = ('[out:json][timeout:240];(way[railway~"^(rail|subway|platform)$"](35.640,139.685,35.690,139.720);node[railway=station](35.640,139.685,35.690,139.720);'
                   f'way[leisure=park]({b});relation[leisure=park]({b});way[landuse~"forest|grass"]({b});way[natural=wood]({b}););out tags geom qt;')
    return out


def load(cache, name, q):
    path = cache/f'{name}.json'
    if path.exists(): return json.loads(path.read_text())
    for attempt in range(6):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=200) as r: raw = r.read()
                d = json.loads(raw)
                if d.get('remark'): raise ValueError(d['remark'])
                path.write_bytes(raw); return d
            except Exception as exc:  # noqa: BLE001 (retry next mirror)
                print(name, ep, exc, flush=True); time.sleep(8)
    raise RuntimeError(f'Overpass failed for {name}')


def simplify(pts, tol=1.0):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dz = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dz) or 1e-9
    i, dmax = 0, -1
    for k in range(1, len(pts)-1):
        p = pts[k]; d = abs(dz*(p[0]-a[0])-dx*(p[1]-a[1]))/L if L > 1e-6 else math.hypot(p[0]-a[0], p[1]-a[1])
        if d > dmax: i, dmax = k, d
    if dmax <= tol: return [a, b]
    return simplify(pts[:i+1], tol)[:-1]+simplify(pts[i:], tol)


def area(r): return abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(r, r[1:]+r[:1])))/2


def height(tags, key):
    for k in ('height', 'building:height'):
        try: return max(3, float(str(tags[k]).replace('m', '').strip()))
        except (KeyError, ValueError): pass
    try: return max(3, float(tags['building:levels'])*3.2+1)
    except (KeyError, ValueError): pass
    base = {'house': 7, 'detached': 7, 'residential': 10, 'apartments': 16, 'commercial': 22, 'retail': 14, 'office': 28, 'hotel': 30,
            'school': 14, 'university': 16, 'hospital': 22, 'train_station': 12, 'shrine': 8, 'temple': 8, 'garage': 4, 'roof': 5}.get(tags.get('building'), 10)
    h = int(hashlib.md5(str(key).encode()).hexdigest()[:4], 16)/65535
    return base*(0.75+0.6*h)


def flat(pts): return [v for p in pts for v in (round(p[0]), round(p[1]))]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', type=Path, default=Path('/tmp/series-wide'))
    ap.add_argument('--routes', type=Path, default=None, help='research alt-routes.json')
    ap.add_argument('--partial', action='store_true', help='use only the cached extracts (skip missing tiles; for previews)')
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    data = {k: load(args.cache, k, q) for k, q in queries().items() if not args.partial or (args.cache/f'{k}.json').exists()}
    missing = [k for k in queries() if k not in data]
    stamp = max((d.get('osm3s', {}).get('timestamp_osm_base', '') for d in data.values()), default='')
    px0, pz1 = xy(PLATEAU_BBOX[0], PLATEAU_BBOX[1]); px1, pz0 = xy(PLATEAU_BBOX[2], PLATEAU_BBOX[3])
    seen = set(); buildings, roads, rails, green, stations = [], [], [], [], []
    ROADCLS = {'motorway': 0, 'trunk': 0, 'motorway_link': 0, 'trunk_link': 0, 'primary': 1, 'primary_link': 1, 'secondary': 1, 'secondary_link': 1,
               'tertiary': 2, 'tertiary_link': 2, 'unclassified': 3, 'residential': 3, 'living_street': 3, 'pedestrian': 3}
    for name, d in data.items():
        for e in d['elements']:
            if (e['type'], e['id']) in seen: continue
            seen.add((e['type'], e['id'])); t = e.get('tags', {})
            geom = [xy(p['lat'], p['lon']) for p in e.get('geometry', []) if p]
            if name.startswith('bd') and e['type'] == 'way' and len(geom) >= 4:
                ring = simplify(geom[:-1] if geom[0] == geom[-1] else geom, .8)
                if len(ring) < 3 or area(ring) < 30: continue
                cx = sum(p[0] for p in ring)/len(ring); cz = sum(p[1] for p in ring)/len(ring)
                if px0 < cx < px1 and pz0 < cz < pz1: continue  # PLATEAU covers it
                buildings.append([round(height(t, e['id'])), *flat(ring)])
            elif name.startswith('hw') and e['type'] == 'way' and t.get('highway') in ROADCLS and len(geom) >= 2:
                if t.get('tunnel') == 'yes' or t.get('indoor') == 'yes': continue
                roads.append([ROADCLS[t['highway']], *flat(simplify(geom, .8))])
            elif name == 'misc':
                if e['type'] == 'node' and t.get('railway') == 'station':
                    x, z = xy(e['lat'], e['lon']); stations.append({'ja': t.get('name', ''), 'en': t.get('name:en', ''), 'operator': t.get('operator', ''), 'subway': t.get('station') == 'subway', 'x': round(x), 'z': round(z)})
                elif e['type'] == 'way' and t.get('railway') == 'rail' and t.get('tunnel') != 'yes' and len(geom) >= 2 and int(t.get('layer', '0') or 0) >= 0:
                    jr = '東日本旅客鉄道' in t.get('operator', '') or any(s in t.get('name', '') for s in ('山手', '埼京', '湘南新宿'))
                    rails.append([0 if jr else 1, *flat(simplify(geom, 1.5))])
                elif e['type'] == 'way' and (t.get('leisure') == 'park' or t.get('landuse') in ('forest', 'grass') or t.get('natural') == 'wood') and len(geom) >= 4:
                    if area(geom) > 400: green.append(flat(simplify(geom, 2)))
                elif e['type'] == 'relation' and t.get('leisure') == 'park':
                    for m in e.get('members', []):
                        g = [xy(p['lat'], p['lon']) for p in m.get('geometry', []) if p]
                        if m.get('role') == 'outer' and len(g) >= 4 and area(g) > 400: green.append(flat(simplify(g, 2)))
    out = {'source': '© OpenStreetMap contributors', 'license': 'ODbL 1.0', 'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
           'copyright_url': 'https://www.openstreetmap.org/copyright', 'timestamp': stamp, 'bbox': BBOX, 'center': CENTER,
           'units': 'metres (integers); x east, z south from the centre; building heights from height/building:levels tags, otherwise ESTIMATED by building type (context only)',
           'queries': queries(), 'missing_tiles': missing, 'buildings': buildings, 'roads': roads, 'rails': rails, 'green': green, 'stations': stations}
    if args.routes:
        r = json.loads(args.routes.read_text())
        P = lambda p: [round(v, 1) for v in xy(*p)]
        out['routes_source'] = r['meta']['method']+' — '+r['meta']['osm_attribution']+'; label '+r['meta']['label_ja']
        out['routes'] = {k: {'from': v['from'], 'to': v['to'], 'to_ja': v.get('to_ja'), 'distance_m': v['distance_m'], 'minutes_80m': v['minutes_80m'],
                             'inside_red_m': v.get('inside_red_m'), 'points': [P(p) for p in v['polyline_latlon']]} for k, v in r['alt_routes'].items()}
        out['pilotRoutes'] = {k: {'to': v['to'], 'distance_m': v.get('distance_m'), 'points': [P(p) for p in v['polyline_latlon']]} for k, v in r['pilot_routes'].items() if v.get('polyline_latlon')}
        out['redZone'] = [P(p) for p in r['red_zone_polygon_latlon']]
        out['redZoneLabel'] = '規制図より概略 (research reading of the police PDF map; vehicle restriction area)'
        out['startPoints'] = {k: {'ja': v['ja'], 'en': v['en'], 'p': P(v['point'])} for k, v in r['start_points'].items()}
        out['taxiPoints'] = {k: {'ja': v['ja'], 'p': P(v['point']) if v.get('point') else None, 'note': v.get('note')} for k, v in r.get('taxi_points', {}).items()}
        out['stationPoints'] = {k: {'ja': v['ja'], 'en': v['en'], 'lines': v['lines'], 'p': P(v['point'])} for k, v in r['stations'].items()}
    DEST.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(DEST, DEST.stat().st_size, {k: len(out[k]) for k in ('buildings', 'roads', 'rails', 'green', 'stations')}, flush=True)


if __name__ == '__main__': main()
