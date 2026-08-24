#!/usr/bin/env python3

import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "skills"
TARGET = REPO_ROOT / "plugins" / "hoon-ch-skills" / "skills"


def ignored(path: Path) -> bool:
    return "__pycache__" in path.parts or path.suffix == ".pyc" or path.name == ".DS_Store"


def is_tracked(path: Path) -> bool:
    relative = path.relative_to(REPO_ROOT)
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "ls-files", "--error-unmatch", "--", str(relative)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def remove_tracked_extras() -> None:
    if not TARGET.exists():
        return
    source_paths = {
        path.relative_to(SOURCE)
        for path in SOURCE.rglob("*")
        if not ignored(path)
    }
    for path in sorted(TARGET.rglob("*"), reverse=True):
        relative = path.relative_to(TARGET)
        if ignored(path) or relative in source_paths or not is_tracked(path):
            continue
        if path.is_dir():
            path.rmdir()
        else:
            path.unlink()


def sync_source_tree() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for source_path in SOURCE.rglob("*"):
        if ignored(source_path):
            continue
        relative = source_path.relative_to(SOURCE)
        target_path = TARGET / relative
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
        if target_path.exists() and not is_tracked(target_path):
            if target_path.read_bytes() != source_path.read_bytes():
                print(f"Preserved untracked mirror work: {target_path}")
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)


def main() -> int:
    if not SOURCE.is_dir():
        raise SystemExit(f"missing source skills directory: {SOURCE}")
    if TARGET.is_symlink() or TARGET.exists():
        if TARGET.is_symlink() or TARGET.is_file():
            TARGET.unlink()
        else:
            remove_tracked_extras()
    sync_source_tree()
    print(f"Synced {SOURCE} -> {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
