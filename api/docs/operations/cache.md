# Cache

This API uses cache infrastructure for two different purposes:

- Optional performance caches
  These reduce repeated reads or expensive calculations. The app remains correct when they are disabled.
- Correctness state
  These store short-lived records needed for request safety, upload flows, limits, or abuse protection. Do not disable them with optional cache toggles.

## Configuration

```sh
CACHE_DRIVER=redis
CACHE_ENABLED=true
CACHE_TTL=60s
USER_CACHE_ENABLED=true
STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED=true
STOREFRONT_RARE_PRICE_CACHE_ENABLED=true
```

## Cache driver

`CACHE_DRIVER` controls the backing store used by Nest's cache manager.

- `redis`
  Uses `REDIS_URL`.
- `memory`
  Uses process-local memory. This is the default in `NODE_ENV=test`.
- `disabled`
  Uses a no-op cache store. Optional cache reads always miss and optional cache writes are ignored.

Outside `NODE_ENV=test`, the default driver is `redis`.

## Optional cache toggles

`CACHE_ENABLED=false` disables all optional caches routed through `OptionalCacheService`.

Per-scope toggles disable only one optional cache category:

- `USER_CACHE_ENABLED=false`
  Disables cached user-by-id reads.
- `STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED=false`
  Disables anonymous public product recommendation response caching.
- `STOREFRONT_RARE_PRICE_CACHE_ENABLED=false`
  Disables rare storefront price resolution caching.

Optional cache is enabled only when all of these are true:

```text
CACHE_DRIVER != disabled
CACHE_ENABLED != false
scope-specific toggle != false
```

## Local examples

Use Redis-backed optional cache:

```sh
CACHE_DRIVER=redis
CACHE_ENABLED=true
CACHE_TTL=60s
```

Disable all optional cache while keeping Redis available for correctness state:

```sh
CACHE_DRIVER=redis
CACHE_ENABLED=false
```

Disable only public storefront response cache:

```sh
CACHE_DRIVER=redis
CACHE_ENABLED=true
STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED=false
```

Use no-op cache storage:

```sh
CACHE_DRIVER=disabled
```

Use `CACHE_DRIVER=disabled` only when flows that depend on short-lived cache state are not being exercised.

## Correctness state

Some code uses the cache backend as temporary state, not as an optional optimization.

Examples include:

- idempotency response records
- product and review image upload tickets
- pending review image upload records
- review edit limit counters
- rate limit counters

These paths intentionally continue to use direct cache or rate-limit infrastructure instead of `OptionalCacheService`.

Do not use `CACHE_ENABLED=false` when the goal is to disable these correctness flows. If one of these needs independent operational control, add a dedicated config flag for that feature.

## Production guidance

Prefer `CACHE_DRIVER=redis` in production.

Use `CACHE_ENABLED=false` for temporary debugging or incident mitigation when stale optional cache data is suspected. Keep correctness-related cache infrastructure available unless the affected feature has a dedicated disable path.
