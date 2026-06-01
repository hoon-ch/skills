# Proxmox Post-Install Patch Reference

## Repository Baseline

Expected active Proxmox repo:

```text
/etc/apt/sources.list.d/proxmox.sources
URIs: http://download.proxmox.com/debian/pve
Suites: trixie or bookworm
Components: pve-no-subscription
```

Expected active Ceph repo:

```text
/etc/apt/sources.list.d/ceph.sources
URIs: http://download.proxmox.com/debian/ceph-<release>
Suites: trixie or bookworm
Components: no-subscription
```

Expected disabled enterprise repo:

```text
/etc/apt/sources.list.d/pve-enterprise.sources
URIs: https://enterprise.proxmox.com/debian/pve
Components: pve-enterprise
Enabled: no
```

Enterprise URLs should not appear in active source files:

```bash
grep -Rhsn 'enterprise.proxmox.com' \
  /etc/apt/sources.list \
  /etc/apt/sources.list.d/*.list \
  /etc/apt/sources.list.d/*.sources
```

Expected: no output.

## Desktop Web UI Patch

Patch target:

```text
/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.min.js
```

Expected unminified function:

```javascript
checked_command: function (orig_cmd) {
            orig_cmd();
        },
```

Expected minified marker:

```text
checked_command:function(i){i()}
```

`pveproxy` reads the first line of `proxmoxlib.js` and uses it as the
`/proxmoxlib.js?ver=...` value. The baseline appends a `postinstall` marker to
that first line so browsers request the patched JavaScript. Bump the script
marker only when the desktop JS patch behavior changes.

## Subscription API Patch

Patch target:

```text
/usr/share/perl5/PVE/API2/Subscription.pm
```

Expected API response:

```json
{
  "status": "active",
  "level": "c",
  "message": "No subscription key installed; UI nag suppressed locally"
}
```

Verify:

```bash
pvesh get /nodes/localhost/subscription --output-format json-pretty
```

## Proxmox VE 9 Mobile UI Caveat

Proxmox VE 9 ships a separate Yew-based mobile UI in `pve-yew-mobile-gui`.
That frontend loads:

```text
/yew-mobile/js/pve-yew-mobile-gui_bundle.js
/yew-mobile/js/pve-yew-mobile-gui_bg.wasm
```

This baseline does not patch the mobile WASM frontend. A mobile subscription
warning can remain visible even when the subscription API returns the local
`active` response.

## Restart

After patching UI/API files:

```bash
systemctl restart pveproxy
systemctl is-active pveproxy
```

Expected:

```text
active
```

## Rollback

The baseline script creates timestamped `.bak` files before changing files. It
should not create new repository backups when those files are already current
for this script version.

Find backups:

```bash
ls -1 /usr/share/javascript/proxmox-widget-toolkit/*.before-no-subscription-popup.*.bak
ls -1 /usr/share/javascript/proxmox-widget-toolkit/*.before-cache-version-bump.*.bak
ls -1 /usr/share/perl5/PVE/API2/Subscription.pm.before-no-subscription-popup.*.bak
ls -1 /etc/apt/sources.list.before-no-subscription.*.bak
ls -1 /etc/apt/sources.list.d/*.before-no-subscription.*.bak
```

Restore one file:

```bash
cp /path/to/file.bak /path/to/original
systemctl restart pveproxy
```

## Package Upgrade Caveat

Re-run the baseline after upgrades that replace:

- `proxmox-widget-toolkit`
- `pve-manager`
- packages owning `/usr/share/perl5/PVE/API2/Subscription.pm`
- source-list conffiles such as `/etc/apt/sources.list.d/pve-enterprise.sources`
