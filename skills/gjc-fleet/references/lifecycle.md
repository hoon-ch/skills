# Fleet lifecycle: ledger, retirement, cleanup

The orchestrator creates resources and owns their lifetime. A resource is disposable only when
its exact ID is in this run's ledger and its state is known.

## Admission state machine

The lifecycle is a strict one-way state machine:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

`DORMANT` means no fleet role has been admitted. An exact `/skill:gjc-fleet` activation with no
objective moves the run to `ROLE_ADMITTED` and waits. It must not inspect the repository,
worktree, Git history, dirty paths, focused pane, Herdr, or model configuration, and it must not
create a run directory, execute a command, mutate product files, dispatch a worker, or create a
tab, pane, worktree, or session. The user-facing response is natural language; the internal
receipt is not shown.

`OBJECTIVE_ADMITTED` begins when the orchestrator understands an ordinary-language objective.
The target may be an explicit path or a deictic reference such as “current workspace”, “here”, or
“this repo”, provided the session cwd is verified with Git and `realpath`. The user does not
provide acceptance criteria or path globs. After target admission, the helper performs a
read-only inventory and the orchestrator derives both the acceptance criteria and the proposed
mutation boundary. The phase authorizes read-only inventory and analysis, not product mutation.

An objective that is vague for mutation may still be analyzed. Record material ambiguity as a
pending blocker and ask about it only at the mutation gate if repository evidence cannot resolve
it. Do not reject safe analysis merely because the user did not write an internal contract.

`PREFLIGHTED` records fresh installed Herdr/GJC evidence, a verified target root, the read-only
inventory, and a resolved launch form. It does not pass the mutation gate. Immediately before a
product-mutating order or worker dispatch, evaluate that gate against fresh evidence. Unresolved
material ambiguity, incomplete inventory, an unsafe/empty boundary, or dirty-path overlap blocks
the mutating action. Dirty paths outside the boundary remain reserved user work and do not block
unrelated analysis.

`DISPATCHING`, `TRACKING`, `VERIFYING`, and `RECEIPT` require the durable evidence and cleanup
rules below; a Herdr status cannot skip a phase.

## Ledger before memory

Create a run directory outside product files and append records as actions succeed. A JSONL or
TSV ledger is enough; each row must include:

```text
run_id  unit_id  workspace_id  tab_id  pane_id  requested_cwd  resolved_cwd  result_path  state  created_by_run
```

Also record:

- the objective source and target-reference verification;
- the read-only inventory commands, relevant surfaces, and dirty-path reservation;
- the derived acceptance criteria and proposed boundary;
- the baseline Git status and hashes, including untracked paths;
- all Herdr IDs present before the run;
- the exact preflight output summary and resolved model/preset launch form;
- every server PID/port started by this run;
- frozen report checksums and order file paths;
- authorized new product files and their owner;
- mutation-gate status and blockers immediately before any mutating dispatch.

Write a ledger row immediately after parsing each JSON creation response. Never derive an ID from
labels, tab numbers, branch names, or a guessed workspace path.

## Preserve user work

The default is no automatic commit, push, stash, reset, restore, branch deletion, or broad copy.
Workers leave product edits in the selected checkout/worktree for the user to inspect. The
orchestrator compares the final state with the baseline and reports all uncommitted paths.

The inventory reserves every dirty path before analysis or dispatch. Do not overwrite or reformat
reserved paths. A dirty path outside the proposed boundary must not block unrelated analysis. If
a dirty path overlaps a mutating assignment, the mutation gate blocks unless the receipt records
explicit inclusion and preservation proof. Never “clean” a conflict by taking a snapshot and
silently restoring the user's version later.

A dedicated worktree is safer for a clean baseline, but its uncommitted changes are still user
work. Remove it only when it contains no unique content and `herdr worktree remove` succeeds
without `--force`. If it contains product changes, leave it recoverable and report its absolute
path and branch; do not delete it just to make cleanup look green.

## Retire a completed unit

Retire only after all of these are true:

1. The result file is non-empty, has real counts, and names every skipped/withdrawn/out-of-scope
   item.
2. Actual changed paths are within the unit's exclusive set and baseline user paths are intact.
3. Worker checks and orchestrator gates have evidence in the receipt.
4. The unit is no longer doing work; reconcile `agent get`, pane output, result, and diff rather
   than trusting `done`.

Then stop only the pane/session created by this run, release its files in the ledger, and reuse
its pane for the next serialized unit if appropriate:

```bash
herdr pane send-keys "$pane_id" ctrl+c
sleep 1
herdr pane send-keys "$pane_id" ctrl+c
herdr pane send-text "$pane_id" '/exit'
herdr pane send-keys "$pane_id" enter
```

Re-read the exact pane. Close the recorded pane/tab only after the shell is back and the resource
is not running a task. Do not commit as part of retirement unless the user explicitly requested
commits.

## Keep active work alive

A unit with `working` liveness, a changing owned-file diff, a missing result, or an unresolved
blocked question is not complete. Preserve its pane/session and record it as `running` or
`blocked`; do not close it during cleanup. A wait timeout or interrupted wait requires a state
read and running-task check before any stop/resubmit decision.

Completed units are cleaned individually. This prevents finished sessions from consuming panes
and prevents a final sweep from accidentally killing work that is still progressing.

## Teardown boundary

After all requested units are retired or explicitly preserved:

- stop only PIDs recorded by this run;
- close only pane/tab/workspace IDs created by this run;
- never run `herdr server stop`, kill the main Herdr process, or use `pkill -f`;
- never close a user's pre-existing session, even if its label resembles this run;
- remove an orchestrator-created worktree only after proving it has no unique changes, and never
  pass `--force` to silence refusal;
- if cleanup refuses, report the exact resource and evidence instead of escalating.

If the orchestrator is interrupted, leave a receipt with `running`, `blocked`, `retired`, and
`unverified` units. A recoverable active run is safer than an unscoped kill or a false complete.
