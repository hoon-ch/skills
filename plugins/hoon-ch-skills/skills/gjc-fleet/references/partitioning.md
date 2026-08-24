# Bounded ownership and partitioning

Partitioning protects both product files and the parent context. It does not justify reading the
whole repository in the orchestrator.

## Baseline

1. Resolve one verified Git root and run ID.
2. Capture Git path/status streams outside the product tree as NUL-safe artifacts. The intake
   stores only counts, a bounded sample, and one digest for each stream. Filter the ignored
   directory list from `scripts/budget.mjs`.
3. Record pre-existing Herdr IDs. Only IDs returned by this run are disposable.
4. Reserve baseline dirty work by count/sample/artifact. Never auto-assign it.
5. Treat an unavailable dirty artifact as a mutation blocker, not as an empty tree.

Do not embed binary patches, full path arrays, per-file hashes, full environment values, or full
Git status in JSON. A worker or a dedicated metadata helper can inspect an external artifact and
return only overlap count/sample when the mutation gate needs it.

## Freeze and assign

- Analysis workers are normally serialized; a single analysis gets one worker.
- Concurrent units require exact disjoint `## Exclusive file set` sections verified by
  `scripts/check-exclusive.mjs`.
- A hub file runs alone before dependent units are dispatched.
- New files are assigned before dispatch. A worker may read outside its set but may not edit it.
- An overlap, unowned drift, or reserved-path collision stops the affected wave without reset,
  restore, stash, or broad copy.

## Ownership evidence

The orchestrator records only changed-path counts/samples and owner IDs. The worker report and
external diff/hash artifacts remain outside the parent context. Route a regression back to its
owner; the control plane must not open product source or patch around a worker.
