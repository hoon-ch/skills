---
name: herdr
description: "Control Herdr, a terminal multiplexer for coding agents. Use only when the user explicitly mentions Herdr or asks to use Herdr to inspect or control panes, tabs, workspaces, commands, or another agent. Do not use merely because a task could benefit from a background terminal, delegation, or parallel work. Requires HERDR_ENV=1."
---

# Herdr

Herdr organizes terminals into workspaces, tabs, and panes, recognizes coding agents running inside panes, and exposes the current session through the `herdr` CLI.

Before issuing any control command, verify that this agent is running inside a Herdr-managed pane:

```bash
test "${HERDR_ENV:-}" = 1
```

If the check fails, say that you are not running inside Herdr and stop. Do not inspect or control the focused Herdr session from outside Herdr.

When the check passes, the `herdr` binary in `PATH` talks to the current session. Use it to inspect neighboring work, create terminal layout, start agents and commands, read output, and wait for state changes.

## Quick Start

### Learn the current CLI

The installed binary is the authority for command syntax. Start with:

```bash
herdr --help
```

Then print the relevant command group by running the group without a subcommand:

```bash
herdr agent
herdr pane
herdr workspace
herdr tab
herdr worktree
herdr terminal
herdr notification
herdr integration
herdr session
```

Do not run bare `herdr` for discovery; it launches or attaches the TUI. Do not probe a mutating nested command by omitting arguments. Commands such as `herdr workspace create` are valid with defaults and will execute.

Most control commands return JSON. Read identifiers and state from those responses instead of predicting them.

### Understand layout, panes, and agents

Choose the primitive that matches the job:

- Workspace, tab, and pane topology organize terminal locations.
- Pane commands control raw terminals, shells, tests, servers, input, and output.
- Agent commands control the recognized coding agent currently occupying a pane.

A pane exists whether or not it contains an agent. `agent start` requires an existing available shell pane and never creates, splits, or moves layout. Use pane commands for ordinary processes. Use agent commands when Herdr must validate agent identity or interpret `idle`, `working`, `blocked`, `done`, and `unknown` lifecycle states.

Agent commands accept either a unique live agent name or the pane ID currently hosting that agent. They do not accept terminal IDs or bare agent-kind labels. Names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents. A name follows the current pane occupant and is cleared when that agent exits, is released, or is replaced.

`idle` means the agent is ready for input and its tab has been seen in the focused Herdr UI. `done` is the same underlying idle state after unseen background work finishes. Focusing the tab or targeting the pane or agent with a focus command marks it seen. CLI reads do not mark it seen. `blocked` means Herdr recognized an approval or question UI. `unknown` means an agent is present but Herdr cannot classify it confidently; it does not prove completion.

### Use IDs and caller context

Public IDs are opaque stable handles:

- workspace: `w1`
- tab: `w1:t1`
- pane: `w1:p1`

Closed tab and pane IDs are not reused. A pane moved into another workspace receives a new workspace-qualified pane ID. After `pane move`, continue with `.result.move_result.pane.pane_id` or the live agent name. The old value is reported as `.result.move_result.previous_pane_id`; only the moved process's inherited caller context keeps resolving that old ID, so do not use it as a general agent target.

Herdr injects the caller's context into each managed pane:

```bash
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
```

Prefer `--current` when a pane command should target the calling pane. Omitting a target may use the UI-focused pane, which can belong to the user or another client.

Discover live state with:

```bash
herdr workspace list
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
herdr pane current --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr agent list
```

Creation responses expose the IDs to use next. `workspace create` returns `.result.workspace`, `.result.tab`, and `.result.root_pane`. `tab create` returns `.result.tab` and `.result.root_pane`. `pane split` returns the new pane as `.result.pane`.

## Workflow

### Start and coordinate an agent

Default to a sibling pane in the current tab and the current working directory. Do not create a workspace, tab, worktree, or different cwd unless the user explicitly requests that topology or location.

Honor a direction requested by the user. Otherwise inspect the caller pane:

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
```

Split a wide pane to the right and a narrow or tall pane down. Avoid repeated same-direction splits that create unusably narrow columns or short rows. Keep the user's focus in the calling pane and explicitly preserve the caller's working directory:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Replace `right` with `down` when appropriate. Read the new pane ID from `.result.pane.pane_id`.

An available shell pane must be at its interactive prompt, with the shell itself in the foreground and no foreground command, editor, or agent running. Start a supported agent in that pane with a useful unique name:

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id>
```

