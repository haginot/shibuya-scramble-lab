from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import sys
import time
import webbrowser
from importlib import resources
from pathlib import Path

from . import DISCLAIMER, __version__
from . import llm as llm_mod
from .model import AREAS, Sim, Town, run_all, toy_econ
from .publication import write_notices

ROWS = [("site_foot_traffic", "区画の通過回数/日"), ("site_unique_people", "区画を通った実人数/日"), ("site_visits", "区画への来訪"), ("site_visits_induced", " うちついで寄り"),
        ("site_dwell_mean", "区画の平均滞在(分)"), ("site_person_minutes", "区画の延べ滞在(人分)"), ("nearby_shop_visits", "周辺150m店舗の来訪"),
        ("other_cafe_visits", "既存カフェの来訪"), ("bike_extra_walk_min_total", "駐輪移転の追加徒歩(延べ分)")]
SROWS = [("agents", "エージェント数"), ("visits_planned", "計画訪問"), ("visits_induced", "ついで寄り"), ("station_area_traversals", "駅周辺の通過"),
         ("boardings", "乗車"), ("alightings", "降車"), ("walk_km_total", "歩行距離km"), ("closed_skips", "営業時間外で断念")]


def _w(s):
    import unicodedata
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def _pad(s, n, right=False):
    s = str(s)
    p = " " * max(0, n - _w(s))
    return p + s if right else s + p


def table(title, cols, rows, data):
    out = [title]
    out.append(_pad("", 28) + "".join(_pad(c, 16, True) for c in cols))
    for key, lab in rows:
        out.append(_pad(lab, 28) + "".join(_pad(d[key], 16, True) for d in data))
    return "\n".join(out)


def build(args):
    planner = None
    mode = "ルールベース（決定的）"
    if not args.no_llm and llm_mod.available():
        planner = llm_mod.LLMPlanner(n_agents=args.llm_agents)
        mode = f"LLM {planner.model}（住民{args.llm_agents}人）＋ルール"
    sim = Sim(town=Town(area=getattr(args, "area", "asagaya")), residents=args.residents, visitors=args.visitors, commuters=args.commuters, llm=planner)
    t0 = time.time()
    res = run_all(sim, seeds=args.seeds, record=args.record)
    el = time.time() - t0
    reviews = []
    if planner is not None:
        reviews = planner.reviews(limit=6)
        if planner.failures:
            mode += f"（失敗{planner.failures}件はルールで代替）"
    T = sim.town
    econ_by_scenario = {"baseline": toy_econ(res["alternatives"])}
    for scenario in ("rain", "event"):
        econ_by_scenario[scenario] = toy_econ({alt: res["scenario_alternatives"][f"{scenario}:{alt}"] for alt in ("bike", "cafe", "plaza")})
    data = dict(center=[T.station["lat"], T.station["lon"]], site=list(T.coord[T.site_node]), seeds=args.seeds,
                agents=args.residents + args.visitors + args.commuters, residents=args.residents, visitors=args.visitors,
                commuters=args.commuters, llm=mode, reviews=reviews, area=sim.town.area, available_areas=[sim.town.area],
                toy_econ=econ_by_scenario["baseline"], toy_econ_by_scenario=econ_by_scenario,
                pois=[dict(id=p.get("id"), name=p["name"], cat=p["cat"], lat=p["lat"], lon=p["lon"]) for p in T.pois + [T.station]], **res)
    return sim, res, data, mode, el, reviews


def render_html(data):
    tpl = resources.files("asagaya_town_sim").joinpath("template.html").read_text(encoding="utf-8")
    return tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"))


