"""Build the photoreal cutaway data set (web3d/photoreal/data/, see web3d/photoreal/CONTRACT.md).

Sources (MLIT Project PLATEAU, Shibuya City 2025, textured 3D Tiles; GSI elevation tiles):
  bldg LOD2 (textured), tran LOD3, frn LOD3, veg LOD3 (solitary trees + plant cover), brid LOD2, ubld LOD4.
Steps: traverse each tileset, keep LEAF tiles (finest REPLACE level) intersecting the fetch box
(local x in [-420,480], z in [-420,420]); download into the cache (resumable, never executed);
decode b3dm/glb (Draco), apply CESIUM_RTC + node transforms + glTF y-up -> 3D Tiles z-up, convert
ECEF -> local ENU at CENTER (x east, y up, z south), subtract h0 (ellipsoidal road surface height at
the origin, from tran). WebP textures -> JPEG (<= 2048 px). Buildings get a `_BID` vertex attribute
(manifest.buildings) and, where the source lacks ground faces, a flat bottom cap at base_y.
Also writes data/terrain.json from GSI DEM5A (z15) calibrated to the tran road surface.

Run (from the repo root):
  nice -n 10 uv run --with DracoPy --with numpy --with pillow --with shapely --with mapbox-earcut --with scipy \
      python -I tools/photoreal/fetch_tiles.py
"""
from __future__ import annotations

import argparse
import io
import json
import math
import struct
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import tiles_lib as L  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'web3d/photoreal/data'
CACHE = Path('/workspace/projects/logs/ssl-claude-photoreal/cache')
QA = Path('/workspace/projects/logs/ssl-claude-photoreal/qa')
FETCH = dict(x0=-420.0, x1=480.0, z0=-420.0, z1=420.0)
CATALOG = 'https://api.plateau.reearth.io/datacatalog/plateau-datasets'
A = 'https://assets.cms.plateau.reearth.io/assets/'
LAYERS = {  # name: [(dataset label, tileset url)]
    'bldg': [('建築物モデル LOD2（テクスチャ付き）', A+'16/b016d3-42ef-4428-ad99-d229310b39fd/13113_shibuya-ku_pref_2025_citygml_1_op_bldg_3dtiles_13113_shibuya-ku_lod2/tileset.json')],
    'tran': [('交通（道路）モデル LOD3', A+'ba/3b3ca7-270b-4fd9-b355-27b1ea7d7df5/13113_shibuya-ku_pref_2025_citygml_1_op_tran_3dtiles_lod3/tileset.json')],
    'frn': [('都市設備モデル LOD3', A+'ec/00bf52-fdbf-4c0c-8ed8-3a9e1f5ea146/13113_shibuya-ku_pref_2025_citygml_1_op_frn_3dtiles_lod3/tileset.json')],
    'veg': [('植生モデル 単独木 LOD3', A+'9f/a51d8e-3d44-447d-82f4-9a59ad51dfb9/13113_shibuya-ku_pref_2025_citygml_1_op_veg_SolitaryVegetationObject_3dtiles_lod3/tileset.json'),
            ('植生モデル 植被 LOD3', A+'fc/69b3bb-6a85-47f3-b4f0-abdb1da381ef/13113_shibuya-ku_pref_2025_citygml_1_op_veg_PlantCover_3dtiles_lod3/tileset.json')],
    'brid': [('橋梁モデル LOD2', A+'37/acee1e-84d2-457d-a6a6-486d52cdb1a1/13113_shibuya-ku_pref_2025_citygml_1_op_brid_3dtiles_lod2/tileset.json')],
    'ubld': [('地下街モデル LOD4', A+'ea/284655-a1e2-46c1-bdb5-ee4a66af67a3/13113_shibuya-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json')],
}
GSI_DEM = [('dem5a_png', 15), ('dem5b_png', 15), ('dem_png', 14)]
GSI_URL = 'https://cyberjapandata.gsi.go.jp/xyz/{name}/{z}/{x}/{y}.png'
MAX_TEX = 2048
JPEG_Q = 85
BLDG_CELL = 300.0
# suggested cutaway box (~500 m square): east face x=160 slices Shibuya Scramble Square (bid 908 in this build,
# footprint x 113..193); the Scramble (origin) and JR/Tokyu Shibuya Station (渋谷駅, x 39..139) stay inside.
SUGGESTED_CLIP = {'x0': -340.0, 'x1': 160.0, 'z0': -250.0, 'z1': 250.0, 'y0': -20.0,
                  'note': 'suggested by data agent; east plane x=160 cuts Shibuya Scramble Square (gml bldg_7b006717-e9e6-4a94-8843-1f4ce13b2509); y0 below ubld (min y -14.2)'}
TERRAIN_STEP = 4.0
ATTR_PLATEAU = '出典：国土交通省 PLATEAU（3D都市モデル 東京都渋谷区 2025年度）を加工して作成'
ATTR_GSI = '出典：国土地理院（地理院タイル 標高タイル）／地理院タイル（標高タイル（基盤地図情報数値標高モデル））を加工して作成'


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def fetch_box(fr):
    s, w = fr.latlon(FETCH['x0'], FETCH['z1'])
    n, e = fr.latlon(FETCH['x1'], FETCH['z0'])
    return (s, w, n, e)


