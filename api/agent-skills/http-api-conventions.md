# API Conventions

Use this file when adding or changing HTTP API contracts.

## Naming Convention

- Request JSON uses `snake_case`.
- Response JSON uses `snake_case`.
- Query parameters use `snake_case`.
- Multipart form field names use `snake_case`.
- Internal TypeScript code uses `camelCase`.
- Database column naming is a separate concern. `snake_case` is preferred unless an existing schema dictates otherwise.

## Official Conversion Layer

- DTOs and serializers are the official conversion layer between external API contracts and internal application code.
- Request DTOs define the external `snake_case` contract.
- Response DTOs or serializers define the external `snake_case` output.
- Controllers should map request DTOs into internal `camelCase` use-case inputs explicitly.
- Controllers should not return app or domain types directly.

## Boundary Rule

- Keep transport naming concerns in the HTTP layer.
- Keep use cases, domain models, repositories, and shared application types in `camelCase`.
- Do not rename internal models to match external API field naming.

## Public Ids At The HTTP Boundary

Entities in a long-lived external contract carry a prefixed public id: shops (`shop_`), products
(`prod_`), orders (`ord_`), shipments (`shp_`), order exports (`exp_`), product imports (`imp_`),
promotions (`prm_`), chat conversations (`cnv_`).

- Expose the public id in the entity's ordinary `id`/reference field (e.g. `shop_id`) — never a
  parallel `public_id` field or the internal database id. Routes, bodies, and query params accept
  only public ids, passed to explicit application services or use cases; database lookups do not
  belong in pipes.
- Resolve and authorize in the entity's existing load query; do not translate an identifier and
  fetch the same entity again. Resolve identifier arrays with one batch repository/ORM `$in` query,
  preserving input ordering, duplicate validation, ownership checks, and per-item outcomes.
- A missing public id resolves to `404` (`<Entity> was not found`). Single-id application lookups
  (`ProductLookupService.resolveProductPublicId`, `OrderPublicIdLookup.resolveOrderPublicId`,
  `ShipmentPublicIdLookup.resolveShipmentPublicId`, `ProductImportLookupService.resolvePublicId`)
  throw it themselves; controllers do not re-check for `null`. Batch lookups return aligned
  `null`/absent entries so callers preserve per-item outcomes.
- Controllers resolve at most one owning call per identifier group, then pass raw public ids into
  bulk use cases, which own batch resolution, per-item failures, and the ids they return. Bulk
  mutation responses preserve per-item outcomes (including missing references) and return public
  ids in `succeeded_ids` and failure `id` fields.
- The owning module exports application lookup/access contracts needed by other domains, not HTTP
  lookup pipes. Internal jobs and events keep using explicitly internal identifiers.
- Without a public id, expose and accept the internal id where required: promo codes, shipping
  profiles, categories, users, addresses, notifications, order items, checkout sessions, product
  variants, inventory. Sale and Promo Code summaries identify their Promotion with `prm_…` and use
  shop/Product public ids for `shop` and `product_ids` (the Promo Code record stays non-public);
  storefront `auto_sale.promotion_id`, review `order_id`/`product.id`, and Shipping Profile/preview
  `shop_id` follow the same contract, while Shipping Profile and Order Item ids stay internal.

## Practical Guidance

- Prefer explicit `fromDomain`, `toResponse`, or equivalent mapping helpers for response shaping.
- When adding list or pagination responses, convert metadata fields to `snake_case` as part of the response DTO or serializer.
- When adding sortable or filterable query params, expose `snake_case` names externally and map them to internal field names in the controller or DTO mapping layer.
- Keep multipart field names aligned with the same convention, for example `avatar_file`.
