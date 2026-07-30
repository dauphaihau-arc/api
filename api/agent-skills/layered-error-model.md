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

## Expected Failures

- Treat normal business failures as named errors, not generic exceptions.
- Examples: invalid credentials, inactive session, invalid role key, missing required business field.
- Prefer explicit error types that can be tested and mapped consistently.

## Do Not

- Do not throw HTTP exceptions from domain or application layers.
- Do not collapse domain and use-case failures into one generic error type.
- Do not leak transport concerns into entities, value objects, repositories, or use cases.
