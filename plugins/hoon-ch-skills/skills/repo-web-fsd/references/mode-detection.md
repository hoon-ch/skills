# Mode Detection

Use this file when the workspace mode is not obvious.

## Choose `design-system-on` When

- the repo has a dedicated UI package such as `packages/ui`
- docs define shared/local ownership outside generic FSD `shared`
- docs talk about primitives, tokens, or design-governance rules
- shared visual contracts are expected to live outside app-local `shared`

## Choose `design-system-off` When

- there is no dedicated UI package
- there is no documented primitive ownership boundary
- reusable UI appears to live inside app-local `shared/*`
- the repo treats `shared/ui` as the main reusable UI surface

## Output Rule

Before giving placement advice, state:

1. the selected mode
2. the detection signal that justified it
3. the resulting ownership rule

Example:

- selected mode: `design-system-off`
- reason: no dedicated UI package, reusable UI lives in `shared/ui`
- ownership rule: generic reusable UI goes to `shared/ui`
