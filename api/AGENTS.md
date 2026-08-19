# Arc API Agent Instructions

This directory contains the Nest API. Read this file before changing API code.

## Before Editing

1. Identify the touched domain, platform module, integration, or bootstrap surface.
2. Read `agent-skills/README.md`, then load only the focused guidance needed for the change.
3. For domain-sensitive changes, confirm the relevant domain vocabulary from the repo context docs.
4. For architecture-sensitive changes, check source placement and cross-domain boundary guidance before editing.

## Guidance Router

The canonical API guidance index is `agent-skills/README.md`.

Load only the files relevant to the task:

- File placement or new module shape: `agent-skills/src-structure.md`
- HTTP contracts, DTOs, serializers, or controllers: `agent-skills/http-api-conventions.md`
- Domain/application errors or transport mapping: `agent-skills/layered-error-model.md`
- Cross-domain workflows or imports: `agent-skills/cross-domain-boundaries.md`
- Repository changes: `agent-skills/repository-conventions.md`
- Use cases or orchestration: `agent-skills/use-case-boundaries.md`
- Behavior changes and bug fixes: `agent-skills/testing.md`

## Architecture Check

Run the executable API boundary check when touching domain, shared, or
integration code:

```bash
pnpm check:architecture
```

The root harness can run it from anywhere:

```bash
./scripts/verify architecture
```

## Verification

For API-only changes:

```bash
pnpm check
```

From the repository root:

```bash
./scripts/verify api
```
