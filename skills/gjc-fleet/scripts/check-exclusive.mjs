#!/usr/bin/env node
// Prove that concurrently running work units own disjoint file sets.
//
// Usage:
//   node check-exclusive.mjs <order-file> <order-file> [...]
//
// Each order file must contain this exact section and one exact relative path
// per bullet:
//
//   ## Exclusive file set
//   - `src/app/page.tsx`
//
// Exit 0 = disjoint (safe to run in parallel). Exit 1 = overlap. Exit 2 = usage.

import { readFileSync } from "node:fs";
import { basename, posix } from "node:path";

const orderPaths = process.argv.slice(2);
if (orderPaths.length < 2) {
  console.error("usage: check-exclusive.mjs <order-file> <order-file> [...]");
  console.error("needs at least two units to compare");
  process.exit(2);
}

function normalizeOwnedPath(raw, orderPath) {
  const path = raw.replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.includes("\0") || path.includes("*") || path.includes("?")) {
    throw new Error(`${orderPath}: invalid owned path ${raw}`);
  }
  const normalized = posix.normalize(path);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${orderPath}: owned path escapes the repository: ${raw}`);
  }
  return normalized;
}

/** Collect only exact path bullets from the Exclusive file set section. */
function ownedFiles(text, orderPath) {
  const owned = new Set();
  let inSection = false;
  for (const line of text.split("\n")) {
    if (/^#{2,}\s+/.test(line)) {
      inSection = /^##\s+Exclusive file set\s*$/.test(line);
      continue;
    }
    if (!inSection) continue;
    const match = line.match(/^\s*-\s+`([^`]+)`\s*$/);
    if (!match) continue;
    const normalized = normalizeOwnedPath(match[1], orderPath);
    if (owned.has(normalized)) throw new Error(`${orderPath}: duplicate owned path ${normalized}`);
    owned.add(normalized);
  }
  if (owned.size === 0) throw new Error(`${orderPath}: no owned files in ## Exclusive file set`);
  return owned;
}

const units = [];
for (const orderPath of orderPaths) {
  let text;
  try {
    text = readFileSync(orderPath, "utf8");
  } catch (error) {
    console.error(`cannot read ${orderPath}: ${error.message}`);
    process.exit(2);
  }
  try {
    units.push({
      id: basename(orderPath).replace(/-order\.md$/, ""),
      path: orderPath,
      owned: ownedFiles(text, orderPath),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : `invalid order ${orderPath}`);
    process.exit(2);
  }
}

let conflicts = 0;
for (let i = 0; i < units.length; i += 1) {
  for (let j = i + 1; j < units.length; j += 1) {
    const shared = [...units[i].owned].filter((file) => units[j].owned.has(file));
    if (!shared.length) continue;
    conflicts += 1;
    console.log(`CONFLICT ${units[i].id} <-> ${units[j].id}`);
    for (const file of shared) console.log(`  ${file}`);
  }
}

for (const unit of units) console.log(`  ${unit.id}: ${unit.owned.size} files`);

if (conflicts) {
  console.log(
    `\n${conflicts} overlapping pair(s) — do NOT run these in parallel.\n` +
      "Serialize the pair or narrow one exclusive set and record the remainder as out of scope.",
  );
  process.exit(1);
}

console.log(`\ndisjoint — ${units.length} units are safe to run in parallel`);
