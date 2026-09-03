---
name: explain-me
description: Turn a technical topic, codebase, system, workflow, API interaction, data pipeline, or lifecycle into a dead-simple, picture-first standalone HTML explainer. Combine ELI5 communication—large visuals and few words—with Archify's typed diagram selection, validation, delivery, and source-grounding workflow. Do not use for generic illustration, implementation-only work, or a text-only summary.
---

# Explain Me

Explain the real thing to a reader who knows nothing about it, without making the
thing less true.

ELI5 controls **how the explanation reads**. Archify controls **how the diagram is
modeled, rendered, checked, and delivered**.

## Quick Start

Default to one Archify-delivered, self-contained `explainer.html` with inline
SVG. Through its title, diagram, labels, and only schema-supported cards or
views, the page should answer:

1. **What is it?** — one plain-language sentence.
2. **How does it work?** — one dominant diagram.
3. **What should I remember?** — one short takeaway.

When Archify is installed, also keep the typed candidate JSON beside the HTML.
For repository-backed explanations, add a short `sources.md` only when the user
needs traceability or the handoff would otherwise be hard to verify.

The picture carries the explanation. Do not prepend a long report. Static output
is the default; use motion only when the user explicitly asks for a demo or when
ordered change cannot be understood from a static frame.

## Workflow

### 1. Fix the teaching target

Identify the exact question the picture must answer. Examples:

- What are the major parts of this system?
- What happens after this API call?
- How does data move and change?
- Which states can this object enter?
- What steps does this operational process follow?

Assume the reader is new to the subject unless the conversation establishes a
more technical audience. Simplify language, not semantics. Preserve exact product
names, code identifiers, commands, protocols, API paths, events, tables, and
environment names.

Read `references/eli5-contract.md` before writing the explanatory copy.

### 2. Choose one Archify diagram type

Use the meaning of the explanation—not the source file format—to select one type:

| Type | Use for |
| --- | --- |
| `architecture` | Components, services, infrastructure, and system boundaries |
| `workflow` | Steps, decisions, approvals, tools, and runbooks |
| `sequence` | Time-ordered calls, messages, async work, and returns |
| `dataflow` | Data movement, transformation, custody, lineage, and consumers |
| `lifecycle` | States, transitions, retries, waiting, failure, and completion |

Use a single primary type. When two views are genuinely required, make an
overview first and a second focused explainer rather than mixing two layout
grammars into one picture.

For Mermaid input, preserve its meaning but author a fresh typed candidate:

- `flowchart` or `graph` → `workflow`, or `architecture` for a component map;
- `sequenceDiagram` → `sequence`;
- `stateDiagram` → `lifecycle`.

Read `references/archify-contract.md` before authoring or delivering the diagram.

### 3. Ground explanations that claim to describe reality

For a conceptual topic, the user's description may be sufficient. For a real
repository or deployment, inspect the evidence needed for the selected question
before drawing:

- entrypoints and deployable units;
- runtime boundaries and external systems;
- storage, queues, topics, APIs, ports, and configuration bindings;
- deployment manifests and operational configuration;
- the code or configuration that proves each important relationship.

Do not infer causality from filenames, directory proximity, or components merely
appearing in the same manifest. Do not run untrusted project code, installers,
migrations, or deployment commands just to obtain a diagram.

Keep source notes outside the Archify candidate unless the selected schema
explicitly supports them. Do not invent JSON fields. If a material fact cannot be
verified, omit it from the canonical path or label it plainly as unverified when
the schema and user request require showing intended behavior.

### 4. Write the ELI5 frame before the detailed labels

Draft these three pieces first:

```text
One-line answer: <what this is and why it exists>
Main story: <the single path the reader should follow>
Takeaway: <the one fact worth remembering>
```

Then map the story to diagram nodes and relationships.

Use familiar words for human-facing labels and exact technical terms as short
secondary labels when needed. An analogy is optional. Use one only when it helps
the reader predict the real system; state its limit in one sentence when the
analogy could mislead about ownership, durability, ordering, concurrency, or
failure.

### 5. Author a small typed candidate

When an Archify package is available:

1. Read the selected type schema, `schemas/common.schema.json`, and one matching
   example from that installed package.
2. Create fresh stable IDs, wording, facts, and layout. Examples define field
   shape, not content.
3. Set `meta.quality_profile` to `"showcase"` unless the user explicitly asks for
   a dense technical map.
4. Start with one obvious main path, short side branches, sparse labels, and at
   most 12 primary nodes.
5. Let the renderer own automatic placement and routing first. Add manual geometry
   controls only in response to a validator diagnostic.
6. Preserve meaningful relationship labels. Do not remove protocol, direction,
   action, sync/async, or cross-boundary meaning merely to make the layout easier.

Do not copy an existing example's facts, IDs, or visual story.

### 6. Apply the ELI5 presentation pass to the candidate

Before final validation, make first-time understanding the priority using only
fields and presentation surfaces supported by the selected Archify schema:

- lead with the one-line answer;
- let the diagram carry most of the explanation;
- prefer a few large, recognizable elements to dense prose;
- keep the main path visually obvious;
- use short labels and reveal detail only where it changes understanding;
- keep the exact technical term near its plain-language explanation;
- end with one takeaway when the schema provides an appropriate card or view.

If the selected schema has no appropriate place for supporting prose, keep that
line in the handoff rather than inventing a field or patching the delivered HTML.
Do not use a childish voice, mascots, decorative metaphors, or cartoon styling
unless the user asks for them. "Like I'm five" means no assumed knowledge, not
reduced intellectual respect.

### 7. Validate and deliver through Archify when available

Locate the installed Archify package and follow its local `SKILL.md`; its schemas,
commands, and diagnostics are authoritative. The ordinary command sequence is:

```bash
node <archify-root>/bin/archify.mjs validate <type> <candidate.json> \
  --quality showcase --json

node <archify-root>/bin/archify.mjs deliver <type> <candidate.json> \
  <output.html> --quality showcase --json

node <archify-root>/bin/archify.mjs visual-check <output.html> --json
```

Validate after each candidate edit and immediately before delivery. A non-zero
exit is a failure. Once the final candidate passes, do not edit it before
`deliver`, and never patch the delivered HTML afterward while claiming the same
receipt. A successful delivery receipt proves deterministic artifact checks;
`visual-check` proves bounded browser behavior; neither proves that a person or
image-capable reviewer inspected the composition.

### 8. Inspect and hand off truthfully

Open the delivered HTML when the environment permits. Check that the first view
is readable, the main path is obvious, labels are not clipped, and the page still
works without animation. Check narrow/mobile behavior when the artifact is meant
to be shared outside a desktop-only context.

Return:

- the HTML path or link;
- the selected Archify type;
- the one-line answer;
- validation and delivery status;
- browser-evidence status;
- perceptual-review status;
- material source or runtime limitations.

Do not claim a check that did not run.

## Failure Fallback

If Archify is not installed or its CLI cannot run, still produce a self-contained
HTML file with inline SVG and the same three-part ELI5 frame. Choose one of the
five Archify types as the semantic model, keep one main story, and use simple
shapes and connectors sufficient to explain it.

In fallback mode:

- do not claim Archify schema validation, showcase acceptance, delivery receipts,
  or browser evidence that was not produced;
- keep the artifact static and dependency-free;
- preserve source-grounding and exact technical names;
- state that the result is a manual fallback rather than validated Archify output;
- return the useful partial artifact instead of inventing missing facts.

If the topic is better explained by a paragraph or table than a picture, say so
and use the simpler form rather than manufacturing a diagram.

## Examples

Explain a repository to a new contributor:

```text
Use $explain-me to show what this repository runs, the main request path, and the one thing a new contributor should remember.
```

Trace an API interaction:

```text
Use $explain-me with a sequence diagram to explain what happens from POST /orders until the asynchronous worker finishes.
```

Explain a data pipeline without assuming data-engineering knowledge:

```text
Use $explain-me with a dataflow diagram. Use plain-language labels first and keep exact topic, table, and job names as secondary labels.
```

Explain a state machine:

```text
Use $explain-me to turn this state transition code into a lifecycle explainer with one-sentence framing and a single takeaway.
```
