# Multi-Currency Pricing Design

## Purpose

This document describes the current multi-currency pricing design in ARC.

It focuses on the implemented steady-state model:

- how prices are owned
- how currencies are separated by concern
- what data must be persisted
- what invariants the system must enforce

Where the schema supports more than the current seller-facing API exposes, those gaps are called out explicitly.

For quote lifecycle details, see [checkout-quote-design.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/checkout-quote-design.md).

## Problem Statement

Multi-currency behavior is currently ambiguous because pricing, presentment, checkout, and payment concerns are mixed together.

This causes three core failures:

- catalog price has no single canonical source of truth
- presentment currency and charged currency can diverge without explicit rules
- payment providers can become pricing authorities instead of consumers of backend pricing

The design must establish one backend-owned pricing model from catalog through order.

## Design Goals

- seller-defined catalog pricing is canonical
- presentment currency is a buyer-facing presentation concern
- checkout currency is backend-owned and explicit
- quoted totals are persisted before order creation
- order money is stored as immutable charged-currency snapshots
- monetary amounts use minor units
- payment gateways consume quoted totals and do not reprice

## Core Concepts

### Catalog price

The catalog price is the seller-authored price for a sellable item.

Rules:

- every sellable item has one active base price
- the schema and read side support optional market-specific override rows
- the current seller pricing write API updates base prices only
- catalog prices are the only source for merchandise pricing
- catalog prices are not derived from cart, checkout, or payment state

### Presentment currency

Presentment currency is the buyer-facing currency preference.

Rules:

- it is used for storefront presentation and quote display context
- it may differ from the final checkout currency
- it must never redefine catalog price ownership
- if conversion is needed for browsing, that conversion is informational, not authoritative

### Checkout currency

Checkout currency is the currency used to create the quote, order, and payment intent.

Rules:

- it is selected by backend policy
- one quote has exactly one checkout currency
- all quoted line items and totals use that same currency
- checkout currency is the currency that payment providers receive

### Order snapshot

An order stores the final charged amounts as immutable snapshots.

Rules:

- order pricing does not depend on later catalog changes
- refunds and post-purchase calculations use stored order amounts
- the order currency is the actual charged currency

## Pricing Model

The system separates pricing into four layers:

1. catalog/base price
2. optional market override price when such rows exist
3. display projection
4. checkout quote

Interpretation:

- catalog/base price is canonical
- market override is canonical for a specific market when present
- display projection is derived for browsing
- checkout quote is the persisted transactional truth for purchase

Current implementation note:

- seller-facing pricing writes currently create base price rows only
- market override rows are supported by persistence and read-time resolution but are not exposed through the normal seller pricing write API

## Price Resolution

Price resolution determines the amounts shown to the buyer and the amounts used for checkout.

Resolution rules:

1. resolve the active catalog price for the inventory item
2. prefer an active market-specific override when one exists for the target market
3. otherwise use the active base price
4. derive display amounts as needed for browsing
5. resolve one allowed checkout currency by backend policy
6. persist the final transactional amounts in the quote

Important boundary:

- display conversion may happen before purchase
- transactional pricing becomes authoritative only after quote creation

For end-to-end lifecycle examples, see [multi-currency-pricing-flows.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/multi-currency/multi-currency-pricing-flows.md).

## Data Model

### Catalog pricing

Catalog pricing belongs to a dedicated price record rather than inventory stock fields.

Current shape:

```ts
variant_prices
- id
- product_inventory_id
- price_type
- market_code nullable
- currency
- amount_minor
- original_amount_minor nullable
- active_from
- active_to nullable
- created_at
- updated_at
```

For field-level semantics of the pricing record, see [variant-prices-table.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/multi-currency/variant-prices-table.md).

Semantics:

- `price_type = base | market` mirrors whether the row is a base price or a market override
- `market_code = null` means the base price
- non-null `market_code` means a market-specific canonical override
- `amount_minor` is the effective sell price
- `original_amount_minor` is an optional compare-at price

Current implementation note:

- the seller pricing write path currently closes the active base row and inserts a new base row in the shop currency
- it does not currently expose `market_code` input for sellers to create or update market override rows

### Checkout quote

Checkout must persist the priced purchase before order creation.

Current shape:

```ts
checkout_quotes
- id
- actor_type
- user_id nullable
- cart_id
- market_code
- presentment_currency nullable
- checkout_currency
- subtotal_minor
- shipping_minor
- discount_minor
- total_minor
- shipping_address
- shop_adjustments jsonb nullable
- priced_shops jsonb
- expires_at
- created_at
- updated_at

checkout_quote_items
- id
- quote_id
- inventory_id
- quantity
- source_price_id
- source_currency
- unit_price_source_minor
- line_total_source_minor
- checkout_currency
- unit_price_checkout_minor
- line_total_checkout_minor
- unit_price_minor
- original_amount_minor nullable
- currency
- line_total_minor
- source_type nullable
- market_code nullable
- fx_rate nullable
- fx_source nullable
- fx_effective_at nullable
- fx_source_timestamp nullable
- title
- image_url nullable
- variant_group_name nullable
- variant_sub_group_name nullable
- variant_name nullable
```

