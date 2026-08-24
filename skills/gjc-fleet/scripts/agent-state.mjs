#!/usr/bin/env node
/**
 * Normalize `herdr agent get` or `herdr pane get` JSON for polling.
 *
 * It never upgrades an absent or unclassified agent to completion. Unknown is
 * an observation, not a success state. The output is JSON so callers do not
 * need jq or fragile regular expressions.
 *
 * Usage:
 *   herdr agent get <pane> | node agent-state.mjs
 *   herdr pane get <pane> | node agent-state.mjs
 *
 * Exit 0 = valid JSON was normalized (including an explicit unknown state).
 * Exit 2 = malformed input.
 */

import { readFileSync } from "node:fs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  console.error("agent-state: input is not valid JSON");
  process.exit(2);
}

const result = payload?.result;
const candidate = result?.agent ?? result?.pane ?? (Array.isArray(result?.agents) ? result.agents[0] : null);
const error = result?.error ?? payload?.error;

if (candidate === null || typeof candidate !== "object") {
  console.log(JSON.stringify({
    present: false,
    agent: null,
    status: "unknown",
    error_code: typeof error?.code === "string" ? error.code : null,
  }));
  process.exit(0);
}

const rawStatus = candidate.agent_status ?? candidate.status;
const statuses = new Set(["done", "idle", "working", "blocked", "unknown"]);
const status = statuses.has(rawStatus) ? rawStatus : "unknown";
const scalar = (key) => typeof candidate[key] === "string" ? candidate[key] : null;

console.log(JSON.stringify({
  present: true,
  agent: scalar("agent"),
  status,
  cwd: scalar("cwd"),
  foreground_cwd: scalar("foreground_cwd"),
  pane_id: scalar("pane_id"),
  tab_id: scalar("tab_id"),
  workspace_id: scalar("workspace_id"),
  error_code: typeof error?.code === "string" ? error.code : null,
}));
