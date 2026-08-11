# Transactional Outbox For Checkout

This document explains how the generic outbox pattern is applied specifically to card checkout creation in the ARC ecommerce API.

Related generic pattern:

- [outbox-pattern.md](../architecture/outbox-pattern.md)

## Problem

The current checkout flow creates orders and calls Stripe within the same database transaction:

- [order-checkout.service.ts](../../src/domains/order/app/services/order-checkout.service.ts)

That means the transaction stays open while the application waits for an external network call. This has several risks:

- database locks are held longer than necessary
- Stripe success can happen before the local transaction fails
- external retries and database retries are coupled
- checkout creation is harder to recover safely after partial failure

## Goal

Split checkout into two phases:

1. transactionally persist local order state
2. create the Stripe checkout session only after commit

This keeps the database as the source of truth and makes external side effects retryable.

## Recommended Flow

### Cash orders

Keep the current local transaction flow for `CASH` payments.

No outbox is needed because no external payment session must be created.

### Card orders

For `CARD` payments:

1. create orders, reserve inventory, and persist coupon usage inside a transaction
2. write an outbox record in the same transaction
3. commit
4. a worker reads the outbox record and creates the Stripe checkout session
5. the worker updates the orders with Stripe session details

## Proposed Status Model

Current order statuses are defined in:

- [order-status.enum.ts](../../src/domains/order/domain/enums/order-status.enum.ts)

Current `CARD` orders are created as `AWAITING_PAYMENT`. For outbox-based checkout, add one intermediate state:

- `CHECKOUT_PENDING`

Recommended card flow:

- `CHECKOUT_PENDING`
  local order exists, Stripe session not created yet
- `AWAITING_PAYMENT`
  Stripe checkout session created successfully
- `PAID`
  Stripe reports successful payment
- `EXPIRED`
  checkout session expired

Optional future state:

- `CHECKOUT_FAILED`
  retries exhausted and session creation could not be completed

## Outbox Event

Checkout uses the shared `outbox_events` table through:

- [outbox-event.entity.ts](../../src/domains/order/infra/persistence/entities/outbox-event.entity.ts)

For this flow, the important event is:

- `order.checkout-session-requested`

## Event Payload

The outbox payload should contain the finalized checkout snapshot needed to create a Stripe session without recomputing business logic from mutable cart state.

Recommended payload:

```json
{
  "userId": "user_123",
  "userEmail": "customer@example.com",
  "cartId": "cart_123",
  "orderIds": ["order_a", "order_b"],
  "currency": "USD",
  "lineItems": [
    {
      "name": "Product title",
      "imageUrl": "https://...",
      "unitAmount": 12.34,
      "quantity": 2
    }
  ],
  "shippingAmount": 4.99,
  "discountAmount": 2.00,
  "shippingAddress": {
    "fullName": "Jane Doe",
    "address1": "123 Main St",
    "address2": null,
    "city": "Los Angeles",
    "country": "US",
    "state": "CA",
    "zip": "90001",
    "phone": "+1..."
  }
}
```

Important rule:

- do not re-read mutable cart data in the worker to rebuild pricing

The worker should operate from the persisted checkout snapshot.

## Service Changes

### 1. Order creation transaction

In [order-checkout.service.ts](../../src/domains/order/app/services/order-checkout.service.ts):

- keep pricing before the transaction if needed
- create orders, inventory reservations, and coupon usages inside the transaction
- for `CARD`, create orders with `CHECKOUT_PENDING`
- persist an outbox event in the same transaction
- remove direct `paymentGateway.createStripeCheckoutSession(...)` calls from the transaction

### 2. Checkout outbox processor

Checkout is processed by:

- [order-checkout-outbox.service.ts](../../src/domains/order/app/services/order-checkout-outbox.service.ts)
- [order-checkout-outbox-worker.service.ts](../../src/domains/order/app/services/order-checkout-outbox-worker.service.ts)

That processor:

1. loads pending checkout events
2. claims one event safely
3. calls `paymentGateway.createStripeCheckoutSession(...)`
4. updates the related orders transactionally
5. marks the outbox event as processed

Since the project already has queue abstractions and workers:

- [job-dispatcher.ts](../../src/integrations/queue/app/ports/job-dispatcher.ts)
- [worker.ts](../../src/bootstrap/worker.ts)

The current implementation keeps Postgres as the durable source of truth and uses a polling worker for retries.

## Worker Update Logic

When Stripe session creation succeeds:

- update each order `paymentDetails` with:
  - `checkout_session_id`
  - `checkout_session_url`
  - `checkout_session_expires_at`
- change order status from `CHECKOUT_PENDING` to `AWAITING_PAYMENT`
- mark the outbox event as `processed`

When Stripe session creation fails:

- increment `attempt_count`
- store `last_error`
- move `available_at` forward using retry backoff
- keep the order in `CHECKOUT_PENDING`

If retries are exhausted:

- optionally mark orders as `CHECKOUT_FAILED`
- or keep `CHECKOUT_PENDING` plus failure metadata if operators will retry manually

## Webhook Handling

Webhook handling should remain separate:

- [handle-stripe-webhook.use-case.ts](../../src/domains/order/app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case.ts)
- [order-webhook.controller.ts](../../src/domains/order/api/rest/order-webhook.controller.ts)

With the new status model:

- only `AWAITING_PAYMENT` orders should be moved to `PAID` or `EXPIRED`
- `CHECKOUT_PENDING` orders should not receive payment-completion transitions because no checkout session exists yet

## API Response Options

There are two valid API shapes for `CARD` checkout creation.

### Option A: asynchronous checkout preparation

Return immediately with:

- created order ids
- order shops
- status `CHECKOUT_PENDING`

The client then polls another endpoint to fetch the Stripe checkout session URL once ready.

### Option B: synchronous facade over asynchronous internals

Persist through the outbox first, then block briefly while a fast in-process worker creates the session.

This keeps the external API similar to today, but it is more complex and less honest than Option A.

Recommended choice:

- prefer Option A for correctness and operational clarity

## Migration Strategy

A practical rollout:

1. add `CHECKOUT_PENDING` to the order status enum
2. add the `outbox_events` table
3. refactor card checkout creation to write outbox events instead of calling Stripe directly
4. add a worker to process `order.checkout_session_requested`
5. add or refine a read path that exposes checkout session readiness

## Why This Fits This Project

This codebase already has several supporting patterns:

- modular application structure
- background worker support
- explicit use cases
- queue abstractions
- idempotency and request-context foundations

The transactional outbox complements those patterns by making checkout side effects durable and retryable at the payment boundary.
