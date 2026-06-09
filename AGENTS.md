# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-09
**Commit:** ad9c249
**Branch:** detached HEAD

This repository is a `skills.sh`-first skill registry. Treat `skills/` as the
published surface and keep user-facing README content separate from maintenance
rules.

## Overview

Personal installable skill registry for Codex and Claude Code. The repo exposes
the same skills through `skills.sh`, the Claude manifest, and a Codex plugin.

## Structure

```text
.
├── skills/                    # source of truth for published skills
├── plugins/hoon-ch-skills/    # Codex plugin package and generated skill mirror
├── scripts/                   # scaffold, sync, and validation helpers
├── spec/                      # repository layout and quality bar
├── template/                  # starter scaffold; not installable
└── docs/superpowers/          # historical specs and plans
```

## Where To Look

| Task | Location | Notes |
| --- | --- | --- |
| Add or edit a published skill | `skills/<name>/` | Edit source first, then sync the Codex plugin mirror. |
| Add a new skill scaffold | `scripts/create_skill.py` | Use `--with agents,references,scripts` when the workflow needs them. |
| Validate publishability | `scripts/validate_repo.py` | Checks skill sections, marketplace manifests, and mirror parity. |
| Update Codex plugin package | `plugins/hoon-ch-skills/.codex-plugin/plugin.json` | Keep skill content out of this package except for the generated mirror. |
| Refresh plugin skill content | `scripts/sync_codex_plugin_skills.py` | Recreates `plugins/hoon-ch-skills/skills` from `skills/`. |
| Explain repo policy | `spec/repository-layout.md`, `spec/quality-bar.md` | Treat current scripts as source of truth if older docs disagree. |

## Code Map

| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `main` | function | `scripts/validate_repo.py` | Repository validation gate. |
| `validate_codex_plugin_skill_mirror` | function | `scripts/validate_repo.py` | Enforces real-directory mirror parity. |
| `main` | function | `scripts/sync_codex_plugin_skills.py` | Rebuilds the Codex plugin skill mirror. |
| `render_skill` | function | `scripts/create_skill.py` | Generates the default `SKILL.md` scaffold. |
| `REQUIRED_SKILL_SECTIONS` | constant | `scripts/validate_repo.py` | Required headings for every published skill. |

## Installed Skill Packs

Gstack is also installed and should be used selectively when its workflow is a
better fit than the default direct Codex flow.

Prefer Gstack for product ideation (`/gstack-office-hours`), structured review
(`/gstack-review`), browser QA (`/gstack-browse`, `/gstack-qa`,
`/gstack-qa-only`), visual audit (`/gstack-design-review`), security review
(`/gstack-cso`), and release follow-through (`/gstack-ship`,
`/gstack-document-release`, `/gstack-retro`).

Use Gstack for opinionated review, QA, design, security, and shipping workflows.
Do not force Gstack for small direct edits or simple one-step tasks.

Do not manually edit generated Gstack files under `~/.codex/skills/gstack*` or
project-local `.agents/skills/gstack*`. Refresh Gstack from its repository and
rerun `./setup --host codex` when needed.

## Authoring A Skill

Create a new skill scaffold:

```bash
python3 scripts/create_skill.py my-skill --with agents,references,scripts
```

Keep published skills focused:

- one tool, workflow, or repository rule per skill
- clear frontmatter `name` and `description`
- concise `SKILL.md` with quick start, workflow, fallback, and examples
- detailed protocol notes in `references/`
- repeatable setup or probing logic in `scripts/`

If a skill stores configuration, use this precedence:

1. CLI flags
2. Environment variables
3. Persisted config under `~/.config/hoon-ch-skills/<skill-name>.json`

Do not silently mutate shell profiles or global environment files.

## Bundles

The current Claude plugin marketplace bundle is:

- `all-skills`: every published skill in `skills/`

Add category bundles only when there are at least two stable skills in that
category. Once a bundle name is published, treat it as a public install
contract.

Keep `.claude-plugin/marketplace.json` synchronized with `skills/`. The
validator enforces that `all-skills` includes every published skill and no
template-only paths.

Codex plugin metadata lives in:

- `.agents/plugins/marketplace.json`
- `plugins/hoon-ch-skills/.codex-plugin/plugin.json`
- `plugins/hoon-ch-skills/skills`

Treat `skills/` as the source of truth. Keep `plugins/hoon-ch-skills/skills` as
a generated mirror created by:

```bash
python3 scripts/sync_codex_plugin_skills.py
```

Codex GitHub marketplace installation packages only the selected plugin root and
does not include a symlink target outside that root. Do not manually edit the
mirrored plugin skills; update `skills/` and rerun the sync script instead. The
validator enforces that the mirror is present and byte-for-byte synchronized.

Some older docs under `docs/superpowers/` and `spec/repository-layout.md` still
mention a symlink mirror. Current behavior is a real mirrored directory; trust
`scripts/sync_codex_plugin_skills.py`, `scripts/validate_repo.py`, and this file.

## Validation

Run this before publishing changes:

```bash
python3 scripts/validate_repo.py
npx skills add . -g --list
```

Expected result:

- `validate_repo.py` prints `Repository is valid!`
- `skills.sh` lists only published skills from `skills/`
- template scaffolds do not appear as installable skills
- Codex plugin metadata points at the same `skills/` source

## Design Notes

This repo is intentionally not a general prompt dump. A skill should be
installable, narrow, and operational enough that another agent can follow it
without reading this repository's history.

Template files must not be named `SKILL.md`; use `SKILL.md.template` so
`skills.sh` does not expose scaffolds such as `my-skill`.
