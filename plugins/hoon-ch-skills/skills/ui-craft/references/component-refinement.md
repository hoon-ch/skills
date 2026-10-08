# Component Refinement

Use this when an existing project's components work but look clunky, and the
request is to make them refined and consistent with the design system
without replacing the product's identity. The unit of work is the shared
primitive, not individual screens: fix `Button` once and every screen that
uses it improves.

If the user wants a different look (new palette, new type, new layout
language), this is a redesign, not a refinement. Ask once, then follow the
greenfield or reference branch in `design-system-gate.md`.

## 1. Inventory

1. List the primitives and where they live (`components/ui`, `packages/ui`,
   a design-system package).
2. Count usage per primitive (imports or JSX occurrences) so work is ordered
   by impact.
3. Find visual debt with searches, not impressions:
   - raw colors, arbitrary Tailwind values (`[13px]`, `#hex`), inline styles
   - several radii, shadows, or font sizes doing the same job
   - call-site `className` or `style` overrides that fight the primitive
   - duplicated near-identical components (`Button`, `PrimaryBtn`, `ActionButton`)
4. Check state coverage per primitive: hover, focus-visible, active, disabled,
   loading, invalid, selected, empty.
5. Capture **before** screenshots: a primitive gallery if one exists
   (Storybook, a `/dev/ui` route), plus 2 to 3 high-traffic screens.

## 2. Diagnose

Write one line per primitive naming what makes it look clunky. Common causes:

| Symptom | Typical cause |
| --- | --- |
| Looks heavy | thick borders, dark drop shadows, saturated fills on large areas |
| Looks cheap | inconsistent radii, default focus outline, no hover or press feedback |
| Looks cramped or loose | spacing off the scale, mismatched control heights |
| Looks flat or confusing | hierarchy carried only by size; weak contrast between surface levels |
| Feels dead | state changes with no transition, or transitions on layout properties |
| Looks inconsistent | icon sizes and stroke widths vary; text and icon not optically aligned |

## 3. Strengthen the foundations first

Before touching components, make the token layer able to express a refined
result. Extend from what exists; keep the brand color and type family.

- **Neutral ramp** with enough steps for surface, raised surface, border,
  muted text, and text, in light and dark.
- **State washes** from one ink at several alphas (hover, selected, pressed)
  instead of new colors per state.
- **Borders** as low-alpha hairlines; **elevation** as a short, consistent
  shadow scale.
- **Radius family**: one small, one medium, one large, with nested radii
  derived from the outer radius minus padding.
- **Control sizes**: shared heights (for example 32, 36, 40 px) used by
  buttons, inputs, selects, and tabs so they align in a row.
- **Motion tokens**: 120 to 200 ms for state feedback, ease-out entering,
  ease-in leaving, reduced-motion fallback.
- **Focus ring** token used by every interactive primitive.

Record new tokens where the system lives and in `DESIGN.md`.

## 4. Refine primitives in place

Order: tokens → `Button`, `Input`/`Textarea`, `Select`/`Combobox`,
`Checkbox`/`Radio`/`Switch` → `Card`/surfaces → `Dialog`/`Popover`/`Tooltip`
→ `Tabs`/navigation → `Table`/lists → `Toast`/feedback. Adjust by the usage
counts from step 1.

For each primitive:

1. **Keep the public API.** Same props and variants, so call sites upgrade
   without edits. If an API change is unavoidable, migrate every call site in
   the same change.
2. Map every visual value to a token from step 3.
3. Fill missing states. Each interactive state gets a visible, distinct,
   token-based treatment.
4. Add feedback motion only where it signals something: press, toggle,
   open/close, selection moving. Animate `transform`, `opacity`, and color.
5. When the mechanism is non-trivial (gliding tab indicator, morphing select,
   toast stack), find the nearest pattern in `component-catalogs.md` (beUI
   motion primitives are a good first look for product controls), read its
   source, and rebuild the mechanism on the project's tokens.
6. Check accessibility while you are there: accessible name, keyboard path,
   hit size of at least 40 px on touch, contrast against the new surfaces.

## 5. Clean up call sites

- Remove call-site overrides that only existed to patch the old primitive.
- Merge duplicate components into the refined primitive.
- Leave intentional, documented exceptions; list them in `DESIGN.md` debt.

## 6. Verify

1. Show every variant and state of each refined primitive on one page
   (Storybook story or a dev-only gallery route) and capture it.
2. Capture the same screens as the **before** set, at desktop and phone
   widths, light and dark.
3. Compare before and after side by side and check for regressions: changed
   layout on call sites, clipped labels from new control heights, contrast
   drops on new surfaces.
4. Run the project's existing tests; refinement must not change behavior.

Follow `visual-qa.md` for the capture matrix, the fix round, and the report.

## 7. Scope large refinements

When there are many primitives, ship in slices that each leave the product
consistent: foundations plus the top 3 primitives first, then the rest.
State in the report which primitives are refined and which still use the old
treatment.
