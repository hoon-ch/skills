#!/usr/bin/env python3
"""Download the service icons listed in icons.yaml into icons/ (homarr-labs/dashboard-icons).

Run from a diagram project (the folder holding icons.yaml):
    python3 fetch_icons.py            # icons.yaml next to this script
    python3 fetch_icons.py DIR        # DIR/icons.yaml → DIR/icons/

icons.yaml:
    map:                     # local file name -> dashboard-icons name
      proxmox: proxmox
      github-l: github-light # prefer the -light variant on the dark background
    recolor:                 # dark icon without a light variant: [remote, old, new]
      plane-l: [plane, 'fill="#121212"', 'fill="#e6edf3"']

Find names with the tree.json of homarr-labs/dashboard-icons (key "svg").
The icons belong to their projects; commit only your own glyph-*.svg.
"""
import pathlib
import sys
import time
import urllib.request

import yaml

SOURCES = [   # tried in order; raw GitHub is the fallback when jsDelivr refuses a file
    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/{}.svg",
    "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/{}.svg",
]


def download(name, tries=3):
    """Fetch one icon from the first source that delivers it; retry with a short pause."""
    last = None
    for url in SOURCES:
        req = urllib.request.Request(url.format(name), headers={"User-Agent": "infra-diagram-skill/1.0"})
        for attempt in range(tries):
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    return r.read().decode("utf-8")
            except Exception as e:
                last = e
                if getattr(e, "code", None) in (403, 404):   # this source won't have it, try the next
                    break
                time.sleep(2 * (attempt + 1))
    raise last


def main():
    root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    spec = yaml.safe_load((root / "icons.yaml").read_text()) or {}
    icons = root / "icons"
    icons.mkdir(exist_ok=True)
    failed = []
    for local, remote in (spec.get("map") or {}).items():
        time.sleep(0.2)                   # be gentle with the CDN
        try:
            (icons / f"{local}.svg").write_text(download(remote))
        except Exception as e:
            failed.append(f"{local} ({remote}): {e}")
    for local, (remote, old, new) in (spec.get("recolor") or {}).items():
        try:
            svg = download(remote)
            if old not in svg:
                raise ValueError(f"{old!r} not found in {remote}.svg")
            (icons / f"{local}.svg").write_text(svg.replace(old, new))
        except Exception as e:
            failed.append(f"{local} ({remote}): {e}")
    if failed:
        raise SystemExit("failed:\n  " + "\n  ".join(failed))
    print(f"{len(list(icons.glob('*.svg')))} icons in {icons}")


if __name__ == "__main__":
    main()
