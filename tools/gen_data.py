import json, re
cards = json.load(open("cards.json"))
by = {c["id"]: c for c in cards}
NUM = lambda s: float(re.search(r"\d+(?:\.\d+)?", str(s)).group())
TOK = ("VGA", "DVI", "HDMI", "DP", "USB-C")
def alltext(c): return " ".join(c["lines"]).upper()
def sp(c, k, d=""): return c["specs"].get(k, d)
def base(c, deck):
    return {"id": c["id"], "deck": deck, "name": (c["title"] + (" " + c["subtitle"] if c["id"].startswith(("FIX","COOL","PSU")) and c["subtitle"] and c["subtitle"] in ("Pads","Fan","FIXES","PSU") else "")).strip(),
            "sub": c["subtitle"], "img": f"img/cards/{c['id']}.webp"}
def gi(pat, s): 
    m = re.search(pat, s); return int(m.group(1)) if m else 0
out = {"boards": [], "comp": [], "addon": [], "task": [], "spec": [], "aids": []}
# ---------------------------------------------------------------- boards
for c in cards:
    if not c["id"].startswith("MB"): continue
    t = c["title"]; s = c["specs"]
    typ = "Laptop" if t.startswith("Laptop") else "Server" if t.startswith("Server") else "Micro" if t.startswith("Micro") else "Desktop"
    b = base(c, "board"); b["type"] = typ
    m = re.search(r"DDR(\d)\s+(ECC RDIMM|SODIMM|DIMM)", s["RAM"] if "RAM" in s else s.get("RAM", ""))
    m = re.search(r"DDR(\d)\s+(ECC RDIMM|SODIMM|DIMM)", sp(c, "RAM"))
    b["ram"] = f"DDR{m.group(1)}-" + {"ECC RDIMM": "ECC", "SODIMM": "SODIMM", "DIMM": "DIMM"}[m.group(2)]
    st = sp(c, "STORAGE")
    b.update(sata=gi(r"(?<![A-Za-z])SATA ×(\d)", st), sas=gi(r"SAS ×(\d)", st), m2=gi(r"M\.2 ×(\d)", st),
             m2sata="NVMe or SATA" in st, bay25=gi(r'2\.5" SATA bay ×(\d)', st), msata=gi(r"mSATA ×(\d)", st))
    sock = sp(c, "SOCKET"); b["socket"] = "PGA" if sock.startswith("PGA") else "LGA" if sock.startswith("LGA") else None
    b["power"] = int(NUM(sp(c, "BASE POWER").replace("⚡", ""))) if "BASE POWER" in s else 0
    b["usb"] = int(NUM(sp(c, "USB PORTS", "0")))
    vo = sp(c, "VIDEO OUT"); b["outs"] = [k for k in TOK if re.search(rf"(?<![A-Z-]){re.escape(k)}(?![A-Z-])", vo)]
    sl = sp(c, "SLOTS"); b["slots"] = {k: 0 for k in ("x16", "x4", "x1", "PCI")}
    for size, n in re.findall(r"x(16|4|1) ×(\d)", sl): b["slots"]["x" + size] += int(n)
    mm = re.search(r"PCI ×(\d)", sl)
    if mm: b["slots"]["PCI"] = int(mm.group(1))
    fw = sp(c, "FIRMWARE"); b["tpm"] = "TPM" in fw and "no TPM" not in fw; b["uefi"] = "UEFI" in fw
    b["itx"] = "ITX" in t
    bi = sp(c, "BUILT IN"); mt = re.search(r"Tier (\d)", bi)
    b["lapCpuTier"] = int(mt.group(1)) if (typ == "Laptop" and mt) else 0
    b["webcam"] = typ == "Laptop"; b["wifi"] = typ == "Laptop"; b["finger"] = "fingerprint" in bi.lower()
    out["boards"].append(b)
