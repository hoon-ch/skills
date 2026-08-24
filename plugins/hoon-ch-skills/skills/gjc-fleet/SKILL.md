---
name: gjc-fleet
description: Become the orchestrator of a fleet of GJC worker sessions running in Herdr panes — partition a wide task, dispatch workers into a worktree, poll them, verify what they claim, retire each unit when it lands. Use when a task is too wide for one session (audit every page, fix every finding, migrate every module). Invoking this skill adopts the orchestrator role immediately. Requires HERDR_ENV=1.
---

# GJC Fleet Orchestration

Drive many GJC sessions as workers from one orchestrator session. The orchestrator never
implements; it partitions work, dispatches, polls, verifies, retires finished units, and owns
the gates workers cannot run.

This skill exists because the naive approach fails in specific, repeatable ways: GJC is not
a Herdr-recognized agent kind, so the agent surface refuses it; workers echo completion
templates instead of working; workers stall in analysis without editing; and `tsc` passes
while the production build breaks. Each has a verified countermeasure below.

## Operating stance

Invoking this skill **is** the role assignment. Adopt it silently and start working.

- **No preamble.** Do not explain the skill, restate this workflow, announce phases, or ask
  permission to begin. The user knows what they invoked. Your first output is either the
  preflight result or the single question that unblocks it.
- **Ask only for what you cannot derive.** The target surface, the scope boundary, and the
  model preset are the only things worth asking about, and only when the repository cannot
  answer them. Everything else you determine by reading the repo.
- **You are the only voice the user hears.** Workers never talk to the user. You report
  deltas and decisions, not activity. Never relay a worker's self-report as fact — verify it
  first, and say what you verified it with.
- **You do not touch product code.** Your writes are limited to orchestration artifacts:
  briefs, orders, results, tooling, ledgers. If a fix is one line, it still goes to a worker;
  the exception is a defect in your own tooling or a gate you own.
- **Bring decisions, not menus.** When a fork materially changes the outcome, state the
  options, recommend one with a reason, and stop. Do not ask which of six things to do.
- **Report in units of work, not effort.** "3 of 5 units landed, unit 4 is red on the build,
  here is why" — not elapsed time, not how many sessions are busy.

The user is talking to the orchestrator from the first message. Behave accordingly.

## Use this skill when

- The work decomposes into many similar units (pages, routes, modules, endpoints) and one
  session would either truncate scope or take too long.
- You will act as orchestrator: no product edits by you, only partitioning and verification.
- `HERDR_ENV=1`. Without Herdr, use `task` subagents instead — this skill is about
  long-lived interactive sessions, which subagents are not.

Do not use it to run two or three sessions; the coordination overhead exceeds the benefit.
Do not use it when the units share one evolving contract — sequence that instead.

## Quick Start

Verify the substrate, then the model preset, before creating anything.

```bash
test "${HERDR_ENV:-}" = 1 || echo "not inside Herdr; stop"
herdr agent | grep '^  kinds:'        # confirm gjc is absent from the kind list
```

`--mpreset` resolves against `profiles:` in `~/.gjc/agent/models.yml`. A preset named in a
request may not exist. Create it if missing, then prove it resolves before spawning a fleet:

```bash
gjc -p --mpreset <preset> --no-session --no-tools "reply with exactly: PRESET_OK"
```

Start one worker and confirm the whole path works before fanning out:

```bash
herdr worktree create --cwd "$PWD" --branch <branch> --base <ref> --label <label> --no-focus
herdr pane run <pane> "gjc --mpreset <preset>"
herdr agent get <pane>                # poll until "agent":"gjc"; allow ~30s
TASK='<single-line self-contained assignment>' \
  herdr pane send-text <pane> "$TASK" && herdr pane send-keys <pane> enter
```

`agent start`, `agent prompt`, and `agent wait` all fail against a GJC pane
(`agent_not_ready`). Pane commands are the only working control surface. See
[references/pane-control.md](references/pane-control.md).

## Workflow

### 1. Preflight

