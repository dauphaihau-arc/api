# ADR-005: Inventory Capability Owns Inventory Items and Balances

## Status

Accepted

## Date

2026-09-06

## Context

Seller inventory edits, checkout reservations, releases, and sales all change the same quantities. Allowing the Product capability and Inventory capability to write those balances independently creates lost-update races even when each path is locally transactional.

## Decision

The Inventory capability owns stable Inventory Item identity, SKU lifecycle and uniqueness, and every inventory balance write. Seller Catalog owns Products, Product Variants, and pricing, and references Inventory Items by ID. NestJS authenticates and authorizes seller commands, then calls the configured Inventory implementation through one application port; the selected local or remote implementation applies the mutation.

Seller quantity edits set **On-hand Quantity** with an expected **On-hand Version**. The version changes only when On-hand Quantity changes, so independent reservation activity does not cause seller conflicts. Reservation transitions use their own monotonic balance/event sequence and control **Reserved Quantity**. **Available Quantity** is the non-negative quantity remaining after reservations. If Reserved Quantity exceeds a truthful On-hand Quantity, the Inventory capability records an **Inventory Shortage** instead of rejecting the count or silently cancelling reservations.

## Considered Options

- Split seller writes in Product from reservation writes in Inventory: rejected because two writers can overwrite one another.
- Keep all balance writes in Product: rejected because reservation correctness and ownership would remain coupled to the catalog write model.

## Consequences

- Product persistence must not directly replace live inventory balances.
- Local and remote Inventory implementations must enforce the same command semantics.
- Every count, reservation, release, sale, and correction appends an immutable Inventory Movement with its cause, actor or system identity, command identity, before-and-after quantities, and optional seller note.
- During a shortage, reservation consumption is atomic for the full requested quantity; the first transaction with sufficient On-hand Quantity succeeds, without partial fulfillment or FIFO guarantees.
- Seller Catalog lifecycle commands collaborate with Inventory through application contracts rather than shared persistence entities.
- Full inventory replacement may remain a draft-configuration operation only while no published identity or external reference exists.
