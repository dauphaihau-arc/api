# Repo Rules

## Repo Shape

- `api/` contains the NestJS application source, config, migrations, and scripts.
- `infra/` contains local Docker Compose services.
- `docs/` contains architecture and implementation notes.
- `seed-data/` contains TSV seed and reference data.

## Stack

- NestJS 11
- MikroORM
- PostgreSQL
- Redis
- BullMQ
- MinIO / S3-compatible object storage
- Zod
- PNPM
- Docker Compose
- Just

## Default Expectations

- Prefer small, local edits over broad cleanup.
- Match existing naming, folder structure, and dependency direction.
- Avoid introducing new cross-module coupling.
- Keep framework concerns out of domain logic when touching architecture-sensitive code.
- Update tests when behavior changes.

## Common Commands

```bash
just infra-up
just api-install
just api-up
just api-worker-up
just db-migration-up
just db-seed
just db-seed-demo
just storage-seed
cd api && pnpm test
```
