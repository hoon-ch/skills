#!/usr/bin/env node
/**
 * Context-thin, fail-closed admission for gjc-fleet.
 *
 * Intake is control-plane metadata only.  It verifies a target Git root and
 * records bounded counts/samples plus external NUL-safe artifact digests.  It
 * never reads product file contents, embeds a path/hash/env inventory, or runs
 * a product command.
 */

import { mkdtempSync, readFileSync, realpathSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  BUDGETS,
  IGNORED_DIRS,
  boundedUtf8,
  byteLength,
  compactSample,
  compactText,
  isIgnoredPath,
  jsonBytes,
  uniqueSorted,
} from "./budget.mjs";
import { compactOverflowReceipt, digestText } from "./receipt.mjs";

export const INVOCATION = "/skill:gjc-fleet";
export const INTAKE_SCHEMA = "gjc-fleet-intake/v3";
export const INTERNAL_DIRTY_PATHS = Symbol("gjc-fleet-dirty-paths");
export const STATES = Object.freeze([
  "DORMANT",
  "ROLE_ADMITTED",
  "OBJECTIVE_ADMITTED",
  "PREFLIGHTED",
  "DISPATCHING",
  "TRACKING",
  "VERIFYING",
  "RECEIPT",
]);

export const TRANSITIONS = Object.freeze({
  DORMANT: Object.freeze(["ROLE_ADMITTED"]),
  ROLE_ADMITTED: Object.freeze(["OBJECTIVE_ADMITTED"]),
  OBJECTIVE_ADMITTED: Object.freeze(["PREFLIGHTED"]),
  PREFLIGHTED: Object.freeze(["DISPATCHING"]),
  DISPATCHING: Object.freeze(["TRACKING"]),
  TRACKING: Object.freeze(["VERIFYING"]),
  VERIFYING: Object.freeze(["RECEIPT"]),
  RECEIPT: Object.freeze([]),
});

const SAFETY_DENY = Object.freeze([
  ...IGNORED_DIRS.flatMap((name) => [name, `${name}/**`, `**/${name}/**`]),
  ".env",
  ".env.*",
]);

const DEICTIC_REFERENCES = Object.freeze([
  "current workspace",
  "current_workspace",
  "current worktree",
  "current repo",
  "current repository",
  "here",
  "this repo",
  "this repository",
  "현재 워크스페이스",
  "현재 작업공간",
  "현재 워크트리",
  "현재 저장소",
  "여기",
  "이 repo",
  "이 리포",
  "이 repository",
  "이 저장소",
]);

const VAGUE_OBJECTIVES = new Set([
  "do it",
  "fix it",
  "handle it",
  "improve it",
  "improve the repo",
  "make changes",
  "make some changes",
  "take care of it",
  "work on it",
  "work on the repo",
  "update it",
  "update the repo",
  "해줘",
  "고쳐줘",
  "알아서 해",
]);

