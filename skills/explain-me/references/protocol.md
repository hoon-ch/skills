# Explain Me Protocol

## Mode router

Choose one primary view before deep inspection.

| Mode | Center the visual on |
| --- | --- |
| `overview` | system boundary, major components, main path, durable state |
| `onboarding` | entrypoints, deployable units, change locations, local run path |
| `flow` | one request/event/data item end to end |
| `deployment` | processes, containers, zones, exposure, storage, ownership |
| `review` | strengths, failure paths, risks, ordered remediation |
| `change` | before/after topology, contract changes, migration, rollback |

Audience defaults to `mixed`. Use `novice` for minimal jargon and one carefully
bounded analogy; use `expert` for exact protocols, ownership, failure semantics,
and operational constraints. Split overview/detail when the selected question
needs more than nine primary components.

## Evidence contract

`evidence.json` is the factual ledger. `explainer.json` is a view over that
ledger. The visual is derived output.

Use these truth states only:

- `observed`: inspected at runtime in this session;
- `declared`: executable source/configuration says it exists;
- `intended`: prose, ticket, comment, or design says it should exist;
- `inferred`: reasoned conclusion from cited evidence;
- `unknown`: material question unresolved in scope.

Every component, relationship, finding, and next move must carry `claim_ids`.
Every claim should include `id`, `statement`, `state`, `confidence`, and sources.
File sources should include path plus narrow line ranges where available.
Observed sources must include observation time and the command or inspection
source. Inferred claims must state why the supporting evidence implies them.

Never resolve contradictions by averaging them. Keep separate claims and show the
conflict. Never promote intended/inferred state to observed. Do not store secret
values, credentials, raw personal data, or sensitive payloads; record only their
existence and architectural role.

Minimal ledger shape:

```json
{
  "schema_version": "1.0",
  "scope": {
    "root": ".",
    "revision": "<sha-or-unknown>",
    "included": [],
    "excluded": [],
    "runtime_access": "none|read-only|observed"
  },
  "claims": [
    {
      "id": "C-001",
      "statement": "The API publishes order.created after storing the order.",
      "state": "declared",
      "confidence": "high",
      "sources": [{"type":"file","path":"src/api.py","line_start":42,"line_end":51}],
      "supports": [],
      "conflicts_with": [],
      "sensitive": false
    }
  ]
}
```

## Analysis playbook

Inspect in this order unless the repository strongly suggests another bounded
path:

1. applicable repository instructions;
2. top-level README and deployment manifests;
3. process/container entrypoints;
4. configuration bindings, ports, routes, topics, storage names, mounts;
5. producer/consumer or client/server code proving important edges;
6. operational evidence such as health checks, metrics, alerts, and runbooks;
7. runtime state only when already authorized and safe.

Prefer deployment/configuration facts over filenames that merely sound
important. Confirm a relationship through an actual binding: import, client,
route, environment variable, service discovery, topic, table, bucket, selector,
port, mount, or command. Co-location in one manifest is not enough.

For data responsibilities classify stores explicitly as source of truth, durable
operational state, transport/log, cache, or rebuildable derived view. For async
flows inspect retry, acknowledgement, ordering, idempotency, poison-message, and
transaction/outbox boundaries when material.

Do not run untrusted repository code, installers, migrations, deployment
commands, or arbitrary network calls just to understand the system.

## Visual contract

The visual should be immediately readable and defensible from evidence.

### Complexity budget

- target density: roughly 4/10;
- preferred primary components: 6–9;
- maximum relationships: 12;
- focal components: at most 2;
- zones/boundaries: at most 3 in one overview;
- if the budget is exceeded, split overview + focused companion view.

Run the remove test before drawing: merge nodes that always travel together,
remove edges already obvious from containment, shorten repeated endpoint wording,
and omit architecture trivia that does not answer the selected mode.

### Layout grammar

Choose one dominant reading direction and keep it. Architecture overviews usually
read left-to-right; layered deployment views may read top-to-bottom.

Use rounded orthogonal connectors for off-axis relationships. Diagonal slants are
a failure. Straight lines are acceptable only when endpoints share an x or y
axis. Draw zones first, connectors second, nodes last.

When several connectors use the same node edge, give each a distinct attachment
point. Keep adjacent points at least 12px apart where geometry permits. Do not
stack paths on top of each other. If two relationships must cross, put a small
hop/bridge on the less important relationship; do not bridge both.

A connector must not transit behind an unrelated opaque node. Reroute it. Edge
labels need an opaque paper-colored mask and a visible 6–10px gap from the
stroke; never place vertical writing-mode text on a connector. Put legends below
the diagram rather than floating over the topology.

Use a restrained 4px grid for major coordinates, dimensions, and gaps. Keep
human-readable labels in normal sans text; reserve monospace for technical
sublabels such as ports, protocols, paths, topics, and commands. Do not use color
alone for truth state or failure semantics.

### Truth presentation

Emphasis and truth are independent. `focal: true` means editorial importance,
not stronger evidence. Pair truth state with a direct text cue or line style:
solid for observed/declared where appropriate; dashed plus explicit state label
for intended/inferred/unknown. If runtime was not inspected, say so visibly in
scope/omissions.

### Accessibility and portability

Standalone SVG should use `role="img"`, `aria-labelledby`, a first-child
`<title>`, a useful `<desc>`, unique IDs, and no external runtime dependency.
Keep output meaningful without JavaScript. If dark/light support is included,
both must remain legible. Do not claim visual inspection from XML validation.

## Output contract

Default sibling artifacts:

- `explainer.json`: machine-readable visual model;
- `evidence.json`: factual ledger;
- `explainer.svg`: portable visual;
- `explainer.html`: self-contained preview;
- `explainer.md`: concise reading guide, scope, caveats, and verification state.

A handoff should state the selected mode and audience, repository/runtime scope,
truth-state limitations, and which checks actually ran. Keep these claims
separate:

- model validation proves references/truth contract;
- SVG/XML validation proves structural artifact validity;
- browser evidence proves bounded runtime/view behavior;
- perceptual review proves a human or image-capable reviewer actually inspected
  readability and composition;
- runtime evidence proves only what was observed in the specified environment and
  time window.

Never report a check that was not performed. If evidence is incomplete, ship the
smaller truthful map with unknowns and omissions rather than inventing plausible
infrastructure.