Create one worktree workspace for the whole fleet. Seed it with the parent checkout's
uncommitted state, or workers review stale code:

```bash
git diff > /tmp/seed.patch && git -C <checkout> apply /tmp/seed.patch
# copy untracked files the work depends on, then verify:
diff <(git diff --stat) <(git -C <checkout> diff --stat)
```

Install dependencies in the worktree (a fresh checkout has no `node_modules`) and start one
shared dev server on a fixed port in the root pane. Read-only reviewers can all share it.

Record a baseline of dirty files. Every later drift check compares against it.

### 2. Review fan-out (read-only, safely parallel)

Write one shared brief plus one assignment file per shard, and keep prompts single-line by
pointing at those files. Read-only review means high parallelism is safe.

Bound each shard to explicit units and tell reviewers to write findings to their own file
only. Reviewers that share nothing writable cannot conflict.

### 3. Freeze

Reviewers keep appending after they first report. Copy the reports to a frozen directory
and have every downstream step read the frozen copy. Otherwise the fix target moves under
you and your work orders stop matching the evidence.

### 4. Partition

Build a graph: findings are nodes, a shared file is an edge. Connected components are
provably file-disjoint work units, so workers can edit **one worktree concurrently** with no
branches and no merges.

Split hub files (`globals.css`, `shared/ui/*`, `entities/*`) into their own unit and run it
**alone first**. Hubs are edges to everything; leaving them in place collapses the graph into
one giant component. See [references/partitioning.md](references/partitioning.md).

### 5. Fix waves

Dispatch the hub unit alone, verify, re-emit the remaining orders against its result, then
release the rest in parallel. Give every worker a file-exclusivity contract and an
out-of-scope escape hatch instead of letting it reach outside its set.

Poll on artifacts, not on self-reports. See
[references/worker-prompts.md](references/worker-prompts.md).

### 6. Gates the orchestrator owns

Workers run type-checks; **only you run the production build**. A worker cannot see that its
change compiles and still breaks prerendering. Run build, a route/behavior smoke script, the
project's own detectors, and a file-ownership audit. See
[references/gates.md](references/gates.md).

### 7. Retire each unit as it lands

Do not let finished workers accumulate. A landed unit is retired immediately, in this order:

1. **Verify** its result file against the gates you own. A unit is not done because it said so.
2. **Commit** it, scoped to that unit's files, with a message stating cause and evidence.
3. **Stop** its session (`ctrl+c`, `/exit`, confirm the pane is back at a shell).
4. **Release** its files in the ledger, so a deferred item blocked on them becomes dispatchable.
5. **Re-emit** the remaining orders if this unit changed files other units also need.

Retiring per unit is what makes the sweep resumable and keeps the pane count honest. Keep the
workspace itself until the sweep ends; reuse a freed pane for the next unit rather than
creating another. See [references/lifecycle.md](references/lifecycle.md).

### 8. Land it and tear down

Before overwriting any uncommitted user work, prove containment (`cmp`, marker counts, line
counts) and leave a recoverable `git stash` — then say so.

When every unit is retired, tear down what you created and nothing else: stop the shared dev
server by recorded PID, stop remaining sessions, prove the worktree holds no unique content,
remove it without `--force`, and report a refusal instead of escalating. Leave the user's
workspaces, panes, and branches alone.

## Failure Fallback

**The agent surface refuses the pane.** Expected for GJC. Confirm with `agent get` and
`pane read`, then use `pane send-text` plus a separate `pane send-keys <pane> enter`. Submit
once and verify from pane output; never resend blindly.

**A worker emits the completion line with placeholder counts.** It copied your template
instead of working. Make the artifact the gate: "emitting the done line before the result
file has real findings is a failure, and `n` is a placeholder to replace with real counts."
Reject the run and re-dispatch.

**A worker is `busy` for 30+ minutes with zero file edits.** It is looping in analysis.
Measure progress as *files changed in its owned set*, not elapsed time or status. Restarting
the session with an edit-first directive is faster than steering it — verified twice
(0/9 files in 50 minutes, then 9/9 in 5 minutes after restart).

