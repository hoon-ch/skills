# Fact Gathering

The picture is only as good as its facts. Read what exists first, ask for the
gaps, and run only read-only commands. Ask before touching any system, and
never log in with credentials you were not given for this purpose.

## Order

1. Repository docs, IaC (Terraform locals, Ansible inventory), GitOps manifests,
   and runbooks. Note each value's source file.
2. Prior decisions the user already recorded (wikis, notes, chat summaries).
3. Read-only live checks for what docs lack or contradict.
4. Short questions to the user for the rest, three to six at a time, grouped by
   topic, each with a suggested default.

When sources disagree, prefer the newest live observation, mention the conflict
to the user, and never silently keep the stale value.

## Questions To Cover

- Purpose and privacy: internal or public? Which domain, public IP, SSIDs, or
  names must be hidden? Title, date, watermark, label language.
- Internet edge: ISP, link type and speed, router/firewall model, WAN mode,
  port forwards, tunnels, VPN.
- Switches: model, management IP, and per port: connected device, negotiated
  speed, untagged VLAN, tagged VLANs, LAG membership.
- VLANs: ID, name, subnet, gateway, one-line policy.
- Hosts: hypervisor version, CPU, RAM, GPU, NICs/bonds, disks and pools, cluster
  membership, management (iDRAC/BMC/KVM).
- Guests: ID, name, IP, VLAN, size, role, owner (mark guests run by other teams).
- Platform: Kubernetes version, CNI, VIPs, ingress, storage, GitOps, secrets,
  monitoring, main workloads and their public hostnames.
- Backups and known gaps.

## Read-Only Commands

Proxmox node (over SSH):

```bash
hostname; dmidecode -s system-manufacturer; dmidecode -s system-product-name
lscpu | grep -E '^Model name|^Socket|^CPU\(s\)'; free -g
pveversion; pvecm status
for i in $(ls /sys/class/net); do echo "$i $(cat /sys/class/net/$i/speed 2>/dev/null)"; done
lspci | grep -iE 'vga|3d|nvidia'
qm list; pct list; qm config <id>; pct config <id>
pvesm status; lsblk -dno NAME,MODEL,SIZE
```

Kubernetes:

```bash
kubectl get nodes -o wide
kubectl get ns
kubectl -n argocd get applications
kubectl get httproute,ingress -A
kubectl get svc -A --field-selector spec.type=LoadBalancer
```

Linux server: `ip -br -4 a`, `ip -4 route`, `ethtool <nic> | grep Speed`.
Reachability without credentials: ICMP sweeps of a subnet (`ping -c1 -t1`).

Switch and firewall configuration usually needs an admin session or API token.
Use one only when the user provides it, keep requests to GET/read endpoints, and
stop after a failed login instead of retrying into a lockout.

## Recording Unknowns

Write `n/a` (or the translated equivalent) for anything not confirmed, such as
an uplink speed nobody measured or an undocumented switch port number. Mention
the open items when you deliver the diagram so the user can fill them in.
