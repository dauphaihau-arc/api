# Public Product Facets

This document describes the public storefront facets feature used by product
browse and search flows.

Relevant code:

- [product.controller.ts](../../src/domains/product/api/rest/storefront/product.controller.ts)
- [list-public-products.query.dto.ts](../../src/domains/product/api/rest/storefront/dto/list-public-products.query.dto.ts)
- [list-public-products.use-case.ts](../../src/domains/product/app/use-cases/list-public-products/list-public-products.use-case.ts)
- [storefront-product-query.repository.ts](../../src/domains/product/app/ports/storefront-product-query.repository.ts)
- [catalog-search-document.mapper.ts](../../src/domains/product/infra/catalog/mongo/documents/catalog-search-document.mapper.ts)
- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts)
- [mongo-storefront-product-query.repository.ts](../../src/domains/product/infra/catalog/mongo/repositories/mongo-catalog-search-document.repository.ts)
- [mikro-orm-storefront-product-query.repository.ts](../../src/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository.ts)
- [category.controller.ts](../../src/domains/category/api/rest/category.controller.ts)

## Purpose

Public product facets support storefront filtering by returning the available
category attribute buckets for the current public product query.

The feature is used for cases such as:

- browse products within a category subtree
- show filter checkboxes for matching attribute options
- narrow product results by category attribute selections
- keep filter options aligned with the current public result set
- always show category-owned featured facets such as `Color`, `Material`, or
  `Gender` even when the current result set is sparse

This is a storefront read concern. It is not the same as returning the static
attribute definition for a category.

## Endpoint

`GET /products/facets`

Implemented in:

- [product.controller.ts](../../src/domains/product/api/rest/storefront/product.controller.ts:68)

The endpoint accepts the same query surface as public product listing and
returns facet data instead of product rows.

## Request Shape

The request DTO is shared with public product listing:

- [list-public-products.query.dto.ts](../../src/domains/product/api/rest/storefront/dto/list-public-products.query.dto.ts:102)

Supported inputs include:

- `page`
- `limit`
- `category_id`
- `search`
- `title`
- `is_digital`
- `who_made`
- `order`

Attribute filters use dynamic `attr_<facetKey>=<optionKey>,<optionKey>`
query params.

Parsing is handled by:

- [list-public-products.query.dto.ts](../../src/domains/product/api/rest/storefront/dto/list-public-products.query.dto.ts:55)

Preferred example:

```text
GET /products/facets?category_id=cat_123&attr_color=black,blue
```

The DTO normalizes invalid or empty rows away before the use case maps them into
the internal query shape.

Important notes:

- `facetKey` is the stable category attribute key, for example `color`,
  `material`, `gender`, `apparel_size`
- `optionKey` is a normalized public key for an option value, for example
  `Black -> black`, `Wide Leg -> wide_leg`
- the public query surface is key-based, not database-ID-based
- this keeps URLs stable across environments and decoupled from seeded UUIDs

## Response Shape

The product module owns the facets response contract:

- [product.types.ts](../../src/domains/product/app/product.types.ts:307)

Shape:

```json
{
  "facets": [
    {
      "facet_key": "color",
      "attribute_name": "Color",
      "options": [
        { "option_key": "black", "value": "Black" },
        { "option_key": "red", "value": "Red" }
      ]
    }
  ]
}
```

Important properties:

- `facet_key` is the public storefront filter key used in URL params
- `attribute_name` is the category attribute name shown in storefront filters
- `options[].option_key` is the public storefront option key used in URL params
- `options` may come from two sources:
  - live matching product values
  - category taxonomy options injected for featured facets

## Flow

1. The controller receives `GET /products/facets`.
2. `ListPublicProductsQueryDto` parses public query parameters, including
   dynamic `attr_*` attribute filters.
3. `ListPublicProductsUseCase.executeFacets()` resolves the category subtree and
   normalizes attribute filter inputs.
4. The use case delegates to `StorefrontProductQueryRepository.listPublicFacets`.
5. The active repository implementation derives distinct facet buckets from the
   storefront read model.
6. The use case merges repository facets with category-configured featured
   facets.
