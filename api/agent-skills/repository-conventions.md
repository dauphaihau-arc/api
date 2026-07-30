# Repository Conventions

Use this file when adding, reviewing, or refactoring repositories.

## Purpose

Repositories should stay narrow. They are persistence adapters behind ports, not a catch-all place for orchestration, transport shaping, or unrelated query models.

## Default Rules

- Split repositories by persistence responsibility when a class starts mixing unrelated behaviors.
- Prefer separating:
  - public or consumer-facing reads
  - internal or operator-facing reads
  - command or mutation flows
- When a repository is split by CQRS responsibility, name the concrete classes and files explicitly with `Query` or `Command`.
- Keep use case orchestration in use cases, not repositories.
- Keep HTTP, GraphQL, and transport exceptions out of repositories.
- Keep repository ports small and task-shaped. Do not grow a single port indefinitely just to reuse one concrete class.

## Query And Command Boundaries

- Read repositories may use SQL or read-model shaping when needed for filtering, ranking, pagination, or performance.
- Command repositories should focus on loading aggregates, mutating them, and flushing changes.
- If a read path needs a very different projection, audience, or ranking strategy from another read path, prefer a separate query repository over branching a giant method.
- Prefer names like `MikroOrmPublicCatalogItemQueryRepository`, `MikroOrmAdminCatalogItemQueryRepository`, or `MikroOrmCatalogItemCommandRepository` over vague names such as `CatalogRepository`.

## Projection Guidance

- Treat projection and mapping helpers as a separate concern from persistence logic.
- Entity-to-read-model mapping can live beside a repository briefly, but extract it once:
  - the same projection is used by more than one repository
  - projection code becomes a large share of the repository
  - the repository starts mixing query decisions with transport-facing shaping
- Prefer explicit projector files with narrow names, for example:
  - `catalog-item-summary.projector.ts`
  - `public-catalog-item.projector.ts`
  - `admin-catalog-item-detail.projector.ts`
- Repositories should call projectors; projectors should not perform their own database queries.
- Avoid mixing multiple audience projections in one class. Public, internal, partner, and backoffice projections usually change for different reasons.

## Scaling Rule

- Do not keep adding responsibilities to a monolithic repository once a module has distinct read and write paths.
- For growing modules, prefer separate classes for:
  - public or consumer queries
  - internal or operator queries
  - command or mutation persistence
  - specialized read models that depend on different storage or projection strategies
- If an existing port must stay stable temporarily, use a thin delegating adapter instead of keeping all logic in one concrete class.
