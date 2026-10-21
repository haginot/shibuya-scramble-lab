"""web3d/data/engine*.json を書き出す（3D版の静的デモ用）。python3 tools/export_engine.py [area] [out]"""
import argparse, json, sys
sys.path.insert(0, "src")
from asagaya_town_sim import cli
from asagaya_town_sim.publication import write_notices
from pathlib import Path
area = sys.argv[1] if len(sys.argv) > 1 else "asagaya"
out = sys.argv[2] if len(sys.argv) > 2 else "web3d/data/engine.json"
a = argparse.Namespace(seeds=3, residents=400, visitors=350, commuters=150, record=250, no_llm=True, llm_agents=0, area=area)
_, _, data, *_ = cli.build(a)
data["available_areas"] = ["asagaya", "koenji"]
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(out, json.dumps(data["toy_econ"]["alts"], ensure_ascii=False))

write_notices(Path(out).parent, Path(out).parent)