const INVENTORY_COMMANDS = Object.freeze([
  "git rev-parse --show-toplevel",
  "git ls-files -co --exclude-standard -z",
  "git status --porcelain=v1 -uall -z",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePath(value) {
  if (!hasText(value)) return "";
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function isSafeRelativePath(value) {
  const normalized = normalizePath(value);
  return normalized.length > 0 &&
    !normalized.includes("\0") &&
    !isAbsolute(normalized) &&
    !normalized.split("/").includes("..");
}

function foldText(value) {
  return compactText(value, BUDGETS.metadataTextMaxBytes)
    .toLowerCase()
    .replace(/[“”‘’]/g, "")
    .replace(/[_-]+/g, " ");
}

function isAnalysisIntent(value) {
  return /(?:분석|조사|검토|비교|파악|analy[sz]|review|audit|compare|understand|inventory)/i.test(value);
}

function isParityObjective(value) {
  return /(?:gui|cli|interface|entry point|기능|동일|동등|parity|equivalence)/i.test(value);
}

function containsPhrase(value, phrase) {
  const folded = foldText(value);
  const candidate = foldText(phrase);
  if (/[^\u0000-\u007f]/.test(candidate)) return folded.includes(candidate);
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(folded);
}

function contentText(content) {
  if (hasText(content)) return compactText(content, BUDGETS.metadataTextMaxBytes);
  if (Array.isArray(content)) return compactText(content.map(contentText).filter(Boolean).join(" "), BUDGETS.metadataTextMaxBytes);
  if (isRecord(content)) return contentText(content.text ?? content.value ?? content.content);
  return "";
}

function userMessageText(value) {
  if (hasText(value)) return compactText(value, BUDGETS.metadataTextMaxBytes);
  if (!isRecord(value)) return "";
  if (value.role && value.role !== "user") return "";
  return contentText(value.content ?? value.text ?? value.message);
}

function collectMessages(value) {
  if (hasText(value)) return [compactText(value, BUDGETS.metadataTextMaxBytes)];
  if (!Array.isArray(value)) return [];
  return value.slice(0, BUDGETS.conversationMessageMaxCount).map(userMessageText).filter(Boolean);
}

function isDeicticReference(value) {
  return DEICTIC_REFERENCES.some((reference) => containsPhrase(value, reference));
}

function deicticLabel(value) {
  return DEICTIC_REFERENCES
    .slice()
    .sort((left, right) => right.length - left.length)
    .find((reference) => containsPhrase(value, reference)) ?? "current workspace";
}

function isTargetOnlyText(value) {
  const normalized = foldText(value).replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  if (DEICTIC_REFERENCES.some((reference) => normalized === foldText(reference))) return true;
  return /^(?:target(?: repo)?|the target|repo|repository|타겟|대상)\s*(?:is|은|는|이|가)?\s*.+$/i.test(normalized) &&
    isDeicticReference(normalized);
}

function objectiveResult(value, source) {
  const text = compactText(value, BUDGETS.objectiveMaxBytes);
  return isTargetOnlyText(text) ? { text: "", source: null } : { text, source };
}

function extractObjective(input) {
  if (hasText(input.objective)) return objectiveResult(input.objective, "orchestrator objective");
  for (const field of ["user_input", "message", "request"]) {
    if (hasText(input[field])) return objectiveResult(input[field], "natural-language request");
  }
  for (const field of ["messages", "conversation"]) {
    const messages = collectMessages(input[field]);
    if (messages.length > 0) return objectiveResult(messages.join(" "), "conversation");
  }
  return { text: "", source: null };
}

function targetRequest(input, objective) {
  for (const field of ["target_repo", "target_reference", "target", "workspace"]) {
    const candidate = input[field];
    if (hasText(candidate) || isRecord(candidate)) {
      if (isRecord(candidate)) {
        const reference = candidate.reference ?? candidate.kind ?? candidate.path;
        if (hasText(reference)) return { value: reference, source: field };
      } else {
        return { value: candidate.trim(), source: field };
      }
    }
  }
  if (isDeicticReference(objective)) return { value: deicticLabel(objective), source: "conversation" };
  return { value: "", source: null };
}

function sessionCwd(input) {
  for (const candidate of [
    input.session_cwd,
    input.cwd,
    isRecord(input.runtime) ? input.runtime.cwd : null,
    isRecord(input.context) ? input.context.cwd : null,
  ]) {
    if (hasText(candidate)) return candidate.trim();
  }
  return process.cwd();
}

function textOf(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
}

function runGit(repo, args) {
  try {
    const result = spawnSync("git", ["-C", repo, ...args], {
      encoding: null,
      env: process.env,
      maxBuffer: BUDGETS.gitOutputMaxBytes,
      timeout: 30_000,
    });
    return {
      status: typeof result.status === "number" ? result.status : null,
      stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
      stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ""),
      error: result.error ?? null,
    };
  } catch (error) {
    return { status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error };
  }
}

function verifyRepoRoot(candidate) {
  if (!hasText(candidate) || !isAbsolute(candidate) || candidate.includes("\0")) {
    return {
      requested: hasText(candidate) ? boundedUtf8(candidate.trim(), 512) : null,
      repo_root: null,
      verified: false,
      reason: "target must be an absolute path",
    };
  }
  const requested = resolve(candidate);
  let canonical;
  try {
    if (!statSync(requested).isDirectory()) {
      return { requested, repo_root: null, verified: false, reason: "target is not a directory" };
    }
    canonical = realpathSync(requested);
  } catch {
    return { requested, repo_root: null, verified: false, reason: "target cannot be read" };
  }

  const git = runGit(canonical, ["rev-parse", "--show-toplevel"]);
  if (git.status !== 0 || !hasText(textOf(git.stdout))) {
    return { requested, repo_root: null, verified: false, reason: "target is not a Git repository" };
  }
  try {
    const root = realpathSync(textOf(git.stdout).trim());
    return { requested, repo_root: root, verified: true, verification: "git rev-parse plus realpath" };
  } catch {
    return { requested, repo_root: null, verified: false, reason: "Git returned an unreadable root" };
  }
}

export function resolveTargetReference(input = {}) {
  const objective = extractObjective(input).text;
  const request = targetRequest(input, objective);
  if (!request.value) {
    return {
      kind: "missing",
      requested: null,
      session_cwd: null,
      repo_root: null,
      verified: false,
      reason: "name a target or explicitly refer to the current workspace",
    };
  }
  const folded = foldText(request.value);
  if (isDeicticReference(request.value)) {
    const cwd = sessionCwd(input);
    const verified = verifyRepoRoot(cwd);
    return {
      kind: "current_workspace",
      label: request.value,
      source: request.source,
      session_cwd: boundedUtf8(cwd, 512),
      requested: boundedUtf8(cwd, 512),
      repo_root: verified.repo_root,
      verified: verified.verified,
      verification: verified.verification ?? null,
      reason: verified.reason ?? null,
    };
  }
  if (isAbsolute(request.value)) {
    const verified = verifyRepoRoot(request.value);
    return {
      kind: "absolute_path",
      label: boundedUtf8(request.value, 512),
      source: request.source,
      session_cwd: boundedUtf8(sessionCwd(input), 512),
      requested: verified.requested,
      repo_root: verified.repo_root,
      verified: verified.verified,
      verification: verified.verification ?? null,
      reason: verified.reason ?? null,
    };
  }
  return {
    kind: "unresolved",
    label: boundedUtf8(request.value, 512),
    source: request.source,
    session_cwd: boundedUtf8(sessionCwd(input), 512),
    requested: null,
    repo_root: null,
    verified: false,
    reason: `target reference "${folded}" is not a path or supported workspace reference`,
  };
}

function pathIsIgnored(path) {
  return !isSafeRelativePath(path) || isIgnoredPath(path);
}

function parseNulPaths(buffer) {
  return uniqueSorted(textOf(buffer).split("\0").filter((path) => isSafeRelativePath(path) && !isIgnoredPath(path)).map(normalizePath));
}

function parseStatusPaths(buffer) {
  const paths = [];
  const tokens = textOf(buffer).split("\0").filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const code = token.slice(0, 2);
    const path = normalizePath(token.slice(3));
    if (isSafeRelativePath(path) && !isIgnoredPath(path)) paths.push(path);
    if (/[RC]/.test(code) && index + 1 < tokens.length) {
      const renamed = normalizePath(tokens[++index]);
      if (isSafeRelativePath(renamed) && !isIgnoredPath(renamed)) paths.push(renamed);
    }
  }
  return uniqueSorted(paths);
}

function filteredPathArtifact(buffer) {
  const paths = parseNulPaths(buffer);
  return Buffer.from(paths.length > 0 ? `${paths.join("\0")}\0` : "", "utf8");
}

function filteredStatusArtifact(buffer) {
  const tokens = textOf(buffer).split("\0").filter(Boolean);
  const output = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const code = token.slice(0, 2);
    const path = normalizePath(token.slice(3));
    const keepPath = isSafeRelativePath(path) && !isIgnoredPath(path);
    if (keepPath) output.push(`${code} ${path}`);
    if (/[RC]/.test(code) && index + 1 < tokens.length) {
      const renamed = normalizePath(tokens[++index]);
      if (isSafeRelativePath(renamed) && !isIgnoredPath(renamed)) output.push(renamed);
    }
  }
  return Buffer.from(output.length > 0 ? `${output.join("\0")}\0` : "", "utf8");
}

