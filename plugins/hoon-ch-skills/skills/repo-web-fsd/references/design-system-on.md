# Design System On

Use this file when the workspace has a separate design-system package
such as `packages/ui`.

## Ownership

- reusable primitive belongs in the design-system package
- generic shell or dense surface belongs in the design-system package
- shared tab, badge, switch, scroll-area, popover, table, and button
  contracts belong in the design-system package
- tokenized interaction states belong in the design-system package

## Keep Local In The App

- route semantics
- page or workflow-specific layout
- domain-specific composition
- chart, map, or visualization behavior
- browser-only rendering logic

## Allowed Local Exceptions

- chart series and domain hue decisions
- map marker and basemap behavior
- route-specific overlays
- documented legacy or dormant surfaces
- workflow-specific copy or validation context

These remain local because they are route or domain semantics, not
shared primitive contracts.

## Invalid Local Exceptions

- tab shell or active tab contract
- badge or chip chrome
- switch chrome
- scroll-area shell
- generic overlay header or toolbar hierarchy
- dark-only slate shell recreated in route code

## Review Questions

- Is this a primitive or shell contract rather than route semantics?
- Is `apps/web` reimplementing a shared primitive that belongs in the
  design-system package?
- Is the claimed local exception documented and narrow?

## Evidence Rules

When UI or design behavior changes, expect all of the following:

1. code
2. regression test or equivalent evidence
3. relevant docs update
4. checklist or rollout status update when applicable