7. The controller maps the result into the public response shape.

The use case entrypoint is:

- [list-public-products.use-case.ts](../../src/domains/product/app/use-cases/list-public-products/list-public-products.use-case.ts:61)

## Repository Contract

The repository contract is defined in:

- [storefront-product-query.repository.ts](../../src/domains/product/app/ports/storefront-product-query.repository.ts:20)

```ts
abstract listPublicFacets(
  input: ListPublicProductsInput
): Promise<PublicProductFacet[]>;
```

This contract intentionally lives in the product storefront query layer because
the result depends on product visibility and query-state filters, not only on
category metadata.

## Repository Semantics

`listPublicFacets(input)` means:

"Run the current public product query and return the distinct category attribute
options present in that matching product set."

The function must apply the same public product constraints as listing, such as:

- active products only
- image-ready products only where required by the read model
- category subtree filtering
- text search and title matching
- `isDigital`
- `whoMade`
- already-selected attribute filters

This keeps the visible filter buckets in sync with the actual public result set.

The repository layer is intentionally responsible only for live product-driven
facet buckets. Featured facet inheritance and taxonomy option expansion are
applied later in the use case.

### Boolean behavior of attribute filters

The current behavior is:

- OR within one attribute
- AND across attributes

Example:

- `Color in [Red, Blue]`
- `Size in [M]`

Means:

- product may match `Red` or `Blue` for `Color`
- product must also match `M` for `Size`

### Key-based filter matching

Public attribute filters are normalized into this internal shape:

- `attributeId` when available
- `selectedOptionKeys`
- `attributeName`
- `selectedOptionValues`

For storefront requests, the important path is:

- `attr_color=black,blue`
- `attributeId = color`
- `selectedOptionKeys = ['black', 'blue']`

Repositories match against projected product data using:

- `categoryAttributeKey`
- `selectedOptionKey`

This avoids coupling storefront filters to environment-specific option IDs.

### Relaxed matching for inferred facets

For supported broad facets, the public filter may also match inferred content
signals, not only explicit product attributes.

Current inferred support:

- `color`
- `material`

Example:

- `attr_color=beige` may match a product when:
  - the product has explicit `Color = Beige`
  - or indexed inferred facet terms strongly indicate `beige` from title or
    description

This behavior is implemented through inferred facet projection in:

- [inferred-facets.ts](../../src/domains/product/infra/inferred-facets.ts)

The goal is product-discovery tolerance for broad buyer-facing filters, while
still preserving exact structured attributes when they exist.

## Repository Implementations

### Atlas Search

Implementation:

- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts:133)

Behavior:

- uses `$search` with the same filter construction as public listing
- unwinds `attributes`
- filters out rows without attribute name or selected option value
- groups by `(attributeName, optionValue)`
- folds grouped rows into `PublicProductFacet[]`

Attribute filters are applied inside the Atlas search stage through
`embeddedDocument` conditions:

- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts:295)

This implementation requires attribute data and inferred facet data to exist in
the projected search document.

### MongoDB projected catalog

Implementation:

- [mongo-storefront-product-query.repository.ts](../../src/domains/product/infra/catalog/mongo/repositories/mongo-catalog-search-document.repository.ts:103)

Behavior:

- builds a Mongo filter from the public input
- fetches matching projected catalog documents
- applies attribute filtering with `$elemMatch`
- derives facets by scanning matching documents
- deduplicates option values with sets

For supported inferred facets, Mongo filtering also allows a match through
`inferredFacets`.

Facet result construction lives in:

- [mongo-storefront-product-query.repository.ts](../../src/domains/product/infra/catalog/mongo/repositories/mongo-catalog-search-document.repository.ts:371)

### MikroORM / SQL fallback

Implementation:

- [mikro-orm-storefront-product-query.repository.ts](../../src/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository.ts:145)

Behavior:

- resolves matching product IDs using the public list predicate
- returns early if no products match
- queries attribute rows by joining product attribute values, category
  attributes, and category attribute options
- groups by attribute name and option value in SQL
- folds the grouped rows into `PublicProductFacet[]`

