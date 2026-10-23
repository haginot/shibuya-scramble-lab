"""v4 escape copy: JP/EN strings fit the 9:16 limits, every fact id is sourced, nothing dropped or banned."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _node(expr):
    script = f"import('./web3d/shibuya/escape-copy.mjs').then(m=>console.log(JSON.stringify({expr})))"
    return json.loads(subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                                     capture_output=True, text=True, timeout=60).stdout)


def test_escape_copy_self_check():
    assert _node('m.checkCopy()') == []


def test_escape_copy_contract():
    got = _node("{ids:m.SCENARIO_IDS,order:m.LEVEL_ORDER,title:m.TITLE,q:m.QUESTION.line,stamps:m.STAMPS,"
                "foot:m.SCENARIO_FOOTNOTES,all:m.ALL_FACT_IDS,mission:m.MISSION.crowdNumber}")
    assert got['ids'] == ['scramble', 'miyashita', 'hikarie', 'stream', 'dogenzaka']
    assert sorted(got['order']) == sorted(got['ids'])
    assert got['title']['main']['ja'] == '🧙ハロウィンの渋谷を脱出せよ！🎃'
    assert got['title']['main']['en'] == 'Escape Shibuya on Halloween!'
    assert got['title']['sub']['ja'] == '10/31 渋谷からどう帰る？' and got['title']['sub']['en'] == 'Oct 31: how to get home'
    assert got['q']['ja'].startswith('あなたならどこから帰る？') and got['q']['en'].startswith('Which way would you go?')
    assert got['stamps']['escaped']['ja'] == '脱出成功！' and got['stamps']['caught']['en'] == 'CAUGHT IN THE CROWD'
    assert got['mission']['factIds'] == ['CROWD-01'] and '18,000' in got['mission']['en']
    assert 'MEAS-14' not in got['all']
    for f in got['foot'].values():
        assert f['ja'].startswith('出典：') and 'シミュレーション' in f['ja'] and 'simulation' in f['en']
    research = ROOT.parent.parent/'logs/ssl-claude-halloween/research-practical.md'
    if research.exists():
        text = research.read_text()
        for fid in got['all']:
            assert f'| {fid} |' in text, fid
