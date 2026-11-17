"""Drawing primitives for r/homelab-style infrastructure diagrams (palette, cards, jacks, cables).

Derived from Goblinmine/homelab-diagram's build.py (MIT, see NOTICE.homelab-diagram) and parameterised
by the inventory: call init(inventory_path, width) first, then `from hd import *`.
"""
import base64
import html
import pathlib
import subprocess
import sys

import yaml
from PIL import ImageFont

HERE = pathlib.Path(__file__).resolve().parent
ICONS = HERE / "icons"
OUT = HERE / "out"
UNREDACTED = "--unredacted" in sys.argv

# ---------------------------------------------------------------- palette
BG = "#0b0f15"
GRID = "#151c26"
PANEL = "#111821"
PANEL2 = "#161f2b"
CHIP = "#19222e"
BORDER = "#253042"
TEXT = "#e6edf3"
MUTED = "#8d9aab"
FAINT = "#5d6a7c"
TRUNK = "#d5dde6"
TRUNK_BORDER = "#3a475a"
LINK = "#79c0ff"
ACCENT = "#ff5722"
WARN = "#f0883e"
OK = "#3fb950"
DENY = "#f85149"
PROTO = {"TCP": "#79c0ff", "UDP": "#39c5cf"}
UNKNOWN = "#6b7a90"
SPEED_W = {"10G": 9.5, "2.5G": 3.8, "1G": 2.4, "100M": 1.4}
HWC = "#c08a5c"
GT = "#c08a5c"
SANS = "Fira Sans, Pretendard"      # Hangul falls back to Pretendard
MONO = "Fira Code, Pretendard"
TAB = 34

# set by init()
INV = META = None
VLAN, C = {}, {}
W = 0
S = None
_REDACT = []          # (real, shown) pairs applied to every text
SHOWN_DOMAIN = ""


def init(inventory_path, width):
    """Load the inventory, set the canvas width and start a fresh SVG."""
    global INV, META, VLAN, C, W, S, _REDACT, SHOWN_DOMAIN
    INV = yaml.safe_load(pathlib.Path(inventory_path).read_text())
    META = INV["meta"]
    red = INV.get("redact", {})
    domain = META.get("domain", "")
    SHOWN_DOMAIN = domain if UNREDACTED else red.get("domain_placeholder", domain)
    _REDACT = [] if UNREDACTED else [(domain, SHOWN_DOMAIN)] if domain else []
    if not UNREDACTED and META.get("public_ip"):
        _REDACT.append((META["public_ip"], red["public_ip_placeholder"]))
    VLAN = {v["key"]: v for v in INV["vlans"]}
    C = {k: v["color"] for k, v in VLAN.items()}
    W = width
    S = SVG()
    return INV


def trunk_w(speed):
    return SPEED_W[speed] + 3.4


def sub(s):
    s = str(s).replace("{domain}", SHOWN_DOMAIN)
    for real, shown in _REDACT:
        s = s.replace(real, shown)
    return s


def esc(s):
    return html.escape(sub(s), quote=True)


def _hangul(c):
    return "\uac00" <= c <= "\ud7a3" or "\u3130" <= c <= "\u318f" or "\u1100" <= c <= "\u11ff"


def tw(s, size, mono=False):
    """Rough width: Latin at the Fira advance, Hangul at about one em."""
    s = sub(s)
    n_ko = sum(1 for c in s if _hangul(c))
    return (len(s) - n_ko) * size * (0.6 if mono else 0.53) + n_ko * size * 0.95


def _font_file(pattern):
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}", pattern], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or None
    except Exception:
        return None


_FONTS = {700: _font_file("Fira Sans:bold"), 600: _font_file("Fira Sans:semibold"),
          500: _font_file("Fira Sans:medium"), 400: _font_file("Fira Sans:regular")}
if not all(_FONTS.values()) or "Fira" not in _FONTS[400]:
    raise SystemExit("Fira Sans not found (brew install --cask font-fira-sans font-fira-code)")
_KO_FONTS = {w: _font_file(f"Pretendard:{n}") for w, n in
             ((700, "bold"), (600, "semibold"), (500, "medium"), (400, "regular"))}
_FCACHE = {}


def _font(weight, size, ko):
    key = (weight, size, ko)
    if key not in _FCACHE:
        files = _KO_FONTS if ko else _FONTS
        if ko and "Pretendard" not in (files[weight] or ""):
            raise SystemExit("Pretendard not found (brew install --cask font-pretendard)")
        _FCACHE[key] = ImageFont.truetype(files[weight], size=size * 8)
    return _FCACHE[key]