Use the kind requested by the user. Run `herdr agent` to inspect the installed kind list and options. Pass native agent arguments only after `--`:

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id> -- <agent-args...>
```

`agent start` returns only after Herdr detects the expected agent in the same pane and considers it ready for interactive input. It defaults to a 30-second startup timeout.

Submit work through the agent surface:

```bash
herdr agent prompt reviewer "Review the current diff and report only actionable findings." --wait --timeout 120000
```

`agent prompt` atomically submits text and encoded Enter while honoring the pane's live bracketed-paste mode. For normal agent work, `--wait` is enough: it waits for the first settled `idle`, `done`, or `blocked` state. Do not repeat those defaults with `--until`.

A prompt sent from a non-working state must produce an observed lifecycle change within five seconds. Otherwise Herdr returns `agent_prompt_stalled` instead of waiting indefinitely. This wait tracks lifecycle state, not an individual turn; if the agent is already working, completion of the active turn may satisfy it.

Use `--until` only for a state-specific workflow, such as waiting for an already-running agent to request input:

```bash
herdr agent wait reviewer --until blocked --timeout 120000
```

Without `--until`, standalone `agent wait` uses the same settled-state defaults as `agent prompt --wait`.

Use logical keys for interactive agent UI controls:

```bash
herdr agent send-keys reviewer esc
herdr agent send-keys reviewer ctrl+c
```

Herdr validates all keys before writing any bytes. Read the result through the resolved agent:

```bash
herdr agent get reviewer
herdr agent read reviewer --source recent-unwrapped --lines 120
```

If a wait fails or returns `blocked`, inspect `agent get` and `agent read` before deciding what input to send. Use the pane surface only when raw terminal control is intentional.

### Run an ordinary command in another pane

Create a sibling pane with the same geometry rule, preserve the caller's working directory, and keep user focus unchanged:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Read the new pane ID from `.result.pane.pane_id`, then run and inspect the command:

```bash
herdr pane run <returned-pane-id> "just test"
herdr pane wait-output <returned-pane-id> --match "test result" --timeout 120000
herdr pane read <returned-pane-id> --source recent-unwrapped --lines 120
```

`pane run` atomically sends command text and Enter. `pane wait-output` searches the selected snapshot immediately, so output that already exists can match. Use `--match <text>` for a literal substring or `--regex <pattern>` for a Rust regular expression. Omitting `--timeout` allows an indefinite wait.

Use the read source that matches the task:

- `visible`: the currently rendered viewport.
- `recent`: recent rendered output, including soft wraps.
- `recent-unwrapped`: recent output with soft wraps joined; prefer it for logs and transcripts.
- `detection`: the plain-text bottom-buffer snapshot used for agent detection.

Use `--format ansi` when colors and terminal styling are evidence. Otherwise use text.

### Start a GJC agent in a dedicated worktree workspace

Use this only when the user explicitly asks for a dedicated workspace backed by a Git worktree. Otherwise keep the default sibling-pane topology.

`herdr worktree create` creates the branch checkout, the workspace, the tab, and the root pane in one call:

```bash
herdr worktree create --cwd "$PWD" --branch <branch> --base <ref> --label <label> --no-focus
```

`--cwd` selects the source checkout, not the destination. Pass `--path <absolute-path>` when the destination matters; otherwise Herdr picks it. Read `.result.workspace.workspace_id`, `.result.tab.tab_id`, `.result.root_pane.pane_id`, and the checkout path from `.result.root_pane.cwd` or `herdr workspace get <workspace-id>` → `.result.workspace.worktree.checkout_path`. Never derive the path from the branch or label.

Verify against Git before starting anything, using the returned path:

```bash
git -C <checkout-path> rev-parse --show-toplevel --abbrev-ref HEAD HEAD
```

`herdr worktree list` is scoped to the session's own repository context and may report a different repository than your `cwd`. Trust `git worktree list --porcelain` and the returned checkout path instead.

Resolve the base commit before creation and compare it with the new checkout's `HEAD`. Do not start an agent on a mismatch.

#### Start GJC in the root pane

Run `herdr agent` and read the installed `kinds:` list. If it includes `gjc`, use `herdr agent start <name> --kind gjc --pane <root-pane-id>`. On builds where it does not, start GJC through the pane surface and poll for detection instead of assuming a single snapshot is enough:

```bash
herdr pane run <root-pane-id> "gjc"
herdr agent get <root-pane-id>   # poll until "agent":"gjc"; give it up to ~30s
```

Observed on the tested build (Herdr with no `gjc` kind): `agent get`, `agent read`, and `agent rename` all accept the pane ID and succeed, and `agent get` reports `"agent":"gjc"` with an `agent_status`. But GJC carries no detected agent label, so lifecycle-dependent commands degrade:

- `agent explain <pane-id>` → `agent_explain_unavailable`
- `agent wait <pane-id> --until idle` → `timeout`, not a state
- `agent prompt <name>` after a successful `agent rename` → `agent_not_ready: not an active named agent`

Pane-targeted `agent prompt` was not tested. Try `herdr agent prompt <root-pane-id> "$TASK"` once; it is the better surface when it works. Only if that exact call fails, and pane output confirms nothing was submitted, fall back to raw pane input:

```bash
herdr pane send-text <root-pane-id> "$TASK"
herdr pane send-keys <root-pane-id> enter
herdr pane read <root-pane-id> --source recent-unwrapped --lines 40
```

Pass the prompt through an environment variable rather than inline quoting, and require `TASK` to be nonempty and free of CR/LF before sending — the verified fallback used a single-line value plus a separate Enter, so keep submission explicit and use ` / `, `(1)`, or `[section]` markers instead of line breaks. Submit exactly once, then confirm from pane output that the expected objective or workflow indicator appeared. If the read is inconclusive, inspect before retrying; never resend blindly. `agent wait` will not settle this, and `agent rename` buys nothing here — keep the pane ID as the authoritative target.

#### Write the handoff

The new agent has no memory of the current conversation. Include the objective, source repository, returned checkout path, branch, resolved base commit, completed work and current status, unresolved decisions, relevant files and constraints, the exact next action, required verification, and whether it may only inspect and plan or may also mutate and execute. Add a skill invocation such as `/skill:ralplan --deliberate` only when the user requested or already authorized that workflow. Add file:line evidence and explicit out-of-scope items only when they actually exist.

#### Ownership

Record the returned workspace ID as a resource this procedure created. Leave a continuation workspace running by default. When the user asks for cleanup, check the worktree for uncommitted changes, stop only the GJC process started here, then `herdr worktree remove --workspace <workspace-id>` without `--force`; report a refusal instead of escalating. Confirm with `git worktree list --porcelain`. Deleting the branch is a separate destructive action requiring explicit intent.

## Failure Fallback

### A completed response will not come out of `pane read`

`--lines` asks Herdr for more rows from the pane's available screen and host scrollback. If increasing it does not reveal more of a completed response, the pane is probably running the agent on the terminal's alternate screen. Rows that leave the alternate screen do not enter Herdr's host scrollback, so a larger line count cannot recover them.

After that failed read, ask the agent to write its complete response as Markdown in a temporary directory and reply only with the file path, then read the file directly. Use this only as a fallback; do not request file output in the initial prompt.

### The agent surface refuses the target

`agent prompt`, `agent wait`, and `agent explain` depend on a detected agent label and lifecycle state. When they return `agent_not_ready`, `agent_explain_unavailable`, or `timeout`, the process may still be alive and usable. Confirm with `agent get` and `pane read` before concluding anything, then drop to `pane send-text` plus a separate `pane send-keys <target> enter`. Submit once and verify from pane output rather than resending.

### `agent prompt --wait` returns `agent_prompt_stalled`

The prompt produced no observed lifecycle change within five seconds. Do not resend. Inspect with `agent get` and `agent read`, then decide whether the text landed.

### Reading CLI failures

CLI server errors are JSON on stderr with exit status 1. CLI syntax errors exit with status 2. Read the `error.code` rather than matching on the message text.

## Examples

Run a test suite beside the current pane without stealing focus:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr pane run w1:p2 "pnpm test"
herdr pane wait-output w1:p2 --regex "([0-9]+ passed|FAIL)" --timeout 180000
herdr pane read w1:p2 --source recent-unwrapped --lines 120
```

