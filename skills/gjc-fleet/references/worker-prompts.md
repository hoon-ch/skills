# Worker assignment and result contract

A worker has no conversation memory. Put the contract in files and keep the submitted prompt a
single line. Use one isolated result path per unit under the run directory, never a shared result
or product file.

## Files

| File | Rule |
| --- | --- |
| `BRIEF.md` | Shared invariants, target root, baseline policy, forbidden actions, evidence rules. |
| `<id>-order.md` | Exact assignment, frozen evidence, and `## Exclusive file set` paths. |
| `<id>-result.md` | Worker-owned durable result; it is the completion gate. |

The dispatch contains only paths and a short start instruction, for example:

```text
Read /tmp/gjc-fleet.abc/BRIEF.md and /tmp/gjc-fleet.abc/orders/f2-order.md. Execute the order now; write the required result to /tmp/gjc-fleet.abc/results/f2-result.md; do not report completion before the file is real.
```

Do not put credentials, full terminal transcripts, or secrets in any of these files. The target
root and result paths are explicit absolute paths; do not rely on the pane's inherited cwd.

## Non-negotiable worker clauses

Include these clauses in `BRIEF.md` and the order:

- Modify only the exact paths in `## Exclusive file set`. Reading other files is allowed.
- If a fix needs another file, do not edit it; record the item under `## Out of scope` with the
  blocking path and reason.
- Never skip an item silently. Classify it as fixed, withdrawn with evidence, or out of scope.
- Do not `git commit`, `git push`, `git checkout`, `git branch`, `git stash`, `git restore`,
  install dependencies, stop a shared server, or run a formatter that rewrites sibling files.
  The user decides how uncommitted work is landed.
- Work edit-first: take the highest-severity item, read only its evidence, make the smallest
  correct change, and verify it before moving on. Do not spend the whole turn planning.
- Use only the repository's existing commands and dependencies. Do not hide warnings or replace
  a failing gate with a weaker command.
- Never place a secret in a prompt, command argument, generated result, screenshot, or log.

The orchestrator owns production builds, project-wide lint, global smoke, ownership, baseline
and cleanup gates. Workers run only the explicitly assigned cheap checks.

## Evidence format

Every verification claim has a status and evidence. Require this table in the result:

```markdown
## Verification
| check | status | command or surface | evidence | limitation |
| --- | --- | --- | --- | --- |
| typecheck | live | `...` | exit 0, log path |  |
| production build | gated | orchestrator-owned | pending receipt | not run by worker |
| browser route | skip | `...` |  | browser unavailable |
```

Use statuses exactly:

- `live`: actually executed against the relevant local code, service, browser, or CLI;
- `gated`: intentionally owned by the orchestrator and recorded after the wave;
- `skip`: not executed; a concrete reason is mandatory and it is never a pass.

A command name without exit status, output path, assertion, or limitation is not evidence. A
worker may report an honest `skip`; the orchestrator must not translate it to `pass`.

## Completion gate

Require these sections in every result:

```markdown
## Fixed
| severity | item | files | what changed |

## Withdrawn
| item | evidence |

## Out of scope
| item | file needed | why |

## Verification
| check | status | command or surface | evidence | limitation |
```

The last line is machine-parseable and must contain actual counts:

```text
FIX_DONE <id> FIXED=<n> WITHDRAWN=<n> OUTOFSCOPE=<n> TYPECHECK=<pass|fail|skip>
```

The literal `n` is a placeholder, not a valid count. A done line without a non-empty result
file, real tables, changed-file evidence, and verification entries is a failed run regardless of
what the terminal says. Out-of-scope work is a handoff, not a successful fix for that item.

When terminal output is incomplete because of alternate-screen rendering, the result file and
owned-file diff remain the source of truth. Ask for a transcript file only as a later fallback;
do not mistake a stale pane snapshot for proof.
