# Controlling GJC panes from Herdr

The installed Herdr skill is the source of truth for syntax. Run `herdr --skill` and read it
before using this protocol. The examples below match the observed Herdr 0.8.x / GJC 0.15.x
surface, but `scripts/preflight.mjs` must admit the current binaries first.

## Create and target by returned IDs

Never infer a tab or pane from its sidebar number, a label, or creation order. Capture the JSON
response and extract the returned opaque IDs:

```bash
tab_json="$(herdr tab create \
  --workspace "$HERDR_WORKSPACE_ID" \
  --cwd "$TARGET_REPO" \
  --label "fleet-$RUN_ID-canary" \
  --no-focus)" || exit 2

tab_id="$(printf '%s' "$tab_json" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.tab.tab_id)" || exit 2
pane_id="$(printf '%s' "$tab_json" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.root_pane.pane_id)" || exit 2

pane_json="$(herdr pane get "$pane_id")" || exit 2
printf '%s' "$pane_json" | node /path/to/gjc-fleet/scripts/agent-state.mjs
```

The target pane's `cwd` and `foreground_cwd` must resolve to `TARGET_REPO` before launching
GJC. If they do not, stop and close only the tab recorded in this run's ledger. Do not repair a
wrongly targeted pane by silently `cd`-ing around it.

For a reused layout, the same rule applies to `pane split`:

```bash
pane_json="$(herdr pane split \
  --pane "$PARENT_PANE_ID" \
  --direction right \
  --cwd "$TARGET_REPO" \
  --no-focus)" || exit 2
pane_id="$(printf '%s' "$pane_json" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.pane.pane_id)" || exit 2
```

A worktree response exposes more than one ID. Parse all of them rather than constructing a
workspace or root-pane ID:

```bash
worktree_json="$(herdr worktree create \
  --cwd "$TARGET_REPO" \
  --branch "$BRANCH" \
  --base HEAD \
  --label "fleet-$RUN_ID" \
  --no-focus)" || exit 2
workspace_id="$(printf '%s' "$worktree_json" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.workspace.workspace_id)" || exit 2
root_pane_id="$(printf '%s' "$worktree_json" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.root_pane.pane_id)" || exit 2
```

Record `workspace_id`, `tab_id`, `pane_id`, requested cwd, resolved cwd, and creator ownership
immediately. Every resource created by this run has one ledger row. Always use `--no-focus` for
background work. Use explicit IDs, not an omitted target that could resolve to another client's
focused pane.

## Launching GJC

`agent start` only launches kinds listed by the installed `herdr agent` output. It is not a
universal process launcher. If `gjc` is absent from `kinds:`, do not call:

```bash
herdr agent start worker --kind gjc ...
```

Launch the interactive process in the returned pane instead, with the already resolved model
command and no secret arguments:

```bash
herdr pane run "$pane_id" \
  "gjc --model openai-codex/gpt-5.6-luna --thinking max"
```

The pane was created with `--cwd "$TARGET_REPO"`; still verify its JSON cwd before this call.
If a future Herdr version advertises `gjc`, validate that exact `agent start --help` syntax and
record the result; do not assume that support merely because another agent kind is supported.

After `pane run`, wait for detection with short, bounded polls. A detection is not permission to
skip the cwd or model checks:

```bash
for attempt in $(seq 1 30); do
  state_json="$(herdr agent get "$pane_id")" || state_json='{}'
  state="$(printf '%s' "$state_json" |
    node /path/to/gjc-fleet/scripts/agent-state.mjs)" || exit 2
  printf 'detect attempt=%s pane=%s state=%s\n' "$attempt" "$pane_id" "$state"
  case "$state" in
    *'"agent":"gjc"'*) break ;;
  esac
  herdr pane read "$pane_id" --source detection --lines 20
  sleep 2
done
```

If the loop ends without `agent=gjc`, read the pane and process state, record the launch error,
and stop that canary. Do not fan out.

## Submitting a worker order

A prompt is one single line containing paths to the brief, order, and result. Reject newlines
before sending so a multiline prompt cannot submit a partial turn:

```bash
case "$PROMPT" in *$'\n'*|*$'\r'*) printf '%s\n' 'prompt must be one line' >&2; exit 2;; esac
```

The preferred recognized-agent call is bounded and observable:

```bash
herdr agent prompt "$pane_id" "$PROMPT" --wait --timeout 5000
```

Manually detected GJC is a known edge case. Herdr can report `agent=gjc` while
`agent prompt` returns `agent_not_ready: not an active named agent`. That is not permission to
resend the text blindly. Re-read `agent get` and the pane, confirm the same pane still contains
GJC, then use the raw fallback exactly once:

```bash
herdr pane send-text "$pane_id" "$PROMPT" || exit 2
herdr pane send-keys "$pane_id" enter || exit 2
herdr pane read "$pane_id" --source detection --lines 20
```

Confirm a new turn or an input-cleared composer from the output. If the text remains in the
composer, send `enter` once; do not send the prompt text a second time. Record which surface
(`agent prompt` or `pane send-text`/`send-keys`) actually submitted the order.

## Polling, timeout, and recovery

Herdr lifecycle statuses mean:

- `working`: Herdr observes an active turn.
- `idle`: the agent is ready for input and its tab has been seen in the focused Herdr UI.
- `done`: the same underlying idle state after unseen background work finishes.
- `blocked`: Herdr recognized an approval or question UI; inspect it before sending input.
- `unknown`: an agent exists but Herdr cannot classify it confidently; it never proves completion.

For manually detected GJC, these are classifier observations, not a result-file proof. In
particular, `done` or `idle` can coexist with an incomplete order. The result artifact, owned
file diff, and gates are authoritative.

Use a finite wait and emit evidence on every cycle:

```bash
if ! herdr agent wait "$pane_id" --timeout 120000; then
  printf '%s\n' 'wait ended by timeout/error; reconciling instead of resubmitting' >&2
fi

# Required after timeout, SIGINT, agent_prompt_stalled, or any aborted wait:
herdr agent get "$pane_id"
herdr pane read "$pane_id" --source detection --lines 40
# Then inspect the result file, owned-file edits, and the ledger.
```

A timeout is not a failure and is not completion. If state is `working`, keep tracking with a
new bounded wait/poll. If it is `blocked`, preserve the pane and record the exact question for
the orchestrator/user boundary. If it is `done`, `idle`, or `unknown`, verify the artifact and
files before deciding whether to retire it. Never submit the same order merely because a wait
was interrupted; reconcile first and check whether the original task is still running.

## Alternate screen and artifact fallback

GJC renders on the terminal alternate screen. `--lines` cannot recover rows that already left
that screen, and `detection` can be stale while the process is healthy. A stale or empty read is
not a stall signal. Cross-check the running marker, process/cwd state, result file, and owned-file
progress.

The result Markdown is the normal durable output. If a complete conversational response is
needed and terminal reads fail, send a follow-up asking the worker to write it to a temporary
Markdown path outside product files and reply only with that path. Read the file directly. Do
not put that transcript request in the initial dispatch, and do not report terminal text as
complete evidence when only a stale alternate-screen snapshot was available.

## Stopping a worker

Stop only a worker and pane created by this run, and only after its result and gates are verified:

```bash
herdr pane send-keys "$pane_id" ctrl+c
sleep 1
herdr pane send-keys "$pane_id" ctrl+c
herdr pane send-text "$pane_id" '/exit'
herdr pane send-keys "$pane_id" enter
```

Re-read state until the process is gone or the shell is visible, then close only the recorded
pane/tab. Do not use `herdr server stop`, `pkill -f`, focused-pane defaults, or a guessed ID.
