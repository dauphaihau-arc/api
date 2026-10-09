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

## Error Responses

Every business JSON endpoint (`/v1/...`) returns one error envelope, emitted by
`GlobalExceptionFilter`. No other top-level keys are ever produced:

```json
{
  "status_code": 404,
  "code": "ORDER_NOT_FOUND",
  "message": "Order was not found",
  "request_id": "3f6c1b1e-2b0f-4d5a-9d0e-7a1f2c3b4d5e",
  "details": { "order_id": "ord_1" }
}
```

- `status_code` (number) always matches the HTTP status line.
- `code` (string) is always present and machine-readable. Public codes are
  `UPPER_SNAKE_CASE` only — never PascalCase, class names, or legacy error
  names (e.g. `PRODUCT_NOT_FOUND`, `PRODUCT_VERSION_CONFLICT`).
- `message` (string) is a human-readable summary and is always a string.
- `request_id` is present when the request could be correlated; it also appears
  in the `X-Request-Id` response header and in the structured logs.
- `details` is optional structured context. Validation failures use
  `details.fields` (see below). Legacy transport fields (`statusCode`, `error`,
  `timestamp`, `path`) are gone; do not reintroduce them, and never put
  arbitrary extras at the top level — put them under `details`.

The filter is authoritative: it resolves the status from the exception and the
`request_id` from the request context. An exception payload can only contribute
`code`, `message` and `details`; a payload can never override the status or
request id.

### Code Ownership

- Domain mappers (`src/domains/*/api/rest/errors/*-http-error-mapper.ts`) own the
  stable business codes and throw `new XException({ code, message, details? })`.
- Every public code is `UPPER_SNAKE_CASE`. A mapper must assign one whether it
  currently emits none, a PascalCase/class name, or an inherited
  `DomainError` default — strip any `Error` suffix and convert to snake case
  (e.g. `ProductDraftIncompleteError` -> `PRODUCT_DRAFT_INCOMPLETE`,
  `ProductVersionConflictError` -> `PRODUCT_VERSION_CONFLICT`,
  `ProductSkuConflict` -> `PRODUCT_SKU_CONFLICT`). No legacy PascalCase codes
  remain and no aliases are kept.
- Legacy PascalCase codes are not a stable contract and must be renamed; new
  codes follow the same `UPPER_SNAKE_CASE` shape.
- The same rule applies to every public `code` value outside the error
  envelope: bulk/outcome payloads (e.g. failed-item `code`) and product-import
  template/row `errorCode` are also `UPPER_SNAKE_CASE`.
- Framework exceptions with no explicit code (native Nest exceptions, guards,
  pipes, missing routes) receive a generic fallback code from the filter:
  `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`,
  `CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMIT_EXCEEDED`,
  `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`, and so on.

### Validation Errors

The global `ValidationPipe` maps class-validator failures to status `400` with
code `VALIDATION_FAILED`, a `Validation failed` summary, and structured field
errors keyed by the external snake_case request path:

```json
{
  "status_code": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": { "fields": [{ "field": "display_name", "messages": ["displayName must be a string"] }] }
}
```

### Server Errors

Server errors are redacted to public-safe values:

- Any `500` renders `INTERNAL_SERVER_ERROR` with the generic
  `Internal server error` message and no `details` — even when an
  `HttpException` was thrown with a message.
- `502`/`503`/`504` keep an authored `code`, `message` and `details` only when
  the transport mapper supplied an explicit public `code`; otherwise they
  render the generic status message (`Service Unavailable`, `Bad Gateway`,
  `Gateway Timeout`) with no `details`.
- Other 5xx statuses render their generic status code and message with no
  `details` (e.g. `501` -> `NOT_IMPLEMENTED`).

Internal diagnostics (connection strings, host names, config hints) never reach
the client.

### OpenAPI

`ApiErrorResponseDto` is the single OpenAPI schema for the envelope. Endpoints
declare their own error responses with `@ApiErrorResponses` from
`src/platform/http/api-error-responses.decorator.ts` (or plain `@ApiResponse`
for one-off cases); the docs pipeline only completes the schema and a generic
fallback example on statuses an endpoint already declares — it never invents a
status. Operational endpoints outside `/v1` (health, metrics, queue UI) are not
part of this contract.

Error examples are attached to individual HTTP responses, with matching
`status_code`. The shared schema must not carry a domain-specific example.
Explicit endpoint examples take precedence over any generated fallback.

Document only statuses an endpoint can actually return. `429` applies to every
route protected by the global `ThrottlerGuard` unless the handler or class is
marked `@SkipThrottle`. A generic `500` may be declared once at class level
(e.g. class-level `@ApiErrorResponses({ 500: [...] })`) for unexpected server
failures. Do not document guard protection, validation failure, or conflict
statuses an endpoint cannot produce.

Class-level declarations fan out to every method, but a method-level response
for the same status replaces the class-level one outright (Nest merges responses
shallowly by status, not by example). When a method adds its own examples for a
status also declared on the class, re-list the common examples at method level
so they are not lost. Group all examples for one status in a single
`@ApiErrorResponses` declaration — repeating the same status on one target
overwrites it.

Reusable example payloads live in `*.error-responses.ts` modules rather than
inline in controllers. Platform-wide payloads are exported from
`src/platform/http/api-error-examples.ts` (`rateLimitErrorExample`,
`internalServerErrorExample`, `validationErrorExample(fields)`); domain payloads
live next to their controller (e.g.
`src/domains/<domain>/api/rest/<domain>-error-responses.ts`) and compose those
`ApiErrorExample` values into per-method `Record<number, ApiErrorExample[]>`
sets. The controller references the set through `@ApiErrorResponses(...)`, so
every status stays explicit at the endpoint. Auth guard failures are owned by the
auth domain: import `unauthorizedErrorExamples` (the four JWT `401` codes) and
`missingRequiredPermissionsErrorExample` (`403 MISSING_REQUIRED_PERMISSIONS`)
from `~/domains/auth/api/rest/errors/auth-error-examples`.

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
