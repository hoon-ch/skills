# Fleet lifecycle: ledger, retirement, teardown

The orchestrator creates real resources — panes, sessions, servers, worktrees, branches — and
is responsible for every one of them. Track them from creation, retire units as they land, and
tear down only what you created.

## Resource ledger

Write it as you create, not from memory. A flat TSV is enough and stays greppable:

```
# fleet.tsv — id, pane, order file, state
f1   w44:p9   f1-order   retired
f2   w44:pA   f2-order   running
f3   w44:pB   f3-order   running
```

Record separately, in the same file or beside it:

- the workspace id returned by `worktree create` and its checkout path (read from the
  response, never derive it from the branch or label)
- the PID and port of every server you start
- the baseline of dirty files at each wave boundary
- authorized new files, so the ownership audit stops flagging them

Anything not in the ledger is not yours to stop.

## Retiring a unit

A worker's completion line is a claim. Retirement is the process of turning it into a fact.

```bash
# 1. verify — gates you own, not the worker's self-report
bunx tsc --noEmit; <build command>; ./smoke.sh; ./audit-ownership.sh

# 2. commit — scoped to this unit's files
git add <unit files> && git commit -F <message with cause and evidence>

# 3. stop the session, keep the pane
herdr pane send-keys <pane> ctrl+c   # twice, with a pause
herdr pane send-text <pane> "/exit" && herdr pane send-keys <pane> enter
herdr agent get <pane>               # expect no agent: shell prompt

# 4. mark retired in the ledger, release its files

# 5. re-emit remaining orders if this unit touched files others need
```

Why each step matters:

- **Verify before commit.** Two workers reported `pass` on a change that broke the production
  build. Committing an unverified claim buries the regression under later work.
- **Commit per unit.** One commit per unit keeps blame legible and makes a bad unit revertable
  without touching its siblings.
- **Stop the session.** A finished worker still holds a model context and can be re-prompted by
  accident. Stopping it also frees the pane for the next unit — reuse beats creating a
  nineteenth pane.
- **Release the files.** Deferred out-of-scope items are usually blocked on a file another unit
  owned. The moment that unit retires, those items become dispatchable. In the run this skill
  came from, 16 deferrals were closed exactly this way.
- **Re-emit.** Orders generated before a hub unit landed describe the pre-hub file set. Later
  waves must be regenerated against the current state or they will fight the hub's work.

## Reusing a pane

A retired pane sits at a shell prompt in the right directory, so the next unit costs one
`pane run`:

```bash
herdr pane run <pane> "gjc --mpreset <preset>"
# poll agent get until "agent":"gjc", then send-text + send-keys enter
```

This is also the recovery path for a wedged worker: same pane, fresh session, sharper
directive. Verified faster than steering a session stuck in an analysis loop.

## Resumability

Retiring per unit is what makes the whole sweep survivable. If the orchestrator session dies
mid-sweep, the recovery state is on disk: the ledger says which units retired, the commits
prove it, and the frozen input set plus the order files say what remains. Nothing depends on
conversation memory.

Keep an append-only ledger in the repository if it has one (a coordination document), so the
next session inherits what was fixed, what was withdrawn, what remains and why, and which
traps were discovered.

## Teardown

Only after every unit is retired.

```bash
kill <recorded server PID>            # never pkill -f
# stop any remaining sessions, then prove the worktree holds nothing unique:
git -C <checkout> status --porcelain
cmp -s <checkout>/<file> <origin>/<file>   # for each remaining dirty file
herdr worktree remove --workspace <id>     # no --force
git worktree list --porcelain              # confirm
```

Rules that are not negotiable:

- **Never `pkill -f`.** A pattern kill intended for a temporary server coincided with two
  workspaces disappearing that the orchestrator did not create, with no logs to prove
  otherwise. Kill recorded PIDs.
- **Prove before deleting.** Compare each remaining dirty file byte-for-byte against the origin
  checkout. Delete only proven duplicates; that is what lets `worktree remove` succeed without
  `--force`.
- **Report a refusal, do not escalate.** If removal refuses, say so with the evidence and stop.
- **Branch deletion is separate.** It requires explicit intent even when the branch is merged.
- **Touch nothing you did not create.** Other workspaces, panes, and servers belong to the user
  or to other sessions.

## Interrupted teardown

If the user stops the sweep early, do not silently abandon the fleet. Report what is running,
what is committed, and what is uncommitted; then either retire the finished units and leave the
rest, or tear down completely — the user's call. Leaving nineteen live sessions and a dev server
behind without saying so is the failure mode to avoid.
