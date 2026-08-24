#!/usr/bin/env node
/**
 * Converts verbose worker artifacts into a small machine receipt.  The caller
 * may hash and inspect an external report here, but this module never returns
 * the report body, terminal transcript, or log contents.
 */

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGETS, boundedUtf8, byteLength, compactText, jsonBytes } from "./budget.mjs";

export const WORKER_RECEIPT_SCHEMA = "gjc-fleet-worker-receipt/v1";
export const RECEIPT_SCHEMA = "gjc-fleet-receipt/v2";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function digestText(value) {
  const content = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === "string" ? value : String(value ?? ""), "utf8");
  return { bytes: content.byteLength, sha256: sha256(content) };
}

export function digestFile(path) {
  const absolute = resolve(path);
  const content = readFileSync(absolute);
  return {
    path: absolute,
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

function headingIndex(lines, name) {
  const matcher = new RegExp(`^\\s*#{1,6}\\s+${name}\\s*$`, "i");
  return lines.findIndex((line) => matcher.test(line));
}

function sectionLines(lines, name) {
  const start = headingIndex(lines, name);
  if (start < 0) return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*#{1,6}\s+/.test(lines[index])) break;
    result.push(lines[index]);
  }
  return result;
}

function cleanLine(line, maxBytes = BUDGETS.workerFindingMaxBytes) {
  return compactText(String(line ?? "").replace(/^\s*[-*]\s+/, ""), maxBytes);
}

function parseSummary(lines) {
  const source = sectionLines(lines, "Summary");
  const fallback = source.length > 0 ? source : lines.filter((line) => line.trim() && !/^\s*#/.test(line)).slice(0, 8);
  const raw = fallback.map((line) => line.trim()).filter(Boolean).join(" ");
  return {
    summary: boundedUtf8(raw, BUDGETS.workerSummaryMaxBytes),
    summary_truncated: byteLength(raw) > BUDGETS.workerSummaryMaxBytes,
  };
}

function parseFindings(lines, artifact) {
  const source = sectionLines(lines, "Findings");
  const candidates = source
    .filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line))
    .map(cleanLine)
    .filter(Boolean);
  const top = candidates.slice(0, BUDGETS.workerFindingMaxCount);
  return {
    top,
    omitted_count: Math.max(0, candidates.length - top.length),
    artifact,
  };
}

