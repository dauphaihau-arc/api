# Features

Behavior notes for API features that span more than one domain.
Each entry is a diagram or a document; deployment, scheduling, and operational runbooks live in [`docs/operations/`](../operations).

| Entry | What it covers |
| --- | --- |
| [`runtime-modes.md`](./runtime-modes.md) | Worker vs workerless deployments: which pipeline books inline, which needs an outbox poller or drain tick, and what a failure rolls back |
| [`runtime-modes/money-event-booking-modes.html`](./runtime-modes/money-event-booking-modes.html) | Diagram of the `order.paid` / `order.delivered` / `order.refunded` booking decision in both modes |
| [`finances/`](./finances) | Finance diagrams: cross-currency payout, payout failure retries and their sequence, provider fee recording |
| [`refund/`](./refund) | Refund diagrams: reconciliation of refunds whose provider webhook never arrived |
