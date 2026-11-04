#!/usr/bin/env bash
set -euo pipefail

hosts=()
ssh_user="${PROXMOX_SSH_USER:-root}"
identity="${PROXMOX_SSH_IDENTITY:-}"
dry_run=0
check_only=0
skip_ui_patch=0
skip_subscription_api_patch=0

usage() {
  cat <<'USAGE'
Usage:
  proxmox-post-install-baseline.sh --host <host> [--host <host>] [options]

Options:
  --host HOST                 Proxmox host to configure. Repeatable.
  --user USER                 SSH user. Default: $PROXMOX_SSH_USER or root.
  --identity PATH             SSH private key. Default: $PROXMOX_SSH_IDENTITY;
                              if unset, use the normal ssh config and agent.
  --dry-run                   Print planned actions without mutating the host.
  --check-only                Verify current state without mutating the host.
  --skip-ui-patch             Do not patch desktop web UI subscription popup.
  --skip-subscription-api-patch
                              Do not patch the subscription API or node level.
                              Backward-compatible alias: --skip-mobile-api-patch.
  -h, --help                  Show this help.

What it does:
  1. Switch Proxmox VE and Ceph repos to no-subscription repos.
  2. Patch the desktop web UI checked_command() subscription nag.
  3. Patch local subscription API reads to return active when no key is installed.
  4. Patch the node subscription level for the mobile UI.
  5. Install an APT hook and reload changed services.
  6. Verify repositories, hook, API, node level, and patch markers.
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      [[ $# -ge 2 ]] || die "--host requires a value"
      hosts+=("$2")
      shift 2
      ;;
    --user)
      [[ $# -ge 2 ]] || die "--user requires a value"
      ssh_user="$2"
      shift 2
      ;;
    --identity)
      [[ $# -ge 2 ]] || die "--identity requires a value"
      identity="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --check-only)
      check_only=1
      shift
      ;;
    --skip-ui-patch)
      skip_ui_patch=1
      shift
      ;;
    --skip-subscription-api-patch|--skip-mobile-api-patch)
      skip_subscription_api_patch=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ ${#hosts[@]} -gt 0 ]] || die "at least one --host is required"
if [[ -n "$identity" ]]; then
  [[ -r "$identity" ]] || die "identity file is not readable: $identity"
fi
if [[ $dry_run -eq 1 && $check_only -eq 1 ]]; then
  die "--dry-run and --check-only cannot be used together"
fi

ssh_base=(ssh -o BatchMode=yes)
if [[ -n "$identity" ]]; then
  ssh_base+=(-i "$identity" -o IdentityAgent=none -o IdentitiesOnly=yes)
fi

run_host() {
  local host="$1"
  echo "==> ${host}: starting Proxmox post-install baseline"

  local remote_script script_sha
  remote_script="$(dirname "$0")/proxmox-post-install-remote.sh"
  script_sha="$(shasum -a 256 "$remote_script" | cut -d ' ' -f 1)"
  local -a args=(--expected-sha256 "$script_sha")
  [[ "$skip_ui_patch" == 1 ]] && args+=(--skip-ui-patch)
  [[ "$skip_subscription_api_patch" == 1 ]] && args+=(--skip-subscription-api-patch)
  if [[ "$dry_run" == 1 ]]; then
    args+=(--dry-run)
  elif [[ "$check_only" == 1 ]]; then
    args+=(--check-only)
  else
    # shellcheck disable=SC2016
    "${ssh_base[@]}" "${ssh_user}@${host}" 'tmp=$(mktemp); trap '\''rm -f "$tmp"'\'' EXIT; cat > "$tmp"; if ! cmp -s "$tmp" /usr/local/sbin/proxmox-post-install || [ ! -x /usr/local/sbin/proxmox-post-install ]; then install -m 0755 "$tmp" /usr/local/sbin/proxmox-post-install; fi' < "$remote_script"
    "${ssh_base[@]}" "${ssh_user}@${host}" /usr/local/sbin/proxmox-post-install "${args[@]}"
    echo "==> ${host}: complete"
    return
  fi
  "${ssh_base[@]}" "${ssh_user}@${host}" 'bash -s --' "${args[@]}" < "$remote_script"

  echo "==> ${host}: complete"
}

for host in "${hosts[@]}"; do
  run_host "$host"
done
