# ELI5 communication contract

ELI5 means the reader begins with no vocabulary, context, or mental model. It
does not mean the reader is literally a child.

## Required frame

Every explainer should make these three answers visible without scrolling through
a long essay:

1. **What is it?** One sentence naming the job the thing performs.
2. **How does it work?** One picture with one primary reading path.
3. **What should I remember?** One sentence capturing the durable idea.

## Big pictures, few words

- Let the diagram carry the causal or structural explanation.
- Use short human-facing labels.
- Keep exact technical names as secondary labels when they matter.
- Prefer one strong example to a catalog of edge cases.
- Move optional detail below the main view or into reader-driven disclosure.
- Remove copy that merely repeats what the picture already shows.

Few words does not mean vague words. `Event bus`, `orders.created`, `POST /orders`,
and `source of truth` may be necessary. Introduce the plain-language idea first,
then show the exact term.

## Analogy rule

An analogy is optional and must help the reader predict the real system. Do not
use it as decoration.

A useful analogy states:

- what maps cleanly;
- where the analogy stops working.

Skip the analogy when it obscures ownership, durability, ordering, concurrency,
security, or failure behavior.

## Tone

- simple, direct, and respectful;
- no baby talk;
- no unexplained acronym piles;
- no decorative mascot or cartoon treatment unless requested;
- no false certainty introduced for the sake of simplicity.

## Layered labels

A node may use two layers:

```text
Plain-language role
Exact technical name or protocol
```

Example:

```text
Work waiting room
RabbitMQ · orders.created
```

The first line creates the mental model. The second preserves precision.
