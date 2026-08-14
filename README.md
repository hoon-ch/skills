# hoon-ch/skills

Personal skill registry for Codex and Claude Code.

[한국어 README](README.ko.md)

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
  --skill nestjs-best-practices \
  --skill harbor \
  --skill herdr \
  --skill proxmox-post-install \
  --skill apply-diataxis \
  --skill technical-writing \
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
| `nestjs-best-practices` | You are writing, reviewing, or refactoring NestJS modules, controllers, services, dependency injection, guards, DTOs, validation, database access, testing, microservices, deployment, or security-sensitive code. |
| `harbor` | You need Harbor registry operations guidance for Kubernetes/GitOps, scanners, robot accounts, replication, or ArgoCD drift. |
| `herdr` | You are running inside a Herdr session (`HERDR_ENV=1`) and need to inspect or control panes, tabs, workspaces, worktree workspaces, background commands, or another coding agent. |
| `proxmox-post-install` | You need a Proxmox VE homelab post-install baseline for no-subscription repositories, popup suppression, and APT verification. |
| `apply-diataxis` | You need to classify documentation with Diátaxis, separate mixed modes, audit quality, or design need-oriented documentation architecture. |
| `technical-writing` | You need to create, revise, or review developer and end-user documentation, especially Korean-first technical writing. |
| `transcript-lecture-notes` | You need to turn video or audio transcripts into blog-style Markdown notes while keeping SRT/VTT/TXT/Markdown transcripts as linked source files. |
| `claude-code-assist` | You need Codex to use Claude Code CLI for focused reviews, source-backed research, second opinions, bounded delegation, or review evidence capture. |

## Maintainer Workflow

Use this section when you are changing the registry itself rather than
installing skills from it.

### Add Or Update A Skill

Create a new skill scaffold from the repository root:

```bash
python3 scripts/create_skill.py my-skill --with agents,references,scripts
```

Then edit `skills/<name>/SKILL.md` and any supporting files under
`skills/<name>/references/`, `skills/<name>/scripts/`, or
`skills/<name>/agents/`.

Keep `SKILL.md` concise. Put long procedures, prompts, troubleshooting notes,
and examples in `references/`. Put repeatable setup, doctor, or validation logic
in `scripts/`.

### Publish-Surface Checklist

After editing `skills/`, refresh the Codex plugin mirror and validate every
install surface:

```bash
python3 scripts/sync_codex_plugin_skills.py
python3 scripts/validate_repo.py
npx skills add . -g --list
```

Expected results:

- `validate_repo.py` prints `Repository is valid!`
- `npx skills add . -g --list` lists only the published skills under `skills/`
- `plugins/hoon-ch-skills/skills` matches `skills/` byte-for-byte

### What Not To Edit

- Do not edit `plugins/hoon-ch-skills/skills` directly. It is generated from
  `skills/`.
- Do not add template-only files named `SKILL.md`; use `SKILL.md.template`.
- Do not put maintainer policy in `README.md` when it belongs in `AGENTS.md`.
  Keep this README focused on installation, published skills, and the common
  maintainer path.

## Documentation And Review Evidence

Skills in this registry should leave enough documentation for another agent to
use them without reading repository history. This is especially important for
orchestration skills such as `claude-code-assist`, where the skill coordinates
another model or CLI.

For review, research, and delegation workflows:

- document the exact command shape, model default, permission mode, and fallback
- keep prompt templates in `references/` rather than burying them in prose
- capture review output when it drives implementation decisions
- keep generated review artifacts out of git with `.gitignore`
- record validation commands in the skill or repository docs

## What's In This Repository

The repository is a source for installable agent skills, not a prompt dump.
Install from it when you want the current Plane, UI divergence, `apps/web` FSD,
Harbor operations, transcript-derived lecture-note, or Claude Code
review/research assistance guidance available in Codex or Claude Code.

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── plugins/
│   └── hoon-ch-skills/
│       ├── .codex-plugin/
│       └── skills/
├── skills/
│   └── <skill-name>/
├── scripts/
│   ├── create_skill.py
│   ├── sync_codex_plugin_skills.py
│   └── validate_repo.py
├── spec/
│   ├── quality-bar.md
│   └── repository-layout.md
└── template/
    └── SKILL.md.template
```

Repository maintenance notes for agents live in `AGENTS.md`. Claude-specific
entrypoint notes live in `CLAUDE.md`.
