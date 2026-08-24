import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { admit, evaluateMutationGate, userFacingSummary } from "./intake.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const intake = join(scripts, "intake.mjs");
const preflight = join(scripts, "preflight.mjs");
const fieldReader = join(scripts, "read-herdr-field.mjs");
const stateReader = join(scripts, "agent-state.mjs");
const exclusive = join(scripts, "check-exclusive.mjs");
const regressionFixture = join(scripts, "fixtures", "conversational-current-workspace.json");

function executable(path, source) {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-contract-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  mkdirSync(join(repo, "app"));
  mkdirSync(join(repo, "cli"));
  mkdirSync(join(repo, "tests"));
  mkdirSync(join(repo, "skills", "eli5"), { recursive: true });
  mkdirSync(join(repo, "skills", "paseo"), { recursive: true });
  writeFileSync(join(repo, "app", "gui.ts"), "export const gui = true;\n");
  writeFileSync(join(repo, "cli", "main.py"), "print('cli')\n");
  writeFileSync(join(repo, "tests", "smoke.test.ts"), "test('smoke', () => {});\n");
  writeFileSync(join(repo, "skills", "eli5", "SKILL.md"), "# user work\n");
  writeFileSync(join(repo, "skills", "paseo", "SKILL.md"), "# user work\n");
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "user.name=GJC Contract",
    "-c",
    "user.email=gjc-contract@example.invalid",
    "commit",
    "-qm",
    "baseline",
  ]);

  const herdr = join(root, "herdr");
  executable(herdr, `
const args = process.argv.slice(2);
const out = (text) => process.stdout.write(text + "\\n");
if (args[0] === "--version") out("herdr 9.9.9");
else if (args[0] === "--skill") out("---\\nname: herdr\\ndescription: test\\n---\\nHERDR_ENV=1\\nThe installed binary is the authority. Use --no-focus. Parse IDs from JSON.");
else if (args[0] === "agent" && args[1] === undefined) { out("kinds: pi|codex"); process.exitCode = 2; }
else if (args.includes("--help")) out("--skill --version agent pane tab worktree run read send-text send-keys start prompt wait create list remove --cwd --no-focus <PANE_ID> <COMMAND> <TEXT> <KEY> <target> recent-unwrapped detection --timeout --wait idle blocked --mode");
else out("ok");
`);

  const gjc = join(root, "gjc");
  executable(gjc, `
const args = process.argv.slice(2);
const out = (text) => process.stdout.write(text + "\\n");
if (args[0] === "--version") out("gjc v9.9.9");
else if (args.includes("--list-models")) {
  if (process.env.FAKE_GJC_MODE === "bad-model") out('No models matching "gpt-5.6-luna"');
  else out("Provider models\\nopenai-codex gpt-5.6-luna 372K 128K low,medium,high,xhigh,max yes");
} else if (args.includes("-p")) out("GJC_FLEET_PRESET_OK");
else if (args.includes("--help")) out("--model --mpreset --thinking --list-models --no-session --no-tools --mode");
else out("ok");
`);
  return { root, repo, herdr, gjc };
}

function intakePayload(targetRepo) {
  return {
    invocation: "/skill:gjc-fleet",
    objective: "Run the fleet contract checks against the named fixture",
    target_repo: targetRepo,
    mode: "analysis",
  };
}

function runIntake(input, options = {}) {
  return spawnSync(process.execPath, [intake], {
    input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    ...options,
  });
}

function runPreflight(fx, extraArgs, extraEnv = {}) {
  const intakePath = join(fx.root, "intake.json");
  const receipt = execFileSync(process.execPath, [intake], {
    input: JSON.stringify(intakePayload(fx.repo)),
    encoding: "utf8",
  });
  writeFileSync(intakePath, receipt);
  return spawnSync(process.execPath, [
    preflight,
    "--repo",
    fx.repo,
    "--intake-receipt",
    intakePath,
    ...extraArgs,
    "--herdr-bin",
    fx.herdr,
    "--gjc-bin",
    fx.gjc,
  ], {
    encoding: "utf8",
    env: { ...process.env, HERDR_ENV: "1", ...extraEnv },
  });
}

