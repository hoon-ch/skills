# Design Rules

Keep these unless the user asks otherwise. They come from the original
r/homelab diagram and from review rounds on real lab diagrams.

## Lines

- Line width is the negotiated link speed (`SPEED_W`: 10G, 2.5G, 1G, 100M).
  Put a small speed tag where the cable reaches a card.
- An access link uses its VLAN color. A tagged trunk is a light cable with a
  dark core (`S.trunk`). LAG members are separate cables with one `LAG · 2×10G`
  label.
- Only physical cables are solid. Dotted means over the internet or logical
  (tunnels, cloud services). A dashed arrow means a routed path, not a cable.
- When a speed is unknown, keep a 1G or 10G width that fits the hardware and tag
  the cable `n/a`.

## Cards

- Physical devices use the folder-tab card (`device_card`): tab `name · type`,
  body = icon, full model, `IP · hostname` in the VLAN color, OS and version.
- Card border = the device's VLAN color; devices on a trunk get the neutral
  `TRUNK_BORDER`.
- Hardware tiles (`hw_tile`) have the tan bar: label = part type, value = the
  part, sub = detail or `passthrough → <guest>`.
- Guest chips: name and note left, `VM/CT <id>` and size right, VLAN color bar
  on the left edge. Guests owned by another team get a dashed outline.
- Logical groupings (clusters, racks) use `zone`: tinted panel with title,
  subtitle, and a VLAN pill.
- Cables enter a card from above to the right of its folder tab.

## Content

- Show ports that are physically used. Unused ports are grey. Internal service
  ports appear only where they matter (forwards, NodePorts, LB IPs).
- Side panels: Networks (VLAN table) and Legend always; add policies, port
  forwards, tunnels, backups, or limits only when the user cares about them.
- Keep text plain and short. No marketing subtitles.
- Every visible caption lives in the inventory (`labels`), so a translated
  inventory changes every word. Keep identifiers (host names, interfaces, IPs,
  versions) untranslated.
- Ask the user for a terminology list when translating and apply it to every
  inventory, not just the first one.

## Redaction

- The default render replaces `meta.domain` and `meta.public_ip` with the
  placeholders from `redact`. `--unredacted` keeps them.
- Before a diagram leaves the team, `grep` the SVG for the domain, public IP,
  personal names, and anything else private. Redaction does not hide internal
  IPs or names; remove those from the inventory if they must not appear.
