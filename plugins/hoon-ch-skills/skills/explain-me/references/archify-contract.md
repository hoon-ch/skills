# Archify authoring and delivery contract

Archify supplies Explain Me's diagram taxonomy, typed source, renderer, and
validation/delivery workflow. The installed Archify package is authoritative;
this reference is the integration contract, not a replacement for its schemas or
local `SKILL.md`.

## Type router

| Type | Primary question |
| --- | --- |
| `architecture` | What parts exist and how are they connected? |
| `workflow` | What steps and decisions happen? |
| `sequence` | Who calls or messages whom, and in what order? |
| `dataflow` | Where does data come from, how does it change, and where does it go? |
| `lifecycle` | What states exist and what causes transitions? |

Choose one type. A second type should become a separate focused artifact.

## Candidate workflow

1. Locate the installed Archify root.
2. Read the selected type schema, `schemas/common.schema.json`, and one matching
   example.
3. Author a fresh candidate JSON with stable IDs and domain-specific facts.
4. Use `meta.quality_profile: "showcase"` for ordinary Explain Me output.
5. Begin with one main path, sparse labels, short side branches, and at most 12
   primary nodes.
6. Keep automatic routes and placement until diagnostics justify a manual control.
7. Validate after each change.
8. Deliver once the final candidate passes.
9. Run browser evidence against the exact delivered HTML.

Do not invent fields or copy facts from examples. The selected schema is the
contract.

## Commands

Use the executable inside the installed package:

```bash
node <archify-root>/bin/archify.mjs validate <type> <candidate.json> \
  --quality showcase --json

node <archify-root>/bin/archify.mjs deliver <type> <candidate.json> \
  <output.html> --quality showcase --json

node <archify-root>/bin/archify.mjs visual-check <output.html> --json
```

When the request is ambiguous and the installed version supports it:

```bash
node <archify-root>/bin/archify.mjs guide "<scenario>" --json
```

For repository-backed architecture diagrams, use the installed version's
`--repo-root` support only where its local contract permits it.

## Authoring rules inherited from Archify

- Preserve one obvious main path.
- Preserve meaningful relationship labels.
- Keep exact product names, identifiers, protocols, paths, and environment names.
- Use the requested language for authored content; renderer-owned UI may have a
  more limited locale surface.
- Static is the default. Motion is opt-in.
- Use examples for field shape, never for facts or IDs.
- Let diagnostics name the geometry problem and supported repair.
- Never accept an edge crossing an unrelated opaque node or a label masking a
  relationship.
- Do not edit a candidate after its final successful validation without running
  validation again.

Explain Me adds no separate geometry system. The Archify renderer, selected
schema, and diagnostics own placement and routing.

## Evidence for real repositories

When the picture claims to describe real code, inspect entrypoints, runtime
boundaries, storage, transports, and deployment configuration before authoring.
Record only facts actually verified. Never infer runtime causality from naming or
file proximity.

Keep a small source list outside the typed candidate unless the schema explicitly
provides a place for it. This prevents Explain Me from inventing fields that make
the candidate invalid.

## Proof boundaries

Keep these claims separate:

- `validate` proves the typed candidate and artifact checks reported by that run;
- `deliver` proves the exact delivered artifact passed Archify's deterministic
  delivery contract;
- `visual-check` proves bounded browser behavior for the delivered HTML;
- perceptual review requires actual inspection by a human or image-capable
  reviewer;
- repository or runtime correctness extends only to the sources and environment
  actually inspected.

A non-zero command is never success. A stale previously delivered file is not
proof that the current candidate passed.
