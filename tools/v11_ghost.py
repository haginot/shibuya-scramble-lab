#!/usr/bin/env python3
"""JR v11-en guide ghost: the v10.2 ghost 「おばけ」 (tools/v9_ghost.py drawing, tools/v10_ghost.py lines + placement) speaking
English (logs/ssl-claude-halloween/v11-en/brief.md). Same character: goofy, a bit dim, a Shibuya local nerd; casual words,
no jargon, a goofy two-bubble self-intro at its first appearance (op-fly, every pair), short Shibuya bits.
Rules (EN): ≤ 2 lines × 24 chars, the bubble no wider than the widest JP bubble (20 full-width chars); every line starts at
its JP time; reading time 1.0 s + 0.05 s/char (≈ 20 chars/s, subtitle speed) — a line runs longer than its JP window
only where the next line / silent beat leaves room (≥ 0.2 s gap kept); typewriter 60 chars/s. Numbers are the JP line's
numbers (nums[].quote_en must be in the EN text).
Placement: every beat's box is re-checked against the EN HUD probes ($WORK11/<who>/probe, every 3rd frame) and the faces /
sign panel of the photo plates (v10 protect boxes): the v10.2 box is kept (bottom-left anchor, EN bubble size) when it
scores protect 0 · core 0 · overlap 0, else v9_ghost.search finds a new one (recorded as moved).
→ web3d/shibuya/series/variants/jr/v11en/ghost.json
usage: python3 tools/v11_ghost.py lines            print JP → EN + checks
       python3 tools/v11_ghost.py place [pair|all]
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys

WORK11 = Path(os.environ.get('WORK11', '/workspace/projects/logs/ssl-claude-halloween/v11-en/render'))
os.environ['WORK'] = str(WORK11)
os.environ.setdefault('WORK10', str(WORK11))
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import v11_render  # noqa: E402,F401  (render_v9.WORK = WORK11, every non-photo beat = cg)
import v9_ghost as G9  # noqa: E402

V10 = ROOT/'web3d/shibuya/series/variants/jr/v10/ghost.json'
OUT = ROOT/'web3d/shibuya/series/variants/jr/v11en/ghost.json'
MAX_LINES, MAX_CHARS = 2, 24
READ_BASE, READ_PER_CHAR, CPS = 1.0, 0.05, 60
JP_MAX_W = G9.FS*20+2*G9.PADX            # the widest JP bubble (20 full-width chars)
JARGON_EN = ('heat map', 'heatmap', 'agent', 'density', 'solver', 'optimiz', 'score')

# JP line → EN line (same line in every pair where the JP is the same)
EN = {
 'どーも！\n渋谷系おばけです〜': "Hiii! I'm the\nShibuya-kei Ghost~",
 '渋谷の裏道、\nぜんぶ知ってるよ〜': 'Shibuya-kei = 90s cool~\nI know every back alley!',
 'ミッションは\n「近づくな」だって': 'The mission is...\n"don\'t go"? Huh!',
 'わ、仮装だらけ！\nでも人、多すぎない？': "So many costumes!\nBut isn't it too packed?",
 'Aは「行かない」。\nそれ、アリなんだ！？': 'A is "don\'t go".\nThat\'s allowed?!',
 '行かないのが最強！\nだからTRUE END〜': "Not going = the best!\nThat's the TRUE END~",
 '来ちゃった人は\nこっち見てね': 'Already here?\nThen watch this~',
 'ここがスタート。\nどの道で行こっか〜': 'This is the start.\nWhich way should we go~?',
 '赤いとこは\n人ぎゅうぎゅうってこと': 'Red spots mean\npeople packed tight',
 'この点々ぜんぶ人ね。\n4万8千人、数えたよ〜': 'Every dot is a person.\nI counted 48,000~',
 '道ごとに時間と混み方と\n危なさを比べてるの': 'Comparing each road:\ntime, crowds, danger',
 '金色の道が、混み方も\n入れるといちばん早い！': 'Gold road = fastest,\ncrowds included!',
 '西口はお休み中だから\n金色の道が正解！': 'West Exit is closed, so\nthe gold road wins!',
 '赤枠を通らない\n金色の道が正解！': 'The gold road skips the\nred zone. Winner!',
 'でも近い方に\n行きたくなるよね〜': 'But the close one is\nsooo tempting, right~',
 '駅前の乗り場で\nいい気がするよね〜': "Station stand's\nfine, right~?",
 '終電遅い方が\n安心な気がするよね〜': 'A later last train\nfeels safer, right~?',
 '広場から改札へは\nUターンで入るよ〜': 'From the square, you\nU-turn into the gate~',
 'あ、そっち行ったら\nハマるやつ〜': "Uh-oh, go that way\nand you're stuck~",
 'やばっ、列が\nぜんぜん進まない': "Yikes, the line\nisn't moving at all",
 'えっ、乗り場が\nお休み中！？': 'Wait, the taxi stand\nis closed?!',
 'やばっ、規制で\n前に進めない〜': 'Yikes, the closures\nblock the way~',
 'えっ、着いたら\n終電行っちゃった…': 'Wait... we got there\nand the last train left…',
 'シミュレーションだと\n一歩も動けないくらい': "In the simulation you\ncan't move a step",
 'みんなと同じ道は\nハマりやすいんだよね': 'Following everyone is\nhow you get stuck~',
 '乗り場、ちゃんと\n調べとかないとね〜': 'Gotta check where the\ntaxi stands are first~',
 '赤枠の中は\n通れないことあるの': "Inside the red zone,\nyou may not get through",
 '終電が遅くても\n着くのが遅いとダメ〜': 'A late last train is no\ngood if you arrive late~',
 'もう1回やろ！': "Let's try again!",
 '改札前、1m²に4人！\n15分たっても通れない〜': 'Gate front: 4 per m²!\nStill stuck at 15 min~',
 '乗り場、去年の3月から\nお休みしてたの〜': "That stand's been closed\nsince March last year~",
 '赤枠の中、1m²に4人。\nしかも規制あり〜': 'Red zone: 4 per m².\nPlus closures~',
 '恵比寿に0:51着。\n終電0:50に1分遅刻〜': 'Ebisu at 0:51, last\ntrain 0:50. 1 min late~',
 '混む時間に合わせて\nもう1回計算したよ': 'Re-ran it with the crowd\nat that exact time',
 'やっぱり新南改札が\nいちばんいい！': 'New South gate it is!\nThe best one!',
 'やっぱりSAKURAテラス前が\nいちばんいい！': 'SAKURA Terrace it is!\nThe best one!',
 'やっぱり外側の道！\n赤枠を通らないから': 'The go-around road!\nIt skips the red zone',
 'やっぱり原宿が\nいちばんいい！': 'Harajuku it is!\nThe best one!',
 'この道ならスイスイ〜': 'Smooth sailing this way~',
 'ほら、こっちは\nすいてるでしょ': "See? It's way\nemptier over here",
 'やったー！\n電車乗れた〜！': 'Yay! We caught\nthe train~!',
 'やったー！\nタクシー乗れた〜': 'Yay! We got\na taxi~',
 'やったー！\n原宿へ抜けられる〜': 'Yay! We can get\nthrough to Harajuku~',
 'やったー！\n終電間に合った〜': 'Yay! We made the\nlast train~',
 'このメモ、\nスクショしといて〜': 'Screenshot\nthis, okay~?',
 'えっ、怪獣！？\n次は渋谷区のお知らせ': 'Wait, a monster?! Next:\na note from Shibuya City',
 '見てくれてありがと〜\nまたね！': 'Thanks for watching~\nSee ya!',
}
# crush-pov 「1m²に{n}人以上。押されても逃げられない」 (n = floor of the crush sim peak)
CRUSH = '1m²に{n}人以上。\n押されても逃げられない'
CRUSH_EN = '{n}+ people per m².\nShoved, nowhere to go'
QUOTE_EN = {'4万8千人': '48,000', '15分': '15 min', '3月': 'March'}


def en_text(text):
    if text in EN: return EN[text]
    for n in range(1, 10):
        if text == CRUSH.format(n=n): return CRUSH_EN.format(n=n)
    raise KeyError(f'no EN ghost line for {text!r}')


def nchars(text): return len(text.replace('\n', ''))
def read_time(text): return round(READ_BASE+READ_PER_CHAR*nchars(text), 2)


def check_text(text, width=True):
    rows = text.split('\n')
    assert len(rows) <= MAX_LINES and all(len(r) <= MAX_CHARS for r in rows), text
    assert not any(b in text.lower() for b in JARGON_EN), text
    assert not any(b.lower() in text.lower() for b in G9.BANNED), text
    assert not G9_CJK(text), text
    if width:   # needs Pillow (tests check the stored bubble boxes instead)
        bw, _ = G9.bubble_size(text)
        assert bw <= JP_MAX_W, (text, bw, JP_MAX_W)


def G9_CJK(s):
    import re
    return re.search(r'[぀-ヿ㐀-鿿＀-￯]', s)


def lines_en(pair, v10):
    """v10.2 lines with EN text, chars, reading time (t1 extended only where there is room), nums quote_en."""
    bt = G9.beat_table(pair)
    out = []
    lines = sorted(json.loads(json.dumps(v10['pairs'][pair]['lines'])), key=lambda l: l['t0'])
    for i, l in enumerate(lines):
        en = en_text(l['text']); check_text(en)
        need = round(l['t0']+read_time(en), 3)
        nxt = lines[i+1]['t0']-.2 if i+1 < len(lines) else 1e9
        for k, b in bt.items():   # never into a silent beat
            if k in G9.SILENT_BEATS and b['t0'] >= l['t0']: nxt = min(nxt, b['t0'])
        t1 = max(l['t1'], min(need, nxt))
        assert t1 >= need-1e-6, (pair, l['beat'], en, 'needs', need, 'room until', nxt)
        for n in l['nums']:
            n['quote_en'] = QUOTE_EN.get(n['quote'], n['quote'])
            assert n['quote_en'] in en, (en, n)
        out.append(dict(l, text=en, ja=l['text'], chars=nchars(en), t1=round(t1, 3), jp_t1=l['t1'], cps=CPS))
    for a, b in zip(out, out[1:]): assert b['t0']-a['t1'] >= .2-1e-6, (a['text'], b['text'])
    return out


def place(pair, data):
    import v10_ghost as GX
    _, idx, _ = GX.C10.build_index(pair); bt = G9.beat_table(pair)
    groups = {}
    for ln in data['pairs'][pair]['lines']: groups.setdefault(ln['beat'], []).append(ln)
    for beat, lns in groups.items():
        t0, t1 = min(l['t0'] for l in lns)-.25, max(l['t1'] for l in lns)+.3
        mask, probes = G9.hud_mask(pair, bt, t0+.1, t1-.05)
        assert probes, (pair, beat, 'no EN HUD probe frames')
        pm, _ = GX.protect_mask(pair, idx, t0, t1)
        bw = max(G9.bubble_size(l['text'])[0] for l in lns); bh = max(G9.bubble_size(l['text'])[1] for l in lns)
        box, flip = lns[0]['box'], lns[0]['flip']
        x = min(box[0], G9.SAFE['x1']-(G9.GW+G9.GAP+bw))
        g, b, nbox = G9.layout((x, box[3]-max(G9.GH, bh)), bw, bh, flip)
        pr, core, ov = GX.score(mask, pm, g, b)
        moved = False
        if not (pr == 0 and core == 0 and ov == 0 and nbox[1] >= G9.SAFE['y0'] and nbox[3] <= G9.SAFE['y1']):
            g, b, nbox, flip, ov, core, pr = G9.search(mask, lns, pm); moved = True
        print(f'{pair} {beat:12s} {"moved " if moved else "kept  "} box={list(nbox)} protect={pr} core={core} overlap={ov} probes={probes}', flush=True)
        for l in lns:
            l.update(box=list(nbox), ghost=list(g), bubble=list(b), flip=flip, overlap=ov, core=core, probes=probes, protect=pr, moved=moved)


def main(argv):
    if not argv: print(__doc__); return 2
    v10 = json.loads(V10.read_text(encoding='utf-8'))
    pairs = G9.PAIRS if len(argv) < 2 or argv[1] == 'all' else [argv[1]]
    if argv[0] == 'lines':
        for p in pairs:
            for l in lines_en(p, v10):
                print(p, l['beat'], f"{l['t0']:.2f}-{l['t1']:.2f} (jp {l['jp_t1']:.2f})", l['text'].replace('\n', ' / '))
        return 0
    if argv[0] == 'place':
        data = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else dict(v10, pairs={})
        data['generated'] = 'tools/v11_ghost.py place (v10.2 lines in English; boxes re-checked against the EN HUD; do not edit by hand)'
        data['rules'] = dict(v10['rules'], lang='en', maxChars=MAX_CHARS, readBase=READ_BASE, readPerChar=READ_PER_CHAR, cps=CPS, jpMaxWidth=JP_MAX_W, jargon=list(JARGON_EN))
        for p in pairs:
            data['pairs'][p] = dict(v10['pairs'][p], lines=lines_en(p, v10))
            place(p, data)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
        return 0
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
