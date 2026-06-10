# Repository Conventions

Use this file when adding, reviewing, or refactoring repositories.

## Purpose

Repositories should stay narrow. They are persistence adapters behind ports, not a catch-all place for orchestration, transport shaping, or unrelated query models.

## Default Rules

- Split repositories by persistence responsibility when a class starts mixing unrelated behaviors.
- Prefer separating:
  - storefront/public reads
  - seller/backoffice reads
  - command or mutation flows
- When a repository is split by CQRS responsibility, name the concrete classes and files explicitly with `Query` or `Command`.
- Keep use case orchestration in use cases, not repositories.
- Keep HTTP, GraphQL, and transport exceptions out of repositories.
- Keep repository ports small and task-shaped. Do not grow a single port indefinitely just to reuse one concrete class.

## Query And Command Boundaries

- Read repositories may use SQL/read-model shaping when needed for performance or ranking.
- Command repositories should focus on loading aggregates, mutating them, and flushing changes.
- If a read path needs very different projection or ranking logic from another read path, prefer a separate query repository over branching a giant method.
- Prefer names like `MikroOrmStorefrontProductQueryRepository` and `MikroOrmProductCommandRepository` over ambiguous read-side names.

## Projection Guidance

- Treat projection and mapping helpers as a separate concern from persistence logic.
- Entity-to-read-model mapping can live beside a repository briefly, but extract it once:
  - the same projection is used by more than one repository
  - projection code becomes a large share of the repository
  - the repository starts mixing SQL/query decisions with transport-facing shaping
- Prefer explicit projector files with narrow names, for example:
  - `product-draft-summary.projector.ts`
  - `storefront-product.projector.ts`
- Repositories should call projectors; projectors should not perform their own database queries.
- Avoid mixing multiple audience projections in one class. Public/storefront projections and seller/draft projections usually change for different reasons.

## Product Module Rule

- Do not add new responsibilities to a monolithic `MikroOrmProductRepository`.
- For product persistence, prefer separate classes for:
  - storefront product queries
  - seller product queries
  - product commands and pricing writes
- If an existing port must stay stable temporarily, use a thin delegating adapter instead of keeping all logic in one concrete class.
