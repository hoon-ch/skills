#!/usr/bin/env node
/**
 * Conversational, fail-closed admission for the gjc-fleet role.
 *
 * The user supplies an objective in ordinary language. The orchestrator turns
 * that objective into this internal receipt, resolves an explicitly deictic
 * target such as "the current workspace", and performs only a read-only
 * repository inventory before proposing acceptance criteria and a mutation
 * boundary.
 *
 * Empty stdin is the activation-only case:
 *   node intake.mjs
 *
 * A normal invocation may be plain text:
 *   printf '%s' 'compare the GUI and CLI' | node intake.mjs
 *
 * JSON is an internal transport accepted for the orchestrator and tests. It is
 * never a user-facing contract.
 *
 * Exit 0 = role or objective admitted.
 * Exit 2 = invocation rejected, target cannot be verified, or objective intake
 *          is blocked.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const INVOCATION = "/skill:gjc-fleet";
export const INTAKE_SCHEMA = "gjc-fleet-intake/v2";
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
  ".git/**",
  ".gjc/**",
  ".codex/**",
  ".claude/**",
  "node_modules/**",
  ".env",
  ".env.*",
  "dist/**",
  "build/**",
  "target/**",
  ".next/**",
  "coverage/**",
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

function compactText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(hasText).map((value) => value.trim()))].sort();
}

function normalizePath(value) {
  if (!hasText(value)) return "";
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function isSafeRelativePath(value) {
  const normalized = normalizePath(value);
  return (
    normalized.length > 0 &&
    !normalized.includes("\0") &&
    !isAbsolute(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function foldText(value) {
  return compactText(value)
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
  if (hasText(content)) return compactText(content);
  if (Array.isArray(content)) {
    return compactText(content.map((item) => contentText(item)).filter(Boolean).join(" "));
  }
  if (isRecord(content)) {
    return contentText(content.text ?? content.value ?? content.content);
  }
  return "";
}

function userMessageText(value) {
  if (hasText(value)) return compactText(value);
  if (!isRecord(value)) return "";
  if (value.role && value.role !== "user") return "";
  return contentText(value.content ?? value.text ?? value.message);
}

function collectMessages(value) {
  if (hasText(value)) return [compactText(value)];
  if (!Array.isArray(value)) return [];
  return value.map(userMessageText).filter(Boolean);
}

function isTargetOnlyText(value) {
  const normalized = foldText(value).replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  if (DEICTIC_REFERENCES.some((reference) => normalized === foldText(reference))) return true;
  return /^(?:target(?: repo)?|the target|repo|repository|타겟|대상)\s*(?:is|은|는|이|가)?\s*.+$/i.test(normalized) &&
    isDeicticReference(normalized);
}

function objectiveResult(value, source) {
  const text = compactText(value);
  return isTargetOnlyText(text)
    ? { text: "", source: null }
    : { text, source };
}

function extractObjective(input) {
  if (hasText(input.objective)) {
    return objectiveResult(input.objective, "orchestrator objective");
  }

  for (const field of ["user_input", "message", "request"]) {
    if (hasText(input[field])) {
      return objectiveResult(input[field], "natural-language request");
    }
  }

  for (const field of ["messages", "conversation"]) {
    const messages = collectMessages(input[field]);
    if (messages.length > 0) {
      return objectiveResult(messages.join(" "), "conversation");
    }
  }

  return { text: "", source: null };
}

function isDeicticReference(value) {
  return DEICTIC_REFERENCES.some((reference) => containsPhrase(value, reference));
}

function deicticLabel(value) {
  const match = DEICTIC_REFERENCES
    .slice()
    .sort((left, right) => right.length - left.length)
    .find((reference) => containsPhrase(value, reference));
  return match ?? "current workspace";
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

  if (isDeicticReference(objective)) {
    return { value: deicticLabel(objective), source: "conversation" };
  }

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

function runGit(repo, args) {
  try {
    return spawnSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
  } catch {
    return { status: null, stdout: "", stderr: "" };
  }
}

function verifyRepoRoot(candidate) {
  if (!hasText(candidate) || !isAbsolute(candidate) || candidate.includes("\0")) {
    return {
      requested: hasText(candidate) ? candidate.trim() : null,
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
  if (git.status !== 0 || !hasText(git.stdout)) {
    return { requested, repo_root: null, verified: false, reason: "target is not a Git repository" };
  }

  try {
    const root = realpathSync(git.stdout.trim());
    return {
      requested,
      repo_root: root,
      verified: true,
      verification: "git rev-parse plus realpath",
    };
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
      session_cwd: cwd,
      requested: cwd,
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
      label: request.value,
      source: request.source,
      session_cwd: sessionCwd(input),
      requested: verified.requested,
      repo_root: verified.repo_root,
      verified: verified.verified,
      verification: verified.verification ?? null,
      reason: verified.reason ?? null,
    };
  }

  return {
    kind: "unresolved",
    label: request.value,
    source: request.source,
    session_cwd: sessionCwd(input),
    requested: null,
    repo_root: null,
    verified: false,
    reason: `target reference "${folded}" is not a path or supported workspace reference`,
  };
}

function parseStatusPaths(output) {
  const paths = [];
  const tokens = output.split("\0").filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const code = token.slice(0, 2);
    const path = normalizePath(token.slice(3));
    if (isSafeRelativePath(path)) paths.push(path);
    if (/[RC]/.test(code) && index + 1 < tokens.length) {
      const renamed = normalizePath(tokens[++index]);
      if (isSafeRelativePath(renamed)) paths.push(renamed);
    }
  }
  return uniqueSorted(paths);
}

function topLevelOf(path) {
  return normalizePath(path).split("/")[0] ?? "";
}

export function readOnlyInventory(targetRepo) {
  const verified = verifyRepoRoot(targetRepo);
  if (!verified.verified) {
    return {
      status: "unavailable",
      read_only: true,
      repo_root: null,
      tracked_paths: [],
      dirty_paths: [],
      top_level_paths: [],
      commands: [],
      reason: verified.reason,
    };
  }

  const files = runGit(verified.repo_root, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const status = runGit(verified.repo_root, ["status", "--porcelain=v1", "-uall", "-z"]);
  if (files.status !== 0 || status.status !== 0) {
    return {
      status: "unavailable",
      read_only: true,
      repo_root: verified.repo_root,
      tracked_paths: [],
      dirty_paths: [],
      top_level_paths: [],
      commands: INVENTORY_COMMANDS.slice(),
      reason: "Git inventory command failed",
    };
  }

  const trackedPaths = uniqueSorted(files.stdout.split("\0").filter(isSafeRelativePath).map(normalizePath));
  const dirtyPaths = parseStatusPaths(status.stdout);
  const allPaths = uniqueSorted([...trackedPaths, ...dirtyPaths]);
  return {
    status: "ready",
    read_only: true,
    repo_root: verified.repo_root,
    tracked_paths: trackedPaths,
    dirty_paths: dirtyPaths,
    top_level_paths: uniqueSorted(allPaths.map(topLevelOf)),
    commands: INVENTORY_COMMANDS.slice(),
    reason: null,
  };
}

function normalizeInventory(value, targetRoot) {
  if (!isRecord(value)) return readOnlyInventory(targetRoot);
  const trackedPaths = uniqueSorted(
    Array.isArray(value.tracked_paths) ? value.tracked_paths.filter(isSafeRelativePath).map(normalizePath) : [],
  );
  const dirtyPaths = uniqueSorted(
    Array.isArray(value.dirty_paths) ? value.dirty_paths.filter(isSafeRelativePath).map(normalizePath) : [],
  );
  const allPaths = uniqueSorted([...trackedPaths, ...dirtyPaths]);
  const topLevelPaths = uniqueSorted(
    (Array.isArray(value.top_level_paths) ? value.top_level_paths : allPaths.map(topLevelOf))
      .filter(isSafeRelativePath)
      .map(normalizePath),
  );
  return {
    status: value.status ?? "ready",
    read_only: value.read_only !== false,
    repo_root: value.repo_root ?? targetRoot,
    tracked_paths: trackedPaths,
    dirty_paths: dirtyPaths,
    top_level_paths: topLevelPaths,
    commands: Array.isArray(value.commands) ? value.commands.slice() : ["provided read-only inventory"],
    reason: value.reason ?? null,
  };
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
  const surfaces = relevantTopLevels(objective, inventory.top_level_paths);
  const surfaceLabel = surfaces.length > 0 ? surfaces.join(", ") : "the inventoried repository surfaces";
  const criteria = isParityObjective(objective)
    ? [
        `The read-only inventory identifies the GUI and CLI entry points in ${surfaceLabel}.`,
        "The user-visible capabilities are compared by observable behavior, with unsupported or hardware-dependent cases called out instead of assumed equivalent.",
        "Any product change is limited to the relevant surfaces and has focused validation evidence for each changed entry point.",
      ]
    : [
        `The stated objective is evaluated against the inventoried repository surfaces in ${surfaceLabel}.`,
        "The resulting understanding and proposed outcome are stated with observable evidence rather than assumptions.",
        "Read-only analysis leaves product files unchanged; any later mutation is validated on the changed surfaces.",
      ];
  return {
    items: criteria,
    source: "orchestrator-derived",
    derived_from: ["user objective", "read-only repository inventory"],
  };
}

export function deriveMutationBoundary(objective, inventory) {
  const candidateTopLevels = relevantTopLevels(objective, inventory.top_level_paths)
    .filter((topLevel) => !SAFETY_DENY.some((pattern) => pattern === `${topLevel}/**` || pattern === topLevel));
  const allow = candidateTopLevels
    .map((topLevel) => pathPatternForTopLevel(topLevel, [...inventory.tracked_paths, ...inventory.dirty_paths]))
    .filter(Boolean);
  return {
    allow: uniqueSorted(allow),
    deny: SAFETY_DENY.slice(),
    preserve_existing: true,
    auto_assign_dirty: false,
    status: allow.length > 0 ? "proposed" : "pending_inventory",
    derived_from: "read-only repository inventory",
    evidence: uniqueSorted(inventory.top_level_paths),
  };
}

function materialAmbiguities(objective, target, inventory) {
  const ambiguities = [];
  if (!target.verified) {
    ambiguities.push({
      kind: "target",
      material: true,
      question: "Which verifiable repository should the fleet use?",
    });
  }
  const normalized = foldText(objective);
  if (normalized.length < 8 || VAGUE_OBJECTIVES.has(normalized)) {
    ambiguities.push({
      kind: "objective",
      material: true,
      question: "What concrete outcome should change, if any?",
    });
  }
  if (inventory.status !== "ready") {
    ambiguities.push({
      kind: "inventory",
      material: true,
      question: "The repository inventory must complete before product work is assigned.",
    });
  }
  return ambiguities;
}

function contextReceipt(input) {
  const providedFields = Object.keys(input)
    .filter((key) => key !== "invocation")
    .sort();
  return {
    preserved: true,
    source: "orchestrator conversation and verified session context",
    provided_fields: providedFields,
    user_content_embedded: false,
  };
}

function baseReceipt(phase, input, state) {
  return {
    schema: INTAKE_SCHEMA,
    phase,
    state,
    invocation: input.invocation ?? INVOCATION,
    execution_authorized: phase === "OBJECTIVE_ADMITTED",
    analysis_authorized: phase === "OBJECTIVE_ADMITTED",
    mutation_authorized: false,
    commands_executed: [],
    mutation_commands_executed: [],
    resources_created: [],
    user_work: {
      status: "reserved",
      policy: "Existing and dirty worktree content is user work; reserve it and never auto-assign it.",
      reserved_paths: [],
      assigned_paths: [],
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
    read_only_analysis: {
      admitted: false,
      mutation_approval_required: false,
    },
    required_input: ["natural-language objective"],
  };
  if (blockers.length) receipt.blockers = blockers;
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
    blockers: [reason],
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
  if (input.invocation !== undefined && input.invocation !== INVOCATION) {
    return dormantReceipt(`only ${INVOCATION} can admit this role`);
  }

  const objective = extractObjective(input);
  if (!objective.text) return roleReceipt(input);

  const target = resolveTargetReference(input);
  if (!target.verified) {
    return roleReceipt(input, [
      `target: ${target.reason ?? "the target could not be verified"}`,
      "Ask one natural-language target question; do not request an intake schema.",
    ]);
  }

  const inventory = normalizeInventory(input.inventory, target.repo_root);
  const contract = {
    acceptance: deriveAcceptanceCriteria(objective.text, inventory),
    boundary: deriveMutationBoundary(objective.text, inventory),
  };
  const ambiguities = materialAmbiguities(objective.text, target, inventory);
  const requestedMode = input.mode === "analysis" || input.analysis_only === true || isAnalysisIntent(objective.text)
    ? "analysis"
    : "orchestrate";

  return {
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
    acceptance_criteria: contract.acceptance.items,
    acceptance_criteria_source: contract.acceptance.source,
    acceptance_criteria_derived_from: contract.acceptance.derived_from,
    mutation_boundary: contract.boundary,
    mutation_boundary_source: "orchestrator-derived",
    mutation_boundary_derived_from: ["read-only repository inventory", "user objective"],
    material_ambiguities: ambiguities,
    read_only_analysis: {
      admitted: true,
      mutation_approval_required: false,
      inventory_complete: inventory.status === "ready",
      dirty_paths_reserved: inventory.dirty_paths,
    },
    mutation_gate: {
      status: "pending",
      evaluated: false,
      required_before_product_mutation: true,
      blockers: [],
    },
    user_work: {
      status: "reserved",
      policy: "Existing and dirty worktree content is user work; reserve it and never auto-assign it.",
      reserved_paths: inventory.dirty_paths,
      assigned_paths: [],
    },
    required_input: [],
    waiting_for: ["PREFLIGHTED or read-only analysis"],
  };
}

function validateObjective(value) {
  if (!hasText(value)) return "objective must be a non-empty natural-language string";
  if (compactText(value).length < 2) return "objective is too short to be actionable";
  if (/(?:\.\.\.|<[^>]+>|\b(?:tbd|todo)\b)/i.test(value)) {
    return "objective contains an unresolved placeholder";
  }
  return null;
}

function validateTargetRepo(value) {
  if (!hasText(value)) return "target_repo must be a verified absolute path";
  if (!isAbsolute(value) || value.includes("\0")) {
    return "target_repo must be an absolute, NUL-free path";
  }
  return null;
}

function validateAcceptanceCriteria(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "acceptance_criteria must be a non-empty derived array";
  }
  for (const [index, criterion] of value.entries()) {
    if (!hasText(criterion)) return `acceptance_criteria[${index}] must be a non-empty string`;
    if (/(?:\.\.\.|<[^>]+>|\b(?:tbd|todo)\b)/i.test(criterion)) {
      return `acceptance_criteria[${index}] contains an unresolved placeholder`;
    }
  }
  return null;
}

function validateBoundary(value) {
  if (!isRecord(value)) {
    return "mutation_boundary must be an object with allow and deny path lists";
  }
  if (!Array.isArray(value.allow) || value.allow.length === 0) {
    return "mutation_boundary.allow must contain derived relative path patterns";
  }
  if (!Array.isArray(value.deny)) {
    return "mutation_boundary.deny must be an array";
  }
  for (const [name, paths] of [["allow", value.allow], ["deny", value.deny]]) {
    for (const [index, path] of paths.entries()) {
      if (!isSafeRelativePath(path)) {
        return `mutation_boundary.${name}[${index}] must be a non-empty relative path pattern`;
      }
    }
  }
  if (value.preserve_existing !== true) {
    return "mutation_boundary.preserve_existing must be true";
  }
  if (value.auto_assign_dirty !== false) {
    return "mutation_boundary.auto_assign_dirty must be false";
  }
  if (value.derived_from !== "read-only repository inventory") {
    return "mutation_boundary must record read-only inventory derivation";
  }
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

export function reserveDirtyPaths(inventoryOrReceipt = {}) {
  const inventory = isRecord(inventoryOrReceipt.inventory)
    ? inventoryOrReceipt.inventory
    : inventoryOrReceipt;
  const paths = Array.isArray(inventory.dirty_paths)
    ? uniqueSorted(inventory.dirty_paths.filter(isSafeRelativePath).map(normalizePath))
    : [];
  return {
    status: "reserved",
    reserved_paths: paths,
    assigned_paths: [],
  };
}

export function evaluateMutationGate(receipt, options = {}) {
  const source = isRecord(receipt) ? receipt : {};
  const mode = options.mode ?? source.request_mode ?? "mutation";
  const inventory = isRecord(source.inventory) ? source.inventory : {};
  const boundary = isRecord(source.mutation_boundary) ? source.mutation_boundary : {};
  const dirtyPaths = Array.isArray(options.dirty_paths)
    ? options.dirty_paths
    : Array.isArray(inventory.dirty_paths)
      ? inventory.dirty_paths
      : [];
  const reserved = uniqueSorted(dirtyPaths.filter(isSafeRelativePath).map(normalizePath));
  const allow = Array.isArray(boundary.allow) ? boundary.allow : [];
  const deny = Array.isArray(boundary.deny) ? boundary.deny : [];
  const dirtyOverlap = reserved.filter((path) =>
    allow.some((pattern) => matchesPattern(path, pattern)) &&
    !deny.some((pattern) => matchesPattern(path, pattern)));

  if (mode === "analysis" || options.read_only === true) {
    return {
      status: "not_required",
      admitted: true,
      mode: "analysis",
      blockers: [],
      reserved_dirty_paths: reserved,
      dirty_overlap: dirtyOverlap,
      note: "Read-only analysis is admitted without mutation approval.",
    };
  }

  const ambiguities = Array.isArray(options.material_ambiguities)
    ? options.material_ambiguities
    : Array.isArray(source.material_ambiguities)
      ? source.material_ambiguities
      : [];
  const material = ambiguities.filter((item) => !isRecord(item) || item.material !== false);
  const blockers = [];
  if (material.length > 0) {
    blockers.push("unresolved material ambiguity remains before product mutation");
  }
  if (dirtyOverlap.length > 0) {
    blockers.push(`dirty paths overlap the proposed mutation boundary: ${dirtyOverlap.join(", ")}`);
  }
  if (inventory.status !== "ready") {
    blockers.push("read-only repository inventory is incomplete");
  }
  if (allow.length === 0) {
    blockers.push("the orchestrator has not derived a non-empty mutation boundary");
  }

  return {
    status: blockers.length > 0 ? "blocked" : "passed",
    admitted: blockers.length === 0,
    mode: "mutation",
    blockers,
    reserved_dirty_paths: reserved,
    dirty_overlap: dirtyOverlap,
    material_ambiguities: material,
  };
}

export const checkMutationGate = evaluateMutationGate;

export function applyMutationGate(receipt, options = {}) {
  const gate = evaluateMutationGate(receipt, options);
  return {
    ...receipt,
    mutation_authorized: gate.mode === "mutation" && gate.admitted,
    mutation_gate: {
      ...gate,
      evaluated: true,
      required_before_product_mutation: true,
    },
  };
}

export function userFacingSummary(receipt) {
  if (!isRecord(receipt) || receipt.phase === "ROLE_ADMITTED") {
    return "Fleet 역할이 준비되었습니다. 원하는 결과를 자연어로 말해 주세요.";
  }
  if (receipt.state === "blocked") {
    return "대상을 확인할 수 없습니다. 현재 작업공간의 저장소 경로나 분석할 저장소를 자연어로 알려 주세요.";
  }
  const mode = receipt.request_mode === "analysis"
    ? "먼저 읽기 전용으로 조사하고 결과를 간단히 정리하겠습니다."
    : "먼저 저장소를 읽기 전용으로 파악한 뒤, 필요한 작업만 안전하게 나누겠습니다.";
  return [
    `이해한 목표: ${receipt.objective}`,
    `대상: ${receipt.target_reference?.label ?? receipt.target_repo}`,
    mode,
  ].join("\n");
}

export function validateObjectiveReceipt(receipt, targetRepo = null) {
  const errors = [];
  if (!isRecord(receipt)) errors.push("intake receipt must be a JSON object");
  if (errors.length) return errors;
  if (receipt.schema !== INTAKE_SCHEMA) errors.push("intake receipt schema is unsupported");
  if (receipt.phase !== "OBJECTIVE_ADMITTED") errors.push("intake receipt must be OBJECTIVE_ADMITTED");
  if (receipt.state !== "ready") errors.push("intake receipt is not ready");
  if (receipt.invocation !== INVOCATION) errors.push(`intake receipt invocation must be ${INVOCATION}`);
  if (receipt.execution_authorized !== true) errors.push("intake receipt does not authorize read-only orchestration");
  if (receipt.analysis_authorized !== true) errors.push("intake receipt does not authorize read-only analysis");
  if (receipt.mutation_authorized !== false) errors.push("intake receipt must not authorize mutation before the gate");

  const objectiveError = validateObjective(receipt.objective);
  if (objectiveError) errors.push(`intake receipt objective: ${objectiveError}`);
  const targetError = validateTargetRepo(receipt.target_repo);
  if (targetError) errors.push(`intake receipt target_repo: ${targetError}`);
  const criteriaError = validateAcceptanceCriteria(receipt.acceptance_criteria);
  if (criteriaError) errors.push(`intake receipt acceptance_criteria: ${criteriaError}`);
  if (receipt.acceptance_criteria_source !== "orchestrator-derived") {
    errors.push("intake receipt acceptance criteria must be orchestrator-derived");
  }
  const boundaryError = validateBoundary(receipt.mutation_boundary);
  if (boundaryError) errors.push(`intake receipt mutation_boundary: ${boundaryError}`);
  if (receipt.mutation_boundary_source !== "orchestrator-derived") {
    errors.push("intake receipt mutation boundary must be orchestrator-derived");
  }
  if (
    !isRecord(receipt.target_resolution) ||
    receipt.target_resolution.verified !== true ||
    receipt.target_resolution.repo_root !== receipt.target_repo
  ) {
    errors.push("intake receipt must prove target resolution from a verified workspace or path");
  }
  if (!isRecord(receipt.inventory) || receipt.inventory.read_only !== true || receipt.inventory.status !== "ready") {
    errors.push("intake receipt must include a completed read-only repository inventory");
  }
  if (!Array.isArray(receipt.commands_executed) || receipt.commands_executed.length !== 0) {
    errors.push("intake receipt must prove that no product command ran during intake");
  }
  if (!Array.isArray(receipt.mutation_commands_executed) || receipt.mutation_commands_executed.length !== 0) {
    errors.push("intake receipt must prove that no mutation command ran during intake");
  }
  if (!Array.isArray(receipt.resources_created) || receipt.resources_created.length !== 0) {
    errors.push("intake receipt must prove that no resource was created during intake");
  }
  if (
    !isRecord(receipt.user_work) ||
    receipt.user_work.status !== "reserved" ||
    !Array.isArray(receipt.user_work.reserved_paths) ||
    !Array.isArray(receipt.user_work.assigned_paths) ||
    receipt.user_work.assigned_paths.length !== 0
  ) {
    errors.push("intake receipt must reserve existing work without assignments");
  }
  if (
    !isRecord(receipt.read_only_analysis) ||
    receipt.read_only_analysis.admitted !== true ||
    receipt.read_only_analysis.mutation_approval_required !== false
  ) {
    errors.push("intake receipt must admit read-only analysis without mutation approval");
  }
  if (
    !isRecord(receipt.mutation_gate) ||
    receipt.mutation_gate.status !== "pending" ||
    receipt.mutation_gate.evaluated !== false
  ) {
    errors.push("intake receipt must leave the mutation gate pending until product work");
  }
  if (
    !isRecord(receipt.state_machine) ||
    JSON.stringify(receipt.state_machine.sequence) !== JSON.stringify(STATES) ||
    receipt.state_machine.current !== "OBJECTIVE_ADMITTED" ||
    !Array.isArray(receipt.state_machine.allowed_next) ||
    receipt.state_machine.allowed_next.length !== 1 ||
    receipt.state_machine.allowed_next[0] !== "PREFLIGHTED"
  ) {
    errors.push("intake receipt state machine is not at OBJECTIVE_ADMITTED");
  }
  if (targetRepo) {
    let receiptTarget = resolve(receipt.target_repo);
    let requestedTarget = resolve(targetRepo);
    try {
      receiptTarget = realpathSync(receiptTarget);
      requestedTarget = realpathSync(requestedTarget);
    } catch {
      // The absolute-path validation above remains the useful failure when a
      // caller supplies a path that no longer exists.
    }
    if (receiptTarget !== requestedTarget) {
      errors.push("intake receipt target_repo does not match --repo");
    }
  }
  if (!canTransition(receipt.phase, "PREFLIGHTED")) {
    errors.push("intake receipt cannot transition to PREFLIGHTED");
  }
  return errors;
}

export function canTransition(from, to) {
  return STATES.includes(from) && TRANSITIONS[from].includes(to);
}

function main() {
  let raw;
  try {
    raw = readFileSync(0, "utf8").trim();
  } catch {
    raw = "";
  }

  let input = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      input = isRecord(parsed) ? parsed : { user_input: String(parsed) };
    } catch {
      input = { user_input: raw };
    }
  }

  const receipt = admit(input);
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.state === "blocked") process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
