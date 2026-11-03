# Mock Carrier service

A dependency-free mock carrier for local Arc development. It registers parcels,
quotes rates, sells single-use labels (registered parcel + base64 PDF), refunds
unused labels, and simulates a handover journey (pickup → transit → out for
delivery → delivered), pushing every scan to the Arc API webhook, signed with
HMAC-SHA256.

Plain ESM using only `node:` builtins (`http`, `crypto`); no install step.

## Layout

- `server.mjs` — process boot, dependency wiring, HTTP server lifecycle.
- `src/router.mjs` — path → handler table; the only place that maps HTTP to operations.
- `src/parcels.mjs` — registration, handover, manual advance, and the in-memory state.
- `src/rates.mjs` — rate quoting (pricing, dimensional weight) and the quote store.
- `src/labels.mjs` — label purchase and refund: quote consumption, parcel registration,
  the in-memory label store, label response.
- `src/pdf.mjs` — minimal single-page PDF rendering for a purchased label.
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

Parcels, events, pending automatic timers, quoted rates and label purchases
(including their `purchased`/`voided` status) live in `Map`s inside the process. **Restarting the service loses every
registered parcel** and every rate quote, and any journey that was mid-flight
simply stops. This is intentional for a dev mock: re-register parcels (or
re-run your fixture script) and re-quote after a restart. There is no
persistence, no database and no replay.

## HTTP contract

| Method | Path                                   | Result                                                        |
| ------ | -------------------------------------- | ------------------------------------------------------------- |
| GET    | `/health`                              | `200 {"status":"ok"}`                                         |
| POST   | `/rates`                               | `200 {"rates":[ …6 quotes… ]}` / `400`                        |
| POST   | `/labels`                              | `201 {"label":…}` / `400`, `404`, `410`, `409`                |
| POST   | `/labels/:label_id/refund`             | `200 {"label":{label_id,status:"voided"}}` / `404`, `409`     |
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

### Rate quotes