def print_report(res, mode, el, args, reviews):
    print(DISCLAIMER)
    print(f"阿佐ケ谷 町シミュレーション v{__version__} / 住民{args.residents} + 電車来訪者{args.visitors} + 通勤者{args.commuters} "
          f"/ {args.seeds}シード平均 / 計画: {mode} / {el:.1f}秒\n")
    S = res["scenarios"]
    print(table("■ シナリオ（町全体・1日）", ["base", "newcafe", "event", "rain"], SROWS, [S[k]["summary"] for k in S]))
    print()
    A = res["alternatives"]
    print(table("■ 駅前の角 3案の比較（同じ住民・同じ乱数）", ["駐輪場維持", "カフェ", "広場"], ROWS, [A[k]["summary"] for k in A]))
    print("\n数値はモデル内の相対比較用です。実際の来店数・売上の予測ではありません。")
    for r in reviews:
        print(f"  LLM口コミ[{r['persona']}] {r['review']}")


WEB3D_DEFAULT = "default"


def write_site(d, html, data):
    """d/ に 3D版(既定) と 2D版を書き出す。3D: d/web3d/<variant>/ が ../data/*.json を読む。"""
    import shutil
    d = Path(d)
    d.mkdir(parents=True, exist_ok=True)
    (d / "2d.html").write_text(html, encoding="utf-8")
    src = resources.files("asagaya_town_sim").joinpath("web3d")
    w = d / "web3d"
    if w.exists():
        shutil.rmtree(w)
    with resources.as_file(src) as sp:
        shutil.copytree(sp, w)
    area = data.get("area", "asagaya")
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (w / "data" / "engine.json").write_text(blob, encoding="utf-8")
    (w / "data" / f"engine_{area}.json").write_text(blob, encoding="utf-8")
    write_notices(d, w / "data")
    (d / "index.html").write_text(f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=web3d/{WEB3D_DEFAULT}/">'
                                  f'<a href="web3d/{WEB3D_DEFAULT}/">3D</a> / <a href="2d.html">2D</a>', encoding="utf-8")
    return d


def serve(html, port, open_browser, data=None):
    d = write_site(Path(os.environ.get("TMPDIR", "/tmp")) / f"asagaya-town-sim-{os.getpid()}", html, data or {})
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(d))
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"Web UI (3D): {url}  （2D版: {url}2d.html / 比較: {url}2d.html#compare）  Ctrl+C で終了", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def promo_main(argv):
    from . import promo
    ap = argparse.ArgumentParser(prog="asagaya-town-sim promo")
    sub = ap.add_subparsers(dest="action", required=True)
    for name in ("demo", "build"):
        p = sub.add_parser(name)
        p.add_argument("--config")
        p.add_argument("--seeds", type=positive_int)
        p.add_argument("--days", type=positive_int)
        p.add_argument("--json", action="store_true")
        p.add_argument("--serve", action="store_true")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--no-open", action="store_true")
        p.add_argument("-o", "--out", default="out-promo")
    args = ap.parse_args(argv)
    try:
        data = promo.simulate(promo.load_config(args.config), seeds=args.seeds, days=args.days)
    except (ValueError, KeyError) as exc:
        ap.error(str(exc))
    if args.json:
        print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    else:
        print(promo.DISCLAIMER)
        print(data["store"]["name"])
        print(f"Seeds: {data['config']['seeds']} · represented residents: {data['config']['population'] * data['config']['agent_scale']}")
        print("Uplift = mean paired visits(combo) - visits(none), common random numbers.")
        print("Anyway = same agent/day/slot baseline overlap / promo visits (pooled across seeds); empty = N/A.")
        print("ROI (channel cost basis, %) = (incremental gross profit - discount cost - channel cost) / channel cost × 100. Break-even = 0%.")
        print("95% intervals: Student t intervals over independent seed results; N/A for one seed or zero-cost ROI.")
        print("組合せ/Combination | 来訪/Visits | 増分/Uplift [95% interval] | 増分% | 元々来訪/Anyway | 増分粗利/Profit ¥ | 割引/Discount ¥ | 全期間チャネル費/Full-period channel cost ¥ | 総費用/Total cost ¥ | 増分利益/Incremental profit ¥ | ROI (channel cost basis, %) [95% interval]")
        def fmt(v):
            return "N/A" if v is None else f"{v:.2f}"
        for name, result in data["combinations"].items():
            m = result["metrics"]
            def interval(key):
                factor = 100 if key == "roi" else 1
                value = m[key]*factor if m[key] is not None else None
                bounds = result['intervals_95'][key]
                return fmt(value) + (f" [{fmt(bounds[0]*factor)}, {fmt(bounds[1]*factor)}]" if bounds else " [N/A]")
            print(" | ".join([name, fmt(m['total_visits']), interval('uplift')] + [fmt(m[k]) for k in ('uplift_pct','would_have_come_anyway_share','incremental_gross_profit','discount_cost','cost','total_cost','incremental_profit')] + [interval('roi')]))
    if args.action == "build" or args.serve:
        directory = Path(args.out) if args.action == "build" else Path(os.environ.get("TMPDIR", "/tmp")) / f"asagaya-promo-{os.getpid()}"
        promo.write_site(directory, data)
        if not args.json:
            print(f"Site: {directory / 'index.html'}")
        if args.serve:
            handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
            with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
                url = f"http://127.0.0.1:{server.server_address[1]}/promo/"
                print(url, file=sys.stderr, flush=True)
                if not args.no_open:
                    webbrowser.open(url)
                try:
                    server.serve_forever()
                except KeyboardInterrupt:
                    pass