For supported inferred facets, SQL filtering can expand a selected option key
into a term set and match title or description text as a relaxed fallback.

Attribute filters are applied through `exists (...)` clauses in the SQL query
builder:

- [mikro-orm-storefront-product-query.repository.ts](../../src/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository.ts:335)

## Read Model Dependency

The Atlas and Mongo implementations depend on projected search documents
containing category attribute data.

That shape is introduced in:

- [catalog-search-document.mapper.ts](../../src/domains/product/infra/catalog/mongo/documents/catalog-search-document.mapper.ts:6)

Attribute projection is populated in:

- [catalog-search-document.mapper.ts](../../src/domains/product/infra/catalog/mongo/documents/catalog-search-document.mapper.ts:108)

The projected documents also include:

- `categoryAttributeKey`
- `selectedOptionKey`
- `inferredFacets`

Without this projected attribute data:

- Atlas Search cannot filter or aggregate facet options from the search index
- MongoDB projected reads cannot derive facets from storefront documents

Without inferred facet projection:

- relaxed `color` and `material` matching cannot work consistently across read
  implementations

## Featured Facets

Category metadata may define `featuredFacetKeys`, for example:

- `Fashion -> ['color', 'material', 'gender']`
- `Bags & Purses -> ['color', 'material']`

This metadata is owned by the category module and returned by category APIs,
but it is applied inside the product storefront use case.

### Effective featured facet source

The use case resolves the effective featured facet configuration by walking up
the category parent chain:

- use the current category if it has `featuredFacetKeys`
- otherwise use the nearest ancestor that has `featuredFacetKeys`

This allows deep leaf categories such as `Graphic Tee` or `Polos` to inherit
broad storefront facets from an ancestor like `Fashion`.

### Featured facet option sourcing

Featured facets are taxonomy-backed, not product-bucket-only.

For each featured facet key:

- keep live options returned by the repository
- if the current category or ancestor category has taxonomy options for that
  attribute, merge them in
- if the current node has no attribute definition, search descendants in the
  current subtree for the first matching attribute definition

This is important for branch categories such as `Shoes` or `Accessories`, where
the branch itself may not define `Color` or `Material`, but descendants such as
`Sneakers`, `Boots`, or `Hat & Cap` do.

### Empty facet rule

The final facet list follows this rule:

- featured facets may render even if no current products contribute live values,
  because category taxonomy options can still populate them
- non-featured facets with zero options are removed

This prevents empty leaf-only buckets such as `Size` from showing up as blank
headings on broad branch pages.

## Facet Ordering

Facet names are ordered by product-specific storefront priority first, then by
name.

Priority source:

- [product-facet.constants.ts](../../src/domains/product/app/product-facet.constants.ts)

This is a presentation-oriented product browse rule, not a category metadata
rule.

## Why This Stays In Product

The feature returns category-derived data, but it should remain in the product
storefront query boundary.

Reason:

- category owns the canonical attribute definition for a category
- product owns the public discovery query over products
- facets are dynamic query results, not static category metadata

The category endpoint:

- [category.controller.ts](../../src/domains/category/api/rest/category.controller.ts:79)

returns the configured attribute definition for a category, including all known
options.

The product facets endpoint returns a storefront-shaped mix of:

- live product-driven buckets
- category-featured taxonomy buckets

Example:

- category metadata says `Color` has `Red`, `Blue`, `Green`, `Black`
- current public query matches products using only `Red` and `Black`
- `Color` is a featured facet for this browse context

Expected behavior:

- `GET /categories/:id/attributes` returns the configured category definition
- `GET /products/facets` may return:
  - live values such as `Red`, `Black`
  - merged taxonomy values for featured facets when the storefront wants the
    broader filter surface

That merge behavior is the main reason this feature still belongs to product
storefront querying rather than the category module alone.

## Related Documents

- [atlas-search-indexes.md](../operations/atlas-search-indexes.md)
- [002-adopt-projected-catalog-read-model-with-pluggable-search.md](../adrs/002-adopt-projected-catalog-read-model-with-pluggable-search.md)
