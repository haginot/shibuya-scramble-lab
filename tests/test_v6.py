"""JR編 v6 「渋谷Halloweenには近づくな」 (series/variant-system.mjs v6 support, tools/v6_configs.mjs, tools/variant_cues.mjs v6
ids, tools/v6_pipeline.py, tools/render_v6.sh, record_variant.py v6 plan range): checks without a browser — the JS modules
run in node; the pipeline helpers run on their pure functions. docs/V6.md."""
import copy
import json
from pathlib import Path
import re
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import record_variant as rv  # noqa: E402
import v6_pipeline as vp  # noqa: E402

CFG_DIR = ROOT/'web3d/shibuya/series/variants/jr'
PAIRS = ['gate', 'taxi', 'zone', 'alt']
COPIED = ['over-start', 'over-choice', 'over-move', 'over-result', 'caught', 'over-stamp', 'over-lesson', 'continue',
          'clear-choice', 'clear-move', 'clear-result', 'clear-stamp', 'clear-cheat', 'kaiju']
ORDER = ['first-choice', 'true-end', 'guide', *COPIED, 'goodbye', 'sources']
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
V6 = {p: load(CFG_DIR/'v6'/f'{p}.json') for p in PAIRS}
V6_OPENING = load(CFG_DIR/'v6'/'_opening.json')
COMBINED = {p: load(CFG_DIR/'combined'/f'{p}.json') for p in PAIRS}
RESHOOT = load(CFG_DIR/'v6'/'_reshoot.json')['items']   # env3d RESHOOT table (notes-env3d.md), imported by the integrator
reshot = lambda pair: [b for b in COPIED if any(r['beat'] == b and r['pair'] in (pair, 'all') for r in RESHOOT)]
SOURCES = {**{i: load(CFG_DIR/f'{i}.json') for p in PAIRS for i in (f'{p}-over', f'{p}-clear')}, **{f'combined/{p}': COMBINED[p] for p in PAIRS}}

# CONTRACT.md GOODBYE end card — verbatim (only line breaks may differ)
GOODBYE_JA = ['GOODBYE BAD HALLOWEEN', '渋谷駅周辺では、条例で飲酒・喫煙、ごみのポイ捨ては禁止されています。', '（渋谷区）',
              '10/30(金)早朝〜11/1(日)朝方　ハチ公像は囲いで観覧不可', '10/30夕方〜11/1早朝　駅周辺で交通規制',
              'いちばんのCLEARは、今年の渋谷に「行かない」こと。', '出典：渋谷区公式X（2026/10/22）・渋谷区・警視庁渋谷警察署　※本編はフィクションです']
GOODBYE_EN = ['Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance.', '(Shibuya City)',
              'Oct 30 early AM – Nov 1 morning: Hachiko statue fenced off', 'Oct 30 evening – Nov 1 early AM: traffic restrictions around the station',
              "The best CLEAR this year: don't go to Shibuya.",
              'Sources: Shibuya City (X, Oct 22, 2026), Shibuya City, MPD Shibuya Police Station. *Story is fiction.']

PRELUDE = ("import * as V from './web3d/shibuya/series/variant-system.mjs';"
           "import {FACTS,DROPPED} from './web3d/shibuya/series/sources-series.mjs';"
           "const OPT={facts:FACTS,dropped:[...DROPPED]};"
           "import fs from 'node:fs';const IN=JSON.parse(fs.readFileSync(0,'utf8'));const out=x=>console.log(JSON.stringify(x));")


def node(body, data=None):
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', PRELUDE+body], input=json.dumps(data or {}), cwd=ROOT, text=True))


def validate(cfg, configs=True):
    return node("out(V.validateConfig(IN.cfg,{...OPT,part:'body',configs:IN.configs}));", {'cfg': cfg, 'configs': SOURCES if configs else None})


def errors_of(cfg):
    return validate(cfg)['errors']


