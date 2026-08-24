# Controlling GJC panes from Herdr

Observed against Herdr 0.8.2 and GJC 0.15.0.

## GJC is not a recognized agent kind

`herdr agent` lists the kinds Herdr can detect. On the tested build:

```
kinds: pi|claude|codex|gemini|cursor|devin|agy|cline|omp|mastracode|opencode|copilot|
       kimi|kiro|droid|amp|grok|hermes|kilo|qodercli|qwen|maki
```

No `gjc`. So `herdr agent start <name> --kind gjc --pane <id>` is impossible, and the
lifecycle-dependent commands degrade:

| Command | Against a GJC pane |
| --- | --- |
| `agent get <pane>` | works — reports `"agent":"gjc"` and an `agent_status` |
| `agent read <pane>` | works, but see the alternate-screen problem below |
| `agent prompt <pane>` | fails: `agent_not_ready: not an active named agent` |
| `agent wait <pane> --until idle` | `timeout`, never a state |
| `agent explain <pane>` | `agent_explain_unavailable` |
| `agent rename <pane> <name>` | succeeds but buys nothing; prompt still refuses |

Keep the **pane ID** as the authoritative target for the whole fleet's lifetime.

## Start and submit

```bash
herdr pane run <pane> "gjc --mpreset <preset>"
# poll for detection; allow ~30s
for i in $(seq 1 30); do
  ok=$( { herdr agent get "<pane>" 2>/dev/null || true; } \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{console.log(JSON.parse(s).result.agent.agent||"")}catch(e){console.log("")}})' || true)
  if [ "$ok" = "gjc" ]; then break; fi
  sleep 2
done

TASK='<single line, no CR/LF>'
herdr pane send-text <pane> "$TASK"
sleep 2
herdr pane send-keys <pane> enter
```

Pass the prompt through a variable, not inline quoting. Keep it a single line and use ` / `,
`(1)`, or `[section]` as separators — a newline in the payload submits early and splits the
assignment across two turns.

Submitting long text can leave the composer holding the text without submitting. Confirm from
pane output that the turn started before assuming it landed; if the composer still shows your
text, send `enter` again rather than resending the text.

## Liveness signals

`agent_status` is unreliable here — GJC panes report `done` while actively working, because
Herdr attaches no agent label and cannot interpret the lifecycle. Two signals in the pane
snapshot are reliable, and **which one appears depends on queue state**, so accept either:

- `⟦esc⟧` on the spinner activity line — a turn is running and accepts steering
- `(busy)` in the input hint (`⌥Q: Queue (busy)`) — a turn is running and queueing is blocked

```bash
snap=$( { herdr pane read "$pane" --source detection --lines 40 2>/dev/null || true; } )
printf '%s' "$snap" | grep -qE '⟦esc⟧|\(busy\)' && echo WORK || echo IDLE
```

Checking only one of the two produced wrong readings in both directions: `(busy)`-only marked
finished workers as running, `⟦esc⟧`-only marked running workers as idle.

## The alternate-screen problem

GJC renders on the terminal's alternate screen. Rows that scroll off never enter Herdr's host
scrollback, so raising `--lines` cannot recover them, and the `detection` buffer can freeze at
activity from many minutes earlier while the session works normally.

Consequences:

- Never conclude "stalled" from a stale buffer. Cross-check with a running marker and with
  files on disk.
- To retrieve a complete response, have the worker write Markdown to a path and read the file.
  Do not request file output in the initial prompt; use it when a read actually fails.

## Progress that cannot lie

The only trustworthy progress metric is **files changed inside the worker's owned set**:

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const owned=[...fs.readFileSync(process.argv[1],"utf8")
  .matchAll(/^- `(.+?)`$/gm)].map(m=>m[1]);
const dirty=cp.execSync("git status --porcelain",{encoding:"utf8"})
  .split("\n").map(l=>l.slice(3).trim()).filter(Boolean);
console.log(owned.filter(f=>dirty.includes(f)).length+"/"+owned.length);
' <order-file>
```

`0/N` after 30 minutes of `WORK` means an analysis loop. Restart, do not steer.

## Stopping a session

```bash
herdr pane send-keys <pane> ctrl+c   # twice, with a pause
herdr pane send-text <pane> "/exit"
herdr pane send-keys <pane> enter
herdr agent get <pane>               # expect no agent: back at a shell prompt
```

The pane survives, so it can be reused for a fresh session — which is the fastest recovery
for a wedged worker.

## Process hygiene

Record the PID of anything you start and kill that PID. Pattern kills such as
`pkill -f 'standalone.*server.js'` match processes belonging to panes and workspaces you did
not create, and Herdr keeps no log that would let you prove what died. Stop only what you
started.

## Bounded waiting

Do not block on long `sleep` calls to wait for workers; a silent multi-minute sleep is
indistinguishable from a hang. Poll on a bounded interval and make each poll emit the fleet
table, so every wait produces evidence.
