# Worker prompt contract

Workers have no memory of your conversation. Everything they need must be in files they can
read plus one single-line dispatch that points at those files.

## Three-file structure

| File | Purpose |
| --- | --- |
| `BRIEF.md` | shared rules: file exclusivity, project invariants, verification, result format |
| `<id>-order.md` | this worker's items and its exclusive file set |
| `<id>-result.md` | the worker writes here; this file is the completion gate |

Put shared constraints in the brief once. The dispatch stays a single line: read the brief,
read your order, execute it, write your result.

## Failure modes and the clauses that stop them

### Template echo

A worker read four files and printed `SWEEP24_DONE s5 P0=n P1=n P2=n` — copying the literal
template from the prompt instead of doing the work. Two sessions did this.

The prompt caused it by containing a literal `P0=n`. Counter with both clauses:

> Do not emit the completion line before the result file contains real findings. The `n` is a
> placeholder to replace with actual counts; emitting it literally is a failure.

And gate on the artifact, not the line: a completion line without a result file is not done.

### Analysis loop

Two workers ran 50 minutes at `busy` with zero file edits. Both recovered within five minutes
of a restart carrying this directive:

> Do not read everything and plan. Take the highest-severity item, read only its evidence, fix
> it, move to the next. Making the type-checker point at what broke is faster than planning.

Restart beats steering. A wedged session tends to stay wedged.

### Silent skipping

> Never skip an item silently. Classify it as fixed, withdrawn (with evidence it was a
> misdiagnosis or already handled), or out-of-scope (with the file you would have needed).

This produced honest, routable output: 16 deferrals in one round, each naming its blocking file,
all closed in a later round.

### Deferring instead of deciding

Workers offload hard design work by declaring it needs a backend. When the mock layer *is* the
contract, say so and close the exit:

> This app has no service behind its mock adapter, so the mock adapter and `api/types.ts` are
> the contract. Design it there, implement it, wire the UI. Replying that a backend is required
> is a failure.

Same seven items: deferred by one round, then fully closed by the next with only this clause
changed.

### Reaching outside scope

> Only the files in your order's exclusive set may be modified. Reading anything is fine. If an
> item needs a file outside the set, do not edit it — record it under `## Out of scope` with the
> file and the reason.

Also forbid explicitly, because workers reach for these under pressure:
`git commit`, `git checkout`, `git stash`, `git restore`, branch operations, dependency
installs, stopping the shared dev server, and formatters (a formatter rewrites siblings' files).

### Unrunnable verification

Tell workers exactly which gates are theirs and which are not:

> Run the type-checker and the project's detector on the files you changed. Do not run the
> production build, project-wide lint, or a formatter — the orchestrator runs those once at the
> end across the union of changed files.

Concurrent type-checks are fine; they are read-only. Concurrent formatters are not.

## Result format

Require a machine-parseable shape so you can aggregate mechanically:

```markdown
## Fixed
| severity | item | files | what changed |

## Withdrawn
| item | evidence |

## Out of scope
| item | file needed | why |

## Verification
- typecheck / detector / browser checks actually performed
```

Final line, with real numbers:

`FIX_DONE <id> FIXED=<n> WITHDRAWN=<n> OUTOFSCOPE=<n> TYPECHECK=<pass|fail>`

## Unblocking, not lowering the bar

When a worker legitimately cannot reach a state — browser automation could not drag a
range-selection control, so later wizard steps were unreachable — build the tool that unblocks
it rather than accepting a code-only review.

A generator that seeds the app's own session snapshot made every step reachable by pasting one
line into the browser console. Build such tools from the app's real logic and validate the
output before handing it over. After that, workers reviewed the actual rendered states.

Pair the tool with the honesty clause it needs:

> The seeded state is a review shortcut. Problems with the path a real user takes to reach that
> state — for example that the range cannot be set by keyboard — are still findings.

## Credit honest degradation

A worker that reports what it could not verify is doing its job. One flagged that it could not
reproduce a terminal state and marked those judgements as code-evidence only; another detected
that a stale dev server was serving old routes and verified against a fresh production server
instead, saying so in its result. Both reports were more useful than a confident one. Ask for
the limitation, and never punish it.
