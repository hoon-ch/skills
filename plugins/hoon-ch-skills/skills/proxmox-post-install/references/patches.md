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

## Node Subscription Level Patch

Patch target:

```text
/usr/share/perl5/PVE/Service/pvestatd.pm
```

Expected line:

```perl
my $sublevel = $subinfo->{level} || 'c'; # no-subscription nag suppressed locally
```

Verify the level on each online node:

```bash
pvesh get /nodes --output-format json-pretty
```

Each online node must have a non-empty `level`. After a reload, the new level
may take one `pvestatd` cycle, about 10 seconds, to appear.

## Proxmox VE 9 Mobile UI

The Yew-based mobile UI checks `level` for every online node returned by
`GET /nodes`. It does not read `/nodes/localhost/subscription`. An empty level
on any online node triggers the cluster warning, so patch every node.

## APT Hook

Apply installs these files:

```text
/etc/apt/apt.conf.d/99proxmox-post-install
/usr/local/sbin/proxmox-post-install
```

After each dpkg run, the hook reapplies the enabled patches and reloads or
restarts changed services. It does not change repositories or run APT. It is
silent when nothing changes and does not block APT if patching fails.

Remove the hook and its program:

```bash
rm /etc/apt/apt.conf.d/99proxmox-post-install /usr/local/sbin/proxmox-post-install
```

## Restart

After patching UI, API, or node-level files:

```bash
systemctl reload-or-restart pveproxy pvestatd
systemctl is-active pveproxy pvestatd
```

Expected:

```text
active
active
```

## Rollback

The baseline script creates timestamped `.bak` files before changing files. It
should not create new repository backups when those files are already current
for this script version.

Remove the APT hook and program before restoring backups so a later upgrade
does not reapply the patches.

Find backups:

```bash
ls -1 /usr/share/javascript/proxmox-widget-toolkit/*.before-no-subscription-popup.*.bak
ls -1 /usr/share/javascript/proxmox-widget-toolkit/*.before-cache-version-bump.*.bak
ls -1 /usr/share/perl5/PVE/API2/Subscription.pm.before-no-subscription-popup.*.bak
ls -1 /usr/share/perl5/PVE/Service/pvestatd.pm.before-no-subscription-popup.*.bak
ls -1 /etc/apt/sources.list.before-no-subscription.*.bak
ls -1 /etc/apt/sources.list.d/*.before-no-subscription.*.bak
```

Restore one file:

```bash
cp /path/to/file.bak /path/to/original
systemctl reload-or-restart pveproxy pvestatd
```

## Package Upgrade Caveat

The APT hook reapplies the UI and Perl patches when package upgrades replace
those files. Source-list conffile replacement still requires a baseline re-run.
