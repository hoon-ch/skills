---
name: nestjs-best-practices
description: NestJS best practices and architecture patterns for production-ready applications. Use when writing, reviewing, or refactoring NestJS modules, controllers, services, dependency injection, guards, DTOs, validation, database access, testing, microservices, deployment, security, or performance-sensitive NestJS code.
---

# NestJS Best Practices

Use this skill for NestJS implementation and review work. It wraps Kadajett's
NestJS rule set and keeps detailed examples in `references/rules/`.

## Quick Start

1. State that you are using this skill for NestJS-specific guidance.
2. Inspect the local NestJS code before applying any rule.
3. Read `references/rules/_sections.md` to choose the relevant category.
4. Read only the rule files needed for the current task.
5. Prefer the smallest code change that satisfies the rule and existing app style.

## Workflow

Use categories in this order when scope is open:

1. Architecture: `arch-*`
2. Dependency injection: `di-*`
3. Error handling: `error-*`
4. Security: `security-*`
5. Performance: `perf-*`
6. Testing: `test-*`
7. Database and ORM: `db-*`
8. API design: `api-*`
9. Microservices: `micro-*`
10. DevOps and deployment: `devops-*`

For targeted work, go straight to the matching rule:

- Input validation: `references/rules/security-validate-all-input.md`
- Guards and authorization: `references/rules/security-use-guards.md`
- DTO serialization: `references/rules/api-use-dto-serialization.md`
- Constructor injection: `references/rules/di-prefer-constructor-injection.md`
- Module boundaries: `references/rules/arch-feature-modules.md`
- Circular dependencies: `references/rules/arch-avoid-circular-deps.md`
- Database transactions: `references/rules/db-use-transactions.md`
- N+1 queries: `references/rules/db-avoid-n-plus-one.md`
- Testing modules: `references/rules/test-use-testing-module.md`
- Graceful shutdown: `references/rules/devops-graceful-shutdown.md`

When multiple rules apply, fix the highest-impact issue first and avoid broad
rewrites unless the user asked for a review or refactor.

## Failure Fallback

- If a rule conflicts with the existing project conventions, follow the project
  convention and mention the conflict.
- If a rule depends on a package that is not installed, use the project's
  existing dependency first.
- If the NestJS version or framework setup is unclear, inspect `package.json`
  and app bootstrap files before recommending code.
- If a rule would require an architectural migration, make the smallest local
  improvement and name the migration as follow-up.

## Examples

```text
Use this skill to review a NestJS controller for missing validation and unsafe response serialization.
```

```text
Use this skill to refactor a NestJS service that has circular dependencies and too many responsibilities.
```

```text
Use this skill to add e2e tests for a NestJS REST endpoint using the project's existing test setup.
```

Source: https://github.com/Kadajett/agent-nestjs-skills, version 1.1.0.