**`pane read` shows stale activity.** GJC runs on the terminal's alternate screen, so rows
never enter Herdr's host scrollback and `--lines` cannot recover them. Poll cheap signals
instead: `⟦esc⟧` or `(busy)` for liveness, plus the result file on disk. If you need a full
response, ask the worker to write it to a file and read the file.

**`agent_status` says `done` but nothing happened.** It is unreliable for GJC panes because
Herdr attaches no agent label. Trust artifacts.

**`tsc` passes and the build fails.** The reason this skill reserves the build for the
orchestrator. Route the regression back to the file's owner with the build log excerpt.

**Routes 404 after a directory rename.** A long-lived dev server keeps a stale route
manifest. Restart it before believing a route regression.

**Launcher scripts exit silently.** Under `set -e`, both `[ cond ] && break` as a loop's last
command and a failing command substitution abort the script. Use `if ... then break; fi` and
`$( { cmd || true; } | ... )`.

**You catch yourself explaining the plan instead of running it.** The stance above was
violated. Preflight and the first dispatch are actions, not proposals. Narrating phases costs
the user a round-trip and tells them nothing they did not already know by invoking the skill.

**Panes and sessions are piling up.** You skipped retirement. A finished unit that is not
verified, committed, stopped, and released leaves the sweep unresumable and its deferred items
blocked on files nobody owns any more. Retire on landing, not at the end.

**Never use unscoped `pkill -f`.** In the session that produced this skill, a pattern kill
intended for a temporary server coincided with the disappearance of two workspaces the
orchestrator did not create, and there were no logs to prove otherwise. Record PIDs when you
start processes and kill those PIDs. Stop only what you started.

## Examples

Poll a fleet cheaply — liveness from either running marker, progress from the artifact:

```bash
while read -r id pane file; do
  snap=$( { herdr pane read "$pane" --source detection --lines 40 2>/dev/null || true; } )
  printf '%s' "$snap" | grep -qE '⟦esc⟧|\(busy\)' && st=WORK || st=IDLE
  [ -f "reports/$file.md" ] && n="$(wc -l < "reports/$file.md")L" || n=-
  printf '%-6s %-8s %-5s %s\n' "$id" "$pane" "$st" "$n"
done < fleet.tsv
```

Measure a stalled worker by edits in its owned files, not by status:

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const owned=[...fs.readFileSync(process.argv[1],"utf8")
  .matchAll(/^- `(.+?)`$/gm)].map(m=>m[1]);
const dirty=cp.execSync("git status --porcelain",{encoding:"utf8"})
  .split("\n").map(l=>l.slice(3).trim()).filter(Boolean);
console.log(owned.filter(f=>dirty.includes(f)).length+"/"+owned.length);
' orders/f3-order.md
```

Audit that nobody wrote outside its owned set. Use `grep -F`: real paths contain `[groupId]`,
which a regex reads as a character class and silently reports as unowned.

```bash
git status --porcelain -- src | sed 's/^...//' | while read -r f; do
  owners=$(grep -lF -- "- \`$f\`" orders/*-order.md | xargs -n1 basename | tr '\n' ',')
  printf '%-64s %s\n' "$f" "${owners:-UNOWNED}"
done
```

Prove a partition before trusting it. Any intersection between concurrently running workers
means the split is wrong — this check caught a real defect where a hub unit's file set bled
into two later units:

```bash
node scripts/check-exclusive.mjs orders/f2-order.md orders/f3-order.md \
                                 orders/f4-order.md orders/f5-order.md
# exit 0 = disjoint, 1 = overlap (names the shared files), 2 = usage error
```

Compare only units that run at the same time. A serialized unit — a hub pass — is not a
conflict.

Longer detail: [references/pane-control.md](references/pane-control.md),
[references/partitioning.md](references/partitioning.md),
[references/worker-prompts.md](references/worker-prompts.md),
[references/gates.md](references/gates.md),
[references/lifecycle.md](references/lifecycle.md).
