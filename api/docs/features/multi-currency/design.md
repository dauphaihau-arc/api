# API Multi-Currency Pricing Design

This document captures API implementation details for ARC multi-currency pricing.

For product scope, cross-system concepts, lifecycle examples, and shared invariants, see:

- [Multi-Currency Pricing](https://github.com/dauphaihau-arc/arc/tree/production/docs/features/multi-currency-pricing)
- [Multi-Currency Pricing Flows](https://github.com/dauphaihau-arc/arc/blob/production/docs/features/multi-currency-pricing/flow.md)
- [ADR-001: Canonical Catalog Pricing With Quote-Based Multi-Currency Checkout](../../adrs/001-adopt-canonical-catalog-pricing-with-quote-based-multi-currency-checkout.md)

For quote lifecycle details, see [Checkout Quote Design](../checkout-quote-design.md).

## Data Model

### Catalog Pricing

Catalog pricing is stored in `variant_prices`, not as a single mutable field on `product_inventory`.

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

Semantics:

- `price_type = base | market` identifies base prices versus market overrides.
- `market_code = null` identifies the base price row.
- Non-null `market_code` identifies a market-specific canonical override.
- `amount_minor` is the effective sell price in minor units.
- `original_amount_minor` is an optional compare-at price in minor units.

Current implementation notes:

- Seller pricing writes close the active base row and insert a new base row in the shop currency.
- Seller pricing writes do not currently accept `market_code` input.
- Market override rows are supported by persistence and read-time resolution, but are not created or rotated by the normal seller pricing write API today.

For field-level details, see [Variant Prices Table](variant-prices-table.md).

### Storefront Indexed Pricing

Storefront browsing uses a derived price read model for configured market/currency pairs.

Current shape:

```ts
catalog_product_prices
- product_id
- summary_by_market
- inventory_pricing_by_id
- updated_at
- source_version
```

Semantics:

- `summary_by_market` stores product-level min/max storefront pricing by market and currency.
- `inventory_pricing_by_id` stores per-inventory base pricing plus resolved storefront pricing snapshots.
- `resolvedByMarket` contains backend-resolved browsing prices for configured indexed pairs.
- `marketOverrides` preserves active canonical market override rows when present.
- The document is derived from `variant_prices`; it does not own pricing truth.

Current implementation notes:

- Catalog projection writes product content, slugs, search, and price documents together.
- Indexed storefront prices are generated only for configured market/currency pairs.
- Non-indexed pairs continue to resolve from canonical pricing at request time.

### Checkout Quote

Checkout persists the priced purchase before order creation.

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

- `presentment_currency` records the buyer-facing currency context.
- Quote items capture the exact catalog price source used.
- `shop_adjustments` preserves buyer-supplied per-shop inputs such as promo codes and notes.
- `priced_shops` preserves the backend-computed per-shop pricing snapshot used later by order creation.
- Quote totals are persisted and must not be recomputed later from mutable browsing state.
- Quote item source fields preserve upstream price provenance.
- Quote item checkout fields preserve the charged-currency money snapshot.

### Order Snapshot

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

- Order totals must match the accepted quote totals.
- Order items are immutable money snapshots.
- Order item currency matches order currency.
- Quote linkage is currently stored in `orders.payment_details.quote_id`, not a dedicated `checkout_quote_id` column.

## Storefront Pricing Read Path

Storefront read paths select between indexed and fallback price resolution.

Rules:

- Request context resolves a market and supported currency.
- Indexed market/currency pairs read from projected Mongo or Atlas price documents.
- Non-indexed pairs fall back to live canonical price resolution from `variant_prices`.
- Fallback live resolutions may be cached for a short TTL to reduce repeated FX work.

Operational knobs:

- `STOREFRONT_INDEXED_PRICE_PAIRS` controls which market/currency pairs are indexed.
- `STOREFRONT_RARE_PRICE_CACHE_TTL_MS` controls fallback cache TTL.

## API Semantics

### Seller Pricing Input

Seller pricing APIs should keep catalog pricing explicit.

Current behavior:

- Supports base price updates.
- Supports compare-at price updates through `original_amount_minor`.
- Does not expose market-specific price override input today.
- Does not create or rotate market override rows through the normal seller pricing endpoint.

Boundary:

- Catalog pricing mutation should not be mixed with stock mutation.
- Catalog pricing mutation should not be mixed with SKU mutation.

### Checkout Quote API

Checkout APIs create a quote before order creation.

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

### Order Creation API

Order creation consumes a quote reference, not raw currency or client-authored totals.

Order creation semantics:

- Caller submits `quote_id`.
- Backend validates quote freshness and ownership rules.
- Backend creates the order from persisted quote totals.
- Payment creation consumes the persisted order or quote totals; it does not reprice.

## Service Responsibilities

### Product Pricing Service

The product domain resolves catalog prices.

Responsibilities:

- Resolve the active base or market price.
- Provide price-source identity.
- Derive display amounts when needed.
- Provide checkout-ready price inputs.

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

### Checkout Pricing Service

The order domain owns quote creation.

Responsibilities:

- Price cart or buy-now items using catalog pricing.
- Apply shipping and discount logic.
- Persist one quote in one checkout currency.
- Reject unsupported or stale pricing combinations.

### Payment Gateway

The payment layer consumes backend pricing.

Responsibilities:

- Accept quoted amounts.
- Create payment sessions or intents from persisted totals.

Non-responsibilities:

- Fetching FX rates for repricing.
- Recalculating totals from cart state.
- Choosing a different charged amount than the quote.
