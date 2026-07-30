# Testing

Use this file when changing behavior, fixing bugs, or deciding whether a change needs tests.

## Goal

Test behavior that is meaningful, easy to regress, or expensive to rediscover manually.

## Decision Rule

- Add or update tests when a change affects business rules, workflow decisions, error handling, boundary contracts, persistence behavior, or a reported bug.
- Do not add tests for purely mechanical changes with no behavior impact, such as renames, comments, formatting, or local refactors that preserve behavior.
- Prefer the smallest test that proves the changed behavior.

Short rule:

- "could this regress in a meaningful way?" -> test it
- "is this only a mechanical non-behavioral change?" -> no new test required

## Placement Rules

- `domain/`: test business rules, value objects, invariants, and domain errors.
- `app/`: test use-case orchestration, permissions, workflow decisions, and application errors.
- `api/`: test request validation, DTO mapping, response shape, and transport error mapping.
- `infra/`: test repository behavior, query shape, and adapter wiring when the change depends on them.

## Minimum Useful Coverage

- Cover the success path when behavior changes.
- Cover the main expected failure path when adding or changing a rule.
- When fixing a bug, add coverage that would have caught the bug.
- Bug fixes require a regression test when the bug affects observable behavior.
- New business rules require tests at the layer that owns the rule, usually unit tests in `domain/` or `app/`.
- Endpoint contract changes require API or integration coverage that proves the external behavior.
- When changing mapping or contracts, verify both external shape and internal conversion.

## Avoid

- Do not use API tests to cover logic that belongs in domain or app tests.
- Do not add broad end-to-end coverage when a focused test at the relevant layer is enough.
- Do not mock away the behavior you are trying to verify.
- Do not remove, skip, or weaken tests merely to make them pass.
- Test public behavior rather than private implementation details.

## Default Bias

- Prefer the nearest existing test style in the touched module.
- Start with the smallest relevant scope, then broaden only if the behavior crosses layers or boundaries.
