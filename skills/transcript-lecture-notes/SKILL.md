---
name: transcript-lecture-notes
description: Convert video or audio transcripts into blog-style Markdown lecture notes while preserving the original SRT, VTT, TXT, or Markdown transcripts as linked source files. Use when creating or reviewing notes from a transcripts/ tree into a parallel notes/ tree.
---

# Transcript Lecture Notes

Use this skill when transforming course, lecture, webinar, or tutorial
transcripts into readable study notes.

The default pattern is:

- keep `transcripts/` unchanged as the source of truth
- write human-readable notes under `notes/`
- make each note read like a compact blog post or study article
- link back to the original transcript instead of embedding the full transcript
- prove coverage with a checklist, not with duplicated transcript text

## Quick Start

1. State that this skill applies because the task turns transcripts into
   lecture/article notes.
2. Locate the content root and confirm it has a `transcripts/` tree or an
   equivalent source-transcript folder.
3. Create or update a parallel `notes/` tree without modifying source
   transcripts.
4. For each source file, write one Markdown note with:
   - frontmatter source link
   - article-style body
   - commands, examples, or references when present
   - exam, practice, or application points when useful
   - `Coverage Checklist`
   - `Source` link
5. Run the bundled validator, `scripts/validate_transcript_notes.py`, before
   reporting completion.

## Note Contract

Use one note per source transcript.

Required frontmatter:

```yaml
---
title: "Topic Overview"
section: "module-01-foundations"
lesson: "01"
kind: "transcript_lecture_article"
note_type: "concept"
source: "../../transcripts/module-01-foundations/01-topic_overview.srt"
source_type: "srt"
source_cue_count: 24
coverage: "lossless-derived"
tags: ["course-notes"]
---
```

For non-SRT sources:

- use `source_type: "vtt"` for WebVTT
- use `source_type: "markdown"` for Markdown transcripts or source notes
- use `source_type: "text"` for plain text transcripts
- include `source_cue_count` for SRT and VTT sources
- omit `source_cue_count` for Markdown and text sources unless useful

Required sections:

- `## TL;DR`
- topic-specific article headings that follow the lecture flow
- `## Commands`, `## Examples`, or a domain-specific equivalent when the
  source contains commands or concrete examples
- `## Key Points` or a localized/domain-specific application section
- `## Coverage Checklist`
- `## Source`

Do not include full raw transcript blocks in normal article notes. The source
transcript already preserves the original video/audio transcript.

## Workflow

1. Inventory the sources:

   ```bash
   find <content-root>/transcripts -type f \( -name '*.srt' -o -name '*.vtt' -o -name '*.md' -o -name '*.txt' \) | sort
   ```

2. Mirror the section structure under `notes/`.
   - Preserve source directory names in `source` paths.
   - Clean up note directory names when useful for navigation, but keep source
     links pointed at the actual on-disk transcript paths.

3. Read the source transcript enough to identify every information unit:
   - concept definitions
   - warnings and caveats
   - commands, options, UI steps, or examples
   - example values and answers
   - lab, exercise, or demonstration steps
   - decision criteria
   - references to later material
   - practice prompts or next actions

4. Write the article body in the user's working language by default.
   - Keep domain terms, commands, APIs, and product names in their original
     language where that is clearer.
   - Prefer natural blog-post paragraphs over transcript-like line-by-line
     rewriting.
   - Do not invent facts outside the transcript unless clearly marked as
     outside-transcript context.

5. Build the `Coverage Checklist` from the source.
   - Include every meaningful source information unit.
   - Include concrete command names, warnings, example numbers, and lab
     answers.
   - Mark items checked only when represented in the article body.

6. Add a `Source` section with a relative Markdown link to the original
   transcript:

   ```markdown
   ## Source

   - Transcript: [01-topic_overview.srt](../../transcripts/module-01-foundations/01-topic_overview.srt)
   ```

7. Validate the generated notes:

   ```bash
   python <path-to-skill>/scripts/validate_transcript_notes.py <content-root>
   ```

   When working inside this skill repository, `<path-to-skill>` is
   `skills/transcript-lecture-notes`.

## Failure Fallback

- If a source transcript is ambiguous, keep the note conservative and add the
  ambiguous point to `Coverage Checklist` instead of silently dropping it.
- If the source is too long for one pass, create the note in sections but keep
  one output file per source file.
- If the validator reports a broken source link, fix the frontmatter `source`
  path and the `Source` section link before changing content.
- If a note lacks coverage confidence, leave `coverage: "needs-review"` and
  tell the user which transcript needs manual review.
- Do not rewrite or normalize files inside `transcripts/` unless the user
  explicitly asks for transcript maintenance.

## Examples

Create article notes from a course transcript tree:

```bash
mkdir -p course-root/notes/module-01-foundations
```

Validate the notes tree:

```bash
python <path-to-skill>/scripts/validate_transcript_notes.py course-root
```

Inspect missing links or checklist gaps:

```bash
python <path-to-skill>/scripts/validate_transcript_notes.py course-root --verbose
```

Run the bundled public smoke example from this repository:

```bash
python skills/transcript-lecture-notes/scripts/validate_transcript_notes.py skills/transcript-lecture-notes/examples
```

## Reference Map

- Read `references/note-format.md` for the canonical note template and
  checklist rules.
- Use `scripts/validate_transcript_notes.py` after creating or editing notes.
