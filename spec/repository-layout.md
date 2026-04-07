# Repository Layout

This repository is a personal, `skills.sh`-first skill registry modeled after `anthropics/skills`.

## Operating Model

- `repo = marketplace`
- `skill = product`
- `bundle = install surface`

The repo stays broad. Each skill stays narrow.

## Goals

- Keep every skill self-contained
- Make repo install, bundle install, and single-skill install all work cleanly
- Publish stable bundle names without frequent churn
- Let a single maintainer grow the collection without special-case layouts

## Top-Level Folders

- `skills/`: real skills that can be installed individually
- `template/`: the canonical starter template for new skills
- `spec/`: repository-level rules and quality expectations
- `scripts/`: repo maintenance helpers
- `.claude-plugin/`: bundle manifest for marketplace-style installation

## Skill Folder Shape

Each skill should follow this structure:

```text
skills/<skill-name>/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
├── scripts/
│   └── setup.py
└── assets/
```

Only `SKILL.md` is required. The other folders are optional but recommended for reusable skills.

## Skill Rules

- Folder names must match the `name` in `SKILL.md`
- Use lowercase letters, digits, and hyphens only
- Keep skills focused on one tool or one workflow
- Do not create a catch-all “all tools” skill
- If a workflow spans multiple tools, create a dedicated orchestration skill instead of bloating the underlying tool skills

## Bundle Policy

Bundle related skills in `.claude-plugin/marketplace.json`.

Rules:

- Keep `all-skills` as a complete bundle
- Prefer category bundles such as `api-skills`, `design-skills`, or `workspace-skills`
- Add a category bundle only when it contains at least two real skills
- Treat bundle names as stable public contracts once published

## Persistent Setup Pattern

When a skill benefits from saved defaults, prefer this contract:

- add `scripts/setup.py` for one-time configuration
- save defaults under `~/.config/hoon-ch-skills/<skill-name>.json`
- resolve config in the order `CLI > env > persisted config`
- set file mode `600` when secrets may be stored
- provide `doctor`, `validate`, or equivalent troubleshooting commands

## Validation

Run:

```bash
python3 scripts/validate_repo.py
```

before publishing structural changes or adding new skills and bundles.
