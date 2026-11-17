---
name: infra-diagram
description: Draw r/homelab-style infrastructure diagrams (SVG/PNG, optional Excalidraw) from a YAML inventory and a hand-placed Python layout. Use when asked to diagram a homelab, lab, server rack, or office network with VLANs, switch ports, link speeds, hypervisor hardware, VMs/containers, firewalls, or Kubernetes, or to update, translate, scope down, redact, or export such a diagram.
---

# Infra Diagram

Use this skill when the user wants a detailed, poster-style picture of real
infrastructure: internet edge, firewall, switches with per-port VLANs, cables
whose width is the link speed, hypervisors with hardware and guests, clusters,
and side panels (networks, legend, policies, port forwards).

Do not use it for small conceptual flows or sequences; a Mermaid diagram is
cheaper there.

A diagram is a self-contained project folder: `inventory.yaml` holds every
fact the picture shows, `build.py` places it, and a vendored engine (`hd.py`)
draws cards, ports, and cables. The project renders without this skill
installed.

## Quick Start

Run from this skill's directory. `<dir>` is the new project folder.

```bash
python3 scripts/new_project.py <dir>
cd <dir>
uv run --no-project --with-requirements requirements.txt python doctor.py
uv run --no-project --with-requirements requirements.txt python fetch_icons.py
uv run --no-project --with-requirements requirements.txt python build.py --unredacted
```

The starter renders an example lab to `out/diagram-unredacted.png`. Open the
PNG and look at it before changing anything.

## Workflow

1. **Gather facts.** Read the user's docs and inventories first, then fill gaps
   with read-only commands. Ask before touching any system. Record values you
   could not confirm as `n/a` instead of guessing. See
   `references/fact-gathering.md`.
2. **Write the inventory.** Replace the starter lab in `inventory.yaml`. Put
   every visible caption under `labels` so a translated copy changes every word.
   Add each service icon to `icons.yaml` and run `fetch_icons.py`.
3. **Lay it out.** Extend `build.py` one section at a time: give each card a
   box, route its cable with `route_levels`, and add an `assert` that fails when
   the section overflows. See `references/layout-recipes.md`.
4. **Render and look.** Render, open the PNG, and crop busy areas with
   `crop.py`. Check overlapping text, cables crossing cards or folder tabs,
   text running out of boxes, and empty gaps. Repeat until clean.
5. **Make variants when asked.** Translations, scoped views (for example, only
   what sits behind a firewall), and redacted copies come from the same layout.
   Filter the inventory in one place instead of forking `build.py`.
6. **Deliver.** Share the PNG; an SVG depends on the viewer's fonts. Before
   sharing outside the team, render without `--unredacted` and `grep` the SVG
   for the real domain, public IP, and anything private. Convert to Excalidraw
   only on request (`references/excalidraw.md`).

Follow the design rules in `references/design-rules.md` unless the user asks
otherwise.

## Reference Selection

- `references/fact-gathering.md`: interview questions and read-only commands
  for Proxmox, Kubernetes, switches, and firewalls.
- `references/design-rules.md`: visual conventions (line width, colors, cards,
  unknown values, redaction).
- `references/layout-recipes.md`: `hd.py` API, cable routing, i18n and Hangul
  fonts, scoped variants, keeping a vendored engine current.
- `references/excalidraw.md`: SVG to `.excalidraw` conversion and its limits.

## Failure Fallback

- `doctor.py` fails: install what it names (`rsvg-convert`, Fira Sans/Code,
  Pretendard for Hangul). `hd.py` refuses to run without Fira because every
  width calculation would be wrong.
- `missing icon '<name>'`: add `<name>: <dashboard-icons name>` to `icons.yaml`
  and rerun `fetch_icons.py`. When an icon does not exist upstream, use a
  `glyph-*` icon instead.
- `fetch_icons.py` reports 403/404: the name is wrong, or jsDelivr refused and
  raw GitHub also failed. Check the name against the dashboard-icons
  `tree.json`.
- An `assert` fires: the message names the section that overflowed. Move or
  resize that box; do not delete the assert.
- `route_levels` reports a left-going cable right of a right-going one: reorder
  the switch ports or move the target cards so the port order matches the card
  order.
- Text still overlaps in the PNG with no assert firing: crop that area, then fix
  the coordinates or shorten the inventory text.

## Examples

Start a diagram for a new lab:

```bash
python3 scripts/new_project.py ~/work/lab-diagram
```

Render the shareable copy (domain and public IP replaced) and check it leaks
nothing:

```bash
uv run --no-project --with-requirements requirements.txt python build.py
grep -c "real-domain.example" out/diagram.svg
```

Inspect a crowded region at full resolution (coordinates in SVG units):

```bash
uv run --no-project --with-requirements requirements.txt python crop.py out/diagram-unredacted.png 500 400 900 500 /tmp/crop.png
```

Refresh the vendored engine in an existing project after this skill changes:

```bash
python3 scripts/new_project.py <existing-dir> --engine-only
```
