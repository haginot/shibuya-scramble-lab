"""JR v11.1: the fact-check fixes of 2026-10-29 (logs/ssl-claude-halloween/v11.1/brief.md,
demos/halloween-escape-series/factcheck-2026-10-29.md) in JP and EN, the strict no-Japanese-in-EN check (DOM text, CSS
generated content, canvas text of the 3D signage), the one EN title, and the deliverables (skipped until rendered)."""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
SER = ROOT/'web3d/shibuya/series'
V10 = SER/'variants/jr/v10'
EN = json.loads((SER/'i18n/en.json').read_text(encoding='utf-8'))['exact']
G10 = json.loads((V10/'ghost.json').read_text(encoding='utf-8'))
GEN = json.loads((SER/'variants/jr/v11en/ghost.json').read_text(encoding='utf-8'))
PAIRS = ('gate', 'taxi', 'zone', 'alt')
CFG = {p: json.loads((V10/f'{p}.json').read_text(encoding='utf-8')) for p in PAIRS}
LOGS = Path('/workspace/projects/logs/ssl-claude-halloween/v11.1')
OUT = Path('/workspace/demos/halloween-escape-series/jr-v11.1')
CJK = re.compile(r'[　-ヿ㐀-鿿＀-￯]')
TITLE = 'ESCAPE FROM HALLOWEEN SHIBUYA!'


def strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in ('v10', 'v111', 'generated', 'fix', 'origin'): yield from strings(v)
    elif isinstance(o, list):
        for v in o: yield from strings(v)


def beat(pair, bid): return next(b for b in CFG[pair]['beats'] if b['id'] == bid)
def ghost(data, pair, bid): return [l for l in data['pairs'][pair]['lines'] if l['beat'] == bid]
def en(ja): return EN[ja]


# ---- A: the Hachiko statue enclosure ends 「11/1まで（予定）」 (ward: 11/1 morning, may change; news: ~17:00)
@pytest.mark.parametrize('pair', PAIRS)
def test_end_card_enclosure_until_nov1_planned(pair):
    f = beat(pair, 'goodbye')['hud'][0]['facts'][0]
    assert f['ja'] == '10/30(金)早朝〜11/1(日)まで（予定）　ハチ公像は囲いで観覧不可'
    assert '10/30(金)早朝' in f['ja'] and 'until Nov 1 (planned)' in f['en']
    assert 'until Nov 1' in en(f['ja']) and '(planned)' in en(f['ja']) and 'early AM' in en(f['ja'])
    assert not any('朝方' in s for s in strings(CFG[pair]))
    assert not any('Nov 1 (Sun) morning' in v or 'Nov 1 morning' in v for v in EN.values())


# ---- B: the U-turn into the Hachiko gate is the normal-day route; on the night follow the staff
def test_uturn_is_the_normal_day_route():
    cap = beat('gate', 'over-move')['hud'][0]
    assert cap['ja'].startswith('ハチ公口の広場、改札待ちの列\n') and '平常時の動線' in cap['ja'] and '当日は係員の指示に従う' in cap['ja']
    assert 'Normal-day route' in en(cap['ja']) and 'On the night, follow staff directions' in en(cap['ja'])
    assert cap['factIds'] == ['JR-GATE-03', 'JR-GATE-18']
    # every U-turn string on screen says it is the normal-day flow
    for s in strings(CFG['gate']):
        if 'Uターン' in s and s != CFG['gate']['lesson'].get('summary'): assert '平常時' in s, s
    for v in EN.values():
        if 'U-turn' in v: assert 'Normal' in v or 'normal' in v, v
    # the 2024 day-of closure (shibukei 18753 = MEAS-15) + 2026 not announced, sourced
    res = beat('gate', 'over-result')['hud'][1]
    assert '2024年' in res['ja'] and '通り抜け不可' in res['ja'] and '未発表' in res['ja'] and res['factIds'] == ['MEAS-15', 'NA-JR-2026']
    assert '2024' in en(res['ja']) and 'not announced' in en(res['ja'])
    src = (SER/'sources-series.mjs').read_text(encoding='utf-8')
    assert re.search(r"'MEAS-15':F\(\['shibukei2024'\]", src)
    assert '18753' in (ROOT/'web3d/shibuya/sources-halloween.mjs').read_text(encoding='utf-8')
    # ghost: JP 「ふだんは…／当日は係員の指示に従ってね」, EN "Normal days … Follow staff"
    (g,) = ghost(G10, 'gate', 'over-move')
    assert 'ふだん' in g['text'] and '係員の指示に従って' in g['text']
    (e,) = ghost(GEN, 'gate', 'over-move')
    assert 'Normal days' in e['text'] and 'staff' in e['text'].lower()


