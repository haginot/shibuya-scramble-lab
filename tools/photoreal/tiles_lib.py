"""Helpers for tools/photoreal/fetch_tiles.py: cached HTTP, 3D Tiles 1.0 traversal, b3dm/glb parsing,
Draco decoding, ECEF -> local frame (x east, y up, z south; see web3d/photoreal/CONTRACT.md).

Downloaded files are untrusted data: they are only parsed (JSON / binary), never executed.
"""
from __future__ import annotations

import json
import math
import struct
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

CENTER = (35.65948, 139.70055)  # same as tools/fetch_shibuya.py
A_WGS = 6378137.0
F_WGS = 1/298.257223563
E2 = F_WGS*(2-F_WGS)
UA = 'ssl-photoreal-data/1.0 (research prototype; PLATEAU open data)'


def atomic_write(path: Path, body: bytes):
    temporary = path.with_suffix(path.suffix+'.tmp')
    try:
        temporary.write_bytes(body)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def cache_path(cache: Path, url: str) -> Path:
    p = urllib.parse.urlparse(url)
    rel = (p.netloc+p.path).replace('..', '_')
    return cache/rel


def fetch(url: str, cache: Path, retries=4) -> bytes:
    path = cache_path(cache, url)
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            atomic_write(path, body)
            return body
        except Exception as exc:  # noqa: BLE001
            err = exc
            if getattr(exc, 'code', None) == 404:
                break
            time.sleep(1.5*(attempt+1))
    raise RuntimeError(f'fetch failed {url}: {err}')


# ---------------------------------------------------------------- geodesy
def geodetic_to_ecef(lat, lon, h):
    la, lo = np.radians(lat), np.radians(lon)
    n = A_WGS/np.sqrt(1-E2*np.sin(la)**2)
    return np.stack([(n+h)*np.cos(la)*np.cos(lo), (n+h)*np.cos(la)*np.sin(lo), (n*(1-E2)+h)*np.sin(la)], -1)


def ecef_to_geodetic(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    lon = np.arctan2(y, x)
    r = np.hypot(x, y)
    lat = np.arctan2(z, r*(1-E2))
    for _ in range(6):
        n = A_WGS/np.sqrt(1-E2*np.sin(lat)**2)
        h = r/np.cos(lat)-n
        lat = np.arctan2(z, r*(1-E2*n/(n+h)))
    n = A_WGS/np.sqrt(1-E2*np.sin(lat)**2)
    h = r/np.cos(lat)-n
    return np.degrees(lat), np.degrees(lon), h


class Frame:
    """Local ENU tangent frame at CENTER (ellipsoid height 0); y = up - h0, z = -north."""

    def __init__(self, h0=0.0):
        lat, lon = map(math.radians, CENTER)
        self.o = geodetic_to_ecef(CENTER[0], CENTER[1], 0.0)
        self.R = np.array([[-math.sin(lon), math.cos(lon), 0],
                           [-math.sin(lat)*math.cos(lon), -math.sin(lat)*math.sin(lon), math.cos(lat)],
                           [math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)]])  # rows E,N,U
        self.h0 = h0

    def from_ecef(self, p):
        enu = (np.asarray(p, dtype=np.float64)-self.o) @ self.R.T
        return np.stack([enu[:, 0], enu[:, 2]-self.h0, -enu[:, 1]], -1)

    def dir_from_ecef(self, d):
        enu = np.asarray(d, dtype=np.float64) @ self.R.T
        return np.stack([enu[:, 0], enu[:, 2], -enu[:, 1]], -1)

    def latlon(self, x, z):
        """Approximate inverse for bbox tests (sub-metre at < 1 km)."""
        lat0 = math.radians(CENTER[0])
        m = A_WGS*(1-E2)/(1-E2*math.sin(lat0)**2)**1.5
        n = A_WGS/math.sqrt(1-E2*math.sin(lat0)**2)
        return CENTER[0]+math.degrees(-z/m), CENTER[1]+math.degrees(x/(n*math.cos(lat0)))


# ---------------------------------------------------------------- tilesets
def region_hits(region, box):
    """region [w,s,e,n,hmin,hmax] radians; box (s,w,n,e) degrees."""
    w, s, e, n = map(math.degrees, region[:4])
    return not (e < box[1] or w > box[3] or n < box[0] or s > box[2])


