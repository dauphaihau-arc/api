# API Cron Jobs

The API exposes two authenticated POST endpoints for external schedulers:

- `POST /v1/internal/jobs/fx-sync`
- `POST /v1/internal/jobs/drain`

They exist because the API's background pollers only run in the worker process (`bootstrap/worker.ts`) and only when `QUEUE_DRIVER=redis`.
The current deployment declares a single free web service and no worker ([render.yaml](../../render.yaml:1)), so an external cron drives the same work over HTTP.

Both endpoints use header `x-cron-secret` and are excluded from Swagger and throttling.

## Endpoints

| Endpoint | Recommended schedule | Purpose |
| --- | --- | --- |
| `POST /v1/internal/jobs/fx-sync` | hourly (`0 * * * *`) | Fetch and store exchange rates when `FX_RATE_SYNC_PROVIDER` is enabled |
| `POST /v1/internal/jobs/drain` | every 5 minutes (`*/5 * * * *`) | Drain outbox events, refund reconciliation, and the payout run |

## Required API environment

| Variable | Used by | Notes |
| --- | --- | --- |
| `FX_SYNC_TRIGGER_SECRET` | `fx-sync` | Request fails with `503` when unset |
| `OUTBOX_DRAIN_TRIGGER_SECRET` | `drain` | Request fails with `503` when unset; `401` on mismatch |
| `QUEUE_DRIVER` | both | `inline` when no worker runs; `redis` when the worker process is deployed |
| `FINANCE_MONEY_EVENT_BOOKING` | `drain` | `inline` books paid/delivered/refunded events in their producer transaction; `outbox` (default) leaves them to the drain/worker |
| `FX_RATE_SYNC_PROVIDER`, `FX_RATE_SYNC_BASE_CURRENCIES` | `fx-sync` | Unchanged by the cron setup |

Production reads application environment variables through `infisical run` in the Render start command.
Add or rotate these keys in the Infisical `prod` environment before deploying; the Render service only stores the Infisical project, environment, and token.

Secrets must match on both sides: the API value and the value sent by the scheduler.
Rotate by updating both at the same time; the API rejects the old value immediately.

## Drain endpoint

```http
POST /v1/internal/jobs/drain?tasks=finance&limit=10
x-cron-secret: <OUTBOX_DRAIN_TRIGGER_SECRET>
```

### Tasks

Tasks run in this order, each isolated in its own try/catch:

| Task | Work |
| --- | --- |
| `finance` | `order.paid`, `order.refunded`, `order.delivered` outbox events |
| `checkout` | Checkout session outbox events (Stripe session creation retries) |
| `inventory` | `order.created` publication to the inventory service over RabbitMQ |
| `refunds` | Reconciliation of refunds whose provider webhook never arrived |
| `payout` | The monthly payout run; it self-checks whether the run day is due |

### Parameters

- `tasks` — comma-separated subset of `finance,checkout,inventory,refunds,payout`.
  Absent means all tasks. An unknown name returns `400`.
- `limit` — batch size per task, default `10`, clamped to `50`.
  A non-integer or a value below `1` returns `400`.

The endpoint has a 20-second wall-clock budget.
Tasks not started before the budget is spent are reported in `skipped` and run on the next tick.

### Response

```json
{
  "ok": true,
  "finance": 3,
  "checkout": 0,
  "inventory": 1,
  "refunds": 0,
  "payoutRun": {
    "runDay": "2026-10-15",
    "paidShopCount": 0,
    "blockedShopCount": 0,
    "skippedShopCount": 0
  },
  "failures": [],
  "skipped": []
}
```

- `200` — every requested task ran. Individual events that failed are recorded on their outbox row, not in `failures`.
- `500` — at least one task threw. The body has the same shape with `ok: false` and `failures`, so a scheduler can alert.
- `401` — missing or wrong secret.
- `503` — `OUTBOX_DRAIN_TRIGGER_SECRET` is not configured.
- `400` — invalid `tasks` or `limit`.

