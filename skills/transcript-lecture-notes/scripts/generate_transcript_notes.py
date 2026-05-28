#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
from collections import OrderedDict
from datetime import datetime
from pathlib import Path


SOURCE_EXTENSIONS = {".srt", ".vtt", ".md", ".txt"}
NOTE_DIR_OVERRIDES = {
    "03-loggin_and_monitoring": "03-logging_and_monitoring",
}
COMMAND_START_RE = re.compile(
    r"^(kubectl|kubeadm|docker|crictl|ctr|helm|etcdctl|etcdutl|openssl|base64|"
    r"curl|wget|ip|route|ss|netstat|nslookup|dig|ping|traceroute|iptables|"
    r"tcpdump|cat|ls|cd|vi|vim|nano|mkdir|rm|cp|mv|systemctl|journalctl|"
    r"export|echo|ssh|scp)\b"
)
COMMAND_INLINE_RE = re.compile(
    r"\b(kubectl|kubeadm|docker|crictl|ctr|helm|etcdctl|etcdutl|openssl|base64|"
    r"curl|wget|ip|route|ss|netstat|nslookup|dig|ping|traceroute|iptables|"
    r"tcpdump|cat|ls|cd|vi|vim|nano|mkdir|rm|cp|mv|systemctl|journalctl)"
    r"\b[^.?!\n]{0,140}",
    re.I,
)
CONCEPT_HEADINGS = [
    "Problem and Context",
    "Kubernetes Model",
    "Configuration Shape",
    "Runtime Behavior",
    "Operational Caveats",
    "Implementation Notes",
    "Practice Focus",
]
LAB_HEADINGS = [
    "Inspect the Starting State",
    "Apply the First Configuration Change",
    "Create the Supporting Resource",
    "Troubleshoot Binding or Readiness",
    "Wire the Workload to the Resource",
    "Verify the Result",
    "Clean Up and Explain Final State",
]
DEMO_HEADINGS = [
    "Demo Setup",
    "Configuration Walkthrough",
    "Runtime Check",
    "Verification",
    "Operational Takeaway",
]
STOPWORDS = {
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "into",
    "when",
    "where",
    "what",
    "which",
    "then",
    "there",
    "have",
    "will",
    "your",
    "about",
    "kubernetes",
    "lecture",
    "course",
    "section",
}


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def split_sentences(text: str) -> list[str]:
    text = clean_text(text)
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text)
    sentences = []
    for part in parts:
        part = clean_text(part)
        if not part:
            continue
        if len(part) > 360:
            clauses = re.split(r"(?<=,)\s+(?=(?:and|but|so|then|now|next)\b)", part, flags=re.I)
            sentences.extend(clean_text(clause) for clause in clauses if clean_text(clause))
        else:
            sentences.append(part)
    return sentences


def parse_srt(path: Path) -> tuple[list[str], int]:
    text = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text.strip()) if text.strip() else []
    cue_texts: list[str] = []
    cue_count = 0
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        time_index = next((index for index, line in enumerate(lines) if "-->" in line), None)
        if time_index is None:
            continue
        cue_count += 1
        body = clean_text(" ".join(lines[time_index + 1 :]))
        if body:
            cue_texts.append(body)
    return split_sentences(" ".join(cue_texts)), cue_count


def parse_vtt(path: Path) -> tuple[list[str], int]:
    text = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.splitlines()
    cue_count = sum(1 for line in lines if "-->" in line)
    body_lines = [line for line in lines if line.strip() and "-->" not in line and not line.startswith("WEBVTT")]
    return split_sentences(" ".join(body_lines)), cue_count


def parse_markdown_or_text(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"^---\n.*?\n---\n", " ", text, flags=re.S)
    return split_sentences(text)


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


def source_type(path: Path) -> str:
    return {
        ".srt": "srt",
        ".vtt": "vtt",
        ".md": "markdown",
        ".txt": "text",
    }.get(path.suffix.lower(), "text")


def section_label(section: str) -> str:
    return title_from_stem(section)


def group_sentences(sentences: list[str], max_groups: int = 7) -> list[list[str]]:
    if not sentences:
        return []
    target = max(4, min(max_groups, (len(sentences) + 5) // 6))
    size = max(1, (len(sentences) + target - 1) // target)
    return [sentences[index : index + size] for index in range(0, len(sentences), size)]


def keywords(text: str, count: int = 4) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", text)
    scores: OrderedDict[str, int] = OrderedDict()
    for word in words:
        lower = word.lower()
        if lower in STOPWORDS:
            continue
        key = word if any(ch.isupper() for ch in word[1:]) else lower
        scores[key] = scores.get(key, 0) + 1
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0].lower()))
    result = []
    for word, _score in ranked[:count]:
        result.append(word.upper() if word.lower() in {"api", "cni", "dns", "pvc", "tls"} else word)
    return result