Start a reviewer agent in a sibling pane and collect findings:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start reviewer --kind codex --pane w1:p3
herdr agent prompt reviewer "Review the staged diff and report only actionable findings." --wait --timeout 120000
herdr agent read reviewer --source recent-unwrapped --lines 200
```

Hand a planning task to GJC in its own worktree workspace:

```bash
herdr worktree create --cwd "$PWD" --branch camera-status-field --base main --label camera-status-field --no-focus
git -C /Users/me/.herdr/worktrees/repo/camera-status-field rev-parse --abbrev-ref HEAD HEAD
herdr pane run w34:p1 "gjc"
herdr agent get w34:p1
TASK='/skill:ralplan --deliberate <one-line self-contained handoff>' \
  herdr pane send-text w34:p1 "$TASK"
herdr pane send-keys w34:p1 enter
herdr pane read w34:p1 --source recent-unwrapped --lines 40
```

## Safety and coordination rules

- Use `--no-focus` for background work unless the user asked to switch context.
- Use `--current`, an explicit pane ID, or a unique agent name. Do not rely on another client's focused pane.
- Parse IDs from JSON responses. Do not derive them from sidebar order or examples.
- Do not close workspaces, tabs, panes, or sessions you did not create unless the user explicitly asked.
- Never run `herdr server stop` from an active session unless the user explicitly intends to stop the server and its pane processes.
- Never kill the main Herdr process. Use named test sessions for experiments that need an isolated server.
- CLI server errors are JSON on stderr with exit status 1. CLI syntax errors exit with status 2.