def leaf_contents(tileset_url: str, cache: Path, box, stats=None):
    """Yield absolute content URLs of LEAF tiles (finest REPLACE level) whose region intersects box.
    External tilesets (content .json) are followed."""
    ts = json.loads(fetch(tileset_url, cache))
    out = []

    def walk(t, base):
        bv = t.get('boundingVolume', {})
        if 'region' in bv and not region_hits(bv['region'], box):
            return
        kids = t.get('children') or []
        c = t.get('content')
        if c:
            uri = c.get('uri') or c.get('url')
            absu = urllib.parse.urljoin(base, uri)
            if uri.endswith('.json'):
                sub = json.loads(fetch(absu, cache))
                walk(sub['root'], absu)
                return
            if not kids:
                cbv = c.get('boundingVolume', {})
                if 'region' in cbv and not region_hits(cbv['region'], box):
                    return
                out.append(absu)
        if 'transform' in t and t['transform'] != [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]:
            raise NotImplementedError('tile transform not supported')
        for k in kids:
            walk(k, base)
    walk(ts['root'], tileset_url)
    return ts, out


# ---------------------------------------------------------------- b3dm / glb
CTYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def parse_b3dm(raw: bytes):
    magic = raw[:4]
    if magic == b'glTF':
        return {}, {}, b'', raw
    if magic != b'b3dm':
        raise ValueError(f'not b3dm: {magic!r}')
    _, _, length, ftj, ftb, btj, btb = struct.unpack('<4sIIIIII', raw[:28])
    o = 28
    ft = json.loads(raw[o:o+ftj] or b'{}'); o += ftj
    ftbin = raw[o:o+ftb]; o += ftb
    bt = json.loads(raw[o:o+btj] or b'{}') if btj else {}; o += btj
    btbin = raw[o:o+btb]; o += btb
    if isinstance(ft.get('RTC_CENTER'), dict):
        off = ft['RTC_CENTER']['byteOffset']
        ft['RTC_CENTER'] = list(struct.unpack('<3f', ftbin[off:off+12]))
    # resolve binary batch table properties
    n = ft.get('BATCH_LENGTH', 0)
    for k, v in list(bt.items()):
        if isinstance(v, dict) and 'byteOffset' in v:
            dt = {'FLOAT': np.float32, 'DOUBLE': np.float64, 'INT': np.int32, 'UNSIGNED_INT': np.uint32,
                  'SHORT': np.int16, 'UNSIGNED_SHORT': np.uint16, 'BYTE': np.int8, 'UNSIGNED_BYTE': np.uint8}[v['componentType']]
            nc = NCOMP[v.get('type', 'SCALAR')]
            bt[k] = np.frombuffer(btbin, dt, n*nc, v['byteOffset']).reshape(n, nc).squeeze().tolist()
    return ft, bt, btbin, raw[o:length] if length <= len(raw) else raw[o:]


def parse_glb(glb: bytes):
    magic, ver, length = struct.unpack('<4sII', glb[:12])
    if magic != b'glTF' or ver != 2:
        raise ValueError('glb v2 expected')
    o, js, bin_ = 12, None, b''
    while o < min(length, len(glb)):
        cl, ct = struct.unpack('<II', glb[o:o+8])
        data = glb[o+8:o+8+cl]
        if ct == 0x4E4F534A: js = json.loads(data)
        elif ct == 0x004E4942: bin_ = data
        o += 8+cl
    return js, bin_


def view_bytes(g, binb, bv_idx):
    bv = g['bufferViews'][bv_idx]
    if bv.get('buffer', 0) != 0:
        raise NotImplementedError('external buffers')
    s = bv.get('byteOffset', 0)
    return binb[s:s+bv['byteLength']], bv.get('byteStride')


def read_accessor(g, binb, idx):
    a = g['accessors'][idx]
    dt = CTYPES[a['componentType']]
    nc = NCOMP[a['type']]
    n = a['count']
    if 'bufferView' not in a:
        return np.zeros((n, nc), dt)
    data, stride = view_bytes(g, binb, a['bufferView'])
    off = a.get('byteOffset', 0)
    item = np.dtype(dt).itemsize*nc
    if stride and stride != item:
        arr = np.ndarray((n, nc), dt, data, off, (stride, np.dtype(dt).itemsize))
        arr = arr.copy()
    else:
        arr = np.frombuffer(data, dt, n*nc, off).reshape(n, nc).copy()
    if a.get('normalized') and dt != np.float32:
        arr = arr.astype(np.float32)/np.iinfo(dt).max
    return arr


