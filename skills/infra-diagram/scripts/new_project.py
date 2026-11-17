#!/usr/bin/env python3
"""Create a self-contained diagram project, or refresh the engine files of an existing one.

Usage:
    python3 new_project.py DIR               # engine + starter (build.py, inventory.yaml, icons.yaml, ...)
    python3 new_project.py DIR --engine-only # overwrite only the engine files and glyphs in DIR

The project vendors the engine (hd.py and helpers) so it renders without this skill installed.
A new project refuses to overwrite any existing file.
"""
import pathlib
import shutil
import sys

SKILL = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ["hd.py", "fetch_icons.py", "to_excalidraw.py", "crop.py", "doctor.py"]
STARTER = ["build.py", "inventory.yaml", "icons.yaml", "requirements.txt", ".gitignore"]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    dst = pathlib.Path(args[0]).expanduser().resolve()
    engine_only = "--engine-only" in sys.argv
    plan = [(SKILL / "scripts" / f, dst / f) for f in ENGINE]
    plan += [(g, dst / "icons" / g.name) for g in sorted((SKILL / "assets" / "glyphs").glob("glyph-*.svg"))]
    plan.append((SKILL / "THIRD_PARTY_NOTICES.md", dst / "NOTICE.homelab-diagram"))
    if engine_only:
        if not (dst / "hd.py").exists():
            raise SystemExit(f"{dst} has no hd.py; create the project without --engine-only first")
    else:
        plan += [(SKILL / "assets" / "starter" / f, dst / f) for f in STARTER]
        clash = [str(d) for _, d in plan if d.exists()]
        if clash:
            raise SystemExit("refusing to overwrite:\n  " + "\n  ".join(clash))
    missing = [str(s) for s, _ in plan if not s.exists()]
    if missing:   # a broken skill install must not leave a half-copied project
        raise SystemExit("skill files missing:\n  " + "\n  ".join(missing))
    for src, d in plan:
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, d)
    print(f"{'refreshed' if engine_only else 'created'} {len(plan)} files in {dst}")


if __name__ == "__main__":
    main()
