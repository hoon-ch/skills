# Design System Off

Use this file when there is no separate design-system package and
generic FSD `shared/*` rules should apply.

## Shared Ownership

- reusable button, table shell, empty-state shell, generic form section,
  and common interaction wrapper are candidates for `shared/ui`
- domain-neutral hooks belong in `shared/hooks` or equivalent app-local
  shared hook folders
- domain-neutral utilities belong in `shared/lib`
- domain-neutral API clients belong in `shared/api`

## Keep Local In The App

- route semantics
- workflow-specific layout
- domain-specific composition
- visualization behavior such as charts, maps, and overlays
- copy or validation UI that is still local to one workflow

## Promotion Rules

- do not move UI into `shared/ui` unless reuse is real or the contract is
  clearly intended to be shared
- if a wrapper is used once and tightly coupled to one workflow, keep it
  local
- if a component is domain-specific, move it to `widgets`, `features`, or
  `entities` instead of `shared`

## Review Questions

- Is the UI genuinely reusable and domain-agnostic?
- Would moving this to `shared/ui` reduce duplication rather than hide
  route semantics?
- Is this actually a workflow-local composition that should stay below
  `shared`?

## Evidence Rules

When UI or design behavior changes, still expect code, regression
evidence, and docs updates where applicable. Generic FSD fallback does
not remove evidence requirements.
