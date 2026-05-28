#!/usr/bin/env python3

from __future__ import annotations

import argparse
import concurrent.futures
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


SOURCE_EXTENSIONS = {".srt", ".vtt", ".md", ".txt"}
NOTE_DIR_OVERRIDES = {
    "03-loggin_and_monitoring": "03-logging_and_monitoring",
}


def title_from_stem(stem: str) -> str:
    clean = re.sub(r"^\d{2}[-_]", "", stem)
    clean = clean.replace("(optional)", "optional")
    clean = clean.replace("_", " ").replace("-", " ")
    acronyms = {"api", "cka", "cni", "crd", "dns", "hpa", "ipam", "pvc", "rbac", "tls", "vpa"}
    words = []
    for word in clean.split():
        lower = word.lower()
        if lower in acronyms:
            words.append(lower.upper())
        elif lower == "coredns":
            words.append("CoreDNS")
        elif lower == "etcdctl":
            words.append("etcdctl")
        elif lower == "etcdutl":
            words.append("etcdutl")
        elif re.fullmatch(r"\d+", word):
            words.append(word)
        else:
            words.append(word.capitalize())
    return " ".join(words)


def lesson_from_name(path: Path) -> str:
    match = re.match(r"^(\d{2})[-_]", path.name)
    return match.group(1) if match else "00"


def source_type(path: Path) -> str:
    return {
        ".srt": "srt",
        ".vtt": "vtt",
        ".md": "markdown",
        ".txt": "text",
    }.get(path.suffix.lower(), "text")


def count_srt_cues(path: Path) -> int:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return sum(1 for index, line in enumerate(lines[:-1]) if line.strip().isdigit() and "-->" in lines[index + 1])


def count_vtt_cues(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if "-->" in line)


def note_type(path: Path) -> str:
    lower = path.stem.lower()
    if "lab_solution" in lower or "-lab" in lower:
        return "lab_solution"
    if "demo" in lower:
        return "demo"
    if any(token in lower for token in ["faq", "article", "reference", "important_note", "certification_tip", "guide"]):
        return "reference"
    if "introduction" in lower or "section_introduction" in lower:
        return "overview"
    return "concept"


def frontmatter(title: str, source: Path, source_rel: str, now: str) -> str:
    stype = source_type(source)
    lines = [
        "---",
        f'title: "{title}"',
        f'created: "{now}"',
        f'modified: "{now}"',
        f'section: "{source.parent.name}"',
        f'lesson: "{lesson_from_name(source)}"',
        'kind: "transcript_lecture_article"',
        f'note_type: "{note_type(source)}"',
        f'source: "{source_rel}"',
        f'source_type: "{stype}"',
    ]
    if stype == "srt":
        lines.append(f"source_cue_count: {count_srt_cues(source)}")
    elif stype == "vtt":
        lines.append(f"source_cue_count: {count_vtt_cues(source)}")
    lines.extend(['coverage: "lossless-derived"', 'tags: ["kubernetes", "cka"]', "---"])
    return "\n".join(lines)


def prompt_for_source(source: Path, content_root: Path, now: str) -> str:
    section = source.parent.name
    source_rel = f"../../transcripts/{section}/{source.name}"
    title = title_from_stem(source.stem)
    kind = note_type(source)
    source_text = source.read_text(encoding="utf-8", errors="replace")
    fm = frontmatter(title, source, source_rel, now)
    if kind == "lab_solution":
        structure = """Use this structure:
## TL;DR
## Lab Goal
## Solution Walkthrough
Use question/task blocks or a table with Question, Observation, Command, Judgment, Answer when the transcript contains explicit lab prompts.
## Commands
Only include executable shell commands, valid command templates, or YAML/config snippets. If a command is spoken but incomplete, omit it.
## CKA Exam Notes
## Coverage Checklist
## Source"""
    elif kind == "demo":
        structure = """Use this structure:
## TL;DR
## Demo Goal
## Walkthrough
## Commands
Only include executable shell commands, valid command templates, or YAML/config snippets. If no clean commands exist, use ## Examples instead.
## What To Verify
## Coverage Checklist
## Source"""
    elif kind == "reference":
        structure = """Use this structure:
## TL;DR
## What This Clarifies
## Key Guidance
## Examples or ## References
## Coverage Checklist
## Source"""
    else:
        structure = """Use this structure:
## TL;DR
## Why It Matters
## Core Concept
## How It Works
## Examples or ## Commands
## CKA Exam Notes
## Coverage Checklist
## Source"""

    return f"""Use the transcript-lecture-notes skill rules to write one high-quality English CKA lecture note.

Return only the final Markdown file. Start with this exact frontmatter:

{fm}

Hard requirements:
- Include `# {title}` immediately after the frontmatter.
- Do not use cue-range headings such as "Source cues 1-20".
- Do not copy the transcript in fixed chunks.
- Write dense, scannable blog-style study notes.
- Preserve every meaningful information unit from the transcript.
- Do not invent facts outside the transcript.
- Use real topic headings, not transcript mechanics.
- Coverage Checklist items must name concrete information units, not cue ranges.
- The Source section must link exactly to: {source_rel}
- Commands sections must contain only executable commands, valid command templates, or YAML/config snippets. If no clean command exists, use Examples instead of Commands.

{structure}

Transcript source path: {source.relative_to(content_root)}

Transcript:
{source_text}
"""


