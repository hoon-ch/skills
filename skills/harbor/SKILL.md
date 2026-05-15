---
name: harbor
description: Harbor container registry operations for Kubernetes/GitOps environments. Use when inspecting Harbor health, configuring projects, scanners, robot accounts, retention, replication, or diagnosing Harbor Helm and ArgoCD drift.
---

# Harbor

Use this skill for Harbor registry administration, especially when the task
touches Kubernetes, Helm, ArgoCD, image scanning, robot accounts, retention,
replication, or supply-chain policy.

This skill is based on the upstream
`martinholovsky/claude-skills-generator` `harbor-expert` skill:
https://github.com/martinholovsky/claude-skills-generator/tree/main/skills/harbor-expert

It is narrowed for direct operator work instead of a broad expert persona.

## Quick Start

Start by identifying the operating surface:

```bash
kubectl get application harbor -n argocd
kubectl get pods -A | rg 'harbor|trivy|registry'
helm list -A | rg harbor
```

Expected local tools are `kubectl`, `helm`, `curl`, `jq`, and `rg`. Use
`grep -E` when `rg` is not available. Use `argocd` only when the local
environment already has it configured.

If the user names a repo, cluster, namespace, Argo app, or Harbor URL, inspect
that exact target first. Do not infer from nearby environments.

For live or production changes, first gather evidence:

```bash
kubectl get application harbor -n argocd -o yaml
kubectl -n harbor get pods,svc,ingress
kubectl -n harbor logs deploy/harbor-core --tail=100
```

## When To Use It

- Harbor health, login, push, pull, scan, replication, GC, or storage issues
- Harbor Helm chart or values changes
- ArgoCD `Application/harbor` sync, health, diff, or generated drift debugging
- Trivy scanner setup, scan-on-push, CVE policies, and allowlists
- Robot account and project RBAC design
- Retention, tag immutability, image signing, or provenance policy
- Replication and disaster recovery behavior

## Workflow

1. Classify the task as read-only diagnosis, config proposal, live mutation, or
   repo change.
2. Confirm the exact Harbor instance, namespace, chart version, values source,
   and Argo application before changing anything.
3. For failures, collect live state first: Argo app status, Harbor pods,
   ingress/TLS, core logs, jobservice logs, registry logs, and scanner status.
4. For GitOps-managed Harbor, prefer repo changes over direct cluster edits.
   Treat direct `kubectl apply` as temporary unless the user explicitly asks for
   an emergency patch.
5. For security policy work, preserve least privilege: scoped robot accounts,
   private projects by default, scan-on-push, explicit CVE thresholds, and
   time-bound allowlists.
6. For Harbor API operations, resolve credentials from the user's existing
   secret backend when available. Use an operator account for registry
   administration and a robot account only for artifact automation.
7. Never print token values from config files, password managers, keychains, or
   Kubernetes Secrets.
8. Verify after every change with the smallest observable outcome: Argo sync
   status, pod readiness, API response, scan result, replication execution, or
   image pull.

## First Run Setup

This skill has no required setup script and does not store secrets. Prefer
existing project tooling, cluster credentials, and the user's existing password
manager or OS keychain.

If repeatable Harbor API access is needed, store only non-secret hints or secret
lookup commands in `~/.config/hoon-ch-skills/harbor.json`. Do not store raw
passwords or tokens there. See `references/credentials.md` before adding or
using that file.

Useful environment variables:

```bash
export HARBOR_URL=https://harbor.example.com
export HARBOR_USER=admin
export HARBOR_PASSWORD_CMD="op read 'op://Infra/Harbor Operator/password'"
export HARBOR_PROJECT=library
```

`library` is Harbor's default seed project; replace it with the target project
slug. `HARBOR_PASSWORD_CMD` can be any trusted local command that prints the
secret to stdout.

## Reference Selection

Load only the reference needed for the current task:

- `references/security-scanning.md`: Trivy, scan-on-push, CVE blocking,
  allowlists, content trust, robot accounts, retention, and signing.
- `references/credentials.md`: choosing operator vs robot credentials and
  resolving secrets from 1Password, Apple Keychain, Windows Credential Manager,
  secret-tool, environment variables, or `.netrc`.
- `references/replication-dr.md`: replication topology, policy checks,
  disaster recovery, lag diagnosis, and failover verification.
- `references/gitops-helm-argocd.md`: Helm-rendered nondeterminism, ArgoCD
  compare drift, hard refreshes, and Harbor chart troubleshooting.

## Failure Fallback

- If Harbor UI and API disagree, trust API and pod logs first.
- If Argo reports `Healthy` but `OutOfSync`, inspect generated Secret data and
  deployment checksum annotations before rewriting values.
- If `kubectl kustomize --enable-helm` fails because of Helm CLI compatibility,
  use direct `helm template` with the same chart, version, namespace, and values
  as a comparison fallback.
- If a write helper hides the server response, use raw Harbor API calls with
  `curl -i` and redact credentials in the final report.
- If a security exception is requested, make it explicit, scoped, documented,
  and time-bound.

## Examples

Check Argo and live Harbor status:

```bash
kubectl get application harbor -n argocd
kubectl -n harbor get pods
kubectl -n harbor logs deploy/harbor-core --tail=100
```

List projects through the Harbor API:

```bash
HARBOR_PASSWORD="$(bash -c "$HARBOR_PASSWORD_CMD")"
HARBOR_HOST="${HARBOR_URL#https://}"
HARBOR_HOST="${HARBOR_HOST#http://}"
HARBOR_HOST="${HARBOR_HOST%%/*}"
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/projects?page_size=50" | jq
```

Check replication executions for failures:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/replication/executions?page_size=20" |
  jq 'if type == "array" then .[] else empty end | select(.status == "Failed")'
```

Force Argo to recalculate compare state after a merged GitOps fix:

```bash
kubectl -n argocd annotate application harbor \
  argocd.argoproj.io/refresh=hard --overwrite
```
