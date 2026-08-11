# Observability Queries

Canonical Grafana Loki queries for the ARC API local observability stack.

Use these in Grafana Explore with the `Loki` datasource selected.

## API logs

All API logs:

```logql
{service="arc-api", runtime="api"}
```

API errors only:

```logql
{service="arc-api", runtime="api", level="error"}
```

HTTP request exceptions:

```logql
{service="arc-api", event="http.request.exception"}
```

Failed HTTP requests:

```logql
{service="arc-api", event="http.request.failed"}
```

Completed HTTP requests:

```logql
{service="arc-api", event="http.request.completed"}
```

## Worker logs

All worker logs:

```logql
{service="arc-api", runtime="worker"}
```

Worker errors only:

```logql
{service="arc-api", runtime="worker", level="error"}
```

Queue job failures:

```logql
{service="arc-api", runtime="worker"} |= "queue.job.failed"
```

Queue job starts:

```logql
{service="arc-api", runtime="worker"} |= "queue.job.started"
```

## Investigation patterns

Search by request ID:

```logql
{service="arc-api"} |= "req-123"
```

Search by route:

```logql
{service="arc-api"} |= "/v1/orders"
```

Search for order-related activity:

```logql
{service="arc-api"} |= "orders"
```

Search for one actor:

```logql
{service="arc-api"} |= "\"actorId\":\"user-123\""
```

Search for one trace ID:

```logql
{service="arc-api"} |= "\"traceId\":\"abc123\""
```

## Usage notes

- Start with a short time range such as `Last 15 minutes` or `Last 1 hour`.
- Filter by `service` and `runtime` first, then narrow by `level` or `event`.
- Use metrics to detect spikes, traces to find latency, and logs to inspect exact request or job context.