function externalRunDir(runDir, targetRoot) {
  if (!hasText(runDir) || !isAbsolute(runDir)) throw new Error("run_dir must be an absolute external directory");
  const resolvedDir = resolve(runDir);
  const target = resolve(targetRoot);
  if (resolvedDir === target || resolvedDir.startsWith(`${target}/`)) {
    throw new Error("run_dir must be outside the target repository");
  }
  mkdirSync(resolvedDir, { recursive: true });
  return resolvedDir;
}

function writeArtifact(runDir, targetRoot, name, buffer) {
  const root = externalRunDir(runDir, targetRoot);
  const path = resolve(root, name);
  writeFileSync(path, buffer, { mode: 0o600 });
  const digest = digestText(buffer);
  return {
    path,
    bytes: digest.bytes,
    sha256: digest.sha256,
    format: "nul-separated",
  };
}

function attachInternalPaths(inventory, dirtyPaths) {
  Object.defineProperty(inventory, INTERNAL_DIRTY_PATHS, {
    configurable: true,
    enumerable: false,
    value: dirtyPaths,
    writable: false,
  });
  return inventory;
}

function emptyInventory(repoRoot, reason, commands = []) {
  return attachInternalPaths({
    status: "unavailable",
    read_only: true,
    repo_root: repoRoot,
    path_count: 0,
    tracked_count: 0,
    tracked_sample: [],
    dirty_count: 0,
    dirty_sample: [],
    top_level_count: 0,
    top_level_paths: [],
    artifacts: { paths: null, dirty: null },
    ignored_directories: IGNORED_DIRS.slice(),
    commands: commands.length > 0 ? commands.slice() : INVENTORY_COMMANDS.slice(),
    reason: boundedUtf8(reason, 512),
  }, []);
}

