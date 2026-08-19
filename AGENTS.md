# Arc API Workspace Agent Instructions

Read this file first. Do not read every markdown file in the repository by default.

## Before Editing

1. Determine whether the work belongs to the Nest API app, inventory service, API infrastructure, or API docs.
2. For Nest API changes, read `api/AGENTS.md`.
3. For architecture-sensitive Nest API changes, read the relevant files in `api/agent-skills/`.
4. For operational or setup work, read only the relevant file under `docs/`.

## Default Flow

1. Read `README.md` for top-level setup and architecture context.
2. For Nest API work, read `api/AGENTS.md`.
3. Read files in `api/agent-skills/` only when they are relevant to the task.
4. Read files in `docs/` only when the task needs deeper implementation detail.

## Routing

- For general repo rules, read `api/agent-skills/common-rules.md`.
- For source structure or architecture-sensitive work, read `api/agent-skills/src-structure.md` and `api/agent-skills/cross-domain-boundaries.md`.
- For HTTP API work, read `api/agent-skills/http-api-conventions.md`.
- For error handling work, read `api/agent-skills/layered-error-model.md`.
- For test or verification work, read `api/agent-skills/testing.md`.
- For API module changes, start in `api/` and read only the nearest relevant docs.

## Working Style

- Prefer targeted changes over broad refactors.
- Preserve existing module boundaries and patterns unless the task explicitly asks to change them.
- If behavior changes, add or update tests.
