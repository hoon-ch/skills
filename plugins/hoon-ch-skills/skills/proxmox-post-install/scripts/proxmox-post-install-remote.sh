#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

export LC_ALL=C
MODE=apply
SKIP_UI_PATCH=0
SKIP_SUBSCRIPTION_API_PATCH=0
EXPECTED_SHA256=""
declare -A SERVICES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hook) MODE=hook ;;
    --check-only) MODE=check ;;
    --dry-run) MODE=dry-run ;;
    --skip-ui-patch) SKIP_UI_PATCH=1 ;;
    --skip-subscription-api-patch|--skip-mobile-api-patch) SKIP_SUBSCRIPTION_API_PATCH=1 ;;
    --expected-sha256)
      [[ $# -ge 2 ]] || { echo "missing SHA256" >&2; exit 1; }
      EXPECTED_SHA256="$2"; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done
if [[ "$MODE" != hook && -z "$EXPECTED_SHA256" && -f "${BASH_SOURCE[0]}" ]]; then
  EXPECTED_SHA256="$(sha256sum "${BASH_SOURCE[0]}" | cut -d ' ' -f 1)"
fi
# Bump when desktop JS patch behavior changes and browsers must refetch it.
CACHE_BUST_MARKER="postinstall1"

log() {
  [[ "$MODE" == hook ]] && return 0
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
  local backup
  backup="${path}.${reason}.$(date +%Y%m%d%H%M%S%N).bak"
  cp -a "$path" "$backup"
  log "backed up $path to $backup"
}

write_file_if_changed() {
  local path="$1"
  local content="$2"
  local reason="$3"
  [[ "$MODE" == check ]] && return
  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$content" >"$tmp"

  if [[ -f "$path" ]] && cmp -s "$path" "$tmp"; then
    rm -f "$tmp"
    return
  fi


  if [[ "$MODE" == dry-run ]]; then
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
  # shellcheck source=/dev/null
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
      if [[ "$MODE" == dry-run ]]; then
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

  if [[ "$MODE" == check ]]; then
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
  local js_changed=0

  [[ -f "$js" ]] || { log "desktop JS not found: $js"; return; }
  [[ -f "$min" ]] || { log "desktop minified JS not found: $min"; return; }

  if ! grep -A 1 -F 'checked_command: function (orig_cmd) {' "$js" | grep -q 'orig_cmd();' && grep -q 'checked_command: function (orig_cmd) {' "$js" \
    && sed -n '/checked_command: function (orig_cmd)/,/assemble_field_data/p' "$js" | grep -q '/nodes/localhost/subscription'; then
    if [[ "$MODE" == check ]]; then
      return
    fi
    if [[ "$MODE" == dry-run ]]; then
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
      js_changed=1
      SERVICES[pveproxy]=1
    fi
  fi

  if grep -qa 'checked_command:function(i){Proxmox.Utils.API2Request({url:"/nodes/localhost/subscription"' "$min"; then
    if [[ "$MODE" == check ]]; then
      return
    fi
    if [[ "$MODE" == dry-run ]]; then
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
      [[ "$MODE" != hook ]] || printf 'patched %s\n' "$min"
      SERVICES[pveproxy]=1
    fi
  fi

  if ! head -1 "$js" | grep -q -- "-${CACHE_BUST_MARKER}$"; then
    if [[ "$MODE" == check ]]; then
      return
    fi
    if [[ "$MODE" == dry-run ]]; then
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
      js_changed=1
      SERVICES[pveproxy]=1
    fi
  fi
  if [[ "$MODE" == hook && "$js_changed" == 1 ]]; then
    printf 'patched %s\n' "$js"
  fi
}

patch_subscription_api() {
  [[ "$SKIP_SUBSCRIPTION_API_PATCH" == "1" ]] && { log "skipping subscription API patch"; return; }
  log "patching subscription API notfound response"
  local file="/usr/share/perl5/PVE/API2/Subscription.pm"
  [[ -f "$file" ]] || { log "subscription API file not found: $file"; return; }
  grep -q 'UI nag suppressed locally' "$file" && return
  if [[ "$MODE" == check ]]; then
    return
  fi

  if [[ "$MODE" == dry-run ]]; then
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
  perl -c "$tmp" 2>&1 | { if [[ "$MODE" == hook ]]; then grep -v ' syntax OK$' || true; else cat; fi; }
  backup_once "$file" "before-no-subscription-popup"
  cp -a "$tmp" "$file"
  rm -f "$tmp"
  [[ "$MODE" != hook ]] || printf 'patched %s\n' "$file"
  SERVICES[pveproxy]=1
}

patch_node_level() {
  [[ "$SKIP_SUBSCRIPTION_API_PATCH" == "1" ]] && return
  local file="/usr/share/perl5/PVE/Service/pvestatd.pm" tmp
  [[ -f "$file" ]] || { echo "node status file not found: $file" >&2; exit 1; }
  grep -Fq "# no-subscription nag suppressed locally" "$file" && return
  grep -Fq "my \$sublevel = \$subinfo->{level} || '';" "$file" || {
    echo "node subscription level fallback not found: $file" >&2; exit 1;
  }
  [[ "$MODE" == check ]] && return
  if [[ "$MODE" == dry-run ]]; then
    log "dry-run: would patch $file"
    return
  fi
  tmp="$(mktemp)"
  cp -a "$file" "$tmp"
  perl -0pi -e 's{my \$sublevel = \$subinfo->\{level\} \|\| \x27\x27;}{my \$sublevel = \$subinfo->{level} || \x27c\x27; # no-subscription nag suppressed locally} or die "node subscription level fallback not found\n";' "$tmp"
  perl -c "$tmp" 2>&1 | { if [[ "$MODE" == hook ]]; then grep -v ' syntax OK$' || true; else cat; fi; }
  backup_once "$file" "before-no-subscription-popup"
  cp -a "$tmp" "$file"
  rm -f "$tmp"
  [[ "$MODE" != hook ]] || printf 'patched %s\n' "$file"
  SERVICES[pvestatd]=1
}

hook_content() {
  local flags=""
  [[ "$SKIP_UI_PATCH" == 1 ]] && flags+=" --skip-ui-patch"
  [[ "$SKIP_SUBSCRIPTION_API_PATCH" == 1 ]] && flags+=" --skip-subscription-api-patch"
  printf '%s\n' "DPkg::Post-Invoke { \"if [ -x /usr/local/sbin/proxmox-post-install ]; then /usr/local/sbin/proxmox-post-install --hook${flags} || true; fi\"; };"
}

install_hook() {
  write_file_if_changed /etc/apt/apt.conf.d/99proxmox-post-install "$(hook_content)" before-proxmox-post-install
}

restart_services() {
  [[ "$MODE" == check || "$MODE" == dry-run ]] && return
  local service
  for service in "${!SERVICES[@]}"; do
    log "reloading or restarting $service"
    [[ "$MODE" != hook ]] || printf 'reloading or restarting %s\n' "$service"
    # Reloading pveproxy keeps an APT session in the web shell alive.
    systemctl reload-or-restart "$service"
  done
}

verify_markers() {
  if [[ "$SKIP_UI_PATCH" != 1 ]]; then
    grep -q 'checked_command: function (orig_cmd) {' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js || { echo "desktop checked_command marker missing from proxmoxlib.js" >&2; exit 1; }
    if [[ "$MODE" == hook ]]; then
      grep -q 'orig_cmd();' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js || { echo "desktop orig_cmd marker missing from proxmoxlib.js" >&2; exit 1; }
    else
      sed -n '/checked_command: function (orig_cmd)/,/assemble_field_data/p' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js | grep -q 'orig_cmd();' || { echo "desktop checked_command orig_cmd marker missing from proxmoxlib.js" >&2; exit 1; }
    fi
    head -1 /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js | grep -q -- "-${CACHE_BUST_MARKER}$" || { echo "desktop cache version marker is missing from proxmoxlib.js" >&2; exit 1; }
    grep -qa 'checked_command:function(i){i()}' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.min.js || { echo "desktop checked_command marker missing from proxmoxlib.min.js" >&2; exit 1; }
  fi
  if [[ "$SKIP_SUBSCRIPTION_API_PATCH" != 1 ]]; then
    grep -q 'UI nag suppressed locally' /usr/share/perl5/PVE/API2/Subscription.pm || { echo "subscription API marker missing from Subscription.pm" >&2; exit 1; }
    grep -Fq '# no-subscription nag suppressed locally' /usr/share/perl5/PVE/Service/pvestatd.pm || { echo "node subscription level marker missing from pvestatd.pm" >&2; exit 1; }
  fi
}

verify_node_level() {
  local attempts=1 attempt
  [[ "$MODE" != apply ]] || attempts=16
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if pvesh get /nodes --output-format json | NODE_NAME="$(hostname -s)" perl -MJSON::PP -0777 -ne '
      my $nodes = decode_json($_);
      my ($node) = grep { $_->{node} eq $ENV{NODE_NAME} } @$nodes;
      die "local node subscription level missing\n" unless $node && defined $node->{level} && length $node->{level};
    ' 2>/dev/null; then
      return 0
    fi
    (( attempt == attempts )) || sleep 2
  done
  echo "local node subscription level missing from /nodes" >&2
  return 1
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

  if [[ "$MODE" == apply ]]; then
    log "running apt-get update"
    apt-get update
  fi

  verify_markers
  if [[ "$SKIP_SUBSCRIPTION_API_PATCH" != 1 ]]; then
    pvesh get /nodes/localhost/subscription --output-format json | grep -q '"status"[[:space:]]*:[[:space:]]*"active"' || { echo "active subscription status missing from /nodes/localhost/subscription" >&2; exit 1; }
    verify_node_level
  fi
  if [[ "$MODE" != dry-run ]]; then
    systemctl is-active pveproxy >/dev/null || { echo "pveproxy service is not active" >&2; exit 1; }
    [[ -n "$EXPECTED_SHA256" ]] || { echo "expected program SHA256 is required" >&2; exit 1; }
    [[ -x /usr/local/sbin/proxmox-post-install ]] || { echo "installed program missing or not executable" >&2; exit 1; }
    [[ "$(sha256sum /usr/local/sbin/proxmox-post-install | cut -d ' ' -f 1)" == "$EXPECTED_SHA256" ]] || { echo "installed program SHA256 mismatch" >&2; exit 1; }
    if [[ ! -f /etc/apt/apt.conf.d/99proxmox-post-install ]] || ! cmp -s /etc/apt/apt.conf.d/99proxmox-post-install <(hook_content); then
      echo "APT hook missing or mismatched" >&2
      exit 1
    fi
  fi
  log "baseline verification passed"
}

require_root
if [[ "$MODE" == hook ]]; then
  patch_desktop_ui
  patch_subscription_api
  patch_node_level
  restart_services
  verify_markers
  exit 0
fi
configure_repos
patch_desktop_ui
patch_subscription_api
patch_node_level
install_hook
restart_services
verify
