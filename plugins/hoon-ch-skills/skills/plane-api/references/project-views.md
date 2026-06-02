# Plane Project Views

Use this reference when creating or updating Plane project views.

Project views are easy to create incorrectly because modern Plane UI reads
`rich_filters` for the visible work item list. The legacy `filters` and server
`query` fields can look correct in API responses while the UI still shows every
work item if `rich_filters` is empty.

## Hard Rules

- Always write both `filters` and `rich_filters`.
- Treat `rich_filters: {}` as a failed view creation unless the view is
  intentionally unfiltered.
- Always verify saved `display_filters` and `display_properties`, not only the
  view name.
- Create views around a decision or execution workflow, not just one view per
  label.
- Keep the number of saved views small enough that the sidebar remains useful.
- Use `views-probe` before mutating views on a new self-hosted deployment.

## Endpoint

Project views use the API v1 project view route:

```text
/api/v1/workspaces/{workspace_slug}/projects/{project_id}/views/
```

Supported operations on deployments that expose this route:

```text
GET    /views/
POST   /views/
GET    /views/{view_id}/
PATCH  /views/{view_id}/
DELETE /views/{view_id}/
```

Some self-hosted deployments expose view creation but not favorite endpoints.
Treat favorites as optional and probe them separately.

## Filter Shape

Plane currently stores three related filter fields:

- `filters`: legacy UI/API filter shape.
- `query`: server-derived Django query shape generated from `filters`.
- `rich_filters`: current UI-effective filter expression.

Do not rely on `filters` alone. A view with populated `filters` and empty
`rich_filters` can appear correct through the API but render as unfiltered in
the web UI.

### Legacy To Rich Mapping

Use this mapping when converting common legacy filters:

| Legacy filter | Rich filter key |
| --- | --- |
| `state` | `state_id__in` |
| `labels` | `label_id__in` |
| `module` | `module_id__in` |
| `priority` | `priority__in` |
| `state_group` | `state_group__in` |
| `assignees` | `assignee_id__in` |
| `created_by` | `created_by_id__in` |
| `project` | `project_id__in` |
| `start_date` | `start_date__exact` or date range keys |
| `target_date` | `target_date__exact` or date range keys |

For `__in` rich filters, Plane stores list values as comma-separated strings:

```json
{
  "label_id__in": "label-a,label-b"
}
```

When multiple conditions are needed, wrap them in `and`:

```json
{
  "and": [
    { "module_id__in": "11f3e20f-a12b-4d6b-8c76-5c855a09213c" },
    { "priority__in": "high" },
    { "state_group__in": "backlog,unstarted,started" }
  ]
}
```

The matching legacy `filters` should still be stored for compatibility:

```json
{
  "module": ["11f3e20f-a12b-4d6b-8c76-5c855a09213c"],
  "priority": ["high"],
  "state_group": ["backlog", "unstarted", "started"]
}
```

## Display Shape

Use `display_filters` to choose how the view should be read:

```json
{
  "layout": "list",
  "group_by": "labels",
  "sub_group_by": null,
  "order_by": "sort_order",
  "show_empty_groups": false,
  "sub_issue": true,
  "calendar": {
    "layout": "month",
    "show_weekends": false
  }
}
```

Common layout choices:

| Purpose | Layout | Grouping |
| --- | --- | --- |
| Decision queue | `list` | `labels` |
| Execution queue | `kanban` | `state` |
| Data/API comparison | `spreadsheet` | none |
| Small focused topic | `list` | none |
| Priority triage | `list` | `priority` |

Use `display_properties` to keep the view focused. Do not expose every column by
default.

Typical compact property set:

```json
{
  "key": true,
  "state": true,
  "priority": true,
  "labels": true,
  "assignee": true,
  "modules": true,
  "updated_on": true,
  "start_date": false,
  "due_date": false,
  "created_on": false,
  "attachment_count": false,
  "estimate": false,
  "link": false,
  "sub_issue_count": false,
  "cycle": false,
  "issue_type": false
}
```

## Recommended Workflow

1. Run `doctor` and `doctor --test`.
2. Run `workflow views-probe --project-id <project-id> --pretty`.
3. Run `workflow project-scan --project-id <project-id> --pretty`.
4. Inspect modules, labels, states, priorities, and current work item counts.
5. Design views around workflow questions:
   - What must be decided before implementation?
   - What is ready to execute now?
   - What needs backend/data readiness?
   - What is a focused feature/domain slice?
   - What is tooling or operational work separate from product work?
6. Create or patch views with both `filters` and `rich_filters`.
7. Re-read the saved views and verify:
   - `rich_filters` is not `{}` unless intentionally unfiltered.
   - `filters` matches the intended legacy filter shape.
   - `display_filters.layout`, `group_by`, and `order_by` are correct.
   - `display_properties` shows only useful columns.
8. If possible, calculate expected hit counts from the work item list and report
   them to the user.

## View Presets

### Decision Queue

Use when a small set of work items must be resolved before implementation.

```json
{
  "display_filters": {
    "layout": "list",
    "group_by": "labels",
    "order_by": "sort_order",
    "show_empty_groups": false,
    "sub_issue": true
  },
  "display_properties": {
    "key": true,
    "labels": true,
    "modules": true,
    "priority": true,
    "state": true,
    "updated_on": true
  }
}
```

### Execution Queue

Use for high-priority items that are ready to implement.

```json
{
  "display_filters": {
    "layout": "kanban",
    "group_by": "state",
    "order_by": "sort_order",
    "show_empty_groups": false,
    "sub_issue": true
  },
  "display_properties": {
    "key": true,
    "assignee": true,
    "labels": true,
    "modules": true,
    "state": true,
    "updated_on": true
  }
}
```

### Data/API Comparison

Use when work items need to compare source data, pipeline, serving tables, API
contracts, and UI readiness.

```json
{
  "display_filters": {
    "layout": "spreadsheet",
    "group_by": null,
    "order_by": "sort_order",
    "show_empty_groups": false,
    "sub_issue": true
  },
  "display_properties": {
    "key": true,
    "state": true,
    "priority": true,
    "labels": true,
    "modules": true,
    "assignee": true,
    "updated_on": true
  }
}
```

## Bad Patterns

Avoid these:

- Creating one view per label without a workflow reason.
- Creating many sidebar views that overlap heavily.
- Using only `filters` and assuming Plane UI will honor them.
- Grouping by labels when the item set has many multi-label work items and the
  user needs execution status.
- Using kanban for a tiny set of 2-3 decision items.
- Showing all display properties by default.
