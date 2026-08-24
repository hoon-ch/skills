#!/usr/bin/env node
/**
 * Small, dependency-free context and execution budgets for gjc-fleet.
 *
 * This module is intentionally boring.  It is imported by the intake, receipt,
 * canary, and worker-facing test ledger helpers so the limits cannot drift
 * between prose and enforcement.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const IGNORED_DIRS = Object.freeze([
  ".git",
  ".gjc",
  ".codex",
  ".claude",
  "target",
  ".build",
  "build",
  "node_modules",
  ".venv",
  "dist",
  "DerivedData",
  ".next",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".turbo",
  ".cache",
  ".gradle",
  "Pods",
  "Carthage",
]);

export const BUDGETS = Object.freeze({
  intakeMaxBytes: 64 * 1024,
  receiptMaxBytes: 16 * 1024,
  objectiveMaxBytes: 2 * 1024,
  metadataTextMaxBytes: 4 * 1024,
  receiptFieldMaxBytes: 512,
  contextFieldMaxCount: 32,
  conversationMessageMaxCount: 16,
  inventoryCommandMaxCount: 4,
  gitOutputMaxBytes: 128 * 1024 * 1024,
  preflightOutputMaxBytes: 4 * 1024 * 1024,
  receiptUnitMaxCount: 8,
  receiptLimitationMaxCount: 8,
  workerSummaryMaxBytes: 2 * 1024,
  workerFindingMaxCount: 8,
  workerFindingMaxBytes: 512,
  workerVerificationMaxCount: 8,
  pathSampleMaxCount: 24,
  pathSampleItemMaxBytes: 256,
  topLevelSampleMaxCount: 32,
  dispatchMaxBytes: 1024,
  paneDetectionMaxLines: 40,
  paneRecentUnwrappedMaxLines: 120,
  canaryMaxAttempts: 1,
  canaryReuseMs: 24 * 60 * 60 * 1000,
  workerFocusedTestMaxAttempts: 1,
  ownerReverifyMaxAttempts: 1,
  globalGateMaxAttempts: 1,
});

export const INTAKE_MAX_BYTES = BUDGETS.intakeMaxBytes;
export const RECEIPT_MAX_BYTES = BUDGETS.receiptMaxBytes;
export const WORKER_SUMMARY_MAX_BYTES = BUDGETS.workerSummaryMaxBytes;
export const PANE_DETECTION_LINES = BUDGETS.paneDetectionMaxLines;
export const PANE_RECENT_UNWRAPPED_LINES = BUDGETS.paneRecentUnwrappedMaxLines;
export const CANARY_MAX_ATTEMPTS = BUDGETS.canaryMaxAttempts;

export const TEST_PHASES = Object.freeze({
  focused: BUDGETS.workerFocusedTestMaxAttempts,
  owner_reverify: BUDGETS.ownerReverifyMaxAttempts,
  global: BUDGETS.globalGateMaxAttempts,
});

export function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}

export function boundedUtf8(value, maxBytes, suffix = "…") {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (byteLength(text) <= maxBytes) return text;
  const suffixBytes = byteLength(suffix);
  if (suffixBytes >= maxBytes) return Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
  return `${Buffer.from(text, "utf8").subarray(0, maxBytes - suffixBytes).toString("utf8")}${suffix}`;
}

export function compactText(value, maxBytes = BUDGETS.workerFindingMaxBytes) {
  return boundedUtf8(
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "",
    maxBytes,
  );
}

export function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.length > 0))]
    .sort();
}

export function compactSample(values, {
  maxCount = BUDGETS.pathSampleMaxCount,
  maxItemBytes = BUDGETS.pathSampleItemMaxBytes,
} = {}) {
  return uniqueSorted(values)
    .slice(0, maxCount)
    .map((value) => boundedUtf8(value, maxItemBytes));
}

export function jsonBytes(value) {
  return byteLength(JSON.stringify(value));
}

export function isIgnoredPath(value) {
  if (typeof value !== "string" || value.includes("\0")) return true;
  const parts = value.replaceAll("\\", "/").replace(/^\.\/+/, "").split("/");
  return parts.some((part) => IGNORED_DIRS.includes(part));
}

export function canonicalCommand(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new Error("test command must be a non-empty string");
  }
  return command.trim().replace(/\s+/g, " ");
}

export function commandFingerprint(command) {
  return createHash("sha256").update(canonicalCommand(command), "utf8").digest("hex");
}

function normalizePhase(phase) {
  const aliases = {
    "worker-focused": "focused",
    "owner-revalidation": "owner_reverify",
    "owner-reverify": "owner_reverify",
    "global-gate": "global",
  };
  const normalized = aliases[phase] ?? phase;
  if (!Object.hasOwn(TEST_PHASES, normalized)) {
    throw new Error(`unsupported test budget phase: ${String(phase)}`);
  }
  return normalized;
}

function normalizedLedger(ledger = {}) {
  const source = ledger && typeof ledger === "object" ? ledger : {};
  const attempts = Array.isArray(source.attempts) ? source.attempts.slice() : [];
  const counts = { focused: 0, owner_reverify: 0, global: 0 };
  for (const attempt of attempts) {
    const phase = attempt && typeof attempt.phase === "string" ? attempt.phase : "";
    if (Object.hasOwn(counts, phase)) counts[phase] += 1;
  }
  return {
    schema: "gjc-fleet-test-budget/v1",
    attempts,
    counts,
    budgets: { ...TEST_PHASES },
  };
}

export function newTestLedger(metadata = {}) {
  return {
    ...normalizedLedger(),
    metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
  };
}

export function claimTestAttempt(ledger, {
  phase,
  command,
  workerId = null,
  afterFix = false,
  now = new Date().toISOString(),
} = {}) {
  const normalized = normalizedLedger(ledger);
  const normalizedPhase = normalizePhase(phase);
  const canonical = canonicalCommand(command);
  if (normalizedPhase === "owner_reverify" && afterFix !== true) {
    throw new Error("owner revalidation requires afterFix=true");
  }
  const fingerprint = commandFingerprint(canonical);
  if (normalized.attempts.some((attempt) => attempt.fingerprint === fingerprint)) {
    throw new Error(`repeated test fingerprint is blocked: ${fingerprint}`);
  }
  if (normalized.counts[normalizedPhase] >= TEST_PHASES[normalizedPhase]) {
    throw new Error(`${normalizedPhase} test budget exhausted`);
  }
  const attempt = {
    id: `test-${normalized.attempts.length + 1}`,
    phase: normalizedPhase,
    fingerprint,
    command: boundedUtf8(canonical, 512),
    worker_id: typeof workerId === "string" ? boundedUtf8(workerId, 128) : null,
    after_fix: afterFix === true,
    status: "claimed",
    claimed_at: boundedUtf8(String(now), 64),
  };
  const next = {
    ...normalized,
    attempts: [...normalized.attempts, attempt],
  };
  next.counts[normalizedPhase] += 1;
  return next;
}

export function finishTestAttempt(ledger, id, {
  status,
  evidence = null,
} = {}) {
  const normalized = normalizedLedger(ledger);
  if (!normalized.attempts.some((attempt) => attempt.id === id)) {
    throw new Error(`unknown test attempt: ${String(id)}`);
  }
  if (!["passed", "failed", "blocked"].includes(status)) {
    throw new Error("test attempt status must be passed, failed, or blocked");
  }
  return {
    ...normalized,
    attempts: normalized.attempts.map((attempt) => attempt.id === id
      ? { ...attempt, status, evidence: evidence == null ? null : boundedUtf8(String(evidence), 512) }
      : attempt),
  };
}

function valueAfterFlag(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    values.set(arg.slice(2), valueAfterFlag(argv, index, arg));
    index += 1;
  }
  return values;
}

function loadLedger(path) {
  if (!existsSync(path)) return newTestLedger();
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveLedger(path, ledger) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
}

function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (!["test-claim", "test-finish"].includes(operation)) {
    throw new Error("usage: budget.mjs test-claim|test-finish --ledger PATH ...");
  }
  const values = parseCli(args);
  const ledgerPath = values.get("ledger");
  if (!ledgerPath) throw new Error("--ledger is required");
  let ledger = loadLedger(ledgerPath);
  if (operation === "test-claim") {
    ledger = claimTestAttempt(ledger, {
      phase: values.get("phase"),
      command: values.get("command"),
      workerId: values.get("worker"),
      afterFix: values.get("after-fix") === "true",
    });
  } else {
    ledger = finishTestAttempt(ledger, values.get("id"), {
      status: values.get("status"),
      evidence: values.get("evidence"),
    });
  }
  saveLedger(ledgerPath, ledger);
  process.stdout.write(`${JSON.stringify(ledger)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`GJC_FLEET_BUDGET_FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exit(2);
  }
}
