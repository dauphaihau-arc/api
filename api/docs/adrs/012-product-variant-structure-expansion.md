# ADR-012: Product Variant Structure Expansion Uses an Atomic Command

## Status

Accepted

## Date

2026-09-07

## Context

Sellers may expand a Product's purchasable variant matrix after publication, such as changing a no-option Product into `Size` variants or adding a second option dimension. Current stable mutation primitives can create variants, update lifecycle, set on-hand quantity, and set pricing, but client-orchestrating those steps can expose partial live states and obscure conflict recovery.

## Decision

Use one Product Variant Structure Expansion command for matrix-expanding edits. The command accepts the seller-reviewed full target matrix, validates it against the current Product Version and option rules, preserves unchanged active identities, creates new Product Variant and Inventory Item identities for new combinations, removes superseded published identities, persists initial values for new rows, emits one expansion event, increments Product Version once, and returns a refreshed Product detail.

Draft Products may use physical replacement internally only for never-published, unreferenced draft identities. Ever-published Products preserve historical identities regardless of current visibility state.

## Considered Options

- Client-orchestrate stable primitives: rejected because shape, price, inventory, and lifecycle can partially commit while the seller expects one confirmed matrix change.
- Reuse complete variant replacement after publication: rejected because published Product Variant and Inventory Item identities must remain stable for carts, reservations, orders, history, and SKU release semantics.

## Consequences

- The seller UI can preview generated rows immediately, but the backend recalculates and validates the full Cartesian matrix authoritatively on save.
- Existing row price, SKU, and On-hand Quantity are validation anchors during expansion, not values mutated by the expansion command.
- New generated rows start Active, copy price from the relevant existing offer, default On-hand Quantity to `0` unless the seller edits it before save, and may have blank SKU because SKU is optional.
- Superseded Inventory Items retain their On-hand Quantity; quantity transfer is a separate inventory accounting operation.
