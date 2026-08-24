---
name: gjc-fleet
description: Run a context-thin GJC control plane through Herdr. Delegate repository discovery, review, implementation, and tests to the minimum number of workers while keeping intake, pane reads, reports, and receipts bounded.
---

# GJC Fleet: context-thin control plane

The invoking session is a **control plane**, not a coding worker. It verifies the target Git
root and installed Herdr/GJC surface, creates narrowly scoped worker resources, and decides from
bounded machine receipts. It does not read product file contents, edit product files, run product
builds/tests, consume whole panes, or paste internal JSON into the conversation.

Workers own target discovery, code review, implementation, and test commands. A worker writes
verbose evidence to an external `RUN_DIR`; the orchestrator reads only a compact parser result
and a short summary. A single task uses one worker or a direct session; a fleet is reserved for
proven independent units with disjoint ownership.

The previous wcopy-mac run demonstrated why this boundary is mandatory: its intake was
12,634,736 bytes because 21,521 inventory paths and 21,353 dirty paths were embedded; the same
run submitted a cargo canary retry after a failed canary. Herdr workspace `w1P` then held three
active panes with scroll depths of 651, 493, and 382 rows. Those are orchestration failures, not
product evidence. This skill prevents them with executable helpers in `scripts/budget.mjs`,
`scripts/canary.mjs`, and `scripts/receipt.mjs`.

## Hard budgets

All values live in `scripts/budget.mjs`; prose must not introduce a second set of numbers.

| Surface | Hard limit |
| --- | ---: |
| Intake input | 64 KiB; overflow becomes a blocked compact receipt |
| Intake/final machine receipt | 16 KiB |
| Worker summary returned to control plane | 2 KiB |
| Worker findings returned | top 8 plus external report digest |
| Pane detection read | 40 lines |
| Pane recent-unwrapped read | 120 lines |
| Canary | one attempt per run; recent identical proof may be skipped |
| Manual GJC pane fallback | one `send-text` + one `enter`; bounded wait |
| Worker focused test | one claim |
| Owner revalidation after a fix | one claim |
| Global gate | one claim |
| Report-only correction | one claim on the same worker; no product/test/canary retry |
| Exact test command fingerprint | never repeat within a run |

Intake records counts, a bounded path sample, and an external NUL-safe artifact digest. It never
embeds file contents, binary patches, a per-file hash list, the full environment, or full Git
status. The inventory filters `.git`, `.gjc`, `target`, `.build`, `build`, `node_modules`,
`.venv`, `dist`, `DerivedData`, and the other names in the helper. If serialization exceeds a
cap, it fails closed; it does not trim until a misleading partial receipt looks valid.

## Activation and conversation

`/skill:gjc-fleet` with no objective only admits the role. It does not inspect the repository,
Git, Herdr, panes, models, or the environment, and it creates no run directory or resource.
Reply naturally:

> Fleet 역할이 준비되었습니다. 원하는 결과를 자연어로 말해 주세요.

After the user states an objective, accept ordinary language and an explicit target such as
“현재 워크스페이스”, “here”, or an absolute repository path. Do not ask for JSON, path globs,
acceptance criteria, or a report schema. The control plane may run only target-root metadata
checks (`git rev-parse`, bounded Git path/status artifacts); it does not open product files.

For “분석해” or “analyze”, dispatch one read-only discovery/review worker and return its
bounded capability matrix in natural language. Do not start a fleet for a single analysis.
Unrelated dirty work remains reserved; an overlapping mutation is blocked at the mutation gate.

## Quick Start

Run inside a managed Herdr session only:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gjc-fleet.XXXXXX")"
node /path/to/gjc-fleet/scripts/intake.mjs --run-dir "$RUN_DIR" \
  < "$INTERNAL_REQUEST" > "$RUN_DIR/intake.json" || exit 2

TARGET_REPO="$(node -e '
  const r=require(process.argv[1]);
  if (r.phase !== "OBJECTIVE_ADMITTED") process.exit(2);
  process.stdout.write(r.target_repo);
' "$RUN_DIR/intake.json")" || exit 2

test "${HERDR_ENV:-}" = 1 || exit 2
herdr --skill > "$RUN_DIR/herdr-skill.md"
node /path/to/gjc-fleet/scripts/preflight.mjs \
  --repo "$TARGET_REPO" \
  --intake-receipt "$RUN_DIR/intake.json" \
  --model openai-codex/gpt-5.6-luna \
  --thinking max \
  --canary-script /path/to/gjc-fleet/scripts/canary.mjs > "$RUN_DIR/preflight.json" || exit 2
