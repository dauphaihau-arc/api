# Checkout Flash-Sale Full-Order Baseline

## Run

- Date: 2026-08-12 13:58:18 +07
- Scenario: full buy-now checkout under flash-sale traffic
- Purpose: establish the NestJS full-order baseline before a Go inventory reservation implementation.
- Flow: add buy-now cart item, create checkout quote, place order.

## Summary

| Run | Inventory ID | Result | Key signal |
| --- | --- | --- | --- |
| 9 VUs / 45 iterations | `0039d7ff-234c-4ee2-88ff-1e80945c50cc` | Pass | Highest clean full-order run before the first observed failure point. |
| 10 VUs / 50 iterations | `0039d7ff-234c-4ee2-88ff-1e80945c50cc` | Fail | Repeated request timeouts on `POST /v1/checkout/buy-now`. |

## Interpretation

- Quote-only reservation handled much higher concurrency than full order creation.
- Full-order bottleneck appears between 9 and 10 concurrent completed checkout flows.
- The pre-Go comparison target is to pass `9 VUs / 45 iterations` cleanly and improve or eliminate the `10 VUs / 50 iterations` timeout failure.

## Notes

- The k6 script uses `shared-iterations` when `PLACE_ORDER=true`, so full-order runs measure completed `cart -> quote -> order` flows instead of partially interrupted duration-based flows.
- Future comparisons should focus on correctness, p95 latency, throughput, and timeout behavior.
