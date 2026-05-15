# Plane API Endpoint Coverage

This skill treats the official Plane API as the source of truth and maps resource/action pairs into `scripts/endpoint_catalog.json`.

## Coverage Model

Each catalog entry defines:

- `group`
- `resource`
- `action`
- `method`
- `path_template`
- `scope`
- `supports_fields`
- `supports_expand`
- `pagination_mode`
- `body_shape_hint`
- `notes`

The CLI uses those entries through:

- `catalog` to inspect what is available
- `invoke` to execute one documented action
- `workflow` to wrap common multi-step or association flows

View route probing is intentionally implemented as a workflow rather than a
catalog group because public API-key support is not consistently available yet.

## Covered Resource Groups

The catalog currently includes entries for these Plane API groups:

- `Project`
- `Project Features`
- `Label`
- `Work Item`
- `State`
- `Work Item Type`
- `Custom Property`
- `Custom Property Value`
- `Custom Property Option`
- `Link`
- `Activity`
- `Comment`
- `Attachment`
- `Work Item Page`
- `Cycle`
- `Module`
- `Page`
- `Intake Issue`
- `User Asset`
- `Workspace Asset`
- `Milestone`
- `Estimate`
- `Estimate Point`
- `Worklog`
- `Epic`
- `Initiative`
- `Initiative Label`
- `Initiative Project`
- `Initiative Epic`
- `Customer`
- `Customer Property`
- `Customer Request`
- `Teamspace`
- `Teamspace Member`
- `Teamspace Project`
- `Sticky`
- `Workspace Feature`
- `Workspace Invitation`
- `Workspace Member`
- `Project Member`
- `User`

## Common Patterns

Workspace-scoped paths usually look like:

`/api/v1/workspaces/{workspace_slug}/...`

Project-scoped paths usually look like:

`/api/v1/workspaces/{workspace_slug}/projects/{project_id}/...`

Relationship endpoints are represented as normal catalog actions. Examples:

- `initiative-projects add`
- `initiative-projects remove`
- `teamspace-members add`
- `teamspace-members remove`
- `cycles transfer-work-items`
- `work-item-pages create`

## Workflows

The catalog is intentionally low-level. The skill adds higher-level wrappers for recurring patterns:

- `upload-attachment`
- `upload-user-asset`
- `upload-workspace-asset`
- `project-scan`
- `pages-probe`
- `views-probe`
- `cycle-add-work-items`
- `cycle-remove-work-item`
- `cycle-transfer-work-items`
- `module-add-work-items`
- `module-remove-work-item`
- `initiative-add-projects`
- `initiative-remove-projects`
- `initiative-add-epics`
- `initiative-remove-epics`
- `initiative-add-labels`
- `initiative-remove-labels`
- `teamspace-add-members`
- `teamspace-remove-members`
- `teamspace-add-projects`
- `teamspace-remove-projects`
- `customer-link-work-items`
- `customer-unlink-work-item`
- `work-item-page-link-create`
- `work-item-page-link-list`
- `work-item-page-link-get`
- `work-item-page-link-delete`

## Deprecated Aliases

Official Plane docs still reference older `issues` naming in some places. This skill standardizes on `work-items` for new usage.

Keep in mind:

- `issues` is a legacy alias
- `work-items` is the preferred path family
- Official deprecation timelines should be treated as authoritative over older blog posts or examples

## Pages

Pages are included in the catalog because the official docs expose `/api/v1` page endpoints.

That does not guarantee every self-hosted deployment matches those paths or auth requirements. When pages fail in a specific deployment, treat that as a deployment mismatch first, not as a catalog bug.

Before creating pages on self-hosted Plane, run:

```bash
python scripts/plane_api.py workflow pages-probe \
  --project-id <project-uuid> \
  --pretty
```

The probe is read-only. It checks project access, workspace pages, documented `/api/v1` project pages, the app-route `/api` project pages surface, and optionally work-item page links when `--work-item-id` is provided.

If project access works, `/api/v1` project pages return `404`, and app-route project pages return `401`, `403`, or `200`, treat API-key pages as unsupported on that deployment unless a bridge has been added. Prefer a meta work item or repo document over repeated retries.

## Project Views

Plane views are a deployment-sensitive area. Some deployments expose view state
only through the web app route family, while the official public `/api/v1` API
does not reliably include stable view management endpoints.

Before controlling views, run:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

The probe is read-only. It checks project access, likely `/api/v1` project view
collections, and likely app-route project view collections:

- `/api/v1/workspaces/<workspace>/projects/<project-id>/views/`
- `/api/v1/workspaces/<workspace>/projects/<project-id>/issue-views/`
- `/api/workspaces/<workspace>/projects/<project-id>/views/`
- `/api/workspaces/<workspace>/projects/<project-id>/issue-views/`

If a public `/api/v1` route returns `200`, use `request` with that exact route
and payload for list/get/create/update/delete flows. That route may be native
support or a deployment-specific bridge.

If only app routes are visible, API-key view control is impossible on that
deployment until a bridge is added. Do not soften this as a payload problem or a
retryable API-key call. Use session-auth browser-like automation only when
explicitly intended, or store the desired view definition as a work item or repo
document.

A bridge can be acceptable for self-hosted deployments when it is owned as local
infrastructure. The usual shape is to re-export Plane's app view endpoint, such
as `IssueViewViewSet`, from the `/api/v1` URL module with `APIKeyAuthentication`.
Keep the bridge narrow, version-pin the Plane image behavior it depends on, and
run a disposable smoke sequence before trusting it for real view definitions.

## Project Scan

`workflow project-scan` is a read-only helper that combines:

- `projects get`
- `states list`
- `labels list`
- `modules list`
- `work-items list`
- `project-features get`

Its purpose is to let the agent inspect current project shape before deciding how to write.

If one section is unavailable on the current deployment, the workflow still returns the other sections and marks the failing section with `unavailable_on_deployment` when appropriate.

## Module Linking

`workflow module-add-work-items` keeps the external CLI flag `--work-item-ids`, but the actual request body sent to the server uses the `issues` key.

If that helper still fails on a specific deployment, fall back to raw `request` against the same `/module-issues/` endpoint with the exact body expected by the server.
