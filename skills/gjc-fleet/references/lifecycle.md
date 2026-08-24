# Fleet lifecycle: bounded ledger and cleanup

The control plane owns resource lifetime and receipt state. It does not own product file
contents or product test execution.

## State machine

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

Activation-only admission stops at `ROLE_ADMITTED` without repository or runtime reads.
`OBJECTIVE_ADMITTED` proves a verified target and bounded metadata inventory only. `PREFLIGHTED`
proves installed control syntax and the safe GJC launch form. A mutation gate is evaluated
immediately before a worker order that may edit product files.

## Ledger before memory

Keep an external JSONL/JSON ledger with bounded rows:

```text
run_id unit_id workspace_id tab_id pane_id resolved_cwd result_path state result_bytes owned_count last_evidence
```

Also record artifact path/byte count/digest, dirty count/sample/digest, test attempt fingerprints,
canary status, and resource ownership. Do not copy full pane output, full Git status, full env,
full hashes, patches, or report bodies into the ledger.

## Tracking and verification

- `working`, `idle`, `done`, `blocked`, and `unknown` are observations, not completion.
- Read detection panes with the 40-line budget and recent-unwrapped panes with the 120-line
  budget. Do not consume a full pane.
- Parse worker reports with `scripts/receipt.mjs`; retain only summary, top findings, counts,
  statuses, and external digest.
- For a manually detected or unnamed GJC, a known `agent_not_ready` response permits exactly one
  pane `send-text` plus `enter`; reconcile only a lifecycle transition or expected artifact within
  the bounded wait. Never retry `agent_not_found` by guessing a name.
- A worker test requires a successful `scripts/budget.mjs` claim. Repeated fingerprints and phase
  exhaustion are hard failures.
- The global gate is delegated to one worker claim. The orchestrator decides from its compact
  receipt and does not run the product command.

## Preserve user work

Dirty paths are reserved by count/sample/external NUL-safe digest. Select
`preserve_no_touch` or `preserve_and_continue`; the latter requires a read-only baseline review,
exact adopted paths, digest, and worker ownership. Dirty overlap blocks only when it is
unauthorized. A completion receipt additionally requires a post-diff preservation proof. Never
use commit, push, stash, reset, restore, broad copy, or formatter cleanup to make the baseline
appear clean.

If the mode is ambiguous, issue one natural-language question and persist
`blocked-awaiting-user`; do not mark an implementation incomplete merely because the baseline is
dirty.

Before launch, snapshot repo-local `.gjc/` separately from Git status. `--no-session --no-mcp`
is the default worker policy; `--session-dir` may point at an external run directory when a
session artifact is needed. Only paths registered in the resource ledger may be cleaned.
Pre-existing or unexplained runtime state is preserved and excluded from product drift.

## Cleanup

Stop only PIDs and Herdr IDs created by this run. Close only created panes/tabs/workspaces, and
remove a dedicated worktree only when it has no unique content and removal succeeds without
`--force`. Never close pre-existing resources such as workspace `w1P`, stop the Herdr server, or
Unknown cleanup remains preserved and makes the final receipt incomplete/blocked. A malformed
worker report permits one report-only correction on the same worker; it does not rerun the order,
a product test, or the canary.
