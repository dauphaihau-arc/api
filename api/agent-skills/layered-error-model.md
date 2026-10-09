# Layered Error Model

Use this file when adding or changing business errors, use-case errors, or transport error mapping.

## Rule

- Use a domain error when the business model rejects invalid state, invalid input, or a broken invariant.
- Use an application error when a use case cannot complete because of orchestration, lookup, workflow, policy, or external state.
- Keep HTTP and GraphQL exceptions out of domain and application code.

Short rule:

- "this value or entity is invalid" -> domain error
- "this use case cannot proceed" -> application error

## Layer Boundaries

- Domain errors belong in entities, value objects, and domain rules.
- Application errors belong in use cases and application services.
- Controllers, resolvers, or other transport adapters translate those errors into response status codes and payloads.

## Transport Mapping

- Map through the owning domain's mapper (`map<Domain>AppErrorToHttpException` with its `is<Domain>AppError` guard). Reuse it; do not hand-roll status codes in a controller.
- Apply it with a class-level per-domain exception filter, `@UseFilters(<Domain>ExceptionsFilter)`, built on
  `src/platform/filters/domain-exception.filter.ts`. The filter translates the domain error and renders it through
  `GlobalExceptionFilter`, so status codes, bodies, request-context logging and error reporting stay identical.
- Do not wrap each application call in `try/catch { throw map<Domain>AppErrorToHttpException(error) }`, and do not
  implement a filter that rethrows the mapped exception: Nest dispatches to one filter and does not re-dispatch a
  thrown exception to the next one.
- Use cases that return `Result` keep mapping at the call site with `resolveOrThrow(result, mapper)`.
- A filter only translates errors its own domain owns and passes everything else through untouched, so guards,
  interceptors and other layers keep their existing responses.

### Mapper Payload Shape

A mapper throws `new XException({ code, message, details? })`:

- `code` is the public `UPPER_SNAKE_CASE` business code. Assign one whenever the
  mapper currently emits none, a PascalCase/class name, or an inherited
  `DomainError` default, stripping any `Error` suffix
  (e.g. `ProductDraftIncompleteError` -> `PRODUCT_DRAFT_INCOMPLETE`). No legacy
  PascalCase codes or aliases remain.
- `message` is the human-readable summary (always a string at the HTTP boundary).
- `details` carries error-specific structured context. Any legacy extra fields
  (`reason`, counts, currencies, ids) move under `details`; the renderer drops
  unknown top-level keys.

The renderer (`GlobalExceptionFilter`) owns the envelope, so it — not the mapper —
decides the response status and `request_id`. A mapper payload can only supply
`code`, `message` and `details`. See
[the HTTP conventions](./http-api-conventions.md#error-responses) for the full
public envelope.

5xx responses are redacted: a `500` always renders the generic
`INTERNAL_SERVER_ERROR` body, and a `502`/`503`/`504` keeps an authored
`message`/`details` only when the mapper supplied an explicit public `code`.
Never rely on an `HttpException` message to surface server-side diagnostics.

#### Flattening Enumerated Reasons

When a domain error carries an enumerated reason, flatten it to a distinct code
instead of forwarding the raw reason. Promotion application failures are the
reference case:

| reason | code |
| --- | --- |
| `not_started` | `PROMOTION_NOT_STARTED` |
| `expired` | `PROMOTION_EXPIRED` |
| `usage_limit_reached` | `PROMOTION_USAGE_LIMIT_REACHED` |
| `user_usage_limit_reached` | `PROMOTION_USER_USAGE_LIMIT_REACHED` |
| `authentication_required` | `PROMOTION_AUTHENTICATION_REQUIRED` |
| `product_scope` | `PROMOTION_PRODUCT_SCOPE_MISMATCH` |
| `min_order_value` | `PROMOTION_MIN_ORDER_VALUE_NOT_MET` |
| `min_products` | `PROMOTION_MIN_PRODUCTS_NOT_MET` |
| `zero_benefit` | `PROMOTION_ZERO_BENEFIT` |

Other promotion codes: `PROMOTION_CODE_NOT_FOUND` (404),
`PROMOTION_CODE_NOT_APPLICABLE`, `PROMOTION_SLOT_CONFLICT`,
`PROMOTION_CURRENCY_CONVERSION_UNAVAILABLE`. Success-response
`ineligible_reason` and internal evaluator reasons are unchanged by this
flattening.


## Expected Failures

- Treat normal business failures as named errors, not generic exceptions.
- Examples: invalid credentials, inactive session, invalid role key, missing required business field.
- Prefer explicit error types that can be tested and mapped consistently.

## Do Not

- Do not throw HTTP exceptions from domain or application layers.
- Do not collapse domain and use-case failures into one generic error type.
- Do not leak transport concerns into entities, value objects, repositories, or use cases.
