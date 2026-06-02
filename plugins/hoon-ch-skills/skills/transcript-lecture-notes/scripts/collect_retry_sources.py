#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from validate_transcript_notes import parse_frontmatter, validate_note


SOURCE_EXTENSIONS = {".srt", ".vtt", ".md", ".txt"}
NOTE_DIR_OVERRIDES = {
    "03-loggin_and_monitoring": "03-logging_and_monitoring",
}


def expected_note_path(content_root: Path, transcript: Path) -> Path:
    note_section = NOTE_DIR_OVERRIDES.get(transcript.parent.name, transcript.parent.name)
    return content_root / "notes" / note_section / f"{transcript.stem}.md"


def collect_retry_sources(content_root: Path, quality: bool) -> list[Path]:
    transcripts_root = content_root / "transcripts"
    notes_root = content_root / "notes"
    if not transcripts_root.exists():
        raise ValueError(f"Missing transcripts directory: {transcripts_root}")
    if not notes_root.exists():
        raise ValueError(f"Missing notes directory: {notes_root}")

    retry: set[Path] = set()
    transcripts = sorted(
        path for path in transcripts_root.rglob("*") if path.suffix.lower() in SOURCE_EXTENSIONS
    )

    referenced: set[Path] = set()
    for note in sorted(path for path in notes_root.rglob("*.md") if path.name != "_index.md"):
        note_errors = validate_note(note, content_root, quality=quality)
        source_path: Path | None = None
        try:
            frontmatter = parse_frontmatter(note.read_text(encoding="utf-8"), note)
            source = frontmatter.get("source")
            if source:
                source_path = (note.parent / source).resolve()
                if source_path.exists():
                    referenced.add(source_path)
        except ValueError:
            source_path = None

        if note_errors:
            if source_path and source_path.exists():
                retry.add(source_path)
                continue
            for transcript in transcripts:
                if expected_note_path(content_root, transcript).resolve() == note.resolve():
                    retry.add(transcript.resolve())
                    break

    for transcript in transcripts:
        if transcript.resolve() not in referenced:
            retry.add(transcript.resolve())

    return sorted(retry)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Collect transcript sources whose notes are missing or fail validation."
    )
    parser.add_argument("content_root", help="Path containing transcripts/ and notes/")
    parser.add_argument("--quality", action="store_true", help="Use quality lint when checking existing notes")
    parser.add_argument("--output", help="Write retry source list to this file")
    args = parser.parse_args()

    content_root = Path(args.content_root).resolve()
    try:
        retry_sources = collect_retry_sources(content_root, quality=args.quality)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    lines = [str(path.relative_to(content_root)) for path in retry_sources]
    output = "\n".join(lines) + ("\n" if lines else "")
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    print(f"retry_sources={len(retry_sources)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
