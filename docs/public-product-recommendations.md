# Public Product Recommendations

This document describes the public recommendation and activity endpoints used by
the storefront.

## Scope

These endpoints support product discovery on the public storefront. They power:

- similar products on product detail pages
- grouped recommendation sections on product detail pages
- recently viewed products for the current actor
- trending products based on recent view activity
- best-selling products based on recent order activity
- product-view tracking for signed-in users and guests

This is a storefront read and activity surface. It does not define seller-side
catalog workflows.

## Endpoints

- `GET /products/by-slug/:shop_slug/:product_slug/recommendations`
- `GET /products/by-slug/:shop_slug/:product_slug/recommendation-sections`
- `GET /products/recently-viewed`
- `GET /products/trending`
- `GET /products/best-sellers`
- `POST /products/by-slug/:shop_slug/:product_slug/views`

## Behavior

### Similar products

Returns products related to a product detail page.

Expected behavior:

- excludes the current product
- only returns public storefront products
- favors relevant, available products over arbitrary catalog matches

### Recommendation sections

Returns multiple product-detail-page sections in one response.

Current section types may include:

- similar products
- more from the same seller
- customers also viewed
- frequently bought together

Sections with no items may be omitted.

### Recently viewed

Returns the most recent public products viewed by the current user or guest
session.

Behavior:

- signed-in requests use the authenticated user
- guest requests use the product activity session cookie
- if there is no known actor, the response is empty

### Trending

Returns popular products based on recent view activity.

Behavior:

- derived from recent product-view history
- intended to reflect current browsing interest, not all-time popularity
- final results must still be valid public storefront products

### Best sellers

Returns popular products based on order activity.

Behavior:

- derived from paid or completed orders
- intended to surface products with meaningful purchase activity
- final results must still be valid public storefront products

### Record product view

Records a public product detail view.

Behavior:

- signed-in users are tracked against their user identity
- guests are tracked through a product activity session cookie
- repeated views may refresh recency for the same actor/product pair

## Activity Model

Two different activity sources are used:

- views drive `recently-viewed` and `trending`
- orders drive `best-sellers` and can contribute to PDP recommendation sections

This separation is intentional:

- views reflect browsing intent
- orders reflect purchase intent

## Notes

- These endpoints are optimized for storefront merchandising, not analytics.
- Returned products must remain valid public products at read time.
- Ranking details are implementation concerns and may evolve without changing
  the external contract.