def normalize_claude_output(output: str) -> str:
    text = output.strip()
    fence_match = re.search(r"```(?:markdown|md)\s*\n", text)
    if fence_match:
        start = fence_match.end()
        end = text.rfind("```")
        text = text[start:end if end > start else len(text)].strip()
    else:
        match = re.search(r"^---\s*$", text, re.M)
        if match:
            text = text[match.start() :]
        if text.startswith("```markdown"):
            text = text[len("```markdown") :].strip()
        if text.endswith("```"):
            text = text[:-3].rstrip()
    return text.rstrip() + "\n"


def validate_generated_text(text: str, title: str, source_rel: str) -> list[str]:
    errors: list[str] = []
    if not text.startswith("---\n"):
        errors.append("missing YAML frontmatter")
    if not re.search(rf"^#\s+{re.escape(title)}\s*$", text, re.M):
        errors.append("missing H1 matching title")
    for heading in ["TL;DR", "Coverage Checklist", "Source"]:
        if not re.search(rf"^##\s+{re.escape(heading)}\s*$", text, re.M):
            errors.append(f"missing ## {heading}")
    if source_rel not in text:
        errors.append("missing exact source link")
    checklist_items = re.findall(r"^- \[[ xX]\]\s+(.+)", text, re.M)
    if not checklist_items:
        errors.append("coverage checklist has no items")
    if any(re.match(r"(cues?|source cues?)\s+\d+", item, re.I) for item in checklist_items):
        errors.append("coverage checklist uses cue ranges instead of information units")
    if re.search(r"^###\s+(source\s+cues?|transcript\s+cues?|cues?)\b", text, re.M | re.I):
        errors.append("contains cue-range heading")
    return errors


def generate_one(args: tuple[Path, Path, Path, str, str, str, float | None, bool, int]) -> tuple[Path, bool, str]:
    source, content_root, output_path, now, model, effort, max_budget, bare, retries = args
    prompt = prompt_for_source(source, content_root, now)
    command = ["claude", "-p"]
    if bare:
        command.append("--bare")
    command.extend(["--model", model, "--effort", effort, "--permission-mode", "dontAsk"])
    if max_budget is not None:
        command.extend(["--max-budget-usd", str(max_budget)])
    title = title_from_stem(source.stem)
    source_rel = f"../../transcripts/{source.parent.name}/{source.name}"
    last_error = ""
    for attempt in range(retries + 1):
        try:
            completed = subprocess.run(
                command,
                input=prompt,
                text=True,
                capture_output=True,
                timeout=600,
                check=False,
            )
        except subprocess.TimeoutExpired:
            last_error = "timeout"
            continue
        if completed.returncode != 0:
            last_error = completed.stderr.strip() or completed.stdout.strip()
            continue
        text = normalize_claude_output(completed.stdout)
        validation_errors = validate_generated_text(text, title, source_rel)
        if validation_errors:
            last_error = f"invalid Claude output on attempt {attempt + 1}: {', '.join(validation_errors)}"
            continue
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text, encoding="utf-8")
        return output_path, True, ""
    return output_path, False, last_error


