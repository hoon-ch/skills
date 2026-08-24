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
export const REPORT_CORRECTION_SCHEMA = "gjc-fleet-report-correction/v1";

const REQUIRED_REPORT_HEADINGS = Object.freeze([
  "Summary",
  "Findings",
  "Fixed",
  "Withdrawn",
  "Out of scope",
  "Verification",
]);

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

function validateHeadings(lines) {
  const missing = REQUIRED_REPORT_HEADINGS.filter((name) => headingIndex(lines, name) < 0);
  const duplicates = REQUIRED_REPORT_HEADINGS.filter((name) =>
    lines.filter((line) => new RegExp(`^\\s*#{1,6}\\s+${name}\\s*$`, "i").test(line)).length > 1);
  return {
    required: REQUIRED_REPORT_HEADINGS.slice(),
    missing,
    duplicates,
    valid: missing.length === 0 && duplicates.length === 0,
  };
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
    .map((line) => cleanLine(line))
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

function machineLine(source) {
  const lines = source.split(/\r?\n/).filter((line) => /\bFIX_DONE\b/i.test(line));
  if (lines.length !== 1) {
    return {
      found: false,
      error: lines.length === 0 ? "missing FIX_DONE line" : "multiple FIX_DONE lines",
      fields: {},
    };
  }
  const line = lines[0];
  const fields = {};
  for (const match of line.matchAll(/\b([A-Za-z][A-Za-z0-9_-]*)\s*=\s*([^\s]+)/g)) {
    fields[match[1].toLowerCase().replaceAll("-", "_")] = match[2].replace(/[),.;]+$/g, "");
  }
  return { found: true, error: null, fields };
}