def measure(s, size, weight=700):
    """Text width from the real fonts: Fira for Latin runs, Pretendard for Hangul runs."""
    s, total, run, run_ko = sub(s), 0.0, "", False
    for c in s + "\0":
        ko = _hangul(c)
        if c == "\0" or (run and ko != run_ko):
            if run:
                total += _font(weight, size, run_ko).getlength(run) / 8
            run, run_ko = "", ko
        if c != "\0":
            run += c
            run_ko = ko
    return total


def fqdn(h):
    return f"{h}.{SHOWN_DOMAIN}"


def rounded(pts, r):
    if len(pts) == 2:
        return f"M{pts[0][0]},{pts[0][1]} L{pts[1][0]},{pts[1][1]}"
    d = f"M{pts[0][0]},{pts[0][1]}"
    for i in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
        l1 = max(abs(x1 - x0), abs(y1 - y0))
        l2 = max(abs(x2 - x1), abs(y2 - y1))
        rr = min(r, l1 / 2, l2 / 2)
        ax = x1 - (x1 - x0) / l1 * rr if l1 else x1
        ay = y1 - (y1 - y0) / l1 * rr if l1 else y1
        bx = x1 + (x2 - x1) / l2 * rr if l2 else x1
        by = y1 + (y2 - y1) / l2 * rr if l2 else y1
        d += f" L{ax:.1f},{ay:.1f} Q{x1},{y1} {bx:.1f},{by:.1f}"
    d += f" L{pts[-1][0]},{pts[-1][1]}"
    return d


class SVG:
    def __init__(self):
        self.p = []
        self._icon_cache = {}

    def add(self, s):
        self.p.append(s)

    def rect(self, x, y, w, h, rx=10, fill=PANEL, stroke=BORDER, sw=1.2, op=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"{d}/>')

    def text(self, x, y, s, size=14, fill=TEXT, weight=400, anchor="start", mono=False, ls=0, op=1):
        fam = MONO if mono else SANS
        lsa = f' letter-spacing="{ls}"' if ls else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" font-size="{size}" fill="{fill}" '
                 f'font-weight="{weight}" text-anchor="{anchor}" opacity="{op}"{lsa}>{esc(s)}</text>')

    def icon(self, name, x, y, size):
        if name not in self._icon_cache:
            f = ICONS / f"{name}.svg"
            if not f.exists():
                raise SystemExit(f"missing icon '{name}' – add it to icons.yaml and run fetch_icons.py")
            self._icon_cache[name] = base64.b64encode(f.read_bytes()).decode()
        self.add(f'<image x="{x:.1f}" y="{y:.1f}" width="{size}" height="{size}" '
                 f'href="data:image/svg+xml;base64,{self._icon_cache[name]}"/>')

    def line(self, pts, color, sw=3, dash=None, r=10, op=1, cap="round"):
        self.add(f'<path d="{rounded(pts, r)}" fill="none" stroke="{color}" stroke-width="{sw}" '
                 f'stroke-linecap="{cap}" stroke-linejoin="round" opacity="{op}"'
                 + (f' stroke-dasharray="{dash}"' if dash else "") + "/>")

    def trunk(self, pts, r=12, sw=7):
        self.line(pts, TRUNK, sw=sw, r=r)
        self.line(pts, BG, sw=sw - 4.4, r=r)

    def arrow(self, pts, color=MUTED, sw=1.8, dash=None, r=8):
        self.line(pts, color, sw, dash=dash, r=r)
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
        dx, dy = x1 - x0, y1 - y0
        ln = max(abs(dx), abs(dy)) or 1
        ux, uy = dx / ln, dy / ln
        a, b = 8, 4.5
        p1 = (x1 - ux * a - uy * b, y1 - uy * a + ux * b)
        p2 = (x1 - ux * a + uy * b, y1 - uy * a - ux * b)
        self.add(f'<path d="M{x1},{y1} L{p1[0]:.1f},{p1[1]:.1f} L{p2[0]:.1f},{p2[1]:.1f} Z" fill="{color}"/>')

    def pill(self, x, y, s, color, size=12, fill=None, mono=False, anchor="start", h=None, pad=8, tcolor=None, weight=600):
        w = tw(s, size, mono) + pad * 2
        h = h or size + 10
        if anchor == "middle":
            x -= w / 2
        elif anchor == "end":
            x -= w
        self.rect(x, y, w, h, rx=h / 2, fill=fill or color + "22", stroke=color + "88", sw=1)
        self.text(x + w / 2, y + h / 2 + size * 0.36, s, size, tcolor or color, weight, "middle", mono)
        return w

    def label(self, x, y, s, color=MUTED, size=12, anchor="middle", mono=False, bg=BG):
        w = tw(s, size, mono) + 12
        bx = x - w / 2 if anchor == "middle" else (x if anchor == "start" else x - w)
        self.rect(bx, y - size - 2, w, size + 9, rx=5, fill=bg, stroke=bg, sw=0)
        self.text(bx + w / 2, y + 1, s, size, color, 500, "middle", mono)


