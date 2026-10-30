import json, subprocess, os
from PIL import Image, ImageDraw, ImageChops
DPI = 180
PDF = "/mnt/user-data/uploads/65586476-POST_Cards_v0.5_duplex.pdf"
os.makedirs("render", exist_ok=True)
subprocess.run(["pdftoppm", "-r", str(DPI), "-png", PDF, "render/p"], check=True)
s = DPI / 72
W, H = 198, 342
X0 = (612 - 3 * W) / 2; Y0 = (792 - 2 * H) / 2
def cell_box(r, c):
    return (int((X0 + c * W) * s), int((Y0 + r * H) * s), int((X0 + (c + 1) * W) * s), int((Y0 + (r + 1) * H) * s))
def trim_round(im):
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im.convert("RGB"), bg).convert("L").point(lambda v: 255 if v > 18 else 0)
    bb = diff.getbbox()
    im = im.crop(bb).convert("RGBA")
    rad = int(im.width * 0.045)
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), rad, fill=255)
    im.putalpha(m)
    return im
cards = json.load(open("cards_raw.json"))
DECK = {"SS": "spec", "MB": "board", "CPU": "comp", "COOL": "comp", "RAM": "comp", "STO": "comp", "PSU": "comp", "KIT": "comp",
        "EXP": "addon", "RAID": "addon", "DSP": "addon", "ADP": "addon", "PRN": "addon", "PER": "addon", "FIX": "addon", "PB": "addon",
        "TSK": "task", "TT": "task"}
backs = {}; meta = {}; wc = 0
for n, c in enumerate(cards):
    p = c["page"]; r, col = c["r"], c["c"]
    front = Image.open(f"render/p-{p:02d}.png"); back = Image.open(f"render/p-{p+1:02d}.png")
    fim = trim_round(front.crop(cell_box(r, col)))
    text = c["text"]
    if c["id"]:
        cid = c["id"]
    elif "WRITE-IN" in text:
        wc += 1; cid = f"BLANK-{wc:02d}"
    elif "READY & SCORE" in text:
        cid = f"AID-RS-{sum(1 for k in meta if k.startswith('AID-RS'))+1}"
    elif "YOUR TURN" in text:
        cid = f"AID-YT-{sum(1 for k in meta if k.startswith('AID-YT'))+1}"
    else:
        cid = f"X-{n}"
    fim.save(f"/home/claude/game/img/cards/{cid}.webp", "WEBP", quality=82, method=6)
    meta[cid] = {"page": p, "r": r, "c": col, "size": fim.size}
    if c["id"]:
        dk = DECK[c["id"].split("-")[0]]
        if dk not in backs:
            bim = trim_round(back.crop(cell_box(r, 2 - col)))   # long-edge flip mirrors the column
            bim.save(f"/home/claude/game/img/back-{dk}.webp", "WEBP", quality=82, method=6)
            backs[dk] = (p, r, 2 - col)
json.dump(meta, open("img_meta.json", "w"))
print(len(meta), "card images;", backs)
