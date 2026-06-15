# Multi-Currency Pricing Flows

This document captures end-to-end lifecycle examples for the current multi-currency pricing model.

For the target model, invariants, and data design, see [multi-currency-pricing-design.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/multi-currency/multi-currency-pricing-design.md).

## Flow 1: Seller creates product pricing for storefront display

```text
seller creates product pricing
-> base price
-> price resolution
-> FX service when needed
-> localized pricing service
-> rounding rules
-> storefront display price
```

Summary:

- seller authors canonical base pricing
- the current seller pricing write API does not expose market override creation
- backend decides whether to use an existing market override or base-price conversion
- storefront receives backend-resolved display pricing

## Flow 2: Seller views product pricing in seller dashboard

```text
seller opens seller dashboard
-> backend loads canonical catalog price
-> backend returns one resolved base pricing snapshot per inventory row
-> seller dashboard displays current base pricing
```

Summary:

- seller dashboard currently exposes the base pricing snapshot used by the product draft summary
- market override rows may exist in persistence, but they are not surfaced through the normal seller pricing write/read flow today

## Flow 3: Buyer creates checkout from storefront

```text
buyer browses storefront
-> storefront requests display pricing
-> backend resolves display price
-> buyer starts checkout
-> backend selects checkout currency
-> backend creates persisted quote
-> order is created from quote
-> payment gateway consumes quoted totals
```

Summary:

- storefront display currency may differ from checkout currency
- transactional pricing becomes authoritative at quote creation
- payment uses persisted quote amounts and does not reprice
- orders currently keep quote linkage in `payment_details.quote_id`
