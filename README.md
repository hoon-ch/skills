# hoon-ch/skills

Personal skill registry for Codex and Claude Code.

This repository contains small, installable skills for workflows that are worth
reusing across projects. Each published skill lives under `skills/<name>` and is
designed to work with [`skills.sh`](https://skills.sh/).

## Install With `skills.sh`

Install all published skills globally:

```bash
npx skills add hoon-ch/skills -g \
  --agent codex claude-code \
  --skill '*' \
  --yes
```

Install only selected skills:

```bash
npx skills add hoon-ch/skills -g \
  --agent codex claude-code \
  --skill plane-api \
  --skill diverging-ui \
  --skill repo-web-fsd \
  --skill harbor \
  --skill transcript-lecture-notes \
  --skill claude-code-assist \
  --yes
```

List available skills without installing:

```bash
npx skills add hoon-ch/skills -g --list
```

## Install As A Plugin

This repository also includes plugin metadata for agent plugin workflows:

- Claude plugin manifest: `.claude-plugin/marketplace.json`
- Codex plugin marketplace: `.agents/plugins/marketplace.json`
- Codex plugin package: `plugins/hoon-ch-skills/`

All three install surfaces expose the same published skills from `skills/`.

## Published Skills

| Skill | Use when |
| --- | --- |
| `plane-api` | You need direct Plane REST API access, route probing, project scans, or workflow helpers for Plane Cloud or self-hosted Plane. |
| `diverging-ui` | You are creating or redesigning frontend UI and need to avoid the most generic first-pass design direction. |
| `repo-web-fsd` | You need repository-specific guidance for `apps/web` placement, FSD boundaries, or design-system ownership decisions. |
| `harbor` | You need Harbor registry operations guidance for Kubernetes/GitOps, scanners, robot accounts, replication, or ArgoCD drift. |
| `transcript-lecture-notes` | You need to turn video or audio transcripts into blog-style Markdown notes while keeping SRT/VTT/TXT/Markdown transcripts as linked source files. |
| `claude-code-assist` | You need Codex to use Claude Code CLI for focused reviews, second opinions, bounded delegation, or review evidence capture. |

## Documentation And Review Evidence

Skills in this registry should leave enough documentation for another agent to
use them without reading repository history. This is especially important for
orchestration skills such as `claude-code-assist`, where the skill coordinates
another model or CLI.

For review and delegation workflows:

- document the exact command shape, model default, permission mode, and fallback
- keep prompt templates in `references/` rather than burying them in prose
- capture review output when it drives implementation decisions
- keep generated review artifacts out of git with `.gitignore`
- record validation commands in the skill or repository docs

## What's In This Repository

The repository is a source for installable agent skills, not a prompt dump.
Install from it when you want the current Plane, UI divergence, `apps/web` FSD,
Harbor operations, transcript-derived lecture-note, or Claude Code review
assistance guidance available in Codex or Claude Code.

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── plugins/
│   └── hoon-ch-skills/
├── skills/
│   └── <skill-name>/
└── template/
    └── SKILL.md.template
```

Repository maintenance notes for agents live in `AGENTS.md`. Claude-specific
entrypoint notes live in `CLAUDE.md`.
