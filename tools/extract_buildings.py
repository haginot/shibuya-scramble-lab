"""OSM XML (api.openstreetmap.org/api/0.6/map の bbox 取得結果) から建物・線路を抽出し、駅中心のローカル座標(m)で保存する。
python3 tools/extract_buildings.py osm.xml src/asagaya_town_sim/data/buildings.json"""
import json, math, sys, random, xml.etree.ElementTree as ET
LAT0, LON0 = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (35.7047, 139.6358)
K = 111320.0; C = math.cos(math.radians(LAT0))
def xy(la, lo): return (round((lo - LON0) * K * C, 1), round((la - LAT0) * K, 1))
r = ET.parse(sys.argv[1]).getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in r.findall('node')}
B, rails = [], []
for w in r.findall('way'):
    t = {x.get('k'): x.get('v') for x in w.findall('tag')}
    pts = [nodes[x.get('ref')] for x in w.findall('nd') if x.get('ref') in nodes]
    if len(pts) < 3 and 'building' in t: continue
    if t.get('railway') == 'rail':
        rails.append([xy(*p) for p in pts]); continue
    if 'building' not in t: continue
    ps = [xy(*p) for p in pts]
    cx = sum(p[0] for p in ps) / len(ps); cy = sum(p[1] for p in ps) / len(ps)
    d = math.hypot(cx, cy)
    if d > 480: continue
    src = 'osm'
    try:
        h = float(t['height'].replace('m', ''))
    except Exception:
        if 'building:levels' in t:
            try: h = float(t['building:levels']) * 3.2
            except Exception: h = None
        else: h = None
    if h is None:  # 推定: 駅に近いほど高い（仮定）
        src = 'est'; rnd = random.Random(w.get('id'))
        lv = (5 if d < 120 else 3.5 if d < 250 else 2.3) + rnd.uniform(-1, 1.5)
        if t.get('building') in ('house', 'detached'): lv = min(lv, 2.5)
        h = max(3.0, round(lv) * 3.1)
    B.append(dict(h=round(h, 1), s=src, k=t.get('building'), p=ps[:-1] if ps[0] == ps[-1] else ps))
json.dump(dict(origin=[LAT0, LON0], note='© OpenStreetMap contributors (ODbL). 高さはOSMのheight/levels、無い建物は推定値', buildings=B, rails=rails),
          open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(B), sum(b['s'] == 'osm' for b in B), len(rails))
