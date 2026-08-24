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
| Worker focused test | one claim |
| Owner revalidation after a fix | one claim |
| Global gate | one claim |
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
  --thinking max > "$RUN_DIR/preflight.json" || exit 2
```

`preflight.mjs` reads only the compact intake and installed command syntax. It creates no pane,
tab, worktree, session, model worker, or product command. A preset probe is a preflight
configuration check, not a product test; a failed probe stops admission.

## Workflow

### 1. Admit and bound metadata

- Keep activation-only admission inert.
- Resolve an explicitly stated target with Git and `realpath`.
- Write inventory paths/status to external NUL-safe artifacts and return only counts, samples,
  and SHA-256 digests. No full path or hash arrays enter `intake.json`.
- Derive acceptance criteria and a proposed boundary from metadata. They are not mutation
  approval. Keep dirty paths reserved and assigned count zero.
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
Pass the verified absolute cwd to every `tab create`, `pane split`, and `worktree create`, use
`--no-focus`, parse every returned opaque ID, and record it in the external ledger immediately.
Never infer a pane from a label, tab number, focus, or creation order.

### 4. Prove exactly one canary

Launch the exact preflighted GJC command in the returned pane and wait for the single observed
`agent=gjc` detection. Detection polling is bounded observation, not a canary retry. Submit one
cheap probe through the worker pane:

```text
Run exactly node /path/to/gjc-fleet/scripts/canary.mjs --cwd TARGET_REPO --artifact RUN_DIR/canary-result.json --run-dir RUN_DIR --herdr-workspace WORKSPACE_ID --gjc-version GJC_VERSION; write the artifact and stop.
```

`scripts/canary.mjs` proves only launch, cwd, and external artifact write. It must not inspect
the target tree and must not run `cargo`, `go`, `npm`, `pnpm`, `yarn`, `build`, `test`, `lint`, or
any product command. A failed canary stops and reports. Do not edit the order and retry it. A
recent receipt with the same Herdr workspace, GJC version, launcher, and cwd may produce a
`skipped` proof instead of another launch.

### 5. Dispatch worker work

Give each worker an external brief and exact ownership set. Workers may read source files inside
their task, but they write only assigned product files and external evidence. They must return a
report with:

- `## Summary`: at most 2 KiB;
- `## Findings`: ranked bullets; the parser returns only the top 8;
- `## Fixed`, `## Withdrawn`, and `## Out of scope` with real counts;
- `## Verification` with `live`, `gated`, or `skip` and evidence references;
- one `FIX_DONE ...` machine line.

Full logs, patches, source excerpts, and capability tables remain external artifacts. The
orchestrator invokes `scripts/receipt.mjs` and receives counts/statuses/digest, never the full
report. A missing or malformed report is unverified, not a pass.

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

The control plane verifies report counts, worker-owned path metadata, reserved dirty counts,
resource ownership, and required gate statuses. It does not open product diffs or run a global
build/test. Route regressions to the owning worker or a dedicated gate worker. Stop only panes,
tabs, worktrees, and PIDs created by this run; never close pre-existing `w1P` resources, kill
Herdr globally, reset/restore/stash user work, or delete a worktree with `--force`.

Write one bounded `gjc-fleet-receipt/v2` artifact outside the product tree. `complete` requires
all requested worker outcomes and required gates, no unowned drift, preserved user work, and
retired resources. Otherwise use `incomplete` or `blocked` and retain the relevant evidence.

## Failure Fallback

- **No objective:** remain role-admitted and ask for a natural-language goal.
- **Target cannot be verified:** ask one target question; do not inspect source or dispatch.
- **Missing Herdr environment or changed help:** stop before resource creation.
- **Intake or receipt cap exceeded:** emit the compact blocked receipt and point to the external
  artifact; never print the oversized object.
- **Canary failure or second attempt:** stop the run and report the single observed failure.
- **Worker report missing/oversized/malformed:** mark the unit unverified; do not read its full
  log in the parent context and do not retry the same order blindly.
- **Repeated test fingerprint or exhausted phase:** stop that test path; send only a causal,
  newly fingerprinted revalidation after an owner fix.
- **Dirty overlap, ownership collision, or unknown cleanup:** preserve both sides and mark the
  receipt blocked/incomplete. Never clean by reset, restore, stash, or broad copy.

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
