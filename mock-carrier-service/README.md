# Mock Carrier service

A dependency-free mock carrier for local Arc development. It registers parcels,
simulates a handover journey (pickup → transit → out for delivery → delivered)
and pushes every scan to the Arc API webhook, signed with HMAC-SHA256.

Plain ESM using only `node:` builtins (`http`, `crypto`); no install step.

## Layout

- `server.mjs` — process boot, dependency wiring, HTTP server lifecycle.
- `src/router.mjs` — path → handler table; the only place that maps HTTP to operations.
- `src/parcels.mjs` — registration, handover, manual advance, and the in-memory state.
- `src/webhook.mjs` — HMAC signing and delivery of each scan.
- `src/scheduler.mjs` — automatic journey timers (tests inject a fake clock).
- `src/http.mjs` — JSON body/response helpers and `HttpError`.
- `src/tracking.mjs` — carrier patterns and tracking-number generation.
- `src/constants.mjs` — carriers, event codes, schedule, defaults.
- `test/` — HTTP-surface tests with a fake webhook receiver.

## Requirements

- Node.js >= 22 (developed on Node 24).

## Start

From the repository root, either recipe form:

```bash
just -f apps/api/justfile mock-carrier-up
# or, from apps/api:
just mock-carrier-up
# or directly, from apps/api:
node mock-carrier-service/server.mjs
```

The service loads `mock-carrier-service/.env` when present (copy
`.env.example`); the recipe does that for you. It listens on
<http://127.0.0.1:4100> by default. The API must be
running (and exposing its carrier webhook) if you want deliveries to be
accepted; a failed webhook POST is logged and never crashes the service.

### Environment variables

| Variable                | Default                                          | Purpose                                             |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `PORT`                  | `4100`                                           | HTTP port (`0` picks a free port).                  |
| `HOST`                  | `127.0.0.1`                                      | Bind address.                                       |
| `API_WEBHOOK_URL`       | `http://127.0.0.1:4000/v1/webhooks/carrier`      | Where every emitted scan is POSTed.                 |
| `CARRIER_WEBHOOK_SECRET`| `carrier-webhook-test-secret`                    | HMAC key for `x-carrier-signature`.                 |

Run against the local API:

```bash
API_WEBHOOK_URL=http://127.0.0.1:4000/v1/webhooks/carrier \
CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret \
node mock-carrier-service/server.mjs
```

## State is in memory only

Parcels, events and the pending automatic timers live in a `Map` inside the
process. **Restarting the service loses every registered parcel**, and any
journey that was mid-flight simply stops. This is intentional for a dev mock:
re-register parcels (or re-run your fixture script) after a restart. There is no
persistence, no database and no replay.

## HTTP contract

| Method | Path                                   | Result                                                        |
| ------ | -------------------------------------- | ------------------------------------------------------------- |
| GET    | `/health`                              | `200 {"status":"ok"}`                                         |
| POST   | `/parcels`                             | `201` new parcel / `200` existing parcel, body `{"parcel":…}` |
| GET    | `/parcels/:tracking_number`            | `200 {"parcel":…}` / `404 PARCEL_NOT_FOUND`                   |
| POST   | `/parcels/:tracking_number/handover`   | `202 {"parcel":…}` / `404 PARCEL_NOT_FOUND`                   |
| POST   | `/parcels/:tracking_number/advance`    | `200 {"parcel":…,"emitted":{…}}` / `404`, `409`, `400`        |

Supported carriers and tracking-number formats:

| Carrier  | Pattern                | Generated form                        |
| -------- | ---------------------- | ------------------------------------- |
| `usps`   | `^9\d{21}$`            | `9` + 21 random digits                |
| `dhl`    | `^\d{10}$`             | 10 random digits                      |
| `vnpost` | `^[A-Z]{2}\d{9}VN$`    | 2 random uppercase letters + 9 digits + `VN` |

Parcel shape:

```json
{
  "carrier": "usps",
  "tracking_number": "9400111899223197428490",
  "handed_over_at": null,
  "auto": false,
  "events": [
    {
      "event_id": "evt-0f0c2a8e-6a2c-4c5f-9d1e-2b0c4a1f9e77",
      "event_code": "PICKED_UP",
      "location": "Mock Carrier Facility",
      "occurred_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

- `handed_over_at` is `null` until handover, then an ISO timestamp.
- `auto` is `true` while automatic timers are armed (after handover) and `false`
  before handover and after a manual advance.
- No scan exists before handover. Handover emits `PICKED_UP` synchronously
  (webhook delivery is awaited), then schedules `IN_TRANSIT` at +60s,
  `OUT_FOR_DELIVERY` at +300s and `DELIVERED` at +420s relative to handover.
- A manual advance cancels every pending automatic timer for that parcel,
  sets `auto=false`, and awaits delivery of the emitted event, so tests are
  deterministic.

### Registration

```bash
# generated tracking number (201)
curl -sS -X POST http://127.0.0.1:4100/parcels \
  -H 'content-type: application/json' \
  -d '{"carrier":"usps"}'

