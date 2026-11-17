# Layout Recipes

`build.py` places everything by hand on a canvas of fixed width. These patterns
keep a growing layout correct.

## Engine API (`hd.py`)

Call `hd.init(inventory_path, width)` first, then `from hd import *`.

| Name | Use |
|---|---|
| `INV`, `META`, `VLAN`, `C` | inventory, its `meta`, VLANs by key, VLAN colors by key |
| `S.rect/text/line/trunk/arrow/pill/label/icon/add` | raw drawing; `S.add` takes raw SVG |
| `header(subtitle, title=None)` | title, subtitle (empty string = none), watermark, date |
| `device_card(x, y, w, h, icons, g, color, ...)` | folder-tab card; `g` has name, type, model, ip, optional internal, os |
| `tab_width(g)` | width of a card's folder tab; cable entry x = `x + tab_width(g) + 30` |
| `port(cx, y, p, sfp, w=None)` | switch jack + VLAN ticks; `p` = {untagged, tagged}; neither = unused |
| `jack`, `ticks` | bare jack, bare VLAN ticks |
| `hw_tile(hwi, x, y, w)` | hardware tile |
| `zone(x, y, w, h, color, title, sub, icon, tag)` | logical group panel |
| `speed_tag(x, y, text, color, anchor)` | small label on a cable |
| `route_levels(order, px, tgt, top, step)` | horizontal levels for fanned cables |
| `measure(s, size, weight)`, `fit(s, size, maxw)`, `tw(s, size, mono)` | text widths from the real fonts |
| `finish(height, name)` | background, `out/<name>[-unredacted].svg/.png` |

## Plan The Canvas

Use columns: a left column for Networks and Legend, a right column for side
panels, and the center for the physical chain top to bottom (internet →
firewall → switches → devices → hypervisors → clusters). Compute positions from
earlier sections (`SVY = DY + DEVH + gap`) instead of hard-coding every number,
so inserting a row shifts what follows.

## Cables From A Switch

1. Draw card boxes first, or at least compute their x positions; cables need
   targets.
2. Target x = right of the target card's folder tab.
3. `route_levels(order, PX, TGT, top, step)` gives each cable a horizontal level
   below the switch. It requires the left-going cables to come first in port
   order; it raises when they do not. Fix by reordering ports or moving cards.
4. Draw cables before jacks and cards so jacks sit on top.
5. Vertical lanes that pass a device row must run between cards. Make lane x
   depend on neighbouring card edges (`max(tab_entry, card_end + 16)`) because
   tab widths change with language.
6. Two LAG members that cross: nest them (left jack → right target at the
   deeper level).

## Guard Every Section

After each section, `assert` that it fits: ports inside the switch card, guests
inside the host card, side panels above the next row, cable levels above the
device tabs. Asserts turn silent overlaps into named failures.

## Look At The Result

Asserts do not catch everything. Open the PNG, then crop crowded regions with
`crop.py` (SVG units; the PNG is 1.2× by default). Check labels drawn over
cables, jacks covering card text, tags crossing other lanes, and text clipped at
card edges.

## Variants Without Forking

- Translation: copy `inventory.yaml` to `inventory.<lang>.yaml`, translate
  values and `labels`, and select it with a flag (`--ko`). Output names get the
  suffix.
- Scoped view: put the scope in the inventory (for example `fw_scope` with the
  VLANs, policies, and interfaces to keep) and filter `INV` right after
  `hd.init`. Skip whole sections with one flag and shift the rows below.
- Title-only variants: keep `variants: {name: {title: ..., subtitle: ""}}` in
  the inventory and append `-name` to the output.

## Hangul And Other Scripts

`hd.py` measures Latin runs with Fira and Hangul runs with Pretendard, and the
SVG font stacks name both. Other scripts fall back to whatever fontconfig picks;
add the font to `_KO_FONTS`-style tables in `hd.py` if widths drift. Korean
labels are often shorter or longer than English: re-check every lane and tab
after translating.

## Keep A Vendored Engine Current

Projects copy `hd.py`, `fetch_icons.py`, `to_excalidraw.py`, `crop.py`,
`doctor.py`, and the glyphs. After this skill changes, refresh them with
`scripts/new_project.py <dir> --engine-only`, render every variant, and diff
the SVGs against the previous output before committing.
