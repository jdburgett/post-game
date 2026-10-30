import json, os, shutil
from PIL import Image, ImageDraw, ImageFont
G = "/home/claude/game"
d = json.load(open(f"{G}/data.json"))
d["aids"] = [{"id": f, "img": f"img/cards/{f}.webp"} for f in sorted(x[:-5] for x in os.listdir(f"{G}/img/cards")) if f.startswith("AID")] if False else \
            [{"id": x[:-5], "img": f"img/cards/{x}"} for x in sorted(os.listdir(f"{G}/img/cards")) if x.startswith("AID")]
open(f"{G}/data.js", "w").write("window.POST_DATA=" + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
shutil.copy("/mnt/user-data/uploads/3634256c-POST_Rulebook_v0.5.pdf", f"{G}/POST_Rulebook_v0.5.pdf")
def icon(n):
    im = Image.new("RGB", (n, n), (18, 21, 28)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((n*.08, n*.08, n*.92, n*.92), n*.16, outline=(77, 163, 255), width=max(2, n//40))
    try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(n*.34))
    except Exception: f = ImageFont.load_default()
    bb = dr.textbbox((0, 0), "POST", font=f); w, h = bb[2]-bb[0], bb[3]-bb[1]
    dr.text(((n-w)/2-bb[0], (n-h)/2-bb[1]), "POST", font=f, fill=(77, 163, 255)); return im
icon(192).save(f"{G}/img/icon-192.png"); icon(512).save(f"{G}/img/icon-512.png")
json.dump({"name": "POST — The PC Build Card Game", "short_name": "POST", "start_url": "./", "display": "standalone", "background_color": "#12151c", "theme_color": "#12151c",
           "icons": [{"src": "img/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "img/icon-512.png", "sizes": "512x512", "type": "image/png"}]}, open(f"{G}/manifest.webmanifest", "w"))
s = open(f"{G}/index.html").read()
if "data.js" not in s: s = s.replace('<script src="engine.js"></script>', '<script src="data.js"></script>\n<script src="engine.js"></script>')
open(f"{G}/index.html", "w").write(s)
print("aids:", [a["id"] for a in d["aids"]]); print(os.listdir(G))
