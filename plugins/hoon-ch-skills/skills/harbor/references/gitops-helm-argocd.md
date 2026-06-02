# Harbor GitOps, Helm, And ArgoCD

Use this reference when Harbor is deployed through Helm, Kustomize, or ArgoCD,
or when the user reports `OutOfSync`, generated diff noise, or chart rendering
failures.

## Diagnosis Order

1. Read the Argo application status and diff target.
2. Identify the chart name, chart version, namespace, values files, and release
   name used by the GitOps repo.
3. Render the chart locally twice with the same inputs.
4. Compare generated Secrets and deployment checksum annotations.
5. Decide whether drift is real configuration drift or generated
   nondeterminism.

## Common Harbor Generated Drift

Some Harbor chart templates can generate values such as:

- `REGISTRY_HTTP_SECRET`
- `REGISTRY_HTPASSWD`
- certificate material from `genCA` or related Helm helpers
- deployment `checksum/secret*` annotations

If repeated renders produce different values from the same inputs, ArgoCD may
show `OutOfSync` even when the live app is otherwise healthy.

Prove it before patching:

```bash
HARBOR_CHART_VERSION="<chart-version>"

helm template harbor harbor/harbor \
  --version "$HARBOR_CHART_VERSION" \
  --namespace harbor \
  -f values.yaml > /tmp/harbor-1.yaml

helm template harbor harbor/harbor \
  --version "$HARBOR_CHART_VERSION" \
  --namespace harbor \
  -f values.yaml > /tmp/harbor-2.yaml

diff -u /tmp/harbor-1.yaml /tmp/harbor-2.yaml | sed -n '1,220p'
```

If only generated Secret data and dependent checksums change, prefer a narrow
ArgoCD `ignoreDifferences` rule for those generated fields rather than rewriting
unrelated Harbor values.

## ArgoCD Hard Refresh

After a GitOps fix lands on the tracked branch, stale compare state can make
Harbor still appear `OutOfSync`. Force Argo to recalculate before assuming the
fix failed:

```bash
kubectl -n argocd annotate application harbor \
  argocd.argoproj.io/refresh=hard --overwrite
```

Then re-check:

```bash
kubectl -n argocd get application harbor
argocd app get harbor --refresh
```

## Direct Cluster Edits

If the root Argo app self-heals from the tracked branch, direct edits to
`Application/harbor` or Harbor manifests are temporary. Use them only for
emergency restoration, and follow with a repo change if the state must persist.

## Kustomize Helm Fallback

If `kubectl kustomize --enable-helm` fails because it invokes a Helm flag that
the installed Helm version does not support, fall back to direct `helm template`
with the same chart version and values. Report the compatibility error instead
of treating it as a Harbor values problem.

## Reporting

When explaining Harbor GitOps drift, report it as a causal chain:

```text
Harbor chart render -> generated secret/checksum changes -> Argo compare diff
-> OutOfSync display -> repo-level ignore rule or values fix
```

Avoid summarizing this as "Argo is wrong"; the useful question is whether the
diff is an intended desired-state change or nondeterministic generated output.
