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

## 5. Fallback Rules

### Page creation fails

If project page creation returns `404`:

- stop retrying the same helper
- store the content as a meta work item or repo document instead

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

## 6. Post-Write Verification

After creation or linking:

- re-read work item counts
- re-read module membership when module linking was involved
- confirm labels and state on the created work item
- for Plane pages, re-read the created page and confirm `description_html` contains normal HTML structure rather than one whole-document code block
- clean up accidental test artifacts immediately
