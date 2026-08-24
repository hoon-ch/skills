# Fleet lifecycle: ledger, retirement, cleanup

The orchestrator creates resources and owns their lifetime. A resource is disposable only when
its exact ID is in this run's ledger and its state is known.

## Admission state machine

The lifecycle is a strict one-way state machine:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

`DORMANT` means no fleet role has been admitted. The exact `/skill:gjc-fleet` invocation moves
the run to `ROLE_ADMITTED`; it does not authorize execution. With no explicit objective, the run
ends at that state with a role receipt. No repository, worktree, Git history, dirty-path,
focused-pane, Herdr, or model inspection is allowed before `OBJECTIVE_ADMITTED`, and no command,
run directory, product mutation, worker dispatch, tab, pane, worktree, or session may be created.

`OBJECTIVE_ADMITTED` requires an explicit actionable objective, target repository, non-empty
acceptance criteria, and mutation boundary. The intake helper validates those fields without
discovering them from the current checkout. A vague or incomplete request remains
`ROLE_ADMITTED` and records blockers. Only after this transition may read-only target
preflight and baseline capture begin.

`PREFLIGHTED` records fresh installed Herdr/GJC evidence and a resolved launch form. Only then
may resources be created in `DISPATCHING`. `TRACKING`, `VERIFYING`, and `RECEIPT` require the
durable evidence and cleanup rules below; a Herdr status cannot skip a phase.

Existing resources and baseline-dirty paths are user work. Reserve them before dispatch and
never auto-assign them. A later explicit inclusion must name the path and preservation proof in
the receipt; an observed dirty path alone never becomes an assignment.

## Ledger before memory

Create a run directory outside product files and append records as actions succeed. A JSONL or
TSV ledger is enough; each row must include:

```text
run_id  unit_id  workspace_id  tab_id  pane_id  requested_cwd  resolved_cwd  result_path  state  created_by_run
```

Also record:

- the baseline Git status and hashes, including untracked paths;
- all Herdr IDs present before the run;
- the exact preflight output summary and resolved model/preset launch form;
- every server PID/port started by this run;
- frozen report checksums and order file paths;
- authorized new product files and their owner.

Write a ledger row immediately after parsing each JSON creation response. Never derive an ID from
labels, tab numbers, branch names, or a guessed workspace path.

## Preserve user work

The default is no automatic commit, push, stash, reset, restore, branch deletion, or broad copy.
Workers leave product edits in the selected checkout/worktree for the user to inspect. The
orchestrator compares the final state with the baseline and reports all uncommitted paths.

If the target checkout was dirty, reserve those paths before dispatch. Do not overwrite or
reformat them. If a dirty path must be part of the assignment, record the explicit inclusion and
its preservation evidence in the receipt. Never “clean” a conflict by taking a snapshot and
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
