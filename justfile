compose_file := "infra/docker-compose.yml"
api_dir := "api"

infra-up:
  docker compose -f {{ compose_file }} up -d

infra-down:
  docker compose -f {{ compose_file }} down

# Wipes all named volumes, including Postgres, MinIO, and Redis data.
infra-fresh:
  docker compose -f {{ compose_file }} down -v
  docker compose -f {{ compose_file }} up -d

api-install:
  @cd {{ api_dir }} && pnpm install

api-up environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  if [ ! -f "$env_file" ] && [ "$env_file" = ".env" ] && [ -f ".env.example" ]; then cp ".env.example" "$env_file"; fi && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm start:dev

api-worker-up environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  if [ ! -f "$env_file" ] && [ "$env_file" = ".env" ] && [ -f ".env.example" ]; then cp ".env.example" "$env_file"; fi && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm start:worker:dev

api-seed environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm db:seed

api-db-clear:
  docker compose -f {{ compose_file }} up -d postgres
  docker compose -f {{ compose_file }} exec -T postgres psql -U postgres -d app -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Resets Postgres only, then reruns seed. MinIO and Redis remain intact.
api-db-fresh environment='': api-db-clear
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm db:seed

api-migration-up environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm db:migration:up

api-migration-down environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm db:migration:down

api-migration-create environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm db:migration:create

# Upload seed images to the configured object storage.
# Default env (`.env`) is intended for local MinIO.
# `production` can point to R2 via `.env.production`.
# Requires seeded categories/shops/products to already exist in the database.
upload-assets environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts

# Convenience recipe for local/dev flows: seed the database, then upload seed assets.
seed-with-assets environment='': api-seed
  just upload-assets {{environment}}
