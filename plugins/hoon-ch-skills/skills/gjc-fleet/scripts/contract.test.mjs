import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  admit,
  evaluateMutationGate,
  readOnlyInventory,
  userFacingSummary,
  validateObjectiveReceipt,
} from "./intake.mjs";
import {
  BUDGETS,
  claimTestAttempt,
  finishTestAttempt,
  newTestLedger,
} from "./budget.mjs";
import { runCanary, validateCanaryCommand } from "./canary.mjs";
import { compactCanaryDiagnostic } from "./canary.mjs";
import {
  buildPromptPlan,
  describeAgentSelection,
  nextPromptStep,
  reconcileFallback,
  selectLeafAgent,
} from "./agent-target.mjs";
import { compactFleetReceipt, readWorkerReport, receiptHasOnlyBoundedWorkerFields } from "./receipt.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const repoRoot = existsSync(resolve(process.cwd(), "skills", "gjc-fleet"))
  ? resolve(process.cwd())
  : resolve(scripts, "../../..");
const sourceSkill = resolve(repoRoot, "skills", "gjc-fleet");
const pluginSkill = resolve(repoRoot, "plugins/hoon-ch-skills/skills/gjc-fleet");
const localInstalledSkill = resolve(
  process.env.GJC_FLEET_INSTALLED_PATH ?? join(homedir(), ".gjc", "agent", "skills", "gjc-fleet"),
);
const intake = join(scripts, "intake.mjs");
const preflight = join(scripts, "preflight.mjs");
const fieldReader = join(scripts, "read-herdr-field.mjs");
const stateReader = join(scripts, "agent-state.mjs");
const exclusive = join(scripts, "check-exclusive.mjs");
const dialogueFixture = join(scripts, "fixtures", "conversational-current-workspace.json");
const regressionFixture = join(scripts, "fixtures", "wcopy-mac-context-thin.json");
const symlinkRegressionFixture = join(scripts, "fixtures", "symlink-canary-context-thin.json");

function executable(path, source) {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-context-thin-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "app"), { recursive: true });
  mkdirSync(join(repo, "cli"), { recursive: true });
  mkdirSync(join(repo, "tests"), { recursive: true });
  mkdirSync(join(repo, "skills", "eli5"), { recursive: true });
  mkdirSync(join(repo, "skills", "paseo"), { recursive: true });
  writeFileSync(join(repo, ".gitignore"), ".gjc/\ntarget/\nnode_modules/\n.build/\nDerivedData/\n");
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

function intakePayload(targetRepo, runDir = null) {
  return {
    invocation: "/skill:gjc-fleet",
    objective: "Run the bounded fleet contract checks against the named fixture",
    target_repo: targetRepo,
    mode: "analysis",
    ...(runDir ? { run_dir: runDir } : {}),
  };
}

function runIntake(input, options = {}) {
  return spawnSync(process.execPath, [intake], {
    input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    ...options,
  });
}

function runPreflight(
  fx,
  extraArgs,
  extraEnv = {},
  preflightPath = preflight,
  canaryPath = join(dirname(preflightPath), "canary.mjs"),
) {
  const intakePath = join(fx.root, "intake.json");
  const runDir = join(fx.root, "intake-artifacts");
  const receipt = execFileSync(process.execPath, [intake, "--run-dir", runDir], {
    input: JSON.stringify(intakePayload(fx.repo, runDir)),
    encoding: "utf8",
  });
  writeFileSync(intakePath, receipt);
  return spawnSync(process.execPath, [
    preflightPath,
    "--repo",
    fx.repo,
    "--intake-receipt",
    intakePath,
    ...extraArgs,
    "--canary-script",
    canaryPath,
    "--herdr-bin",
    fx.herdr,
    "--gjc-bin",
    fx.gjc,
  ], {
    encoding: "utf8",
    env: { ...process.env, HERDR_ENV: "1", ...extraEnv },
  });
}

function jsonBytes(path) {
  return statSync(path).size;
}

function removeFixture(fx) {
  rmSync(fx.root, { recursive: true, force: true });
}

