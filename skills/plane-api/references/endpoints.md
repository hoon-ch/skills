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
