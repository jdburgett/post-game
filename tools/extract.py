import subprocess, re, json, sys
PDF = "/mnt/user-data/uploads/65586476-POST_Cards_v0.5_duplex.pdf"
W, H = 198, 342
X0 = (612 - 3*W) / 2
Y0 = (792 - 2*H) / 2
def cell(page, r, c):
    x = int(X0 + c*W); y = int(Y0 + r*H)
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-x", str(x), "-y", str(y),
                          "-W", str(W), "-H", str(H), "-layout", PDF, "-"], capture_output=True, text=True).stdout
    return out
cards = []
for page in range(1, 73, 2):
    for r in range(2):
        for c in range(3):
            t = cell(page, r, c)
            ids = re.findall(r"\b([A-Z]{2,5}-\d{2})\b", t)
            cards.append({"page": page, "r": r, "c": c, "id": ids[-1] if ids else None, "text": t})
json.dump(cards, open("cards_raw.json", "w"))
from collections import Counter
print(len(cards), "cells;", sum(1 for c in cards if c["id"]), "with an ID")
print(Counter((c["id"] or "NONE").split("-")[0] for c in cards))
for c in cards[:2]:
    print("-----", c["id"]); print(c["text"])
