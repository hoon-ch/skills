---
name: crabbox-proxmox
description: Use Crabbox Proxmox as a private isolated remote-dev substrate for GJC build/run/debug/browser-proof tasks, with a pre-baked warm template, quiet output discipline, and no repo-local config.
---

# Crabbox Proxmox Remote-Dev Skill

## Purpose

Use this when a user wants GJC to execute, verify, run, debug, or dogfood a task in an isolated VM that can also run adjacent infrastructure. Operational playbook, not a replacement for GJC's workflow gates.

## When to use

- User says Crabbox/크랩박스, or asks for isolated build/dev/debug/browser proof.
- Repo needs Docker Compose, databases, queues, or several dev servers at once.
- User wants local-browser verification against a remote dev server.

## Do not use

- Read-only explanation tasks.
- Vague work that still needs deep-interview/ralplan.
- Any task where remote Proxmox mutation has not been requested or approved.
- Anything requiring committed credentials or a repo-local `.crabbox.yaml`.

## Quick Start

```bash
cbx list --json                                   # inventory
cbx warmup --slug <name> --ttl 4h --idle-timeout 2h
cbx run --id <slug> -- <setup command>            # first run syncs the repo
cbx run --id <slug> --no-sync -- <smoke command>
cbx stop --id <slug>                              # mandatory cleanup
cbx list --json                                   # confirm the lease is gone
```

`cbx` is `~/.gjc/agent/scripts/cbx`; use it instead of bare `crabbox`. For `~/repos/cj2-ai-monitor-web`, skip the manual sequence and run `~/.gjc/agent/scripts/crabbox-cj2-warm.sh` from the checkout.

## Substrate (verified 2026-07-27)

- provider `proxmox`; host `ssh ax-dev-01`; API `https://ax-dev-01.orca-fir.ts.net:8006`; node `ax-dev-01`
- guest user `crabbox`; work root `/work/crabbox`; bridge `vmbr0`; template disk on `local-lvm`
- **template `9401` (`crabbox-ubuntu-2404-warm`)** — pre-baked: docker, node 22.23.1, pnpm 10.34.3, `psql`, the three compose images (`timescale/timescaledb-ha:pg18`, `valkey/valkey:9-alpine`, `quay.io/keycloak/keycloak:26.5.4`), and a 2.1 GB warm pnpm store. Defaults 4 cores / 8192 MB. `9400` is the bare fallback.
- **linked clones**: config carries `fullClone: false` and **no `storage` key** — Proxmox rejects `storage` for linked clones.
- Global config only: `~/Library/Application Support/crabbox/config.yaml`. Never print token secrets or private keys.

## Token discipline (mandatory)

Crabbox output, not the work, is usually the biggest token cost. Measured on 2026-07-27:

| Sink | Cost | Fix |
|---|---|---|
| per-invocation banner | 995 B for a one-line command | use `cbx` (below): 31 B |
| `crabbox <sub> --help` | 711 lines / 38 KB, all providers | never dump it; read this skill, or grep specific flags |
| `pnpm db:*` in the lease | 205 lines / 14 KB (tsup file listing) | `>/tmp/x.log 2>&1 \|\| { tail -20 /tmp/x.log; exit 1; }` |
| a failed `run` | ~40 lines, stdout tail repeated 3× | keep commands short; put complex shell in a guest-side script |
| inline base64 payloads | echoed back verbatim | `scp` the file once, reference the path |

Rules:
1. `~/.gjc/agent/scripts/cbx` replaces `crabbox`. Injects `--provider proxmox`, strips the banner on success, prints the **entire** untouched output including the failure digest on non-zero exit. `cbx --raw ...` streams unfiltered.
2. Silence at the source: `docker pull -q`, `apt-get -qq >/dev/null`, `curl -s`, logs to a guest file with `tail` only on failure.
3. Batch: one `run` costs a fixed banner regardless of payload. Group diagnostics as `echo ===A===; a; echo ===B===; b`.
4. Assert with status codes (`curl -o /dev/null -w '%{http_code}'`) and one-line JSON summaries, not raw bodies.
5. `psql -At -F'|'` with aggregates/LIMIT; `-x` only for single records.
6. Cache slug/IP/ports after the first lookup instead of re-running `list`.

## Fast path: cj2-ai-monitor-web

`~/.gjc/agent/scripts/crabbox-cj2-warm.sh [--slug NAME] [--fresh] [--skip-seed] [--down]`, run from the checkout.

Warm or reuse lease → sync → `pnpm install --frozen-lockfile` → write lease-local `.env.local` → `pnpm infra:up` → `db:migrate:deploy` → `db:seed:all` → build workspace deps → start api/web → wait for health. Prints web/api URLs and the teardown command.

Measured: **warmup 40 s**, `pnpm install` 9.6 s (warm store), `infra:up` 15.6 s, **cold lease → healthy web+api 3 m 17 s**. Ports: web `3300`, api `3001`. Auth disabled, `PDM_API_USE_MOCK=true` for DB-backed screens that still tolerate mock fallbacks.

`.env.local` is gitignored so it is **never synced**; the script generates it (compose defaults `postgres/postgres/postgres` on `127.0.0.1:5432`). Missing it fails as `DB connection requires DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`.

