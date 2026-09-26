# ADR-013: Money Precision Model For Multi-Currency Pricing

## Status

Accepted

## Date

2026-09-26

## Context

Multi-currency pricing converts catalog amounts, converts shipping charges, and persists the rate provenance used by checkout quotes and orders. Before this decision the model had three independent definitions of which currencies have zero decimals, a rounding service that hardcoded a `1 or 100` scale, and no named rounding mode. Amounts were converted through binary floating point with `Math.round`, so `Math.round(1.005 * 100)` produced `100` and negative halves rounded toward positive infinity (`Math.round(-2.5) === -2`), which is asymmetric for discounts and refunds.

The scale model could not express currencies with three decimals, and the accepted-currency list could not be checked against currency metadata, so enabling such a currency would have produced silent 10x errors.

## Decision

- Stored money is an integer count of minor units. `Decimal` never appears in a DTO, ORM entity, response shape, or port.
- Unit scale (how many minor units a currency has) is currency metadata owned by `platform/money/currency-precision.ts` as an explicit table typed `Record<MarketplaceCurrency, number>`, with a CLDR lookup as the fallback for currencies outside the accepted list. A test cross-checks every accepted currency against CLDR, and the `Record` type makes a newly enabled currency a compile error until its exponent is declared.
- Decimal arithmetic for money uses one cloned `Decimal` constructor in `platform/money/money.ts` (34 significant digits, explicit mode). The library global is never configured, so unrelated code cannot change money behaviour.
- `RoundingPolicyService` owns the rounding decision: mode and granularity, resolved per calculation type from `RoundingPolicyConfig`. `platform/money/money.toMinorUnits` owns the single rounding implementation, and `toMinorUnits` is the only place a decimal becomes minor units.
- The default mode is `half_up` — symmetric on negative amounts, and the behaviour the platform had before the mode was explicit.
- Rounding is per calculated amount, never per displayed total: line amounts are rounded to minor units and totals are summed from the rounded minor units.
- A same-currency conversion is the exact identity: no rate lookup, no rounding, and no `fx` provenance. `fx` provenance is attached only when an exchange happened, and the rate string is stored verbatim at full precision.
- FX lookups are cached per request by `FxRateService.getLatestRate(input, cache)` using one key format, including the point in time. Callers own the cache map so it cannot outlive its request.
- `MoneyConversionService.convert(...)` is the entry point callers use to convert money and the one implementation of conversion: it composes the rate lookup with the rounding decision and owns the same-currency identity rule. The two collaborators stay separate because rounding is needed without FX, and a rate is sometimes needed without converting.

## Considered Options

- Keep floating point with `Math.round`: rejected because it loses a cent on representable decimals and rounds negatives asymmetrically, and because the scale ternary cannot express currencies with other exponents.
- Read the currency exponent from `Intl` at runtime for every currency: rejected because ICU data varies across Node builds and container images, which would let money rounding change between environments.
- Put currency precision inside the rounding policy: rejected because precision is currency metadata, not a rounding decision; that placement is what produced several divergent copies of the zero-decimal list.
- Adopt `dinero.js` for a full Money value type: deferred. It bundles a currency table, but it would replace amount+currency carriers across cart, quote, and order contracts. Revisit with the minor-units convergence work below.

## Consequences

- The zero-decimal list, the scale arithmetic, and the rounding entry point each exist once. The Stripe gateway no longer carries its own currency list.
- Converting an amount now costs a decimal operation instead of a float multiply, and amounts outside the safe integer minor-unit range raise `RangeError` instead of silently losing precision.
- Behaviour changes only for exact-half inputs: halves now round away from zero symmetrically instead of toward positive infinity, and `1.005`-class inputs round up instead of down.
- `exchange_rates.expires_at` is filtered by rate lookup but is not populated by the sync job or the seed, so rate expiry is inert. Either populate it from the provider TTL or drop the column and the filter.
- Replacing the remaining float-major pricing carriers (`PricedCartSummary`, `PricedCartItem`, the legacy `orders.subtotal` family) with minor-unit integers is follow-up work; until then, those paths convert with `toMinorUnits` at their edges and inherit the exact rounding without gaining exact upstream arithmetic.
