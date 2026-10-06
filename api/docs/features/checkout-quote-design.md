# Checkout Quote Design

This document defines the role of a checkout quote in the ARC API.

The purpose of this document is to make `checkout quote` an explicit backend concept with clear ownership, invariants, and lifecycle rules.

## Purpose

A checkout quote is the persisted pricing checkpoint between cart selection and order creation.

It exists to solve four problems:

- freeze the exact money amounts that the buyer is about to pay
- preserve pricing provenance for auditability
- prevent order creation from depending on mutable cart state alone
- make payment providers consume finalized backend-owned amounts

In short:

```text
cart state is mutable
quote state is the approved pricing snapshot
order state is the purchased snapshot created from the quote
```

## Core Separation

The quote boundary should keep these concepts distinct:

- catalog/base price
  seller-authored source pricing
- presentment currency
  customer-facing currency preference
- checkout currency
  backend-owned transaction currency
- order snapshot
  immutable purchased amounts persisted after quote consumption

A quote is where browsing-oriented pricing becomes transaction-oriented pricing.

## Responsibilities

The checkout quote is responsible for:

- capturing one final checkout currency for the selected checkout set
- storing subtotal, shipping, discount, and total in minor units
- storing item-level unit and line totals in minor units
- storing pricing provenance such as source price, market, and FX metadata
- storing the cart and actor context needed to validate later order creation
- expiring after a bounded lifetime

The checkout quote is not responsible for:

- being the seller catalog price source of truth
- acting as a long-term editable cart
- recalculating prices after it has been persisted
- letting the client choose arbitrary payment currency after quoting
- reserving stock or owning an inventory reservation

## Data Model

At a conceptual level, a quote should contain:

### Quote-level fields

- quote id
- actor type and actor identity
- cart id
- market code
- presentment currency hint
- checkout currency
- subtotal minor
- shipping minor
- discount minor
- total minor
- shipping address snapshot
- shop adjustment snapshots needed for order creation
- priced shop snapshots needed for deterministic order creation
- expiration timestamp
- created at

### Item-level fields

- quote item id
- quote id
- product inventory id
- quantity
- source price id
- source currency
  usually the shop or catalog price currency for the source record used
- source type
- unit price source minor
- line total source minor
- checkout currency
- unit price checkout minor
- line total checkout minor
- legacy normalized unit price minor
- compare-at minor when applicable
- legacy normalized line total minor
- legacy normalized currency
- title snapshot
- image snapshot when needed
- FX provenance fields when conversion was involved

## Invariants

The quote model should enforce these rules:

1. one quote has exactly one checkout currency
2. all quoted item amounts are stored in minor units
3. a quote is created from backend-resolved pricing, not frontend recomputation
4. a quote must be reloadable without recalculating the charged amounts
5. a quote does not reserve stock and does not own a reservation
6. order creation must reject expired quotes
7. order creation must reject cart changes that invalidate the quoted selection
8. payment creation must use quote-owned amounts, not recomputed mutable totals
9. shop-level pricing state required for order creation must be persisted with the quote

These are the important trust boundaries:

- frontend may request a quote, but does not author final money
- cart may supply selection context, but does not remain the authority after quote creation
- Stripe may process payment, but does not decide pricing

## Lifecycle

The expected lifecycle is:

```text
buyer selects items
-> backend resolves storefront/cart pricing
-> backend creates checkout quote
-> quote is persisted with money and provenance snapshots
-> client submits quote_id for order creation
-> backend reloads and validates quote
-> backend reserves one stock hold per Order inside the order transaction
-> backend creates order(s) from quote
-> quote is consumed or left as an audit record
```

## Validation Rules

Quote creation should validate:

- selected items are still purchasable
- all selected items can resolve into one supported checkout currency
- all required price provenance is present
- shipping destination and market context are sufficient for pricing
- presentment currency, when provided, is supported

Quote consumption should validate:

- quote exists
- quote belongs to the correct user or guest session
- quote is not expired
- cart selection still matches the quoted items and quantities
- downstream order creation uses quoted totals and item snapshots

## Boundary With Cart

Cart and quote should not collapse into the same concept.

Cart is for buyer iteration.

Quote is for pricing commitment.

That means:

- cart items may change after quote creation
- cart totals may be recomputed repeatedly
- quote totals should remain stable for the lifetime of the quote
- order creation should compare current cart state to the stored quote before proceeding

