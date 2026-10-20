"""阿佐ケ谷 町シミュレーション — 仮説検証用のトイモデル（予測ではありません）。

依存ライブラリなし（標準ライブラリのみ）。地図データ © OpenStreetMap contributors (ODbL)。
"""
from __future__ import annotations

import heapq
import json
import math
import random
from collections import Counter, defaultdict
from importlib import resources

LAT0, LON0 = 35.7047, 139.6358
DAY_START, DAY_END = 5 * 60, 24 * 60
COSLAT = math.cos(math.radians(LAT0))


def dist(a, b):
    dy = (a[0] - b[0]) * 111320.0
    dx = (a[1] - b[1]) * 111320.0 * COSLAT
    return math.hypot(dx, dy)


# ---------------------------------------------------------------- 営業時間
# OSMデータには営業時間がほぼ無いので、カテゴリごとの仮定値を使う（分、[開店, 閉店) の区間リスト）
HOURS = {
    "cafe": [(7 * 60, 21 * 60)],
    "food": [(11 * 60, 15 * 60), (17 * 60, 22 * 60 + 30)],
    "bar": [(17 * 60, 24 * 60)],
    "grocery": [(9 * 60, 22 * 60)],
    "shop": [(10 * 60, 20 * 60)],
    "park": [(5 * 60, 22 * 60)],
    "school": [(7 * 60 + 30, 18 * 60)],
    "clinic": [(9 * 60, 12 * 60 + 30), (14 * 60 + 30, 18 * 60 + 30)],
    "library": [(9 * 60, 20 * 60)],
    "service": [(9 * 60, 17 * 60)],
    "station": [(4 * 60 + 30, 24 * 60)],
    "plaza": [(0, 24 * 60)],
    "event": [(13 * 60, 16 * 60 + 30)],
}


def is_open(poi, t, need=10):
    """t分に到着して少なくとも need 分滞在できるか"""
    for a, b in poi.get("hours") or HOURS.get(poi["cat"], [(0, 24 * 60)]):
        if a <= t and t + need <= b:
            return True
    return False


# 衝動来店（ついで寄り）の基本確率：通りかかった時に寄る確率（1店あたり・1回の通過あたり）
IMPULSE = {"cafe": 0.012, "food": 0.006, "grocery": 0.008, "shop": 0.004, "bar": 0.004, "plaza": 0.02}
IMPULSE_DWELL = {"cafe": 20, "food": 30, "grocery": 8, "shop": 10, "bar": 45, "plaza": 12}
IMPULSE_RADIUS = 30.0  # m


