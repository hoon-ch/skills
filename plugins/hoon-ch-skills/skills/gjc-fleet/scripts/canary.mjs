#!/usr/bin/env node
/**
 * The only canary probe allowed by gjc-fleet.
 *
 * It proves that a launched GJC worker has the expected cwd and can write one
 * external artifact.  It never reads the target tree and never invokes a
 * product command, build, package manager, or test.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGETS,
  boundedUtf8,
  jsonBytes,
} from "./budget.mjs";
import { digestFile } from "./receipt.mjs";

export const CANARY_SCHEMA = "gjc-fleet-canary/v1";
const FORBIDDEN_CANARY_COMMAND = /(?:^|\s)(?:cargo|go|npm|pnpm|yarn|bun|make|just|pytest|vitest|jest|gradle|mvn|xcodebuild|build|compile|install|test|check|lint)(?=\s|$)/i;
const FORBIDDEN_INSPECTION_COMMAND = /(?:^|\s)(?:git|find|rg|grep|sed|awk|cat|ls|tree)(?=\s|$)/i;

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is required`);
  return value.trim();
}

function resolvedDirectory(path, label) {
  const requested = requiredText(path, label);
  if (!isAbsolute(requested)) throw new Error(`${label} must be absolute`);
  try {
    if (!statSync(requested).isDirectory()) throw new Error(`${label} is not a directory`);
    return realpathSync(requested);
  } catch (error) {
    if (error instanceof Error && error.message === `${label} is not a directory`) throw error;
    throw new Error(`${label} cannot be read`);
  }
}

function externalArtifactPath(path, targetCwd) {
  const requested = requiredText(path, "artifact");
  if (!isAbsolute(requested)) throw new Error("artifact must be absolute");
  const artifact = resolve(requested);
  const target = resolve(targetCwd);
  if (artifact === target || artifact.startsWith(`${target}/`)) {
    throw new Error("canary artifact must be outside the target repository");
  }
  return artifact;
}

export function validateCanaryCommand(command) {
  const text = requiredText(command, "canary command");
  if (FORBIDDEN_CANARY_COMMAND.test(text)) {
    throw new Error("canary command contains a product/build/test command");
  }
  if (FORBIDDEN_INSPECTION_COMMAND.test(text)) {
    throw new Error("canary command may not inspect the repository");
  }
  if (!/canary\.mjs\b/i.test(text) || !/--(?:cwd|expected-cwd)\s+\S+/.test(text) || !/--artifact\s+\S+/.test(text)) {
    throw new Error("canary command must invoke canary.mjs with cwd and artifact");
  }
  return true;
}

function validDigest(value) {
  return value &&
    Number.isInteger(value.bytes) &&
    value.bytes > 0 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(value.sha256);
}

export function inspectCanaryArtifact(path) {
  const requested = typeof path === "string" && path.trim().length > 0 ? resolve(path) : null;
  if (!requested || !existsSync(requested)) {
    return {
      path: requested,
      exists: false,
      bytes: 0,
      sha256: null,
      valid: false,
      reason: "artifact missing",
    };
  }

  let stat;
  let value;
  try {
    stat = statSync(requested);
    if (!stat.isFile()) throw new Error("artifact is not a regular file");
    if (stat.size <= 0) throw new Error("artifact is zero bytes");
    if (stat.size > BUDGETS.receiptMaxBytes) throw new Error("artifact exceeds the compact receipt budget");
    value = JSON.parse(readFileSync(requested, "utf8"));
  } catch (error) {
    return {
      path: requested,
      exists: true,
      bytes: stat?.size ?? 0,
      sha256: null,
      valid: false,
      reason: boundedUtf8(error instanceof Error ? error.message : "artifact is unreadable", BUDGETS.receiptFieldMaxBytes),
    };
  }

  const digest = digestFile(requested);
  const valid = value?.schema === CANARY_SCHEMA &&
    value?.status === "passed" &&
    value?.cwd_verified === true &&
    value?.artifact_written === true &&
    value?.product_command === false &&
    value?.product_tree_read === false;
  return {
    path: requested,
    exists: true,
    bytes: digest.bytes,
    sha256: digest.sha256,
    valid,
    reason: valid ? null : "artifact is not a passed canary receipt",
  };
}

function proofMatches(left, right) {
  return left?.cwd === right.cwd &&
    left?.herdr_workspace === right.herdr_workspace &&
    left?.gjc_version === right.gjc_version &&
    left?.launcher === right.launcher;
}

export function canReuseCanary(previous, proof, now = Date.now(), artifactPath = null) {
  if (!previous || previous.status !== "passed" || !proofMatches(previous, proof)) return false;
  const timestamp = Date.parse(previous.proven_at ?? "");
  if (!Number.isFinite(timestamp) || now - timestamp < 0 || now - timestamp > BUDGETS.canaryReuseMs) return false;
  if (!validDigest(previous.artifact_digest)) return false;
  const artifact = inspectCanaryArtifact(artifactPath);
  return artifact.valid &&
    resolve(previous.artifact ?? "") === artifact.path &&
    previous.artifact_digest.bytes === artifact.bytes &&
    previous.artifact_digest.sha256.toLowerCase() === artifact.sha256;
}

function loadLedger(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("canary ledger is unreadable; refusing a retry");
  }
}

function saveLedger(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function runCanary({
  cwd,
  artifact,
  runDir,
  ledgerPath = resolve(runDir, "canary-ledger.json"),
  herdrWorkspace,
  gjcVersion,
  agentLaunched = true,
  launcher = "GJC",
  now = new Date(),
} = {}) {
  const targetCwd = resolvedDirectory(cwd, "cwd");
  const outputPath = externalArtifactPath(artifact, targetCwd);
  const externalRunDir = resolvedDirectory(runDir, "runDir");
  const proof = {
    cwd: targetCwd,
    herdr_workspace: boundedUtf8(requiredText(herdrWorkspace, "herdrWorkspace"), BUDGETS.receiptFieldMaxBytes),
    gjc_version: boundedUtf8(requiredText(gjcVersion, "gjcVersion"), BUDGETS.receiptFieldMaxBytes),
    launcher: boundedUtf8(requiredText(launcher, "launcher"), BUDGETS.receiptFieldMaxBytes),
  };
  const existing = loadLedger(ledgerPath);
  if (existing) {
    if (existing.status === "passed" && canReuseCanary(existing, proof, now.getTime(), outputPath)) {
      const artifactEvidence = inspectCanaryArtifact(outputPath);
      return {
        schema: CANARY_SCHEMA,
        status: "skipped",
        reason: "recent identical Herdr/GJC/version/cwd proof",
        artifact: outputPath,
        artifact_digest: {
          bytes: artifactEvidence.bytes,
          sha256: artifactEvidence.sha256,
        },
        ledger: ledgerPath,
      };
    }
    throw new Error("canary already attempted for this run; retry is forbidden and its artifact digest was not verified");
  }

  const started = {
    schema: CANARY_SCHEMA,
    status: "started",
    probe: "agent-launch-cwd-external-artifact-only",
    ...proof,
    attempt: BUDGETS.canaryMaxAttempts,
    started_at: now.toISOString(),
    ledger: ledgerPath,
  };
  // Claim the single attempt before any probe work.  A failed probe therefore
  // cannot be "fixed" by silently submitting a second canary order.
  saveLedger(ledgerPath, started);
  try {
    if (agentLaunched !== true) throw new Error("canary requires observed GJC launch");
    const result = {
      ...started,
      status: "passed",
      cwd_verified: process.cwd() === targetCwd,
      artifact_written: true,
      product_command: false,
      product_tree_read: false,
      proven_at: now.toISOString(),
      artifact,
    };
    if (!result.cwd_verified) throw new Error(`canary process cwd does not match ${targetCwd}`);
    if (jsonBytes(result) > BUDGETS.receiptMaxBytes) throw new Error("canary receipt exceeds the compact receipt budget");

    mkdirSync(externalRunDir, { recursive: true });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    const artifactEvidence = inspectCanaryArtifact(outputPath);
    if (!artifactEvidence.valid) throw new Error(`canary artifact verification failed: ${artifactEvidence.reason}`);
    const completed = {
      ...result,
      artifact: outputPath,
      artifact_digest: {
        bytes: artifactEvidence.bytes,
        sha256: artifactEvidence.sha256,
      },
    };
    saveLedger(ledgerPath, completed);
    return { ...completed, ledger: ledgerPath };
  } catch (error) {
    saveLedger(ledgerPath, {
      ...started,
      status: "failed",
      error: boundedUtf8(error instanceof Error ? error.message : "canary failed", BUDGETS.receiptFieldMaxBytes),
    });
    throw error;
  }
}

export function compactCanaryDiagnostic({
  phase = "worker",
  commandExit = null,
  commandOutputBytes = null,
  workerStatus = null,
  paneTransition = null,
  artifactPath = null,
} = {}) {
  const artifact = inspectCanaryArtifact(artifactPath);
  const exit = Number.isInteger(commandExit) ? commandExit : null;
  const outputMissing = phase === "self-test" && commandOutputBytes === 0;
  const workerEvidence = phase !== "self-test" &&
    (exit !== null && exit !== 0 || workerStatus !== null || paneTransition !== null);
  const passed = exit === 0 && artifact.valid && !outputMissing;
  const failureClass = passed ? null : workerEvidence ? "worker_failure" : "script_plumbing";
  const reason = passed
    ? null
    : outputMissing
      ? "canary script produced zero-byte stdout"
    : artifact.valid
      ? `canary command exited ${String(exit)}`
      : `${phase === "self-test" ? "canary script plumbing" : "canary artifact"}: ${artifact.reason}`;
  return {
    schema: CANARY_SCHEMA,
    status: passed ? "passed" : "failed",
    failure_class: failureClass,
    attempt: BUDGETS.canaryMaxAttempts,
    command_exit: exit,
    command_output_bytes: Number.isInteger(commandOutputBytes) ? commandOutputBytes : null,
    worker_status: typeof workerStatus === "string" ? boundedUtf8(workerStatus, 64) : null,
    pane_transition: typeof paneTransition === "string" ? boundedUtf8(paneTransition, 128) : null,
    artifact: {
      path: artifact.path,
      exists: artifact.exists,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    },
    reason: reason === null ? null : boundedUtf8(reason, BUDGETS.receiptFieldMaxBytes),
  };
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    values.set(arg.slice(2), value);
    index += 1;
  }
  return values;
}

function main() {
  const values = parseArgs(process.argv.slice(2));
  const command = `node canary.mjs --cwd ${values.get("cwd") ?? values.get("expected-cwd") ?? ""} --artifact ${values.get("artifact") ?? ""}`;
  validateCanaryCommand(command);
  const result = runCanary({
    cwd: values.get("cwd") ?? values.get("expected-cwd"),
    artifact: values.get("artifact"),
    runDir: values.get("run-dir"),
    ledgerPath: values.get("ledger"),
    herdrWorkspace: values.get("herdr-workspace"),
    gjcVersion: values.get("gjc-version"),
    agentLaunched: values.get("agent-launched") !== "false",
    launcher: values.get("launcher") ?? "GJC",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
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
  try {
    main();
  } catch (error) {
    console.error(`GJC_FLEET_CANARY_FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exit(2);
  }
}
