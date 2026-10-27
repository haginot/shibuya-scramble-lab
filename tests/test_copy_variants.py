"""JR編 variant copy + scenario configs: web3d/shibuya/series/copy-variants.mjs → variants/jr/*.json.

- The self-check passes and the JSON configs on disk equal the generated ones (edit copy-variants.mjs, then
  `node web3d/shibuya/series/copy-variants.mjs --write`).
- 8 variants (4 pairs), partners share the choice prompt/options, opposite outcomes, durations in budget.
- Fact ids exist (verified / needs-label), dropped ids never appear, and every number shown in a fact-citing
  item appears in the text of a fact it cites ($LOGS/series/facts-series.json + $LOGS/variants/facts-variants.json).
- checkCopy rejects missing 「シミュレーション」 / 「OSMから概算」 / year labels, best-route and 立入禁止 claims,
  death/injury wording, dropped facts, over-long lines and pair mismatches.
"""
import json
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MOD = './web3d/shibuya/series/copy-variants.mjs'
CFG = ROOT / 'web3d/shibuya/series/variants/jr'
LOGS = ROOT.parent / 'logs/ssl-claude-halloween'
IDS = ['gate-over', 'gate-clear', 'zone-over', 'zone-clear', 'alt-over', 'alt-clear', 'taxi-over', 'taxi-clear']


def _node(body):
    script = (f"const m=await import('{MOD}');const src=await import('./web3d/shibuya/series/sources-series.mjs');"
              f"const out=await (async()=>{{{body}}})();console.log(JSON.stringify(out));")
    res = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True,
                         timeout=120)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


@pytest.fixture(scope='module')
def data():
    return _node("const c=await m.buildConfigs();return {errs:m.checkCopy(c),configs:c,facts:src.FACTS,"
                 "dropped:src.DROPPED};")