# ---------------------------------------------------------------- 町（地図）
class Town:
    def __init__(self, geojson_path=None):
        if geojson_path:
            gj = json.load(open(geojson_path, encoding="utf-8"))
        else:
            gj = json.loads(resources.files("asagaya_town_sim").joinpath("data/asagaya_osm.geojson").read_text(encoding="utf-8"))
        idx = {}
        self.coord = []
        adj = defaultdict(dict)
        self.streets = []
        pois = []
        for f in gj["features"]:
            p = f["properties"]
            if p.get("kind") == "street":
                cs = f["geometry"]["coordinates"]
                self.streets.append([[round(c[1], 6), round(c[0], 6)] for c in cs])
                ids = []
                for lon, lat in cs:
                    k = (round(lat, 7), round(lon, 7))
                    if k not in idx:
                        idx[k] = len(self.coord)
                        self.coord.append(k)
                    ids.append(idx[k])
                for a, b in zip(ids, ids[1:]):
                    if a != b:
                        L = dist(self.coord[a], self.coord[b])
                        adj[a][b] = L
                        adj[b][a] = L
            elif p.get("kind") == "poi":
                lon, lat = f["geometry"]["coordinates"]
                pois.append(dict(name=p["name"], cat=p["cat"], lat=lat, lon=lon))
        # 最大連結成分のみ
        seen, best = set(), []
        for s in adj:
            if s in seen:
                continue
            comp, st = [], [s]
            seen.add(s)
            while st:
                u = st.pop()
                comp.append(u)
                for v in adj[u]:
                    if v not in seen:
                        seen.add(v)
                        st.append(v)
            if len(comp) > len(best):
                best = comp
        keep = set(best)
        self.adj = {u: {v: L for v, L in adj[u].items() if v in keep} for u in keep}
        self.nodes = sorted(keep)
        # 近傍探索用グリッド（約50m）
        self.grid = defaultdict(list)
        for n in self.nodes:
            self.grid[self._cell(self.coord[n])].append(n)
        self.station = None
        self.pois = []
        for p in pois:
            p["node"] = self.nearest((p["lat"], p["lon"]))
            p["attr"] = 1.0
            if p["cat"] == "station":
                if self.station is None or "阿佐" in p["name"]:
                    self.station = p
                continue
            self.pois.append(p)
        if self.station is None:
            self.station = dict(name="阿佐ケ谷駅", cat="station", lat=LAT0, lon=LON0, node=self.nearest((LAT0, LON0)), attr=1.0)
        self.station["name"] = "JR阿佐ケ谷駅"
        for i, p in enumerate(self.pois):
            p["id"] = i
        sc = (self.station["lat"], self.station["lon"])
        self.home_nodes = [n for n in self.nodes if 60 < dist(self.coord[n], sc) < 420]
        self.station_area = {n for n in self.nodes if dist(self.coord[n], sc) < 120}
        self._trees = {}
        # 評価対象の区画：駅前の角（駅から北東へ約70m）
        self.site_node = self.nearest((self.station["lat"] + 0.0006, self.station["lon"] + 0.0003))
        # 代替の駐輪場（区画の駐輪場を廃止した場合）：駅から約300m
        far = [n for n in self.nodes if 260 < dist(self.coord[n], sc) < 340]
        self.alt_bike_node = min(far, key=lambda n: self.coord[n][0]) if far else self.site_node

    @staticmethod
    def _cell(c):
        return (int(c[0] / 0.00045), int(c[1] / 0.00055))

    def nearest(self, c):
        cx, cy = self._cell(c)
        for r in range(1, 30):
            cand = [n for i in range(cx - r, cx + r + 1) for j in range(cy - r, cy + r + 1) for n in self.grid.get((i, j), ())]
            if cand:
                return min(cand, key=lambda n: dist(self.coord[n], c))
        return min(self.nodes, key=lambda n: dist(self.coord[n], c))

    def near_nodes(self, c, radius):
        return [n for n in self.nodes if dist(self.coord[n], c) <= radius]

    def tree(self, root):
        t = self._trees.get(root)
        if t is None:
            d = {root: 0.0}
            pred = {root: None}
            h = [(0.0, root)]
            adj = self.adj
            while h:
                du, u = heapq.heappop(h)
                if du > d[u]:
                    continue
                for v, L in adj[u].items():
                    nd = du + L
                    if nd < d.get(v, 1e18):
                        d[v] = nd
                        pred[v] = u
                        heapq.heappush(h, (nd, v))
            t = (d, pred)
            self._trees[root] = t
        return t

    def path(self, a, b):
        """a→b のノード列と、各ノードまでの累積距離"""
        if a == b:
            return [a], [0.0]
        d, pred = self.tree(b)
        if a not in d:
            return [a, b], [0.0, dist(self.coord[a], self.coord[b])]
        nodes, cum = [a], [0.0]
        total = d[a]
        u = a
        while u != b:
            u = pred[u]
            nodes.append(u)
            cum.append(total - d[u])
        return nodes, cum


# ---------------------------------------------------------------- 住民の予定（ルール + 確率）
PERSONAS = [("会社員", 0.32), ("子育て世帯", 0.18), ("学生", 0.16), ("高齢者", 0.22), ("在宅ワーカー", 0.12)]