# ---------------------------------------------------------------- textures
class Textures:
    def __init__(self):
        self.jpeg = {}   # key -> (bytes, w, h, src_w, src_h)
        self.alpha = {}  # key -> fraction of texels with alpha < 0.5

    def add(self, key, data):
        if key in self.jpeg or data is None:
            return
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        im.load()
        sw, sh = im.size
        if im.mode in ('RGBA', 'LA', 'P'):
            rgba = im.convert('RGBA')
            a = np.asarray(rgba)[..., 3]
            self.alpha[key] = float((a < 128).mean())
            im = rgba.convert('RGB')
        else:
            im = im.convert('RGB')
        if max(im.size) > MAX_TEX:
            f = MAX_TEX/max(im.size)
            im = im.resize((max(1, round(im.size[0]*f)), max(1, round(im.size[1]*f))), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, 'JPEG', quality=JPEG_Q, optimize=True)
        self.jpeg[key] = (b.getvalue(), im.size[0], im.size[1], sw, sh)


# ---------------------------------------------------------------- geometry helpers
def flat_normals(pos, idx):
    tri = pos[idx.reshape(-1, 3)]
    n = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
    return n


def vertex_normals(pos, idx):
    fn = flat_normals(pos, idx)
    vn = np.zeros_like(pos)
    t = idx.reshape(-1, 3)
    for k in range(3):
        np.add.at(vn, t[:, k], fn)
    ln = np.linalg.norm(vn, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return vn/ln


def subset(prim, tri_mask):
    """New primitive with only the masked triangles (vertices compacted)."""
    t = prim['idx'].reshape(-1, 3)[tri_mask]
    used = np.unique(t)
    remap = np.full(len(prim['pos']), -1, np.int64)
    remap[used] = np.arange(len(used))
    q = dict(prim)
    q['idx'] = remap[t].reshape(-1)
    for k in ('pos', 'nrm', 'uv', 'bid'):
        if prim.get(k) is not None:
            q[k] = prim[k][used]
    return q


def merge(prims):
    """Concatenate primitives sharing a material."""
    out = dict(prims[0])
    off, idx = 0, []
    for p in prims:
        idx.append(p['idx']+off)
        off += len(p['pos'])
    out['idx'] = np.concatenate(idx)
    for k in ('pos', 'nrm', 'uv', 'bid'):
        if all(p.get(k) is not None for p in prims):
            out[k] = np.concatenate([p[k] for p in prims])
        else:
            out[k] = None
    return out


# ---------------------------------------------------------------- GLB writer
def write_glb(path, prims, textures, with_bid):
    js = {'asset': {'version': '2.0', 'generator': 'ssl tools/photoreal/fetch_tiles.py',
                    'copyright': '国土交通省 PLATEAU（東京都渋谷区 2025）加工'},
          'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': path.stem}],
          'meshes': [{'name': path.stem, 'primitives': []}], 'accessors': [], 'bufferViews': [], 'buffers': [],
          'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]}
    blob = bytearray()

    def view(data, target=None):
        while len(blob) % 4: blob.append(0)
        bv = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target: bv['target'] = target
        blob.extend(data)
        js['bufferViews'].append(bv)
        return len(js['bufferViews'])-1

    def acc(arr, typ, ctype, target, minmax=False):
        a = {'bufferView': view(arr.tobytes(), target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        js['accessors'].append(a)
        return len(js['accessors'])-1

    tex_index, mat_index = {}, {}
    tris = 0
    tex_bytes = 0
    for p in prims:
        mkey = (p['tex_key'], tuple(np.round(p['color'], 3)), p.get('mat_label'))
        if mkey not in mat_index:
            mat = {'name': p.get('mat_label') or (p.get('mat_name') or 'mat'),
                   'pbrMetallicRoughness': {'baseColorFactor': [float(c) for c in p['color']], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}}
            if p.get('double'): mat['doubleSided'] = True
            if p['tex_key'] in textures.jpeg:
                if p['tex_key'] not in tex_index:
                    jb, w, h, sw, sh = textures.jpeg[p['tex_key']]
                    js['images'].append({'bufferView': view(jb), 'mimeType': 'image/jpeg'})
                    js['textures'].append({'sampler': 0, 'source': len(js['images'])-1})
                    tex_index[p['tex_key']] = len(js['textures'])-1
                    tex_bytes += len(jb)
                mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_index[p['tex_key']]}
            js['materials'].append(mat)
            mat_index[mkey] = len(js['materials'])-1
        attrs = {'POSITION': acc(p['pos'].astype(np.float32), 'VEC3', 5126, 34962, True)}
        nrm = p['nrm'] if p.get('nrm') is not None else vertex_normals(p['pos'], p['idx'])
        nrm = nrm/np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
        attrs['NORMAL'] = acc(nrm.astype(np.float32), 'VEC3', 5126, 34962)
        uv = p['uv'] if p.get('uv') is not None else np.zeros((len(p['pos']), 2), np.float32)
        attrs['TEXCOORD_0'] = acc(uv.astype(np.float32), 'VEC2', 5126, 34962)
        if with_bid:
            attrs['_BID'] = acc(p['bid'].astype(np.float32).reshape(-1, 1), 'SCALAR', 5126, 34962)
        idx = p['idx'].astype(np.uint32)
        prim = {'attributes': attrs, 'indices': acc(idx.reshape(-1, 1), 'SCALAR', 5125, 34963), 'material': mat_index[mkey], 'mode': 4}
        if p.get('extras'): prim['extras'] = p['extras']
        js['meshes'][0]['primitives'].append(prim)
        tris += len(idx)//3
    for a in js['accessors']:
        if a['type'] == 'SCALAR' and 'min' in a: pass
    while len(blob) % 4: blob.append(0)
    js['buffers'].append({'byteLength': len(blob)})
    if not js['images']:
        for k in ('images', 'textures', 'samplers'): js.pop(k)
    jb = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode()
    while len(jb) % 4: jb += b' '
    body = struct.pack('<4sII', b'glTF', 2, 12+8+len(jb)+8+len(blob)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    L.atomic_write(path, body)
    return {'file': path.name, 'bytes': len(body), 'triangles': int(tris), 'texture_bytes': int(tex_bytes),
            'textures': len(tex_index), 'primitives': len(prims)}


# ---------------------------------------------------------------- loading layers
def load_layer(name, fr, box, textures, ext_used):
    prims_all, tiles, batch = [], [], []
    for label, url in LAYERS[name]:
        try:
            ts, leaves = L.leaf_contents(url, CACHE, box)
        except Exception as exc:  # noqa: BLE001
            log(f'{name}: tileset unavailable ({exc})')
            continue
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda u: L.fetch(u, CACHE), leaves))
        for u in leaves:
            raw = L.fetch(u, CACHE)
            ft, bt, g, prims = L.tile_meshes(raw, u, CACHE)
            ext_used.update(g.get('extensionsUsed', []))
            tiles.append(u)
            ti = len(tiles)-1
            for p in prims:
                p['tile'] = ti
                p['pos'] = fr.from_ecef(p['pos'])
                if p['nrm'] is not None:
                    p['nrm'] = fr.dir_from_ecef(p['nrm'])
                if p['uv'] is not None:
                    p['uv'] = p['uv'].astype(np.float32)
                if p['img'] is not None:
                    textures.add(p['tex_key'], p['img'])
                p['img'] = None
                p['src_label'] = label
            batch.append(bt)
            prims_all += prims
        log(f'{name}: {label}: {len(leaves)} leaf tiles')
    return prims_all, tiles, batch


