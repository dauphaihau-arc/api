# ARC Ecommerce API

Backend API for the ARC ecommerce app, built with NestJS, MikroORM, PostgreSQL, Redis, optional MongoDB/Atlas Search, and MinIO.

## Overview

This repository contains the backend API for the ARC ecommerce app and the local infrastructure needed to run it in development.

The codebase follows a modular Clean Architecture style with Domain-Driven Design influences, especially around domain boundaries, use cases, repository ports, domain errors, and event-driven decoupling.

Top-level structure:

- `api/` - NestJS application source, config, migrations, and scripts
- `agents/` - agent guidance, architecture notes, testing notes, and repo rules
- `infra/` - local Docker Compose services for core dependencies and the observability stack
- `docs/` - supporting documentation and migration notes
- `perf/` - reusable local performance scenarios and runners
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
- **AI-assisted product copy generation** - seller workflows can generate draft product descriptions through a shared OpenAI-backed text generation service with domain-specific prompting
- **Stripe checkout and refunds** - payment flows integrate with Stripe for checkout session creation, webhook processing, and refund handling
- **Transactional outbox for checkout** - checkout session creation is decoupled from the write transaction through durable outbox events and retryable post-commit processing. See [`docs/outbox-pattern.md`](docs/outbox-pattern.md) and [`docs/checkout-transactional-outbox.md`](docs/checkout-transactional-outbox.md)
- **Structured storage keys and asset processing** - uploaded product assets use predictable storage key conventions and image-processing flows. See [`docs/structured-storage-keys.md`](docs/structured-storage-keys.md)

### API and Security

- **REST-first API** - the main application surface is versioned REST endpoints under `/v1`
- **OpenAPI and Scalar docs** - REST endpoints are exposed as generated OpenAPI JSON at `/docs/openapi.json` and browsable API reference at `/docs`
- **JWT guards with cookie-backed sessions** - authentication uses JWT-based access control with cookie-managed access and refresh session flows
- **Role and permission model** - authorization is enforced through explicit permission checks and seeded access data
- **DTO validation plus config schema validation** - request DTOs use Nest validation, while environment configuration is validated with Zod at startup
- **Rate limiting** - Nest throttling protects the global API surface and sensitive endpoints
- **Idempotency keys on selected writes** - selected write endpoints can safely deduplicate repeated client requests and replay cached responses
- **SSE endpoints** - Server-Sent Events are available for user event streams and product inventory updates
- **Authenticated WebSocket chat gateway** - Socket.IO-based realtime chat delivery is available on `/ws`, with cookie-authenticated connections, per-conversation authorization, and Redis-backed room fanout. See [`docs/chat-websocket-flow.md`](docs/chat-websocket-flow.md)
- **Signed object access** - S3-compatible presigned URLs are used for controlled file access
- **Web push notifications** - the API supports push subscription registration, notification delivery, and queued push jobs

### Operations

- **Structured persistence** - MikroORM handles relational persistence with explicit migrations and repeatable seed flows
- **Polyglot persistence for catalog read models** - the primary transactional system persists to PostgreSQL, while the product catalog can be projected into MongoDB for Atlas Search-backed storefront queries and recommendations
- **Dedicated worker process** - the app includes a separate worker entrypoint for BullMQ jobs, outbox processing, and scheduled tasks
- **Audit logging** - high-value product mutations can be persisted with actor and request metadata for business traceability
- **Structured logging with correlation IDs** - request and error logs include request and actor context to make API and async flows traceable across the system
- **Prometheus metrics and runtime instrumentation** - the API exposes `/metrics` and records HTTP, PostgreSQL, Redis, BullMQ, and process-level signals for local monitoring and alert-oriented dashboards
- **OpenTelemetry tracing pipeline** - the API exports traces through the local OpenTelemetry Collector into Tempo so request and async execution paths can be inspected end to end
- **Centralized local logs** - host-run and container-run logs can be aggregated through Promtail and Loki, then explored in Grafana alongside metrics and traces
- **Sentry error tracking** - API and worker runtimes can report captured exceptions to Sentry when `SENTRY_DSN` is configured
- **Provisioned observability stack** - Prometheus, Loki, Tempo, Grafana, and the OTEL collector are wired into the local Docker stack for reproducible troubleshooting
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
- OpenTelemetry Collector on `localhost:4317` and `localhost:4318`
- Loki on `http://localhost:3100`
- Promtail on `http://localhost:9080`
- Prometheus on `http://localhost:9090`
- Tempo on `http://localhost:3200`
- Grafana on `http://localhost:3001` (`admin` / `admin`)

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

