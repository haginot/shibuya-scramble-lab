"""Refresh small offline viewer assets; acquisition is a separate explicit step."""
import json
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from asagaya_town_sim import shibuya, promo
from asagaya_town_sim.publication import write_notices

def main():
    src=ROOT/'src/asagaya_town_sim/web3d'
    shutil.copytree(src/'shibuya',ROOT/'web3d/shibuya',dirs_exist_ok=True)
    shutil.copytree(ROOT/'web3d/promo',src/'promo',dirs_exist_ok=True,ignore=shutil.ignore_patterns('verify.mjs'))
    config=shibuya.config()
    for path in (src/'data',ROOT/'web3d/data'):
        (path/'shibuya_config.json').write_text(json.dumps(config,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        (path/'shibuya_calibration.json').write_text(json.dumps(config['calibration'],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        shibuya.promo_assets(path)
    result=promo.simulate(promo.load_config(area='shibuya'))
    for path in (src/'data',ROOT/'web3d/data'):
        (path/'promo_shibuya.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    write_notices(ROOT/'web3d/data',ROOT/'web3d/data')
    print('Shibuya viewer and offline assets refreshed')

if __name__=='__main__':main()
