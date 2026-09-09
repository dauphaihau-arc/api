# ADR-006: Use an Outbox for Product Lifecycle Projections

## Status

Accepted

## Date

2026-09-06

## Context

The Product write model is authoritative while storefront catalog, search, checkout reservations, and notifications depend on secondary effects. Publishing, deactivating, or removing a Product can commit even when direct job dispatch fails, leaving those consumers inconsistent with the source state.

## Decision

A Product or Product Variant lifecycle mutation writes its durable outbox event in the same transaction as the source state change. Retried consumers update or remove catalog and search projections and perform follow-up reservation cleanup.

Storefront and checkout correctness does not wait for those projections: cart mutation, quote creation, reservation, and final order creation synchronously reject any Product or Product Variant that is not eligible for purchase. Removing an offer invalidates unpaid quotes; confirmed Orders remain unchanged.

## Considered Options

- Best-effort post-commit job dispatch: rejected because a committed lifecycle change can lose its projection update.
- Synchronous catalog and search calls in the request: rejected because secondary-system availability would control the source transaction.

## Consequences

- Projection delivery is eventually consistent but recoverable.
- Outbox handlers must be idempotent.
- Reservation release may happen asynchronously, but final order creation must reject the removed offer synchronously.
