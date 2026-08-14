# Go Inventory Reservation Service

This document defines the target boundary for extracting inventory reservation from the NestJS checkout flow into a Go service.

Related context:

- [Checkout Quote Design](./checkout-quote-design.md)
- [Transactional Outbox For Checkout](./checkout-transactional-outbox.md)
- [Outbox Pattern](../patterns/outbox-pattern.md)

## Goal

Use Go for the hot inventory reservation path while keeping NestJS as the public API and checkout/order orchestrator.

The extraction should preserve correctness under flash-sale traffic:

- no overselling
- idempotent retries
- clear ownership of inventory state
- recoverable async processing through RabbitMQ
- measurable improvement against the k6 baselines in `api/test/performance/reports/`

## Ownership

NestJS owns:

- checkout quotes
- carts
- orders
- order items
- payments
- order outbox records
- public API contracts

Go Inventory owns:

- inventory stock availability
- reservations
- reservation items
- stock movements
- inventory locking strategy
- reservation state transitions

NestJS should not directly lock or decrement inventory rows after this extraction. Only Go should know how inventory is reserved, released, consumed, and restored.

## Architecture

Use direct synchronous calls for decisions the user is waiting on, and RabbitMQ for post-commit events.

```text
Client
  |
  v
NestJS API
  |
  | HTTP/gRPC
  v
Go Inventory Service
  |
  v
Inventory tables


NestJS transaction
  |
  | writes order + outbox event
  v
Outbox publisher
  |
  v
RabbitMQ
  |
  v
Go Inventory Worker
```

## Why RabbitMQ Is Not Used For Reserve

Quote reservation needs an immediate answer:

- reserved
- out of stock
- invalid inventory
- reservation already exists

Putting that decision behind RabbitMQ would force NestJS to publish a command, wait for an async reply, handle reply correlation, timeouts, and duplicate replies. That is more complex than a direct request/response call.

Use RabbitMQ for events that happen after local state commits, such as:

- `order.created`
- `order.cancelled`
- `payment.expired`
- `reservation.expired`

## Recommended Flow

### 1. Quote Reservation

NestJS creates or reuses a checkout quote and asks Go to reserve stock.

```text
NestJS
  |
  | reserve quote
  v
Go Inventory
  |
  | transaction
  | ACTIVE reservation created
  | stock removed from availability
  v
NestJS returns quote
```

Important rule:

- reservation removes stock from availability
- order creation later should not decrement stock again in NestJS

### 2. Order Creation

NestJS validates the active reservation, creates the order locally, and writes an outbox event in the same transaction.

```text
NestJS
  |
  | validate reservation
  v
Go Inventory
  |
  v
NestJS transaction
  |
  | create orders
  | create order items
  | create order event
  | create outbox: order.created
  | clear cart
  v
commit
```

The outbox event is the durable handoff to RabbitMQ.

### 3. Async Consume

After NestJS commits, an outbox publisher sends `order.created` to RabbitMQ. A Go worker consumes it and finalizes the reservation.

```text
RabbitMQ
  |
  | order.created
  v
Go Inventory Worker
  |
  | RESERVED -> SOLD
  v
ack
```

This avoids the dangerous distributed sequence:

```text
Go consumes stock
NestJS fails to create order
```

because stock was already removed from availability at reservation time. `order.created` only finalizes the reservation as sold.

## Reservation State Model

```text
ACTIVE
  |
  | order.created
  v
SOLD

ACTIVE
  |
  | quote expired / user abandoned checkout
  v
EXPIRED

ACTIVE
  |
  | explicit release
  v
RELEASED
```

Optional future states:

- `CONSUMING`
- `COMPENSATING`
- `FAILED`

For the first extraction, prefer the simpler state model unless recovery requirements force more detail.

## Synchronous Go API

### Reserve Quote

```http
POST /inventory/reservations/quote
```

Request:

```json
{
  "quoteId": "quote_123",
  "cartId": "cart_123",
  "idempotencyKey": "quote_123:reservation:v1",
  "expiresAt": "2026-08-12T05:31:19.013Z",
  "items": [
    {
      "inventoryId": "inventory_123",
      "quantity": 1,
      "title": "Product title"
    }
  ]
}
```

Success response:

```json
{
  "reservationId": "reservation_123",
  "status": "ACTIVE",
  "items": [
    {
      "inventoryId": "inventory_123",
      "quantity": 1,
      "availableAfterReservation": 998
    }
  ]
}
```

Out-of-stock response:

```json
{
  "code": "INVENTORY_OUT_OF_STOCK",
  "message": "Insufficient stock to reserve Product title"
}
```

Idempotency rule:

- same `quoteId` + same `idempotencyKey` + same items returns existing success
- same `quoteId` + different items returns conflict
- duplicate request never double-reserves

### Validate Reservation

```http
POST /inventory/reservations/validate
```

