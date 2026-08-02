# Common Rules

Use this file for cross-cutting rules that apply to all API changes.

## Goal

Make correct, minimal, maintainable changes that follow the existing architecture. Optimize for correctness and reviewability, not the number of files changed.

## Scope

- Do not perform unrelated cleanup or refactoring.
- Preserve existing behavior unless the task explicitly changes it.
- Preserve external API contracts unless the task explicitly changes them.

## NestJS

- Keep controllers thin.
- Controllers handle transport concerns only.
- Providers must use constructor injection.
- Avoid service locator patterns.
- Do not import internal providers across module boundaries.
- Configuration must come from validated configuration providers.

## Boundaries

- Keep `domain`, `app`, `api`, and `infra` responsibilities separated.
- Do not move business logic, transport mapping, or persistence concerns across layers casually.

## TypeScript

- Do not use `any`, `@ts-ignore`, or non-null assertions to hide type errors.
- Prefer explicit domain types over primitive strings and numbers where the distinction is important.
- Do not leave floating promises unless they are intentionally detached and documented.
- Do not use inline `import()` type annotations in type positions. Import types explicitly with `import type { ... }` or create local type aliases instead.

## File Layout

Preferred order:

1. Imports
2. Constants / types
3. Exported API (class/functions)
4. Private helper functions


## Validation

- Validate untrusted input at the boundary before it reaches domain logic.

## Errors

- Follow the layered error model.
- Do not map transport errors in `domain` or `app` layers.
- Map domain and application errors to HTTP responses only in the transport layer.

## Testing

- Behavior changes require tests according to `testing.md`.
- Do not merge behavior changes without adding or updating the relevant coverage.

## External Calls

- Use bounded timeouts for external calls.

## Database

- Never modify an already applied migration.
- Migrations must support rolling deployment.
- Destructive schema changes or bulk data updates require explicit approval.
- Use transactions when an operation must be atomic.
- Prefer repository-level access for ordinary domain reads/writes.
- Application services/use cases may inject `EntityManager` when they own a transaction boundary, need locking, coordinate multiple entities, or must pass the same transactional manager across collaborators.
- Avoid direct `EntityManager` use in pure domain policy services.

## Observability

- Add or preserve logs, metrics, or tracing when a change affects async work, external calls, or failure diagnosis.

## Approval Required

Stop and ask before making changes that:

- Perform destructive operations.
- Change authentication or authorization behavior.
- Change database schemas or migrations.
- Make schema changes that are not backward-safe.
- Add, remove, or upgrade dependencies.
- Modify infrastructure or deployment configuration.

## Completion Report

Include:

- Brief summary of changes.
- Key files changed.
- Tests and checks run, with results.
- Checks not run, with reason.
- Any compatibility, security, migration, or operational risks.