# ---- C: 2026 closures are for vehicles; walkers stop for the crowd and the staff guidance
BLOCKED_JA = ('規制で前に進めない', 'しかも規制あり', '規制で\n前に進めない', '規制の可能性')
BLOCKED_EN = ('closures block', 'closures\nblock', 'plus closures', 'may be closed', "can't get through")


def test_zone_walkers_not_blocked_by_closures():
    zone = list(strings(CFG['zone']))+[l['text'] for l in G10['pairs']['zone']['lines']]
    assert not [s for s in zone if any(b in s for b in BLOCKED_JA)]
    en_txt = [en(s) for s in strings(CFG['zone']) if s in EN]+[l['text'] for l in GEN['pairs']['zone']['lines']]+list(EN.values())
    assert not [s for s in en_txt if any(b in s.lower() for b in BLOCKED_EN)]
    assert '車両' in beat('zone', 'over-result')['hud'][0]['ja'] and '混雑' in beat('zone', 'over-result')['hud'][2]['ja']
    assert '車両規制' in beat('zone', 'retry-why')['hud'][1]['ja'] and '車両規制' in beat('zone', 'retry-why')['why']['text']
    assert '赤枠＝車両の検問・規制エリア\n（2026年・規制図より概略）' in list(strings(CFG['zone']))   # the red-frame caption is unchanged
    for bid in ('over-result', 'retry-why', 'over-lesson'):
        (g,) = ghost(G10, 'zone', bid)
        assert '規制' not in g['text'], g['text']
    assert '混雑と誘導' in ghost(G10, 'zone', 'over-result')[0]['text']
    # the sim panel's ruled-out row (zone A): the reason is the crowd, not a closure
    for f in ('plan', 'retry'):
        txt = (SER/f'variants/jr/v8/sim/{f}.json').read_text(encoding='utf-8')
        assert '規制の可能性' not in txt and '混雑する赤枠内を長く歩く' in txt
    assert en('混雑する赤枠内を長く歩く') == 'long walk in the packed red zone'


# ---- D: the last inner-loop trains end at Osaki
def test_alt_inner_loop_to_osaki():
    m = beat('alt', 'over-start')['hud'][0]
    assert '大崎行き' in m['ja'] and '品川方面へ帰れ' not in m['ja'] and 'to Osaki' in en(m['ja'])
    assert '大崎行き' in beat('alt', 'over-start')['hud'][1]['ja'] and 'JR-LAST-02' in beat('alt', 'over-start')['hud'][1]['factIds']
    assert '大崎' in CFG['alt']['cheat']['rows'][0]['sec'] and '品川方面）' not in CFG['alt']['cheat']['rows'][0]['sec']
    assert not [s for p in PAIRS for s in strings(CFG[p]) if '品川方面へ' in s]
    assert not [v for v in EN.values() if 'home toward Shinagawa' in v or 'inner (to Shinagawa)' in v]
    # times unchanged (JR timetable, normal weekend): Shibuya 0:48, Harajuku 0:45, Ebisu 0:50
    s = ' '.join(strings(CFG['alt']))
    assert '0:48' in s and '0:45' in s and '0:50' in s


# ---- EN: no Japanese anywhere in the EN output
def test_en_css_generated_content_has_en_override():
    """every CSS `content:` with CJK (invisible to innerText) has a body.lang-en rule with ASCII content (v11-en: 「スコア」)."""
    css = re.sub(r'/\*.*?\*/', '', (SER/'ui/hud.css').read_text(encoding='utf-8'), flags=re.S)
    rules = re.findall(r'([^{}]+)\{([^{}]*)\}', css)
    for sel, body in rules:
        m = re.search(r'content:\s*"([^"]*)"', body)
        if not m or not CJK.search(m[1]): continue
        assert not sel.strip().startswith('body.lang-en'), sel
        over = [(s2, b2) for s2, b2 in rules if s2.strip() == 'body.lang-en '+sel.strip()]
        assert over and not CJK.search(over[0][1]) and 'content' in over[0][1], sel
    assert 'body.lang-en #gh .gh-simp .sc::before{content:"Score "}' in css


