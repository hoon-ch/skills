#!/usr/bin/env python3
"""Convert a diagram SVG written by hd.py into an editable .excalidraw scene.

Usage: python3 to_excalidraw.py out/<diagram>.svg [out.excalidraw]

Handles exactly the SVG subset hd.py emits: <rect>, <circle>, <image> (base64 SVG icons),
<text> with optional <tspan> runs, and <path> with M/L/H/V/Q/C/Z (absolute) and m/l/h/v/z
(relative). Curves are flattened into polyline points. Colors, stroke widths, dashes and
opacity are kept; the dark background becomes the scene background, so open the file in
Excalidraw's light theme (its dark theme inverts every color).
"""
import base64
import hashlib
import json
import pathlib
import random
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from hd import BG, measure  # noqa: E402

NS = "{http://www.w3.org/2000/svg}"
SANS, MONO = 6, 3            # Excalidraw font families: 6 = Nunito (normal), 3 = Cascadia (code)
LINE_H = 1.25
rng = random.Random(7)       # deterministic ids/seeds: same SVG → same file
elements, files = [], {}


def _id():
    return "%016x" % rng.getrandbits(64)


def base(kind, x, y, w, h, stroke="transparent", fill="transparent", sw=1, dash=None, opacity=1.0):
    return {
        "id": _id(), "type": kind, "x": x, "y": y, "width": w, "height": h, "angle": 0,
        "strokeColor": stroke, "backgroundColor": fill, "fillStyle": "solid",
        "strokeWidth": sw, "strokeStyle": dash or "solid", "roughness": 0,
        "opacity": round(opacity * 100), "groupIds": [], "frameId": None, "roundness": None,
        "seed": rng.randrange(1, 2**31), "version": 1, "versionNonce": rng.randrange(1, 2**31),
        "isDeleted": False, "boundElements": None, "updated": 1, "link": None, "locked": False,
    }


def color(v):
    return "transparent" if v in (None, "none") or v.startswith("url(") else v


def num(a, k, d=0.0):
    return float(a.get(k, d))


def dash_of(a):
    return "dashed" if a.get("stroke-dasharray") else None


# ---------------------------------------------------------------- paths
TOK = re.compile(r"[MLHVQCZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?")


