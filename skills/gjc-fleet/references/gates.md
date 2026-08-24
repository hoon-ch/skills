# Gates the orchestrator owns

Workers verify their own slice. The orchestrator owns everything that is global, expensive, or
capable of contradicting a worker's self-report.

## Why the build cannot be delegated

A worker added URL state to a route and reported a passing type-check. It was telling the truth
— and the production build was broken:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/monitoring"
Error occurred prerendering page "/monitoring"
```

Type-checking cannot see prerender-time bailouts. Every worker reported `pass`; the fleet was
red. Run the real build yourself after each wave, before releasing the next.

Route the regression back to the file's **owner**, with the log excerpt and a pointer to an
existing correct pattern in the same repo. Owner-routing preserves the partition; fixing it
yourself does not.

## Gate set

| Gate | Who | Notes |
| --- | --- | --- |
| type-check | worker + orchestrator | cheap, read-only, safe concurrently |
| production build | orchestrator only | the gate that catches what type-checks cannot |
| behavior/route smoke | orchestrator | script it; expectations drift as fixes land |
| project detectors | worker + orchestrator | run across the union of changed files |
| file-ownership audit | orchestrator | proves the partition held |
| drift vs baseline | orchestrator | catches edits nobody was assigned |

## Ownership audit

```bash
git status --porcelain -- src | sed 's/^...//' | while read -r f; do
  owners=$(grep -lF -- "- \`$f\`" orders/*-order.md 2>/dev/null \
    | xargs -n1 basename 2>/dev/null | sed 's/-order.md//' | tr '\n' ',')
  printf '  %-64s %s\n' "$f" "${owners:-UNOWNED}"
done
```

Two bugs this script had, both of which produced false alarms — fix them before trusting it:

- **Use `grep -F`.** Real paths contain `[groupId]`, which a regex reads as a character class,
  so the owning order never matches and the file reports as unowned.
- **Glob every order file.** A glob of `f*-order.md` silently skipped a later `ds-order.md` and
  reported that worker's own files as unauthorized.

Expect exactly one owner per changed file. Zero means unassigned work or an auditor bug. Two
means the partition is broken — unless the units were serialized.

Authorized new files legitimately have no owner. Record them so they stop showing up as noise.

## Smoke expectations drift

Hardcoded expectations rot as fixes land. A `/` route changed from 307 to 308 because a worker
correctly switched a temporary redirect to a permanent one; the stale expectation reported a
failure that was actually a fix. Script the smoke test, keep expectations in it, and update
them in the same commit as the behavior change.

After a route-structure change, also assert the new invariants the structure makes possible —
for example that a hierarchically inconsistent path 404s.

## Serving the built app

Verify against a server that reflects the change:

- A long-lived dev server keeps a **stale route manifest** across directory renames and will
  404 new routes that build fine. Restart it before believing a route regression.
- With `output: "standalone"`, `next start` does not serve. Run the generated server and copy
  the static assets next to it first:

```bash
cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/
(cd .next/standalone && PORT=<port> HOSTNAME=127.0.0.1 node server.js &)
```

Record that PID and kill that PID.

## Transient gate failures

A type-check reported exit 2 immediately after a dependency install, then exit 0 on a clean
re-run. Re-run a failing gate once in isolation before acting on it — but never treat a
reproducible failure as transient.

## Landing over user work

Before overwriting uncommitted work you did not create, prove containment rather than assuming
your branch supersedes it:

```bash
cmp -s <branch-version> <working-copy> && echo identical
diff <(git show <branch>:<file>) <file> | grep -c '^>'   # lines only in the working copy
```

For an evolved file, count the markers of the original work in both versions and compare line
counts; equal-or-higher counts plus a strict superset in size is real evidence of preservation.

Then stash with a descriptive message so recovery is possible, merge, and tell the user the
stash exists and why. Prove, preserve, disclose — in that order.

## Ledger

If the repository keeps a coordination ledger, append what was fixed, what was withdrawn, what
remains and why, and the traps discovered. Record the traps especially: "restart the dev server
after route-structure changes" is the kind of finding the next session pays for again otherwise.
