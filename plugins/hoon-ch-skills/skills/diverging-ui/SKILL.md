---
name: diverging-ui
description: Uses verbalized sampling to diverge from generic frontend UI directions before implementation. Use when creating or redesigning frontend pages, components, dashboards, tools, games, or visual concepts where the first obvious design is likely to be generic.
---

# Diverging UI

Use this skill when the task needs frontend design judgment, visual direction,
or implementation-ready UI decisions, especially when a normal single-pass
prompt might collapse into a generic layout.

Do not use it for tiny styling fixes unless the user asks for broader design
alternatives.

## Quick Start

1. State that you are using this skill because the work needs diverse frontend
   design direction, not just code.
2. Capture the product, audience, workflow, technical stack, existing design
   system, accessibility needs, and visual constraints. Infer what is clear
   from the repo and ask only about risky unknowns.
3. Identify the most likely generic baseline and explicitly forbid selecting it
   unchanged.
4. Generate 5 to 7 candidate design directions with estimated probabilities
   and typicality scores relative to the full distribution of plausible designs.
5. Pick the lowest-typicality direction that also preserves clarity,
   accessibility, responsiveness, and implementation feasibility. Do not pick
   rare for its own sake.
6. Convert the chosen direction into concrete layout, tokens, components,
   states, assets, motion, and verification steps.

For the paper basis and prompt templates, read
[references/verbalized-sampling.md](references/verbalized-sampling.md) only
when you need the rationale or a more explicit sampling prompt.

## Workflow

### Phase 0: Context Discovery

1. Establish the design problem:
   - identify the user's job to be done, not just the surface type
   - identify what must remain familiar because of domain or design-system fit
   - identify where the interface can safely be more original
   - inspect existing code, screenshots, design tokens, components, and copy
     when available
   - ask a concise question only when the missing context would materially
     change the design direction

### Phase 1: Identify The Mode

2. Name the generic baseline before sampling:
   - describe the most predictable high-probability design for this task
   - call out specific cliches such as card-heavy SaaS grids, centered hero
     sections, stock imagery, purple/blue gradients, generic rounded buttons,
     or default font stacks when they apply
   - do not select this baseline unchanged

### Phase 2: Sample The Long Tail

3. Run verbalized design sampling:
   - ask for 5 to 7 directions
   - include `probability` from `0.0` to `1.0`, defined as likelihood relative
     to the full distribution of plausible frontend designs
   - include `typicality_score` from `0.0` to `1.0`, where `1.0` means the most
     generic or expected direction
   - ensure `typicality_score` generally tracks with `probability`; if a pair
     seems contradictory, flag why it is rare-yet-derivative or common-yet-not
     generic
   - include audience fit, interaction model, layout structure, visual system,
     implementation cost, risk, and typicality justification for each direction
   - treat high-probability directions as likely defaults, not automatic picks

### Phase 3: Tune Diversity

4. Tune diversity when needed:
   - default to full-distribution sampling for ordinary product work
   - if the candidates are still generic, request candidates with probability
     below `0.20`
   - for concept exploration, use `0.10` to reach less typical but still
     plausible directions
   - avoid very low thresholds for production UI unless the task is explicitly
     exploratory

### Phase 4: Select And Commit

5. Select and commit:
   - choose the lowest-typicality direction that preserves clarity,
     accessibility, responsiveness, and implementation feasibility
   - do not choose a rare direction only because it is rare
   - combine directions only when the combination has a single coherent point
     of view
   - be able to explain why the direction is distinctive and why it still fits
     the task

### Phase 5: Implement Or Specify

6. Implement or specify:
   - turn the selected direction into concrete component structure, responsive
     behavior, design tokens, visual hierarchy, interaction states, and
     asset needs
   - prefer the host app's existing UI primitives and conventions when present
   - verify desktop and mobile layout, text fit, contrast, focus states, and
     interactive affordances

### Phase 6: Surprise Check

7. Before delivery, run a surprise check:
   - if the result looks like a common AI-generated template, revise the most
     generic layout, palette, typography, or imagery choice
   - if the result became random or ornamental, return to the quality guardrails
   - ensure the final direction can be described as one coherent design
     personality, not a collage of unrelated tricks

