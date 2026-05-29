# Cloudflare FX Sync Cron

Cloudflare Worker that runs every hour and triggers the ARC API FX sync endpoint.

## What it does

- Cron Trigger fires hourly via `0 * * * *`
- Worker sends `POST` to:
  - `/v1/internal/jobs/fx-sync`
- Header:
  - `x-cron-secret: <FX_SYNC_TRIGGER_SECRET>`

This is intended for environments like Render Free where the web service may sleep and needs an external request to wake it.

## Required API setup

Your API must expose:

- `POST /v1/internal/jobs/fx-sync`

And Render must define:

- `FX_SYNC_TRIGGER_SECRET`

## Worker setup

From this directory:

```bash
npm install
```

Authenticate Wrangler if needed:

```bash
npx wrangler login
```

Set secrets and vars:

```bash
npx wrangler secret put FX_SYNC_TRIGGER_SECRET
```

```bash
npx wrangler secret put FX_SYNC_URL
```

Optional local dev file:

```bash
cp .dev.vars.example .dev.vars
```

## Commands

Local dev:

```bash
npm run dev
```

Manual test:

```bash
curl -X POST http://127.0.0.1:8787/run
```

Deploy:

```bash
npm run deploy
```

## Notes

- `FX_SYNC_URL` should be the full Render URL, for example:
  - `https://your-service.onrender.com/v1/internal/jobs/fx-sync`
- The same secret must be configured on both Cloudflare and Render.
- The worker also exposes `GET /` for a simple health/info response.
