"""国土地理院 標高タイル(dem5a_png→dem_png) から駅中心 ±R m の標高グリッドを作る（出典: 国土地理院）。
python3 tools/fetch_terrain.py LAT0 LON0 out.json"""
import io, json, math, sys, urllib.request
from PIL import Image
LAT0, LON0, OUT = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
R, STEP, Z = 560, 20, 15
K = 111320.0; C = math.cos(math.radians(LAT0))
cache = {}
def tile(kind, x, y):
    k = (kind, x, y)
    if k not in cache:
        try:
            req = urllib.request.Request(f"https://cyberjapandata.gsi.go.jp/xyz/{kind}/{Z}/{x}/{y}.png", headers={"User-Agent": "shibuya-scramble-lab"})
            cache[k] = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert("RGB")
        except Exception:
            cache[k] = None
    return cache[k]
def h(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    for kind in ("dem5a_png", "dem_png"):
        im = tile(kind, int(fx), int(fy))
        if im is None: continue
        r, g, b = im.getpixel((int((fx % 1) * 256), int((fy % 1) * 256)))
        v = r * 65536 + g * 256 + b
        if v == 8388608: continue
        return round((v - 16777216 if v > 8388608 else v) * 0.01, 2)
    return None
N = 2 * R // STEP + 1
grid = []
for j in range(N):
    y = -R + j * STEP; row = []
    for i in range(N):
        x = -R + i * STEP
        row.append(h(LAT0 + y / K, LON0 + x / (K * C)))
    grid.append(row)
vals = [v for r in grid for v in r if v is not None]
base = min(vals)
grid = [[round((v if v is not None else base) - base, 2) for v in r] for r in grid]
json.dump(dict(source="国土地理院 標高タイル (DEM5A/DEM10B)", origin=[LAT0, LON0], step=STEP, size=N, x0=-R, y0=-R, base_m=base, grid=grid),
          open(OUT, "w"), separators=(",", ":"))
print(N, base, max(vals))
