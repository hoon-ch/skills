# Visual QA

UI work is done when its rendered result has been seen and its defects fixed.
Reading the diff is not verification.

## 1. Render

- Run the app the way the project documents (dev server, Storybook, preview
  build). If the full app cannot run, render the changed component in
  isolation and say so in the report.
- Use whatever browser automation the harness provides: a built-in browser
  tool, Playwright, a Chrome DevTools or browser MCP server, or a headless
  Chromium script. Prefer a real browser over static HTML inspection.

## 2. Capture matrix

Capture every changed surface at:

| Axis | Values |
| --- | --- |
| Width | desktop (1280 to 1440 px) and phone (360 to 414 px); add tablet when the layout has a tablet breakpoint |
| Theme | light and dark when the product supports both |
| State | default, hover, focus-visible, active, disabled, loading, empty, error, and long-content cases that the change touches |
| Scroll | top and scrolled-end for long pages; sticky elements in both positions |
| Motion | the animation driven through once, plus a pass with reduced motion enabled |

Skip a cell only when it does not apply, and name the skip.

## 3. Inspect

Check each capture for:

- overflow, clipping, overlap, and horizontal scroll at phone width
- blank, misframed, or collapsed regions
- text wrapping that breaks buttons, labels, or table cells
- contrast below the `DESIGN.md` target; focus ring missing or hidden
- values that do not match tokens (off-scale spacing, stray colors)
- inconsistency with neighboring existing components
- motion that does not signal anything, or that ignores reduced motion
- layout shift on load or on state change

## 4. Fix and confirm

1. Inspect the whole matrix once and collect every defect.
2. Fix them in one batch.
3. Re-capture only the affected cells once.
4. Stop. Remaining issues go into the report as open items instead of an
   open-ended polishing loop.

## 5. Report

```text
Seen: <routes or components> at <widths>, <themes>, <states>
Fixed: <defects found and fixed>
Not verified: <cells skipped and why>
Open: <known issues left for the user>
```

If no browser or screenshot tool was available, the report says
"Visual verification not performed" and lists the cells the user should
check by hand.
