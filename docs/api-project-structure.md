# API Project Structure

This document describes the filesystem structure of the API app in [api](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api) and the layering conventions used inside it.

## Top-Level Layout

```text
api/
├── database/      # migrations and seed scripts
├── dist/          # build output
├── logs/          # local runtime logs
├── scripts/       # operational and maintenance scripts
├── src/           # application source
├── test/          # e2e / test config
├── package.json
└── tsconfig*.json
```

## Important Top-Level Directories

### `src/`

Main application source.

- [src/index.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/index.ts): HTTP API bootstrap
- [src/worker.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/worker.ts): worker bootstrap
- [src/modules/app.module.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/app.module.ts): root Nest module

### `database/`

Database lifecycle assets.

- `database/migrations/`: MikroORM migrations
- `database/seeds/`: seed data and seed helpers

### `scripts/`

One-off or operational scripts such as catalog refresh, storage upload, Redis cleanup, and other local/admin tasks.

### `docs/`

Project documentation for architecture decisions, flows, storage, pricing, seeding, and feature-specific behavior.

## `src/` Structure

```text
src/
├── common/
├── config/
├── libs/
└── modules/
```

### `common/`

Cross-cutting application utilities and framework glue.

Examples:
- `application/`
- `database/`
- `decorators/`
- `docs/`
- `errors/`
- `filters/`
- `ids/`
- `interceptors/`
- `jobs/`
- `listeners/`
- `logging/`
- `pipes/`
- `sentry/`
- `utils/`

### `config/`

Configuration builders and environment parsing, such as app env, database, storage, catalog, marketplace, and CORS config.

### `libs/`

Local library code shared inside the API app when it does not fit a domain or shared module directly.

### `modules/`

The main organizational unit of the codebase.

- `modules/domains/`: business capabilities
- `modules/shared/`: technical/shared platform capabilities
- `modules/app.module.ts`: composition root for the app runtime

## Module Split

### `modules/domains/`

Business modules such as:

- `auth/`
- `cart/`
- `category/`
- `chat/`
- `coupon/`
- `order/`
- `product/`
- `shop/`
- `user/`

Each domain module owns its use cases, transport layer, persistence adapters, and domain-specific rules.

### `modules/shared/`

Technical capabilities reused by multiple domains, such as:

- `audit/`
- `cache/`
- `currency/`
- `health/`
- `idempotency/`
- `image-transform/`
- `mail/`
- `marketplace/`
- `notification/`
- `observability/`
- `payment/`
- `queue/`
- `rate-limit/`
- `request-context/`
- `sse/`
- `storage/`
- `ws/`

These modules are infrastructure or platform support, not business domains.

## Domain Module Internal Pattern

The domain modules generally follow a layered structure influenced by Clean Architecture and DDD.

Using [src/modules/domains/product](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product) as the reference example:

```text
product/
├── api/        # REST controllers, DTOs, presenters, response models
├── app/        # use cases, ports, services, app errors, app events
├── domain/     # domain enums and domain concepts
├── infra/      # persistence, search, projection, external adapters
├── listeners/  # event listeners wired to the module
└── product.module.ts
```

### `api/`

Transport-facing code only.

The main organizing axis is usually feature or endpoint boundary first, role second.

This is a reference pattern, not a requirement that every module must match the `product` layout exactly.

For example, in `product/api/rest/` the structure is grouped by endpoint surface:

```text
api/rest/
├── storefront/
├── recommendations/
├── activity/
├── uploads/
└── internal/
```

Inside each boundary folder, add role-specific subfolders only when they are helpful, such as:

```text
storefront/
├── dto/
├── presenters/
└── responses/
```

So the preferred rule is:
- first group by feature, endpoint surface, or consumer boundary
- then group by role (`dto`, `presenters`, `responses`) only inside that feature folder

Avoid flattening all DTOs, presenters, and responses for the whole module into one shared `api/rest` folder unless the module is extremely small.

### `app/`

Application-layer orchestration.

