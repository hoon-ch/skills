---
name: technical-writing
description: Create or revise technical documentation for developers and end users, including README files, tutorials, how-to guides, troubleshooting docs, reference docs, architecture explanations, and doc reviews. Use when the assistant needs to write docs, restructure existing content, review documentation quality, or turn rough notes into clear Korean-first technical writing.
---

# Technical Writing

Write for the reader's goal, not for the author's mental model. Default to Korean unless the user, repository, or existing document language clearly indicates otherwise.

## Quick Start

Use this skill when the user asks for developer or end-user documentation.

Start by identifying the reader, their goal, and the source of truth. Then
choose the document type, draft or revise the document, and run the review loop
before delivering the final format.

## Workflow

1. Identify the reader, their goal, and the source of truth.
   - Inspect code, configs, docs, screenshots, tickets, or the running product before documenting behavior.
   - Do not invent commands, flags, screenshots, flows, API fields, or env vars.
   - If something cannot be verified, say so plainly.
2. Choose the document type before drafting.
   - Read [references/doc-types.md](references/doc-types.md).
   - Use the reader's goal to choose between learning, problem-solving, reference, and explanation.
   - If the request mixes goals, split the content into separate sections or separate pages instead of forcing one page to do everything.
3. Shape the information architecture.
   - Read [references/structure.md](references/structure.md).
   - Keep one page focused on one primary goal.
   - Put value before background, add a short overview near the top, and keep section patterns predictable.
   - Add cross-links when a concept belongs in another page.
4. Draft or revise the prose.
   - Read [references/style-ko.md](references/style-ko.md) for Korean writing.
   - Prefer explicit actors, active voice, short sentences, concrete verbs, natural Korean, and consistent terminology.
   - Keep headings scannable and keyword-rich.
5. Run a three-pass review before finishing.
   - Read [references/review-loop.md](references/review-loop.md).
   - Pass 1: Is this the right doc type for the reader's goal?
   - Pass 2: Is the structure easy to scan, predict, and navigate?
   - Pass 3: Are the sentences clear, concrete, and natural?
6. Deliver in the requested format.
   - For a new document, produce the final markdown directly unless the user asked for an outline first.
   - For a review, lead with findings and concrete fixes.
   - For a rewrite, preserve verified technical meaning while improving structure and prose.

Use this default output shape when the user does not specify one:

1. Short overview: who this is for and what they can do after reading.
2. Main body: sections chosen from the selected document type template.
3. Verification notes: commands tested, assumptions, and any unverified items.

## Failure Fallback

- If source-of-truth evidence is missing, say what could not be verified and
  keep the draft scoped to confirmed behavior.
- If the request mixes documentation goals, split the content by reader goal or
  document type instead of forcing one structure.
- If Korean terminology is ambiguous, preserve verified commands, paths,
  resource names, API terms, and product names exactly.
- If a review finds structural problems, lead with concrete findings and
  suggested fixes before rewriting.

## Examples

```text
Use this skill to rewrite a README for a Korean developer audience.
```

```text
Use this skill to review troubleshooting docs against the current CLI behavior.
```
