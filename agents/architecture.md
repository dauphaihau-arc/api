# Architecture

Use this file when a task changes domain behavior, repositories, use cases, module boundaries, or shared abstractions.

## Intended Style

- Modular monolith
- Clean Architecture by module
- Domain-Driven Design influences around boundaries, use cases, ports, domain errors, and events

## Practical Constraints

- Keep business capabilities separated into explicit internal modules.
- Application and domain logic should not depend directly on transport or framework details.
- Repository and service contracts should remain behind ports.
- Shared abstractions should stay small and justified.
- Prefer extending an existing module over leaking logic into unrelated areas.

## Layered Errors

- Use domain errors when invalid state, invalid input, or business invariants are rejected by the domain model.
- Use application errors when a use case cannot complete because of lookup, policy, workflow, token, session, or orchestration outcomes.
- Do not throw HTTP-facing exceptions from domain or application layers.
- Map domain and application errors to HTTP or GraphQL responses only at the transport boundary.

## Nest DI Cycles

- Avoid constructor-time dependency cycles between modules and providers.
- If a dependency is only needed inside a method, prefer lazy resolution over constructor DI.
- Use lazy resolution as a tactical fix for runtime-only dependencies, not as the default wiring style.
- If both sides fundamentally depend on each other, refactor the boundary instead of spreading lazy lookups.

### Preferred Order Of Fixes

- First check whether one side only needs the dependency at runtime. If yes, resolve it lazily.
- If the cycle reflects orchestration crossing boundaries, extract a smaller port or a third service.
- If the dependency is really asynchronous workflow coordination, prefer an event, outbox, or job boundary over direct mutual injection.

## Read Next When Relevant

- `README.md`
- `docs/layered-error-model.md`
- `docs/outbox-pattern.md`
- `docs/checkout-transactional-outbox.md`
- `docs/structured-storage-keys.md`
