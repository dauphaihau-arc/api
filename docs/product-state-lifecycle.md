# Product State Lifecycle

This document defines the intended meaning of product lifecycle states so `DRAFT` and `INACTIVE` do not overlap semantically.

## Purpose

The goal is to keep product state history understandable for sellers, API consumers, and maintainers.

In particular:

- `DRAFT` should mean "not published yet"
- `INACTIVE` should mean "previously published, currently not live"

Without that distinction, both states collapse into the same generic "not public" meaning.

## State Meanings

### `DRAFT`

`DRAFT` is the initial state for a newly created product.

It means:

- the product has not been published yet
- the seller may still be editing required data
- the product is not visible in public catalog endpoints

Reference:

- [product.entity.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/persistence/entities/product.entity.ts:56)
- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:652)

### `ACTIVE`

`ACTIVE` means the product is live and eligible to appear in public product queries.

It means:

- the product has passed publish readiness checks
- the product is visible to shoppers
- the product is currently sellable from a catalog perspective

Reference:

- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:80)
- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:156)

### `INACTIVE`

`INACTIVE` means the product is intentionally not live anymore after having been published before.

It means:

- the product is not visible in public catalog endpoints
- the seller or admin deliberately deactivated it
- the product is expected to be reactivatable later

It should not be used for products that were never published.

## Transition Rule

The intended lifecycle is:

1. `DRAFT -> ACTIVE`
2. `ACTIVE -> INACTIVE`
3. `INACTIVE -> ACTIVE`

Rejected transition:

1. `DRAFT -> INACTIVE`

Reason:

- a draft has never gone live, so deactivation is the wrong semantic action
- if a merchant wants a product to remain hidden before first publish, it should stay `DRAFT`

Reference:

- [bulk-mutate-shop-products.use-case.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case.ts:133)

## Publish History

Publishing sets the product state to `ACTIVE` and assigns `publishedAt` if it was not already set.

That means `publishedAt` acts as the historical signal that a product has gone live before.

Reference:

- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:644)

## Public Visibility

Public product reads currently return only `ACTIVE` products.

As a result:

- `DRAFT` is private
- `INACTIVE` is private
- `REMOVED` is private
- `UNAVAILABLE` is private

Reference:

- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:80)
- [mikro-orm-product.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-product.repository.ts:156)

## Short Rule

- `DRAFT` = never published
- `ACTIVE` = live
- `INACTIVE` = previously published, now paused
