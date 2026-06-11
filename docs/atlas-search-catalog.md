# Atlas Search Catalog Indexes

These Atlas Search indexes are the expected contract for
`CATALOG_STORE_DRIVER=mongodb` with `CATALOG_SEARCH_DRIVER=atlas`.

Collection:
- `catalog_product_search`

Index names:
- `product_search`
- `product_suggestions`

The current Atlas implementation lives in:
- [atlas-search-storefront-product-query.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/atlas-search-storefront-product-query.repository.ts)

## Purpose

`product_search`
- Used by `listPublic()`
- Supports text search, browse filters, and sort

`product_suggestions`
- Used by `suggestPublic()`
- Supports autocomplete over `suggest` plus fallback text matching

## Create In Atlas

Create both indexes on the `catalog_product_search` collection using the JSON
definitions in:

- [product_search.index.json](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/atlas-search/product_search.index.json)
- [product_suggestions.index.json](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/atlas-search/product_suggestions.index.json)

## Field Expectations

These indexes assume search documents shaped like:
- [catalog-search-document.mapper.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/catalog-search-document.mapper.ts)

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
- Local development should keep `CATALOG_SEARCH_DRIVER=mongodb`.
- Atlas mode should only be enabled after these indexes exist.
