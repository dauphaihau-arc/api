# Local Dev Runtime Modes

This document explains how local development is intended to work in this repo, and why the `api` and `worker` services still exist in [infra/docker-compose.yml](../../../infra/docker-compose.yml).

## Summary

There are two valid local runtime modes:

- `Host-run app + Compose infra` is the default day-to-day development path.
- `Full Compose stack` is the containerized parity path.

The default path optimizes for faster coding and debugging. The containerized path exists for environment parity, integration validation, and troubleshooting behavior that depends on the container runtime.

## Recommended Default

For normal feature work and bug fixing:

```bash
just infra-up
just api-up-observability
just api-worker-up-observability
```

What this gives you:

- API and worker run on the host with watch mode.
- Postgres, Redis, MinIO, OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and related infra run in Docker.
- Traces go to the local OTEL collector.
- Metrics are scraped by Prometheus from the host-run API.
- Logs are mirrored into `api/logs/*.log` and scraped by Promtail into Loki.

Why this is the default:

- faster save-and-retry loop
- easier terminal debugging and breakpoint attachment
- lower rebuild friction
- observability stack still available in Grafana

## Full Compose Stack

When you want the API and worker inside containers too:

```bash
just stack-up
```

This enables the Compose `app` profile and starts:

- `api`
- `worker`
- all infra and observability services

Use this mode when you want:

- container-runtime parity
- verification of `.env.docker`
- validation of container networking and startup behavior
- a reproduction path closer to deployment

Tradeoffs:

- slower rebuild loop
- no watch-mode inner loop by default
- more Docker friction during active coding

## Purpose of `api` in Compose

The `api` service in [infra/docker-compose.yml](../../../infra/docker-compose.yml) is not the primary day-to-day dev process anymore. Its role is:

- provide a containerized HTTP API runtime
- validate the Docker image build and startup path
- verify `.env.docker` and container-only assumptions
- support full-stack local parity testing

It is behind the `app` profile so `just infra-up` does not bind port `3000` and conflict with the host-run API.

## Purpose of `worker` in Compose

The `worker` service exists for the same reason, but for async/background behavior:

- run BullMQ jobs in the containerized runtime
- verify queue processing under `.env.docker`
- validate background execution with container networking and service discovery
- reproduce worker-specific issues that do not appear in host mode

Keeping `worker` in Compose matters because queue and outbox behavior often fails differently from request/response API paths.

## Why Keep `api` and `worker` in Compose At All

If host-run is the default, it is reasonable to ask why these services still exist in Compose.

They remain useful for:

- image build validation
- startup parity checks
- debugging host-vs-container differences
- CI-like local reproduction
- onboarding a fully self-contained local stack

Without them, the repo would lose an easy way to answer: "does this failure only happen in the containerized runtime?"

## Choosing a Mode

Use `Host-run app + Compose infra` when:

- you are actively writing code
- you want the fastest reload cycle
- you want Grafana and tracing, but not rebuild-heavy Docker app loops

Use `Full Compose stack` when:

- you are validating runtime parity
- you suspect container-only behavior differences
- you want to verify the Docker image and `.env.docker`
- you are reproducing an issue closer to deployment

## Operational Notes

- `just infra-up` starts infra plus observability only.
- `just stack-up` starts infra plus the `api` and `worker` services.
- `just api-up` and `just api-worker-up` still exist if you want host-run processes without log mirroring into Loki.
- `just api-up-observability` and `just api-worker-up-observability` are the preferred host-run commands when you want Grafana/Loki/Tempo/Prometheus in the loop.
