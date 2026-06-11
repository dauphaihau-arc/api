# Performance Scenarios

This folder holds reusable local performance scenarios for the repository.

Use it when you need repeatable high-traffic checks without coupling the setup to a
single domain.

## Structure

- `scenarios/` - named scenario definitions
- `scripts/` - generic runners and helpers

## Current Runner

The current runner shells out to `autocannon` through `npx`. That keeps the setup
light while still giving repeatable commands.

Run from inside `perf/` with `just`:

```bash
cd perf && just catalog-list
cd perf && just run catalog-list
cd perf && just catalog-detail-by-slug my-shop my-product
```

You can override the common knobs with environment variables:

```bash
cd perf && C=200 D=45 just catalog-list
cd perf && URL="http://127.0.0.1:3000/v1/products?page=1&limit=48" just run
cd perf && METHOD=POST BODY='{"hello":"world"}' H_AUTHORIZATION="Bearer token" just run
cd perf && SHOP_SLUG="my-shop" PRODUCT_SLUG="my-product" just catalog-detail
```

Supported environment variables:

- `URL`
- `METHOD`
- `BODY`
- `C` for concurrent connections
- `D` for duration in seconds
- `P` for pipelining
- `H_*` for headers, for example `H_AUTHORIZATION`
- `SHOP_SLUG` and `PRODUCT_SLUG` for `catalog-detail`

## Scenarios

Named scenarios live in `scenarios/http.json`.

Each scenario can define:

- `url`
- `method`
- `connections`
- `duration`
- `pipelining`
- `headers`
- `body`

## Notes

- Scenario values are defaults. Environment variables override them.
- Keep scenario names domain-oriented, but keep the runner generic.
- Prefer stable smoke scenarios here, then layer custom one-off traffic runs through
  env var overrides.
