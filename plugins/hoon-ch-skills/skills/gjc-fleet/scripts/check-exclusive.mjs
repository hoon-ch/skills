#!/usr/bin/env node
// Prove that concurrently running work units own disjoint file sets.
//
// A fleet may edit one worktree in parallel only because each unit's file set is
// provably exclusive. Emitting orders is not proof; this is. Run it before every
// wave, and only over units that actually run at the same time — a serialized
// unit (a hub pass, for example) is not a conflict.
//
// Usage:
//   node check-exclusive.mjs <order-file> <order-file> [...]
//   node check-exclusive.mjs orders/f2-order.md orders/f3-order.md
//
// Each order file must contain a section listing owned files as markdown bullets
// wrapped in backticks:
//
//   ## Exclusive file set
//
//   - `src/app/page.tsx`
//   - `src/widgets/foo/ui/foo.tsx`
//
// Exit 0 = disjoint (safe to run in parallel). Exit 1 = overlap. Exit 2 = usage.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("usage: check-exclusive.mjs <order-file> <order-file> [...]");
  console.error("       needs at least two units to compare");
  process.exit(2);
}

/** Collect `- \`path\`` bullets. Stops at the next heading so prose bullets elsewhere
 *  in the order file are not mistaken for owned files. */
function ownedFiles(text) {
  const owned = new Set();
  let inList = false;
  for (const line of text.split("\n")) {
    if (/^#{2,}\s/.test(line)) {
      // A heading ends the current run of bullets.
      inList = false;
      continue;
    }
    const m = line.match(/^\s*-\s+`([^`]+)`\s*$/);
    if (m) {
      owned.add(m[1]);
      inList = true;
    } else if (inList && line.trim() === "") {
      inList = false;
    }
  }
  return owned;
}

const units = files.map((path) => {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
  const owned = ownedFiles(text);
  if (owned.size === 0) {
    console.error(`${path}: no owned files found — check the bullet format`);
    process.exit(2);
  }
  return { id: basename(path).replace(/-order\.md$/, ""), path, owned };
});

let conflicts = 0;
for (let i = 0; i < units.length; i += 1) {
  for (let j = i + 1; j < units.length; j += 1) {
    const shared = [...units[i].owned].filter((f) => units[j].owned.has(f));
    if (shared.length) {
      conflicts += 1;
      console.log(`CONFLICT ${units[i].id} <-> ${units[j].id}`);
      for (const f of shared) console.log(`  ${f}`);
    }
  }
}

for (const u of units) console.log(`  ${u.id}: ${u.owned.size} files`);

if (conflicts) {
  console.log(
    `\n${conflicts} overlapping pair(s) — do NOT run these in parallel.\n` +
      "Either serialize the overlapping units, or narrow one unit's set and hand the\n" +
      "remainder off as an out-of-scope item.",
  );
  process.exit(1);
}

console.log(`\ndisjoint — ${units.length} units are safe to run in parallel`);
