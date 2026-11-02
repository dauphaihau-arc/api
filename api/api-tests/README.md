# Hurl API tests

This directory contains HTTP-level smoke tests for the API using [Hurl](https://hurl.dev/).

## Prerequisites

- Install Hurl: https://hurl.dev/docs/installation.html
- Ensure the API is running locally

## Layout

- `health.hurl` checks the public health endpoint.
- `auth/login.hurl` checks login with seeded default credentials.
- `products/best-sellers.hurl` checks the public storefront best-sellers endpoint.
- `internal/catalog-status.hurl` checks the internal catalog status endpoint.
- `internal/catalog-refresh.hurl` triggers a best-seller refresh on the internal catalog endpoint.
- `finance/seller-payable.hurl` checks the shop-scoped Seller Payable endpoint as a signed-in seller.
- `finance/commission-schedule.hurl` checks the admin Commission Schedule endpoint is 401 for anonymous, 403 for a seller, and 200 for a signed-in admin.
- `checkout/create-card-order.manual.hurl` + `finance/settle-paid-card-order.manual.hurl` are the two halves of one flow: open a card checkout, pay it in Stripe test mode, then assert the Seller Payable the paid Order credits. The `.manual.` infix keeps them out of `suite` and `pnpm test:hurl`.
- `webhooks/carrier/` holds the static signed-carrier-webhook cases: missing signature (401) and wrong signature (401) run in `suite`; unknown tracking number (200 `{}`) and unsupported event code (400) are `.manual.hurl` because they need the API started with the signing secret. They need no Order or Shipment; their bodies live in `webhooks/carrier/bodies/` and their HMAC signatures are precomputed over those exact bytes.
- `fulfillment/prepare-shipment.manual.hurl`, `webhooks/carrier/pickup.manual.hurl`, `webhooks/carrier/transit.manual.hurl` and `webhooks/carrier/delivery.manual.hurl` are the carrier journey steps: prepare resolves the paid Order behind `checkout_session_id` and prepares a USPS Shipment for `carrier_pickup_tracking`; pickup posts `PICKED_UP` and asserts `dispatched`; transit posts `IN_TRANSIT` then `OUT_FOR_DELIVERY` and asserts the Shipment stays `in_transit`; delivery posts `DELIVERED`, asserts the Shipment is `delivered`, the paid Order becomes `completed`, drains the finance outbox, and asserts Payout Availability is recorded. `webhooks/carrier/handover.manual.hurl`, `webhooks/carrier/handover-requirements.manual.hurl`, `webhooks/carrier/handover-unverified.manual.hurl`, `webhooks/carrier/amend-window.manual.hurl`, `webhooks/carrier/amend-locks.manual.hurl` and `webhooks/carrier/notifications.manual.hurl` cover handover and shipment notifications: the handover declaration, its invalid prerequisites and unverified carriers, the post-handover amend window and quantity lock, and buyer/seller notifications for pickup and delivery. Each builds its own cash Orders and needs no prior step. `webhooks/carrier/duplicate.manual.hurl` replays the same signed `PICKED_UP` body and asserts the Shipment keeps `dispatched` with two updates. `webhooks/carrier/cross-carrier.manual.hurl` creates a cash Order with a DHL Shipment and sends the USPS pickup's event id from DHL, asserting both carriers keep their evidence. `webhooks/carrier/voided.manual.hurl` builds its own cash Order, prepares and voids a Shipment, then sends a pickup for its number and asserts the event is ignored. `webhooks/carrier/out-of-order.manual.hurl` sends an in-transit scan that occurred before the delivery and asserts it is stored without regressing the Shipment. `webhooks/carrier/failure-return.manual.hurl` sends `DELIVERY_FAILED` then `RETURNED` and asserts both are recorded with their locations while the status stays `in_transit`. `webhooks/carrier/generate-pickup.mjs` creates a fresh tracking number, event ids, signed bodies and signatures per run.

## Run

Start the API first, then run:

```bash
cd api/api-tests
cp hurl.variables.example hurl.variables
just suite
```

`suite` runs every `.hurl` file except the `*.manual.hurl` ones, which need a
paid Stripe test session and a value pasted into `hurl.variables` before they can
finish.

Carrier-webhook commands live with their fixtures in `webhooks/carrier/justfile`
and are namespaced as a just module: from `api-tests/` use `just carrier <recipe>`
(for example `just carrier static`, `just carrier pickup`); inside
`webhooks/carrier/` the same recipes run as `just <recipe>`.

For manual runs, use the same variables file:

```bash
cd api/api-tests
just run health.hurl
just run auth/login.hurl
just run products/best-sellers.hurl
just run finance/seller-payable.hurl
just run internal/catalog-status.hurl
```

The `run` recipe also accepts paths prefixed with `api-tests/`, for example:

```bash
just run api-tests/products/best-sellers.hurl
```

The 401 carrier-webhook cases run with `suite`. Run all four, including the two
that need the signing secret, with:

```bash
just carrier static
```

They only pass when the API runs with the secret the signatures were computed
with:

```bash
CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret pnpm start:dev
```

After editing a body in `webhooks/carrier/bodies/`, regenerate its digest and paste it
into the matching `carrier_signature_*` variable in `hurl.variables`:

```bash
just carrier sign bodies/unknown-tracking.json
```

`just carrier sign` uses `CARRIER_WEBHOOK_SECRET` when set and the local test secret
otherwise. The digest must cover the file bytes exactly as written, so keep the
file newline-terminated and send it with Hurl's `file,...;` body form, which does
not template the body.

`fulfillment/prepare-shipment.manual.hurl` and `webhooks/carrier/pickup.manual.hurl` are
not covered by `just carrier static`: they change an Order's Shipment, so they need a
paid card Order from the `checkout_session_id` flow first. Run both with:

```bash
just carrier pickup
```

The recipe runs `webhooks/carrier/generate-pickup.mjs`, then executes the two files in
separate `hurl --test` invocations — `hurl --test` runs multiple files in
parallel by default, and pickup must see the Shipment prepare created. The
script writes a fresh USPS tracking number, event id and signed body to
`webhooks/carrier/bodies/pickup.body` (ignored) and exports `carrier_pickup_tracking`
and `carrier_signature_pickup` through `/tmp/arc-carrier-pickup.variables`.
Nothing needs editing between runs; each run still needs a fresh paid Order from
the card flow.

To exercise only the prepare half (no signature, no webhook), use:

```bash
just carrier prepare
```

To run through transit and out-for-delivery, use:

```bash
just carrier transit
```

To run through delivery as well — the case drains the finance outbox itself, so
no worker is needed — use:

```bash
just carrier delivery
```

The recipe passes `OUTBOX_DRAIN_TRIGGER_SECRET` from `apps/api/.env` to the case;
without it the internal drain answers 401 and payout availability stays false.

To check the duplicate ack without moving further, use:

```bash
just carrier duplicate
```

To prove dedupe is per carrier, use:

```bash
just carrier cross-carrier
```

To check a voided Shipment ignores carrier events, use:

```bash
just carrier voided
```

To check a late event does not regress a delivered Shipment, use:

```bash
just carrier out-of-order
```

To check failure and return are recorded without moving the status, use:

```bash
just carrier failure-return
```

To run the handover, amend-window and notification cases, use:

```bash
just carrier handover               # declaration, replay, carrier no-op, cancel lock
just carrier handover-requirements  # no tracking, voided Shipment
just carrier handover-unverified    # Other carrier stays unobservable
just carrier handover-all           # all three, one fixture generation
just carrier amend-window           # amend within the window, then the scan
just carrier amend-locks            # quantities locked after handover
just carrier amend-window-all       # both amend cases, one fixture generation
just carrier notifications
```

These build their own cash Orders against the seeded shop product, so each run
consumes stock (4 units for `handover-all`, 2 for `amend-window-all`, 1 for
`notifications`). Reseed (`pnpm db:seed:demo`) or restock the product when the
inventory runs out; the catalogue step asserts the first listed product has
enough stock for that file.

To drive a parcel end to end with the Mock Carrier, start it and
point the API at it:

```bash
just mock-carrier-up                                # from apps/api, port 4100
# set MOCK_CARRIER_URL=http://127.0.0.1:4100 in apps/api/api/.env, restart the API
just carrier mock-parcel
```

The case prepares a USPS Shipment, declares handover, then only calls the
carrier's advance endpoint; pickup, transit, out-for-delivery and delivery all
arrive through the signed webhook, and the buyer reads a delivered Shipment.
Set `CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret` in the API so it matches
the Mock Carrier's default signing secret.

If you want raw Hurl output instead of formatted output:

```bash
cd api
pnpm test:hurl
```

## Notes

- Public health is mounted at `/health`, outside the `/v1` prefix.
- `auth/login.hurl` expects seeded auth data; the example variables default to `member@example.com` / `Password123!`.
- `finance/seller-payable.hurl` signs in as a seller with `seller_login_email` (default `maker.olive@example.com`) and resolves the shop from `GET /v1/shops/me`, so the seller must own a shop in the local seed data.
- `checkout/create-card-order.manual.hurl` and `finance/settle-paid-card-order.manual.hurl` use `buyer_login_email` / `buyer_login_password` and read `checkout_session_id`; each file's header comment says how to run the pair. The checkout file buys one unit from any in-stock product of the seller's shop, so repeated runs drain the seeded stock; `just db-seed` restores it when no product is left in stock.
- Internal catalog routes stay under `/v1/internal/catalog/*`.
- `internal/catalog-refresh.hurl` is state-changing and may do real work depending on local seed data and catalog configuration.
- Keep local values in `api-tests/hurl.variables`; the committed example is `api-tests/hurl.variables.example`.
