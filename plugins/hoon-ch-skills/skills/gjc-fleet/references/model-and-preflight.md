# Admission and model resolution

Fleet creation is admitted only after the installed Herdr and GJC binaries have answered the
checks below. A copied workflow, a remembered version, or a model nickname is not evidence.
The bundled `scripts/preflight.mjs` performs the read-only checks and exits 2 on any mismatch.
It creates no Herdr resource.

## Hard admission boundary

Run this only after `OBJECTIVE_ADMITTED`, and before `herdr tab create`, `herdr pane split`,
`herdr worktree create`, or any agent command:

```bash
test "${HERDR_ENV:-}" = 1 || {
  printf '%s\n' 'GJC fleet requires HERDR_ENV=1 inside a managed Herdr pane.' >&2
  exit 2
}

herdr --skill > "$RUN_DIR/herdr-skill.md"
node /path/to/gjc-fleet/scripts/preflight.mjs \
  --repo "$TARGET_REPO" \
  --intake-receipt "$RUN_DIR/intake.json" \
  --model openai-codex/gpt-5.6-luna \
  --thinking max
```

`TARGET_REPO` must be an absolute repository root. Resolve it with
`git -C "$TARGET_REPO" rev-parse --show-toplevel`, normalize both paths with `realpath`, and
stop if they differ. Do not let a focused pane, the caller's current directory, or a branch
label choose the target.

The receipt from `scripts/intake.mjs` must be `OBJECTIVE_ADMITTED`, name the same target, and
be ready. A `ROLE_ADMITTED` receipt cannot reach preflight.

`preflight.mjs` verifies, from the installed output:

- `HERDR_ENV=1`, a readable Git root, and `herdr --skill`.
- Herdr's current `tab`, `pane`, `worktree`, `agent`, and read-source syntax, including
  `--cwd`, `--no-focus`, JSON-capable control responses, bounded waits, and pane fallbacks.
- GJC's current `--model`, `--mpreset`, `--thinking`, `--list-models`, `--no-session`, and
  `--no-tools` flags.
- An explicit provider/model row, including the requested thinking level; or a real ephemeral
  preset probe that does not save a session.

A missing executable, changed help surface, unsupported flag, failed model lookup, failed
preset probe, or changed `herdr --skill` contract is a stop. Do not create a partial fleet and
hope a later command explains the mismatch.

## Model names are not preset names

There are two separate GJC inputs:

- `--model PROVIDER/MODEL` selects one installed provider model. Resolve fuzzy or human names
  with the installed `gjc --list-models` output, then pass the exact provider/model pair.
- `--mpreset NAME` selects a configured profile from the user's GJC configuration. A model
  nickname is not evidence that a profile with that name exists.

For example, `LunaMaxxing` is not accepted as a preset merely because it sounds like a model
set. Resolve it instead:

```bash
gjc --list-models LunaMaxxing       # no match is a useful negative result
gjc --list-models gpt-5.6-luna       # inspect provider rows and thinking values
gjc --model openai-codex/gpt-5.6-luna --thinking max
```

The final launch command uses the exact row selected from the installed output. Do not invent
`--mpreset LunaMaxxing`, silently fall back to `default`, or replace a failed model with a
nearby model. A provider/model row that does not advertise `max` cannot be launched with
`--thinking max`.

For a real configured preset, prove it before fan-out with a non-session probe:

```bash
gjc -p --mpreset "$PRESET" --no-session --no-tools --mode text \
  'reply with exactly: GJC_FLEET_PRESET_OK'
```

Require exit 0 and the marker in the captured output. This may make one model request and may
fail for authentication/quota reasons; either result stops admission. Never use a guessed
preset as a fallback.

## Credential boundary

Authentication is inherited from the already-approved GJC environment or selected through a
non-secret GJC credential selector. Never place a token, cookie, private key, or secret value
in:

- a worker prompt, brief, order, result, receipt, or artifact;
- a `herdr pane run`, `pane send-text`, `agent prompt`, or model argument;
- a `tab create --env` argument, shell history, terminal output, or log.

If a repository requires a secret file, use a user-created file outside the repository with
0600 permissions and pass only its path to a launcher that reads it without printing it. Prefer
the repository's secret manager or GJC's stored credential selector. Check presence without
echoing the value (`test -n "$NAME"`), and redact command output before putting it in a
receipt. The fleet must not manufacture or copy secrets into a shared worktree.
