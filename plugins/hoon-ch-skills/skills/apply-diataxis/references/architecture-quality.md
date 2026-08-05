# Architecture and Quality

Use this reference when organizing multiple pages, remediating an existing
documentation set, or conducting a quality review.

## Contents

- [Build architecture from reader needs](#build-architecture-from-reader-needs)
- [Improve from the inside out](#improve-from-the-inside-out)
- [Connect modes without collapsing them](#connect-modes-without-collapsing-them)
- [Assess functional quality](#assess-functional-quality)
- [Assess deep quality](#assess-deep-quality)
- [Respect the limits of the framework](#respect-the-limits-of-the-framework)

## Build architecture from reader needs

Do not use the product's feature list as the only documentation architecture.
Features describe the machinery; they do not reveal whether a reader needs to
learn, complete a goal, look up facts, or understand a concept.

Use both dimensions where appropriate:

- Let reference mirror stable product or code structure.
- Let tutorials follow coherent learning journeys.
- Let how-to guides follow real user goals, even when they cross components.
- Let explanations group concepts and questions that build understanding.

Do not assume the four modes must become the top-level navigation. Topic,
product, audience, or platform groupings can sit above or below them. Preserve
the mode and purpose of each leaf page regardless of hierarchy.

## Improve from the inside out

Treat the framework as a guide for decisions, not a requirement to plan and
populate a complete four-part structure.

Use this loop:

1. Select the page or smaller unit currently in front of you.
2. Identify the user need it represents.
3. Determine how well its form, language, and content serve that need.
4. Choose one change that produces an immediate improvement.
5. Finish that one change and stop for review. Commit or publish only when the
   user asks.
6. When more work remains in scope, repeat with the next most evident
   opportunity after review.

Avoid creating empty tutorial, how-to, reference, and explanation directories.
Let repeated improvements expose where navigation and page movement are needed.
A documentation set can be useful and coherent at its present stage without
being permanently finished.

## Connect modes without collapsing them

Readers change needs while using a product. Support that movement with links:

- Tutorial to reference when the learner needs exact details
- Tutorial to explanation when the learner is ready for deeper reasoning
- How-to to reference for complete options or constraints
- How-to to explanation for rationale and tradeoffs
- Reference to how-to for goal-oriented use
- Explanation to practical guides when understanding should lead to action

Create overview pages when a subject has several modes. Describe what each
linked page helps the reader do; do not merge all content into the overview.

## Assess functional quality

Measure each property independently against the world the documentation claims
to describe:

- **Accuracy**: Facts match supported behavior.
- **Completeness**: The page contains what its declared purpose requires.
- **Consistency**: Terms, structures, and claims agree across the set.
- **Usefulness**: The material helps the intended reader.
- **Precision**: Conditions, units, defaults, states, and limits are exact.

Verify with code, schemas, commands, tests, supported environments, and the
running product. A page can satisfy one property while failing another.

## Assess deep quality

Judge these interdependent qualities against the human experience:

- The form fits the reader's current need.
- The page preserves attention and working flow.
- Information appears when the reader expects or needs it.
- Navigation supports the reader's likely next move.
- The document feels coherent and confident to use.

Deep quality is not reduced to a numeric checklist. Review the document from
the intended reader's situation and, where practical, observe representative
readers using it.

## Respect the limits of the framework

Diátaxis can expose functional gaps. For example, a reference structure that
mirrors the product can make missing entries visible, and removing a digression
from a tutorial can reveal a missing step. It does not itself guarantee factual
accuracy, completeness, accessibility, visual quality, localization quality,
or usability.

Combine the framework with:

- technical source verification
- runnable examples and environment tests
- accessibility and interaction review
- terminology and localization review
- user observation for important learning and task flows

Use Diátaxis to decide what job documentation must perform and how its parts
relate. Use the relevant engineering and design disciplines to prove that the
result performs that job correctly.
