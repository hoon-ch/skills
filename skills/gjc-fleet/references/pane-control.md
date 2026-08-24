# Bounded Herdr pane control

Read `herdr --skill` and installed help first. Use only JSON-returned opaque IDs. Every resource
created by this run is recorded immediately with requested/resolved cwd, ownership, and external
result path. Always use `--cwd TARGET_REPO` and `--no-focus`; never target a focused pane by
omitted argument, label, tab number, or creation order.

## Create and verify

```bash
tab_json="$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" \
  --cwd "$TARGET_REPO" --label "fleet-$RUN_ID" --no-focus)" || exit 2
tab_id="$(printf '%s' "$tab_json" | node scripts/read-herdr-field.mjs result.tab.tab_id)" || exit 2
pane_id="$(printf '%s' "$tab_json" | node scripts/read-herdr-field.mjs result.root_pane.pane_id)" || exit 2
herdr pane get "$pane_id" > "$RUN_DIR/$unit-pane.json"
```

Verify `cwd` and `foreground_cwd` equal the verified target before launching GJC. If `gjc` is
not among the installed `herdr agent` kinds, use `pane run` in that returned pane; do not call
an unsupported `agent start --kind gjc`:

```bash
herdr pane run "$pane_id" \
  "gjc --model openai-codex/gpt-5.6-luna --thinking max"
```

For an agent-list response, never parse the envelope `id` as a worker name. Save the bounded
response and select only the exact returned pane:

```bash
herdr agent list > "$RUN_DIR/agents.json"
node scripts/agent-state.mjs --pane-id "$pane_id" < "$RUN_DIR/agents.json" > "$RUN_DIR/agent-state.json"
```

The parser accepts only a direct leaf agent/pane object or one `result.agents` leaf whose
`pane_id` exactly matches. It does not recurse through JSON or guess a name. A missing name and a
manually detected `gjc` both use the pane ID as the first prompt target.

Wait for the observed `agent=gjc` state with short bounded polls. The observation loop is not a
second canary and must not submit another launch or order. If detection never appears, record the
launch failure and stop the run.

## One canary only

Submit one order that invokes `scripts/canary.mjs` with the expected cwd, external artifact,
workspace ID, and observed GJC version. The helper writes a single external receipt proving
launch/cwd/artifact only. It rejects repository inspection and `cargo`, `go`, `npm`, `pnpm`,
`yarn`, build, lint, or test commands. A failed attempt is recorded before the probe and cannot
be retried. A recent identical Herdr/GJC/version/cwd proof may be recorded as `skipped` only
after the artifact's recorded SHA-256 and byte count match the current non-empty artifact.

If `agent prompt` returns the known `agent_not_ready` response, re-read the same pane once and
perform exactly one `pane send-text` followed by exactly one `pane send-keys ... enter`. Do not
send the prompt through `agent prompt` again. Reconcile for the bounded fallback wait and accept
only a lifecycle transition or the expected artifact. `agent_not_found` is a hard target error;
it must not trigger name guessing or a recursive JSON search.

Do not use a canary order such as:

```text
cargo run -p product -- --help
```

That is product execution, not a launch proof. It caused the prior wcopy-mac regression.

## Dispatch and fallback

The worker order is one line containing only external paths:

```text
Read RUN_DIR/BRIEF.md and RUN_DIR/orders/f1-order.md; execute it; write RUN_DIR/results/f1-result.md.
```

Use `herdr agent prompt PANE PROMPT --wait --timeout ...` when supported. The one fallback is
`pane send-text PANE PROMPT` followed by `pane send-keys PANE enter`; its bounded reconciliation
records `lifecycle_transition` or `artifact_ready`, not just an `idle`/`done` label.

After timeout or an aborted wait, reconcile `agent get`, the bounded pane read, report existence/
size, artifact digest, and owned-path metadata. A `working`, `done`, `idle`, `blocked`, or
`unknown` status alone is never completion.

## Bounded pane reads

Use the constants in `scripts/budget.mjs`:

```bash
herdr pane read "$pane_id" --source detection --lines 40
herdr pane read "$pane_id" --source recent-unwrapped --lines 120
```

These are diagnostic windows, not a transcript channel. Do not read the full pane, concatenate
all polls into the parent context, or treat alternate-screen output as the worker result. The
external report and its compact parser receipt are authoritative.
