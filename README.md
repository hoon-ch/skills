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

## What's In This Repository

The repository is a source for installable agent skills, not a prompt dump.
Install from it when you want the current Plane, UI divergence, `apps/web` FSD,
Harbor operations, or transcript-derived lecture-note guidance available in
Codex or Claude Code.

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
