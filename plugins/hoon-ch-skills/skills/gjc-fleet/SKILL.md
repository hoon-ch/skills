---
name: gjc-fleet
description: Orchestrate multiple GJC worker sessions through Herdr with explicit cwd and model admission, collision-proof file ownership, evidence-based tracking, and ownership-safe cleanup. Use for a task that genuinely decomposes into several independent review or implementation units. Requires HERDR_ENV=1.
---

# GJC Fleet Orchestration

This skill makes the invoking session the fleet orchestrator. The orchestrator partitions work,
creates and directs GJC sessions, polls durable evidence, owns global gates, retires only proven
units, and writes the final receipt. Workers make product edits; the orchestrator writes only
briefs, orders, results/receipts, and its own tooling.

A fleet is not a way to run several agents because it is interesting. Use it only when units are
independent and the file partition can be proven. Keep a shared contract serialized, and use one
or two sessions directly when fleet overhead exceeds the work.

The default is no product commit, push, stash, reset, restore, or destructive cleanup. The user
chooses how verified uncommitted work is landed. Never claim completion from a worker's sentence,
Herdr's `done` status, or a stale terminal snapshot.

## Activation and intake boundary

`/skill:gjc-fleet` is role admission, not execution authorization. The only valid path for an
invocation without an explicit objective is:

```text
DORMANT -> ROLE_ADMITTED
```

Return one `ROLE_ADMITTED` receipt and stop. Do not inspect the current repository, worktree,
Git history, dirty files, focused pane, Herdr inventory, or model configuration. Do not create a
run directory, execute a command, mutate product files, dispatch a worker, or create a tab, pane,
worktree, or session. Preserve only the context supplied by the user; current repository state
is never an implicit objective or approval.

Orchestration intake requires all four explicit top-level fields:

```json
{
  "invocation": "/skill:gjc-fleet",
  "objective": "Concrete outcome with a named scope",
  "target_repo": "/absolute/repository/root",
  "acceptance_criteria": ["Observable criterion with evidence"],
  "mutation_boundary": {
    "allow": ["relative/path/**"],
    "deny": [".git/**"],
    "preserve_existing": true,
    "auto_assign_dirty": false
  }
}
```

The bundled `scripts/intake.mjs` validates this payload without reading the filesystem or
starting any external process. It admits `OBJECTIVE_ADMITTED` only when the objective is actionable, the
target is explicit, acceptance criteria are non-empty, and the mutation boundary preserves
existing work and forbids automatic dirty-path assignment. Missing or vague input remains at
`ROLE_ADMITTED` with blockers; it never starts orchestration. Dirty files, an existing worktree,
repository history, or prior conversation text cannot fill any missing field.

The lifecycle is strictly:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

## Quick Start

First obtain a ready intake receipt from the explicit request above. An activation-only call
returns at `ROLE_ADMITTED`; do not run the following preflight path in that state. After
`OBJECTIVE_ADMITTED`, save that receipt outside product files, then run the read-only admission
before creating a tab, pane, worktree, or agent. `TARGET_REPO` is the absolute repository root,
not merely the orchestrator's current directory:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gjc-fleet.XXXXXX")"
printf '%s' "$INTAKE_JSON" | node /path/to/gjc-fleet/scripts/intake.mjs > "$RUN_DIR/intake.json" || exit 2
TARGET_REPO="$(node -e 'const r=require(process.argv[1]); if(r.phase!=="OBJECTIVE_ADMITTED") process.exit(2); process.stdout.write(r.target_repo)' "$RUN_DIR/intake.json")" || exit 2

# Hard boundary: no Herdr control from an ordinary terminal.
test "${HERDR_ENV:-}" = 1 || exit 2

# Load the installed guidance; the installed binary is syntax authority.
herdr --skill > "$RUN_DIR/herdr-skill.md"

node /path/to/gjc-fleet/scripts/preflight.mjs \
  --repo "$TARGET_REPO" \
  --intake-receipt "$RUN_DIR/intake.json" \
  --model openai-codex/gpt-5.6-luna \
  --thinking max
