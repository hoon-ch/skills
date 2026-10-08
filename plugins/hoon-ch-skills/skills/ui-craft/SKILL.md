---
name: ui-craft
description: Entry point for building, restyling, or polishing web UI. Routes the request to the right design skill and component catalog, enforces a design-system gate before any UI code, refines clunky existing components into a consistent set, and requires rendered screenshot verification before UI work is called done. Use for any frontend page, component, styling, layout, animation, or visual-quality task.
---

# UI Craft

This skill is a router and a gate, not a style guide. It decides which
design knowledge to load for the request, makes the design system the
contract before code is written, and refuses to call UI work finished until
the rendered result has been looked at.

Use it for:

- new pages, screens, components, or design systems
- restyling, redesigning, or polishing an existing interface
- upgrading clunky existing components into a refined, consistent set
- interaction, motion, charts, or AI-agent UI work
- any change whose result is visual

Skip it for frontend changes with no visual surface (state logic, data
fetching, types, tests). Handle those directly.

## Quick Start

1. Classify the request with the routing table in **Workflow → Route**, then
   write one line naming the files and skills you will load and why. A route
   you did not name is one you chose to skip; a route you named is one you owe.
2. Pass the design-system gate in
   [references/design-system-gate.md](references/design-system-gate.md)
   before writing UI code.
3. Build with tokens and existing primitives only.
4. Verify with [references/visual-qa.md](references/visual-qa.md): render,
   screenshot desktop and mobile, fix, confirm once.
5. Report what you routed to, what you built, and what you actually saw.

## Workflow

### 1. Route

Pick every row that applies. Load only what you name.

| Request involves | Load |
| --- | --- |
| Any UI implementation or visual change | `references/design-system-gate.md` (always) and `references/visual-qa.md` (always, before done) |
| Landing page, portfolio, or marketing-site build or redesign | `design-taste-frontend` skill |
| New dashboard, tool, game, or product surface where the obvious first design is likely generic | `diverging-ui` skill for the direction pass, then build here |
| Upgrading clunky shared components (buttons, inputs, cards, dialogs, tables) into a refined, consistent set while keeping the product's identity | `references/component-refinement.md` |
| Critiquing or polishing a specific existing screen or flow | `impeccable` skill when installed; otherwise the existing-UI branch of the gate plus visual QA |
| Review against web interface guidelines only, no build | `web-design-guidelines` skill when installed |
| Interaction, motion, AI-agent UI, charts, landing sections, brutalist or Tailwind-only builds | `references/component-catalogs.md` |
| Where frontend code should live in `apps/web` (FSD placement) | `repo-web-fsd` skill |

When a named skill is not installed, say so in one line and continue with
this skill's references. Do not invent its contents.

### 2. Gate

Run the branch in `references/design-system-gate.md` that matches the
project:

- existing `DESIGN.md` or component system: follow it
- existing UI without a written system: inventory the implicit system from
  code and preserve it
- greenfield: write a minimal `DESIGN.md` before the first component
- refinement of existing components: strengthen the existing tokens, then
  refine primitives in place (`references/component-refinement.md`)
- user-supplied reference (screenshot, mockup, URL): the reference is the
  contract

### 3. Build

- Every color, spacing, radius, type size, shadow, and duration comes from a
  token. A value the system lacks is added to the system first, then used.
- Compose from existing primitives before creating new ones.
- Prefer dependencies the project already has. Never add a second motion
  engine for one effect.
- Keep keyboard focus, accessible names, contrast, and `prefers-reduced-motion`
  behavior intact for everything you touch.
- Motion must signal a state change, affordance, or relationship. Decorative
  motion with no meaning is removed.

### 4. Verify

Follow `references/visual-qa.md`. Rendered evidence is required; reading the
code is not verification. Use one batched inspection round, one fix batch,
and at most one confirmation round.

### 5. Delegate (optional)

When handing UI work to a subagent, put this in its task: "Load the
`ui-craft` skill first, follow its gate and visual QA, and report screenshots
taken." Include the route line and the design contract summary (tokens,
primitives, constraints) so the subagent does not rediscover them.

## Failure Fallback

- **No browser or screenshot tool available**: finish the build, state that
  visual verification was not performed and why, and list the exact pages,
  widths, and states the user should check. Never claim a visual check you
  did not run.
- **The app cannot run** (missing env, broken build): fix the build if it is
  in scope; otherwise verify an isolated render (Storybook, a scratch route,
  or a static HTML harness) and say which.
- **Existing UI conflicts with the requested look**: ask one question —
  preserve the current look, or replace it and write a new `DESIGN.md`. Do
  not split the difference.
- **No catalog pattern fits**: compose from the nearest two patterns or
  record the mechanism as new in `DESIGN.md`.
- **A routed skill disagrees with this one**: the routed skill owns taste and
  direction; this skill still owns the gate and visual QA.

## Examples

Route lines:

```text
Route: design-system-gate (existing Tailwind theme) + component-catalogs
(AI-agent UI → approval card) + visual-qa. Reason: new approval flow inside
an existing product shell.

Route: design-taste-frontend (B2B landing) + design-system-gate (greenfield)
+ visual-qa. Reason: new marketing page, no existing system.

Route: impeccable (polish existing settings page) + visual-qa. Reason:
screen-level polish of incumbent UI; preserve identity.

Route: design-system-gate (refine) + component-refinement + component-catalogs
(beUI tabs, select, toast) + visual-qa. Reason: shared primitives look
clunky; keep brand and props, upgrade tokens and primitives in place.
```

Completion report:

```text
Routed: design-system-gate, component-catalogs (smoothui ai-approval), visual-qa
Built: ApprovalCard + 2 tokens (--approval-warn, --approval-ok) added to theme.css
Seen: /agents at 1440px and 390px, light and dark, pending/approved/denied
Fixed: action row wrapped at 390px; focus ring hidden on dark
Open: denied-state copy needs product review
```
