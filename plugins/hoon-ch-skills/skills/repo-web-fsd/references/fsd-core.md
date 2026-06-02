# FSD Core Rules

Use this file for the generic FSD rules that apply in both modes.

## Contents

- Layer Duties
- Import Rules
- Query And State Placement
- Naming
- Public API Pattern
- Placement Heuristics
- Red Flags
- New Module Checklists

## Layer Duties

- `app`
  - Next.js App Router entry layer
  - app initialization, providers, layout, global styles
  - replaces generic FSD `pages`
- `widgets`
  - independent UI sections that compose lower layers
  - page sections, workbench panels, explorers, overlay blocks
- `features`
  - user scenarios and mutation-oriented business actions
  - create, update, delete, submit, save, manage
- `entities`
  - business entities and read-side access
  - query hooks, query key factories, entity-scoped stores
- `shared`
  - domain-agnostic utilities, libs, common hooks, and API clients

## Import Rules

- Allowed direction: upper layer imports lower layer
- `widgets` may import `features`, `entities`, `shared`
- `features` may import `entities`, `shared`
- `entities` may import only `shared`
- `shared` must not import any FSD layer
- direct feature-to-feature import is forbidden
- direct same-layer cross-slice import is forbidden unless the rule
  explicitly allows it through a lower shared dependency

## Query And State Placement

- TanStack Query read logic belongs in `entities/{entity}/api` and
  `entities/{entity}/model`
- query key factories live with entity API code
- mutation hooks belong in `features/{verb-noun}/model`
- widget-local UI state belongs in `widgets/{widget}/model`
- domain state belongs in `entities/{entity}/model`
- truly app-global UI state is the rare exception

## Naming

- entity folder: singular kebab-case
- feature folder: verb-noun kebab-case
- widget folder: kebab-case by UI block name
- query hook: `useThing` or `useThings`
- mutation hook: `useActionThing`
- store file: `use-{name}-store.ts`
- API file: `{entity}.api.ts`

## Public API Pattern

- each slice should expose a small public API through `index.ts`
- widgets export the main UI entry, not internal state
- features export the feature hook or feature UI that callers need
- entities export API/model helpers that other layers may consume

## Placement Heuristics

- If it combines multiple entities/features into a visible section, start
  at `widgets`.
- If it performs a user action with domain effects, start at `features`.
- If it only reads, shapes, or caches entity data, start at `entities`.
- If it has no domain meaning, start at `shared`.
- If it is only route entry, provider, layout, or page composition, keep
  it in `app`.

## Red Flags

- entity code calling mutation endpoints directly from UI components
- feature code importing another feature to reuse business logic
- shared module named after a domain concept
- widget exposing internal store as public API
- route component owning heavy business logic that should live in a lower
  layer

## New Module Checklists

### New Entity

- create `entities/{entity}/`
- add `api/{entity}.api.ts` for API functions and query keys
- add `model/use-{entity}.ts` for query hooks
- add `index.ts` public API

### New Feature

- create `features/{verb-noun}/`
- add `model/use-{action}-{entity}.ts` for mutation or action logic
- add `ui/` only if the feature needs dedicated UI
- add `index.ts` public API

### New Widget

- create `widgets/{widget-name}/`
- add `ui/{widget-name}.tsx` as the main entry
- add `model/use-{widget}-store.ts` only if widget state is needed
- add `index.ts` public API
