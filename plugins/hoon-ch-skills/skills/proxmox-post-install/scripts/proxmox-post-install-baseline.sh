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
                              Do not patch the local subscription API response.
                              Backward-compatible alias: --skip-mobile-api-patch.
  -h, --help                  Show this help.

What it does:
  1. Switch Proxmox VE and Ceph repos to no-subscription repos.
  2. Patch the desktop web UI checked_command() subscription nag.
  3. Patch local subscription API reads to return active when no key is installed.
  4. Restart pveproxy only when UI/API files changed.
  5. Verify repo config, API status, pveproxy, and patch markers.
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

  "${ssh_base[@]}" "${ssh_user}@${host}" 'bash -s' -- \
    "$dry_run" "$check_only" "$skip_ui_patch" "$skip_subscription_api_patch" <<'REMOTE'
set -euo pipefail
shopt -s nullglob

export LC_ALL=C
DRY_RUN="$1"
CHECK_ONLY="$2"
SKIP_UI_PATCH="$3"
SKIP_SUBSCRIPTION_API_PATCH="$4"
PVEPROXY_RESTART_NEEDED=0
# Bump when desktop JS patch behavior changes and browsers must refetch it.
CACHE_BUST_MARKER="postinstall1"

log() {
  printf '[%s] %s\n' "$(hostname -s)" "$*"
}

require_root() {
  if [[ "$(id -u)" != "0" ]]; then
    echo "must run as root on the Proxmox host" >&2
    exit 1
  fi
}

backup_once() {
  local path="$1"
  local reason="$2"
  [[ -e "$path" ]] || return 0
  local backup="${path}.${reason}.$(date +%Y%m%d%H%M%S%N).bak"
  cp -a "$path" "$backup"
  log "backed up $path to $backup"
}

write_file_if_changed() {
  local path="$1"
  local content="$2"
  local reason="$3"
  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$content" >"$tmp"

  if [[ -f "$path" ]] && cmp -s "$path" "$tmp"; then
    rm -f "$tmp"
    return
  fi

  if [[ "$CHECK_ONLY" == "1" ]]; then
    rm -f "$tmp"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: would write $path"
    cat "$tmp"
    rm -f "$tmp"
    return
  fi

  backup_once "$path" "$reason"
  install -m 0644 "$tmp" "$path"
  rm -f "$tmp"
}

detect_codename() {
  . /etc/os-release
  case "${VERSION_CODENAME:-}" in
    trixie|bookworm)
      printf '%s\n' "$VERSION_CODENAME"
      ;;
    *)
      echo "unsupported Debian codename: ${VERSION_CODENAME:-unknown}" >&2
      exit 1
      ;;
  esac
}

detect_ceph_release() {
  local codename="$1"
  local existing
  existing="$(grep -RhsE '^[[:space:]]*(URIs:|deb[[:space:]])[[:space:]]+https?://[^[:space:]]+/debian/ceph-[a-z]+' \
    /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null \
    | sed -E 's#.*debian/ceph-([a-z]+).*#\1#' | head -1 || true)"
  if [[ -n "$existing" ]]; then
    printf '%s\n' "$existing"
    return
  fi
  case "$codename" in
    trixie) printf 'squid\n' ;;
    bookworm) printf 'reef\n' ;;
  esac
}

active_enterprise_sources() {
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -e "$file" ]] || continue
    grep -hsE '^[[:space:]]*deb[[:space:]].*enterprise\.proxmox\.com' "$file" || true
  done
  for file in /etc/apt/sources.list.d/*.sources; do
    [[ -e "$file" ]] || continue
    awk '
      BEGIN { enabled = 1; uri = ""; component = "" }
      /^Enabled:[[:space:]]*(no|false|0)[[:space:]]*$/ { enabled = 0 }
      /^URIs:[[:space:]]*/ { uri = $0 }
      /^Components:[[:space:]]*/ { component = $0 }
      /^$/ {
        if (enabled && uri ~ /enterprise\.proxmox\.com/) print FILENAME ":" uri " " component
        enabled = 1; uri = ""; component = ""
      }
      END {
        if (enabled && uri ~ /enterprise\.proxmox\.com/) print FILENAME ":" uri " " component
      }
    ' "$file"
  done
}

source_contains() {
  local pattern="$1"
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    [[ -e "$file" ]] || continue
    if grep -hsn "$pattern" "$file" >/dev/null; then
      return 0
    fi
  done
  return 1
}

disable_enterprise_list_files() {
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -e "$file" ]] || continue
    if grep -qE '^[[:space:]]*deb[[:space:]].*enterprise\.proxmox\.com' "$file"; then
      if [[ "$DRY_RUN" == "1" ]]; then
        log "dry-run: would comment active enterprise entries in $file"
      else
        backup_once "$file" "before-no-subscription"
        sed -i -E 's#^([[:space:]]*deb[[:space:]].*enterprise\.proxmox\.com.*)$#\# disabled by proxmox-post-install-baseline: \1#' "$file"
      fi
    fi
  done
}