test("activation-only input admits the role without inspecting or creating anything", () => {
  const result = runIntake();
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schema, "gjc-fleet-intake/v3");
  assert.equal(receipt.phase, "ROLE_ADMITTED");
  assert.equal(receipt.control_plane, true);
  assert.equal(receipt.product_access, "worker-only");
  assert.equal(receipt.analysis_authorized, false);
  assert.equal(receipt.mutation_authorized, false);
  assert.deepEqual(receipt.resources_created, []);
  assert.equal(receipt.inventory, undefined);
});

test("activation-only input does not invoke Git", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-activation-"));
  const marker = join(root, "git-called");
  const fakeGit = join(root, "git");
  executable(fakeGit, `require("node:fs").writeFileSync(process.env.GJC_FLEET_GIT_MARKER, "called");`);
  try {
    const result = runIntake(undefined, {
      env: { ...process.env, GJC_FLEET_GIT_MARKER: marker, PATH: `${root}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current workspace dialogue resolves through Git and stays bounded", () => {
  const fx = fixture();
  try {
    const input = JSON.parse(readFileSync(dialogueFixture, "utf8"));
    input.session_cwd = fx.repo;
    input.run_dir = join(fx.root, "dialogue-artifacts");
    const result = runIntake(input);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
    assert.equal(receipt.target_repo, realpathSync(fx.repo));
    assert.equal(receipt.inventory.read_only, true);
    assert.ok(Buffer.byteLength(result.stdout) <= BUDGETS.receiptMaxBytes);
    assert.ok(receipt.inventory.dirty_count >= 0);
    assert.ok(receipt.inventory.artifacts.dirty);
    assert.deepEqual(validateObjectiveReceipt(receipt, fx.repo), []);
    assert.doesNotMatch(result.stdout, /tracked_paths|dirty_paths|full_status|hashes/);
  } finally {
    removeFixture(fx);
  }
});

test("the current wcopy-mac regression fixture encodes the observed failure modes", () => {
  const fixtureData = JSON.parse(readFileSync(regressionFixture, "utf8"));
  assert.equal(fixtureData.prior_run.intake_bytes_observed, 12634736);
  assert.equal(fixtureData.prior_run.herdr_workspace, "w1P");
  assert.equal(fixtureData.prior_run.canary_attempts_observed, 3);
  assert.ok(fixtureData.required_invariants.includes("dirty-tree-compact-intake"));
});

test("the actual symlink canary session is preserved as an end-to-end regression fixture", () => {
  const fixtureData = JSON.parse(readFileSync(symlinkRegressionFixture, "utf8"));
  assert.equal(fixtureData.observed_session.intake_bytes, 0);
  assert.equal(fixtureData.observed_session.intake_exit, 0);
  assert.equal(fixtureData.observed_session.canary_exit, 0);
  assert.equal(fixtureData.observed_session.canary_artifact, null);
  assert.equal(fixtureData.observed_session.agent_target, "cli:agent:list");
  assert.ok(fixtureData.required_invariants.includes("fallback-waits-for-lifecycle-or-artifact"));
});

test("dirty inventory is compact and ignored directories never enter the artifact", () => {
  const fx = fixture();
  try {
    mkdirSync(join(fx.repo, ".gjc", "runtime"), { recursive: true });
    mkdirSync(join(fx.repo, "target"), { recursive: true });
    mkdirSync(join(fx.repo, "node_modules"), { recursive: true });
    writeFileSync(join(fx.repo, ".gjc", "runtime", "noise.json"), "ignored\n");
    writeFileSync(join(fx.repo, "target", "debug.bin"), "ignored\n");
    writeFileSync(join(fx.repo, "node_modules", "noise.js"), "ignored\n");
    writeFileSync(join(fx.repo, "app", "gui.ts"), "export const gui = false;\n");
    writeFileSync(join(fx.repo, "dirty.txt"), "user work\n");
    const runDir = join(fx.root, "inventory-artifacts");
    const inventory = readOnlyInventory(fx.repo, { runDir });
    assert.equal(inventory.status, "ready");
    assert.ok(inventory.dirty_count >= 2);
    assert.ok(inventory.dirty_sample.includes("dirty.txt"));
    assert.equal(inventory.dirty_sample.some((path) => path.startsWith(".gjc/")), false);
    const dirtyArtifact = readFileSync(inventory.artifacts.dirty.path);
    assert.equal(dirtyArtifact.includes(Buffer.from(".gjc/")), false);
    assert.equal(dirtyArtifact.includes(Buffer.from("target/")), false);
    assert.ok(statSync(inventory.artifacts.dirty.path).size < BUDGETS.receiptMaxBytes);
  } finally {
    removeFixture(fx);
  }
});

test("a synthetic 12 MB intake fails closed instead of generating a large receipt", () => {
  const result = runIntake("x".repeat(12 * 1024 * 1024));
  assert.equal(result.status, 2);
  assert.ok(Buffer.byteLength(result.stdout) <= BUDGETS.receiptMaxBytes);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.compacted, true);
  assert.match(receipt.reason, /hard cap/i);
  assert.doesNotMatch(result.stdout, /xxxxxxxxxxxxxxxxxxxxxxxx/);
});

test("large path inventories become count/sample/artifact metadata only", () => {
  const paths = Array.from({ length: 30000 }, (_, index) => `src/generated/${index}/file.ts`);
  const receipt = admit({
    invocation: "/skill:gjc-fleet",
    objective: "Analyze the generated source surface",
    target_repo: resolve("."),
    mode: "analysis",
    inventory: {
      status: "ready",
      read_only: true,
      repo_root: resolve("."),
      tracked_paths: paths,
      dirty_paths: paths.slice(0, 1000),
      top_level_paths: ["src"],
    },
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.phase, "OBJECTIVE_ADMITTED");
  assert.ok(Buffer.byteLength(serialized) <= BUDGETS.receiptMaxBytes);
  assert.equal(receipt.inventory.tracked_count, paths.length);
  assert.equal(receipt.inventory.dirty_count, 1000);
  assert.equal("tracked_paths" in receipt.inventory, false);
  assert.equal("dirty_paths" in receipt.inventory, false);
});

test("read-only analysis ignores dirty overlap while mutation fails closed", () => {
  const fx = fixture();
  try {
    const receipt = admit({
      ...intakePayload(fx.repo, join(fx.root, "run")),
      objective: "Analyze GUI and CLI parity",
      inventory: {
        status: "ready",
        read_only: true,
        repo_root: fx.repo,
        tracked_paths: ["app/gui.ts", "cli/main.py"],
        dirty_paths: ["app/gui.ts"],
        top_level_paths: ["app", "cli", "skills"],
      },
    });
    assert.equal(evaluateMutationGate(receipt, { mode: "analysis" }).admitted, true);
    const mutation = evaluateMutationGate(receipt, { mode: "mutation" });
    assert.equal(mutation.admitted, false);
    assert.match(mutation.blockers.join("\n"), /dirty paths overlap/);
  } finally {
    removeFixture(fx);
  }
});

test("user-facing summaries do not expose internal receipt fields", () => {
  const fx = fixture();
  try {
    const receipt = admit({ ...intakePayload(fx.repo), objective: "Analyze GUI and CLI parity", mode: "analysis" });
    const summary = userFacingSummary(receipt);
    assert.match(summary, /이해한 목표/);
    assert.match(summary, /worker/);
    assert.doesNotMatch(summary, /schema|target_repo|mutation_boundary|dirty_sample/);
    assert.doesNotMatch(summary, /[{}[\]]/);
  } finally {
    removeFixture(fx);
  }
});

test("preflight rejects missing, oversized, or role-only intake before binary checks", () => {
  const fx = fixture();
  try {
    const missing = spawnSync(process.execPath, [preflight, "--repo", fx.repo, "--model", "openai-codex/gpt-5.6-luna", "--herdr-bin", fx.herdr, "--gjc-bin", fx.gjc], {
      encoding: "utf8",
      env: { ...process.env, HERDR_ENV: "1" },
    });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /intake-receipt/);

    const rolePath = join(fx.root, "role.json");
    writeFileSync(rolePath, execFileSync(process.execPath, [intake], { input: "", encoding: "utf8" }));
    const roleOnly = spawnSync(process.execPath, [preflight, "--repo", fx.repo, "--intake-receipt", rolePath, "--model", "openai-codex/gpt-5.6-luna", "--herdr-bin", fx.herdr, "--gjc-bin", fx.gjc], {
      encoding: "utf8",
      env: { ...process.env, HERDR_ENV: "1" },
    });
    assert.equal(roleOnly.status, 2);
    assert.match(roleOnly.stderr, /OBJECTIVE_ADMITTED/);

    const oversized = join(fx.root, "oversized.json");
    writeFileSync(oversized, "x".repeat(BUDGETS.receiptMaxBytes + 1));
    const tooLarge = spawnSync(process.execPath, [preflight, "--repo", fx.repo, "--intake-receipt", oversized, "--model", "openai-codex/gpt-5.6-luna", "--herdr-bin", fx.herdr, "--gjc-bin", fx.gjc], {
      encoding: "utf8",
      env: { ...process.env, HERDR_ENV: "1" },
    });
    assert.equal(tooLarge.status, 2);
    assert.match(tooLarge.stderr, /receipt cap/);
  } finally {
    removeFixture(fx);
  }
});

test("preflight admits exact model and configured preset without product commands", () => {
  const fx = fixture();
  try {
    const model = runPreflight(fx, ["--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"]);
    assert.equal(model.status, 0, model.stderr);
    const modelReceipt = JSON.parse(model.stdout);
    assert.equal(modelReceipt.ok, true);
    assert.equal(modelReceipt.herdr.gjcKindSupported, false);
    assert.deepEqual(modelReceipt.gjc.launch, ["gjc", "--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"]);
    assert.equal(modelReceipt.budgets.receiptMaxBytes, BUDGETS.receiptMaxBytes);

    const preset = runPreflight(fx, ["--preset", "cxa-daily"]);
    assert.equal(preset.status, 0, preset.stderr);
    assert.equal(JSON.parse(preset.stdout).gjc.preset, "cxa-daily");
  } finally {
    removeFixture(fx);
  }
});

test("preflight rejects a zero-byte canary script instead of admitting plumbing", () => {
  const fx = fixture();
  try {
    const noop = join(fx.root, "noop-canary.mjs");
    executable(noop, "");
    const result = runPreflight(
      fx,
      ["--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"],
      {},
      preflight,
      noop,
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /canary script self-test failed/i);
    assert.match(result.stderr, /zero-byte|artifact missing/i);
  } finally {
    removeFixture(fx);
  }
});

test("plain-node source, plugin, and installed symlink paths execute every control entrypoint", () => {
  const fx = fixture();
  const installations = [
    ["source", sourceSkill],
    ["plugin", pluginSkill],
    ["local", existsSync(localInstalledSkill) ? localInstalledSkill : sourceSkill],
  ];
  try {
    for (const [label, skillRoot] of installations) {
      assert.equal(existsSync(skillRoot), true, `${label} skill root is missing`);
      const aliasRoot = join(fx.root, `${label}-installed-skill`);
      symlinkSync(skillRoot, aliasRoot, "dir");
      const aliasScripts = join(aliasRoot, "scripts");
      const runDir = join(fx.root, `${label}-entrypoint-run`);
      const intakeRunDir = join(runDir, "intake");
      mkdirSync(intakeRunDir, { recursive: true });

      for (const entrypoint of ["preflight.mjs", "canary.mjs", "budget.mjs", "receipt.mjs"]) {
        const noArgs = spawnSync(process.execPath, [join(aliasScripts, entrypoint)], { encoding: "utf8" });
        assert.notEqual(noArgs.status, 0, `${label} ${entrypoint} silently exited successfully`);
      }

      const intakeResult = spawnSync(process.execPath, [join(aliasScripts, "intake.mjs"), "--run-dir", intakeRunDir], {
        input: JSON.stringify(intakePayload(fx.repo, intakeRunDir)),
        encoding: "utf8",
      });
      assert.equal(intakeResult.status, 0, `${label} intake: ${intakeResult.stderr}`);
      assert.ok(Buffer.byteLength(intakeResult.stdout) > 0, `${label} intake was a no-op`);
      const intakePath = join(runDir, "intake.json");
      writeFileSync(intakePath, intakeResult.stdout);
      assert.equal(JSON.parse(intakeResult.stdout).phase, "OBJECTIVE_ADMITTED");

      const preflightResult = spawnSync(process.execPath, [
        join(aliasScripts, "preflight.mjs"),
        "--repo",
        fx.repo,
        "--intake-receipt",
        intakePath,
        "--model",
        "openai-codex/gpt-5.6-luna",
        "--thinking",
        "max",
        "--herdr-bin",
        fx.herdr,
        "--gjc-bin",
        fx.gjc,
        "--canary-script",
        join(aliasScripts, "canary.mjs"),
      ], {
        encoding: "utf8",
        env: { ...process.env, HERDR_ENV: "1" },
      });
      assert.equal(preflightResult.status, 0, `${label} preflight: ${preflightResult.stderr}`);
      assert.ok(Buffer.byteLength(preflightResult.stdout) > 0, `${label} preflight was a no-op`);
      assert.equal(JSON.parse(preflightResult.stdout).canary_self_test.status, "passed");

      const canaryRunDir = join(runDir, "canary");
      mkdirSync(canaryRunDir, { recursive: true });
      const canaryArtifact = join(canaryRunDir, "canary-result.json");
      const canaryResult = spawnSync(process.execPath, [
        join(aliasScripts, "canary.mjs"),
        "--cwd",
        fx.repo,
        "--artifact",
        canaryArtifact,
        "--run-dir",
        canaryRunDir,
        "--herdr-workspace",
        `fixture-${label}`,
        "--gjc-version",
        "9.9.9",
      ], {
        cwd: fx.repo,
        encoding: "utf8",
      });
      assert.equal(canaryResult.status, 0, `${label} canary: ${canaryResult.stderr}`);
      assert.ok(Buffer.byteLength(canaryResult.stdout) > 0, `${label} canary was a no-op`);
      assert.ok(statSync(canaryArtifact).size > 0, `${label} canary artifact is empty`);
      assert.equal(JSON.parse(readFileSync(canaryArtifact, "utf8")).status, "passed");

      const ledger = join(runDir, "test-ledger.json");
      const budgetResult = spawnSync(process.execPath, [
        join(aliasScripts, "budget.mjs"),
        "test-claim",
        "--ledger",
        ledger,
        "--phase",
        "focused",
        "--command",
        `node ${label}-focused-check`,
      ], { encoding: "utf8" });
      assert.equal(budgetResult.status, 0, `${label} budget: ${budgetResult.stderr}`);
      assert.ok(Buffer.byteLength(budgetResult.stdout) > 0, `${label} budget was a no-op`);

      const report = join(runDir, "worker-result.md");
      writeFileSync(report, "## Summary\nbounded\n\nFIX_DONE fixture FIXED=1 WITHDRAWN=0 OUTOFSCOPE=0 TYPECHECK=pass\n");
      const receiptResult = spawnSync(process.execPath, [join(aliasScripts, "receipt.mjs"), report], {
        encoding: "utf8",
      });
      assert.equal(receiptResult.status, 0, `${label} receipt: ${receiptResult.stderr}`);
      assert.ok(Buffer.byteLength(receiptResult.stdout) > 0, `${label} receipt was a no-op`);
      assert.equal(JSON.parse(receiptResult.stdout).status, "observed");
    }
  } finally {
    removeFixture(fx);
  }
});

test("preflight fails outside Herdr and for unresolved model input", () => {
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
    removeFixture(fx);
  }
});

test("canary allows only one deterministic launch/cwd/artifact probe", () => {
  const runDir = mkdtempSync(join(tmpdir(), "gjc-canary-"));
  const artifact = join(runDir, "canary-result.json");
  const command = `node /tmp/gjc-fleet/canary.mjs --cwd ${resolve(".")} --artifact ${artifact} --run-dir ${runDir}`;
  assert.equal(validateCanaryCommand(command), true);
  assert.throws(() => validateCanaryCommand(`${command} cargo run -p product`), /product\/build\/test/);

  const first = runCanary({
    cwd: process.cwd(),
    artifact,
    runDir,
    herdrWorkspace: "w1P",
    gjcVersion: "0.15.0",
    agentLaunched: true,
  });
  assert.equal(first.status, "passed");
  assert.ok(first.artifact_digest.bytes > 0);
  assert.match(first.artifact_digest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(readFileSync(artifact, "utf8")).product_command, false);
  const skipped = runCanary({
    cwd: process.cwd(),
    artifact,
    runDir,
    herdrWorkspace: "w1P",
    gjcVersion: "0.15.0",
    agentLaunched: true,
  });
  assert.equal(skipped.status, "skipped");
  assert.throws(() => runCanary({
    cwd: process.cwd(),
    artifact,
    runDir,
    herdrWorkspace: "w1P",
    gjcVersion: "0.15.1",
    agentLaunched: true,
  }), /retry is forbidden/);
  const failedDir = mkdtempSync(join(tmpdir(), "gjc-canary-failed-"));
  const failedArtifact = join(failedDir, "canary-result.json");
  assert.throws(() => runCanary({
    cwd: process.cwd(),
    artifact: failedArtifact,
    runDir: failedDir,
    herdrWorkspace: "w1P",
    gjcVersion: "0.15.0",
    agentLaunched: false,
  }), /observed GJC launch/);
  assert.throws(() => runCanary({
    cwd: process.cwd(),
    artifact: failedArtifact,
    runDir: failedDir,
    herdrWorkspace: "w1P",
    gjcVersion: "0.15.0",
    agentLaunched: true,
  }), /retry is forbidden/);
  rmSync(runDir, { recursive: true, force: true });
  rmSync(failedDir, { recursive: true, force: true });
});

test("canary reuse requires a verified artifact digest and keeps one attempt", () => {
  const runDir = mkdtempSync(join(tmpdir(), "gjc-canary-digest-"));
  const artifact = join(runDir, "canary-result.json");
  try {
    const first = runCanary({
      cwd: process.cwd(),
      artifact,
      runDir,
      herdrWorkspace: "w-digest",
      gjcVersion: "9.9.9",
      agentLaunched: true,
    });
    assert.equal(first.status, "passed");
    writeFileSync(artifact, "");
    assert.throws(() => runCanary({
      cwd: process.cwd(),
      artifact,
      runDir,
      herdrWorkspace: "w-digest",
      gjcVersion: "9.9.9",
      agentLaunched: true,
    }), /retry is forbidden.*digest/i);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("canary diagnostics distinguish plumbing from worker failure without a retry", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-canary-diagnostic-"));
  try {
    const plumbing = compactCanaryDiagnostic({
      phase: "self-test",
      commandExit: 0,
      commandOutputBytes: 0,
      artifactPath: join(root, "missing.json"),
    });
    assert.equal(plumbing.status, "failed");
    assert.equal(plumbing.failure_class, "script_plumbing");
    assert.equal(plumbing.attempt, BUDGETS.canaryMaxAttempts);
    assert.equal(plumbing.command_exit, 0);
    assert.equal(plumbing.artifact.bytes, 0);

    const worker = compactCanaryDiagnostic({
      phase: "worker",
      commandExit: 1,
      workerStatus: "blocked",
      paneTransition: "working->blocked",
      artifactPath: join(root, "missing.json"),
    });
    assert.equal(worker.status, "failed");
    assert.equal(worker.failure_class, "worker_failure");
    assert.equal(worker.worker_status, "blocked");
    assert.equal(worker.pane_transition, "working->blocked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("test ledger enforces hard phase budgets and repeated fingerprints", () => {
  let ledger = newTestLedger({ run: "fixture" });
  ledger = claimTestAttempt(ledger, { phase: "focused", command: "cargo test -p app focused_case" });
  ledger = finishTestAttempt(ledger, "test-1", { status: "failed", evidence: "exit 1" });
  assert.throws(() => claimTestAttempt(ledger, { phase: "focused", command: "cargo test -p app focused_case" }), /repeated test fingerprint/);
  ledger = claimTestAttempt(ledger, { phase: "owner_reverify", command: "cargo test -p app focused_case --exact", afterFix: true });
  ledger = claimTestAttempt(ledger, { phase: "global", command: "cargo test --workspace --all-targets" });
  assert.throws(() => claimTestAttempt(ledger, { phase: "global", command: "cargo test --workspace --doc" }), /global test budget exhausted/);
  assert.throws(() => claimTestAttempt(ledger, { phase: "canary", command: "cargo test" }), /unsupported test budget phase/);
});

test("large worker reports return only summary, top findings, counts, statuses, and digest", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-report-"));
  const report = join(root, "worker-result.md");
  const longSummary = "summary ".repeat(1000);
  const findings = Array.from({ length: 12 }, (_, index) => `- finding ${index}: bounded evidence` ).join("\n");
  writeFileSync(report, `## Summary\n${longSummary}\n## Findings\n${findings}\n## Verification\n| check | status | command or surface | evidence | limitation |\n| --- | --- | --- | --- | --- |\n| focused | live | cargo test -p app | exit 0, log path | |\n| global | gated | worker-owned | pending | not run here |\n\nFIX_DONE worker FIXED=2 WITHDRAWN=1 OUTOFSCOPE=3 TYPECHECK=pass\n${"SECRET_EVIDENCE ".repeat(70000)}`);
  const compact = readWorkerReport(report);
  assert.equal(receiptHasOnlyBoundedWorkerFields(compact), true);
  assert.ok(compact.report.bytes > 1_000_000);
  assert.ok(compact.summary_bytes <= BUDGETS.workerSummaryMaxBytes);
  assert.equal(compact.findings.top.length, BUDGETS.workerFindingMaxCount);
  assert.ok(compact.findings.omitted_count >= 3);
  assert.equal(compact.counts.fixed, 2);
  assert.equal(compact.verification.length, 2);
  assert.doesNotMatch(JSON.stringify(compact), /SECRET_EVIDENCE/);
  rmSync(root, { recursive: true, force: true });
});

test("final receipt helper hard-caps units and verbose limitations", () => {
  const receipt = compactFleetReceipt({
    state: "complete",
    run_id: "run-1",
    objective: { text: "bounded objective", source: "conversation" },
    target: { repo_root: "/tmp/repo", resolved_cwd_verified: true },
    units: Array.from({ length: 40 }, (_, index) => ({
      id: `f${index}`,
      lifecycle: "retired",
      owned_count: 1,
      summary: "verbose summary ".repeat(100),
      verification: [{ check: "focused", status: "live", evidence: "external evidence" }],
    })),
    limitations: Array.from({ length: 40 }, () => "verbose limitation ".repeat(100)),
  });
  assert.ok(JSON.stringify(receipt).length <= BUDGETS.receiptMaxBytes);
  assert.equal(receipt.schema, "gjc-fleet-receipt/v2");
  assert.ok(receipt.units.length <= BUDGETS.receiptUnitMaxCount);
  assert.ok(receipt.limitations.length <= BUDGETS.receiptLimitationMaxCount);
});

test("Herdr field reader and agent state reject guesses and preserve unknown", () => {
  const input = JSON.stringify({ result: { tab: { tab_id: "w9:t4" }, root_pane: { pane_id: "w9:p7" } } });
  const id = execFileSync(process.execPath, [fieldReader, "result.root_pane.pane_id"], { input, encoding: "utf8" });
  assert.equal(id.trim(), "w9:p7");
  const missing = spawnSync(process.execPath, [fieldReader, "result.pane.pane_id"], { input, encoding: "utf8" });
  assert.equal(missing.status, 2);

  const observed = execFileSync(process.execPath, [stateReader, "--pane-id", "w1:p1"], {
    input: JSON.stringify({ result: { agent: { agent: "gjc", agent_status: "done", cwd: "/repo", pane_id: "w1:p1" } } }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(observed).status, "done");
  const unknown = execFileSync(process.execPath, [stateReader], { input: "{}", encoding: "utf8" });
  assert.equal(JSON.parse(unknown).status, "unknown");
});

test("agent selection ignores the outer command id and requires an exact leaf pane", () => {
  const payload = {
    id: "cli:agent:list",
    result: {
      agents: [
        { agent: "gjc", agent_status: "working", pane_id: "w1:p3" },
        { agent: "gjc", agent_status: "idle", pane_id: "w1:p8" },
      ],
    },
  };
  assert.equal(selectLeafAgent(payload, "w1:p8").pane_id, "w1:p8");
  assert.equal(selectLeafAgent(payload, "cli:agent:list"), null);
  assert.deepEqual(describeAgentSelection(payload, null), {
    selected: false,
    reason: "pane_id_required",
  });
  const state = JSON.parse(execFileSync(process.execPath, [stateReader, "--pane-id", "w1:p8"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  }));
  assert.equal(state.agent, "gjc");
  assert.equal(state.pane_id, "w1:p8");
  assert.notEqual(state.agent, payload.id);
});

test("manual GJC fallback uses one pane-id prompt, one send-text-enter, and bounded reconciliation", () => {
  const plan = buildPromptPlan({
    paneId: "w1:p8",
    prompt: "write the artifact",
    manuallyDetected: true,
  });
  assert.equal(plan.primary.target, "w1:p8");
  assert.equal(plan.fallback.max_attempts, BUDGETS.agentFallbackMaxAttempts);
  assert.deepEqual(plan.fallback.actions.map((action) => action.action), ["pane_send_text", "pane_send_keys"]);
  assert.deepEqual(plan.fallback.actions[1].keys, ["enter"]);
  assert.equal(plan.fallback.wait.timeout_ms, BUDGETS.agentFallbackWaitMs);

  const initial = nextPromptStep({
    paneId: "w1:p8",
    prompt: "write the artifact",
    manuallyDetected: true,
  });
  assert.equal(initial.action, "agent_prompt");
  assert.equal(initial.target, "w1:p8");
  const fallback = nextPromptStep({
    paneId: "w1:p8",
    prompt: "write the artifact",
    manuallyDetected: true,
    errorCode: "agent_not_ready",
  });
  assert.equal(fallback.fallback_attempts, 1);
  assert.equal(nextPromptStep({
    paneId: "w1:p8",
    prompt: "write the artifact",
    errorCode: "agent_not_found",
  }).action, "stop");
  assert.equal(reconcileFallback({ fallbackAttempts: 1, lifecycleTransition: true }).status, "observed");
  assert.equal(reconcileFallback({ fallbackAttempts: 1, artifactReady: true }).status, "observed");
  assert.equal(reconcileFallback({ fallbackAttempts: 1 }).status, "blocked");
});

test("exclusive verifier proves disjointness and rejects malformed paths", () => {
  const root = mkdtempSync(join(tmpdir(), "gjc-fleet-orders-"));
  try {
    const one = join(root, "f1-order.md");
    const two = join(root, "f2-order.md");
    writeFileSync(one, "## Exclusive file set\n- `src/a.ts`\n");
    writeFileSync(two, "## Exclusive file set\n- `src/b.ts`\n");
    assert.equal(spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" }).status, 0);
    writeFileSync(two, "## Exclusive file set\n- `src/a.ts`\n");
    const collision = spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" });
    assert.equal(collision.status, 1);
    assert.match(collision.stdout, /CONFLICT/);
    writeFileSync(two, "## Exclusive file set\n- `../secret`\n");
    assert.equal(spawnSync(process.execPath, [exclusive, one, two], { encoding: "utf8" }).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("eli5 and paseo remain ordinary user work in the fixture", () => {
  const fx = fixture();
  try {
    const inventory = readOnlyInventory(fx.repo);
    assert.ok(inventory.tracked_sample.includes("skills/eli5/SKILL.md"));
    assert.ok(inventory.tracked_sample.includes("skills/paseo/SKILL.md"));
  } finally {
    removeFixture(fx);
  }
});
