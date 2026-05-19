Seed images used by the database seeders live here.

Expected layout:

- `seed-data/shops.tsv`
- `seed-data/auth-roles.tsv`
- `seed-data/auth-permissions.tsv`
- `seed-data/auth-role-permissions.tsv`
- `seed-data/auth-users.tsv`
- `seed-data/products.tsv`
- `seed-data/product-inventory.tsv`
- `seed-data/coupons.tsv`
- `seed-data/coupon-products.tsv`
- `seed-data/images/categories/`
- `seed-data/images/products/<shop-slug>/<product-slug>/`

Rules:

- Files under `seed-data/images/categories/` are uploaded to the `categories/` object prefix.
- Auth reference data lives in `seed-data/auth-roles.tsv`, `seed-data/auth-permissions.tsv`, and `seed-data/auth-role-permissions.tsv`.
- Seeded auth users live in `seed-data/auth-users.tsv`.
- Shop metadata lives in `seed-data/shops.tsv` and should use `shop_slug` as the stable seed identifier.
- Product metadata lives in `seed-data/products.tsv`.
- Product inventory and variant rows live in `seed-data/product-inventory.tsv`.
- Coupon metadata lives in `seed-data/coupons.tsv`.
- Coupon-to-product mappings live in `seed-data/coupon-products.tsv`.
- Product images are auto-discovered from the folder derived from `shop_slug` and `title` in [product.seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/product.seed.ts:41).
- Product images should live under shop and product slug directories, for example `seed-data/images/products/olive-atelier/linen-weekend-dress/`.
- Each product folder must contain one `hero.*` image. Additional images should be named `detail-*` and are uploaded after `hero.*`.
- Supported product image extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- `product-inventory.tsv` should contain one row per SKU. Non-variant products still need one inventory row.
- Keep filenames aligned with the relative keys referenced in [category.data.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/category.data.ts:62).
- Hidden files like `.DS_Store` are ignored.

Usage:

```bash
just r2-upload-assets
```
