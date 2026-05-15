---
name: my-skill
description: Replace this with what the skill does and when it should be used.
---

# My Skill

Use this skill when:

- The user asks for the workflow this skill covers
- The task needs the bundled scripts or references in this folder

## Quick Start

1. State that you are using this skill and why it applies.
2. Start with the smallest deterministic command or document read.
3. Prefer bundled scripts for repeatable operations.
4. Keep the response focused on the user task, not on the skill internals.

## First Run Setup

If this skill benefits from saved defaults, add a one-time setup path:

```bash
python scripts/setup.py
```

Recommended precedence:

1. CLI flags
2. Environment variables
3. Persisted config under `~/.config/hoon-ch-skills/<skill-name>.json`

If configuration can fail, add a lightweight `doctor` or `validate` command and tell users to start there instead of reading secret files directly.

## Workflow

1. Confirm that the skill applies.
2. Run the smallest safe command that proves context or connectivity.
3. Use higher-level helpers when they are reliable.
4. Drop to the raw escape hatch when a helper hides an important server or tool error.
5. Report the outcome in user-facing terms.

## Failure Fallback

- Surface the original error message.
- Prefer a raw request, direct CLI, or lower-level script path when wrappers fail.
- Document deployment-specific caveats in `references/` instead of bloating this file.

## Examples

```bash
python scripts/setup.py
python scripts/tool.py doctor
python scripts/tool.py doctor --test
```

## Guidance

- Keep this file concise.
- Move detailed protocol notes into `references/`.
- Put executable helpers in `scripts/`.
- Put UI-facing metadata in `agents/openai.yaml`.
