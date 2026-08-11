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

- [outbox-event.entity.ts](../../src/domains/order/infra/persistence/entities/outbox-event.entity.ts)

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

## Current Usage

The first implemented use case is checkout session creation:

- [checkout-transactional-outbox.md](../features/checkout-transactional-outbox.md)

That flow uses a checkout-specific processor on top of the shared `outbox_events` table.
