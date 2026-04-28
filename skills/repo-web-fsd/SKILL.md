---
name: repo-web-fsd
description: Repository-specific FSD guidance for apps/web with architecture mode detection. Use when deciding where frontend code should live, reviewing layer or import violations, or choosing between generic shared ownership and a separate design-system package such as packages/ui.
---

# Repo Web FSD

Use this skill when the workspace follows feature-sliced rules in
`apps/web` and the task is about placement, composition, or
architecture review.

This skill is repository-specific, but it supports two modes:

- `design-system-on`: a separate design-system/shared UI package exists
- `design-system-off`: no separate design-system package exists, so
  generic FSD `shared/*` rules apply

## Quick Start

1. Confirm the task is about `apps/web` placement or review.
2. Detect the architecture mode before suggesting any path.
3. Classify the layer first: `app`, `widgets`, `features`, `entities`,
   or `shared`.
4. Decide shared ownership based on the selected mode:
   - `design-system-on`: prefer `packages/ui`
   - `design-system-off`: prefer `shared/ui` and other `shared/*`
     folders
5. Read only the minimum reference file needed for the decision.

## Mode Selection

Use `design-system-on` when the workspace has clear signals such as:

- a dedicated UI package like `packages/ui`
- docs that define shared/local ownership outside FSD `shared`
- primitive, token, or design-governance docs

Use `design-system-off` when the workspace has signals such as:

- no dedicated UI package
- no documented primitive ownership boundary
- reusable UI living inside app-local `shared/*`

Always state which mode you selected and why before giving placement
advice.

## Reference Map

- Read `references/mode-detection.md` first when the mode is not already
  obvious.
- Read `references/fsd-core.md` for layer duties, imports, naming,
  query/store placement, and module checklists.
- Read `references/design-system-on.md` for `packages/ui`, primitive
  ownership, local exceptions, and UI evidence rules.
- Read `references/design-system-off.md` for generic FSD fallback where
  reusable UI belongs in `shared/ui` and common helpers stay in
  `shared/*`.
- Read `references/examples.md` for paired mode examples and forward-test
  prompts.

## Workflow

1. Confirm the change belongs to `apps/web`.
2. Detect the architecture mode:
   - if a dedicated design-system package and governance docs exist, use
     `design-system-on`
   - otherwise use `design-system-off`
3. Classify the primary concern:
   - `app`: App Router entry, layout, providers, global styles
   - `widgets`: visible section or page-level composition block
   - `features`: user action or mutation-oriented workflow
   - `entities`: read-side domain logic, query hooks, entity state
   - `shared`: domain-agnostic utility or common helper
4. Check the import graph:
   - upward imports are invalid
   - `features` must not import other `features`
   - `entities` may import only `shared`
   - `shared` must not depend on higher FSD layers
5. Decide shared ownership using the selected mode:
   - `design-system-on`: reusable primitive, shell, or tokenized chrome
     goes to `packages/ui`
   - `design-system-off`: reusable button, table shell, empty state,
     form shell, and common interaction wrapper are candidates for
     `shared/ui`
   - in both modes, route semantics, workflow layout, and visualization
     stay local
6. For review tasks, call out the blocking rule first and then recommend
   the smallest valid target layer or ownership boundary.
7. If UI behavior changes, require code plus regression evidence plus
   docs update.

## Failure Fallback

- If the mode is ambiguous, inspect workspace structure and docs before
  assuming `packages/ui` or `shared/ui`.
- If a component could be either shared or local, keep it local unless
  the shared contract is clearly reusable.
- If a change mixes multiple concerns, split the recommendation by layer
  instead of forcing one folder to own everything.
- If the docs and local code disagree, treat the docs as the intended
  direction and call out the mismatch explicitly.
- Do not collapse generic FSD and design-system FSD into one rule set.

## Examples

### Shared shell with no separate design system

- request: "별도 디자인 시스템 없는 FSD 프로젝트면 공용 버튼은 어디에 둬?"
- answer shape: select `design-system-off`, then recommend `shared/ui`
  if the component is genuinely reusable and domain-agnostic

### Shared shell with a separate UI package

- request: "`packages/ui`가 있는 모노레포에서 이 wrapper를 어디에 둬?"
- answer shape: select `design-system-on`, then recommend `packages/ui`
  for shared primitive or shell contracts

### Local visualization

- request: "overlay는 shared인가 local인가?"
- answer shape: keep route-specific visualization local in both modes
  unless it stops being route- or visualization-specific

### Review prompt

- request: "이 import는 모드와 상관없이 FSD 위반인가?"
- answer shape: name the violated FSD rule first, then point to the
  correct lower layer or ownership boundary

## Guidance

- Lead with the selected mode, recommended layer, and ownership target.
- Cite the applicable repository rule instead of generic FSD theory.
- Prefer documented shared primitives before inventing route-local
  wrappers in `design-system-on`.
- Prefer `shared/ui` only when reuse is real in `design-system-off`.
- Do not move route semantics into `packages/ui` or `shared/ui`.
- Do not let `shared` accumulate domain concepts in either mode.