def rule_plan(persona, rnd, sc):
    """[(開始分, カテゴリ, 滞在分)]。 station かつ 滞在>300 は電車で外出（乗車→降車）。"""
    rain = sc.get("rain")
    P = []

    def maybe(pr, t, cat, d):
        if rain and cat == "park":
            pr *= 0.15
        if rain and cat in ("shop", "cafe", "food"):
            pr *= 0.75
        if rnd.random() < pr:
            P.append((t + rnd.randint(-25, 25), cat, d))

    if persona == "会社員":
        maybe(0.35, 7 * 60 + 20, "cafe", 10)
        P.append((7 * 60 + 40 + rnd.randint(0, 50), "station", 600 + rnd.randint(0, 120)))
        maybe(0.45, 19 * 60 + 40, "grocery", 15)
        maybe(0.25, 20 * 60, "bar", 80)
        maybe(0.25, 19 * 60 + 50, "food", 45)
    elif persona == "子育て世帯":
        maybe(0.8, 8 * 60, "school", 5)
        maybe(0.7, 10 * 60, "grocery", 30)
        maybe(0.6, 15 * 60, "school", 5)
        maybe(0.6, 15 * 60 + 20, "park", 50)
        maybe(0.3, 12 * 60, "cafe", 45)
        maybe(0.3, 17 * 60, "shop", 20)
        maybe(0.15, 11 * 60, "station", 360)
    elif persona == "学生":
        P.append((8 * 60 + rnd.randint(0, 60), "station", 420 + rnd.randint(0, 120)))
        maybe(0.45, 17 * 60 + 30, "food", 40)
        maybe(0.35, 18 * 60 + 30, "cafe", 70)
        maybe(0.3, 20 * 60, "shop", 20)
        maybe(0.15, 21 * 60, "bar", 80)
    elif persona == "高齢者":
        maybe(0.7, 6 * 60 + 30, "park", 40)
        maybe(0.5, 9 * 60 + 30, "clinic", 50)
        maybe(0.8, 11 * 60, "grocery", 30)
        maybe(0.35, 14 * 60, "cafe", 50)
        maybe(0.15, 15 * 60, "service", 20)
        maybe(0.1, 10 * 60, "station", 330)
    else:
        maybe(0.6, 10 * 60, "cafe", 140)
        maybe(0.6, 12 * 60 + 30, "food", 45)
        maybe(0.4, 15 * 60, "park", 30)
        maybe(0.5, 18 * 60, "grocery", 20)
        maybe(0.15, 13 * 60, "station", 300)
    if sc.get("event") and persona != "会社員" and rnd.random() < (0.35 if rain else 0.5):
        P.append((rnd.randint(13 * 60, 15 * 60 + 30), "event", rnd.randint(30, 80)))
    if sc.get("site") == "plaza" and persona in ("子育て世帯", "高齢者", "在宅ワーカー") and rnd.random() < (0.05 if rain else 0.18):
        P.append((rnd.randint(9 * 60, 17 * 60), "plaza", rnd.randint(15, 40)))
    P.sort()
    return P


# ---------------------------------------------------------------- 電車の乗降客（外部エージェント）
# 時間帯別の降車人数の形（相対値）。実データではなく、通勤型の駅を想定したもっともらしい形。
ALIGHT_PROFILE = {5: 0.2, 6: 0.6, 7: 1.6, 8: 2.2, 9: 1.3, 10: 0.8, 11: 0.8, 12: 0.9, 13: 0.9, 14: 0.8,
                  15: 0.9, 16: 1.0, 17: 1.4, 18: 1.9, 19: 2.0, 20: 1.4, 21: 1.0, 22: 0.7, 23: 0.4}


def external_plan(kind, rnd, sc):
    """駅で降りてくる外部エージェント。最後は駅に戻って乗車する。"""
    hours = list(ALIGHT_PROFILE)
    w = [ALIGHT_PROFILE[h] for h in hours]
    rain = sc.get("rain")
    if kind == "通勤者":  # 町内の職場へ
        t0 = rnd.randint(7 * 60 + 30, 9 * 60 + 40)
        legs = [(t0, "work", rnd.randint(480, 560))]
        if rnd.random() < 0.3:
            legs.append((12 * 60 + rnd.randint(0, 40), "food", 35))
        if rnd.random() < (0.12 if rain else 0.2):
            legs.append((18 * 60 + 30 + rnd.randint(0, 60), "bar", 90))
        return t0, sorted(legs)
    # 来訪者（買い物・飲食・イベント）
    h = rnd.choices(hours, w)[0]
    if h < 10:
        h = rnd.choice([11, 12, 14, 17, 18, 19])
    t0 = h * 60 + rnd.randint(0, 59)
    legs = []
    cats = ["food", "cafe", "shop", "bar", "grocery"]
    cw = [3, 2, 2, 3 if h >= 17 else 0.5, 1]
    n = 1 + (rnd.random() < 0.45) + (rnd.random() < 0.15)
    t = t0
    for _ in range(n):
        c = rnd.choices(cats, cw)[0]
        legs.append((t, c, {"food": 45, "cafe": 40, "shop": 20, "bar": 90, "grocery": 15}[c]))
        t += 60
    if sc.get("event") and rnd.random() < 0.4 and 12 * 60 <= t0 <= 16 * 60:
        legs.append((max(t0, 13 * 60), "event", rnd.randint(30, 70)))
    return t0, sorted(legs)