def test_cli_ok_and_files_in_sync():
    res = subprocess.run(['node', MOD], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert res.returncode == 0, res.stdout + res.stderr
    assert 'copy-variants ok' in res.stdout


def test_self_check_clean(data):
    assert data['errs'] == []


def test_files_match_generated(data):
    for id_, cfg in data['configs'].items():
        on_disk = json.loads((CFG / f'{id_}.json').read_text())
        assert on_disk == cfg, id_


def test_structure(data):
    c = data['configs']
    assert set(IDS) <= set(c) and '_opening' in c
    op = sum(b['dur'] for b in c['_opening']['beats'])
    assert 9 <= op <= 14.5  # fixer 2026-10-26: readable prologue (notice 2.5 s, rules 4.0 s) → 14.2 s
    for pair in ('gate', 'zone', 'alt', 'taxi'):
        a, b = c[pair + '-over'], c[pair + '-clear']
        assert a['outcome'] == 'GAME_OVER' and b['outcome'] == 'CLEAR'
        assert a['choice']['prompt'] == b['choice']['prompt']
        assert [(o['key'], o['ja']) for o in a['choice']['options']] == [(o['key'], o['ja']) for o in b['choice']['options']]
        assert (a['choice']['picked'], b['choice']['picked']) == ('A', 'B')
        for cfg, kind in ((a, 'GAME_OVER'), (b, 'GAME_CLEAR')):
            body = sum(x['dur'] for x in cfg['beats'])
            assert 24 <= body <= 32 and 30 <= body + op <= 45, cfg['id']
            stamps = [h for x in cfg['beats'] for h in x['hud'] if h['c'] == 'stamp']
            assert len(stamps) == 1 and stamps[0]['kind'] == kind and 'シミュレーション' in stamps[0]['ja']
            assert cfg['lesson']['factIds'] and cfg['cheat']['rows'] and cfg['sources']
            assert '架空' in cfg['clock']['ja']


def test_no_dropped_or_unknown_ids(data):
    blob = json.dumps(data['configs'], ensure_ascii=False)
    for bad in ('UNOFF-01', 'TAXI-02', '立入禁止', 'おすすめ', 'GAME OVER'):
        assert bad not in blob, bad
    ids = set(re.findall(r'"factIds": \[([^\]]*)\]', json.dumps(data['configs'])))
    for group in ids:
        for i in re.findall(r'"([^"]+)"', group):
            assert i in data['facts'] and i not in data['dropped'], i


def _facts():
    out = {}
    for f in ('series/facts-series.json', 'variants/facts-variants.json'):
        p = LOGS / f
        if not p.exists():
            pytest.skip(f'{p} not available')
        for x in json.loads(p.read_text()):
            out.setdefault(x['id'], []).append(x)
    v6 = LOGS / 'next/facts-v6.json'  # JR編 v6 end card / mission (optional)
    if v6.exists():
        for x in json.loads(v6.read_text()):
            out.setdefault(x['id'], []).append(x)
    return out


def _blob(entries):
    keys = ('ja', 'en', 'corrected_ja', 'quote', 'quote_corrected', 'note', 'source', 'label')
    return re.sub(r'[\s,]', '', ' '.join(json.dumps(e.get(k, ''), ensure_ascii=False) for e in entries for k in keys))


NUM = [re.compile(r'\d{1,2}:\d{2}'), re.compile(r'\d[\d,]*\s*(?:分|m(?![a-zA-Z])|時)'), re.compile(r'\d{1,2}/\d{1,2}')]
TEXT_KEYS = ('ja', 'sub', 'tip', 'title')


def _items(v):
    if isinstance(v, list):
        for x in v:
            yield from _items(x)
    elif isinstance(v, dict):
        if v.get('factIds') and 'beats' not in v and 'dur' not in v and 'points' not in v:
            yield v
        for k, x in v.items():
            if k not in ('factIds', 'routes'):
                yield from _items(x)


def test_numbers_come_from_cited_facts(data):
    fj = _facts()
    derived = {i: f.get('derived', []) for i, f in data['facts'].items()}
    checked = 0
    for id_, cfg in data['configs'].items():
        items = list(_items(cfg)) + [cfg['lesson']] if 'lesson' in cfg else list(_items(cfg))
        for it in items:
            if it.get('sim') or it.get('c') in ('sim', 'stamp'):
                continue
            ids = list(it['factIds']) + [d for i in it['factIds'] for d in derived.get(i, [])]
            blob = _blob([e for i in ids for e in fj.get(i, [])])
            text = '\n'.join(it[k] for k in TEXT_KEYS if isinstance(it.get(k), str))
            text += '\n'.join(it.get('points', []))
            for rx in NUM:
                for tok in rx.findall(text):
                    tok = re.sub(r'[\s,]', '', tok)
                    if tok in ('10/31', '10/25'):
                        continue
                    alts = {tok}
                    if tok.endswith('時'):
                        alts.add(tok[:-1] + ':00')
                    assert any(a in blob for a in alts), (id_, tok, text)
                    checked += 1
    assert checked >= 40


@pytest.mark.parametrize('mutation,expect', [
    ("C['gate-over'].beats[4].hud[0].ja='人波にのまれた…'", 'シミュレーション'),
    ("C['taxi-clear'].beats[2].hud[0].ja='桜丘町へ\\n約500m・約7分'", 'OSMから概算'),
    ("C['gate-over'].beats[2].hud[0].ja='改札前は一方通行'", 'JR-GATE-03'),
    ("C['zone-over'].choice.options[1].ja='おすすめの道'", 'ルート例'),
    ("C['zone-over'].beats[3].hud[0].ja='赤枠は立入禁止（例：2024年・2023年）'", '立入禁止'),
    ("C['gate-clear'].beats[3].hud[1].ja='南改札は空いている'", '空いている'),
    ("C['alt-over'].beats[4].hud[0].ja='終電で倒れた（シミュレーション）'", 'death/injury'),
    ("C['taxi-over'].beats[3].hud[0].factIds.push('TAXI-02')", 'dropped'),
    ("C['taxi-over'].beats[3].hud[0].factIds.push('NOPE-1')", 'unknown fact'),
    ("C['alt-clear'].choice.prompt.ja='どうする？'", 'prompts differ'),
    ("C['gate-over'].beats[0].hud[0].ja='とても長いミッションの説明文がここに入る'", 'too long'),
    ("C['gate-over'].beats[0].hud[0].ja='ゾンビから逃げろ'", 'forbidden'),
    ("C._opening.beats.find(b=>b.id==='notice').hud[0].issuer='警視庁（架空）'", 'real agency'),
    ("C['zone-clear'].beats[2].hud[1].factIds=['ALT-HARA-H']", '赤枠'),
])
def test_check_rejects(mutation, expect):
    errs = _node(f"const C=await m.buildConfigs();{mutation};return m.checkCopy(C);")
    assert any(expect in e for e in errs), (expect, errs)


# ---------------------------------------------------------------- fixer pass 2026-10-26 (QA findings)
def test_alt_pair_downstream_station_is_the_clear(data):
    """QA 1: the CLEAR walks to 恵比寿 (inner-loop last train 0:50, later than Shibuya's 0:48); the OVER to 原宿 (0:45)."""
    c = data['configs']
    over, clear = c['alt-over'], c['alt-clear']
    res = lambda cfg: next(b for b in cfg['beats'] if b['id'] == 'result')
    assert res(over)['shot']['params']['station'] == 'harajuku' and res(over)['board']['rows'][0]['time'] == '0:45'
    assert res(clear)['shot']['params']['station'] == 'ebisu' and res(clear)['board']['rows'][0]['time'] == '0:50'
    assert 'JR-LAST-14' in clear['sources'] and 'MEAS-12' in over['sources']


def test_zone_pair_sourced_lesson(data):
    """QA 2: no MEAS-15 in the zone pair; the lesson cites the 2026 detour request and the past one-way lanes."""
    for id_ in ('zone-over', 'zone-clear'):
        cfg = data['configs'][id_]
        assert 'MEAS-15' not in cfg['sources']
        assert {'MEAS-25', 'PED-2024', 'NA-PED-2026'} <= set(cfg['lesson']['factIds'])
        move = next(b for b in cfg['beats'] if b['id'] == 'move')
        assert any(h['c'] == 'legend' for h in move['hud'])


def test_prologue_readable_and_regular_timetable(data):
    op = {b['id']: b for b in data['configs']['_opening']['beats']}
    assert op['notice']['dur'] >= 2.5 and op['rules']['dur'] >= 4.0
    tips = [i['tip'] for i in op['rules']['hud'][0]['items']]
    assert any('通常' in t and '0:48' in t for t in tips)


def test_osm_label_enforced_by_validator():
    """QA 10: a computed walk without 「OSMから概算」 is rejected by variant-system validateConfig."""
    out = _node("""
const VS=await import('./web3d/shibuya/series/variant-system.mjs');const {FACTS,DROPPED}=await import('./web3d/shibuya/series/sources-series.mjs');
const fs=await import('node:fs');const cfg=JSON.parse(fs.readFileSync('web3d/shibuya/series/variants/jr/gate-clear.json','utf8'));
const ok=VS.validateConfig(cfg,{part:'body',facts:FACTS,dropped:DROPPED}).errors.length;
const mv=cfg.beats.find(b=>b.id==='move');const cap=mv.hud.find(h=>(h.factIds||[]).includes('GATE-H-S'));cap.ja=cap.ja.replace(/（OSMから概算）/,'');
return {ok,bad:VS.validateConfig(cfg,{part:'body',facts:FACTS,dropped:DROPPED}).errors};""")
    assert out['ok'] == 0 and any('GATE-H-S' in e for e in out['bad'])


def test_no_banned_name_literals_in_tree():
    """QA 7: banned names never appear spelled out in committed source files."""
    cc = lambda *c: ''.join(map(chr, c))
    pat = re.compile('|'.join([cc(101, 110, 97, 98, 108, 101) + r'\s*' + cc(120), cc(0x30AB, 0x30F3, 0x30EA, 0x30FC), cc(99, 97, 110) + '-?' + cc(108, 121)]), re.I)
    bad = [p for d in ('web3d/shibuya', 'tools', 'tests', 'docs') for p in (ROOT / d).rglob('*')
           if p.is_file() and p.suffix in {'.mjs', '.js', '.py', '.md', '.css', '.html', '.sh', '.json'} and pat.search(p.read_text(errors='ignore'))]
    assert not bad, bad
