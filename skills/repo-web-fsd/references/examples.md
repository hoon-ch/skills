# Paired Mode Examples

Use these examples when the answer is at risk of becoming generic or
when mode selection matters.

## Shared Shell Comparison

### Reusable sticky table shell

- prompt: "이 wrapper를 어디에 둬?"
- `design-system-on`: recommend the separate design-system package, for
  example `packages/ui`
- `design-system-off`: recommend `shared/ui` if the shell is genuinely
  reusable

### Reusable button

- prompt: "별도 디자인 시스템 없는 FSD 프로젝트면 공용 버튼은 어디에 둬?"
- `design-system-on`: separate design-system package
- `design-system-off`: `shared/ui`

## Local Composition Comparison

### Route-specific validation panel

- prompt: "이 validation 패널을 공용화할까?"
- both modes: keep it local unless it becomes a genuine shared contract

### Map or chart overlay

- prompt: "overlay는 shared인가 local인가?"
- both modes: keep it local because visualization and route semantics
  stay local

## Review Comparison

### Invalid feature-to-feature import

- problem: `features/a` imports `features/b`
- both modes: invalid
- answer shape: name the FSD violation first, then suggest extraction to
  `entities` or `shared`

### Invalid entity with mutation logic

- problem: `entities/*` owns create or update mutation hooks
- both modes: invalid
- answer shape: move mutation ownership to `features/{verb-noun}`

## Forward-Test Prompts

- "별도 디자인 시스템 없는 FSD 프로젝트면 공용 버튼은 어디에 둬?"
- "`packages/ui`가 있는 모노레포에서 이 wrapper를 어디에 둬?"
- "이 변경은 generic shared로 가야 하나 디자인 시스템 패키지로 가야 하나?"
- "이 import는 모드와 상관없이 FSD 위반인가?"

Expected behavior:

- the answer states the selected mode first
- no-design-system answers return `shared/ui` when the UI is genuinely
  reusable
- separate-design-system answers return the external shared package
- FSD import violations stay invalid in both modes
- UI behavior change answers still mention docs and regression evidence