Workspace deps must be built before the api starts, otherwise `ERR_MODULE_NOT_FOUND @atg/nest-lens`. The script runs `pnpm --filter "@atg/pdm-api^..." --filter "@atg/pdm-web^..." build` (~14 s).

## Workflow

1. Read repo instructions first (`AGENTS.md`, `package.json`, `.env.example`, README).
2. `cbx list --json` for inventory. Skip `doctor` unless something is actually broken.
3. `cbx warmup --slug <name> --ttl 4h --idle-timeout 2h` (add `--timing-json` for a one-line result).
4. Record lease id, slug, IP, ports once.
5. First file-dependent command runs **without** `--no-sync`; afterwards `--no-sync` unless local files changed.
6. Prove behavior: CLI transcript, direct LAN browser at `http://<lease-ip>:<port>/`, or HTTP 200 via SSH tunnel.
7. Cleanup is mandatory: stop dev processes, repo-native teardown (`pnpm infra:down`), `cbx stop --id <slug>`, then confirm absence in `cbx list --json`.

### Proven repo paths

`~/repos/a-eyes-cloud`: install VM-local Docker/compose and the mise toolchain, then `pnpm install`, `mise run build`, `mise run test`, `mise run up`, `mise run dev`. Web `:3000`, API `:8080`. Tear down with `mise run down`, then `cbx stop`.

`~/repos/cj2-ai-monitor-web`: needs 8 GiB / 4 vCPU for a stable Next+Nest+Compose smoke. Use the fast-path script above; the manual equivalent is `pnpm install`, `pnpm infra:up`, `pnpm db:migrate:deploy`, `pnpm db:seed:all`, workspace-dep build, `pnpm dev:local`. Tear down with `pnpm infra:down`, then `cbx stop`.

## Failure Fallback

### Pitfalls (learned the hard way)

- **`warmup` ≠ sync.** After warmup the repo dir is empty; the first `run` without `--no-sync` is what rsyncs. Habitual `--no-sync` yields "No projects found".
- **Never reclaim another worktree's lease.** `run` refuses a lease `claimed by repo <other>`. Create your own; at cleanup stop only what you created.
- **machine-id collisions.** A template that ships a populated `/etc/machine-id` gives every clone the same DHCP lease — two leases silently share one IP and SSH hits the wrong box. `9401` blanks `/etc/machine-id` and sets netplan `dhcp-identifier: mac`; clones now get distinct IPs. Verify with `qm agent <vmid> network-get-interfaces` when anything looks aliased.
- **Proxmox API is not slow.** Authenticated calls are 11–45 ms. An unauthenticated probe always takes ~3.0 s because PVE penalizes auth failures — never read that as latency.
- **Full clones are expensive.** A 32 GiB full clone costs minutes and ~13.6 GiB per lease; `local-lvm` was already 74% full. Keep linked clones.
- **`configured 2222 not ready`** is a harmless instant fallback to port 22.
- **Guest agent works without networking**: `qm guest exec <vmid> -- /bin/sh -c '...'` from `ssh ax-dev-01`. Use it to fix a box whose network is down, or to prepare an image with `link_down=1`.
- **Service-level DB proofs**: reuse the repo's Jest e2e config rather than `ts-node`; only Jest's `moduleNameMapper` resolves workspace TS path aliases. Delete temp specs; never commit them.

## Re-baking the warm template

When the toolchain or compose images drift:
1. `qm clone 9400 94NN --full 1 --storage local-lvm`, `qm set 94NN --cores 4 --memory 8192 --net0 virtio,bridge=vmbr0,link_down=1`, `qm start 94NN`.
2. Via `qm guest exec`: blank `/etc/machine-id`, relink `/var/lib/dbus/machine-id`, add `dhcp-identifier: mac` to netplan. Then attach the network (`--net0 virtio,bridge=vmbr0`) and reboot so DHCP hands out a fresh IP.
3. Install toolchain, `docker pull -q` the images, `pnpm fetch` against the repo lockfile to warm the store.
4. Clean: remove scratch dirs, `apt-get clean`, `cloud-init clean --logs`, delete `/etc/ssh/ssh_host_*`, blank `/etc/machine-id`, remove injected `authorized_keys` and shell history.
5. `qm shutdown`, `qm template 94NN`, then point `templateId` at it.

## Evidence standard

Lease id/slug/IP, command summary with failures and fixes, direct LAN or tunnel proof, cleanup proof, explicit limitations. Redact all credentials.

## Examples

Bounded diagnostics in a single invocation, so one banner covers every check:

```bash
cbx run --id <slug> --no-sync -- 'echo ===PORTS===; ss -ltnp | grep -E ":(3000|3001|8080)"; echo ===HTTP===; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/'
```

Noisy command with failure-only output:

```bash
cbx run --id <slug> --no-sync -- 'pnpm db:migrate:deploy >/tmp/db.log 2>&1 || { tail -20 /tmp/db.log; exit 1; }'
```

One-line database assertion instead of a dumped table:

```bash
cbx run --id <slug> --no-sync -- "psql -At -F'|' -c 'SELECT count(*) FROM devices'"
```

Mandatory teardown:

```bash
cbx run --id <slug> --no-sync -- 'pnpm infra:down'
cbx stop --id <slug>
cbx list --json
```