Request:

```json
{
  "quoteId": "quote_123",
  "reservationId": "reservation_123",
  "items": [
    {
      "inventoryId": "inventory_123",
      "quantity": 1
    }
  ]
}
```

Success response:

```json
{
  "valid": true,
  "status": "ACTIVE"
}
```

Failure codes:

- `RESERVATION_NOT_FOUND`
- `RESERVATION_EXPIRED`
- `RESERVATION_ITEMS_CHANGED`
- `RESERVATION_NOT_ACTIVE`

### Release Reservation

```http
POST /inventory/reservations/release
```

Request:

```json
{
  "quoteId": "quote_123",
  "reservationId": "reservation_123",
  "reason": "quote_expired",
  "idempotencyKey": "quote_123:release:v1"
}
```

Idempotency rule:

- releasing an already released or expired reservation returns success
- releasing a sold reservation returns conflict

## RabbitMQ Events

RabbitMQ carries committed domain events from NestJS outbox to Go workers.

### Exchange

```text
arc.domain-events
```

Recommended type:

```text
topic
```

### Routing Keys

```text
order.created
order.cancelled
payment.expired
```

### Queue

```text
inventory.order-events
```

The Go worker binds this queue to the routing keys it handles.

### Event Envelope

```json
{
  "eventId": "event_123",
  "eventType": "order.created",
  "occurredAt": "2026-08-12T05:31:19.013Z",
  "producer": "arc-api",
  "payload": {}
}
```

The `eventId` must be globally unique and stored by Go after processing so RabbitMQ redelivery does not double-apply inventory transitions.

### `order.created`

Payload:

```json
{
  "orderIds": ["order_123"],
  "quoteId": "quote_123",
  "reservationId": "reservation_123",
  "items": [
    {
      "inventoryId": "inventory_123",
      "quantity": 1
    }
  ]
}
```

Go handling:

```text
ACTIVE + event not processed
  -> SOLD
  -> store eventId
  -> ack

SOLD + same event already processed
  -> ack

RELEASED/EXPIRED + order.created
  -> reject to dead-letter or mark failed for manual review
```

### `order.cancelled` / `payment.expired`

These events are needed for flows where order creation succeeded but the order later stops being valid.

Go handling:

```text
SOLD + cancel/expire event
  -> restore stock according to business policy
  -> store eventId
  -> ack

ACTIVE + cancel/expire event
  -> RELEASED
  -> store eventId
  -> ack
```

The exact restock policy can differ for cash orders, paid card orders, shipped orders, and seller-driven cancellations.

## Outbox Publisher Responsibility

NestJS should write outbox records in the same transaction that creates or changes orders.

The publisher is responsible for:

- reading pending outbox events
- publishing to RabbitMQ
- marking events as published/processed according to existing outbox conventions
- retrying transient broker failures

RabbitMQ publish failures must not roll back committed orders. They are retried from the outbox.

## Idempotency And Recovery

Go must treat every external operation as retryable.

Required protections:

- unique reservation per quote
- unique processed event per `eventId`
- idempotency key table or equivalent unique constraint
- reservation item fingerprint for duplicate reserve validation
- state transition checks

Recommended unique constraints:

```text
reservations.quote_id unique
idempotency_keys.key unique
processed_events.event_id unique
```

Recovery jobs:

- expire active reservations whose `expiresAt` has passed
- retry failed RabbitMQ event handling if dead-lettered
- reconcile NestJS orders against Go reservation states by `quoteId` / `reservationId`

## Migration From Current NestJS Flow

Current NestJS behavior:

```text
quote reservation:
  create checkout_stock_reservations

order creation:
  consume reservation
  lock inventory
  decrement stock
  create order
```

Target behavior:

```text
quote reservation:
  Go creates ACTIVE reservation and removes stock from availability

order creation:
  NestJS validates ACTIVE reservation
  NestJS creates order and outbox event
  RabbitMQ publishes order.created
  Go marks reservation SOLD
```

Implementation sequence:

1. Keep current `CheckoutStockReservationPort` as the local default.
2. Add a remote-friendly client contract that does not accept `EntityManager`.
3. Implement Go reserve/validate/release endpoints.
4. Add RabbitMQ and an outbox publisher for `order.created`.
5. Add Go worker for `order.created`.
6. Switch quote reservation to Go behind config.
7. Remove NestJS direct inventory decrement only after Go owns reservation state.
8. Rerun k6 quote-only and full-order baselines.

## Open Questions

- Does Go own the existing `product_inventory` table, or does it get new inventory-owned tables?
- Should product catalog reads continue to use `product_inventory.stock`, or a projected availability value from Go?
- What is the exact restock policy for cancelled paid orders?
- Should NestJS store `reservationId` directly on checkout quote/order records?
- Should synchronous calls use HTTP first, then gRPC later if needed?
