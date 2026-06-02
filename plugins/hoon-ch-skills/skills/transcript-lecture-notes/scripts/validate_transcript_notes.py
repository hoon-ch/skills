#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)
LINK_RE = re.compile(r"\[[^\]]+\]\((.+)\)")
VALID_KINDS = {"transcript_lecture_article"}
VALID_SOURCE_TYPES = {"srt", "vtt", "markdown", "text"}
FORBIDDEN_GENERIC_PHRASES = [
    "turns the source transcript into a readable",
    "covers the lesson material from the source transcript",
    "use the lecture flow and checklist as the study surface",
]
COMMAND_START_RE = re.compile(
    r"^(kubectl|kubeadm|docker|nerdctl|crictl|ctr|helm|etcdctl|etcdutl|openssl|base64|"
    r"curl|wget|ip|route|ss|netstat|nslookup|dig|ping|traceroute|iptables|"
    r"tcpdump|cat|ls|cd|vi|vim|nano|mkdir|rm|cp|mv|systemctl|journalctl|"
    r"export|echo|ssh|scp|chmod|sudo|apt-get|apt|git|kube-scheduler|kube-apiserver|"
    r"kube-controller-manager|kubelet|kube-proxy|ps|alias)\b"
)


def parse_frontmatter(text: str, path: Path) -> dict[str, str]:
    """Parse the simple scalar frontmatter fields this validator enforces."""
    match = FRONTMATTER_RE.match(text)
    if not match:
        raise ValueError(f"{path}: missing YAML frontmatter")
    data: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data


def count_srt_cues(path: Path) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    return sum(
        1
        for index, line in enumerate(lines[:-1])
        if line.strip().isdigit() and "-->" in lines[index + 1]
    )


def count_vtt_cues(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if "-->" in line)


def section_body(text: str, heading: str) -> str:
    match = re.search(rf"^##\s+{re.escape(heading)}\s*$", text, re.M)
    if not match:
        return ""
    next_match = re.search(r"^##\s+.+$", text[match.end() :], re.M)
    if not next_match:
        return text[match.end() :]
    return text[match.end() : match.end() + next_match.start()]


def source_section_links_source(note: Path, text: str, source_path: Path) -> bool:
    body = section_body(text, "Source")
    for target in LINK_RE.findall(body):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        if (note.parent / target).resolve() == source_path:
            return True
    return False


def has_embedded_timed_transcript(text: str) -> bool:
    # Five or more timestamp cue lines is strong evidence the raw transcript was pasted.
    return len(re.findall(r"^\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+", text, re.M)) >= 5


def fenced_blocks_in_section(text: str, heading: str) -> list[str]:
    body = section_body(text, heading)
    return re.findall(r"```(?:\w+)?\n(.*?)```", body, re.S)


def validate_quality(note: Path, text: str) -> list[str]:
    errors: list[str] = []
    lowered = text.lower()

    if re.search(r"^###\s+(source\s+cues?|transcript\s+cues?|cues?)\b", text, re.M | re.I):
        errors.append(f"{note}: quality lint forbids cue-range headings in article body")

    for phrase in FORBIDDEN_GENERIC_PHRASES:
        if phrase in lowered:
            errors.append(f"{note}: quality lint forbids generic filler phrase: {phrase}")

    checklist_items = re.findall(r"^- \[[ xX]\]\s+(.+)", text, re.M)
    cue_like_items = [item for item in checklist_items if re.match(r"(cues?|source cues?)\s+\d+", item, re.I)]
    if cue_like_items:
        errors.append(f"{note}: quality lint requires checklist items to name information units, not cue ranges")

    return errors


def validate_cue_count(note: Path, source_path: Path, source_type: str, declared: str | None) -> list[str]:
    errors: list[str] = []
    if source_type == "srt":
        actual = count_srt_cues(source_path)
    elif source_type == "vtt":
        actual = count_vtt_cues(source_path)
    else:
        if declared is not None and not declared.isdigit():
            errors.append(f"{note}: source_cue_count must be a non-negative integer")
        return errors

    if declared is None:
        errors.append(f"{note}: missing source_cue_count for {source_type} source")
    elif declared.isdigit() and int(declared) != actual:
        errors.append(f"{note}: source_cue_count {declared} does not match source cues {actual}")
    elif not declared.isdigit():
        errors.append(f"{note}: source_cue_count must be a non-negative integer")
    return errors