```

`preflight.mjs` reads only the compact intake and installed command syntax. It creates no pane,
tab, worktree, session, model worker, or product command. A preset probe is a preflight
configuration check, not a product test. Before admission it also runs plain `node` against the
exact installed `canary.mjs` path and requires non-empty command output plus a non-empty, valid
canary artifact. A zero-byte/no-op script is a **script-plumbing failure**, even when its process
exit is zero; it stops admission before any resource is created.

## Workflow

### 1. Admit and bound metadata

- Keep activation-only admission inert.
- Resolve an explicitly stated target with Git and `realpath`.
- Write inventory paths/status to external NUL-safe artifacts and return only counts, samples,
  and SHA-256 digests. No full path or hash arrays enter `intake.json`.
- Derive acceptance criteria and a proposed boundary from metadata. They are not mutation
  approval. Classify dirty work as `preserve_no_touch` or `preserve_and_continue`; keep it
  reserved and assigned count zero until a gate records an exact adoption.
- Validate the serialized receipt before any Herdr resource is created. A receipt over 16 KiB
  is a blocked compact receipt.

### 2. Use the smallest worker topology

- Analysis or capability inventory: one worker with a bounded matrix and an external evidence
  file.
- One implementation task: one worker, not a fleet.
- Multiple workers only when exact file ownership is proven disjoint. Serialize hub files and
  avoid concurrency when the objective does not require it.
- The control plane sends one line pointing to `BRIEF.md`, the order, and the result path. It
  never includes a transcript or product excerpt in the dispatch.

### 3. Preflight, then create resources by returned IDs

Require `HERDR_ENV=1`. Read `herdr --skill` and installed help; the binary is syntax authority.
Require GJC's `--session-dir`, `--no-session`, and `--no-mcp` flags. Launch ephemeral workers
with `--no-session --no-mcp`, or point `--session-dir` at an external `RUN_DIR` path; never let
session storage default to the target repository.
Pass the verified absolute cwd to every `tab create`, `pane split`, and `worktree create`, use
`--no-focus`, parse every returned opaque ID, and record it in the external ledger immediately.
When parsing `herdr agent list`, ignore the outer response `id` (for example
`cli:agent:list`). Select only a leaf object whose `pane_id` exactly equals the returned pane ID;
`scripts/agent-state.mjs --pane-id PANE_ID` is the parser. Never recursively search serialized
JSON, infer a worker name, or target a label, tab number, focus, or creation order.

If the leaf has no usable name or GJC was detected manually, first issue the prompt to that exact
pane ID. If the known response is `agent_not_ready`, use exactly one `pane send-text` followed by
exactly one `pane send-keys ... enter`; do not resend the prompt or guess a name. Reconcile within
the bounded fallback wait and accept only a lifecycle transition or the expected artifact. An
`agent_not_found` response is a target-resolution failure, never a name-resolution invitation.

### 4. Prove exactly one canary

Launch the exact preflighted GJC command in the returned pane and wait for the single observed
`agent=gjc` detection. Detection polling is bounded observation, not a canary retry. Submit one
cheap probe through the worker pane:

```text
Run exactly node /path/to/gjc-fleet/scripts/canary.mjs --cwd TARGET_REPO --artifact RUN_DIR/canary-result.json --run-dir RUN_DIR --herdr-workspace WORKSPACE_ID --gjc-version GJC_VERSION; write the artifact and stop.
```

`scripts/canary.mjs` proves only launch, cwd, and external artifact write. It must not inspect
the target tree and must not run `cargo`, `go`, `npm`, `pnpm`, `yarn`, `build`, `test`, `lint`, or
any product command. A failed canary stops and reports exactly one compact diagnostic containing
the command exit, worker status, pane transition, artifact existence/size, and artifact digest.
Missing or zero-byte output is not a worker pass. Do not edit the order and retry it. A recent
receipt with the same Herdr workspace, GJC version, launcher, and cwd may produce a `skipped`
proof only when the existing artifact digest is verified against the current artifact; a status
line or timestamp alone is never reusable.

Once launcher/detection are verified and the canary artifact write handshake passes, dispatch the
actual worker immediately. Do not add a second hard block for a warning that did not invalidate
the verified artifact.

### 5. Dispatch worker work

Snapshot repo-local `.gjc/` before launch. For `preserve_no_touch`, any dirty overlap remains
unauthorized. For `preserve_and_continue`, dispatch a read-only baseline review first, then
record the exact adopted paths, baseline digest, and worker ownership in the assignment. The
implementation worker may extend those paths without reset, restore, stash, delete, or broad
copy. Completion must return a post-diff preservation proof for the adopted paths.

Give each worker an external brief and exact ownership set. Workers may read source files inside
their task, but they write only assigned product files and external evidence. They must return a
report with:

- `## Summary`: at most 2 KiB;
- `## Findings`: ranked bullets; the parser returns only the top 8;
- `## Fixed`, `## Withdrawn`, and `## Out of scope` with real counts;
- `## Verification` with `live`, `gated`, or `skip` and evidence references;
- `FIX_DONE fixed=<n> withdrawn=<n> out_of_scope=<n> verification=<live|gated|skip> owned_paths=<n> reserved_preserved=true`.