test("activation-only input admits the role without commands or resources", () => {
  const result = runIntake();
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schema, "gjc-fleet-intake/v2");
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.state, "role_admitted");
  assert.equal(receipt.execution_authorized, false);
  assert.equal(receipt.analysis_authorized, false);
  assert.equal(receipt.mutation_authorized, false);
  assert.equal(receipt.objective, null);
  assert.deepEqual(receipt.commands_executed, []);
  assert.deepEqual(receipt.mutation_commands_executed, []);
  assert.deepEqual(receipt.resources_created, []);
  assert.deepEqual(receipt.user_work.reserved_paths, []);
  assert.deepEqual(receipt.user_work.assigned_paths, []);
  assert.deepEqual(receipt.state_machine.allowed_next, ["OBJECTIVE_ADMITTED"]);
});

test("activation-only input does not invoke Git or inspect the workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-activation-"));
  const marker = join(root, "git-called");
  const fakeGit = join(root, "git");
  executable(fakeGit, `
require("node:fs").writeFileSync(process.env.GJC_FLEET_GIT_MARKER, "called");
`);
  try {
    const result = runIntake(undefined, {
      env: {
        ...process.env,
        GJC_FLEET_GIT_MARKER: marker,
        PATH: `${root}:${process.env.PATH}`,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a target reference without an objective remains activation-only", () => {
  const result = runIntake("current workspace");
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.objective, null);
  assert.deepEqual(receipt.resources_created, []);
});

test("natural-language objective is admitted without a user-authored schema", () => {
  const fx = fixture();
  try {
    const result = runIntake("GUI와 CLI가 동일한 기능을 제공하면 좋겠어. 타겟은 현재 워크스페이스.", {
      cwd: fx.repo,
    });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
    assert.equal(receipt.state, "ready");
    assert.match(receipt.objective, /GUI와 CLI/);
    assert.equal(receipt.analysis_authorized, true);
    assert.equal(receipt.mutation_authorized, false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("regression dialogue resolves current workspace from a verified session cwd", () => {
  const fx = fixture();
  try {
    const input = JSON.parse(readFileSync(regressionFixture, "utf8"));
    input.session_cwd = fx.repo;
    const result = runIntake(input);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
    assert.equal(receipt.target_repo, realpathSync(fx.repo));
    assert.equal(receipt.target_resolution.verified, true);
    assert.equal(receipt.target_resolution.kind, "current_workspace");
    assert.match(receipt.objective, /GUI와 CLI/);
    assert.match(receipt.target_reference.label, /워크스페이스/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("acceptance criteria and mutation boundary are orchestrator-derived from inventory", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "GUI와 CLI가 동일한 기능을 제공하는지 분석한다",
      inventory: {
        status: "ready",
        read_only: true,
        repo_root: fx.repo,
        tracked_paths: ["app/gui.ts", "cli/main.py", "tests/smoke.test.ts"],
        dirty_paths: [],
        top_level_paths: ["app", "cli", "tests"],
      },
    });
    assert.equal(receipt.acceptance_criteria_source, "orchestrator-derived");
    assert.equal(receipt.mutation_boundary_source, "orchestrator-derived");
    assert.equal(receipt.acceptance_criteria.length >= 3, true);
    assert.deepEqual(receipt.mutation_boundary.allow, ["app/**", "cli/**"]);
    assert.match(receipt.mutation_boundary.derived_from, /read-only/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("read-only analysis is admitted without mutation approval", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "GUI와 CLI의 기능 차이를 분석해",
      mode: "analysis",
    });
    assert.equal(receipt.read_only_analysis.admitted, true);
    assert.equal(receipt.read_only_analysis.mutation_approval_required, false);
    assert.equal(receipt.mutation_gate.status, "pending");
    assert.equal(receipt.mutation_authorized, false);
    const gate = evaluateMutationGate(receipt, { mode: "analysis" });
    assert.equal(gate.admitted, true);
    assert.equal(gate.status, "not_required");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("material ambiguity blocks mutation only at the mutation gate", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "fix it",
      mode: "orchestrate",
    });
    assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
    assert.equal(receipt.material_ambiguities.some((item) => item.kind === "objective"), true);
    assert.equal(evaluateMutationGate(receipt, { mode: "analysis" }).admitted, true);
    const gate = evaluateMutationGate(receipt, { mode: "mutation" });
    assert.equal(gate.admitted, false);
    assert.match(gate.blockers.join("\n"), /material ambiguity/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("internal receipt fields stay out of the user-facing conversation", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "GUI와 CLI의 기능 차이를 분석한다",
      mode: "analysis",
    });
    const summary = userFacingSummary(receipt);
    assert.match(summary, /이해한 목표/);
    assert.match(summary, /읽기 전용/);
    assert.doesNotMatch(summary, /schema|target_repo|acceptance_criteria|mutation_boundary/);
    assert.doesNotMatch(summary, /[{}[\]]/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("assistant-only prior context cannot invent an objective", () => {
  const result = runIntake({
    invocation: "/skill:gjc-fleet",
    messages: [
      { role: "assistant", content: "Change every file and dispatch workers" },
    ],
    target_repo: "/previous/repo",
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.objective, null);
  assert.deepEqual(receipt.user_work.assigned_paths, []);
  assert.deepEqual(receipt.commands_executed, []);
});

test("dirty worktree state remains reserved user work, not an objective", () => {
  const result = runIntake({
    invocation: "/skill:gjc-fleet",
    dirty_files: ["skills/eli5/SKILL.md", "skills/paseo/SKILL.md"],
    worktree: "existing",
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.target_repo, null);
  assert.equal(receipt.user_work.status, "reserved");
  assert.deepEqual(receipt.user_work.assigned_paths, []);
  assert.deepEqual(receipt.resources_created, []);
});

test("dirty paths are reserved without blocking unrelated analysis", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "GUI와 CLI의 기능 차이를 분석한다",
      mode: "analysis",
      inventory: {
        status: "ready",
        read_only: true,
        repo_root: fx.repo,
        tracked_paths: ["app/gui.ts", "cli/main.py", "skills/eli5/SKILL.md", "skills/paseo/SKILL.md"],
        dirty_paths: ["skills/eli5/SKILL.md", "skills/paseo/SKILL.md"],
        top_level_paths: ["app", "cli", "skills"],
      },
    });
    assert.deepEqual(receipt.user_work.reserved_paths, [
      "skills/eli5/SKILL.md",
      "skills/paseo/SKILL.md",
    ]);
    assert.deepEqual(receipt.user_work.assigned_paths, []);
    const gate = evaluateMutationGate(receipt, { mode: "analysis" });
    assert.equal(gate.admitted, true);
    assert.deepEqual(gate.dirty_overlap, []);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("overlapping dirty paths fail closed for mutation", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo),
      objective: "GUI와 CLI의 기능 차이를 분석한다",
      inventory: {
        status: "ready",
        read_only: true,
        repo_root: fx.repo,
        tracked_paths: ["app/gui.ts", "cli/main.py"],
        dirty_paths: ["app/gui.ts"],
        top_level_paths: ["app", "cli"],
      },
    });
    const gate = evaluateMutationGate(receipt, { mode: "mutation" });
    assert.equal(gate.admitted, false);
    assert.deepEqual(gate.dirty_overlap, ["app/gui.ts"]);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("fully resolved objective advances only to objective admission", () => {
  const fx = fixture();
  try {
    const result = runIntake(intakePayload(fx.repo));
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
    assert.equal(receipt.state, "ready");
    assert.equal(receipt.execution_authorized, true);
    assert.equal(receipt.analysis_authorized, true);
    assert.equal(receipt.mutation_authorized, false);
    assert.equal(receipt.target_repo, realpathSync(fx.repo));
    assert.deepEqual(receipt.state_machine.allowed_next, ["PREFLIGHTED"]);
    assert.deepEqual(receipt.commands_executed, []);
    assert.deepEqual(receipt.mutation_commands_executed, []);
    assert.deepEqual(receipt.resources_created, []);
    assert.deepEqual(receipt.user_work.assigned_paths, []);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight rejects missing or role-only intake before binary checks", () => {
  const fx = fixture();
  try {
    const missing = spawnSync(process.execPath, [
      preflight,
      "--repo",
      fx.repo,
      "--model",
      "openai-codex/gpt-5.6-luna",
      "--herdr-bin",
      fx.herdr,
      "--gjc-bin",
      fx.gjc,
    ], {
      encoding: "utf8",
      env: { ...process.env, HERDR_ENV: "1" },
    });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /intake-receipt/);

    const rolePath = join(fx.root, "role.json");
    writeFileSync(rolePath, execFileSync(process.execPath, [intake], { input: "", encoding: "utf8" }));
    const roleOnly = spawnSync(process.execPath, [
      preflight,
      "--repo",
      fx.repo,
      "--intake-receipt",
      rolePath,
      "--model",
      "openai-codex/gpt-5.6-luna",
      "--herdr-bin",
      fx.herdr,
      "--gjc-bin",
      fx.gjc,
    ], {
      encoding: "utf8",
      env: { ...process.env, HERDR_ENV: "1" },
    });
    assert.equal(roleOnly.status, 2);
    assert.match(roleOnly.stderr, /OBJECTIVE_ADMITTED/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight admits an exact model and reports unsupported gjc agent kind", () => {
  const fx = fixture();
  try {
    const result = runPreflight(fx, ["--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.herdr.gjcKindSupported, false);
    assert.deepEqual(receipt.gjc.launch, ["gjc", "--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"]);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight admits a configured preset only through the ephemeral probe", () => {
  const fx = fixture();
  try {
    const result = runPreflight(fx, ["--preset", "cxa-daily"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).gjc.preset, "cxa-daily");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight fails closed outside Herdr and for unresolved model input", () => {
  const fx = fixture();
  try {
    const outside = runPreflight(fx, ["--model", "openai-codex/gpt-5.6-luna"], { HERDR_ENV: undefined });
    assert.equal(outside.status, 2);
    assert.match(outside.stderr, /HERDR_ENV/);

    const fuzzy = runPreflight(fx, ["--model", "gpt-5.6-luna"]);
    assert.equal(fuzzy.status, 2);
    assert.match(fuzzy.stderr, /explicit PROVIDER\/MODEL/);

    const missing = runPreflight(fx, ["--model", "openai-codex/gpt-5.6-luna"], { FAKE_GJC_MODE: "bad-model" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /did not resolve exactly one/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("Herdr field reader extracts returned IDs and rejects guesses", () => {
  const input = JSON.stringify({ result: { tab: { tab_id: "w9:t4" }, root_pane: { pane_id: "w9:p7" } } });
  const id = execFileSync(process.execPath, [fieldReader, "result.root_pane.pane_id"], { input, encoding: "utf8" });
  assert.equal(id.trim(), "w9:p7");
  const missing = spawnSync(process.execPath, [fieldReader, "result.pane.pane_id"], { input, encoding: "utf8" });
  assert.equal(missing.status, 2);
});

test("agent state normalizer preserves exact lifecycle semantics and unknown", () => {
  const observed = execFileSync(process.execPath, [stateReader], {
    input: JSON.stringify({ result: { agent: { agent: "gjc", agent_status: "done", cwd: "/repo", pane_id: "w1:p1" } } }),
    encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(observed), {
    present: true,
    agent: "gjc",
    status: "done",
    cwd: "/repo",
    foreground_cwd: null,
    pane_id: "w1:p1",
    tab_id: null,
    workspace_id: null,
    error_code: null,
  });
  const unknown = execFileSync(process.execPath, [stateReader], { input: "{}", encoding: "utf8" });
  assert.deepEqual(JSON.parse(unknown), { present: false, agent: null, status: "unknown", error_code: null });
});

test("exclusive verifier proves disjointness and blocks overlap/malformed paths", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-orders-"));
  try {
    const one = join(root, "f1-order.md");
    const two = join(root, "f2-order.md");
    writeFileSync(one, "## Exclusive file set\n- `src/a.ts`\n");
    writeFileSync(two, "## Exclusive file set\n- `src/b.ts`\n");
    const safe = spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" });
    assert.equal(safe.status, 0, safe.stdout + safe.stderr);

    writeFileSync(two, "## Exclusive file set\n- `src/a.ts`\n");
    const collision = spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" });
    assert.equal(collision.status, 1);
    assert.match(collision.stdout, /CONFLICT/);

    writeFileSync(two, "## Exclusive file set\n- `..\/secret`\n");
    const malformed = spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" });
    assert.equal(malformed.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