# ---------------------------------------------------------------- シナリオ・代替案
SCENARIOS = {
    "baseline": dict(label="ベースライン（駅前の角＝駐輪場のまま）", site="bike"),
    "newcafe": dict(label="(a) 駅前の角に新カフェ", site="cafe"),
    "event": dict(label="(b) 駅前イベント（午後）", site="bike", event=True),
    "rain": dict(label="(c) 雨の日", site="bike", rain=True),
}
ALTERNATIVES = {
    "bike": dict(label="駐輪場を維持", site="bike"),
    "cafe": dict(label="カフェにする", site="cafe"),
    "plaza": dict(label="広場（ベンチ）にする", site="plaza"),
}


class Sim:
    def __init__(self, town=None, residents=400, visitors=350, commuters=150, bike_share=0.35, llm=None):
        self.town = town or Town()
        self.n_res, self.n_vis, self.n_com = residents, visitors, commuters
        self.bike_share = bike_share
        self.llm = llm  # LLMPlanner または None
        T = self.town
        sc = (T.station["lat"], T.station["lon"])
        # 区画のPOI候補
        sn = T.site_node
        self.site_poi = {
            "cafe": dict(id=-1, name="★新カフェ(仮想)", cat="cafe", lat=T.coord[sn][0], lon=T.coord[sn][1], node=sn, attr=3.0,
                         hours=[(7 * 60, 21 * 60)]),
            "plaza": dict(id=-3, name="★駅前広場(仮想)", cat="plaza", lat=T.coord[sn][0], lon=T.coord[sn][1], node=sn, attr=1.0),
        }
        self.event_poi = dict(id=-2, name="★駅前イベント(仮想)", cat="event", lat=sc[0], lon=sc[1], node=T.station["node"], attr=1.0)
        self.site_nodes = set(T.near_nodes(T.coord[sn], 40))
        self.site_vicinity = {p["name"] for p in T.pois if dist((p["lat"], p["lon"]), T.coord[sn]) < 150}
        self.work_pois = [p for p in T.pois if p["cat"] in ("shop", "clinic", "school", "service", "food", "grocery")]
        self._impulse_base = self._impulse_index(T.pois)

    def _impulse_index(self, pois):
        idx = defaultdict(list)
        T = self.town
        for p in pois:
            if p["cat"] in IMPULSE:
                for n in T.near_nodes((p["lat"], p["lon"]), IMPULSE_RADIUS):
                    idx[n].append(p)
        return idx

    # -- 1日分のシミュレーション
    def run(self, sc, seed=0, record=0):
        T = self.town
        rain = bool(sc.get("rain"))
        speed = 65.0 if rain else 78.0  # m/分
        beta = 1 / 120 if rain else 1 / 200
        imp_mult = 0.6 if rain else 1.0
        site = sc.get("site", "bike")
        poilist = list(T.pois)
        imp_idx = self._impulse_base
        extra = []
        if site in self.site_poi:
            sp = self.site_poi[site]
            poilist.append(sp)
            extra.append(sp)
            imp_idx = defaultdict(list, {k: list(v) for k, v in imp_idx.items()})
            for n in T.near_nodes((sp["lat"], sp["lon"]), IMPULSE_RADIUS):
                imp_idx[n].append(sp)
        if sc.get("event"):
            extra.append(self.event_poi)
        bycat = defaultdict(list)
        for p in poilist:
            bycat[p["cat"]].append(p)
        bycat["event"] = [self.event_poi]
        bycat["station"] = [T.station]
        bycat["plaza"] = [self.site_poi["plaza"]] if site == "plaza" else []

        M = dict(visits=Counter(), induced=Counter(), dwell=defaultdict(list), edges=Counter(), walk_m=0.0,
                 board=Counter(), alight=Counter(), site_pass=0, site_minutes=0.0, bike_extra_walk_m=0.0,
                 bike_users=0, closed_skips=0, people=0)
        tracks = []
        names = []

        def choose(cat, frm, t, rnd):
            cands = bycat.get(cat) or bycat["shop"]
            if cat in ("event", "station", "plaza"):
                return cands[0] if cands else None
            c0 = T.coord[frm]
            ok, w = [], []
            for p in cands:
                d = dist(c0, (p["lat"], p["lon"])) * 1.3
                if not is_open(p, t + d / speed, 10):
                    continue
                ok.append(p)
                w.append(math.exp(-beta * d) * p["attr"])
            if not ok:
                M["closed_skips"] += 1
                return None
            return rnd.choices(ok, w)[0]

        def agent_day(start_node, start_t, legs, rnd, end_node, ext, rec, bike):
            cur, t = start_node, float(start_t)
            fr = [] if rec else None
            n_imp = 0
            away = False

            def put(state):
                if fr is not None:
                    c = T.coord[cur]
                    fr.append([int(t), c[0], c[1], state])

            put("在宅" if not ext else "降車")
            for st0, cat, d in legs + [(0, "end", 0)]:
                if st0 > t:
                    t = float(st0)
                    put("在宅" if cur == start_node and not ext else "滞在")
                if t >= DAY_END:
                    break
                if cat == "end":
                    dst, tgt = end_node, None
                elif cat == "work":
                    tgt = rnd.choice(self.work_pois)
                    dst = tgt["node"]
                else:
                    tgt = choose(cat, cur, t, rnd)
                    if tgt is None:
                        continue
                    dst = tgt["node"]
                # 自転車で駅へ（駐輪場→駅は徒歩）
                if bike and tgt is T.station and not away:
                    park = T.site_node if site == "bike" else T.alt_bike_node
                    if site != "bike":
                        base = len(T.path(T.site_node, dst)[0]) and T.path(T.site_node, dst)[1][-1]
                        M["bike_extra_walk_m"] += 2 * max(0.0, T.path(park, dst)[1][-1] - base)
                    M["bike_users"] += 1
                    _, cum = T.path(cur, park)
                    t += cum[-1] / 220.0
                    cur = park
                    put("自転車")
                nodes, cum = T.path(cur, dst)
                seen_imp = set()
                t_start = t
                prev = nodes[0]
                induced_extra = 0.0
                for i, n in enumerate(nodes):
                    if i:
                        e = (prev, n) if prev < n else (n, prev)
                        M["edges"][e] += 1
                        prev = n
                    tn = t_start + cum[i] / speed + induced_extra
                    if n in self.site_nodes and i:
                        M["site_pass"] += 1
                    if n_imp < 2 and n in imp_idx:
                        for p in imp_idx[n]:
                            if p is tgt or p["name"] in seen_imp:
                                continue
                            seen_imp.add(p["name"])
                            pr = IMPULSE[p["cat"]] * p["attr"] * imp_mult
                            if rnd.random() < pr and is_open(p, tn, 5):
                                dd = IMPULSE_DWELL[p["cat"]] * rnd.uniform(0.6, 1.4)
                                M["induced"][p["name"]] += 1
                                M["dwell"][p["cat"]].append(dd)
                                if p.get("id", 0) < 0 and p["cat"] != "event":
                                    M["site_minutes"] += dd
                                induced_extra += dd
                                n_imp += 1
                                if fr is not None:
                                    c = T.coord[n]
                                    fr.append([int(tn), c[0], c[1], "寄り道:" + p["name"]])
                                    fr.append([int(tn + dd), c[0], c[1], "移動"])
                                break
                    if fr is not None and (i % 3 == 0 or i == len(nodes) - 1):
                        c = T.coord[n]
                        fr.append([int(tn), c[0], c[1], "移動"])
                M["walk_m"] += cum[-1]
                t = t_start + cum[-1] / speed + induced_extra
                cur = dst
                if tgt is None:
                    put("降車" if ext else "在宅")
                    continue
                if tgt is T.station:
                    if not ext and d > 120:  # 電車で外出
                        M["board"][int(t // 60)] += 1
                        if fr is not None:
                            c = T.coord[cur]
                            fr.append([int(t), c[0], c[1], "乗車"])
                            fr.append([int(t) + 1, None, None, "外出中"])
                        t += d
                        M["alight"][int(t // 60)] += 1
                        if fr is not None:
                            fr.append([int(t) - 1, None, None, "外出中"])
                            put("降車")
                        if bike and not away:
                            park = T.site_node if site == "bike" else T.alt_bike_node
                            nodes2, cum2 = T.path(cur, park)
                            t += cum2[-1] / speed
                            M["walk_m"] += cum2[-1]
                            cur = park
                            put("自転車")
                            t += T.path(cur, start_node)[1][-1] / 220.0
                            cur = start_node
                            put("在宅")
                        continue
                    continue
                dd = d * (0.85 if rain else 1.0) * rnd.uniform(0.7, 1.3)
                if not is_open(tgt, t, 5):
                    M["closed_skips"] += 1
                    continue
                for a, b in tgt.get("hours") or HOURS.get(tgt["cat"], [(0, 24 * 60)]):
                    if a <= t < b:
                        dd = min(dd, b - t)  # 閉店時刻で退店
                if cat != "work":
                    M["visits"][tgt["name"]] += 1
                    M["dwell"][tgt["cat"]].append(dd)
                    if tgt["node"] == T.site_node and tgt.get("id", 0) < 0:
                        M["site_minutes"] += dd
                put(("勤務:" if cat == "work" else "") + tgt["name"])
                t += dd
                put("滞在")
            if ext and cur == T.station["node"]:
                M["board"][min(23, int(t // 60))] += 1
            if fr is not None:
                put("乗車" if ext else "在宅")
            return fr

        rec_every = max(1, (self.n_res + self.n_vis + self.n_com) // record) if record else 0
        k = 0
        # 住民
        agen = random.Random(seed)
        for i in range(self.n_res):
            persona = agen.choices([p for p, _ in PERSONAS], [w for _, w in PERSONAS])[0]
            home = agen.choice(T.home_nodes)
            far = dist(T.coord[home], (T.station["lat"], T.station["lon"])) > 260
            bike = far and agen.random() < self.bike_share and persona in ("会社員", "学生")
            rnd = random.Random(seed * 1000003 + i * 7919 + 1)
            legs = None
            if self.llm is not None and self.llm.has(i):
                legs = self.llm.plan_for(i, persona, sc)
            if legs is None:
                legs = rule_plan(persona, rnd, sc)
            if rain and bike:
                bike = rnd.random() < 0.4
            rec = bool(rec_every) and k % rec_every == 0
            fr = agent_day(home, DAY_START + 60, legs, rnd, home, False, rec, bike)
            if self.llm is not None and self.llm.has(i) and seed == 0:
                self.llm.note_day(i, persona, sc, legs)
            if rec:
                tracks.append(dict(name=f"住民{i + 1:03d}", kind=persona, llm=bool(self.llm and self.llm.has(i)), f=fr))
            k += 1
        # 外部エージェント（電車の乗降客）
        vis_scale = (0.8 if rain else 1.0) * (1.25 if sc.get("event") else 1.0)
        egen = random.Random(seed + 424242)
        for kind, n in (("来訪者", int(self.n_vis * vis_scale)), ("通勤者", self.n_com)):
            for j in range(n):
                rnd = random.Random(egen.random())
                t0, legs = external_plan(kind, rnd, sc)
                M["alight"][t0 // 60] += 1
                rec = bool(rec_every) and k % rec_every == 0
                fr = agent_day(T.station["node"], t0, legs, rnd, T.station["node"], True, rec, False)
                if rec:
                    tracks.append(dict(name=f"{kind}{j + 1:03d}", kind=kind, llm=False, f=fr))
                k += 1
        M["people"] = k
        M["tracks"] = tracks
        M["extra"] = extra
        return M


def summarize(sim, runs):
    """複数シードの結果を平均して指標にする"""
    T = sim.town
    n = len(runs)
    tot = lambda key: sum(sum(r[key].values()) for r in runs) / n
    cat_of = {p["name"]: p["cat"] for p in T.pois}
    cat_of.update({p["name"]: p["cat"] for p in list(sim.site_poi.values()) + [sim.event_poi]})
    by_cat = Counter()
    for r in runs:
        for k in ("visits", "induced"):
            for nm, v in r[k].items():
                by_cat[cat_of.get(nm, "?")] += v / n
    dwell_all = defaultdict(list)
    for r in runs:
        for c, v in r["dwell"].items():
            dwell_all[c] += v
    site_names = {p["name"] for p in sim.site_poi.values()}
    site_planned = sum(r["visits"][nm] for r in runs for nm in site_names) / n
    site_induced = sum(r["induced"][nm] for r in runs for nm in site_names) / n
    site_vis = site_planned + site_induced
    near_vis = sum(r["visits"][nm] + r["induced"][nm] for r in runs for nm in sim.site_vicinity) / n
    other_cafe = sum(v for r in runs for k in ("visits", "induced") for nm, v in r[k].items() if cat_of.get(nm) == "cafe" and nm not in site_names) / n
    st_area = sum(v for r in runs for e, v in r["edges"].items() if e[0] in T.station_area or e[1] in T.station_area) / n
    top = Counter()
    for r in runs:
        top.update(r["visits"])
        top.update(r["induced"])
    hourly_b = [round(sum(r["board"][h] for r in runs) / n, 1) for h in range(5, 24)]
    hourly_a = [round(sum(r["alight"][h] for r in runs) / n, 1) for h in range(5, 24)]
    return dict(
        seeds=n, agents=round(sum(r["people"] for r in runs) / n),
        visits_planned=round(tot("visits"), 1), visits_induced=round(tot("induced"), 1),
        by_cat={c: round(v, 1) for c, v in sorted(by_cat.items(), key=lambda x: -x[1])},
        dwell_mean={c: round(sum(v) / len(v), 1) for c, v in dwell_all.items() if v},
        walk_km_total=round(sum(r["walk_m"] for r in runs) / n / 1000, 1),
        station_area_traversals=round(st_area, 0),
        boardings=round(sum(hourly_b), 0), alightings=round(sum(hourly_a), 0),
        hourly_board=hourly_b, hourly_alight=hourly_a,
        site_foot_traffic=round(sum(r["site_pass"] for r in runs) / n, 0),
        site_visits=round(site_vis, 1), site_visits_induced=round(site_induced, 1),
        site_dwell_mean=round(sum(r["site_minutes"] for r in runs) / n / site_vis, 1) if site_vis else 0.0,
        site_person_minutes=round(sum(r["site_minutes"] for r in runs) / n, 0),
        nearby_shop_visits=round(near_vis, 1), other_cafe_visits=round(other_cafe, 1),
        bike_users=round(sum(r["bike_users"] for r in runs) / n, 1),
        bike_extra_walk_min_total=round(sum(r["bike_extra_walk_m"] for r in runs) / n / 78.0, 0),
        closed_skips=round(sum(r["closed_skips"] for r in runs) / n, 1),
        top_pois=[(nm, round(v / n, 1)) for nm, v in top.most_common(8)],
    )


def run_all(sim=None, seeds=5, record=200, which=("scenarios", "alternatives"), progress=None):
    sim = sim or Sim()
    out = {"scenarios": {}, "alternatives": {}}
    groups = []
    if "scenarios" in which:
        groups.append(("scenarios", SCENARIOS))
    if "alternatives" in which:
        groups.append(("alternatives", ALTERNATIVES))
    for g, table in groups:
        for key, sc in table.items():
            runs = [sim.run(sc, s, record=record if s == 0 else 0) for s in range(seeds)]
            heat = Counter()
            for r in runs:
                heat.update(r["edges"])
            out[g][key] = dict(label=sc["label"], summary=summarize(sim, runs), tracks=runs[0]["tracks"],
                               extra=[dict(name=p["name"], lat=p["lat"], lon=p["lon"], cat=p["cat"]) for p in runs[0]["extra"]],
                               heat=[[*sim.town.coord[u], *sim.town.coord[v], round(c / seeds, 2)] for (u, v), c in heat.items()])
            if progress:
                progress(g, key)
    return out