export function readOnlyInventory(targetRepo, { runDir = null } = {}) {
  const verified = verifyRepoRoot(targetRepo);
  if (!verified.verified) return emptyInventory(null, verified.reason);
  const files = runGit(verified.repo_root, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const status = runGit(verified.repo_root, ["status", "--porcelain=v1", "-uall", "-z"]);
  if (files.status !== 0 || status.status !== 0 || files.error || status.error) {
    return emptyInventory(verified.repo_root, "Git metadata inventory command failed");
  }

  const filteredFiles = filteredPathArtifact(files.stdout);
  const filteredStatus = filteredStatusArtifact(status.stdout);
  const trackedPaths = parseNulPaths(filteredFiles);
  const dirtyPaths = parseStatusPaths(filteredStatus);
  const allPaths = uniqueSorted([...trackedPaths, ...dirtyPaths]);
  const topLevels = uniqueSorted(allPaths.map((path) => path.split("/")[0]).filter(Boolean));
  let pathArtifact = null;
  let dirtyArtifact = null;
  if (runDir !== null) {
    pathArtifact = writeArtifact(runDir, verified.repo_root, "inventory-paths.nul", filteredFiles);
    dirtyArtifact = writeArtifact(runDir, verified.repo_root, "dirty-status.nul", filteredStatus);
  }
  return attachInternalPaths({
    status: "ready",
    read_only: true,
    repo_root: verified.repo_root,
    path_count: allPaths.length,
    tracked_count: trackedPaths.length,
    tracked_sample: compactSample(trackedPaths),
    dirty_count: dirtyPaths.length,
    dirty_sample: compactSample(dirtyPaths),
    top_level_count: topLevels.length,
    top_level_paths: compactSample(topLevels, { maxCount: BUDGETS.topLevelSampleMaxCount, maxItemBytes: 128 }),
    artifacts: { paths: pathArtifact, dirty: dirtyArtifact },
    ignored_directories: IGNORED_DIRS.slice(),
    commands: INVENTORY_COMMANDS.slice(),
    reason: null,
  }, dirtyPaths);
}

function normalizeArtifact(value) {
  if (!isRecord(value) || !hasText(value.path)) return null;
  return {
    path: boundedUtf8(value.path, 512),
    bytes: Number.isFinite(value.bytes) ? value.bytes : null,
    sha256: /^[a-f0-9]{64}$/i.test(value.sha256 ?? "") ? value.sha256.toLowerCase() : null,
    format: boundedUtf8(value.format ?? "external", 64),
  };
}

function normalizeInventory(value, targetRoot, runDir = null) {
  if (!isRecord(value)) return readOnlyInventory(targetRoot, { runDir });
  const oldTracked = Array.isArray(value.tracked_paths)
    ? value.tracked_paths.filter((path) => isSafeRelativePath(path) && !isIgnoredPath(path)).map(normalizePath)
    : [];
  const oldDirty = Array.isArray(value.dirty_paths)
    ? value.dirty_paths.filter((path) => isSafeRelativePath(path) && !isIgnoredPath(path)).map(normalizePath)
    : [];
  const trackedSample = compactSample(value.tracked_sample ?? oldTracked);
  const dirtySample = compactSample(value.dirty_sample ?? oldDirty);
  const topLevels = compactSample(
    value.top_level_paths ?? [...oldTracked, ...oldDirty].map((path) => path.split("/")[0]),
    { maxCount: BUDGETS.topLevelSampleMaxCount, maxItemBytes: 128 },
  );
  const inventory = {
    status: value.status ?? "ready",
    read_only: value.read_only !== false,
    repo_root: value.repo_root ?? targetRoot,
    path_count: Number.isFinite(value.path_count) ? value.path_count : uniqueSorted([...oldTracked, ...oldDirty]).length,
    tracked_count: Number.isFinite(value.tracked_count) ? value.tracked_count : uniqueSorted(oldTracked).length,
    tracked_sample: trackedSample,
    dirty_count: Number.isFinite(value.dirty_count) ? value.dirty_count : uniqueSorted(oldDirty).length,
    dirty_sample: dirtySample,
    top_level_count: Number.isFinite(value.top_level_count) ? value.top_level_count : topLevels.length,
    top_level_paths: topLevels,
    artifacts: {
      paths: normalizeArtifact(value.artifacts?.paths),
      dirty: normalizeArtifact(value.artifacts?.dirty),
    },
    ignored_directories: compactSample(value.ignored_directories ?? IGNORED_DIRS, { maxCount: BUDGETS.topLevelSampleMaxCount, maxItemBytes: 64 }),
    commands: Array.isArray(value.commands) ? value.commands.slice(0, BUDGETS.inventoryCommandMaxCount).map((command) => boundedUtf8(command, 160)) : ["provided bounded metadata inventory"],
    reason: value.reason == null ? null : boundedUtf8(value.reason, 512),
  };
  return attachInternalPaths(inventory, uniqueSorted(value[INTERNAL_DIRTY_PATHS] ?? oldDirty));
}

function topLevelOf(path) {
  return normalizePath(path).split("/")[0] ?? "";
}

function pathPatternForTopLevel(topLevel, paths) {
  const hasChildren = paths.some((path) => path.startsWith(`${topLevel}/`));
  return hasChildren ? `${topLevel}/**` : topLevel;
}

function relevantTopLevels(objective, topLevels) {
  const lower = foldText(objective);
  const hints = [
    ["gui", ["gui", "app", "frontend", "web", "swift", "ui", "client"]],
    ["cli", ["cli", "cmd", "command", "bin", "probe", "scripts"]],
    ["rust", ["rust", "crates"]],
    ["python", ["python", "py", "probe"]],
    ["test", ["test", "tests", "spec", "fixtures"]],
    ["readme", ["docs", "doc", "readme"]],
  ];
  const selected = topLevels.filter((topLevel) => {
    const name = topLevel.toLowerCase();
    if (lower.includes(name)) return true;
    return hints.some(([trigger, names]) => lower.includes(trigger) && names.includes(name));
  });
  return selected.length > 0 ? selected : topLevels;
}

export function deriveAcceptanceCriteria(objective, inventory) {
  const surfaces = relevantTopLevels(objective, inventory.top_level_paths ?? []);
  const surfaceLabel = surfaces.length > 0 ? surfaces.join(", ") : "the inventoried repository surfaces";
  const criteria = isParityObjective(objective)
    ? [
        `A worker identifies the GUI and CLI entry points in ${surfaceLabel}.`,
        "The worker compares observable capabilities and calls out unsupported or hardware-dependent cases.",
        "Any product change is limited to worker-owned paths and has focused evidence from the worker report.",
      ]
    : [
        `A worker evaluates the stated objective against ${surfaceLabel}.`,
        "The worker returns bounded findings with external evidence references rather than a transcript.",
        "The control plane leaves product files and product commands to workers.",
      ];
  return { items: criteria.map((item) => boundedUtf8(item, 512)), source: "orchestrator-derived", derived_from: ["user objective", "bounded metadata inventory"] };
}

export function deriveMutationBoundary(objective, inventory) {
  const topLevels = relevantTopLevels(objective, inventory.top_level_paths ?? []);
  const allow = topLevels
    .filter((topLevel) => !SAFETY_DENY.includes(topLevel) && !IGNORED_DIRS.includes(topLevel))
    .map((topLevel) => pathPatternForTopLevel(topLevel, inventory.tracked_sample ?? []))
    .filter(Boolean);
  return {
    allow: uniqueSorted(allow).slice(0, BUDGETS.topLevelSampleMaxCount),
    deny: SAFETY_DENY.slice(),
    preserve_existing: true,
    auto_assign_dirty: false,
    status: allow.length > 0 ? "proposed" : "pending_inventory",
    derived_from: "bounded read-only metadata inventory",
    evidence: compactSample(inventory.top_level_paths ?? [], { maxCount: BUDGETS.topLevelSampleMaxCount, maxItemBytes: 128 }),
  };
}

function materialAmbiguities(objective, target, inventory) {
  const ambiguities = [];
  if (!target.verified) ambiguities.push({ kind: "target", material: true, question: "Which verifiable repository should the fleet use?" });
  const normalized = foldText(objective);
  if (normalized.length < 8 || VAGUE_OBJECTIVES.has(normalized)) {
    ambiguities.push({ kind: "objective", material: true, question: "What concrete outcome should change, if any?" });
  }
  if (inventory.status !== "ready") ambiguities.push({ kind: "inventory", material: true, question: "The bounded repository metadata inventory must complete before product work is assigned." });
  return ambiguities;
}

function contextReceipt(input) {
  return {
    preserved: true,
    source: "orchestrator conversation and verified session context",
    provided_fields: Object.keys(input).filter((key) => key !== "invocation").sort().slice(0, BUDGETS.contextFieldMaxCount),
    user_content_embedded: false,
  };
}

function baseReceipt(phase, input, state) {
  return {
    schema: INTAKE_SCHEMA,
    phase,
    state,
    control_plane: true,
    product_access: "worker-only",
    invocation: input.invocation ?? INVOCATION,
    execution_authorized: phase === "OBJECTIVE_ADMITTED",
    analysis_authorized: phase === "OBJECTIVE_ADMITTED",
    mutation_authorized: false,
    commands_executed: [],
    mutation_commands_executed: [],
    resources_created: [],
    user_work: {
      status: "reserved",
      policy: "Existing dirty work is user work; only bounded samples and an external NUL-safe digest enter the receipt.",
      reserved_count: 0,
      reserved_sample: [],
      reserved_artifact: null,
      assigned_count: 0,
    },
    context: contextReceipt(input),
    state_machine: {
      sequence: STATES,
      current: phase,
      allowed_next: TRANSITIONS[phase] ?? [],
    },
  };
}

function roleReceipt(input, blockers = []) {
  const receipt = {
    ...baseReceipt("ROLE_ADMITTED", input, blockers.length ? "blocked" : "role_admitted"),
    objective: null,
    target_repo: null,
    acceptance_criteria: [],
    mutation_boundary: null,
    read_only_analysis: { admitted: false, mutation_approval_required: false },
    required_input: ["natural-language objective"],
  };
  if (blockers.length) receipt.blockers = blockers.map((blocker) => boundedUtf8(blocker, 512));
  else receipt.waiting_for = ["natural-language objective"];
  return receipt;
}

function dormantReceipt(reason) {
  return {
    ...baseReceipt("DORMANT", { invocation: null }, "blocked"),
    invocation: null,
    execution_authorized: false,
    analysis_authorized: false,
    mutation_authorized: false,
    blockers: [boundedUtf8(reason, 512)],
    required_input: ["invocation"],
  };
}

function normalizeInput(input) {
  if (isRecord(input)) return input;
  if (hasText(input)) return { user_input: input };
  return {};
}

export function admit(rawInput = {}) {
  const input = normalizeInput(rawInput);
  if (input.invocation !== undefined && input.invocation !== INVOCATION) return dormantReceipt(`only ${INVOCATION} can admit this role`);
  const objective = extractObjective(input);
  if (!objective.text) return roleReceipt(input);
  const target = resolveTargetReference(input);
  if (!target.verified) {
    return roleReceipt(input, [
      `target: ${target.reason ?? "the target could not be verified"}`,
      "Ask one natural-language target question; do not request an intake schema.",
    ]);
  }

  let inventory;
  try {
    inventory = normalizeInventory(input.inventory, target.repo_root, input.run_dir ?? null);
  } catch (error) {
    inventory = emptyInventory(target.repo_root, error instanceof Error ? error.message : "metadata inventory failed");
  }
  const acceptance = deriveAcceptanceCriteria(objective.text, inventory);
  const boundary = deriveMutationBoundary(objective.text, inventory);
  const ambiguities = materialAmbiguities(objective.text, target, inventory);
  const requestedMode = input.mode === "analysis" || input.analysis_only === true || isAnalysisIntent(objective.text)
    ? "analysis"
    : "orchestrate";
  const receipt = {
    ...baseReceipt("OBJECTIVE_ADMITTED", input, "ready"),
    objective: objective.text,
    objective_source: objective.source,
    request_mode: requestedMode,
    target_repo: target.repo_root,
    target_reference: {
      kind: target.kind,
      label: target.label ?? target.requested,
      source: target.source,
      session_cwd: target.session_cwd,
      verified: target.verified,
    },
    target_resolution: target,
    inventory,
    acceptance_criteria: acceptance.items,
    acceptance_criteria_source: acceptance.source,
    acceptance_criteria_derived_from: acceptance.derived_from,
    mutation_boundary: boundary,
    mutation_boundary_source: "orchestrator-derived",
    mutation_boundary_derived_from: ["bounded metadata inventory", "user objective"],
    material_ambiguities: ambiguities,
    read_only_analysis: {
      admitted: true,
      mutation_approval_required: false,
      inventory_complete: inventory.status === "ready",
      dirty_count: inventory.dirty_count,
      dirty_sample: inventory.dirty_sample,
      dirty_artifact: inventory.artifacts?.dirty ?? null,
    },
    mutation_gate: {
      status: "pending",
      evaluated: false,
      required_before_product_mutation: true,
      blockers: [],
    },
    user_work: {
      status: "reserved",
      policy: "Existing dirty work is user work; only bounded samples and an external NUL-safe digest enter the receipt.",
      reserved_count: inventory.dirty_count,
      reserved_sample: inventory.dirty_sample,
      reserved_artifact: inventory.artifacts?.dirty ?? null,
      assigned_count: 0,
    },
    required_input: [],
    waiting_for: ["PREFLIGHTED or read-only analysis"],
  };
  return compactReceipt(receipt);
}

function validateObjective(value) {
  if (!hasText(value)) return "objective must be a non-empty natural-language string";
  if (byteLength(value) > BUDGETS.objectiveMaxBytes) return "objective exceeds the bounded objective budget";
  if (compactText(value, BUDGETS.objectiveMaxBytes).length < 2) return "objective is too short to be actionable";
  if (/(?:\.\.\.|<[^>]+>|\b(?:tbd|todo)\b)/i.test(value)) return "objective contains an unresolved placeholder";
  return null;
}

function validateTargetRepo(value) {
  if (!hasText(value)) return "target_repo must be a verified absolute path";
  if (!isAbsolute(value) || value.includes("\0")) return "target_repo must be an absolute, NUL-free path";
  return null;
}

function validateAcceptanceCriteria(value) {
  if (!Array.isArray(value) || value.length === 0) return "acceptance_criteria must be a non-empty derived array";
  for (const [index, criterion] of value.entries()) {
    if (!hasText(criterion) || byteLength(criterion) > 1024) return `acceptance_criteria[${index}] is not bounded text`;
  }
  return null;
}

function validateBoundary(value) {
  if (!isRecord(value)) return "mutation_boundary must be an object with allow and deny path lists";
  if (!Array.isArray(value.allow) || value.allow.length === 0) return "mutation_boundary.allow must contain derived relative path patterns";
  if (!Array.isArray(value.deny)) return "mutation_boundary.deny must be an array";
  for (const [name, paths] of [["allow", value.allow], ["deny", value.deny]]) {
    for (const [index, path] of paths.entries()) {
      if (!isSafeRelativePath(path)) return `mutation_boundary.${name}[${index}] must be a non-empty relative path pattern`;
    }
  }
  if (value.preserve_existing !== true) return "mutation_boundary.preserve_existing must be true";
  if (value.auto_assign_dirty !== false) return "mutation_boundary.auto_assign_dirty must be false";
  if (value.derived_from !== "bounded read-only metadata inventory") return "mutation_boundary must record bounded metadata derivation";
  return null;
}

function globRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

function matchesPattern(path, pattern) {
  return globRegExp(pattern).test(normalizePath(path));
}

function pathsFromArtifact(artifact) {
  if (!isRecord(artifact) || !hasText(artifact.path)) return [];
  try {
    const raw = readFileSync(artifact.path);
    if (artifact.format === "nul-separated") {
      const values = textOf(raw).split("\0").filter(Boolean);
      return uniqueSorted(values.flatMap((value) => {
        if (/^.{2} /.test(value)) return [value.slice(3)];
        return [value];
      }).filter(isSafeRelativePath).filter((path) => !isIgnoredPath(path)).map(normalizePath));
    }
  } catch {
    return [];
  }
  return [];
}

function dirtyPathEvidence(inventory, options) {
  if (Array.isArray(options.dirty_paths)) {
    return { known: true, paths: uniqueSorted(options.dirty_paths.filter(isSafeRelativePath).map(normalizePath)) };
  }
  if (Array.isArray(inventory[INTERNAL_DIRTY_PATHS])) {
    return { known: true, paths: inventory[INTERNAL_DIRTY_PATHS].slice() };
  }
  const artifactPaths = pathsFromArtifact(options.dirty_artifact ?? inventory.artifacts?.dirty);
  if (artifactPaths.length > 0 || inventory.dirty_count === 0) return { known: true, paths: artifactPaths };
  if (inventory.dirty_count <= (inventory.dirty_sample?.length ?? 0)) {
    return { known: true, paths: inventory.dirty_sample ?? [] };
  }
  return { known: false, paths: inventory.dirty_sample ?? [] };
}

export function reserveDirtyPaths(inventoryOrReceipt = {}) {
  const inventory = isRecord(inventoryOrReceipt.inventory) ? inventoryOrReceipt.inventory : inventoryOrReceipt;
  return {
    status: "reserved",
    reserved_count: Number.isFinite(inventory.dirty_count) ? inventory.dirty_count : 0,
    reserved_sample: compactSample(inventory.dirty_sample ?? []),
    reserved_artifact: inventory.artifacts?.dirty ?? null,
    assigned_count: 0,
  };
}

export function evaluateMutationGate(receipt, options = {}) {
  const source = isRecord(receipt) ? receipt : {};
  const mode = options.mode ?? source.request_mode ?? "mutation";
  const inventory = isRecord(source.inventory) ? source.inventory : {};
  const boundary = isRecord(source.mutation_boundary) ? source.mutation_boundary : {};
  const evidence = dirtyPathEvidence(inventory, options);
  const allow = Array.isArray(boundary.allow) ? boundary.allow : [];
  const deny = Array.isArray(boundary.deny) ? boundary.deny : [];
  const overlap = evidence.paths.filter((path) =>
    allow.some((pattern) => matchesPattern(path, pattern)) &&
    !deny.some((pattern) => matchesPattern(path, pattern)));
  const overlapUnknown = !evidence.known && Number(inventory.dirty_count ?? 0) > 0;
  const reservedCount = Number.isFinite(inventory.dirty_count) ? inventory.dirty_count : evidence.paths.length;
  if (mode === "analysis" || options.read_only === true) {
    return {
      status: "not_required",
      admitted: true,
      mode: "analysis",
      blockers: [],
      reserved_dirty_count: reservedCount,
      reserved_dirty_sample: compactSample(evidence.paths),
      dirty_overlap_count: overlap.length,
      dirty_overlap: compactSample(overlap),
      note: "Read-only analysis is admitted without mutation approval.",
    };
  }

  const ambiguities = Array.isArray(options.material_ambiguities)
    ? options.material_ambiguities
    : Array.isArray(source.material_ambiguities) ? source.material_ambiguities : [];
  const material = ambiguities.filter((item) => !isRecord(item) || item.material !== false);
  const blockers = [];
  if (material.length > 0) blockers.push("unresolved material ambiguity remains before product mutation");
  if (overlapUnknown) blockers.push("dirty path artifact is unavailable; boundary disjointness cannot be proven");
  if (overlap.length > 0) blockers.push(`dirty paths overlap the proposed mutation boundary (${overlap.length} observed)`);
  if (inventory.status !== "ready") blockers.push("bounded read-only repository metadata inventory is incomplete");
  if (allow.length === 0) blockers.push("the orchestrator has not derived a non-empty mutation boundary");

  return {
    status: blockers.length > 0 ? "blocked" : "passed",
    admitted: blockers.length === 0,
    mode: "mutation",
    blockers,
    reserved_dirty_count: reservedCount,
    reserved_dirty_sample: compactSample(evidence.paths),
    dirty_overlap_count: overlap.length,
    dirty_overlap: compactSample(overlap),
    dirty_overlap_unknown: overlapUnknown,
    material_ambiguities: material,
  };
}

export const checkMutationGate = evaluateMutationGate;

export function applyMutationGate(receipt, options = {}) {
  const gate = evaluateMutationGate(receipt, options);
  return {
    ...receipt,
    mutation_authorized: gate.mode === "mutation" && gate.admitted,
    mutation_gate: { ...gate, evaluated: true, required_before_product_mutation: true },
  };
}

export function userFacingSummary(receipt) {
  if (!isRecord(receipt) || receipt.phase === "ROLE_ADMITTED") return "Fleet 역할이 준비되었습니다. 원하는 결과를 자연어로 말해 주세요.";
  if (receipt.state === "blocked") return "대상을 확인할 수 없습니다. 현재 작업공간의 저장소 경로나 분석할 저장소를 자연어로 알려 주세요.";
  const mode = receipt.request_mode === "analysis"
    ? "먼저 worker 한 명이 읽기 전용으로 조사하고 결과를 간단히 정리하겠습니다."
    : "먼저 worker가 필요한 제품 작업을 수행하고, control plane은 짧은 증거만 확인하겠습니다.";
  return [`이해한 목표: ${boundedUtf8(receipt.objective, 512)}`, `대상: ${boundedUtf8(receipt.target_reference?.label ?? receipt.target_repo, 512)}`, mode].join("\n");
}

function validateBoundedSample(value, label) {
  if (!Array.isArray(value) || value.length > BUDGETS.pathSampleMaxCount) return `${label} must be a bounded sample array`;
  for (const [index, item] of value.entries()) {
    if (!hasText(item) || byteLength(item) > BUDGETS.pathSampleItemMaxBytes) return `${label}[${index}] is not bounded`;
  }
  return null;
}

export function validateObjectiveReceipt(receipt, targetRepo = null) {
  const errors = [];
  if (!isRecord(receipt)) return ["intake receipt must be a JSON object"];
  if (jsonBytes(receipt) > BUDGETS.receiptMaxBytes) errors.push(`intake receipt exceeds ${BUDGETS.receiptMaxBytes} bytes`);
  if (receipt.schema !== INTAKE_SCHEMA) errors.push("intake receipt schema is unsupported");
  if (receipt.phase !== "OBJECTIVE_ADMITTED") errors.push("intake receipt must be OBJECTIVE_ADMITTED");
  if (receipt.state !== "ready") errors.push("intake receipt is not ready");
  if (receipt.invocation !== INVOCATION) errors.push(`intake receipt invocation must be ${INVOCATION}`);
  if (receipt.control_plane !== true || receipt.product_access !== "worker-only") errors.push("intake receipt must declare worker-only product access");
  if (receipt.execution_authorized !== true || receipt.analysis_authorized !== true) errors.push("intake receipt does not authorize bounded read-only orchestration");
  if (receipt.mutation_authorized !== false) errors.push("intake receipt must not authorize mutation before the gate");

  const objectiveError = validateObjective(receipt.objective);
  if (objectiveError) errors.push(`intake receipt objective: ${objectiveError}`);
  const targetError = validateTargetRepo(receipt.target_repo);
  if (targetError) errors.push(`intake receipt target_repo: ${targetError}`);
  const criteriaError = validateAcceptanceCriteria(receipt.acceptance_criteria);
  if (criteriaError) errors.push(`intake receipt acceptance_criteria: ${criteriaError}`);
  if (receipt.acceptance_criteria_source !== "orchestrator-derived") errors.push("intake receipt acceptance criteria must be orchestrator-derived");
  const boundaryError = validateBoundary(receipt.mutation_boundary);
  if (boundaryError) errors.push(`intake receipt mutation_boundary: ${boundaryError}`);
  if (receipt.mutation_boundary_source !== "orchestrator-derived") errors.push("intake receipt mutation boundary must be orchestrator-derived");
  if (!isRecord(receipt.target_resolution) || receipt.target_resolution.verified !== true || receipt.target_resolution.repo_root !== receipt.target_repo) {
    errors.push("intake receipt must prove target resolution from a verified workspace or path");
  }
  const inventory = receipt.inventory;
  if (!isRecord(inventory) || inventory.read_only !== true || inventory.status !== "ready") errors.push("intake receipt must include completed bounded metadata inventory");
  if (isRecord(inventory)) {
    for (const field of ["tracked_paths", "dirty_paths", "hashes", "env", "full_status"]) {
      if (field in inventory) errors.push(`intake receipt must not embed ${field}`);
    }
    for (const [field, label] of [["tracked_sample", "inventory.tracked_sample"], ["dirty_sample", "inventory.dirty_sample"], ["top_level_paths", "inventory.top_level_paths"]]) {
      const error = validateBoundedSample(inventory[field], label);
      if (error) errors.push(error);
    }
    if (!Number.isInteger(inventory.dirty_count) || inventory.dirty_count < 0) errors.push("inventory.dirty_count must be a non-negative count");
    if (Number.isInteger(inventory.dirty_count) && inventory.dirty_count > 0) {
      const artifact = inventory.artifacts?.dirty;
      if (!isRecord(artifact) || !isAbsolute(artifact.path) || !Number.isInteger(artifact.bytes) || artifact.bytes < 0 || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "")) {
        errors.push("dirty inventory must include an external NUL-safe artifact digest");
      } else if (isAbsolute(receipt.target_repo) &&
        (resolve(artifact.path) === resolve(receipt.target_repo) ||
          resolve(artifact.path).startsWith(`${resolve(receipt.target_repo)}/`))) {
        errors.push("dirty inventory artifact must be outside the target repository");
      }
    }
  }
  if (!Array.isArray(receipt.commands_executed) || receipt.commands_executed.length !== 0) errors.push("intake receipt must prove that no product command ran during intake");
  if (!Array.isArray(receipt.mutation_commands_executed) || receipt.mutation_commands_executed.length !== 0) errors.push("intake receipt must prove that no mutation command ran during intake");
  if (!Array.isArray(receipt.resources_created) || receipt.resources_created.length !== 0) errors.push("intake receipt must prove that no resource was created during intake");
  if (!isRecord(receipt.user_work) || receipt.user_work.status !== "reserved" || !Number.isInteger(receipt.user_work.reserved_count) || receipt.user_work.assigned_count !== 0) errors.push("intake receipt must reserve dirty work without assignments");
  if (!isRecord(receipt.read_only_analysis) || receipt.read_only_analysis.admitted !== true || receipt.read_only_analysis.mutation_approval_required !== false) errors.push("intake receipt must admit read-only analysis without mutation approval");
  if (!isRecord(receipt.mutation_gate) || receipt.mutation_gate.status !== "pending" || receipt.mutation_gate.evaluated !== false) errors.push("intake receipt must leave the mutation gate pending until product work");
  if (!isRecord(receipt.state_machine) || JSON.stringify(receipt.state_machine.sequence) !== JSON.stringify(STATES) || receipt.state_machine.current !== "OBJECTIVE_ADMITTED" || JSON.stringify(receipt.state_machine.allowed_next) !== JSON.stringify(["PREFLIGHTED"])) errors.push("intake receipt state machine is not at OBJECTIVE_ADMITTED");
  if (targetRepo) {
    try {
      if (realpathSync(resolve(receipt.target_repo)) !== realpathSync(resolve(targetRepo))) errors.push("intake receipt target_repo does not match --repo");
    } catch {
      errors.push("intake receipt target_repo or --repo cannot be resolved");
    }
  }
  if (!canTransition(receipt.phase, "PREFLIGHTED")) errors.push("intake receipt cannot transition to PREFLIGHTED");
  return errors;
}

