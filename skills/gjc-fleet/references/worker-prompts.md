# Worker assignment and compact result contract

Workers have no parent conversation context. Put the full task contract in external files and
send one line pointing to them. The orchestrator does not put source excerpts, terminal output,
patches, credentials, or logs in the dispatch.

## External files

| File | Purpose |
| --- | --- |
| `BRIEF.md` | target, objective, invariants, forbidden actions, budget ledger path |
| `<id>-order.md` | exact worker-owned files and bounded task |
| `<id>-result.md` | durable report written by the worker outside the product tree |
| `test-ledger.json` | claims before focused/revalidation/global test commands |

The worker may read product source needed for its assignment. The orchestrator may not. A worker
edits only its exact exclusive set; an out-of-scope dependency is reported rather than edited.

## Required worker clauses

Include all of these in the brief and order:

- modify only the exact `## Exclusive file set` paths;
- never commit, push, checkout, branch, stash, reset, restore, install dependencies, or stop a
  shared server;
- use existing repository commands and do not hide warnings or weaken a failing check;
- do not run a canary or product command as a launch probe;
- claim a test in `test-ledger.json` before running it; no blind retry and no repeated fingerprint;
- focused test budget is one; after an owner fix, one `owner_reverify` is allowed; the global gate
  is one delegated worker claim;
- keep full logs, patches, source excerpts, and long capability matrices in external artifacts;
- never place secrets in prompts, commands, reports, screenshots, or logs.

## Report shape

The worker writes a report with these sections:

```markdown
## Summary
One concise outcome, no more than 2 KiB.

## Findings
- severity-ranked finding with an evidence path and line/range

## Fixed
| severity | item | files | what changed |

## Withdrawn
| item | evidence |

## Out of scope
| item | file needed | why |

## Verification
| check | status | command or surface | evidence | limitation |
| --- | --- | --- | --- | --- |
| focused | live | existing focused command | exit code and external log path | |
| global | gated | delegated gate worker | pending/receipt path | not owned here |
```

Use only `live`, `gated`, or `skip` for verification. `skip` needs a concrete limitation and is
never a pass. End with one real machine line; key order is intentionally irrelevant and zero is
a valid count:

```text
FIX_DONE fixed=<n> withdrawn=<n> out_of_scope=<n> verification=<live|gated|skip> owned_paths=<n> reserved_preserved=true
```

The control plane invokes `scripts/receipt.mjs`. It receives only summary (<=2 KiB), top eight
findings, counts, verification statuses, report byte count, and one external SHA-256 digest.
It never loads the full report into its conversation context. The parser validates all six human
headings plus the machine line. A missing heading, missing count, malformed verification,
placeholder count, or missing report is unverified.

If the report is malformed, the same worker may receive exactly one report-only correction
request pointing to the existing report path. The correction may edit only that report and must
not rerun product work, tests, or the canary; it uses the separate
`reportCorrectionMaxAttempts: 1` budget.

## Analysis worker

For analysis-only objectives, assign one worker a bounded capability matrix. Ask it to inspect
only relevant source surfaces and record evidence paths in an external report. Return its compact
summary and top findings in natural language; do not expose the report JSON or terminal log.