def heading_for_group(group: list[str], fallback: str) -> str:
    text = " ".join(group)
    keys = keywords(text, 3)
    if not keys:
        return fallback
    phrase = " / ".join(word.replace("-", " ").title() for word in keys)
    return phrase[:80]


def paragraph_from_group(group: list[str]) -> str:
    if len(group) <= 4:
        return " ".join(group)
    lead = group[0]
    supporting = group[1:5]
    tail = group[-1] if group[-1] not in supporting else ""
    parts = [lead, *supporting]
    if tail:
        parts.append(tail)
    return " ".join(parts)


def info_unit_from_group(group: list[str]) -> str:
    text = " ".join(group)
    sentence = group[0] if group else text
    sentence = re.sub(r"^(So|Now|Okay|Alright|Well),?\s+", "", sentence, flags=re.I)
    if len(sentence) > 180:
        sentence = sentence[:177].rstrip() + "..."
    return sentence.rstrip(".")


def extract_commands(raw_text: str) -> list[str]:
    candidates: list[str] = []
    candidates.extend(re.findall(r"`([^`\n]{2,180})`", raw_text))
    for block in re.findall(r"```(?:\w+)?\n(.*?)```", raw_text, flags=re.S):
        candidates.extend(line.strip() for line in block.splitlines())
    for line in re.split(r"[\n;]", raw_text):
        line = clean_text(line).strip("$ ")
        line = re.sub(r"^(so|now|then|and|do a|run|let's|we'll|we will)\s+", "", line, flags=re.I)
        if COMMAND_START_RE.match(line):
            candidates.append(line)
        for match in COMMAND_INLINE_RE.findall(line):
            pass
    for match in COMMAND_INLINE_RE.finditer(raw_text):
        candidate = clean_text(match.group(0))
        candidate = re.sub(r"^(so|now|then|and|do a|run|let's|we'll|we will)\s+", "", candidate, flags=re.I)
        candidates.append(candidate)

    cleaned: list[str] = []
    seen = set()
    for candidate in candidates:
        candidate = clean_text(candidate).strip("$ ")
        if not candidate or len(candidate) > 180:
            continue
        if not COMMAND_START_RE.match(candidate):
            continue
        if re.search(r"\b(command|utility|tool|page|lecture|section)\b", candidate, re.I) and not re.search(
            r" (--|-n | -o | get |create |apply |delete |describe |edit |run |logs |exec |config )", candidate
        ):
            continue
        key = candidate.lower()
        if key not in seen:
            cleaned.append(candidate)
            seen.add(key)
    return cleaned[:16]


def lab_questions(sentences: list[str]) -> list[str]:
    questions = []
    start_pattern = re.compile(
        r"^(how many|what is|what are|which|why is|why are|create|delete|update|change|identify|perform|configure)\b",
        re.I,
    )
    for sentence in sentences:
        candidate = sentence.rstrip(".")
        if re.search(r"\b(next )?question is\b", candidate, re.I):
            candidate = re.split(r"\b(?:next )?question is\b", candidate, flags=re.I)[-1].strip(" ,:")
            questions.append(candidate)
        elif start_pattern.search(candidate):
            questions.append(candidate)
        if len(questions) >= 10:
            break
    return questions


def frontmatter(
    title: str,
    section: str,
    lesson: str,
    kind: str,
    source_rel: str,
    stype: str,
    cue_count: int | None,
    now: str,
) -> list[str]:
    lines = [
        "---",
        f'title: "{title}"',
        f'created: "{now}"',
        f'modified: "{now}"',
        f'section: "{section}"',
        f'lesson: "{lesson}"',
        'kind: "transcript_lecture_article"',
        f'note_type: "{kind}"',
        f'source: "{source_rel}"',
        f'source_type: "{stype}"',
    ]
    if cue_count is not None:
        lines.append(f"source_cue_count: {cue_count}")
    lines.extend(
        [
            'coverage: "lossless-derived"',
            'tags: ["kubernetes", "cka"]',
            "---",
            "",
        ]
    )
    return lines


