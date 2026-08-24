---
name: gjc-fleet
description: Orchestrate genuinely independent GJC worker sessions through Herdr with conversational intake, verified workspace targeting, read-only analysis, collision-proof ownership, evidence-based tracking, and ownership-safe cleanup. Requires HERDR_ENV=1 for Herdr control.
---

# GJC Fleet Orchestration

The invoking session is the fleet orchestrator. It understands the user's ordinary-language
request, inventories the target safely, proposes the acceptance bar and file boundary, partitions
independent work, directs GJC sessions, polls durable evidence, owns global gates, retires only
proven units, and writes the final receipt. Workers make product edits; the orchestrator writes
only briefs, orders, results/receipts, and its own tooling.

A fleet is not a way to run several agents because it is interesting. Use it only when units are
independent and the file partition can be proven. Keep a shared contract serialized, and use one
or two sessions directly when fleet overhead exceeds the work.

The default is no product commit, push, stash, reset, restore, or destructive cleanup. The user
chooses how verified uncommitted work is landed. Never claim completion from a worker's sentence,
Herdr's `done` status, or a stale terminal snapshot.

## Activation and conversational intake

`/skill:gjc-fleet` is role admission, not an instruction to inspect a repository.

- With no objective at all, remain quietly at `ROLE_ADMITTED`. Do not inspect the current
  repository, worktree, Git history, dirty files, focused pane, Herdr inventory, or model
  configuration. Do not create a run directory, execute a command, mutate product files, dispatch
  a worker, or create a tab, pane, worktree, or session. A short natural-language invitation to
  state the goal is enough; do not expose a receipt or schema.
- When the user gives an objective in ordinary language, admit it. The orchestrator, not the
  user, normalizes the conversation into the internal intake receipt. Never ask the user to write
  JSON, acceptance criteria, path globs, or a mutation schema.
- Treat `현재 워크스페이스`, `현재 작업공간`, `여기`, `이 repo`, `current workspace`, `here`, and
  `this repo` as explicit target references when the session cwd can be verified with Git and
  `realpath`. A cwd is context for a stated target reference, never an objective by itself.
- After objective admission, run a read-only target inventory. Derive acceptance criteria from
  the user's outcome and the inventory, and derive a conservative proposed mutation boundary
  from inventoried relevant surfaces. Reserve every dirty path as user work; never auto-assign it.
- Read-only analysis is admitted as soon as an objective and a verifiable target exist. It does
  not need a separate mutation approval and must not be blocked by unrelated dirty paths.
- Keep the mutation gate pending until product mutation or a worker order that may mutate is
  actually about to start. At that point, fail closed on unresolved material ambiguity, incomplete
  inventory, an empty/unsafe boundary, or dirty-path overlap. Dirty paths that do not overlap
  remain reserved and do not block unrelated analysis.
- Ask one natural-language question at a time only when the answer changes the result materially.
  Let the repository, Git, and installed CLI answer factual questions first. For an unresolved
  target or scope, ask about that fact—not about an internal field name.
- When the user says “분석해” or “analyze”, inventory first, then either present a concise
  understanding and plan or begin orchestration when the intent is already clear. Do not wait
  for a mutation approval to perform the analysis.

The bundled `scripts/intake.mjs` is an internal transport and safety helper. Its JSON receipt is
written to the external run directory and consumed by the orchestrator; it is never pasted into
the normal conversation.

The lifecycle remains:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

`OBJECTIVE_ADMITTED` authorizes read-only inventory and analysis only. `PREFLIGHTED` proves the
installed control surfaces. A mutation gate is evaluated immediately before any product-mutating
order or worker dispatch; passing preflight alone never authorizes mutation.

## Quick Start

After a natural-language objective has been stated, save the internal intake result outside the
product tree and inspect it before creating any Herdr resource. The helper accepts the
orchestrator's internal conversation context; the user does not need to see or produce it:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gjc-fleet.XXXXXX")"
node /path/to/gjc-fleet/scripts/intake.mjs < "$INTERNAL_REQUEST" > "$RUN_DIR/intake.json" || exit 2
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

### 1. Admit the objective and define a provisional contract

- Start at `ROLE_ADMITTED` only for an exact activation with no objective. Stop there without
  reading repository or runtime state.
- For a natural-language objective, extract the user's requested outcome and any explicit target
  reference from the conversation. Do not require a complete scope, acceptance list, or path
  boundary before admission.
- Verify an absolute target with Git and `realpath`. Resolve a deictic workspace reference from
  the session cwd only after the objective exists. If it cannot be verified, ask one target
  question and do not dispatch.