def clip_to_box(prims, margin=0.0):
    out = []
    for p in prims:
        c = p['pos'][p['idx'].reshape(-1, 3)].mean(1)
        m = (c[:, 0] >= FETCH['x0']-margin) & (c[:, 0] <= FETCH['x1']+margin) & (c[:, 2] >= FETCH['z0']-margin) & (c[:, 2] <= FETCH['z1']+margin)
        if m.any():
            out.append(subset(p, m) if not m.all() else p)
    return out


TRAN_CLASS = {'車道部': 'carriageway', '車道交差部': 'intersection', '歩道部': 'sidewalk', '島': 'island'}
TRAN_COLOR = {'carriageway': [0.32, 0.32, 0.34, 1], 'intersection': [0.36, 0.36, 0.38, 1], 'sidewalk': [0.55, 0.53, 0.5, 1],
              'island': [0.45, 0.5, 0.42, 1], 'other': [0.5, 0.5, 0.5, 1]}


def group_by_material(prims):
    groups = defaultdict(list)
    for p in prims:
        groups[(p['tex_key'], tuple(np.round(p['color'], 3)), p.get('mat_label'))].append(p)
    return [merge(v) for v in groups.values()]


# ---------------------------------------------------------------- h0 from tran
def surface_height_at(prims, x, z, up_only=True):
    """Heights of all upward-facing triangles containing (x, z)."""
    hs = []
    for p in prims:
        t = p['pos'][p['idx'].reshape(-1, 3)]
        a, b, c = t[:, 0], t[:, 1], t[:, 2]
        det = (b[:, 2]-c[:, 2])*(a[:, 0]-c[:, 0])+(c[:, 0]-b[:, 0])*(a[:, 2]-c[:, 2])
        ok = np.abs(det) > 1e-9
        with np.errstate(divide='ignore', invalid='ignore'):
            l1 = ((b[:, 2]-c[:, 2])*(x-c[:, 0])+(c[:, 0]-b[:, 0])*(z-c[:, 2]))/det
            l2 = ((c[:, 2]-a[:, 2])*(x-c[:, 0])+(a[:, 0]-c[:, 0])*(z-c[:, 2]))/det
        l3 = 1-l1-l2
        inside = ok & (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        if up_only:
            n = np.cross(b-a, c-a)
            inside &= np.abs(n[:, 1]) > 0.7*np.linalg.norm(n, axis=1)
        for i in np.nonzero(inside)[0]:
            hs.append(float(l1[i]*a[i, 1]+l2[i]*b[i, 1]+l3[i]*c[i, 1]))
    return hs


def rasterize_top(prims, x0, z0, step, nx, nz, up_only=True, lowest=False):
    """Grid of max (or lowest) upward-facing surface height (NaN where none); sample at cell nodes."""
    grid = np.full((nz, nx), np.nan)
    for p in prims:
        t = p['pos'][p['idx'].reshape(-1, 3)]
        if up_only:
            n = np.cross(t[:, 1]-t[:, 0], t[:, 2]-t[:, 0])
            keep = np.abs(n[:, 1]) > 0.7*np.maximum(np.linalg.norm(n, axis=1), 1e-12)
            t = t[keep]
        for tri in t:
            xs, zs = tri[:, 0], tri[:, 2]
            i0 = max(0, int(math.ceil((xs.min()-x0)/step))); i1 = min(nx-1, int(math.floor((xs.max()-x0)/step)))
            j0 = max(0, int(math.ceil((zs.min()-z0)/step))); j1 = min(nz-1, int(math.floor((zs.max()-z0)/step)))
            if i1 < i0 or j1 < j0: continue
            X, Z = np.meshgrid(x0+step*np.arange(i0, i1+1), z0+step*np.arange(j0, j1+1))
            a, b, c = tri
            det = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
            if abs(det) < 1e-9: continue
            l1 = ((b[2]-c[2])*(X-c[0])+(c[0]-b[0])*(Z-c[2]))/det
            l2 = ((c[2]-a[2])*(X-c[0])+(a[0]-c[0])*(Z-c[2]))/det
            l3 = 1-l1-l2
            m = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
            if not m.any(): continue
            y = l1*a[1]+l2*b[1]+l3*c[1]
            sub = grid[j0:j1+1, i0:i1+1]
            upd = m & ~((sub <= y) if lowest else (sub >= y))
            sub[upd] = y[upd]
    return grid


# ---------------------------------------------------------------- buildings
def clean(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if isinstance(v, (int, float)) and v <= -9999: return None
    return v


def build_buildings(prims, batches, tiles):
    """Assign global building ids (by gml_id). Returns (prims with global bid, table)."""
    gid_to_bid, table = {}, {}
    tile_maps = []
    for ti, bt in enumerate(batches):
        gids = bt.get('gml_id') or []
        m = []
        for bi, gid in enumerate(gids):
            if gid not in gid_to_bid:
                bid = len(gid_to_bid)
                gid_to_bid[gid] = bid
                def g(k):
                    arr = bt.get(k)
                    return clean(arr[bi]) if isinstance(arr, list) and bi < len(arr) else None
                table[bid] = {'gml_id': gid, 'name': g('gml:name'), 'height': g('bldg:measuredHeight'),
                              'storeys': g('bldg:storeysAboveGround'), 'storeysBelow': g('bldg:storeysBelowGround'),
                              'usage': g('bldg:usage'), 'class': g('bldg:class'), 'buildingID': g('uro:BuildingIDAttribute_uro:buildingID'),
                              'address': g('bldg:address'), 'lod': g('uro:lodType')}
            m.append(gid_to_bid[gid])
        tile_maps.append(np.array(m, np.int64))
    for p in prims:
        if p['bid'] is None:
            raise ValueError('building primitive without _BATCHID')
        p['bid'] = tile_maps[p['tile']][p['bid']]
    return prims, table


def edge_closure(prims):
    """Per building fraction of welded (1 cm) edges shared by exactly two triangles."""
    pos = np.concatenate([p['pos'] for p in prims])
    off = np.cumsum([0]+[len(p['pos']) for p in prims[:-1]])
    tri = np.concatenate([p['idx'].reshape(-1, 3)+o for p, o in zip(prims, off)])
    bid = np.concatenate([p['bid'] for p in prims])
    _, weld = np.unique(np.round(pos*100).astype(np.int64), axis=0, return_inverse=True)
    t = weld.reshape(-1)[tri]
    tb = bid[tri[:, 0]]
    out = {}
    order = np.argsort(tb, kind='stable')
    tb, t = tb[order], t[order]
    cuts = np.nonzero(np.diff(tb))[0]+1
    for seg_b, seg in zip(np.split(tb, cuts), np.split(t, cuts)):
        e = np.sort(np.concatenate([seg[:, [0, 1]], seg[:, [1, 2]], seg[:, [2, 0]]]), axis=1)
        _, c = np.unique(e, axis=0, return_counts=True)
        out[int(seg_b[0])] = round(float((c == 2).mean()), 4)
    return out


def footprint_union(tris_xz):
    from shapely.geometry import Polygon
    from shapely import union_all
    polys = []
    for t in tris_xz:
        pg = Polygon(t)
        if pg.area > 1e-4: polys.append(pg)
    if not polys: return None
    u = union_all(polys).buffer(0.02, join_style='mitre').buffer(-0.02, join_style='mitre').simplify(0.05)
    return u


def triangulate(geom):
    import mapbox_earcut as earcut
    from shapely.geometry import MultiPolygon, Polygon
    if isinstance(geom, Polygon): geoms = [geom]
    elif isinstance(geom, MultiPolygon): geoms = list(geom.geoms)
    else: geoms = [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]
    verts, idx = [], []
    for pg in geoms:
        if pg.is_empty or pg.area < 0.5: continue
        rings = [np.asarray(pg.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in pg.interiors]
        pts = np.concatenate(rings)
        ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        tri = np.asarray(earcut.triangulate_float64(pts, ends), np.int64)
        idx.append(tri+sum(len(v) for v in verts))
        verts.append(pts)
    if not verts: return None, None
    return np.concatenate(verts), np.concatenate(idx)


def add_bottom_caps(prims, table):
    """Per building: union of the projected mesh -> footprint polygon -> earcut, at base_y, facing down."""
    by_b = defaultdict(list)
    for p in prims:
        t = p['idx'].reshape(-1, 3)
        tb = p['bid'][t[:, 0]]
        for b in np.unique(tb):
            by_b[int(b)].append(p['pos'][t[tb == b]][:, :, [0, 2]])
    cap_pos, cap_idx, cap_bid = [], [], []
    off = 0
    areas = {}
    for b, chunks in by_b.items():
        tris = np.concatenate(chunks)
        geom = footprint_union(tris)
        if geom is None: continue
        v, i = triangulate(geom)
        if v is None: continue
        y = table[b]['base_y']
        pos = np.stack([v[:, 0], np.full(len(v), y), v[:, 1]], -1)
        tri = i.reshape(-1, 3)
        n = np.cross(pos[tri[:, 1]]-pos[tri[:, 0]], pos[tri[:, 2]]-pos[tri[:, 0]])
        flip = n[:, 1] > 0  # want normals facing down (-y)
        tri[flip] = tri[flip][:, [0, 2, 1]]
        cap_pos.append(pos); cap_idx.append(tri.reshape(-1)+off); cap_bid.append(np.full(len(v), b))
        off += len(v)
        areas[b] = round(float(geom.area), 1)
        table[b]['footprint_area'] = areas[b]
    if not cap_pos: return None
    pos = np.concatenate(cap_pos)
    return {'pos': pos, 'idx': np.concatenate(cap_idx), 'bid': np.concatenate(cap_bid).astype(np.int64),
            'nrm': np.tile([0.0, -1.0, 0.0], (len(pos), 1)), 'uv': np.zeros((len(pos), 2), np.float32),
            'tex_key': None, 'color': [0.35, 0.35, 0.35, 1.0], 'mat_label': 'bottom_cap', 'mat_name': 'bottom_cap',
            'extras': {'bottom_cap': True}}


# ---------------------------------------------------------------- terrain (GSI)
def gsi_tile_xy(lat, lon, z):
    n = 2**z
    x = (np.asarray(lon)+180)/360*n
    y = (1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*n
    return x, y


def gsi_decode(png):
    from PIL import Image
    im = np.asarray(Image.open(io.BytesIO(png)).convert('RGB')).astype(np.int64)
    v = im[..., 0]*65536+im[..., 1]*256+im[..., 2]
    h = np.where(v < 2**23, v, v-2**24)*0.01
    h = h.astype(np.float64)
    h[v == 2**23] = np.nan
    return h


def terrain(fr, box, tran_prims, h0):
    xs = np.arange(FETCH['x0'], FETCH['x1']+1e-6, TERRAIN_STEP)
    zs = np.arange(FETCH['z0'], FETCH['z1']+1e-6, TERRAIN_STEP)
    X, Z = np.meshgrid(xs, zs)
    lat0 = math.radians(L.CENTER[0])
    m = L.A_WGS*(1-L.E2)/(1-L.E2*math.sin(lat0)**2)**1.5
    nrad = L.A_WGS/math.sqrt(1-L.E2*math.sin(lat0)**2)
    LAT = L.CENTER[0]+np.degrees(-Z/m)
    LON = L.CENTER[1]+np.degrees(X/(nrad*math.cos(lat0)))
    H = np.full(X.shape, np.nan)
    used = []
    for name, z in GSI_DEM:
        miss = np.isnan(H)
        if not miss.any(): break
        fx, fy = gsi_tile_xy(LAT, LON, z)
        tiles = {}
        for tx in range(int(fx.min()), int(fx.max())+1):
            for ty in range(int(fy.min()), int(fy.max())+1):
                url = GSI_URL.format(name=name, z=z, x=tx, y=ty)
                try:
                    tiles[(tx, ty)] = gsi_decode(L.fetch(url, CACHE, retries=2))
                except Exception as exc:  # noqa: BLE001
                    log(f'GSI {name} {z}/{tx}/{ty}: {exc}')
        if not tiles: continue
        # pixel centres: pixel (i,j) of tile covers [tx+i/256, tx+(i+1)/256)
        px, py = fx*256-0.5, fy*256-0.5
        tx0, ty0 = int(fx.min()), int(fy.min())
        W = (int(fx.max())-tx0+1)*256; Hh = (int(fy.max())-ty0+1)*256
        mosaic = np.full((Hh, W), np.nan)
        for (tx, ty), arr in tiles.items():
            mosaic[(ty-ty0)*256:(ty-ty0+1)*256, (tx-tx0)*256:(tx-tx0+1)*256] = arr
        u, v = px-tx0*256, py-ty0*256
        i0, j0 = np.floor(u).astype(int), np.floor(v).astype(int)
        du, dv = u-i0, v-j0
        i0 = np.clip(i0, 0, W-2); j0 = np.clip(j0, 0, Hh-2)
        q = (mosaic[j0, i0]*(1-du)*(1-dv)+mosaic[j0, i0+1]*du*(1-dv)+mosaic[j0+1, i0]*(1-du)*dv+mosaic[j0+1, i0+1]*du*dv)
        upd = miss & ~np.isnan(q)
        H[upd] = q[upd]
        used.append({'name': name, 'zoom': z, 'tiles': len(tiles), 'filled_cells': int(upd.sum()),
                     'url': GSI_URL.format(name=name, z='{z}', x='{x}', y='{y}')})
    # fill any remaining holes by nearest valid (buildings / NA cells)
    if np.isnan(H).any():
        from scipy.ndimage import distance_transform_edt  # optional
        idx = distance_transform_edt(np.isnan(H), return_distances=False, return_indices=True)
        H = H[tuple(idx)]
    # calibrate: tran road surface heights (local y + h0 = ellipsoidal) vs orthometric DEM
    road = rasterize_top(tran_prims, xs[0], zs[0], TERRAIN_STEP, len(xs), len(zs), lowest=True)  # lowest deck = street level
    ok = ~np.isnan(road)
    diff = (road[ok]+h0)-H[ok]
    offset = float(np.median(diff))
    res = diff-offset
    calib = {'geoid_offset_m': round(offset, 3), 'samples': int(ok.sum()),
             'residual_median_abs_m': round(float(np.median(np.abs(res))), 3),
             'residual_rms_m': round(float(np.sqrt(np.mean(res**2))), 3),
             'residual_p95_abs_m': round(float(np.percentile(np.abs(res), 95)), 3),
             'note': 'offset = median(tran road surface ellipsoidal height - GSI orthometric DEM) over road-covered grid nodes'}
    Y = H+offset-h0
    try:
        from PIL import Image
        r = np.full(road.shape+(3,), 20, np.uint8)
        dv = np.zeros(road.shape); dv[ok] = res
        r[ok] = np.stack([np.clip(128+dv[ok]*40, 0, 255), np.full(ok.sum(), 128), np.clip(128-dv[ok]*40, 0, 255)], -1).astype(np.uint8)
        QA.mkdir(parents=True, exist_ok=True)
        Image.fromarray(r).resize((road.shape[1]*2, road.shape[0]*2), Image.NEAREST).save(QA/'terrain-residual.png')
        big = ok & (np.abs(dv) > 3)
        J, I = np.nonzero(big)
        if len(I):
            log(f'terrain residual >3 m at {len(I)} nodes; x range {xs[I].min():.0f}..{xs[I].max():.0f}, z {zs[J].min():.0f}..{zs[J].max():.0f}; mean signed {dv[big].mean():.2f} m (road above DEM if >0)')
    except Exception as exc:  # noqa: BLE001
        log('residual png failed', exc)
    return {'attribution': ATTR_GSI, 'source': used, 'units': 'metres, local frame (x east, y up, z south), y = ellipsoidal - h0',
            'x0': float(xs[0]), 'z0': float(zs[0]), 'step': TERRAIN_STEP, 'nx': len(xs), 'nz': len(zs),
            'layout': 'heights[j*nx+i] at x = x0+i*step, z = z0+j*step (row-major, z rows)',
            'calibration': calib, 'heights': [round(float(v), 2) for v in Y.reshape(-1)]}, road, Y


# ---------------------------------------------------------------- QA image
def topdown(path, bldg_prims, tran_prims, table, clip=None, px=1.0):
    from PIL import Image, ImageDraw
    W = int((FETCH['x1']-FETCH['x0'])/px); H = int((FETCH['z1']-FETCH['z0'])/px)
    im = Image.new('RGB', (W, H), (12, 12, 16))
    d = ImageDraw.Draw(im)
    def P(x, z): return ((x-FETCH['x0'])/px, (z-FETCH['z0'])/px)
    for p in tran_prims:
        for t in p['pos'][p['idx'].reshape(-1, 3)]:
            d.polygon([P(v[0], v[2]) for v in t], fill=(60, 60, 70))
    tops = [table[b]['top_y'] for b in table if 'top_y' in table[b]]
    hmax = max(tops) if tops else 1
    for p in bldg_prims:
        t = p['idx'].reshape(-1, 3)
        tb = p['bid'][t[:, 0]]
        for tri, b in zip(p['pos'][t], tb):
            n = np.cross(tri[1]-tri[0], tri[2]-tri[0])
            if n[1] <= 0: continue
            hh = max(0.0, table[int(b)].get('top_y', 0))/hmax
            col = (int(80+170*hh), int(120+80*(1-hh)), int(200*(1-hh)+40))
            d.polygon([P(v[0], v[2]) for v in tri], fill=col)
    for gx in range(-400, 481, 100):
        d.line([P(gx, FETCH['z0']), P(gx, FETCH['z1'])], fill=(50, 50, 50))
    for gz in range(-400, 421, 100):
        d.line([P(FETCH['x0'], gz), P(FETCH['x1'], gz)], fill=(50, 50, 50))
    ox, oz = P(0, 0)
    d.ellipse([ox-6, oz-6, ox+6, oz+6], outline=(255, 0, 0), width=3)
    d.line([ox-12, oz, ox+12, oz], fill=(255, 0, 0)); d.line([ox, oz-12, ox, oz+12], fill=(255, 0, 0))
    if clip:
        d.rectangle([P(clip['x0'], clip['z0']), P(clip['x1'], clip['z1'])], outline=(255, 255, 0), width=2)
    top = sorted(table.items(), key=lambda kv: -kv[1].get('top_y', -1e9))[:8]
    for b, r in top:
        cx, cz = (r['minx']+r['maxx'])/2, (r['minz']+r['maxz'])/2
        d.text(P(cx, cz), f"{b}:{r['top_y']:.0f}", fill=(255, 255, 255))
    d.text((5, 5), 'N up, x east; red = origin (Scramble); labels bid:top_y; grid 100 m', fill=(255, 255, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, default=OUT)
    ap.add_argument('--qa', type=Path, default=Path('/workspace/projects/logs/ssl-claude-photoreal/qa'))
    ap.add_argument('--layers', default='tran,bldg,frn,veg,brid,ubld')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for old in args.out.glob('*.glb'):
        old.unlink()
    CACHE.mkdir(parents=True, exist_ok=True)
    fr = L.Frame(0.0)
    box = fetch_box(fr)
    textures = Textures()
    manifest = {'center': list(L.CENTER), 'bbox': FETCH, 'fetch_bbox_latlon': {'s': box[0], 'w': box[1], 'n': box[2], 'e': box[3]},
                'frame': 'metres; x east, y up, z south (local ENU tangent plane at center); y = ellipsoidal height - h0',
                'layers': {}, 'files': {}, 'layer_notes': {}, 'sources': {}}
    layers = args.layers.split(',')
    loaded = {}
    ext_used = defaultdict(set)
    for name in layers:
        prims, tiles, batches = load_layer(name, fr, box, textures, ext_used[name])
        loaded[name] = (prims, tiles, batches)
        manifest['sources'][name] = [{'dataset': lab, 'tileset': u, 'leaf_tiles': len(tiles)} for lab, u in LAYERS[name]]
        log(f'{name}: {len(tiles)} tiles, {len(prims)} primitives, ext {sorted(ext_used[name])}')

    # h0: ellipsoidal road surface at origin from tran
    hs = surface_height_at(loaded['tran'][0], 0.0, 0.0) if 'tran' in loaded else []
    if not hs:
        for r in (2, 5, 10):
            for dx, dz in ((r, 0), (-r, 0), (0, r), (0, -r)):
                hs += surface_height_at(loaded['tran'][0], dx, dz)
            if hs: break
    h0 = float(min(hs)) if hs else 0.0  # lowest upward surface = street level (skip any deck above)
    log(f'h0 = {h0:.3f} (candidates {sorted(round(h, 2) for h in hs)})')
    manifest['h0'] = round(h0, 3)
    manifest['h0_note'] = 'ellipsoidal (WGS84/GRS80) height of the tran LOD3 road surface at the origin'
    for name, (prims, _, _) in loaded.items():
        for p in prims:
            p['pos'][:, 1] -= h0

    # ----- buildings
    if 'bldg' in loaded:
        prims, tiles, batches = loaded['bldg']
        prims, table = build_buildings(prims, batches, tiles)
        # per-building extents
        ext = {}
        down_area = defaultdict(float)
        for p in prims:
            t = p['idx'].reshape(-1, 3)
            tb = p['bid'][t[:, 0]]
            tri = p['pos'][t]
            n = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
            area = np.linalg.norm(n, axis=1)/2
            down = n[:, 1] < -0.95*np.maximum(np.linalg.norm(n, axis=1), 1e-12)
            for b in np.unique(tb):
                sel = tb == b
                v = tri[sel].reshape(-1, 3)
                e = ext.setdefault(int(b), [1e9, -1e9, 1e9, -1e9, 1e9, -1e9])
                e[0] = min(e[0], v[:, 0].min()); e[1] = max(e[1], v[:, 0].max())
                e[2] = min(e[2], v[:, 2].min()); e[3] = max(e[3], v[:, 2].max())
                e[4] = min(e[4], v[:, 1].min()); e[5] = max(e[5], v[:, 1].max())
                # downward faces near base count as ground faces
                bm = sel & down & (tri[:, :, 1].mean(1) < e[4]+1.0)
                down_area[int(b)] += float(area[bm].sum())
        # keep buildings whose footprint intersects the fetch box
        keep = {b for b, e in ext.items() if not (e[1] < FETCH['x0'] or e[0] > FETCH['x1'] or e[3] < FETCH['z0'] or e[2] > FETCH['z1'])}
        # second pass for down area of final base (base can be lower than the first-chunk estimate)
        for b in keep:
            e = ext[b]
            table[b].update({'minx': round(e[0], 2), 'maxx': round(e[1], 2), 'minz': round(e[2], 2), 'maxz': round(e[3], 2),
                             'base_y': round(e[4], 2), 'top_y': round(e[5], 2)})
        table = {b: table[b] for b in sorted(keep)}
        kept = []
        for p in prims:
            t = p['idx'].reshape(-1, 3)
            m = np.isin(p['bid'][t[:, 0]], list(keep))
            if m.any(): kept.append(subset(p, m))
        prims = kept
        has_ground = {b: down_area.get(b, 0.0) > 0.5 for b in table}
        closure = edge_closure(prims)
        for b in table:
            table[b]['closed_edge_fraction'] = closure.get(b)
        nclosed = sum(1 for b in table if closure.get(b) == 1.0)
        nnear = sum(1 for b in table if closure.get(b) is not None and 0.95 < closure[b] < 1.0)
        n_ground = sum(has_ground.values())
        log(f'buildings: {len(table)} in box; with ground (bottom) faces: {n_ground}')
        need = {b for b in table if not has_ground[b]}
        caps = None
        if need:
            sub = []
            for p in prims:
                t = p['idx'].reshape(-1, 3)
                m = np.isin(p['bid'][t[:, 0]], list(need))
                if m.any(): sub.append(subset(p, m))
            caps = add_bottom_caps(sub, table)
        for b in table:
            table[b]['source_bottom_faces'] = has_ground[b]
            table[b]['bottom_cap_added'] = caps is not None and bool(np.any(caps['bid'] == b)) if caps is not None else False
        manifest['bottom_caps'] = {'source_meshes_have_bottom_faces': f'{n_ground}/{len(table)} buildings',
                                   'added': caps is not None, 'added_for': len(need),
                                   'closure': f'{nclosed} watertight (every welded edge shared by exactly 2 triangles), {nnear} >95% manifold edges (T-junctions / cracks), {len(table)-nclosed-nnear} more open; winding outward (positive signed volume), normals agree with winding',
                                   'ground_face_test': 'downward-facing triangles (normal.y < -0.95) within 1 m of the building base, total area > 0.5 m2',
                                   'method': 'per building: union of the xz projection of all its triangles (shapely) -> polygon(s) with holes -> earcut, placed flat at base_y (lowest vertex), normals -y; separate primitive per GLB with material "bottom_cap" and extras.bottom_cap=true'}
        # spatial grouping by source tile centre (keeps each texture atlas in exactly one GLB)
        tile_centre = {}
        for p in prims:
            tile_centre.setdefault(p['tile'], []).append(p['pos'][:, [0, 2]].mean(0))
        ncx = max(1, int(round((FETCH['x1']-FETCH['x0'])/BLDG_CELL))); ncz = max(1, int(round((FETCH['z1']-FETCH['z0'])/BLDG_CELL)))
        cell_of_tile = {t: (min(ncx-1, max(0, int(math.floor((np.mean(c, 0)[0]-FETCH['x0'])/BLDG_CELL)))),
                            min(ncz-1, max(0, int(math.floor((np.mean(c, 0)[1]-FETCH['z0'])/BLDG_CELL))))) for t, c in tile_centre.items()}
        cells = defaultdict(list)
        for p in prims:
            cells[cell_of_tile[p['tile']]].append(p)
        files = []
        bid_file = {}
        for (ci, cj), ps in sorted(cells.items()):
            ps = group_by_material(ps)
            bids = set(np.unique(np.concatenate([p['bid'] for p in ps])).tolist())
            if caps is not None:
                m = np.isin(caps['bid'][caps['idx'].reshape(-1, 3)[:, 0]], list(bids))
                if m.any(): ps.append(subset(caps, m))
            fn = f'bldg_{ci}_{cj}.glb'
            st = write_glb(args.out/fn, ps, textures, True)
            st['buildings'] = len(bids)
            st['bounds'] = {'minx': round(min(float(p['pos'][:, 0].min()) for p in ps), 1), 'maxx': round(max(float(p['pos'][:, 0].max()) for p in ps), 1),
                            'minz': round(min(float(p['pos'][:, 2].min()) for p in ps), 1), 'maxz': round(max(float(p['pos'][:, 2].max()) for p in ps), 1)}
            files.append(fn); manifest['files'][fn] = st
            for b in bids: bid_file[b] = fn
            log(f'  {fn}: {st}')
        for b in table: table[b]['file'] = bid_file.get(b)
        manifest['layers']['bldg'] = files
        manifest['buildings'] = {str(b): r for b, r in table.items()}
        bldg_prims = prims
    # ----- tran: split primitives by tran:function so night materials can tell road / sidewalk apart
    if 'tran' in loaded:
        prims, tiles, batches = loaded['tran']
        split = []
        for p in prims:
            bt = batches[p['tile']]
            funcs = np.array([str(f) for f in bt.get('tran:function', [])] or ['?'])
            if p['bid'] is None:
                split.append(p); continue
            tf = funcs[np.clip(p['bid'][p['idx'].reshape(-1, 3)[:, 0]], 0, len(funcs)-1)]
            for f in np.unique(tf):
                q = subset(p, tf == f)
                q['mat_label'] = 'tran_'+TRAN_CLASS.get(f, 'other')
                q['color'] = TRAN_COLOR.get(TRAN_CLASS.get(f, 'other'), [0.5, 0.5, 0.5, 1])
                split.append(q)
        loaded['tran'] = (split, tiles, batches)
        manifest['tran_classes'] = {'tran_'+v: k for k, v in TRAN_CLASS.items()}
    # ----- other layers
    for name in [n for n in layers if n != 'bldg']:
        prims = clip_to_box(loaded[name][0])
        if not prims:
            manifest['layer_notes'][name] = 'no geometry in fetch box'
            continue
        prims = group_by_material(prims)
        n_tex = sum(1 for p in prims if p['tex_key'] in textures.jpeg)
        fn = f'{name}.glb'
        st = write_glb(args.out/fn, prims, textures, False)
        st['textured_primitives'] = n_tex
        manifest['files'][fn] = st
        manifest['layers'][name] = [fn]
        log(f'  {fn}: {st}')
        if n_tex == 0:
            manifest['layer_notes'][name] = 'untextured in source (material colours only)'
        alpha = [textures.alpha[p['tex_key']] for p in prims if p['tex_key'] in textures.alpha]
        if alpha and max(alpha) > 0.01:
            manifest['layer_notes'][name] = (manifest['layer_notes'].get(name, '') + f' source textures have alpha (max transparent fraction {max(alpha):.2f}); flattened to JPEG').strip()
    # ----- terrain
    if 'tran' in loaded:
        tr = clip_to_box(loaded['tran'][0])
        terr, road, Y = terrain(fr, box, tr, h0)
        L.atomic_write(args.out/'terrain.json', json.dumps(terr, ensure_ascii=False, separators=(',', ':')).encode())
        manifest['terrain'] = {'file': 'terrain.json', 'calibration': terr['calibration'], 'source': terr['source'],
                               'y_at_origin': round(float(Y[int(round(-FETCH['z0']/TERRAIN_STEP)), int(round(-FETCH['x0']/TERRAIN_STEP))]), 2),
                               'y_range': [round(float(Y.min()), 2), round(float(Y.max()), 2)]}
        log(f"terrain: {terr['calibration']}")
    # ----- totals / attribution
    manifest['totals'] = {'triangles': sum(f['triangles'] for f in manifest['files'].values()),
                          'texture_bytes': sum(f['texture_bytes'] for f in manifest['files'].values()),
                          'glb_bytes': sum(f['bytes'] for f in manifest['files'].values())}
    tex_src = [v[3:] for v in textures.jpeg.values()]
    manifest['textures_note'] = f'source WebP atlases {len(tex_src)}, max source size {max((max(s) for s in tex_src), default=0)} px; re-encoded JPEG q{JPEG_Q}, downscaled to <= {MAX_TEX} px'
    manifest['extensions_in_source'] = {k: sorted(v) for k, v in ext_used.items()}
    manifest['clip'] = dict(SUGGESTED_CLIP)
    manifest['attribution'] = [ATTR_PLATEAU, ATTR_GSI]
    manifest['license'] = {'PLATEAU': 'PLATEAU site policy (公共データ利用規約 第1.0版 / PDL1.0; compatible with CC BY 4.0) https://www.mlit.go.jp/plateau/site-policy/',
                           'GSI': '国土地理院コンテンツ利用規約 (公共データ利用規約 第1.0版 / PDL1.0 準拠) https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html',
                           'details': 'licenses-photoreal.md'}
    manifest['generated'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    L.atomic_write(args.out/'manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1).encode())
    log('totals', manifest['totals'])
    if 'bldg' in loaded:
        topdown(args.qa/'data-topdown.png', bldg_prims, clip_to_box(loaded['tran'][0]) if 'tran' in loaded else [], table, SUGGESTED_CLIP)
        top = sorted(table.items(), key=lambda kv: -kv[1]['top_y'])[:12]
        for b, r in top:
            log(f"top bid {b}: x {(r['minx']+r['maxx'])/2:.0f} z {(r['minz']+r['maxz'])/2:.0f} top_y {r['top_y']} h {r['height']} st {r['storeys']}/{r['storeysBelow']} {r['usage']} {r['name']} {r['gml_id']}")


if __name__ == '__main__':
    main()