def nonnegative_int(value):
    try:
        result = int(value)
        if result >= 0:
            return result
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("must be an integer >= 0")


def positive_int(value):
    result = nonnegative_int(value)
    if result < 1:
        raise argparse.ArgumentTypeError("must be an integer >= 1")
    return result


def main(argv=None):
    effective = list(argv if argv is not None else sys.argv[1:])
    if effective[:1] == ["promo"]:
        return promo_main(effective[1:])
    ap = argparse.ArgumentParser(prog="asagaya-town-sim", description="阿佐ケ谷 AI住民 町シミュレーション（仮説検証用トイモデル。予測ではありません）")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("promo", help="架空店舗の販促トイモデル / fictional store promotion")
    for name, hlp in (("demo", "全シナリオと3案を実行して数値を表示"), ("serve", "Web UIを起動"), ("build", "HTMLとJSONを書き出す")):
        p = sub.add_parser(name, help=hlp)
        p.add_argument("--seeds", type=positive_int, default=5)
        p.add_argument("--area", choices=sorted(AREAS), default="asagaya", help="対象エリア（koenji は実験的）")
        p.add_argument("--residents", type=nonnegative_int, default=400)
        p.add_argument("--visitors", type=nonnegative_int, default=350, help="電車で来る来訪者（外部エージェント）")
        p.add_argument("--commuters", type=nonnegative_int, default=150, help="電車で来る町内勤務者（外部エージェント）")
        p.add_argument("--record", type=nonnegative_int, default=250, help="地図に表示する軌跡の人数")
        p.add_argument("--no-llm", action="store_true", help="OPENAI_API_KEY があってもLLMを使わない")
        p.add_argument("--llm-agents", type=nonnegative_int, default=8)
        p.add_argument("--json", action="store_true", help="指標をJSONで出力")
        p.add_argument("--serve", action="store_true", help="実行後にWeb UIを起動")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--no-open", action="store_true", help="ブラウザを自動で開かない")
        p.add_argument("-o", "--out", default="out", help="build の出力先")
    args = ap.parse_args(argv)
    if not args.cmd:
        args = ap.parse_args(["demo"] + (argv if argv is not None else sys.argv[1:]))
    sim, res, data, mode, el, reviews = build(args)
    if args.json:
        print(json.dumps({g: {k: v["summary"] for k, v in res[g].items()} for g in res}, ensure_ascii=False, indent=1))
    else:
        print_report(res, mode, el, args, reviews)
    html = render_html(data)
    if args.cmd == "build":
        o = Path(args.out)
        o.mkdir(parents=True, exist_ok=True)
        write_site(o, html, data)
        (o / "results.json").write_text(json.dumps({g: {k: v["summary"] for k, v in res[g].items()} for g in res}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n書き出し: {o / 'index.html'}, {o / 'results.json'}")
    if args.cmd == "serve" or args.serve:
        serve(html, args.port, not args.no_open, data)
