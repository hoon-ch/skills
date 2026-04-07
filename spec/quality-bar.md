# Quality Bar

This document defines the minimum standard for a publishable skill in this repository.

## Required

- `SKILL.md` with YAML frontmatter
- a clear description of when the skill should be used
- at least one concrete example or command

## Strongly Recommended For Reusable Tool Skills

- `agents/openai.yaml`
- `references/` for detailed protocol or troubleshooting notes
- `scripts/setup.py` for first-run configuration
- a `doctor`, `validate`, or equivalent command
- a read-only smoke command that can prove setup is working

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

## Bundle Readiness

A skill is ready to appear in a category bundle when:

- it passes `scripts/validate_repo.py`
- its setup path and smoke path work
- its `SKILL.md` reflects the actual CLI and file layout

Category bundles should only be added when at least two related skills meet that bar.
