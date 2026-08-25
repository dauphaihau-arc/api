compose_file := "infra/docker-compose.yml"
compose_project := "arc-api"
legacy_compose_project := "infra"
api_dir := "api"
inventory_service_dir := "inventory-service"

# --------- Private helpers

[private]
_compose-down volume_args='':
  docker compose -p {{ compose_project }} -f {{ compose_file }} down {{ volume_args }} --remove-orphans
  if [ "{{ legacy_compose_project }}" != "{{ compose_project }}" ]; then docker compose -p {{ legacy_compose_project }} -f {{ compose_file }} down {{ volume_args }} --remove-orphans; fi

[private]
_api-with-env command environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  {{ command }}

[private]
_api-with-default-env command environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ api_dir }} && \
  if [ ! -f "$env_file" ] && [ "$env_file" = ".env" ] && [ -f ".env.example" ]; then cp ".env.example" "$env_file"; fi && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  {{ command }}

[private]
_api-db-preflight environment='':
  just _api-with-default-env "node -e 'const { Client } = require(\"pg\"); const timeoutMs = Number(process.env.DB_PREFLIGHT_TIMEOUT_MS ?? 5000); const connectionUrl = (process.env.DATABASE_URL ?? \"\").trim(); const host = process.env.DB_HOST ?? \"127.0.0.1\"; const port = Number(process.env.DB_PORT ?? 5432); const user = process.env.DB_USER ?? \"postgres\"; const database = process.env.DB_NAME ?? \"app\"; const target = connectionUrl ? (() => { const url = new URL(connectionUrl); return (url.username || \"user\") + \"@\" + url.hostname + \":\" + (url.port || 5432) + url.pathname; })() : user + \"@\" + host + \":\" + port + \"/\" + database; const client = connectionUrl ? new Client({ connectionString: connectionUrl, connectionTimeoutMillis: timeoutMs }) : new Client({ host, port, user, password: process.env.DB_PASSWORD ?? \"postgres\", database, connectionTimeoutMillis: timeoutMs }); client.connect().then(() => client.query(\"select 1\")).then(() => client.end()).catch((error) => { console.error(\"DB preflight failed: cannot connect to \" + target + \" within \" + timeoutMs + \"ms.\"); console.error(\"If Docker reports arc-postgres healthy and you are using Colima, restart Colima/Lima port forwarding: colima restart\"); console.error(\"Cause: \" + error.message); process.exit(1); });'" "{{ environment }}"

[private]
_inventory-service-with-env command environment='':
  env_file="{{ if environment == "" { ".env" } else { ".env." + environment } }}"; \
  cd {{ inventory_service_dir }} && \
  test -f "$env_file" && \
  set -a && \
  . "$env_file" && \
  set +a && \
  {{ command }}

[private]
_api-with-infisical project_id env_name command:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- {{ command }}

# --------- Infrastructure

infra-up:
  docker compose -p {{ compose_project }} -f {{ compose_file }} --profile catalog-nosql up -d

infra-down:
  just _compose-down

# Wipes all named volumes, including Postgres, MinIO, and Redis data.
infra-fresh:
  just _compose-down "-v"
  docker compose -p {{ compose_project }} -f {{ compose_file }} --profile catalog-nosql up -d

stack-up:
  cd {{ api_dir }} && \
  if [ ! -f ".env.docker" ] && [ -f ".env.docker.example" ]; then cp ".env.docker.example" ".env.docker"; fi && \
  cd .. && \
  docker compose -p {{ compose_project }} -f {{ compose_file }} --profile app up -d --build

stack-down:
  just _compose-down


# --------- API app

api-install:
  @cd {{ api_dir }} && pnpm install

api-up environment='':
  just _api-db-preflight "{{ environment }}"
  just _api-with-default-env "pnpm start:dev" "{{ environment }}"

api-up-observability environment='':
  just _api-db-preflight "{{ environment }}"
  just _api-with-default-env "mkdir -p logs && LOG_PRETTY=false pnpm start:dev 2>&1 | tee logs/api.log" "{{ environment }}"

api-up-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm start:dev"

api-worker-up environment='':
  just _api-with-default-env "pnpm start:worker:dev" "{{ environment }}"

api-worker-up-observability environment='':
  just _api-with-default-env "mkdir -p logs && LOG_PRETTY=false pnpm start:worker:dev 2>&1 | tee logs/worker.log" "{{ environment }}"

api-worker-up-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm start:worker:dev"

# List environment variables from Infisical.
api-env-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "env | sort"

# --------- Inventory service app
  
inventory-service-up environment='':
  just _inventory-service-with-env "go run ./cmd/inventory-service" "{{ environment }}"


# --------- Migrations

db-migration-up environment='':
  just _api-with-env "pnpm db:migration:up" "{{ environment }}"

