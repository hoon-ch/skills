# Transcript Lecture Note Format

Use this reference when creating or reviewing article-style notes from video,
audio, course, webinar, or tutorial transcripts.

## Directory Layout

Keep source and output separate:

```text
content-root/
  transcripts/
    module-01-foundations/
      01-topic_overview.srt
  notes/
    module-01-foundations/
      01-topic_overview.md
```

The transcript tree is immutable source material. The notes tree is the
human-readable study surface.

## Article Template

```markdown
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

# Topic Overview

## TL;DR

Short summary in the user's working language.

## Why It Matters

Explain the operational, exam, product, or practical reason this lecture
matters.

## Lecture Flow

Rewrite the transcript as a readable article. Preserve every information unit,
but do not copy SRT cue blocks.

Use topic headings that a learner would expect in notes. Do not use cue-range
headings such as `Source cues 1-20`.

## Commands

```bash
example command --flag value
```

Explain what each command proves.

## Key Points

- Application-facing fact.
- Common trap.

## Coverage Checklist

- [x] Named source information unit represented in the article.

## Source

- Transcript: [01-topic_overview.srt](../../transcripts/module-01-foundations/01-topic_overview.srt)
```

Section headings may be localized or adapted to the domain. Keep `TL;DR`,
`Coverage Checklist`, and `Source` stable for validation.

## Optional Frontmatter

The validator tolerates extra scalar fields such as:

- `created`
- `modified`
- additional `tags`
- `aliases`
- `status`

The validator enforces only:

- `kind`
- `coverage`
- `source`
- `source_type`
- `source_cue_count` for SRT and VTT sources

## Coverage Checklist Rules

Treat a source information unit as anything a learner might need later:

- concept definitions
- component responsibilities
- command names and flags
- installation or setup paths
- warnings such as "do not use this in production"
- example numbers from command output
- lab questions and answers
- UI operation steps
- caveats about historical data, storage, auth, version compatibility, or
  other constraints
- references to later course sections
- practice prompts

The checklist is not a summary. It is an audit trail that the article body did
not drop lecture content.

Checklist items must name the covered information unit. Bad: `Cues 1-20:
Introduction`. Good: `Gateway API solves multi-tenant ownership issues that
Ingress handles poorly`.

## Source Handling Rules

- Link the original transcript; do not paste the whole SRT/VTT/TXT into the
  note.
- Preserve timestamps by leaving `.srt` or `.vtt` files unchanged.
- For `.md` source transcripts, link the original Markdown file the same way.
- Use relative links from the note file to the source transcript.
- Keep misspelled source directories in source paths if they exist on disk.
- Use cleaner spelling in `notes/` directories when that improves navigation.

## Style Rules

- Write the article in the user's working language.
- Keep API names, command names, flags, product names, and component names in
  English or their original language when clearer.
- Prefer dense, scannable sections over fluffy prose.
- Keep commands in fenced `bash` blocks.
- Use lecture-topic headings, not transcript mechanics.
- Use lab walkthrough tables or repeated blocks for lab-solution sources.
- Use concept/exam-oriented sections for conceptual sources.
- Commands sections must contain executable commands, YAML snippets, or clear
  command templates. Do not place prose fragments in command fences.
- Avoid generic filler such as "this source transcript turns into a readable
  note"; write the actual takeaway instead.
- Do not add external facts unless clearly labeled as outside-transcript
  context.
- Do not use the note to correct the transcript silently; mention corrections
  only when they matter for learning.

## Quality Gate

Before generating or accepting a large batch, inspect at least three samples:

- a short overview lecture
- a long concept lecture
- a lab solution

The sample fails if it is mostly fixed-size transcript chunks, if headings
mention cue ranges, if commands are not real commands, or if the checklist does
not describe concrete information units.
