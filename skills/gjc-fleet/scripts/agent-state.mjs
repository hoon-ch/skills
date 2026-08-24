#!/usr/bin/env node
/**
 * Normalize `herdr agent get` or `herdr pane get` JSON for polling.
 *
 * It never upgrades an absent or unclassified agent to completion. Unknown is
 * an observation, not a success state. The output is JSON so callers do not
 * need jq or fragile regular expressions.
 *
 * Usage:
 *   herdr agent get <pane> | node agent-state.mjs --pane-id <pane>
 *   herdr pane get <pane> | node agent-state.mjs --pane-id <pane>
 *   herdr agent list | node agent-state.mjs --pane-id <pane>
 *
 * Exit 0 = valid JSON was normalized (including an explicit unknown state).
 * Exit 2 = malformed input.
 */

import { readFileSync } from "node:fs";
import { describeAgentSelection, selectLeafAgent } from "./agent-target.mjs";

const args = process.argv.slice(2);
let paneId = null;
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== "--pane-id" || typeof args[1] !== "string" || args[1].trim().length === 0) {
    console.error("usage: agent-state.mjs [--pane-id PANE_ID]");
    process.exit(2);
  }
  paneId = args[1].trim();
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  console.error("agent-state: input is not valid JSON");
  process.exit(2);
}

const result = payload?.result;
const selection = describeAgentSelection(payload, paneId);
const candidate = selectLeafAgent(payload, paneId);
const error = result?.error ?? payload?.error;

if (candidate === null || typeof candidate !== "object") {
  console.log(JSON.stringify({
    present: false,
    agent: null,
    status: "unknown",
    error_code: typeof error?.code === "string" ? error.code : selection.reason,
    pane_id: paneId,
    selection_reason: selection.reason,
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
  selection_reason: null,
}));