def validate_note(note: Path, content_root: Path, quality: bool = False) -> list[str]:
    errors: list[str] = []
    text = note.read_text(encoding="utf-8")
    try:
        frontmatter = parse_frontmatter(text, note)
    except ValueError as exc:
        return [str(exc)]

    source = frontmatter.get("source")
    if not source:
        errors.append(f"{note}: missing frontmatter source")
        source_path = None
    else:
        source_path = (note.parent / source).resolve()
        if not source_path.exists():
            errors.append(f"{note}: source does not exist: {source}")
        try:
            source_path.relative_to(content_root.resolve())
        except ValueError:
            errors.append(f"{note}: source points outside content root: {source}")

    if frontmatter.get("kind") not in VALID_KINDS:
        errors.append(f"{note}: kind must be transcript_lecture_article")

    if frontmatter.get("coverage") not in {"lossless-derived", "needs-review"}:
        errors.append(f"{note}: coverage must be lossless-derived or needs-review")

    source_type = frontmatter.get("source_type")
    if source_type not in VALID_SOURCE_TYPES:
        errors.append(f"{note}: source_type must be one of {sorted(VALID_SOURCE_TYPES)}")

    sections = set(SECTION_RE.findall(text))
    required = {"TL;DR", "Coverage Checklist", "Source"}
    for section in sorted(required - sections):
        errors.append(f"{note}: missing section ## {section}")
    title = frontmatter.get("title")
    if title and not re.search(rf"^#\s+{re.escape(title)}\s*$", text, re.M):
        errors.append(f"{note}: missing H1 title matching frontmatter title")

    if "## Full Transcript" in text:
        errors.append(f"{note}: should link transcript instead of embedding full lecture text")
    if "\n### Cue " in text or "\n### Transcript Cue " in text or has_embedded_timed_transcript(text):
        errors.append(f"{note}: should not embed raw transcript cue blocks")

    checklist_items = re.findall(r"^- \[[ xX]\]\s+.+", text, re.M)
    if not checklist_items:
        errors.append(f"{note}: Coverage Checklist has no items")

    if source_path and source_path.exists() and not source_section_links_source(note, text, source_path):
        errors.append(f"{note}: Source section should link to frontmatter source")

    if source_path and source_path.exists() and source_type:
        errors.extend(validate_cue_count(note, source_path, source_type, frontmatter.get("source_cue_count")))

    if quality:
        errors.extend(validate_quality(note, text))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate transcript-derived lecture article notes against linked sources."
    )
    parser.add_argument("content_root", help="Path containing transcripts/ and notes/")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--require-full-coverage",
        action="store_true",
        help="Require every transcript source to be referenced by at least one note.",
    )
    parser.add_argument(
        "--quality",
        action="store_true",
        help="Run stricter article-quality lint in addition to structural validation.",
    )
    args = parser.parse_args()

    content_root = Path(args.content_root)
    notes_root = content_root / "notes"
    transcripts_root = content_root / "transcripts"
    errors: list[str] = []

    if not transcripts_root.exists():
        errors.append(f"Missing transcripts directory: {transcripts_root}")
    if not notes_root.exists():
        errors.append(f"Missing notes directory: {notes_root}")

    notes = sorted(notes_root.rglob("*.md")) if notes_root.exists() else []
    content_notes = [note for note in notes if note.name != "_index.md"]
    if not content_notes:
        errors.append(f"No content notes found under: {notes_root}")

    for note in content_notes:
        note_errors = validate_note(note, content_root, quality=args.quality)
        errors.extend(note_errors)
        if args.verbose and not note_errors:
            print(f"OK {note}")

    if args.require_full_coverage and transcripts_root.exists():
        referenced = set()
        for note in content_notes:
            try:
                frontmatter = parse_frontmatter(note.read_text(encoding="utf-8"), note)
            except ValueError:
                continue
            source = frontmatter.get("source")
            if source:
                referenced.add((note.parent / source).resolve())
        for transcript in sorted(transcripts_root.rglob("*")):
            if transcript.suffix.lower() not in {".srt", ".vtt", ".md", ".txt"}:
                continue
            if transcript.resolve() not in referenced:
                errors.append(f"{transcript}: no note references this transcript")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Transcript notes are valid: {len(content_notes)} notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
