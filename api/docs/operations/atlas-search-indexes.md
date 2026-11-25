# Atlas Search Catalog Indexes

These Atlas Search indexes are the expected contract for the Atlas-backed
catalog mode:

- `CATALOG_STORE_DRIVER=mongodb`
- `CATALOG_SEARCH_DRIVER=atlas`

Collection:
- `catalog_product_search`

Index names:
- `product_search`
- `product_suggestions`

The current Atlas implementation lives in:
- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts)

## Purpose

`product_search`
- Used by `listPublic()`
- Supports text search, browse filters, and sort

`product_suggestions`
- Used by `suggestPublic()`
- Supports autocomplete over `suggest` plus fallback text matching

## Create In Atlas

`just refresh-catalog-products` creates missing Atlas Search indexes and updates
existing ones whose definition changed before it clears and rebuilds catalog
projection collections. The script reads the index
payloads from:

- [product_search.index.json](../../infra/atlas-search/product_search.index.json)
- [product_suggestions.index.json](../../infra/atlas-search/product_suggestions.index.json)

The MongoDB user in `CATALOG_MONGODB_URI` must be allowed to create search
indexes. Local Docker MongoDB does not support Atlas Search index commands, so
the script logs a skip message in local-only environments.

## Manual Atlas UI Fallback

Create both indexes on the `catalog_product_search` collection using the JSON
definitions in:

- [product_search.index.json](../../infra/atlas-search/product_search.index.json)
- [product_suggestions.index.json](../../infra/atlas-search/product_suggestions.index.json)

When using the Atlas UI JSON editor, paste only the inner `definition` object.
The repo files keep the wrapper shape used by automation:

```json
{
  "name": "product_search",
  "definition": {}
}
```

## Field Expectations

These indexes assume search documents shaped like:
- [catalog-search-document.mapper.ts](../../src/domains/product/infra/catalog/mongo/documents/catalog-search-document.mapper.ts)

Important indexed fields:
- `title`
- `description`
- `keywords`
- `suggest`
- `localized.en.{titleNormalized,descriptionNormalized,keywords,suggest}`
- `localized.vi.{titleNormalized,descriptionNormalized,keywords,suggest}`
- `state`
- `categoryId`
- `isDigital`
- `whoMade`
- `flags.hasImages`
- `price.minAmountMinor`
- `ranking.createdAt`

## Locale selection and verification

Search documents carry resolved content for each Storefront Language under
`localized`. `vi-VN` and `vi-US` both query `localized.vi`; English and
unsupported locales query `localized.en`. Values in the localized fields
already include per-field English fallback, so a product without a Vietnamese
translation remains searchable.

Rebuild and verify projected documents after translation changes:

```bash
just refresh-catalog-products
just verify-catalog-localization
```

`refresh-catalog-products` logs a zero-stale verification line after rebuilding.
The standalone verification command fails when any document lacks a language
block or has a normalized field that no longer matches its display value.

## Shipping Coverage Backfill and Verification

Search and product documents carry the derived Shipping Coverage of the
assigned Shipping Profile (`shipping.shipsToCountryCodes`,
`shipping.shipsWorldwide`). The storefront list derives each item's
`shipping.available` from that projection and the server-owned Preview
Destination of the request's Market.

Rebuild every active Product in place, then verify every collection the
storefront reads (run from `apps/api/api`):

```bash
pnpm catalog:refresh-products -- --skip-clear
pnpm catalog:verify-shipping-coverage
```

- `--skip-clear` reprojects active Products without deleting the projection
  collections first, so the catalog stays readable while the backfill runs and
  an interrupted run can simply be repeated.
- `verify-catalog-shipping-coverage` fails when a document is missing
  `shipping.shipsWorldwide` or valid uppercase alpha-2
  `shipping.shipsToCountryCodes`. Empty coverage is valid and means the
  Product's assigned profile is missing or not Checkout-ready, so the Product
  is not shippable; only the projected fields must exist. Digital Products are
  exempt because they never require a Shipping Profile.
- `just refresh-catalog-products` also runs this verification after its normal
  clear-and-rebuild and fails the run when the projected fields are absent or
  malformed.

Run these commands against the target environment's database only. Never point
them at production to validate this feature; use the environment's own
integration database and confirm the MongoDB URI and database name in the
logged targets first.

## Notes

- Atlas Search is not available in local Docker MongoDB.
- Local development should use a MongoDB catalog store with the same Atlas
  Search index contract as production, typically a shared dev Atlas cluster.
- The storefront product query and recommendation repositories no longer have
  a MikroORM/Postgres fallback.
