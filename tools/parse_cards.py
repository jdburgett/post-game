import json, re
from collections import Counter
raw = json.load(open("cards_raw.json"))
SPLIT = re.compile(r"\s{2,}")
def clean_lines(t):
    return [l.rstrip() for l in t.splitlines()]
def parse(c):
    lines = clean_lines(c["text"])
    L = [l for l in lines if l.strip()]
    out = {"id": c["id"], "page": c["page"], "r": c["r"], "c": c["c"]}
    head = SPLIT.split(L[0].strip())
    out["kind"] = head[0]
    out["headerRight"] = head[1] if len(head) > 1 else ""
    out["stars"] = L[0].count("★")
    rest = L[1:]
    body = []
    for l in rest:
        if re.match(r"^\s*ROW \d", l) or re.fullmatch(r"\s*ROW \d\s*", l): out["row"] = l.strip(); continue
        body.append(l)
    # drop footer (last line with id)
    body = [l for l in body if not re.search(r"A\+ 220-\d+.*POST|Reveal at game end|^\s*POST\s", l)] if False else body
    out["lines"] = body
    return out
cards = [parse(c) for c in raw if c["id"]]
json.dump(cards, open("cards_parsed0.json", "w"), indent=1)
lab = Counter()
for c in cards:
    for l in c["lines"]:
        m = re.match(r"^([A-Z][A-Z0-9 .'\-/&]*?)\s{2,}(\S.*)$", l)
        if m and not l.startswith(" "): lab[m.group(1)] += 1
for k, v in sorted(lab.items(), key=lambda x: -x[1]): print(v, repr(k))