## Quality Guardrails

These guardrails are non-negotiable. If a lower-typicality direction violates
one, move toward a more typical direction until the issue is resolved.

| Guardrail | Requirement |
| --- | --- |
| Visual hierarchy | The user's eye can identify primary, secondary, and supporting information. |
| Contrast and legibility | Text, controls, and data remain readable and meet expected accessibility standards. |
| Internal consistency | Typography, spacing, material, color, and motion follow one coherent system. |
| Functional clarity | Interactive elements look interactive and state changes are understandable. |
| Production feasibility | The design can be implemented with the current stack, time, and component constraints. |
| Quality-diversity balance | Novelty improves the user experience instead of merely making the UI look unusual. |

## Anti-Patterns

- Accidental novelty: unusual choices without a reason tied to the product,
  audience, or workflow.
- Frankenstein style: incompatible aesthetics mixed without synthesis.
- Decorative complexity: motion, texture, or 3D work that does not improve
  comprehension, emotion, or interaction.
- Generic polish: clean spacing and cards that still look interchangeable with
  any AI-generated SaaS page.
- Framework mismatch: ignoring existing design-system primitives, accessibility
  contracts, or domain UI conventions.

## Failure Fallback

- If every direction looks like a common template, rerun sampling with a lower
  probability threshold and name the cliches to avoid.
- If the selected direction becomes ornamental or hard to use, move back toward
  a higher-probability direction and keep only the strongest distinctive detail.
- If the project has an existing design system, sample within that system
  instead of inventing unrelated primitives.
- If implementation time is tight, keep the verbalized sampling pass short and
  choose the best direction with the least structural risk.
- If a model cannot produce useful probabilities, keep the `probability` field
  and ask for a stricter relative-to-full-distribution definition before using
  weaker labels such as "typical" or "novel".

## Examples

### Sampling prompt

```text
Generate 6 frontend design directions for this task:
<task>

Each direction must include:
- name
- probability from 0.0 to 1.0, estimated relative to the full distribution of
  plausible frontend designs for this task
- typicality_score from 0.0 to 1.0, where 1.0 is most generic
- why this direction has that probability and typicality score
- audience fit
- layout structure
- visual system
- primary interaction pattern
- implementation cost
- risk

Include the likely default directions, but also include plausible lower-
probability directions. Then recommend one direction and explain why it is the
best quality-diversity tradeoff.
```

### Baseline prompt

```text
Before proposing alternatives, name the most predictable frontend design for
this task. Identify the exact generic markers that would make it feel like a
common AI-generated interface. Do not select this baseline unchanged.
```

### Product dashboard

Request: "Build an operations dashboard for a power plant monitoring team."

Expected use: sample several directions, recognize that a card-heavy SaaS grid
is a high-probability default, then choose a denser operations-console direction
if it better serves scanability, alarm triage, and repeated use.

### Marketing page

Request: "Create a launch page for a boutique audio product."

Expected use: sample visual directions across editorial, product-detail,
studio-documentary, and high-contrast retail modes, then commit to one coherent
mode before writing layout or copy.

### Internal tool

Request: "Design an admin console for reviewing failed imports."

Expected use: identify the left-nav, table, drawer, and blue-button layout as
the generic baseline, then select a direction that improves repeated-use
scanability, queue triage, and error comparison without sacrificing density for
decorative novelty.

## Guidance

- Treat the first obvious UI idea as a hypothesis, not the answer.
- Use probabilities to expose typicality and avoid silent mode collapse.
- Always name the generic baseline before committing to a direction.
- Preserve the quality-diversity tradeoff: a design must still work as an
  interface.
- Prefer concrete direction over vague adjectives. Name layout, material,
  type scale, color role, motion role, and interaction behavior.
- In conversion-focused pages, a narrative framework such as AIDA can structure
  the page; in dashboards, tools, docs, or internal apps, prioritize efficiency,
  scanning, and repeated use instead.
- Keep the final answer focused on the user's artifact. Do not show the full
  sampling table unless it helps the user make a design decision.
- Show the sampling table when the user asks for design options or wants to
  choose a direction; hide it when the user asked you to build or revise a
  specific artifact.
