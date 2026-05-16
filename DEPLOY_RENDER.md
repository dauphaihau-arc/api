# Deploy To Render

This repo includes a Render Blueprint at [render.yaml](./render.yaml).

## What gets created

- `arc-api`: public web service
- `arc-worker`: background worker
- `arc-postgres`: Render Postgres database

## Before you create the Blueprint

Prepare these values:

- `CORS_ALLOWED_ORIGINS`
  Example: `https://app.example.com`
- `APP_BASE_URL`
  Example: `https://app.example.com`
- `AUTH_COOKIE_DOMAIN`
  Example: `.example.com`
- `REDIS_URL`
  Your external Redis connection URL
- `QUEUE_REDIS_URL`
  Usually the same value as `REDIS_URL`
- `STRIPE_SECRET_KEY`
  Only if Stripe checkout is enabled
- `STRIPE_WEBHOOK_SECRET_KEY`
  Required if `STRIPE_SECRET_KEY` is set
- `RESEND_API_KEY`
  Only if `MAIL_DRIVER=resend`
- `STORAGE_OBJECT_STORAGE_ENDPOINT`
  Example for Cloudflare R2: `https://<accountid>.r2.cloudflarestorage.com`
- `STORAGE_OBJECT_STORAGE_BUCKET`
  Example: `arc-production`
- `STORAGE_OBJECT_STORAGE_ACCESS_KEY`
- `STORAGE_OBJECT_STORAGE_SECRET_KEY`
- `STORAGE_PUBLIC_BASE_URL`
  Recommended when you expose uploaded files publicly

## Create the Blueprint

1. Push the repo branch that contains `render.yaml`.
2. In Render, choose `New` -> `Blueprint`.
3. Select this repository.
4. Confirm Render is using `/render.yaml` from the repo root.
5. Review the resources Render detects:
   - one web service
   - one worker
   - one Postgres database
6. Fill the prompted `sync: false` environment variables for both `arc-api` and `arc-worker`.
7. Create the Blueprint.

## First values to enter

For a typical frontend at `https://app.example.com`, start with:

```env
CORS_ALLOWED_ORIGINS=https://app.example.com
APP_BASE_URL=https://app.example.com
AUTH_COOKIE_DOMAIN=.example.com
```

For Redis, also set:

```env
REDIS_URL=redis://...
QUEUE_REDIS_URL=redis://...
```

Use the same URL for both unless you intentionally separate general Redis access from queue Redis access.

If Stripe is enabled:

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET_KEY=whsec_xxx
```

If Resend is enabled, also set:

```env
RESEND_API_KEY=re_xxx
```

For object storage, also set:

```env
STORAGE_OBJECT_STORAGE_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
STORAGE_OBJECT_STORAGE_BUCKET=arc-production
STORAGE_OBJECT_STORAGE_ACCESS_KEY=<access-key>
STORAGE_OBJECT_STORAGE_SECRET_KEY=<secret-key>
STORAGE_PUBLIC_BASE_URL=https://pub-<id>.r2.dev
```

## What Render will handle from the Blueprint

- Build command: `pnpm install && pnpm build`
- Web start command: `pnpm start:prod`
- Worker start command: `pnpm start:worker:prod`
- Web health check: `/health`
- Pre-deploy migration command: `pnpm db:migration:up`
- Shared DB wiring from Render Postgres
- Generated JWT secrets for both services
- Shared object-storage configuration shape for both services

## Important notes

### 1. Object storage is now the default

The current Blueprint uses:

```env
STORAGE_DRIVER=minio
STORAGE_OBJECT_STORAGE_REGION=auto
STORAGE_OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

This app uses the `minio` driver name for S3-compatible object storage, including Cloudflare R2 and AWS S3.

You must still provide these values during initial Blueprint creation:

- `STORAGE_OBJECT_STORAGE_ENDPOINT`
- `STORAGE_OBJECT_STORAGE_BUCKET`
- `STORAGE_OBJECT_STORAGE_ACCESS_KEY`
- `STORAGE_OBJECT_STORAGE_SECRET_KEY`
- optionally `STORAGE_PUBLIC_BASE_URL`

These are defined at the service level in the Blueprint so Render should prompt for them during setup.

Cloudflare R2 is usually the cleanest fit on Render because there is no local persistent disk dependency.

### 2. Cookie settings must match your frontend topology

The Blueprint currently sets:

```env
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=true
```

If your frontend and API are on different top-level sites and you need cross-site cookies, you may need:

```env
AUTH_COOKIE_SAME_SITE=none
AUTH_COOKIE_SECURE=true
```

Your app enforces `AUTH_COOKIE_SECURE=true` when `AUTH_COOKIE_SAME_SITE=none`.

### 3. Worker is required when queue driver is Redis

The Blueprint sets:

```env
QUEUE_DRIVER=redis
```

That means background jobs are expected to be processed by `arc-worker`.

This Blueprint expects Redis to come from your external provider via:

- `REDIS_URL`
- `QUEUE_REDIS_URL`

## After the first deploy

Verify:

1. `arc-api` is healthy.
2. `GET /health` returns success.
3. `arc-worker` is running.
4. Postgres migrations completed successfully during deploy.
5. Login/cookie flow works from your frontend origin.
6. If enabled, Redis-backed caching, rate limit, and queue flows work.

## Updating the infrastructure later

Change [render.yaml](./render.yaml), commit, and sync the Blueprint again in Render.
