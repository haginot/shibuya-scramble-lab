"""Sync bilingual README tables from existing export_engine / promo build outputs."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def town_table(data, language):
    jp = language == 'ja'
    header = ('案 | 通過（回/日） | 実人数（人/日） | 区画来訪 | 平均滞在（分） | 周辺店舗来訪 | 区画売上 ¥ | 駐輪収入 ¥ | 周辺売上差分 ¥ | 合計（仮定）¥'
              if jp else 'Alternative | Passages/day | People/day | Site visits | Dwell min | Nearby shop visits | Site sales ¥ | Bike fees ¥ | Nearby change ¥ | Assumed total ¥')
    lines = ['| '+header+' |','| --- | '+' | '.join(['---:']*9)+' |']
    for key,label in (('bike','駐輪場' if jp else 'Bike parking'),('cafe','カフェ' if jp else 'Café'),('plaza','広場' if jp else 'Plaza')):
        summary = data['alternatives'][key]['summary']
        econ = data['toy_econ']['alts'][key]
        values = [f'{summary[k]:g}' for k in ('site_foot_traffic','site_unique_people','site_visits','site_dwell_mean','nearby_shop_visits')]
        values += [f'{econ[k]:,}' for k in ('site_sales_yen','bike_fee_yen','nearby_delta_yen','toy_total_yen')]
        lines.append('| '+' | '.join([label]+values)+' |')
    return '\n'.join(lines)


def promo_table(data, language):
    header = ('組合せ | 来訪 | 増分 [95%区間] | 重複来訪 | 割引費 ¥ | チャネル費 ¥ | 総費用 ¥ | 増分利益 ¥ | ROI（チャネル費基準、%）[95%区間]'
              if language == 'ja' else 'Combination | Visits | Uplift [95% interval] | Anyway | Discount ¥ | Channel ¥ | Total cost ¥ | Net gain ¥ | ROI (channel cost basis, %) [95% interval]')
    lines = ['| '+header+' |','| --- | '+' | '.join(['---:']*8)+' |']
    for name,result in data['combinations'].items():
        m = result['metrics']
        def interval(key, factor=1):
            if m[key] is None:
                return 'N/A'
            bounds = result['intervals_95'][key]
            return f'{m[key]*factor:.2f}' + (f' [{bounds[0]*factor:.2f}, {bounds[1]*factor:.2f}]' if bounds else ' [N/A]')
        share = m['would_have_come_anyway_share']
        values = [name, f'{m["total_visits"]:.2f}', interval('uplift'), f'{share*100:.1f}%' if share is not None else 'N/A']
        values += [f'{m[k]:,.0f}' for k in ('discount_cost','cost','total_cost','incremental_profit')]
        values += [interval('roi',100)]
        lines.append('| '+' | '.join(values)+' |')
    return '\n'.join(lines)


def update(check=False):
    town = json.loads((ROOT/'web3d/data/engine.json').read_text())
    promo = json.loads((ROOT/'web3d/data/promo.json').read_text())
    for language,name in (('ja','README.md'),('en','README.en.md')):
        path = ROOT/name
        text = path.read_text()
        for key,table in (('town',town_table(town,language)),('promo',promo_table(promo,language))):
            start,end = f'<!-- {key}-results:start -->',f'<!-- {key}-results:end -->'
            before,remainder = text.split(start,1)
            _,after = remainder.split(end,1)
            text = before+start+'\n'+table+'\n'+end+after
        if check:
            if path.read_text() != text:
                raise SystemExit(f'{name} tables are stale; run python tools/update_readme_tables.py')
        else:
            path.write_text(text,encoding='utf-8')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    update(parser.parse_args().check)
