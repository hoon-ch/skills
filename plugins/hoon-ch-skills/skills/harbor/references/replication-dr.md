# Harbor Replication And Disaster Recovery

Use this reference for replication policies, remote registry endpoints,
replication failures, failover, or DR readiness.

## Topology First

Identify the intended topology before changing policies:

- Hub-and-spoke: one primary Harbor pushes to regional read-only registries.
- Primary-secondary: one primary and one standby for DR.
- Active-active: multiple writable registries, higher conflict risk.

For most GitOps and platform teams, hub-and-spoke or primary-secondary is easier
to reason about than active-active.

## Baseline Commands

The curl examples assume `HARBOR_PASSWORD` and `HARBOR_HOST` have been resolved
with `references/credentials.md`.

List registries:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/registries" | jq
```

List policies:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/replication/policies?page_size=50" | jq
```

List recent executions:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/replication/executions?page_size=20" | jq
```

## Policy Review Checklist

Before enabling or editing a policy, verify:

- Source and destination registry are explicit.
- Remote endpoint uses HTTPS and `insecure` is false unless the environment is
  intentionally isolated.
- Filters are narrow enough to avoid replicating scratch or test images.
- Deletion replication is intentional.
- Override behavior is intentional.
- Trigger is event-based only when immediate replication is required.
- Scheduled policies have a known operational window.

## Failure Diagnosis

For failed executions, inspect the execution and task logs:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/replication/executions/$EXECUTION_ID/tasks" | jq
```

Then check:

- Remote registry credential validity.
- TLS certificate trust and hostname match.
- Network path from jobservice to remote registry.
- Repository and tag filters.
- Destination namespace permissions.
- Whether remote retention or immutability rejects overwrites.

Harbor replication is jobservice-driven, so jobservice logs are usually more
useful than registry logs for replication errors.

```bash
kubectl -n harbor logs deploy/harbor-jobservice --tail=200
```

## DR Readiness

A DR setup is not ready until restore or failover has been tested.

Minimum verification:

- Secondary registry has the required projects and tags.
- A Kubernetes cluster can pull a known image from the secondary registry.
- Robot credentials exist and are scoped on the secondary.
- DNS or deployment values can switch to the secondary registry.
- RTO and RPO are written down and recently tested.

For GitOps deployments, confirm image references and pull secrets can be updated
through the tracked repo rather than only by manual cluster mutation.
