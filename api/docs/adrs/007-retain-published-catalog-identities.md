# ADR-007: Retain Published Catalog Identities

## Status

Accepted

## Date

2026-09-06

## Context

Products, Product Variants, and Inventory Items acquire external references after publication through carts, reservations, Orders, reviews, and reporting. Physical deletion or replacement breaks those references and erases the identity behind historical activity.

## Decision

A Product Variant may be physically replaced only while its Product has never been published. After first publication, Product Variant and Inventory Item identities are stable. A Product Variant may be active, inactive, or removed: inactivity is a reversible pause, while removal retains the record and removal time; explicit restoration reuses the original Product Variant and Inventory Item identities.

An **Inactive Product** is a reversible seller pause. A **Removed Product** is a seller-irreversible tombstone retained for history. Removing a Product logically removes all child Product Variants and Inventory Items and releases their SKUs. Administrative recovery returns only the Product as inactive; each child requires explicit restoration, and restoration succeeds only when its former SKU is not assigned to another non-removed Inventory Item.

Orders preserve purchase-time commercial facts in an **Order Item Snapshot**, including SKU and an immutable **Order-safe Image Reference**. Historical display and reporting use the snapshot rather than mutable catalog data. Referenced catalog identities and assets remain retained for the lifetime required by their related Orders and any legal, financial, refund, review, or dispute obligations.

## Considered Options

- Always hard-delete removed records: rejected because published identities have historical and transactional references.
- Never physically delete draft configuration: rejected because unpublished variants have not acquired marketplace identity and replacement keeps draft editing simpler.

## Consequences

- Published variant updates must diff or mutate stable identities instead of replacing the complete collection.
- Database uniqueness for SKU must account for removal state.
- Administrative Product recovery returns the Product as inactive, preserves child lifecycle states, and requires conflicts to be resolved before publication.
- Product removal cannot silently reactivate its children during administrative recovery.
- Retention cleanup, if introduced later, must prove that no required references or retention obligations remain.
