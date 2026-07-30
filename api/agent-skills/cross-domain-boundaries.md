# Cross-Domain Boundaries

Use this file when adding or reviewing code that touches more than one domain module.

## Core Rule

Domains may depend on another domain's public behavior, but they should not depend on another domain's private implementation details.

In practice:

- do not import another domain's `infra/`
- do not import another domain's persistence entities directly
- do not return foreign ORM entities from app-layer ports
- do not construct and persist another domain's entity inside a local use case unless there is an explicit approved exception

## Prefer These Patterns

- call another domain through a port or exported application contract
- use an orchestrator use case for workflows that span multiple domains
- use events for follow-up side effects
- return small data shapes such as summaries, policy results, or value objects

## Smell Tests

These are usually signs of boundary leakage:

- a file under `domains/<x>/app` imports `domains/<y>/infra/...`
- an app port returns `*Entity`
- a use case sets fields that clearly belong to another domain's business rules
- a domain module reaches into another domain's repository implementation

## Default Action

When cross-domain collaboration is needed:

1. identify the capability you need from the other domain
2. define or use a behavior-shaped contract for that capability
3. keep persistence details private to the owning domain

If an exception is genuinely needed, keep it narrow and document why it exists.