configure_repos() {
  log "configuring no-subscription repositories"
  local codename ceph_release
  codename="$(detect_codename)"
  ceph_release="$(detect_ceph_release "$codename")"
  local pve_sources="/etc/apt/sources.list.d/proxmox.sources"
  local pve_enterprise_sources="/etc/apt/sources.list.d/pve-enterprise.sources"
  local ceph_sources="/etc/apt/sources.list.d/ceph.sources"
  local keyring="/usr/share/keyrings/proxmox-archive-keyring.gpg"

  if [[ "$CHECK_ONLY" == "1" ]]; then
    return
  fi
  [[ -f "$keyring" ]] || { echo "missing Proxmox keyring: $keyring" >&2; exit 1; }

  disable_enterprise_list_files
  write_file_if_changed "$pve_sources" "Types: deb
URIs: http://download.proxmox.com/debian/pve
Suites: $codename
Components: pve-no-subscription
Signed-By: $keyring" "before-no-subscription"

  write_file_if_changed "$pve_enterprise_sources" "Types: deb
URIs: https://enterprise.proxmox.com/debian/pve
Suites: $codename
Components: pve-enterprise
Signed-By: $keyring
Enabled: no" "before-no-subscription"

  write_file_if_changed "$ceph_sources" "Types: deb
URIs: http://download.proxmox.com/debian/ceph-$ceph_release
Suites: $codename
Components: no-subscription
Signed-By: $keyring" "before-no-subscription"
}

patch_desktop_ui() {
  [[ "$SKIP_UI_PATCH" == "1" ]] && { log "skipping desktop UI patch"; return; }
  log "patching desktop web UI subscription nag"
  local js="/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js"
  local min="/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.min.js"

  [[ -f "$js" ]] || { log "desktop JS not found: $js"; return; }
  [[ -f "$min" ]] || { log "desktop minified JS not found: $min"; return; }

  if grep -q 'checked_command: function (orig_cmd) {' "$js" \
    && sed -n '/checked_command: function (orig_cmd)/,/assemble_field_data/p' "$js" | grep -q '/nodes/localhost/subscription'; then
    if [[ "$CHECK_ONLY" == "1" ]]; then
      return
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would patch $js"
    else
      local js_tmp
      js_tmp="$(mktemp)"
      cp -a "$js" "$js_tmp"
      perl -0pi -e '
my $replacement = q{checked_command: function (orig_cmd) {
            orig_cmd();
        },};
s{checked_command: function \(orig_cmd\) \{\n\s*Proxmox\.Utils\.API2Request\(\{\n\s*url: '\''/nodes/localhost/subscription'\'',\n.*?\n\s*\}\);\n\s*\},}{$replacement}s or die "desktop subscription block not found\n";
' "$js_tmp"
      grep -q 'orig_cmd();' "$js_tmp"
      backup_once "$js" "before-no-subscription-popup"
      cp -a "$js_tmp" "$js"
      rm -f "$js_tmp"
      PVEPROXY_RESTART_NEEDED=1
    fi
  fi

  if grep -qa 'checked_command:function(i){Proxmox.Utils.API2Request({url:"/nodes/localhost/subscription"' "$min"; then
    if [[ "$CHECK_ONLY" == "1" ]]; then
      return
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would patch $min"
    else
      local min_tmp
      min_tmp="$(mktemp)"
      cp -a "$min" "$min_tmp"
      perl -0pi -e '
s{checked_command:function\(i\)\{Proxmox\.Utils\.API2Request\(\{url:"/nodes/localhost/subscription",method:"GET",failure:function\(e,t\)\{Ext\.Msg\.alert\(gettext\("Error"\),e\.htmlStatus\)\},success:function\(e,t\)\{e=e\.result;null!=e&&e&&"active"===e\.data\.status\.toLowerCase\(\)\?i\(\):Ext\.Msg\.show\(\{title:gettext\("No valid subscription"\),icon:Ext\.Msg\.WARNING,message:Proxmox\.Utils\.getNoSubKeyHtml\(e\.data\.url\),buttons:Ext\.Msg\.OK,callback:function\(e\)\{"ok"===e&&i\(\)\}\}\)\}\}\)\}}{checked_command:function(i){i()}} or die "minified subscription block not found\n";
' "$min_tmp"
      grep -qa 'checked_command:function(i){i()}' "$min_tmp"
      backup_once "$min" "before-no-subscription-popup"
      cp -a "$min_tmp" "$min"
      rm -f "$min_tmp"
      PVEPROXY_RESTART_NEEDED=1
    fi
  fi

  if ! head -1 "$js" | grep -q -- "-${CACHE_BUST_MARKER}$"; then
    if [[ "$CHECK_ONLY" == "1" ]]; then
      return
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would bump proxmoxlib.js cache version marker"
    else
      local marker_tmp
      marker_tmp="$(mktemp)"
      cp -a "$js" "$marker_tmp"
      MARKER="$CACHE_BUST_MARKER" perl -0pi -e \
        's{\A// (.*?)(?:-postinstall\d+)*\n}{// $1-$ENV{MARKER}\n} or die "proxmoxlib.js first-line marker insertion failed\n"' \
        "$marker_tmp"
      head -1 "$marker_tmp" | grep -q -- "-${CACHE_BUST_MARKER}$"
      backup_once "$js" "before-cache-version-bump"
      cp -a "$marker_tmp" "$js"
      rm -f "$marker_tmp"
      PVEPROXY_RESTART_NEEDED=1
    fi
  fi
}

