# Multi-Currency Pricing Flows

This document captures end-to-end lifecycle examples for the multi-currency pricing model.

For the target model, invariants, and data design, see [multi-currency-pricing-design.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/multi-currency/multi-currency-pricing-design.md).

## Flow 1: Seller creates product pricing for storefront display

```text
seller creates product pricing
-> base price
-> optional market override price
-> price resolution
-> FX service when needed
-> localized pricing service
-> rounding rules
-> storefront display price
```

Summary:

- seller authors canonical catalog pricing
- backend decides whether to use a market override or base-price conversion
- storefront receives backend-resolved display pricing

## Flow 2: Seller views product pricing in seller dashboard

```text
seller opens seller dashboard
-> backend loads canonical catalog price
-> backend loads optional market override prices
-> backend returns seller-authored pricing model
-> seller dashboard displays canonical and market-specific prices
```

Summary:

- seller dashboard should show owned pricing data, not derived checkout pricing
- dashboard pricing is management-facing and should preserve canonical price intent

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
