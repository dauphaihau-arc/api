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

## Run

Start the API first, then run:

```bash
cd api/api-tests
cp hurl.variables.example hurl.variables
just suite
```

For manual runs, use the same variables file:

```bash
cd api/api-tests
just run health.hurl
just run auth/login.hurl
just run products/best-sellers.hurl
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
- Internal catalog routes stay under `/v1/internal/catalog/*`.
- `internal/catalog-refresh.hurl` is state-changing and may do real work depending on local seed data and catalog configuration.
- Keep local values in `api-tests/hurl.variables`; the committed example is `api-tests/hurl.variables.example`.
