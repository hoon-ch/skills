# Fleet receipt

Every fleet run ends with one durable receipt outside product files. The receipt is an internal
boundary between observed evidence and worker claims. It is not a user-facing intake form and
must never be pasted into the normal conversation.

## Admission receipt

The exact `/skill:gjc-fleet` activation with no objective produces one internal
`ROLE_ADMITTED` receipt and waits. It contains no target, repository inventory, Git baseline,
dirty-path list, acceptance proposal, Herdr ID, worker result, or command/resource evidence.
The user sees only a short natural-language invitation to state the goal.

When the user states an objective in ordinary language, the orchestrator produces an internal
`OBJECTIVE_ADMITTED` receipt. The receipt records:

- the normalized objective and its conversation source;
- the explicit target reference or the verified session-cwd resolution;
- read-only inventory evidence and reserved dirty paths;
- acceptance criteria derived from the user objective and inventory;
- a proposed boundary derived from the inventory, with `preserve_existing: true` and no automatic
  dirty assignment;
- read-only analysis authorization;
- a pending mutation gate with no mutation authorization.

The user does not provide or approve these fields as JSON. The orchestrator may ask one natural
question only when the unresolved answer materially affects the outcome.

## Internal minimum shape

The actual serialization may add evidence, but it must preserve the following concepts:

```json
{
  "schema": "gjc-fleet-intake/v2",
  "phase": "OBJECTIVE_ADMITTED",
  "state": "ready",
  "objective": "ordinary-language outcome",
  "target_repo": "/absolute/verified/repository/root",
  "target_resolution": {
    "kind": "current_workspace",
    "verified": true,
    "repo_root": "/absolute/verified/repository/root"
  },
  "inventory": {
    "read_only": true,
    "status": "ready",
    "dirty_paths": ["user-owned/path"]
  },
  "acceptance_criteria_source": "orchestrator-derived",
  "mutation_boundary_source": "orchestrator-derived",
  "read_only_analysis": {
    "admitted": true,
    "mutation_approval_required": false
  },
  "mutation_authorized": false,
  "mutation_gate": {
    "status": "pending",
    "evaluated": false
  },
  "user_work": {
    "status": "reserved",
    "assigned_paths": []
  }
}
```

This example is implementation guidance for the orchestrator, not a prompt for the user.
`commands_executed` and `mutation_commands_executed` must remain empty during intake; read-only
inventory commands are recorded separately as evidence. `resources_created` must remain empty.

## Final receipt shape

The final receipt is a `gjc-fleet-receipt/v1` artifact. It must preserve:

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
  "objective": {
    "text": "observed ordinary-language objective",
    "source": "conversation"
  },
  "target": {
    "requested_cwd": "/absolute/path",
    "repo_root": "/absolute/path",
    "resolved_cwd_verified": true
  },
  "intake": {
    "acceptance_criteria": ["derived criterion"],
    "boundary": {
      "allow": ["relative/path/**"],
      "deny": [".git/**"],
      "preserve_existing": true
    },
    "dirty_paths_reserved": ["user-owned/path"],
    "mutation_gate": {
      "status": "passed|blocked|not_required",
      "dirty_overlap": [],
      "material_ambiguities": []
    }
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
    "reserved_paths": ["user-owned/path"],
    "unowned_drift": [],
    "preserved": true
  },
  "limitations": []
}
```

Redact secret values; paths, model names, statuses, exit codes, and artifact URIs are not secrets
by default but still need normal access controls.

## Lifecycle phases

Receipts must identify the current phase from this strict sequence:

```text
DORMANT -> ROLE_ADMITTED -> OBJECTIVE_ADMITTED -> PREFLIGHTED -> DISPATCHING
         -> TRACKING -> VERIFYING -> RECEIPT
```

`ROLE_ADMITTED` is activation-only and is not `complete`. `OBJECTIVE_ADMITTED` proves target
verification, read-only inventory, derived contract evidence, and analysis authorization; it does
not prove preflight, dispatch, mutation-gate passage, verification, or cleanup. A phase may
advance only after its required evidence is recorded. Never infer a phase from a current
directory, dirty path, Herdr status, or conversation history.

## State rules

- `complete`: every requested item is fixed or withdrawn with evidence, all required gates are
  live/gated, no required check is an unexplained skip, no unowned/colliding drift exists, user
  work is preserved, and every created resource is retired. A requested unit that is still
  running, blocked, or unknown makes the receipt `incomplete` or `blocked`, even when its
  resource is deliberately preserved.
- `incomplete`: work remains or a required verification is skipped/failed, but no safety boundary
  is violated.
- `blocked`: a material ambiguity, dirty overlap, approval/question, missing dependency, CLI
  mismatch, resource failure, or collision prevents safe continuation. Name the blocker and
  preserve the relevant resource.
- `not_required`: read-only analysis did not need the mutation gate. It is not evidence that a
  mutation was authorized.

A Herdr `done` or `idle` status never changes receipt state by itself. A `skip` entry never
counts as a pass. A missing result file, placeholder count, stale terminal-only output, unknown
agent state, unowned change, or unknown cleanup outcome forbids `complete`.

## Report format

The user-facing final report should cite:

1. the receipt path and state;
2. the verified objective, target, and analysis/mutation-gate outcome;
3. verified units and exact gate evidence;
4. resources retired and any work-in-progress resources deliberately preserved;
5. user-work baseline, reserved paths, and drift result;
6. limitations or blockers, without pretending skipped checks ran.