function integerFrom(text, name) {
  const match = text.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function parseCounts(text) {
  const done = text.match(/FIX_DONE\s+\S+\s+FIXED=(\d+)\s+WITHDRAWN=(\d+)\s+OUTOFSCOPE=(\d+)\s+TYPECHECK=(pass|fail|skip)/i);
  return {
    fixed: done ? Number(done[1]) : integerFrom(text, "fixed"),
    withdrawn: done ? Number(done[2]) : integerFrom(text, "withdrawn"),
    out_of_scope: done ? Number(done[3]) : integerFrom(text, "outofscope"),
    typecheck: done ? done[4].toLowerCase() : null,
    machine_line: Boolean(done),
  };
}

function parseVerification(lines) {
  const source = sectionLines(lines, "Verification");
  const rows = [];
  for (const line of source) {
    if (!line.includes("|") || /^\s*\|?\s*-+\s*\|/.test(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2 || /^check$/i.test(cells[0])) continue;
    const status = cells[1].toLowerCase();
    rows.push({
      check: boundedUtf8(cells[0], 128),
      status: boundedUtf8(status, 32),
      command: boundedUtf8(cells[2] ?? "", 256),
      evidence: boundedUtf8(cells[3] ?? "", 256),
      limitation: boundedUtf8(cells[4] ?? "", 256),
    });
    if (rows.length >= BUDGETS.workerVerificationMaxCount) break;
  }
  return rows;
}

export function parseWorkerReport(text, artifact = null) {
  const source = typeof text === "string" ? text : String(text ?? "");
  const lines = source.split(/\r?\n/);
  const summary = parseSummary(lines);
  const reportArtifact = artifact ?? digestText(source);
  const findings = parseFindings(lines, reportArtifact);
  const counts = parseCounts(source);
  const verification = parseVerification(lines);
  const failed = verification.some((row) => ["fail", "failed"].includes(row.status));
  const invalid = summary.summary_truncated || !counts.machine_line;
  return {
    schema: WORKER_RECEIPT_SCHEMA,
    report: reportArtifact,
    summary: summary.summary,
    summary_bytes: byteLength(summary.summary),
    summary_truncated: summary.summary_truncated,
    findings,
    counts,
    verification,
    status: failed ? "failed" : invalid ? "invalid" : "observed",
  };
}

export function readWorkerReport(path) {
  const artifact = digestFile(path);
  return parseWorkerReport(readFileSync(artifact.path, "utf8"), artifact);
}

export function assertCompactReceipt(value, maxBytes = BUDGETS.receiptMaxBytes) {
  const bytes = jsonBytes(value);
  if (bytes > maxBytes) throw new Error(`receipt exceeds ${maxBytes} bytes (${bytes})`);
  return value;
}

export function compactOverflowReceipt({ schema, reason, inputBytes = null, targetRepo = null } = {}) {
  const receipt = {
    schema: schema ?? "gjc-fleet-intake/v3",
    phase: "COMPACTED",
    state: "blocked",
    compacted: true,
    reason: boundedUtf8(reason ?? "receipt exceeded hard cap", BUDGETS.receiptFieldMaxBytes),
    input_bytes: Number.isFinite(inputBytes) ? inputBytes : null,
    limit_bytes: BUDGETS.receiptMaxBytes,
    target_repo: typeof targetRepo === "string" ? boundedUtf8(targetRepo, BUDGETS.receiptFieldMaxBytes) : null,
    blockers: ["fail-closed compact receipt; inspect external artifacts, not this context"],
  };
  return assertCompactReceipt(receipt);
}

export function writeCompactWorkerReceipt(path, reportPath) {
  const receipt = assertCompactReceipt(readWorkerReport(reportPath));
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

export function receiptHasOnlyBoundedWorkerFields(receipt) {
  if (!receipt || receipt.schema !== WORKER_RECEIPT_SCHEMA) return false;
  return jsonBytes(receipt) <= BUDGETS.receiptMaxBytes &&
    byteLength(receipt.summary ?? "") <= BUDGETS.workerSummaryMaxBytes &&
    Array.isArray(receipt.findings?.top) &&
    receipt.findings.top.length <= BUDGETS.workerFindingMaxCount;
}

function compactArtifact(value) {
  if (!value || typeof value !== "object") return null;
  return {
    path: typeof value.path === "string" ? boundedUtf8(value.path, BUDGETS.receiptFieldMaxBytes) : null,
    bytes: Number.isInteger(value.bytes) && value.bytes >= 0 ? value.bytes : null,
    sha256: /^[a-f0-9]{64}$/i.test(value.sha256 ?? "") ? value.sha256.toLowerCase() : null,
  };
}

export function compactFleetReceipt(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const objective = source.objective && typeof source.objective === "object"
    ? {
        text: boundedUtf8(source.objective.text ?? "", BUDGETS.receiptFieldMaxBytes),
        source: boundedUtf8(source.objective.source ?? "conversation", 128),
      }
    : { text: boundedUtf8(source.objective ?? "", BUDGETS.receiptFieldMaxBytes), source: "conversation" };
  const target = source.target && typeof source.target === "object" ? source.target : {};
  const units = Array.isArray(source.units) ? source.units.slice(0, BUDGETS.receiptUnitMaxCount).map((unit, index) => ({
    id: boundedUtf8(unit?.id ?? `unit-${index + 1}`, 128),
    lifecycle: boundedUtf8(unit?.lifecycle ?? "unknown", 32),
    owned_count: Number.isInteger(unit?.owned_count) ? unit.owned_count : 0,
    result: compactArtifact(unit?.result),
    summary: boundedUtf8(unit?.summary ?? "", BUDGETS.receiptFieldMaxBytes),
    fixed: Number.isInteger(unit?.fixed) ? unit.fixed : null,
    withdrawn: Number.isInteger(unit?.withdrawn) ? unit.withdrawn : null,
    out_of_scope: Number.isInteger(unit?.out_of_scope) ? unit.out_of_scope : null,
    verification: Array.isArray(unit?.verification)
      ? unit.verification.slice(0, BUDGETS.workerVerificationMaxCount).map((row) => ({
          check: boundedUtf8(row?.check ?? "", 128),
          status: boundedUtf8(row?.status ?? "unknown", 32),
          evidence: boundedUtf8(row?.evidence ?? "", BUDGETS.receiptFieldMaxBytes),
        }))
      : [],
  })) : [];
  const receipt = {
    schema: RECEIPT_SCHEMA,
    phase: "RECEIPT",
    state: boundedUtf8(source.state ?? "incomplete", 32),
    run_id: boundedUtf8(source.run_id ?? "unknown", 128),
    objective,
    target: {
      repo_root: boundedUtf8(target.repo_root ?? "", BUDGETS.receiptFieldMaxBytes),
      resolved_cwd_verified: target.resolved_cwd_verified === true,
    },
    budgets: {
      receipt_bytes: BUDGETS.receiptMaxBytes,
      worker_summary_bytes: BUDGETS.workerSummaryMaxBytes,
      pane_detection_lines: BUDGETS.paneDetectionMaxLines,
      pane_recent_unwrapped_lines: BUDGETS.paneRecentUnwrappedMaxLines,
    },
    canary: {
      status: boundedUtf8(source.canary?.status ?? "unknown", 32),
      artifact: compactArtifact(source.canary?.artifact),
    },
    units,
    tests: {
      ledger: compactArtifact(source.tests?.ledger),
      attempts: Number.isInteger(source.tests?.attempts) ? source.tests.attempts : 0,
    },
    dirty: {
      reserved_count: Number.isInteger(source.dirty?.reserved_count) ? source.dirty.reserved_count : 0,
      sample: Array.isArray(source.dirty?.sample) ? source.dirty.sample.slice(0, BUDGETS.pathSampleMaxCount).map((path) => boundedUtf8(path, BUDGETS.pathSampleItemMaxBytes)) : [],
      artifact: compactArtifact(source.dirty?.artifact),
    },
    resources: {
      created_count: Number.isInteger(source.resources?.created_count) ? source.resources.created_count : 0,
      retired_count: Number.isInteger(source.resources?.retired_count) ? source.resources.retired_count : 0,
      preserved_count: Number.isInteger(source.resources?.preserved_count) ? source.resources.preserved_count : 0,
    },
    limitations: Array.isArray(source.limitations)
      ? source.limitations.slice(0, BUDGETS.receiptLimitationMaxCount).map((item) => boundedUtf8(item, BUDGETS.receiptFieldMaxBytes))
      : [],
  };
  if (jsonBytes(receipt) <= BUDGETS.receiptMaxBytes) return receipt;
  return compactOverflowReceipt({
    schema: RECEIPT_SCHEMA,
    reason: "final fleet receipt exceeded the hard cap",
    inputBytes: jsonBytes(receipt),
    targetRepo: target.repo_root,
  });
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  if (process.argv.length < 3) {
    console.error("GJC_FLEET_RECEIPT_FAILED: usage: receipt.mjs REPORT_PATH");
    process.exit(2);
  }
  try {
    const receipt = readWorkerReport(process.argv[2]);
    assertCompactReceipt(receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    console.error(`GJC_FLEET_RECEIPT_FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exit(2);
  }
}