Typical contents:
- `use-cases/`: one folder per use case
- `ports/`: abstract contracts for repositories and external collaborators
- `services/`: workflow and coordination logic
- `errors/`: application errors
- `events/`: application event contracts
- `config/`: module-local app configuration

### `domain/`

Domain-level types and rules that should stay independent from transport details.

In this codebase this is often enums and closely related domain concepts.

### `infra/`

Concrete implementations of ports and infrastructure details.

Here too, the main organizing axis is usually boundary or technology first, then role second.

Again, this is a preferred scaling pattern, not a rule that every module must have the same depth or folder count as `product`.

For example, the `product` module follows patterns like:

```text
infra/
├── persistence/
│   └── mikro-orm/
│       ├── entities/
│       ├── reads/
│       └── repositories/
├── catalog/
│   └── mongo/
│       ├── access/
│       ├── documents/
│       └── repositories/
├── search/
│   └── atlas/
│       └── repositories/
└── projection/
```

So the preferred rule is:
- first group by infrastructure boundary or backing technology
- then group by role inside that boundary (`entities`, `repositories`, `documents`, `reads`, `access`)

This keeps persistence, search, projections, and external store adapters separated by concern instead of mixing all repositories or all entities at the same level.

### `listeners/`

Consumers of internal application events that trigger follow-up work such as cache invalidation, SSE forwarding, notifications, or projection updates.

## File Organization Conventions

### Use cases

Use cases usually live in their own folder:

```text
app/use-cases/set-product-images/
├── set-product-images.use-case.ts
└── set-product-images.use-case.spec.ts
```

This keeps behavior and tests close together.

### Ports and adapters

Ports live under `app/ports/`, while concrete implementations live under `infra/...`.

Example pattern:

```text
app/ports/storefront-product-query.repository.ts
infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository.ts
infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts
```

This allows the application layer to depend on contracts while `product.module.ts` chooses implementations.

### Feature-first before role-first

A useful shorthand for this codebase:

- `api/rest`: feature or endpoint boundary first, role second
- `infra`: infrastructure boundary or technology first, role second
- `app/use-cases`: one use case per folder

That pattern scales better than organizing the whole module globally by file role alone.

## When To Introduce Boundary-First Folders

Do not force every module into the `product` shape up front.

Small or simple modules can stay flatter for a while. Introduce boundary-first folders when the current structure becomes noisy, messy, or starts mixing different audiences and concerns in the same place.

Good signals:

- one `api/rest` area is serving multiple audiences such as storefront, seller, and internal endpoints
- unrelated DTOs, presenters, or responses are accumulating in the same folder
- infra code for persistence, search, projections, and external stores starts colliding
- readers cannot tell ownership or audience from the path alone
- one folder requires constant scrolling to find the right feature slice

Practical rule:

- if a module is still small and obvious, keep it simple
- if a module starts mixing boundaries or audiences, split by feature or boundary first
- only add role folders like `dto/`, `presenters/`, `responses/`, `repositories/`, or `entities/` when they improve clarity inside that boundary

So `product` should be treated as a strong reference for a large module, not as a mandatory template for every domain.

## Runtime Composition

The application is composed in [src/modules/app.module.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/app.module.ts).

At a high level it:
- loads global config
- configures logging
- configures MikroORM
- imports shared modules
- imports domain modules

Module-level DI decisions happen inside each domain module, for example [src/modules/domains/product/product.module.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/product.module.ts).

## Practical Navigation Tips

- Start at `src/modules/app.module.ts` to see global composition.
- Start at `src/modules/domains/<domain>/<domain>.module.ts` to understand one domain.
- Read `api/` when you care about HTTP behavior.
- Read `app/use-cases/` when you care about business workflows.
- Read `app/ports/` to find boundaries and expected collaborators.
- Read `infra/` to see actual persistence or external implementations.
- Read `scripts/` for operational tasks that run outside the request lifecycle.

## What Not To Treat As Source Of Truth

- `dist/` is generated output.
- `node_modules/` is dependency code.
- IDE folders such as `.idea/` are editor-specific.
