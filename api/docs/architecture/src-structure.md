# Src Structure

## Top-Level Source Layout

```text
src/
├── bootstrap/
├── platform/
├── domains/
├── integrations/
└── shared/
```

### `bootstrap/`

Owns process startup and composition roots.

Typical contents:

- `app.module.ts`
- `index.ts`
- `worker.ts`

Put code here when it answers:

- how does the API process start?
- how does the worker process start?
- which modules are composed into the runtime?

Do not put business workflows here.

### `platform/`

Owns runtime and framework plumbing.

Typical contents:

- config and environment parsing
- logging setup
- request context
- observability and tracing
- health endpoints
- transport pipeline concerns such as decorators, filters, interceptors, and pipes
- transport foundations such as SSE or WebSocket wiring when they are runtime concerns

Put code here when it exists to make the application run, not to model business behavior.

Examples:

- request metadata propagation
- metrics endpoint exposure
- global exception mapping
- idempotency at the HTTP pipeline level

### `domains/`

Owns business capabilities.

Current examples include modules such as:

- `auth`
- `document`
- `favorite`
- `membership`
- `publish`
- `search`
- `teamspace`
- `user`
- `workspace`
- `workspace-preference`

Each domain should own:

- transport entrypoints for that business capability
- application workflows
- domain rules and types
- persistence and other implementation details specific to that domain

If code mentions product concepts like workspace, membership, document, publish state, or user behavior, it likely belongs in a domain.

### `integrations/`

Owns external adapters and shared technical capabilities reused by multiple domains.

Current examples include:

- `ai`
- `audit`
- `cache`
- `mail`
- `notification`
- `payment`
- `queue`
- `rate-limit`
- `storage`

These are not business domains. Their job is usually to:

- hide vendor SDKs
- expose stable technical seams
- provide capabilities consumed by domain workflows

If the code is mainly about talking to Redis, S3-compatible storage, email providers, payment providers, or queue backends, it likely belongs here.

### `shared/`

Owns small generic primitives only.

Good candidates:

- result types
- pagination primitives
- pure utility helpers
- small base error primitives

Bad candidates:

- anything tied to a business concept
- framework-specific runtime plumbing
- vendor-specific adapters

`shared/` should stay intentionally small. If it starts becoming a junk drawer, responsibilities are probably leaking out of `domains/`, `platform/`, or `integrations/`.

## Domain Module Pattern

For non-trivial domains, prefer this internal structure:

```text
<domain>/
├── api/
├── app/
├── domain/
├── infra/
└── *.module.ts
```

This is a scaling pattern, not a rule that every tiny module must have identical depth.

### `api/`

Transport-facing code only.

Typical contents:

- controllers
- DTOs
- serializers or response mappers
- transport-layer error mapping

Rules:

- keep external naming concerns here
- map request DTOs into internal inputs explicitly
- do not return ORM entities directly

### `app/`

Application-layer orchestration.

Typical contents:

- use cases
- ports
- application errors
- workflow-level services

Rules:

- coordinate the domain, repositories, and technical collaborators
- do not throw Nest HTTP exceptions here
- keep workflow boundaries explicit

### `domain/`

Business rules and domain-level types.

Typical contents:

- value objects
- domain errors
- invariants
- domain policies or domain services

Rules:

- no transport concerns
- no Nest-specific behavior
- no persistence details unless the type is truly part of the business model

### `infra/`

Implementation details for the domain.

Typical contents:

- persistence adapters
- ORM entities
- repository implementations
- outbound clients specific to that domain

Rules:

- hide implementation details behind ports when the app layer depends on them
- avoid leaking persistence entities across domain boundaries

## Dependency Direction

Use these as the default rules:

- `bootstrap/` composes the runtime
- `platform/` supports the runtime
- `domains/` own business behavior
- `integrations/` provide shared technical seams
- `shared/` provides small generic primitives

More concretely:

- `bootstrap/` may import `platform/`, `domains/`, and `integrations/`
- `platform/` should not own business workflows
- `domains/` may depend on `shared/` and stable contracts from `integrations/`
- `domains/` should prefer public contracts, ports, or events over importing another domain's `infra/`
- `integrations/` should not own business decisions
- `shared/` should not depend on domain modules

### Cross-Domain Boundary Rule

Domain modules may collaborate, but they should collaborate through behavior-shaped seams rather than private storage details.

Healthy examples:

- calling another domain through a port or exported application contract
- reacting to a domain event
- composing multiple domain workflows in a higher-level use case

Risky examples:

- importing another domain's ORM entity
- returning foreign persistence entities from an application port
- constructing another domain's entity directly inside a use case

Short rule:

- depend on another domain's capability
- do not depend on another domain's persistence internals

For a deeper explanation, examples, and review heuristics, see the Cross-Domain Infra Leakage note if it is added to this repo.

## Common Mistakes

Avoid these patterns:

- putting domain-specific behavior in `shared/`
- throwing HTTP exceptions from `app/` or `domain/`
- importing another domain's persistence entities directly without a very strong reason
- letting app-layer ports expose foreign ORM entities
- growing broad `helpers` or `utils` folders with unclear ownership
- putting business workflows into `platform/`
- letting `integrations/` accumulate domain orchestration

## Practical Decision Guide

When adding a new file, ask in order:

1. Is this startup/composition code?
2. Is this runtime/framework plumbing?
3. Is this business behavior for one domain?
4. Is this an external adapter or shared technical capability?
5. Is this truly generic and stable enough for `shared/`?

If the answer is unclear, prefer keeping the code local to the current domain before introducing a new shared abstraction.
