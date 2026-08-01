# ADR-002: Adopt Projected Catalog Read Model with Pluggable Search

## Status

Proposed

## Date

2026-06-11

## Context

ARC's product write model currently lives in PostgreSQL and serves seller-facing
workflows well. The storefront catalog, however, has different access patterns:

- public product listing with filtering, sorting, and pagination
- product suggestions and search-oriented matching
- slug-based public resolution
- operational visibility into projection drift and catalog readiness

These read patterns are not the same as transactional product writes. They
benefit from denormalized documents and search-specific indexing.

The current changes introduce:

- a separate catalog store configuration with runtime driver selection
- dedicated catalog product, slug, and search documents in MongoDB
- asynchronous projection from the product write model into those documents
- a pluggable storefront query path that can use MongoDB queries or Atlas Search
- health and status endpoints that treat catalog infrastructure as a first-class
  runtime dependency

This decision is hard to reverse once other modules, operations, and deployment
environments rely on the projected catalog model and its indexing strategy.

## Options Considered

### Option A: Keep storefront reads on the transactional PostgreSQL model

- Pros:
  - one source of persistence
  - simpler operational topology
  - no projection lag or backfill requirements
- Cons:
  - storefront query patterns stay coupled to the write model
  - search and suggestion capabilities remain limited or awkward
  - denormalized read concerns leak into transactional persistence design
  - scaling read/search behavior independently is harder

### Option B: Project a catalog read model into MongoDB and support pluggable search drivers

- Pros:
  - separates transactional writes from storefront read concerns
  - enables denormalized catalog/search documents tailored to browse and search
  - allows gradual search evolution from plain MongoDB queries to Atlas Search
  - supports async backfill and re-projection workflows
  - gives operations explicit status and drift visibility
- Cons:
  - introduces eventual consistency between source and catalog projection
  - adds more infrastructure, repositories, and health dependencies
  - requires projection jobs, backfills, and index management
  - increases debugging complexity across write and read models

### Option C: Move the full product source of truth to MongoDB/search-oriented storage

- Pros:
  - removes dual-store projection architecture
  - aligns primary storage with document/search access patterns
- Cons:
  - forces seller and transactional workflows onto a less suitable primary model
  - creates larger migration and integrity risk
  - mixes write-domain rules with storefront read optimization concerns
  - is a much more disruptive architectural change than needed

## Decision

We adopt a **projected catalog read model in MongoDB with pluggable storefront
search drivers**.

The decision includes these rules:

1. PostgreSQL remains the primary transactional source of truth for product
   writes.
2. Storefront catalog reads may be served from projected catalog documents
   instead of the write model.
3. Product, slug, and search documents are projected asynchronously from active
   products.
4. Catalog projection must be removable and rebuildable through backfill and
   replay-friendly workflows.
5. Storefront search behavior is selected by configuration, with MongoDB as the
   baseline and Atlas Search as an optional higher-capability backend.
6. Catalog health, readiness, and drift are operational concerns that must be
   observable.

## Rationale

This approach preserves a stable transactional product model while creating a
read path optimized for public catalog usage.

The key architectural choice is not "use Atlas Search." It is to separate
storefront catalog reads from the transactional write model by projecting a
purpose-built read model. Atlas Search then becomes one implementation choice
for that read model rather than the core decision itself.

This structure lets ARC evolve search capability incrementally. Local and
baseline environments can continue using MongoDB-backed queries, while
higher-capability deployments can opt into Atlas Search without rewriting the
entire catalog module boundary.

The tradeoff is explicit eventual consistency. We accept projection lag and the
need for backfills because storefront browse/search workloads benefit more from
read-optimized documents and search indexing than from strict read-after-write
coupling to the transactional schema.

## Consequences

- The product domain now owns a dual-model architecture: transactional writes in
  PostgreSQL and projected storefront reads in MongoDB.
- Publish and product mutation flows must keep catalog projection behavior up to
  date.
- Operational tooling must support projection status checks, health checks, and
  backfills.
- Search index definitions become part of deployment readiness for Atlas-backed
  environments.
- Debugging catalog issues now requires checking both source data and projected
  documents.
- The system gains flexibility to tune storefront search independently from the
  write model, at the cost of more infrastructure and consistency management.

## Related Documents

- [001-adopt-canonical-catalog-pricing-with-quote-based-multi-currency-checkout.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/adrs/001-adopt-canonical-catalog-pricing-with-quote-based-multi-currency-checkout.md)
- [atlas-search-catalog.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/atlas-search-catalog.md)
- [product_search.index.json](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/atlas-search/product_search.index.json)
- [product_suggestions.index.json](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/docs/atlas-search/product_suggestions.index.json)
