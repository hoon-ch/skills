# Codex Plugin Package

This directory is the installable Codex plugin package for the registry. Edit
plugin metadata here, but treat skill content as generated.

## Where To Look

| Task | Location | Notes |
| --- | --- | --- |
| Plugin manifest | `.codex-plugin/plugin.json` | Must keep `skills` set to `./skills/`. |
| Generated skill mirror | `skills/` | Recreated from repo-root `skills/` by the sync script. |
| Marketplace entry | `../../.agents/plugins/marketplace.json` | Points Codex to this plugin root. |
| Source skills | `../../skills/` | Make skill changes there first. |

## Conventions

- Keep `skills/` as a real directory, not a symlink.
- Refresh the mirror from the repo root:

```bash
python3 scripts/sync_codex_plugin_skills.py
python3 scripts/validate_repo.py
```

- Plugin version strings may use a cache-busting suffix such as
  `0.1.0+codex.<timestamp>` when reinstall visibility matters.

## Anti-Patterns

- Do not manually edit files under `plugins/hoon-ch-skills/skills`.
- Do not add skill folders beside the generated `skills/` mirror.
- Do not change the manifest to point outside this plugin package; marketplace
  installs package this root only.
