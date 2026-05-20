# Layered Error Model

This codebase separates errors by architectural concern so business-rule failures, use-case failures, and transport concerns do not collapse into a single generic error type.

## Purpose

The goal of the layered error model is to keep error semantics aligned with the layer that owns the rule:

- domain errors represent invalid domain state or broken business invariants
- application errors represent use-case or orchestration failures
- transport layers map those errors into HTTP or GraphQL responses

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

- [auth-domain.error.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/auth/domain/errors/auth-domain.error.ts)

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

- [auth-app.error.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/auth/app/errors/auth-app.error.ts)

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

Domain and application layers should not depend on HTTP exceptions or HTTP status codes. These layers must remain independent from delivery mechanisms because the same domain rule or use case may be executed from REST controllers, GraphQL resolvers, background jobs, event handlers, or CLI commands.

Instead of coupling business logic to transport concerns, this codebase prefers explicit error types with clear semantic meaning. Transport-facing layers are responsible for translating those errors into the appropriate response shape and status code.

## Expected Business Failures

Not every business failure is an exceptional system failure. In a business domain, some failures are expected outcomes of normal logic, such as invalid credentials, an inactive session, or an invalid role key.

These cases should be modeled deliberately with named error types so they can be handled consistently and tested explicitly. This keeps business behavior understandable and avoids leaking delivery-layer concerns into domain logic.

## Why It Matters

- keeps business rules explicit and local to the domain
- prevents transport and workflow concerns from leaking into entities and value objects
- makes use cases easier to test because expected failures are named clearly
- improves consistency when mapping failures to API responses

## Related Code

- [domains](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/)
- [shared](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/shared/)
