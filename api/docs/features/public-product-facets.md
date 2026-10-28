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
- [mongo-catalog-search-document.repository.ts](../../src/domains/product/infra/catalog/mongo/repositories/mongo-catalog-search-document.repository.ts)
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
- `attribute_name` is the facet label: the repository's label for a facet with
  live options (a stable-key collision resolves to the smallest label among the
  matching product rows), otherwise the configured category attribute name
- `options[].option_key` is the public storefront option key used in URL params
- `options` are the live eligible products' options for the active filters; the
  category taxonomy supplies the facet identity, the label of a configured-only
  facet, and the label of the shopper's own selection, but never adds an option
  no eligible product matches

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

That set is the union of two sources per product document:

- the projected structured attribute rows (`attributes`)
- supported inferred content signals (`inferredFacets`), mapped to their stable
  facet key and display label

Inferred signals are folded in because the same keys widen attribute filters
(`attr_color`, `attr_material`): an option a shopper can filter on must be
offerable in the facet panel, not only matchable by a hand-built query.

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

### Filter-aware facet alternatives

Facet alternatives are computed with every active filter **except that facet's
own** filter, so a shopper who has selected `Color = Black` still sees the other
`Color` options to switch to, while every other facet is narrowed to the products
that match `Color = Black`.

- Each facet with an active selection runs its own aggregation that drops only
  that facet's filter; facet keys without a selection reuse the full-filter run.
- Own-filter exclusion is implemented in the repository adapters through
  `buildFacetFilterVariants` / `mergeFacetFilterVariants` in
  [public-product-facets.ts](../../src/domains/product/infra/search/public-product-facets.ts).
  Only the excluded facet is taken from its exclusion run; all other facets keep
  the full-filter result.
- Pagination (`page`, `limit`) and sorting (`order`) never change facet
  alternatives: they are not part of the facet aggregation.
- Facets merge by the stable facet key (`categoryAttributeKey`), never by the
  display label. Attributes that share a label but have distinct keys stay
  distinct facets; when one stable key is contributed by more than one attribute
  identity, the display name is resolved deterministically instead of depending
  on row order, and the option union is preserved.
- The configured featured/subtree taxonomy never re-adds options that no
  eligible product matches: it supplies a facet's identity, display name,
  position, and the label of the shopper's own selection only.
- The storefront sends the same active filter subset (`is_digital`, `who_made`,
  `min_price`, `max_price`, `attr_<facetKey>`) to `GET /products/facets` that it
  sends to `GET /products`, so the behavior is observable end to end.

### Storefront presentation of unavailable options

The facets endpoint contract is unchanged: it still returns only the eligible
options for the current query. The storefront combines two requests to that same
endpoint to keep a useful panel without hiding choices:

- a **baseline** request with only `category_id` (no active filters) supplies the
  option list and heading — the options eligible in the category before the
  shopper's filters narrow them
- the **filtered** request supplies availability only, per the own-filter
  exclusion rule above

`buildFacetOptionView` in `apps/web/apps/storefront/src/domains/product/ui/filters`
unions the baseline options with the shopper's current selections and marks an
option disabled when it is unselected and the filtered availability omits it — or
has not resolved yet (pending/error), so an unselected choice is never enabled
from an absent response. This is a presentation concern: an option that no
eligible product matches stays visible but disabled instead of disappearing, and
a selected option stays checked and clearable even when the active filters make
it incompatible. No `products/facets` backend behavior changed.

A group with **no** options is different: `useProductFacets` drops it before the
panel renders, and the sidebar hides the whole Attributes section when nothing
survives. The endpoint keeps returning configured featured facets even when the
result set is sparse, so the client — not the API — decides that an empty group
is a dead control. A facet with an active selection always carries its selected
options and therefore always survives.

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

Inferred signals are also facet sources: `listPublicFacets` folds
`inferredFacets` into the same aggregation as structured attributes, using the
stable facet key plus its derived display label (`color` → `Color`,
`material` → `Material`). An inferred option therefore shows up as a real,
selectable choice wherever the relaxed filter would have matched it.

## Repository Implementations

### Atlas Search

Implementation:

- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts:133)

Behavior:

- uses `$search` with the same filter construction as public listing
- projects `attributes` and `inferredFacets` into one flat `facetValues` list
- unwinds `facetValues`
- filters out rows without attribute key, attribute name, or option value
- groups by `(attributeKey, attributeName, optionValue)`
- folds grouped rows into `PublicProductFacet[]`

Attribute filters are applied inside the Atlas search stage through
`embeddedDocument` conditions:

- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts:295)

This implementation requires attribute data and inferred facet data to exist in
the projected search document.

### MongoDB projected catalog

Implementation:

- [mongo-basic-storefront-product-query.repository.ts](../../src/domains/product/infra/search/mongo-basic/repositories/mongo-basic-storefront-product-query.repository.ts:163)

Behavior:

- builds a Mongo filter from the public input
- runs the shared facet aggregation against the projected search document
- applies attribute filtering with `$elemMatch`
- deduplicates options by the aggregation's `(attributeKey, attributeName,
  optionValue)` grouping rather than in application code

Both adapters share the aggregation body in
[public-product-facets.ts](../../src/domains/product/infra/search/public-product-facets.ts), so the facet
sources — structured attributes and supported inferred signals — and their
grouping stay identical.

For supported inferred facets, Mongo filtering also allows a match through
`inferredFacets`.

### Atlas / Mongo Catalog

Implementation:

- [atlas-search-storefront-product-query.repository.ts](../../src/domains/product/infra/search/atlas/repositories/atlas-search-storefront-product-query.repository.ts:372)

Behavior:

- resolves matching products through the projected catalog search document
- applies public visibility and image filters through the search stage
- applies category, maker, digital, price, and attribute filters against the
  catalog search document
- groups matching facet values from `attributes` unioned with `inferredFacets`
- folds the grouped rows into `PublicProductFacet[]`

For supported inferred facets, Atlas filtering can match selected option keys
through `inferredFacets` as a relaxed fallback.

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

Featured facets keep their configured identity, display name, and position, but
their **options always come from the live filter-aware result set**.

For each featured or subtree-common facet key:

- options are the live options the repository returned for the active filters
  (with the facet's own filter excluded)
- configured taxonomy options are **not** injected when no eligible product
  matches them; a configured choice that no eligible product has would be a
  filter the shopper cannot satisfy
- the configured taxonomy still supplies the display name for a facet that has
  no live options, and the display label for the shopper's own selection, which
  stays visible so it can be cleared
- if the current node has no attribute definition, descendants in the current
  subtree supply the name

If a stable key is contributed by more than one attribute identity, the
displayed name is the repository's deterministic label resolution (smallest
label among the matching product rows); the use case never re-resolves it by
traversal order.

This is important for branch categories such as `Shoes` or `Accessories`, where
the branch itself may not define `Color` or `Material`, but descendants such as
`Sneakers`, `Boots`, or `Hat & Cap` do.

### Empty facet rule

The final facet list follows this rule:

- featured facets always render, even with zero live options, so the configured
  facet surface stays selectable; an empty configured group is the accepted
  presentation (the facet heading with no options)
- non-featured facets with zero options are removed
- an empty group is never "filled in" with configured options that no eligible
  product matches: unselected non-matching options are never inserted

This prevents empty leaf-only buckets such as `Size` from showing up as blank
headings on broad branch pages, while still letting a configured featured facet
stay visible when the active filters leave it with no eligible option.

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

The product facets endpoint returns the eligible product-driven buckets for the
current query, shaped by the configured featured facets.

Example:

- category metadata says `Color` has `Red`, `Blue`, `Green`, `Black`
- current public query matches products using only `Red` and `Black`
- `Color` is a featured facet for this browse context

Expected behavior:

- `GET /categories/:id/attributes` returns the configured category definition
  (all options)
- `GET /products/facets` returns the eligible values only — `Red`, `Black` —
  with `Color` still rendered as a configured facet even when the active filters
  leave it with no eligible option

The category module owns the configured definition; the product storefront query
owns resolving which of those options the current eligible products actually
have.

## Related Documents

- [atlas-search-indexes.md](../operations/atlas-search-indexes.md)
- [002-adopt-projected-catalog-read-model-with-pluggable-search.md](../adrs/002-adopt-projected-catalog-read-model-with-pluggable-search.md)