Ticks are safe to overlap:
`DurableOutboxProcessor.claim` takes a pessimistic row lock plus a 30-second lease, the payout run is guarded per platform month, and refund reconciliation only revisits refunds that are old enough.

## Cloudflare Workers

Both crons are standalone Workers under [`apps/api/cloudflare/`](../../cloudflare):

| Worker | Schedule | Destination |
| --- | --- | --- |
| `fx-sync-cron` | `0 * * * *` | `/v1/internal/jobs/fx-sync` |
| `outbox-drain-cron` | `*/5 * * * *` | `/v1/internal/jobs/drain` |

Each Worker stores its URL and secret with Wrangler:

```bash
cd apps/api/cloudflare/outbox-drain-cron
npm install
npx wrangler login
npx wrangler secret put DRAIN_URL
npx wrangler secret put OUTBOX_DRAIN_TRIGGER_SECRET
npm run deploy
```

`fx-sync-cron` uses `FX_SYNC_URL` and `FX_SYNC_TRIGGER_SECRET` instead.
Cron trigger changes can take up to 15 minutes to propagate after deploy.

### Free-tier notes

- Workers Free allows 5 cron triggers per account. These two use 2.
- A cron invocation may run for up to 15 minutes; waiting on the network does not count toward the 10 ms CPU limit.
- The drain Worker aborts its request after 90 seconds (`DRAIN_TIMEOUT_MS`), which covers a Render cold start plus the endpoint's 20-second budget.
- A 5-minute schedule keeps a free Render web service from spinning down, consuming roughly 744 of its 750 monthly free instance hours.

## Operating checks

Manual tick:

```bash
curl -i -X POST "https://<api>/v1/internal/jobs/drain" \
  -H "x-cron-secret: <OUTBOX_DRAIN_TRIGGER_SECRET>"
```

Narrow a manual tick while debugging:

```bash
curl -X POST "https://<api>/v1/internal/jobs/drain?tasks=finance&limit=25" \
  -H "x-cron-secret: <OUTBOX_DRAIN_TRIGGER_SECRET>"
```

Backlog and terminal failures:

```sql
select event_name, status, count(*)
from outbox_events
group by 1, 2
order by 1, 2;

select id, event_name, aggregate_id, attempt_count, last_error, available_at
from outbox_events
where status = 'failed'
order by updated_at desc
limit 20;
```

- Pending rows that remain after ticks mean the cron is not running, the secret is wrong, or the Worker is disabled.
- `failed` rows are terminal after 5 attempts (retry backoff 15s, 1m, 5m, 15m, 1h) and are not scanned again.
  Fix the cause, then re-arm one row manually:

```sql
update outbox_events
set status = 'pending', attempt_count = 0, available_at = now(), last_error = null
where id = '<event-id>';
```

## Relationship to the background worker

When the API is deployed with `QUEUE_DRIVER=redis` and the worker process runs (`start:worker:prod`), the in-process pollers own these pipelines.
The drain endpoint stays useful for manual repair and for resuming a backlog, but its cron can be disabled or slowed down to reduce noise.

With `QUEUE_DRIVER=inline` and no worker:

- keep the 5-minute drain cron running;
- set `FINANCE_MONEY_EVENT_BOOKING=inline` so paid, delivered, and refunded money events are booked inside their producer transactions instead of waiting for a consumer;
- expect the drain mostly to process inventory publication retries, checkout retries, refund reconciliation, and the payout run.

## Local development

The local `.env` sets `FX_SYNC_TRIGGER_SECRET` and `OUTBOX_DRAIN_TRIGGER_SECRET`.
Trigger the endpoints directly instead of running Wrangler:

```bash
curl -X POST http://localhost:4000/v1/internal/jobs/drain \
  -H "x-cron-secret: $OUTBOX_DRAIN_TRIGGER_SECRET"
```

Running the worker locally (`pnpm start:worker:dev` with `QUEUE_DRIVER=redis`) makes the same pipelines run without HTTP ticks; the endpoint remains a manual fallback.
