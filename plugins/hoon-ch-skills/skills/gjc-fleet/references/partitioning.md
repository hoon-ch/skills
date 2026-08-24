# Partitioning work without collisions

A fleet may edit one checkout concurrently only when the concurrently running units own disjoint
paths. The partition is a safety invariant, not a suggestion.

## Boundary and baseline

Before review or fan-out:

1. Resolve one absolute Git root and one `run_id`.
2. Capture `git status --porcelain=v1 -z` plus hashes of every tracked and untracked path that
   is already dirty. Store this outside product files in the run directory.
3. Record all existing Herdr workspace/tab/pane IDs. Only IDs returned by this run are disposable.
4. Mark baseline-dirty paths as reserved. A worker cannot modify them unless the assignment
   explicitly includes the path and the receipt names that decision.
5. Reject any order whose owned set intersects another live unit or a reserved user path.

Do not seed a new worktree by applying a patch over an unknown checkout. If uncommitted work
must be included, copy only an explicitly enumerated binary patch and explicitly enumerated
untracked files into a fresh workspace, then compare marker counts and hashes. Never use
`git reset`, `git restore`, `git stash`, or a broad copy to make the boundary look clean.

## Freeze before ordering

Read-only reviewers write separate reports. When the review window closes, stop accepting
reports, copy them to a frozen directory, and checksum the frozen set. Partition only the
frozen copy. A report that changes after orders are emitted is a new input for a new wave, not
an invisible scope expansion.

## File graph

- node = one finding or assignment with its exact target file list;
- edge = two nodes name the same file;
- connected component = one serialized unit whose files overlap internally but not with another
  concurrently running unit.

Union-find over file names is enough. Paths must be normalized relative repository paths; do
not use globs or directory names as a substitute for files. New files must be named in the
order before dispatch so two workers cannot invent the same path.

Hub files such as global styles, shared UI primitives, entity contracts, routing registries,
and generated configuration are edges to many findings. Put a hub in its own unit and run it
alone first. Re-freeze/re-partition the remaining findings after the hub lands; an old order is
not valid merely because its text still exists.

## Verify every concurrent wave

Run the bundled verifier over only the units that will be live together:

```bash
node /path/to/gjc-fleet/scripts/check-exclusive.mjs \
  "$RUN_DIR/orders/f2-order.md" \
  "$RUN_DIR/orders/f3-order.md" \
  "$RUN_DIR/orders/f4-order.md"
```

Exit 0 is a proof of disjoint exact paths. Exit 1 names an overlap and blocks the wave. Exit 2
means an order is malformed. A serialized hub may overlap later units because it is not live at
the same time; do not incorrectly compare serialized and parallel waves.

The verifier reads only the `## Exclusive file set` section, rejects traversal/glob paths, and
rejects duplicate declarations. It does not prove that a worker respected the contract after
dispatch. At each wave boundary, compare actual changed paths with the union of declared sets:

- zero owners = unauthorized drift or an explicitly recorded new artifact;
- one owner = valid ownership;
- multiple owners = a collision; stop the affected wave and preserve both diffs for review.

A worker that needs a path outside its set must record an out-of-scope handoff with the blocking
file. It must not edit around the partition. Route the handoff after the owner retires and
re-emit the order against the new frozen state.
