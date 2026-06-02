#!/usr/bin/env python3

import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "skills"
TARGET = REPO_ROOT / "plugins" / "hoon-ch-skills" / "skills"


def main() -> int:
    if not SOURCE.is_dir():
        raise SystemExit(f"missing source skills directory: {SOURCE}")
    if TARGET.is_symlink() or TARGET.exists():
        if TARGET.is_symlink() or TARGET.is_file():
            TARGET.unlink()
        else:
            shutil.rmtree(TARGET)
    shutil.copytree(
        SOURCE,
        TARGET,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
    )
    print(f"Synced {SOURCE} -> {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
