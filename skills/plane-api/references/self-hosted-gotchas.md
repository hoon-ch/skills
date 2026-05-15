# Self-Hosted Gotchas

This skill targets the official Plane API contract. Self-hosted deployments sometimes diverge from that contract.

## What Can Differ

- Endpoint path prefixes
- Whether a resource is exposed under `/api/v1`
- Whether a resource requires API key auth, bearer auth, or session auth
- Reverse proxy behavior such as Cloudflare or ingress filtering
- Feature availability across Plane versions

## Typical Failure Modes

`404` on a documented endpoint:

- The deployment may expose a different route shape
- The resource may exist only in the app router, not the public API router
- The server version may lag behind the docs
- A helper may be targeting the documented route while the deployment expects a different payload or a disabled feature path

`401` or `403` on a documented endpoint:

- The deployment may require a different auth mode
- The token may not have access to that workspace or resource
- The endpoint may be session-authenticated in that deployment

Cloudflare or proxy rejection:

- Some deployments block non-browser clients based on request signature
- This client sends an explicit `User-Agent` to reduce false positives, but that does not guarantee success in every environment

## Pages Caveat

Official docs include `/api/v1` page endpoints.

A self-hosted deployment may still expose page functionality differently. For example:

- page routes may live under `/api/...`
- page routes may require session authentication
- the public API and app API may not be aligned

Run a read-only routing probe before attempting page creation:

```bash
python scripts/plane_api.py workflow pages-probe \
  --project-id <project-uuid> \
  --pretty
```

The important failure shape is:

- `project_accessible: true`
- project body shows `page_view: true`
- `project_pages_status: 404`
- `app_project_pages_status: 401`, `403`, or `200`

That means the token, workspace, and project access are working, and Plane has an app-route pages implementation under `/api/...`, but the documented API-key project pages collection route is not matched by the deployment's public `/api/v1` router. Treat this as a deployment API-surface mismatch, not a page payload problem.

In that shape, project pages are not available through the official API-key surface unless the deployment adds a bridge or the deployed Plane version later exposes the route under `/api/v1`. Session-auth app routes may still work for browser UI traffic, but they are not a drop-in replacement for API-key automation.

Operational fallback:

- do not keep retrying page creation on the same deployment
- store operational rules or checklists as a meta work item instead
- only revisit API-key pages after `workflow pages-probe` reports `project_pages_status: 200` or after adding a deployment-specific bridge

## Views Caveat

Project views can have the same public-API versus app-route split. Probe before
trying to create or update saved views:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

The important failure shape is:

- `project_accessible: true`
- project body shows `issue_views_view: true`
- both public `/api/v1` view route probes return `404`
- an app-route view probe returns `401`, `403`, or `200`

That means the view feature is enabled for the project, but API-key view control
is impossible through the tested public routes unless the deployment adds a
bridge. Treat this as an API-surface gap, not as a malformed view payload.

Operational fallback:

- do not keep retrying view writes on the same `/api/v1` route
- either add a narrow deployment-specific bridge or store the desired filters, grouping, ordering, visible fields, and layout as a meta work item or repo document
- only use app-route session automation when the user explicitly wants browser-like control

Bridge option:

- re-export the app `IssueViewViewSet` through `/api/v1` with `APIKeyAuthentication`
- mount the bridge through GitOps like the page bridge, not by editing live containers
- include the bridge URL module in the mounted `/api/v1` URL package
- smoke test a disposable view before using it for real project organization

## Project Features Caveat

Some deployments may return `404` for project feature endpoints even when other project routes work.

In those cases:

- use `projects get` as the baseline source of project capability flags
- use `workflow project-scan` to collect the rest of the project shape
- treat `project-features get` as an optional enrichment, not as a hard prerequisite

## Helper Mismatch Caveat

Catalog-backed helpers are convenient, but they are not guaranteed to be a perfect abstraction over every deployment.

If a helper fails with a validation error such as a missing request key:

1. inspect the failing route
2. compare the expected payload with the deployment behavior
3. retry with raw `request`
4. only then decide whether the helper should be updated

## Recommended Debug Order

1. Confirm the base URL is correct
2. Confirm the workspace slug is correct
3. Retry the exact endpoint with `request --pretty`
4. For pages, run `workflow pages-probe`; for views, run `workflow views-probe`
5. Compare the deployed Plane version against the official docs
6. Check whether the failing route is app-only in that deployment
7. Only after that, consider adding a deployment-specific extension outside this generic skill