def cli(*args):
    r = subprocess.run(['node', *args], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def flat(s):
    return str(s).replace('\n', '')


def beat(cfg, i):
    return next(b for b in cfg['beats'] if b['id'] == i)


# ---------------------------------------------------------------- configs / validator
def test_generator_reproduces_configs():
    rc, o, e = cli('tools/v6_configs.mjs', '--check')
    assert rc == 0, o+e


@pytest.mark.parametrize('pair', PAIRS)
def test_v6_config_valid(pair):
    v = validate(V6[pair])
    assert v['ok'], v['errors']
    assert [b['id'] for b in V6[pair]['beats']] == ORDER
    assert validate(V6[pair], configs=False)['ok']   # the page validates without the sources


def test_v6_opening_valid_and_mission_replaces_notice():
    v = node("out(V.validateConfig(IN.o,{...OPT,part:'opening'}));", {'o': V6_OPENING})
    assert v['ok'], v['errors']
    assert [b['id'] for b in V6_OPENING['beats']] == ['op-fly', 'op-logo', 'op-press', 'mission', 'rules']
    m = beat(V6_OPENING, 'mission')['hud'][0]
    assert m['c'] == 'mission' and m['card'] and m['ja'].split('\n') == ['渋谷ハロウィンには、近づくな。', 'もう来てしまったなら、安全に脱出せよ。']
    assert m['en'] == "Stay away from Shibuya Halloween. If you're already there, escape safely."
    assert '架空' in m['issuer']
    text = json.dumps(V6_OPENING, ensure_ascii=False)
    assert '会場' not in text and 'notice' not in text


@pytest.mark.parametrize('pair', PAIRS)
def test_video_timeline_75_95(pair):
    rc, o, e = cli('tools/variant_cues.mjs', f'v6/{pair}', '--opening', 'v6/_opening', '--check')
    assert rc == 0, o+e
    r = json.loads(o)
    assert 75 <= r['duration'] <= 95 and r['frames'] == round(r['duration']*30)
    assert r['openingFrames'] == 456 and r['bodyFrames'] == 2190 and r['duration'] == pytest.approx(88.2)


def test_validate_all_cli_and_wrong_opening():
    rc, o, e = cli('tools/variant_cues.mjs', '--validate-v6')
    assert rc == 0, o+e
    rc, o, e = cli('tools/variant_cues.mjs', 'v6/gate', '--opening', '_opening', '--check')
    assert rc == 1 and 'v6 opening' in o


def test_first_choice_true_end_guide():
    for cfg in V6.values():
        fc = beat(cfg, 'first-choice')['hud'][0]
        assert fc['card'] and fc['picked'] == 'A' and fc['prompt']['ja'] == 'まず、どうする？'
        assert [(o['key'], o['ja'], o.get('sub')) for o in fc['options']] == [('A', 'そもそも渋谷に行かない', None), ('B', 'もう渋谷にいる', '仕事・住まい・うっかり来てしまった')]
        te = beat(cfg, 'true-end')
        assert [h['kind'] for h in te['hud'] if h['c'] == 'stamp'] == ['TRUE_END'] and 'crowd' not in te
        assert te['hud'][0]['ja'] == '今年の渋谷ハロウィンには行かない' and te['hud'][0]['kicker'] == 'いちばん安全なクリア'
        g = beat(cfg, 'guide')['hud'][0]
        assert g['c'] == 'guide' and g['hot'] == 'B' and g['ja'] == 'ここからは“もしも”の脱出ガイド' and g['sub'] == 'もう渋谷にいる人（仕事・住まい・うっかり来た人）へ'


def _mut(pair, fn):
    c = copy.deepcopy(V6[pair]); fn(c); return errors_of(c)


def test_validator_rules():
    def pick_b(c): beat(c, 'first-choice')['hud'][0]['picked'] = 'B'
    assert any('must be picked' in e for e in _mut('gate', pick_b))
    def te_elsewhere(c): beat(c, 'guide')['hud'].append({'c': 'stamp', 'kind': 'TRUE_END', 'factIds': []})
    assert any('TRUE_END stamp only in true-end' in e for e in _mut('gate', te_elsewhere))
    def over_in_te(c): beat(c, 'true-end')['hud'][0]['kind'] = 'GAME_OVER'
    errs = _mut('gate', over_in_te)
    assert any('GAME_OVER stamp only in over-stamp' in e for e in errs) and any('kind TRUE_END' in e for e in errs)
    def swap(c): c['beats'][0], c['beats'][1] = c['beats'][1], c['beats'][0]
    assert any('beats must be' in e for e in _mut('gate', swap))
    def no_reuse(c): del beat(c, 'kaiju')['reuse']
    assert any('copied beat needs reuse' in e for e in _mut('gate', no_reuse))
    def bad_src(c): beat(c, 'over-move')['reuse'] = {'variant': 'gate-clear', 'beat': 'move'}
    assert any('must be one of' in e for e in _mut('gate', bad_src))
    def reuse_new(c): beat(c, 'goodbye')['reuse'] = {'variant': 'gate-over', 'beat': 'sources'}
    assert any('new beat cannot have reuse' in e for e in _mut('gate', reuse_new))
    def invite(c): beat(c, 'guide')['hud'][0]['sub'] = 'ハロウィン会場へようこそ'
    assert any('invitation' in e for e in _mut('gate', invite))
    def endcard(c): beat(c, 'sources')['hud'].append({'c': 'endcard', 'ja': 'あなたなら、どう帰る？', 'factIds': []})
    assert any('goodbye' in e for e in _mut('gate', endcard))
    def foot_on(c): beat(c, 'goodbye')['footnote'] = True
    assert any('footnote:false' in e for e in _mut('gate', foot_on))


def test_goodbye_text_verbatim():
    for cfg in V6.values():
        it = beat(cfg, 'goodbye')['hud'][0]
        q, f, o, ft = it['quote'], it['facts'], it['ours'], it['foot']
        assert [flat(q['title']), flat(q['ja']), q['attr'], flat(f[0]['ja']), flat(f[1]['ja']), flat(o['ja']), flat(ft['ja'])] == GOODBYE_JA
        assert [flat(q['en']), q['enAttr'], f[0]['en'], f[1]['en'], o['en'], ft['en']] == GOODBYE_EN
        assert beat(cfg, 'goodbye')['dur'] >= 8 and beat(cfg, 'goodbye')['header'] is False
    # the module constant too, and the HUD default text when the HUD exports one
    G = node("out(V.V6_GOODBYE);")
    assert [G['quote']['title'], G['quote']['ja'], G['quote']['attr'], G['facts'][0]['ja'], G['facts'][1]['ja'], G['ours']['ja'], G['foot']['ja']] == GOODBYE_JA
    hud = node("const m=await import('./web3d/shibuya/series/ui/components.mjs');out(m.GOODBYE_TEXT??null);")
    if hud:
        s = flat(json.dumps(hud, ensure_ascii=False)).replace('\\n', '')
        for line in GOODBYE_JA+GOODBYE_EN: assert line in s or line.replace("'", '’') in s, line


def test_goodbye_text_alterations_rejected():
    def alter(c): beat(c, 'goodbye')['hud'][0]['quote']['ja'] = '渋谷駅周辺では飲酒禁止。'
    assert any('quote.ja' in e for e in _mut('gate', alter))
    def ours(c): beat(c, 'goodbye')['hud'][0]['ours']['ja'] = 'いちばんのCLEARは、今年の渋谷に行くこと。'
    assert any('ours.ja' in e for e in _mut('gate', ours))
    def foot(c): beat(c, 'goodbye')['hud'][0]['facts'][1]['ja'] = '10/31　交通規制'
    assert any('facts[1].ja' in e for e in _mut('gate', foot))


def test_no_stayaway_attributed_to_city():
    # 「来るな」/「行かない」 are OUR words: never in the quoted city block, never in a string naming the city
    def q(c): beat(c, 'goodbye')['hud'][0]['quote']['ja'] = '渋谷には来るな。'
    errs = _mut('gate', q)
    assert any("city's block" in e for e in errs)
    def attr(c): beat(c, 'goodbye')['hud'][0]['ours']['attr'] = '（渋谷区）'
    assert any('no attribution' in e for e in _mut('gate', attr))
    def cap(c): beat(c, 'guide')['hud'][0]['sub'] = '渋谷区「来るな」'
    assert any('next to the city' in e for e in _mut('gate', cap))
    for cfg in [*V6.values(), V6_OPENING]:
        for s in node("out(V.collectStrings(IN.c).map(s=>s.text));", {'c': cfg}):
            assert not (re.search(r'来るな|来ないで|行かない|近づくな', s) and re.search(r'渋谷区|Shibuya City', s)), s
            if '来るな' in s or '来ないで' in s: raise AssertionError(f'「来るな」 wording on screen: {s}')


def test_banned_names_and_wording():
    cc = lambda *c: ''.join(map(chr, c))
    banned = re.compile('|'.join([cc(101, 110, 97, 98, 108, 101)+r'\s*'+cc(120), cc(0x30AB, 0x30F3, 0x30EA, 0x30FC), cc(99, 97, 110)+'-?'+cc(108, 121)]), re.I)
    files = [*(CFG_DIR/'v6').glob('*.json'), ROOT/'tools/v6_configs.mjs', ROOT/'tools/v6_pipeline.py', ROOT/'tools/render_v6.sh']
    for f in files:
        t = f.read_text(encoding='utf-8')
        assert not banned.search(t), f
        assert 'おすすめ' not in t and '巨大な脱出ゲーム会場' not in t, f
    assert not any('パロディ' in json.dumps(b['hud'], ensure_ascii=False) for c in V6.values() for b in c['beats'] if b['id'] != 'sources')


# ---------------------------------------------------------------- reuse map / re-shoot
@pytest.mark.parametrize('pair', PAIRS)
def test_reuse_map(pair):
    rc, o, e = cli('tools/variant_cues.mjs', '--reuse-map', f'v6/{pair}')
    assert rc == 0, e
    m = json.loads(o)
    by = {b['id']: b for b in m['beats']}
    rs = reshot(pair)
    assert [b['id'] for b in m['beats'] if b['mode'] == 'new'] == ['first-choice', 'true-end', 'guide', *rs, 'goodbye', 'sources']
    for i in ('caught', 'over-stamp', 'continue', 'kaiju'):
        if i not in rs: assert by[i]['src']['variant'] == f'combined/{pair}'
    for i in ('over-start', 'over-move', 'over-lesson'):
        if i not in rs: assert by[i]['src']['variant'] == f'{pair}-over'
    want = f'combined/{pair}' if pair in ('zone', 'alt') else f'{pair}-clear'   # the fixed re-shoots of the combined episode
    for i in ('clear-result', 'clear-stamp'):
        if i not in rs: assert by[i]['src']['variant'] == want
    if 'caught' not in rs: assert by['caught']['src']['f0'] == 450
    assert by['kaiju']['src'] == {'variant': f'combined/{pair}', 'beat': 'kaiju', 'f0': 1380, 'f1': 1500}
    assert sum(p['frames'] for p in m['pieces']) == m['frames'] == 2190


def test_opening_reuse_map():
    rc, o, e = cli('tools/variant_cues.mjs', '--reuse-map', 'v6/_opening')
    m = json.loads(o)
    assert [(p['mode'], p['f0'], p['f1'], p['src'] and (p['src']['f0'], p['src']['f1'])) for p in m['pieces']] == \
        [('reuse', 0, 231, (0, 231)), ('new', 231, 336, None), ('reuse', 336, 456, (306, 426))]


@pytest.mark.parametrize('pair', ['gate', 'zone'])
def test_copied_beats_framespec_equals_combined(pair):
    """every copied beat renders exactly like its combined source (shot, params, crowd, clock, vt, HUD items)"""
    r = node("""const O=JSON.parse(require_o);""".replace('require_o', 'JSON.stringify(IN.o)')+"""
      const R=v=>typeof v==='number'?+v.toFixed(4):Array.isArray(v)?v.map(R):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,R(x)])):v;
      const pick=s=>R({shot:s.shot,crowd:s.crowd,clock:s.clock,vt:s.vt,items:s.items,header:s.header,fade:s.fade,beat:s.beat.id,footnote:s.footnote,factIds:s.factIds});
      const Kv=V.videoPlan(IN.ko,IN.k),Nv=V.videoPlan(O,IN.n),res=[];
      for(const id of IN.ids){const kb=Kv.body.beats.find(b=>b.id===id),nb=Nv.body.beats.find(b=>b.id===id);
        for(const u of [0,.37,.99]){const lk=u*kb.dur,a=pick(V.frameSpec(Kv.body,IN.k,kb.t0+lk)),b=pick(V.frameSpec(Nv.body,IN.n,nb.t0+lk));
          if(JSON.stringify(a)!==JSON.stringify(b))res.push({id,u,a,b});}}
      out(res);""", {'o': V6_OPENING, 'ko': load(CFG_DIR/'_opening.json'), 'k': COMBINED[pair], 'n': V6[pair], 'ids': COPIED})
    # re-shot beats (RESHOOT table) differ ONLY by their params / header patch (+ crowd plain:true on a re-shot caught beat)
    rest = []
    for d in r:
        if d['id'] not in reshot(pair): rest.append(d); continue
        a, b = copy.deepcopy(d['a']), copy.deepcopy(d['b'])
        for row in RESHOOT:
            if row['beat'] == d['id'] and row['pair'] in (pair, 'all'):
                for k, v in (row.get('shot') or {}).items(): a['shot'].setdefault('params', {})[k] = v
                for k, v in (row.get('crowd') or {}).items(): a['crowd'].setdefault('params', {})[k] = v
                if row.get('header') and a.get('header') is not False:
                    a['header'] = {**(a['header'] if isinstance(a.get('header'), dict) else {}), **row['header']}
        if d['id'] == 'caught' and a.get('crowd'): a['crowd']['params']['plain'] = True
        if a != b: rest.append(d)
    assert rest == [], rest[:2]


def test_reshoot_generalised():
    """any copied beat can be re-shot: origin instead of reuse, same self-contained beat + params patch → a NEW piece"""
    r = node("""const G=await import('./tools/v6_configs.mjs');
      const c=G.buildV6('gate',{reshoot:[{pair:'gate',beat:'over-move',why:'gate row orientation',shot:{fixA:1}},{pair:'all',beat:'caught',why:'ceiling'}]});
      const m=V.reuseMap(c,IN.src);const v=V.validateConfig(c,{...OPT,part:'body',configs:IN.src});
      out({v,move:c.beats.find(b=>b.id==='over-move'),caught:c.beats.find(b=>b.id==='caught'),new:m.beats.filter(b=>b.mode==='new').map(b=>b.id)});""", {'src': SOURCES})
    assert r['v']['ok'], r['v']['errors']
    assert r['move']['origin'] == {'variant': 'gate-over', 'beat': 'move'} and 'reuse' not in r['move'] and r['move']['shot']['params']['fixA'] == 1
    assert r['move']['fix'] == 'gate row orientation' and r['move']['vt0'] == beat(V6['gate'], 'over-move')['vt0']
    assert r['caught']['origin'] == {'variant': 'combined/gate', 'beat': 'caught'}
    assert r['new'] == ['first-choice', 'true-end', 'guide', 'over-move', 'caught', 'goodbye', 'sources']


def test_reshoot_table_import():
    md = """# notes env3d\n\n## RESHOOT\n| pair | beat | why | shot params |\n|---|---|---|---|\n| gate | over-move | gate row orientation | `{"rows":"ns"}` |\n| zone, alt | clear-move | sign colours | |\n\n## other\n"""
    r = node("const G=await import('./tools/v6_configs.mjs');out(G.parseReshootTable(IN.md));", {'md': md})
    assert r == [{'pair': 'gate', 'beat': 'over-move', 'why': 'gate row orientation', 'shot': {'rows': 'ns'}},
                 {'pair': 'zone', 'beat': 'clear-move', 'why': 'sign colours'}, {'pair': 'alt', 'beat': 'clear-move', 'why': 'sign colours'}]


# ---------------------------------------------------------------- cues
def test_cue_sheet():
    rc, o, e = cli('tools/variant_cues.mjs', 'v6/gate', '--out', '/dev/stdout', '--quiet')
    cues = json.loads(o[:o.rindex('}')+1]) if o.strip().startswith('{') else None
    assert cues and cues['duration'] == pytest.approx(88.2) and cues['meta']['kind'] == 'v6'
    ev = {(e['sfx']) : e['t'] for e in reversed(cues['events'])}
    op = 15.2
    assert ev['mission_in'] == pytest.approx(7.7+.02)
    assert ev['choice_pick'] == pytest.approx(op+3.5)
    assert ev['seal_stamp'] == pytest.approx(op+4.5+.16) and ev['true_end_jingle'] == pytest.approx(op+4.5+.21)
    assert ev['guide_in'] == pytest.approx(op+8.5+.02)
    gb = op+11.5+50
    assert ev['goodbye_in'] == pytest.approx(gb)
    # no comedic stingers over the quoted city text / during the goodbye card
    assert not [e for e in cues['events'] if gb <= e['t'] < gb+8 and e['sfx'] in ('boing', 'end_sting', 'smash_cut', 'kaiju_roar', 'stamp_hit')]
    assert any(b['track'] == 'farewell' and b['t0'] == pytest.approx(gb) for b in cues['bgm'])
    assert [s['name'] for s in cues['segments']] == ['opening', 'body'] and cues['segments'][1]['t0'] == pytest.approx(op)


# ---------------------------------------------------------------- pipeline helpers
def test_chunks_prefers_first_generation_pieces():
    src = {'files': [{'path': 'video.mp4', 'f0': 0, 'f1': 1665, 'off': 426, 'gen': 2},
                     {'path': 'new-0450-0585.mp4', 'f0': 450, 'f1': 585, 'off': 0, 'gen': 1},
                     {'path': 'new-1380-1665.mp4', 'f0': 1380, 'f1': 1665, 'off': 0, 'gen': 1}]}
    assert vp.chunks(src, 450, 585) == [('new-0450-0585.mp4', 0, 135, 1)]
    assert vp.chunks(src, 1380, 1500) == [('new-1380-1665.mp4', 0, 120, 1)]
    assert vp.chunks(src, 500, 700) == [('new-0450-0585.mp4', 50, 135, 1), ('video.mp4', 585+426, 700+426, 2)]


def test_contact_labels_every_beat(tmp_path):
    tl = tmp_path/'tl.json'
    rc, o, e = cli('tools/variant_cues.mjs', 'v6/zone', '--timeline', str(tl), '--quiet')
    assert rc == 0, e
    T = json.loads(tl.read_text())
    T['parts']['body']['beats'][[b['id'] for b in T['parts']['body']['beats']].index('over-move')]['origin'] = 'zone-over/move'
    labs = ' | '.join(l for _, l in vp.contact_times(T))
    for want in ('MISSION', 'first choice', 'A picked', 'TRUE END stamp', 'guide', 'caught: press', 'caught: black', 'GAME OVER on black',
                 'CONTINUE? 3', 'CONTINUE? YES', 'CLEAR stamp', 'kaiju roar', 'GOODBYE full', 'GOODBYE end', 'sources', 'RE-SHOT over-move', 'PRESS START', 'logo slam'):
        assert want in labs, want
    ts = [t for t, _ in vp.contact_times(T)]
    assert ts == sorted(ts) and max(ts) < T['duration']


def test_recorder_v6_plan_range_and_stamp_id():
    assert rv.V6_RANGE == (75, 95) and rv.STAMP_OF['TRUE_END'] == 'trueend'
    beats = [{'id': 'a', 'f0': 0, 'f1': 2190, 't0': 0, 't1': 73, 'hud': ['cheat', 'stamp:TRUE_END'], 'stamps': ['TRUE_END']}]
    plan = {'fps': 30, 'frames': 2190, 'duration': 73, 'beats': beats, 'part': 'body', 'variant': 'v6/gate', 'id': 'v6-gate', 'videoDuration': 88.2}
    rv.check_plan(plan)
    with pytest.raises(AssertionError): rv.check_plan({**plan, 'videoDuration': 70})


def test_render_v6_script_contract():
    s = (ROOT/'tools/render_v6.sh').read_text()
    assert 'flock "$LOCK"' in s and 'SEG_FRAMES must be ≤ 300' in s and 'jr-v6' in s and 'next/render' in s.replace('$L/render', 'next/render')
    assert 'CAP=45*60' in s and 'MAX_SEGS' in s and 'SMOKE' in s
    for cmd in ('check)', 'plan)', 'stills)', 'contact)', 'all)'): assert cmd in s


def test_endcard_sources_and_goodbye_citation():
    for cfg in V6.values():
        assert {'END-01', 'END-02', 'END-03'} <= set(cfg['sources'])
        # the goodbye card cites through its own footer (page footnote off) → its items carry no claims
        g = beat(cfg, 'goodbye')
        assert g['footnote'] is False and all(not h.get('factIds') for h in g['hud'])
        for i in ('first-choice', 'true-end', 'guide'):   # our message: never city sources
            assert not any(str(x).startswith('END-') for h in beat(cfg, i)['hud'] for x in h.get('factIds') or [])


def test_reshot_caught_uses_plain_crowd():
    r = node("const G=await import('./tools/v6_configs.mjs');const c=G.buildV6('taxi',{reshoot:[{pair:'taxi',beat:'caught',why:'x'}]});out(c.beats.find(b=>b.id==='caught'));")
    assert r['crowd']['params']['plain'] is True and r['origin']['variant'] == 'combined/taxi'
    assert 'plain' not in beat(V6['taxi'], 'caught')['crowd']['params']   # reused: unchanged


def test_recorder_mission_fiction_and_sources_card_self_cites():
    """integrator: the mission card needs the 「フィクション」 tag (it replaces the notice); a sources card with the page
    footnote off cites through its own rows + credit line"""
    facts = rv.fact_table()
    base = {'t': 1.0, 'strings': [], 'items': [], 'claims': [], 'footnote': {'ids': [], 'text': ''}, 'stamps': [], 'allowedStamps': []}
    with pytest.raises(AssertionError, match='mission card'):
        rv.check_frame({**base, 'items': ['mission'], 'mission': {'lines': 2}}, facts=facts)
    rv.check_frame({**base, 'items': ['mission'], 'mission': {'lines': 2}, 'fiction': True, 'strings': ['フィクション']}, facts=facts)
    src = {**base, 'items': ['sources'], 'parodyNote': True, 'strings': ['※パロディ・フィクションです'], 'claims': ['END-01', 'CROWD-01']}
    with pytest.raises(AssertionError, match='claims without a footnote'):
        rv.check_frame(src, facts=facts)
    rv.check_frame({**src, 'credit': True}, facts=facts)
    assert all(beat(V6[p], 'sources')['footnote'] is False for p in PAIRS)
