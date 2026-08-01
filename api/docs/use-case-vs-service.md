# Use Case Vs Service

This codebase uses both `use case` classes and Nest `service` classes, but they do not mean the same thing.

## Why This Needs A Rule

Without an explicit rule, both names drift toward the same role:

- controllers start calling large, generic services
- services accumulate unrelated workflows
- repositories absorb orchestration to compensate
- boundaries between domain logic, application logic, and infrastructure blur

The result is not just naming confusion. It becomes harder to reason about where business workflows should live and what depends on what.

## Recommended Boundary

Inside a domain module:

- use a `UseCase` class for a business or application action
- use a service only when it provides a reusable capability rather than owning a domain workflow

Inside a shared technical module:

- use services by default
- introduce a use case only if the module truly starts modeling a domain-like workflow boundary, which should be rare

## What A Use Case Owns

A use case is the application-layer entry point for a named workflow.

Typical responsibilities:

- accept a task-shaped input
- coordinate repositories, domain objects, and external ports
- enforce permissions, policy, or workflow sequencing
- return a task-shaped result or a named application error
- trigger side effects such as events, jobs, notifications, or storage updates when needed

Examples from this repo:

- `CreateUserUseCase`
- `LoginUseCase`
- `ResetPasswordUseCase`

These are business actions with clear intent and clear orchestration boundaries.

## What A Service Owns

A service provides a reusable capability. It may still contain logic, but that logic is capability logic, not a business workflow boundary.

Typical examples:

- health checks
- notification delivery
- audit writing
- storage access
- mail sending

These are technical or cross-cutting capabilities that multiple use cases may call.

## Simple Reads

Simple reads are where the naming often feels blurry.

A thin read may still live in a use case when:

- controllers and resolvers are expected to depend on application entry points consistently
- the read is a named domain action
- the read may later grow policy, projection, caching, or workflow constraints

A thin read does not need to become a broad service just because the first version is small.

At the same time, do not create extra classes for internal helpers that are not real application boundaries.

## Practical Decision Test

Use a `UseCase` when most of these are true:

- the name sounds like an action
- the caller is an API boundary, job handler, listener, or another application entry point
- the code coordinates collaborators
- the behavior belongs to one domain module
- the operation should have explicit success and failure semantics

Use a service when most of these are true:

- the name sounds like a capability
- multiple workflows may reuse it
- the logic is technical, infrastructural, or cross-cutting
- it should not become the main bucket for domain orchestration

## Anti-Patterns

Avoid these failure modes:

- one large `UserService` containing create, update, login, role assignment, token handling, avatar upload, and admin queries
- repositories performing permission checks, event emission, or workflow branching
- shared modules growing fake use cases only to mirror domain modules
- use cases that are only pass-through wrappers around a service with no boundary value

## Recommended Rule For This Template

Use explicit use-case classes when workflows are complex, transactional, side-effecting, or business-critical.

Do not force use-case classes for every helper or every technical capability.

But also do not collapse domain application actions into broad services. In this template, the default boundary for domain workflows should remain the use case.
