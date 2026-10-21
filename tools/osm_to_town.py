"""OSM XML (api/0.6/map の bbox) から町エンジン用 GeoJSON（街路＋POI）を作る。
python3 tools/osm_to_town.py area.osm out.geojson"""
import json, sys, xml.etree.ElementTree as ET
WALK = {"primary", "secondary", "tertiary", "unclassified", "residential", "service", "footway", "path", "pedestrian", "steps", "living_street"}
def cat(t):
    a, s = t.get("amenity"), t.get("shop")
    if t.get("railway") == "station" and t.get("station") != "subway": return "station"
    if a == "cafe": return "cafe"
    if a in ("restaurant", "fast_food", "food_court"): return "food"
    if a in ("bar", "pub", "izakaya"): return "bar"
    if a in ("clinic", "doctors", "dentist", "hospital", "pharmacy"): return "clinic"
    if a in ("school", "kindergarten", "university", "college"): return "school"
    if a in ("bank", "post_office", "townhall", "library"): return "service"
    if s in ("supermarket", "convenience", "greengrocer", "butcher", "bakery", "deli"): return "grocery"
    if s: return "shop"
    if t.get("leisure") == "park": return "park"
    return None
r = ET.parse(sys.argv[1]).getroot()
nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in r.findall("node")}
F = []
for n in r.findall("node"):
    t = {x.get("k"): x.get("v") for x in n.findall("tag")}
    c = cat(t)
    if c and t.get("name"):
        F.append(dict(type="Feature", properties=dict(kind="poi", name=t["name"], cat=c, id=len(F), node=n.get("id")),
                      geometry=dict(type="Point", coordinates=list(nodes[n.get("id")]))))
for w in r.findall("way"):
    t = {x.get("k"): x.get("v") for x in w.findall("tag")}
    pts = [nodes[x.get("ref")] for x in w.findall("nd") if x.get("ref") in nodes]
    if t.get("highway") in WALK and len(pts) > 1:
        F.append(dict(type="Feature", properties=dict(kind="street", highway=t["highway"], name=t.get("name", "")),
                      geometry=dict(type="LineString", coordinates=[list(p) for p in pts])))
    elif t.get("leisure") == "park" and t.get("name") and pts:
        lon = sum(p[0] for p in pts) / len(pts); lat = sum(p[1] for p in pts) / len(pts)
        F.append(dict(type="Feature", properties=dict(kind="poi", name=t["name"], cat="park", id=len(F)), geometry=dict(type="Point", coordinates=[lon, lat])))
json.dump(dict(type="FeatureCollection", features=F), open(sys.argv[2], "w"), ensure_ascii=False)
import collections; print(collections.Counter(f["properties"].get("cat", "street") for f in F))
