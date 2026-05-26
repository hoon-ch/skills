# Operational Workflows

This reference describes the recommended runtime workflow for using `plane-api` on real projects.

## Safe Default Sequence

1. Run `doctor`
2. Run `doctor --test`
3. Run `workflow project-scan`
4. Decide the write strategy
5. Execute writes
6. Re-read the affected resources to verify the result

## 1. Authentication And Connection

Always start here:

```bash
python scripts/plane_api.py doctor
python scripts/plane_api.py doctor --test
```

Guidance:

- Prefer `doctor` over opening raw config files
- Treat raw config inspection as a last resort because it may expose secrets
- Keep logs and notes redacted

## 2. Project Scan

Before writing, inspect the project shape:

```bash
python scripts/plane_api.py workflow project-scan \
  --project-id <project-uuid> \
  --pretty
```

Look for:

- project capability flags such as `is_issue_type_enabled`
- current states
- current labels
- current modules
- existing work items
- whether `project-features` is available on this deployment

## 3. Writing Strategy

Use the scan result to decide the simplest stable write path.

Recommended defaults:

- if issue types are disabled, prefer title rules and body templates before expanding taxonomy
- if the project is mostly empty, define writing conventions before seeding many items
- if helper behavior and server behavior diverge, prefer the raw endpoint over repeated helper retries

## 4. Plane Page Content

When moving repository Markdown into a Plane page, preserve the document structure instead of treating the whole file as source code.

Preferred conversion:

```bash
pandoc --from gfm --to html --wrap=none ./path/to/document.md > /tmp/plane-page.html
jq -n \
  --arg name "Page title" \
  --rawfile description_html /tmp/plane-page.html \
  '{name: $name, description_html: $description_html}' \
  > /tmp/plane-page.json
python scripts/plane_api.py request \
  --method POST \
  --path /api/v1/workspaces/<workspace>/projects/<project-id>/pages/ \
  --data @/tmp/plane-page.json \
  --pretty
```

Rules:

- Do not wrap the entire Markdown document in `<pre><code>...</code></pre>`
- Use `pandoc --from gfm --to html --wrap=none` for repo Markdown
- Send the converted HTML through `description_html`
- Expect headings, lists, tables, and links to render as normal document structure in Plane
- Expect only original fenced code blocks to remain code blocks
- If `pandoc` is unavailable, install it or use another CommonMark/GFM parser before writing the page; do not fall back to a whole-document code block

## 5. Project View Control

Project views are not guaranteed to be available through Plane's public
`/api/v1` API-key surface on every deployment. Without a native route or a
deployment-specific bridge, API-key view control is impossible. Probe before
writing:

```bash
python scripts/plane_api.py workflow views-probe \
  --project-id <project-uuid> \
  --pretty
```

Use the result as the routing decision:

- public `/api/v1` view route returns `200`: use `request` against that exact route
- public `/api/v1` route returns `404` but app route returns `200`, `401`, or `403`: state that API-key view control is impossible without a bridge
- project access fails: fix project/token access before reasoning about views

For structured view payloads, prefer a JSON file:

```bash
jq -n \
  --arg name "Triage" \
  --arg display_filters "all" \
  '{name: $name, display_filters: $display_filters}' \
  > /tmp/plane-view.json
python scripts/plane_api.py request \
  --method POST \
  --path /api/v1/workspaces/<workspace>/projects/<project-id>/views/ \
  --data @/tmp/plane-view.json \
  --pretty
```

After changing a view, re-read the view and the affected work-item query. Confirm
that filters, grouping, ordering, and visible properties match the intended
operator workflow.

If a bridge is needed, own it as deployment-specific infrastructure:

- re-export Plane's app view endpoint through `/api/v1` with `APIKeyAuthentication`
- expose only the collection/detail actions the automation actually needs
- document the Plane image version and app ViewSet class name used by the bridge
- smoke test create, read, patch, and delete/archive behavior with a disposable view

## 6. Fallback Rules

### Page creation fails

If project page creation returns `404`:

- stop retrying the same helper
- store the content as a meta work item or repo document instead

### View control fails

If project view creation or update returns `404` on a public `/api/v1` route:

- stop retrying the same route
- run `workflow views-probe`
- if app routes are visible but no `/api/v1` bridge exists, say API-key view control is impossible
- either add a deployment-specific bridge or document the desired view contract instead of using the API key
- only use app-route session automation when the user explicitly asked for browser-like control

### Helper validation mismatch

If a helper returns a validation error and the route itself exists:

- switch to `request`
- send the exact payload the server expects
- only then consider changing the helper

Example:

```bash
python scripts/plane_api.py request \
  --method POST \
  --path /api/v1/workspaces/<workspace>/projects/<project-id>/modules/<module-id>/module-issues/ \
  --data '{"issues":["<work-item-id>"]}' \
  --pretty
```

### Relation route unavailable

If `work-item-relations list` returns `404`:

- do not treat prose such as "must come before" as stored dependency data
- check the work item's `parent`, modules, labels, and other exposed fields
- state plainly that relation control is not exposed by that deployment
- use `request` only when you have confirmed a deployment-specific route shape

## 7. Post-Write Verification

After creation or linking:

- re-read work item counts
- re-read module membership when module linking was involved
- confirm labels and state on the created work item
- for work item relations, re-read `work-item-relations list` and verify the expected relation type contains the target work item
- for Plane pages, re-read the created page and confirm `description_html` contains normal HTML structure rather than one whole-document code block
- clean up accidental test artifacts immediately