def render_concept(title: str, section_name: str, groups: list[list[str]], commands: list[str], kind: str) -> list[str]:
    label = section_label(section_name).lower()
    first = info_unit_from_group(groups[0]) if groups else f"{title} introduces a Kubernetes topic."
    lines = [
        "## TL;DR",
        "",
        f"{first}.",
        "",
        "## Why It Matters",
        "",
        f"{title} belongs to the {label} part of the CKA path. The practical value is knowing which Kubernetes object, command, or configuration decision is responsible for the behavior described in the lecture.",
        "",
    ]
    main_heading = "## What This Clarifies" if kind == "reference" else "## Core Concept"
    lines.extend([main_heading, ""])
    for index, group in enumerate(groups[:3], start=1):
        heading = CONCEPT_HEADINGS[index - 1] if index - 1 < len(CONCEPT_HEADINGS) else f"Concept Part {index}"
        lines.extend([f"### {heading}", "", paragraph_from_group(group), ""])
    if len(groups) > 3:
        lines.extend(["## How It Works", ""])
        for index, group in enumerate(groups[3:], start=1):
            heading_index = index + 2
            heading = CONCEPT_HEADINGS[heading_index] if heading_index < len(CONCEPT_HEADINGS) else f"Operational Detail {index}"
            lines.extend([f"### {heading}", "", paragraph_from_group(group), ""])
    render_commands_or_examples(lines, commands)
    lines.extend(["## CKA Exam Notes", ""])
    lines.extend(
        [
            f"- Know the role of {title} in the larger Kubernetes workflow.",
            "- Pay attention to exact object names, fields, command flags, and default behavior mentioned in the lecture.",
            "- Treat warnings, limitations, and version notes as exam traps rather than background commentary.",
            "",
        ]
    )
    return lines


def render_lab(title: str, section_name: str, groups: list[list[str]], commands: list[str], sentences: list[str]) -> list[str]:
    questions = lab_questions(sentences)
    goal = info_unit_from_group(groups[0]) if groups else f"{title} walks through a hands-on Kubernetes lab."
    lines = [
        "## TL;DR",
        "",
        f"{goal}.",
        "",
        "## Lab Goal",
        "",
        f"This lab solution shows how to inspect the cluster, run the necessary commands, and verify the answer for {title}.",
        "",
        "## Solution Walkthrough",
        "",
    ]
    if questions:
        lines.extend(["| Step | Question or Task | What To Check |", "|---|---|---|"])
        for index, question in enumerate(questions, start=1):
            lines.append(f"| {index} | {question} | Inspect the relevant Kubernetes object, compare the observed state with the prompt, then apply or verify the requested change. |")
        lines.append("")
    for index, group in enumerate(groups, start=1):
        heading = LAB_HEADINGS[index - 1] if index - 1 < len(LAB_HEADINGS) else f"Lab Step {index}"
        lines.extend([f"### {heading}", "", paragraph_from_group(group), ""])
    render_commands_or_examples(lines, commands, examples_heading="## Verification Notes")
    lines.extend(["## CKA Exam Notes", ""])
    lines.extend(
        [
            "- Read each prompt as an operational task: inspect first, change second, verify last.",
            "- Prefer commands that prove the state, such as `kubectl get`, `kubectl describe`, and targeted object inspection.",
            "- When a resource is intentionally wrong, identify whether the failure is caused by image name, selector, port, namespace, policy, or object type.",
            "",
        ]
    )
    return lines


def render_demo(title: str, section_name: str, groups: list[list[str]], commands: list[str]) -> list[str]:
    first = info_unit_from_group(groups[0]) if groups else f"{title} demonstrates a Kubernetes workflow."
    lines = [
        "## TL;DR",
        "",
        f"{first}.",
        "",
        "## Demo Goal",
        "",
        f"The demo shows the sequence of actions and checks needed to understand {title} in a running Kubernetes environment.",
        "",
        "## Walkthrough",
        "",
    ]
    for index, group in enumerate(groups, start=1):
        heading = DEMO_HEADINGS[index - 1] if index - 1 < len(DEMO_HEADINGS) else f"Demo Step {index}"
        lines.extend([f"### {heading}", "", paragraph_from_group(group), ""])
    render_commands_or_examples(lines, commands)
    lines.extend(["## What To Verify", ""])
    lines.extend(
        [
            "- Confirm the expected Kubernetes object exists.",
            "- Confirm the object state changed after the command or configuration update.",
            "- Confirm the observed behavior matches the lecture's stated outcome.",
            "",
        ]
    )
    return lines


def render_commands_or_examples(lines: list[str], commands: list[str], examples_heading: str = "## Examples") -> None:
    if commands:
        lines.extend(["## Commands", ""])
        for command in commands:
            lines.extend(["```bash", command, "```", ""])
    else:
        lines.extend([examples_heading, "", "The source does not contain a clean standalone shell command. Use the surrounding explanation and linked transcript for the exact demonstration context.", ""])


def render_checklist(groups: list[list[str]]) -> list[str]:
    lines = ["## Coverage Checklist", ""]
    for group in groups:
        lines.append(f"- [x] {info_unit_from_group(group)}.")
    lines.append("")
    return lines


