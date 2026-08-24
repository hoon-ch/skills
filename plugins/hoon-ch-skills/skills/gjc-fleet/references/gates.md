# Gates and evidence

A worker's completion line is a claim. The orchestrator turns it into a fact by checking the
result artifact, actual file ownership, and global behavior. Never report a unit complete from a
status string alone.

## Phase gates

The state machine is a safety gate, not a reporting label:

| Phase | Required evidence | Forbidden actions |
| --- | --- | --- |
| `DORMANT` | no role admission | all repository/worktree reads and all commands/resources |
| `ROLE_ADMITTED` | activation-only role receipt with read-only and mutation authorization false | objective inference, target discovery, preflight, mutation, dispatch, resource creation |
| `OBJECTIVE_ADMITTED` | natural-language objective, verified target, read-only inventory, derived criteria/boundary, and dirty-path reservation | treating the proposal as mutation approval or assigning dirty paths automatically |
| `PREFLIGHTED` | fresh Herdr/GJC help, versions, model/preset, and target-root evidence | worker/resource creation before the receipt and mutation gate are recorded |
| `DISPATCHING` | passed mutation gate for mutating work, returned resource IDs, and ownership ledger rows | guessed IDs, unscoped panes, overlap, or unrecorded processes |
| `TRACKING` | bounded liveness polls and durable result evidence | completion from `done`, `idle`, timeout, or stale pane text alone |
| `VERIFYING` | changed-path ownership, gates, baseline preservation, and cleanup evidence | hiding drift with reset, restore, stash, or broad copy |
| `RECEIPT` | one factual receipt with limitations | claiming `complete` with unknown, skipped, or preserved active work |

Activation-only is the only path that stops at `ROLE_ADMITTED`. A natural-language objective
promotes the run after the target is verifiable; missing user-authored criteria or path globs are
not blockers because the orchestrator derives them after read-only inventory.

Read-only analysis is allowed from `OBJECTIVE_ADMITTED` without mutation approval. The mutation
gate is a subgate immediately before a product-mutating order or worker dispatch. It fails closed
for unresolved material ambiguity, incomplete inventory, an unsafe/empty proposed boundary, and
dirty-path overlap. A dirty path outside the boundary is reserved user work, not an analysis
blocker.

## Evidence status vocabulary

Use exactly one status for every check:

- **live** — the command or surface actually ran against the target code/service/browser and
  left inspectable evidence (exit code, assertion output, URL/screenshot, or log path);
- **gated** — the check was intentionally reserved for the orchestrator and ran after the wave;
- **skip** — it did not run, with a concrete reason. `skip` is not `pass`.

`done`, `idle`, and a worker's `pass` text are not verification statuses. A claim without
artifacts is unverified.

## Gate ownership

| Gate | Owner | Required evidence |
| --- | --- | --- |
| Target resolution | orchestrator | session cwd or explicit path, Git root, and `realpath` proof |
| Read-only inventory | orchestrator | tracked/untracked relevant paths, dirty reservation, and command evidence |
| Derived acceptance/boundary | orchestrator | user objective plus inventory evidence and proposed path set |
| Mutation gate | orchestrator | fresh ambiguity, inventory, boundary, and dirty-overlap evaluation |
| Type-check of owned files | worker and orchestrator when practical | command, exit status, scope |
| Production build/prerender | orchestrator only | fresh command, exit status, build log |
| Behavior/route smoke | orchestrator | endpoint/assertion or browser evidence |
| Project detectors/lint | worker for slice, orchestrator for union | exact command and result |
| File ownership | orchestrator | changed paths mapped to one unit or authorized artifact |
| Baseline drift | orchestrator | before/after status and reserved-path comparison |
| Cleanup | orchestrator | every created resource retired; preserved active resources block `complete` |

Run the production build only from a clean, current server/build state. A long-lived dev server
can retain a stale route manifest after a directory rename; restart only the PID recorded by this
run before believing a route regression. Do not use an unscoped process kill.

If a gate fails, re-run it once in isolation to distinguish a transient environment failure
from a reproducible regression. A second failure is real evidence. Route the fix to the owning
unit and re-emit the wave; the orchestrator does not silently edit a worker's product files.

## Ownership and drift checks

At each wave boundary, enumerate all changed paths with a NUL-safe Git status. Compare against:

1. the baseline paths recorded before the fleet;
2. every live unit's declared exclusive set;
3. the run's explicitly authorized result/artifact paths;
4. the reserved dirty paths recorded by the intake inventory.

A baseline path that changed is user-work drift and blocks completion unless that path was
explicitly assigned. A changed product path with no owner is unauthorized. A path with two live
owners is a collision. Preserve the diffs and stop rather than running `restore`, `reset`, or
another destructive cleanup.

For path names containing brackets or spaces, compare exact strings; do not use an unescaped
regular expression or a display-order glob. The bundled exclusive verifier uses exact markdown
paths, and the receipt must list authorized new files separately.

## Behavior evidence

A route or UI claim needs a live assertion, not a successful type-check. Use a fresh built server
when route structure changed, record its PID and port, and prove the expected status/body or
browser state. If browser access is unavailable, label the check `skip` or `gated` with the
limitation; do not call a code read a live browser proof.

Alternate-screen terminal text is not durable evidence. Prefer worker result files, build logs,
smoke output, screenshots, and artifact files. If an artifact is referenced by a URI, preserve
the URI in the receipt and verify it can be read; if it cannot, downgrade the claim.

## Completion rule

The final receipt may say `complete` only when:

- every requested item is fixed or withdrawn with evidence;
- every out-of-scope handoff is resolved or explicitly reported as blocking;
- all required global gates are `live` or `gated` with evidence, with no unreviewed `skip`;
- no unowned or colliding product drift exists;
- baseline user work, including reserved dirty paths, is byte/content-preserved;
- every requested unit is retired; a deliberately preserved running/blocked/unknown unit makes
  the receipt `incomplete` or `blocked`, even when its resource is listed with an owner and next
  action.

Otherwise use `incomplete` or `blocked`, name the exact evidence gap, and keep working sessions
alive when they still have active work.