def test_en_fit_checks_cover_css_and_canvas():
    comp = (SER/'ui/components.mjs').read_text(encoding='utf-8')
    assert "getComputedStyle(e,ps).content" in comp and "['::before','::after']" in comp
    app = (SER/'app-variant.mjs').read_text(encoding='utf-8')
    assert 'window.__cjkCanvas' in app and "'fillText','strokeText'" in app and 'canvas:[...(window.__cjkCanvas' in app
    import record_variant as RV
    assert RV.EN_CJK_ALLOW == frozenset()      # allowlist (docs/V11.1.md): empty
    rec = {'t': 1.0, 'beat': 'x', 'part': 'body', 'fit': {'cjk': [], 'wraps': [], 'over': [], 'canvas': ['休止中']}}
    with pytest.raises(AssertionError, match='canvas'): RV.check_en_hard(rec, 1.0, rec['fit'])
    rec['fit'] = {'cjk': ['css::before:"スコア "'], 'wraps': [], 'over': [], 'canvas': []}
    with pytest.raises(AssertionError, match='CJK'): RV.check_en_hard(rec, 1.0, rec['fit'])
    rec['fit'] = {'cjk': [], 'wraps': [], 'over': [], 'canvas': []}
    RV.check_en_hard(rec, 1.0, rec['fit'])


