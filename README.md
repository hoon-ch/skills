# hoon-ch/skills

`hoon-ch/skills` is a personal, `skills.sh`-first skill registry.

The repo is managed as:

- `repo = marketplace`
- `skill = product`
- `bundle = install surface`

The goal is not one giant universal skill. The goal is a growing collection of small, installable, tool-specific skills that work well through `skills.sh`.

## Principles

- Keep the repo as a single monorepo in the style of `anthropics/skills`
- Keep each published skill self-contained under `skills/<skill-name>/`
- Prefer narrow, reliable skills over broad, vague umbrella skills
- Use bundle names as stable public contracts
- Grow breadth through a few deep, trusted skills per category

## Install Model

Preferred entry points:

- Repo install: `npx skills add hoon-ch/skills`
- Bundle install: use a stable bundle from `.claude-plugin/marketplace.json`
- Skill install: install a single skill by path when needed

This repo is optimized for the install experience exposed by `skills.sh`.

## Current Published Surface

### Current bundle

- `all-skills`: every currently published skill; use this until the first category bundle has at least two real skills

### Planned bundles

- `api-skills`
- `github-skills`
- `workspace-skills`
- `design-skills`
- `cloud-skills`
- `devops-skills`

### Current skills

- `plane-api`: direct Plane REST API access with setup, doctor, request, catalog, invoke, and workflow helpers
- `diverging-ui`: verbalized-sampling workflow for distinctive frontend UI directions

## Repository Layout

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── skills/
│   └── <skill-name>/
├── spec/
│   ├── repository-layout.md
│   └── quality-bar.md
├── template/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   ├── references/
│   │   └── configuration.md
│   └── scripts/
│       └── setup.py
└── scripts/
    ├── create_skill.py
    └── validate_repo.py
```

## Authoring Rules

- Put every real skill in `skills/<skill-name>/`
- Keep skill names tool-specific or workflow-specific
- Do not create a generic “all tools” skill
- Add a new bundle only when at least two related skills exist
- Treat `.claude-plugin/marketplace.json` as a stable public contract

Every reusable tool skill should include:

- clear triggers in `SKILL.md`
- a quick start section
- a workflow section
- a failure fallback or raw escape hatch
- concrete examples
- `scripts/setup.py` when persistent defaults help
- a `doctor`, `validate`, or equivalent command when configuration can fail

## Add A New Skill

Scaffold a new skill:

```bash
python3 scripts/create_skill.py my-skill --with agents,references,scripts
```

Validate the repo:

```bash
python3 scripts/validate_repo.py
```

## Growth Strategy

Recommended first categories are listed above. Add a category bundle only after there are at least two real skills in that area.

## Notes

- This repo currently starts with `skills/plane-api` as the first published skill
- `template/` is the canonical scaffold shape for future skills
- `spec/quality-bar.md` defines the minimum publishable quality bar
