import json
import os

import pytest

from asagaya_town_sim import cli, llm
from asagaya_town_sim.model import ALTERNATIVES, HOURS, SCENARIOS, Sim, Town, is_open, run_all, summarize


@pytest.fixture(scope="module")
def sim():
    return Sim(residents=150, visitors=120, commuters=50)


def test_town_loads():
    t = Town()
    assert len(t.nodes) > 1000 and len(t.pois) > 500
    assert "阿佐" in t.station["name"]
    assert t.site_node in t.adj


def test_path_is_connected():
    t = Town()
    a, b = t.home_nodes[0], t.station["node"]
    nodes, cum = t.path(a, b)
    assert nodes[0] == a and nodes[-1] == b
    assert all(v in t.adj[u] for u, v in zip(nodes, nodes[1:]))
    assert cum == sorted(cum)


def test_opening_hours():
    assert is_open({"cat": "cafe"}, 8 * 60)
    assert not is_open({"cat": "cafe"}, 22 * 60)
    assert not is_open({"cat": "bar"}, 10 * 60)
    assert not is_open({"cat": "clinic"}, 13 * 60)  # 昼休み
    assert not is_open({"cat": "food"}, 15 * 60 + 30)


def test_deterministic(sim):
    a = summarize(sim, [sim.run(SCENARIOS["baseline"], 3)])
    b = summarize(sim, [sim.run(SCENARIOS["baseline"], 3)])
    assert a == b


def test_agent_scale_and_station_flows(sim):
    r = sim.run(SCENARIOS["baseline"], 0)
    assert r["people"] == 320
    assert sum(r["alight"].values()) > 150 and sum(r["board"].values()) > 150


def test_thousand_agents_fast():
    import time
    s = Sim(residents=500, visitors=350, commuters=150)
    t = time.time()
    r = s.run(SCENARIOS["baseline"], 0)
    assert r["people"] == 1000
    assert time.time() - t < 10


def test_no_visit_outside_hours(sim):
    """訪問は営業時間内のみ（記録用の軌跡で確認）"""
    r = sim.run(SCENARIOS["baseline"], 1, record=320)
    names = {p["name"]: p for p in sim.town.pois}
    for tr in r["tracks"]:
        for t, la, lo, st in tr["f"]:
            nm = st.split(":", 1)[-1]
            if st.startswith("寄り道:") and nm in names:
                assert is_open(names[nm], t, 5), (nm, t)


def test_new_shop_induces_visits(sim):
    runs = [sim.run(ALTERNATIVES["cafe"], s) for s in range(3)]
    s = summarize(sim, runs)
    assert s["site_visits"] > 0
    assert s["site_visits_induced"] > 0
    base = summarize(sim, [sim.run(ALTERNATIVES["bike"], s) for s in range(3)])
    assert base["site_visits"] == 0
    assert s["other_cafe_visits"] < base["other_cafe_visits"]  # 既存カフェとの取り合い
    assert s["bike_extra_walk_min_total"] > base["bike_extra_walk_min_total"] == 0


def test_rain_reduces_activity(sim):
    b = summarize(sim, [sim.run(SCENARIOS["baseline"], s) for s in range(2)])
    r = summarize(sim, [sim.run(SCENARIOS["rain"], s) for s in range(2)])
    assert r["visits_induced"] < b["visits_induced"]
    assert r["by_cat"].get("park", 0) < b["by_cat"].get("park", 0)


def test_event_attracts(sim):
    e = summarize(sim, [sim.run(SCENARIOS["event"], 0)])
    assert e["by_cat"].get("event", 0) > 10


def test_plaza_alternative(sim):
    p = summarize(sim, [sim.run(ALTERNATIVES["plaza"], s) for s in range(2)])
    assert p["site_visits"] > 0 and p["site_dwell_mean"] > 0


def test_llm_zero_config(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert not llm.available()


def test_llm_failure_falls_back(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://127.0.0.1:9")  # 接続不可
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
    p = llm.LLMPlanner(n_agents=2, timeout=1)
    s = Sim(residents=20, visitors=10, commuters=5, llm=p)
    r = s.run(SCENARIOS["baseline"], 0)
    assert r["people"] == 35 and p.failures >= 2


def test_llm_plan_parsing(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
    p = llm.LLMPlanner(n_agents=1)
    monkeypatch.setattr(p, "_chat", lambda prompt: json.dumps({"plan": [
        {"time": "09:00", "category": "cafe", "minutes": 30}, {"time": "25:00", "category": "cafe", "minutes": 5},
        {"time": "12:00", "category": "ufo", "minutes": 5}, {"time": "13:00", "category": "plaza", "minutes": 20}]}))
    assert p.plan_for(0, "学生", SCENARIOS["baseline"]) == [(540, "cafe", 30)]


def test_cli_demo_json(capsys):
    cli.main(["demo", "--seeds", "1", "--residents", "60", "--visitors", "40", "--commuters", "20", "--json", "--no-llm"])
    out = json.loads(capsys.readouterr().out)
    assert set(out["alternatives"]) == {"bike", "cafe", "plaza"}
    assert set(out["scenarios"]) == {"baseline", "newcafe", "event", "rain"}


def test_cli_build_html(tmp_path, capsys):
    cli.main(["build", "--seeds", "1", "--residents", "40", "--visitors", "20", "--commuters", "10", "--no-llm", "-o", str(tmp_path)])
    html = (tmp_path / "2d.html").read_text(encoding="utf-8")
    assert "予測ではありません" in html and "__DATA__" not in html
    assert "予測ではありません" in capsys.readouterr().out


def test_koenji_area_loads():
    t = Town(area="koenji")
    assert "高円寺" in t.station["name"] and len(t.pois) > 300


def test_toy_econ_formula(sim):
    from asagaya_town_sim.model import TOY_SPEND_YEN, toy_econ
    res = run_all(sim, seeds=1, record=0, which=("alternatives",))
    e = toy_econ(res["alternatives"])
    c = res["alternatives"]["cafe"]["summary"]
    assert e["alts"]["cafe"]["site_sales_yen"] == round(c["site_visits"] * TOY_SPEND_YEN["cafe"])
    assert e["alts"]["bike"]["nearby_delta_yen"] == 0
    assert "not" in e["assumptions"]["note"]


def test_build_writes_3d_site(tmp_path):
    cli.main(["build", "--no-llm", "--seeds", "1", "--residents", "60", "--visitors", "40", "--commuters", "20", "--record", "10", "-o", str(tmp_path)])
    assert (tmp_path / "2d.html").exists() and (tmp_path / "index.html").exists()
    w = tmp_path / "web3d"
    assert (w / "vendor" / "three.module.min.js").exists() and (w / "default" / "index.html").exists()
    d = json.loads((w / "data" / "engine.json").read_text(encoding="utf-8"))
    assert "toy_econ" in d and "tracks" in d["alternatives"]["cafe"]
    assert "not a prediction; a toy model for testing hypotheses" in (w / "default" / "index.html").read_text(encoding="utf-8") + "".join(
        p.read_text(encoding="utf-8") for p in (w / "default").glob("*.mjs"))
