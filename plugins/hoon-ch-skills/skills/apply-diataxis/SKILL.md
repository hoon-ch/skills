---
name: apply-diataxis
description: Apply the Diátaxis framework to classify documentation needs, separate mixed modes, audit documentation quality, and design need-oriented information architecture. Use when the assistant is explicitly asked to use Diátaxis, distinguish tutorials, how-to guides, reference, and explanation, restructure mixed-mode pages or documentation sets, or assess whether docs fit learning, goal, information, or understanding needs; then guide source-grounded creation or revision in the selected mode.
---

# Apply Diátaxis

Organize documentation around the reader's need. Treat Diátaxis as a decision
tool for documentation purpose, form, and architecture, not as a substitute for
technical verification.

## Quick Start

1. Inspect the available source of truth before writing.
2. Identify the reader, their situation, goal, and current competence.
3. Read [references/framework.md](references/framework.md) and classify the
   primary need with the Diátaxis compass.
4. Read the matching section in [references/modes.md](references/modes.md).
5. Draft, revise, or audit for one primary purpose per page.
6. Verify technical facts, then review both functional and deep quality.

Choose the output language in this order:

1. The user's explicit language request
2. The existing document or repository convention
3. The language of the supplied source material
4. The conversation language

Preserve commands, paths, API names, identifiers, and product names exactly.
Prefer idiomatic meaning over literal translation.

## Workflow

### 1. Ground the work

- Inspect code, configuration, schemas, commands, logs, tickets, screenshots,
  or the running product that the document describes.
- Record the intended reader, their working context, their competence, and the
  outcome they need.
- Do not invent technical behavior. Mark any fact that cannot be verified.

### 2. Classify with the compass

Ask two questions:

1. Does the reader need to act, or to know and understand?
2. Are they acquiring competence, or applying competence in real work?

Map the answers:

| Action/cognition | Acquisition/application | Mode |
| --- | --- | --- |
| Action | Acquisition | Tutorial |
| Action | Application | How-to guide |
| Cognition | Application | Reference |
| Cognition | Acquisition | Explanation |

State the primary mode before drafting. If classification remains unclear,
apply the questions to individual sentences and sections, then separate the
different purposes.

### 3. Define one job per page

- Give each page one primary reader need and one mode.
- Move substantial content with another purpose to a separate page.
- Replace removed material with a useful cross-link.
- Keep only the minimum context required to use the current page safely.

### 4. Write for the selected mode

Read [references/modes.md](references/modes.md) and follow its contract:

- Build tutorials as managed, reliable learning experiences.
- Build how-to guides around real goals for competent practitioners.
- Build reference as neutral, consistent description of the machinery.
- Build explanation around a bounded topic, context, connections, and reasons.

### 5. Shape the document set

For multi-page work, read
[references/architecture-quality.md](references/architecture-quality.md).

- Organize around user needs, not only product features.
- Do not create four empty top-level sections merely to resemble the map.
- Improve the smallest useful unit and allow the larger structure to emerge
  from well-formed pages.
- Use overview pages and cross-links when readers need multiple modes around
  the same subject.

### 6. Review quality

Read the full criteria for
[functional quality](references/architecture-quality.md#assess-functional-quality)
and [deep quality](references/architecture-quality.md#assess-deep-quality).

Check functional quality against the source of truth:

- accuracy
- completeness for the page's declared purpose
- consistency
- usefulness
- precision

Then judge deep quality against the reader's experience:

- fit to the reader's need
- flow
- anticipation of the next question or action
- ease and confidence of use

Diátaxis can reveal functional defects, but it does not prove factual
correctness or completeness. Run the relevant technical checks separately.

### 7. Deliver the result

For creation or revision, provide the finished document in the requested
format. For an audit, lead with mode mismatches and the smallest concrete fixes.
Include verification notes only when they help distinguish confirmed behavior,
assumptions, and unresolved facts.

## Failure Fallback

- If the intended reader or need cannot be discovered, ask one focused question
  before choosing a mode.
- If a page mixes modes, split it or clearly separate sections and cross-link
  them; do not force all content into one label.
- If the source of truth is unavailable, limit the document to confirmed facts
  and label the remainder as unverified.
- If a documentation set is large or disordered, improve one page, section, or
  paragraph at a time instead of proposing a wholesale rewrite first.
- If the task only needs sentence-level polishing without Diátaxis
  classification or architecture, prefer the `technical-writing` skill.

## Examples

```text
Use this skill to turn a mixed onboarding README into a tutorial plus linked reference pages.
```

```text
Use this skill to audit our deployment documentation and separate learning material from operator how-to guides.
```

```text
Use this skill to design an API documentation set with task guides, reference, and conceptual explanation.
```
