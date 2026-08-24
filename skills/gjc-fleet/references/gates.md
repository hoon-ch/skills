# Bounded gates and evidence

A receipt is a boundary between worker claims and observed control-plane evidence. A Herdr status
or a sentence in a pane never proves a gate.

## Phase gates

| Phase | Required bounded evidence | Never infer from |
| --- | --- | --- |
| `ROLE_ADMITTED` | exact role activation only | repository or Herdr inspection |
| `OBJECTIVE_ADMITTED` | verified target, compact metadata receipt, reserved dirty artifact | full source inventory |
| `PREFLIGHTED` | current Herdr/GJC help, versions, exact launch form | remembered syntax |
| `DISPATCHING` | passed mutation gate, returned IDs, one canary proof | labels or guessed IDs |
| `TRACKING` | bounded lifecycle/status and report existence | `done`, `idle`, timeout |
| `VERIFYING` | compact report, ownership counts, dirty-adoption proof, test ledger, gate statuses | pane/log transcript |
| `RECEIPT` | bounded final receipt, cleanup and limitations | optimistic worker text |

## Evidence vocabulary

Use `live` for an actually executed worker check with exit/assertion evidence, `gated` for a
check delegated to the explicit global gate owner, and `skip` only with a concrete limitation.
`skip` is not pass. The canary has its own `passed`, `failed`, or `skipped` status and is never a
product test. `skipped` is valid only when the current non-empty artifact matches the prior
verified byte count and SHA-256; a timestamp or status line alone cannot admit reuse.

## Ownership

| Check | Owner |
| --- | --- |
| Target root and metadata artifact | control plane helper |
| Source discovery/review | discovery/review worker |
| Product edit | implementation worker |
| Focused test | owning worker, after budget claim |
| Owner revalidation | owning worker, after a fix and a new claim |
| Global build/test gate | one delegated gate worker, after a new claim |
| Gate decision, baseline, resource cleanup | control plane from compact receipts |

The control plane must not open product source, run a build/test, or paste a full diff/log into its
context. Route failures to a worker and retain external evidence.

## Mutation gate

Dirty work has two explicit reservation modes:

- `preserve_no_touch`: reserve the baseline and reject any assignment that overlaps it.
- `preserve_and_continue`: allow the goal to extend the baseline only after a read-only worker
  reviews the exact paths and baseline digest.

Dirty overlap is not itself a blocker. The gate blocks only unauthorized overlap. An adopted
assignment must carry the exact path list, the reserved baseline digest, a worker owner whose
paths match that list, and a post-diff preservation proof before completion. Reset, restore,
stash, delete, and broad copy remain forbidden.

If the objective does not establish either mode, return a `blocked-awaiting-user` receipt with
one natural-language choice question. Do not convert that ambiguity into an `incomplete`
implementation result.

A read-only analysis does not need mutation approval. Passing preflight or canary does not
authorize a product edit.

## Runtime-state ownership

Snapshot `.gjc/` before launch. Prefer `gjc --no-session --no-mcp` for an ephemeral worker, or
`gjc --session-dir "$RUN_DIR/gjc-session" --no-mcp` when a session artifact is required. A
repo-local `.gjc/` created from a recorded run-owned session is a run-owned resource and may be
cleaned narrowly. Pre-existing, user-modified, or unexplained state is preserved and is not
counted as product drift.
