---
name: plane-api
description: Direct access to the Plane REST API through a generic HTTP client, endpoint catalog, and workflow helpers. Use when Codex needs to inspect or mutate Plane resources through official `/api/v1` endpoints with `X-API-Key` or OAuth bearer auth.
---

# Plane API

Use this skill when you need direct, predictable access to the Plane REST API.

This skill is designed for the official Plane API surface, not for a specific MCP wrapper or a single self-hosted deployment.

## Quick Start

Always begin with these two commands before any write operation:

```bash
python scripts/plane_api.py doctor
python scripts/plane_api.py doctor --test
```

Use `doctor` to confirm the auth source and effective configuration. Do not inspect raw config files unless `doctor` is insufficient to unblock you.

## When To Use It

- Query or update Plane resources through raw HTTP
- Work against Plane Cloud or a self-hosted Plane instance
- Use API key or OAuth bearer authentication
- Inspect exact request paths, bodies, and server responses
- Call an endpoint that does not yet have a dedicated convenience command

## Configuration

Configuration priority is:

1. CLI flags
2. Environment variables
3. Persisted config at `~/.config/hoon-ch-skills/plane-api.json`

Supported settings:

- `--base-url` or `PLANE_BASE_URL`
- `--workspace` or `PLANE_WORKSPACE_SLUG`
- `--api-key` or `PLANE_API_KEY`
- `--oauth-token` or `PLANE_OAUTH_TOKEN`
- `--no-persisted-config` to ignore the saved config file for one run

Auth rules:

- Within each source layer, OAuth takes precedence over API key
- Across sources, CLI overrides environment variables and environment variables override persisted config

## First Run Setup

Save reusable defaults once:

```bash
python scripts/setup.py
```

Non-interactive setup works too:

```bash
python scripts/setup.py \
  --base-url https://plane.example.com \
  --workspace my-workspace \
  --api-key <token>
```

Inspect the resolved configuration:

```bash
python scripts/plane_api.py doctor
python scripts/plane_api.py doctor --test
```

Inspect project state before deciding how to write:

```bash
python scripts/plane_api.py workflow project-scan \
  --project-id <project-uuid> \
  --pretty
```

Probe page API routing without creating anything:

```bash
python scripts/plane_api.py workflow pages-probe \
  --project-id <project-uuid> \
  --pretty
```

Probe view API routing without creating or changing views:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

## Core Commands

Generic request:

```bash
python scripts/plane_api.py request \
  --method GET \
  --path /api/v1/workspaces/$PLANE_WORKSPACE_SLUG/projects/ \
  --pretty
```

Catalog inspection:

```bash
python scripts/plane_api.py catalog list
python scripts/plane_api.py catalog show work-items list
python scripts/plane_api.py catalog validate
```

Catalog-backed invocation:

```bash
python scripts/plane_api.py invoke work-items list \
  --project-id <project-uuid> \
  --per-page 50 \
  --pretty
```

Workflow dry run:

```bash
python scripts/plane_api.py workflow upload-attachment \
  --project-id <project-uuid> \
  --work-item-id <work-item-uuid> \
  --file ./artifact.zip
```

Workflow execution:

```bash
python scripts/plane_api.py workflow upload-attachment \
  --project-id <project-uuid> \
  --work-item-id <work-item-uuid> \
  --file ./artifact.zip \
  --execute \
  --pretty
```

Project scan:

```bash
python scripts/plane_api.py workflow project-scan \
  --project-id <project-uuid> \
  --pretty
```

## Supported Scope

The catalog covers official Plane API groups across:

- Projects and project features
- Work items, states, labels, work item types
- Project view availability probes and raw view-route control
- Custom properties, values, and options
- Comments, activities, links, attachments, and work item page links
- Cycles, modules, milestones, estimates, estimate points, worklogs
- Pages, intake issues, user assets, workspace assets
- Epics, initiatives, customers, teamspaces, stickies
- Workspace features, invitations, members, and current user

The CLI exposes these through:

- `request` for any raw HTTP call
- `catalog` for discovery and validation
- `doctor` for config inspection and connection checks
- `invoke` for catalog-backed single requests
- `workflow` for multi-step or relationship-oriented operations

## Workflow

Prefer:

- `doctor` and `doctor --test` before any mutating flow
- `workflow project-scan` before choosing states, labels, modules, or write targets
- `workflow pages-probe` before using page APIs on self-hosted deployments
- `workflow views-probe` before using view APIs on any deployment
- `request` when you already know the exact path
- `invoke` when the operation is already in the catalog
- `workflow` when the task spans multiple requests or has a common alias such as upload, add/remove, transfer, or link/unlink

Use `workflow` dry runs first for mutating flows when you want to inspect the exact request sequence before execution.

## Page Content

When creating or updating Plane pages from repository Markdown:

- Convert the source Markdown with `pandoc --from gfm --to html --wrap=none`
- Send the converted HTML as `description_html`
- Do not wrap the whole document in `<pre><code>...</code></pre>`
- Preserve document structure so headings, lists, and tables render as normal Plane content
- Let only original fenced code blocks remain as code blocks after conversion

Example:

```bash
pandoc --from gfm --to html --wrap=none ./docs/runbook.md > /tmp/runbook.html
jq -n \
  --arg name "Runbook" \
  --rawfile description_html /tmp/runbook.html \
  '{name: $name, description_html: $description_html}' \
  > /tmp/plane-page.json
python scripts/plane_api.py request \
  --method POST \
  --path /api/v1/workspaces/<workspace>/projects/<project-id>/pages/ \
  --data @/tmp/plane-page.json \
  --pretty
```

## Project Views

Plane's official public `/api/v1` surface does not reliably expose project view
management. Before controlling views, run:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

If the probe reports a public `/api/v1` views route as available, use `request`
with the matching route and exact payload. That route may be native support or a
deployment-specific bridge. Use `--set key=value` for scalar JSON fields and
`--data @payload.json` for structured filters, display properties, or layout
settings.

If `/api/v1` view routes are not available, state plainly that API-key view
control is impossible on that deployment unless a bridge is added. App routes are
session-authenticated internals, not a substitute for API-key automation. Store
the desired view contract in a work item or repo document instead of retrying the
same API-key request.

Deployment-specific bridge option:

- re-export the app view endpoint, such as Plane's `IssueViewViewSet`, through a
  mounted `/api/v1` URL module
- set `authentication_classes = [APIKeyAuthentication]`
- expose only the exact collection/detail actions needed for list/create/get/patch/delete
- verify with `workflow views-probe`, then create, re-read, update, and delete a
  disposable smoke view

## Failure Fallback

If a helper fails with a server-side validation mismatch, fall back to `request` with the exact endpoint and payload the deployment expects.

Example for module linking fallback:

```bash
python scripts/plane_api.py request \
  --method POST \
  --path /api/v1/workspaces/<workspace>/projects/<project-id>/modules/<module-id>/module-issues/ \
  --data '{"issues":["<work-item-id>"]}' \
  --pretty
```

## Examples

Minimal connectivity check:

```bash
python scripts/plane_api.py doctor
python scripts/plane_api.py doctor --test
```

Read-only project scan:

```bash
python scripts/plane_api.py workflow project-scan \
  --project-id <project-uuid> \
  --pretty
```

Read-only pages routing probe:

```bash
python scripts/plane_api.py workflow pages-probe \
  --project-id <project-uuid> \
  --pretty
```

Read-only views routing probe:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

## Notes

- The default resource naming follows official `work-items` paths. Legacy `issues` aliases are deprecated and should be treated as compatibility-only.
- Some self-hosted deployments diverge from the official docs for selected resources such as pages or app-only endpoints. This skill documents those cases but does not hard-code per-deployment fallbacks.
- If `workflow pages-probe` shows project access works, `/api/v1` project pages return `404`, and app-route project pages return `401`, `403`, or `200`, treat API-key pages as unsupported unless the deployment adds a bridge. Store the guidance as a meta work item or repo document instead of retrying the same request.
- If `workflow views-probe` shows project access works, `/api/v1` view routes return `404`, and app-route view routes return `401`, `403`, or `200`, say API-key view control is impossible unless the deployment adds a bridge. Store the intended view definition as a meta work item or repo document instead of retrying the same request.
- Rate-limit headers are surfaced in pretty output when the server returns them.

## References

- [endpoints.md](./references/endpoints.md)
- [auth-and-pagination.md](./references/auth-and-pagination.md)
- [operational-workflows.md](./references/operational-workflows.md)
- [self-hosted-gotchas.md](./references/self-hosted-gotchas.md)
- `scripts/endpoint_catalog.json`
- `scripts/plane_api.py`
- `scripts/setup.py`
