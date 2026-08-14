# Checkout Flash-Sale Go Remote Full-Order Result

## Run

- Date: 2026-08-12 17:05:16 +07
- Scenario: full buy-now checkout under flash-sale traffic
- Purpose: compare the Go remote inventory reservation path against the previous NestJS full-order baseline.
- Inventory reservation driver: `remote`
- Flow: add buy-now cart item, create checkout quote, place order.

## Summary

| Run | Inventory ID | Result | Reservations | Orders | HTTP failures | HTTP p95 | Flow p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9 VUs / 45 iterations | `186135e2-93f9-4cf0-99f2-2efdf7554c3b` | Pass | 45 / 45 | 45 / 45 | 0.00% | 338.02ms | 974.4ms |
| 10 VUs / 50 iterations | `21d7b02e-2dd5-4a6a-a166-e2044ccd4184` | Pass | 50 / 50 | 50 / 50 | 0.00% | 303.1ms | 815.62ms |

## Interpretation

- The Go remote reservation integration cleared the previous `10 VUs / 50 iterations` failure point, where the NestJS path had repeated request timeouts on `POST /v1/checkout/buy-now`.
- This run is not a strict same-inventory comparison because the original baseline inventory ID no longer exists in the current local database.
- The result is still useful as a current-state comparison for the same k6 flow and concurrency shape.

## Notes

- No out-of-stock behavior was exercised in these runs.
- A stricter comparison should reset inventory state and use equivalent stock before each run.
