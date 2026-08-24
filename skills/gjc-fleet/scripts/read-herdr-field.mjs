#!/usr/bin/env node
/**
 * Extract one scalar field from a Herdr JSON response without guessing an ID.
 *
 * Usage:
 *   herdr tab create ... | node read-herdr-field.mjs result.tab.tab_id
 *   herdr tab create ... | node read-herdr-field.mjs result.root_pane.pane_id
 *
 * Exit 0 = one non-empty scalar was found. Exit 2 = malformed or missing data.
 */

import { readFileSync } from "node:fs";

const [selector, ...extra] = process.argv.slice(2);
if (!selector || extra.length || selector.startsWith("-") || selector.split(".").some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
  console.error("usage: read-herdr-field.mjs result.<object>.<field>");
  process.exit(2);
}

let value;
try {
  value = JSON.parse(readFileSync(0, "utf8"));
} catch {
  console.error("read-herdr-field: input is not valid JSON");
  process.exit(2);
}

for (const part of selector.split(".")) {
  if (value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) {
    console.error(`read-herdr-field: missing ${selector}`);
    process.exit(2);
  }
  value = value[part];
}

if ((typeof value !== "string" && typeof value !== "number") || String(value).length === 0) {
  console.error(`read-herdr-field: ${selector} is not a non-empty scalar`);
  process.exit(2);
}

process.stdout.write(`${String(value)}\n`);
