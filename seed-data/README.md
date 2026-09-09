Seed images used by the database seeders live here.

Expected layout:

- `seed-data/shops.tsv`
- `seed-data/shops.local.tsv` (optional, local-only)
- `seed-data/auth-roles.tsv`
- `seed-data/auth-permissions.tsv`
- `seed-data/auth-role-permissions.tsv`
- `seed-data/auth-users.tsv`
- `seed-data/auth-users.local.tsv` (optional, local-only)
- `seed-data/user-addresses.tsv`
- `seed-data/user-addresses.local.tsv` (optional, local-only)
- `seed-data/user-preferences.tsv`
- `seed-data/user-preferences.local.tsv` (optional, local-only)
- `seed-data/products.tsv`
- `seed-data/products.local.tsv` (optional, local-only)
- `seed-data/product-inventory.tsv`
- `seed-data/product-inventory.local.tsv` (optional, local-only)
- `seed-data/product-view-history.tsv`
- `seed-data/product-view-history.local.tsv` (optional, local-only)
- `seed-data/order-scenarios.local.tsv` (optional, local-only)
- `seed-data/product-reviews.tsv`
- `seed-data/product-reviews.local.tsv` (optional, local-only)
- `seed-data/chat-conversations.tsv`
- `seed-data/chat-conversations.local.tsv` (optional, local-only)
- `seed-data/chat-messages.tsv`
- `seed-data/chat-messages.local.tsv` (optional, local-only)
- `seed-data/exchange-rates.tsv`
- `seed-data/exchange-rates.local.tsv` (optional, local-only)
- `seed-data/coupons.tsv`
- `seed-data/coupon-products.tsv`
- `seed-data/images/categories/`
- `seed-data/images/products/<shop-slug>/<product-slug>/`
- `seed-data/images/products-local/<shop-slug>/<product-slug>/` (optional, local-only)
- `seed-data/images/reviews/<shop-slug>/<product-slug>/<reviewer-email-slug>/`
- `seed-data/images/reviews-local/<shop-slug>/<product-slug>/<reviewer-email-slug>/` (optional, local-only)

Rules:

- Files under `seed-data/images/categories/` are uploaded to the `categories/` object prefix.
- Auth reference data lives in `seed-data/auth-roles.tsv`, `seed-data/auth-permissions.tsv`, and `seed-data/auth-role-permissions.tsv`.
- Seeded auth users live in `seed-data/auth-users.tsv`.
- Optional local-only auth users can live in `seed-data/auth-users.local.tsv`.
- User address rows live in `seed-data/user-addresses.tsv`.
- Optional local-only address rows can live in `seed-data/user-addresses.local.tsv`.
- Each address row must reference a seeded `user_email`.
- At most one seeded address per user may set `is_primary=true`.
- User preference rows live in `seed-data/user-preferences.tsv`.
- Optional local-only preference rows can live in `seed-data/user-preferences.local.tsv`.
- Preference rows must use supported marketplace values for `region`, `language`, and `currency`.
- Shop metadata lives in `seed-data/shops.tsv` and should use `shop_slug` as the stable seed identifier.
- Optional local-only shops can live in `seed-data/shops.local.tsv`.
- Product metadata lives in `seed-data/products.tsv`.
- `seed-data/products.tsv` may include a `state` column; blank defaults to `active`.
- Product rows use `options_json`, a JSON array of `{ "key", "name", "values": [{ "key", "value" }] }` objects. Product option and value keys are stable seed identities; do not rename them for display-only label changes.
- Optional local-only product rows can live in `seed-data/products.local.tsv`.
- Product inventory and variant rows live in `seed-data/product-inventory.tsv`.
- Each inventory row uses `selections_json`, a JSON object mapping option keys to selected value keys. Products with no options use `{}`.
- `variant_state` is optional and defaults to `active`; use `inactive` for intentionally unavailable matrix combinations that still need stable Product Variant and Inventory identities.
- Optional local-only inventory rows can live in `seed-data/product-inventory.local.tsv`.
- Product view-history rows live in `seed-data/product-view-history.tsv`.
- Optional local-only product view-history rows can live in `seed-data/product-view-history.local.tsv`.
- Each product view-history row must reference `shop_slug` + `product_title` and include a parseable `viewed_at` timestamp.
- For one-off rows, provide exactly one of `user_email` or `guest_session_id`.
- For expanded guest traffic, provide `guest_session_prefix` plus `guest_session_count`; the seeder will generate `<prefix>001`, `<prefix>002`, and so on.
- `viewed_at_step_minutes` is optional for expanded guest traffic and defaults to `5`.
- Optional local-only order scenarios can live in `seed-data/order-scenarios.local.tsv`.
- Each local order scenario row must include `user_email` and a positive integer `order_count`.
- Local order scenarios generate diversified historical orders in code, including mixed order statuses, shipping statuses, multi-item baskets, and coupon/no-coupon coverage.
- Curated product review rows live in `seed-data/product-reviews.tsv`.
- Optional local-only review rows can live in `seed-data/product-reviews.local.tsv`.
- A header-only `seed-data/product-reviews.local.tsv` template is tracked so local product review rows can be added without copying the schema by hand.
- `seed-data/product-reviews.tsv` should use customer emails that come from `seed-data/auth-users.tsv`.
- `seed-data/product-reviews.local.tsv` should use customer emails that come from `seed-data/auth-users.local.tsv`.
- Each review row must reference a seeded `shop_slug`, exact `product_title`, and `user_email` that already has an eligible seeded order for that product.
- `rating` must be an integer from `1` to `5`.
- `status` is optional and defaults to `published`; supported values are `published` and `hidden`.
- `include_images` is optional and defaults to `false`. When true, the seeder requires real review photos from `seed-data/images/reviews/` or `seed-data/images/reviews-local/`.
- `image_count` is optional and defaults to `1`.
- `created_at` is optional and, when omitted, is derived from the seeded delivery timeline.
- The demo seed also generates a large procedural review corpus from delivered seed orders after applying the curated rows, so `product-reviews.tsv` is intended for pinned showcase cases rather than full volume.
- Auto-generated procedural reviews do not attach images.
- Chat conversation rows live in `seed-data/chat-conversations.tsv`.
- Optional local-only conversation rows can live in `seed-data/chat-conversations.local.tsv`.
- Each chat conversation row must include a stable `conversation_key`, `buyer_email`, `shop_slug`, and `created_at`.
- `product_title` is optional and must match the seeded product title exactly when present.
- Chat message rows live in `seed-data/chat-messages.tsv`.
- Optional local-only message rows can live in `seed-data/chat-messages.local.tsv`.
- Each chat message row references `conversation_key` and must include `sender_email`, `body`, and `created_at`.
- `metadata_json` is optional and must be a JSON object when provided.
- Seeded chat conversation state is derived from the message timeline plus `buyer_last_read_at` and `seller_last_read_at`.
- Inventory TSV money columns are seed inputs only. Canonical sell prices are stored in `variant_prices`, not on `product_inventory`.
- Seeders fail malformed, duplicate, or incomplete product option matrices. If a product defines two options, inventory rows must cover the full cartesian matrix; intentionally unavailable combinations should be present with `variant_state=inactive` and reviewed quantity/price values.
- Exchange-rate seed rows live in `seed-data/exchange-rates.tsv`.
- Optional local-only exchange rates can live in `seed-data/exchange-rates.local.tsv`.
- Exchange-rate TSV should contain direct currency pairs because current FX lookup reads `from_currency -> to_currency` rows directly.
- Coupon metadata lives in `seed-data/coupons.tsv`.
- Coupon-to-product mappings live in `seed-data/coupon-products.tsv`.
- Coupon seeds may use a seed-only `period` column instead of explicit `start_date` and `end_date`.
- `period` uses `<start>..<end>` offsets relative to seed runtime, where each side is `now` or an `ms`-style duration like `4d`, `12h`, or `30m`.
- When `period` is set, leave `start_date` and `end_date` blank. When `period` is blank, both `start_date` and `end_date` are required.
- Product images are auto-discovered from the folder derived from `shop_slug` and `title` in [product.seed.ts](../api/database/seeds/product.seed.ts:41).
- Products TSVs support an `is_digital` column. Use `true` for digital downloads and `false` for physical goods.
- Product images should live under shop and product slug directories, for example `seed-data/images/products/olive-atelier/linen-weekend-dress/`.
- Draft products can omit image folders entirely; active products still require seeded images.
- Local-only product images can live under `seed-data/images/products-local/` with the same shop/product slug structure. The local folder is checked before the tracked folder.
- Each product folder must contain one `hero.*` image. Additional images should be named `detail-*` and are uploaded after `hero.*`.
- Digital seeded products still use listing images, but the seeder skips shipping-profile creation for them.
- Review images should live under `seed-data/images/reviews/<shop-slug>/<product-slug>/<reviewer-email-slug>/`.
- Use the slugified reviewer email for the last folder segment. Example: `member@example.com` becomes `member-example-com`.
- Example review image folder: `seed-data/images/reviews/olive-atelier/canvas-market-tote/member-example-com/`.
- Review images are sorted alphabetically and the first `image_count` files are attached to the matching curated review row.
- Local-only review images can live under `seed-data/images/reviews-local/` with the same shop/product/reviewer structure. The local folder is checked before the tracked folder.
- Supported review image extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- Supported product image extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- `product-inventory.tsv` should contain one row per SKU. Non-option products still need one default inventory row with mandatory quantity and price.
- Keep filenames aligned with the relative keys referenced in [category.data.ts](../api/database/seeds/category.data.ts:62).
- Hidden files like `.DS_Store` are ignored.

Usage:

```bash
just r2-upload-assets
```

Local-only workflow:

- Run `just seed-validate` before seeding to confirm local-only auth-user emails, shop slugs, and products do not appear in shared TSV files.
- Add machine-specific ignore rules to `.git/info/exclude` instead of `.gitignore`.
- Put extra local auth users in `seed-data/auth-users.local.tsv`.
- Put local-only user address rows in `seed-data/user-addresses.local.tsv`.
- Put local-only user preference rows in `seed-data/user-preferences.local.tsv`.
- Put extra local products in `seed-data/products.local.tsv`.
- Put matching local inventory rows in `seed-data/product-inventory.local.tsv`.
- Put local-only product view-history rows in `seed-data/product-view-history.local.tsv`.
- Put local-only bulk order scenarios in `seed-data/order-scenarios.local.tsv`.
- Put local-only product review rows in `seed-data/product-reviews.local.tsv`.
- Put local-only chat conversation rows in `seed-data/chat-conversations.local.tsv`.
- Put local-only chat message rows in `seed-data/chat-messages.local.tsv`.
- Put matching local images in `seed-data/images/products-local/<shop-slug>/<product-slug>/`.
- Put local-only review images in `seed-data/images/reviews-local/<shop-slug>/<product-slug>/<reviewer-email-slug>/`.
- Put local-only shops in `seed-data/shops.local.tsv` when products need a new local `shop_slug`.
