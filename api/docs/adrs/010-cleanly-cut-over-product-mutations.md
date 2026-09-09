# ADR-010: Cleanly Cut Over Product Mutations

## Status

Accepted

## Date

2026-09-06

## Context

The current seller APIs replace complete Product Variant and inventory collections, recreate identities, and treat `stock` as available quantity. Running old and new mutation semantics together would preserve destructive paths and make inventory reconciliation ambiguous.

## Decision

Adopt the stable-identity mutation model in one coordinated API, seller UI, and data migration. Full Product Variant and inventory replacement remains available only for Products that have never been published. Published Products use targeted commands against stable identities. The obsolete seller `DELETE` client path is removed rather than wrapped.

The inventory conversion uses a maintenance window. Inventory writes pause, active reservations from the authoritative Inventory implementation are reconciled, `reserved` is computed from those reservations, and `on_hand` is initialized as current available `stock + reserved`. Invariants are verified before writers resume on the new model.

Existing Orders are not given fabricated purchase-time facts. SKU or image values that cannot be reconstructed remain null or explicitly unknown; new Orders always capture the complete Order Item Snapshot.

## Considered Options

- Compatibility wrappers around replacement endpoints: rejected because they preserve identity-destroying semantics.
- Online dual-read and dual-write migration: rejected because two balance representations require reconciliation during every concurrent mutation.
- Copy current catalog values into historical Order snapshots: rejected because current values are not evidence of purchase-time facts.

## Consequences

- Deployment requires a bounded inventory-write maintenance window and a predeclared rollback point.
- Cutover verification must reconcile every active reservation and prove non-negative Available Quantity outside explicit Inventory Shortages.
- Nullable historical snapshot fields remain a supported legacy condition.
