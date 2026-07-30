# Use Case Boundaries

Use this file when adding or refactoring application-layer orchestration in a domain module.

## Purpose

This codebase uses `use case` classes as the main application boundary inside domain modules. The goal is not to create a class for every method mechanically. The goal is to keep domain workflows from collapsing into large, ambiguous services.

## Decision Rule

- Use a `UseCase` class for a domain-level application action.
- Use a plain service for reusable technical capability or shared infrastructure behavior.

Short rule:

- "execute a business workflow" -> use case
- "provide a reusable capability" -> service

## Good Fit For A Use Case

Prefer a `UseCase` when the code:

- coordinates multiple collaborators
- enforces policy, permissions, or workflow rules
- performs writes or state transitions
- emits events, dispatches jobs, or triggers side effects
- needs a clear application-level input and output boundary
- represents a named business action such as `CreateUser`, `Login`, or `ResetPassword`

## Good Fit For A Service

Prefer a service when the code:

- offers shared technical behavior used by multiple flows
- wraps infrastructure or platform concerns
- does not itself represent a business action
- is better described as a capability than a workflow

Examples in this repo include notification, health, storage, mail, and audit services.

## Avoid

- giant `*.service.ts` files that become a dumping ground for unrelated workflows
- moving orchestration and policy checks down into repositories
- creating `UseCase` classes in shared technical modules just for naming symmetry
- forcing one use-case class per trivial helper function

## Thin Reads

Simple reads can still live in a use case when that keeps transport boundaries consistent in a domain module. Do not treat this as a requirement for every helper or query. The key question is whether the code is acting as the application entry point for that domain action.
