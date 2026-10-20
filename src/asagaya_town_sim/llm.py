"""任意のLLM連携。OPENAI_API_KEY があれば一部の住民の予定と口コミをLLMで作る。
無ければ（または失敗したら）ルールベースにフォールバックする。標準ライブラリのみ。"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path

CATS = ["cafe", "food", "bar", "grocery", "shop", "park", "school", "clinic", "library", "service", "station", "plaza", "event"]


def available():
    return bool(os.environ.get("OPENAI_API_KEY"))


class LLMPlanner:
    def __init__(self, n_agents=8, model=None, timeout=30):
        self.n = n_agents
        self.model = model or os.environ.get("ASAGAYA_LLM_MODEL", "gpt-4o-mini")
        self.base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.key = os.environ.get("OPENAI_API_KEY", "")
        self.timeout = timeout
        self.cache_path = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "asagaya-town-sim" / "llm.json"
        try:
            self.cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:
            self.cache = {}
        self.days = {}
        self.calls = 0
        self.failures = 0

    def has(self, i):
        return i < self.n

    def _chat(self, prompt):
        h = hashlib.sha256((self.model + prompt).encode()).hexdigest()[:24]
        if h in self.cache:
            return self.cache[h]
        body = json.dumps({"model": self.model, "temperature": 0.7, "response_format": {"type": "json_object"},
                           "messages": [{"role": "system", "content": "あなたは東京・阿佐ケ谷に住む架空の住民です。必ずJSONだけで答えてください。"},
                                        {"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request(self.base + "/chat/completions", data=body,
                                     headers={"Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        self.calls += 1
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            out = json.loads(r.read())["choices"][0]["message"]["content"]
        self.cache[h] = out
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
        return out

    def plan_for(self, i, persona, sc):
        """[(開始分, カテゴリ, 滞在分)] または None（フォールバック）"""
        cond = []
        if sc.get("rain"):
            cond.append("今日は雨")
        if sc.get("event"):
            cond.append("13〜16時に駅前でイベントがある")
        if sc.get("site") == "cafe":
            cond.append("駅前の角に新しいカフェができた")
        if sc.get("site") == "plaza":
            cond.append("駅前の角がベンチのある広場になった(カテゴリ plaza)")
        prompt = (f"住民番号{i}、属性「{persona}」として、阿佐ケ谷での平日1日の外出予定を作ってください。条件: {'、'.join(cond) or '普通の平日'}。\n"
                  f'形式: {{"plan":[{{"time":"HH:MM","category":"...","minutes":数値}}]}}。category は {CATS} のいずれか。'
                  "電車で出かける場合は category=station で minutes に外出時間(分)を入れる。3〜6件。")
        try:
            data = json.loads(self._chat(prompt))
            legs = []
            for x in data.get("plan", [])[:8]:
                hh, mm = str(x["time"]).split(":")
                t = int(hh) * 60 + int(mm)
                c = str(x["category"])
                d = int(x["minutes"])
                if c in CATS and 5 * 60 <= t < 24 * 60 and 1 <= d <= 900:
                    if c == "plaza" and sc.get("site") != "plaza":
                        continue
                    if c == "event" and not sc.get("event"):
                        continue
                    legs.append((t, c, d))
            return sorted(legs) or None
        except Exception:
            self.failures += 1
            return None

    def note_day(self, i, persona, sc, legs):
        self.days[(i, sc.get("label", ""))] = (persona, sc, legs)

    def reviews(self, label_filter=None, limit=5):
        out = []
        for (i, label), (persona, sc, legs) in list(self.days.items()):
            if label_filter and label_filter not in label:
                continue
            if len(out) >= limit:
                break
            plan = "、".join(f"{t // 60:02d}:{t % 60:02d} {c}" for t, c, _ in legs)
            try:
                r = json.loads(self._chat(f"属性「{persona}」のあなたの今日の行動: {plan}。状況: {label}。"
                                          '駅前の変化について一言の口コミを {"review":"..."} で(60字以内)'))
                out.append(dict(agent=i, persona=persona, scenario=label, review=str(r.get("review", ""))[:120]))
            except Exception:
                self.failures += 1
        return out
