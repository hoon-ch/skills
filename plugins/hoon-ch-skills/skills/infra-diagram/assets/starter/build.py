#!/usr/bin/env python3
"""Starter layout: internet → firewall → switch → devices + one hypervisor, with Networks and Legend.

Usage: python3 build.py [--unredacted]   → out/diagram[-unredacted].svg + .png
Content comes from inventory.yaml; positions are hand-placed here. Grow it section by section:
add a card, give it a box, route its cable with route_levels, assert it fits, render, look.
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hd  # noqa: E402

hd.init(HERE / "inventory.yaml", 1800)
from hd import *  # noqa: E402,F401,F403

L = INV["labels"]
header(L["subtitle"])

# ================================================================ layout constants
LX, LW = 40, 460                    # left column: networks + legend
CX = 1300                           # internet → firewall axis (WAN jack sits right of the card text)
FWX, FWY, FWW, FWH = 700, 290, 760, 90
SWX, SWY, SWW, SWH = 540, 470, 1220, 96
SB = SWY + SWH
DY = 720                            # device row (card body top; the tab sits TAB above)
DEVW, DEVH, DEVGAP = 330, 86, 30
SVX, SVW = 540, 1220                # hypervisor card
SVY = DY + DEVH + 34 + 60

# ================================================================ internet + firewall
S.rect(CX - 150, 140, 300, 60, rx=30, fill="#1a2433", stroke="#3a4a60", sw=2.5)
S.text(CX, 166, L["internet"], 20, TEXT, 600, "middle")
S.text(CX, 188, META["public_ip"], 12, MUTED, 400, "middle", mono=True)
S.line([(CX, 200), (CX, FWY + 30)], C["wan"], SPEED_W["1G"])
speed_tag(CX + 10, FWY - TAB - 10, VLAN["wan"]["note"], C["wan"])
fw = INV["firewall"]
device_card(FWX, FWY, FWW, FWH, ["opnsense"], fw, C["99"], stroke=TRUNK_BORDER)
jack(CX - 24, FWY + 14, 48, 36, C["wan"] + "55", C["wan"])

# ================================================================ switch + ports
sw = INV["switch"]
device_card(SWX, SWY, SWW, SWH, ["mikrotik-l"], sw, C["99"], fill="#141b25", stroke=TRUNK_BORDER)
PX, PORT = {}, {}
x = SWX + 380
for p in sw["ports"]:
    w = 68 if p.get("sfp") else 58
    cx = x + w / 2
    port(cx, SWY + 22, p, p.get("sfp", False))
    S.text(cx, SWY + SWH - 8, p["name"], 10.5, MUTED, 500, "middle", mono=True)
    PX[p["to"]], PORT[p["to"]] = cx, p
    x += w
assert x + 20 <= SWX + SWW, f"switch ports run past the card ({x})"

# firewall uplink: straight up from its switch port into the firewall's bottom edge
up = PORT["firewall"]
S.trunk([(PX["firewall"], SWY + 20), (PX["firewall"], FWY + FWH - 20)], sw=trunk_w(up["speed"]))
jack(PX["firewall"] - 30, FWY + FWH - 46, 60, 36, "#2a3443", TRUNK, sfp=True)
ticks(PX["firewall"], FWY + FWH - 51, up.get("untagged"), up.get("tagged", []), up=True)
speed_tag(PX["firewall"] + 14, (FWY + FWH + SWY - TAB) / 2 + 8, up["speed"], TRUNK)

# ================================================================ devices + hypervisor (boxes first: cables need targets)
srv = INV["server"]
BOX = {}
for i, d in enumerate(INV["devices"]):
    BOX[d["key"]] = (SVX + i * (DEVW + DEVGAP), DY, d)
TGT = {k: x0 + tab_width(d) + 30 for k, (x0, _, d) in BOX.items()}   # enter right of the folder tab
last_dev_end = max(x0 + DEVW for x0, _, _ in BOX.values())
TGT[srv["key"]] = max(SVX + tab_width(srv) + 30, last_dev_end + 40)   # pass right of the device row
order = [p["to"] for p in sw["ports"] if p["to"] in TGT]
level = route_levels(order, PX, TGT, SB + 40, 16)
assert max(level.values()) + 20 < DY - TAB, "cable levels run into the device tabs"

for k in order:
    p = PORT[k]
    ty = SVY if k == srv["key"] else DY
    pts = [(PX[k], SB), (PX[k], level[k]), (TGT[k], level[k]), (TGT[k], ty)]
    if p.get("tagged"):
        S.trunk(pts, sw=trunk_w(p["speed"]))
        col = TRUNK
    else:
        col = C[p["untagged"]]
        S.line(pts, col, SPEED_W[p["speed"]])
    speed_tag(TGT[k] + 10, ty - TAB - 10, p["speed"], col)

for k, (x0, y0, d) in BOX.items():
    device_card(x0, y0, DEVW, DEVH, d["icons"], d, C[d["vlan"]], isz=46)

# hypervisor: hardware tiles on the left, guests on the right
GH, TH = 62, 64
SVH = 96 + max(len(srv["hw"]) * TH, len(srv["guests"]) * GH) + 16
device_card(SVX, SVY, SVW, SVH, ["proxmox"], srv, C["99"], fill="#0f151e", stroke=TRUNK_BORDER, sw=2, isz=46)
S.text(SVX + 20, SVY + 96, L["hardware"], 11.5, HWC, 700, ls=1.4)
for i, hwi in enumerate(srv["hw"]):
    hw_tile(hwi, SVX + 16, SVY + 106 + i * TH, 270)
gx, gw = SVX + 306, SVW - 306 - 16
S.text(gx + 2, SVY + 96, L["guests"], 11.5, GT, 700, ls=1.4)
for i, g in enumerate(srv["guests"]):
    y = SVY + 106 + i * GH
    col = C[g["vlan"]]
    S.rect(gx, y, gw, 56, rx=9, fill=CHIP, stroke=BORDER, sw=1)
    S.add(f'<rect x="{gx}" y="{y+8}" width="4" height="40" rx="2" fill="{col}"/>')
    S.icon(g["icon"], gx + 12, y + 15, 26)
    S.text(gx + 46, y + 22, g["name"], 14, TEXT, 600)
    S.text(gx + 46, y + 40, g["ip"], 11.5, col, 500, mono=True)
    S.text(gx + 46 + tw(g["ip"], 11.5, True) + 8, y + 40, g["note"], 11.5, MUTED, 400)
    S.text(gx + gw - 12, y + 22, f"{g['kind']} {g['id']}", 12, FAINT, 500, "end", mono=True)
    S.text(gx + gw - 12, y + 40, g["spec"], 11, FAINT, 500, "end", mono=True)
assert SVY + 106 + len(srv["guests"]) * GH <= SVY + SVH, "guests overflow the hypervisor card"

# ================================================================ left column: networks + legend
vy = 150
vh = 70 + len(INV["vlans"]) * 60
S.rect(LX, vy, LW, vh, rx=14, fill=PANEL, stroke=BORDER, sw=1.4)
S.text(LX + 20, vy + 36, L["networks"], 19, TEXT, 600)
for i, v in enumerate(INV["vlans"]):
    y = vy + 56 + i * 60
    S.rect(LX + 14, y, LW - 28, 52, rx=9, fill=CHIP, stroke=v["color"] + "55", sw=1)
    S.add(f'<rect x="{LX+14}" y="{y}" width="6" height="52" rx="3" fill="{v["color"]}"/>')
    S.text(LX + 32, y + 22, v["tag"], 13, v["color"], 600, mono=True)
    S.text(LX + 124, y + 22, v["name"], 15.5, TEXT, 600)
    S.text(LX + LW - 28, y + 22, v["subnet"], 13.5, TEXT, 500, "end", mono=True)
    S.text(LX + 32, y + 42, v["note"], fit(v["note"], 12, LW - 60), MUTED, 400)

LG = L["legend_rows"]
lgy = vy + vh + 20
S.rect(LX, lgy, LW, 52 + len(LG) * 27 + 4, rx=14, fill=PANEL, stroke=BORDER, sw=1.4)
S.text(LX + 20, lgy + 36, L["legend"], 19, TEXT, 600)
SX_, TX_ = LX + 22, LX + 150
for i, (k, t) in enumerate(LG.items()):
    y = lgy + 66 + i * 27
    if k == "trunk":
        S.trunk([(SX_, y), (SX_ + 50, y)], sw=trunk_w("10G"), r=0)
    elif k == "access":
        for jj, v in enumerate(VLAN):
            S.line([(SX_ + jj * 13, y), (SX_ + jj * 13 + 9, y)], C[v], 3.6, r=0, cap="butt")
    elif k == "wan":
        S.line([(SX_, y), (SX_ + 50, y)], C["wan"], 3, r=0)
    elif k == "speed":
        x0 = SX_
        for lbl in ("10G", "2.5G", "1G"):
            S.line([(x0, y), (x0 + 22, y)], MUTED, SPEED_W[lbl], r=0, cap="butt")
            x0 += 34
    elif k == "ticks":
        ticks(SX_ + 8, y - 4, "10", ["20"])
    S.text(TX_, y + 4.5, t, 13, MUTED, 400)

finish(SVY + SVH + 40, "diagram")
