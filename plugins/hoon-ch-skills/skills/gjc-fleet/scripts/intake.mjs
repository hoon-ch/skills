#!/usr/bin/env node
/**
 * Fail-closed admission for the gjc-fleet role.
 *
 * The helper reads only an explicit JSON invocation payload from stdin. It
 * never inspects the current directory, Git, a worktree, Herdr, or GJC.
 *
 * Empty stdin is the activation-only case:
 *   node intake.mjs
 *
 * A fully specified request is passed as JSON on stdin:
 *   printf '%s' '{"invocation":"/skill:gjc-fleet",...}' | node intake.mjs
 *
 * Exit 0 = role or objective admitted.
 * Exit 2 = invocation rejected or objective intake blocked.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const INVOCATION = "/skill:gjc-fleet";
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

const REQUIRED_OBJECTIVE_FIELDS = Object.freeze([
  "objective",
  "target_repo",
  "acceptance_criteria",
  "mutation_boundary",
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
]);

const IGNORED_CONTEXT_FIELDS = Object.freeze([
  "conversation",
  "current_repo",
  "dirty_files",
  "git_history",
  "history",
  "repo",
  "repo_state",
  "worktree",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function contextReceipt(input) {
  const providedFields = Object.keys(input)
    .filter((key) => !REQUIRED_OBJECTIVE_FIELDS.includes(key) && key !== "invocation")
    .sort();
  return {
    preserved: true,
    source: "explicit invocation payload only",
    provided_fields: providedFields,
    ignored_for_objective: providedFields.filter((key) => IGNORED_CONTEXT_FIELDS.includes(key)),
  };
}

function baseReceipt(phase, input, state) {
  return {
    schema: "gjc-fleet-intake/v1",
    phase,
    state,
    invocation: input.invocation ?? INVOCATION,
    execution_authorized: phase === "OBJECTIVE_ADMITTED",
    commands_executed: [],
    resources_created: [],
    user_work: {
      status: "reserved",
      policy: "Existing and dirty worktree content is user work; never auto-assign it.",
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
    required_input: REQUIRED_OBJECTIVE_FIELDS,
  };
  if (blockers.length) receipt.blockers = blockers;
  else {
    receipt.waiting_for = [
      "explicit objective",
      "target repo",
      "acceptance criteria",
      "mutation boundary",
    ];
  }
  return receipt;
}

function dormantReceipt(reason) {
  return {
    ...baseReceipt("DORMANT", { invocation: null }, "blocked"),
    invocation: null,
    execution_authorized: false,
    blockers: [reason],
    required_input: ["invocation"],
  };
}

function validateObjective(value) {
  if (!hasValue(value)) return "objective must be a non-empty string";
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.length < 8) return "objective is too short to be actionable";
  if (VAGUE_OBJECTIVES.has(normalized)) return "objective is too vague; name the concrete outcome";
  if (/(?:\.\.\.|<[^>]+>|\b(?:tbd|todo|later)\b)/i.test(normalized)) {
    return "objective contains an unresolved placeholder";
  }
  return null;
}

function validateTargetRepo(value) {
  if (!hasValue(value)) return "target_repo must be an absolute path";
  if (!isAbsolute(value) || value.includes("\0")) {
    return "target_repo must be an absolute, NUL-free path";
  }
  return null;
}

function validateAcceptanceCriteria(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "acceptance_criteria must be a non-empty array";
  }
  for (const [index, criterion] of value.entries()) {
    if (!hasValue(criterion)) return `acceptance_criteria[${index}] must be a non-empty string`;
    if (/(?:\.\.\.|<[^>]+>|\b(?:tbd|todo|later)\b)/i.test(criterion)) {
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
    return "mutation_boundary.allow must be a non-empty array";
  }
  if (!Array.isArray(value.deny)) {
    return "mutation_boundary.deny must be an array";
  }
  for (const [name, paths] of [["allow", value.allow], ["deny", value.deny]]) {
    for (const [index, path] of paths.entries()) {
      const normalizedPath = typeof path === "string" ? path.replaceAll("\\", "/") : "";
      if (
        !hasValue(path) ||
        path.includes("\0") ||
        isAbsolute(path) ||
        normalizedPath.split("/").includes("..")
      ) {
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
  return null;
}

export function canTransition(from, to) {
  return STATES.includes(from) && TRANSITIONS[from].includes(to);
}

export function admit(input = {}) {
  if (!isRecord(input)) return dormantReceipt("invocation payload must be a JSON object");
  if (Object.hasOwn(input, "invocation") && input.invocation !== INVOCATION) {
    return dormantReceipt(`only ${INVOCATION} can admit this role`);
  }

  const objective = input.objective;
  if (objective === undefined || objective === null || (typeof objective === "string" && !objective.trim())) {
    return roleReceipt(input);
  }

  const checks = [
    ["objective", validateObjective(objective)],
    ["target_repo", validateTargetRepo(input.target_repo)],
    ["acceptance_criteria", validateAcceptanceCriteria(input.acceptance_criteria)],
    ["mutation_boundary", validateBoundary(input.mutation_boundary)],
  ];
  const blockers = checks.filter(([, error]) => error).map(([field, error]) => `${field}: ${error}`);
  if (blockers.length) return roleReceipt(input, blockers);

  return {
    ...baseReceipt("OBJECTIVE_ADMITTED", input, "ready"),
    objective: objective.trim(),
    target_repo: input.target_repo,
    acceptance_criteria: input.acceptance_criteria.map((criterion) => criterion.trim()),
    mutation_boundary: input.mutation_boundary,
    required_input: [],
    waiting_for: ["PREFLIGHTED"],
  };
}

export function validateObjectiveReceipt(receipt, targetRepo = null) {
  const errors = [];
  if (!isRecord(receipt)) errors.push("intake receipt must be a JSON object");
  if (errors.length) return errors;
  if (receipt.schema !== "gjc-fleet-intake/v1") errors.push("intake receipt schema is unsupported");
  if (receipt.phase !== "OBJECTIVE_ADMITTED") errors.push("intake receipt must be OBJECTIVE_ADMITTED");
  if (receipt.state !== "ready") errors.push("intake receipt is not ready");
  if (receipt.invocation !== INVOCATION) errors.push(`intake receipt invocation must be ${INVOCATION}`);
  if (receipt.execution_authorized !== true) errors.push("intake receipt does not authorize scoped execution");
  const objectiveError = validateObjective(receipt.objective);
  if (objectiveError) errors.push(`intake receipt objective: ${objectiveError}`);
  const targetError = validateTargetRepo(receipt.target_repo);
  if (targetError) errors.push(`intake receipt target_repo: ${targetError}`);
  const criteriaError = validateAcceptanceCriteria(receipt.acceptance_criteria);
  if (criteriaError) errors.push(`intake receipt acceptance_criteria: ${criteriaError}`);
  const boundaryError = validateBoundary(receipt.mutation_boundary);
  if (boundaryError) errors.push(`intake receipt mutation_boundary: ${boundaryError}`);
  if (!Array.isArray(receipt.commands_executed) || receipt.commands_executed.length !== 0) {
    errors.push("intake receipt must prove that no command ran during intake");
  }
  if (!Array.isArray(receipt.resources_created) || receipt.resources_created.length !== 0) {
    errors.push("intake receipt must prove that no resource was created during intake");
  }
  if (
    !isRecord(receipt.user_work) ||
    receipt.user_work.status !== "reserved" ||
    !Array.isArray(receipt.user_work.assigned_paths) ||
    receipt.user_work.assigned_paths.length !== 0
  ) {
    errors.push("intake receipt must reserve existing work without assignments");
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
  if (targetRepo && receipt.target_repo !== targetRepo) {
    errors.push("intake receipt target_repo does not match --repo");
  }
  if (!canTransition(receipt.phase, "PREFLIGHTED")) {
    errors.push("intake receipt cannot transition to PREFLIGHTED");
  }
  return errors;
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
      input = JSON.parse(raw);
    } catch {
      console.error("GJC_FLEET_INTAKE_FAILED: stdin is not valid JSON");
      process.exit(2);
    }
  }
  const receipt = admit(input);
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.state === "blocked") process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
