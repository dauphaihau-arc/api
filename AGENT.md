# AGENT.md

Read this file first. Do not read every markdown file in the repository by default.

## Default Flow

1. Read `README.md` for top-level setup and architecture context.
2. Read files in `agents/` only when they are relevant to the task.
3. Read files in `docs/` only when the task needs deeper implementation detail.

## Routing

- For general repo rules, read `agents/repo-rules.md`.
- For architecture-sensitive work, read `agents/architecture.md`.
- For test or verification work, read `agents/testing.md`.
- For API module changes, start in `api/` and read only the nearest relevant docs.

## Working Style

- Prefer targeted changes over broad refactors.
- Preserve existing module boundaries and patterns unless the task explicitly asks to change them.
- If behavior changes, add or update tests.
