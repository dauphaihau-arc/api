# Observability

This document explains what is currently wired in the ARC API local observability stack and how to verify that it is working.

## Summary

The local stack is configured for the three main signals:

| Signal | Producer | Pipeline | UI |
| --- | --- | --- | --- |
| Metrics | Nest API `/metrics` endpoint | Prometheus scrapes the API | Grafana Prometheus datasource |
| Logs | API and worker structured JSON logs | Promtail sends logs to Loki | Grafana Loki datasource |
| Traces | OpenTelemetry Node SDK | OTEL Collector forwards traces to Tempo | Grafana Tempo datasource |

Grafana is available at `http://localhost:3001` with `admin` / `admin`.

## Runtime Modes

There are two supported local modes.

### Host-run app with Docker infra

Use this for normal development:

```bash
just infra-up
just api-up-observability
just api-worker-up-observability
```

In this mode:

- Docker runs Postgres, Redis, MinIO, RabbitMQ, MongoDB when enabled, OTEL Collector, Prometheus, Loki, Promtail, Tempo, and Grafana.
- The API and worker run on the host in watch mode.
- Prometheus scrapes the host API through `host.docker.internal:3000`.
- The API and worker write JSON logs into `api/logs/*.log`.
- Promtail scrapes `api/logs/*.log` and sends those records to Loki.
- Traces are exported to `http://127.0.0.1:4318/v1/traces` when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set in `api/.env`.

### Full Compose stack

Use this when validating the container runtime:

```bash
just stack-up
```

In this mode:

- Docker runs the API and worker as `arc-api` and `arc-api-worker`.
- Prometheus scrapes the container API through `api:3000`.
- Promtail scrapes Docker logs for `arc-api` and `arc-api-worker`.
- API and worker traces are exported to `http://otel-collector:4318/v1/traces` through `api/.env.docker`.

## Components

| Component | Local URL | Purpose |
| --- | --- | --- |
| API metrics | `http://localhost:3000/metrics` | Prometheus-format application and process metrics |
| Prometheus | `http://localhost:9090` | Metrics storage and PromQL |
| Loki | `http://localhost:3100` | Log storage |
| Promtail | `http://localhost:9080` | Log shipper |
| Tempo | `http://localhost:3200` | Trace storage |
| OTEL Collector | `localhost:4317`, `localhost:4318` | OTLP gRPC and HTTP trace receiver |
| Grafana | `http://localhost:3001` | Metrics, logs, and traces UI |

Grafana datasources are provisioned from `infra/grafana/provisioning/datasources/datasources.yml`:

- `Prometheus`
- `Loki`
- `Tempo`

Grafana dashboards are provisioned from `infra/grafana/provisioning/dashboards/`, including the `ARC API Overview` dashboard.

## Metrics

The API exposes metrics at `/metrics` through `api/src/platform/observability/metrics.controller.ts`.

The current custom metric families include:

- `arc_http_requests_total`
- `arc_http_request_duration_seconds`
- `arc_db_queries_total`
- `arc_db_query_duration_seconds`
- `arc_redis_connection_errors_total`
- `arc_bullmq_jobs`

Default Node.js process metrics are also collected with the `arc_process_` prefix.

Prometheus is configured in `infra/prometheus/prometheus.yml` to scrape:

- `api:3000` for the full Compose stack
- `host.docker.internal:3000` for the host-run API

Useful PromQL checks:

```promql
up{job="arc-api"}
```

```promql
rate(arc_http_requests_total[5m])
```

```promql
histogram_quantile(
  0.95,
  sum(rate(arc_http_request_duration_seconds_bucket[5m])) by (le, route, method)
)
```

## Logs

The API and worker emit structured JSON logs through `nestjs-pino`.

Request logs include fields such as:

- `event`
- `requestId`
- `traceId`
- `spanId`
- `actorId`
- `http.method`
- `http.route`
- `http.statusCode`
- `http.durationMs`
- `runtime`
- `service`

Promtail is configured in `infra/promtail/config.yaml` to scrape:

- Docker logs from containers named `arc-api` and `arc-api-worker`
- host-run log files mounted from `api/logs/*.log`

Common Loki queries live in [observability-queries.md](./observability-queries.md).

## Traces

OpenTelemetry is loaded by the API npm scripts through `NODE_OPTIONS="--import ./instrumentation.mjs"`.

Tracing is enabled when:

```bash
OTEL_ENABLED=true
```

For host-run development, `api/.env.example` points traces at:

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces
```

For the full Compose stack, `api/.env.docker.example` points traces at:

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
```

The collector receives OTLP traces over gRPC and HTTP, then exports them to Tempo. Grafana can query Tempo directly through its provisioned datasource.

Loki is also configured with a derived field for JSON `traceId` values, so logs that include a 32-character trace ID can link to the matching Tempo trace.

## Verification

Use this checklist after starting either runtime mode.

1. Confirm the observability containers are running:

```bash
docker compose -p arc-api -f infra/docker-compose.yml ps
```

2. Confirm the API exposes metrics:

```bash
curl -s http://localhost:3000/metrics | head
```

3. Generate a request:

```bash
curl -i http://localhost:3000/health/ready
```

4. Confirm Prometheus sees the API:

Open `http://localhost:9090/query` and run:

```promql
up{job="arc-api"}
```

At least one target should be `1`. In host-run mode, the `host.docker.internal:3000` target should be up. In full Compose mode, the `api:3000` target should be up.

5. Confirm HTTP metrics are increasing:

```promql
arc_http_requests_total
```

6. Confirm logs reach Loki:

Open Grafana Explore at `http://localhost:3001/explore`, select the `Loki` datasource, and run:

```logql
{service="arc-api"}
```

7. Confirm traces reach Tempo:

Open Grafana Explore, select the `Tempo` datasource, and search recent traces after hitting one or more API endpoints. If logs include `traceId`, use the derived trace link from Loki to jump to Tempo.

## Known Limitations

- Prometheus has two scrape targets for the same job so both runtime modes work. One target is expected to be down when only one runtime mode is active.
- Host-run Loki ingestion depends on using `just api-up-observability` and `just api-worker-up-observability`; plain `just api-up` and `just api-worker-up` do not mirror logs into `api/logs/*.log`.
- Tempo retention is local and short-lived. The current local Tempo config keeps blocks for 24 hours.
- Sentry is optional and only sends errors when `SENTRY_DSN` is configured.
