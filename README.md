# ARC Ecommerce API

Backend API for the ARC ecommerce app, built with NestJS, MikroORM, PostgreSQL, Redis, and MinIO.

## Overview

This repository contains the backend API for the ARC ecommerce app and the local infrastructure needed to run it in development.

The codebase follows a modular Clean Architecture style with Domain-Driven Design influences, especially around domain boundaries, use cases, repository ports, domain errors, and event-driven decoupling.

Top-level structure:

- `api/` - NestJS application source, config, migrations, and scripts
- `agents/` - agent guidance, architecture notes, testing notes, and repo rules
- `infra/` - local Docker Compose services for Postgres, Redis, and MinIO
- `docs/` - supporting documentation and migration notes
- `seed-data/` - TSV seed files used for reference and demo data

## Implemented Patterns and Capabilities

### Architecture

- **Modular monolith** - the ARC ecommerce backend is delivered as a single NestJS application while keeping business capabilities separated into explicit domain and shared modules
- **Clean Architecture by module** - modules in `domains/` and `shared/` organize code into application, domain, and infrastructure boundaries with inward-only dependency flow
- **Use case and ports/adapters structure** - application behavior is organized as explicit use cases and application-layer ports so transport and infrastructure implementations remain replaceable
- **Value objects** - domain value objects encapsulate validation and invariants for core concepts such as email and permission keys
- **Request context propagation** - CLS-backed request context carries request, actor, session, locale, currency, and market metadata across request handling and async flows
- **Layered error model** - domain and application errors are mapped separately from transport concerns. See [`docs/layered-error-model.md`](docs/layered-error-model.md)
- **Event-driven side effects** - shared events and listeners decouple secondary reactions such as cache invalidation and welcome email handling from the initiating use case

### Commerce and Checkout

- **Quote-based checkout snapshots** - checkout persists a priced quote snapshot before order creation so downstream payment and support flows operate on stored pricing state instead of mutable cart state. See [`docs/checkout-quote-design.md`](docs/checkout-quote-design.md)
- **Multi-currency pricing** - the pricing model supports presentment currency, checkout currency, market-aware pricing, FX metadata, and stored pricing provenance. See [`docs/multi-currency/multi-currency-pricing-design.md`](docs/multi-currency/multi-currency-pricing-design.md)
- **FX rate synchronization** - exchange rates can be synced into the app and consumed through shared market services and rounding policy rules
- **Stripe checkout and refunds** - payment flows integrate with Stripe for checkout session creation, webhook processing, and refund handling
- **Transactional outbox for checkout** - checkout session creation is decoupled from the write transaction through durable outbox events and retryable post-commit processing. See [`docs/outbox-pattern.md`](docs/outbox-pattern.md) and [`docs/checkout-transactional-outbox.md`](docs/checkout-transactional-outbox.md)
- **Structured storage keys and asset processing** - uploaded product assets use predictable storage key conventions and image-processing flows. See [`docs/structured-storage-keys.md`](docs/structured-storage-keys.md)

### API and Security

- **REST-first API** - the main application surface is versioned REST endpoints under `/v1`
- **GraphQL surface** - a smaller GraphQL surface exists for user management and shares the same authorization model
- **JWT guards with cookie-backed sessions** - authentication uses JWT-based access control with cookie-managed access and refresh session flows
- **Role and permission model** - authorization is enforced through explicit permission checks and seeded access data
- **DTO validation plus config schema validation** - request DTOs use Nest validation, while environment configuration is validated with Zod at startup
- **Rate limiting** - Nest throttling protects the global API surface and sensitive endpoints
- **Idempotency keys on selected writes** - selected write endpoints can safely deduplicate repeated client requests and replay cached responses
- **SSE endpoints** - Server-Sent Events are available for user event streams and product inventory updates
- **Signed object access** - S3-compatible presigned URLs are used for controlled file access
- **Web push notifications** - the API supports push subscription registration, notification delivery, and queued push jobs

### Operations

- **Structured persistence** - MikroORM handles relational persistence with explicit migrations and repeatable seed flows
- **Dedicated worker process** - the app includes a separate worker entrypoint for BullMQ jobs, outbox processing, and scheduled tasks
- **Audit logging** - high-value product mutations can be persisted with actor and request metadata for business traceability
- **Structured logging with correlation IDs** - request and error logs include request and actor context to make API and async flows traceable across the system
- **Optimistic locking** - versioned entities reject stale concurrent writes against the latest persisted state
- **Health checks** - dedicated health endpoints support local verification and runtime readiness monitoring
- **Local-first infrastructure** - Docker Compose setup for Postgres, Redis, and MinIO keeps local development reproducible
- **Seeded environments** - reference and demo datasets support repeatable local setup and demos

## Stack

- NestJS 11
- MikroORM
- PostgreSQL
- Redis
- BullMQ
- MinIO / S3-compatible object storage
- Zod
- PNPM
- Docker Compose
- Just

## Requirements

- Node.js `22.x`
- PNPM `9.x`
- Docker
- Docker Compose
- `just`

## Getting Started

### 1. Start local infrastructure

```bash
just infra-up
```

This starts:

- PostgreSQL on `localhost:5432`
- MinIO API on `localhost:9000`
- MinIO Console on `localhost:9001`
- Redis on `localhost:6379`

### 2. Install dependencies

```bash
just api-install
```

### 3. Configure environment

Create `api/.env` from `api/.env.example` if it does not already exist.

```bash
cp api/.env.example api/.env
```

Update values as needed for your local environment.

### 4. Run the API

```bash
just api-up
```

Optional: run the background worker in a separate terminal.

```bash
just api-worker-up
```

## Useful Commands

```bash
just db-migration-up
just db-seed
just db-seed-demo
just storage-seed
cd api && pnpm test
```

## Additional Docs

- [`docs/checkout-transactional-outbox.md`](docs/checkout-transactional-outbox.md)
- [`docs/layered-error-model.md`](docs/layered-error-model.md)
- [`docs/outbox-pattern.md`](docs/outbox-pattern.md)
- [`docs/seeding.md`](docs/seeding.md)
- [`docs/structured-storage-keys.md`](docs/structured-storage-keys.md)
- [`seed-data/README.md`](seed-data/README.md)
