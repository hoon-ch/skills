# Bounded preflight and model resolution

Preflight is a control-plane admission check. It may inspect `herdr --skill`, installed help,
versions, and an exact model row. It may not inspect product files, run product commands, create a
pane, or launch a worker. `scripts/preflight.mjs` rejects an intake file over the 16 KiB receipt
cap before binary checks.

## Admission boundary

```bash
test "${HERDR_ENV:-}" = 1 || exit 2
herdr --skill > "$RUN_DIR/herdr-skill.md"
node /path/to/gjc-fleet/scripts/preflight.mjs \
  --repo "$TARGET_REPO" \
  --intake-receipt "$RUN_DIR/intake.json" \
  --model openai-codex/gpt-5.6-luna \
  --thinking max > "$RUN_DIR/preflight.json"
```

The intake must be `gjc-fleet-intake/v3`, `OBJECTIVE_ADMITTED`, target-verified, and compact.
It contains metadata counts/samples and external artifact digests, not source contents, full Git
status, hashes, or environment values. The preflight output is also bounded and includes the
central budget table.

The installed binary is the authority. Require the current `tab`, `pane`, `worktree`, `agent`,
wait, and bounded pane-read surfaces, including `--cwd`, `--no-focus`, JSON ID responses,
`detection`, `recent-unwrapped`, and finite timeouts. A missing or changed surface stops before
resource creation.

## Model forms

An explicit model must be an exact `PROVIDER/MODEL` resolved from the installed list:

```bash
gjc --list-models gpt-5.6-luna
gjc --model openai-codex/gpt-5.6-luna --thinking max
```

A nickname is not a provider/model row and is never silently replaced. A configured preset is a
separate input:

```bash
gjc -p --mpreset "$PRESET" --no-session --no-tools --mode text \
  'reply with exactly: GJC_FLEET_PRESET_OK'
```

This is a preflight configuration probe, not a repository canary or product test. It may make
one model request; authentication, quota, or marker failure stops admission. The launch form in
the receipt must match the observed form exactly.

## Credential boundary

Credentials stay in the inherited approved GJC environment or a credential selector. Never put
secrets in a brief, order, prompt, argv, `--env`, report, receipt, pane, or log. The receipt may
record presence/status but never values or the full environment.