Semantics:

- the quote is the transactional pricing artifact
- `presentment_currency` records the buyer-facing currency context
- quote items capture the exact price source used
- `shop_adjustments` preserves buyer-supplied per-shop inputs such as promo codes and notes
- `priced_shops` preserves the backend-computed per-shop pricing snapshot used later by order creation
- quote totals are persisted, not recomputed later from mutable browsing state
- quote item source fields preserve upstream price provenance
- quote item checkout fields preserve the charged-currency money snapshot

### Order snapshot

Orders persist the final purchased amounts in checkout currency.

Current shape:

```ts
orders
- currency
- subtotal_minor
- shipping_minor
- discount_minor
- total_minor
- payment_details jsonb

order_items
- inventory_id
- source_price_id nullable
- source_type
- unit_price_minor
- original_amount_minor nullable
- currency
- line_total_minor
- title
- image_url nullable
- market_code nullable
- fx_rate nullable
- fx_source nullable
- fx_effective_at nullable
- fx_source_timestamp nullable
```

Semantics:

- order totals must match the accepted quote totals
- order items are immutable snapshots
- order item currency matches order currency
- quote linkage is currently stored in `orders.payment_details.quote_id` rather than a dedicated `checkout_quote_id` column

## Service Responsibilities

### Product pricing service

The product domain resolves catalog prices.

Responsibilities:

- resolve the active base or market price
- provide price-source identity
- derive display amounts when needed
- provide checkout-ready price inputs

Suggested result shape:

```ts
{
  sourcePriceId: string
  source: 'market' | 'base_fx'
  base: {
    amountMinor: number
    currency: string
  }
  display: {
    amountMinor: number
    currency: string
  }
  checkout: {
    amountMinor: number
    currency: string
  }
  provenance: {
    sourceCurrency: string
    sourceUnitAmountMinor: number
    fxRate?: string
    fxSource?: string
    fxEffectiveAt?: Date
  }
}
```

### Checkout pricing service

The order domain owns quote creation.

Responsibilities:

- price cart or buy-now items using catalog pricing
- apply shipping and discount logic
- persist one quote in one checkout currency
- reject unsupported or stale pricing combinations

### Payment gateway

The payment layer is not allowed to author prices.

Responsibilities:

- accept quoted amounts
- create payment sessions or intents from persisted totals

Non-responsibilities:

- fetching FX rates for repricing
- recalculating totals from cart state
- choosing a different charged amount than the quote

## API Semantics

### Seller pricing input

Seller pricing APIs should express catalog pricing explicitly.

The API should support:

- base price
- compare-at price
- optional market-specific prices

The API should not mix:

- stock mutation
- SKU mutation
- catalog pricing mutation

### Checkout quote API

Checkout APIs should create a quote before order creation.

The request may include:

- buyer presentment currency
- shipping context
- cart or buy-now scope

The response must include:

- `quote_id`
- `checkout_currency`
- quoted item amounts
- quoted totals
- expiration information

### Order creation API

Order creation should consume a quote reference, not raw currency input.

Order creation semantics:

- caller submits `quote_id`
- backend validates quote freshness and ownership rules
- order is created from persisted quote totals

## Invariants

### Catalog invariants

- every sellable inventory row has exactly one active base price
- market override currency is fixed per stored row
- amounts are stored in minor units only
- active price rows must not overlap for the same `(inventory, market_code)`

### Quote invariants

- one quote has exactly one checkout currency
- all quote items use the quote checkout currency
- quote totals equal the sum of items, shipping, and discount components
- quote expiration is enforced before order creation

### Order invariants

- `orders.currency` is the actual charged currency
- every order item uses the same currency as its order
- order prices remain unchanged even if catalog prices later change
- refund math uses stored order amounts, not live catalog repricing

### Payment invariants

- payment session totals exactly match the persisted quote totals
- payment creation does not perform repricing
- payment creation does not re-read mutable cart state to rebuild totals

## Design Decisions

### Why catalog price is canonical

Catalog pricing belongs to the seller and should be authored once, then reused consistently across browse, quote, order, and payment.

### Why presentment currency is separate from checkout currency

Browsing needs flexibility, but purchase needs a single backend-controlled currency for correctness, auditability, and payment integration.

### Why quote persistence is required

Without a persisted quote, checkout depends on mutable catalog, cart, and FX state. A quote creates a stable pricing contract for the purchase attempt.

### Why payment cannot reprice

If payment providers recalculate totals, the system loses its single source of truth and can charge an amount different from what was quoted or stored.
