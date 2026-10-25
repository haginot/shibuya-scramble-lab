"""Series pilot copy (JR編): web3d/shibuya/series/copy-jr.mjs + sources-series.mjs.

- checkCopy() passes, and rejects dropped/unknown fact ids, missing 「シミュレーション」 / 「OSMから概算」 /
  ※パロディ labels, real film titles, brands, banned names, real agencies in the cold open, best-route claims.
- Every fact id agrees with the fact-check verdicts in $LOGS/series/facts-series.json, and every number shown
  (times, minutes, metres, counts, dates) appears in the text of a fact the string cites.
"""
import json
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FACTS_JSON = ROOT.parent / 'logs/ssl-claude-halloween/series/facts-series.json'
MOD = './web3d/shibuya/series/copy-jr.mjs'
SRC = './web3d/shibuya/series/sources-series.mjs'


def _node(body):
    script = (f"const m=await import('{MOD}');const src=await import('{SRC}');"
              f"const out=await (async()=>{{{body}}})();console.log(JSON.stringify(out));")
    res = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True,
                         text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout)


def _mutated(js):
    """Run checkCopy on a JSON clone of COPY after applying the JS mutation `js` (variable C)."""
    return _node(f"const C=JSON.parse(JSON.stringify(m.COPY));{js};return m.checkCopy(C);")


@pytest.fixture(scope='module')
def data():
    return _node("return {errs:m.checkCopy(),strings:m.ALL_STRINGS,facts:src.FACTS,dropped:src.DROPPED,"
                 "sources:src.SOURCES,foot:m.FOOTNOTES,end:m.END_SOURCES,all:m.ALL_FACT_IDS,"
                 "pilot:m.PILOT_SECTIONS,copy:m.COPY,names:Object.fromEntries(m.ALL_FACT_IDS.map("
                 "id=>[id,src.sourceNames([id],'ja')]))};")


def test_self_check_clean(data):
    assert data['errs'] == []


def test_contract_strings(data):
    c = data['copy']
    assert c['TITLE']['main']['ja'] == '🧙ハロウィンの渋谷を脱出せよ！🎃 JR編'
    assert c['TITLE']['sub']['ja'] == '10/31 渋谷からどう帰る？'
    assert c['QUESTION']['line']['ja'] == 'あなたはどの改札から脱出する？'
    assert c['PARODY']['cue']['ja'] == '※パロディ'
    assert '※パロディ' in c['COLD_OPEN']['cue']['ja'] and '架空' in c['COLD_OPEN']['issuer']['ja']
    assert len(c['CHEAT']['gates']) == 4 and len(c['CHEAT']['alt']) >= 3
    assert [s['wp'] for s in c['WALK_A']['steps']] == list(range(1, 10))
    assert '未発表' in c['CHEAT']['status']['ja']


def test_every_string_has_fact_ids_and_sim_label(data):
    for s in data['strings']:
        assert isinstance(s['factIds'], list), s['path']
        if s.get('sim'):
            assert 'シミュレーション' in s['ja'], s['path']
    sims = [s for s in data['strings'] if s.get('sim')]
    assert any(s['path'] == 'TALLY.stamp' for s in sims) and any('{escaped}' in s['ja'] for s in sims)


def test_walk_times_labelled(data):
    by_path = {s['path']: s for s in data['strings']}
    for s in data['strings']:
        if any(data['facts'].get(i, {}).get('osm') for i in s['factIds']) and re.search(r'\d+\s*(分|m)', s['ja']):
            label = by_path.get(s.get('labelBy'), {}).get('ja', '')
            assert 'OSMから概算' in s['ja'] + label, s['path']


def test_footnotes_and_end_card(data):
    for sec in data['pilot']:
        ids = [i for i in data['foot'][sec]['factIds'] if not data['facts'][i].get('na')]
        if ids:
            assert data['foot'][sec]['ja'].startswith('出典：'), sec
            for i in ids:  # every outlet of every fact in the section is named in its footnote
                for name in data['names'][i]:
                    assert name.split(' ')[0] in data['foot'][sec]['ja'], (sec, i, name)
    end = ' '.join(data['end']['ja'])
    for i in data['all']:
        for k in data['facts'][i]['src']:
            s = data['sources'][k]
            assert (s['ja'] if not s.get('osm') else 'OpenStreetMap') in end, (i, k)


