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

stack-up:
  docker compose -f {{ compose_file }} --profile app up -d --build

stack-down:
  docker compose -f {{ compose_file }} down



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

api-up-observability:
  cd {{ api_dir }} && \
  mkdir -p logs && \
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then cp ".env.example" ".env"; fi && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  LOG_PRETTY=false pnpm start:dev 2>&1 | tee logs/api.log

api-up-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm start:dev

api-worker-up:
  cd {{ api_dir }} && \
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then cp ".env.example" ".env"; fi && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm start:worker:dev

api-worker-up-observability:
  cd {{ api_dir }} && \
  mkdir -p logs && \
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then cp ".env.example" ".env"; fi && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  LOG_PRETTY=false pnpm start:worker:dev 2>&1 | tee logs/worker.log

api-worker-up-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm start:worker:dev

# List environment variables from Infisical
api-env-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- env | sort


# --------- Migrations

db-migration-up:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:migration:up

db-migration-up-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm db:migration:up

db-migration-down:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:migration:down

db-migration-down-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm db:migration:down
  


# -------------------- Seeding
# See docs/seeding.md for seed mode guidance and command examples.

db-seed-demo:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed:demo

db-seed:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:seed

# Example:
# export INFISICAL_TOKEN="your-token"
# just db-seed-demo-infisical your-project-id
# just db-seed-demo-infisical your-project-id prod
db-seed-demo-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm db:seed:demo

db-seed-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm db:seed

db-clear:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm db:clear

db-clear-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm db:clear

# Clears schema, reruns migrations via the seed script, then seeds reference data.
db-fresh: db-clear
  just db-seed

# Clears schema, reruns migrations via the seed script, then seeds the full demo dataset.
db-fresh-demo: db-clear
  just db-seed-demo

# Clears schema, reruns migrations via the seed script, then seeds reference data.
db-fresh-infisical project_id *env_name:
  just db-clear-infisical {{project_id}} {{env_name}}
  just db-seed-infisical {{project_id}} {{env_name}}

# Clears schema, reruns migrations via the seed script, then seeds the full demo dataset.
db-fresh-demo-infisical project_id *env_name:
  just db-clear-infisical {{project_id}} {{env_name}}
  just db-seed-demo-infisical {{project_id}} {{env_name}}


redis-clear:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm redis:clear

redis-clear-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm redis:clear


# Upload seed images to the configured object storage.
# Default env (`.env`) is intended for local MinIO.
# Requires seeded categories/shops/products to already exist in the database.
storage-seed:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts

storage-seed-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm ts-node -r tsconfig-paths/register ./scripts/upload-minio-assets.ts

storage-clear:
  cd {{ api_dir }} && \
  test -f ".env" && \
  set -a && \
  . ".env" && \
  set +a && \
  pnpm storage:clear

storage-clear-infisical project_id *env_name:
  cd {{ api_dir }} && \
  test -n "$INFISICAL_TOKEN" && \
  ENV_ARG='{{ if env_name != "" { "--env=" + env_name } else { "" } }}' && \
  pnpm exec infisical run --projectId="{{ project_id }}" $ENV_ARG --token="$INFISICAL_TOKEN" -- pnpm storage:clear

storage-fresh: storage-clear
  just storage-seed

storage-fresh-infisical project_id *env_name:
  just storage-clear-infisical {{project_id}} {{env_name}}
  just storage-seed-infisical {{project_id}} {{env_name}}
