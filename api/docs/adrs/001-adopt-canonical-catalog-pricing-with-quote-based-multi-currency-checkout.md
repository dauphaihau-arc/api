# ADR-001: Adopt Canonical Catalog Pricing with Quote-Based Multi-Currency Checkout

## Status

Proposed

## Date

2026-05-28

## Context

ARC needs a consistent multi-currency pricing model across catalog, checkout, orders, and payments.

The current pricing flow mixes several concerns that should be separated:

- seller-authored catalog pricing
- buyer-facing display currency
- charged checkout currency
- payment-side currency conversion

That creates several system-level risks:

- catalog price does not have one canonical source of truth
- checkout currency can be influenced too late in the flow
- payment integrations can become pricing authorities
- order records can diverge from what was shown or charged
- decimal money handling increases ambiguity across currencies

This decision affects product pricing, checkout, order persistence, refunds, payment integrations, and future reporting/audit behavior. It will be hard to reverse once new API contracts and stored pricing records are in place.

## Options Considered

### Option A: Keep late-bound currency selection in checkout and payment

- Pros:
  - minimal short-term change to existing APIs
  - faster to preserve current cart and order flow
- Cons:
  - pricing ownership remains ambiguous
  - payment providers continue recalculating totals
  - quoted, persisted, and charged amounts may diverge
  - refund and audit behavior remain fragile

### Option B: Use canonical catalog pricing with backend-owned checkout currency and persisted quotes

- Pros:
  - establishes one source of truth for merchandise pricing
  - separates display currency from transactional currency
  - creates a stable pricing artifact before order creation
  - keeps payment gateways as consumers of quoted totals
  - improves auditability, refund correctness, and cross-flow consistency
- Cons:
  - adds new pricing and quote concepts to the domain
  - requires stricter API contracts and persistence rules
  - increases initial schema and service complexity

### Option C: Allow client-selected checkout currency while persisting quotes

- Pros:
  - gives clients more flexibility in checkout UX
  - still introduces quote persistence
- Cons:
  - backend loses control of supported charged-currency policy
  - invalid or inconsistent currency combinations are easier to create
  - pricing authority is still partially delegated to the client

## Decision

We adopt **canonical catalog pricing with backend-owned checkout currency and quote-based checkout**.

The decision includes these rules:

1. Seller-authored catalog pricing is the canonical source of merchandise price.
2. Display currency is a presentation concern and may differ from checkout currency.
3. Checkout currency is chosen and enforced by backend policy.
4. Checkout must persist a quote before order creation.
5. Orders store immutable money snapshots in the charged currency.
6. Payment gateways consume quoted totals and must not reprice.
7. Monetary amounts are represented in minor units.

## Rationale

This option gives ARC one defensible pricing authority from browse through payment.

It solves the main architectural problem: pricing becomes a backend-owned, persisted domain concern rather than an emergent result of cart state, client input, and payment-provider FX behavior.

Separating display currency from checkout currency keeps browsing flexible without sacrificing transactional correctness. Persisting quotes creates a stable pricing contract for the purchase attempt. Storing order amounts as immutable snapshots ensures refunds, disputes, reconciliation, and reporting rely on historical transactional truth rather than mutable catalog state.

Minor-unit storage avoids floating-point ambiguity and better supports currencies with different decimal behavior.

## Consequences

- The domain model gains explicit pricing and quote concepts.
- API contracts move away from raw currency input at order creation time.
- Payment integration boundaries become stricter: payment services can charge, but not price.
- Order and refund logic become more reliable because they depend on persisted snapshots.
- The system becomes easier to audit because quoted, stored, and charged values are expected to match.
- The design increases up-front complexity in exchange for long-term correctness and consistency.

## Related Documents

- [Checkout Quote Design](../checkout-quote-design.md)
