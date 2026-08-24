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
| `VERIFYING` | compact report, ownership counts, test ledger, gate statuses | pane/log transcript |
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

Mutation is blocked for unresolved material ambiguity, incomplete metadata, empty/unsafe boundary,
known dirty overlap, or unavailable dirty artifact. A read-only analysis does not need mutation
approval. Passing preflight or canary does not authorize a product edit.
