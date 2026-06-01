---
name: proxmox-post-install
description: Proxmox VE homelab post-install baseline. Use for fresh or rebuilt Proxmox nodes that should use no-subscription repos, suppress desktop/mobile subscription popups, verify APT updates, or reapply these local patches after package upgrades.
---

# Proxmox Post Install

Use this skill for Proxmox VE hosts immediately after installation or reprovisioning,
especially when the host does not have a paid subscription and should use the
no-subscription repositories.

Do not use this skill on hosts that should keep a paid enterprise subscription
enabled.

## Quick Start

Prefer the checked script from `tech-lab-infra`:

```bash
cd /Users/hoon-ch/repos/tech-lab-infra
scripts/proxmox-post-install-baseline.sh --host 192.168.10.12 --check-only
scripts/proxmox-post-install-baseline.sh --host 192.168.10.12
```

Use the default SSH key unless the user specifies otherwise:

```bash
~/.ssh/dx_pve_ed25519
```

For multiple hosts:

```bash
scripts/proxmox-post-install-baseline.sh \
  --host 192.168.10.12 \
  --host 192.168.10.13
```

## Workflow

1. Confirm the exact Proxmox host IP or FQDN.
2. Check current state before mutation:

```bash
cd /Users/hoon-ch/repos/tech-lab-infra
scripts/proxmox-post-install-baseline.sh --host <host> --check-only
```

3. If check-only fails because enterprise repositories or popup patches are
   missing, run the baseline:

```bash
scripts/proxmox-post-install-baseline.sh --host <host>
```

4. Verify these outcomes:

```bash
ssh -i ~/.ssh/dx_pve_ed25519 -o BatchMode=yes -o IdentityAgent=none -o IdentitiesOnly=yes root@<host> \
  'apt-get update && pvesh get /nodes/localhost/subscription --output-format json-pretty && systemctl is-active pveproxy'
```

5. Tell the user whether desktop web UI, mobile UI, APT repositories, and
   `pveproxy` are all verified.

## First Run Setup

No skill-local setup is required. The operational script lives in:

```bash
/Users/hoon-ch/repos/tech-lab-infra/scripts/proxmox-post-install-baseline.sh
```

If the script is missing, inspect the current repo before recreating it:

```bash
cd /Users/hoon-ch/repos/tech-lab-infra
rg --files scripts | rg 'proxmox|pve'
```

## Reference Selection

Read `references/patches.md` only when the script fails, the user asks what is
patched, or rollback is needed.

## Failure Fallback

- If SSH fails, do not guess. Report the exact SSH error and ask for the right
  host, key, network path, or iDRAC/console status.
- If `apt-get update` fails with `401 Unauthorized`, the enterprise repo is
  still active or a stale source file remains.
- If desktop popup remains after a successful patch, restart `pveproxy` and ask
  the user to hard-refresh the browser or clear the PWA/browser cache.
- If mobile popup remains, verify the API directly:

```bash
pvesh get /nodes/localhost/subscription --output-format json-pretty
```

- If Proxmox package upgrades restore files, rerun the baseline script.

## Examples

Apply the baseline to `ax-pve-02`:

```bash
cd /Users/hoon-ch/repos/tech-lab-infra
scripts/proxmox-post-install-baseline.sh --host 192.168.10.12
```

Apply it to `ax-pve-03`:

```bash
cd /Users/hoon-ch/repos/tech-lab-infra
scripts/proxmox-post-install-baseline.sh --host 192.168.10.13
```

Verify both hosts:

```bash
scripts/proxmox-post-install-baseline.sh --host 192.168.10.12 --check-only
scripts/proxmox-post-install-baseline.sh --host 192.168.10.13 --check-only
```
