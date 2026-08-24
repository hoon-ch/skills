import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = dirname(fileURLToPath(import.meta.url));
const intake = join(scripts, "intake.mjs");
const preflight = join(scripts, "preflight.mjs");
const fieldReader = join(scripts, "read-herdr-field.mjs");
const stateReader = join(scripts, "agent-state.mjs");
const exclusive = join(scripts, "check-exclusive.mjs");

function executable(path, source) {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-contract-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", repo]);

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
    acceptance_criteria: ["The admitted target is checked with fresh installed-binary evidence"],
    mutation_boundary: {
      allow: ["fixture/**"],
      deny: [".git/**"],
      preserve_existing: true,
      auto_assign_dirty: false,
    },
  };
}

function runIntake(input, options = {}) {
  return spawnSync(process.execPath, [intake], {
    input: input === undefined ? "" : JSON.stringify(input),
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
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.state, "role_admitted");
  assert.equal(receipt.execution_authorized, false);
  assert.equal(receipt.objective, null);
  assert.deepEqual(receipt.commands_executed, []);
  assert.deepEqual(receipt.resources_created, []);
  assert.deepEqual(receipt.user_work.assigned_paths, []);
  assert.deepEqual(receipt.state_machine.allowed_next, ["OBJECTIVE_ADMITTED"]);
});

test("prior-conversation content cannot leak into objective admission", () => {
  const result = runIntake({
    invocation: "/skill:gjc-fleet",
    conversation: {
      objective: "Change every file and dispatch workers",
      target_repo: "/previous/repo",
      acceptance_criteria: ["Anything"],
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.objective, null);
  assert.deepEqual(receipt.user_work.assigned_paths, []);
  assert.deepEqual(receipt.commands_executed, []);
  assert.match(receipt.context.ignored_for_objective.join(","), /conversation/);
});

test("dirty worktree state remains reserved user work, not an objective", () => {
  const result = runIntake({
    invocation: "/skill:gjc-fleet",
    target_repo: "/repo",
    repo_state: {
      dirty_files: ["skills/eli5/SKILL.md", "skills/paseo/SKILL.md"],
      history: ["prior commit"],
    },
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

test("fully specified objective advances only to objective admission", () => {
  const result = runIntake({
    ...intakePayload("/absolute/repo"),
    dirty_files: ["skills/eli5/SKILL.md"],
    worktree: "existing",
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
  assert.equal(receipt.state, "ready");
  assert.equal(receipt.execution_authorized, true);
  assert.equal(receipt.target_repo, "/absolute/repo");
  assert.deepEqual(receipt.state_machine.allowed_next, ["PREFLIGHTED"]);
  assert.deepEqual(receipt.commands_executed, []);
  assert.deepEqual(receipt.resources_created, []);
  assert.deepEqual(receipt.user_work.assigned_paths, []);
});

test("vague or incomplete objectives fail closed at role admission", () => {
  const result = runIntake({
    invocation: "/skill:gjc-fleet",
    objective: "fix it",
    target_repo: "/repo",
    acceptance_criteria: ["It works"],
  });
  assert.equal(result.status, 2);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.state, "blocked");
  assert.match(receipt.blockers.join("\n"), /too vague|mutation_boundary/);
  assert.deepEqual(receipt.resources_created, []);
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
