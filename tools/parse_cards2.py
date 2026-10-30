import json, re
from collections import Counter
cards0 = json.load(open("cards_parsed0.json"))
SPLIT = re.compile(r"\s{2,}")
LAB = re.compile(r"^([A-Z][A-Z0-9 .'\-/&]*?)\s{2,}(\S.*)$")
def fin(c):
    L = c["lines"]
    o = {k: c[k] for k in ("id", "kind", "headerRight", "stars")}
    o["row"] = c.get("row", "")
    o["page"], o["r"], o["c"] = c["page"], c["r"], c["c"]
    body = [l for l in L if not re.search(r"^A\+ 220|^Reveal at game end", l.strip())]
    t = SPLIT.split(body[0].strip()) if body else [""]
    o["title"] = t[0]
    o["num"] = t[1] if len(t) > 1 else ""
    o["subtitle"] = SPLIT.split(body[1].strip())[0] if len(body) > 1 and not body[1].startswith(" ") else ""
    specs, order, cur = {}, [], None
    notes = []
    for l in body[1:]:
        if l.startswith("  ") and not l.startswith("    ") or (l.strip().startswith(("Fits:", "Needs:", "Use:", "Benchmark:", "Close", "Claim", "NEEDS", "Why:", "Symptom:", "Install", "Redundant:", "⚠"))):
            cur = None; notes.append(l.strip()); continue
        m = LAB.match(l)
        if m and not l.startswith(" "):
            cur = m.group(1); specs[cur] = m.group(2).strip(); order.append(cur); continue
        if cur and l.startswith("     ") and len(l) - len(l.lstrip()) >= 10:
            specs[cur] += " " + l.strip(); continue
        cur = None
        if l.strip(): notes.append(l.strip())
    o["specs"] = specs; o["notes"] = notes
    o["lines"] = body
    return o
cards = [fin(c) for c in cards0]
json.dump(cards, open("cards.json", "w"), indent=1, ensure_ascii=False)
byid = {c["id"]: c for c in cards}
print(Counter(c["id"].split("-")[0] for c in cards))
print("--- tasks")
for i in sorted(k for k in byid if k.startswith("TSK")):
    c = byid[i]; n = [x for x in c["notes"] if x.startswith("NEEDS")] or [x for x in c["notes"] if "NEEDS" in x]
    print(i, c["headerRight"], "|", c["subtitle"] or c["title"], "|", " ".join(c["notes"][:3])[:110])
