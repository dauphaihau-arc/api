# Agent Skills Docs

Focused instructions for coding agents. These files are meant to be read selectively, not all at once.

Keep this file as a lightweight agent index.

This file is the canonical cross-agent entrypoint for repo guidance.

The `agent-skills/` folder contains detailed, task-specific instructions that should be loaded selectively for the current task.

Keep entries brief and scannable: one line per skill, focused on when to load it.

Put detailed rules, examples, and edge cases in the individual skill files.

- `src-structure.md` - source ownership and placement rules under `src/`
- `http-api-conventions.md` - HTTP API contract naming and DTO/serializer boundary rules
- `layered-error-model.md` - when to use domain errors versus application errors and where transport mapping belongs
- `cross-domain-boundaries.md` - cross-domain collaboration rules and forbidden infrastructure leakage patterns
- `repository-conventions.md` - how repositories should be split and what logic belongs there
- `use-case-boundaries.md` - when to use a use case versus a service
- `testing.md` - how to verify changes and where to add tests
