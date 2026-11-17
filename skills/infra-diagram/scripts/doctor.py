#!/usr/bin/env python3
"""Check that this machine can render diagrams: Python modules, rsvg-convert, fonts.

Usage: python3 doctor.py        exit 0 when everything required is present
Run it with the same interpreter that renders (e.g. `uv run --with pyyaml --with pillow python doctor.py`).
"""
import importlib
import shutil
import subprocess
import sys

HINTS = {
    "yaml": "pip install pyyaml (or uv run --with pyyaml)",
    "PIL": "pip install pillow (or uv run --with pillow)",
    "rsvg-convert": "macOS: brew install librsvg · Debian/Ubuntu: apt install librsvg2-bin",
    "Fira Sans": "macOS: brew install --cask font-fira-sans · others: github.com/mozilla/Fira",
    "Fira Code": "macOS: brew install --cask font-fira-code",
    "Pretendard": "macOS: brew install --cask font-pretendard (only needed for Hangul text)",
}


def font_ok(family):
    try:
        out = subprocess.run(["fc-match", "-f", "%{family}", family], capture_output=True, text=True, timeout=5)
    except FileNotFoundError:
        return False
    return family.lower() in out.stdout.lower()


def main():
    rows = []
    for mod in ("yaml", "PIL"):
        try:
            importlib.import_module(mod)
            rows.append((mod, True, True))
        except ImportError:
            rows.append((mod, False, True))
    rows.append(("rsvg-convert", shutil.which("rsvg-convert") is not None, True))
    if not shutil.which("fc-match"):
        rows.append(("fc-match (fontconfig)", False, True))
    for fam, required in (("Fira Sans", True), ("Fira Code", True), ("Pretendard", False)):
        rows.append((fam, font_ok(fam), required))
    bad = False
    for name, ok, required in rows:
        mark = "ok  " if ok else ("FAIL" if required else "warn")
        print(f"{mark}  {name}" + ("" if ok else f"  → {HINTS.get(name, '')}"))
        bad |= required and not ok
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