- Run the read-only inventory before proposing the contract. Record tracked/untracked relevant
  paths, dirty paths, top-level surfaces, and the exact read-only evidence in the external ledger.
- Derive acceptance criteria and the proposed boundary internally. The proposed boundary is not
  mutation authorization; it is evidence for the later gate.

### 2. Analyze without mutation

- If the requested mode is analysis, proceed with the inventory and repository/CLI inspection
  without a second approval.
- Present a concise understanding, target, relevant surfaces, and proposed next step in natural
  language. Do not print internal receipt fields or JSON.
- Keep all baseline-dirty paths reserved. An unrelated dirty path is not a reason to refuse the
  analysis. An overlapping dirty path is recorded now and blocks only a later mutation gate.
- If the objective is underspecified, record the material ambiguity and continue safe analysis
  when possible. Do not turn assumptions that repository evidence can resolve into questions.

### 3. Preflight before control

- Transition to `PREFLIGHTED` only after `OBJECTIVE_ADMITTED` and a fresh internal intake receipt.
- Require `HERDR_ENV=1` before every Herdr control operation. Outside Herdr, stop; do not
  silently substitute a focused terminal or create a fleet elsewhere.
- Run and read `herdr --skill`, then inspect the installed `herdr --help`/group help. Do not copy
  syntax from this document when the binary disagrees; fail closed and record the mismatch.
- Resolve `TARGET_REPO` with Git and `realpath`. Pass it explicitly to every `tab create`,
  `pane split`, and `worktree create`; verify `cwd` and `foreground_cwd` from JSON.
- Capture `run_id`, versions, model/preset launch form, preflight evidence, and a NUL-safe Git
  baseline (tracked and untracked paths plus hashes) under the external run directory.
- Keep credentials in the approved inherited environment or GJC credential store. Secrets never
  enter prompts, argv, `--env`, orders, result files, pane output, or logs.

### 4. Choose a safe workspace topology

Use a clean dedicated worktree when isolation is needed, or the target checkout when the user
explicitly wants results there and file ownership is enforced. Do not automatically seed a dirty
checkout by applying an unreviewed patch. If uncommitted work is present, reserve those paths;
any overlap blocks the unit unless the mutation gate explicitly records inclusion and
preservation proof. Never use `git reset`, `restore`, `stash`, or a broad copy to hide user work.

For every resource creation:

1. issue the installed command with `--cwd "$TARGET_REPO"` and `--no-focus`;
2. parse the returned workspace/tab/root-pane or split-pane IDs with
   `scripts/read-herdr-field.mjs`;
3. immediately append the IDs, resolved cwd, ownership, and state to the ledger;
4. use those opaque IDs for all later operations.

### 5. Prove one canary path

Launch the exact preflighted `gjc --model PROVIDER/MODEL [--thinking LEVEL]` or
`gjc --mpreset NAME` in the returned pane. `agent start` is for supported kinds only; when
`gjc` is absent from `herdr agent`'s installed `kinds:` list, launch with `pane run` in the
JSON-returned pane and wait for detection.

Submit one self-contained canary order and verify all of the following before fan-out:

- the pane remains at the recorded target cwd;
- the model/title or GJC startup evidence matches the admitted launch form;
- a real turn starts and writes its canary result;
- `agent prompt` either works or the observed `agent_not_ready` path is handled once with
  `pane send-text` followed by `pane send-keys ... enter`;
- the canary result, owned-file diff, and required cheap check are inspectable.

A failed canary stops the fleet. Do not create more sessions to diagnose one broken launch.

### 6. Review, freeze, and partition

Fan out read-only reviewers only when their reports and output files are disjoint. Then freeze
reports into a checksummed directory; later appends are a new review wave. Turn findings into a
file graph, isolate hub files, and run `node scripts/check-exclusive.mjs` over only the units
that will be concurrent. Hubs run alone first; re-partition after they land.

Each write unit gets a `BRIEF.md`, an order, an exclusive exact-file section, and a private result
path. New files are assigned before dispatch. A worker may read outside its set but must record
an out-of-scope handoff rather than edit another unit's path. See
[references/partitioning.md](references/partitioning.md) and
[references/worker-prompts.md](references/worker-prompts.md).

### 7. Pass the mutation gate before dispatch

Immediately before a product-mutating order or worker dispatch, evaluate the internal mutation
gate against the fresh inventory:

- unresolved material ambiguity blocks;
- incomplete inventory or an empty/unsafe derived boundary blocks;
- dirty paths that overlap an allowed path block unless explicit preservation/inclusion is recorded;
- dirty paths outside the boundary remain reserved user work and do not block analysis or
  unrelated work.

