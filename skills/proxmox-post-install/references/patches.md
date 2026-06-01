# Proxmox Post-Install Patch Reference

## Repository Baseline

Expected active Proxmox repo:

```text
URIs: http://download.proxmox.com/debian/pve
Suites: trixie or bookworm
Components: pve-no-subscription
```

Expected active Ceph repo:

```text
URIs: http://download.proxmox.com/debian/ceph-<release>
Suites: trixie or bookworm
Components: no-subscription
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

## Mobile UI Patch

The mobile Yew UI reads the subscription API. Patch target:

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

The baseline script creates timestamped `.bak` files before changing files.

Find backups:

```bash
ls -1 /usr/share/javascript/proxmox-widget-toolkit/*.no-subscription-popup.*.bak
ls -1 /usr/share/perl5/PVE/API2/Subscription.pm.no-subscription-popup.*.bak
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
