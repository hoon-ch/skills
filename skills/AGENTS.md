# Published Skills

`skills/` is the source of truth for installable skill content. Make user-facing
skill changes here, then refresh the Codex plugin mirror from the repo root.

## Where To Look

| Task | Location | Notes |
| --- | --- | --- |
| Skill entrypoint | `skills/<name>/SKILL.md` | Must include frontmatter `name` and `description`. |
| Agent-specific metadata | `skills/<name>/agents/openai.yaml` | Include `display_name` when present. |
| Detailed protocol | `skills/<name>/references/` | Keep long prompts, workflows, and gotchas out of `SKILL.md`. |
| Repeatable helpers | `skills/<name>/scripts/` | Prefer scripts over prose for setup, doctor, or validation logic. |
| New scaffold | `python3 scripts/create_skill.py <name> --with agents,references,scripts` | Run from repo root. |

## Conventions

- Folder names must match `SKILL.md` frontmatter `name`.
- Published `SKILL.md` files need `## Quick Start`, `## Workflow`,
  `## Failure Fallback`, and `## Examples`.
- Keep each skill focused on one tool, workflow, or repository rule.
- If saved configuration is needed, resolve values as CLI flags, then
  environment variables, then `~/.config/hoon-ch-skills/<skill-name>.json`.
- After changing this tree, run:

```bash
python3 scripts/sync_codex_plugin_skills.py
python3 scripts/validate_repo.py
npx skills add . -g --list
```

## Anti-Patterns

- Do not edit `plugins/hoon-ch-skills/skills` instead of this tree.
- Do not add a catch-all skill that combines unrelated workflows.
- Do not place template-only scaffolds here as `SKILL.md`.
- Do not silently mutate shell profiles or global environment files.
- Do not hide upstream CLI, API, auth, quota, or wrapper failures.