# ------------------------------------------------------------ components
for c in cards:
    p = c["id"].split("-")[0]
    if p not in ("CPU", "COOL", "RAM", "STO", "PSU", "KIT"): continue
    d = base(c, "comp"); d["tier"] = c["stars"]
    t, sub = c["title"], c["subtitle"]
    pw = re.match(r"⚡(\d+)", sp(c, "POWER"))
    d["power"] = int(pw.group(1)) if pw else 0
    if p == "CPU":
        d.update(slot="cpu", socket=sp(c, "SOCKET")[:3], cores=int(NUM(sp(c, "CORES"))), vm=sp(c, "VM SUPPORT").startswith("Yes"), x86="x86" in sp(c, "ARCH"))
    elif p == "COOL":
        d.update(slot="cooler", rating=int(re.findall(r"\d", sp(c, "RATED FOR"))[-1]), serverOnly="SERVER BOARDS ONLY" in alltext(c), liquid="Liquid" in t)
    elif p == "RAM":
        m = re.search(r"DDR(\d) (ECC RDIMM|SODIMM|DIMM)", t)
        d.update(slot="ram", key=f"DDR{m.group(1)}-" + {"ECC RDIMM": "ECC", "SODIMM": "SODIMM", "DIMM": "DIMM"}[m.group(2)], gb=NUM(sp(c, "CAPACITY") or sub))
    elif p == "STO":
        if "NVMe" in t: kind = "nvme"
        elif "M.2 SATA" in t: kind = "m2sata"
        elif "mSATA" in t: kind = "msata"
        elif "SAS" in t or "SAS" in sub: kind = "sas"
        elif t.startswith('3.5"'): kind = "sata35"
        else: kind = "sata25"
        cap = sp(c, "CAPACITY"); v = NUM(cap); tb = v / 1000 if re.search(r"\d\s*GB", cap) else v
        d.update(slot="sto", kind=kind, tb=tb, ssd="SSD" in t, hdd="HDD" in t)
    elif p == "PSU":
        d.update(slot="psu", cap=int(NUM(c["headerRight"].replace("OUTPUT ⚡", ""))), serverOnly="SERVER BOARDS ONLY" in alltext(c), redundant="SERVER BOARDS ONLY" in alltext(c))
    elif p == "KIT":
        rs, ds = sp(c, "RAM"), sp(c, "DRIVE")
        m = re.search(r"DDR(\d) SODIMM", rs)
        dk = "nvme" if "NVMe" in ds else "m2sata" if "M.2 SATA" in ds else "msata" if "mSATA" in ds else "sata25"
        dv = NUM(ds); dtb = dv / 1000 if re.search(r"\d\s*GB", ds.split("SSD")[0]) else dv
        fits = re.findall(r"MB-\d\d", " ".join(c["notes"]))
        d.update(slot="kit", fits=fits, ramGb=NUM(rs), ramKey=f"DDR{m.group(1)}-SODIMM", ramTier=rs.count("★"), drvKind=dk, drvTb=dtb, drvTier=ds.count("★"))
        d["tier"] = 0
    out["comp"].append(d)
