# Cloudflare Outbox Drain Cron

Cloudflare Worker that runs every 5 minutes and triggers the ARC API outbox drain endpoint.

## What it does

- Cron Trigger fires every 5 minutes via `*/5 * * * *`
- Worker sends `POST` to:
  - `/v1/internal/jobs/drain`
- Header:
  - `x-cron-secret: <OUTBOX_DRAIN_TRIGGER_SECRET>`

This is intended for environments like Render Free where the web service has no background worker and may sleep, so the outbox and reconciliation ticks need an external request to wake and drive it.

## Required API setup

Your API must expose:

- `POST /v1/internal/jobs/drain`

And Render must define:

- `OUTBOX_DRAIN_TRIGGER_SECRET`
- `FINANCE_MONEY_EVENT_BOOKING=inline` (when the API has no background worker to drain the fintech outbox itself)

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
npx wrangler secret put OUTBOX_DRAIN_TRIGGER_SECRET
```

```bash
npx wrangler secret put DRAIN_URL
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

- `DRAIN_URL` should be the full Render URL, for example:
  - `https://your-service.onrender.com/v1/internal/jobs/drain`
- The same secret must be configured on both Cloudflare and Render.
- The 5-minute cadence also keeps the Render Free web service awake, which fits inside the ~744 of 750 free instance hours per month.
- Cron changes can take up to 15 minutes to propagate after deploy.
- Worker cron invocations may run for up to 15 minutes, so the 90s drain timeout plus a Render cold start fits comfortably.
- The worker also exposes `GET /` for a simple health/info response.
