---
name: proxmox-post-install
description: Proxmox VE homelab post-install baseline. Use for fresh or rebuilt Proxmox nodes that should use no-subscription repos, suppress desktop subscription popups, verify APT updates, or reapply these local patches after package upgrades.
---

# Proxmox Post Install

Use this skill for Proxmox VE hosts immediately after installation or reprovisioning,
especially when the host does not have a paid subscription and should use the
no-subscription repositories.

Do not use this skill on hosts that should keep a paid enterprise subscription
enabled.

## Quick Start

Run the bundled script from this skill directory. `<host>` is the Proxmox host
IP or FQDN reachable over SSH; the remote side must run as root.

```bash
scripts/proxmox-post-install-baseline.sh --host <host> --check-only
scripts/proxmox-post-install-baseline.sh --host <host>
```

For multiple hosts, repeat `--host`:

```bash
scripts/proxmox-post-install-baseline.sh --host <host-a> --host <host-b>
```

SSH settings resolve in this order:

1. `--user` / `--identity` flags
2. `PROXMOX_SSH_USER` / `PROXMOX_SSH_IDENTITY` environment variables
3. Defaults: user `root`, and the normal `ssh` config and agent for keys

When an identity file is set, the script pins it with `IdentitiesOnly=yes` and
ignores the SSH agent.

## Workflow

1. Confirm the exact Proxmox host IP or FQDN and which SSH key to use.
2. Check current state before mutation:

```bash
scripts/proxmox-post-install-baseline.sh --host <host> --check-only
```

   Use `--dry-run` to print the planned file changes without applying them.

3. If check-only fails because enterprise repositories or popup patches are
   missing, run the baseline:

```bash
scripts/proxmox-post-install-baseline.sh --host <host>
```

4. Verify these outcomes:

```bash
ssh -o BatchMode=yes root@<host> \
  'apt-get update && pvesh get /nodes/localhost/subscription --output-format json-pretty && systemctl is-active pveproxy'
```

5. Tell the user whether desktop web UI, subscription API, APT repositories,
   and `pveproxy` are all verified.

Run `scripts/proxmox-post-install-baseline.sh --help` for all options,
including `--skip-ui-patch` and `--skip-subscription-api-patch`.

## Reference Selection

Read `references/patches.md` only when the script fails, the user asks what is
patched, or rollback is needed.

## Failure Fallback

- If SSH fails, do not guess. Report the exact SSH error and ask for the right
  host, key, network path, or iDRAC/console status.
- If `apt-get update` fails with `401 Unauthorized`, the enterprise repo is
  still active or a stale source file remains.
- If desktop popup remains after a successful patch, restart `pveproxy` and ask
  the user to hard-refresh the browser or clear the browser cache.
- If a Proxmox VE 9 mobile popup remains, remember that the Yew-based mobile UI
  is a separate WASM frontend and is not patched by this baseline. Verify the API
  directly, but do not report mobile popup suppression as guaranteed:

```bash
pvesh get /nodes/localhost/subscription --output-format json-pretty
```

- If Proxmox package upgrades restore files, rerun the baseline script.

## Examples

Check, then apply, using a dedicated key:

```bash
export PROXMOX_SSH_IDENTITY=~/.ssh/<proxmox-key>
scripts/proxmox-post-install-baseline.sh --host pve-01.example.lan --check-only
scripts/proxmox-post-install-baseline.sh --host pve-01.example.lan
```

Preview changes on two hosts without mutating them:

```bash
scripts/proxmox-post-install-baseline.sh --host <host-a> --host <host-b> --dry-run
```

Verify both hosts after a Proxmox package upgrade:

```bash
scripts/proxmox-post-install-baseline.sh --host <host-a> --host <host-b> --check-only
```