def render_indexes(content_root: Path, sections: list[str], now: str) -> None:
    notes_root = content_root / "notes"
    for section in sections:
        note_section = NOTE_DIR_OVERRIDES.get(section, section)
        section_dir = notes_root / note_section
        if not section_dir.exists():
            continue
        lines = [
            "---",
            f'title: "{title_from_stem(note_section)}"',
            f'created: "{now}"',
            f'modified: "{now}"',
            'kind: "index"',
            f'source: "../../transcripts/{section}"',
            'tags: ["kubernetes", "cka"]',
            "---",
            "",
            f"# {title_from_stem(note_section)}",
            "",
            "## Lessons",
        ]
        for note in sorted(path for path in section_dir.glob("*.md") if path.name != "_index.md"):
            lines.append(f"- [{title_from_stem(note.stem)}]({note.name})")
        lines.append("")
        (section_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")

    root_lines = [
        "---",
        'title: "CKA Lecture Notes"',
        f'created: "{now}"',
        f'modified: "{now}"',
        'kind: "index"',
        'source: "../transcripts"',
        'tags: ["kubernetes", "cka"]',
        "---",
        "",
        "# CKA Lecture Notes",
        "",
        "English blog-style notes generated from linked CKA transcripts.",
        "",
        "## Sections",
    ]
    for section in sections:
        note_section = NOTE_DIR_OVERRIDES.get(section, section)
        if (notes_root / note_section / "_index.md").exists():
            root_lines.append(f"- [{title_from_stem(note_section)}]({note_section}/_index.md)")
    root_lines.append("")
    (notes_root / "_index.md").write_text("\n".join(root_lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate high-quality notes by delegating each transcript to Claude CLI.")
    parser.add_argument("content_root")
    parser.add_argument("--sections", nargs="*")
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--effort", default="low")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--max-budget-usd", type=float, default=None)
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--missing-only", action="store_true", help="Generate only notes that do not exist yet")
    parser.add_argument("--sources-file", help="Newline-delimited transcript source paths to generate")
    parser.add_argument("--bare", action="store_true", help="Run Claude CLI with --bare to avoid plugin hooks")
    parser.add_argument("--retries", type=int, default=1, help="Retry invalid or failed Claude outputs per transcript")
    args = parser.parse_args()

    content_root = Path(args.content_root)
    transcripts_root = content_root / "transcripts"
    notes_root = content_root / "notes"
    if not transcripts_root.exists():
        raise SystemExit(f"Missing transcripts directory: {transcripts_root}")
    notes_root.mkdir(parents=True, exist_ok=True)

    sections = args.sections or [path.name for path in sorted(transcripts_root.iterdir()) if path.is_dir()]
    if args.clean:
        for section in sections:
            note_section = NOTE_DIR_OVERRIDES.get(section, section)
            target = notes_root / note_section
            if target.exists():
                for note in target.glob("*.md"):
                    note.unlink()

    sources: list[Path] = []
    if args.sources_file:
        for line in Path(args.sources_file).read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            source = Path(stripped)
            if not source.is_absolute():
                source = content_root / source
            if source.suffix.lower() in SOURCE_EXTENSIONS:
                sources.append(source)
        sections = sorted({source.parent.name for source in sources})
    else:
        for section in sections:
            for source in sorted((transcripts_root / section).iterdir()):
                if source.suffix.lower() in SOURCE_EXTENSIONS:
                    sources.append(source)
    if args.limit is not None:
        sources = sources[: args.limit]

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    tasks = []
    for source in sources:
        note_section = NOTE_DIR_OVERRIDES.get(source.parent.name, source.parent.name)
        output_path = notes_root / note_section / f"{source.stem}.md"
        if args.missing_only and output_path.exists():
            continue
        tasks.append((source, content_root, output_path, now, args.model, args.effort, args.max_budget_usd, args.bare, args.retries))

    failures: list[tuple[Path, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        for index, (output_path, ok, message) in enumerate(executor.map(generate_one, tasks), start=1):
            if ok:
                print(f"[{index}/{len(tasks)}] wrote {output_path}")
            else:
                print(f"[{index}/{len(tasks)}] failed {output_path}: {message}", file=sys.stderr)
                failures.append((output_path, message))

    render_indexes(content_root, sections, now)
    if failures:
        return 1
    print(f"Generated {len(tasks)} notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
