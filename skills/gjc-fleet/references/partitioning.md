# Partitioning work so parallel workers cannot conflict

## The problem with one-worktree-per-unit

The obvious topology — a worktree and a branch per unit of work — fails on UI-shaped work.
Findings scattered across many screens still land in the same few shared files: design tokens,
shared primitives, entity logic. Twenty branches editing `globals.css` produce twenty
conflicting diffs and an unmergeable pile.

## The partition that works

Treat it as a graph problem:

- **node** = one finding (or task) with its target file list
- **edge** = two findings name the same file
- **connected component** = a set of findings whose files never overlap another component's

Components are provably file-disjoint, so their workers can edit **the same worktree
concurrently**. No branches, no merges, nothing to reconcile. Union-find over the file lists
is enough:

```js
const par = items.map((_, i) => i);
const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
const owner = new Map();
items.forEach((f, i) => f.files.forEach((p) => {
  if (owner.has(p)) { const a = find(owner.get(p)), b = find(i); if (a !== b) par[b] = a; }
  else owner.set(p, i);
}));
```

## Hub files collapse the graph

Some files are edges to everything: the global stylesheet, `shared/ui/*`, `entities/*`. Left
in the pool, they merge nearly every finding into one giant component — observed as a single
unit holding 20 files and 33 findings while the rest were trivial.

Split hubs into their own unit and run it **alone, first**:

1. Classify a finding as *hub* if any of its files matches a hub pattern.
2. The hub unit runs by itself. Because nothing else is running, it may touch any file it needs.
3. Re-partition the remainder. Without hub edges it fragments into many small independent units.
4. Release those in parallel.

Order matters beyond conflicts: hub changes are the foundation. Cosmetic polish applied before
a token or contract change gets invalidated by it. Sequence foundations first, always.

## Verify the partition, never assume it

Emitting orders is not proof. Compute the intersection of every concurrently running pair:

```js
for (let i = 0; i < ids.length; i++)
  for (let j = i + 1; j < ids.length; j++) {
    const x = [...sets[ids[i]]].filter((v) => sets[ids[j]].has(v));
    if (x.length) console.log("CONFLICT", ids[i], ids[j], x.join(","));
  }
```

This check caught a real defect: the hub unit's file set bled into two later units, because a
hub finding also named page-level files. Two fixes are valid — restrict the hub unit's declared
set to hub files only and let it hand off the page portion, or keep it unrestricted and rely on
it running alone. Only compare units that actually run at the same time; a serialized unit is
not a conflict.

## Freeze the input before partitioning

Review sessions keep appending findings after they first report — observed growing 77 → 99
after orders were already emitted, which silently changed worker scope mid-flight. Copy reports
to a frozen directory, checksum it, and point every downstream generator at the frozen copy.

Tell reviewers explicitly to stop appending, then freeze; do not rely on the instruction alone.

## Sizing units

Balance by weight, not by count. `P0*3 + P1*2 + P2` approximates effort well enough. Very small
components can share a worker as long as their file sets stay disjoint — bundling them does not
break the guarantee, because disjointness is a property of the sets, not of the grouping.

## What does not partition

If a unit needs a file another concurrently running unit owns, do not let it reach across. Give
every worker an out-of-scope channel in its result file and route those requests yourself once
the owner finishes. Deferred handoffs stayed correct across two rounds; reaching across would
have raced.
