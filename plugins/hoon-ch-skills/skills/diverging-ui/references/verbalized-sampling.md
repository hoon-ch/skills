# Verbalized Sampling For Frontend Design

This reference adapts the paper "Verbalized Sampling: How to Mitigate Mode
Collapse and Unlock LLM Diversity" to frontend design work.

## Paper Takeaways

- Aligned models can collapse toward familiar, high-typicality outputs.
- Instance-level prompts tend to return the most likely single answer.
- List-level prompts add variety, but without probabilities the list is treated
  like a flat set.
- Distribution-level prompts ask for candidates plus probabilities, which can
  better recover the model's broader learned distribution.
- The paper calls this method Verbalized Sampling.
- On the creative-writing tasks the paper measured, it reports stronger
  diversity, including a 1.6-2.1x lift over direct prompting, while preserving
  quality in the tested settings.
- Diversity can be tuned by asking for candidates below a probability
  threshold. Lower thresholds usually increase diversity, but very low
  thresholds can reduce stability or quality.
- Larger or more capable models tend to benefit more because the structured
  probability task is cognitively heavier.

## Frontend Design Translation

In frontend work, mode collapse often appears as familiar defaults:

- centered hero plus card grid
- generic SaaS dashboard cards
- purple or blue gradients
- identical rounded cards
- stock-like imagery with vague atmosphere
- design adjectives without layout or interaction consequences

Verbalized sampling makes these defaults visible. Instead of asking for "a good
design", ask for a distribution of plausible design directions and their
probabilities. The probability is not used as a truth claim; it is a forcing
function that exposes which ideas are likely defaults and which are plausible
non-defaults.

## Baseline Identification Template

Run this before selecting any direction.

```text
For this frontend task, identify the most predictable high-probability design.
Describe:
- the expected layout
- the expected typography
- the expected palette
- the expected component pattern
- the generic markers that would make it feel interchangeable

This is the baseline to avoid selecting unchanged.
```

## Default Sampling Template

```text
Generate 6 frontend design directions for:
<task>

Constraints:
<audience, product context, framework, existing design system, accessibility,
performance, brand, content, and implementation limits>

Return JSON with:
{
  "directions": [
    {
      "name": "...",
      "probability": 0.0,
      "typicality_score": 0.0,
      "why_this_probability": "...",
      "why_this_typicality": "...",
      "audience_fit": "...",
      "layout": "...",
      "visual_system": "...",
      "interaction_model": "...",
      "implementation_cost": "low|medium|high",
      "risk": "..."
    }
  ],
  "recommended_direction": "...",
  "quality_diversity_reason": "..."
}

The probability is the estimated likelihood of this direction relative to the
full distribution of plausible frontend designs for the task.

The typicality score is the estimated genericness of this direction from 0.0 to
1.0, where 1.0 means the most expected or template-like design.

The typicality score should usually track with probability. If a direction has
low probability but high typicality, explain why it is rare-yet-derivative. If
it has high probability but low typicality, explain why it is common-yet-not
generic.
```

## Tail-Tuned Template

Use this when the first pass still feels generic.

```text
Generate 6 more frontend design directions for the same task.
Each direction must have probability below 0.20 relative to the full
distribution of plausible frontend designs, while remaining usable,
accessible, and feasible for production.
Do not repeat previous directions.
```

For exploratory brand or concept work, `0.10` is acceptable. For production
dashboards, admin tools, forms, or domain-heavy applications, prefer `0.20` or
`0.30` so clarity is not sacrificed.

## Selection Checklist

- Did the workflow explicitly identify the generic baseline first?
- Does the selected direction serve the user workflow better than the default?
- Can it be implemented with the current framework and design primitives?
- Does the interface remain accessible and responsive?
- Are the visual choices specific enough to guide code?
- Are novelty and usability both represented in the decision?
- Can the final visual system be described as one coherent personality?

## What Not To Do

- Do not pick the lowest-probability idea automatically.
- Do not pick the lowest-typicality idea when it breaks hierarchy, legibility,
  functional clarity, or implementation feasibility.
- Do not treat verbalized probabilities as calibrated measurements.
- Do not let novelty override domain expectations.
- Do not show users a long sampling table when they asked for implementation.
- Do not use this method as a substitute for actual browser verification.