A read-only analysis order can proceed without this mutation approval. Never treat a passed
preflight, a proposed boundary, or a worker's interpretation as a passed mutation gate.

### 8. Dispatch and track by evidence

Keep dispatch text to one line pointing at the brief/order/result. Submit through the recognized
agent surface with a bounded timeout; for manually detected GJC, reconcile the same pane and use
the pane text/key fallback on `agent_not_ready`. Never resend blindly after a timeout or aborted
wait.

On every poll, record a compact ledger row containing unit, pane, lifecycle observation, result
existence/size, owned-file progress, and last evidence time. Use bounded waits. After a long wait
timeout, `agent_prompt_stalled`, or interrupted wait, read `agent get`, pane detection, result,
diff, and process/cwd state; if the task is still running, continue tracking it with another
bounded wait.

Interpret statuses exactly as Herdr defines them: `working` is an observed active turn; `idle` is
ready for input after its tab has been seen; `done` is unseen background work reaching that same
idle state; `blocked` is a recognized approval/question UI; `unknown` is unclassified and never
completion. For GJC alternate-screen panes, statuses and terminal output are secondary to result
artifacts and actual owned-file changes.

### 9. Verify each wave and retire units

A worker's completion line is only a claim. Verify real counts, result tables, owned-file diff,
and evidence statuses (`live`, `gated`, or `skip`; skip is never pass). The orchestrator owns the
production build, route/behavior smoke, project-wide detectors, ownership, baseline drift, and
cleanup gates. Route a regression back to the owning unit rather than editing product code in the
orchestrator.

When a unit's result and gates are proven, stop and retire only that run-created session, release
its file ownership, and reuse its pane if useful. Preserve any `working`, `blocked`, unverified,
or result-less unit. Do not close pre-existing user sessions or any session whose ownership is
not in the ledger.

### 10. Clean up narrowly and write the receipt

Stop only PIDs and Herdr IDs created by this run. Never use `herdr server stop`, kill the main
Herdr process, or `pkill -f`. Remove a dedicated worktree only when it has no unique content and
removal succeeds without `--force`; otherwise preserve and report its path. Leave uncommitted
product work available for the user.

Write one `gjc-fleet-receipt/v1` receipt containing target/cwd proof, versions and launch form,
unit counts and evidence, baseline/drift proof, resources retired/preserved, mutation-gate
evidence, and limitations. Use `complete` only when every requested item and required gate is
evidenced, no collision or unowned drift exists, user work is preserved, and cleanup is known.
Otherwise report `incomplete` or `blocked` and continue tracking active units. See
[references/receipt.md](references/receipt.md).

## Failure Fallback

- **No objective:** remain at role admission without repository or runtime inspection.
- **Target reference cannot be verified:** ask one natural-language target question; do not ask
  for an intake payload.
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
- **Mutation ambiguity or dirty overlap:** keep the analysis and reserved work intact, ask one
  material question if needed, and do not dispatch a mutating unit until the gate passes.
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

Activation-only:

> “Fleet 역할이 준비되었습니다. 원하는 결과를 자연어로 말해 주세요.”

Conversational analysis:

> User: “GUI와 CLI가 동일한 기능을 제공하면 좋겠어.”
>
> User: “네가 분석해. 타겟은 현재 워크스페이스야.”
>
> Orchestrator: “GUI와 CLI의 사용자 기능 격차를 현재 워크스페이스에서 먼저 읽기 전용으로
> 조사하겠습니다. 관련 진입점과 검증 방법을 파악해 간단한 매트릭스와 실행 계획을
> 제시하겠습니다. 변경은 조사 결과와 경계가 확인된 뒤에만 시작합니다.”

An underspecified mutation request:

> User: “fix it”
>
> Orchestrator: “무엇을 고칠지는 저장소 조사로 확인할 수 있지만, 실제 변경 전에 원하는
> 결과가 무엇인지 한 가지만 확인해야 합니다. 어떤 사용자-visible 결과를 바꾸면 되나요?”

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
fi
```

Prove a concurrent wave and finish with a factual receipt:

```bash
node /path/to/gjc-fleet/scripts/check-exclusive.mjs \
  "$RUN_DIR/orders/f2-order.md" "$RUN_DIR/orders/f3-order.md"
# Run the build/smoke/ownership/baseline gates, retire only verified resources,
# then write $RUN_DIR/receipt.json with state complete/incomplete/blocked.
```
