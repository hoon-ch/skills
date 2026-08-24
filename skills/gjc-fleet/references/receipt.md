# Final receipt

Every fleet run ends with one durable receipt outside product files. The receipt is a factual
boundary between observed evidence and worker claims. Use `state: complete` only under the gate
rule below.

## Admission receipt

The first receipt is not a completion receipt. For an exact `/skill:gjc-fleet` invocation with no
explicit objective, return only this shape and wait:

```json
{
  "schema": "gjc-fleet-intake/v1",
  "phase": "ROLE_ADMITTED",
  "state": "role_admitted",
  "invocation": "/skill:gjc-fleet",
  "execution_authorized": false,
  "objective": null,
  "target_repo": null,
  "acceptance_criteria": [],
  "mutation_boundary": null,
  "commands_executed": [],
  "resources_created": [],
  "user_work": {
    "status": "reserved",
    "assigned_paths": []
  },
  "state_machine": {
    "current": "ROLE_ADMITTED",
    "allowed_next": ["OBJECTIVE_ADMITTED"]
  },
  "waiting_for": [
    "explicit objective",
    "target repo",
    "acceptance criteria",
    "mutation boundary"
  ]
}
```

This receipt proves role admission only. It must not contain a preflight result, a discovered
repository path, a Git baseline, a dirty-file assignment, a Herdr ID, a worker result, or a
command log. A request with an ambiguous objective or missing required field remains
`ROLE_ADMITTED` with `state: blocked` and named blockers. The helper emits
`OBJECTIVE_ADMITTED` only for a complete explicit intake, after which preflight may begin.

## Minimum shape

```json
{
  "schema": "gjc-fleet-receipt/v1",
  "phase": "RECEIPT",
  "state": "complete|incomplete|blocked",
  "run_id": "2026-...",
  "state_machine": {
    "current": "RECEIPT",
    "allowed_next": []
  },
  "target": {
    "requested_cwd": "/absolute/path",
    "repo_root": "/absolute/path",
    "resolved_cwd_verified": true
  },
  "preflight": {
    "herdr_env": true,
    "herdr_version": "observed",
    "gjc_version": "observed",
    "herdr_skill_loaded": true,
    "launch": ["gjc", "--model", "openai-codex/gpt-5.6-luna", "--thinking", "max"]
  },
  "units": [
    {
      "id": "f2",
      "owned_files": ["src/example.ts"],
      "result": "/tmp/gjc-fleet.../results/f2-result.md",
      "fixed": 1,
      "withdrawn": 0,
      "out_of_scope": 0,
      "lifecycle": "retired|running|blocked|unknown",
      "evidence": [
        {"check": "typecheck", "status": "live", "command": "...", "proof": "..."},
        {"check": "production-build", "status": "gated", "command": "...", "proof": "..."}
      ]
    }
  ],
  "resources": {
    "created_by_run": [{"workspace_id": "...", "tab_id": "...", "pane_id": "..."}],
    "retired": ["..."],
    "preserved_running": [],
    "preexisting_untouched": true
  },
  "user_work": {
    "baseline_status": "...",
    "unowned_drift": [],
    "preserved": true
  },
  "limitations": []
}
```

The actual receipt may use a different serialization, but it must preserve all fields or their
plain-text equivalent. Redact secret values; paths, model names, statuses, exit codes, and
artifact URIs are not secrets by default but still need normal access controls.

## Lifecycle phases

Receipts must identify the current phase from this strict sequence:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

`ROLE_ADMITTED` is the activation-only receipt and is not `complete`. `OBJECTIVE_ADMITTED`
proves only that the four explicit intake fields were admitted; it does not prove preflight,
dispatch, verification, or cleanup. A phase may advance only after its required evidence is
recorded. Never infer a phase from a current directory, dirty path, Herdr status, or conversation
history.

## State rules

- `complete`: every requested item is fixed or withdrawn with evidence, all required gates are
  live/gated, no required check is an unexplained skip, no unowned/colliding drift exists, user
  work is preserved, and every created resource is retired. A requested unit that is still
  running, blocked, or unknown makes the receipt `incomplete` or `blocked`, even when its
  resource is deliberately preserved.
- `incomplete`: work remains or a required verification is skipped/failed, but no safety boundary
  is violated.
- `blocked`: an approval/question, missing dependency, CLI mismatch, resource failure, or
  collision prevents safe continuation. Name the blocker and preserve the relevant resource.

A Herdr `done` or `idle` status never changes receipt state by itself. A `skip` entry never
counts as a pass. A missing result file, placeholder count, stale terminal-only output, unknown
agent state, unowned change, or unknown cleanup outcome forbids `complete`.

## Report format

The user-facing final report should cite:

1. the receipt path and state;
2. verified units and exact gate evidence;
3. resources retired and any work-in-progress resources deliberately preserved;
4. user-work baseline/drift result;
5. limitations or blockers, without pretending skipped checks ran.