db-migration-up-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:migration:up"

db-migration-down environment='':
  just _api-with-env "pnpm db:migration:down" "{{ environment }}"

db-migration-down-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:migration:down"

db-migration-create environment='':
  just _api-with-env "pnpm db:migration:create" "{{ environment }}"

db-migration-create-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:migration:create"


# -------------------- Seeding
# See docs/seeding.md for seed mode guidance and command examples.

seed-validate:
  scripts/validate-local-seed-data.sh

# Clears schema, seeds the full demo dataset, uploads seeded assets, and refreshes catalog products.
seed-full environment='': seed-validate
  just db-clear {{ environment }}
  just db-seed-demo {{ environment }}
  just storage-fresh {{ environment }}
  just refresh-catalog-products {{ environment }}

# Clears schema, seeds the full demo dataset, uploads seeded assets, and refreshes catalog products.
seed-full-infisical project_id *env_name: seed-validate
  just db-clear-infisical {{ project_id }} {{ env_name }}
  just db-seed-demo-infisical {{ project_id }} {{ env_name }}
  just storage-fresh-infisical {{ project_id }} {{ env_name }}
  just refresh-catalog-products-infisical {{ project_id }} {{ env_name }}

db-seed-demo environment='': seed-validate
  just _api-with-env "pnpm db:seed:demo" "{{ environment }}"

db-seed environment='': seed-validate
  just _api-with-env "pnpm db:seed" "{{ environment }}"

# Example:
# export INFISICAL_TOKEN="your-token"
# just db-seed-demo-infisical your-project-id
# just db-seed-demo-infisical your-project-id prod
db-seed-demo-infisical project_id *env_name: seed-validate
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:seed:demo"

db-seed-infisical project_id *env_name: seed-validate
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:seed"

refresh-catalog-products environment='':
  just _api-with-env "pnpm catalog:refresh-products" "{{ environment }}"

refresh-catalog-products-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm catalog:refresh-products"

sync-catalog-indexes environment='':
  just _api-with-env "pnpm catalog:indexes:sync" "{{ environment }}"

sync-catalog-indexes-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm catalog:indexes:sync"

db-clear environment='':
  just _api-with-env "pnpm db:clear" "{{ environment }}"

db-clear-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm db:clear"

# Clears schema, reruns migrations via the seed script, then seeds reference data.
db-fresh environment='': seed-validate
  just db-clear {{ environment }}
  just db-seed {{ environment }}
  just refresh-catalog-products {{ environment }}

# Clears schema, reruns migrations via the seed script, then seeds the full demo dataset.
db-fresh-demo environment='': seed-validate
  just db-clear {{ environment }}
  just db-seed-demo {{ environment }}
  just refresh-catalog-products {{ environment }}

# Clears schema, reruns migrations via the seed script, then seeds reference data.
db-fresh-infisical project_id *env_name: seed-validate
  just db-clear-infisical {{ project_id }} {{ env_name }}
  just db-seed-infisical {{ project_id }} {{ env_name }}
  just refresh-catalog-products-infisical {{ project_id }} {{ env_name }}

# Clears schema, reruns migrations via the seed script, then seeds the full demo dataset.
db-fresh-demo-infisical project_id *env_name: seed-validate
  just db-clear-infisical {{ project_id }} {{ env_name }}
  just db-seed-demo-infisical {{ project_id }} {{ env_name }}
  just refresh-catalog-products-infisical {{ project_id }} {{ env_name }}


redis-clear environment='':
  just _api-with-env "pnpm redis:clear" "{{ environment }}"

redis-clear-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm redis:clear"


# Upload seed images to the configured storage backend and generate product variants.
# Default env (`.env`) is intended for local MinIO, but local file storage also works.
# Requires seeded categories/shops/products to already exist in the database.
storage-seed environment='':
  just _api-with-env "pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts" "{{ environment }}"

storage-seed-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts"

storage-clear environment='':
  just _api-with-env "pnpm storage:clear" "{{ environment }}"

storage-clear-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm storage:clear"

storage-fresh environment='':
  just storage-clear {{ environment }}
  just storage-seed {{ environment }}

review-image-variants-backfill environment='':
  just _api-with-env "pnpm ts-node -r tsconfig-paths/register ./scripts/backfill-review-image-variants.ts" "{{ environment }}"

review-image-variants-backfill-infisical project_id *env_name:
  just _api-with-infisical "{{ project_id }}" "{{ env_name }}" "pnpm ts-node -r tsconfig-paths/register ./scripts/backfill-review-image-variants.ts"

storage-fresh-infisical project_id *env_name:
  just storage-clear-infisical {{ project_id }} {{ env_name }}
  just storage-seed-infisical {{ project_id }} {{ env_name }}