### 4. Run the default local dev path

For the fastest edit/debug loop with the observability stack still available:

```bash
just api-up-observability
just api-worker-up-observability
```

These commands keep the API and worker on the host, mirror structured JSON logs into
`api/logs/*.log` for Promtail/Loki, and preserve stdout in your terminal.

### 5. Run the fully containerized stack instead

If you want container-runtime parity rather than host-run processes:

```bash
just stack-up
```

API docs are available after startup:

- Scalar UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`
- Prometheus metrics: `http://localhost:3000/metrics`
- Bull Board: `http://localhost:3000/ops/queues`
- Readiness probe: `http://localhost:3000/health/ready`
- Grafana Explore logs: `http://localhost:3001/explore`

Tracing and error monitoring can also be enabled:

- OpenTelemetry tracing loads from `api/instrumentation.mjs`
- Local OTLP traces can be sent to `http://127.0.0.1:4318/v1/traces`
- Set `SENTRY_DSN` to enable Sentry error tracking
- Optional local trace debugging: set `OTEL_TRACES_CONSOLE_EXPORTER=true`

The local observability stack is prewired as follows:

- Prometheus scrapes the API from `/metrics` for both container-run and host-run paths
- The API exports traces to the local OpenTelemetry Collector over OTLP/HTTP
- The collector forwards traces to Tempo
- The API and worker emit JSON logs to stdout through `nestjs-pino`
- Promtail scrapes Docker logs for `arc-api` and `arc-api-worker`
- Promtail also scrapes host-run log files from `api/logs/*.log`
- Loki stores those logs for Grafana Explore and dashboard use
- Grafana is provisioned with Prometheus and Tempo data sources and an `ARC API Overview` dashboard
- The containerized stack runs built `dist` entrypoints, so code changes require `just stack-up` again to rebuild images
- `just infra-up` starts infra plus observability without binding port `3000`
- Container env for `api` and `worker` is centralized in `api/.env.docker`, with only small Compose overrides where the services differ

Host-run commands remain available if you do not want log mirroring:

```bash
just api-up
just api-worker-up
```

For local SQL debugging, you can enable structured query logs in `api/.env`:

```bash
DB_LOG_QUERIES=true
DB_SLOW_QUERY_THRESHOLD_MS=250
```

`DB_LOG_QUERIES=true` logs all SQL queries. `DB_SLOW_QUERY_THRESHOLD_MS` logs only slow
queries when full query logging is disabled. Query logs include `requestId` and `traceId`
when available so they can be correlated with request logs and traces.

## Useful Commands

```bash
just db-migration-up
just db-seed
just db-seed-demo
just storage-seed
cd perf && just catalog-list
cd api && pnpm test
```

## Additional Docs

- [`docs/checkout-transactional-outbox.md`](docs/checkout-transactional-outbox.md)
- [`docs/layered-error-model.md`](docs/layered-error-model.md)
- [`docs/local-dev-runtime-modes.md`](docs/local-dev-runtime-modes.md)
- [`docs/observability-queries.md`](docs/observability-queries.md)
- [`docs/outbox-pattern.md`](docs/outbox-pattern.md)
- [`docs/seeding.md`](docs/seeding.md)
- [`docs/structured-storage-keys.md`](docs/structured-storage-keys.md)
- [`seed-data/README.md`](seed-data/README.md)
