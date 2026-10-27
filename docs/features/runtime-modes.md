# Runtime Modes

The API can run with or without a background worker, and money events either book in the producer's transaction or wait for an outbox poller.
This document covers how each pipeline behaves in both shapes and what a failed booking does.
Deployment steps, cron wiring, and the drain endpoint's HTTP contract live in [API Cron Jobs](../operations/api-cron-jobs.md).

## Two switches

Background pollers only exist in the worker process: `api/src/bootstrap/worker.ts` boots `JobsWorkerModule`, and every poller returns early unless `QUEUE_DRIVER=redis`
(`api/src/domains/finance/app/services/finance-outbox-worker.service.ts:24-31`, `api/src/domains/order/app/services/order-checkout-outbox-worker.service.ts:23`,
`api/src/domains/order/app/services/order-inventory-outbox-worker.service.ts:23`,
`api/src/domains/order/app/services/refund-reconciliation-worker.service.ts:30`,
`api/src/domains/finance/app/services/payout-run-worker.service.ts:30`).

| Switch | Values | Default | Controls |
| --- | --- | --- | --- |
| `QUEUE_DRIVER` | `redis`, `inline` | `redis` (`inline` when `NODE_ENV=test`) | Whether the worker process starts pollers at all |
| `FINANCE_MONEY_EVENT_BOOKING` | `outbox`, `inline` | `outbox` | Where `order.paid`, `order.delivered`, and `order.refunded` are booked |

`QUEUE_DRIVER=inline` makes the API a workerless deployment: no poller runs, so pending outbox rows and scheduled reconciliation advance only when an external schedule calls `POST /v1/internal/jobs/drain`.

## Mode matrix

| Pipeline | Worker (`QUEUE_DRIVER=redis`) | No worker (`QUEUE_DRIVER=inline`) |
| --- | --- | --- |
| `order.paid` | Producer writes a `pending` outbox row; `FinanceOutboxWorkerService` ticks every 5s and `FinanceMoneyEventProcessorService` records the journal entry | `OrderPaymentService` books inline with `RecordOrderPaidJournalEntryUseCase.recordWithin` inside the checkout transaction and marks the row `processed`; needs `FINANCE_MONEY_EVENT_BOOKING=inline` |
| `order.delivered` | Delivered poller releases Seller Payable `pending` → `available` | `FulfillmentService.publishOrderDeliveredEvent` calls `RecordPayoutAvailabilityUseCase.recordWithin` in the delivery transaction and marks the row `processed` |
| `order.refunded` | Refund poller books the reversal | Both refund producers book inline: the provider refund outcome (`OrderRefundService.markRefundSucceeded`) and the admin refund confirmation (`UpdateAdminOrderRefundUseCase.execute`) |
| inventory `order.created` | Inventory outbox poller publishes to the inventory service over RabbitMQ | No inline path; the `inventory` drain task is the only publisher, because a broker publish cannot join the database transaction |
| Checkout session creation | First attempt is already inline (`OrderCheckoutService.tryProcessCheckoutSessionRequest`); the worker retries failures | Same first inline attempt; the `checkout` drain task retries failures |
| Refund reconciliation (`OrderRefundService.reconcilePendingRefunds`) | Worker tick every 5m | Drain `refunds` task |
| Payout run (`RunPayoutsUseCase.execute`) | Worker tick every 5m | Drain `payout` task |
| Provider fee ingestion (`finance.record-provider-fee`) | `JobDispatcher` enqueues a BullMQ job; the worker retries it | `InlineJobDispatcher` runs the job inside the webhook request; there is no retry |

Periodic pipelines (reconciliation, payout) have no producer path: they only advance on a worker tick or a drain call.

## Where the branch lives

| Concern | Location |
| --- | --- |
| Booking config | `api/src/platform/config/finance.config.ts` (`FINANCE_MONEY_EVENT_BOOKING`, default `outbox`) |
| Queue config | `api/src/platform/config/queue.config.ts:21-27`; env schema in `api/src/platform/config/app-env.config.ts:56` and `:118-120` |
| Worker polling opt-in | `api/src/platform/jobs/jobs-worker.module.ts`; `bootstrap/worker.ts` |
| `order.paid` inline branch | `api/src/domains/order/app/services/order-payment.service.ts:169` |
| `order.delivered` inline branch | `api/src/domains/fulfillment/app/services/fulfillment.service.ts:539` (`publishOrderDeliveredEvent`), branch at `:575` |
| `order.refunded` inline branch | `api/src/domains/order/app/services/order-refund.service.ts:471`; `api/src/domains/order/app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case.ts:201` |
| Drain endpoint | `api/src/platform/jobs/internal-outbox-jobs.controller.ts` (`DRAIN_TASKS`: `finance`, `checkout`, `inventory`, `refunds`, `payout`; default limit 10, max 50, 20s budget) |
| Inline job execution | `api/src/integrations/queue/infra/inline-job-dispatcher.ts` |
| Outbox retry policy | `api/src/platform/outbox/durable-outbox.processor.ts` (`MAX_ATTEMPTS = 5`, `RETRY_DELAYS_MS`) |

## Failure semantics

| Mode | What a failure does | Error trail |
| --- | --- | --- |
| Inline booking | Rolls back the producer transaction, including the business fact; the provider or caller retries the whole request | The request/webhook error; no `outbox_events.last_error` |
| Outbox booking | The event stays `pending` and is retried after 15s, 1m, 5m, 15m, 1h; after 5 attempts it becomes terminal `failed` and is never scanned again | `attempt_count`, `last_error`, `available_at` on the row; re-arming one row is a manual operation |
| Drain-driven | Same as outbox, but progress depends entirely on an external tick; a stopped cron leaves rows pending with no other consumer | Row state only; nothing in the API notices the absence of ticks |
| Inline job dispatch (provider fees) | The job runs in the webhook request; a throw fails that request and the dispatcher does not persist a retry | Request error; no job record |

Outbox processing recovers a crashed poller through a 30-second lease: rows left in `processing` become due again once the lease expires.

## Valid combinations

- `QUEUE_DRIVER=redis` + worker + `outbox` — default when a worker process is deployed. Booking mode is irrelevant for draining, but `inline` still makes producers roll back on a booking failure.
- `QUEUE_DRIVER=redis` + worker + `inline` — producers own the booking; the finance worker finds these rows already `processed` and skips them.
- `QUEUE_DRIVER=inline` + `outbox` — the original production stall: producers write rows that no consumer ever drains. The money events stay pending indefinitely.
- `QUEUE_DRIVER=inline` + `inline` + a 5-minute drain cron — the supported workerless shape. Money events book in their producers; the drain handles inventory publication, checkout retries, refund reconciliation, and the payout run.
- `QUEUE_DRIVER=inline` + no cron — every drain-only pipeline stops, including inventory publication.

## Verification

The mode matrix is covered by integration specs under `api/test/integration/`:

- `finance-paid-order-inline-booking.int-spec.ts`
- `finance-delivered-order-inline-booking.int-spec.ts`
- `finance-refund-order-inline-booking.int-spec.ts`
- `internal-outbox-drain.int-spec.ts`

```sh
pnpm test:int -- finance-paid-order-inline-booking
pnpm test:int -- finance-delivered-order-inline-booking
pnpm test:int -- finance-refund-order-inline-booking
pnpm test:int -- internal-outbox-drain
```

The booking-mode decision tree is drawn in [money-event-booking-modes.html](./runtime-modes/money-event-booking-modes.html).