# ---------------------------------------------------------------- shared pieces
def fit(s, size, maxw, weight=400):
    """Font size that makes s fit into maxw (never larger than size)."""
    return round(min(size, size * maxw / max(measure(s, size, weight), 1)), 2)


def addr(x, y, ip, extra, color, size=12):
    """IP · extra in the VLAN color (extra e.g. an iDRAC or interface hint)."""
    S.text(x, y, ip, size, color, 500, mono=True)
    if extra:
        cw_ = size * 0.6
        dx = x + len(sub(ip)) * cw_ + cw_ * 0.6
        S.text(dx, y, "·", size, MUTED, 400, mono=True)
        S.text(dx + cw_ * 1.6, y, extra, size, color, 400, mono=True, op=0.75)


def tab_width(g):
    return 16 + measure(g["name"], 20, 700) + 7 + measure("·", 20, 700) + 7 + measure(g["type"], 14, 600) + 18


def folder(x, y, w, h, tab_w, fill, stroke, sw):
    t = y - TAB
    r, rt, sl = 12, 9, 16
    d = (f"M{x},{y+h-r} L{x},{t+rt} Q{x},{t} {x+rt},{t} L{x+tab_w-sl:.1f},{t} "
         f"C{x+tab_w-sl/3:.1f},{t} {x+tab_w-sl/3:.1f},{y} {x+tab_w+sl/2:.1f},{y} "
         f"L{x+w-r},{y} Q{x+w},{y} {x+w},{y+r} L{x+w},{y+h-r} Q{x+w},{y+h} {x+w-r},{y+h} "
         f"L{x+r},{y+h} Q{x},{y+h} {x},{y+h-r} Z")
    S.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def device_card(x, y, w, h, icons, g, color, fill=PANEL, stroke=None, sw=1.6, isz=54):
    """Physical device: folder tab 'name · type'; body = icon, model, IP · extra, OS."""
    folder(x, y, w, h, tab_width(g), fill, stroke or color + "aa", sw)
    S.add(f'<text x="{x+16}" y="{y-10}" font-family="{SANS}" fill="{TEXT}">'
          f'<tspan font-size="20" font-weight="700">{esc(g["name"])}</tspan>'
          f'<tspan dx="7" font-size="20" font-weight="700" fill-opacity="0.6">·</tspan>'
          f'<tspan dx="7" font-size="14" font-weight="600">{esc(g["type"])}</tspan></text>')
    ix = x + 14
    for ic in icons:
        S.icon(ic, ix, y + 15, isz)
        ix += isz + 4
    tx_ = ix + 8
    S.text(tx_, y + 28, g["model"], 14, TEXT, 500)
    addr(tx_, y + 48, g["ip"], g.get("internal"), color)
    if g.get("os"):
        S.text(tx_, y + 66, g["os"], 12, MUTED, 400)
    return tx_


def jack(x, y, w, h, fill, stroke, sfp=False):
    S.rect(x, y, w, h, rx=5, fill=fill, stroke=stroke, sw=1.4)
    if sfp:
        S.rect(x + 8, y + 9, w - 16, h - 18, rx=2, fill=BG, stroke="none", sw=0)
    else:
        S.add(f'<path d="M{x+10},{y+h-8} v-14 h6 v-5 h{w-32} v5 h6 v14 z" fill="{BG}"/>')


def ticks(cx, y, untagged=None, tagged=(), up=False):
    vk = ([untagged] if untagged else []) + list(tagged)
    x0 = cx - (len(vk) * 7) / 2
    for j, k in enumerate(vk):
        hh = 8 if k == untagged else 5
        yy = y - hh if up else y
        S.add(f'<rect x="{x0 + j*7:.1f}" y="{yy}" width="5" height="{hh}" rx="1" fill="{C[k]}"/>')


