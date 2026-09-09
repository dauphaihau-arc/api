# ADR-009: Use Versions and Idempotency for Seller Mutations

## Status

Accepted

## Date

2026-09-06

## Context

Sellers can edit the same Product from multiple sessions, while network retries can repeat a command whose successful response was lost. Last-write-wins loses accepted changes, but optimistic versions alone make a completed retry appear to be a new conflict.

## Decision

Seller Catalog maintains one **Product Version** across Product metadata, pricing, shipping, and Product Variant lifecycle. Each mutation supplies the expected Product Version. A stale mutation returns a conflict with the latest state and version and requires explicit seller reapplication rather than automatic merging.

Inventory count commands use the independent **On-hand Version** defined by ADR-005. Reservation activity does not increment that version because it does not overwrite On-hand Quantity.

Seller lifecycle and inventory mutation commands require an idempotency key. Repeating the same key and payload returns the original result. Reusing a key with a different payload is rejected.

## Considered Options

- Last-write-wins: rejected because concurrent seller sessions can silently erase accepted changes.
- One Inventory version for every balance transition: rejected because checkout traffic would create conflicts for independent physical counts.
- Versions without idempotency: rejected because a lost successful response cannot be distinguished from an unexecuted command.

## Consequences

- Conflict responses must contain enough current state for an explicit seller reapply flow.
- Command results and payload identity must be retained for the idempotency window.
- Product Version and On-hand Version remain separate concurrency domains.