# supplied tracking number (201; repeats return the existing parcel with 200)
curl -sS -X POST http://127.0.0.1:4100/parcels \
  -H 'content-type: application/json' \
  -d '{"carrier":"dhl","tracking_number":"1234567890"}'

# unsupported carrier -> 422 {"code":"UNSUPPORTED_CARRIER"}
curl -sS -X POST http://127.0.0.1:4100/parcels \
  -H 'content-type: application/json' \
  -d '{"carrier":"other"}'

# malformed tracking number -> 422 {"code":"INVALID_TRACKING_NUMBER"}
curl -sS -X POST http://127.0.0.1:4100/parcels \
  -H 'content-type: application/json' \
  -d '{"carrier":"usps","tracking_number":"123"}'
```

### Handover and journey

```bash
curl -sS http://127.0.0.1:4100/health

curl -sS -X POST http://127.0.0.1:4100/parcels/1234567890/handover \
  -H 'content-type: application/json' \
  -d '{"carrier":"dhl"}'

# next journey event, in order PICKED_UP -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED
curl -sS -X POST http://127.0.0.1:4100/parcels/1234567890/advance \
  -H 'content-type: application/json' \
  -d '{"carrier":"dhl"}'

# chosen event (also: DELIVERY_FAILED, RETURNED)
curl -sS -X POST http://127.0.0.1:4100/parcels/1234567890/advance \
  -H 'content-type: application/json' \
  -d '{"carrier":"dhl","event_code":"DELIVERY_FAILED","location":"Test Hub"}'

curl -sS http://127.0.0.1:4100/parcels/1234567890
```

Error responses: `404 PARCEL_NOT_FOUND`, `409 NOT_HANDED_OVER` (advance before
handover), `400 INVALID_EVENT_CODE`, `422 UNSUPPORTED_CARRIER`,
`422 INVALID_TRACKING_NUMBER`.

## Webhook delivery

Every emitted event is POSTed to `API_WEBHOOK_URL`:

```
content-type: application/json
x-carrier-signature: sha256=<hex>
```

`<hex>` is `HMAC-SHA256(CARRIER_WEBHOOK_SECRET, exact request body bytes)`.
Body:

```json
{
  "event_id": "evt-...",
  "carrier": "usps",
  "tracking_number": "9400111899223197428490",
  "event_code": "PICKED_UP",
  "location": "Mock Carrier Facility",
  "occurred_at": "2026-01-01T00:00:00.000Z"
}
```

Handover and manual advance await delivery; automatic timer emissions are
fire-and-forget. Non-2xx responses, timeouts (5s) and network errors are logged
as `[mock-carrier] webhook delivery …` and never crash the service.

Verify a signature manually:

```bash
BODY='{"event_id":"evt-test","carrier":"usps","tracking_number":"9400111899223197428490","event_code":"PICKED_UP","location":"Mock Carrier Facility","occurred_at":"2026-01-01T00:00:00.000Z"}'
printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'carrier-webhook-test-secret'
```

## Tests

```bash
node --test mock-carrier-service/test
```

The suite talks to the service over real HTTP, runs a fake webhook receiver that
verifies the HMAC over the raw body, and injects a fake clock/scheduler so no
test waits 60–420 seconds. It covers registration (generated, supplied, invalid,
unsupported), no-events-before-handover, handover emission and signature,
duplicate handover, manual advance (next, chosen, `DELIVERY_FAILED`,
`RETURNED`, timer cancellation), the timer schedule, and the 404/409/400/405
paths, plus webhook-unreachable resilience.

`mock-carrier-service/package.json` exists only to mark this directory as ESM and
to give `node --test test` a directory entry point (`test/index.js`): Node 24
treats a positional directory as a module path rather than a test directory, so
`test/index.js` imports every test file. An explicit glob
(`node --test 'mock-carrier-service/test/*.test.mjs'`) also works.

## Contract notes

The mock follows the shared API contract exactly. It additionally defines these
error codes for situations the contract leaves open; they never replace a
documented response:

- `409 JOURNEY_COMPLETE` — `advance` without `event_code` after all four journey
  events were already emitted.
- `409 CARRIER_MISMATCH` — the request body names a different carrier than the
  registered parcel.
- `409 TRACKING_NUMBER_CONFLICT` — defensive only; carrier patterns are
  disjoint, so a clash cannot happen with valid input.
- `405 METHOD_NOT_ALLOWED`, `404 NOT_FOUND` (unknown route), `400 INVALID_JSON`
  / `400 INVALID_BODY` (bad request body), `413 PAYLOAD_TOO_LARGE`.