```

The preflight checks the installed Herdr/GJC help and model row, not a remembered version. For a
configured profile, use `--preset NAME`; it must pass the ephemeral `gjc -p --mpreset ...
--no-session --no-tools` probe before fan-out. For model nickname resolution, see
[references/model-and-preflight.md](references/model-and-preflight.md).

Create a canary tab with an explicit cwd and no focus stealing. Parse both IDs from JSON and
verify the returned pane before launching GJC:

```bash
tab_json="$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" \
  --cwd "$TARGET_REPO" --label "fleet-canary" --no-focus)" || exit 2
tab_id="$(printf '%s' "$tab_json" | node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.tab.tab_id)" || exit 2
pane_id="$(printf '%s' "$tab_json" | node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.root_pane.pane_id)" || exit 2
herdr pane get "$pane_id"
herdr pane run "$pane_id" "gjc --model openai-codex/gpt-5.6-luna --thinking max"
```

Wait for `agent=gjc` detection before submitting the canary order. If `gjc` is not in the
installed `herdr agent` kinds, do not use `agent start --kind gjc`; `pane run` is the launcher.
Use the pane submission fallback when manually detected GJC rejects `agent prompt`. Full control
syntax is in [references/pane-control.md](references/pane-control.md).

## Workflow

### 1. Admit the run and define the boundary

- Start in `ROLE_ADMITTED` only from the exact `/skill:gjc-fleet` invocation. With no explicit
  objective, emit the admission receipt and wait; do not perform even a broad read-only
  inspection.
- Validate the explicit intake payload with `scripts/intake.mjs`. Do not infer an objective from
  the caller's cwd, repository name, branch, Git history, dirty paths, prior conversation, or
  an existing Herdr resource. A blocked or vague intake stays at `ROLE_ADMITTED`.
- Do not assign baseline-dirty or pre-existing worktree paths automatically. Reserve them as user
  work; only an explicit, receipt-recorded inclusion can authorize overlap.
- Transition to `PREFLIGHTED` only after `OBJECTIVE_ADMITTED` and only with a fresh intake receipt.
- Require `HERDR_ENV=1` before every Herdr control operation. Outside Herdr, stop; do not
  silently substitute a focused terminal or create a fleet elsewhere.
- Run and read `herdr --skill`, then inspect the installed `herdr --help`/group help. Do not
  copy syntax from this document when the binary disagrees; fail closed and record the mismatch.
- Resolve `TARGET_REPO` with Git and `realpath`. Pass it explicitly to every
  `tab create`, `pane split`, and `worktree create`; verify `cwd` and `foreground_cwd` from JSON.
- Capture `herdr workspace/tab/pane/agent` inventory before creation. IDs not returned by this
  run are user resources and are never cleanup targets.
- Record `run_id`, versions, model/preset launch form, preflight evidence, and a NUL-safe Git
  baseline (tracked and untracked paths plus hashes) under the external run directory.
- Keep credentials in the approved inherited environment or GJC credential store. Secrets never
  enter prompts, argv, `--env`, orders, result files, pane output, or logs.

### 2. Choose a safe workspace topology

Use a clean dedicated worktree when isolation is needed, or the target checkout when the user
explicitly wants results there and file ownership is enforced. Do not automatically seed a dirty
checkout by applying an unreviewed patch. If uncommitted work is present, reserve those paths;
any overlap blocks the unit unless the receipt explicitly records inclusion and preservation
proof. Never use `git reset`, `restore`, `stash`, or a broad copy to hide user work.

For every resource creation:

1. issue the installed command with `--cwd "$TARGET_REPO"` and `--no-focus`;
2. parse the returned workspace/tab/root-pane or split-pane IDs with
   `scripts/read-herdr-field.mjs`;
3. immediately append the IDs, resolved cwd, ownership, and state to the ledger;
4. use those opaque IDs for all later operations.

One tab/pane per live worker keeps tracking unambiguous. Reuse only a pane that this run retired
and verified back at a shell. Do not rely on focus or sidebar order.

### 3. Prove one canary path

Launch the exact preflighted `gjc --model PROVIDER/MODEL [--thinking LEVEL]` or
`gjc --mpreset NAME` in the returned pane. `agent start` is for supported kinds only; when
`gjc` is absent from `herdr agent`'s installed `kinds:` list, launch with `herdr pane run` and
poll `herdr agent get` until the pane is detected as GJC.

Submit one self-contained canary order and verify all of the following before fan-out:

- the pane remains at the recorded target cwd;
- the model/title or GJC startup evidence matches the admitted launch form;
- a real turn starts and writes its canary result;
- `agent prompt` either works or the observed `agent_not_ready` path is handled once with
  `pane send-text` followed by `pane send-keys ... enter`;
- the canary result, owned-file diff, and required cheap check are inspectable.

A failed canary stops the fleet. Do not create ten more sessions to diagnose one broken launch.

### 4. Review, freeze, and partition

Fan out read-only reviewers only when their reports and output files are disjoint. Then freeze
reports into a checksummed directory; later appends are a new review wave. Turn findings into a
file graph, isolate hub files, and run `node scripts/check-exclusive.mjs` over only the units
that will be concurrent. Hubs run alone first; re-partition after they land.

Each write unit gets a `BRIEF.md`, an order, an exclusive exact-file section, and a private result
path. New files are assigned before dispatch. A worker may read outside its set but must record an
out-of-scope handoff rather than edit another unit's path. See
[references/partitioning.md](references/partitioning.md) and
[references/worker-prompts.md](references/worker-prompts.md).

### 5. Dispatch and track by evidence

Keep dispatch text to one line pointing at the brief/order/result. Submit through the recognized
agent surface with a bounded timeout; for manually detected GJC, reconcile the same pane and use
the pane text/key fallback on `agent_not_ready`. Never resend blindly after a timeout or aborted
wait.

On every poll, record a compact ledger row containing unit, pane, lifecycle observation, result
existence/size, owned-file progress, and last evidence time. Use bounded waits. After a long wait
timeout, `agent_prompt_stalled`, or interrupted wait, read `agent get`, pane detection, result,
diff, and process/cwd state; if the task is still running, continue tracking it with another
bounded wait. A timeout is not a failed task and not a completed task.

Interpret statuses exactly as Herdr defines them: `working` is an observed active turn; `idle` is
ready for input after its tab has been seen; `done` is unseen background work reaching that same
idle state; `blocked` is a recognized approval/question UI; `unknown` is unclassified and never
completion. For GJC alternate-screen panes, statuses and terminal output are secondary to result
artifacts and actual owned-file changes.

### 6. Verify each wave and retire units

A worker's `FIX_DONE` line is only a claim. Verify real counts, result tables, owned-file diff,
and evidence statuses (`live`, `gated`, or `skip`; skip is never pass). The orchestrator owns the
production build, route/behavior smoke, project-wide detectors, ownership, baseline drift, and
cleanup gates. Route a regression back to the owning unit rather than editing product code in the
orchestrator.

When a unit's result and gates are proven, stop and retire only that run-created session, release
its file ownership, and reuse its pane if useful. Preserve any `working`, `blocked`, unverified,
or result-less unit. Do not close pre-existing user sessions or any session whose ownership is
not in the ledger.

### 7. Clean up narrowly and write the receipt

Stop only PIDs and Herdr IDs created by this run. Never use `herdr server stop`, kill the main
Herdr process, or `pkill -f`. Remove a dedicated worktree only when it has no unique content and
removal succeeds without `--force`; otherwise preserve and report its path. Leave uncommitted
product work available for the user.

Write one `gjc-fleet-receipt/v1` receipt containing target/cwd proof, versions and launch form,
unit counts and evidence, baseline/drift proof, resources retired/preserved, and limitations.
Use `complete` only when every requested item and required gate is evidenced, no collision or
unowned drift exists, user work is preserved, and cleanup is known. Otherwise report
`incomplete` or `blocked` and continue tracking active units. See
[references/receipt.md](references/receipt.md).

## Failure Fallback

- **`HERDR_ENV` missing or changed:** stop before any Herdr command. This skill cannot safely
  control a non-Herdr terminal.
- **Installed help or `herdr --skill` differs:** run the bundled preflight again, capture the
  exact missing surface, and stop. Do not guess old flags or IDs.
- **Model nickname is not a preset:** run `gjc --list-models <name>`, choose one exact
  provider/model row and advertised thinking level, or stop. Never fall back to `default`.
- **`agent start --kind gjc` rejected:** expected when `gjc` is absent from `kinds:`. Use
  `pane run` in the JSON-returned pane and wait for detection; do not relabel another agent.
- **Manual GJC reports `agent_not_ready`:** confirm the same pane with `agent get`/`pane read`,
  then send the one-line prompt with `pane send-text` and one `pane send-keys ... enter`. Verify
  the turn started; do not resend text.
- **Wait timeout, `agent_prompt_stalled`, or aborted wait:** read state, pane, artifact, diff,
  and cwd; continue tracking a still-running task with a fresh bounded wait. Never infer failure
  or completion from the timeout alone.
- **`idle`/`done` with no result:** unverified, not complete. Check owned-file progress and ask
  for a durable artifact only as an alternate-screen fallback.
- **Stale/empty pane output:** GJC may be on an alternate screen. Use result files, fresh logs,
  process state, and owned-file changes; request a temporary Markdown transcript only after a
  terminal read fails.
- **Ownership overlap or unowned drift:** stop the affected wave, preserve both changes, narrow
  or serialize the order, and re-run the verifier. Never restore one worker over another.
- **Secret required:** use inherited credentials, a stored selector, or a 0600 file outside the
  repo; never put the value in Herdr/GJC input or output.
- **Cleanup ambiguity:** preserve the resource and mark it running/unknown. Close only IDs in the
  ledger that this run created; a completed unit can be cleaned while active units remain.
- **Worker echoes placeholders or skips silently:** reject the result, keep the pane or reuse it
  only after a clean stop, and dispatch a sharper edit-first order. No real artifact means no
  completion.

## Examples

Resolve and admit a Luna model rather than treating a nickname as a preset:

```bash
gjc --list-models LunaMaxxing
gjc --list-models gpt-5.6-luna
node /path/to/gjc-fleet/scripts/preflight.mjs \
  --repo "$TARGET_REPO" --intake-receipt "$RUN_DIR/intake.json" \
  --model openai-codex/gpt-5.6-luna --thinking max