function countField(fields, ...names) {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function booleanField(fields, ...names) {
  for (const name of names) {
    const value = fields[name];
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function parseCounts(text) {
  const parsed = machineLine(text);
  const fields = parsed.fields;
  const verification = fields.verification ?? fields.typecheck ?? null;
  const normalizedVerification = typeof verification === "string"
    ? verification.toLowerCase()
    : null;
  const fixed = countField(fields, "fixed", "fixed_count");
  const withdrawn = countField(fields, "withdrawn", "withdrawn_count");
  const outOfScope = countField(fields, "outofscope", "out_of_scope", "out_of_scope_count");
  const validVerification = normalizedVerification !== null &&
    ["live", "gated", "skip", "pass", "fail"].includes(normalizedVerification);
  const modernOwnershipValid = fields.verification === undefined ||
    (countField(fields, "owned_paths", "owned") !== null && booleanField(fields, "reserved_preserved", "preserved") === true);
  const machineLineValid = parsed.found &&
    fixed !== null &&
    withdrawn !== null &&
    outOfScope !== null &&
    validVerification &&
    modernOwnershipValid;
  return {
    fixed,
    withdrawn,
    out_of_scope: outOfScope,
    typecheck: fields.typecheck?.toLowerCase() ?? null,
    verification: normalizedVerification,
    owned_paths: countField(fields, "owned_paths", "owned"),
    reserved_preserved: booleanField(fields, "reserved_preserved", "preserved"),
    machine_line: machineLineValid,
    machine_line_error: machineLineValid
      ? null
      : parsed.error ?? "FIX_DONE must include counts, verification, owned_paths, and reserved_preserved=true key=value fields",
  };
}

function parseVerification(lines, counts) {
  const source = sectionLines(lines, "Verification");
  const rows = [];
  for (const line of source) {
    if (line.includes("|") && !/^\s*\|?\s*-+\s*\|/.test(line)) {
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 2 && !/^check$/i.test(cells[0])) {
        const status = cells[1].toLowerCase();
        rows.push({
          check: boundedUtf8(cells[0], 128),
          status: boundedUtf8(status, 32),
          command: boundedUtf8(cells[2] ?? "", 256),
          evidence: boundedUtf8(cells[3] ?? "", 256),
          limitation: boundedUtf8(cells[4] ?? "", 256),
        });
      }
    } else {
      const bullet = line.match(/^\s*[-*]\s+\*{0,2}([^:*]+)\*{0,2}:\s*(.*)$/);
      if (bullet) {
        const check = bullet[1].trim();
        const normalized = check.toLowerCase();
        const status = ["live", "gated", "skip", "pass", "fail", "failed"].includes(normalized)
          ? normalized
          : "unknown";
        rows.push({
          check: boundedUtf8(check, 128),
          status: boundedUtf8(status, 32),
          command: "",
          evidence: boundedUtf8(bullet[2], 256),
          limitation: "",
        });
      }
    }
    if (rows.length >= BUDGETS.workerVerificationMaxCount) break;
  }
  if (rows.length === 0 && counts?.verification) {
    rows.push({
      check: "machine",
      status: boundedUtf8(counts.verification, 32),
      command: "",
      evidence: "FIX_DONE machine line",
      limitation: "",
    });
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
  const headings = validateHeadings(lines);
  const verification = parseVerification(lines, counts);
  const failed = verification.some((row) => ["fail", "failed"].includes(row.status));
  const validationErrors = [];
  if (!headings.valid) {
    if (headings.missing.length > 0) validationErrors.push(`missing headings: ${headings.missing.join(", ")}`);
    if (headings.duplicates.length > 0) validationErrors.push(`duplicate headings: ${headings.duplicates.join(", ")}`);
  }
  if (summary.summary_truncated) validationErrors.push("Summary exceeds the worker summary budget");
  if (!counts.machine_line) validationErrors.push(counts.machine_line_error);
  const invalid = validationErrors.length > 0;
  return {
    schema: WORKER_RECEIPT_SCHEMA,
    report: reportArtifact,
    summary: summary.summary,
    summary_bytes: byteLength(summary.summary),
    summary_truncated: summary.summary_truncated,
    headings,
    findings,
    counts,
    verification,
    validation_errors: validationErrors.map((error) => boundedUtf8(error, BUDGETS.receiptFieldMaxBytes)),
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

export function newReportCorrectionLedger({ workerId = null } = {}) {
  return {
    schema: REPORT_CORRECTION_SCHEMA,
    worker_id: typeof workerId === "string" && workerId.trim().length > 0 ? boundedUtf8(workerId.trim(), 128) : null,
    attempts: [],
    budget: BUDGETS.reportCorrectionMaxAttempts,
    product_reruns: 0,
    test_retries: 0,
    canary_retries: 0,
  };
}

export function claimReportOnlyCorrection(ledger, {
  workerId,
  report,
  now = new Date().toISOString(),
} = {}) {
  const source = ledger && typeof ledger === "object" ? ledger : newReportCorrectionLedger();
  const id = typeof workerId === "string" ? workerId.trim() : "";
  if (!id) throw new Error("report-only correction requires the original worker id");
  if (source.worker_id && source.worker_id !== id) {
    throw new Error("report-only correction must return to the same worker");
  }
  if (!report || report.status !== "invalid") {
    throw new Error("report-only correction is only available for a malformed worker report");
  }
  const attempts = Array.isArray(source.attempts) ? source.attempts : [];
  const budget = Number.isInteger(source.budget)
    ? source.budget
    : BUDGETS.reportCorrectionMaxAttempts;
  if (attempts.length >= budget) throw new Error("report-only correction budget exhausted");
  const next = {
    ...source,
    schema: REPORT_CORRECTION_SCHEMA,
    worker_id: id,
    budget,
    product_reruns: 0,
    test_retries: 0,
    canary_retries: 0,
    attempts: [
      ...attempts,
      {
        id: `report-correction-${attempts.length + 1}`,
        kind: "report_only",
        worker_id: id,
        report_digest: report.report?.sha256 ?? null,
        status: "claimed",
        claimed_at: boundedUtf8(String(now), 64),
        product_rerun: false,
        test_retry: false,
        canary_retry: false,
      },
    ],
  };
  return assertCompactReceipt(next);
}

export const claimReportCorrection = claimReportOnlyCorrection;

export function finishReportOnlyCorrection(ledger, id, {
  status,
  evidence = null,
} = {}) {
  if (!["corrected", "failed"].includes(status)) {
    throw new Error("report-only correction status must be corrected or failed");
  }
  const source = ledger && typeof ledger === "object" ? ledger : {};
  if (!Array.isArray(source.attempts) || !source.attempts.some((attempt) => attempt.id === id)) {
    throw new Error(`unknown report-only correction attempt: ${String(id)}`);
  }
  return assertCompactReceipt({
    ...source,
    attempts: source.attempts.map((attempt) => attempt.id === id
      ? { ...attempt, status, evidence: evidence == null ? null : boundedUtf8(String(evidence), 512) }
      : attempt),
  });
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
    owned_paths: Number.isInteger(unit?.owned_paths) ? unit.owned_paths : null,
    result: compactArtifact(unit?.result),
    summary: boundedUtf8(unit?.summary ?? "", BUDGETS.receiptFieldMaxBytes),
    fixed: Number.isInteger(unit?.fixed) ? unit.fixed : null,
    withdrawn: Number.isInteger(unit?.withdrawn) ? unit.withdrawn : null,
    out_of_scope: Number.isInteger(unit?.out_of_scope) ? unit.out_of_scope : null,
    machine_line: unit?.machine_line === true,
    reserved_preserved: unit?.reserved_preserved === true,
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
      mode: boundedUtf8(source.dirty?.mode ?? "preserve_no_touch", 32),
      adopted_count: Number.isInteger(source.dirty?.adopted_count) ? source.dirty.adopted_count : 0,
      adopted_sample: Array.isArray(source.dirty?.adopted_sample)
        ? source.dirty.adopted_sample.slice(0, BUDGETS.pathSampleMaxCount).map((path) => boundedUtf8(path, BUDGETS.pathSampleItemMaxBytes))
        : [],
      baseline_digest: /^[a-f0-9]{64}$/i.test(source.dirty?.baseline_digest ?? "")
        ? source.dirty.baseline_digest.toLowerCase()
        : null,
      unauthorized_overlap_count: Number.isInteger(source.dirty?.unauthorized_overlap_count)
        ? source.dirty.unauthorized_overlap_count
        : 0,
    },
    resources: {
      created_count: Number.isInteger(source.resources?.created_count) ? source.resources.created_count : 0,
      retired_count: Number.isInteger(source.resources?.retired_count) ? source.resources.retired_count : 0,
      preserved_count: Number.isInteger(source.resources?.preserved_count) ? source.resources.preserved_count : 0,
      unowned_drift_count: Number.isInteger(source.resources?.unowned_drift_count) ? source.resources.unowned_drift_count : 0,
      runtime_state: source.resources?.runtime_state && typeof source.resources.runtime_state === "object"
        ? {
            status: boundedUtf8(source.resources.runtime_state.status ?? "unknown", 32),
            ownership_proven: source.resources.runtime_state.ownership_proven === true,
            pre_existing_preserved: source.resources.runtime_state.pre_existing_preserved === true,
            cleanup_allowed: source.resources.runtime_state.cleanup_allowed === true,
            created_count: Number.isInteger(source.resources.runtime_state.created_count) ? source.resources.runtime_state.created_count : 0,
            fleet_created_count: Number.isInteger(source.resources.runtime_state.fleet_created_count) ? source.resources.runtime_state.fleet_created_count : 0,
            unexplained_created_count: Number.isInteger(source.resources.runtime_state.unexplained_created_count) ? source.resources.runtime_state.unexplained_created_count : 0,
            unexplained_sample: Array.isArray(source.resources.runtime_state.unexplained_sample)
              ? source.resources.runtime_state.unexplained_sample.slice(0, BUDGETS.pathSampleMaxCount).map((path) => boundedUtf8(path, BUDGETS.pathSampleItemMaxBytes))
              : [],
          }
        : null,
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
