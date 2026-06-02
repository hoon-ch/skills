# Korean Style

Use this file when drafting or revising Korean technical writing.

## Clear subject

- Treat the reader or operator as the default actor when describing actions.
- Do not force tools, code, or systems to be the subject when a human action is clearer.
- Prefer active voice over passive voice.

Better:
- `이 명령어를 실행하면 데이터베이스를 초기화할 수 있습니다.`
- `변경 사항을 적용한 후 다시 빌드하세요.`

## Keep only necessary information

- Keep sentences short.
- Put one main idea in one sentence.
- Remove meta-discourse such as `앞에서 설명했지만`, `이제 알아보겠습니다`, `결론적으로`.

## Be concrete

- Prefer verbs over abstract noun phrases.
- Replace vague wording with exact behavior, conditions, and outcomes.
- Spell out units, defaults, limits, and state transitions when they matter.

Prefer:
- `배포를 수행합니다` -> `배포합니다`
- `영향을 받을 수도 있습니다` -> what exactly changes, and when

## Write natural Korean

- Remove unnecessary Sino-Korean and translation-style phrasing when a simpler verb works.
- Rewrite English-shaped noun phrases into natural Korean actions.
- Favor direct, plain wording over formal but heavy expressions.

## Stay consistent

- Use official product, API, framework, and language names.
- Expand an abbreviation on first mention, then reuse it consistently.
- Do not alternate between multiple words for the same action or object.
- Keep capitalization and spacing stable for English technical terms.

## Practical checks

- Can a busy engineer scan the sentence once and know what to do?
- Would a newcomer understand the sentence without guessing the actor?
- Is the wording precise enough to test or verify?