def test_en_signage_tables():
    """the EN in-world signs: every JP sign word has an English entry without CJK (city neon words, taxi / board signs)."""
    city = (ROOT/'web3d/shibuya/city.mjs').read_text(encoding='utf-8')
    node = ("import('./web3d/shibuya/city.mjs').catch(()=>null);const s=require('fs').readFileSync('web3d/shibuya/city.mjs','utf8');"
            "const W=eval('('+/const WORDS=(\\{[^;]*\\});/.exec(s)[1]+')'),E=eval('('+/const WORDS_EN=(\\{[^;]*\\});/.exec(s)[1]+')');"
            "const miss=[...new Set(Object.values(W).flat())].filter(w=>/[^A-Z0-9]/.test(w)&&!E[w]);console.log(JSON.stringify({miss,vals:Object.values(E)}))")
    r = json.loads(subprocess.run(['node', '-e', node], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    assert r['miss'] == [] and not [v for v in r['vals'] if CJK.search(v) or not re.fullmatch(r'[A-Z0-9]+', v)]
    assert "EN_PAGE()?['SHIBUYA','TYO']" in city
    sets = (SER/'sets-variants.mjs').read_text(encoding='utf-8')
    tbl = re.search(r'const SIGN_EN=Object\.freeze\(\{(.*?)\}\);', sets, re.S)[1]
    pairs = re.findall(r"'([^']+)':'([^']+)'", tbl)
    assert pairs and all(CJK.search(k) and not CJK.search(v) for k, v in pairs)
    boards = {s for p in PAIRS for b in CFG[p]['beats'] for s in strings(b.get('board') or b.get('shot', {}).get('params', {}).get('baseParams', {}).get('board') or {})}
    assert boards and boards <= {k for k, _ in pairs} | {'0:45', '0:50', ''}, boards-{k for k, _ in pairs}


def _en_logs():
    return sorted((LOGS/'render-en').rglob('*.jsonl')) if (LOGS/'render-en').exists() else []


@pytest.mark.skipif(not _en_logs(), reason='no v11.1 EN renders / probes yet')
def test_en_render_logs_have_no_cjk():
    """every EN frame the v11.1 recorder rendered (CG, HUD, probes): DOM + CSS text and the page's canvas text without CJK."""
    n = 0
    for f in _en_logs():
        for line in f.open(encoding='utf-8'):
            r = json.loads(line); fit = r.get('fit')
            if fit is None: continue
            n += 1
            assert not fit['cjk'], (f, r['frame'], fit['cjk'][:3])
            assert 'canvas' in fit and not fit['canvas'], (f, r['frame'], fit.get('canvas'))
            assert not [w for w in fit['wraps'] if w['c'] not in {'footnote', 'sources', 'simpanel'}], (f, r['frame'], fit['wraps'][:2])
            assert not fit['over'], (f, r['frame'], fit['over'][:2])
    assert n > 1000


def _ja_logs():
    return sorted((LOGS/'render-ja').rglob('*.jsonl')) if (LOGS/'render-ja').exists() else []


@pytest.mark.skipif(not _ja_logs(), reason='no v11.1 JP renders yet')
def test_ja_rebuilt_beats_fit():
    """the rebuilt JP beats (V111_FIT=1): no automatic wrap outside the paragraph boxes, no overflow (incl. the JP end card's
    English sub-line under the city quote, goodbye-quote .qe: one line since v11.1)."""
    n = 0
    for f in _ja_logs():
        for line in f.open(encoding='utf-8'):
            r = json.loads(line); fit = r.get('fit')
            if fit is None: continue
            n += 1
            assert not [w for w in fit['wraps'] if w['c'] not in {'footnote', 'sources', 'simpanel'}], (f, r['frame'], fit['wraps'][:2])
            assert not fit['over'], (f, r['frame'], fit['over'][:2])
    assert n > 100


# ---- EN title: one title everywhere (= the 3D logo glyphs)
def test_en_title_unified():
    logo = json.loads((ROOT/'web3d/data/logo_glyphs_en.json').read_text(encoding='utf-8'))
    assert logo['text']['title'] == TITLE == EN['ハロウィンの渋谷を脱出せよ！']
    assert not [v for v in EN.values() if re.search(r'ESCAPE\s+HALLOWEEN', v)]
    for f in (ROOT/'docs/V11.1.md', OUT/'v11.1.md'):
        if f.exists(): assert TITLE in f.read_text(encoding='utf-8')


# ---- deliverables
@pytest.mark.parametrize('lang', ('ja', 'en'))
@pytest.mark.parametrize('pair', PAIRS)
def test_deliverables(lang, pair):
    d = OUT/lang; s = d/f'{pair}-share.mp4'
    if not s.exists(): pytest.skip('not rendered yet')
    rep = json.loads((LOGS/('render-ja' if lang == 'ja' else 'render-en')/pair/'report.json').read_text(encoding='utf-8'))
    assert rep['ok'] and rep['duration'] == pytest.approx(121.7, abs=.05) and -15 <= rep['lufs'] <= -13 and rep['true_peak'] <= -1.0
    assert s.stat().st_size < 200*2**20 and (d/f'{pair}.mp4').exists() and (d/f'{pair}-contact.jpg').exists()


def test_goodbye_quote_en_one_line():
    """JP end card: the EN sub-line under the city quote is the short v11.1 rendering and is set not to wrap."""
    for p in PAIRS:
        g = beat(p, 'goodbye')['hud'][0]
        assert g['quote']['en'] == 'Near Shibuya Sta.: drinking, smoking, littering banned by ordinance.'
    css = (ROOT/'web3d/shibuya/series/ui/hud.css').read_text(encoding='utf-8')
    assert '#gh .gb-q .qe{margin-top:8px;font:500 14.5px/1.4 var(--gh-f-body);color:#C2C2CC;white-space:nowrap}' in css


def test_en_header_title_fits_the_frame():
    """the one EN title is set smaller in EN (it ran to x=727 of 720 at 27 px and #gh clipped the '!'), and the fit check
    tests the frame edge for every host that is not sliding (translated) — v11-en skipped hosts that crossed the edge."""
    css = (SER/'ui/hud.css').read_text(encoding='utf-8')
    assert 'body.lang-en #gh .gh-head .l1{font-size:22.5px}' in css
    comp = (SER/'ui/components.mjs').read_text(encoding='utf-8')
    assert 'settled=!hb||(hb.left>=-1&&hb.right<=SAFE.W+1)||!slide' in comp


@pytest.mark.parametrize('pair', PAIRS)
def test_ghost_boxes_clear_of_faces_every_frame(pair):
    """JP + EN ghost + bubble vs the projected faces / panel (dilated 16 px) on EVERY frame of every line (the v11.1 placer
    samples every frame; step 2 had let the longer gate over-move line touch a face on its last frame)."""
    G = pytest.importorskip('v10_ghost')
    try: _, idx, _ = G.C10.build_index(pair)
    except FileNotFoundError: pytest.skip('v10 renders not on this machine')
    hit = lambda a, b: a[0] < b[2]+16 and b[0]-16 < a[2] and a[1] < b[3]+16 and b[1]-16 < a[3]
    for data in (G10, GEN):
        for l in data['pairs'][pair]['lines']:
            for v in range(int(l['t0']*30), min(len(idx), int(l['t1']*30)+1)):
                for r in G.protect_rects(pair, idx, v):
                    assert not hit(l['ghost'], r) and not hit(l['bubble'], r), (l['id'], v, r)


def test_en_plate_signage_blurred():
    """the AI street plate hachikomae carries legible Japanese shop signs: the EN compositor blurs them (EN only)."""
    src = (ROOT/'tools/v11_composite.py').read_text(encoding='utf-8')
    m = re.search(r"EN_BLANK = \{'hachikomae': \[(.*?)\]\}", src)
    assert m and m.group(1).count('(') == 5
    assert 'EN_BLANK' not in (ROOT/'tools/v10_composite.py').read_text(encoding='utf-8')   # JP keeps the signs as on site