def flatten(d):
    """Path data → list of subpaths, each (points, closed)."""
    toks, i = TOK.findall(d), 0
    subs, pts, cx, cy, cmd = [], [], 0.0, 0.0, None

    def nums(n):
        nonlocal i
        out = [float(t) for t in toks[i:i + n]]
        i += n
        return out
    while i < len(toks):
        if re.match(r"[A-Za-z]", toks[i]):
            cmd = toks[i]
            i += 1
        if cmd in "Zz":
            if pts:
                subs.append((pts, True))
            pts, cmd = [], None
            continue
        if cmd in "Mm":
            x, y = nums(2)
            if cmd == "m":
                x, y = cx + x, cy + y
            if pts:
                subs.append((pts, False))
            pts, (cx, cy) = [(x, y)], (x, y)
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            x, y = nums(2)
            cx, cy = (cx + x, cy + y) if cmd == "l" else (x, y)
            pts.append((cx, cy))
        elif cmd in "Hh":
            (x,) = nums(1)
            cx = cx + x if cmd == "h" else x
            pts.append((cx, cy))
        elif cmd in "Vv":
            (y,) = nums(1)
            cy = cy + y if cmd == "v" else y
            pts.append((cx, cy))
        elif cmd == "Q":
            qx, qy, x, y = nums(4)
            for t in (0.25, 0.5, 0.75, 1.0):
                pts.append(((1 - t) ** 2 * cx + 2 * (1 - t) * t * qx + t * t * x,
                            (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy + t * t * y))
            cx, cy = x, y
        elif cmd == "C":
            ax, ay, bx, by, x, y = nums(6)
            for t in (0.25, 0.5, 0.75, 1.0):
                u = 1 - t
                pts.append((u**3 * cx + 3 * u * u * t * ax + 3 * u * t * t * bx + t**3 * x,
                            u**3 * cy + 3 * u * u * t * ay + 3 * u * t * t * by + t**3 * y))
            cx, cy = x, y
        else:
            raise SystemExit(f"unsupported path command {cmd!r} in {d[:60]}")
    if pts:
        subs.append((pts, False))
    return subs


def add_poly(pts, closed, a):
    if closed and pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0 = pts[0]
    fill = color(a.get("fill"))
    e = base("line", x0, y0, max(xs) - min(xs), max(ys) - min(ys),
             stroke=color(a.get("stroke")), fill=fill if closed else "transparent",
             sw=num(a, "stroke-width", 1 if a.get("stroke") else 0), dash=dash_of(a), opacity=num(a, "opacity", 1))
    if closed and a.get("stroke") in (None, "none"):
        e["strokeColor"] = fill               # filled shape without outline (arrowheads, jack inserts)
        e["strokeWidth"] = 0.5
    e.update({"points": [[round(px - x0, 2), round(py - y0, 2)] for px, py in pts],
              "lastCommittedPoint": None, "startBinding": None, "endBinding": None,
              "startArrowhead": None, "endArrowhead": None, "polygon": closed})
    elements.append(e)


# ---------------------------------------------------------------- text
def add_text(s, x, y, size, fill, weight, anchor, mono, opacity):
    if not s.strip():
        return
    # Excalidraw clips text to the element box and its fonts run wider than Fira: pad the box.
    # The anchor (left edge, center or right edge) stays where the SVG put it.
    w = (measure(s, size, weight) if not mono else len(s) * size * 0.6) * 1.25 + 8
    if anchor == "middle":
        x -= w / 2
    elif anchor == "end":
        x -= w
    h = size * LINE_H
    e = base("text", x, y - size * 1.02, w, h, stroke=fill, opacity=opacity)
    e.update({"text": s, "originalText": s, "fontSize": size, "fontFamily": MONO if mono else SANS,
              "textAlign": {"middle": "center", "end": "right"}.get(anchor, "left"),
              "verticalAlign": "top", "containerId": None, "autoResize": True, "lineHeight": LINE_H})
    elements.append(e)


def text_el(t):
    a = t.attrib
    x, y = num(a, "x"), num(a, "y")
    mono = "Code" in a.get("font-family", "")
    size, weight = num(a, "font-size", 14), int(a.get("font-weight", 400))
    fill, opacity = color(a.get("fill", "#000")), num(a, "opacity", 1)
    spans = list(t)
    if not spans:
        add_text(t.text or "", x, y, size, fill, weight, a.get("text-anchor", "start"), mono, opacity)
        return
    for sp in spans:                          # tspans flow left to right from x
        sa = sp.attrib
        x += num(sa, "dx")
        ss, sw_ = num(sa, "font-size", size), int(sa.get("font-weight", weight))
        op = opacity * num(sa, "fill-opacity", 1)
        add_text(sp.text or "", x, y, ss, color(sa.get("fill", fill)), sw_, "start", mono, op)
        x += measure(sp.text or "", ss, sw_) * 1.1     # Nunito runs ~10 % wider than Fira Sans


# ---------------------------------------------------------------- walk
def convert(svg_path):
    root = ET.parse(svg_path).getroot()
    W, H = float(root.get("width")), float(root.get("height"))
    for el in root.iter():
        tag, a = el.tag.replace(NS, ""), el.attrib
        if tag == "rect":
            if a.get("fill", "").startswith("url(") or (num(a, "width") >= W and num(a, "height") >= H):
                continue                       # dot grid / page background → scene background
            e = base("rectangle", num(a, "x"), num(a, "y"), num(a, "width"), num(a, "height"),
                     stroke=color(a.get("stroke")) if num(a, "stroke-width", 1) > 0 else "transparent",
                     fill=color(a.get("fill")), sw=num(a, "stroke-width", 1), dash=dash_of(a),
                     opacity=num(a, "opacity", 1))
            if num(a, "rx") > 0:
                e["roundness"] = {"type": 3, "value": num(a, "rx")}
            elements.append(e)
        elif tag == "circle":
            r = num(a, "r")
            elements.append(base("ellipse", num(a, "cx") - r, num(a, "cy") - r, 2 * r, 2 * r,
                                 stroke=color(a.get("stroke")), fill=color(a.get("fill")),
                                 sw=num(a, "stroke-width", 1)))
        elif tag == "path" and el.get("d"):
            for pts, closed in flatten(a["d"]):
                if len(pts) > 1:
                    add_poly(pts, closed, a)
        elif tag == "text":
            text_el(el)
        elif tag == "image":
            href = a.get("href") or a.get("{http://www.w3.org/1999/xlink}href")
            fid = hashlib.sha1(href.encode()).hexdigest()
            mime = href[5:href.index(";")]
            files.setdefault(fid, {"mimeType": mime, "id": fid, "dataURL": href, "created": 1})
            e = base("image", num(a, "x"), num(a, "y"), num(a, "width"), num(a, "height"))
            e.update({"fileId": fid, "status": "saved", "scale": [1, 1], "crop": None})
            elements.append(e)
    return {"type": "excalidraw", "version": 2, "source": "homelab-diagram skill · to_excalidraw.py",
            "elements": elements,
            "appState": {"viewBackgroundColor": BG, "gridSize": None, "theme": "light"},
            "files": files}


if __name__ == "__main__":
    src = pathlib.Path(sys.argv[1])
    dst = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".excalidraw")
    scene = convert(src)
    dst.write_text(json.dumps(scene, ensure_ascii=False))
    kinds = {}
    for e in scene["elements"]:
        kinds[e["type"]] = kinds.get(e["type"], 0) + 1
    print(dst, kinds, f"{len(scene['files'])} files")
