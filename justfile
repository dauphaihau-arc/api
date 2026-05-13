compose_file := "infra/docker-compose.yml"
api_dir := "api"

infra-up:
  docker compose -f {{ compose_file }} up -d

infra-down:
  docker compose -f {{ compose_file }} down

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