## Promo Code Selection

A seller marks each Promo Code `public` or `code_only`. Only `public`, active
Checkout Discounts are discoverable through the shopper listing
(`GET /cart/promo-codes?shop_id=...`); `code_only` codes are redeemed only when
the buyer already holds the code, and Sales price items on their own. The listing
returns every discoverable Promo Code of the shop for the selected items,
flagging each one with `is_eligible` and, when it cannot be redeemed for this
cart, an `ineligible_reason` (`not_started`, `expired`, `usage_limit_reached`,
`user_usage_limit_reached`, `authentication_required`, `product_scope`,
`min_order_value`, `min_products`, `zero_benefit`; first matching rule wins in
that order). Listing and redemption share one eligibility evaluator, so a Promo
Code the listing marks ineligible is exactly the one `validatePromoCodes`
rejects. The only offers the listing omits are `code_only`, not-started, expired,
globally exhausted, and any whose monetary fields have no exchange rate into the
buyer's checkout currency. Items are ordered eligible first, then by `code`.

A shop cart may hold at most two Promo Codes: at most one free-shipping code and
at most one product-discount code (percentage or fixed amount).
`POST /cart/promo-codes/apply` adds a code next to the retained codes in the
other slot, replacing any retained code in the same slot, and validates the whole
resulting selection before returning it. It writes nothing: it returns the
accepted `promo_codes` together with `applied_promo_codes`
(`{ code, benefit_type }` per code), so a caller can stage a selection and act on
each code's manual slot without a second lookup. An invalid combination is
rejected rather than stacked, and cart pricing, quotes, and final order
submission enforce the same rule.

## Boundary With Orders

Orders should be created from the quote, not from raw cart totals.

The order layer should inherit:

- quote checkout currency
- quote subtotal, shipping, discount, and total snapshots
- quote shop-level totals, promo codes, and notes
- quote item checkout unit and line totals
- quote provenance fields that matter for audit and support workflows

The order layer is responsible for reserving stock per Order at order creation; the quote does not hold inventory.

The order layer should not need to:

- rerun FX for quoted items
- rediscover source prices
- reinterpret client currency intent

## Boundary With Payments

Payment providers should receive already-finalized money values.

For Stripe and any similar gateway, the quote-to-order pipeline should ensure:

- one finalized currency
- minor-unit line item amounts
- minor-unit shipping and discount amounts
- no gateway-owned FX recalculation

## Current Shape

The current target quote shape is:

```ts
checkout_quotes
- id
- actor_type
- user_id nullable
- guest_session_id nullable
- cart_id
- market_code nullable
- presentment_currency nullable
- checkout_currency
- subtotal_minor
- shipping_minor
- discount_minor
- total_minor
- shipping_address json
- shop_adjustments json nullable
- priced_shops json
- expires_at

checkout_quote_items
- id
- quote_id
- inventory_id
- quantity
- source_currency
- unit_price_source_minor
- line_total_source_minor
- checkout_currency
- unit_price_checkout_minor
- line_total_checkout_minor
- unit_price_minor
- original_amount_minor nullable
- line_total_minor
- currency
- source_price_id nullable
- source_type nullable
- market_code nullable
- fx_rate nullable
- fx_source nullable
- fx_effective_at nullable
- fx_source_timestamp nullable
```

Interpretation:

- `presentment_currency` captures the customer-facing currency context
- `checkout_currency` is the one authoritative transaction currency
- `shop_adjustments` preserves buyer inputs by shop
- `priced_shops` preserves backend-computed shop totals and item grouping
- item source fields preserve the upstream price record currency and amount, which usually come from shop-authored or catalog-authored pricing
- item checkout fields preserve the charged-currency snapshot used by order creation and payment

## Design Consequences

Treating checkout quote as a first-class concept implies:

- checkout becomes quote-first instead of currency-first
- `quote_id` becomes the contract between pricing and order creation
- quote persistence becomes part of pricing correctness, not just API convenience
- quote provenance becomes part of supportability and auditability

## Open Decisions

These decisions should remain explicit when the checkout model evolves:

- quote expiration duration and refresh behavior
- whether consumed quotes are marked, soft-locked, or simply referenced by orders
- whether mixed-currency carts should fail fast or split before quote creation
- which provenance fields must be copied from quote items into order items for long-term auditability
- whether future quote refresh flows should reuse an existing quote id or create a new quote
