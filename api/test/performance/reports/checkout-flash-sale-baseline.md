# Checkout Flash-Sale Baseline

## Run

- Date: 2026-08-11 21:37:44 +07
- Scenario: quote-only inventory reservation under flash-sale traffic
- Inventory ID: `864d0544-a5ac-40e4-a7e3-1331b4a523a2`
- Load shape: 200 VUs for 1 minute
- Quantity per attempt: 1
- Order placement: disabled (`PLACE_ORDER=false`)
- Flow: add buy-now cart item, create checkout quote.

## Summary

| Result | Iterations | Reservations | Out of stock | Unexpected quotes | HTTP failures | HTTP p95 | Flow p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pass | 1,420 | 999 / 1,420 | 421 / 1,420 | 0 / 1,420 | 0.00% | 8.45s | 13.66s |

## Notes

- Functional correctness looked stable for this run: every quote attempt was either reserved or rejected as out-of-stock.
- Effective reservable stock appeared to be 999 units at test start, assuming `QUANTITY=1`.
- Latency was high under contention and should be compared against the future Go inventory reservation implementation using the same k6 scenario.
