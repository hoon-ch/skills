#!/usr/bin/env python3
"""Cut a region out of a rendered PNG, given in SVG units, to inspect overlaps up close.

Usage: python3 crop.py out/diagram.png X Y W H out.png [ZOOM]
ZOOM is the PNG/SVG scale hd.finish() renders with (default 1.2).
"""
import sys

from PIL import Image

src, x, y, w, h, dst = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
z = float(sys.argv[7]) if len(sys.argv) > 7 else 1.2
im = Image.open(src)
box = (int(x * z), int(y * z), min(int((x + w) * z), im.width), min(int((y + h) * z), im.height))
im.crop(box).save(dst)
print(dst, box)