```

Create a background pane without stealing focus and parse its actual ID:

```bash
response="$(herdr pane split --pane "$PARENT_PANE" --direction right \
  --cwd "$TARGET_REPO" --no-focus)" || exit 2
worker_pane="$(printf '%s' "$response" |
  node /path/to/gjc-fleet/scripts/read-herdr-field.mjs result.pane.pane_id)" || exit 2
herdr pane run "$worker_pane" "gjc --model openai-codex/gpt-5.6-luna --thinking max"
```

Handle the known manual-detection prompt edge and then reconcile a bounded wait:

```bash
if ! herdr agent prompt "$worker_pane" "$PROMPT" --wait --timeout 5000; then
  herdr agent get "$worker_pane"
  herdr pane send-text "$worker_pane" "$PROMPT" || exit 2
  herdr pane send-keys "$worker_pane" enter || exit 2
fi
if ! herdr agent wait "$worker_pane" --timeout 120000; then
  herdr agent get "$worker_pane"
  herdr pane read "$worker_pane" --source detection --lines 40
  # Inspect result and owned-file diff, then continue polling if still working.
fi
```

Prove a concurrent wave and finish with a factual receipt:

```bash
node /path/to/gjc-fleet/scripts/check-exclusive.mjs \
  "$RUN_DIR/orders/f2-order.md" "$RUN_DIR/orders/f3-order.md"
# Run the build/smoke/ownership/baseline gates, retire only verified resources,
# then write $RUN_DIR/receipt.json with state complete/incomplete/blocked.
```