export function canTransition(from, to) {
  return STATES.includes(from) && TRANSITIONS[from].includes(to);
}

function compactReceipt(receipt) {
  if (jsonBytes(receipt) <= BUDGETS.receiptMaxBytes) return receipt;
  return compactOverflowReceipt({ schema: INTAKE_SCHEMA, reason: "normal intake receipt exceeded the hard cap", inputBytes: jsonBytes(receipt), targetRepo: receipt.target_repo });
}

function inputFromStdin(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { user_input: String(parsed) };
  } catch {
    return { user_input: raw };
  }
}

function main() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    raw = "";
  }
  const inputBytes = byteLength(raw);
  if (inputBytes > BUDGETS.intakeMaxBytes) {
    console.log(JSON.stringify(compactOverflowReceipt({ schema: INTAKE_SCHEMA, reason: "input exceeded the intake hard cap", inputBytes }), null, 2));
    process.exitCode = 2;
    return;
  }
  const args = process.argv.slice(2);
  const runDirIndex = args.indexOf("--run-dir");
  const runDir = runDirIndex >= 0 ? args[runDirIndex + 1] : null;
  if (runDirIndex >= 0 && (!runDir || runDir.startsWith("--"))) {
    console.error("GJC_FLEET_INTAKE_FAILED: --run-dir needs an absolute external directory");
    process.exitCode = 2;
    return;
  }
  let receipt;
  try {
    const input = inputFromStdin(raw);
    if (runDir) input.run_dir = runDir;
    if (!input.run_dir && extractObjective(input).text) {
      input.run_dir = process.env.GJC_FLEET_RUN_DIR ??
        mkdtempSync(join(tmpdir(), "gjc-fleet-intake-"));
    }
    receipt = admit(input);
  } catch (error) {
    receipt = compactOverflowReceipt({
      schema: INTAKE_SCHEMA,
      reason: error instanceof Error ? error.message : "intake failed closed",
      inputBytes,
    });
  }
  const output = JSON.stringify(receipt, null, 2);
  if (byteLength(output) > BUDGETS.receiptMaxBytes) {
    receipt = compactOverflowReceipt({ schema: INTAKE_SCHEMA, reason: "serialized intake receipt exceeded the hard cap", inputBytes: byteLength(output) });
  }
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.state === "blocked") process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
