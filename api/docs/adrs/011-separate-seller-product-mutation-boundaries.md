# ADR-011: Separate Seller Product Mutation Boundaries

## Status

Accepted

## Date

2026-09-06

## Context

A seller Product edit crosses catalog details, pricing, shipping, Product Variant lifecycle, media, attributes, and inventory. A single distributed all-or-nothing save would couple capability transactions and make partial infrastructure failure harder to recover from.

## Decision

Expose section-specific commands aligned to their owning capability. Each command is transactional within that owner; the system does not provide a distributed transaction across the complete seller Product form.

The seller UI presents corresponding save sections. A successful section remains persisted if a later section fails. The UI identifies the failed section, retains its unsaved input, and displays the current authoritative state needed for conflict reapplication.

## Considered Options

- One distributed all-or-nothing Product save: rejected because it requires cross-capability transaction coordination.
- Continue chaining commands behind one generic save result: rejected because sellers cannot identify or recover from partial success.

## Consequences

- Each command has an explicit validation, concurrency, and error contract.
- The UI tracks dirty and successful state by section rather than treating the form as one transaction.
- Cross-section invariants are enforced at publication and final Purchase Eligibility gates, not by pretending every edit is atomic.