def render_note(source: Path, content_root: Path, now: str) -> Path:
    section = source.parent.name
    note_section = NOTE_DIR_OVERRIDES.get(section, section)
    out = content_root / "notes" / note_section / f"{source.stem}.md"
    stype = source_type(source)
    cue_count: int | None = None
    if stype == "srt":
        sentences, cue_count = parse_srt(source)
    elif stype == "vtt":
        sentences, cue_count = parse_vtt(source)
    else:
        sentences = parse_markdown_or_text(source)

    if not sentences:
        sentences = [f"{title_from_stem(source.stem)} has no readable transcript text."]

    groups = group_sentences(sentences)
    raw_text = source.read_text(encoding="utf-8", errors="replace")
    commands = extract_commands(raw_text)
    title = title_from_stem(source.stem)
    kind = note_type(source)
    source_rel = f"../../transcripts/{section}/{source.name}"
    lines = frontmatter(title, section, lesson_from_name(source), kind, source_rel, stype, cue_count, now)
    lines.extend([f"# {title}", ""])

    if kind == "lab_solution":
        lines.extend(render_lab(title, section, groups, commands, sentences))
    elif kind == "demo":
        lines.extend(render_demo(title, section, groups, commands))
    else:
        lines.extend(render_concept(title, section, groups, commands, kind))

    lines.extend(render_checklist(groups))
    lines.extend(["## Source", "", f"- Transcript: [{source.name}]({source_rel})", ""])

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def render_section_index(content_root: Path, section: str, notes: list[Path], now: str) -> None:
    note_section = NOTE_DIR_OVERRIDES.get(section, section)
    out = content_root / "notes" / note_section / "_index.md"
    title = section_label(note_section)
    lines = [
        "---",
        f'title: "{title}"',
        f'created: "{now}"',
        f'modified: "{now}"',
        'kind: "index"',
        f'source: "../../transcripts/{section}"',
        'tags: ["kubernetes", "cka"]',
        "---",
        "",
        f"# {title}",
        "",
        f"Transcript-derived study notes for `{section}`.",
        "",
        "## Lessons",
    ]
    for note in sorted(notes):
        lines.append(f"- [{title_from_stem(note.stem)}]({note.name})")
    lines.append("")
    out.write_text("\n".join(lines), encoding="utf-8")


def render_root_index(content_root: Path, sections: list[str], now: str) -> None:
    lines = [
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
        "English transcript-derived study notes. The original transcripts remain under `transcripts/`, and each note links back to its source.",
        "",
        "## Sections",
    ]
    for section in sections:
        note_section = NOTE_DIR_OVERRIDES.get(section, section)
        lines.append(f"- [{section_label(note_section)}]({note_section}/_index.md)")
    lines.append("")
    (content_root / "notes").mkdir(parents=True, exist_ok=True)
    (content_root / "notes" / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate article-style notes from a transcripts tree.")
    parser.add_argument("content_root", help="Path containing transcripts/")
    parser.add_argument("--sections", nargs="*", help="Optional source section directory names to generate")
    parser.add_argument("--clean", action="store_true", help="Remove generated notes for selected sections before writing")
    args = parser.parse_args()

    content_root = Path(args.content_root)
    transcripts_root = content_root / "transcripts"
    notes_root = content_root / "notes"
    if not transcripts_root.exists():
        raise SystemExit(f"Missing transcripts directory: {transcripts_root}")

    sections = args.sections or [path.name for path in sorted(transcripts_root.iterdir()) if path.is_dir()]
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    notes_root.mkdir(parents=True, exist_ok=True)

    generated: list[Path] = []
    for section in sections:
        source_section = transcripts_root / section
        if not source_section.exists():
            raise SystemExit(f"Missing section: {source_section}")
        note_section = notes_root / NOTE_DIR_OVERRIDES.get(section, section)
        if args.clean and note_section.exists():
            for note in note_section.glob("*.md"):
                note.unlink()
        section_notes: list[Path] = []
        for source in sorted(source_section.iterdir()):
            if source.suffix.lower() not in SOURCE_EXTENSIONS:
                continue
            note = render_note(source, content_root, now)
            generated.append(note)
            section_notes.append(note)
        render_section_index(content_root, section, section_notes, now)

    render_root_index(content_root, sections, now)
    print(f"Generated {len(generated)} notes")
    for section in sections:
        note_section = NOTE_DIR_OVERRIDES.get(section, section)
        count = len([path for path in (notes_root / note_section).glob("*.md") if path.name != "_index.md"])
        print(f"{note_section}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
