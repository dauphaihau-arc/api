# Outbox Pattern

This codebase uses an outbox pattern to make external side effects durable and retryable after local database transactions commit successfully.

## Purpose

The outbox pattern solves a common reliability problem:

- local database changes succeed
- an external side effect is required afterward
- the external call can fail, time out, or be retried independently

Instead of calling external systems inside the same transaction, the application:

1. persists local state
2. writes an outbox event in the same transaction
3. commits
4. processes the outbox event after commit

This keeps the database as the source of truth while making side effects recoverable.

## When To Use It

Use the outbox pattern when a use case must:

- change local data transactionally
- trigger an external side effect after commit
- tolerate retries safely

Typical candidates:

- payment session creation
- email dispatch
- webhook fan-out
- notification delivery
- integration events

## Data Model

The shared outbox entity is:

- [outbox-event.entity.ts](../../src/platform/outbox/outbox-event.entity.ts)

It persists:

- `event_name`
- `aggregate_type`
- `aggregate_id`
- `payload`
- `status`
- `attempt_count`
- `available_at`
- `processed_at`
- `last_error`

Current statuses:

- `pending`
- `processing`
- `processed`
- `failed`

## Processing Lifecycle

The normal lifecycle is:

1. application transaction writes business data
2. application transaction writes an outbox row
3. processor claims a `pending` event
4. processor performs the external side effect
5. processor marks the event `processed`

On failure:

- increment `attempt_count`
- store `last_error`
- move `available_at` forward
- retry later

If retry budget is exhausted:

- mark the event `failed`

## Design Rules

- never call external systems inside the same database transaction that creates the business state
- keep payloads self-sufficient enough for safe retry
- do not rebuild payloads later from mutable state unless that is explicitly intended
- make processors idempotent where possible
- use `event_name` to route behavior, not table-specific logic

## Shared Processor

Claim, lease, retry-backoff, and terminal-failure behaviour is one component:

- [durable-outbox.processor.ts](../../src/platform/outbox/durable-outbox.processor.ts)

A processor owns one event name and declares the lifecycle it wants:

- `eventName` — only that name is scanned and claimed
- `dueStatuses` — which statuses count as due for the pending scan
- `failureLogPrefix` / `unknownErrorMessage` — the processor's own failure wording

The tuning is fixed and shared: 30s lease, 5 attempts, the 15s/1m/5m/15m/1h
backoff schedule, and a batch size of 10. A processor must not invent its own.

`claim` locks the row, refuses an event that is processed, failed, leased, or
owned by another event name, then moves it to `processing`, increments
`attempt_count`, and leases `available_at`. `markProcessed` (or `release` inside
a caller's transaction) records success; `markFailed` re-arms the event with the
next backoff step or marks it `failed` past the attempt limit.

`dueStatuses` is the one deliberate difference between processors. Scanning
`processing` recovers an event whose lease expired after a poller crashed;
scanning only `pending` leaves such an event untouched.

## Current Usage

- Checkout session creation uses `OrderCheckoutOutboxService`, which scans
  `pending` **and** `processing` so a crashed session creation is recovered:
  [checkout-transactional-outbox.md](../features/checkout-transactional-outbox.md)
- Inventory publish fan-out uses `OrderInventoryOutboxPublisherService`, which
  scans only `pending`.