@pytest.mark.parametrize('mutation,expect', [
    ("C.TAXI.stand.factIds.push('TAXI-02')", 'dropped fact TAXI-02'),
    ("C.FALLBACK.toilet.factIds.push('TOI-OSM-01')", 'dropped fact TOI-OSM-01'),
    ("C.TAXI.east.factIds.push('NOPE-99')", 'unknown fact NOPE-99'),
    ("C.TALLY.counter.ja='脱出{escaped}人'", '「シミュレーション」'),
    ("C.TAXI.walk.ja='新南改札から約97m・約2分\\n（階段は含まず）'", 'OSMから概算'),
    ("C.BRANCHES.alt[0].walk.ja='原宿まで約20分'", 'OSMから概算'),
    ("C.PARODY.cue.ja='パロディ'", 'PARODY.cue'),
    ("C.COLD_OPEN.cue.ja='本物ではありません'", 'COLD_OPEN cue'),
    ("C.COLD_OPEN.issuer.ja='警視庁（架空）'", 'real agency'),
    ("C.COLD_OPEN.body.ja='イカゲーム開始'", 'forbidden'),
    ("C.COLD_OPEN.body.en='Welcome to the Walking Dead'", 'forbidden'),
    ("C.TAXI.east.ja='スタバの前'", 'forbidden'),
    ("C.MISSION.objective.ja='ゾンビから逃げろ'", 'forbidden'),
    ("C.MISSION.objective.ja='おすすめ改札へ'", 'best route'),
    ("C.CHEAT.head.en='GAME OVER'", 'GAME OVER outside'),
    ("C.FACTS_2026.notAnnounced[2].ja='例：ハチ公改札を\\n16〜23時ごろ一部規制'", 'MEAS-15 needs label 2024年'),
    ("C.TAXI.closure.ja='黒枠区間はタクシーも\\n16時ごろから通行不可'", 'TAXI-06 needs label'),
    ("C.FACTS_2026.notAnnounced[0].ja='JRの2026年の改札規制'", 'NA-JR-2026 needs label'),
    ("C.QUESTION.line.ja='どこから帰る？'", 'QUESTION.line'),
    ("C.RULES.items[0].tip.ja='とても長い注意書きがここに入ってしまうと読めない'", 'too long'),
    ("C.MISSION.objective.ja='脱出せよ2023年'", 'past-year'),
])
def test_check_copy_rejects(mutation, expect):
    errs = _mutated(mutation)
    assert any(expect in e for e in errs), (expect, errs)


def test_check_copy_rejects_banned_names():
    # built from code points so the names never appear in the repository
    names = [''.join(map(chr, [101, 110, 97, 98, 108, 101, 88])), ''.join(map(chr, [0x30AB, 0x30F3, 0x30EA, 0x30FC])),
             ''.join(map(chr, [99, 97, 110, 108, 121])), ''.join(map(chr, [99, 97, 110, 45, 108, 121]))]
    for n in names:
        errs = _mutated(f"C.END_CARD.data.en={json.dumps('by ' + n)}")
        assert any('forbidden' in e for e in errs), n


def _facts_json():
    if not FACTS_JSON.exists():
        pytest.skip('facts-series.json not available')
    return {f['id']: f for f in json.loads(FACTS_JSON.read_text())}


def test_verdicts_match_fact_check(data):
    fj = _facts_json()
    for fid, f in data['facts'].items():
        assert fid in fj, fid
        assert fj[fid]['verdict'] == f['v'], (fid, fj[fid]['verdict'], f['v'])
    for fid, f in fj.items():
        if f['verdict'] == 'dropped':
            assert fid in data['dropped'] and fid not in data['facts'], fid
    for s in data['strings']:
        for i in s['factIds']:
            assert fj[i]['verdict'] in ('verified', 'needs-label'), (s['path'], i)


def _blob(f):
    keys = ('ja', 'en', 'corrected_ja', 'corrected_en', 'quote', 'quote_corrected', 'note', 'url', 'source',
            'source_corrected', 'corroborated_by')
    return ' '.join(json.dumps(f.get(k, ''), ensure_ascii=False) for k in keys)


def test_source_urls_match_fact_check(data):
    fj = _facts_json()
    for fid, f in data['facts'].items():
        if f.get('na'):
            continue
        blob = _blob(fj[fid])
        urls = [data['sources'][k]['url'] for k in f['src']]
        ok = any(u in blob for u in urls)
        ok = ok or any('timetables.jreast.co.jp' in u and u.rsplit('/', 2)[-2] in blob for u in urls)
        ok = ok or (f.get('osm') and 'openstreetmap' in blob)
        assert ok, (fid, urls)
    assert 'tabiris' not in json.dumps(data['sources'])  # JR-GATE-17 re-sourced (2020 plan, not current)


NUM = [re.compile(r'\d{1,2}:\d{2}'), re.compile(r'\d+万\d+'), re.compile(r'\d[\d,]*\s*(?:分|km|m|人|台|時)'),
       re.compile(r'\d{1,2}/\d{1,2}')]


def test_numbers_come_from_cited_facts(data):
    fj = _facts_json()
    checked = 0
    for s in data['strings']:
        if s.get('sim') or not s['factIds']:
            continue
        blob = re.sub(r'[\s,]', '', ' '.join(_blob(fj[i]) for i in s['factIds']))
        text = re.sub(r'\{\w+\}', '', s['ja'])
        for rx in NUM:
            for tok in rx.findall(text):
                tok = re.sub(r'[\s,]', '', tok)
                if tok in ('10/31', '10/25'):
                    continue
                alts = {tok}
                if tok.endswith('時'):
                    alts.add(tok[:-1] + ':00')
                assert any(a in blob for a in alts), (s['path'], tok)
                checked += 1
    assert checked >= 40
