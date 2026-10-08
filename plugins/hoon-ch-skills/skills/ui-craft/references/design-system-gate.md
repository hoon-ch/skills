# Design-System Gate

Pass this gate before writing UI code. The most common failure in agent-built
UI is skipping straight to components with hardcoded colors, arbitrary
spacing, and one-off font sizes, so the result looks assembled by several
people. The gate makes the design system the contract first.

## 1. Inspect

Look before deciding which branch applies:

- token sources: CSS custom properties, Tailwind config or `@theme`, `theme.ts`,
  design-token JSON, styled-system or CSS-in-JS theme objects
- shared primitives: Button, Input, Card, Dialog, layout and stack components
- an existing `DESIGN.md`, `PRODUCT.md`, Storybook, or component docs
- 5 to 10 existing UI components, to learn naming, spacing grid, color usage,
  type scale, and composition style (slots, children, compound components)

Write a short inventory: where tokens live, which primitives exist, which
spacing base and type scale the code actually uses.

## 2. Pick a branch

| Situation | Branch |
| --- | --- |
| `DESIGN.md` or a documented component system exists | **Follow.** Use it as written. Update it first only when the request needs a new token, primitive, state, or motion rule. |
| UI exists but no written system | **Preserve.** Treat the code as the system. Reuse the tokens and primitives you inventoried. Write `DESIGN.md` only if the user asks or the work needs new tokens; then extract from the code instead of inventing. |
| UI exists and the user asks to make its components refined, polished, or consistent while keeping the product's identity | **Refine.** Keep brand color and type family; strengthen the token layer, then refine shared primitives in place with their public API intact. Follow `component-refinement.md`. |
| No UI yet | **Greenfield.** Write a minimal `DESIGN.md` (section 3) before the first component. |
| User supplied a screenshot, mockup, or URL | **Reference.** Extract its tokens, layout geometry, copy, spacing, and states into `DESIGN.md`, then build reusable primitives against it. |

Missing `DESIGN.md` alone does not make a project greenfield. Refinement
keeps the identity and raises craft; redesign replaces the look. If the
request is ambiguous between the two, ask one question: refine the current
look, or replace it.

## 3. Minimal `DESIGN.md`

Keep it short and concrete. Every section names values the code will use.

1. **Color**: neutral ramp, primary, semantic (success, warning, danger, info),
   surface and text roles, light and dark values.
2. **Typography**: font stack, scale (display, h1 to h4, body, small, caption),
   weights, line heights, numeric style for data.
3. **Spacing and layout**: base unit (4 or 8 px), scale, container widths,
   breakpoints, grid.
4. **Shape and depth**: radii scale, border widths, shadow or elevation scale.
5. **Motion**: durations, easings, what moves and why, reduced-motion rule.
6. **Primitives**: the reusable components and their states (default, hover,
   focus-visible, active, disabled, loading, error, empty).
7. **Accessibility constraints**: contrast target, focus style, minimum hit
   size, keyboard paths.
8. **Sources and debt**: references, catalogs, and patterns used, with URLs;
   known deviations accepted for now.

## 4. Build rules

| Property | Use | Reject |
| --- | --- | --- |
| Color | token or CSS variable | raw hex, rgb, or Tailwind arbitrary color |
| Spacing | scale value | arbitrary pixel values |
| Type | scale step | ad-hoc font sizes |
| Radius, shadow | system token | one-off values |
| Component | existing primitive, composed | new div structure with inline styles |

When the design needs something the system lacks, add the token or primitive
to the system first, then use it.

## 5. Exit check

Before moving to visual QA, every answer is yes:

- Every visual value traces to a token.
- New components follow the existing composition pattern.
- New tokens or primitives are recorded where the system lives.
- Old and new components look like one product.