def port(cx, y, p, sfp, w=None):
    """Switch jack at center cx; p = {untagged, tagged}; neither = unused (grey)."""
    unt, tagged = p.get("untagged"), p.get("tagged", [])
    w = w or (60 if sfp else 48)
    if unt and not tagged:
        fill, stroke = C[unt] + "55", C[unt]
    elif unt or tagged:
        fill, stroke = "#2a3443", TRUNK
    else:
        fill, stroke = "#1b222c", "#3a475a"
    jack(cx - w / 2, y, w, 36, fill, stroke, sfp)
    ticks(cx, y + 41, unt, tagged)


def vlan_tag(vkey):
    v = VLAN[vkey]
    return f"{v['tag']} · {v['name']}"


def speed_tag(x, y, txt, color, anchor="start", bg=BG):
    S.label(x, y, txt, color, 11, anchor=anchor, mono=True, bg=bg)


def hw_tile(hwi, x, y, w, h=58):
    S.rect(x, y, w, h, rx=11, fill="#151d29", stroke="#2e3a4c", sw=1.2)
    S.add(f'<rect x="{x+1}" y="{y+12}" width="4" height="{h-24}" rx="2" fill="{HWC}"/>')
    S.icon(hwi["icon"], x + 12, y + 15, 28)
    S.text(x + 50, y + 17, hwi["label"], 10, HWC, 700, ls=1.3)
    S.text(x + 50, y + 35, hwi["value"], fit(hwi["value"], 15.5, w - 62, 700), TEXT, 700)
    if hwi.get("sub"):
        S.text(x + 50, y + 50, hwi["sub"], fit(hwi["sub"], 10.5, w - 60), MUTED, 400)


def zone(x, y, w, h, color, title, sub_, icon=None, tag=None):
    """Logical grouping (cluster, rack): tinted panel with a title line."""
    S.rect(x, y, w, h, rx=16, fill=color + "0b", stroke=color + "77", sw=1.5)
    tx_ = x + 20
    if icon:
        S.icon(icon, x + 18, y + 16, 34)
        tx_ = x + 62
    S.text(tx_, y + 34, title, 21, TEXT, 700)
    S.text(tx_ + measure(title, 21, 700) + 14, y + 34, sub_, 13.5, MUTED, 400)
    if tag:
        S.pill(x + w - 16, y + 18, tag, color, 10.5, mono=True, h=19, pad=6, anchor="end")


def route_levels(order, px, tgt, top, step):
    """Horizontal cable levels below a switch so fanned-out cables never cross.
    Cables heading left come first (leftmost jack runs highest), then cables heading right
    (rightmost jack runs highest)."""
    left = [k for k in order if tgt[k] < px[k]]
    right = [k for k in order if tgt[k] >= px[k]]
    assert order == left + right, "a left-going cable sits right of a right-going one"
    level = {k: top + (len(right) - 1 - i) * step for i, k in enumerate(right)}
    level.update({k: top + i * step for i, k in enumerate(left)})
    return level


def header(subtitle, title=None):
    """Background placeholders, title, subtitle, watermark and date."""
    S.add(f'<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">'
          f'<circle cx="1.5" cy="1.5" r="1.3" fill="{GRID}"/></pattern></defs>')
    S.add("")
    S.add("")
    title = title or META["title"]
    S.text(40, 86, title, 46, TEXT, 700, ls=-0.5)
    if subtitle:
        S.text(40 + measure(title, 46, 700) + 20, 86, subtitle, 18, MUTED, 400)
    S.text(W - 40, 74, META["watermark"], 21, ACCENT, 700, "end")
    S.text(W - 40, 100, META["date"], 16, MUTED, 400, "end")


def finish(height, name):
    """Fill the background, write <name>[-unredacted].svg/.png into out/."""
    h = int(height)
    S.p[1] = f'<rect x="0" y="0" width="{W}" height="{h}" fill="{BG}"/>'
    S.p[2] = f'<rect x="0" y="0" width="{W}" height="{h}" fill="url(#dots)"/>'
    OUT.mkdir(exist_ok=True)
    stem = f"{name}-unredacted" if UNREDACTED else name
    svg = OUT / f"{stem}.svg"
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}">'
                   + "".join(S.p) + "</svg>")
    png = OUT / f"{stem}.png"
    subprocess.run(["rsvg-convert", "-z", "1.2", "-o", str(png), str(svg)], check=True)
    print(svg, png)
