# Harbor Security Scanning

Use this reference when the task involves Trivy, vulnerability policy,
allowlists, image signing, robot accounts, retention, or tag immutability.

## Baseline Checks

The curl examples assume `HARBOR_PASSWORD` and `HARBOR_HOST` have been resolved
with `references/credentials.md`.

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/scanners" | jq

curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/projects/$HARBOR_PROJECT" | jq '.metadata'
```

On shared hosts, avoid leaving credentials visible in process listings; prefer
an ephemeral `.netrc`, a short-lived token, or a redacted wrapper command.

Expected production posture:

- Project is private unless the user has a public distribution requirement.
- Scan-on-push is enabled.
- Vulnerability prevention is enabled for production projects.
- Severity threshold is explicit.
- Robot accounts are scoped to the project and expire.
- Release tags are immutable.

## Trivy Scanner

Check whether Trivy is present and reachable:

```bash
kubectl get pods -A | rg 'trivy|scanner'
kubectl -n harbor logs deploy/harbor-trivy --tail=100
```

If scanner registration is missing, inspect current scanners before creating
another one:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/scanners" | jq
```

Common scanner settings are environment variables on the Harbor Trivy adapter
deployment, not fields in Harbor scanner registration:

```yaml
SCANNER_TRIVY_VULN_TYPE: "os,library"
SCANNER_TRIVY_SEVERITY: "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL"
SCANNER_TRIVY_TIMEOUT: "10m"
SCANNER_TRIVY_IGNORE_UNFIXED: "false"
SCANNER_TRIVY_SKIP_UPDATE: "false"
```

## Project Metadata

Harbor project metadata values are strings in API payloads:

```json
{
  "metadata": {
    "auto_scan": "true",
    "prevent_vul": "true",
    "severity": "critical",
    "enable_content_trust": "true",
    "public": "false"
  }
}
```

Use stricter thresholds only when the team can absorb the operational impact.
For production, blocking `critical` is the minimum reasonable default; blocking
`high` is stronger but can interrupt delivery when base images lag.

## CVE Allowlists

Accept allowlists only when they are:

- Scoped to the project or artifact class.
- Time-bound with an expiration.
- Tied to a documented mitigation or false-positive rationale.
- Rechecked before expiration.

Never create a broad permanent allowlist to make a deployment pass.

## Robot Accounts

Use robot accounts for automation, not personal user credentials.

Good defaults:

- Project-level scope.
- Minimal `pull` and `push` permissions required by the pipeline.
- Expiration set, commonly 90 days or less.
- Name includes service and purpose, such as `robot$github-actions-push`.

Before creating a new robot account, list existing accounts:

```bash
curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/projects/$HARBOR_PROJECT/robots" | jq
```

## Retention And Immutability

Retention and immutability are separate controls:

- Retention removes old or unneeded tags according to rules.
- Immutability prevents overwriting release tags.
- Garbage collection reclaims storage after deletions.

For release repositories, prefer immutable semantic version tags and digest
references in deployments. Avoid production `:latest`.

## Signing And Provenance

For production supply-chain policy, prefer:

1. Build image in CI.
2. Scan image and fail on the agreed severity threshold.
3. Generate SBOM.
4. Sign with Cosign using OIDC where available.
5. Attach SBOM to the image.
6. Verify signatures in admission control before Kubernetes deployment.

Do not claim signing is enforced until both Harbor policy and cluster admission
policy are verified.
