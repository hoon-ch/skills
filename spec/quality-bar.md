# Quality Bar

This document defines the minimum standard for a publishable skill in this repository.

## Required

- `SKILL.md` with YAML frontmatter
- a clear description of when the skill should be used
- at least one concrete example or command
- the validator-required sections:
  - `## Quick Start`
  - `## Workflow`
  - `## Failure Fallback`
  - `## Examples`

## Strongly Recommended For Reusable Tool Skills

- `agents/openai.yaml`
- `references/` for detailed protocol or troubleshooting notes
- `scripts/setup.py` for first-run configuration
- a `doctor`, `validate`, or equivalent command
- a read-only smoke command that can prove setup is working
- documented evidence-capture behavior when the skill asks another model,
  service, or CLI to review work

## `SKILL.md` Contract

Reusable skills should include these sections:

- triggers or “use this skill when”
- quick start
- workflow
- failure fallback or raw escape hatch
- examples

Keep `SKILL.md` concise. Move long detail into `references/`.

## Configuration Contract

If the skill stores defaults, use this precedence:

1. CLI flags
2. Environment variables
3. Persisted config

Do not silently mutate shell profiles or global environment files.

## Failure Behavior

- surface upstream errors clearly
- keep raw request or low-level fallback paths documented when helpers can fail
- prefer explicit troubleshooting commands over telling users to inspect secret files manually
- do not let wrapper commands hide the upstream failure status
- preserve enough stdout and stderr for another agent to tell whether a review,
  approval, or rejection actually happened

## Documentation And Evidence

Documentation is part of the skill's behavior. A publishable skill should make
the repeatable workflow explicit enough that another agent can run it without
guessing from prior commits or chat history.

For review, delegation, or orchestration skills:

- document command examples that are safe to copy
- state the default model, permission mode, and available tool surface
- describe how to capture and ignore generated review artifacts
- keep reusable prompts in `references/`
- distinguish content feedback from tool, auth, quota, or wrapper failures

## Repository Documentation

When changing registry-level behavior, update the documentation surface that
matches the reader:

- `README.md`: install commands, published skill list, and common maintainer
  workflow
- `AGENTS.md`: agent-facing maintenance policy and repository-specific rules
- `spec/`: layout contracts, quality expectations, and publishability criteria
- `skills/<name>/SKILL.md`: user-facing trigger and operational workflow for one
  skill
- `skills/<name>/references/`: detailed protocols, prompt templates, examples,
  and troubleshooting notes

Do not rely on repository history or chat context for publish-critical behavior.
If a command, path, plugin field, or validation rule is required, document it in
one of the files above and keep it aligned with `scripts/validate_repo.py`.

## Bundle Readiness

A skill is ready to appear in a category bundle when:

- it passes `scripts/validate_repo.py`
- its setup path and smoke path work
- its `SKILL.md` reflects the actual CLI and file layout
- `npx skills add . -g --list` shows the expected published skill set

Category bundles should only be added when at least two related skills meet that bar.
