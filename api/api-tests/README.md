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
- `checkout/create-card-order.manual.hurl` + `finance/settle-paid-card-order.manual.hurl` are the two halves of one flow: open a card checkout, pay it in Stripe test mode, then assert the Seller Payable the paid Order credits. The `.manual.` infix keeps them out of `suite` and `pnpm test:hurl`.

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

If you want raw Hurl output instead of formatted output:

```bash
cd api
pnpm test:hurl
```

## Notes

- Public health is mounted at `/health`, outside the `/v1` prefix.
- `auth/login.hurl` expects seeded auth data; the example variables default to `member@example.com` / `Password123!`.
- `finance/seller-payable.hurl` signs in as a seller with `seller_login_email` (default `maker.olive@example.com`) and resolves the shop from `GET /v1/shops/me`, so the seller must own a shop in the local seed data.
- `checkout/create-card-order.manual.hurl` and `finance/settle-paid-card-order.manual.hurl` use `buyer_login_email` / `buyer_login_password` and read `checkout_session_id`; each file's header comment says how to run the pair.
- Internal catalog routes stay under `/v1/internal/catalog/*`.
- `internal/catalog-refresh.hurl` is state-changing and may do real work depending on local seed data and catalog configuration.
- Keep local values in `api-tests/hurl.variables`; the committed example is `api-tests/hurl.variables.example`.