`POST /rates` prices a package across every carrier and service. It is
stateless with respect to parcels: quoting registers nothing, schedules nothing
and sends no webhook. It does store the six quotes in memory so each option can
be bought once via `POST /labels`; see [Label purchase](#label-purchase).

```bash
curl -sS -X POST http://127.0.0.1:4100/rates \
  -H 'content-type: application/json' \
  -d '{"weight_grams":1000,"length_cm":10,"width_cm":10,"height_cm":10,"currency":"USD"}'
```

Request:

| Field          | Rule                                              |
| -------------- | ------------------------------------------------- |
| `weight_grams` | positive integer, ≤ 100000                        |
| `length_cm`    | positive integer, ≤ 300                           |
| `width_cm`     | positive integer, ≤ 300                           |
| `height_cm`    | positive integer, ≤ 300                           |
| `currency`     | 3-letter uppercase ISO code, e.g. `USD`           |

Response (`200`) always holds exactly six rates — `usps`, `dhl` and `vnpost` ×
`standard` and `express`; `other` never appears. Each option has its own `quote_id`:

```json
{
  "rates": [
    {
      "quote_id": "rq_2f0c2a8e-6a2c-4c5f-9d1e-2b0c4a1f9e77",
      "carrier": "usps",
      "service": "standard",
      "price_minor": 900,
      "currency": "USD",
      "estimated_days": { "min": 3, "max": 5 },
      "expires_at": "2026-01-01T00:15:00.000Z"
    }
  ]
}
```

Pricing, in minor currency units:

```
billable_kg = max(weight_grams / 1000, length_cm * width_cm * height_cm / 5000)
price_minor = ceil((base_minor + per_kg_minor * billable_kg) * service_multiplier)
```

| Carrier  | `base_minor` | `per_kg_minor` |
| -------- | ------------ | -------------- |
| `usps`   | 500          | 400            |
| `dhl`    | 700          | 550            |
| `vnpost` | 300          | 250            |

| Service    | Multiplier | Estimated days |
| ---------- | ---------- | -------------- |
| `standard` | 1.0        | 3–5            |
| `express`  | 1.6        | 1–2            |

`expires_at` is the quote creation time + 15 minutes, the same for all six
options, and each option carries its own `quote_id`. Quoting creates no parcel,
label, money effect or webhook; it only remembers the six quotes (with their
expiry) so they can be purchased. Each quote is single-use. It enforces the
package bounds above: anything else is `400 INVALID_PACKAGE`, and a bad
currency is `400 INVALID_CURRENCY`.

### Label purchase

`POST /labels` buys one quoted option. The quote id comes from a `POST /rates`
response and may be purchased exactly once.

```bash
curl -sS -X POST http://127.0.0.1:4100/labels \
  -H 'content-type: application/json' \
  -d '{"quote_id":"rq_2f0c2a8e-6a2c-4c5f-9d1e-2b0c4a1f9e77"}'
```

Request:

| Field      | Rule                                                    |
| ---------- | ------------------------------------------------------- |
| `quote_id` | a stored quote id from `POST /rates`, e.g. `rq_...`     |

Response (`201`):

```json
{
  "label": {
    "label_id": "lbl_9b1c7f4e-2a3d-4e6f-8a9b-0c1d2e3f4a5b",
    "quote_id": "rq_2f0c2a8e-6a2c-4c5f-9d1e-2b0c4a1f9e77",
    "carrier": "usps",
    "service": "standard",
    "tracking_number": "9400111899223197428490",
    "price_minor": 900,
    "currency": "USD",
    "pdf_base64": "JVBERi0xLjQK…"
  }
}
```

- `tracking_number` is freshly generated in the carrier's format and is the
  tracking number of the parcel the purchase registers.
- `pdf_base64` is a base64-encoded **minimal single-page PDF 1.4** label. It is
  a valid document whose text carries the label id, carrier, service, tracking
  number and price. It is not a printable barcode/thermal label — it exists so
  the API can exercise upload/storage/download flows without a PDF library.
- The purchase registers the parcel in the parcels store, unhanded
  (`handed_over_at: null`, `auto: false`, `events: []`). Handover and advance
  therefore work immediately, but nothing is dispatched at purchase time and no
  webhook is sent. The journey starts only on
  `POST /parcels/:tracking_number/handover`.

Errors:

| Status | Code                 | Cause                                                     |
| ------ | -------------------- | --------------------------------------------------------- |
| `400`  | `INVALID_QUOTE_ID`   | `quote_id` is missing, not a string, or blank.            |
| `404`  | `QUOTE_NOT_FOUND`    | No stored quote with that id (unknown or after restart).  |
| `410`  | `QUOTE_EXPIRED`      | More than 15 minutes have passed since the quote.         |
| `409`  | `QUOTE_ALREADY_USED` | The quote was already purchased.                          |

A rejected purchase (400/404/410/409) registers nothing and leaves the quote as
it was. Only a successful `201` purchase marks the quote used.

### Label refund

`POST /labels/:label_id/refund` voids an unused label. The body is ignored (send
`{}`).

```bash
curl -sS -X POST http://127.0.0.1:4100/labels/lbl_9b1c7f4e-2a3d-4e6f-8a9b-0c1d2e3f4a5b/refund \
  -H 'content-type: application/json' \
  -d '{}'
```

Response (`200`):

```json
{ "label": { "label_id": "lbl_9b1c7f4e-2a3d-4e6f-8a9b-0c1d2e3f4a5b", "status": "voided" } }
```

- The label store keeps every purchase with status `purchased` or `voided`; the
  refund path reads it, so a repeated refund of the same label is an idempotent
  `200` with the same body.
- Refunding removes the label's parcel and cancels its timers, so later
  `handover`, `advance` and `GET /parcels/:tracking_number` answer
  `404 PARCEL_NOT_FOUND`. Nothing was dispatched, so no webhook is sent.
- A label whose parcel has emitted any scan (the first `PICKED_UP` at handover,
  or any later event) is in use and cannot be refunded.

Errors:

| Status | Code                 | Cause                                                        |
| ------ | -------------------- | ------------------------------------------------------------ |
| `404`  | `LABEL_NOT_FOUND`    | No label with that id (unknown or after restart).            |
| `409`  | `LABEL_ALREADY_USED` | The label's parcel already emitted at least one scan.        |

A refund never emits a webhook, and the failed (`404`/`409`) paths change
nothing.

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
paths, plus webhook-unreachable resilience. Rate quotes are covered end to end:
six-carrier/service coverage, the price formula, dimensional weight winning,
`expires_at` timing, currency echo, unique quote ids, package/currency/JSON validation, and the guarantee that quoting creates
no parcel. Label purchases are covered too: the 201 shape, PDF magic bytes and
contents, carrier-formatted tracking, parcel registration with no handover or
events, no webhook at purchase, immediate handover/advance, unknown/expired/
used quote errors, quote-store TTL and single use, and unique label ids. Label
refunds are covered end to end too: refunding before the first scan voids the
label and retires the parcel (handover/advance/read then 404), refunding after a
scan is `409 LABEL_ALREADY_USED`, unknown ids are `404 LABEL_NOT_FOUND`, repeat
refunds are idempotent, the label store reports the status, the refund route is
`POST`-only, and no refund path emits a webhook.

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
- `400 INVALID_PACKAGE` / `400 INVALID_CURRENCY` — `POST /rates` validation; both
  come from the shared rate-quote contract.
- `400 INVALID_QUOTE_ID` — `POST /labels` with a missing/blank/non-string
  `quote_id`; `404 QUOTE_NOT_FOUND`, `410 QUOTE_EXPIRED` and
  `409 QUOTE_ALREADY_USED` come from the shared label-purchase contract.
- `404 LABEL_NOT_FOUND` / `409 LABEL_ALREADY_USED` — `POST /labels/:label_id/refund`
  for an unknown label or one whose parcel already emitted a scan; these come
  from the shared label-refund contract.
