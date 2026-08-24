# Compact fleet receipt

Every run leaves one external receipt. It is an internal evidence boundary, not a user-facing
intake form. The serialized receipt is at most 16 KiB. Verbose reports, NUL-safe Git streams,
logs, patches, and screenshots remain external artifacts referenced by byte count and digest.

## Intake receipt

`/skill:gjc-fleet` with no objective returns only role admission. With an objective,
`scripts/intake.mjs` writes `gjc-fleet-intake/v3` and records:

- normalized objective, verified target root, and control-plane/worker-only declaration;
- read-only metadata counts and bounded samples;
- external NUL-safe path/status artifact digests;
- derived acceptance criteria and proposed boundary;
- reserved dirty count/sample/artifact, reservation mode, assigned count zero;
- empty product/mutation command lists and empty resource list;
- pending mutation gate.

It never embeds product file content, binary patches, a full path list, a per-file hash list, full
Git status, or full environment. If the input or serialized object exceeds its cap, it returns a
blocked compact receipt instead of an oversized object.

Conceptual shape:

```json
{
  "schema": "gjc-fleet-intake/v3",
  "phase": "OBJECTIVE_ADMITTED",
  "state": "ready",
  "control_plane": true,
  "product_access": "worker-only",
  "target_repo": "/absolute/verified/repository/root",
  "inventory": {
    "read_only": true,
    "status": "ready",
    "path_count": 21521,
    "dirty_count": 21353,
    "dirty_sample": ["bounded/path"],
    "artifacts": {"dirty": {"path": "/tmp/run/dirty-status.nul", "bytes": 10, "sha256": "..."}}
  },
  "mutation_authorized": false,
  "mutation_gate": {"status": "pending", "evaluated": false},
  "user_work": {
    "status": "reserved",
    "reserved_count": 21353,
    "assigned_count": 0,
    "dirty_reservation_mode": "preserve_no_touch|preserve_and_continue"
  }
}
```

The numbers above illustrate counts from the prior incident; they are not a path payload.

## Worker compact parser

`scripts/receipt.mjs` reads an external worker report and returns only:

- report path, byte count, and one SHA-256 digest;
- summary at most 2 KiB;
- top eight findings and an omitted count plus the external report pointer;
- fixed/withdrawn/out-of-scope counts, verification, owned-path, and baseline-preservation
  machine fields;
- human-heading validation errors when malformed;
- at most eight verification rows with bounded statuses/evidence references.

It never returns the report body. A large report may be hashed and parsed, but its log/source
content cannot enter the orchestrator context. A malformed report gets one separate report-only
correction claim on the same worker; it never consumes the test or canary budgets.

## Final receipt shape

The final artifact uses `gjc-fleet-receipt/v2` and stays compact:

```json
{
  "schema": "gjc-fleet-receipt/v2",
  "phase": "RECEIPT",
  "state": "complete|incomplete|blocked|blocked-awaiting-user",
  "run_id": "opaque-run-id",
  "objective": {"text": "bounded objective", "source": "conversation"},
  "target": {"repo_root": "/absolute/path", "resolved_cwd_verified": true},
  "budgets": {"receipt_bytes": 16384, "summary_bytes": 2048},
  "canary": {"status": "passed|skipped|failed", "artifact": {"path": "...", "bytes": 120, "sha256": "..."},
             "failure_class": "script_plumbing|worker_failure|null"},
  "units": [
    {"id": "f1", "lifecycle": "retired|running|blocked|unknown", "owned_count": 2,
     "result": {"path": "...", "bytes": 100, "sha256": "..."},
     "summary": "<=2 KiB", "fixed": 1, "withdrawn": 0, "out_of_scope": 0,
     "verification": [{"check": "focused", "status": "live"}]}
  ],
  "tests": {"ledger": {"path": "...", "sha256": "..."}, "attempts": 2},
  "dirty": {
    "reserved_count": 1,
    "mode": "preserve_no_touch|preserve_and_continue",
    "sample": ["..."],
    "artifact": {"path": "..."},
    "adopted_count": 0,
    "unauthorized_overlap_count": 0
  },
  "resources": {
    "created_count": 1,
    "retired_count": 1,
    "preserved_count": 0,
    "unowned_drift_count": 0,
    "runtime_state": {"status": "fleet_created|pre_existing_preserved|unowned_drift"}
  },
  "limitations": ["bounded limitation"]
}
```

`complete` requires all requested outcomes and required gates, no unauthorized overlap or
unowned drift, preserved user work, a post-diff adoption proof when applicable, and retired
resources. A missing report, failed/unknown gate, skipped required check, repeated test, second
canary, or unknown cleanup makes the state incomplete or blocked. An ambiguous dirty mode is
`blocked-awaiting-user` with one choice question, not an incomplete implementation. The
user-facing report mentions the receipt path, result, and limitations in natural language
without printing this JSON.
