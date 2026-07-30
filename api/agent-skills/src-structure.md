# Source Structure

Use this file when adding files, moving code, or deciding where new behavior belongs under `api/src`.

## Top-Level Ownership

- `bootstrap/` starts processes and composes the app.
- `platform/` contains runtime and framework plumbing.
- `domains/` contains business capabilities.
- `integrations/` contains external adapters and shared technical capabilities.
- `shared/` contains small generic primitives only.

## Placement Rules

- Put startup and process entry wiring in `bootstrap/`.
- Put Nest runtime concerns such as config, logging, request context, observability, health, transport plumbing, and idempotency in `platform/`.
- Put business workflows and domain-specific rules in `domains/<domain>/`.
- Put vendor-facing or replaceable technical adapters in `integrations/`.
- Do not put domain-specific behavior in `shared/`.

## Domain Module Shape

- For non-trivial domains, prefer `api/`, `app/`, `domain/`, and `infra/`.
- `api/` owns controllers, DTOs, serializers, and transport error mapping.
- `app/` owns use cases, orchestration, ports, and application errors.
- `domain/` owns domain rules, value objects, and domain errors.
- `infra/` owns persistence and implementation details.

## Dependency Direction

- `bootstrap/` may compose `platform/`, `domains/`, and `integrations/`.
- `platform/` must not own business workflows.
- `domains/` may depend on `shared/` and stable contracts from `integrations/` or other domains.
- `integrations/` must not own business decisions.
- `shared/` must not depend on domain modules.

## Hard Constraints

- Do not throw Nest HTTP exceptions from `app/` or `domain/`.
- Do not return ORM entities directly from controllers.
- Do not expose vendor SDK types across domain boundaries.
- Do not import another domain's `infra/` or persistence entities directly unless there is an explicit approved exception.
- Do not create vague dumping grounds such as broad `helpers` or `utils` folders without clear ownership.

## Shared Rules

- `shared/` is only for small stable generic code, such as result types, pagination primitives, and pure helpers.
- If a file mentions a business concept like user, workspace, document, membership, or publish, it probably does not belong in `shared/`.

## Default Bias

- Prefer small local edits over broad cleanup.
- Prefer extending an existing module over inventing a new shared abstraction.
- Prefer explicit boundaries over convenience.
