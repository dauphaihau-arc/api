# ARC Ecommerce API

Backend API for the ARC ecommerce app, built with NestJS, MikroORM, PostgreSQL, Redis, and MinIO.

## Overview

This repository contains the backend API for the ARC ecommerce app and the local infrastructure needed to run it in development.

The codebase follows a modular Clean Architecture style with Domain-Driven Design influences, especially around domain boundaries, use cases, repository ports, domain errors, and event-driven decoupling.

Top-level structure:

- `api/` - NestJS application source, config, migrations, and scripts
- `infra/` - local Docker Compose services for Postgres, Redis, and MinIO
- `docs/` - supporting documentation and migration notes
- `seed-data/` - TSV seed files used for reference and demo data

## Applied Techniques

### Architecture

- **Modular monolith** - the ARC ecommerce backend is delivered as a single application while keeping business capabilities separated into explicit internal modules with clear boundaries
- **Clean Architecture by module** - modules in `domains/` and `shared/` organize code into clear application, domain, and infrastructure boundaries with inward-only dependency flow
- **Value objects** - domain value objects encapsulate validation and invariants for core business concepts such as email, keeping invalid state out of the domain model
- **Use case pattern** - application behavior is organized as explicit use cases per module, keeping business actions isolated, testable, and independent from transport or persistence details
- **Ports and adapters** - application-layer ports define stable contracts for repositories and services, allowing infrastructure implementations to evolve without changing use cases
- **Repository pattern** - application-layer repository ports isolate domain use cases from MikroORM persistence details through stable contracts
- **Request context propagation** - shared request context carries per-request metadata across application flows and async boundaries
- **Layered error model** - domain and application errors are separated explicitly, keeping business-rule failures distinct from use-case and orchestration errors. See [`docs/layered-error-model.md`](docs/layered-error-model.md)
- **Events and listeners** - shared events and listeners decouple cross-module reactions and background side effects from the initiating application flow
- **Background processing** - dedicated worker entrypoint for async jobs and queue-driven workloads
- **Consistent validation and typing** - DTO validation and schema-based runtime checks

### Security

- **JWT-based authentication** - Passport and JWT guards for protected API access
- **Role and permission model** - authorization enforced through explicit application rules and seeded access data
- **Rate limiting** - Nest throttling protects sensitive or high-cost endpoints
- **Signed object access** - S3-compatible presigned URLs for controlled file access
- **Environment-isolated secrets** - support for local `.env` and Infisical-backed runtime configuration

### Data Management

- **Structured persistence** - MikroORM-based data access with explicit migrations and seed flows
- **Transactional outbox** - durable outbox events decouple committed state changes from external side effects such as payment checkout session creation, enabling safe retry after commit. See [`docs/outbox-pattern.md`](docs/outbox-pattern.md)
- **Idempotency keys** - repeated client requests can be deduplicated safely through request-scoped idempotency handling and cached response replay
- **Structured storage keys** - object keys are generated from environment, visibility, domain path, collection, and asset type segments to keep uploaded assets predictable and organized. See [`docs/structured-storage-keys.md`](docs/structured-storage-keys.md)
- **Optimistic locking** - entity versioning protects concurrent updates by rejecting stale writes against the latest persisted state

### Operations

- **Audit logging** - high-value product mutations can be persisted with actor and request metadata for business traceability
- **Local-first infrastructure** - Docker Compose setup for Postgres, Redis, and MinIO
- **Queue processing** - BullMQ-backed worker process for async jobs
- **Structured logging with correlation IDs** - request and error logs include request, actor, and session context to make API and async flows traceable across the system
- **Health checks** - dedicated health endpoints support local verification and runtime readiness monitoring
- **Seeded environments** - reference and demo datasets for reproducible local setup

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
