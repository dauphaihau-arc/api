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

## Expected Failures

- Treat normal business failures as named errors, not generic exceptions.
- Examples: invalid credentials, inactive session, invalid role key, missing required business field.
- Prefer explicit error types that can be tested and mapped consistently.

## Do Not

- Do not throw HTTP exceptions from domain or application layers.
- Do not collapse domain and use-case failures into one generic error type.
- Do not leak transport concerns into entities, value objects, repositories, or use cases.
