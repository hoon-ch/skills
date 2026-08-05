# Documentation Modes

Use this reference after the compass identifies the page's primary mode.

## Contents

- [Tutorial](#tutorial)
- [How-to guide](#how-to-guide)
- [Reference](#reference)
- [Explanation](#explanation)
- [Separating mixed content](#separating-mixed-content)

## Tutorial

### Contract

Create a practical learning experience for a reader who is acquiring basic
competence. Take responsibility for the learner's safety, progress, and ability
to reach the promised result.

### Include

- A concrete, achievable result shown near the beginning
- One managed path with small actions and visible results
- Exact expectations after important steps
- Prompts that direct the learner's attention to meaningful changes
- Opportunities to repeat or safely restart the experience
- Only the tools, concepts, and actions needed for this learning encounter

### Avoid

- Alternative paths and optional choices on the main route
- Long conceptual explanations or exhaustive facts
- Assuming the learner can diagnose gaps independently
- Treating production work as a safe learning environment
- Claiming what the reader will learn instead of describing what they will do

### Language and shape

- Use collaborative, direct guidance.
- State what the learner will build or accomplish.
- Introduce one action at a time.
- Show or describe expected output.
- Point out what the learner should notice.
- Link to reference and explanation instead of interrupting the experience.

### Verify

Run the tutorial end to end in a clean environment. Where possible, observe a
representative newcomer using it. Treat confusion, unexpected output, and an
irrecoverable step as defects in the tutorial.

## How-to guide

### Contract

Help an already-competent practitioner achieve a specific real-world goal or
solve a recognizable problem.

### Include

- The goal, situation, or problem the guide addresses
- Preconditions that materially affect the route
- An executable sequence of actions and decisions
- Conditional branches for meaningful real-world variation
- Verification of the achieved result
- Warnings, rollback, or recovery when the task creates material risk

### Avoid

- Teaching basic competence
- A feature tour that merely exercises the product
- Background discussion during the task
- Exhaustive option catalogs copied from reference
- Artificial completeness beyond the reader's goal

### Language and shape

- Title the guide as the concrete outcome or problem.
- Use direct or conditional imperatives.
- Order actions to preserve the reader's working and thinking flow.
- Assume normal domain competence, while making task-specific hazards explicit.
- Link to reference for complete options and to explanation for rationale.

### Verify

Execute the guide against a disposable or staging environment that matches the
supported configuration. Never verify against production, shared, or customer
systems without explicit authorization. Confirm the observable goal, not merely
that each command ran. Exercise material branches, or label those that could
not be verified, including any skipped because they are destructive.

## Reference

### Contract

Provide authoritative facts that a practitioner can consult while working.
Describe the machinery precisely and without distracting instruction or
argument.

### Include

- Exact names, types, values, defaults, constraints, and behavior
- A consistent schema for sibling items
- Warnings and limitations needed for correct use
- Compact illustrative examples where they clarify facts
- Navigation and ordering that reflect the described system's structure

### Avoid

- Task walkthroughs
- Tutorials embedded as examples
- Design-history digressions and opinions
- Marketing language
- Inconsistent headings or field order across equivalent entries

### Language and shape

- State facts neutrally.
- Prefer predictable tables, lists, signatures, and fixed entry schemas.
- Mirror stable product relationships where that helps readers find facts.
- Keep examples subordinate to description.
- Link to task guidance and explanation rather than expanding into them.

### Verify

Compare reference entries with code, schemas, generated specifications,
configuration defaults, and supported versions. Check completeness independently
from accuracy; one does not imply the other.

## Explanation

### Contract

Deepen understanding of a bounded topic for a reader who is developing their
mental model away from the immediate pressure of a task.

### Include

- A clear topic boundary or motivating why question
- Context, causes, constraints, and consequences
- Connections to related concepts
- Design choices, alternatives, tradeoffs, and relevant history
- Reasoned perspectives, analogies, and counterexamples when useful

### Avoid

- Step-by-step task instructions
- Exhaustive machinery descriptions
- An unbounded essay that absorbs every related concern
- Presenting opinion as an objective product fact
- Hiding essential task or reference information inside discussion

### Language and shape

- Introduce the mental model and why the topic matters.
- Develop connections from multiple useful angles.
- Distinguish verified facts from interpretation and judgement.
- Bound the discussion explicitly.
- Link to tutorials, how-to guides, and reference for other needs.

### Verify

Check technical claims against the source of truth and test whether the account
actually clarifies relationships and reasons. Ensure opinions and alternatives
are attributed or framed as judgement.

## Separating mixed content

When a page contains multiple modes:

1. Identify the primary reader need promised by its title and opening.
2. Mark blocks that serve another need.
3. Keep only the minimum foreign-mode content required for safe continuity.
4. Move substantial blocks into appropriately titled pages.
5. Add links at the point where the reader's likely need changes.

Examples:

- Move API option catalogs out of a deployment how-to and link to reference.
- Move design rationale out of a tutorial and link to explanation.
- Turn an onboarding procedure for novices into a tutorial; retain production
  deployment as a separate how-to guide.
- Keep a short usage example in reference, but move the extended reasoning it
  inspires into explanation.
