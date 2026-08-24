#!/usr/bin/env node
/**
 * Read-only admission checks for a GJC fleet.
 *
 * This deliberately validates the installed binaries instead of assuming that
 * a copied Herdr/GJC help page still describes the machine running the fleet.
 * It creates no Herdr resource and never prints command output that could carry
 * credentials.
 *
 * Usage:
 *   node preflight.mjs --repo /absolute/repo --intake-receipt /tmp/intake.json \
 *     --model openai-codex/gpt-5.6-luna \
 *     --thinking max
 *   node preflight.mjs --repo /absolute/repo --intake-receipt /tmp/intake.json \
 *     --preset cxa-daily
 *
 * Exit 0 = admitted. Exit 2 = fail closed.
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BUDGETS, byteLength, jsonBytes } from "./budget.mjs";
import { compactCanaryDiagnostic } from "./canary.mjs";
import { STATES, TRANSITIONS, validateObjectiveReceipt } from "./intake.mjs";

const PRESET_MARKER = "GJC_FLEET_PRESET_OK";
const ALLOWED_THINKING = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);

function usage() {
  console.log(`Usage: preflight.mjs --repo ABSOLUTE_REPO --intake-receipt PATH (--model PROVIDER/MODEL [--thinking LEVEL] | --preset NAME) [--herdr-bin PATH] [--gjc-bin PATH] [--canary-script PATH]

Read-only checks:
  - an OBJECTIVE_ADMITTED intake receipt whose target matches --repo
  - a compact receipt within ${BUDGETS.receiptMaxBytes} bytes
  - HERDR_ENV=1 and a real Git repository
  - herdr --skill and the installed Herdr command/flag surface
  - gjc --version/--help and either an exact provider/model or a preset probe
  - a plain-node canary self-test through the exact installed script path

No panes, tabs, worktrees, sessions, or model workers are created.`);
}

function fail(message) {
  throw new Error(`GJC_FLEET_PREFLIGHT_FAILED: ${message}`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      usage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) fail(`unexpected argument ${arg}`);
    const key = arg.slice(2);
    if (!new Set(["repo", "intake-receipt", "model", "preset", "thinking", "herdr-bin", "gjc-bin", "canary-script"]).has(key)) {
      fail(`unsupported option --${key}; inspect the installed helper with --help`);
    }
    if (values.has(key)) fail(`duplicate option --${key}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) fail(`--${key} needs a value`);
    values.set(key, value);
  }
  return values;
}

function run(bin, args, allowExitCodes = new Set(), { cwd = undefined } = {}) {
  let result;
  try {
    result = spawnSync(bin, args, {
      encoding: "utf8",
      env: process.env,
      cwd,
      maxBuffer: BUDGETS.preflightOutputMaxBytes,
      timeout: 30_000,
    });
  } catch (error) {
    return { status: null, stdout: "", stderr: "", error };
  }
  const status = typeof result.status === "number" ? result.status : null;
  return {
    status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
    ok: status === 0 || allowExitCodes.has(status),
  };
}

function defaultCanaryScript() {
  const entrypoint = process.argv[1]
    ? resolve(process.argv[1])
    : fileURLToPath(import.meta.url);
  return resolve(dirname(entrypoint), "canary.mjs");
}

function boundedScriptPath(script) {
  return script.length <= BUDGETS.receiptFieldMaxBytes
    ? script
    : `${script.slice(0, BUDGETS.receiptFieldMaxBytes - 1)}…`;
}

function selfTestCanary(script, repo, gjcVersion) {
  const runDir = mkdtempSync(join(tmpdir(), "gjc-fleet-preflight-canary-"));
  const artifact = join(runDir, "canary-result.json");
  const result = run(process.execPath, [
    script,
    "--cwd",
    repo,
    "--artifact",
    artifact,
    "--run-dir",
    runDir,
    "--herdr-workspace",
    "preflight-self-test",
    "--gjc-version",
    gjcVersion,
    "--launcher",
    "preflight-self-test",
  ], new Set(), { cwd: repo });
  const diagnostic = compactCanaryDiagnostic({
    phase: "self-test",
    commandExit: result.status,
    commandOutputBytes: byteLength(result.stdout),
    artifactPath: artifact,
  });
  try {
    if (result.error || diagnostic.status !== "passed") {
      const compact = JSON.stringify({
        status: result.status,
        stdout_bytes: byteLength(result.stdout),
        stderr_bytes: byteLength(result.stderr),
        diagnostic,
      });
      fail(`canary script self-test failed: ${compact}`);
    }
    return {
      status: "passed",
      script: boundedScriptPath(script),
      command_exit: result.status,
      stdout_bytes: byteLength(result.stdout),
      artifact: {
        bytes: diagnostic.artifact.bytes,
        sha256: diagnostic.artifact.sha256,
      },
    };
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

function requireOutput(label, result, required, allowExitCodes = new Set()) {
  if (result.error) fail(`${label} could not start (executable or permission problem)`);
  if (!result.ok) fail(`${label} exited with status ${String(result.status)}`);
  const output = `${result.stdout}\n${result.stderr}`;
  for (const token of required) {
    if (!output.includes(token)) fail(`${label} did not expose required syntax: ${token}`);
  }
  return output;
}

function loadIntakeReceipt(path, requestedRepo) {
  if (!path) fail("--intake-receipt is required; preflight cannot run from role admission alone");
  let size;
  try {
    size = statSync(path).size;
  } catch {
    fail("--intake-receipt is not readable");
  }
  if (size > BUDGETS.receiptMaxBytes) {
    fail(`--intake-receipt exceeds the ${BUDGETS.receiptMaxBytes}-byte receipt cap`);
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("--intake-receipt is not readable JSON");
  }
  const errors = validateObjectiveReceipt(receipt);
  if (errors.length) fail(errors.join("; "));
  let receiptRepo;
  let requestedRepoPath;
  try {
    receiptRepo = realpathSync(resolve(receipt.target_repo));
    requestedRepoPath = realpathSync(resolve(requestedRepo));
  } catch {
    fail("intake receipt target_repo or --repo cannot be resolved");
  }
  if (receiptRepo !== requestedRepoPath) {
    fail("intake receipt target_repo does not match --repo");
  }
  return receipt;
}

function versionOf(output, name) {
  const match = output.match(new RegExp(`${name}[^\\n]*?(\\d+\\.\\d+\\.\\d+)`, "i"));
  return match?.[1] ?? "unknown";
}

function resolveRepo(value) {
  if (!isAbsolute(value)) fail("--repo must be an absolute path");
  const requested = resolve(value);
  let repo;
  try {
    if (!statSync(requested).isDirectory()) fail("--repo is not a directory");
    repo = realpathSync(requested);
  } catch {
    fail("--repo does not exist or cannot be read");
  }

  const git = run("git", ["-C", repo, "rev-parse", "--show-toplevel"]);
  if (!git.ok || git.error) fail("--repo is not inside a readable Git worktree");
  let gitRoot;
  try {
    gitRoot = realpathSync(git.stdout.trim());
  } catch {
    fail("Git did not return a usable repository root");
  }
  if (gitRoot !== repo) fail(`--repo must be the repository root (resolved root: ${gitRoot})`);
  return repo;
}

function checkHerdr(herdr) {
  const version = requireOutput("herdr --version", run(herdr, ["--version"]), []);
  const versionNumber = versionOf(version, "herdr");
  if (versionNumber === "unknown") fail("herdr --version did not expose a semantic version");
  const skill = requireOutput(
    "herdr --skill",
    run(herdr, ["--skill"]),
    ["name: herdr", "HERDR_ENV=1", "installed binary is the authority", "--no-focus", "Parse IDs from JSON"],
  );
  requireOutput("herdr --help", run(herdr, ["--help"]), ["--skill", "agent", "pane"]);
  requireOutput("herdr agent --help", run(herdr, ["agent", "--help"]), ["start", "prompt", "wait"]);
  const agentKinds = requireOutput(
    "herdr agent",
    run(herdr, ["agent"], new Set([0, 2])),
    ["kinds:"],
  );
  requireOutput("herdr pane --help", run(herdr, ["pane", "--help"]), ["run", "send-text", "send-keys", "read"]);
  requireOutput("herdr tab --help", run(herdr, ["tab", "--help"]), ["create", "list"]);
  requireOutput("herdr worktree --help", run(herdr, ["worktree", "--help"]), ["create", "remove"]);
  requireOutput("herdr tab create --help", run(herdr, ["tab", "create", "--help"]), ["--cwd", "--no-focus"]);
  requireOutput("herdr pane split --help", run(herdr, ["pane", "split", "--help"]), ["--cwd", "--no-focus"]);
  requireOutput("herdr worktree create --help", run(herdr, ["worktree", "create", "--help"]), ["--cwd", "--no-focus"]);
  requireOutput("herdr pane run --help", run(herdr, ["pane", "run", "--help"]), ["<PANE_ID>", "<COMMAND>"]);
  requireOutput("herdr pane send-text --help", run(herdr, ["pane", "send-text", "--help"]), ["<TEXT>"]);
  requireOutput("herdr pane send-keys --help", run(herdr, ["pane", "send-keys", "--help"]), ["<KEY>"]);
  requireOutput("herdr pane read --help", run(herdr, ["pane", "read", "--help"]), ["recent-unwrapped", "detection"]);
  requireOutput("herdr agent get --help", run(herdr, ["agent", "get", "--help"]), ["<target>"]);
  requireOutput("herdr agent prompt --help", run(herdr, ["agent", "prompt", "--help"]), ["--wait", "--timeout"]);
  requireOutput("herdr agent wait --help", run(herdr, ["agent", "wait", "--help"]), ["--timeout", "idle", "blocked"]);
  return {
    version: versionNumber,
    gjcKindSupported: /(?:^|[| ])gjc(?:$|[| ])/.test(agentKinds),
    skillLoaded: skill.includes("name: herdr"),
  };
}

function checkGjc(gjc, model, preset, thinking) {
  const version = requireOutput("gjc --version", run(gjc, ["--version"]), []);
  const help = requireOutput(
    "gjc --help",
    run(gjc, ["--help"]),
    ["--model", "--mpreset", "--thinking", "--list-models", "--no-session", "--no-tools", "--mode"],
  );
  const versionNumber = versionOf(version, "gjc");
  if (versionNumber === "unknown") fail("gjc --version did not expose a semantic version");

  if (model) {
    if (!model.includes("/") || model.startsWith("/") || model.endsWith("/")) {
      fail("--model must be an explicit PROVIDER/MODEL; resolve fuzzy names with gjc --list-models first");
    }
    const separator = model.indexOf("/");
    const provider = model.slice(0, separator);
    const modelName = model.slice(separator + 1);
    if (!provider || !modelName || modelName.includes("/")) fail("--model has invalid PROVIDER/MODEL syntax");
    const listed = run(gjc, ["--list-models", modelName]);
    if (!listed.ok || listed.error) fail(`gjc --list-models ${modelName} failed; no workers were created`);
    const rows = listed.stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((cells) => cells[0] === provider && cells[1] === modelName);
    if (rows.length !== 1) fail(`gjc --list-models did not resolve exactly one ${model}; use the installed output to choose a provider/model`);
    if (thinking) {
      if (!ALLOWED_THINKING.has(thinking)) fail(`unsupported --thinking value ${thinking}`);
      const thinkingColumn = rows[0][4] ?? "-";
      if (thinkingColumn === "-" || !thinkingColumn.split(",").includes(thinking)) {
        fail(`${model} does not advertise --thinking ${thinking} in gjc --list-models`);
      }
    }
    return {
      version: versionNumber,
      launch: ["gjc", "--model", model, ...(thinking ? ["--thinking", thinking] : [])],
      model,
      thinking: thinking ?? null,
    };
  }

  if (!help.includes("--mode")) fail("gjc --help did not expose --mode for the preset probe");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(preset)) fail("--preset must be a simple configured profile name");
  const probe = run(gjc, [
    "-p",
    "--mpreset",
    preset,
    "--no-session",
    "--no-tools",
    "--mode",
    "text",
    `reply with exactly: ${PRESET_MARKER}`,
  ]);
  if (!probe.ok || probe.error || !`${probe.stdout}\n${probe.stderr}`.includes(PRESET_MARKER)) {
    fail(`preset ${preset} did not pass the ephemeral GJC probe; no workers were created`);
  }
  return {
    version: versionNumber,
    launch: ["gjc", "--mpreset", preset],
    preset,
    thinking: null,
  };
}

function main() {
  const values = parseArgs(process.argv.slice(2));
  if (process.env.HERDR_ENV !== "1") fail("HERDR_ENV must equal 1; do not control Herdr from outside a managed pane");
  if (!values.has("repo")) fail("--repo is required");
  const intake = loadIntakeReceipt(values.get("intake-receipt"), values.get("repo"));
  const hasModel = values.has("model");
  const hasPreset = values.has("preset");
  if (hasModel === hasPreset) fail("provide exactly one of --model or --preset");
  if (hasPreset && values.has("thinking")) fail("--thinking belongs to an explicit --model launch, not a preset probe");

  const repo = resolveRepo(values.get("repo"));
  const herdr = values.get("herdr-bin") ?? "herdr";
  const gjc = values.get("gjc-bin") ?? "gjc";
  const herdrResult = checkHerdr(herdr);
  const gjcResult = checkGjc(gjc, values.get("model"), values.get("preset"), values.get("thinking"));
  const canaryScript = resolve(values.get("canary-script") ?? defaultCanaryScript());
  const canarySelfTest = selfTestCanary(canaryScript, repo, gjcResult.version);
  const result = {
    ok: true,
    phase: "PREFLIGHTED",
    state_machine: {
      sequence: STATES,
      current: "PREFLIGHTED",
      allowed_next: TRANSITIONS.PREFLIGHTED,
    },
    intake_phase: intake.phase,
    repo,
    herdr: herdrResult,
    gjc: gjcResult,
    canary_self_test: canarySelfTest,
    budgets: BUDGETS,
    note: "Preflight is control-plane-only. It reads bounded metadata and installed CLI syntax; product discovery, edits, and tests belong to workers.",
  };
  if (jsonBytes(result) > BUDGETS.receiptMaxBytes) fail("preflight receipt exceeds the compact receipt cap");
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "GJC_FLEET_PREFLIGHT_FAILED: unknown error");
  process.exit(2);
}
