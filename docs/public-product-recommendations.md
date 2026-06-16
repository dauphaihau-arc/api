# Public Product Recommendations

This document describes the current git changes around public storefront product
recommendations, recent views, trending products, and product view tracking.

## Summary

- Similar products come from the active storefront product data source.
- Recently viewed comes from saved view history, then loads matching public
  product cards.
- Trending comes from aggregated view history, then loads matching public
  product cards.
- Guest view tracking uses a browser session cookie.
- All current storefront backends support similar-product results and product
  hydration for recent and trending lists.

Relevant code:

- [product.controller.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/product.controller.ts)
- [recommend-public-products.query.dto.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/dto/recommend-public-products.query.dto.ts)
- [recent-public-products.query.dto.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/dto/recent-public-products.query.dto.ts)
- [public-product-recommendations.presenter.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/public-product-recommendations.presenter.ts)
- [recommend-public-products.use-case.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/use-cases/recommend-public-products/recommend-public-products.use-case.ts)
- [public-product-view-history.service.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/services/public-product-view-history.service.ts)
- [public-product-recommendation-scoring.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/services/public-product-recommendation-scoring.ts)
- [product-activity-session.service.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/product-activity-session.service.ts)
- [storefront-product-query.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/ports/storefront-product-query.repository.ts)
- [atlas-search-storefront-product-query.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/atlas-search-storefront-product-query.repository.ts)
- [mongo-storefront-product-query.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mongo-storefront-product-query.repository.ts)
- [mikro-orm-storefront-product-query.repository.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/mikro-orm-storefront-product-query.repository.ts)
- [product-view-history.entity.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/infra/persistence/entities/product-view-history.entity.ts)
- [Migration20260615090000.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/migrations/Migration20260615090000.ts)
- [product-view-history.seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/product-view-history.seed.ts)
- [product-view-history.tsv](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/seed-data/product-view-history.tsv)

## Purpose

The current changes add a lightweight product-discovery layer for the public
storefront:

- similar products for a product detail page
- recently viewed products for the current actor
- trending products derived from recorded product views
- explicit product-view tracking for authenticated users and guests

This is intentionally a storefront read feature. It does not change product
catalog ownership or seller-side product management behavior.

## Endpoints

The product controller now exposes four recommendation-related routes:

- `GET /products/by-slug/:shop_slug/:product_slug/recommendations`
- `GET /products/recently-viewed`
- `GET /products/trending`
- `POST /products/by-slug/:shop_slug/:product_slug/views`

Route coverage is verified in:

- [product.controller.spec.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/api/rest/product.controller.spec.ts)

### Similar recommendations

`GET /products/by-slug/:shop_slug/:product_slug/recommendations`

Purpose:

- fetches products related to the current product detail page

Request:

- path params: `shop_slug`, `product_slug`
- query param: `limit`
- default limit: `8`
- maximum limit: `12`

Behavior:

- looks up the anchor product in the active storefront repository
- builds a candidate pool
- ranks candidates with a shared scoring function
- returns the top N public list items

Cache:

- `Cache-Control: public, max-age=60`

### Recently viewed

`GET /products/recently-viewed`

Purpose:

- returns the most recently viewed public products for the current user or
  guest session

Request:

- query param: `limit`
- default limit: `10`
- maximum limit: `24`

Behavior:

- authenticated requests use `request.user.userId`
- guest requests use the `productActivitySession` cookie
- if neither actor identity nor guest session is available, the response is
  empty

Cache:

- `Cache-Control: private, no-store`

### Trending

`GET /products/trending`

Purpose:

- returns popular products derived from recent product-view activity

Request:

- query param: `limit`
- default limit: `10`
- maximum limit: `24`

Behavior:

- aggregates rows from `product_view_history`
- uses a 14-day lookback by default
- sorts by view count descending, then most recent view descending
- filters the final list to in-stock public products

Cache:

- `Cache-Control: public, max-age=60`

### Record view

`POST /products/by-slug/:shop_slug/:product_slug/views`

Purpose:

- records that a public product detail page was viewed

Behavior:

- resolves the public product by shop slug and product slug
- records against `user_id` when authenticated
- otherwise assigns or reuses a `productActivitySession` cookie and records
  against `guest_session_id`
- if the same actor already viewed the same product, only `viewed_at` is
  refreshed

Cache:

- `Cache-Control: private, no-store`

Response:

```json
{ "ok": true }
```

## Response Shape

All three read endpoints currently return the same response contract:

```json
{
  "items": [
    {
      "id": "product-id",
      "shop": {
        "id": "shop-id",
        "public_id": "shop-public-id",
        "shop_name": "Shop Name",
        "slug": "shop-slug"
      },
      "category_id": "category-id",
      "title": "Product title",
      "slug": "product-slug",
      "image": {
        "storage_key": "products/shop/product/original.jpg"
      },
      "pricing": {
        "min_amount_minor": 120000,
        "max_amount_minor": 120000,
        "currency": "USD"
      },
      "availability": {
        "in_stock": true,
        "low_stock": false,
        "stock_total": 8
      },
      "variant_count": 1,
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

The presenter intentionally reuses the public product list-item shape instead of
creating a recommendation-only product payload.

## Flow

### Similar recommendations

1. The controller receives the PDP recommendation request.
2. `RecommendPublicProductsUseCase.execute()` forwards `shopSlug`,
   `productSlug`, and `limit`.
3. `StorefrontProductQueryRepository.recommendSimilarPublic()` is resolved by
   the active catalog driver.
4. The repository finds an anchor product, gathers candidates, scores them, and
   returns public list items.
5. The controller maps those items through
   `toPublicProductRecommendationsResponse()`.

### Recently viewed

1. The controller reads `request.user?.userId`.
2. If unauthenticated, it reads the guest session cookie through
   `ProductActivitySessionService.extractSessionId()`.
3. `PublicProductViewHistoryService.listRecentViews()` loads recent history
   rows ordered by `viewedAt desc`.
4. The service asks `StorefrontProductQueryRepository.findPublicByIds()` to
   hydrate those product IDs into public product cards while preserving order.

### Trending

1. The controller forwards the requested limit.
2. `PublicProductViewHistoryService.listTrendingProducts()` runs a SQL
   aggregation over `product_view_history`.
3. The service converts ranked product IDs into public product cards with
   `findPublicByIds()`.
4. The final list is filtered to in-stock products and truncated to the
   requested limit.

### Record view

1. The controller resolves the actor identity.
2. For guests, `ProductActivitySessionService.ensureSessionId()` reuses or sets
   the `productActivitySession` cookie.
3. `PublicProductViewHistoryService.recordView()` resolves the product detail.
4. The service upserts a single row per `(user, product)` or
   `(guest_session_id, product)` pair by refreshing `viewedAt` when a row
   already exists.

## Repository Contract

The storefront repository gained two new read-model operations:

```ts
abstract findPublicByIds(productIds: string[]): Promise<PublicProductListItem[]>;

abstract recommendSimilarPublic(
  input: RecommendPublicProductsInput
): Promise<PublicProductListItem[]>;
```

Why both exist:

- `findPublicByIds()` is for activity-driven feeds such as recent views and
  trending
- `recommendSimilarPublic()` is for anchor-product recommendation generation

All three storefront implementations now support both methods:

- Atlas Search read model
- Mongo catalog read model
- MikroORM/Postgres entity read model

## Recommendation Candidate Strategy

Each repository builds a candidate pool in the same broad order:

1. same category as the anchor product
2. same shape as the anchor product: `whoMade` and `isDigital`
3. global fallback from active public products

Common constraints:

- exclude the anchor product itself
- active products only
- image-ready products only
- build a larger pool than the final limit

The target pool is currently `max(limit * 4, 24)`.

## Ranking Heuristic

Candidate ordering is shared by
[public-product-recommendation-scoring.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/src/modules/domains/product/app/services/public-product-recommendation-scoring.ts).

Current weights:

- same category: `+60`
- same `whoMade`: `+10`
- same `isDigital`: `+6`
- same `variantType`: `+6`
- shared explicit attribute options: up to `4 * 12`
- shared inferred facet terms: up to `3 * 8`
- similar price band: from `-6` to `+16`
- in stock: `+8`
- stock depth: up to `+5`
- popularity contribution: up to `+10`

Tie-breakers:

- in-stock products first
- higher popularity next
- newer products last tie-break

Important implication:

- category match dominates ranking
- attribute and inferred-facet overlap refine the ranking inside that category
- popularity and stock help stabilize ordering when products are otherwise
  similar

## View History Storage Model

Product view activity is stored in `product_view_history`.

Columns:

- `product_id`
- `user_id` nullable
- `guest_session_id` nullable
- `viewed_at`

Indexes:

- `(product_id, viewed_at)`
- `(user_id, viewed_at)`
- `(guest_session_id, viewed_at)`

Uniqueness:

- unique `(user_id, product_id)`
- unique `(guest_session_id, product_id)`

Current semantics:

- the table stores the latest known view per actor/product pair
- repeated views update recency but do not accumulate multiple rows for the same
  actor/product pair
- trending therefore reflects unique actor-product rows inside the lookback
  window, not raw pageview event counts

That tradeoff keeps the write model simple, but it also means heavy repeat views
from one actor do not increase trend rank.

## Guest Session Cookie

Guest tracking uses:

- cookie name: `productActivitySession`
- TTL: `30 days`
- `httpOnly: true`
- auth-config-driven `secure`, `sameSite`, `domain`, and `path`

The session cookie is only created when a guest records a product view.

## Seed Data

The seed pipeline now includes product view history:

- [seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seed.ts)
- [product-view-history.seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/product-view-history.seed.ts)
- [seed-data/README.md](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/seed-data/README.md)

Supported TSV patterns:

- direct user row via `user_email`
- direct guest row via `guest_session_id`
- expanded guest traffic via `guest_session_prefix` +
  `guest_session_count`

The checked-in sample data is intentionally shaped to produce obvious trending
results, for example several generated guest sessions for products such as:

- `Canvas Market Tote`
- `Sony WH-1000XM6 Wireless Headphones`
- `Yamaha HPH-MT7 Studio Monitor Headphones`

## Notes

- recommendation responses intentionally reuse public product list cards, which
  keeps storefront rendering simple
- recent views and trending depend on `findPublicByIds()`, so all catalog
  drivers must preserve ordering and public visibility rules
- the current trend model is Postgres-backed even when the storefront product
  query path uses Mongo or Atlas for product reads