patch_subscription_api() {
  [[ "$SKIP_SUBSCRIPTION_API_PATCH" == "1" ]] && { log "skipping subscription API patch"; return; }
  log "patching subscription API notfound response"
  local file="/usr/share/perl5/PVE/API2/Subscription.pm"
  [[ -f "$file" ]] || { log "subscription API file not found: $file"; return; }
  grep -q 'UI nag suppressed locally' "$file" && return
  if [[ "$CHECK_ONLY" == "1" ]]; then
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: would patch $file"
    return
  fi

  local tmp
  tmp="$(mktemp)"
  cp -a "$file" "$tmp"
  perl -0pi -e '
my $replacement = q{        if (!$info) {
            my $no_subscription_info = {
                status => "active",
                message => "No subscription key installed; UI nag suppressed locally",
                level => "c",
                productname => "Proxmox VE Community",
                url => $url,
            };
            $no_subscription_info->{serverid} = $server_id if $has_permission;
            return $no_subscription_info;
        }};
s{        if \(!\$info\) \{\n            my \$no_subscription_info = \{\n                status => "notfound",\n                message => "There is no subscription key",\n                url => \$url,\n            \};\n            \$no_subscription_info->\{serverid\} = \$server_id if \$has_permission;\n            return \$no_subscription_info;\n        \}}{$replacement} or die "subscription notfound block not found\n";
' "$tmp"
  perl -c "$tmp"
  backup_once "$file" "before-no-subscription-popup"
  cp -a "$tmp" "$file"
  rm -f "$tmp"
  PVEPROXY_RESTART_NEEDED=1
}

restart_services() {
  if [[ "$CHECK_ONLY" == "1" || "$DRY_RUN" == "1" ]]; then
    return
  fi
  if [[ "$PVEPROXY_RESTART_NEEDED" != "1" ]]; then
    return
  fi
  log "restarting pveproxy"
  systemctl restart pveproxy
  sleep 2
}

verify() {
  log "verifying repositories"
  if active_enterprise_sources | grep -q .; then
    echo "enterprise repository is still active:" >&2
    active_enterprise_sources >&2
    exit 1
  fi
  [[ -s /etc/apt/sources.list.d/proxmox.sources ]] || {
    echo "missing canonical Proxmox source: /etc/apt/sources.list.d/proxmox.sources" >&2
    exit 1
  }
  grep -q 'download.proxmox.com/debian/pve' /etc/apt/sources.list.d/proxmox.sources || {
    echo "canonical Proxmox source does not use download.proxmox.com" >&2
    exit 1
  }
  grep -q 'pve-no-subscription' /etc/apt/sources.list.d/proxmox.sources || {
    echo "canonical Proxmox source does not use pve-no-subscription" >&2
    exit 1
  }
  source_contains 'download.proxmox.com/debian/pve'
  source_contains 'pve-no-subscription'
  source_contains 'download.proxmox.com/debian/ceph-'
  source_contains 'Components: no-subscription'

  if [[ "$DRY_RUN" != "1" && "$CHECK_ONLY" != "1" ]]; then
    log "running apt-get update"
    apt-get update
  fi

  if [[ "$SKIP_UI_PATCH" != "1" ]]; then
    log "verifying desktop UI patch"
    grep -q 'checked_command: function (orig_cmd) {' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
    sed -n '/checked_command: function (orig_cmd)/,/assemble_field_data/p' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js \
      | grep -q 'orig_cmd();'
    if ! head -1 /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js | grep -q -- "-${CACHE_BUST_MARKER}$"; then
      echo "desktop cache version marker is missing from proxmoxlib.js" >&2
      exit 1
    fi
    grep -qa 'checked_command:function(i){i()}' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.min.js
  fi

  if [[ "$SKIP_SUBSCRIPTION_API_PATCH" != "1" ]]; then
    log "verifying subscription API patch"
    grep -q 'UI nag suppressed locally' /usr/share/perl5/PVE/API2/Subscription.pm
    pvesh get /nodes/localhost/subscription --output-format json | grep -q '"status"[[:space:]]*:[[:space:]]*"active"'
  fi

  if [[ "$DRY_RUN" != "1" ]]; then
    systemctl is-active pveproxy >/dev/null
  fi
  if dpkg-query -W -f='${Status}\n' pve-yew-mobile-gui 2>/dev/null | grep -q 'install ok installed'; then
    log "note: PVE 9 Yew mobile UI is not patched by this baseline"
  fi
  log "baseline verification passed"
}

require_root
configure_repos
patch_desktop_ui
patch_subscription_api
restart_services
verify
REMOTE

  echo "==> ${host}: complete"
}

for host in "${hosts[@]}"; do
  run_host "$host"
done
