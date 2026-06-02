# Document Types

Use this file when deciding what kind of technical document to write.

## Choose by reader goal

- Learn a new tool or flow: learning document
- Complete a task or solve an issue: problem-solving document
- Look up exact facts quickly: reference document
- Understand principles, background, or tradeoffs: explanation document

If one request mixes multiple goals, split it into multiple documents or clearly separated sections.

## Learning document

Use when the reader is new and needs a successful first run.

Core rules:
- Make the end result obvious from the start.
- Keep the main path free of avoidable failure.
- Explain in stages from simple to complex.
- Include runnable examples, commands, and prerequisites.

Default structure:
1. Overview and expected outcome
2. Prerequisites
3. Step-by-step setup or walkthrough
4. Runnable example
5. What changed and why it worked
6. Next steps or related guides

Checks:
- Can a first-time reader finish without guessing?
- Are commands and examples verified?
- Is non-essential depth moved out of the main path?

## Problem-solving document

Use when the reader has a concrete job to finish or a broken state to fix.

This category includes both how-to guides and troubleshooting docs.

Core rules:
- State the task or problem precisely.
- Give a fix or procedure the reader can apply immediately.
- Include commands, settings, code, logs, and environment differences when relevant.
- Separate symptoms, causes, and fixes.

Default structure for a how-to guide:
1. Goal and when to use this guide
2. Prerequisites
3. Steps
4. Verification
5. Common mistakes or rollback

Default structure for troubleshooting:
1. Symptoms
2. Likely causes
3. Fix steps
4. Verification
5. Related issues or deeper references

Checks:
- Can the reader tell whether this matches their problem?
- Does the guide provide an actionable fix, not only explanation?
- Are OS, version, and environment differences called out where needed?

## Reference document

Use when the reader wants exact facts fast: API fields, CLI flags, config keys, types, return values, limits, or examples.

Core rules:
- Be exact, complete, and current.
- Use the same structure for sibling items.
- Make scanning and lookup easy with headings, anchors, and tables when appropriate.
- Put critical setup information near the top if the reader needs it before using the reference.

Default structure:
1. Short overview
2. Authentication, prerequisites, or shared constraints
3. Item-by-item reference with a fixed schema
4. Verified examples
5. Errors, limits, or edge cases

Checks:
- Is anything missing that would block correct use?
- Are naming, types, defaults, and examples consistent?
- Can a reader find the needed item quickly?

## Explanation document

Use when the reader needs conceptual understanding, rationale, background, or tradeoffs.

Core rules:
- Explain why the concept exists and what problem it addresses.
- Provide background and decision context.
- Show relationships, flows, and mental models.
- Use diagrams, tables, or comparisons for complex ideas.

Default structure:
1. Overview of the concept
2. Why it exists
3. How it works
4. Tradeoffs or decision criteria
5. Related concepts and further reading

Checks:
- Does the reader leave with a stronger mental model, not just instructions?
- Is background knowledge introduced before advanced reasoning?
- Would a diagram or comparison reduce cognitive load?
