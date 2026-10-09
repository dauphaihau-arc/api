# Layered Error Model

This codebase separates errors by architectural concern so business-rule failures, use-case failures, and transport concerns do not collapse into a single generic error type.

## Purpose

The goal of the layered error model is to keep error semantics aligned with the layer that owns the rule:

- domain errors represent invalid domain state or broken business invariants
- application errors represent use-case or orchestration failures
- transport layers map those errors into API responses

This keeps the domain model independent from delivery concerns while making application flows easier to reason about and test.

## Layers

### Domain Errors

Domain errors belong to the domain layer. They should be raised when an entity, value object, or domain rule rejects invalid state or input.

Typical examples:

- required business fields are missing
- a value has invalid format
- an invariant is violated
- a domain concept cannot be constructed safely

Reference:

- [auth-domain.error.ts](../../src/domains/auth/domain/errors/auth-domain.error.ts)

Examples from that file include:

- `EmailRequiredError`
- `InvalidEmailError`
- `InvalidRoleKeyError`

### Application Errors

Application errors belong to the application layer. They should be raised when a use case cannot complete because of orchestration, lookup, workflow, or policy outcomes.

Typical examples:

- a requested record is not found for the current flow
- credentials are invalid
- a session is inactive
- a token is expired or mismatched

Reference:

- [auth-app.error.ts](../../src/domains/auth/app/errors/auth-app.error.ts)

Examples from that file include:

- `InvalidCredentialsError`
- `UserNotFoundError`
- `SessionNotActiveError`

## Decision Rule

Use a domain error when the failure comes from the business model itself.

Use an application error when the failure comes from executing a use case that coordinates repositories, services, sessions, tokens, or external state.

Short rule:

- "this value or entity is invalid" -> domain error
- "this use case cannot proceed" -> application error

## Transport Independence

Domain and application layers should not depend on HTTP exceptions or HTTP status codes. These layers must remain independent from delivery mechanisms because the same domain rule or use case may be executed from REST controllers, background jobs, event handlers, or CLI commands.

Instead of coupling business logic to transport concerns, this codebase prefers explicit error types with clear semantic meaning. Transport-facing layers are responsible for translating those errors into the appropriate response shape and status code.

## HTTP Response Contract

Every business JSON endpoint (`/v1/...`) renders errors through
`GlobalExceptionFilter` as a single envelope:

- `status_code` — number, always matching the HTTP status line.
- `code` — stable machine-readable string, always present.
- `message` — human-readable string summary, always present.
- `request_id` — optional correlation id, echoed in `X-Request-Id` and logs.
- `details` — optional structured context (validation uses `details.fields`).

The filter is the single authority for the envelope: it resolves the status and
`request_id`, and it never lets an exception payload override them. Legacy
envelope fields (`statusCode`, `error`, `timestamp`, `path`) and arbitrary
top-level extras are not emitted; structured extras live under `details`.

Domain mappers own the business `code`s and throw
`new XException({ code, message, details? })`. Every public code is
`UPPER_SNAKE_CASE`: mappers assign one whether they previously emitted none, a
PascalCase/class name, or an inherited `DomainError` default, stripping any
`Error` suffix (`ProductDraftIncompleteError` -> `PRODUCT_DRAFT_INCOMPLETE`,
`ProductVersionConflictError` -> `PRODUCT_VERSION_CONFLICT`). No legacy
PascalCase codes or aliases remain. Framework failures (native Nest exceptions,
guards, pipes, missing routes) receive a generic fallback code derived from the
status. Enumerated sub-reasons are flattened to distinct codes — see the
promotion table in the [layered error skill](../../agent-skills/layered-error-model.md).
Server errors are redacted: a `500` always renders `INTERNAL_SERVER_ERROR` with
the generic `Internal server error` message and no `details`, and `502`/`503`/`504`
keep an authored payload only when an explicit public code was supplied. Internal
diagnostics never reach the client.

## Expected Business Failures

Not every business failure is an exceptional system failure. In a business domain, some failures are expected outcomes of normal logic, such as invalid credentials, an inactive session, or an invalid role key.

These cases should be modeled deliberately with named error types so they can be handled consistently and tested explicitly. This keeps business behavior understandable and avoids leaking delivery-layer concerns into domain logic.

## Why It Matters

- keeps business rules explicit and local to the domain
- prevents transport and workflow concerns from leaking into entities and value objects
- makes use cases easier to test because expected failures are named clearly
- improves consistency when mapping failures to API responses

## Related Code

- [domains](../../src/domains)
- [shared](../../src/shared)