Full logs, patches, source excerpts, and capability tables remain external artifacts. The
orchestrator invokes `scripts/receipt.mjs` and receives counts/statuses/digest, never the full
report. Human headings and machine fields are validated. A missing or malformed report is
unverified, not a pass; the same worker may receive one report-only correction, which cannot
rerun product work, tests, or the canary.

### 6. Enforce test budget before every test command

A worker claims its focused test before running it:

```bash
node /path/to/gjc-fleet/scripts/budget.mjs test-claim \
  --ledger "$RUN_DIR/test-ledger.json" \
  --phase focused --command 'REPO_NATIVE_FOCUSED_COMMAND'
```

After the owner changes the failure cause, claim at most one `owner_reverify` with
`--after-fix true`. A delegated global-gate worker claims at most one `global` command. The
helper fingerprints the canonical command and rejects repeated fingerprints, blind retries,
phase exhaustion, and test claims from a canary. Never run a test command before a successful
claim. The control plane decides the global gate from the worker receipt; it does not run the
product command itself.

### 7. Track bounded evidence

On every poll, store only unit ID, Herdr status, result existence/size, owned-path count, and
last evidence time. Read `pane read --source detection --lines 40` for liveness and
`--source recent-unwrapped --lines 120` only when needed. Never consume a full pane or paste a
pane/log into the parent context. A timeout, `done`, `idle`, or stale pane is not completion;
reconcile the compact report, artifact digest, owned-path metadata, and worker state.

### 8. Verify and clean up narrowly

The control plane verifies report counts, worker-owned path metadata, dirty-adoption baseline
and post-diff proofs, reserved dirty counts, resource ownership, and required gate statuses. It
does not open product diffs or run a global build/test. Route regressions to the owning worker
or a dedicated gate worker. Stop only panes, tabs, worktrees, and PIDs created by this run; never close pre-existing `w1P` resources, kill
Herdr globally, reset/restore/stash user work, or delete a worktree with `--force`.

Classify `.gjc/**` separately from product drift. Clean only run-owned paths proven by the
resource ledger; preserve pre-existing, user-modified, and unexplained state. Write one bounded
`gjc-fleet-receipt/v2` artifact outside the product tree. `complete` requires all requested
worker outcomes and required gates, no unauthorized overlap or unowned drift, preserved user
work, post-diff adoption proof where applicable, and retired resources. An ambiguous dirty mode
is `blocked-awaiting-user` with one natural-language question. Otherwise use `incomplete` or
`blocked` and retain the relevant evidence.

## Failure Fallback

- **No objective:** remain role-admitted and ask for a natural-language goal.
- **Target cannot be verified:** ask one target question; do not inspect source or dispatch.
- **Missing Herdr environment or changed help:** stop before resource creation.
- **Intake or receipt cap exceeded:** emit the compact blocked receipt and point to the external
  artifact; never print the oversized object.
- **Canary script-plumbing failure:** stop before dispatch and report command exit/stdout bytes,
  artifact bytes/digest, and the compact self-test diagnostic.
- **Canary worker failure or missing artifact:** stop after the one attempt and report command
  exit, worker status, pane transition, and artifact bytes/digest; do not retry.
- **Second canary attempt:** treat it as a hard failure even if the first command exited zero.
- **Worker report missing/oversized/malformed:** mark the unit unverified; do not read its full
  log in the parent context. For a malformed report only, allow exactly one report-only
  correction on the same worker; never rerun the product order, a test, or the canary.
- **Repeated test fingerprint or exhausted phase:** stop that test path; send only a causal,
  newly fingerprinted revalidation after an owner fix.
- **Unauthorized dirty overlap, ownership collision, or unknown cleanup:** preserve both sides and
  mark the receipt blocked/incomplete. An ambiguous dirty mode is
  `blocked-awaiting-user` with one choice question. Never clean by reset, restore, stash, delete,
  or broad copy.

## Examples

Read-only analysis:

> GUI와 CLI의 기능 차이를 현재 워크스페이스에서 조사해 줘.
>
> 현재 저장소의 파일 내용은 제가 직접 읽지 않고, worker 한 명이 bounded capability
> matrix로 조사하도록 위임하겠습니다. 결과는 짧은 요약과 외부 근거 링크로만 정리합니다.

One-line dispatch:

```text
Read /tmp/gjc-fleet.X/BRIEF.md and /tmp/gjc-fleet.X/orders/f1-order.md; execute the bounded order; write only the compact result summary to /tmp/gjc-fleet.X/results/f1-result.md.
```

A worker report can be summarized to the user as:

> CLI는 X7 HID의 info/read/dump/safe-write를 제공하고, Chameleon/deep-decode는 Rust core
> 쪽 재사용 가능 API는 있으나 CLI 진입점이 없습니다. 세부 근거는 외부 report에 보관했고,
> 확인하지 않은 hardware-dependent 동작은 미지원으로 단정하지 않았습니다.
