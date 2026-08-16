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

`just refresh-catalog-products` creates missing Atlas Search indexes before it
clears and rebuilds catalog projection collections. The script reads the index
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
- `state`
- `categoryId`
- `isDigital`
- `whoMade`
- `flags.hasImages`
- `price.minAmountMinor`
- `ranking.createdAt`

## Notes

- Atlas Search is not available in local Docker MongoDB.
- Local development should use a MongoDB catalog store with the same Atlas
  Search index contract as production, typically a shared dev Atlas cluster.
- The storefront product query and recommendation repositories no longer have
  a MikroORM/Postgres fallback.
