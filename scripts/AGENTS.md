# Repository Scripts

Scripts here are maintenance tools for the skill registry, not skill runtime
helpers. Runtime helpers belong under `skills/<name>/scripts/`.

## Where To Look

| Task | File | Notes |
| --- | --- | --- |
| Create a skill scaffold | `create_skill.py` | Writes under `skills/`; keeps template files out of installable paths. |
| Validate repo state | `validate_repo.py` | Checks skill metadata, required sections, bundle completeness, plugin metadata, and mirror parity. |
| Refresh Codex plugin mirror | `sync_codex_plugin_skills.py` | Synchronizes tracked generated files from `skills/` without deleting target-only untracked user work. |

## Conventions

- Keep scripts dependency-light; current helpers use Python standard library.
- Treat validator rules as publish contracts, not advisory checks.
- If a script changes mirror behavior, update `AGENTS.md`, `spec/`, and the
  validation expectations together.
- Preserve exact error messages when tightening validation so failures remain
  actionable.

## Anti-Patterns

- Do not make validators depend on generated plugin content as source.
- Do not change `sync_codex_plugin_skills.py` to produce symlinks; marketplace
  packaging needs a real mirrored directory.
- Do not add broad automation that silently edits shell profiles or global
  environment files.