def mat_of_node(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in n: m = np.diag([*n['scale'], 1.0]) @ m
    if 'rotation' in n:
        x, y, z, w = n['rotation']
        r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                      [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                      [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        rm = np.eye(4); rm[:3, :3] = r; m = rm @ m
    if 'translation' in n:
        t = np.eye(4); t[:3, 3] = n['translation']; m = t @ m
    return m


def decode_primitive(g, binb, prim):
    """Return dict name -> np.array for attributes plus 'indices' (int64, flat)."""
    import DracoPy
    out = {}
    ext = (prim.get('extensions') or {}).get('KHR_draco_mesh_compression')
    if ext:
        data, _ = view_bytes(g, binb, ext['bufferView'])
        mesh = DracoPy.decode(bytes(data))
        out['indices'] = np.asarray(mesh.faces, dtype=np.int64).reshape(-1)
        for name, uid in ext['attributes'].items():
            att = mesh.get_attribute_by_unique_id(uid)
            if att is None: continue
            arr = np.asarray(att['data'])
            acc = g['accessors'][prim['attributes'][name]]
            arr = arr.reshape(acc['count'] if arr.size % acc['count'] == 0 and arr.ndim == 1 else arr.shape[0], -1)
            if acc.get('normalized') and arr.dtype.kind in 'iu':
                arr = arr.astype(np.float32)/np.iinfo(arr.dtype).max
            out[name] = arr
    else:
        for name, idx in prim['attributes'].items():
            out[name] = read_accessor(g, binb, idx)
        if 'indices' in prim:
            out['indices'] = read_accessor(g, binb, prim['indices']).reshape(-1).astype(np.int64)
        else:
            out['indices'] = np.arange(len(out['POSITION']), dtype=np.int64)
    if prim.get('mode', 4) != 4:
        raise NotImplementedError(f"primitive mode {prim.get('mode')}")
    return out


def image_bytes(g, binb, tex_idx, base_url, cache):
    tex = g['textures'][tex_idx]
    src = tex.get('source')
    for ext in ('EXT_texture_webp', 'KHR_texture_basisu', 'EXT_texture_avif'):
        if ext in (tex.get('extensions') or {}):
            src = tex['extensions'][ext]['source']
            break
    if src is None:
        return None, None
    im = g['images'][src]
    if 'bufferView' in im:
        data, _ = view_bytes(g, binb, im['bufferView'])
        return bytes(data), im.get('mimeType')
    uri = im.get('uri')
    if uri and uri.startswith('data:'):
        import base64
        return base64.b64decode(uri.split(',', 1)[1]), uri[5:].split(';')[0]
    if uri:
        return fetch(urllib.parse.urljoin(base_url, uri), cache), None
    return None, None


Y_UP_TO_Z_UP = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=np.float64)


def tile_meshes(raw: bytes, url: str, cache: Path):
    """Yield per-primitive dicts with ECEF float64 positions & normals, uv, batch ids, material info."""
    ft, bt, _, glb = parse_b3dm(raw)
    g, binb = parse_glb(glb)
    rtc = np.array(ft.get('RTC_CENTER') or (g.get('extensions', {}).get('CESIUM_RTC', {}).get('center')) or [0, 0, 0], dtype=np.float64)
    scene = g['scenes'][g.get('scene', 0)]
    prims = []

    def visit(ni, parent):
        node = g['nodes'][ni]
        m = parent @ mat_of_node(node)
        if 'mesh' in node:
            for prim in g['meshes'][node['mesh']]['primitives']:
                d = decode_primitive(g, binb, prim)
                world = Y_UP_TO_Z_UP @ m
                p = d['POSITION'].astype(np.float64)
                p = p @ world[:3, :3].T + world[:3, 3] + rtc
                nrm = None
                if 'NORMAL' in d:
                    nm = np.linalg.inv(world[:3, :3]).T
                    nrm = d['NORMAL'].astype(np.float64) @ nm.T
                bid = None
                for key in ('_BATCHID', '_FEATURE_ID_0', 'BATCHID'):
                    if key in d:
                        bid = d[key].reshape(-1).astype(np.int64); break
                mat = g['materials'][prim['material']] if 'material' in prim and g.get('materials') else {}
                pbr = mat.get('pbrMetallicRoughness', {})
                img = mime = None
                tex_name = None
                if 'baseColorTexture' in pbr:
                    ti = pbr['baseColorTexture']['index']
                    if pbr['baseColorTexture'].get('texCoord', 0) != 0 or 'extensions' in pbr['baseColorTexture']:
                        raise NotImplementedError('texCoord!=0 / texture transform')
                    img, mime = image_bytes(g, binb, ti, url, cache)
                    tex_name = f'{url}#tex{ti}'
                prims.append({'pos': p, 'nrm': nrm, 'uv': d.get('TEXCOORD_0'), 'bid': bid, 'idx': d['indices'],
                              'color': pbr.get('baseColorFactor', [1, 1, 1, 1]), 'img': img, 'mime': mime,
                              'tex_key': tex_name, 'mat_name': mat.get('name'), 'alpha': mat.get('alphaMode', 'OPAQUE'),
                              'double': bool(mat.get('doubleSided'))})
        for c in node.get('children', []):
            visit(c, m)
    for ni in scene['nodes']:
        visit(ni, np.eye(4))
    return ft, bt, g, prims
