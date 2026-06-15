# Variant Prices Table

`variant_prices` stores versioned catalog prices for a sellable inventory row instead of keeping a single mutable price on `product_inventory`.

It is important to distinguish schema capability from the current seller-facing write path:

- the table supports both base rows and market override rows
- the current seller pricing write API creates and rotates base rows only
- market override rows are available to the read side when present, but are not created through the normal seller pricing endpoint today

`market_code` and `price_type` together identify the role of a row:

- `price_type = 'base'` and `market_code = null`: base/default seller price
- `price_type = 'market'` and non-null `market_code`: market-specific override for that market

## Purpose of `amount_minor` and `original_amount_minor`

These two fields separate the actual sell price from the reference pre-discount price.

- `amount_minor`: the current effective catalog price in minor units
- `original_amount_minor`: the optional pre-discount or reference price in minor units
- `original_amount_minor = null`: there is no separate reference price, so `amount_minor` is the only active price

This means:

- buyers pay `amount_minor`
- `original_amount_minor` is used for strike-through, “was X now Y”, and sale context
- `original_amount_minor` should not be treated as the charged amount

Example:

1. regular price only
   - `amount_minor = 2000`
   - `original_amount_minor = null`
2. on sale
   - `amount_minor = 1500`
   - `original_amount_minor = 2000`

## Purpose of `active_from` and `active_to`

`active_from` and `active_to` define the validity window of a price row.

- `active_from`: when the price becomes effective
- `active_to`: when the price stops being effective
- `active_to = null`: the price is still currently active

This allows pricing to be temporal rather than overwrite-in-place.

Why this matters:

- keep historical price records
- support scheduled future price changes
- resolve the correct price for a given point in time
- ensure only one current base price is active for an inventory row at a time

## Practical lifecycle

When a seller changes a price, the previous row should usually be closed by setting `active_to`, and a new row should be inserted with its own `active_from`.

Example:

1. base USD 10.00 is active from `2026-05-01T00:00:00Z`
2. seller updates the base price to USD 12.00 effective `2026-06-01T00:00:00Z`
3. old row gets `active_to = 2026-06-01T00:00:00Z`
4. new row gets `active_from = 2026-06-01T00:00:00Z` and `active_to = null`

## Current schema behavior

The current migration and entity match this model:

- `price_type` is required
- `active_from` is required
- `active_to` is nullable
- the partial unique index on base prices allows only one row per inventory item where `market_code is null` and `active_to is null`
- the partial unique index on market overrides allows only one active row per inventory item and market code

That means the database already treats `active_to is null` as the currently active base price.

## Current write-path behavior

The current seller pricing update flow:

- closes the active base row for each inventory item
- inserts a new base row with the shop currency
- does not accept `market_code` input
- does not create or rotate market override rows

So this table is more expressive than the current seller-facing pricing API.