# --------------------------------------------------------------- add-ons
PER = {"PER-01": "headset", "PER-02": "webcam", "PER-03": "speakers", "PER-04": "drawpad", "PER-05": "optical", "PER-06": "sd", "PER-07": "flash", "PER-08": "finger", "PER-09": "dock", "PER-10": "replicator"}
PRN = {"PRN-01": "laser", "PRN-02": "laser", "PRN-03": "inkjet", "PRN-04": "thermal", "PRN-05": "thermal", "PRN-06": "thermal", "PRN-07": "impact", "PRN-08": "mfd"}
ROLE = {"EXP-06": "sound", "EXP-07": "sound", "EXP-08": "capture", "EXP-09": "capture", "EXP-10": "wifi", "EXP-11": "wifi", "EXP-12": "nic", "EXP-13": "hsm"}
for c in cards:
    i = c["id"]; p = i.split("-")[0]
    if p not in ("EXP", "RAID", "DSP", "ADP", "PRN", "PER", "FIX", "PB"): continue
    d = base(c, "addon"); d["cat"] = p
    if p == "EXP":
        slot = sp(c, "SLOT").replace("PCIe ", "")
        gpu = i not in ROLE
        kit = 0
        if gpu:
            m = re.search(r"at least ⚡(\d+)", " ".join(c["notes"])); kit = int(m.group(1)) if m else 0
        outs = [k for k in TOK if re.search(rf"(?<![A-Z-]){re.escape(k)}(?![A-Z-])", sp(c, "OUTPUTS"))]
        # 'DP ×3' means 3 DisplayPort outputs
        outl = []
        for part in re.split(r"\s*·\s*", sp(c, "OUTPUTS")):
            mm = re.match(r"(VGA|DVI|HDMI|DP|USB-C)(?: ×(\d))?", part.strip())
            if mm: outl += [mm.group(1)] * int(mm.group(2) or 1)
        pw = re.match(r"⚡(\d+)", sp(c, "POWER"))
        d.update(kind="exp", slotSize=slot, power=int(pw.group(1)) if pw else 0, tier=c["stars"], gpu=gpu, kit=kit, outs=outl if gpu else [], role="gpu" if gpu else ROLE[i])
    elif p == "RAID":
        d.update(kind="raid", level=int(NUM(c["title"])), min=int(NUM(sp(c, "MIN. DRIVES"))))
    elif p == "DSP":
        t = c["title"]
        d.update(kind="dsp", ins=[k for k in TOK if re.search(rf"(?<![A-Z-]){re.escape(k)}(?![A-Z-])", sp(c, "INPUTS"))], hz=int(NUM(sp(c, "REFRESH"))),
                 panel="OLED" if "OLED" in t else "Mini-LED" if "Mini-LED" in t else "IPS" if "IPS" in t else "VA" if "VA" in t else "TN" if "TN" in t else "LCD")
    elif p == "ADP": d["kind"] = "adp"
    elif p == "PRN":
        cn = sp(c, "CONNECTS"); d.update(kind="prn", ptype=PRN[i], net=("Ethernet" in cn or "Wi-Fi" in cn))
    elif p == "PER": d.update(kind="per", ptype=PER[i])
    elif p == "FIX": d.update(kind="fix", fixes=sp(c, "FIXES"))
    elif p == "PB": d.update(kind="prebuilt", laptop=(i == "PB-03"))
    out["addon"].append(d)
# ----------------------------------------------------------------- tasks
TNAMES = ["Overheating","POST Beeps","Capacitor Swelling","Wrong Date & Time","S.M.A.R.T. Failure","Grinding & Clicking","Bootable Device Not Found","Burning Smell","Swollen Battery","Screen Burn-In","Paper Jam","External Interference","Intermittent Connectivity"]
for c in cards:
    i = c["id"]
    if i.startswith("TSK"):
        d = base(c, "task"); needs = [l.strip() for l in c["lines"] if "NEEDS" in l]
        d.update(kind="task", pts=int(NUM(c["headerRight"])), name=c["subtitle"] or c["title"], needs=re.sub(r"^NEEDS:\s*", "", needs[0]) if needs else "")
        d["name"] = c["subtitle"]
        out["task"].append(d)
    elif i.startswith("TT"):
        d = base(c, "task"); d.update(kind="ticket", pts=int(NUM(c["headerRight"])), name=next(n for n in TNAMES if n.startswith(c["subtitle"].replace("!", "").strip()))); out["task"].append(d)
    elif i.startswith("SS"):
        d = base(c, "spec")
        val = re.search(r"POSTed with Requirements: \+(\d+)", " ".join(c["lines"]))
        d.update(name=c["title"], value=int(val.group(1)), tag=c["subtitle"])
        out["spec"].append(d)
    elif i.startswith("AID") or i.startswith("BLANK"):
        out["aids"].append({"id": i, "img": f"img/cards/{i}.webp"})
json.dump(out, open("/home/claude/game/data.json", "w"), indent=1, ensure_ascii=False)
print({k: len(v) for k, v in out.items()})
for b in out["boards"]: print(b["id"], b["type"], b["socket"], b["ram"], "sata", b["sata"], "sas", b["sas"], "m2", b["m2"], "m2sata", b["m2sata"], "bay", b["bay25"], "msata", b["msata"], "pw", b["power"], "usb", b["usb"], b["outs"], b["slots"], "tpm", b["tpm"], "lapT", b["lapCpuTier"])
print([ (d["id"],d["value"]) for d in out["spec"]])
print([ (d["id"],d["kit"],d["outs"]) for d in out["addon"] if d.get("gpu")])
print([(d["id"],d["fits"],d["ramKey"],d["drvKind"],d["drvTb"],d["ramTier"],d["drvTier"]) for d in out["comp"] if d["slot"]=="kit"])
print([(d["id"],d["serverOnly"]) for d in out["comp"] if d.get("serverOnly")])
