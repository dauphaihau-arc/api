compose_file := "infra/docker-compose.yml"
api_dir := "api"

# --------- Infrastructure

infra-up:
  docker compose -f {{ compose_file }} up -d

infra-down:
  docker compose -f {{ compose_file }} down

# Wipes all named volumes, including Postgres, MinIO, and Redis data.
infra-fresh:
  docker compose -f {{ compose_file }} down -v
  docker compose -f {{ compose_file }} up -d



# --------- API app

api-install:
  @cd {{ api_dir }} && pnpm install

api-up:
  cd {{ api_dir }} && \
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then cp ".env.example" ".env"; fi && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm start:dev

api-up-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm start:dev

api-worker-up:
  cd {{ api_dir }} && \
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then cp ".env.example" ".env"; fi && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm start:worker:dev

api-worker-up-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm start:worker:dev



# --------- Migrations

api-migration-up:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:migration:up

api-migration-up-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm db:migration:up

api-migration-down:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:migration:down

api-migration-down-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm db:migration:down
  


# --------- Seeding
# See docs/seeding.md for seed mode guidance and command examples.

api-seed-demo:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed:demo

api-seed:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed

# Example:
# export INFISICAL_TOKEN="your-token"
# just api-seed-demo-infisical your-project-id prod
api-seed-demo-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm db:seed:demo

api-seed-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm db:seed

api-db-clear:
  docker compose -f {{ compose_file }} up -d postgres
  docker compose -f {{ compose_file }} exec -T postgres psql -U postgres -d app -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Resets Postgres only, then reruns demo seed. MinIO and Redis remain intact.
api-db-fresh-demo: api-db-clear
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed:demo

# Resets Postgres only, then reruns reference-data seed. MinIO and Redis remain intact.
api-db-fresh: api-db-clear
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed


# Upload seed images to the configured object storage.
# Default env (`.env`) is intended for local MinIO.
# `production` can point to R2 via `.env.production`.
# Requires seeded categories/shops/products to already exist in the database.
upload-assets:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts

upload-assets-infisical project_id env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  pnpm exec infisical run --projectId="{{ project_id }}" --env="{{ env_name }}" --token="$INFISICAL_TOKEN" -- pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts

# Convenience recipe for local/dev flows: seed demo data, then upload seed assets.
seed-with-assets: api-seed-demo
  just upload-assets
